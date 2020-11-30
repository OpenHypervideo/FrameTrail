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
                        answerElement.data('correct', this.resourceData.attributes.answers[i].correct).click(function() {
                            if ($(this).data('correct')) {
                                $(this).removeClass('wrong').addClass('correct');
                                $(this).parents('.resourceDetail').removeClass('wrong').addClass('correct');
                                if (self.resourceData.attributes.onCorrectAnswer.resumePlayback) {
                                    setTimeout(function() {
                                        FrameTrail.module('HypervideoController').play();
                                    }, 2000);
                                }
                            } else {
                                $(this).removeClass('correct').addClass('wrong');
                                $(this).parents('.resourceDetail').removeClass('correct').addClass('wrong');
                            }
                        });
                        resourceDetail.find('.resourceQuizAnswersContainer').append(answerElement);
                    }

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

                    var thumbElement = $('<div class="resourceThumb" data-license-type="'+ this.resourceData.licenseType +'" data-type="'+ this.resourceData.type +'">'
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

                    var currentAttributes = overlayOrAnnotation.data.attributes;

                    /* Add Question Text Field */
                    
                    var quizEditorContainer = $('<div class="quizEditorContainer"></div>');
                    
                    quizEditorContainer.append('<label>'+ this.labels['SettingsQuizQuestionLabel'] +'</label>');
                    var questionText = $('<input type="text" value="' +currentAttributes.question+ '"/>');
                    
                    questionText.on('keyup', function() {
                        
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
                    });

                    quizEditorContainer.append(questionText);

                    /* Add Answer Text Fields */

                    var leftColumn = $('<div class="formColumn column2"></div>');

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

                    answersContainer.on('keyup', 'input[type="text"]', function() {
                        
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
                        answerElement.data('correct', false).click(function() {
                            if ($(this).data('correct')) {
                                if (overlayOrAnnotation.data.attributes.onCorrectAnswer.resumePlayback) {
                                    FrameTrail.module('HypervideoController').play();
                                }
                            } else {
                                alert('Nope!');
                            }
                        });
                        overlayOrAnnotation.overlayElement.children('.resourceDetail').find('.resourceQuizAnswersContainer').append(answerElement);
                    });

                    leftColumn.append(newAnswerButton);

                    quizEditorContainer.append(leftColumn);

                    function getActionsList() {
                        var actionListContainer = $('<div class="quizActionListContainer">'
                                                +   '</div>');

                        return actionListContainer;
                    }

                    var rightColumn = $('<div class="formColumn column2"></div>');

                    rightColumn.append('<label>'+ this.labels['SettingsActionsIfRight'] +'</label>');
                    
                    var settingsPlayCheckedString = (overlayOrAnnotation.data.attributes.onCorrectAnswer.resumePlayback) ? 'checked="checked"' : '',
                        settingsPlayCheckbox = $('<div class="checkboxRow">'
                                                +'    <label class="switch">'
                                                +'        <input id="settingsPlayCheckbox" class="settingsPlayCheckbox" type="checkbox" autocomplete="off" '+ settingsPlayCheckedString +'>'
                                                +'        <span class="slider round"></span>'
                                                +'    </label>'
                                                +'    <label for="settingsPlayCheckbox">'+ this.labels['GenericContinuePlayback'] +'</label>'
                                                +'</div>');
                    settingsPlayCheckbox.find('input.settingsPlayCheckbox').on('change', function() {
                        overlayOrAnnotation.data.attributes.onCorrectAnswer.resumePlayback = this.checked;
                        if (overlayOrAnnotation.overlayElement) { 
                            FrameTrail.module('HypervideoModel').newUnsavedChange('overlays');
                        } else {
                            FrameTrail.module('HypervideoModel').newUnsavedChange('annotations');
                        }
                    });
                    /*
                    var settingsHideCheckedString = (overlayOrAnnotation.data.attributes.onCorrectAnswer.hideQuiz) ? 'checked="checked"' : '',
                        settingsHideCheckbox = $('<div class="checkboxRow">'
                                                +'    <label class="switch">'
                                                +'        <input id="settingsHideCheckbox" class="settingsHideCheckbox" type="checkbox" autocomplete="off" '+ settingsHideCheckedString +'>'
                                                +'        <span class="slider round"></span>'
                                                +'    </label>'
                                                +'    <label for="settingsHideCheckbox">'+ this.labels['SettingsHideQuiz'] +'</label>'
                                                +'</div>');
                    settingsHideCheckbox.on('change', function() {
                        overlayOrAnnotation.data.attributes.onCorrectAnswer.hideQuiz = this.checked;

                        if (overlayOrAnnotation.overlayElement) { 
                            FrameTrail.module('HypervideoModel').newUnsavedChange('overlays');
                        } else {
                            FrameTrail.module('HypervideoModel').newUnsavedChange('annotations');
                        }
                    });
                    */

                    rightColumn.append(settingsPlayCheckbox);

                    //rightColumn.append('<label>'+ this.labels['SettingsActionsIfWrong'] +'</label>');

                    quizEditorContainer.append(leftColumn, rightColumn);

                    return quizEditorContainer;

                }



            }



        }
    }


);
