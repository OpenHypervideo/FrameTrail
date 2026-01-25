/**
 * @module Shared
 */


/**
 * I am the type definition of a ResourceQuiz.
 *
 * * Quiz Resources only appear in the 'Choose Custom Overlay' tab
 *   and are not listed in the ResourceManager.
 *
 * * Quiz Resources can not be used as Annotation
 *
 * @class ResourceQuiz
 * @category TypeDefinition
 * @extends Resource
 */



FrameTrail.defineType(

    'ResourceQuiz',

    function (FrameTrail) {
        return {
            parent: 'Resource',
            constructor: function(resourceData){
                this.resourceData = resourceData;
            },
            prototype: {
                /**
                 * I hold the data object of a custom ResourceQuiz, which is not stored in the Database and doesn't appear in the resource's _index.json.
                 * @attribute resourceData
                 * @type {}
                 */
                resourceData:   {},


                /**
                 * I render the content of myself, which is a &lt;div&gt; containing a quiz wrapped in a &lt;div class="resourceDetail" ...&gt;
                 *
                 * @method renderContent
                 * @return HTMLElement
                 */
                renderContent: function() {

                    var self = this;

                    var licenseType = (this.resourceData.licenseType && this.resourceData.licenseType == 'CC-BY-SA-3.0') ? '<a href="https://creativecommons.org/licenses/by-sa/3.0/" title="License: '+ this.resourceData.licenseType +'" target="_blank"><span class="cc-by-sa-bg-image"></span></a>' : this.resourceData.licenseType;
                    var licenseString = (licenseType) ? licenseType +' - '+ this.resourceData.licenseAttribution : '';

                    var resourceDetail = $('<div class="resourceDetail" data-type="'+ this.resourceData.type +'" style="width: 100%; height: 100%;">'
                                        +  '    <div class="resourceQuizQuestion">'+ this.resourceData.attributes.question +'</div>'
                                        +  '    <div class="resourceQuizAnswersContainer"></div>'
                                        +  '</div>');

                    for (var i = 0; i < this.resourceData.attributes.answers.length; i++) {
                        var answerElement = $('<button type="button">'+ this.resourceData.attributes.answers[i].text +'</button>');
                        answerElement.data('correct', this.resourceData.attributes.answers[i].correct);

                        resourceDetail.find('.resourceQuizAnswersContainer').append(answerElement);
                    }

                    resourceDetail.find('.resourceQuizAnswersContainer').on('click', 'button', function() {
                        if ($(this).data('correct')) {
                            $(this).removeClass('wrong').addClass('correct');
                            $(this).parents('.resourceDetail').removeClass('wrong').addClass('correct');
                            if (self.resourceData.attributes.onCorrectAnswer.showText) {
                                var textDialog = $('<div class="textDialog" title="">'
                                                + '    <p>'+ self.resourceData.attributes.onCorrectAnswer.showText +'</p>'
                                                + '</div>');
                                textDialog.dialog({
                                    modal: true,
                                    classes: { 'ui-dialog': 'quizDialog' },
                                    resizable: false,
                                    closeOnEscape: false,
                                    position: { my: 'center', at: 'center', of: $(this).parents('.overlayContainer') },
                                    close: function() {
                                        if (self.resourceData.attributes.onCorrectAnswer.jumpForward) {
                                            FrameTrail.module('HypervideoController').currentTime = self.resourceData.attributes.onCorrectAnswer.jumpForward;
                                        }
                                        if (self.resourceData.attributes.onCorrectAnswer.resumePlayback) {
                                            FrameTrail.module('HypervideoController').play();
                                        }
                                        $(this).dialog('close');
                                        $(this).remove();
                                    },
                                    buttons: [
                                        { text: 'OK',
                                            click: function() {
                                                $( this ).dialog( 'close' );
                                            }
                                        }
                                    ]
                                });
                            } else {
                                if (self.resourceData.attributes.onCorrectAnswer.jumpForward) {
                                    FrameTrail.module('HypervideoController').currentTime = FrameTrail.module('HypervideoController').currentTime - self.resourceData.attributes.onCorrectAnswer.jumpForward;
                                }
                                if (self.resourceData.attributes.onCorrectAnswer.resumePlayback) {
                                    FrameTrail.module('HypervideoController').play();
                                }
                            }
                        } else {
                            $(this).removeClass('correct').addClass('wrong');
                            $(this).parents('.resourceDetail').removeClass('correct').addClass('wrong');
                            if (self.resourceData.attributes.onWrongAnswer.showText) {
                                var textDialog = $('<div class="shareDialog" title="">'
                                                + '    <p>'+ self.resourceData.attributes.onWrongAnswer.showText +'</p>'
                                                + '</div>');
                                textDialog.dialog({
                                    modal: true,
                                    classes: { 'ui-dialog': 'quizDialog' },
                                    resizable: false,
                                    closeOnEscape: false,
                                    position: { my: "center", at: "center", of: $(this).parents('.overlayContainer') },
                                    close: function() {
                                        if (self.resourceData.attributes.onWrongAnswer.jumpBackward) {
                                            FrameTrail.module('HypervideoController').currentTime = FrameTrail.module('HypervideoController').currentTime - self.resourceData.attributes.onWrongAnswer.jumpBackward;
                                        }
                                        if (self.resourceData.attributes.onWrongAnswer.resumePlayback) {
                                            FrameTrail.module('HypervideoController').play();
                                        }
                                        $(this).dialog('close');
                                        $(this).remove();
                                    },
                                    buttons: [
                                        { text: 'OK',
                                            click: function() {
                                                $( this ).dialog( 'close' );
                                            }
                                        }
                                    ]
                                });
                            } else {
                                if (self.resourceData.attributes.onWrongAnswer.jumpForward) {
                                    FrameTrail.module('HypervideoController').currentTime = self.resourceData.attributes.onWrongAnswer.jumpBackward;
                                }
                                if (self.resourceData.attributes.onWrongAnswer.resumePlayback) {
                                    FrameTrail.module('HypervideoController').play();
                                }
                            }
                        }
                    });
                    resourceDetail.append('<div class="resourceOptions"><div class="licenseInformation">'+ licenseString +'</div><div class="resourceButtons"></div>');

                	return resourceDetail;

                },

                /**
                 * Several modules need me to render a thumb of myself.
                 *
                 * These thumbs have a special structure of HTMLElements, where several data-attributes carry the information needed.
                 *
                 * @method renderThumb
                 * @return thumbElement
                 */
                renderThumb: function() {

                    var self = this;

                    var tagList = (this.resourceData.tags ? this.resourceData.tags.join(' ') : '');
                    
                    var thumbElement = $('<div class="resourceThumb '+ tagList +'" data-license-type="'+ this.resourceData.licenseType +'" data-type="'+ this.resourceData.type +'">'
                        + '                  <div class="resourceOverlay">'
                        + '                      <div class="resourceIcon"><span class="icon-question-circle-o"></span></div>'
                        + '                  </div>'
                        + '                  <div class="resourceTitle">'+ this.labels['ResourceCustomTextHTML'] +'</div>'
                        + '              </div>');

                    var previewButton = $('<div class="resourcePreviewButton"><span class="icon-eye"></span></div>').click(function(evt) {
                        // call the openPreview method (defined in abstract type: Resource)
                        self.openPreview( $(this).parent() );
                        evt.stopPropagation();
                        evt.preventDefault();
                    });
                    thumbElement.append(previewButton);

                    return thumbElement;

                },


                /**
                 * See {{#crossLink "Resource/renderBasicPropertiesControls:method"}}Resource/renderBasicPropertiesControls(){{/crossLink}}
                 * @method renderPropertiesControls
                 * @param {Overlay} overlay
                 * @return &#123; controlsContainer: HTMLElement, changeStart: Function, changeEnd: Function, changeDimensions: Function &#125;
                 */
                renderPropertiesControls: function(overlay) {

                    var basicControls = this.renderBasicPropertiesControls(overlay);

                    basicControls.controlsContainer.find('#OverlayOptions').append(this.renderQuizEditor(overlay));


                    return basicControls;

                },


                /**
                 * See {{#crossLink "Resource/renderBasicTimeControls:method"}}Resource/renderBasicTimeControls(){{/crossLink}}
                 * @method renderTimeControls
                 * @param {Annotation} annotation
                 * @return &#123; controlsContainer: HTMLElement, changeStart: Function, changeEnd: Function &#125;
                 */
                renderTimeControls: function(annotation) {

                    var timeControls = this.renderBasicTimeControls(annotation);

                    timeControls.controlsContainer.find('#AnnotationOptions').append(this.renderQuizEditor(annotation));

                    return timeControls;

                },


                /**
                 * I render an editor for quiz contents
                 * @method renderQuizEditor
                 * @param {Object} overlayOrAnnotation
                 * @return &#123; quizEditorContainer: HTMLElement;
                 */
                renderQuizEditor: function(overlayOrAnnotation) {

                    var self = this;
                    var currentAttributes = overlayOrAnnotation.data.attributes;
                    
                    // Capture snapshot of quiz attributes for undo
                    var quizAttributesSnapshot = JSON.parse(JSON.stringify(currentAttributes));
                    var quizChanged = false;

                    /* Add Question Text Field */
                    
                    var quizEditorContainer = $('<div class="quizEditorContainer"></div>');
                    
                    quizEditorContainer.append('<label>'+ this.labels['SettingsQuizQuestionLabel'] +'</label>');
                    var questionText = $('<input type="text" value="' +currentAttributes.question+ '"/>');
                    
                    questionText.on('keyup', function(evt) {
                        if (!evt.originalEvent.metaKey && evt.originalEvent.key != 'Meta') {
                            var newValue = $(this).val();
                            overlayOrAnnotation.data.attributes.question = newValue;

                            if (overlayOrAnnotation.overlayElement) {
                                
                                overlayOrAnnotation.overlayElement.children('.resourceDetail').find('.resourceQuizQuestion').html(newValue);
                                FrameTrail.module('HypervideoModel').newUnsavedChange('overlays');

                            } else {
                                
                                // Update annotation elements in dom
                                $(overlayOrAnnotation.contentViewDetailElements).each(function() {
                                    $(this).find('.resourceDetail').find('.resourceQuizQuestion').html(newValue);
                                });
                                FrameTrail.module('HypervideoModel').newUnsavedChange('annotations');

                            }
                        }
                    });

                    quizEditorContainer.append(questionText);

                    /* Add Answer Text Fields */

                    var layoutRow = $('<div class="layoutRow"></div>');
                    var leftColumn = $('<div class="column-6"></div>');

                    leftColumn.append('<label>'+ this.labels['SettingsQuizAnswersLabel'] +'</label>');

                    var answersContainer = $('<div class="quizEditorAnswersContainer"></div>');

                    for (var i = 0; i < currentAttributes.answers.length; i++) {
                        
                        answersContainer.append(getAnswerElement(currentAttributes.answers[i].text, currentAttributes.answers[i].correct));
                        
                    }

                    function getAnswerElement(answerInput, isCorrect) {
                        if (!answerInput) {
                            answerInput = '';
                        }
                        if (!isCorrect) {
                            isCorrect = false;
                        }
                        var answerWrapper = $('<div class="answerWrapper"></div>'),
                            answerText = $('<input type="text" value="'+ answerInput +'"/>'),
                            answerDeleteButton = $('<button type="button" class="answerDeleteButton"><span class="icon-cancel"></span></button>'),
                            checkedString = (isCorrect) ? 'checked="checked"' : '';
                            answerCheckbox = $('<label class="switch">'
                                            +  '    <input class="answerCheckbox" type="checkbox" autocomplete="off" '+ checkedString +'>'
                                            +  '    <span class="slider round"></span>'
                                            +  '</label>');

                        answerWrapper.append(answerText, answerCheckbox, answerDeleteButton);
                        return answerWrapper;
                    }

                    answersContainer.on('keyup', 'input[type="text"]', function(evt) {
                        if (!evt.originalEvent.metaKey && evt.originalEvent.key != 'Meta') {
                            var newValue = $(this).val(),
                                thisIndex = $(this).parents('.answerWrapper').index();
                            
                            overlayOrAnnotation.data.attributes.answers[thisIndex].text = newValue;

                            if (overlayOrAnnotation.overlayElement) { 
                                overlayOrAnnotation.overlayElement.children('.resourceDetail').find('.resourceQuizAnswersContainer button').removeClass('correct wrong');
                                overlayOrAnnotation.overlayElement.children('.resourceDetail').find('.resourceQuizAnswersContainer button').eq(thisIndex).html(newValue);
                                FrameTrail.module('HypervideoModel').newUnsavedChange('overlays');
                            } else {
                                // Update annotation elements in dom
                                $(overlayOrAnnotation.contentViewDetailElements).each(function() {
                                    $(this).find('.resourceDetail').find('.resourceQuizAnswersContainer button').removeClass('correct wrong');
                                    $(this).find('.resourceDetail').find('.resourceQuizAnswersContainer button').eq(thisIndex).html(newValue);
                                });
                                FrameTrail.module('HypervideoModel').newUnsavedChange('annotations');
                            }
                        }
                    });

                    answersContainer.on('click', '.answerDeleteButton', function() {
                        var thisIndex = $(this).parents('.answerWrapper').index();

                        overlayOrAnnotation.data.attributes.answers.splice(thisIndex, 1);

                        if (overlayOrAnnotation.overlayElement) { 
                            overlayOrAnnotation.overlayElement.children('.resourceDetail').find('.resourceQuizAnswersContainer button').eq(thisIndex).remove();
                            FrameTrail.module('HypervideoModel').newUnsavedChange('overlays');
                        } else {
                            // Update annotation elements in dom
                            $(overlayOrAnnotation.contentViewDetailElements).each(function() {
                                $(this).find('.resourceDetail').find('.resourceQuizAnswersContainer button').eq(thisIndex).remove();
                            });
                            FrameTrail.module('HypervideoModel').newUnsavedChange('annotations');
                        }

                        $(this).parents('.answerWrapper').remove();
                    });

                    answersContainer.on('change', 'input[type="checkbox"]', function() {
                        var thisIndex = $(this).parents('.answerWrapper').index();

                        overlayOrAnnotation.data.attributes.answers[thisIndex].correct = this.checked;

                        if (overlayOrAnnotation.overlayElement) { 
                            overlayOrAnnotation.overlayElement.children('.resourceDetail').find('.resourceQuizAnswersContainer button').eq(thisIndex).data('correct', this.checked);
                            FrameTrail.module('HypervideoModel').newUnsavedChange('overlays');
                        } else {
                            // Update annotation elements in dom
                            $(overlayOrAnnotation.contentViewDetailElements).each(function() {
                                $(this).find('.resourceDetail').find('.resourceQuizAnswersContainer button').eq(thisIndex).data('correct', this.checked);
                            });
                            FrameTrail.module('HypervideoModel').newUnsavedChange('annotations');
                        }
                    });

                    leftColumn.append(answersContainer);

                    var newAnswerButton = $('<button type="button">'+ this.labels['GenericAdd'] +' <span class="icon-plus"></span></button>');
                    newAnswerButton.on('click', function() {
                        
                        overlayOrAnnotation.data.attributes.answers.push({
                            'text': '',
                            'correct': false
                        });

                        answersContainer.append(getAnswerElement());
                        var answerElement = $('<button type="button"></button>');
                        answerElement.data('correct', false);
                        overlayOrAnnotation.overlayElement.children('.resourceDetail').find('.resourceQuizAnswersContainer').append(answerElement);
                    });

                    leftColumn.append(newAnswerButton);

                    var settingsCorrectShowTextCheckedString = (overlayOrAnnotation.data.attributes.onCorrectAnswer.showText) ? 'checked="checked"' : '',
                        settingsCorrectShowTextClass = (overlayOrAnnotation.data.attributes.onCorrectAnswer.showText) ? 'active' : '',
                        settingsCorrectShowTextValue = (overlayOrAnnotation.data.attributes.onCorrectAnswer.showText) ? overlayOrAnnotation.data.attributes.onCorrectAnswer.showText : '',
                        settingsWrongShowTextCheckedString = (overlayOrAnnotation.data.attributes.onWrongAnswer.showText) ? 'checked="checked"' : '',
                        settingsWrongShowTextClass = (overlayOrAnnotation.data.attributes.onWrongAnswer.showText) ? 'active' : '',
                        settingsWrongShowTextValue = (overlayOrAnnotation.data.attributes.onWrongAnswer.showText) ? overlayOrAnnotation.data.attributes.onWrongAnswer.showText : '',
                        settingsCorrectPlayCheckedString = (overlayOrAnnotation.data.attributes.onCorrectAnswer.resumePlayback) ? 'checked="checked"' : '',
                        settingsWrongPlayCheckedString = (overlayOrAnnotation.data.attributes.onWrongAnswer.resumePlayback) ? 'checked="checked"' : '',
                        settingsJumpForwardValue = (overlayOrAnnotation.data.attributes.onCorrectAnswer.jumpForward) ? overlayOrAnnotation.data.attributes.onCorrectAnswer.jumpForward : 20,
                        settingsJumpForwardCheckedString = (overlayOrAnnotation.data.attributes.onCorrectAnswer.jumpForward) ? 'checked="checked"' : '',
                        settingsJumpForwardDisabledString = (overlayOrAnnotation.data.attributes.onCorrectAnswer.jumpForward) ? '' : 'disabled="disabled"',
                        settingsJumpBackwardValue = (overlayOrAnnotation.data.attributes.onWrongAnswer.jumpBackward) ? overlayOrAnnotation.data.attributes.onWrongAnswer.jumpBackward : 20,
                        settingsJumpBackwardCheckedString = (overlayOrAnnotation.data.attributes.onWrongAnswer.jumpBackward) ? 'checked="checked"' : '',
                        settingsJumpBackwardDisabledString = (overlayOrAnnotation.data.attributes.onWrongAnswer.jumpBackward) ? '' : 'disabled="disabled"';

                    var rightColumn = $('<div class="column-6">'
                                    +   '    <div class="settingsActionsTabs">'
                                    +   '        <ul>'
                                    +   '            <li>'
                                    +   '                <a href="#SettingsCorrect">'+ this.labels['SettingsActionsIfRight'] +'</a>'
                                    +   '            </li>'
                                    +   '            <li>'
                                    +   '                <a href="#SettingsWrong">'+ this.labels['SettingsActionsIfWrong'] +'</a>'
                                    +   '            </li>'
                                    +   '        </ul>'
                                    +   '        <div id="SettingsCorrect">'
                                    +   '            <div class="checkboxRow">'
                                    +   '                <label class="switch">'
                                    +   '                    <input id="settingsCorrectShowTextCheckbox" class="settingsCorrectShowTextCheckbox" type="checkbox" autocomplete="off" '+ settingsCorrectShowTextCheckedString +'>'
                                    +   '                    <span class="slider round"></span>'
                                    +   '                </label>'
                                    +   '                <label for="settingsCorrectShowTextCheckbox">'+ this.labels['GenericShowText'] +'</label>'
                                    +   '                <input type="text" class="settingsCorrectShowTextInput '+ settingsCorrectShowTextClass +'" value="'+ settingsCorrectShowTextValue +'"/>'
                                    +   '            </div>'
                                    +   '            <div class="checkboxRow">'
                                    +   '                <label class="switch">'
                                    +   '                    <input id="settingsJumpForwardCheckbox" class="settingsJumpForwardCheckbox" type="checkbox" autocomplete="off" '+ settingsJumpForwardCheckedString +'>'
                                    +   '                    <span class="slider round"></span>'
                                    +   '                </label>'
                                    +   '                <label for="settingsJumpForwardCheckbox">'+ this.labels['GenericJumpForward'] +'</label>'
                                    +   '                <input type="text" class="settingsJumpForwardInput" '+ settingsJumpForwardDisabledString +' value="'+ settingsJumpForwardValue +'"/>'
                                    +   '                <span>'+ this.labels['GenericSeconds'] +'</span>'
                                    +   '            </div>'
                                    +   '            <div class="checkboxRow">'
                                    +   '                <label class="switch">'
                                    +   '                    <input id="settingsCorrectPlayCheckbox" class="settingsCorrectPlayCheckbox" type="checkbox" autocomplete="off" '+ settingsCorrectPlayCheckedString +'>'
                                    +   '                    <span class="slider round"></span>'
                                    +   '                </label>'
                                    +   '                <label for="settingsCorrectPlayCheckbox">'+ this.labels['GenericContinuePlayback'] +'</label>'
                                    +   '            </div>'
                                    +   '            <div class="message active">'+ this.labels['MessageQuizActions'] +': '+ this.labels['GenericShowText'] +', '+ this.labels['GenericJumpForward'] +', '+ this.labels['GenericContinuePlayback'] +'.</div>'
                                    +   '        </div>'
                                    +   '        <div id="SettingsWrong">'
                                    +   '            <div class="checkboxRow">'
                                    +   '                <label class="switch">'
                                    +   '                    <input id="settingsWrongShowTextCheckbox" class="settingsWrongShowTextCheckbox" type="checkbox" autocomplete="off" '+ settingsWrongShowTextCheckedString +'>'
                                    +   '                    <span class="slider round"></span>'
                                    +   '                </label>'
                                    +   '                <label for="settingsWrongShowTextCheckbox">'+ this.labels['GenericShowText'] +'</label>'
                                    +   '                <input type="text" class="settingsWrongShowTextInput '+ settingsWrongShowTextClass +'" value="'+ settingsWrongShowTextValue +'"/>'
                                    +   '            </div>'
                                    +   '            <div class="checkboxRow">'
                                    +   '                <label class="switch">'
                                    +   '                    <input id="settingsJumpBackwardCheckbox" class="settingsJumpBackwardCheckbox" type="checkbox" autocomplete="off" '+ settingsJumpBackwardCheckedString +'>'
                                    +   '                    <span class="slider round"></span>'
                                    +   '                </label>'
                                    +   '                <label for="settingsJumpBackwardCheckbox">'+ this.labels['GenericJumpBackward'] +': </label>'
                                    +   '                <input type="text" class="settingsJumpBackwardInput" '+ settingsJumpBackwardDisabledString +' value="'+ settingsJumpBackwardValue +'"/>'
                                    +   '                <span>'+ this.labels['GenericSeconds'] +'</span>'
                                    +   '            </div>'
                                    +   '            <div class="checkboxRow">'
                                    +   '                <label class="switch">'
                                    +   '                    <input id="settingsWrongPlayCheckbox" class="settingsWrongPlayCheckbox" type="checkbox" autocomplete="off" '+ settingsWrongPlayCheckedString +'>'
                                    +   '                    <span class="slider round"></span>'
                                    +   '                </label>'
                                    +   '                <label for="settingsWrongCheckbox">'+ this.labels['GenericContinuePlayback'] +'</label>'
                                    +   '            </div>'
                                    +   '            <div class="message active">'+ this.labels['MessageQuizActions'] +': '+ this.labels['GenericShowText'] +', '+ this.labels['GenericJumpBackward'] +', '+ this.labels['GenericContinuePlayback'] +'.</div>'
                                    +   '        </div>'
                                    +   '    </div>'
                                    +   '</div>');

                    rightColumn.find('.settingsActionsTabs').tabs();

                    var settingsCorrectShowTextInput = rightColumn.find('input.settingsCorrectShowTextInput');
                    settingsCorrectShowTextInput.on('keyup', function(evt) {
                        if (!evt.originalEvent.metaKey && evt.originalEvent.key != 'Meta') {
                            var thisValue = $(this).val();
                            
                            overlayOrAnnotation.data.attributes.onCorrectAnswer.showText = thisValue;
                            if (overlayOrAnnotation.overlayElement) { 
                                FrameTrail.module('HypervideoModel').newUnsavedChange('overlays');
                            } else {
                                FrameTrail.module('HypervideoModel').newUnsavedChange('annotations');
                            }
                        }
                    });
                    rightColumn.find('input.settingsCorrectShowTextCheckbox').on('change', function() {
                        if (!this.checked) {
                            settingsCorrectShowTextInput.val('').removeClass('active');
                        } else {
                            settingsCorrectShowTextInput.addClass('active');
                        }
                        overlayOrAnnotation.data.attributes.onCorrectAnswer.showText = (this.checked) ? settingsCorrectShowTextInput.val() : false;
                        if (overlayOrAnnotation.overlayElement) { 
                            FrameTrail.module('HypervideoModel').newUnsavedChange('overlays');
                        } else {
                            FrameTrail.module('HypervideoModel').newUnsavedChange('annotations');
                        }
                    });

                    var settingsWrongShowTextInput = rightColumn.find('input.settingsWrongShowTextInput');
                    settingsWrongShowTextInput.on('keyup', function(evt) {
                        if (!evt.originalEvent.metaKey && evt.originalEvent.key != 'Meta') {
                            var thisValue = $(this).val();
                            
                            overlayOrAnnotation.data.attributes.onWrongAnswer.showText = thisValue;
                            if (overlayOrAnnotation.overlayElement) { 
                                FrameTrail.module('HypervideoModel').newUnsavedChange('overlays');
                            } else {
                                FrameTrail.module('HypervideoModel').newUnsavedChange('annotations');
                            }
                        }
                    });
                    rightColumn.find('input.settingsWrongShowTextCheckbox').on('change', function() {
                        if (!this.checked) {
                            settingsWrongShowTextInput.val('').removeClass('active');
                        } else {
                            settingsWrongShowTextInput.addClass('active');
                        }
                        overlayOrAnnotation.data.attributes.onWrongAnswer.showText = (this.checked) ? settingsWrongShowTextInput.val() : false;
                        if (overlayOrAnnotation.overlayElement) { 
                            FrameTrail.module('HypervideoModel').newUnsavedChange('overlays');
                        } else {
                            FrameTrail.module('HypervideoModel').newUnsavedChange('annotations');
                        }
                    });

                    rightColumn.find('input.settingsCorrectPlayCheckbox').on('change', function() {
                        overlayOrAnnotation.data.attributes.onCorrectAnswer.resumePlayback = this.checked;
                        if (overlayOrAnnotation.overlayElement) { 
                            FrameTrail.module('HypervideoModel').newUnsavedChange('overlays');
                        } else {
                            FrameTrail.module('HypervideoModel').newUnsavedChange('annotations');
                        }
                    });

                    rightColumn.find('input.settingsWrongPlayCheckbox').on('change', function() {
                        overlayOrAnnotation.data.attributes.onWrongAnswer.resumePlayback = this.checked;
                        if (overlayOrAnnotation.overlayElement) { 
                            FrameTrail.module('HypervideoModel').newUnsavedChange('overlays');
                        } else {
                            FrameTrail.module('HypervideoModel').newUnsavedChange('annotations');
                        }
                    });

                    var settingsJumpForwardInput = rightColumn.find('input.settingsJumpForwardInput');
                    settingsJumpForwardInput.on('keyup', function(evt) {
                        if (!evt.originalEvent.metaKey && evt.originalEvent.key != 'Meta') {
                            var thisValue = parseFloat($(this).val());
                            
                            overlayOrAnnotation.data.attributes.onCorrectAnswer.jumpForward = thisValue;
                            if (overlayOrAnnotation.overlayElement) { 
                                FrameTrail.module('HypervideoModel').newUnsavedChange('overlays');
                            } else {
                                FrameTrail.module('HypervideoModel').newUnsavedChange('annotations');
                            }
                        }
                    });
                    rightColumn.find('input.settingsJumpForwardCheckbox').on('change', function() {
                        if (!this.checked) {
                            settingsJumpForwardInput.attr('disabled', 'disabled');
                        } else {
                            settingsJumpForwardInput.removeAttr('disabled');
                        }
                        overlayOrAnnotation.data.attributes.onCorrectAnswer.jumpForward = (this.checked) ? parseFloat(settingsJumpForwardInput.val()) : false;
                        if (overlayOrAnnotation.overlayElement) { 
                            FrameTrail.module('HypervideoModel').newUnsavedChange('overlays');
                        } else {
                            FrameTrail.module('HypervideoModel').newUnsavedChange('annotations');
                        }
                    });

                    var settingsJumpBackwardInput = rightColumn.find('input.settingsJumpBackwardInput');
                    settingsJumpBackwardInput.on('keyup', function(evt) {
                        if (!evt.originalEvent.metaKey && evt.originalEvent.key != 'Meta') {
                            var thisValue = parseFloat($(this).val());
                            
                            overlayOrAnnotation.data.attributes.onWrongAnswer.jumpBackward = thisValue;
                            if (overlayOrAnnotation.overlayElement) { 
                                FrameTrail.module('HypervideoModel').newUnsavedChange('overlays');
                            } else {
                                FrameTrail.module('HypervideoModel').newUnsavedChange('annotations');
                            }
                        }
                    });
                    rightColumn.find('input.settingsJumpBackwardCheckbox').on('change', function() {
                        if (!this.checked) {
                            settingsJumpBackwardInput.attr('disabled', 'disabled');
                        } else {
                            settingsJumpBackwardInput.removeAttr('disabled');
                        }
                        overlayOrAnnotation.data.attributes.onWrongAnswer.jumpBackward = (this.checked) ? parseFloat(settingsJumpBackwardInput.val()) : false;
                        if (overlayOrAnnotation.overlayElement) { 
                            FrameTrail.module('HypervideoModel').newUnsavedChange('overlays');
                        } else {
                            FrameTrail.module('HypervideoModel').newUnsavedChange('annotations');
                        }
                    });

                    layoutRow.append(leftColumn, rightColumn);
                    quizEditorContainer.append(layoutRow);

                    // Register undo when focus leaves the quiz editor (if changes were made)
                    quizEditorContainer.on('focusout', function(evt) {
                        // Only register if focus is leaving the container entirely
                        var newFocusTarget = evt.relatedTarget;
                        if (newFocusTarget && $.contains(quizEditorContainer[0], newFocusTarget)) {
                            return; // Focus is still within the container
                        }
                        
                        // Check if attributes changed by comparing to snapshot
                        var currentAttrs = JSON.stringify(overlayOrAnnotation.data.attributes);
                        var snapshotAttrs = JSON.stringify(quizAttributesSnapshot);
                        
                        if (currentAttrs !== snapshotAttrs) {
                            var isOverlay = !!overlayOrAnnotation.overlayElement;
                            var category = isOverlay ? 'overlays' : 'annotations';
                            var elementId = overlayOrAnnotation.data.created;
                            
                            (function(id, oldAttr, newAttr, cat, labels) {
                                var findElement = function() {
                                    var arr = cat === 'overlays' ? 
                                        FrameTrail.module('HypervideoModel').overlays : 
                                        FrameTrail.module('HypervideoModel').annotations;
                                    for (var i = 0; i < arr.length; i++) {
                                        if (arr[i].data.created === id) {
                                            return arr[i];
                                        }
                                    }
                                    return null;
                                };
                                FrameTrail.module('UndoManager').register({
                                    category: cat,
                                    description: (cat === 'overlays' ? labels['SidebarOverlays'] : labels['SidebarMyAnnotations']) + ' Quiz',
                                    undo: function() {
                                        var el = findElement();
                                        if (!el) return;
                                        el.data.attributes = JSON.parse(oldAttr);
                                        FrameTrail.module('HypervideoModel').newUnsavedChange(cat);
                                    },
                                    redo: function() {
                                        var el = findElement();
                                        if (!el) return;
                                        el.data.attributes = JSON.parse(newAttr);
                                        FrameTrail.module('HypervideoModel').newUnsavedChange(cat);
                                    }
                                });
                            })(elementId, snapshotAttrs, currentAttrs, category, self.labels);
                            
                            // Update snapshot to current state
                            quizAttributesSnapshot = JSON.parse(currentAttrs);
                        }
                    });

                    return quizEditorContainer;

                }



            }



        }
    }


);
