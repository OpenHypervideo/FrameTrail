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

                this.timelineElement  = $('<div class="timelineElement"></div>');
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

                    this.timelineElement.unbind('hover');
                    this.timelineElement.hover(this.brushIn.bind(this), this.brushOut.bind(this));
                    this.timelineElement.attr('title', this.data.snippet);

                    ViewVideo.CodeSnippetTimeline.append(this.timelineElement);
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
                        this.codeSnippetFunction = new Function('FrameTrail', this.data.snippet);
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

                    this.timelineElement.css({
                        top: '',
                        left:  positionLeft + '%',
                        right: ''
                    });

                },



                /**
                 * When I am scheduled to be executed, this is the method to be called.
                 * @method setActive
                 */
                setActive: function () {

                    this.activeState = true;

                    this.timelineElement.addClass('active');

                    try {
                        this.codeSnippetFunction(FrameTrail);
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

                    this.timelineElement.removeClass('active');

                },


                /**
                 * I am called when the mouse pointer is hovering over one of my tile or my timeline element
                 * @method brushIn
                 */
                brushIn: function () {

                    this.timelineElement.addClass('brushed');

                },

                /**
                 * I am called when the mouse pointer is leaving the hovering area over my tile or my timeline element.
                 * @method brushOut
                 */
                brushOut: function () {

                    this.timelineElement.removeClass('brushed');

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

                    this.timelineElement.on('click', function(){

                        if (CodeSnippetsController.codeSnippetInFocus === self){
                            return CodeSnippetsController.codeSnippetInFocus = null;
                        }

                        self.permanentFocusState = true;
                        CodeSnippetsController.codeSnippetInFocus = self;

                        FrameTrail.module('HypervideoController').currentTime = self.data.start;

                    });


                },

                /**
                 * When the global editMode leaves the state "codesnippets", I am called to
                 * stop the editing features of the code snippet.
                 *
                 * @method stopEditing
                 */
                stopEditing: function () {

                    if (this.timelineElement.data('ui-draggable')) {
                        this.timelineElement.draggable('destroy');
                    }
                    
                    this.timelineElement.unbind('click');


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

                    var self = this;


                    this.timelineElement.draggable({

                        axis:        'x',
                        containment: 'parent',
                        snapTolerance: 10,

                        drag: function(event, ui) {

                            var closestGridline = FrameTrail.module('ViewVideo').closestToOffset($(FrameTrail.getState('target')).find('.gridline'), {
                                    left: ui.position.left,
                                    top: ui.position.top
                                }),
                                snapTolerance = $(this).draggable('option', 'snapTolerance');

                            if (closestGridline) {

                                $(FrameTrail.getState('target')).find('.gridline').css('background-color', '#ff9900');

                                if ( ui.position.left - snapTolerance < closestGridline.position().left &&
                                     ui.position.left + snapTolerance > closestGridline.position().left ) {

                                    ui.position.left = closestGridline.position().left;

                                    closestGridline.css('background-color', '#00ff00');

                                }
                            }

                            var HypervideoModel = FrameTrail.module('HypervideoModel'),
                                videoDuration = HypervideoModel.duration,
                                leftPercent   = 100 * (ui.helper.position().left / ui.helper.parent().width()),
                                newStartValue = (leftPercent * (videoDuration / 100)) + HypervideoModel.offsetIn;

                            FrameTrail.module('HypervideoController').currentTime = newStartValue;

                        },

                        start: function(event, ui) {

                            if (!self.permanentFocusState) {
                                FrameTrail.module('CodeSnippetsController').codeSnippetInFocus = self;
                            }

                        },

                        stop: function(event, ui) {

                            if (!self.permanentFocusState) {
                                FrameTrail.module('CodeSnippetsController').codeSnippetInFocus = null;
                            }


                            var HypervideoModel = FrameTrail.module('HypervideoModel'),
                                videoDuration = HypervideoModel.duration,
                                leftPercent   = 100 * (ui.helper.position().left / ui.helper.parent().width());

                            self.data.start = (leftPercent * (videoDuration / 100)) + HypervideoModel.offsetIn;

                            self.updateTimelineElement();

                            FrameTrail.module('CodeSnippetsController').stackTimelineView();

                            FrameTrail.module('HypervideoModel').newUnsavedChange('codeSnippets');

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

                    EditPropertiesContainer.empty();

                    var propertiesControls = $('<div>'
                                             + '    <div class="propertiesTypeIcon" data-type="codesnippet"><span class="icon-code"></span></div>'
                                             + '    <textarea class="codeSnippetCode">' + this.data.snippet + '</textarea>'
                                             + '    <button class="deleteCodeSnippet">'+ this.labels['GenericDelete'] +'</button>'
                                             + '    <button class="executeCodeSnippet">'+ this.labels['SettingsTestCode'] +'</button>'
                                             + '</div>');

                    propertiesControls.find('.deleteCodeSnippet').click(function() {
                        FrameTrail.module('CodeSnippetsController').deleteCodeSnippet(self);
                    });

                    propertiesControls.find('.executeCodeSnippet').click(function() {
                        try {
                            var testRun = new Function('FrameTrail', self.data.snippet);
                            testRun(FrameTrail);
                        } catch (exception) {
                            alert('Code contains errors: '+ exception.message);
                        }
                    });

                    EditPropertiesContainer.addClass('active').append(propertiesControls);


                    var snippetElement = propertiesControls.find('.codeSnippetCode'),
                        snippet = snippetElement.val();

                    var codeEditor = CodeMirror.fromTextArea(snippetElement[0], {
                      value: snippet,
                      lineNumbers: true,
                      mode:  'javascript',
                      gutters: ['CodeMirror-lint-markers'],
                      lint: true,
                      lineWrapping: true,
                      tabSize: 2,
                      theme: 'hopscotch'
                    });

                    codeEditor.on('change', function(instance, changeObj) {
                        self.data.snippet = codeEditor.getValue();
                        self.initCodeSnippetFunction();

                        FrameTrail.module('HypervideoModel').newUnsavedChange('codeSnippets');
                    });

                    var editorHeight = FrameTrail.module('ViewVideo').EditPropertiesContainer.height() - 70;
                    codeEditor.setSize(null, editorHeight);

                    this.codeEditorInstance = codeEditor;


                    this.timelineElement.addClass('highlighted');


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

                    FrameTrail.module('ViewVideo').EditPropertiesContainer.removeClass('active').empty();

                    this.codeEditorInstance = null;
                    this.timelineElement.removeClass('highlighted');


                }



            }


        }
    }

);
