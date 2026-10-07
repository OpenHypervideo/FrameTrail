/**
 * @module Player
 */


/**
 * I am the EditAPI, whose edit object is published as `edit` on a FrameTrail instance: the documented way for extensions and scripts to read and change the open hypervideo (see docs/EXTENDING.md, "Editing the Hypervideo").
 *
 * I speak the stored format: overlays, code snippets and annotations as the W3C items of docs/DATA-MODEL.md, chapters, content views and the hypervideo's config as they are written to hypervideo.json. What I return is what a save writes. What I am given is validated against the schemas in schemas/ (with FrameTrailSchema) before anything changes, and refused with `{ path, message }` errors.
 *
 * Writes go through the same model and controller functions as edits made in the editor, so the video, the timelines and the content views follow, the changes are saved by the normal save (and autosave), and each write is an undo step. A transaction makes several writes one undo step, and takes them all back when it fails. While an async transaction is open, the editor is busy (state editBusy): editing by hand and undo wait, other writes are refused, and the user can stop it.
 *
 * The permissions are the editor's: writes only in edit mode; overlays, code snippets, chapters, content views, subtitles and settings only for an admin or the hypervideo's creator, and not while someone else holds the hypervideo's collaboration lock; annotations only in the user's own collection.
 *
 * @class EditAPI
 * @static
 */


