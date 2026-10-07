/**
 * @module Shared
 */


/**
 * I am the FrameTrailSerializer: the one implementation of "stored JSON ⇄
 * working model" for the files in _data/ (see docs/DATA-MODEL.md and the
 * schemas in schemas/). I touch neither the DOM nor any FrameTrail instance,
 * so I run in the browser as a plain script (window.FrameTrailSerializer) and
 * in Node under require(). The Database module delegates to me; extensions and
 * other tools can use me directly.
 *
 * The working model is the shape the editor works with: overlays, code
 * snippets and annotations as flat objects (start, end, position, attributes,
 * created in milliseconds, …), the hypervideo's meta, config, layout, clips,
 * chapters and subtitle list.
 *
 * Writing keeps what the model does not cover. Every parsed object remembers
 * the stored object it came from (in "_stored"), and writing is a three-way
 * merge of that stored object, what I would write for it unchanged, and what
 * I write for the model now:
 *
 * * what did not change is written exactly as it was stored, including legacy
 *   representations;
 * * what changed is written the way I write it today;
 * * properties I do not know (another tool's "generator", a key a newer
 *   version added) are kept.
 *
 * Two things are always written in the current form: an item's `@context`
 * and its `created`, as an ISO 8601 date-time with milliseconds. Older files
 * are upgraded by their next save.
 *
 * @class FrameTrailSerializer
 * @static
 */

