/**
 * @module Shared
 */


/**
 * I am FrameTrailWebVTT: a WebVTT document as something to edit, and back to
 * text. The transcripts editor changes cues through me, so a file keeps what
 * it does not touch: the header, NOTE, STYLE and REGION blocks, cue ids and
 * cue settings, its line endings, and the timing line of every cue whose
 * times did not change.
 *
 *     var doc = FrameTrailWebVTT.parse(text);
 *     doc.blocks.forEach(function(block) { if (block.type === 'cue') { block.start; block.end; block.text; } });
 *     FrameTrailWebVTT.write(doc);                          // → text, cues in the order of their start
 *     FrameTrailWebVTT.fromSRT(srtText);                    // → WebVTT text
 *     FrameTrailWebVTT.speakerOf('<v Ada>Hello');           // → { speaker: 'Ada', classes: '', text: 'Hello' }
 *     FrameTrailWebVTT.toPlain('<i>Fish &amp; chips</i>');  // → 'Fish & chips'
 *
 * A cue's text is its payload as stored: cue markup (<i>, <v Name>, …) and
 * character references (&amp;, …). decodeText() turns the references into
 * characters and keeps the markup; encodeText() is its inverse, so text a
 * person types (a "<3", an "&") stays text.
 *
 * Times are seconds. I touch neither the DOM nor any FrameTrail instance, so
 * I run in the browser as a plain script (window.FrameTrailWebVTT) and in
 * Node under require().
 *
 * @class FrameTrailWebVTT
 * @static
 */

