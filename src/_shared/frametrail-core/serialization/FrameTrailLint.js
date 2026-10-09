/**
 * @module Shared
 */


/**
 * I am FrameTrailLint: checks of FrameTrail data that its JSON Schemas cannot
 * express. The schemas say whether each file is well-formed; I say whether
 * the data makes sense as a whole.
 *
 * Rules (RULES) look at one hypervideo: items outside the video, overlays
 * covering each other, items missing what their type needs, chapters out of
 * order, subtitles that belong to another video, references to resources
 * that are not in the library.
 *
 *     var parts  = FrameTrailLint.partsOf(bundle, { hypervideoId: '1', duration: 600 });
 *     var result = FrameTrailLint.run(parts);                       // every rule
 *     FrameTrailLint.run(parts, { rules: ['chapter-order'] });     // some
 *     // → { errors, warnings, findings: [{ rule, severity, kind, ref, creator?, related?, message }] }
 *
 * RESULT_SCHEMA describes the result, in the schema subset of schemas/.
 *
 * checkFolder(files) looks at a whole _data folder (the serializer's folder
 * format): files that do not agree with each other, such as an annotation
 * file without its entry in the annotations index or a subtitle file no
 * hypervideo lists.
 *
 * The rules and their messages are specified by the fixtures in
 * tests/fixtures/lint/ and the rules in tests/README.md. Every finding is
 * written for a person reading it: what is wrong and why it matters.
 *
 * I touch neither the DOM nor any FrameTrail instance, so I run in the
 * browser as a plain script (window.FrameTrailLint) and in Node under
 * require().
 *
 * @class FrameTrailLint
 * @static
 */

