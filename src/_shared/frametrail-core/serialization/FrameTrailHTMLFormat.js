/**
 * @module Shared
 */


/**
 * I am FrameTrailHTMLFormat: the portable HTML format of FrameTrail (see
 * docs/HTML-FORMAT.md). A hypervideo or a whole project is one HTML file that
 * plays wherever it is opened and is read back without running any of it:
 *
 *     <script type="application/ld+json" data-frametrail="hypervideo" data-frametrail-format="1">
 *     { …a hypervideo bundle or a project bundle… }
 *     </script>
 *     <script src="…/frametrail.min.js"></script>
 *     <script>FrameTrail.autoInit();</script>
 *
 * The data is JSON in a data block, never JavaScript. Every "<" in it is
 * written as <, so nothing in the content can end the block.
 *
 * I register the format "html" with FrameTrailSerializer (readBundle /
 * writeBundle), and I read the files FrameTrail exported before this format,
 * whose data is the JSON argument of FrameTrail.init(…), without evaluating
 * them. I touch neither the DOM nor any FrameTrail instance, so I run in the
 * browser as a plain script (window.FrameTrailHTMLFormat) and in Node under
 * require().
 *
 * @class FrameTrailHTMLFormat
 * @static
 */

(function(factory) {

    var Serializer = (typeof window !== 'undefined' && window.FrameTrailSerializer)
                  || (typeof require === 'function' ? require('./FrameTrailSerializer.js') : null),
        api        = factory(Serializer);

    if (typeof window !== 'undefined') {
        window.FrameTrailHTMLFormat = api;
    }
    if (typeof module === 'object' && module && module.exports) {
        module.exports = api;
    }

})(function(Serializer) {


    var FORMAT_VERSION = 1,
        CDN_BASE       = 'https://cdn.jsdelivr.net/npm/@frametrail/frametrail';


    function isObject(value) {
        return value !== null && typeof value === 'object' && !Array.isArray(value);
    }


    /* ------------------------------------------------------------------ */
    /*  Escaping                                                          */
    /* ------------------------------------------------------------------ */

    function escapeText(text) {
        return String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    }

    function escapeAttribute(text) {
        return escapeText(text).replace(/"/g, '&quot;');
    }

    var ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };

    function decodeEntities(text) {
        return text.replace(/&(#x[0-9a-f]+|#[0-9]+|[a-z]+);/gi, function(entity, name) {
            if (name.charAt(0) === '#') {
                var code = (name.charAt(1).toLowerCase() === 'x') ? parseInt(name.slice(2), 16) : parseInt(name.slice(1), 10);
                return (code > 0 && code <= 0x10FFFF) ? String.fromCodePoint(code) : entity;
            }
            var lower = name.toLowerCase();
            return Object.prototype.hasOwnProperty.call(ENTITIES, lower) ? ENTITIES[lower] : entity;
        });
    }

    /**
     * I write a value as the JSON of a data block: pretty-printed, with every
     * "<" escaped, so neither "</script" nor "<!--" can occur in it.
     *
     * @method blockJSON
     * @param {*} value
     * @return {String}
     */
    function blockJSON(value) {
        return JSON.stringify(value, null, 4).replace(/</g, '\\u003c');
    }

    // Inline library code. "</script" becomes "<\/script" and "<!--" becomes
    // "<\x21--": both mean the same in every JavaScript context they can occur
    // in (a string, a template, a regular expression, also with the u flag, a
    // comment), and neither can end the element or start an HTML comment in
    // it. The pattern is built from pieces so that this file, which is part of
    // the library, does not contain what it escapes.
    var COMMENT_OPEN = new RegExp('<' + '!--', 'g');

    function inlineScript(js) {
        return String(js).replace(/<\/(script)/gi, '<\\/$1').replace(COMMENT_OPEN, '<\\x21--');
    }

    function inlineStyle(css) {
        return String(css).replace(/<\/(style)/gi, '<\\/$1');
    }


    /* ------------------------------------------------------------------ */
    /*  Reading                                                           */
    /* ------------------------------------------------------------------ */

    // The attributes of a start tag, names lowercased, values decoded.
    function parseAttributes(source) {
        var attributes = {},
            pattern    = /([^\s"'>\/=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g,
            match;
        while ((match = pattern.exec(source))) {
            var name  = match[1].toLowerCase(),
                value = (match[2] !== undefined) ? match[2] : (match[3] !== undefined) ? match[3] : (match[4] !== undefined) ? match[4] : '';
            if (!Object.prototype.hasOwnProperty.call(attributes, name)) {
                attributes[name] = decodeEntities(value);
            }
        }
        return attributes;
    }

    // Every <script> element: its attributes and its text. A start tag ends at
    // the first ">" outside quotes; the text ends at the first "</script".
    function scriptElements(html) {

        var elements = [],
            lower    = html.toLowerCase(),
            from     = 0;

        while (true) {

            var start = lower.indexOf('<script', from);
            if (start < 0) { break; }

            var next = lower.charAt(start + 7);
            if (next && !/[\s>\/]/.test(next)) { from = start + 7; continue; }

            var i = start + 7, quote = null;
            for (; i < html.length; i++) {
                var c = html.charAt(i);
                if (quote) { if (c === quote) { quote = null; } }
                else if (c === '"' || c === "'") { quote = c; }
                else if (c === '>') { break; }
            }
            if (i >= html.length) { break; }

            var end = lower.indexOf('</script', i + 1);
            if (end < 0) { end = html.length; }

            elements.push({
                attributes: parseAttributes(html.slice(start + 7, i)),
                text:       html.slice(i + 1, end)
            });

            from = end + 8;

        }

        return elements;

    }

    /**
     * I read the data blocks of a page in this format, in document order.
     *
     *     [{ kind, format, datapath, config, target, bundle }]
     *
     * kind is "hypervideo" or "project"; datapath, config and target are the
     * page's settings for playing it (null when not given). A block whose JSON
     * is invalid, or whose format is newer than mine, throws.
     *
     * @method parse
     * @param {String} html
     * @return {Array}
     */
    function parse(html) {

        return scriptElements(String(html)).filter(function(element) {
            var type = (element.attributes.type || '').trim().toLowerCase();
            return type === 'application/ld+json' && Object.prototype.hasOwnProperty.call(element.attributes, 'data-frametrail');
        }).map(function(element, index) {

            var attributes = element.attributes,
                format     = attributes['data-frametrail-format'] ? parseInt(attributes['data-frametrail-format'], 10) : FORMAT_VERSION,
                bundle, config = null;

            if (!(format >= 1)) {
                throw new Error('Data block ' + (index + 1) + ': invalid data-frametrail-format "' + attributes['data-frametrail-format'] + '"');
            }
            if (format > FORMAT_VERSION) {
                throw new Error('Data block ' + (index + 1) + ' is in format ' + format + '; this version of FrameTrail reads format ' + FORMAT_VERSION);
            }

            try {
                bundle = JSON.parse(element.text);
            } catch (e) {
                throw new Error('Data block ' + (index + 1) + ' is not valid JSON: ' + e.message);
            }

            if (attributes['data-frametrail-config']) {
                try {
                    config = JSON.parse(attributes['data-frametrail-config']);
                } catch (e) {
                    throw new Error('Data block ' + (index + 1) + ': data-frametrail-config is not valid JSON');
                }
            }

            return {
                kind:     attributes['data-frametrail'] || (isObject(bundle) ? bundle.bundle : null) || null,
                format:   format,
                datapath: attributes['data-frametrail-datapath'] || null,
                config:   isObject(config) ? config : null,
                target:   attributes['data-frametrail-target'] || null,
                bundle:   bundle
            };

        });

    }


    /* ------------------------------------------------------------------ */
    /*  Writing                                                           */
    /* ------------------------------------------------------------------ */

    /**
     * The files of a FrameTrail release on jsDelivr, pinned to a version when
     * one is given.
     *
     * @method cdnLibrary
     * @param {String} [version]
     * @return {Object} { cssURL, jsURL }
     */
    function cdnLibrary(version) {
        var base = CDN_BASE + (version ? '@' + version : '') + '/';
        return { cssURL: base + 'frametrail.min.css', jsURL: base + 'frametrail.min.js' };
    }

    function defaultTitle(bundle) {
        if (bundle.bundle === 'hypervideo' && isObject(bundle.hypervideo) && isObject(bundle.hypervideo.meta) && bundle.hypervideo.meta.name) {
            return String(bundle.hypervideo.meta.name);
        }
        if (bundle.bundle === 'project' && isObject(bundle.config) && bundle.config.overviewTitle) {
            return String(bundle.config.overviewTitle);
        }
        return 'FrameTrail';
    }

    /**
     * I write a bundle as a page in this format.
     *
     * options:
     *
     * * library: the FrameTrail library, as { cssURL, jsURL } (loaded from
     *   there) or { css, js } (its text, embedded); default: the latest
     *   release on jsDelivr;
     * * datapath: what relative media paths resolve against (the _data/ folder
     *   they are relative to);
     * * config: playback settings for the page (data-frametrail-config);
     * * target: where to mount (data-frametrail-target; default: the body);
     * * title, lang.
     *
     * @method write
     * @param {Object} bundle
     * @param {Object} [options]
     * @return {String}
     */
    function write(bundle, options) {

        options = options || {};

        if (!isObject(bundle) || (bundle.bundle !== 'hypervideo' && bundle.bundle !== 'project')) {
            throw new Error('Not a bundle');
        }

        var library = options.library || cdnLibrary(),
            title   = (options.title != null) ? String(options.title) : defaultTitle(bundle),
            lang    = options.lang || (isObject(options.config) && options.config.defaultLanguage) || (isObject(bundle.config) && bundle.config.defaultLanguage) || null,
            block   = '<script type="application/ld+json" data-frametrail="' + bundle.bundle + '" data-frametrail-format="' + FORMAT_VERSION + '"';

        if (options.datapath) { block += ' data-frametrail-datapath="' + escapeAttribute(options.datapath) + '"'; }
        if (isObject(options.config) && Object.keys(options.config).length) {
            block += ' data-frametrail-config="' + escapeAttribute(JSON.stringify(options.config)) + '"';
        }
        if (options.target) { block += ' data-frametrail-target="' + escapeAttribute(options.target) + '"'; }
        block += '>\n' + blockJSON(bundle) + '\n</script>';

        var styles = (typeof library.css === 'string')
                   ? '<style data-frametrail-library>\n' + inlineStyle(library.css) + '\n</style>'
                   : '<link rel="stylesheet" href="' + escapeAttribute(library.cssURL) + '">';

        var script = (typeof library.js === 'string')
                   ? '<script data-frametrail-library>\n' + inlineScript(library.js) + '\n</script>'
                   : '<script src="' + escapeAttribute(library.jsURL) + '"></script>';

        return '<!DOCTYPE html>\n'
             + '<html' + (lang ? ' lang="' + escapeAttribute(lang) + '"' : '') + '>\n'
             + '<head>\n'
             + '<meta charset="UTF-8">\n'
             + '<meta name="viewport" content="width=device-width, initial-scale=1">\n'
             + '<meta name="generator" content="FrameTrail">\n'
             + '<title>' + escapeText(title) + '</title>\n'
             + styles + '\n'
             + '</head>\n'
             + '<body>\n'
             + block + '\n'
             + script + '\n'
             + '<script>FrameTrail.autoInit();</script>\n'
             + '</body>\n'
             + '</html>\n';

    }


    /* ------------------------------------------------------------------ */
    /*  Earlier exports                                                   */
    /* ------------------------------------------------------------------ */

    // The JSON object that starts at text[from] ("{"), up to its closing brace.
    function jsonObjectAt(text, from) {
        var depth = 0, inString = false;
        for (var i = from; i < text.length; i++) {
            var c = text.charAt(i);
            if (inString) {
                if (c === '\\') { i++; }
                else if (c === '"') { inString = false; }
            } else if (c === '"') {
                inString = true;
            } else if (c === '{') {
                depth++;
            } else if (c === '}') {
                if (--depth === 0) { return text.slice(from, i + 1); }
            }
        }
        return null;
    }

    function fileIdOf(annotation) {
        var id = (isObject(annotation) && isObject(annotation.creator) && annotation.creator.id != null) ? String(annotation.creator.id) : '';
        return (!id || id === '_index' || /[\/\\]|^\.\.?$/.test(id)) ? 'imported' : id;
    }

    /**
     * I make a hypervideo bundle from a hypervideo and a flat list of its
     * annotations — what FrameTrail exported before bundles. The annotations
     * go into one file per creator.
     *
     * @method hypervideoBundle
     * @param {Object} hypervideo  as in hypervideo.json
     * @param {Array}  [annotations]
     * @param {String} [id]
     * @return {Object} bundle
     */
    function hypervideoBundle(hypervideo, annotations, id) {

        var bundle = { "bundle": "hypervideo", "formatVersion": 1 };

        if (id != null) { bundle.id = String(id); }
        bundle.hypervideo = hypervideo;

        if (Array.isArray(annotations) && annotations.length) {
            var files = {};
            annotations.forEach(function(annotation) {
                var fileId = fileIdOf(annotation);
                (files[fileId] = files[fileId] || []).push(annotation);
            });
            bundle.annotations = { "files": files };
        }

        return bundle;

    }

    /**
     * I read a page FrameTrail exported before this format: the JSON argument
     * of its FrameTrail.init(…) call, found by scanning, never evaluated.
     * I return the first hypervideo it carries as a bundle, with the page's
     * dataPath and config, or null when the page is no such export.
     *
     *     { bundle, datapath, config }
     *
     * @method parseLegacy
     * @param {String} html
     * @return {Object|null}
     */
    function parseLegacy(html) {

        html = String(html);

        var call = /FrameTrail\s*\.\s*init\s*\(\s*\{/.exec(html);
        if (!call) { return null; }

        var json = jsonObjectAt(html, call.index + call[0].length - 1),
            options;

        if (!json) { return null; }

        try {
            options = JSON.parse(json);
        } catch (e) {
            return null;
        }

        var entry = (isObject(options) && Array.isArray(options.contents)) ? options.contents[0] : null;
        if (!isObject(entry) || !isObject(entry.hypervideo)) { return null; }

        return {
            bundle:   hypervideoBundle(entry.hypervideo, entry.annotations),
            datapath: (typeof options.dataPath === 'string' && options.dataPath) ? options.dataPath : null,
            config:   isObject(options.config) ? options.config : null
        };

    }


    /* ------------------------------------------------------------------ */

    if (Serializer && Serializer.registerBundleFormat) {

        Serializer.registerBundleFormat('html', {

            // The bundle of the first data block; options.legacy also reads an
            // earlier export.
            read: function(html, options) {
                var blocks = parse(html);
                if (blocks.length) { return blocks[0].bundle; }
                var legacy = options.legacy ? parseLegacy(html) : null;
                if (legacy) { return legacy.bundle; }
                throw new Error('No FrameTrail data block found');
            },

            write: function(bundle, options) {
                return write(bundle, options);
            }

        });

    }

    return {

        FORMAT_VERSION:   FORMAT_VERSION,

        parse:            parse,
        write:            write,
        parseLegacy:      parseLegacy,
        hypervideoBundle: hypervideoBundle,
        cdnLibrary:       cdnLibrary,
        blockJSON:        blockJSON

    };

});
