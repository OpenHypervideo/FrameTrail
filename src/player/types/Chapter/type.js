/**
 * @module Player
 */


/**
 * I am the type definition of a Chapter.
 *
 * A chapter marks a named point in time; it visually spans from its own start
 * up to the start of the following chapter (the last chapter spans to the end
 * of the video). Chapters are managed by the {{#crossLink "ChaptersController"}}ChaptersController{{/crossLink}}.
 *
 * My data object ({ start, title }) is owned by the {{#crossLink "Database"}}Database{{/crossLink}}
 * (database.chapters) and serialized into hypervideo.json — I only wrap it by reference.
 *
 * @class Chapter
 * @category TypeDefinition
 */



FrameTrail.defineType(

    'Chapter',

    function (FrameTrail) {
        return {
            constructor: function(data){

                this.labels = FrameTrail.module('Localization').labels;

                this.data = data;

                var _wrapper = document.createElement('div');
                _wrapper.innerHTML = '<div class="timelineElement chapterBlock" data-type="chapter">'
                    + '<div class="chapterResizeHandle ui-resizable-handle"></div>'
                    + '<div class="chapterBlockLabel"></div>'
                    + '</div>';
                this.timelineElement = _wrapper.firstElementChild;

            },
            prototype: {

                /**
                 * I hold the data object of a Chapter ({ start, title }), which is stored in the
                 * {{#crossLink "Database"}}Database{{/crossLink}} and saved in the hypervideo.json file.
                 * @attribute data
                 * @type {}
                 */
                data:                   {},

                /**
                 * I hold the timelineElement (a spanning block indicating my start and my extent).
                 * @attribute timelineElement
                 * @type HTMLElement
                 */
                timelineElement:        null,


                /**
                 * I render my {{#crossLink "Chapter/timelineElement:attribute"}}timelineElement{{/crossLink}}
                 * into the DOM. I am called when the Chapter is initialized.
                 *
                 * @method renderTimelineInDOM
                 */
                renderTimelineInDOM: function () {

                    var ViewVideo = FrameTrail.module('ViewVideo');

                    this.updateLabel();

                    var timelineTarget = ViewVideo.ChapterTimeline.querySelector('.timelineScroller');
                    (timelineTarget || ViewVideo.ChapterTimeline).appendChild(this.timelineElement);

                },


                /**
                 * I update my block label from my title (or a placeholder when empty).
                 * @method updateLabel
                 */
                updateLabel: function () {

                    var labelEl = this.timelineElement.querySelector('.chapterBlockLabel');
                    labelEl.textContent = this.data.title || this.labels['ChapterUntitled'];
                    labelEl.classList.toggle('placeholder', !this.data.title);

                },


                /**
                 * I position my block within the timeline. The left edge maps to my start time,
                 * the width spans up to the next chapter's start (passed in by the controller).
                 *
                 * @method updateTimelineElement
                 * @param {Number} nextStart - The start time of the following chapter, or the end of the video for the last chapter.
                 */
                updateTimelineElement: function (nextStart) {

                    var HypervideoModel = FrameTrail.module('HypervideoModel'),
                        duration        = HypervideoModel.duration,
                        offsetIn        = HypervideoModel.offsetIn,
                        leftPercent     = 100 * ((this.data.start - offsetIn) / duration),
                        widthPercent    = 100 * ((nextStart - this.data.start) / duration);

                    if (widthPercent < 0) { widthPercent = 0; }

                    this.timelineElement.style.left  = leftPercent + '%';
                    this.timelineElement.style.width = widthPercent + '%';

                    // Hide the label when the block is too narrow to read it
                    this.timelineElement.classList.toggle('narrow', widthPercent < 6);

                },


                /**
                 * I remove my element from the DOM. I am called when a Chapter is deleted.
                 * @method removeFromDOM
                 */
                removeFromDOM: function () {

                    this.timelineElement.remove();

                },


                /**
                 * I mark myself as highlighted (in focus), or remove the highlight.
                 * @method setHighlighted
                 * @param {Boolean} highlighted
                 */
                setHighlighted: function (highlighted) {

                    this.timelineElement.classList.toggle('highlighted', !!highlighted);

                },


                /**
                 * I am called when the app switches to the editMode "chapters".
                 *
                 * I make my left edge draggable (to change my start time) and add a click
                 * handler for putting myself into focus.
                 *
                 * @method startEditing
                 */
                startEditing: function () {

                    var self = this,
                        block = this.timelineElement,
                        handle = block.querySelector('.chapterResizeHandle');

                    block.classList.add('editable-block');

                    // Click on the block (but not the drag handle) selects this chapter.
                    this._clickHandler = function(evt) {
                        if (evt.target.closest('.chapterResizeHandle')) { return; }
                        FrameTrail.module('ChaptersController').setChapterInFocus(self);
                        FrameTrail.module('HypervideoController').currentTime = self.data.start;
                    };
                    block.addEventListener('click', this._clickHandler);

                    // Drag the left edge to change this chapter's start time.
                    interact(handle).draggable({
                        listeners: {
                            start: function(e) {
                                self._dragOldStart = self.data.start;
                                block.classList.add('dragging');
                                FrameTrail.module('ChaptersController').setChapterInFocus(self);
                            },
                            move: function(e) {

                                var ViewVideo       = FrameTrail.module('ViewVideo'),
                                    scroller        = ViewVideo.ChapterTimeline.querySelector('.timelineScroller') || ViewVideo.ChapterTimeline,
                                    rect            = scroller.getBoundingClientRect(),
                                    scrollerWidth   = scroller.offsetWidth,
                                    HypervideoModel = FrameTrail.module('HypervideoModel'),
                                    duration        = HypervideoModel.duration,
                                    offsetIn        = HypervideoModel.offsetIn;

                                if (scrollerWidth === 0 || duration === 0) { return; }

                                var fraction = (e.clientX - rect.left) / scrollerWidth;
                                fraction = Math.max(0, Math.min(1, fraction));

                                var newStart = offsetIn + fraction * duration;
                                newStart = FrameTrail.module('ChaptersController').clampChapterStart(self, newStart);

                                self.data.start = newStart;

                                FrameTrail.module('ChaptersController').layoutChapters();
                                FrameTrail.module('ChaptersController').syncListRow(self);

                                FrameTrail.module('HypervideoController').currentTime = newStart;

                            },
                            end: function(e) {

                                block.classList.remove('dragging');

                                FrameTrail.module('HypervideoModel').newUnsavedChange('chapters');
                                FrameTrail.module('HypervideoController').updateChapterDisplay();

                            }
                        }
                    });

                },


                /**
                 * When the global editMode leaves the state "chapters", I stop my editing features.
                 * @method stopEditing
                 */
                stopEditing: function () {

                    var block  = this.timelineElement,
                        handle = block.querySelector('.chapterResizeHandle');

                    try { interact(handle).unset(); } catch (ex) {}

                    block.classList.remove('editable-block', 'dragging', 'highlighted');

                    if (this._clickHandler) {
                        block.removeEventListener('click', this._clickHandler);
                        this._clickHandler = null;
                    }

                }


            }


        }
    }

);
