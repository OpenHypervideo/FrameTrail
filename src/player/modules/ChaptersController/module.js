/**
 * @module Player
 */


/**
 * I am the ChaptersController. I am responsible for managing all the {{#crossLink "Chapter"}}chapters{{/crossLink}}
 * of the current {{#crossLink "HypervideoModel"}}HypervideoModel{{/crossLink}}, and for displaying them for editing.
 *
 * In the editMode "chapters" I show the chapters as spanning blocks on a dedicated timeline (each block
 * reaches from its own start up to the next chapter's start), and I render a persistent, editable chapter
 * list into the EditingOptions panel. The timeline blocks and the list are kept in two-way sync — both edit
 * the same {{#crossLink "Chapter/data:attribute"}}Chapter.data{{/crossLink}} objects.
 *
 * @class ChaptersController
 * @static
 */



FrameTrail.defineModule('ChaptersController', function(FrameTrail){

    var labels = FrameTrail.module('Localization').labels;

    var ViewVideo       = FrameTrail.module('ViewVideo'),
        chapterInFocus  = null,
        MIN_GAP         = 0.05; // minimum seconds between two chapter starts (prevents zero-width blocks)


    /**
     * I return a copy of the model's chapters sorted by start time.
     * @method getSortedChapters
     * @return {Array} array of Chapter objects
     * @private
     */
    function getSortedChapters() {
        return FrameTrail.module('HypervideoModel').chapters.slice().sort(function(a, b) {
            return a.data.start - b.data.start;
        });
    }


    /**
     * I keep the persistent model and database chapter arrays sorted by start time.
     * @method sortChapters
     * @private
     */
    function sortChapters() {
        FrameTrail.module('HypervideoModel').chapters.sort(function(a, b) { return a.data.start - b.data.start; });
        FrameTrail.module('Database').chapters.sort(function(a, b) { return a.start - b.start; });
    }


    /**
     * I tell all chapters to render their blocks into the DOM and lay them out.
     * @method initController
     */
    function initController() {

        var chapters = FrameTrail.module('HypervideoModel').chapters;

        for (var i = 0; i < chapters.length; i++) {
            chapters[i].renderTimelineInDOM();
        }

        layoutChapters();

    };


    /**
     * I (re-)position all chapter blocks. Each block spans from its own start up to the next
     * chapter's start; the last chapter spans to the end of the video.
     * @method layoutChapters
     */
    function layoutChapters() {

        var HypervideoModel = FrameTrail.module('HypervideoModel'),
            videoEnd        = HypervideoModel.offsetIn + HypervideoModel.duration,
            sorted          = getSortedChapters();

        for (var i = 0; i < sorted.length; i++) {
            var nextStart = (i + 1 < sorted.length) ? sorted[i + 1].data.start : videoEnd;
            sorted[i].updateTimelineElement(nextStart);
        }

    };


    /**
     * I clamp a proposed new start time for a chapter so it stays strictly between its
     * neighbours (and within the video bounds). Used while dragging a block's left edge,
     * so a drag never reorders chapters.
     * @method clampChapterStart
     * @param {Chapter} chapter
     * @param {Number} value - proposed new start (seconds)
     * @return {Number}
     */
    function clampChapterStart(chapter, value) {

        var HypervideoModel = FrameTrail.module('HypervideoModel'),
            offsetIn        = HypervideoModel.offsetIn,
            videoEnd        = offsetIn + HypervideoModel.duration,
            sorted          = getSortedChapters(),
            idx             = sorted.indexOf(chapter),
            lowerBound      = offsetIn,
            upperBound      = videoEnd;

        if (idx > 0)                  { lowerBound = sorted[idx - 1].data.start + MIN_GAP; }
        if (idx < sorted.length - 1)  { upperBound = sorted[idx + 1].data.start - MIN_GAP; }

        if (upperBound < lowerBound)  { upperBound = lowerBound; }

        return Math.max(lowerBound, Math.min(upperBound, value));

    };


    /**
     * I render the persistent, editable chapter list into the EditingOptions panel.
     * Each row lets the user edit a chapter's start time and title, or delete it, and stays
     * in sync with the timeline blocks.
     * @method renderChapterList
     */
    function renderChapterList() {

        var formBuilder = FrameTrail.module('HypervideoFormBuilder'),
            sorted      = getSortedChapters();

        ViewVideo.EditingOptions.innerHTML = '';

        var _wrapper = document.createElement('div');
        _wrapper.innerHTML = '<div class="chaptersEditor">'
            + '<div class="message active"><span class="icon-list-bullet"></span> ' + labels['ChaptersEditHint'] + '</div>'
            + '<button type="button" class="chaptersAddButton">'+ labels['ChapterAdd'] +' <span class="icon-plus"></span></button>'
            + '<div class="chaptersEditorList"></div>'
            + '</div>';
        var editor = _wrapper.firstElementChild;

        editor.querySelector('.chaptersAddButton').addEventListener('click', function() {
            addChapterAtPlayhead();
        });

        var list = editor.querySelector('.chaptersEditorList');

        sorted.forEach(function(chapter) {
            list.appendChild(buildChapterRow(chapter, formBuilder));
        });

        ViewVideo.EditingOptions.appendChild(editor);

        // Re-apply focus highlight to the row of the currently focused chapter
        if (chapterInFocus) {
            var focusedRow = chapterInFocus._listRow;
            if (focusedRow) { focusedRow.classList.add('highlighted'); }
        }

    };


    /**
     * I build a single chapter list row and wire its events.
     * @method buildChapterRow
     * @param {Chapter} chapter
     * @param {HypervideoFormBuilder} formBuilder
     * @return HTMLElement
     * @private
     */
    function buildChapterRow(chapter, formBuilder) {

        var _rw = document.createElement('div');
        _rw.innerHTML = '<div class="chapterRow">'
            + '<input type="time" class="chapterStartInput" step="1">'
            + '<input type="text" class="chapterTitleInput" placeholder="'+ labels['SettingsChapterTitle'] +'">'
            + '<button type="button" class="chapterDeleteButton"><span class="icon-cancel"></span></button>'
            + '</div>';
        var row = _rw.firstElementChild;

        var startInput = row.querySelector('.chapterStartInput'),
            titleInput = row.querySelector('.chapterTitleInput');

        startInput.value = formBuilder.secondsToTimeString(chapter.data.start);
        titleInput.value = chapter.data.title || '';

        // Cross-reference row <-> chapter for two-way sync
        row._chapter = chapter;
        chapter._listRow = row;

        // Title: live update (no re-render, so the input keeps focus while typing)
        titleInput.addEventListener('input', function() {
            chapter.data.title = titleInput.value;
            chapter.updateLabel();
            FrameTrail.module('HypervideoModel').newUnsavedChange('chapters');
        });

        // Start time: applied on change (blur/enter); may reorder, so re-sort + re-render
        startInput.addEventListener('change', function() {
            var HypervideoModel = FrameTrail.module('HypervideoModel'),
                offsetIn        = HypervideoModel.offsetIn,
                videoEnd        = offsetIn + HypervideoModel.duration,
                newStart        = formBuilder.timeStringToSeconds(startInput.value);

            newStart = Math.max(offsetIn, Math.min(videoEnd, newStart));
            chapter.data.start = newStart;

            sortChapters();
            layoutChapters();
            renderChapterList();
            FrameTrail.module('HypervideoModel').newUnsavedChange('chapters');
            FrameTrail.module('HypervideoController').updateChapterDisplay();
        });

        row.querySelector('.chapterDeleteButton').addEventListener('click', function() {
            deleteChapter(chapter);
        });

        // Clicking the row (but not an input/button) focuses the chapter and seeks to it
        row.addEventListener('click', function(evt) {
            if (evt.target.closest('input, button')) { return; }
            setChapterInFocus(chapter);
            FrameTrail.module('HypervideoController').currentTime = chapter.data.start;
        });

        return row;

    };


    /**
     * I update the list row's start-time input for a chapter without re-rendering the whole
     * list. Called live while dragging a block's left edge.
     * @method syncListRow
     * @param {Chapter} chapter
     */
    function syncListRow(chapter) {

        if (chapter._listRow) {
            var startInput = chapter._listRow.querySelector('.chapterStartInput');
            if (startInput) {
                startInput.value = FrameTrail.module('HypervideoFormBuilder').secondsToTimeString(chapter.data.start);
            }
        }

    };


    /**
     * I create a new chapter at the current playhead position, add it to the timeline and list,
     * and put it into focus.
     * @method addChapterAtPlayhead
     */
    function addChapterAtPlayhead() {

        var startTime  = FrameTrail.module('HypervideoController').currentTime,
            newChapter = FrameTrail.module('HypervideoModel').newChapter({
                "start": startTime,
                "title": ''
            });

        newChapter.renderTimelineInDOM();
        newChapter.startEditing();

        sortChapters();
        layoutChapters();
        renderChapterList();

        setChapterInFocus(newChapter);
        FrameTrail.module('HypervideoController').updateChapterDisplay();

        // Focus the new chapter's title input for immediate naming
        if (newChapter._listRow) {
            var titleInput = newChapter._listRow.querySelector('.chapterTitleInput');
            if (titleInput) { titleInput.focus(); }
        }

    };


    /**
     * I delete a chapter from the model, the timeline and the list.
     * @method deleteChapter
     * @param {Chapter} chapter
     */
    function deleteChapter(chapter) {

        if (chapterInFocus === chapter) { chapterInFocus = null; }

        chapter.removeFromDOM();
        FrameTrail.module('HypervideoModel').removeChapter(chapter);

        sortChapters();
        layoutChapters();
        renderChapterList();
        FrameTrail.module('HypervideoController').updateChapterDisplay();

    };


    /**
     * I set the given chapter into focus (highlighting its block and list row), removing the
     * highlight from any previously focused chapter. Pass null to clear the focus.
     * @method setChapterInFocus
     * @param {Chapter} chapter
     */
    function setChapterInFocus(chapter) {

        if (chapterInFocus && chapterInFocus !== chapter) {
            chapterInFocus.setHighlighted(false);
            if (chapterInFocus._listRow) { chapterInFocus._listRow.classList.remove('highlighted'); }
        }

        chapterInFocus = chapter;

        if (chapterInFocus) {
            chapterInFocus.setHighlighted(true);
            if (chapterInFocus._listRow) {
                chapterInFocus._listRow.classList.add('highlighted');
                chapterInFocus._listRow.scrollIntoView({ block: 'nearest' });
            }
        }

    };


    /**
     * I listen to the global state 'editMode'.
     * When entering "chapters" I prepare the chapter blocks for editing and render the list.
     * When leaving I clean up.
     *
     * @method toggleEditMode
     * @param {String} editMode
     * @param {String} oldEditMode
     */
    function toggleEditMode(editMode, oldEditMode) {

        var chapters = FrameTrail.module('HypervideoModel').chapters;

        if (editMode === 'chapters' && oldEditMode !== 'chapters') {

            for (var i = 0; i < chapters.length; i++) {
                chapters[i].startEditing();
            }

            layoutChapters();
            renderChapterList();

        } else if (oldEditMode === 'chapters' && editMode !== 'chapters') {

            for (var j = 0; j < chapters.length; j++) {
                chapters[j].stopEditing();
            }

            setChapterInFocus(null);
            // Note: do NOT clear ViewVideo.EditingOptions here. When switching to another edit
            // mode, that mode's initEditOptions() clears+populates EditingOptions itself; module
            // onChange order is not guaranteed, so clearing here can race and wipe the new mode's
            // content. When fully leaving edit mode, the panel is hidden anyway.

            FrameTrail.module('HypervideoController').updateChapterDisplay();

        }

    };


    /**
     * I react to changes in the global state viewSizeChanged (window resize).
     * @method onViewSizeChanged
     * @private
     */
    function onViewSizeChanged() {
        if (FrameTrail.getState('editMode') === 'chapters') {
            layoutChapters();
        }
    };


    return {

        onChange: {
            editMode:        toggleEditMode,
            viewSizeChanged: onViewSizeChanged
        },

        initController:      initController,
        layoutChapters:      layoutChapters,
        clampChapterStart:   clampChapterStart,
        renderChapterList:   renderChapterList,
        syncListRow:         syncListRow,
        addChapterAtPlayhead: addChapterAtPlayhead,
        deleteChapter:       deleteChapter,
        setChapterInFocus:   setChapterInFocus

    };

});