(function(factory) {

    var api = factory();

    if (typeof window !== 'undefined') {
        window.FrameTrailWebVTT = api;
    }
    if (typeof module === 'object' && module && module.exports) {
        module.exports = api;
    }

})(function() {


    var TIMESTAMP = '((?:[0-9]+:)?[0-9]{1,2}:[0-9]{2}[.,][0-9]{1,3})',
        TIMING    = new RegExp('^\\s*' + TIMESTAMP + '[ \\t]+-->[ \\t]+' + TIMESTAMP + '(?:[ \\t]+(.*?))?\\s*$'),
        // The start of a cue tag (c, i, b, u, ruby, rt, v, lang, with classes
        // and an annotation) or of a timestamp tag.
        CUE_TAG   = /^<(?:\/?(?:c|i|b|u|ruby|rt|v|lang)(?:\.[^\s>]*)?(?:[ \t][^>]*)?|[0-9]+(?::[0-9]{2}){1,2}\.[0-9]{3})>/,
        ENTITIES  = { amp: '&', lt: '<', gt: '>', nbsp: '\u00A0', lrm: '\u200E', rlm: '\u200F' };


    /* ------------------------------------------------------------------ */
    /*  Times                                                             */
    /* ------------------------------------------------------------------ */

    /**
     * I read a time a person typed or a file holds: "12", "12.5", "1:02",
     * "1:02.5", "01:02:03.456" (a comma works as the dot too). Seconds, or
     * null when it is no time.
     *
     * @method parseTime
     * @param {String} text
     * @return {Number|null}
     */
    function parseTime(text) {

        var m = /^\s*(?:(?:([0-9]+):)?([0-9]+):)?([0-9]+(?:[.,][0-9]*)?)\s*$/.exec(String(text));

        if (!m) { return null; }

        var hours   = m[1] ? parseInt(m[1], 10) : 0,
            minutes = m[2] ? parseInt(m[2], 10) : 0,
            seconds = parseFloat(m[3].replace(',', '.'));

        if ((m[2] && seconds >= 60) || (m[1] && minutes >= 60)) { return null; }

        return Math.round((hours * 3600 + minutes * 60 + seconds) * 1000) / 1000;

    }

    function pad(number, length) {
        var text = String(number);
        while (text.length < length) { text = '0' + text; }
        return text;
    }

    /**
     * I write a time as a WebVTT timestamp: mm:ss.ttt, or hh:mm:ss.ttt from
     * one hour on or when hours is true.
     *
     * @method formatTime
     * @param {Number} seconds
     * @param {Boolean} [hours]
     * @return {String}
     */
    function formatTime(seconds, hours) {

        var ms = Math.max(0, Math.round((Number(seconds) || 0) * 1000)),
            h  = Math.floor(ms / 3600000),
            m  = Math.floor(ms / 60000) % 60,
            s  = Math.floor(ms / 1000) % 60;

        return ((hours || h > 0) ? pad(h, 2) + ':' : '') + pad(m, 2) + ':' + pad(s, 2) + '.' + pad(ms % 1000, 3);

    }


    /* ------------------------------------------------------------------ */
    /*  Documents                                                         */
    /* ------------------------------------------------------------------ */

    /**
     * I make an empty document: the header "WEBVTT" and no cues.
     *
     * @method create
     * @return {Object}
     */
    function create() {
        return { bom: false, eol: '\n', header: ['WEBVTT'], hours: true, blocks: [], end: '\n' };
    }

    /**
     * I read a WebVTT text into a document:
     *
     *     { bom, eol, header: [lines], hours, end, blocks: [
     *         { type: 'cue', id, start, end, settings, text, timing },
     *         { type: 'note' | 'style' | 'region' | 'other', lines: [lines] } ] }
     *
     * eol is the file's line ending, hours whether its first timestamp has
     * hours (new times are written so), end what follows the last block.
     * Blocks are separated by blank lines; a block whose first or second line
     * is a cue timing is a cue (the line before the timing its id), the first
     * block is the header. A cue keeps its timing line as stored (timing), and
     * write() uses it while the times and settings are unchanged.
     *
     * @method parse
     * @param {String} text
     * @return {Object}
     */
    function parse(text) {

        text = String(text === undefined || text === null ? '' : text);

        var doc = create();

        doc.bom = text.charCodeAt(0) === 0xFEFF;
        if (doc.bom) { text = text.slice(1); }

        doc.eol = (text.indexOf('\r\n') >= 0) ? '\r\n' : '\n';

        var body = text.replace(/\s+$/, '');
        doc.end  = text.slice(body.length).replace(/[ \t]/g, '');

        var groups = [],
            group  = [];

        body.replace(/\r\n?/g, '\n').split('\n').forEach(function(line) {
            if (line.trim() === '') {
                if (group.length) { groups.push(group); group = []; }
            } else {
                group.push(line);
            }
        });
        if (group.length) { groups.push(group); }

        var hoursKnown = false;

        doc.header = groups.length && /^WEBVTT/.test(groups[0][0]) ? groups.shift() : ['WEBVTT'];
        doc.blocks = groups.map(function(lines) {

            var at = TIMING.test(lines[0]) ? 0 : ((lines.length > 1 && TIMING.test(lines[1])) ? 1 : -1);

            if (at < 0) {
                var word = /^(NOTE|STYLE|REGION)(?:[ \t]|$)/.exec(lines[0]);
                return { type: word ? word[1].toLowerCase() : 'other', lines: lines };
            }

            var m = TIMING.exec(lines[at]);

            if (!hoursKnown) {
                doc.hours  = /^[0-9]+:[0-9]{1,2}:/.test(m[1]);
                hoursKnown = true;
            }

            var cue = {
                type:     'cue',
                id:       at === 1 ? lines[0] : '',
                start:    parseTime(m[1]),
                end:      parseTime(m[2]),
                settings: m[3] || '',
                text:     lines.slice(at + 1).join('\n')
            };

            cue.timing = { line: lines[at], start: cue.start, end: cue.end, settings: cue.settings };

            return cue;

        });

        return doc;

    }

    function timingLine(cue, hours) {

        var stored = cue.timing;

        if (stored && stored.start === cue.start && stored.end === cue.end && stored.settings === (cue.settings || '')) {
            return stored.line;
        }

        return formatTime(cue.start, hours) + ' --> ' + formatTime(cue.end, hours) + (cue.settings ? ' ' + cue.settings : '');

    }

    /**
     * I return the cues of a document in their order there.
     *
     * @method cuesOf
     * @param {Object} doc
     * @return {Array}
     */
    function cuesOf(doc) {
        return doc.blocks.filter(function(block) { return block.type === 'cue'; });
    }

    /**
     * I put the cues of a document in the order of their start (stable: cues
     * with the same start keep their order). A block between two cues goes
     * with the cue after it; the blocks before the first cue (STYLE and
     * REGION must be there) and after the last stay where they are.
     *
     * @method sort
     * @param {Object} doc
     */
    function sort(doc) {

        var first = -1,
            last  = -1;

        doc.blocks.forEach(function(block, i) {
            if (block.type === 'cue') {
                if (first < 0) { first = i; }
                last = i;
            }
        });

        if (first < 0) { return; }

        var groups  = [],
            pending = [];

        doc.blocks.slice(first, last + 1).forEach(function(block) {
            pending.push(block);
            if (block.type === 'cue') {
                groups.push({ cue: block, blocks: pending, index: groups.length });
                pending = [];
            }
        });

        groups.sort(function(a, b) { return (a.cue.start - b.cue.start) || (a.index - b.index); });

        doc.blocks = doc.blocks.slice(0, first)
            .concat([].concat.apply([], groups.map(function(group) { return group.blocks; })))
            .concat(doc.blocks.slice(last + 1));

    }

    /**
     * I write a document as WebVTT text, its cues in the order of their start
     * (sort()). A cue's text loses blank lines (they would end it) and "-->"
     * (which would make it a timing).
     *
     * @method write
     * @param {Object} doc
     * @return {String}
     */
    function write(doc) {

        sort(doc);

        var eol   = doc.eol || '\n',
            parts = [doc.header.join(eol)];

        doc.blocks.forEach(function(block) {

            if (block.type !== 'cue') {
                parts.push(block.lines.join(eol));
                return;
            }

            var lines = [];
            if (block.id) { lines.push(block.id); }
            lines.push(timingLine(block, doc.hours));

            String(block.text || '').replace(/\r\n?/g, '\n').split('\n').forEach(function(line) {
                if (line.trim() !== '') { lines.push(line.replace(/-->/g, '--&gt;')); }
            });

            parts.push(lines.join(eol));

        });

        return (doc.bom ? '\uFEFF' : '') + parts.join(eol + eol) + (doc.end === undefined ? eol : doc.end);

    }


    /* ------------------------------------------------------------------ */
    /*  Other formats                                                     */
    /* ------------------------------------------------------------------ */

    /**
     * I tell what a text is: 'vtt' (starts with WEBVTT), 'srt' (a SubRip cue
     * timing, with commas), or null.
     *
     * @method sniff
     * @param {String} text
     * @return {String|null}
     */
    function sniff(text) {

        text = String(text || '').replace(/^\uFEFF/, '');

        if (/^WEBVTT(?:[ \t\r\n]|$)/.test(text)) { return 'vtt'; }
        if (/^\s*[0-9]+:[0-9]{2}:[0-9]{2},[0-9]{1,3}[ \t]+-->[ \t]+[0-9]+:[0-9]{2}:[0-9]{2},[0-9]{1,3}/m.test(text)) { return 'srt'; }

        return null;

    }

    /**
     * I turn a SubRip (.srt) text into WebVTT: counters dropped, commas in
     * timings made dots, coordinates after the timing and SSA tags ({\an8})
     * dropped, <font> taken out (<i>, <b>, <u> stay).
     *
     * @method fromSRT
     * @param {String} text
     * @return {String}
     */
    function fromSRT(text) {

        var doc = create();

        doc.blocks = parse('WEBVTT\n\n' + String(text || '').replace(/^\uFEFF/, '')).blocks
            .filter(function(block) { return block.type === 'cue'; })
            .map(function(cue) {
                return {
                    type:     'cue',
                    id:       '',
                    start:    cue.start,
                    end:      cue.end,
                    settings: '',
                    text:     cue.text.replace(/\{\\[^}]*\}/g, '').replace(/<\/?font[^>]*>/gi, '')
                };
            });

        return write(doc);

    }


    /* ------------------------------------------------------------------ */
    /*  Cue text                                                          */
    /* ------------------------------------------------------------------ */

    /**
     * I turn the character references of a cue text into characters and keep
     * its markup.
     *
     * @method decodeText
     * @param {String} payload
     * @return {String}
     */
    function decodeText(payload) {

        return String(payload || '').replace(/&(amp|lt|gt|nbsp|lrm|rlm|#[0-9]+|#x[0-9a-fA-F]+);/g, function(all, name) {
            if (name.charAt(0) === '#') {
                var code = (name.charAt(1) === 'x') ? parseInt(name.slice(2), 16) : parseInt(name.slice(1), 10);
                try { return String.fromCodePoint(code); } catch (e) { return all; }
            }
            return ENTITIES[name];
        });

    }

    /**
     * I make a cue text of what a person typed: "&" and every "<" that does
     * not start cue markup become references, so the markup a text had stays
     * markup and anything else stays text.
     *
     * @method encodeText
     * @param {String} text
     * @return {String}
     */
    function encodeText(text) {

        text = String(text || '').replace(/&/g, '&amp;');

        var result = '';

        for (var i = 0; i < text.length; i++) {
            if (text.charAt(i) === '<') {
                var tag = CUE_TAG.exec(text.slice(i));
                if (tag) {
                    result += tag[0];
                    i += tag[0].length - 1;
                    continue;
                }
                result += '&lt;';
            } else {
                result += text.charAt(i);
            }
        }

        return result.replace(/-->/g, '--&gt;');

    }

    /**
     * I return a cue text as plain text: markup taken out, references made
     * characters.
     *
     * @method toPlain
     * @param {String} payload
     * @return {String}
     */
    function toPlain(payload) {
        return decodeText(String(payload || '').replace(/<[^>]*>/g, ''));
    }

    /**
     * I find who speaks a cue: a voice tag (<v Name> or <v.class Name>) at its
     * start that is the only one in it. { speaker, classes, text } with the
     * text after the tag (a closing </v> at the end taken off), or speaker ''
     * and the whole text when there is none.
     *
     * @method speakerOf
     * @param {String} payload
     * @return {Object}
     */
    function speakerOf(payload) {

        payload = String(payload || '');

        var m = /^<v((?:\.[^\s>]*)?)[ \t]+([^>]*)>/.exec(payload),
            rest;

        if (!m) { return { speaker: '', classes: '', text: payload }; }

        rest = payload.slice(m[0].length).replace(/<\/v>\s*$/, '');

        if (/<v[\s.>]/.test(rest)) { return { speaker: '', classes: '', text: payload }; }

        return { speaker: decodeText(m[2]).trim(), classes: m[1], text: rest };

    }

    /**
     * I put a speaker in front of a cue text, as a voice tag; none for an
     * empty speaker.
     *
     * @method withSpeaker
     * @param {String} speaker
     * @param {String} payload
     * @param {String} [classes] e.g. '.loud'
     * @return {String}
     */
    function withSpeaker(speaker, payload, classes) {

        speaker = String(speaker || '').replace(/[\r\n]+/g, ' ').trim();

        if (!speaker) { return String(payload || ''); }

        return '<v' + (classes || '') + ' ' + speaker.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;') + '>' + String(payload || '');

    }


    /* ------------------------------------------------------------------ */

    return {

        parse:       parse,
        write:       write,
        create:      create,
        sort:        sort,
        cuesOf:      cuesOf,

        parseTime:   parseTime,
        formatTime:  formatTime,

        sniff:       sniff,
        fromSRT:     fromSRT,

        decodeText:  decodeText,
        encodeText:  encodeText,
        toPlain:     toPlain,
        speakerOf:   speakerOf,
        withSpeaker: withSpeaker

    };

});
