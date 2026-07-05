/**
 * @module Player
 */


/**
 * I am the type definition of a CodeSnippet.
 *
 * A code snippet is a short piece of code which is executed at a certain point of time.
 *
 * CodeSnippets are managed by the {{#crossLink "CodeSnippetsController"}}CodeSnippetsController{{/crossLink}}.
 *
 * @class CodeSnippet
 * @category TypeDefinition
 */



FrameTrail.defineType(

    'CodeSnippet',

    function (FrameTrail) {
        return {
            constructor: function(data){

                this.labels = FrameTrail.module('Localization').labels;

                this.data = data;

                var _csWrapper = document.createElement('div');
                _csWrapper.innerHTML = '<div class="timelineElement" data-type="codesnippet"><div class="timelineElementIcon"><span class="icon-code"></span></div><div class="timelineElementLabel"></div><div class="previewWrapper"></div></div>';
                this.timelineElement = _csWrapper.firstElementChild;
                this.codeSnippetFunction = new Function('');


            },
            prototype: {

                /**
                 * I hold the data object of a CodeSnippet, which is stored in the {{#crossLink "Database"}}Database{{/crossLink}} and saved in the hypervideos's codeSnippets.json file.
                 * @attribute data
                 * @type {}
                 */
                data:                   {},

                /**
                 * I hold the timelineElement (a jquery-enabled HTMLElement), which indicates my start and end time.
                 * @attribute timelineElement
                 * @type HTMLElement
                 */
                timelineElement:        null,

                /**
                 * I hold the codeSnippetFunction, which will be executed at a certain point of time.
                 * @attribute codeSnippetElement
                 * @type HTMLElement
                 */
                codeSnippetFunction:    null,

                /**
                 * I hold the codeEditorInstance (if initialized).
                 * @attribute codeEditorInstance
                 * @type HTMLElement
                 */
                codeEditorInstance:    null,

                /**
                 * I store my state, wether I am "active" (this is, when my timelineElement and tileElements are highlighted) or not.
                 * @attribute activeState
                 * @type Boolean
                 */
                activeState:            false,


                /**
                 * I store my state, wether I am "in focus" or not. See also:
                 * * {{#crossLink "CodeSnippet/gotInFocus:method"}}CodeSnippet/gotInFocus(){{/crossLink}}
                 * * {{#crossLink "CodeSnippet/removedFromFocus:method"}}CodeSnippet/removedFromFocus(){{/crossLink}}
                 * * {{#crossLink "CodeSnippetsController/codeSnippetInFocus:attribute"}}CodeSnippetsController/codeSnippetInFocus{{/crossLink}}
                 * @attribute permanentFocusState
                 * @type Boolean
                 */
                permanentFocusState:    false,


                /**
                 * I render my ({{#crossLink "CodeSnippet/timelineElement:attribute"}}this.timelineElement{{/crossLink}}
                 * into the DOM.
                 *
                 * I am called, when the CodeSnippet is initialized.
                 *
                 * @method renderTimelineInDOM
                 */
                renderTimelineInDOM: function () {

                    var ViewVideo = FrameTrail.module('ViewVideo');

                    // Set label from snippet name
                    var label = this.data.name || 'Code Snippet';
                    this.timelineElement.querySelector('.timelineElementLabel').textContent = label;

                    if (this._brushInHandler)  { this.timelineElement.removeEventListener('mouseenter', this._brushInHandler); }
                    if (this._brushOutHandler) { this.timelineElement.removeEventListener('mouseleave', this._brushOutHandler); }
                    this._brushInHandler  = this.brushIn.bind(this);
                    this._brushOutHandler = this.brushOut.bind(this);
                    this.timelineElement.addEventListener('mouseenter', this._brushInHandler);
                    this.timelineElement.addEventListener('mouseleave', this._brushOutHandler);

                    // Preview wrapper with code snippet preview
                    var snippetPreview = this.data.snippet ? this.data.snippet.substring(0, 100) : '';
                    var _he = document.createElement('div'); _he.textContent = snippetPreview;
                    var _escapedPreview = _he.innerHTML;
                    var _pw = document.createElement('div');
                    _pw.innerHTML = '<div class="resourceThumb" data-type="text"><div class="resourceTextPreview">' + _escapedPreview + '</div></div>';
                    var previewEl = this.timelineElement.querySelector('.previewWrapper');
                    previewEl.innerHTML = '';
                    previewEl.append(_pw.firstElementChild);

                    var timelineTarget = ViewVideo.CodeSnippetTimeline.querySelector('.timelineScroller');
                    (timelineTarget || ViewVideo.CodeSnippetTimeline).appendChild(this.timelineElement);
                    this.updateTimelineElement();


                },

                /**
                 * I init my ({{#crossLink "CodeSnippet/codeSnippetFunction:attribute"}}this.codeSnippetFunction{{/crossLink}}
                 *
                 * I am called, when the CodeSnippet is initialized, and also every time, when the global state "editMode" leaves the state
                 * "codesnippets". This is the case, when the user has finished his/her changes to the CodeSnippets.
                 *
                 * @method initCodeSnippetFunction
                 */
                initCodeSnippetFunction: function () {

                    try {
                        this.codeSnippetFunction = new Function('FrameTrail', 'hypervideo', this.data.snippet);
                    } catch (exception) {
                        // could not parse and compile JS code!
                        console.warn(this.labels['MessageCodeContainsErrors'] +': '+ exception.message);
                    }

                },


                /**
                 * I remove all my elements from the DOM. I am called when a CodeSnippet is to be deleted.
                 * @method removeFromDOM
                 */
                removeFromDOM: function () {

                    this.timelineElement.remove();

                },

                /**
                 * I update the CSS of the {{#crossLink "CodeSnippet/timelineElement:attribute"}}timelineElement{{/crossLink}}
                 * to its correct position within the timeline.
                 *
                 * @method updateTimelineElement
                 */
                updateTimelineElement: function () {

                    var HypervideoModel = FrameTrail.module('HypervideoModel'),
                        videoDuration   = HypervideoModel.duration,
                        positionLeft    = 100 * ((this.data.start - HypervideoModel.offsetIn) / videoDuration);

                    this.timelineElement.style.top = '';
                    this.timelineElement.style.left = positionLeft + '%';
                    this.timelineElement.style.right = '';

                    this.timelineElement.classList.remove('previewPositionLeft', 'previewPositionRight');

                    if (positionLeft < 10) {
                        this.timelineElement.classList.add('previewPositionLeft');
                    } else if (positionLeft > 90) {
                        this.timelineElement.classList.add('previewPositionRight');
                    }

                },



                /**
                 * When I am scheduled to be executed, this is the method to be called.
                 * @method setActive
                 */
                setActive: function () {

                    this.activeState = true;

                    this.timelineElement.classList.add('active');

                    try {
                        this.codeSnippetFunction(FrameTrail, FrameTrail.module('HypervideoController'));
                    } catch (exception) {
                        // do some user error feedback (ex.message)
                        console.warn(this.labels['MessageCodeContainsErrors'] +': '+ exception.message);
                    }

                },

                /**
                 * When I am scheduled to disappear, this is the method to be called.
                 * @method setInactive
                 */
                setInactive: function () {

                    this.activeState = false;

                    this.timelineElement.classList.remove('active');

                },


                /**
                 * I am called when the mouse pointer is hovering over one of my tile or my timeline element
                 * @method brushIn
                 */
                brushIn: function () {

                    this.timelineElement.classList.add('brushed');

                },

                /**
                 * I am called when the mouse pointer is leaving the hovering area over my tile or my timeline element.
                 * @method brushOut
                 */
                brushOut: function () {

                    this.timelineElement.classList.remove('brushed');

                },

                /**
                 * I am called when the app switches to the editMode "codesnippets".
                 *
                 * I make sure
                 * * that my {{#crossLink "CodeSnippet/timelineElement:attribute"}}timelineElement{{/crossLink}} is resizable and draggable
                 * * and that it has a click handler for putting myself into focus.
                 *
                 * @method startEditing
                 */
                startEditing: function () {


                    var self = this,
                        CodeSnippetsController = FrameTrail.module('CodeSnippetsController');

                    this.makeTimelineElementDraggable();

                    this._clickHandler = function(){

                        if (CodeSnippetsController.codeSnippetInFocus === self){
                            return CodeSnippetsController.codeSnippetInFocus = null;
                        }

                        self.permanentFocusState = true;
                        CodeSnippetsController.codeSnippetInFocus = self;

                        FrameTrail.module('HypervideoController').currentTime = self.data.start;

                    };
                    this.timelineElement.addEventListener('click', this._clickHandler);


                },

                /**
                 * When the global editMode leaves the state "codesnippets", I am called to
                 * stop the editing features of the code snippet.
                 *
                 * @method stopEditing
                 */
                stopEditing: function () {

                    try { interact(this.timelineElement).unset(); } catch (ex) {}
                    this.timelineElement.classList.remove('ui-draggable', 'ui-draggable-dragging');

                    if (this._clickHandler) { this.timelineElement.removeEventListener('click', this._clickHandler); this._clickHandler = null; }


                },


                /**
                 * I make my {{#crossLink "CodeSnippet/timelineElement:attribute"}}timelineElement{{/crossLink}} draggable.
                 *
                 * The event handling changes my this.data.start and this.data.end attributes
                 * accordingly.
                 *
                 * @method makeTimelineElementDraggable
                 */
                makeTimelineElementDraggable: function () {

                    var self = this,
                        oldStart;

                    var el = this.timelineElement;
                    this.timelineElement.classList.add('ui-draggable');

                    interact(el).draggable({
                        listeners: {
                            start: function(e) {

                                if (!self.permanentFocusState) {
                                    FrameTrail.module('CodeSnippetsController').codeSnippetInFocus = self;
                                }

                                // Capture old value for undo
                                oldStart = self.data.start;

                                e.target.dataset.ftX    = e.target.offsetLeft;
                                e.target.dataset.ftRawX = e.target.offsetLeft;
                                e.target.style.left     = e.target.offsetLeft + 'px';
                                e.target.classList.add('ui-draggable-dragging');

                            },

                            move: function(e) {

                                var rawX = parseFloat(e.target.dataset.ftRawX) + e.dx;
                                e.target.dataset.ftRawX = rawX;
                                var x           = rawX;
                                var parentWidth = e.target.parentElement.offsetWidth;
                                var elWidth     = e.target.offsetWidth;

                                var ViewVideo = FrameTrail.module('ViewVideo');
                                var snapTargets = ViewVideo.getTimelineSnapTargets(e.target.parentElement, e.target);
                                var snapTolerance = 8;
                                var snappedLeft = ViewVideo.closestSnapTarget(x, snapTargets, snapTolerance);

                                if (snappedLeft !== null) {
                                    x = snappedLeft;
                                    ViewVideo.showTimelineSnapIndicator(e.target.parentElement, x);
                                } else {
                                    ViewVideo.hideTimelineSnapIndicator();
                                }

                                x = Math.max(0, Math.min(parentWidth - elWidth, x));

                                e.target.style.left  = x + 'px';
                                e.target.dataset.ftX = x;

                                var HypervideoModel = FrameTrail.module('HypervideoModel'),
                                    videoDuration = HypervideoModel.duration,
                                    leftPercent   = 100 * (x / parentWidth),
                                    newStartValue = (leftPercent * (videoDuration / 100)) + HypervideoModel.offsetIn;

                                FrameTrail.module('HypervideoController').currentTime = newStartValue;

                            },

                            end: function(e) {

                                if (!self.permanentFocusState) {
                                    FrameTrail.module('CodeSnippetsController').codeSnippetInFocus = null;
                                }

                                e.target.classList.remove('ui-draggable-dragging');

                                FrameTrail.module('ViewVideo').hideTimelineSnapIndicator();

                                var x           = parseFloat(e.target.dataset.ftX);
                                var parentWidth = e.target.parentElement.offsetWidth;

                                var HypervideoModel = FrameTrail.module('HypervideoModel'),
                                    videoDuration = HypervideoModel.duration,
                                    leftPercent   = 100 * (x / parentWidth);

                                var newStart = (leftPercent * (videoDuration / 100)) + HypervideoModel.offsetIn;
                                self.data.start = newStart;

                                self.updateTimelineElement();

                                FrameTrail.module('CodeSnippetsController').stackTimelineView();

                                FrameTrail.module('HypervideoModel').newUnsavedChange('codeSnippets');

                                // Register undo command for timeline drag
                                (function(codeSnippetId, capturedOldStart, capturedNewStart) {
                                    var findCodeSnippet = function() {
                                        var codeSnippets = FrameTrail.module('HypervideoModel').codeSnippets;
                                        for (var i = 0; i < codeSnippets.length; i++) {
                                            if (codeSnippets[i].data.created === codeSnippetId) {
                                                return codeSnippets[i];
                                            }
                                        }
                                        return null;
                                    };
                                    FrameTrail.module('UndoManager').register({
                                        category: 'codeSnippets',
                                        description: self.labels['SidebarCustomCode'] + ' Move',
                                        undo: function() {
                                            var codeSnippet = findCodeSnippet();
                                            if (!codeSnippet) return;
                                            codeSnippet.data.start = capturedOldStart;
                                            codeSnippet.updateTimelineElement();
                                            FrameTrail.module('CodeSnippetsController').stackTimelineView();
                                            FrameTrail.module('HypervideoModel').newUnsavedChange('codeSnippets');
                                        },
                                        redo: function() {
                                            var codeSnippet = findCodeSnippet();
                                            if (!codeSnippet) return;
                                            codeSnippet.data.start = capturedNewStart;
                                            codeSnippet.updateTimelineElement();
                                            FrameTrail.module('CodeSnippetsController').stackTimelineView();
                                            FrameTrail.module('HypervideoModel').newUnsavedChange('codeSnippets');
                                        }
                                    });
                                })(self.data.created, oldStart, newStart);

                            }
                        }
                    });

                },


                /**
                 * When I "got into focus" (which happens, when I become the referenced object in the CodeSnippetsController's
                 * {{#crossLink "CodeSnippetsController/codeSnippetInFocus:attribute"}}codeSnippetInFocus attribute{{/crossLink}}),
                 * then this method will be called.
                 *
                 * @method gotInFocus
                 */
                gotInFocus: function () {

                    var EditPropertiesContainer = FrameTrail.module('ViewVideo').EditPropertiesContainer,
                        self = this;

                    EditPropertiesContainer.innerHTML = '';

                    var _pcWrapper = document.createElement('div');
                    _pcWrapper.innerHTML = '<div>'
                                        + '    <div class="propertiesTypeIcon" data-type="codesnippet"><span class="icon-code"></span></div>'
                                        + '    <textarea class="codeSnippetCode">' + this.data.snippet + '</textarea>'
                                        + '    <button class="deleteCodeSnippet">'+ this.labels['GenericDelete'] +'</button>'
                                        + '    <button class="executeCodeSnippet">'+ this.labels['SettingsTestCode'] +'</button>'
                                        + '</div>';
                    var propertiesControls = _pcWrapper.firstElementChild;

                    propertiesControls.querySelector('.deleteCodeSnippet').addEventListener('click', function() {
                        FrameTrail.module('CodeSnippetsController').deleteCodeSnippet(self);
                    });

                    propertiesControls.querySelector('.executeCodeSnippet').addEventListener('click', function() {
                        try {
                            var testRun = new Function('FrameTrail', 'hypervideo', self.data.snippet);
                            testRun(FrameTrail, FrameTrail.module('HypervideoController'));
                        } catch (exception) {
                            alert('Code contains errors: '+ exception.message);
                        }
                    });

                    EditPropertiesContainer.classList.add('active');
                    EditPropertiesContainer.append(propertiesControls);
                    FrameTrail.module('ViewVideo').switchInfoTab('properties');


                    var snippetElement = propertiesControls.querySelector('.codeSnippetCode'),
                        snippet = snippetElement.value;

                    var CM6 = window.FrameTrailCM6;
                    var editorHeight = EditPropertiesContainer.offsetHeight - 70;
                    var cm6Wrapper = document.createElement('div');
                    cm6Wrapper.className = 'cm6-wrapper';
                    cm6Wrapper.style.height = editorHeight + 'px';
                    snippetElement.insertAdjacentElement('afterend', cm6Wrapper);
                    snippetElement.style.display = 'none';

                    // Capture initial value for undo
                    this._snippetBeforeEdit = this.data.snippet;
                    this._snippetChanged = false;

                    var codeEditor = new CM6.EditorView({
                        state: CM6.EditorState.create({
                            doc: snippet,
                            extensions: [
                                CM6.oneDark,
                                CM6.lineNumbers(),
                                CM6.highlightActiveLine(),
                                CM6.highlightActiveLineGutter(),
                                CM6.drawSelection(),
                                CM6.history(),
                                CM6.keymap.of([].concat(CM6.defaultKeymap, CM6.historyKeymap)),
                                CM6.EditorView.lineWrapping,
                                CM6.StreamLanguage.define(CM6.legacyModes.javascript),
                                window.FrameTrailCM6Linters.js,
                                CM6.lintGutter(),
                                CM6.EditorView.updateListener.of(function(update) {
                                    if (!update.docChanged) { return; }
                                    self.data.snippet = update.state.doc.toString();
                                    self.initCodeSnippetFunction();
                                    self._snippetChanged = true;
                                    FrameTrail.module('HypervideoModel').newUnsavedChange('codeSnippets');
                                })
                            ]
                        }),
                        parent: cm6Wrapper
                    });
                    cm6Wrapper._cm6view = codeEditor;

                    this.codeEditorInstance = codeEditor;
                    this.cm6Wrapper = cm6Wrapper;


                    this.timelineElement.classList.add('highlighted');


                },


                /**
                 * See also: {{#crossLink "CodeSnippet/gotIntoFocus:method"}}this.gotIntoFocus(){{/crossLink}}
                 *
                 * When I was "removed from focus" (which happens, when the CodeSnippetsController's
                 * {{#crossLink "CodeSnippetsController/codeSnippetInFocus:attribute"}}codeSnippetInFocus attribute{{/crossLink}}),
                 * is set either to null or to an other CodeSnippet than myself),
                 * then this method will be called.
                 *
                 * @method removedFromFocus
                 */
                removedFromFocus: function () {

                    var self = this;

                    // Register undo command if code was changed
                    if (this._snippetChanged && this._snippetBeforeEdit !== this.data.snippet) {
                        (function(codeSnippetId, capturedOldSnippet, capturedNewSnippet) {
                            var findCodeSnippet = function() {
                                var codeSnippets = FrameTrail.module('HypervideoModel').codeSnippets;
                                for (var i = 0; i < codeSnippets.length; i++) {
                                    if (codeSnippets[i].data.created === codeSnippetId) {
                                        return codeSnippets[i];
                                    }
                                }
                                return null;
                            };
                            FrameTrail.module('UndoManager').register({
                                category: 'codeSnippets',
                                description: self.labels['SidebarCustomCode'] + ' Edit',
                                undo: function() {
                                    var codeSnippet = findCodeSnippet();
                                    if (!codeSnippet) return;
                                    codeSnippet.data.snippet = capturedOldSnippet;
                                    codeSnippet.initCodeSnippetFunction();
                                    FrameTrail.module('HypervideoModel').newUnsavedChange('codeSnippets');
                                },
                                redo: function() {
                                    var codeSnippet = findCodeSnippet();
                                    if (!codeSnippet) return;
                                    codeSnippet.data.snippet = capturedNewSnippet;
                                    codeSnippet.initCodeSnippetFunction();
                                    FrameTrail.module('HypervideoModel').newUnsavedChange('codeSnippets');
                                }
                            });
                        })(this.data.created, this._snippetBeforeEdit, this.data.snippet);
                    }

                    this._snippetBeforeEdit = null;
                    this._snippetChanged = false;

                    var _ec = FrameTrail.module('ViewVideo').EditPropertiesContainer;
                    _ec.classList.remove('active');
                    _ec.innerHTML = '';
                    FrameTrail.module('ViewVideo').switchInfoTab('add');

                    this.codeEditorInstance = null;
                    this.timelineElement.classList.remove('highlighted');


                }



            }


        }
    }

);
