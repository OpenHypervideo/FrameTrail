/**
 * @module Shared
 */

/**
 * I am the TagModel.
 * I hold the instance's tag definitions (tagdefinitions.json: a label and a
 * description per tag id), add, change and delete them, and tell where tags
 * are used.
 *
 * Any user who can edit may add a tag (canCreate); only admins change and
 * delete them (canManage). An id never changes: items name tags by id, and
 * annotation thumbnails carry the ids as class names. A new tag's id is made
 * from its label (FrameTrailSerializer.tagID).
 *
 * I also filter the annotations of the open hypervideo for content views
 * (getContentCollection).
 *
 * @class TagModel
 * @static
 */

 FrameTrail.defineModule('TagModel', function(FrameTrail){

    var Serializer = window.FrameTrailSerializer;

    var tags      = {},
        config    = {},
        // Written on this page: the init option no longer says what the
        // definitions are, and in memory (download, static) nothing else does.
        written   = false,
        listeners = [];


    function isObject(value) {
        return value !== null && typeof value === 'object' && !Array.isArray(value);
    }

    function storageMode() {
        return FrameTrail.getState('storageMode');
    }

    // Read and written through the adapter: a local folder or a project file.
    function throughAdapter() {
        return ['local', 'file'].indexOf(storageMode()) !== -1;
    }

    // In memory only: download and static mode.
    function inMemory() {
        return ['download', 'static'].indexOf(storageMode()) !== -1;
    }

    function language() {
        return FrameTrail.module('Localization').language;
    }

    // PHP writes an empty object as [].
    function definitionsOf(data) {
        return isObject(data) ? data : {};
    }

    function setTags(data) {
        tags = definitionsOf(data);
        listeners.slice().forEach(function(listener) {
            try { listener(); } catch (e) { console.error('TagModel listener:', e); }
        });
    }

    // A failure as callers see it: { code, message, usage? }.
    function failure(code, message, extra) {
        return Object.assign({ code: code, message: message || code }, extra || {});
    }

    function serverPost(params) {
        return FrameTrail.module('StorageManager').serverPost(new URLSearchParams(params)).then(function(json) {
            return json || {};
        });
    }


    function initTagModel (success, fail) {

        config = FrameTrail.getState('config');
        updateTagModel(success, fail);

    }

    /**
     * I read the definitions again. Tags are not needed to play anything, so
     * a missing or unreadable file means no tags, never a failed load.
     *
     * @method updateTagModel
     * @param {Function} success
     * @param {Function} [fail] kept for callers; not called
     */
    function updateTagModel (success, fail) {

        var done = function(data) { setTags(data); if (success) success(); };

        // A project file is the only source of its tags (see Database.loadConfigData).
        var initOption = (storageMode() === 'file' || written) ? null : FrameTrail.getState('tagdefinitions');

        if (isObject(initOption)) {
            return done(initOption);
        }

        if (inMemory() && written) {
            return done(tags);
        }

        if (throughAdapter() || inMemory()) {
            FrameTrail.module('StorageManager').getAdapter().readJSON('tagdefinitions.json').then(done).catch(function() {
                done({});
            });
            return;
        }

        var tagUrl = typeof initOption === 'string'
            ? initOption
            : FrameTrail.module('RouteNavigation').resolveDataURL('tagdefinitions.json');
        // After a write here a cached copy would be older than what was written.
        fetch(tagUrl, { cache: (config && config.allowCaching && !written) ? 'default' : 'no-cache' })
            .then(function(r) {
                if (r.status === 404) return {};
                if (!r.ok) throw new Error('HTTP ' + r.status);
                return r.json();
            })
            .then(done)
            .catch(function(error) {
                console.warn('FrameTrail: tag definitions could not be read (' + error.message + ')');
                done({});
            });

    }


    /**
     * @method subscribe
     * @param {Function} listener called whenever the definitions were read or written
     * @return {Function} unsubscribe
     */
    function subscribe(listener) {
        listeners.push(listener);
        return function() {
            var at = listeners.indexOf(listener);
            if (at !== -1) listeners.splice(at, 1);
        };
    }


    /**
     * A tag as the interface shows it. A tag that is not defined (any more)
     * has its id as label and known false.
     *
     * @method getTag
     * @param {String} id
     * @return {Object} { id, label, description, known }
     */
    function getTag(id) {

        var entry = Object.prototype.hasOwnProperty.call(tags, id) ? tags[id] : undefined,
            text  = Serializer.tagEntry(entry, id, language());

        return { id: String(id), label: text.label, description: text.description, known: entry !== undefined };

    }

    /**
     * @method listTags
     * @return {Array} every defined tag (see getTag), sorted by label
     */
    function listTags() {

        var lang = language();

        return Object.keys(tags).map(getTag).sort(function(a, b) {
            return a.label.localeCompare(b.label, lang, { sensitivity: 'base' }) || a.id.localeCompare(b.id);
        });

    }

    function findIn(definitions, label, exceptId) {

        var key  = Serializer.tagLabelKey(label),
            lang = language(),
            ids  = Object.keys(definitionsOf(definitions));

        for (var i = 0; i < ids.length; i++) {
            if (ids[i] === exceptId) continue;
            if (Serializer.tagLabelKey(Serializer.tagEntry(definitions[ids[i]], ids[i], lang).label) === key) {
                return ids[i];
            }
        }

        return null;

    }

    /**
     * @method findByLabel
     * @param {String} label
     * @return {Object|null} the tag with this label (case and white space do not matter)
     */
    function findByLabel(label) {
        var id = findIn(tags, label);
        return (id === null) ? null : getTag(id);
    }

    function fold(text) {
        return String(text || '').normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase();
    }

    /**
     * Whether a tag matches what someone typed to find it: in its label,
     * description or id, without regard to case and accents.
     *
     * @method matches
     * @param {Object} tag   see getTag
     * @param {String} query
     * @return {Boolean}
     */
    function matches(tag, query) {
        var q = fold(query).trim();
        if (!q) return true;
        return [tag.label, tag.description, tag.id].some(function(text) { return fold(text).indexOf(q) !== -1; });
    }


    /**
     * Whether the user may add tags: anyone who can edit, except where the
     * server would refuse (no account).
     *
     * @method canCreate
     * @return {Boolean}
     */
    function canCreate() {
        var UserManagement = FrameTrail.module('UserManagement');
        if (!UserManagement || !UserManagement.userID) return false;
        if (storageMode() === 'server') {
            return !!FrameTrail.getState('loggedIn') && !UserManagement.isGuestMode();
        }
        return true;
    }

    /**
     * Whether the user may change and delete tags: admins.
     *
     * @method canManage
     * @return {Boolean}
     */
    function canManage() {
        return canCreate() && FrameTrail.module('UserManagement').userRole === 'admin';
    }


    // tagdefinitions.json changed by change(definitions) → definitions, which
    // may run more than once (updateJSON runs it again when another tab or
    // program wrote the file in between) and so must not do anything else.
    function change(fn) {

        if (throughAdapter()) {
            return FrameTrail.module('StorageManager').getAdapter().updateJSON('tagdefinitions.json', function(data) {
                return fn(definitionsOf(data));
            }).then(function(data) {
                written = true;
                setTags(data);
            });
        }

        var next = fn(JSON.parse(JSON.stringify(tags)));
        written = true;
        setTags(next);
        var adapter = FrameTrail.module('StorageManager').getAdapter();
        return (adapter && adapter.writeJSON) ? adapter.writeJSON('tagdefinitions.json', next).catch(function() {}) : Promise.resolve();

    }

    function cleanText(label, description) {
        return { label: String(label || '').trim(), description: String(description || '').trim() };
    }

    function checkLabel(label) {
        if (!label) return failure('labelEmpty');
        if (label.length > 80) return failure('labelTooLong');
        return null;
    }


    /**
     * I add a tag with this label, or give the one that has it already.
     *
     * @method addTag
     * @param {String} label
     * @param {String} [description]
     * @return {Promise} the tag's id; rejects with { code, message }
     */
    function addTag(label, description) {

        var text    = cleanText(label, description),
            invalid = checkLabel(text.label);

        if (invalid) return Promise.reject(invalid);
        if (!canCreate()) return Promise.reject(failure('notAllowed'));

        var existing = findIn(tags, text.label);
        if (existing !== null) return Promise.resolve(existing);

        if (storageMode() !== 'server') {
            var id;
            return change(function(data) {
                var found = findIn(data, text.label);
                if (found !== null) { id = found; return data; }
                id = Serializer.tagID(text.label, data);
                data[id] = { label: text.label, description: text.description };
                return data;
            }).then(function() { return id; });
        }

        // The server never adds over an id that is taken (code 5), and then
        // answers with the definitions as they are: use the tag if it is the
        // one meant, else make another id from them once more.
        var attempt = function(retry) {
            var id = Serializer.tagID(text.label, tags);
            return serverPost({ a: 'tagAdd', tagName: id, label: text.label, description: text.description }).then(function(json) {
                if (String(json.code) === '0') {
                    written = true;
                    setTags(json.response);
                    return id;
                }
                if (String(json.code) === '5') {
                    setTags(json.response);
                    var found = findIn(tags, text.label);
                    if (found !== null) return found;
                    if (retry) return attempt(false);
                }
                throw failure(String(json.code) === '1' ? 'notAllowed' : 'failed', json.string);
            });
        };

        return attempt(true);

    }

    /**
     * I add a tag with exactly this id, if there is none (an import keeping
     * the ids its items name). An existing tag is kept as it is.
     *
     * @method ensureTag
     * @param {String} id
     * @param {String} label
     * @param {String} [description]
     * @return {Promise} rejects with { code, message }
     */
    function ensureTag(id, label, description) {

        var text = cleanText(label || id, description);

        if (Object.prototype.hasOwnProperty.call(tags, id)) return Promise.resolve();

        if (storageMode() !== 'server') {
            return change(function(data) {
                if (!Object.prototype.hasOwnProperty.call(data, id)) {
                    data[id] = { label: text.label, description: text.description };
                }
                return data;
            });
        }

        return serverPost({ a: 'tagAdd', tagName: id, label: text.label, description: text.description }).then(function(json) {
            if (String(json.code) === '0' || String(json.code) === '5') {
                written = true;
                setTags(json.response);
                return;
            }
            throw failure('failed', json.string);
        });

    }

    /**
     * I set a tag's label and description, defining the id when it is not
     * (yet, or any more). A tag with a label per language gets the one-label
     * form. Admins only.
     *
     * @method setTag
     * @param {String} id
     * @param {String} label
     * @param {String} [description]
     * @return {Promise} rejects with { code } labelEmpty, labelTooLong, labelTaken, notAllowed, failed
     */
    function setTag(id, label, description) {

        var text    = cleanText(label, description),
            invalid = checkLabel(text.label);

        if (invalid) return Promise.reject(invalid);
        if (!canManage()) return Promise.reject(failure('notAllowed'));
        if (findIn(tags, text.label, id) !== null) return Promise.reject(failure('labelTaken'));

        if (storageMode() !== 'server') {
            return change(function(data) {
                data[id] = { label: text.label, description: text.description };
                return data;
            });
        }

        return serverPost({ a: 'tagSet', tagName: id, label: text.label, description: text.description }).then(function(json) {
            if (String(json.code) !== '0') {
                throw failure(String(json.code) === '1' ? 'notAllowed' : 'failed', json.string);
            }
            written = true;
            setTags(json.response);
        });

    }

    /**
     * I delete a tag's definition. Items that name it keep it, shown as a tag
     * that is no longer defined. Admins only. Without force the server refuses
     * a tag in use ({ code: 'inUse', usage }); elsewhere nothing is checked.
     *
     * @method deleteTag
     * @param {String} id
     * @param {Boolean} [force]
     * @return {Promise}
     */
    function deleteTag(id, force) {

        if (!canManage()) return Promise.reject(failure('notAllowed'));

        if (storageMode() !== 'server') {
            return change(function(data) {
                delete data[id];
                return data;
            });
        }

        return serverPost({ a: 'tagDelete', tagName: id, force: force ? '1' : '' }).then(function(json) {
            if (String(json.code) === '5') {
                throw failure('inUse', json.string, { usage: json.response });
            }
            if (String(json.code) !== '0') {
                throw failure(String(json.code) === '1' ? 'notAllowed' : 'failed', json.string);
            }
            written = true;
            setTags(json.response);
        });

    }


    // { id: { count, hypervideos } } of the items in a _data folder map.
    function usageInFolder(files) {

        var usage = {},
            index = isObject(files['hypervideos/_index.json']) ? files['hypervideos/_index.json'].hypervideos : null;

        Object.keys(isObject(index) ? index : {}).forEach(function(hypervideoID) {

            var dir   = 'hypervideos/' + String(index[hypervideoID]).replace(/^\.\//, '') + '/',
                hv    = files[dir + 'hypervideo.json'],
                items = (isObject(hv) && Array.isArray(hv.contents)) ? hv.contents.slice() : [];

            Object.keys(files).forEach(function(path) {
                if (path.indexOf(dir + 'annotations/') === 0 && /\/[^\/]+\.json$/.test(path)
                        && !/\/_index\.json$/.test(path) && Array.isArray(files[path])) {
                    items = items.concat(files[path]);
                }
            });

            items.forEach(function(item) {
                var named = (isObject(item) && Array.isArray(item['frametrail:tags'])) ? item['frametrail:tags'] : [];
                named.filter(function(tag, at) { return typeof tag === 'string' && named.indexOf(tag) === at; }).forEach(function(tag) {
                    usage[tag] = usage[tag] || { count: 0, hypervideos: [] };
                    usage[tag].count++;
                    if (usage[tag].hypervideos.indexOf(String(hypervideoID)) === -1) {
                        usage[tag].hypervideos.push(String(hypervideoID));
                    }
                });
            });

        });

        return usage;

    }

    /**
     * Where tags are used: every id an overlay, code snippet or annotation of
     * any hypervideo names, defined or not. On a server what is saved (the
     * server counts); elsewhere also the open hypervideo as it is now.
     *
     * @method usage
     * @return {Promise} { id: { count, hypervideos: [ids] } }
     */
    function usage() {

        if (storageMode() === 'server') {
            return serverPost({ a: 'tagUsage' }).then(function(json) {
                if (String(json.code) !== '0') throw failure('failed', json.string);
                return definitionsOf(json.response);
            });
        }

        var BundleExport = FrameTrail.module('BundleExport');
        if (!BundleExport) return Promise.resolve({});

        return BundleExport.collectFolder('project').then(usageInFolder);

    }


    function getAllTags() {
        return tags;
    }


    function getContentCollection (
        arrayOfTagnames, // if empty, collect all items regardless of tagname
        overlays, // unused: only annotations are collected
        annotations, // bool
        arrayOfUserIDsForAnnotations,
        searchText,
        arrayOfContentTypes // frametrail:type
    ) {

        return FrameTrail.module('HypervideoModel').annotations.filter(function (annotationItem) {

            var match = false,
                annotationData = annotationItem.data;

            if (arrayOfTagnames.length === 0) {
                match = true
            } else {
                for (var i in annotationData.tags) {
                    if (arrayOfTagnames.indexOf( annotationData.tags[i] ) > -1) {
                        match = true;
                        break;
                    }
                }
            }

            // empty arrayOfUserIDsForAnnotations means no filtering by user ids
            if (arrayOfUserIDsForAnnotations.length > 0) {
                if (arrayOfUserIDsForAnnotations.indexOf('_currentUser') != -1
                    && FrameTrail.module('UserManagement').userID.length > 0) {
                    arrayOfUserIDsForAnnotations[arrayOfUserIDsForAnnotations.indexOf('_currentUser')] = FrameTrail.module('UserManagement').userID;
                }
                if (arrayOfUserIDsForAnnotations.map(String).indexOf(String(annotationData.creatorId)) < 0) {
                    match = false;
                }
            }

            // empty arrayOfContentTypes means no filtering by content types
            if (arrayOfContentTypes.length > 0) {
                if (arrayOfContentTypes.indexOf(annotationData.type) < 0) {
                    match = false;
                }
            }

            // empty searchText string means no filtering by search text
            if (searchText.length > 0) {
                if (annotationData.name.toLowerCase().indexOf(searchText.toLowerCase()) < 0) {
                    match = false;
                }
            }

            return match;

        });

    }




    return {
        initTagModel: initTagModel,
        updateTagModel: updateTagModel,
        subscribe: subscribe,

        getAllTags: getAllTags,
        getTag: getTag,
        listTags: listTags,
        findByLabel: findByLabel,
        matches: matches,

        canCreate: canCreate,
        canManage: canManage,

        addTag: addTag,
        ensureTag: ensureTag,
        setTag: setTag,
        deleteTag: deleteTag,
        usage: usage,

        getContentCollection: getContentCollection,
    }

});