(function(factory) {

    var Serializer = (typeof window !== 'undefined' && window.FrameTrailSerializer)
                  || (typeof require === 'function' ? require('./FrameTrailSerializer.js') : null),
        api        = factory(Serializer);

    if (typeof window !== 'undefined') {
        window.FrameTrailLint = api;
    }
    if (typeof module === 'object' && module && module.exports) {
        module.exports = api;
    }

})(function(Serializer) {


    /**
     * The rules: id, severity ("error": the data does not do what it is
     * meant to; "warning": it may not) and what each finds.
     */
    var RULES = [
        {
            "id": "item-outside-video",
            "severity": "error",
            "description": "An overlay, annotation, code snippet or chapter that the player never reaches: it starts at or after the end of the video, or it lies before the video's start (its clip's in point). Without a known end only the start is checked."
        },
        {
            "id": "item-partly-outside",
            "severity": "warning",
            "description": "An overlay or annotation that runs past the end of the video or begins before its start: the part outside is never shown."
        },
        {
            "id": "overlay-overlap",
            "severity": "warning",
            "description": "Two overlays cover the same area at the same time, by their boxes (with box motion: the area they move in). Hotspots and cursors are left out: they are meant to lie over other overlays. Reported on the later of the two in stored order, with the other as related."
        },
        {
            "id": "unknown-resource",
            "severity": "warning",
            "description": "The clip or an item names a resource (resourceId, frametrail:resourceId) that is not in the resources index. An item keeps a copy of the resource it was made from, so it still shows; a clip that names its video only by the resource has no video. Checked only where the resources are known."
        },
        {
            "id": "empty-required",
            "severity": "error",
            "description": "An overlay, annotation or code snippet lacks what its type needs: a source (embedded media, pages, files), text (text: text or title), HTML (html), a question and answers (quiz; answers for multipleChoice and multiSelect, each with text), a position (location: lat and lon), data (chart), the target of a hotspot's action, code (code snippet)."
        },
        {
            "id": "missing-license",
            "severity": "warning",
            "description": "An overlay made from a library resource (frametrail:resourceId) or showing a media file (image, video, audio, pdf) has no license type (body frametrail:licenseType)."
        },
        {
            "id": "chapter-order",
            "severity": "warning",
            "description": "The chapters are not stored in order of their start, or two start at the same time. FrameTrail keeps them sorted, each start once; a file edited by hand may not."
        },
        {
            "id": "cue-outside-video",
            "severity": "warning",
            "description": "Subtitle cues start at or after the end of the video: the subtitles may belong to another video. Reported once per language. Checked only for a clip without an out point (a trimmed video's subtitles go on after the out point)."
        }
    ];

    /**
     * What run() gives back, as a JSON Schema in the subset of schemas/:
     * FrameTrailSchema.create([RESULT_SCHEMA]).validate('lint-result.schema.json', result).
     */
    var RESULT_SCHEMA = {
        "$schema": "https://json-schema.org/draft/2020-12/schema",
        "$id": "https://frametrail.org/schemas/1/lint-result.schema.json",
        "title": "FrameTrailLint result",
        "description": "The findings of FrameTrailLint.run() for one hypervideo.",
        "type": "object",
        "required": ["errors", "warnings", "findings"],
        "properties": {
            "errors":   { "description": "How many findings have the severity error.", "type": "integer", "minimum": 0 },
            "warnings": { "description": "How many findings have the severity warning.", "type": "integer", "minimum": 0 },
            "findings": {
                "description": "By rule, in the order of FrameTrailLint.RULES; within a rule as the items are listed.",
                "type": "array",
                "items": { "$ref": "#/$defs/finding" }
            }
        },
        "$defs": {
            "finding": {
                "description": "One problem with one item, the subtitles of one language, or the hypervideo.",
                "type": "object",
                "required": ["rule", "severity", "kind", "message"],
                "properties": {
                    "rule":     { "description": "The rule's id.", "type": "string" },
                    "severity": { "description": "The rule's severity.", "type": "string", "enum": ["error", "warning"] },
                    "kind":     { "description": "What it is about: a kind of item, the subtitles, or the hypervideo itself.", "type": "string", "enum": ["overlays", "annotations", "codeSnippets", "chapters", "subtitles", "hypervideo"] },
                    "ref":      { "description": "Which one: an item's created (as stored), a chapter's start, the subtitles' language. Missing for the hypervideo.", "type": ["string", "number"] },
                    "creator":  { "description": "Annotations: the id of their creator, which together with created identifies an annotation across the users' files.", "type": "string" },
                    "related":  {
                        "description": "The other item it concerns (overlay-overlap).",
                        "type": "object",
                        "required": ["kind", "ref"],
                        "properties": {
                            "kind": { "description": "The other item's kind.", "type": "string" },
                            "ref":  { "description": "The other item's created.", "type": ["string", "number"] }
                        }
                    },
                    "message":  { "description": "What is wrong and why it matters, in a sentence.", "type": "string" }
                }
            }
        }
    };

    // Overlays that are meant to lie over others.
    var OVERLAPPING_TYPES = ['hotspot', 'cursor'];

    // Body types that show a source: a URL, a page, a file.
    var SOURCE_TYPES = ['image', 'video', 'audio', 'pdf', 'youtube', 'vimeo', 'wistia', 'loom', 'twitch', 'soundcloud',
                        'spotify', 'webpage', 'wikipedia', 'mastodon', 'codepen', 'figma', 'urlpreview'];

    // Body types that show a media file.
    var MEDIA_TYPES = ['image', 'video', 'audio', 'pdf'];

    // Hotspot actions that need a target.
    var TARGETED_ACTIONS = ['openUrl', 'jumpToTime', 'jumpToHypervideo'];


    function isObject(value) {
        return value !== null && typeof value === 'object' && !Array.isArray(value);
    }


    /* ------------------------------------------------------------------ */
    /*  Numbers and Media Fragments                                       */
    /* ------------------------------------------------------------------ */

    // Seconds as written into selectors and shown: rounded to the millisecond.
    function seconds(value) {
        return Math.round(value * 1000) / 1000;
    }

    /**
     * I read the time of a Media Fragments value: "t=12.5,20&…" →
     * { start: 12.5, end: 20 }; end is start for a point ("t=12.5"), and
     * both are 0 without a time.
     *
     * @method timeSpan
     * @param {String} value
     * @return {Object}
     */
    function timeSpan(value) {
        var m = /(?:^|&)t=([0-9.eE+-]+)(?:,([0-9.eE+-]+))?/.exec(value || '');
        if (!m) { return { start: 0, end: 0 }; }
        var start = parseFloat(m[1]),
            end   = (m[2] !== undefined) ? parseFloat(m[2]) : start;
        return { start: isFinite(start) ? start : 0, end: isFinite(end) ? end : 0 };
    }

    /**
     * I read the box of a Media Fragments value: "…&xywh=percent:10,20,30,40"
     * → { left, top, width, height }, or null without one.
     *
     * @method box
     * @param {String} value
     * @return {Object|null}
     */
    function box(value) {
        var n = '(-?[0-9.]+(?:[eE][-+]?[0-9]+)?)',
            m = new RegExp('xywh=percent:' + n + ',' + n + ',' + n + ',' + n).exec(value || '');
        return m
            ? { left: parseFloat(m[1]), top: parseFloat(m[2]), width: parseFloat(m[3]), height: parseFloat(m[4]) }
            : null;
    }

    /**
     * I return where a hypervideo's time begins (its clip's in point) and how
     * long it is: from the clip's out point, else the media's duration as
     * given (mediaDuration), else the clip's duration; null when none says.
     *
     * @method clipSpan
     * @param {Array} clips hypervideo.json → clips
     * @param {Number} [mediaDuration] seconds, as the media file tells it
     * @return {Object} { start, duration }
     */
    function clipSpan(clips, mediaDuration) {

        var clip   = (Array.isArray(clips) && isObject(clips[0])) ? clips[0] : {},
            inTime = (typeof clip['in'] === 'number') ? clip['in'] : 0,
            media  = (typeof mediaDuration === 'number' && mediaDuration > 0)
                ? mediaDuration
                : ((typeof clip.duration === 'number' && clip.duration > 0) ? clip.duration : null),
            out    = (typeof clip.out === 'number' && clip.out > 0) ? clip.out : media;

        return {
            start:    inTime,
            duration: (out !== null && out > inTime) ? seconds(out - inTime) : null
        };

    }


    /* ------------------------------------------------------------------ */
    /*  Text                                                              */
    /* ------------------------------------------------------------------ */

    var ENTITIES = { 'amp': '&', 'lt': '<', 'gt': '>', 'quot': '"', 'apos': '\'', 'nbsp': ' ' };

    // A tag (a letter after < or </) or a comment; "a < b" is text.
    var TAG = /<!--[\s\S]*?-->|<\/?[A-Za-z][^>]*>/g;

    // These character references only (tests/README.md, plain text).
    function decodeEntities(text) {
        return text.replace(/&(#[0-9]{1,7}|#[xX][0-9a-fA-F]{1,6}|[a-zA-Z]+);/g, function(all, name) {
            if (name.charAt(0) === '#') {
                var code = (name.charAt(1) === 'x' || name.charAt(1) === 'X') ? parseInt(name.slice(2), 16) : parseInt(name.slice(1), 10);
                return (code > 0 && code <= 0x10FFFF && !(code >= 0xD800 && code <= 0xDFFF)) ? String.fromCodePoint(code) : all;
            }
            var lower = name.toLowerCase();
            return Object.prototype.hasOwnProperty.call(ENTITIES, lower) ? ENTITIES[lower] : all;
        });
    }

    /**
     * I make plain text of HTML, also of HTML stored escaped (the text
     * attributes of text and html items): character references decoded, tags
     * and comments removed, decoded again, white space collapsed.
     *
     * @method plainText
     * @param {String} html
     * @return {String}
     */
    function plainText(html) {
        if (typeof html !== 'string') { return ''; }
        var text = decodeEntities(decodeEntities(html).replace(TAG, ' '));
        return text.replace(/\s+/g, ' ').trim();
    }


    /* ------------------------------------------------------------------ */
    /*  WebVTT                                                            */
    /* ------------------------------------------------------------------ */

    var TIMESTAMP = '((?:[0-9]+:)?[0-9]{1,2}:[0-9]{2}[.,][0-9]{1,3})',
        TIMING    = new RegExp('^\\s*' + TIMESTAMP + '\\s+-->\\s+' + TIMESTAMP);

    function vttSeconds(stamp) {
        var parts = stamp.replace(',', '.').split(':'),
            total = 0;
        parts.forEach(function(part) { total = total * 60 + parseFloat(part); });
        return seconds(total);
    }

    /**
     * I read the cues of a WebVTT text: { start, end, text } in seconds, text
     * as plain text on one line. Blocks are separated by empty lines; a block
     * whose first or second line is a timing line is a cue, everything else
     * (header, NOTE, STYLE, REGION) is skipped, and so is a cue without text.
     *
     * @method cues
     * @param {String} vtt
     * @return {Array}
     */
    function cues(vtt) {

        if (typeof vtt !== 'string') { return []; }

        var lines  = vtt.replace(/^﻿/, '').replace(/\r\n?/g, '\n').split('\n'),
            blocks = [],
            block  = [];

        lines.forEach(function(line) {
            if (line.trim() === '') {
                if (block.length) { blocks.push(block); block = []; }
            } else {
                block.push(line);
            }
        });
        if (block.length) { blocks.push(block); }

        var result = [];

        blocks.forEach(function(lines) {
            var at = TIMING.test(lines[0]) ? 0 : ((lines.length > 1 && TIMING.test(lines[1])) ? 1 : -1);
            if (at < 0) { return; }
            var timing = TIMING.exec(lines[at]),
                text   = plainText(lines.slice(at + 1).join('\n'));
            if (text === '') { return; }
            result.push({ start: vttSeconds(timing[1]), end: vttSeconds(timing[2]), text: text });
        });

        return result;

    }


    /* ------------------------------------------------------------------ */
    /*  Items                                                             */
    /* ------------------------------------------------------------------ */

    function bodyOf(item) {
        var body = Array.isArray(item.body) ? item.body[0] : item.body;
        return isObject(body) ? body : {};
    }

    function attributesOf(body) {
        return isObject(body['frametrail:attributes']) ? body['frametrail:attributes'] : {};
    }

    function selectorValue(item) {
        return (isObject(item.target) && isObject(item.target.selector)) ? item.target.selector.value : undefined;
    }

    function nonEmpty(value) {
        return typeof value === 'string' && value.trim() !== '';
    }

    // A number as messages show it: seconds as stored.
    function n(value) {
        return String(value);
    }

    // Where the video's time lies, as messages show it.
    function rangeText(info) {
        return (info.end !== null) ? n(info.start) + ' s to ' + n(info.end) + ' s' : 'from ' + n(info.start) + ' s';
    }

    // Who an item is: kind and ref, and for annotations their creator.
    function about(kind, item) {
        var where = { kind: kind, ref: (kind === 'chapters') ? item.start : item.created };
        if (kind === 'annotations' && isObject(item.creator) && item.creator.id !== undefined) {
            where.creator = String(item.creator.id);
        }
        return where;
    }

    function firstClip(hypervideo) {
        return (Array.isArray(hypervideo.clips) && isObject(hypervideo.clips[0])) ? hypervideo.clips[0] : {};
    }


    /* ------------------------------------------------------------------ */
    /*  The rules                                                         */
    /* ------------------------------------------------------------------ */

    // Each rule: (data, report) where report(where, message) adds a finding.
    var CHECKS = {

        'item-outside-video': function(data, report) {

            var info = data.info;

            data.spans.forEach(function(entry) {
                var span = entry.span;
                if ((info.end !== null && span.start >= info.end) || (span.end <= info.start && span.start < info.start)) {
                    report(entry.where, 'Runs from ' + n(span.start) + ' s to ' + n(span.end) + ' s, outside the video (' + rangeText(info) + '); the player never shows it.');
                }
            });

            data.points.forEach(function(entry) {
                if ((info.end !== null && entry.start >= info.end) || entry.start < info.start) {
                    report(entry.where, 'Is at ' + n(entry.start) + ' s, outside the video (' + rangeText(info) + '); the player never reaches it.');
                }
            });

        },

        'item-partly-outside': function(data, report) {

            var info = data.info;

            data.spans.forEach(function(entry) {
                var span    = entry.span,
                    outside = (info.end !== null && span.start >= info.end) || (span.end <= info.start && span.start < info.start);
                if (!outside && ((info.end !== null && span.end > info.end) || span.start < info.start)) {
                    report(entry.where, 'Runs from ' + n(span.start) + ' s to ' + n(span.end) + ' s, partly outside the video (' + rangeText(info) + '); that part is never shown.');
                }
            });

        },

        'overlay-overlap': function(data, report) {

            var placed = data.overlays.filter(function(overlay) {
                var area = box(selectorValue(overlay));
                return OVERLAPPING_TYPES.indexOf(bodyOf(overlay)['frametrail:type']) < 0 && area && area.width > 0 && area.height > 0;
            }).map(function(overlay) {
                return { overlay: overlay, area: box(selectorValue(overlay)), span: timeSpan(selectorValue(overlay)) };
            });

            placed.forEach(function(b, j) {
                for (var i = 0; i < j; i++) {
                    var a = placed[i];
                    if (a.span.start < b.span.end && b.span.start < a.span.end
                            && a.area.left < b.area.left + b.area.width && b.area.left < a.area.left + a.area.width
                            && a.area.top < b.area.top + b.area.height && b.area.top < a.area.top + a.area.height) {
                        var where = about('overlays', b.overlay);
                        where.related = { kind: 'overlays', ref: a.overlay.created };
                        report(where, 'Covers the same area as overlay ' + a.overlay.created + ' from '
                            + n(Math.max(a.span.start, b.span.start)) + ' s to ' + n(Math.min(a.span.end, b.span.end)) + ' s.');
                    }
                }
            });

        },

        'unknown-resource': function(data, report) {

            if (!data.resources) { return; }

            var known = function(id) { return Object.prototype.hasOwnProperty.call(data.resources, String(id)); },
                named = function(id) { return id !== undefined && id !== null && id !== ''; };

            var clip = firstClip(data.hypervideo);
            if (named(clip.resourceId) && !known(clip.resourceId)) {
                report({ kind: 'hypervideo' }, 'Its video is resource ' + JSON.stringify(clip.resourceId) + ', which is not in the resources index'
                    + (nonEmpty(clip.src) ? '.' : '; without a src of its own the clip has no video.'));
            }

            data.items.forEach(function(entry) {
                var id = bodyOf(entry.item)['frametrail:resourceId'];
                if (named(id) && !known(id)) {
                    report(entry.where, 'Made from resource ' + JSON.stringify(id) + ', which is not in the resources index.');
                }
            });

        },

        'empty-required': function(data, report) {

            data.items.forEach(function(entry) {

                var body    = bodyOf(entry.item),
                    type    = body['frametrail:type'],
                    attrs   = attributesOf(body),
                    missing = [];

                if (entry.where.kind === 'codeSnippets') {
                    if (!nonEmpty(body.value)) { missing.push('no code'); }
                } else if (SOURCE_TYPES.indexOf(type) >= 0) {
                    if (!nonEmpty(body.source) && !nonEmpty(body.value)) { missing.push('no source'); }
                } else if (type === 'entity') {
                    if (!nonEmpty(body.source) && !nonEmpty(body.value) && !nonEmpty(entry.item['frametrail:uri'])) { missing.push('no source'); }
                } else if (type === 'location') {
                    if (!isFinite(parseFloat(attrs.lat)) || !isFinite(parseFloat(attrs.lon))) { missing.push('no position (lat, lon)'); }
                } else if (type === 'text') {
                    if (plainText(attrs.text) === '' && plainText(attrs.title) === '') { missing.push('no text'); }
                } else if (type === 'html') {
                    if (!nonEmpty(attrs.text)) { missing.push('no HTML'); }
                } else if (type === 'quiz') {
                    if (plainText(attrs.question) === '') { missing.push('no question'); }
                    if (attrs.questionType === undefined || attrs.questionType === 'multipleChoice' || attrs.questionType === 'multiSelect') {
                        var answers = Array.isArray(attrs.answers) ? attrs.answers : [];
                        if (!answers.length) {
                            missing.push('no answers');
                        } else if (answers.some(function(answer) { return !isObject(answer) || plainText(answer.text) === ''; })) {
                            missing.push('an answer without text');
                        }
                    }
                } else if (type === 'chart') {
                    if (!nonEmpty(attrs.data)) { missing.push('no data'); }
                } else if (type === 'hotspot') {
                    if (TARGETED_ACTIONS.indexOf(attrs.action) >= 0
                            && (attrs.actionTarget === undefined || attrs.actionTarget === null || (typeof attrs.actionTarget === 'string' && attrs.actionTarget.trim() === ''))) {
                        missing.push('no target for its action ' + attrs.action);
                    }
                }

                if (missing.length) {
                    report(entry.where, 'Is incomplete: ' + missing.join(', ') + '.');
                }

            });

        },

        'missing-license': function(data, report) {

            data.overlays.forEach(function(overlay) {
                var body       = bodyOf(overlay),
                    resourceId = body['frametrail:resourceId'],
                    backed     = (resourceId !== undefined && resourceId !== null && resourceId !== '')
                              || (MEDIA_TYPES.indexOf(body['frametrail:type']) >= 0 && nonEmpty(body.source));
                if (backed && !nonEmpty(body['frametrail:licenseType'])) {
                    report(about('overlays', overlay), 'Has no license type (body frametrail:licenseType) for the '
                        + ((resourceId !== undefined && resourceId !== null && resourceId !== '') ? 'resource it is made from.' : 'media it shows.'));
                }
            });

        },

        'chapter-order': function(data, report) {

            var chapters = (Array.isArray(data.hypervideo.chapters) ? data.hypervideo.chapters : []).filter(function(chapter) {
                return isObject(chapter) && typeof chapter.start === 'number';
            });

            chapters.forEach(function(chapter, i) {
                if (i === 0) { return; }
                var previous = chapters[i - 1].start;
                if (chapter.start === previous) {
                    report({ kind: 'chapters', ref: chapter.start }, 'Two chapters start at ' + n(chapter.start) + ' s; each start may be used once.');
                } else if (chapter.start < previous) {
                    report({ kind: 'chapters', ref: chapter.start }, 'The chapter at ' + n(chapter.start) + ' s is stored after the one at ' + n(previous) + ' s; chapters are kept in order of their start.');
                }
            });

        },

        'cue-outside-video': function(data, report) {

            var clip = firstClip(data.hypervideo);

            if (data.info.end === null || (typeof clip.out === 'number' && clip.out > 0)) { return; }

            data.subtitles.forEach(function(entry) {
                var late = cues(entry.vtt).filter(function(cue) { return cue.start >= data.info.end; });
                if (late.length) {
                    report({ kind: 'subtitles', ref: entry.lang }, ((late.length === 1) ? '1 cue starts' : late.length + ' cues start')
                        + ' at or after the end of the video (' + n(data.info.end) + ' s), the first at ' + n(late[0].start) + ' s.');
                }
            });

        }

    };


    /* ------------------------------------------------------------------ */
    /*  Running                                                           */
    /* ------------------------------------------------------------------ */

    function objects(value) {
        return Array.isArray(value) ? value.filter(isObject) : [];
    }

    // What the rules read, once.
    function collect(parts) {

        var given       = isObject(parts) ? parts : {},
            info        = isObject(given.info) ? given.info : {},
            overlays    = objects(given.overlays),
            annotations = objects(given.annotations),
            snippets    = objects(given.codeSnippets),
            chapters    = objects(given.chapters).filter(function(chapter) { return typeof chapter.start === 'number'; }),
            items       = [];

        overlays.forEach(function(item) { items.push({ item: item, where: about('overlays', item) }); });
        annotations.forEach(function(item) { items.push({ item: item, where: about('annotations', item) }); });
        snippets.forEach(function(item) { items.push({ item: item, where: about('codeSnippets', item) }); });

        return {
            hypervideo: isObject(given.hypervideo) ? given.hypervideo : {},
            info:       { start: (typeof info.start === 'number') ? info.start : 0, end: (typeof info.end === 'number') ? info.end : null },
            overlays:   overlays,
            items:      items,
            spans:      items.filter(function(entry) { return entry.where.kind !== 'codeSnippets'; }).map(function(entry) {
                            return { where: entry.where, span: timeSpan(selectorValue(entry.item)) };
                        }),
            points:     snippets.map(function(item) { return { where: about('codeSnippets', item), start: timeSpan(selectorValue(item)).start }; })
                            .concat(chapters.map(function(chapter) { return { where: about('chapters', chapter), start: chapter.start }; })),
            subtitles:  objects(given.subtitles).map(function(entry) {
                            return { lang: String(entry.lang), vtt: (typeof entry.vtt === 'string') ? entry.vtt : null };
                        }),
            resources:  isObject(given.resources) ? given.resources : null
        };

    }

    /**
     * I run the rules on one hypervideo and return what they find:
     *
     *     { errors, warnings, findings: [{ rule, severity, kind, ref, creator?, related?, message }] }
     *
     * parts is what the rules read (partsOf() makes it from a bundle):
     *
     * * hypervideo   – hypervideo.json; chapter-order reads its chapters in
     *   stored order, unknown-resource and cue-outside-video its first clip
     * * info         – { start, end }: where the video's time begins (the
     *   clip's in point) and ends, in seconds; end null when not known
     * * overlays, annotations, codeSnippets – the items as stored, the
     *   annotations of every user
     * * chapters     – { start, title }, sorted by start
     * * subtitles    – [{ lang, vtt }], vtt null when the text is not at hand
     * * resources    – the resource library by id, null when it is not known
     *   (then unknown-resource finds nothing)
     *
     * options.rules: the ids of the rules to run (default: all).
     *
     * @method run
     * @param {Object} parts
     * @param {Object} [options]
     * @return {Object}
     */
    function run(parts, options) {

        var only = (options && Array.isArray(options.rules)) ? options.rules : null;

        (only || []).forEach(function(id) {
            if (!CHECKS[id]) { throw new Error('Unknown lint rule: ' + id); }
        });

        var data     = collect(parts),
            findings = [];

        RULES.forEach(function(rule) {

            if (only && only.indexOf(rule.id) < 0) { return; }

            CHECKS[rule.id](data, function(where, message) {
                var finding = { rule: rule.id, severity: rule.severity, kind: where.kind };
                if (where.ref !== undefined)     { finding.ref = where.ref; }
                if (where.creator !== undefined) { finding.creator = where.creator; }
                if (where.related !== undefined) { finding.related = where.related; }
                finding.message = message;
                findings.push(finding);
            });

        });

        return {
            errors:   findings.filter(function(finding) { return finding.severity === 'error'; }).length,
            warnings: findings.filter(function(finding) { return finding.severity === 'warning'; }).length,
            findings: findings
        };

    }

    // The video every item targets, as the editor finds it (Database.sourcePathOf).
    function sourcePathOf(clips, resources) {

        var clip = (Array.isArray(clips) && isObject(clips[0])) ? clips[0] : {};

        if (clip.src && clip.src.length > 3) { return clip.src; }
        if (!clip.resourceId) { return ''; }

        var resource = (resources || {})[clip.resourceId];
        return resource ? resource.src : undefined;

    }

    /**
     * I make the parts run() reads from a hypervideo bundle or a project
     * bundle (schemas/hypervideo-bundle.schema.json, project-bundle.schema.json),
     * read as the editor reads it: hypervideo.json and every annotation file
     * through FrameTrailSerializer, so items are as it would write them
     * (created in ISO form, unique per collection; annotations per creator).
     * The bundle must follow its schema.
     *
     * options:
     * * hypervideoId – in a project bundle, the hypervideo (default: the
     *   first)
     * * duration     – the length of the video in seconds as the media tells
     *   it, for a clip that does not say (its duration 0, no out point);
     *   without it the end of such a video is unknown
     *
     * @method partsOf
     * @param {Object} bundle
     * @param {Object} [options]
     * @return {Object} parts
     */
    function partsOf(bundle, options) {

        options = options || {};

        var project = isObject(bundle) && bundle.bundle === 'project',
            id      = project
                ? String((options.hypervideoId != null) ? options.hypervideoId : Object.keys(isObject(bundle.hypervideos) ? bundle.hypervideos : {})[0])
                : null,
            single  = project ? (isObject(bundle.hypervideos) ? bundle.hypervideos[id] : undefined) : bundle;

        if (!isObject(single) || !isObject(single.hypervideo)) {
            throw new Error(project ? 'No hypervideo ' + JSON.stringify(id) + ' in this bundle' : 'Not a hypervideo bundle');
        }

        var resources = project
                ? ((isObject(bundle.resources) && isObject(bundle.resources.resources)) ? bundle.resources.resources : null)
                : (isObject(single.resources) ? single.resources : null),
            model     = Serializer.parseHypervideo(single.hypervideo),
            context   = { sourcePath: sourcePathOf(model.clips, resources) },
            files     = (isObject(single.annotations) && isObject(single.annotations.files)) ? single.annotations.files : {},
            texts     = isObject(single.subtitles) ? single.subtitles : {},
            span      = clipSpan(model.clips, options.duration),
            annotations = [];

        Object.keys(files).forEach(function(fileId) {
            Array.prototype.push.apply(annotations, Serializer.parseAnnotationFile(files[fileId]));
        });
        Serializer.dedupeCreated(annotations, function(annotation) { return annotation.creatorId; });

        return {
            hypervideo:   Serializer.serializeHypervideo(model, context),
            info:         { start: span.start, end: (span.duration !== null) ? seconds(span.start + span.duration) : null },
            overlays:     model.overlays.map(function(overlay) { return Serializer.serializeOverlay(overlay, context); }),
            annotations:  annotations.map(function(annotation) { return Serializer.serializeAnnotation(annotation, context); }),
            codeSnippets: model.codeSnippets.map(function(snippet) { return Serializer.serializeCodeSnippet(snippet, context); }),
            chapters:     objects(model.chapters).filter(function(chapter) { return typeof chapter.start === 'number'; })
                              .sort(function(a, b) { return a.start - b.start; }),
            subtitles:    objects(model.subtitles).map(function(entry) {
                              return { lang: String(entry.srclang), vtt: (typeof texts[entry.srclang] === 'string') ? texts[entry.srclang] : null };
                          }),
            resources:    resources
        };

    }


    /* ------------------------------------------------------------------ */
    /*  A whole folder                                                    */
    /* ------------------------------------------------------------------ */

    // The folder of a hypervideos index entry ("./9" → "hypervideos/9/"), or null when it is none inside the tree.
    function folderOf(rel) {
        var dir = String(rel).replace(/^\.\//, '').replace(/\/+$/, '');
        if (!dir || dir.charAt(0) === '/' || dir.split('/').indexOf('..') >= 0) { return null; }
        return 'hypervideos/' + dir + '/';
    }

    function has(files, path) {
        return Object.prototype.hasOwnProperty.call(files, path);
    }

    /**
     * I check that the files of a _data folder agree with each other, which
     * no schema of a single file can say. files is the serializer's folder
     * format: paths relative to _data/ → contents (parsed JSON or its text,
     * text for .vtt files). I report, sorted by path:
     *
     * * a .json file given as text that is not JSON;
     * * hypervideos/_index.json: an entry whose hypervideo.json is missing,
     *   and a hypervideo.json no entry lists;
     * * a hypervideo without annotations/_index.json;
     * * an annotation file without its entry in that index, and an entry
     *   whose file is missing;
     * * a subtitles entry of hypervideo.json without its .vtt file, and a
     *   .vtt file no entry lists.
     *
     * Each problem is { path, message }. Files with invalid JSON are left
     * out of the other checks.
     *
     * @method checkFolder
     * @param {Object} files
     * @return {Array}
     */
    function checkFolder(files) {

        var problems = [],
            json     = {};

        function report(path, message) {
            problems.push({ path: path, message: message });
        }

        if (!isObject(files)) { throw new Error('A folder is a map of paths to contents'); }

        Object.keys(files).forEach(function(path) {
            if (!/\.json$/.test(path)) { return; }
            var content = files[path];
            if (typeof content !== 'string') {
                json[path] = content;
                return;
            }
            try {
                json[path] = JSON.parse(content);
            } catch (e) {
                report(path, 'Is not valid JSON: ' + e.message);
            }
        });

        var index   = json['hypervideos/_index.json'],
            entries = (isObject(index) && isObject(index.hypervideos)) ? index.hypervideos : {},
            listed  = {};

        Object.keys(entries).forEach(function(id) {
            var dir = folderOf(entries[id]);
            if (!dir) {
                report('hypervideos/_index.json', 'Lists hypervideo ' + JSON.stringify(id) + ' in ' + JSON.stringify(entries[id]) + ', which is no folder inside hypervideos/.');
                return;
            }
            listed[dir] = true;
            if (!has(files, dir + 'hypervideo.json')) {
                report('hypervideos/_index.json', 'Lists hypervideo ' + JSON.stringify(id) + ' in ' + JSON.stringify(entries[id]) + ', but ' + dir + 'hypervideo.json is missing; FrameTrail cannot load it.');
            }
        });

        Object.keys(files).forEach(function(path) {

            var m = /^(hypervideos\/[^\/]+\/)hypervideo\.json$/.exec(path);
            if (!m) { return; }

            var dir = m[1];

            if (!listed[dir]) {
                report(path, 'Is not listed in hypervideos/_index.json; FrameTrail does not show this hypervideo.');
            }

            // Annotations: the index and the files.
            var indexPath = dir + 'annotations/_index.json',
                inFolder  = {};

            Object.keys(files).forEach(function(other) {
                var name = (other.indexOf(dir + 'annotations/') === 0) ? other.slice((dir + 'annotations/').length) : null;
                if (name && name !== '_index.json' && /^[^\/]+\.json$/.test(name)) {
                    inFolder[name.replace(/\.json$/, '')] = other;
                }
            });

            if (!has(files, indexPath)) {
                report(indexPath, 'Is missing; on a server FrameTrail then loads no hypervideo at all.');
            } else if (has(json, indexPath)) {
                var annotationFiles = Serializer.parseAnnotationIndex(json[indexPath]).annotationfiles;
                Object.keys(inFolder).forEach(function(fileId) {
                    if (!has(annotationFiles, fileId)) {
                        report(inFolder[fileId], 'Has no entry in annotations/_index.json; FrameTrail does not load these annotations.');
                    }
                });
                Object.keys(annotationFiles).forEach(function(fileId) {
                    if (!has(inFolder, fileId)) {
                        report(indexPath, 'Lists the annotation file ' + JSON.stringify(fileId) + ', but ' + dir + 'annotations/' + fileId + '.json is missing; FrameTrail cannot load the hypervideo.');
                    }
                });
            }

            // Subtitles: the list in hypervideo.json and the files.
            if (!isObject(json[path])) { return; }

            var subtitles = Array.isArray(json[path].subtitles) ? json[path].subtitles : [],
                named     = {};

            subtitles.forEach(function(entry) {
                if (!isObject(entry) || !entry.srclang) { return; }
                var file = dir + 'subtitles/' + (entry.src || entry.srclang + '.vtt');
                named[file] = true;
                if (!has(files, file)) {
                    report(path, 'Lists subtitles ' + JSON.stringify(entry.srclang) + ', but ' + file + ' is missing.');
                }
            });

            Object.keys(files).forEach(function(other) {
                if (other.indexOf(dir + 'subtitles/') === 0 && /\.vtt$/.test(other) && !named[other]) {
                    report(other, 'Is not listed in the subtitles of ' + path + '; FrameTrail does not show it.');
                }
            });

        });

        return problems.map(function(problem, i) { return { problem: problem, i: i }; }).sort(function(a, b) {
            return (a.problem.path < b.problem.path) ? -1 : (a.problem.path > b.problem.path) ? 1 : a.i - b.i;
        }).map(function(entry) { return entry.problem; });

    }


    /* ------------------------------------------------------------------ */

    return {

        RULES:         RULES,
        RESULT_SCHEMA: RESULT_SCHEMA,

        run:           run,
        partsOf:       partsOf,
        checkFolder:   checkFolder,

        timeSpan:      timeSpan,
        box:           box,
        clipSpan:      clipSpan,
        plainText:     plainText,
        cues:          cues

    };

});