FrameTrail.defineModule('EditAPI', function(FrameTrail){

    var labels = FrameTrail.module('Localization').labels;

    var Serializer = window.FrameTrailSerializer;

    var MEDIA_FRAGMENTS = 'http://www.w3.org/TR/media-frags/';

    // Where a new annotation comes from, as the editor records it (saveAnnotations writes only these).
    var ANNOTATION_SOURCE = { frametrail: true, url: '_data/hypervideos/' };

    // ViewLayout's names of the layout areas, by their own and by their names in config.layoutArea.
    var AREAS = {
        'top':    'top',    'areaTop':    'top',
        'bottom': 'bottom', 'areaBottom': 'bottom',
        'left':   'left',   'areaLeft':   'left',
        'right':  'right',  'areaRight':  'right'
    };

    var AREA_KEYS = { 'top': 'areaTop', 'bottom': 'areaBottom', 'left': 'areaLeft', 'right': 'areaRight' };

    var validator        = null,
        viewRefreshTimer = null,

        // The async transaction that is open, if any (see transaction()).
        openTransaction  = null;


    /**
     * The three kinds of W3C items, and what differs between them. Reading goes through the data the Database keeps (data), which is what a save writes; writing through the live objects that show it (items), which wrap the same data objects. An item of a type this player cannot show has no live object: it is listed and kept, but not changed.
     */
    var ITEM_KINDS = {

        overlays: {
            name:       'overlay',
            itemType:   'Overlay',
            schema:     'content-item.schema.json#/$defs/overlay',
            category:   'overlays',
            label:      'SidebarOverlays',
            hypervideo: true,
            timeSpan:   true,
            items:      function() { return FrameTrail.module('HypervideoModel').overlays; },
            data:       function() { return FrameTrail.module('Database').overlays; },
            parse:      function(item) { return Serializer.parseOverlay(item); },
            serialize:  function(data, context) { return Serializer.serializeOverlay(data, context); },
            add:        function(data) { return FrameTrail.module('OverlaysController').addOverlay(data); },
            replace:    function(live, data) { FrameTrail.module('OverlaysController').replaceOverlayData(live, data); },
            remove:     function(live) { FrameTrail.module('OverlaysController').deleteOverlay(live, true); },
            action:     'OverlayChange',
            actionKey:  'overlay'
        },

        codeSnippets: {
            name:       'code snippet',
            itemType:   'CodeSnippet',
            schema:     'content-item.schema.json#/$defs/codeSnippet',
            category:   'codeSnippets',
            label:      'SidebarCustomCode',
            hypervideo: true,
            timeSpan:   false,
            items:      function() { return FrameTrail.module('HypervideoModel').codeSnippets; },
            data:       function() { return FrameTrail.module('Database').codeSnippets.timebasedEvents || []; },
            parse:      function(item) { return Serializer.parseCodeSnippet(item); },
            serialize:  function(data, context) { return Serializer.serializeCodeSnippet(data, context); },
            add:        function(data) { return FrameTrail.module('CodeSnippetsController').addCodeSnippet(data); },
            replace:    function(live, data) { FrameTrail.module('CodeSnippetsController').replaceCodeSnippetData(live, data); },
            remove:     function(live) { FrameTrail.module('CodeSnippetsController').deleteCodeSnippet(live, true); },
            action:     'CodeSnippetChange',
            actionKey:  'codesnippet'
        },

        annotations: {
            name:       'annotation',
            itemType:   'Annotation',
            schema:     'annotation-file.schema.json#/$defs/annotation',
            category:   'annotations',
            label:      'SidebarMyAnnotations',
            hypervideo: false,
            timeSpan:   true,
            items:      function() { return FrameTrail.module('HypervideoModel').annotations; },
            data:       function() { return FrameTrail.module('Database').annotations; },
            parse:      function(item) { return Serializer.parseAnnotation(item, clone(ANNOTATION_SOURCE)); },
            serialize:  function(data, context) { return Serializer.serializeAnnotation(data, context); },
            add:        function(data) { return FrameTrail.module('AnnotationsController').addAnnotation(data); },
            replace:    function(live, data) { FrameTrail.module('AnnotationsController').replaceAnnotationData(live, data); },
            remove:     function(live) { FrameTrail.module('AnnotationsController').deleteAnnotation(live, true); },
            action:     'AnnotationChange',
            actionKey:  'annotation'
        }

    };

    // The kinds list() and get() know, and whether changing them needs the hypervideo's creator or an admin.
    var KINDS = {
        overlays:     { hypervideo: true },
        codeSnippets: { hypervideo: true },
        annotations:  { hypervideo: false },
        chapters:     { hypervideo: true },
        contentViews: { hypervideo: true },
        subtitles:    { hypervideo: true },
        config:       { hypervideo: true }
    };


    /* ------------------------------------------------------------------ */
    /*  Helpers                                                           */
    /* ------------------------------------------------------------------ */

    function clone(value) {
        return (value === undefined) ? undefined : JSON.parse(JSON.stringify(value));
    }

    function isObject(value) {
        return value !== null && typeof value === 'object' && !Array.isArray(value);
    }

    // Equality as JSON sees it: key order does not matter.
    function sameJSON(a, b) {

        if (a === b) { return true; }
        if (a === null || b === null || typeof a !== 'object' || typeof b !== 'object') { return false; }
        if (Array.isArray(a) !== Array.isArray(b)) { return false; }

        var keysA = Object.keys(a).filter(function(key) { return a[key] !== undefined; }),
            keysB = Object.keys(b).filter(function(key) { return b[key] !== undefined; });

        if (keysA.length !== keysB.length) { return false; }

        return keysA.every(function(key) { return sameJSON(a[key], b[key]); });

    }

    // RFC 7386 JSON Merge Patch: objects are merged key by key, null removes a key, anything else replaces.
    function mergePatch(target, patch) {

        if (!isObject(patch)) { return clone(patch); }

        var result = isObject(target) ? clone(target) : {};

        Object.keys(patch).forEach(function(key) {
            if (patch[key] === undefined) { return; }
            if (patch[key] === null) {
                delete result[key];
            } else {
                result[key] = mergePatch(result[key], patch[key]);
            }
        });

        return result;

    }

    function typeName(value) {
        return (value === null) ? 'null' : (Array.isArray(value) ? 'array' : typeof value);
    }

    /**
     * I make the error my methods throw: an Error with code 'invalid', 'notFound' or 'notAllowed', and, for data that failed validation, the errors as `{ path, message }` (path a JSON Pointer into the data given).
     */
    function editError(code, message, errors) {

        var details = (errors && errors.length)
                ? ': ' + errors.map(function(e) { return (e.path || '(data)') + ': ' + e.message; }).join('; ')
                : '';

        var error = new Error(message + details);

        error.name   = 'FrameTrailEditError';
        error.code   = code;
        error.errors = errors || [];

        return error;

    }

    function validate(schema, data) {

        if (!validator) {
            validator = window.FrameTrailSchema.create(window.FrameTrailSchemas);
        }

        return validator.validate(schema, data);

    }

    function currentUserID() {
        return String(FrameTrail.module('UserManagement').userID);
    }

    function itemKind(kind) {
        if (!ITEM_KINDS[kind]) {
            throw editError('invalid', 'Unknown kind of item "' + kind + '"; one of ' + Object.keys(ITEM_KINDS).join(', '));
        }
        return ITEM_KINDS[kind];
    }

    function sourceContext() {
        return { sourcePath: FrameTrail.module('Database').sourcePathOf(FrameTrail.module('RouteNavigation').hypervideoID) };
    }

    // created as ISO text or milliseconds → milliseconds (NaN for anything else).
    function toMillis(created) {
        if (typeof created === 'number') { return created; }
        if (typeof created === 'string' && created !== '') { return (new Date(created)).getTime(); }
        return NaN;
    }


    /* ------------------------------------------------------------------ */
    /*  Checks                                                            */
    /* ------------------------------------------------------------------ */

    function requireHypervideo() {

        if (!FrameTrail.module('RouteNavigation').hypervideoID || !FrameTrail.module('Database').hypervideo) {
            throw editError('notFound', 'No hypervideo is open');
        }

    }

    /**
     * I check that the user may change this kind of thing now, as the editor would let them. Changing the hypervideo claims its collaboration lock, as the editors that write it do.
     */
    function requireEditing(kind) {

        requireHypervideo();

        if (!FrameTrail.getState('editMode')) {
            throw editError('notAllowed', 'Changes can only be made in edit mode');
        }

        if (!KINDS[kind].hypervideo) { return; }

        var UserManagement = FrameTrail.module('UserManagement'),
            creatorId      = FrameTrail.module('HypervideoModel').creatorId;

        if (UserManagement.userRole !== 'admin' && String(creatorId) !== currentUserID()) {
            throw editError('notAllowed', 'Only an admin or the creator of this hypervideo can change its ' + kind);
        }

        var Collaboration = FrameTrail.module('Collaboration');

        if (Collaboration && Collaboration.isLockedByOther()) {
            var holder = Collaboration.lockHolder();
            throw editError('notAllowed', 'This hypervideo is being edited by ' + ((holder && holder.name) ? holder.name : 'someone else'));
        }

        if (Collaboration && Collaboration.isActive() && !Collaboration.hasLock()) {
            Collaboration.claim(function() {});
        }

    }

    function requireOwnAnnotation(live) {
        if (String(live.data.creatorId) !== currentUserID()) {
            throw editError('notAllowed', 'Only your own annotations can be changed');
        }
    }

    // Checks the schemas cannot express.
    function itemErrors(kind, item) {

        var spec   = ITEM_KINDS[kind],
            errors = [],
            type   = isObject(item.body) ? item.body['frametrail:type'] : undefined;

        if (kind !== 'codeSnippets' && typeof type === 'string'
                && !FrameTrail.type('Resource' + type.charAt(0).toUpperCase() + type.slice(1))) {
            errors.push({ path: '/body/frametrail:type', message: 'is not a type this player can show' });
        }

        if (spec.timeSpan && isObject(item.target) && isObject(item.target.selector)) {
            var span = /^t=([^,&]+),([^&]+)/.exec(item.target.selector.value || '');
            if (span && parseFloat(span[2]) < parseFloat(span[1])) {
                errors.push({ path: '/target/selector/value', message: 'must not end before it starts' });
            }
        }

        return errors;

    }


    /* ------------------------------------------------------------------ */
    /*  Undo and views                                                    */
    /* ------------------------------------------------------------------ */

    /**
     * I keep the undo command of a write: in the transaction it belongs to, or as an undo step of its own.
     */
    function record(tx, command, labelKey, actionKey) {

        command.description = labels[labelKey] + ' ' + labels[actionKey];

        if (tx) {
            tx.commands.push(command);
        } else {
            FrameTrail.module('UndoManager').register(command);
        }

    }

    /**
     * Content views show overlays, annotations and transcripts, and are on screen in preview mode. I re-render them once a burst of changes is over.
     */
    function refreshContentViews() {

        window.clearTimeout(viewRefreshTimer);

        viewRefreshTimer = window.setTimeout(function() {
            var ViewLayout = FrameTrail.module('ViewLayout');
            if (FrameTrail.getState('editMode') === 'preview' && ViewLayout) {
                ViewLayout.updateContentInContentViews();
            }
        }, 50);

    }


    /* ------------------------------------------------------------------ */
    /*  Reading                                                           */
    /* ------------------------------------------------------------------ */

    function serializeItem(kind, data) {
        return ITEM_KINDS[kind].serialize(data, sourceContext());
    }

    // The data of an item, by created and, for annotations, creator.
    function findData(kind, millis, creatorId) {

        var list = ITEM_KINDS[kind].data();

        for (var i = 0; i < list.length; i++) {
            if (list[i].created === millis
                    && (creatorId === undefined || String(list[i].creatorId) === String(creatorId))) {
                return list[i];
            }
        }

        return null;

    }

    // The live object (Overlay, CodeSnippet, Annotation) of an item, by created and, for annotations, creator.
    function findLive(kind, millis, creatorId) {

        var items = ITEM_KINDS[kind].items();

        for (var i = 0; i < items.length; i++) {
            if (items[i].data.created === millis
                    && (creatorId === undefined || String(items[i].data.creatorId) === String(creatorId))) {
                return items[i];
            }
        }

        return null;

    }

    // An item reference: its created (ISO text, or milliseconds), for anyone's annotation { creator, created }. A plain created finds one of the user's own annotations. I return the item's data.
    function findItem(kind, ref) {

        if (kind === 'annotations') {
            if (isObject(ref)) {
                return findData(kind, toMillis(ref.created), ref.creator);
            }
            return findData(kind, toMillis(ref), currentUserID());
        }

        return findData(kind, toMillis(ref));

    }

    // The live object of an item to be changed.
    function requireItem(kind, ref) {

        var data = findItem(kind, ref);

        if (!data) {
            throw editError('notFound', 'No ' + ITEM_KINDS[kind].name + ' ' + JSON.stringify(ref));
        }

        var live = findLive(kind, data.created, (kind === 'annotations') ? data.creatorId : undefined);

        if (!live) {
            throw editError('notAllowed', 'This ' + ITEM_KINDS[kind].name + ' is of a type this player cannot show, so it cannot change it');
        }

        return live;

    }

    function findChapter(start) {
        return FrameTrail.module('ChaptersController').findChapter(typeof start === 'string' ? parseFloat(start) : start);
    }

    function contentViewsOf(whichArea) {
        return clone(FrameTrail.module('ViewLayout').getLayoutAreaData()[AREA_KEYS[whichArea]]);
    }

    // config without layoutArea, which belongs to the content views.
    function currentConfig() {
        var config = clone(FrameTrail.module('Database').hypervideo.config) || {};
        delete config.layoutArea;
        return config;
    }

    /**
     * I filter what list() returns: with a function, or an object { from, to } (items whose time overlaps that span), { type } (the body's frametrail:type), { creator } (the creator's id), { area } (content views).
     */
    function matches(filter, info) {

        if (!isObject(filter)) { return true; }

        if (filter.from !== undefined && info.end !== undefined && info.end < filter.from) { return false; }
        if (filter.to !== undefined && info.start !== undefined && info.start > filter.to) { return false; }
        if (filter.type !== undefined && info.type !== filter.type) { return false; }
        if (filter.creator !== undefined && String(info.creator) !== String(filter.creator)) { return false; }

        return true;

    }

    /**
     * I return the open hypervideo as a save would write its hypervideo.json now, with its live overlays, code snippets, content views and settings. Annotations live in their own files; list('annotations') returns them.
     *
     * @method getHypervideo
     * @return {Object}
     */
    function getHypervideo() {

        requireHypervideo();

        var Database = FrameTrail.module('Database'),
            json     = Database.convertToDatabaseFormat(FrameTrail.module('RouteNavigation').hypervideoID);

        // A save would stamp the time of saving; this is not one.
        if (Database.hypervideo.lastchanged !== undefined) {
            json.meta.lastchanged = Database.hypervideo.lastchanged;
        }

        return json;

    }

    /**
     * I return all things of a kind: 'overlays', 'codeSnippets', 'annotations' (everyone's, as W3C items), 'chapters' (`{ start, title }`), 'contentViews' (of all layout areas, top, bottom, left, right; `{ area }` picks one) or 'subtitles' (`{ src, srclang }`).
     *
     * @method list
     * @param {String} kind
     * @param {Object|Function} [filter]
     * @return {Array}
     */
    function list(kind, filter) {

        requireHypervideo();

        var result;

        if (ITEM_KINDS[kind]) {

            result = ITEM_KINDS[kind].data().filter(function(data) {
                return matches(filter, {
                    start:   data.start,
                    end:     (data.end !== undefined) ? data.end : data.start,
                    type:    (kind === 'codeSnippets') ? 'codesnippet' : data.type,
                    creator: data.creatorId
                });
            }).map(function(data) {
                return serializeItem(kind, data);
            });

        } else if (kind === 'chapters') {

            result = FrameTrail.module('ChaptersController').getSortedChapters().filter(function(chapter) {
                return matches(filter, { start: chapter.data.start, end: chapter.data.start });
            }).map(function(chapter) {
                return clone(chapter.data);
            });

        } else if (kind === 'contentViews') {

            var areas = (isObject(filter) && filter.area !== undefined) ? [AREAS[filter.area]] : ['top', 'bottom', 'left', 'right'];

            if (!areas[0]) {
                throw editError('invalid', 'Unknown layout area "' + filter.area + '"; one of top, bottom, left, right');
            }

            result = [];
            areas.forEach(function(whichArea) {
                Array.prototype.push.apply(result, contentViewsOf(whichArea));
            });

        } else if (kind === 'subtitles') {

            var files = FrameTrail.module('Database').hypervideo.subtitles;
            result = Array.isArray(files) ? clone(files) : [];

        } else {

            throw editError('invalid', 'Unknown kind "' + kind + '"; one of overlays, codeSnippets, annotations, chapters, contentViews, subtitles');

        }

        return (typeof filter === 'function') ? result.filter(filter) : result;

    }

    /**
     * I return one thing, or null when there is none: an overlay or code snippet by its created (ISO text), one of the user's annotations by its created or anyone's by `{ creator, created }`, a chapter by its start (seconds), subtitles by their language (`{ src, srclang, vtt }`, the WebVTT text in vtt). Content views have no identity; list them.
     *
     * @method get
     * @param {String} kind
     * @param {*} ref
     * @return {Object|null}
     */
    function get(kind, ref) {

        requireHypervideo();

        if (ITEM_KINDS[kind]) {
            var data = findItem(kind, ref);
            return data ? serializeItem(kind, data) : null;
        }

        if (kind === 'chapters') {
            var chapter = findChapter(ref);
            return chapter ? clone(chapter.data) : null;
        }

        if (kind === 'subtitles') {
            var entry = list('subtitles').filter(function(file) { return file.srclang === ref; })[0],
                loaded = FrameTrail.module('Database').subtitles[ref];
            if (!entry) { return null; }
            entry.vtt = loaded ? loaded.vtt : null;
            return entry;
        }

        if (kind === 'contentViews') {
            throw editError('invalid', 'Content views have no identity; list them with list(\'contentViews\', { area })');
        }

        throw editError('invalid', 'Unknown kind "' + kind + '"');

    }


    /* ------------------------------------------------------------------ */
    /*  Writing items                                                     */
    /* ------------------------------------------------------------------ */

    // The latest created in a collection (annotations: the user's own).
    function lastCreated(kind) {

        var userID = currentUserID();

        return ITEM_KINDS[kind].data().reduce(function(last, data) {
            if (kind === 'annotations' && String(data.creatorId) !== userID) { return last; }
            return Math.max(last, data.created || 0);
        }, 0);

    }

    /**
     * I complete a new item with what is fixed by its kind and its place: type, frametrail:type, the creator (the user, for annotations always), created (unique in the collection, unless given), the target's type and source (the hypervideo's video) and the selector's type.
     */
    function completeItem(kind, data, errors) {

        var spec   = ITEM_KINDS[kind],
            item   = clone(data),
            userID = currentUserID();

        if (item.type === undefined)            { item.type = 'Annotation'; }
        if (item['frametrail:type'] === undefined) { item['frametrail:type'] = spec.itemType; }

        if (kind === 'annotations' && item.creator !== undefined
                && !(isObject(item.creator) && String(item.creator.id) === userID)) {
            errors.push({ path: '/creator', message: 'must be the signed-in user' });
        }

        if (kind === 'annotations' || item.creator === undefined) {
            item.creator = { "nickname": FrameTrail.getState('username'), "type": "Person", "id": userID };
        }

        if (item.created === undefined) {
            item.created = (new Date(Math.max(Date.now(), lastCreated(kind) + 1))).toISOString();
        } else if (isFinite(toMillis(item.created))
                && findData(kind, toMillis(item.created), (kind === 'annotations') ? userID : undefined)) {
            errors.push({ path: '/created', message: 'is taken by another ' + spec.name });
        }

        if (isObject(item.target)) {
            if (item.target.type === undefined) { item.target.type = 'Video'; }
            var source = sourceContext().sourcePath;
            if (source !== undefined) { item.target.source = source; }
            if (isObject(item.target.selector)) {
                if (item.target.selector.type === undefined)       { item.target.selector.type = 'FragmentSelector'; }
                if (item.target.selector.conformsTo === undefined) { item.target.selector.conformsTo = MEDIA_FRAGMENTS; }
            }
        }

        return item;

    }

    function addItem(tx, kind, data) {

        var spec = itemKind(kind);

        requireEditing(kind);

        if (!isObject(data)) {
            throw editError('invalid', 'Invalid ' + spec.name, [{ path: '', message: 'must be object, is ' + typeName(data) }]);
        }

        var errors = [],
            item   = completeItem(kind, data, errors);

        errors = errors.concat(validate(spec.schema, item));
        if (!errors.length) { errors = itemErrors(kind, item); }
        if (errors.length) {
            throw editError('invalid', 'Invalid ' + spec.name, errors);
        }

        var model = spec.parse(clone(item)),
            live  = spec.add(clone(model));

        record(tx, {
            category: spec.category,
            undo: function() {
                var found = findLive(kind, model.created, (kind === 'annotations') ? model.creatorId : undefined);
                if (found) { spec.remove(found); }
                refreshContentViews();
            },
            redo: function() {
                spec.add(clone(model));
                refreshContentViews();
            }
        }, spec.label, 'GenericAdd');

        refreshContentViews();

        return serializeItem(kind, live.data);

    }

    // What changed between two versions of an item's data, for the userAction event (attributes key by key, as the editor reports them).
    function changesOf(before, after) {

        var changes = [],
            keys    = Object.keys(before).concat(Object.keys(after).filter(function(key) { return !before.hasOwnProperty(key); }));

        keys.forEach(function(key) {
            if (key === '_stored' || sameJSON(before[key], after[key])) { return; }
            if (key === 'attributes' && isObject(before[key]) && isObject(after[key])) {
                Object.keys(before[key]).concat(Object.keys(after[key])).forEach(function(name, index, all) {
                    if (all.indexOf(name) !== index || sameJSON(before[key][name], after[key][name])) { return; }
                    changes.push({ property: 'attributes.' + name, oldValue: clone(before[key][name]), newValue: clone(after[key][name]) });
                });
                return;
            }
            changes.push({ property: key, oldValue: clone(before[key]), newValue: clone(after[key]) });
        });

        return changes;

    }

    function updateItem(tx, kind, ref, patch) {

        var spec = itemKind(kind);

        requireEditing(kind);

        var live = requireItem(kind, ref);

        if (kind === 'annotations') { requireOwnAnnotation(live); }

        if (!isObject(patch)) {
            throw editError('invalid', 'Invalid change of ' + spec.name, [{ path: '', message: 'must be object, is ' + typeName(patch) }]);
        }

        var current = serializeItem(kind, live.data),
            next    = mergePatch(current, patch),
            errors  = [];

        if (!sameJSON(next.created, current.created)) {
            errors.push({ path: '/created', message: 'cannot be changed' });
        }
        if (!sameJSON(next.creator, current.creator)) {
            errors.push({ path: '/creator', message: 'cannot be changed' });
        }
        if (isObject(next.body) && isObject(current.body) && next.body['frametrail:type'] !== current.body['frametrail:type']) {
            errors.push({ path: '/body/frametrail:type', message: 'cannot be changed; remove the ' + spec.name + ' and add a new one' });
        }

        if (isObject(next.target) && sourceContext().sourcePath !== undefined) {
            next.target.source = sourceContext().sourcePath;
        }

        errors = errors.concat(validate(spec.schema, next));
        if (!errors.length) { errors = itemErrors(kind, next); }
        if (errors.length) {
            throw editError('invalid', 'Invalid change of ' + spec.name, errors);
        }

        if (sameJSON(next, current)) {
            return current;
        }

        var before = clone(live.data),
            after  = spec.parse(clone(next));

        // The same item: identity and where it was loaded from stay.
        after.created = before.created;
        if (kind === 'annotations') { after.source = clone(before.source); }

        spec.replace(live, after);

        // Reported like the editor's changes; a change of properties FrameTrail does not know has nothing to report.
        var changes = changesOf(before, after);
        if (changes.length) {
            var payload = { action: spec.action, changes: changes };
            payload[spec.actionKey] = live.data;
            FrameTrail.triggerEvent('userAction', payload);
        }

        record(tx, {
            category: spec.category,
            undo: function() {
                var found = findLive(kind, before.created, (kind === 'annotations') ? before.creatorId : undefined);
                if (found) { spec.replace(found, before); }
                refreshContentViews();
            },
            redo: function() {
                var found = findLive(kind, before.created, (kind === 'annotations') ? before.creatorId : undefined);
                if (found) { spec.replace(found, after); }
                refreshContentViews();
            }
        }, spec.label, 'GenericChange');

        refreshContentViews();

        return serializeItem(kind, live.data);

    }

    function removeItem(tx, kind, ref) {

        var spec = itemKind(kind);

        requireEditing(kind);

        var live = requireItem(kind, ref);

        if (kind === 'annotations') { requireOwnAnnotation(live); }

        var data   = clone(live.data),
            stored = serializeItem(kind, live.data);

        spec.remove(live);

        record(tx, {
            category: spec.category,
            undo: function() {
                spec.add(clone(data));
                refreshContentViews();
            },
            redo: function() {
                var found = findLive(kind, data.created, (kind === 'annotations') ? data.creatorId : undefined);
                if (found) { spec.remove(found); }
                refreshContentViews();
            }
        }, spec.label, 'GenericDelete');

        refreshContentViews();

        return stored;

    }


    /* ------------------------------------------------------------------ */
    /*  Writing chapters                                                  */
    /* ------------------------------------------------------------------ */

    var CHAPTER_SCHEMA = 'hypervideo.schema.json#/properties/chapters/items';

    function addChapter(tx, data) {

        requireEditing('chapters');

        if (!isObject(data)) {
            throw editError('invalid', 'Invalid chapter', [{ path: '', message: 'must be object, is ' + typeName(data) }]);
        }

        var item   = clone(data),
            errors = validate(CHAPTER_SCHEMA, item);

        if (!errors.length && findChapter(item.start)) {
            errors.push({ path: '/start', message: 'is taken by another chapter' });
        }
        if (errors.length) {
            throw editError('invalid', 'Invalid chapter', errors);
        }

        var ChaptersController = FrameTrail.module('ChaptersController'),
            chapter            = ChaptersController.addChapter(clone(item)),
            added              = clone(chapter.data);

        record(tx, {
            category: 'chapters',
            undo: function() {
                var found = findChapter(added.start);
                if (found) { FrameTrail.module('ChaptersController').deleteChapter(found, true); }
            },
            redo: function() {
                FrameTrail.module('ChaptersController').addChapter(clone(added));
            }
        }, 'SidebarChapters', 'GenericAdd');

        return clone(chapter.data);

    }

    function updateChapter(tx, start, patch) {

        requireEditing('chapters');

        var chapter = findChapter(start);

        if (!chapter) {
            throw editError('notFound', 'No chapter starts at ' + JSON.stringify(start));
        }

        if (!isObject(patch)) {
            throw editError('invalid', 'Invalid change of chapter', [{ path: '', message: 'must be object, is ' + typeName(patch) }]);
        }

        var before = clone(chapter.data),
            next   = mergePatch(before, patch),
            errors = validate(CHAPTER_SCHEMA, next),
            other  = errors.length ? null : findChapter(next.start);

        if (other && other !== chapter) {
            errors.push({ path: '/start', message: 'is taken by another chapter' });
        }
        if (errors.length) {
            throw editError('invalid', 'Invalid change of chapter', errors);
        }

        if (sameJSON(next, before)) {
            return before;
        }

        FrameTrail.module('ChaptersController').setChapterData(chapter, next);

        record(tx, {
            category: 'chapters',
            undo: function() {
                var found = findChapter(next.start);
                if (found) { FrameTrail.module('ChaptersController').setChapterData(found, before); }
            },
            redo: function() {
                var found = findChapter(before.start);
                if (found) { FrameTrail.module('ChaptersController').setChapterData(found, next); }
            }
        }, 'SidebarChapters', 'GenericChange');

        return clone(chapter.data);

    }

    function removeChapter(tx, start) {

        requireEditing('chapters');

        var chapter = findChapter(start);

        if (!chapter) {
            throw editError('notFound', 'No chapter starts at ' + JSON.stringify(start));
        }

        var data = clone(chapter.data);

        FrameTrail.module('ChaptersController').deleteChapter(chapter, true);

        record(tx, {
            category: 'chapters',
            undo: function() {
                FrameTrail.module('ChaptersController').addChapter(clone(data));
            },
            redo: function() {
                var found = findChapter(data.start);
                if (found) { FrameTrail.module('ChaptersController').deleteChapter(found, true); }
            }
        }, 'SidebarChapters', 'GenericDelete');

        return data;

    }


    /* ------------------------------------------------------------------ */
    /*  add, update, remove                                               */
    /* ------------------------------------------------------------------ */

    function noIdentity(kind) {

        if (kind === 'contentViews') {
            return editError('invalid', 'Content views are set per layout area, with setLayout(area, contentViews)');
        }
        if (kind === 'subtitles') {
            return editError('invalid', 'Subtitles are set per language, with setSubtitles(lang, vttText)');
        }

        return editError('invalid', 'Unknown kind "' + kind + '"; one of overlays, codeSnippets, annotations, chapters');

    }

    /**
     * I add an overlay, code snippet, annotation (W3C items) or chapter (`{ start, title }`) and return it as stored. For items I fill in what is fixed — type, frametrail:type, creator, created, the target's type and source, the selector's type — so the body and `target.selector.value` (with keyframes or rotation, if any) are what is needed.
     *
     * @method add
     * @param {String} kind
     * @param {Object} data
     * @return {Object}
     */
    function add(tx, kind, data) {
        if (kind === 'chapters') { return addChapter(tx, data); }
        if (!ITEM_KINDS[kind]) { throw noIdentity(kind); }
        return addItem(tx, kind, data);
    }

    /**
     * I change a thing with a JSON Merge Patch (RFC 7386) on its stored form — null removes a property, objects are merged, everything else is replaced — and return it as stored. The created, the creator and the type of an item cannot be changed.
     *
     * @method update
     * @param {String} kind
     * @param {*} ref - see get()
     * @param {Object} patch
     * @return {Object}
     */
    function update(tx, kind, ref, patch) {
        if (kind === 'chapters') { return updateChapter(tx, ref, patch); }
        if (!ITEM_KINDS[kind]) { throw noIdentity(kind); }
        return updateItem(tx, kind, ref, patch);
    }

    /**
     * I remove a thing and return it as it was stored.
     *
     * @method remove
     * @param {String} kind
     * @param {*} ref - see get()
     * @return {Object}
     */
    function remove(tx, kind, ref) {
        if (kind === 'chapters') { return removeChapter(tx, ref); }
        if (!ITEM_KINDS[kind]) { throw noIdentity(kind); }
        return removeItem(tx, kind, ref);
    }


    /* ------------------------------------------------------------------ */
    /*  Layout, subtitles, settings                                       */
    /* ------------------------------------------------------------------ */

    /**
     * I replace the content views of a layout area ('top', 'bottom', 'left', 'right', or 'areaTop', …) and return them as stored.
     *
     * @method setLayout
     * @param {String} area
     * @param {Array} contentViews
     * @return {Array}
     */
    function setLayout(tx, area, contentViews) {

        requireEditing('contentViews');

        var whichArea = AREAS[area];

        if (!whichArea) {
            throw editError('invalid', 'Unknown layout area "' + area + '"; one of top, bottom, left, right');
        }

        if (!Array.isArray(contentViews)) {
            throw editError('invalid', 'Invalid content views', [{ path: '', message: 'must be array, is ' + typeName(contentViews) }]);
        }

        var errors = [];

        contentViews.forEach(function(contentView, index) {
            validate('hypervideo.schema.json#/$defs/contentView', contentView).forEach(function(e) {
                errors.push({ path: '/' + index + e.path, message: e.message });
            });
        });

        if (errors.length) {
            throw editError('invalid', 'Invalid content views', errors);
        }

        var next     = clone(contentViews),
            previous = FrameTrail.module('ViewLayout').setContentViews(whichArea, next);

        record(tx, {
            category: 'layout',
            undo: function() { FrameTrail.module('ViewLayout').setContentViews(whichArea, previous); },
            redo: function() { FrameTrail.module('ViewLayout').setContentViews(whichArea, next); }
        }, 'SidebarLayout', 'GenericChange');

        return contentViewsOf(whichArea);

    }

    function setSubtitlesNow(lang, vttText) {
        FrameTrail.module('HypervideoModel').setSubtitles(lang, vttText);
        refreshContentViews();
    }

    /**
     * I set the subtitles of a language to a WebVTT text, or remove them (null), and return the hypervideo's entry for them (`{ src, srclang }`, null when removed). The file is written by the next save.
     *
     * @method setSubtitles
     * @param {String} lang - letters, digits, _ and -, at most 32
     * @param {String|null} vttText
     * @return {Object|null}
     */
    function setSubtitles(tx, lang, vttText) {

        requireEditing('subtitles');

        if (typeof lang !== 'string' || !/^[A-Za-z0-9_-]{1,32}$/.test(lang)) {
            throw editError('invalid', 'Invalid language "' + lang + '": letters, digits, _ and - (at most 32)');
        }

        if (vttText !== null) {

            if (typeof vttText !== 'string') {
                throw editError('invalid', 'Invalid subtitles', [{ path: '', message: 'must be string or null, is ' + typeName(vttText) }]);
            }

            var problems = /^﻿?WEBVTT(?:[ \t]|\r?\n|$)/.test(vttText)
                    ? FrameTrail.module('Database').parseSubtitles(vttText).errors
                    : ['must begin with WEBVTT'];

            if (problems.length) {
                throw editError('invalid', 'Invalid subtitles', problems.map(function(message) { return { path: '', message: message }; }));
            }

        }

        var loaded   = FrameTrail.module('Database').subtitles[lang],
            previous = loaded ? loaded.vtt : null;

        if (previous !== vttText) {

            setSubtitlesNow(lang, vttText);

            record(tx, {
                category: 'subtitles',
                undo: function() { setSubtitlesNow(lang, previous); },
                redo: function() { setSubtitlesNow(lang, vttText); }
            }, 'GenericSubtitles', 'GenericChange');

        }

        var entry = list('subtitles').filter(function(file) { return file.srclang === lang; })[0];

        return entry || null;

    }

    /**
     * I change the hypervideo's settings — its config, without layoutArea — with a JSON Merge Patch, and return them.
     *
     * @method setConfig
     * @param {Object} patch
     * @return {Object}
     */
    function setConfig(tx, patch) {

        requireEditing('config');

        if (!isObject(patch)) {
            throw editError('invalid', 'Invalid settings', [{ path: '', message: 'must be object, is ' + typeName(patch) }]);
        }

        if (patch.layoutArea !== undefined) {
            throw editError('invalid', 'Invalid settings', [{ path: '/layoutArea', message: 'is set with setLayout()' }]);
        }

        var previous = currentConfig(),
            next     = mergePatch(previous, patch),
            errors   = validate('hypervideo.schema.json#/properties/config', next);

        if (errors.length) {
            throw editError('invalid', 'Invalid settings', errors);
        }

        if (!sameJSON(next, previous)) {

            FrameTrail.module('HypervideoModel').setConfig(next);

            record(tx, {
                category: 'config',
                undo: function() { FrameTrail.module('HypervideoModel').setConfig(previous); },
                redo: function() { FrameTrail.module('HypervideoModel').setConfig(next); }
            }, 'SettingsHypervideoSettings', 'GenericChange');

        }

        return currentConfig();

    }


    /* ------------------------------------------------------------------ */
    /*  Transactions                                                      */
    /* ------------------------------------------------------------------ */

    // Ends a transaction: no more writes through it, and the editor is no longer busy with it.
    function close(tx) {

        tx.open = false;

        if (openTransaction === tx) {
            openTransaction = null;
            FrameTrail.changeState('editBusy', false);
        }

    }

    function commit(tx) {

        close(tx);

        // The hypervideo was switched (or reloaded) meanwhile: its undo history is gone, and so are these changes.
        if (tx.model !== FrameTrail.module('HypervideoModel')) { return; }

        FrameTrail.module('UndoManager').registerGroup(tx.description, tx.commands);

    }

    function rollback(tx) {

        close(tx);

        if (tx.model !== FrameTrail.module('HypervideoModel')) { return; }

        for (var i = tx.commands.length - 1; i >= 0; i--) {
            try {
                tx.commands[i].undo();
            } catch (e) {
                console.error('FrameTrail edit: could not take back a change of the failed transaction.', e);
            }
        }

    }

    /**
     * I run fn with an edit object of my own (the same methods as instance.edit, plus a signal), and make every change made through it one undo step. When fn throws, or returns a promise that rejects, I take the changes back and pass the error on.
     *
     * fn may be async. I then return a promise that resolves when fn's does, which is when the step is registered. Until then the editor is busy (state editBusy): editing by hand and undo wait, and other writes are refused. A stop — the user's, leaving edit mode, a switch to another hypervideo — ends the transaction early: its changes are taken back (on a switch they go with the hypervideo), its signal is aborted, and the promise rejects with code 'stopped'.
     *
     * @method transaction
     * @param {String} description - shown with undo and redo, and while the editor is busy
     * @param {Function} fn - called with the transaction's edit object
     * @return {*} what fn returns
     */
    function transaction(outer, description, fn) {

        // Inside a transaction, a transaction is part of it.
        if (outer) { return fn(api(outer)); }

        requireHypervideo();

        if (typeof fn !== 'function') {
            throw editError('invalid', 'A transaction needs a function');
        }

        var tx = {
                commands:    [],
                open:        true,
                model:       FrameTrail.module('HypervideoModel'),
                description: description || labels['GenericChange'],
                controller:  new AbortController()
            },
            result;

        try {
            result = fn(api(tx));
        } catch (e) {
            rollback(tx);
            throw e;
        }

        if (!result || typeof result.then !== 'function') {
            commit(tx);
            return result;
        }

        return new Promise(function(resolve, reject) {

            tx.reject = reject;

            openTransaction = tx;
            FrameTrail.changeState('editBusy', { description: tx.description });

            result.then(function(value) {
                // A stopped transaction has settled already.
                if (!tx.open) { return; }
                commit(tx);
                resolve(value);
            }, function(e) {
                if (!tx.open) { return; }
                rollback(tx);
                reject(e);
            });

        });

    }

    /**
     * I end the open async transaction, if there is one: with rollback its changes are taken back (a stop by the user, leaving edit mode), without they are left to the hypervideo that is being closed. Its signal is aborted and its promise rejects with code 'stopped'.
     *
     * @method stop
     * @param {Boolean} rollback
     */
    function stop(withRollback) {

        var tx = openTransaction;

        if (!tx) { return; }

        if (withRollback) {
            rollback(tx);
        } else {
            close(tx);
        }

        tx.controller.abort();
        tx.reject(editError('stopped', withRollback
            ? 'The transaction "' + tx.description + '" was stopped and its changes taken back'
            : 'The transaction "' + tx.description + '" ended with its hypervideo'));

    }

    // A write through a transaction that is over, or of a hypervideo no longer open, must not happen; nor a write past an open transaction.
    function writer(tx, method) {

        return function() {

            if (tx && !tx.open) {
                throw editError('notAllowed', 'This transaction is over');
            }
            if (tx && tx.model !== FrameTrail.module('HypervideoModel')) {
                throw editError('notAllowed', 'The hypervideo of this transaction is no longer open');
            }
            if (openTransaction && openTransaction !== tx) {
                throw editError('notAllowed', 'The hypervideo is being changed ("' + openTransaction.description + '"); try again when that is done');
            }

            return method.apply(null, [tx].concat(Array.prototype.slice.call(arguments)));

        };

    }

    /**
     * I make an edit object: for instance.edit (no transaction), or for a transaction, which also gets the AbortSignal of its stop.
     */
    function api(tx) {

        var edit = {
            getHypervideo:  getHypervideo,
            list:           list,
            get:            get,
            add:            writer(tx, add),
            update:         writer(tx, update),
            remove:         writer(tx, remove),
            setLayout:      writer(tx, setLayout),
            setSubtitles:   writer(tx, setSubtitles),
            setConfig:      writer(tx, setConfig),
            transaction:    writer(tx, transaction)
        };

        if (tx) {
            edit.signal = tx.controller.signal;
        }

        return edit;

    }


    return {

        onChange: {
            // Leaving edit mode stops an open transaction (HypervideoModel.leaveEditMode() does so before it asks about unsaved changes).
            editMode: function(editMode) {
                if (!editMode) { stop(true); }
            }
        },

        /**
         * The edit object published as instance.edit.
         * @attribute edit
         */
        edit: api(null),

        stop: stop,

        /**
         * The description of the open async transaction, or null.
         * @attribute busy
         */
        get busy() { return openTransaction ? openTransaction.description : null; }

    };

});