(function(factory) {

    var Keyframes = (typeof window !== 'undefined' && window.FrameTrailKeyframes)
                 || (typeof require === 'function' ? require('./FrameTrailKeyframes.js') : null),
        api       = factory(Keyframes);

    if (typeof window !== 'undefined') {
        window.FrameTrailSerializer = api;
    }
    if (typeof module === 'object' && module && module.exports) {
        module.exports = api;
    }

})(function(Keyframes) {


    /**
     * The JSON-LD context of every item: the W3C context and FrameTrail's
     * context document, which types the terms that hold JSON.
     */
    var CONTEXT = ['http://www.w3.org/ns/anno.jsonld', 'https://frametrail.org/ns/context.jsonld'];

    var MEDIA_FRAGMENTS = 'http://www.w3.org/TR/media-frags/';

    // Where a parsed object keeps the stored object it came from.
    var STORED = '_stored';

    // Item keys that are always written in their current form.
    var FORCED_ITEM_KEYS = ['@context', 'created'];

    /**
     * Per resource type: the W3C body type and format FrameTrail derives for
     * other consumers (it never reads them), and where the item's src goes.
     * Types not listed have neither and keep src in body.source.
     * Same table as "Resource types" in docs/DATA-MODEL.md.
     */
    var RESOURCE_TYPES = {
        'text':       { type: 'TextualBody', format: 'text/html', src: 'value' },
        'html':       { src: 'source' },
        'quiz':       { type: 'TextualBody', format: 'text/html', src: 'value' },
        'hotspot':    { type: 'TextualBody', format: 'text/html', src: null },
        'cursor':     { type: 'Dataset', format: 'application/x-frametrail-cursor', src: null },
        'counter':    { type: 'Dataset', format: 'application/x-frametrail-counter', src: null },
        'chart':      { type: 'Dataset', format: 'application/x-frametrail-chart', src: null },
        'image':      { type: 'Image', format: 'image/*', src: 'source' },
        'video':      { type: 'Video', format: 'video/mp4', src: 'source' },
        'audio':      { src: 'source' },
        'pdf':        { src: 'source' },
        'youtube':    { type: 'Video', format: 'text/html', src: 'source' },
        'vimeo':      { type: 'Video', format: 'text/html', src: 'source' },
        'wistia':     { type: 'Video', format: 'text/html', src: 'source' },
        'loom':       { type: 'Video', format: 'text/html', src: 'source' },
        'twitch':     { type: 'Video', format: 'text/html', src: 'source' },
        'soundcloud': { type: 'Sound', format: 'text/html', src: 'source' },
        'spotify':    { type: 'Sound', format: 'text/html', src: 'source' },
        'webpage':    { type: 'Text', format: 'text/html', src: 'value' },
        'wikipedia':  { type: 'Text', format: 'text/html', src: 'value' },
        'entity':     { type: 'Text', format: 'text/html', src: 'value' },
        'location':   { type: 'Dataset', format: 'application/x-frametrail-location', src: 'source' },
        'mastodon':   { type: 'Text', format: 'text/html', src: 'source' },
        'codepen':    { type: 'Text', format: 'text/html', src: 'source' },
        'urlpreview': { type: 'Text', format: 'text/html', src: 'source' },
        'figma':      { type: 'Image', format: 'text/html', src: 'source' },
        'codesnippet': { type: 'TextualBody', format: 'text/javascript', src: 'value' }
    };

    // Body types whose body may carry a media fragment of the embedded media.
    var MEDIA_SELECTOR_TYPES = ['video', 'vimeo', 'youtube'];

    // The playback-relevant keys of config.json, the only ones a project bundle carries.
    var PLAYBACK_CONFIG_KEYS = ['defaultTheme', 'defaultLanguage', 'videoFit', 'overviewMode', 'overviewTitle', 'overviewShowSearchBar'];

    // Keys of annotations/_index.json that are not legacy per-user entries.
    var ANNOTATION_INDEX_KEYS = ['mainAnnotation', 'annotation-increment', 'annotationfiles'];


    /* ------------------------------------------------------------------ */
    /*  JSON helpers                                                      */
    /* ------------------------------------------------------------------ */

    function isObject(value) {
        return value !== null && typeof value === 'object' && !Array.isArray(value);
    }

    function has(obj, key) {
        return isObject(obj) && Object.prototype.hasOwnProperty.call(obj, key) && obj[key] !== undefined;
    }

    // A deep copy with JSON semantics (undefined values are dropped).
    function clone(value) {
        return (value === undefined) ? undefined : JSON.parse(JSON.stringify(value));
    }

    // PHP writes an empty object as [], so read [] as {} where an object is meant.
    function objectOrEmpty(value) {
        return (Array.isArray(value) && value.length === 0) ? {} : value;
    }

    function jsonValue(value) {
        if (typeof value === 'number' && !isFinite(value)) { return null; }
        if (typeof value === 'function') { return undefined; }
        return value;
    }

    // Deep equality as JSON sees it: key order does not matter, undefined
    // properties do not exist.
    function sameJSON(a, b) {

        a = jsonValue(a);
        b = jsonValue(b);

        if (a === b) { return true; }
        if (a === null || b === null || typeof a !== 'object' || typeof b !== 'object') { return false; }
        if (Array.isArray(a) !== Array.isArray(b)) { return false; }

        if (Array.isArray(a)) {
            if (a.length !== b.length) { return false; }
            for (var i = 0; i < a.length; i++) {
                var x = (jsonValue(a[i]) === undefined) ? null : a[i],
                    y = (jsonValue(b[i]) === undefined) ? null : b[i];
                if (!sameJSON(x, y)) { return false; }
            }
            return true;
        }

        var keysA = Object.keys(a).filter(function(key) { return jsonValue(a[key]) !== undefined; }),
            keysB = Object.keys(b).filter(function(key) { return jsonValue(b[key]) !== undefined; });

        if (keysA.length !== keysB.length) { return false; }

        for (var k = 0; k < keysA.length; k++) {
            if (jsonValue(b[keysA[k]]) === undefined || !sameJSON(a[keysA[k]], b[keysA[k]])) { return false; }
        }

        return true;

    }

    /**
     * I merge a model's changes into the object it was read from.
     *
     * stored – the object as it was read
     * base   – what I write for stored, read back without changes
     * fresh  – what I write for the model now
     *
     * Where fresh and base agree nothing changed, and stored is kept as it
     * was. Where they differ, fresh wins: objects are merged key by key,
     * everything else is replaced. Keys of stored that neither base nor fresh
     * has are not mine and are kept. Key order follows stored; new keys go
     * last. The result never shares objects with its inputs.
     *
     * @method mergeStored
     * @param {*} stored
     * @param {*} base
     * @param {*} fresh
     * @return {*}
     */
    function mergeStored(stored, base, fresh) {

        if (sameJSON(fresh, base)) { return clone(stored); }
        if (fresh === undefined) { return undefined; }
        if (!isObject(fresh) || !isObject(base) || !isObject(stored)) { return clone(fresh); }

        var out = {};

        Object.keys(stored).forEach(function(key) {
            if (stored[key] === undefined) { return; }
            var value = (has(fresh, key) || has(base, key))
                ? mergeStored(stored[key], base[key], fresh[key])
                : clone(stored[key]);
            if (value !== undefined) { out[key] = value; }
        });

        Object.keys(fresh).forEach(function(key) {
            if (has(stored, key) || !has(fresh, key)) { return; }
            if (!sameJSON(fresh[key], base[key])) { out[key] = clone(fresh[key]); }
        });

        return out;

    }

    // I write a parsed object: the three-way merge with the object it came
    // from, or fresh as it is for an object that was never stored.
    function writeMerged(parsed, fresh, rewrite, forcedKeys) {

        var stored = parsed ? parsed[STORED] : undefined;

        if (!isObject(stored)) { return clone(fresh); }

        var out = mergeStored(stored, rewrite(stored), fresh);

        (forcedKeys || []).forEach(function(key) {
            if (has(fresh, key)) { out[key] = clone(fresh[key]); }
        });

        return out;

    }

    // Copy the keys of source that known does not have.
    function withRest(known, source, skip) {
        if (isObject(source)) {
            Object.keys(source).forEach(function(key) {
                if (Object.prototype.hasOwnProperty.call(known, key) || (skip && skip.indexOf(key) >= 0)) { return; }
                known[key] = source[key];
            });
        }
        return known;
    }


    /* ------------------------------------------------------------------ */
    /*  Time, space and identity                                          */
    /* ------------------------------------------------------------------ */

    // Start of a Media Fragments time range ("t=1.5,3.2" → 1.5).
    function timeStart(selectorValue) {
        var m = /t=([\d.]+)/.exec(selectorValue || '');
        return m ? parseFloat(m[1]) : 0;
    }

    // End of a Media Fragments time range ("t=1.5,3.2" → 3.2).
    function timeEnd(selectorValue) {
        var m = /t=[\d.]+,([\d.]+)/.exec(selectorValue || '');
        return m ? parseFloat(m[1]) : 0;
    }

    // xywh=percent:… → { left, top, width, height }, {} when there is none.
    function spatialBox(selectorValue) {
        var n = '(-?[\\d.]+(?:[eE][-+]?\\d+)?)',
            m = new RegExp('xywh=percent:' + n + ',' + n + ',' + n + ',' + n).exec(selectorValue || '');
        return m
            ? { left: parseFloat(m[1]), top: parseFloat(m[2]), width: parseFloat(m[3]), height: parseFloat(m[4]) }
            : {};
    }

    // Static rotation in degrees, undefined for none.
    function rotationOf(raw) {
        var rotation = parseFloat(raw);
        return (isFinite(rotation) && rotation !== 0) ? rotation : undefined;
    }

    // An item's created (ISO text or toString() text) in milliseconds.
    function parseCreated(created) {
        return (created == null || created === '') ? NaN : (new Date(created)).getTime();
    }

    function isoCreated(created) {
        var date = new Date(created);
        return isFinite(date.getTime()) ? date.toISOString() : undefined;
    }

    /**
     * I make created unique within each group of items, in array order: an
     * item whose created is already taken, or missing (counted as 0), moves
     * on by 1 ms until it is free. Files written before created had
     * milliseconds share values between items made within the same second,
     * and the editor identifies items by created.
     *
     * @method dedupeCreated
     * @param {Array} items
     * @param {Function} [groupOf] item → group key (e.g. the creator's id)
     * @return {Array} items, changed in place
     */
    function dedupeCreated(items, groupOf) {

        var used = {};

        (items || []).forEach(function(item) {
            var group = groupOf ? String(groupOf(item)) : '',
                taken = used[group] || (used[group] = {}),
                value = Number(item.created);
            if (!isFinite(value)) { value = 0; }
            while (taken[value]) { value += 1; }
            taken[value] = true;
            item.created = value;
        });

        return items;

    }

    function storedSource(parsed) {
        var stored = parsed ? parsed[STORED] : undefined;
        return (isObject(stored) && isObject(stored.target)) ? stored.target.source : undefined;
    }

    // The target of an item is the hypervideo's video. Without a sourcePath
    // in the context an item keeps the source it was stored with.
    function targetSource(parsed, context) {
        return (context.sourcePath !== undefined) ? context.sourcePath : storedSource(parsed);
    }


    /* ------------------------------------------------------------------ */
    /*  Bodies                                                            */
    /* ------------------------------------------------------------------ */

    function bodyType(type) {
        return (RESOURCE_TYPES[type] || {}).type;
    }

    function bodyFormat(type, src) {
        var format = (RESOURCE_TYPES[type] || {}).format;
        if (type === 'image') {
            var m = src ? /\.(\w{3,4})$/.exec(src) : null;
            return 'image/' + (m ? m[1] : '*');
        }
        return format;
    }

    function srcPlace(type) {
        var info = RESOURCE_TYPES[type];
        return (info && info.src !== undefined) ? info.src : 'source';
    }

    function mediaSelector(item) {
        if (MEDIA_SELECTOR_TYPES.indexOf(item.type) >= 0 && item.startOffset && item.endOffset) {
            return {
                "type":       "FragmentSelector",
                "conformsTo": MEDIA_FRAGMENTS,
                "value":      "t=" + item.startOffset + "," + item.endOffset
            };
        }
        return undefined;
    }

    function creatorOf(item) {
        return { "nickname": item.creator, "type": "Person", "id": item.creatorId };
    }


    /* ------------------------------------------------------------------ */
    /*  Overlays                                                          */
    /* ------------------------------------------------------------------ */

    /**
     * I read an overlay (a content item with frametrail:type "Overlay").
     * @method parseOverlay
     * @param {Object} item
     * @return {Object}
     */
    function parseOverlay(item) {

        var data     = clone(item),
            body     = isObject(data.body) ? data.body : {},
            target   = isObject(data.target) ? data.target : {},
            selector = isObject(target.selector) ? target.selector : {},
            value    = selector.value,
            creator  = isObject(data.creator) ? data.creator : {},
            media    = isObject(body.selector) ? body.selector.value : undefined;

        var overlay = {
            "name":               body['frametrail:name'],
            "creator":            creator.nickname,
            "creatorId":          creator.id,
            "created":            parseCreated(data.created),
            "type":               body['frametrail:type'],
            "src":                body.source || body.value,
            "thumb":              body['frametrail:thumb'] || null,
            "start":              timeStart(value),
            "end":                timeEnd(value),
            "startOffset":        media ? timeStart(media) : 0,
            "endOffset":          media ? timeEnd(media) : 0,
            "attributes":         objectOrEmpty(body['frametrail:attributes'] ? body['frametrail:attributes'] : data['frametrail:attributes']) || {},
            "licenseType":        body['frametrail:licenseType'] || null,
            "licenseAttribution": body['frametrail:licenseAttribution'] || null,
            "position":           spatialBox(value),
            "keyframes":          Keyframes.normalizeKeyframes(selector['frametrail:keyframes']),
            "rotation":           rotationOf(selector['frametrail:rotation']),
            "events":             objectOrEmpty(data['frametrail:events']),
            "tags":               data['frametrail:tags'],
            "resourceId":         body['frametrail:resourceId']
        };

        normalizeAnimationParams(overlay.attributes);

        if (overlay.type === 'location') {
            var location = isObject(body['frametrail:attributes']) ? body['frametrail:attributes'] : {};
            overlay.attributes.lat         = parseFloat(location.lat);
            overlay.attributes.lon         = parseFloat(location.lon);
            overlay.attributes.boundingBox = location.boundingBox;
        }

        overlay[STORED] = item;

        return overlay;

    }

    // Animation params are objects; PHP may have written them as [].
    function normalizeAnimationParams(attributes) {
        var animation = isObject(attributes) ? attributes.animation : undefined;
        if (!isObject(animation)) { return; }
        ['in', 'emphasis', 'out', 'text'].forEach(function(phase) {
            if (isObject(animation[phase])) {
                animation[phase].params = objectOrEmpty(animation[phase].params);
                if (animation[phase].params === undefined) { delete animation[phase].params; }
            }
        });
    }

    /**
     * I build the target selector of an overlay. A moving overlay keeps a
     * plain Media Fragments box (the union of its track within its span) for
     * every consumer, and adds its keyframes as the frametrail:keyframes
     * extension. A rotated overlay keeps its unrotated box and adds
     * frametrail:rotation (degrees; with keyframes the rotation lives in each
     * keyframe's r).
     * @method overlayTargetSelector
     * @param {Object} overlay
     * @return {Object}
     */
    function overlayTargetSelector(overlay) {

        var position  = overlay.position || {},
            keyframes = (overlay.keyframes && overlay.keyframes.length)
                ? Keyframes.normalizeKeyframes(overlay.keyframes)
                : undefined;

        if (keyframes) {
            position = Keyframes.unionBox(keyframes, overlay.start, overlay.end);
        }

        var selector = {
            "conformsTo": MEDIA_FRAGMENTS,
            "type":       "FragmentSelector",
            "value":
                "t=" + overlay.start + "," + overlay.end
                + "&xywh=percent:"
                + position.left + ","
                + position.top + ","
                + position.width + ","
                + position.height
        };

        if (keyframes) {
            selector["frametrail:keyframes"] = keyframes;
        } else if (rotationOf(overlay.rotation) !== undefined) {
            selector["frametrail:rotation"] = rotationOf(overlay.rotation);
        }

        return selector;

    }

    function overlayAttributes(overlay) {

        if (overlay.type !== 'location' || !isObject(overlay.attributes)) { return overlay.attributes; }

        var attributes = Object.assign({}, overlay.attributes);
        attributes.lat         = parseFloat(overlay.attributes.lat);
        attributes.lon         = parseFloat(overlay.attributes.lon);
        attributes.boundingBox = overlay.attributes.boundingBox ? overlay.attributes.boundingBox : [];
        return attributes;

    }

    function writeOverlay(overlay, context) {

        var place = srcPlace(overlay.type);

        return {
            "@context": CONTEXT,
            "creator":  creatorOf(overlay),
            "created":  isoCreated(overlay.created),
            "type":     "Annotation",
            "frametrail:type": "Overlay",
            "frametrail:tags": overlay.tags || [],
            "target": {
                "type":     "Video",
                "source":   targetSource(overlay, context),
                "selector": overlayTargetSelector(overlay)
            },
            "body": {
                "type":            bodyType(overlay.type),
                "frametrail:type": overlay.type,
                "format":          bodyFormat(overlay.type, overlay.src),
                "source":          (place === 'source') ? overlay.src : undefined,
                "value":           (place === 'value') ? overlay.src : undefined,
                "frametrail:name":               overlay.name,
                "frametrail:thumb":              overlay.thumb,
                "frametrail:licenseType":        overlay.licenseType,
                "frametrail:licenseAttribution": overlay.licenseAttribution,
                "selector":                      mediaSelector(overlay),
                "frametrail:resourceId":         overlay.resourceId,
                "frametrail:attributes":         overlayAttributes(overlay)
            },
            "frametrail:events": overlay.events
        };

    }

    /**
     * I write an overlay as a W3C Web Annotation.
     * @method serializeOverlay
     * @param {Object} overlay
     * @param {Object} [context] { sourcePath }
     * @return {Object}
     */
    function serializeOverlay(overlay, context) {
        return writeMerged(overlay, writeOverlay(overlay, context || {}), function(stored) {
            return writeOverlay(parseOverlay(stored), {});
        }, FORCED_ITEM_KEYS);
    }


    /* ------------------------------------------------------------------ */
    /*  Code snippets                                                     */
    /* ------------------------------------------------------------------ */

    /**
     * I read a code snippet (a content item with frametrail:type "CodeSnippet").
     * @method parseCodeSnippet
     * @param {Object} item
     * @return {Object}
     */
    function parseCodeSnippet(item) {

        var data     = clone(item),
            body     = isObject(data.body) ? data.body : {},
            target   = isObject(data.target) ? data.target : {},
            selector = isObject(target.selector) ? target.selector : {},
            creator  = isObject(data.creator) ? data.creator : {};

        var snippet = {
            "name":       body['frametrail:name'],
            "creator":    creator.nickname,
            "creatorId":  creator.id,
            "created":    parseCreated(data.created),
            "snippet":    body.value,
            "start":      timeStart(selector.value),
            "attributes": objectOrEmpty(body['frametrail:attributes'] ? body['frametrail:attributes'] : data['frametrail:attributes']) || {},
            "tags":       data['frametrail:tags']
        };

        snippet[STORED] = item;

        return snippet;

    }

    function writeCodeSnippet(snippet, context) {
        return {
            "@context": CONTEXT,
            "creator":  creatorOf(snippet),
            "created":  isoCreated(snippet.created),
            "type":     "Annotation",
            "frametrail:type": "CodeSnippet",
            "frametrail:tags": snippet.tags,
            "target": {
                "type":   "Video",
                "source": targetSource(snippet, context),
                "selector": {
                    "conformsTo": MEDIA_FRAGMENTS,
                    "type":       "FragmentSelector",
                    "value":      "t=" + snippet.start
                }
            },
            "body": {
                "type":            "TextualBody",
                "frametrail:type": "codesnippet",
                "format":          "text/javascript",
                "value":           snippet.snippet,
                "frametrail:name":       snippet.name,
                "frametrail:thumb":      null,
                "frametrail:resourceId": null,
                "frametrail:attributes": snippet.attributes
            }
        };
    }

    /**
     * I write a code snippet as a W3C Web Annotation.
     * @method serializeCodeSnippet
     * @param {Object} snippet
     * @param {Object} [context] { sourcePath }
     * @return {Object}
     */
    function serializeCodeSnippet(snippet, context) {
        return writeMerged(snippet, writeCodeSnippet(snippet, context || {}), function(stored) {
            return writeCodeSnippet(parseCodeSnippet(stored), {});
        }, FORCED_ITEM_KEYS);
    }


    /* ------------------------------------------------------------------ */
    /*  Annotations                                                       */
    /* ------------------------------------------------------------------ */

    /**
     * I read an annotation (an item of a user's annotation file).
     * @method parseAnnotation
     * @param {Object} item
     * @param {Object} [source] where it was loaded from, kept as annotation.source
     * @return {Object}
     */
    function parseAnnotation(item, source) {

        var data     = clone(item),
            body     = Array.isArray(data.body) ? data.body[0] : data.body,
            target   = isObject(data.target) ? data.target : {},
            selector = isObject(target.selector) ? target.selector : {},
            creator  = isObject(data.creator) ? data.creator : {};

        body = isObject(body) ? body : {};

        var type = body['frametrail:type'];

        var annotation = {
            "name":       body['frametrail:name'],
            "creator":    creator.nickname,
            "creatorId":  creator.id,
            "created":    parseCreated(data.created),
            "type":       type,
            "uri": (function() {
                        if (data["frametrail:uri"]) { return data["frametrail:uri"]; }
                        else if (type == 'entity') { return body.source; }
                        else { return null; }
                    })(),
            "src": (function() {
                        if (type === 'location') { return null; }
                        if (type === 'urlpreview') { return body.source || body.value; }
                        return (srcPlace(type) === 'value') ? body.value : body.source;
                    })(),
            "thumb":              body['frametrail:thumb'],
            "licenseType":        body['frametrail:licenseType'] || null,
            "licenseAttribution": body['frametrail:licenseAttribution'] || null,
            "start":              timeStart(selector.value),
            "end":                timeEnd(selector.value),
            "resourceId":         body["frametrail:resourceId"],
            "attributes":         objectOrEmpty(body['frametrail:attributes']) || {},
            "tags":               data['frametrail:tags'],
            "source":             source,
            "graphData":          data['frametrail:graphdata']     || null,
            "graphDataType":      data['frametrail:graphdatatype'] || null
        };

        if (type === 'location') {
            var location = isObject(body['frametrail:attributes']) ? body['frametrail:attributes'] : {};
            annotation.attributes.lat         = parseFloat(location.lat !== undefined ? location.lat : body['frametrail:lat']);
            annotation.attributes.lon         = parseFloat(location.lon !== undefined ? location.lon : body['frametrail:long']);
            annotation.attributes.boundingBox = location.boundingBox !== undefined ? location.boundingBox : (body['frametrail:boundingBox'] || '');
        }

        if (type === 'video') {
            var media = isObject(body.selector) ? body.selector.value : undefined;
            annotation.startOffset = media ? timeStart(media) : 0;
            annotation.endOffset   = media ? timeEnd(media)   : 0;
        }

        annotation[STORED] = item;

        return annotation;

    }

    function writeAnnotation(annotation, context) {

        var place = srcPlace(annotation.type);

        return {
            "@context": CONTEXT,
            "creator":  creatorOf(annotation),
            "created":  isoCreated(annotation.created),
            "type":     "Annotation",
            "frametrail:type": "Annotation",
            "frametrail:tags": annotation.tags || [],
            "frametrail:uri":  annotation.uri || null,
            "frametrail:graphdata":     (annotation.graphData != null)     ? annotation.graphData     : undefined,
            "frametrail:graphdatatype": (annotation.graphDataType != null) ? annotation.graphDataType : undefined,
            "target": {
                "type":   "Video",
                "source": targetSource(annotation, context),
                "selector": {
                    "conformsTo": MEDIA_FRAGMENTS,
                    "type":       "FragmentSelector",
                    "value":      "t=" + annotation.start + "," + annotation.end
                }
            },
            "body": {
                "type":            bodyType(annotation.type),
                "frametrail:type": annotation.type,
                "format":          bodyFormat(annotation.type, annotation.src),
                "source":          (place !== 'value') ? annotation.src : undefined,
                "value":           (place === 'value') ? annotation.src : undefined,
                "frametrail:name":               annotation.name,
                "frametrail:thumb":              annotation.thumb,
                "frametrail:licenseType":        annotation.licenseType,
                "frametrail:licenseAttribution": annotation.licenseAttribution,
                "selector":                      mediaSelector(annotation),
                "frametrail:resourceId":         annotation.resourceId,
                "frametrail:attributes":         annotation.attributes
            }
        };

    }

    /**
     * I write an annotation as a W3C Web Annotation.
     * @method serializeAnnotation
     * @param {Object} annotation
     * @param {Object} [context] { sourcePath }
     * @return {Object}
     */
    function serializeAnnotation(annotation, context) {
        return writeMerged(annotation, writeAnnotation(annotation, context || {}), function(stored) {
            return writeAnnotation(parseAnnotation(stored), {});
        }, FORCED_ITEM_KEYS);
    }

    /**
     * I read an annotation file (annotations/<userId>.json): an array of
     * annotations. created is made unique per creator (see dedupeCreated).
     * @method parseAnnotationFile
     * @param {Array} json
     * @param {Object} [source] kept as each annotation's source
     * @return {Array}
     */
    function parseAnnotationFile(json, source) {

        var list = Array.isArray(json)
                ? json
                : (isObject(json) ? Object.keys(json).map(function(key) { return json[key]; }) : []);

        var annotations = list.filter(isObject).map(function(item) {
            return parseAnnotation(item, source);
        });

        return dedupeCreated(annotations, function(annotation) { return annotation.creatorId; });

    }

    /**
     * I write an annotation file.
     * @method serializeAnnotationFile
     * @param {Array} annotations
     * @param {Object} [context] { sourcePath }
     * @return {Array}
     */
    function serializeAnnotationFile(annotations, context) {
        return (annotations || []).map(function(annotation) {
            return serializeAnnotation(annotation, context);
        });
    }

    /**
     * I read annotations/_index.json. Besides annotationfiles I accept the
     * shape local-folder mode used to write, with a user's entry at the top
     * level of the file; such entries count where annotationfiles has none.
     * @method parseAnnotationIndex
     * @param {Object} json
     * @return {Object} { mainAnnotation, annotationfiles }
     */
    function parseAnnotationIndex(json) {

        var index = isObject(json) ? json : {},
            files = isObject(index.annotationfiles) ? clone(index.annotationfiles) : {};

        Object.keys(index).forEach(function(key) {
            if (ANNOTATION_INDEX_KEYS.indexOf(key) >= 0 || !isObject(index[key]) || has(files, key)) { return; }
            files[key] = clone(index[key]);
        });

        return {
            mainAnnotation:  (index.mainAnnotation !== undefined) ? index.mainAnnotation : null,
            annotationfiles: files
        };

    }

    /**
     * I return annotations/_index.json with the entry of one annotation file
     * set: fields are merged over the entry under annotationfiles. A legacy
     * top-level entry of the same file is removed, so the file says it once.
     * @method setAnnotationIndexEntry
     * @param {Object} json the index as read (or nothing, for a new one)
     * @param {String} fileId
     * @param {Object} fields
     * @return {Object} the new index
     */
    function setAnnotationIndexEntry(json, fileId, fields) {

        var index = isObject(json) ? clone(json) : {},
            key   = String(fileId);

        if (!isObject(index.annotationfiles)) { index.annotationfiles = {}; }

        index.annotationfiles[key] = Object.assign({}, index.annotationfiles[key], fields);

        if (ANNOTATION_INDEX_KEYS.indexOf(key) < 0 && isObject(index[key])) {
            delete index[key];
        }

        return index;

    }


    /* ------------------------------------------------------------------ */
    /*  Hypervideos                                                       */
    /* ------------------------------------------------------------------ */

    /**
     * I read the contents of a hypervideo.json: overlays and code snippets,
     * with created made unique in each, and the items of any other kind,
     * which are kept untouched.
     * @method parseContents
     * @param {Array} contents
     * @return {Object} { overlays, codeSnippets, otherContents }
     */
    function parseContents(contents) {

        var result = { overlays: [], codeSnippets: [], otherContents: [] },
            list   = Array.isArray(contents)
                ? contents
                : (isObject(contents) ? Object.keys(contents).map(function(key) { return contents[key]; }) : []);

        list.forEach(function(item) {
            switch (isObject(item) ? item['frametrail:type'] : undefined) {
                case 'Overlay':
                    result.overlays.push(parseOverlay(item));
                    break;
                case 'CodeSnippet':
                    result.codeSnippets.push(parseCodeSnippet(item));
                    break;
                default:
                    result.otherContents.push(clone(item));
            }
        });

        dedupeCreated(result.overlays);
        dedupeCreated(result.codeSnippets);

        return result;

    }

    /**
     * I read a hypervideo.json into its working model:
     *
     *     { meta, config, layout, clips, overlays, codeSnippets, otherContents,
     *       chapters, subtitles, globalEvents, customCSS }
     *
     * layout is config.layoutArea, which is not repeated in config.
     *
     * @method parseHypervideo
     * @param {Object} json
     * @return {Object}
     */
    function parseHypervideo(json) {

        var data     = isObject(json) ? json : {},
            config   = isObject(data.config) ? clone(data.config) : {},
            contents = parseContents(data.contents),
            layout   = config.layoutArea;

        delete config.layoutArea;

        var model = {
            "meta":          isObject(data.meta) ? clone(data.meta) : {},
            "config":        config,
            "layout":        layout,
            "clips":         clone(data.clips),
            "overlays":      contents.overlays,
            "codeSnippets":  contents.codeSnippets,
            "otherContents": contents.otherContents,
            "chapters":      clone(data.chapters),
            "subtitles":     clone(data.subtitles),
            "globalEvents":  objectOrEmpty(clone(data.globalEvents)),
            "customCSS":     data.customCSS
        };

        model[STORED] = json;

        return model;

    }

    /**
     * I turn Transcript content views into CustomHTML holding the transcript
     * text, so a hypervideo shown without its subtitle files (an export)
     * still has it. Views whose subtitles are not given stay as they are.
     * @method transcriptsToHTML
     * @param {Object} layoutArea
     * @param {Object} subtitles parsed subtitles: { <srclang>: { cues: [{ startTime, endTime, text }] } }
     * @return {Object} a new layoutArea
     */
    function transcriptsToHTML(layoutArea, subtitles) {

        if (!isObject(layoutArea) || !subtitles) { return layoutArea; }

        var result = {};

        Object.keys(layoutArea).forEach(function(area) {
            var views = layoutArea[area];
            result[area] = !Array.isArray(views) ? views : views.map(function(view) {
                var subs = (isObject(view) && view.type === 'Transcript' && view.transcriptSource)
                    ? subtitles[view.transcriptSource]
                    : null;
                if (!subs || !subs.cues) { return view; }
                var html = '';
                for (var c = 0; c < subs.cues.length; c++) {
                    var cue = subs.cues[c];
                    html += '<span class="timebased" data-start="' + cue.startTime + '" data-end="' + cue.endTime + '">'
                        + String(cue.text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
                        + ' </span>';
                }
                return {
                    type:               'CustomHTML',
                    name:               view.name,
                    icon:               view.icon,
                    cssClass:           view.cssClass,
                    html:               html,
                    collectionFilter:   view.collectionFilter,
                    contentSize:        view.contentSize,
                    onClickContentItem: view.onClickContentItem,
                    initClosed:         view.initClosed,
                    filterAspect:       view.filterAspect,
                    zoomControls:       view.zoomControls
                };
            });
        });

        return result;

    }

    // Stands in for contents while the rest of the file is merged; the items
    // are merged one by one.
    var CONTENTS_SLOT = '\u0000contents';

    function writeHypervideo(model, context) {

        var meta   = model.meta || {},
            config = model.config || {},
            layout = (model.layout !== undefined) ? model.layout : config.layoutArea;

        if (context.purpose === 'export') {
            layout = transcriptsToHTML(layout, context.subtitles);
        }

        return {
            "meta": withRest({
                "name":        meta.name,
                "description": meta.description,
                "thumb":       meta.thumb,
                "posterFrame": meta.posterFrame || null,
                "creator":     meta.creator,
                "creatorId":   meta.creatorId,
                "created":     meta.created,
                "lastchanged": (context.now !== undefined) ? context.now : meta.lastchanged
            }, meta),
            "config": withRest({
                "slidingMode":      config.slidingMode,
                "slidingTrigger":   config.slidingTrigger,
                "autohideControls": config.autohideControls,
                "captionsVisible":  config.captionsVisible,
                "clipTimeVisible":  config.clipTimeVisible,
                "theme":            config.theme || "",
                "layoutArea":       layout
            }, config, ['layoutArea']),
            "clips":        model.clips,
            "globalEvents": model.globalEvents || {},
            "customCSS":    model.customCSS || "",
            "contents":     CONTENTS_SLOT,
            "chapters":     model.chapters || [],
            "subtitles":    model.subtitles
        };

    }

    /**
     * I write a hypervideo model as hypervideo.json. I read only the model I
     * am given.
     *
     * context:
     * * sourcePath – the hypervideo's video, written as every item's target
     *   source (omitted: each item keeps the one it was stored with)
     * * now        – written as meta.lastchanged (omitted: kept)
     * * purpose    – 'save' (default) or 'export'. An export has to stand
     *   alone, so its Transcript views become CustomHTML.
     * * subtitles  – for exports, the parsed subtitles the transcripts are
     *   built from
     *
     * @method serializeHypervideo
     * @param {Object} model
     * @param {Object} [context]
     * @return {Object}
     */
    function serializeHypervideo(model, context) {

        var ctx    = context || {},
            fresh  = writeHypervideo(model, ctx),
            stored = model[STORED],
            out;

        if (isObject(stored)) {
            var storedTop = Object.assign({}, stored, { contents: CONTENTS_SLOT });
            out = mergeStored(storedTop, writeHypervideo(parseHypervideo(stored), {}), fresh);
            if (ctx.now !== undefined && isObject(out.meta)) {
                out.meta.lastchanged = ctx.now;
            }
        } else {
            out = clone(fresh);
        }

        var itemContext = { sourcePath: ctx.sourcePath };

        out.contents = []
            .concat((model.overlays || []).map(function(overlay) { return serializeOverlay(overlay, itemContext); }))
            .concat((model.codeSnippets || []).map(function(snippet) { return serializeCodeSnippet(snippet, itemContext); }))
            .concat((model.otherContents || []).map(clone));

        return out;

    }


    /* ------------------------------------------------------------------ */
    /*  Bundles                                                           */
    /* ------------------------------------------------------------------ */

    var bundleFormats = {};

    /**
     * I register a bundle format: { read(source, options) → bundle,
     * write(bundle, options) → output }. Bundles are the documents of
     * hypervideo-bundle.schema.json and project-bundle.schema.json.
     * @method registerBundleFormat
     * @param {String} name
     * @param {Object} format
     */
    function registerBundleFormat(name, format) {
        bundleFormats[name] = format;
    }

    function bundleFormat(name) {
        var format = bundleFormats[name];
        if (!format) { throw new Error('Unknown bundle format: ' + name); }
        return format;
    }

    /**
     * I read a bundle from a source in the given format.
     * @method readBundle
     * @param {*} source
     * @param {String} format
     * @param {Object} [options]
     * @return {Object} bundle
     */
    function readBundle(source, format, options) {
        return bundleFormat(format).read(source, options || {});
    }

    /**
     * I write a bundle in the given format.
     * @method writeBundle
     * @param {Object} bundle
     * @param {String} format
     * @param {Object} [options]
     * @return {*}
     */
    function writeBundle(bundle, format, options) {
        return bundleFormat(format).write(bundle, options || {});
    }

    // The ids of the resources a hypervideo bundle uses: its clips and the
    // items made from a resource.
    function usedResourceIds(bundle) {

        var used  = [],
            hv    = bundle.hypervideo || {},
            items = Array.isArray(hv.contents) ? hv.contents.slice() : [],
            files = (bundle.annotations && isObject(bundle.annotations.files)) ? bundle.annotations.files : {};

        function add(id) {
            if (id != null && id !== '' && used.indexOf(String(id)) < 0) { used.push(String(id)); }
        }

        (Array.isArray(hv.clips) ? hv.clips : []).forEach(function(clip) { if (isObject(clip)) { add(clip.resourceId); } });

        Object.keys(files).forEach(function(fileId) {
            if (Array.isArray(files[fileId])) { items = items.concat(files[fileId]); }
        });

        items.forEach(function(item) {
            if (isObject(item) && isObject(item.body)) { add(item.body['frametrail:resourceId']); }
        });

        return used;

    }

    /*
     * The folder format: the _data layout as a map of paths (relative to
     * _data/) to contents — parsed JSON for .json files, text for .vtt and
     * .css. A project bundle maps to the whole tree. A hypervideo bundle maps
     * to its folder under hypervideos/ and a resources/_index.json holding
     * the resources it carries.
     *
     * Reading takes options.bundle ('project' or 'hypervideo') and, for a
     * hypervideo, options.id. Without them a tree with a hypervideos index is
     * read as a project. JSON may also be given as text.
     */

    function folderDir(index, id) {
        var rel = (index && isObject(index.hypervideos) && index.hypervideos[id]) || ('./' + id),
            dir = String(rel).replace(/^\.\//, '').replace(/\/+$/, '');
        if (!dir || dir.charAt(0) === '/' || dir.split('/').indexOf('..') >= 0) {
            throw new Error('Invalid hypervideo folder: ' + rel);
        }
        return 'hypervideos/' + dir + '/';
    }

    function folderFile(files, path) {
        if (!Object.prototype.hasOwnProperty.call(files, path)) { return undefined; }
        var content = files[path];
        if (typeof content === 'string' && /\.json$/.test(path)) {
            try {
                return JSON.parse(content);
            } catch (e) {
                throw new Error('Invalid JSON in ' + path);
            }
        }
        return clone(content);
    }

    function subtitleFileName(hypervideo, srclang) {
        var list = (isObject(hypervideo) && Array.isArray(hypervideo.subtitles)) ? hypervideo.subtitles : [];
        for (var i = 0; i < list.length; i++) {
            if (isObject(list[i]) && list[i].srclang === srclang && list[i].src) { return list[i].src; }
        }
        return srclang + '.vtt';
    }

    function readHypervideoFolder(files, id, dir, withResources) {

        var hypervideo = folderFile(files, dir + 'hypervideo.json');

        if (hypervideo === undefined) { throw new Error('Missing ' + dir + 'hypervideo.json'); }

        var bundle = { "bundle": "hypervideo", "formatVersion": 1, "id": String(id), "hypervideo": hypervideo },
            annotationsDir = dir + 'annotations/',
            annotationIndex, annotationFiles;

        Object.keys(files).forEach(function(path) {
            var name = (path.indexOf(annotationsDir) === 0) ? path.slice(annotationsDir.length) : null;
            if (!name || !/^[^\/]+\.json$/.test(name)) { return; }
            if (name === '_index.json') {
                annotationIndex = folderFile(files, path);
            } else {
                annotationFiles = annotationFiles || {};
                annotationFiles[name.replace(/\.json$/, '')] = folderFile(files, path);
            }
        });

        // Index first, whatever the order of the paths, so the same folder is always the same JSON.
        if (annotationIndex !== undefined || annotationFiles) {
            bundle.annotations = {};
            if (annotationIndex !== undefined) { bundle.annotations.index = annotationIndex; }
            bundle.annotations.files = annotationFiles || {};
        }

        if (withResources) {
            var index = folderFile(files, 'resources/_index.json'),
                all   = (isObject(index) && isObject(index.resources)) ? index.resources : null;
            if (all) {
                bundle.resources = {};
                usedResourceIds(bundle).forEach(function(resourceId) {
                    if (has(all, resourceId)) { bundle.resources[resourceId] = all[resourceId]; }
                });
            }
        }

        (Array.isArray(hypervideo.subtitles) ? hypervideo.subtitles : []).forEach(function(entry) {
            if (!isObject(entry) || !entry.srclang) { return; }
            var text = folderFile(files, dir + 'subtitles/' + (entry.src || entry.srclang + '.vtt'));
            if (typeof text === 'string') {
                bundle.subtitles = bundle.subtitles || {};
                bundle.subtitles[entry.srclang] = text;
            }
        });

        return bundle;

    }

    function writeHypervideoFolder(files, bundle, dir) {

        files[dir + 'hypervideo.json'] = clone(bundle.hypervideo);

        if (isObject(bundle.annotations)) {
            if (bundle.annotations.index !== undefined) {
                files[dir + 'annotations/_index.json'] = clone(bundle.annotations.index);
            }
            Object.keys(bundle.annotations.files || {}).forEach(function(fileId) {
                if (fileId === '_index' || /[\/\\]|^\.\.?$/.test(fileId)) { throw new Error('Invalid annotation file id: ' + fileId); }
                files[dir + 'annotations/' + fileId + '.json'] = clone(bundle.annotations.files[fileId]);
            });
        }

        Object.keys(bundle.subtitles || {}).forEach(function(srclang) {
            var name = subtitleFileName(bundle.hypervideo, srclang);
            if (/[\/\\]|^\.\.?$/.test(name)) { throw new Error('Invalid subtitle file name: ' + name); }
            files[dir + 'subtitles/' + name] = bundle.subtitles[srclang];
        });

    }

    registerBundleFormat('folder', {

        read: function(files, options) {

            if (!isObject(files)) { throw new Error('A folder is a map of paths to contents'); }

            var index = folderFile(files, 'hypervideos/_index.json'),
                kind  = options.bundle || ((index !== undefined && options.id == null) ? 'project' : 'hypervideo');

            if (kind === 'hypervideo') {
                if (options.id == null) { throw new Error('Reading a hypervideo bundle needs options.id'); }
                return readHypervideoFolder(files, options.id, folderDir(index, options.id), true);
            }

            if (!isObject(index)) { throw new Error('Missing hypervideos/_index.json'); }

            var bundle  = { "bundle": "project", "formatVersion": 1, "hypervideosIndex": index, "hypervideos": {} },
                entries = isObject(index.hypervideos) ? index.hypervideos : {};

            Object.keys(entries).forEach(function(id) {
                bundle.hypervideos[id] = readHypervideoFolder(files, id, folderDir(index, id), false);
            });

            var resources      = folderFile(files, 'resources/_index.json'),
                tagdefinitions = folderFile(files, 'tagdefinitions.json'),
                config         = folderFile(files, 'config.json'),
                customCSS      = folderFile(files, 'custom.css');

            if (resources !== undefined)      { bundle.resources = resources; }
            if (tagdefinitions !== undefined) { bundle.tagdefinitions = tagdefinitions; }
            if (isObject(config)) {
                bundle.config = {};
                PLAYBACK_CONFIG_KEYS.forEach(function(key) {
                    if (has(config, key)) { bundle.config[key] = config[key]; }
                });
            }
            if (typeof customCSS === 'string') { bundle.customCSS = customCSS; }

            return bundle;

        },

        write: function(bundle, options) {

            var files = {};

            if (!isObject(bundle)) { throw new Error('Not a bundle'); }

            if (bundle.bundle === 'project') {

                files['hypervideos/_index.json'] = clone(bundle.hypervideosIndex);

                Object.keys(bundle.hypervideos || {}).forEach(function(id) {
                    writeHypervideoFolder(files, bundle.hypervideos[id], folderDir(bundle.hypervideosIndex, id));
                });

                if (bundle.resources !== undefined)      { files['resources/_index.json'] = clone(bundle.resources); }
                if (bundle.tagdefinitions !== undefined) { files['tagdefinitions.json'] = clone(bundle.tagdefinitions); }
                if (bundle.config !== undefined)         { files['config.json'] = clone(bundle.config); }
                if (typeof bundle.customCSS === 'string') { files['custom.css'] = bundle.customCSS; }

            } else if (bundle.bundle === 'hypervideo') {

                var id = (options.id != null) ? options.id : bundle.id;
                if (id == null) { throw new Error('Writing a hypervideo bundle needs an id'); }

                writeHypervideoFolder(files, bundle, folderDir(null, id));

                if (isObject(bundle.resources)) {
                    var highest = 0;
                    Object.keys(bundle.resources).forEach(function(resourceId) {
                        highest = Math.max(highest, parseInt(resourceId, 10) || 0);
                    });
                    files['resources/_index.json'] = {
                        "resources-increment": highest,
                        "resources":           clone(bundle.resources)
                    };
                }

            } else {
                throw new Error('Not a bundle: ' + bundle.bundle);
            }

            return files;

        }

    });


    /* ------------------------------------------------------------------ */

    return {

        CONTEXT:                 CONTEXT,
        RESOURCE_TYPES:          RESOURCE_TYPES,
        PLAYBACK_CONFIG_KEYS:    PLAYBACK_CONFIG_KEYS,

        parseHypervideo:         parseHypervideo,
        serializeHypervideo:     serializeHypervideo,
        parseContents:           parseContents,
        transcriptsToHTML:       transcriptsToHTML,

        parseOverlay:            parseOverlay,
        serializeOverlay:        serializeOverlay,
        overlayTargetSelector:   overlayTargetSelector,
        parseCodeSnippet:        parseCodeSnippet,
        serializeCodeSnippet:    serializeCodeSnippet,

        parseAnnotation:         parseAnnotation,
        serializeAnnotation:     serializeAnnotation,
        parseAnnotationFile:     parseAnnotationFile,
        serializeAnnotationFile: serializeAnnotationFile,
        parseAnnotationIndex:    parseAnnotationIndex,
        setAnnotationIndexEntry: setAnnotationIndexEntry,

        dedupeCreated:           dedupeCreated,
        mergeStored:             mergeStored,

        registerBundleFormat:    registerBundleFormat,
        readBundle:              readBundle,
        writeBundle:             writeBundle

    };

});
