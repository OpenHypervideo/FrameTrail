/**
 * @module Player
 */


/**
 * I am the TranscriptsEditor: the edit mode "transcripts". In the panel on the right I show the
 * transcripts of the open hypervideo — its subtitles, one WebVTT file per language — as a list of
 * cues with their times, and on the transcript timeline as blocks that can be moved and resized.
 * I let the user write, change, upload and delete them, and have them made by an extension that
 * provides a transcriber (slots.transcriber).
 *
 * Where transcripts appear is decided elsewhere: in Transcript views (the layout editor) and as
 * captions (the CC button in the player). The panel says so and links to the layout editor; only
 * whether captions are on from the start (config.captionsVisible) is set here.
 *
 * I edit the WebVTT text through FrameTrailWebVTT, so what I do not touch stays as it is stored.
 * Every change sets the language's whole text through HypervideoModel.setSubtitles() and registers
 * one undo step (category "subtitles"); the file is written with the next save.
 *
 * @class TranscriptsEditor
 * @static
 */


FrameTrail.defineModule('TranscriptsEditor', function(FrameTrail){


    var labels = FrameTrail.module('Localization').labels;

    var NEW_CUE_LENGTH = 2,     // seconds
        MIN_CUE_LENGTH = 0.1,   // seconds
        LANGUAGE_CODE  = /^[A-Za-z0-9_-]{1,32}$/,
        AREA_LABELS    = { areaTop: 'LayoutAreaTop', areaBottom: 'LayoutAreaBottom', areaLeft: 'LayoutAreaLeft', areaRight: 'LayoutAreaRight', areaCompanion: 'LayoutAreaCompanion', areaCircular: 'LayoutAreaCircular' },
        AREA_NAMES     = { areaTop: 'top', areaBottom: 'bottom', areaLeft: 'left', areaRight: 'right', areaCompanion: 'companion', areaCircular: 'circular' };

    var lang           = null,      // the language shown
        doc            = null,      // its FrameTrailWebVTT document
        cues           = [],        // its cues, in the order of the list
        editor         = null,      // the panel
        cueList        = null,      // the list of cues (it scrolls)
        message        = null,      // the panel's message line
        activeCue      = null,      // the cue at the playhead
        pointerInList  = false,
        ownWrite       = false,     // a write of mine is under way (its notification is not news)
        captionsBefore = null,      // hv_config_captionsVisible when the mode was entered
        showNewForm    = false,
        lastCaret      = null,      // { cue, pos }: where the caret was when a cue's text was left
        focusedField   = null,      // the field of the list last focused (it may be gone from the page)
        generation     = null,      // { controller, language, confirmed, progress }
        menu           = null,
        selectedCue    = null,      // the cue selected (timeline block or row)
        blocks         = [],        // the timeline's blocks: [{ cue, element }]
        gesture        = null,      // a block being moved or resized
        idPrefix       = 'transcripts' + Math.random().toString(36).slice(2, 8);

    var SNAP_PX       = 5,          // how near (px) an edge snaps to its neighbour's
        TOUCH_SECONDS = 0.0005;     // cues this near touch: their shared edge moves for both


    function VTT() {
        return window.FrameTrailWebVTT;
    }

    function el(html) {
        var wrapper = document.createElement('div');
        wrapper.innerHTML = html;
        return wrapper.firstElementChild;
    }

    function esc(text) {
        return String(text === undefined || text === null ? '' : text)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }

    function round(seconds) {
        return Math.round(seconds * 1000) / 1000;
    }

    function isActive() {
        return FrameTrail.getState('editMode') === 'transcripts';
    }

    function currentTime() {
        return round(FrameTrail.module('HypervideoController').currentTime || 0);
    }


    /* ------------------------------------------------------------------ */
    /*  Languages                                                         */
    /* ------------------------------------------------------------------ */

    /**
     * I list the languages of the open hypervideo's transcripts, in the order of its list.
     * @method languages
     * @return {Array}
     * @private
     */
    function languages() {
        var files = FrameTrail.module('Database').hypervideo.subtitles;
        return Array.isArray(files) ? files.map(function(file) { return file.srclang; }) : [];
    }

    function languageLabel(code) {
        var name = FrameTrail.module('Localization').languageName(code);
        return (name === code) ? code : name + ' (' + code + ')';
    }

    /**
     * I read the language a person typed or chose: "German (de)", "German", "de", "pt-BR". The code, or null.
     * @method resolveLanguage
     * @param {String} input
     * @return {String|null}
     * @private
     */
    function resolveLanguage(input) {

        var text         = String(input || '').trim(),
            Localization = FrameTrail.module('Localization'),
            inBrackets   = /\(([A-Za-z0-9_-]{1,32})\)$/.exec(text);

        if (!text) { return null; }
        if (inBrackets) { return inBrackets[1]; }

        var lower = text.toLowerCase(),
            named = Localization.LANGUAGE_CODES.filter(function(code) {
                return Localization.languageName(code).toLowerCase() === lower;
            })[0];

        if (named) { return named; }

        return /^[a-z]{2,3}(?:[-_][A-Za-z0-9]{2,8})*$/i.test(text) ? text : null;

    }

    function storedText(code) {
        var loaded = FrameTrail.module('Database').subtitles[code];
        return (loaded && typeof loaded.vtt === 'string') ? loaded.vtt : null;
    }

    function hasCues(text) {
        return text !== null && VTT().cuesOf(VTT().parse(text)).length > 0;
    }

    /**
     * I read the shown language's text into a document.
     * @method loadDoc
     * @private
     */
    function loadDoc() {

        var text = lang ? storedText(lang) : null;

        doc       = lang ? (text !== null ? VTT().parse(text) : VTT().create()) : null;
        cues        = doc ? VTT().cuesOf(doc) : [];
        activeCue   = null;
        lastCaret   = null;
        selectedCue = null;

        if (doc) {
            VTT().sort(doc);
            cues = VTT().cuesOf(doc);
        }

    }

    /**
     * I show a language: its cues here, its captions on the video.
     * @method chooseLanguage
     * @param {String} code
     * @private
     */
    function chooseLanguage(code) {
        lang        = code;
        showNewForm = false;
        loadDoc();
        showCaptionsOf(code);
        render();
    }

    /**
     * I put the captions of a language on the video, so what is edited is seen there.
     * @method showCaptionsOf
     * @param {String} code
     * @private
     */
    function showCaptionsOf(code) {

        var HypervideoModel = FrameTrail.module('HypervideoModel');

        if (code && HypervideoModel.selectedLang !== code && FrameTrail.module('Database').subtitles[code]) {
            HypervideoModel.selectedLang = code;
            FrameTrail.module('SubtitlesController').initController();
        }

        if (isActive()) {
            FrameTrail.changeState('hv_config_captionsVisible', true);
        }

    }


    /* ------------------------------------------------------------------ */
    /*  Writing                                                           */
    /* ------------------------------------------------------------------ */

    function applyText(code, text) {
        ownWrite = true;
        try {
            FrameTrail.module('HypervideoModel').setSubtitles(code, text);
        } finally {
            ownWrite = false;
        }
    }

    // position: where the language was in the list before the change, so undoing a deletion puts it back there.
    function subtitlesCommand(code, before, after, description, position) {
        return {
            category:    'subtitles',
            description: description,
            undo:        function() { FrameTrail.module('HypervideoModel').setSubtitles(code, before, position); },
            redo:        function() { FrameTrail.module('HypervideoModel').setSubtitles(code, after); }
        };
    }

    function registerUndo(code, before, after, description, position) {
        FrameTrail.module('UndoManager').register(subtitlesCommand(code, before, after, description, position));
    }

    function describe(actionKey) {
        return labels['SidebarTranscripts'] + ' ' + labels[actionKey];
    }

    /**
     * I write the document of the shown language as its subtitles, as one undo step. Nothing when its text did not change.
     * @method commit
     * @param {String} description
     * @return {Boolean} whether anything changed
     * @private
     */
    function commit(description) {

        if (!lang || !doc) { return false; }

        var before = storedText(lang),
            after  = VTT().write(doc);

        cues = VTT().cuesOf(doc);

        if (before === after) { return false; }

        applyText(lang, after);
        registerUndo(lang, before, after, description);

        return true;

    }

    /**
     * I set a language's whole text (a new transcript, an upload, a generated one) as one undo step.
     * @method setLanguageText
     * @param {String} code
     * @param {String|null} text
     * @param {String} description
     * @private
     */
    function setLanguageText(code, text, description) {

        var before   = storedText(code),
            position = languages().indexOf(code);

        if (before === text) { return; }

        applyText(code, text);
        registerUndo(code, before, text, description, position);

        if (isActive()) {
            if (text === null) {
                lang = null;
                doc  = null;
            } else {
                lang        = code;
                showNewForm = false;
                loadDoc();
                showCaptionsOf(code);
            }
            render();
        }

    }

    /**
     * I am told by HypervideoModel.setSubtitles() that the subtitles of a language changed. When I did not change them
     * (undo, redo, the edit API, a transcriber), I show the change.
     *
     * @method subtitlesChanged
     * @param {String} code
     */
    function subtitlesChanged(code) {

        if (ownWrite || !isActive()) { return; }

        var langs = languages();

        if (!lang || langs.indexOf(lang) === -1) {
            lang = (langs.indexOf(code) !== -1) ? code : (langs[0] || null);
            loadDoc();
            showCaptionsOf(lang);
        } else if (code === lang) {
            loadDoc();
        }

        render();

    }


    /* ------------------------------------------------------------------ */
    /*  Cues                                                              */
    /* ------------------------------------------------------------------ */

    function newCue(start, end, text) {
        return { type: 'cue', id: '', start: round(Math.max(0, start)), end: round(Math.max(0, end)), settings: '', text: text || '' };
    }

    /**
     * I put a new cue into the document: after the given cue, or after the last one.
     * @method insertCue
     * @private
     */
    function insertCue(cue, after) {

        var index = after ? doc.blocks.indexOf(after) + 1 : 0;

        if (!after) {
            doc.blocks.forEach(function(block, i) {
                if (block.type === 'cue') { index = i + 1; }
            });
            // Before any cue: after the blocks at the top (STYLE and REGION must stay before the cues).
            if (!cues.length) { index = doc.blocks.length; }
        }

        doc.blocks.splice(index, 0, cue);

    }

    // The speaker of the cue before a time, which a new cue there takes on.
    function speakerBefore(time) {
        var before = cues.filter(function(cue) { return cue.start < time; }).pop();
        return before ? VTT().speakerOf(before.text) : { speaker: '', classes: '' };
    }

    function endFor(start, next) {
        return (next && next.start - start >= MIN_CUE_LENGTH) ? Math.min(next.start, start + NEW_CUE_LENGTH) : start + NEW_CUE_LENGTH;
    }

    /**
     * I add an empty cue at the playhead (two seconds, or up to the next cue), or go to the cue that starts there.
     * @method addCueAtPlayhead
     * @private
     */
    function addCueAtPlayhead() {

        var time     = currentTime(),
            existing = cues.filter(function(cue) { return Math.abs(cue.start - time) < MIN_CUE_LENGTH; })[0];

        if (existing) {
            focusCue(existing, 'text');
            return;
        }

        var next  = cues.filter(function(cue) { return cue.start > time; })[0],
            voice = speakerBefore(time),
            cue   = newCue(time, endFor(time, next), VTT().withSpeaker(voice.speaker, '', voice.classes));

        insertCue(cue, cues.filter(function(c) { return c.start <= time; }).pop() || null);
        commit(describe('GenericAdd'));
        renderCues({ cue: cue, field: 'text' });

    }

    /**
     * Enter in a cue's text. While the playhead is past the cue's start and before the next cue, the cue ends at the
     * playhead and a new one starts there (typing along with the video); otherwise I go on to the next cue.
     *
     * @method enterInText
     * @param {HTMLTextAreaElement} field
     * @private
     */
    function enterInText(field) {

        var cue  = cueOfField(field);

        if (!cue) { return; }

        takeText(field, cue);

        var time = currentTime(),
            next = cues[cues.indexOf(cue) + 1];

        if (time > cue.start + MIN_CUE_LENGTH && (!next || time < next.start - MIN_CUE_LENGTH)) {

            var voice   = VTT().speakerOf(cue.text),
                created = newCue(time, endFor(time, next), VTT().withSpeaker(voice.speaker, '', voice.classes));

            cue.end = time;
            insertCue(created, cue);
            commit(describe('GenericAdd'));
            renderCues({ cue: created, field: 'text' });

        } else if (next) {

            commit(describe('GenericChange'));
            focusCue(next, 'text');

        } else {

            var voiceLast = VTT().speakerOf(cue.text),
                appended  = newCue(cue.end, cue.end + NEW_CUE_LENGTH, VTT().withSpeaker(voiceLast.speaker, '', voiceLast.classes));

            insertCue(appended, cue);
            commit(describe('GenericAdd'));
            renderCues({ cue: appended, field: 'text' });

        }

    }

    // The place nearest a share of a text where a word ends, outside markup.
    function boundaryNear(text, ratio) {

        var target = Math.round(text.length * ratio),
            best   = null,
            space  = /\s+/g,
            match;

        while ((match = space.exec(text))) {
            var at = match.index;
            if (text.lastIndexOf('<', at) > text.lastIndexOf('>', at)) { continue; }
            if (best === null || Math.abs(at - target) < Math.abs(best - target)) { best = at; }
        }

        return (best === null) ? text.length : best;

    }

    /**
     * I split a cue at the playhead; its text at the caret, when the cue's text was being written, else at the word nearest
     * to where the playhead is in the cue.
     *
     * @method splitCue
     * @param {Object} cue
     * @private
     */
    function splitCue(cue) {

        var time = currentTime();

        if (!(time > cue.start + MIN_CUE_LENGTH && time < cue.end - MIN_CUE_LENGTH)) {
            showMessage(labels['TranscriptsErrorSplit'], true);
            return;
        }

        var voice = VTT().speakerOf(cue.text),
            text  = VTT().decodeText(voice.text),
            at    = (lastCaret && lastCaret.cue === cue) ? lastCaret.pos : boundaryNear(text, (time - cue.start) / (cue.end - cue.start)),
            first = text.slice(0, at).replace(/\s+$/, ''),
            rest  = text.slice(at).replace(/^\s+/, ''),
            later = newCue(time, cue.end, VTT().withSpeaker(voice.speaker, VTT().encodeText(rest), voice.classes));

        later.settings = cue.settings;
        cue.end  = time;
        cue.text = VTT().withSpeaker(voice.speaker, VTT().encodeText(first), voice.classes);

        insertCue(later, cue);
        commit(describe('TranscriptsSplit'));
        renderCues({ cue: later, field: 'text' });

    }

    /**
     * I merge a cue with the next one: one text, up to the later end.
     * @method mergeCue
     * @param {Object} cue
     * @private
     */
    function mergeCue(cue) {

        var next = cues[cues.indexOf(cue) + 1];

        if (!next) { return; }

        var a = VTT().speakerOf(cue.text),
            b = VTT().speakerOf(next.text);

        cue.text = VTT().withSpeaker(a.speaker || b.speaker, [a.text, b.text].filter(function(text) { return text.trim() !== ''; }).join(' '), a.speaker ? a.classes : b.classes);
        cue.end  = Math.max(cue.end, next.end);

        doc.blocks.splice(doc.blocks.indexOf(next), 1);
        commit(describe('TranscriptsMerge'));
        renderCues({ cue: cue, field: 'text' });

    }

    function deleteCue(cue) {

        var index = cues.indexOf(cue);

        doc.blocks.splice(doc.blocks.indexOf(cue), 1);
        commit(describe('GenericDelete'));
        renderCues();

        var near = cues[Math.min(index, cues.length - 1)];
        if (near) { focusCue(near, null); }

    }

    /**
     * I move every cue by a number of seconds (negative: earlier). Starts before 0 become 0.
     * @method shiftAll
     * @param {Number} delta
     * @private
     */
    function shiftAll(delta) {

        cues.forEach(function(cue) {
            cue.start = round(Math.max(0, cue.start + delta));
            cue.end   = round(Math.max(0, cue.end + delta));
        });

        commit(describe('TranscriptsShiftTimings'));
        renderCues();

    }


    /* ------------------------------------------------------------------ */
    /*  Fields                                                            */
    /* ------------------------------------------------------------------ */

    function cueOfField(field) {
        var row = field.closest('.transcriptCue');
        return row ? cues[parseInt(row.getAttribute('data-index'), 10)] : null;
    }

    // The text of a cue's field into the cue (not yet written).
    function takeText(field, cue) {
        if (field.value === field.defaultValue) { return; }
        var voice = VTT().speakerOf(cue.text);
        cue.text = VTT().withSpeaker(voice.speaker, VTT().encodeText(field.value), voice.classes);
        field.defaultValue = field.value;
    }

    /**
     * I take what a field holds once it is changed: a time, a speaker, a text.
     * @method fieldChanged
     * @param {HTMLElement} field
     * @private
     */
    function fieldChanged(field) {

        var cue = cueOfField(field);

        if (!cue || field.value === field.defaultValue) { return; }

        if (field.classList.contains('transcriptCueText')) {

            takeText(field, cue);
            commit(describe('GenericChange'));

        } else if (field.classList.contains('transcriptCueSpeaker')) {

            var voice = VTT().speakerOf(cue.text);
            cue.text = VTT().withSpeaker(field.value, voice.text, voice.classes);
            field.defaultValue = field.value;
            commit(describe('GenericChange'));
            renderSpeakers();

        } else {

            var isStart = field.classList.contains('transcriptCueStart'),
                time    = VTT().parseTime(field.value),
                before  = cues.slice();

            if (time === null || (isStart ? time >= cue.end : time <= cue.start)) {
                showMessage(labels['TranscriptsErrorTime'], true);
                field.value = field.defaultValue;
                return;
            }

            hideMessage();

            if (isStart) { cue.start = time; } else { cue.end = time; }

            commit(describe('GenericChange'));

            var reordered = cues.some(function(c, i) { return c !== before[i]; });

            if (reordered) {
                // Later, so that the field the user went on to exists when it gets the focus back.
                window.setTimeout(function() { renderCues(focusInList()); }, 0);
            } else {
                field.value = field.defaultValue = VTT().formatTime(time);
                updateRowStates();
            }

        }

    }

    // Where the focus is in the list, to put it back after the list is drawn again.
    function focusInList() {

        var active = document.activeElement;

        if (!cueList || !active || !cueList.contains(active)) { return null; }

        var fields = ['text', 'speaker', 'start', 'end'],
            field  = fields.filter(function(name) { return active.classList.contains('transcriptCue' + name.charAt(0).toUpperCase() + name.slice(1)); })[0];

        return { cue: cueOfField(active), field: field || null, caret: active.selectionStart };

    }

    /**
     * I take what is being written in the list before anything else happens (leaving the mode, saving), also when the
     * next edit mode has replaced the panel already.
     * @method flush
     */
    function flush() {
        if (focusedField && focusedField.value !== undefined && focusedField.value !== focusedField.defaultValue) {
            fieldChanged(focusedField);
        }
    }

    // The cue being written, live in its caption (without writing anything).
    function showTyping(field) {

        var cue = cueOfField(field);

        if (!cue || FrameTrail.module('HypervideoModel').selectedLang !== lang) { return; }

        var voice    = VTT().speakerOf(cue.text),
            payload  = VTT().withSpeaker(voice.speaker, VTT().encodeText(field.value), voice.classes),
            captions = FrameTrail.module('HypervideoModel').subtitles || [];

        for (var i = 0; i < captions.length; i++) {
            if (Math.abs(captions[i].data.startTime - cue.start) < 0.0005 && Math.abs(captions[i].data.endTime - cue.end) < 0.0005) {
                captions[i].setText(payload);
                break;
            }
        }

    }

    function autosize(textarea) {
        if (window.CSS && CSS.supports && CSS.supports('field-sizing', 'content')) { return; }
        textarea.style.height = 'auto';
        textarea.style.height = textarea.scrollHeight + 'px';
    }

    function togglePlayback() {
        var HypervideoController = FrameTrail.module('HypervideoController');
        if (HypervideoController.isPlaying) {
            HypervideoController.pause();
        } else {
            HypervideoController.play();
        }
    }

    /**
     * I bind the list's events, once for all its rows.
     * @method bindList
     * @param {HTMLElement} list
     * @private
     */
    function bindList(list) {

        list.addEventListener('pointerenter', function() { pointerInList = true; });
        list.addEventListener('pointerleave', function() { pointerInList = false; });

        list.addEventListener('focusin', function(evt) {
            focusedField = evt.target;
            var focused = cueOfField(evt.target);
            if (focused && focused !== selectedCue) { selectCue(focused, true); }
            if (lastCaret && evt.target.classList.contains('transcriptCueText') && cueOfField(evt.target) !== lastCaret.cue) {
                lastCaret = null;
            }
        });

        list.addEventListener('focusout', function(evt) {
            if (evt.target.classList.contains('transcriptCueText')) {
                lastCaret = { cue: cueOfField(evt.target), pos: evt.target.selectionStart };
            }
        });

        list.addEventListener('input', function(evt) {
            if (evt.target.classList.contains('transcriptCueText')) {
                autosize(evt.target);
                showTyping(evt.target);
            }
        });

        list.addEventListener('change', function(evt) {
            fieldChanged(evt.target);
        });

        list.addEventListener('keydown', function(evt) {

            var target = evt.target;

            if (target.tagName !== 'TEXTAREA' && target.tagName !== 'INPUT') { return; }

            // Saving takes what is being written first.
            if ((evt.ctrlKey || evt.metaKey) && (evt.key === 's' || evt.key === 'S')) {
                fieldChanged(target);
                return;
            }

            if (evt.key === 'Escape') {
                evt.preventDefault();
                evt.stopPropagation();
                togglePlayback();
                return;
            }

            if (evt.key !== 'Enter' || evt.isComposing) { return; }

            if (target.tagName === 'TEXTAREA') {
                if (evt.shiftKey) { return; }
                evt.preventDefault();
                enterInText(target);
            } else {
                evt.preventDefault();
                fieldChanged(target);
            }

        });

        list.addEventListener('click', function(evt) {

            var row = evt.target.closest('.transcriptCue');

            if (!row) { return; }

            var cue    = cues[parseInt(row.getAttribute('data-index'), 10)],
                button = evt.target.closest('button');

            if (!cue) { return; }

            if (button) {
                if (button.classList.contains('transcriptCueSeek'))   { FrameTrail.module('HypervideoController').currentTime = cue.start + 0.05; }
                if (button.classList.contains('transcriptCueSplit'))  { splitCue(cue); }
                if (button.classList.contains('transcriptCueMerge'))  { mergeCue(cue); }
                if (button.classList.contains('transcriptCueDelete')) { deleteCue(cue); }
            }

        });

    }


    /* ------------------------------------------------------------------ */
    /*  Drawing                                                           */
    /* ------------------------------------------------------------------ */

    function showMessage(text, isError) {
        if (!message) { return; }
        message.className = 'message transcriptsMessage active' + (isError ? ' error' : '');
        message.textContent = text;
    }

    function hideMessage() {
        if (message) { message.className = 'message transcriptsMessage'; message.textContent = ''; }
    }

    // Whether a content view shows a language; one that names none (or one that is gone) shows the first.
    function showsLanguage(view, code) {
        return view.type === 'Transcript' && FrameTrail.module('HypervideoModel').transcriptLanguage(view.transcriptSource) === code;
    }

    // The Transcript views that show a language: [{ name, area }].
    function viewsShowing(code) {

        var ViewLayout = FrameTrail.module('ViewLayout'),
            data       = ViewLayout ? ViewLayout.getLayoutAreaData() : {},
            found      = [];

        Object.keys(AREA_LABELS).forEach(function(area) {
            (data[area] || []).forEach(function(view) {
                if (showsLanguage(view, code)) {
                    found.push({ name: view.name || labels['GenericTextTranscript'], area: area });
                }
            });
        });

        return found;

    }

    function viewsText(views) {
        return views.map(function(view) { return view.name + ' (' + labels[AREA_LABELS[view.area]] + ')'; }).join(', ');
    }

    /**
     * I draw the panel.
     * @method render
     * @private
     */
    function render() {

        var EditingOptions = FrameTrail.module('ViewVideo').EditingOptions,
            langs          = languages(),
            scrollTop      = (cueList && editor && editor.getAttribute('data-lang') === lang) ? cueList.scrollTop : 0;

        closeMenu();

        if (lang && langs.indexOf(lang) === -1) { lang = null; doc = null; }
        if (!lang && langs.length) { lang = langs[0]; loadDoc(); }
        if (lang && !doc) { loadDoc(); }

        editor = el('<div class="transcriptsEditor"></div>');
        editor.setAttribute('data-lang', lang || '');

        var hint = el('<div class="message active transcriptsHint"><span class="icon-doc-text"></span> ' + esc(labels['MessageTranscriptsHint']) + ' </div>');
        hint.appendChild(FrameTrail.module('ViewLayout').renderOpenEditorButton());
        editor.appendChild(hint);

        if (generation) { editor.appendChild(renderGeneration()); }

        if (langs.length) { editor.appendChild(renderLanguageBar(langs)); }

        message = el('<div class="message transcriptsMessage"></div>');

        if (showNewForm || !langs.length) {
            editor.appendChild(renderNewForm(langs.length > 0));
            editor.appendChild(message);
            cueList = null;
        } else {
            editor.appendChild(renderDisplay());
            editor.appendChild(renderToolbar());
            editor.appendChild(message);
            editor.appendChild(el('<datalist id="' + idPrefix + '-speakers"></datalist>'));
            cueList = el('<div class="transcriptsCueList"></div>');
            bindList(cueList);
            editor.appendChild(cueList);
        }

        EditingOptions.innerHTML = '';
        EditingOptions.appendChild(editor);

        if (!cueList) { renderTimeline(); }

        if (cueList) {
            renderCues();
            cueList.scrollTop = scrollTop;
            if (lang && storedText(lang) === null && FrameTrail.module('Database').hypervideo.subtitles.some(function(f) { return f.srclang === lang; })) {
                showMessage(labels['TranscriptsUnreadable'], true);
            }
        }

    }

    function renderLanguageBar(langs) {

        var options = langs.map(function(code) {
                return '<option value="' + esc(code) + '"' + (code === lang && !showNewForm ? ' selected' : '') + '>' + esc(languageLabel(code)) + '</option>';
            }).join(''),
            bar = el('<div class="transcriptsLanguageBar">'
                + '<div class="custom-select"><select class="transcriptsLanguageSelect" aria-label="' + esc(labels['GenericLanguage']) + '">' + options
                + '<option value=""' + (showNewForm ? ' selected' : '') + '>' + esc(labels['TranscriptsNew']) + '</option></select></div>'
                + '<button type="button" class="transcriptsMenuButton" title="' + esc(labels['TranscriptsMore']) + '"><span class="icon-ellipsis-vert"></span></button>'
                + '</div>');

        bar.querySelector('select').addEventListener('change', function() {
            if (this.value) {
                chooseLanguage(this.value);
            } else {
                showNewForm = true;
                render();
                var input = editor.querySelector('.transcriptsNewLanguage');
                if (input) { input.focus(); }
            }
        });

        var menuButton = bar.querySelector('.transcriptsMenuButton');
        menuButton.style.visibility = showNewForm ? 'hidden' : '';
        menuButton.addEventListener('click', function() { openMenu(menuButton); });

        return bar;

    }

    function renderNewForm(canCancel) {

        var Localization = FrameTrail.module('Localization'),
            taken        = languages(),
            options      = Localization.LANGUAGE_CODES.filter(function(code) { return taken.indexOf(code) === -1; }).map(function(code) {
                return { code: code, label: languageLabel(code) };
            }).sort(function(a, b) { return a.label.localeCompare(b.label); }).map(function(item) {
                return '<option value="' + esc(item.label) + '"></option>';
            }).join(''),
            offered      = transcriber(),
            form         = el('<div class="transcriptsNew">'
                + (canCancel ? '' : '<p>' + esc(labels['TranscriptsNone']) + '</p>')
                + '<label for="' + idPrefix + '-language">' + esc(labels['GenericLanguage']) + '</label>'
                + '<input type="text" id="' + idPrefix + '-language" class="transcriptsNewLanguage" list="' + idPrefix + '-languages" autocomplete="off" placeholder="' + esc(labels['TranscriptsLanguagePlaceholder']) + '">'
                + '<datalist id="' + idPrefix + '-languages">' + options + '</datalist>'
                + '<div class="transcriptsNewActions">'
                + '<button type="button" class="transcriptsNewEmpty"><span class="icon-plus"></span> ' + esc(labels['TranscriptsStartEmpty']) + '</button>'
                + '<button type="button" class="transcriptsNewUpload"><span class="icon-upload"></span> ' + esc(labels['TranscriptsUploadFile']) + '</button>'
                + (offered ? '<button type="button" class="transcriptsNewGenerate"' + (generation ? ' disabled' : '') + '><span class="icon-magic"></span> ' + esc(transcriberLabel(offered)) + '</button>' : '')
                + (canCancel ? '<button type="button" class="transcriptsNewCancel">' + esc(labels['GenericCancel']) + '</button>' : '')
                + '</div>'
                + '</div>'),
            input        = form.querySelector('.transcriptsNewLanguage');

        function chosen(required) {
            var code = resolveLanguage(input.value);
            if (!code) {
                if (required || input.value.trim()) { showMessage(labels['TranscriptsErrorLanguage'], true); }
                return null;
            }
            if (!LANGUAGE_CODE.test(code)) {
                showMessage(labels['TranscriptsErrorLanguage'], true);
                return null;
            }
            return code;
        }

        form.querySelector('.transcriptsNewEmpty').addEventListener('click', function() {
            var code = chosen(true);
            if (!code) { return; }
            if (languages().indexOf(code) !== -1) { showMessage(labels['TranscriptsErrorLanguageExists'], true); return; }
            setLanguageText(code, VTT().write(VTT().create()), describe('GenericAdd'));
        });

        form.querySelector('.transcriptsNewUpload').addEventListener('click', function() {
            var code = chosen(true);
            if (code) { pickFile(code); }
        });

        var generateButton = form.querySelector('.transcriptsNewGenerate');
        if (generateButton) {
            generateButton.addEventListener('click', function() {
                var code = chosen(false);
                if (code === null && input.value.trim()) { return; }
                startGeneration(code);
            });
        }

        var cancel = form.querySelector('.transcriptsNewCancel');
        if (cancel) {
            cancel.addEventListener('click', function() {
                showNewForm = false;
                render();
            });
        }

        input.addEventListener('keydown', function(evt) {
            if (evt.key === 'Enter') { evt.preventDefault(); form.querySelector('.transcriptsNewEmpty').click(); }
        });

        return form;

    }

    function captionsByDefault() {
        var config = FrameTrail.module('Database').hypervideo.config || {};
        return !!config.captionsVisible && config.captionsVisible.toString() === 'true';
    }

    /**
     * I set whether captions are on from the start (config.captionsVisible). Not through HypervideoModel.setConfig(),
     * which applies every setting again and would bring back the layout areas the edit mode hides.
     *
     * @method setCaptionsByDefault
     * @param {Boolean} value
     * @private
     */
    function setCaptionsByDefault(value) {

        var database = FrameTrail.module('Database');

        if (!database.hypervideo.config) { database.hypervideo.config = {}; }

        database.hypervideo.config.captionsVisible = value;

        // Leaving the mode shows the captions as the setting says.
        if (captionsBefore !== null) { captionsBefore = value; }

        FrameTrail.module('HypervideoModel').newUnsavedChange('config');

        var box = editor && editor.querySelector('.transcriptsCaptionsDefault');
        if (box) { box.checked = value; }

    }

    function renderDisplay() {

        var views   = viewsShowing(lang),
            id      = idPrefix + '-captions',
            display = el('<div class="transcriptsDisplay">'
                + '<div class="checkboxRow"><label class="switch"><input type="checkbox" id="' + id + '" class="transcriptsCaptionsDefault"' + (captionsByDefault() ? ' checked' : '') + '><span class="slider round"></span></label>'
                + '<label for="' + id + '">' + esc(labels['TranscriptsCaptionsByDefault']) + '</label></div>'
                + '<div class="transcriptsUsage">' + esc(views.length ? labels['TranscriptsUsedIn'].replace('%s', function() { return viewsText(views); }) : labels['TranscriptsNotUsed']) + '</div>'
                + '</div>');

        display.querySelector('.transcriptsCaptionsDefault').addEventListener('change', function() {
            var before = !this.checked,
                after  = this.checked;
            setCaptionsByDefault(after);
            FrameTrail.module('UndoManager').register({
                category:    'subtitles',
                description: labels['TranscriptsCaptionsByDefault'],
                undo:        function() { setCaptionsByDefault(before); },
                redo:        function() { setCaptionsByDefault(after); }
            });
        });

        return display;

    }

    function renderToolbar() {

        var toolbar = el('<div class="transcriptsToolbar">'
            + '<button type="button" class="transcriptsAddCue"><span class="icon-plus"></span> ' + esc(labels['TranscriptsAddCue']) + '</button>'
            + '<span class="transcriptsKeys">' + esc(labels['TranscriptsKeysHint']) + '</span>'
            + '</div>');

        toolbar.querySelector('.transcriptsAddCue').addEventListener('click', addCueAtPlayhead);

        return toolbar;

    }

    function renderSpeakers() {

        var list = editor && editor.querySelector('datalist[id="' + idPrefix + '-speakers"]');

        if (!list) { return; }

        var seen = {};

        cues.forEach(function(cue) {
            var speaker = VTT().speakerOf(cue.text).speaker;
            if (speaker) { seen[speaker] = true; }
        });

        list.innerHTML = Object.keys(seen).sort().map(function(speaker) { return '<option value="' + esc(speaker) + '"></option>'; }).join('');

    }

    function rowHTML(cue, index) {

        var voice = VTT().speakerOf(cue.text);

        return '<div class="transcriptCue" data-index="' + index + '">'
            + '<div class="transcriptCueHead">'
            + '<button type="button" class="transcriptCueSeek" title="' + esc(labels['TranscriptsJumpTo']) + '"><span class="icon-play-1"></span></button>'
            + '<input type="text" class="transcriptCueStart" value="' + esc(VTT().formatTime(cue.start)) + '" aria-label="' + esc(labels['TranscriptsStart']) + '">'
            + '<span class="transcriptCueArrow">&rarr;</span>'
            + '<input type="text" class="transcriptCueEnd" value="' + esc(VTT().formatTime(cue.end)) + '" aria-label="' + esc(labels['TranscriptsEnd']) + '">'
            + '<input type="text" class="transcriptCueSpeaker" list="' + idPrefix + '-speakers" placeholder="' + esc(labels['TranscriptsSpeaker']) + '" value="' + esc(voice.speaker) + '">'
            + '<button type="button" class="transcriptCueSplit" title="' + esc(labels['TranscriptsSplit']) + '"><span class="icon-scissors"></span></button>'
            + '<button type="button" class="transcriptCueMerge" title="' + esc(labels['TranscriptsMerge']) + '"' + (index === cues.length - 1 ? ' disabled' : '') + '><span class="icon-merge"></span></button>'
            + '<button type="button" class="transcriptCueDelete" title="' + esc(labels['GenericDelete']) + '"><span class="icon-cancel"></span></button>'
            + '</div>'
            + '<textarea class="transcriptCueText" rows="1" placeholder="' + esc(labels['TranscriptsCueText']) + '">' + esc(VTT().decodeText(voice.text)) + '</textarea>'
            + '</div>';

    }

    /**
     * I draw the list of cues, and put the focus into a field of one of them.
     * @method renderCues
     * @param {Object} [focus] { cue, field: 'text' | 'speaker' | 'start' | 'end', caret }
     * @private
     */
    function renderCues(focus) {

        if (!cueList) { return; }

        var scrollTop = cueList.scrollTop;

        cues = VTT().cuesOf(doc);
        activeCue = null;

        focusedField = null;

        cueList.innerHTML = cues.length
            ? cues.map(rowHTML).join('')
            : '<div class="transcriptsEmpty">' + esc(labels['TranscriptsEmpty']) + '</div>';

        cueList.scrollTop = scrollTop;

        cueList.querySelectorAll('textarea').forEach(autosize);

        if (selectedCue && cues.indexOf(selectedCue) === -1) { selectedCue = null; }
        if (selectedCue) { rowOf(selectedCue).classList.add('selected'); }

        updateRowStates();
        renderSpeakers();
        renderTimeline();
        updateActiveCue(FrameTrail.module('HypervideoController').currentTime);

        if (focus && focus.cue) {
            focusCue(focus.cue, focus.field, focus.caret);
        }

    }

    // The marks of rows that need a look: overlapping the cue before, outside the video.
    function updateRowStates() {

        if (!cueList) { return; }

        var HypervideoModel = FrameTrail.module('HypervideoModel'),
            from            = HypervideoModel.offsetIn || 0,
            to              = HypervideoModel.duration ? from + HypervideoModel.duration : Infinity;

        cueList.querySelectorAll('.transcriptCue').forEach(function(row, i) {

            var cue      = cues[i],
                overlaps = i > 0 && cue.start < cues[i - 1].end,
                outside  = cue.end <= from || cue.start >= to;

            row.classList.toggle('overlap', overlaps);
            row.classList.toggle('outside', outside);
            row.title = outside ? labels['TranscriptsOutsideVideo'] : (overlaps ? labels['TranscriptsOverlap'] : '');

        });

    }

    function focusCue(cue, field, caret) {

        var index = cues.indexOf(cue),
            row   = cueList && cueList.querySelector('.transcriptCue[data-index="' + index + '"]');

        if (!row) { return; }

        row.scrollIntoView({ block: 'nearest' });

        if (!field) { return; }

        var input = row.querySelector('.transcriptCue' + field.charAt(0).toUpperCase() + field.slice(1));

        if (input) {
            input.focus();
            var at = (typeof caret === 'number') ? caret : input.value.length;
            try { input.setSelectionRange(at, at); } catch (e) {}
        }

    }

    /**
     * I mark the cue at the playhead and keep it in view, unless the user is writing or pointing in the list.
     * @method updateActiveCue
     * @param {Number} time
     */
    function updateActiveCue(time) {

        if (!cueList || !isActive()) { return; }

        var found = null;

        for (var i = 0; i < cues.length; i++) {
            if (cues[i].start <= time && time < cues[i].end) { found = cues[i]; break; }
            if (cues[i].start > time) { break; }
        }

        if (found === activeCue) { return; }

        var previous = activeCue ? cueList.querySelector('.transcriptCue[data-index="' + cues.indexOf(activeCue) + '"]') : null;
        if (previous) { previous.classList.remove('active'); }

        activeCue = found;

        updateBlockStates();

        if (!found) { return; }

        var row = cueList.querySelector('.transcriptCue[data-index="' + cues.indexOf(found) + '"]');

        if (row) {
            row.classList.add('active');
            if (!pointerInList && !(document.activeElement && editor && editor.contains(document.activeElement))) {
                row.scrollIntoView({ block: 'nearest' });
            }
        }

    }


    /* ------------------------------------------------------------------ */
    /*  Timeline                                                          */
    /* ------------------------------------------------------------------ */

    function rowOf(cue) {
        return cueList ? cueList.querySelector('.transcriptCue[data-index="' + cues.indexOf(cue) + '"]') : null;
    }

    /**
     * I give the spans of the cues shown on the timeline (absolute times), for its minimap.
     * @method cueRanges
     * @return {Array} [{ start, end }]
     */
    function cueRanges() {
        return blocks.map(function(block) { return { start: block.cue.start, end: block.cue.end }; });
    }

    /**
     * I select a cue (or none): its row is marked and kept in view, its block on the timeline is highlighted. Selecting
     * never moves the playhead.
     *
     * @method selectCue
     * @param {Object|null} cue
     * @param {Boolean} [fromList] the row has the focus already (it is in view)
     */
    function selectCue(cue, fromList) {

        selectedCue = (cue && cues.indexOf(cue) !== -1) ? cue : null;

        if (cueList) {
            cueList.querySelectorAll('.transcriptCue.selected').forEach(function(row) { row.classList.remove('selected'); });
            var row = selectedCue && rowOf(selectedCue);
            if (row) {
                row.classList.add('selected');
                if (!fromList) { row.scrollIntoView({ block: 'nearest' }); }
            }
        }

        updateBlockStates();

    }

    function timelineElement() {
        var ViewVideo = FrameTrail.module('ViewVideo');
        return ViewVideo ? ViewVideo.TranscriptTimeline : null;
    }

    function timelineHost() {
        var timeline = timelineElement();
        return timeline ? (timeline.querySelector('.timelineScroller') || timeline) : null;
    }

    function blockLabel(cue) {
        var voice = VTT().speakerOf(cue.text),
            text  = VTT().toPlain(voice.text).replace(/\s+/g, ' ').trim();
        return voice.speaker ? voice.speaker + ': ' + text : text;
    }

    // A block's place: its share of the video, cut to the video (a cue outside it is not drawn).
    function placeBlock(element, start, end) {

        var HypervideoModel = FrameTrail.module('HypervideoModel'),
            from            = HypervideoModel.offsetIn || 0,
            duration        = HypervideoModel.duration,
            left            = Math.max(0, (start - from) / duration * 100),
            right           = Math.min(100, (end - from) / duration * 100);

        element.style.display = (right <= left) ? 'none' : '';
        element.style.left    = left + '%';
        element.style.width   = Math.max(0, right - left) + '%';

    }

    function updateBlockStates() {

        var HypervideoModel = FrameTrail.module('HypervideoModel'),
            from            = HypervideoModel.offsetIn || 0,
            to              = HypervideoModel.duration ? from + HypervideoModel.duration : Infinity;

        blocks.forEach(function(block) {
            var cue   = block.cue,
                index = cues.indexOf(cue);
            block.element.classList.toggle('overlap', index > 0 && cue.start < cues[index - 1].end);
            block.element.classList.toggle('outside', cue.end <= from || cue.start >= to);
            block.element.classList.toggle('active', cue === activeCue);
            block.element.classList.toggle('highlighted', cue === selectedCue);
        });

    }

    function clearTimeline() {

        blocks.forEach(function(block) {
            try { interact(block.element).unset(); } catch (e) {}
            block.element.remove();
        });

        blocks  = [];
        gesture = null;

    }

    /**
     * I draw the cues of the language shown as blocks on the transcript timeline (only in this edit mode), and its minimap.
     * @method renderTimeline
     * @private
     */
    function renderTimeline() {

        var host     = timelineHost(),
            duration = FrameTrail.module('HypervideoModel').duration;

        clearTimeline();

        if (!host) { return; }

        if (isActive() && cueList && duration) {

            cues.forEach(function(cue) {

                var element = el('<div class="timelineElement transcriptCueBlock ui-draggable ui-resizable">'
                    + '<div class="timelineElementLabel"></div>'
                    + '<div class="ui-resizable-handle ui-resizable-w"></div>'
                    + '<div class="ui-resizable-handle ui-resizable-e"></div>'
                    + '</div>');

                element.querySelector('.timelineElementLabel').textContent = blockLabel(cue);
                element.title = VTT().formatTime(cue.start) + ' → ' + VTT().formatTime(cue.end);

                placeBlock(element, cue.start, cue.end);
                host.appendChild(element);
                blocks.push({ cue: cue, element: element });
                bindBlock(element, cue);

            });

            updateBlockStates();

        }

        var TimelineController = FrameTrail.module('TimelineController');
        if (TimelineController && TimelineController.initialized) { TimelineController.refreshMinimap(); }

    }

    function bindBlock(element, cue) {

        element.addEventListener('click', function() { selectCue(cue); });

        element.addEventListener('dblclick', function(evt) {
            if (evt.target.closest('.ui-resizable-handle')) { return; }
            selectCue(cue);
            FrameTrail.module('HypervideoController').currentTime = cue.start + 0.05;
        });

        interact(element)
            .draggable({
                ignoreFrom: '.ui-resizable-handle',
                listeners: {
                    start: function() { beginGesture(cue, 'move'); },
                    move:  function(e) { moveGesture(e.dx); },
                    end:   endGesture
                }
            })
            .resizable({
                edges: { left: '.ui-resizable-w', right: '.ui-resizable-e' },
                listeners: {
                    start: function(e) { beginGesture(cue, e.edges.left ? 'start' : 'end'); },
                    move:  function(e) { moveGesture(e.edges.left ? e.deltaRect.left : e.deltaRect.right); },
                    end:   endGesture
                }
            });

    }

    /**
     * I start moving a cue's block ('move') or one of its edges ('start', 'end'). An edge that touches the neighbour's
     * moves the neighbour's too.
     *
     * @method beginGesture
     * @private
     */
    function beginGesture(cue, kind) {

        var host            = timelineHost(),
            HypervideoModel = FrameTrail.module('HypervideoModel'),
            index           = cues.indexOf(cue),
            prev            = cues[index - 1] || null,
            next            = cues[index + 1] || null;

        // What is being written goes in first: the list is drawn again at the end.
        flush();

        selectCue(cue);

        gesture = {
            cue:           cue,
            kind:          kind,
            prev:          prev,
            next:          next,
            linkPrev:      kind === 'start' && !!prev && Math.abs(prev.end - cue.start) < TOUCH_SECONDS,
            linkNext:      kind === 'end' && !!next && Math.abs(next.start - cue.end) < TOUCH_SECONDS,
            from:          HypervideoModel.offsetIn || 0,
            to:            (HypervideoModel.offsetIn || 0) + HypervideoModel.duration,
            width:         host.offsetWidth,
            secondsPerPx:  HypervideoModel.duration / (host.offsetWidth || 1),
            px:            0
        };

        var block = blockOf(cue);
        if (block) { block.classList.add('ui-draggable-dragging'); }

    }

    function blockOf(cue) {
        var found = blocks.filter(function(block) { return block.cue === cue; })[0];
        return found ? found.element : null;
    }

    // value within [lo, hi]; when there is no room, where it was.
    function limit(value, lo, hi, was) {
        return (hi < lo) ? was : Math.max(lo, Math.min(hi, value));
    }

    /**
     * I give the times a gesture makes of the pointer moved by some seconds: the cue's, and the edge of the neighbour it
     * drags along. Cues do not pass their neighbours, get no shorter than MIN_CUE_LENGTH and stay within the video
     * (unless they were outside it already).
     *
     * @method gestureTimes
     * @private
     */
    function gestureTimes(delta) {

        var g         = gesture,
            cue       = g.cue,
            start     = cue.start,
            end       = cue.end,
            lowest    = g.prev ? Math.min(g.prev.end, cue.start) : Math.min(g.from, cue.start),
            highest   = g.next ? Math.max(g.next.start, cue.end) : Math.max(g.to, cue.end);

        if (g.kind === 'move') {
            delta = limit(delta, lowest - cue.start, highest - cue.end, 0);
            start = cue.start + delta;
            end   = cue.end + delta;
        } else if (g.kind === 'start') {
            start = limit(cue.start + delta, g.linkPrev ? g.prev.start + MIN_CUE_LENGTH : lowest, cue.end - MIN_CUE_LENGTH, cue.start);
        } else {
            end = limit(cue.end + delta, cue.start + MIN_CUE_LENGTH, g.linkNext ? g.next.end - MIN_CUE_LENGTH : highest, cue.end);
        }

        return { start: round(start), end: round(end) };

    }

    // The neighbour's edge the moving edge would snap to (closing a gap), as a change of the delta, or null.
    function snapOf(times) {

        var g         = gesture,
            tolerance = SNAP_PX * g.secondsPerPx,
            best      = null;

        function consider(edge, target) {
            var distance = target - edge;
            if (Math.abs(distance) <= tolerance && (best === null || Math.abs(distance) < Math.abs(best.delta))) {
                best = { delta: distance, at: target };
            }
        }

        if (g.kind !== 'end' && g.prev && !g.linkPrev)   { consider(times.start, g.prev.end); }
        if (g.kind !== 'start' && g.next && !g.linkNext) { consider(times.end, g.next.start); }

        return best;

    }

    // The gesture's times as shown: the blocks, the rows' fields, the playhead.
    function showGesture(times) {

        var g    = gesture,
            cue  = g.cue,
            row  = rowOf(cue),
            prev = g.linkPrev ? blockOf(g.prev) : null,
            next = g.linkNext ? blockOf(g.next) : null;

        placeBlock(blockOf(cue), times.start, times.end);
        if (prev) { placeBlock(prev, g.prev.start, times.start); }
        if (next) { placeBlock(next, times.end, g.next.end); }

        if (row) {
            row.querySelector('.transcriptCueStart').value = VTT().formatTime(times.start);
            row.querySelector('.transcriptCueEnd').value   = VTT().formatTime(times.end);
        }
        if (g.linkPrev && rowOf(g.prev)) { rowOf(g.prev).querySelector('.transcriptCueEnd').value = VTT().formatTime(times.start); }
        if (g.linkNext && rowOf(g.next)) { rowOf(g.next).querySelector('.transcriptCueStart').value = VTT().formatTime(times.end); }

        FrameTrail.module('HypervideoController').currentTime = (g.kind === 'end') ? times.end : times.start;

    }

    function moveGesture(px) {

        if (!gesture) { return; }

        gesture.px += px;

        var times     = gestureTimes(gesture.px * gesture.secondsPerPx),
            snap      = snapOf(times),
            ViewVideo = FrameTrail.module('ViewVideo');

        if (snap) {
            ViewVideo.showTimelineSnapIndicator(timelineHost(), (snap.at - gesture.from) / (gesture.to - gesture.from) * gesture.width);
        } else {
            ViewVideo.hideTimelineSnapIndicator();
        }

        showGesture(times);

    }

    /**
     * I end a gesture: the cue (and the neighbour whose edge it moved) gets its new times, as one undo step.
     * @method endGesture
     * @private
     */
    function endGesture() {

        var ViewVideo = FrameTrail.module('ViewVideo');

        // The click ending the gesture must not change the selection.
        ViewVideo.swallowNextClick();
        ViewVideo.hideTimelineSnapIndicator();

        if (!gesture) { return; }

        var g     = gesture,
            delta = g.px * g.secondsPerPx,
            snap  = snapOf(gestureTimes(delta)),
            times = gestureTimes(snap ? delta + snap.delta : delta);

        gesture = null;

        g.cue.start = times.start;
        g.cue.end   = times.end;
        if (g.linkPrev) { g.prev.end   = times.start; }
        if (g.linkNext) { g.next.start = times.end; }

        commit(describe('GenericChange'));

        // Drawn again once interact.js is done with the gesture's element.
        window.setTimeout(function() { renderCues(); }, 0);

    }

    function onTimelineClick(evt) {
        if (isActive() && !evt.target.closest('.timelineElement')) { selectCue(null); }
    }


    /* ------------------------------------------------------------------ */
    /*  Menu, files, shifting                                             */
    /* ------------------------------------------------------------------ */

    function closeMenu() {
        if (menu && menu.matches(':popover-open')) { menu.hidePopover(); }
    }

    function openMenu(anchor) {

        if (!menu) {
            menu = document.createElement('div');
            menu.className = 'contextSelectList transcriptsMenu';
            menu.setAttribute('popover', 'auto');
            (document.querySelector(FrameTrail.getState('target')) || document.body).appendChild(menu);
        }

        closeMenu();
        menu.innerHTML = '';

        var items = [
            { icon: 'icon-upload', label: labels['TranscriptsUploadReplace'], run: function() { pickFile(lang); } },
            { icon: 'icon-clock',  label: labels['TranscriptsShiftTimings'],  run: openShiftDialog }
        ];

        var offered = transcriber();

        if (offered) {
            items.push({ icon: 'icon-magic', label: transcriberLabel(offered), run: function() { startGeneration(lang); }, disabled: !!generation });
        }

        items.push({ icon: 'icon-trash', label: labels['TranscriptsDelete'], run: confirmDelete });

        items.forEach(function(item) {
            var row = el('<div><span class="' + item.icon + '"></span> ' + esc(item.label) + '</div>');
            if (item.disabled) {
                row.classList.add('disabled');
            } else {
                row.addEventListener('click', function() { closeMenu(); item.run(); });
            }
            menu.appendChild(row);
        });

        menu.showPopover();

        var rect   = anchor.getBoundingClientRect(),
            left   = Math.max(4, Math.min(window.innerWidth - menu.offsetWidth - 4, rect.right - menu.offsetWidth)),
            top    = rect.bottom + 4;

        if (top + menu.offsetHeight > window.innerHeight - 4) { top = rect.top - menu.offsetHeight - 4; }

        menu.style.left = left + 'px';
        menu.style.top  = Math.max(4, top) + 'px';

    }

    /**
     * I ask before deleting the shown transcript. When Transcript views show it, the user decides what becomes of them:
     * they show the next transcript (or, when it is the last one, stay and show the next one made), or they go too.
     *
     * @method confirmDelete
     * @private
     */
    function confirmDelete() {

        var code  = lang,
            views = viewsShowing(code),
            text  = labels['TranscriptsDeleteConfirm'].replace('%s', function() { return languageLabel(code); });

        if (!views.length) {
            ConfirmDialog({
                title:        labels['GenericConfirmDelete'],
                icon:         'icon-trash',
                message:      text,
                confirmLabel: labels['GenericDelete'],
                cancelLabel:  labels['GenericCancel'],
                onConfirm:    function() { setLanguageText(code, null, describe('GenericDelete')); }
            });
            return;
        }

        var langs   = languages(),
            at      = langs.indexOf(code),
            next    = langs[at + 1] || langs[at - 1] || null,
            content = document.createElement('p'),
            dialog;

        content.textContent = text + ' ' + labels['TranscriptsDeleteViewsQuestion'].replace('%s', function() { return viewsText(views); });

        function choose(choice) {
            return function() {
                dialog.destroy();
                deleteTranscript(code, choice, next);
            };
        }

        dialog = Dialog({
            title:   labels['GenericConfirmDelete'],
            icon:    'icon-trash',
            content: content,
            modal:   true,
            width:   460,
            buttons: [
                next
                    ? { text: labels['TranscriptsDeleteSwitchViews'].replace('%s', function() { return languageLabel(next); }), click: choose('switch') }
                    : { text: labels['TranscriptsDeleteKeepViews'], click: choose('keep') },
                { text: labels['TranscriptsDeleteWithViews'], click: choose('remove') },
                { text: labels['GenericCancel'], click: function() { dialog.destroy(); } }
            ],
            close: function() { dialog.destroy(); }
        });

    }

    /**
     * I delete a transcript and change the Transcript views that show it, as one undo step: 'switch' makes them show the
     * next transcript, 'keep' makes them name none (they show the next one made), 'remove' deletes them.
     *
     * @method deleteTranscript
     * @param {String} code
     * @param {String} choice - 'switch', 'keep' or 'remove'
     * @param {String|null} next - the language the views show after 'switch'
     * @private
     */
    function deleteTranscript(code, choice, next) {

        var ViewLayout = FrameTrail.module('ViewLayout'),
            data       = ViewLayout.getLayoutAreaData(),
            changes    = [],
            before     = storedText(code),
            commands   = [subtitlesCommand(code, before, null, undefined, languages().indexOf(code))];

        // Which views show the transcript is read before it is gone: a view naming none shows the first one.
        Object.keys(AREA_NAMES).forEach(function(area) {

            var changed = false,
                views   = [];

            (data[area] || []).forEach(function(view) {
                var copy = JSON.parse(JSON.stringify(view));
                if (showsLanguage(view, code)) {
                    if (choice === 'remove') { changed = true; return; }
                    copy.transcriptSource = (choice === 'switch') ? next : '';
                    changed = changed || copy.transcriptSource !== view.transcriptSource;
                }
                views.push(copy);
            });

            if (changed) { changes.push({ area: AREA_NAMES[area], views: views }); }

        });

        // The transcript first, so the views made again show what they will show.
        applyText(code, null);

        changes.forEach(function(change) {
            var previous = ViewLayout.setContentViews(change.area, change.views);
            commands.push({
                category: 'layout',
                undo:     function() { FrameTrail.module('ViewLayout').setContentViews(change.area, previous); },
                redo:     function() { FrameTrail.module('ViewLayout').setContentViews(change.area, change.views); }
            });
        });

        FrameTrail.module('UndoManager').registerGroup(describe('GenericDelete'), commands);

        if (isActive()) {
            lang = null;
            doc  = null;
            render();
        }

    }

    function confirmReplace(code, onConfirm) {

        if (!hasCues(storedText(code))) {
            onConfirm();
            return;
        }

        ConfirmDialog({
            title:        labels['TranscriptsReplace'],
            icon:         'icon-doc-text',
            message:      labels['TranscriptsReplaceConfirm'].replace('%s', function() { return languageLabel(code); }),
            confirmLabel: labels['TranscriptsReplace'],
            cancelLabel:  labels['GenericCancel'],
            onConfirm:    onConfirm
        });

    }

    /**
     * I check a WebVTT text as the player reads it: null when it is fine, else the problems, one per line.
     * @method problemsOf
     * @param {String} text
     * @return {String|null}
     * @private
     */
    function problemsOf(text) {
        var problems = window.FrameTrailLint.checkVTT(text);
        return problems.length ? problems.map(function(problem) { return problem.line + ': ' + problem.message; }).join('\n') : null;
    }

    /**
     * I let the user choose a WebVTT or SubRip file and make it the transcript of a language.
     * @method pickFile
     * @param {String} code
     * @private
     */
    function pickFile(code) {

        var input = document.createElement('input');

        input.type   = 'file';
        input.accept = '.vtt,.srt,text/vtt,application/x-subrip';
        input.style.display = 'none';

        input.addEventListener('change', function() {

            var file = input.files && input.files[0];

            input.remove();

            if (!file) { return; }

            file.text().then(function(text) {

                var kind = VTT().sniff(text);

                if (kind === 'srt') {
                    text = VTT().fromSRT(text);
                } else if (kind !== 'vtt') {
                    showMessage(labels['TranscriptsErrorFormat'], true);
                    return;
                }

                var problems = problemsOf(text);

                if (problems) {
                    showMessage(labels['TranscriptsErrorFile'] + '\n' + problems, true);
                    return;
                }

                var description = describe(storedText(code) === null ? 'GenericAdd' : 'GenericChange');

                confirmReplace(code, function() { setLanguageText(code, text, description); });

            }, function() {
                showMessage(labels['TranscriptsErrorFormat'], true);
            });

        });

        document.body.appendChild(input);
        input.click();

    }

    function openShiftDialog() {

        var content = el('<div class="transcriptsShiftDialog">'
                + '<label for="' + idPrefix + '-shift">' + esc(labels['TranscriptsShiftBy']) + '</label>'
                + '<input type="number" id="' + idPrefix + '-shift" step="0.1" value="0">'
                + '<div class="message error"></div>'
                + '</div>'),
            input   = content.querySelector('input'),
            error   = content.querySelector('.message'),
            dialog  = Dialog({
                title:   labels['TranscriptsShiftTimings'],
                content: content,
                modal:   true,
                width:   360,
                buttons: [
                    { text: labels['TranscriptsShift'], click: apply },
                    { text: labels['GenericCancel'],    click: function() { dialog.destroy(); } }
                ],
                close: function() { dialog.destroy(); }
            });

        function apply() {
            var delta = parseFloat(String(input.value).replace(',', '.'));
            if (isNaN(delta) || cues.some(function(cue) { return cue.end + delta <= 0; })) {
                error.textContent = labels['TranscriptsErrorShift'];
                error.classList.add('active');
                return;
            }
            dialog.destroy();
            if (delta !== 0) { shiftAll(delta); }
        }

        input.addEventListener('keydown', function(evt) {
            if (evt.key === 'Enter') { evt.preventDefault(); apply(); }
        });

        input.focus();
        input.select();

    }


    /* ------------------------------------------------------------------ */
    /*  Generating (an extension's transcriber)                           */
    /* ------------------------------------------------------------------ */

    /**
     * I find the transcriber offered here: the first one (in load order) whose available() does not answer false, as
     * { name, slot, state }, state being true or why it cannot be used for this hypervideo now. null when none is offered.
     * @method transcriber
     * @return {Object|null}
     * @private
     */
    function transcriber() {

        var Extensions = FrameTrail.module('Extensions'),
            all        = (Extensions && typeof Extensions.transcribers === 'function') ? Extensions.transcribers() : [];

        for (var i = 0; i < all.length; i++) {
            var state = transcriberState(all[i]);
            if (state !== false) {
                return { name: all[i].name, slot: all[i].slot, state: state };
            }
        }

        return null;

    }

    function transcriberLabel(found) {
        return (found && typeof found.slot.label === 'string' && found.slot.label) ? found.slot.label : labels['TranscriptsGenerate'];
    }

    function transcriberContext() {
        return {
            hypervideoId: FrameTrail.module('RouteNavigation').hypervideoID,
            info:         (FrameTrail.edit && typeof FrameTrail.edit.getInfo === 'function') ? FrameTrail.edit.getInfo() : null
        };
    }

    // true; false when it is not offered here at all; or why it cannot be used for this hypervideo now.
    function transcriberState(found) {
        try {
            var answer = (typeof found.slot.available === 'function') ? found.slot.available(transcriberContext()) : true;
            if (answer === true || answer === undefined || answer === null) { return true; }
            if (answer === false) { return false; }
            return (typeof answer === 'string' && answer) ? answer : labels['TranscriptsGenerateUnavailable'];
        } catch (e) {
            console.error('FrameTrail extension "' + found.name + '": transcriber.available() failed.', e);
            return labels['TranscriptsGenerateUnavailable'];
        }
    }

    function progressText(progress) {
        if (typeof progress === 'string') { return progress; }
        if (progress && typeof progress === 'object') {
            var text = (typeof progress.message === 'string') ? progress.message : '';
            if (typeof progress.fraction === 'number' && isFinite(progress.fraction)) {
                text += (text ? ' ' : '') + Math.round(Math.max(0, Math.min(1, progress.fraction)) * 100) + ' %';
            }
            return text;
        }
        return '';
    }

    function renderGeneration() {

        var box = el('<div class="message active transcriptsGeneration">'
            + '<span class="transcriptsGenerationText"></span> '
            + '<button type="button" class="transcriptsGenerationStop">' + esc(labels['GenericStop']) + '</button>'
            + '</div>');

        box.querySelector('.transcriptsGenerationStop').addEventListener('click', stopGeneration);
        updateGeneration(box);

        return box;

    }

    function updateGeneration(box) {

        box = box || (editor && editor.querySelector('.transcriptsGeneration'));

        if (!box || !generation) { return; }

        var language = generation.language ? languageLabel(generation.language) : labels['TranscriptsGenerateLanguageAuto'];

        box.querySelector('.transcriptsGenerationText').textContent = labels['TranscriptsGenerating'].replace('%s', function() { return language; })
            + (generation.progress ? ' ' + generation.progress : '');

    }

    /**
     * I have the transcriber of an extension make the transcript of a language (null: the language it hears). The run goes
     * on while the user works in other edit modes; leaving editing or the hypervideo stops it.
     *
     * @method startGeneration
     * @param {String|null} requested
     * @private
     */
    function startGeneration(requested) {

        var found = transcriber();

        if (!found || generation) { return; }

        if (found.state !== true) {
            showMessage(found.state, true);
            return;
        }

        function run(confirmed) {

            var controller  = new AbortController(),
                hypervideoId = FrameTrail.module('RouteNavigation').hypervideoID,
                promise;

            generation = { controller: controller, language: requested, confirmed: confirmed, progress: '' };

            if (isActive()) { render(); }

            try {
                promise = Promise.resolve(found.slot.transcribe({
                    hypervideoId: hypervideoId,
                    language:     requested || null,
                    signal:       controller.signal,
                    onProgress:   function(progress) {
                        if (generation && generation.controller === controller) {
                            generation.progress = progressText(progress);
                            updateGeneration();
                        }
                    }
                }));
            } catch (e) {
                promise = Promise.reject(e);
            }

            promise.then(function(result) {
                if (!generation || generation.controller !== controller) { return; }
                generation = null;
                applyGenerated(result, requested, confirmed);
            }, function(error) {
                if (!generation || generation.controller !== controller) { return; }
                generation = null;
                if (isActive()) {
                    render();
                    showMessage(labels['TranscriptsGenerateFailed'].replace('%s', function() { return (error && error.message) ? error.message : String(error); }), true);
                }
            });

        }

        if (requested && hasCues(storedText(requested))) {
            confirmReplace(requested, function() { run(true); });
        } else {
            run(false);
        }

    }

    function applyGenerated(result, requested, confirmed) {

        var code = (result && typeof result.language === 'string' && LANGUAGE_CODE.test(result.language)) ? result.language : requested,
            text = result ? result.vtt : null;

        if (!FrameTrail.getState('editMode')) { return; }

        function fail(reason) {
            if (isActive()) {
                render();
                showMessage(labels['TranscriptsGenerateFailed'].replace('%s', function() { return reason; }), true);
            }
        }

        if (!code || typeof text !== 'string') {
            fail(labels['TranscriptsErrorFormat']);
            return;
        }

        var problems = problemsOf(text);

        if (problems) {
            fail(problems);
            return;
        }

        var apply = function() { setLanguageText(code, text, labels['TranscriptsGenerate']); };

        if (confirmed && code === requested) {
            apply();
        } else {
            confirmReplace(code, apply);
        }

        if (isActive()) { render(); }

    }

    /**
     * I stop a transcriber at work; what it would have made is dropped.
     * @method stopGeneration
     */
    function stopGeneration() {

        if (!generation) { return; }

        generation.controller.abort();
        generation = null;

        if (isActive()) { render(); }

    }


    /* ------------------------------------------------------------------ */
    /*  Mode                                                              */
    /* ------------------------------------------------------------------ */

    /**
     * I listen to the global state 'editMode': entering "transcripts" I draw the panel and show the captions of the
     * language shown; leaving it I take what is being written and put the captions back as they were.
     *
     * @method toggleEditMode
     * @param {String} editMode
     * @param {String} oldEditMode
     */
    function toggleEditMode(editMode, oldEditMode) {

        if (editMode === 'transcripts' && oldEditMode !== 'transcripts') {

            var langs    = languages(),
                selected = FrameTrail.module('HypervideoModel').selectedLang;

            captionsBefore = FrameTrail.getState('hv_config_captionsVisible');
            lang           = (langs.indexOf(lang) !== -1) ? lang : ((langs.indexOf(selected) !== -1) ? selected : (langs[0] || null));
            showNewForm    = false;

            loadDoc();
            render();
            showCaptionsOf(lang);

            if (timelineElement()) { timelineElement().addEventListener('click', onTimelineClick); }

        } else if (oldEditMode === 'transcripts' && editMode !== 'transcripts') {

            flush();
            closeMenu();
            clearTimeline();

            if (timelineElement()) { timelineElement().removeEventListener('click', onTimelineClick); }
            selectedCue = null;

            editor    = null;
            cueList   = null;
            message   = null;
            activeCue = null;
            pointerInList = false;

            // Note: do NOT clear ViewVideo.EditingOptions here (see ChaptersController.toggleEditMode).

            if (captionsBefore !== null) {
                FrameTrail.changeState('hv_config_captionsVisible', captionsBefore);
                captionsBefore = null;
            }

        }

        if (!editMode) {
            stopGeneration();
        }

    }

    /**
     * I forget the hypervideo being replaced (HypervideoModel.updateHypervideo()), and stop a transcriber working on it.
     * @method reset
     */
    function reset() {
        stopGeneration();
        clearTimeline();
        lang        = null;
        doc         = null;
        cues        = [];
        selectedCue = null;
    }


    return {

        onChange: {
            editMode: toggleEditMode
        },

        subtitlesChanged: subtitlesChanged,
        updateActiveCue:  updateActiveCue,
        cueRanges:        cueRanges,
        selectCue:        selectCue,
        flush:            flush,
        reset:            reset

    };

});
