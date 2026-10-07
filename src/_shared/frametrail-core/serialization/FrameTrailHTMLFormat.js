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
 * them. For editing a page in place I read it as the _data folder of a
 * project and write the folder back into its data block, leaving the rest of
 * the page alone (readProject / writeProject).
 *
 * I touch neither the DOM nor any FrameTrail instance, so I run in the
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

    // Every <script> element: its attributes, its text, and where its start tag
    // begins (start) and its text ends (textEnd). A start tag ends at the
    // first ">" outside quotes; the text ends at the first "</script".
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
                text:       html.slice(i + 1, end),
                start:      start,
                startTag:   html.slice(start, i + 1),
                textEnd:    end
            });

            from = end + 8;

        }

        return elements;

    }

    // The data blocks among them, in document order.
    function dataBlocks(html) {
        return scriptElements(String(html)).filter(function(element) {
            var type = (element.attributes.type || '').trim().toLowerCase();
            return type === 'application/ld+json' && Object.prototype.hasOwnProperty.call(element.attributes, 'data-frametrail');
        });
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

        return dataBlocks(html).map(function(element, index) {

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
    /*  Project files                                                     */
    /* ------------------------------------------------------------------ */

    /*
     * A page in this format can be edited in place: it is read as a _data
     * folder (the serializer's "folder" format, paths → contents), and saving
     * writes the folder back as a project bundle into the page's data block.
     * Nothing else of the page changes, so its library, title and anything
     * added to it by hand are kept.
     */

    // Settings of the page that are playback settings of the data: moved into
    // the bundle's config when a page is read as a project, and dropped from
    // the block when it is written back, so the data alone decides.
    var PAGE_SETTINGS = ['data-frametrail-config', 'data-frametrail-language'];

    /**
     * The text of the first data block, exactly as it is in the page, or
     * null when there is none.
     *
     * @method firstBlockText
     * @param {String} html
     * @return {String|null}
     */
    function firstBlockText(html) {
        var block = dataBlocks(html)[0];
        return block ? block.text : null;
    }

    /**
     * I replace the bundle in the first data block of a page and leave
     * everything else as it is.
     *
     * options:
     *
     * * dropSettings: remove data-frametrail-config and
     *   data-frametrail-language from the block;
     * * datapath: set data-frametrail-datapath (null removes it; undefined
     *   keeps it).
     *
     * @method replaceBlock
     * @param {String} html
     * @param {Object} bundle
     * @param {Object} [options]
     * @return {String}
     */
    function replaceBlock(html, bundle, options) {

        options = options || {};
        html    = String(html);

        if (!isObject(bundle) || (bundle.bundle !== 'hypervideo' && bundle.bundle !== 'project')) {
            throw new Error('Not a bundle');
        }

        var block = dataBlocks(html)[0];
        if (!block) { throw new Error('No FrameTrail data block found'); }

        var attributes = {}, changed = false;
        Object.keys(block.attributes).forEach(function(name) {
            if (options.dropSettings && PAGE_SETTINGS.indexOf(name) >= 0) { changed = true; return; }
            attributes[name] = block.attributes[name];
        });

        function set(name, value) {
            if (value === null) {
                if (Object.prototype.hasOwnProperty.call(attributes, name)) { delete attributes[name]; changed = true; }
            } else if (attributes[name] !== value) {
                attributes[name] = value;
                changed = true;
            }
        }

        set('data-frametrail', bundle.bundle);
        set('data-frametrail-format', String(FORMAT_VERSION));
        if (options.datapath !== undefined) { set('data-frametrail-datapath', options.datapath || null); }

        var startTag = changed
                     ? '<script' + Object.keys(attributes).map(function(name) {
                           return ' ' + name + '="' + escapeAttribute(attributes[name]) + '"';
                       }).join('') + '>'
                     : block.startTag;

        return html.slice(0, block.start) + startTag + '\n' + blockJSON(bundle) + '\n' + html.slice(block.textEnd);

    }

    /**
     * The folder of a project without hypervideos.
     *
     * @method emptyProject
     * @return {Object} folder map
     */
    function emptyProject() {
        return {
            'config.json':             {},
            'hypervideos/_index.json': { 'hypervideo-increment': 0, 'hypervideos': {} },
            'resources/_index.json':   { 'resources-increment': 0, 'resources': {} },
            'tagdefinitions.json':     {}
        };
    }

    /**
     * I read a page in this format as the _data folder of a project:
     *
     *     { files, kind, datapath, target, empty }
     *
     * files is the folder map. The first data block is the project; a page
     * with a hypervideo bundle becomes a project with that one hypervideo
     * (under its own id), and the page's playback settings
     * (data-frametrail-config, -language) become part of config.json. An empty
     * text is an empty project (empty: true). A page without a data block, or
     * whose block is no bundle, throws.
     *
     * @method readProject
     * @param {String} html
     * @return {Object}
     */
    function readProject(html) {

        html = String(html);

        if (!html.trim()) {
            return { files: emptyProject(), kind: null, datapath: null, target: null, empty: true };
        }

        var element = dataBlocks(html)[0];
        if (!element) { throw new Error('No FrameTrail data block found'); }

        var block  = parse(html)[0],
            bundle = block.bundle,
            files;

        if (isObject(bundle) && bundle.bundle === 'project') {

            files = Serializer.writeBundle(bundle, 'folder');

        } else if (isObject(bundle) && bundle.bundle === 'hypervideo') {

            var id = (bundle.id != null && bundle.id !== '') ? String(bundle.id) : '0';
            files = Serializer.writeBundle(bundle, 'folder', { id: id });
            files['hypervideos/_index.json'] = { 'hypervideo-increment': parseInt(id, 10) || 0, 'hypervideos': {} };
            files['hypervideos/_index.json'].hypervideos[id] = './' + id;

        } else {
            throw new Error('The data block holds no bundle');
        }

        var config   = Object.assign({}, isObject(files['config.json']) ? files['config.json'] : {}, block.config || {}),
            language = element.attributes['data-frametrail-language'];
        if (language) { config.defaultLanguage = language; }
        files['config.json'] = config;

        return { files: files, kind: block.kind, datapath: block.datapath, target: block.target, empty: false };

    }

    // The folder's path of a hypervideo index entry, or null when the entry
    // is no folder inside the tree.
    function hypervideoPath(rel) {
        var dir = String(rel).replace(/^\.\//, '').replace(/\/+$/, '');
        if (!dir || dir.charAt(0) === '/' || dir.split('/').indexOf('..') >= 0) { return null; }
        return 'hypervideos/' + dir + '/hypervideo.json';
    }

    /**
     * I make the project bundle of a folder. A hypervideo listed in the index
     * whose hypervideo.json is not (yet) there is left out, so the bundle of
     * a folder in the middle of adding one is the folder before it.
     *
     * @method projectBundle
     * @param {Object} files  folder map
     * @return {Object} bundle
     */
    function projectBundle(files) {

        var index   = files['hypervideos/_index.json'];
        if (typeof index === 'string') { index = JSON.parse(index); }
        if (!isObject(index)) { index = { 'hypervideo-increment': 0, 'hypervideos': {} }; }

        var entries = isObject(index.hypervideos) ? index.hypervideos : {},
            kept    = {};

        Object.keys(entries).forEach(function(id) {
            var file = hypervideoPath(entries[id]);
            if (file && Object.prototype.hasOwnProperty.call(files, file)) { kept[id] = entries[id]; }
        });

        var folder = Object.assign({}, files);
        folder['hypervideos/_index.json'] = Object.assign({}, index, { 'hypervideos': kept });

        return Serializer.readBundle(folder, 'folder', { bundle: 'project' });

    }

    /**
     * I write the folder of a project as a page: into the data block of
     * template (a page in this format: the rest of it stays as it is, the
     * page's playback settings are dropped from the block, see readProject),
     * or as a new page when there is no template.
     *
     * options: library and title for a new page (see write); datapath for the
     * block (undefined keeps the template's).
     *
     * @method writeProject
     * @param {Object} files  folder map
     * @param {String} [template]
     * @param {Object} [options]
     * @return {String}
     */
    function writeProject(files, template, options) {

        options = options || {};

        var bundle = projectBundle(files);

        if (template && dataBlocks(template).length) {
            return replaceBlock(template, bundle, { dropSettings: true, datapath: options.datapath });
        }

        return write(bundle, { library: options.library, datapath: options.datapath || null, title: options.title });

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
        blockJSON:        blockJSON,

        firstBlockText:   firstBlockText,
        replaceBlock:     replaceBlock,
        emptyProject:     emptyProject,
        readProject:      readProject,
        projectBundle:    projectBundle,
        writeProject:     writeProject

    };

});
