/**
 * @module Shared
 */


/**
 * I am the type definition of a ResourceQuiz.
 *
 * * Quiz Resources only appear in the 'Choose Custom Overlay' tab
 *   and are not listed in the ResourceManager.
 *
 * I support several question types (attributes.questionType):
 * * 'multipleChoice' (default) — one answer is chosen, scored right/wrong
 * * 'multiSelect' — several answers can be selected, scored right/wrong on submit
 * * 'freeText' — a free text response, not scored
 * * 'rating' — a numeric scale response (attributes.ratingScale steps), not scored
 *
 * Scored types use the outcome objects attributes.onCorrectAnswer / attributes.onWrongAnswer,
 * non-scored types use attributes.onAnswered. All outcomes support showText and resumePlayback;
 * scored outcomes additionally support jumpForward / jumpBackward (seconds).
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
                iconClass:      'icon-question-circle-o',


                /**
                 * I apply a quiz outcome object ({ showText, resumePlayback, jumpForward, jumpBackward })
                 * after a question has been answered.
                 *
                 * @method applyQuizOutcome
                 * @param {Object} outcome
                 * @param {HTMLElement} positionReference Element used to position the showText dialog
                 */
                applyQuizOutcome: function(outcome, positionReference) {

                    if (!outcome) { return; }

                    var HypervideoController = FrameTrail.module('HypervideoController');

                    var applyJumpAndResume = function() {
                        if (outcome.jumpForward) {
                            HypervideoController.currentTime = HypervideoController.currentTime + parseFloat(outcome.jumpForward);
                        }
                        if (outcome.jumpBackward) {
                            HypervideoController.currentTime = HypervideoController.currentTime - parseFloat(outcome.jumpBackward);
                        }
                        if (outcome.resumePlayback) {
                            HypervideoController.play();
                        }
                    };

                    if (outcome.showText) {
                        var _tdw = document.createElement('div');
                        _tdw.innerHTML = '<div class="textDialog"><p></p></div>';
                        var textDialog = _tdw.firstElementChild;
                        textDialog.querySelector('p').textContent = outcome.showText;
                        var textDialogCtrl = Dialog({
                            content:       textDialog,
                            modal:         true,
                            classes:       'quizDialog',
                            titlebar:      false,
                            inheritTheme:  positionReference,
                            resizable:     false,
                            closeOnEscape: false,
                            position:      { my: 'center', at: 'center', of: positionReference },
                            close: function() {
                                applyJumpAndResume();
                                textDialogCtrl.destroy();
                            },
                            buttons: [
                                { text: 'OK',
                                    click: function() {
                                        textDialogCtrl.close();
                                    }
                                }
                            ]
                        });
                    } else {
                        applyJumpAndResume();
                    }

                },


                /**
                 * I emit the global 'quizAnswered' event with the given answer details.
                 *
                 * @method emitQuizAnswered
                 * @param {*} answer
                 * @param {Boolean|null} correct null for non-scored question types
                 */
                emitQuizAnswered: function(answer, correct) {

                    FrameTrail.triggerEvent('quizAnswered', {
                        question: this.resourceData.attributes.question,
                        questionType: this.resourceData.attributes.questionType || 'multipleChoice',
                        answer: answer,
                        correct: correct
                    });

                },


                /**
                 * I render the content of myself: the question plus the answer UI
                 * for the current question type, wrapped in a &lt;div class="resourceDetail" ...&gt;
                 *
                 * @method renderContent
                 * @return HTMLElement
                 */
                renderContent: function() {

                    var attributes = this.resourceData.attributes,
                        questionType = attributes.questionType || 'multipleChoice';

                    var _rdw = document.createElement('div');
                    _rdw.innerHTML = '<div class="resourceDetail" data-type="quiz" data-question-type="'+ questionType +'">'
                                        +  '    <div class="resourceContent">'
                                        +  '        <div class="resourceQuizQuestion"></div>'
                                        +  '        <div class="resourceQuizAnswersContainer"></div>'
                                        +  '    </div>'
                                        +  '</div>';
                    var resourceDetail = _rdw.firstElementChild;
                    resourceDetail.querySelector('.resourceQuizQuestion').innerHTML = attributes.question;

                    var answersContainer = resourceDetail.querySelector('.resourceQuizAnswersContainer');

                    switch (questionType) {
                        case 'multiSelect':
                            this.renderMultiSelectContent(answersContainer, resourceDetail);
                            break;
                        case 'freeText':
                            this.renderFreeTextContent(answersContainer, resourceDetail);
                            break;
                        case 'rating':
                            this.renderRatingContent(answersContainer, resourceDetail);
                            break;
                        default:
                            this.renderMultipleChoiceContent(answersContainer, resourceDetail);
                            break;
                    }

                    resourceDetail.appendChild(this.buildResourceOptions({
                        licenseType: this.resourceData.licenseType,
                        licenseAttribution: this.resourceData.licenseAttribution
                    }));

                    return resourceDetail;

                },


                /**
                 * I render the answer buttons for the 'multipleChoice' question type.
                 * @method renderMultipleChoiceContent
                 */
                renderMultipleChoiceContent: function(answersContainer, resourceDetail) {

                    var self = this,
                        answers = this.resourceData.attributes.answers || [];

                    for (var i = 0; i < answers.length; i++) {
                        var answerElement = document.createElement('button');
                        answerElement.type = 'button';
                        answerElement.textContent = answers[i].text;
                        answerElement.dataset.correct = String(answers[i].correct);
                        answersContainer.appendChild(answerElement);
                    }

                    answersContainer.addEventListener('click', function(evt) {
                        var _btn = evt.target.closest('button');
                        if (!_btn) return;

                        var correct = (_btn.dataset.correct === 'true');

                        _btn.classList.remove(correct ? 'wrong' : 'correct');
                        _btn.classList.add(correct ? 'correct' : 'wrong');
                        resourceDetail.classList.remove(correct ? 'wrong' : 'correct');
                        resourceDetail.classList.add(correct ? 'correct' : 'wrong');

                        self.emitQuizAnswered(_btn.textContent, correct);
                        self.applyQuizOutcome(
                            correct ? self.resourceData.attributes.onCorrectAnswer : self.resourceData.attributes.onWrongAnswer,
                            _btn.closest('.overlayContainer') || resourceDetail
                        );
                    });

                },


                /**
                 * I render toggleable answer buttons plus a submit button for the 'multiSelect' question type.
                 * @method renderMultiSelectContent
                 */
                renderMultiSelectContent: function(answersContainer, resourceDetail) {

                    var self = this,
                        answers = this.resourceData.attributes.answers || [];

                    for (var i = 0; i < answers.length; i++) {
                        var answerElement = document.createElement('button');
                        answerElement.type = 'button';
                        answerElement.className = 'quizSelectableAnswer';
                        answerElement.textContent = answers[i].text;
                        answerElement.dataset.correct = String(answers[i].correct);
                        answersContainer.appendChild(answerElement);
                    }

                    var submitButton = document.createElement('button');
                    submitButton.type = 'button';
                    submitButton.className = 'quizSubmitButton';
                    submitButton.textContent = this.labels['QuizSubmit'];
                    answersContainer.appendChild(submitButton);

                    answersContainer.addEventListener('click', function(evt) {
                        var _answerBtn = evt.target.closest('.quizSelectableAnswer');
                        if (_answerBtn && !resourceDetail.classList.contains('answered')) {
                            _answerBtn.classList.toggle('selected');
                            return;
                        }

                        var _submitBtn = evt.target.closest('.quizSubmitButton');
                        if (!_submitBtn || resourceDetail.classList.contains('answered')) return;

                        var selectedTexts = [],
                            correct = true;

                        answersContainer.querySelectorAll('.quizSelectableAnswer').forEach(function(btn) {
                            var isSelected = btn.classList.contains('selected'),
                                isCorrect  = (btn.dataset.correct === 'true');
                            if (isSelected) { selectedTexts.push(btn.textContent); }
                            if (isSelected !== isCorrect) { correct = false; }
                            if (isSelected) {
                                btn.classList.add(isCorrect ? 'correct' : 'wrong');
                            }
                        });

                        resourceDetail.classList.add('answered');
                        resourceDetail.classList.add(correct ? 'correct' : 'wrong');

                        self.emitQuizAnswered(selectedTexts, correct);
                        self.applyQuizOutcome(
                            correct ? self.resourceData.attributes.onCorrectAnswer : self.resourceData.attributes.onWrongAnswer,
                            answersContainer.closest('.overlayContainer') || resourceDetail
                        );
                    });

                },


                /**
                 * I render a text input plus a submit button for the 'freeText' question type.
                 * @method renderFreeTextContent
                 */
                renderFreeTextContent: function(answersContainer, resourceDetail) {

                    var self = this;

                    var textInput = document.createElement('textarea');
                    textInput.className = 'quizFreeTextInput';
                    answersContainer.appendChild(textInput);

                    var submitButton = document.createElement('button');
                    submitButton.type = 'button';
                    submitButton.className = 'quizSubmitButton';
                    submitButton.textContent = this.labels['QuizSubmit'];
                    answersContainer.appendChild(submitButton);

                    submitButton.addEventListener('click', function() {
                        if (resourceDetail.classList.contains('answered')) return;
                        if (!textInput.value.trim()) return;

                        resourceDetail.classList.add('answered');
                        textInput.disabled = true;

                        var answeredNote = document.createElement('div');
                        answeredNote.className = 'quizAnsweredNote';
                        answeredNote.textContent = self.labels['QuizThanks'];
                        answersContainer.appendChild(answeredNote);

                        self.emitQuizAnswered(textInput.value, null);
                        self.applyQuizOutcome(
                            self.resourceData.attributes.onAnswered,
                            answersContainer.closest('.overlayContainer') || resourceDetail
                        );
                    });

                },


                /**
                 * I render a row of scale buttons for the 'rating' question type.
                 * @method renderRatingContent
                 */
                renderRatingContent: function(answersContainer, resourceDetail) {

                    var self = this,
                        scale = parseInt(this.resourceData.attributes.ratingScale, 10) || 5;

                    var ratingRow = document.createElement('div');
                    ratingRow.className = 'quizRatingRow';

                    for (var i = 1; i <= scale; i++) {
                        var ratingButton = document.createElement('button');
                        ratingButton.type = 'button';
                        ratingButton.className = 'quizRatingButton';
                        ratingButton.textContent = i;
                        ratingButton.dataset.value = i;
                        ratingRow.appendChild(ratingButton);
                    }

                    answersContainer.appendChild(ratingRow);

                    ratingRow.addEventListener('click', function(evt) {
                        var _btn = evt.target.closest('.quizRatingButton');
                        if (!_btn || resourceDetail.classList.contains('answered')) return;

                        resourceDetail.classList.add('answered');
                        _btn.classList.add('selected');

                        var answeredNote = document.createElement('div');
                        answeredNote.className = 'quizAnsweredNote';
                        answeredNote.textContent = self.labels['QuizThanks'];
                        answersContainer.appendChild(answeredNote);

                        self.emitQuizAnswered(parseInt(_btn.dataset.value, 10), null);
                        self.applyQuizOutcome(
                            self.resourceData.attributes.onAnswered,
                            answersContainer.closest('.overlayContainer') || resourceDetail
                        );
                    });

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

                    var _thw = document.createElement('div');
                    _thw.innerHTML = '<div class="resourceThumb '+ tagList +'" data-license-type="'+ this.resourceData.licenseType +'" data-type="'+ this.resourceData.type +'">'
                        + '                  <div class="resourceOverlay">'
                        + '                      <div class="resourceIcon"><span class="icon-question-circle-o"></span></div>'
                        + '                  </div>'
                        + '                  <div class="resourceTitle">'+ this.labels['ResourceCustomTextHTML'] +'</div>'
                        + '              </div>';
                    var thumbElement = _thw.firstElementChild;

                    var previewButton = document.createElement('div');
                    previewButton.className = 'resourcePreviewButton';
                    previewButton.innerHTML = '<span class="icon-eye"></span>';
                    previewButton.addEventListener('click', function(evt) {
                        // call the openPreview method (defined in abstract type: Resource)
                        self.openPreview( this.parentElement );
                        evt.stopPropagation();
                        evt.preventDefault();
                    });
                    thumbElement.appendChild(previewButton);

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

                    basicControls.controlsContainer.querySelector('#OverlayOptions').prepend(this.renderQuizEditor(overlay));


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

                    timeControls.controlsContainer.querySelector('#AnnotationOptions').append(this.renderQuizEditor(annotation));

                    return timeControls;

                },


                /**
                 * I re-render the quiz content of the given overlay or annotation
                 * after attribute changes in the editor.
                 *
                 * @method updateQuizVisuals
                 * @param {Object} overlayOrAnnotation
                 */
                updateQuizVisuals: function(overlayOrAnnotation) {

                    var resourceItem = overlayOrAnnotation.resourceItem || this;

                    if (overlayOrAnnotation.overlayElement) {
                        var _oldRd = overlayOrAnnotation.overlayElement.querySelector('.resourceDetail');
                        if (_oldRd) _oldRd.remove();
                        overlayOrAnnotation.overlayElement.appendChild(resourceItem.renderContent());
                    } else if (overlayOrAnnotation.contentViewDetailElements) {
                        overlayOrAnnotation.contentViewDetailElements.forEach(function(detailEl) {
                            var _rd = detailEl.querySelector('.resourceDetail');
                            if (_rd) _rd.remove();
                            detailEl.appendChild(resourceItem.renderContent());
                        });
                    }

                },


                /**
                 * I make sure the attribute fields required by the given question type exist.
                 *
                 * @method ensureQuizAttributes
                 * @param {Object} attributes
                 * @param {String} questionType
                 */
                ensureQuizAttributes: function(attributes, questionType) {

                    if (questionType === 'multipleChoice' || questionType === 'multiSelect') {
                        if (!Array.isArray(attributes.answers)) {
                            attributes.answers = [
                                { 'text': this.labels['SettingsQuizDefaultAnswer1'], 'correct': false },
                                { 'text': this.labels['SettingsQuizDefaultAnswer2'], 'correct': true }
                            ];
                        }
                        if (!attributes.onCorrectAnswer) {
                            attributes.onCorrectAnswer = { 'jumpForward': false, 'resumePlayback': true, 'showText': false };
                        }
                        if (!attributes.onWrongAnswer) {
                            attributes.onWrongAnswer = { 'jumpBackward': 10, 'resumePlayback': true, 'showText': false };
                        }
                    } else {
                        if (!attributes.onAnswered) {
                            attributes.onAnswered = { 'resumePlayback': true, 'showText': false };
                        }
                        if (questionType === 'rating' && !attributes.ratingScale) {
                            attributes.ratingScale = 5;
                        }
                    }

                },


                /**
                 * I render an editor for quiz contents (question type, question, answers, outcomes).
                 *
                 * @method renderQuizEditor
                 * @param {Object} overlayOrAnnotation
                 * @return HTMLElement
                 */
                renderQuizEditor: function(overlayOrAnnotation) {

                    var self = this,
                        attributes = overlayOrAnnotation.data.attributes,
                        category = overlayOrAnnotation.overlayElement ? 'overlays' : 'annotations';

                    if (!attributes.questionType) {
                        attributes.questionType = 'multipleChoice';
                    }
                    this.ensureQuizAttributes(attributes, attributes.questionType);

                    var markUnsaved = function() {
                        FrameTrail.module('HypervideoModel').newUnsavedChange(category);
                    };

                    // Capture snapshot of quiz attributes for undo
                    var quizAttributesSnapshot = JSON.parse(JSON.stringify(attributes));

                    var quizEditorContainer = document.createElement('div');
                    quizEditorContainer.className = 'quizEditorContainer';

                    /* Question type select + question text field */

                    var _hrw = document.createElement('div');
                    _hrw.innerHTML = '<div class="layoutRow">'
                        + '    <div class="column-4">'
                        + '        <label>'+ this.labels['SettingsQuizTypeLabel'] +'</label>'
                        + '        <div class="custom-select">'
                        + '        <select class="quizTypeSelect">'
                        + '            <option value="multipleChoice">'+ this.labels['QuizTypeMultipleChoice'] +'</option>'
                        + '            <option value="multiSelect">'+ this.labels['QuizTypeMultiSelect'] +'</option>'
                        + '            <option value="freeText">'+ this.labels['QuizTypeFreeText'] +'</option>'
                        + '            <option value="rating">'+ this.labels['QuizTypeRating'] +'</option>'
                        + '        </select>'
                        + '        </div>'
                        + '    </div>'
                        + '    <div class="column-8">'
                        + '        <label>'+ this.labels['SettingsQuizQuestionLabel'] +'</label>'
                        + '        <input type="text" class="quizQuestionInput">'
                        + '    </div>'
                        + '</div>';
                    var headerRow = _hrw.firstElementChild;
                    quizEditorContainer.appendChild(headerRow);

                    var typeSelect = headerRow.querySelector('.quizTypeSelect'),
                        questionInput = headerRow.querySelector('.quizQuestionInput');

                    typeSelect.value = attributes.questionType;
                    questionInput.value = attributes.question || '';

                    questionInput.addEventListener('keyup', function(evt) {
                        if (!evt.metaKey && evt.key != 'Meta') {
                            attributes.question = this.value;
                            self.updateQuizVisuals(overlayOrAnnotation);
                            markUnsaved();
                        }
                    });

                    /* Type-specific editor body (re-rendered on type change) */

                    var editorBody = document.createElement('div');
                    editorBody.className = 'quizEditorBody';
                    quizEditorContainer.appendChild(editorBody);

                    var renderEditorBody = function() {

                        editorBody.innerHTML = '';

                        var questionType = attributes.questionType;

                        if (questionType === 'multipleChoice' || questionType === 'multiSelect') {
                            editorBody.appendChild(self.renderAnswersEditor(overlayOrAnnotation, markUnsaved));

                            var _srw = document.createElement('div');
                            _srw.innerHTML = '<div class="layoutRow">'
                                + '    <div class="column-12">'
                                + '        <div class="settingsActionsTabs">'
                                + '            <ul>'
                                + '                <li><a href="#SettingsCorrect">'+ self.labels['SettingsActionsIfRight'] +'</a></li>'
                                + '                <li><a href="#SettingsWrong">'+ self.labels['SettingsActionsIfWrong'] +'</a></li>'
                                + '            </ul>'
                                + '            <div id="SettingsCorrect"></div>'
                                + '            <div id="SettingsWrong"></div>'
                                + '        </div>'
                                + '    </div>'
                                + '</div>';
                            var settingsRow = _srw.firstElementChild;
                            settingsRow.querySelector('#SettingsCorrect').appendChild(
                                self.renderOutcomeControls(overlayOrAnnotation, 'onCorrectAnswer', 'forward', markUnsaved)
                            );
                            settingsRow.querySelector('#SettingsWrong').appendChild(
                                self.renderOutcomeControls(overlayOrAnnotation, 'onWrongAnswer', 'backward', markUnsaved)
                            );
                            editorBody.appendChild(settingsRow);
                            FTTabs(settingsRow.querySelector('.settingsActionsTabs'));

                        } else {

                            if (questionType === 'rating') {
                                var _rsw = document.createElement('div');
                                _rsw.innerHTML = '<div class="layoutRow">'
                                    + '    <div class="column-6">'
                                    + '        <label>'+ self.labels['SettingsQuizRatingScale'] +'</label>'
                                    + '        <input type="number" class="quizRatingScaleInput" min="2" max="10" step="1">'
                                    + '    </div>'
                                    + '</div>';
                                var ratingScaleRow = _rsw.firstElementChild;
                                var ratingScaleInput = ratingScaleRow.querySelector('.quizRatingScaleInput');
                                ratingScaleInput.value = attributes.ratingScale || 5;
                                ratingScaleInput.addEventListener('change', function() {
                                    attributes.ratingScale = Math.max(2, Math.min(10, parseInt(this.value, 10) || 5));
                                    this.value = attributes.ratingScale;
                                    self.updateQuizVisuals(overlayOrAnnotation);
                                    markUnsaved();
                                });
                                editorBody.appendChild(ratingScaleRow);
                            }

                            var _oaw = document.createElement('div');
                            _oaw.innerHTML = '<div class="layoutRow">'
                                + '    <div class="column-12">'
                                + '        <label>'+ self.labels['SettingsActionsOnAnswered'] +'</label>'
                                + '    </div>'
                                + '</div>';
                            var onAnsweredRow = _oaw.firstElementChild;
                            onAnsweredRow.querySelector('.column-12').appendChild(
                                self.renderOutcomeControls(overlayOrAnnotation, 'onAnswered', null, markUnsaved)
                            );
                            editorBody.appendChild(onAnsweredRow);
                        }

                    };

                    renderEditorBody();

                    typeSelect.addEventListener('change', function() {
                        attributes.questionType = this.value;
                        self.ensureQuizAttributes(attributes, attributes.questionType);
                        renderEditorBody();
                        self.updateQuizVisuals(overlayOrAnnotation);
                        markUnsaved();
                    });

                    /* Undo: register when focus leaves the quiz editor (if changes were made) */

                    quizEditorContainer.addEventListener('focusout', function(evt) {
                        var newFocusTarget = evt.relatedTarget;
                        if (newFocusTarget && quizEditorContainer.contains(newFocusTarget)) {
                            return; // Focus is still within the container
                        }

                        var currentAttrs = JSON.stringify(overlayOrAnnotation.data.attributes);
                        var snapshotAttrs = JSON.stringify(quizAttributesSnapshot);

                        if (currentAttrs !== snapshotAttrs) {
                            var elementId = overlayOrAnnotation.data.created;

                            (function(id, oldAttr, newAttr, cat, labels, resourceItem) {
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
                                        resourceItem.updateQuizVisuals(el);
                                        FrameTrail.module('HypervideoModel').newUnsavedChange(cat);
                                    },
                                    redo: function() {
                                        var el = findElement();
                                        if (!el) return;
                                        el.data.attributes = JSON.parse(newAttr);
                                        resourceItem.updateQuizVisuals(el);
                                        FrameTrail.module('HypervideoModel').newUnsavedChange(cat);
                                    }
                                });
                            })(elementId, snapshotAttrs, currentAttrs, category, self.labels, self);

                            quizAttributesSnapshot = JSON.parse(currentAttrs);
                        }
                    });

                    return quizEditorContainer;

                },


                /**
                 * I render the answers list editor (used by the multipleChoice and multiSelect types).
                 *
                 * @method renderAnswersEditor
                 * @param {Object} overlayOrAnnotation
                 * @param {Function} markUnsaved
                 * @return HTMLElement
                 */
                renderAnswersEditor: function(overlayOrAnnotation, markUnsaved) {

                    var self = this,
                        attributes = overlayOrAnnotation.data.attributes;

                    var answersRow = document.createElement('div');
                    answersRow.className = 'layoutRow';
                    var leftColumn = document.createElement('div');
                    leftColumn.className = 'column-12';

                    leftColumn.insertAdjacentHTML('beforeend', '<label>'+ this.labels['SettingsQuizAnswersLabel'] +'</label>');

                    var answersContainer = document.createElement('div');
                    answersContainer.className = 'quizEditorAnswersContainer';

                    var getAnswerElement = function(answerInput, isCorrect) {
                        var answerWrapper = document.createElement('div');
                        answerWrapper.className = 'answerWrapper';
                        var answerText = document.createElement('input');
                        answerText.type = 'text';
                        answerText.value = answerInput || '';
                        var _adbw = document.createElement('div');
                        _adbw.innerHTML = '<button type="button" class="answerDeleteButton"><span class="icon-cancel"></span></button>';
                        var answerDeleteButton = _adbw.firstElementChild;
                        var _acbw = document.createElement('div');
                        _acbw.innerHTML = '<label class="switch">'
                                        +  '    <input class="answerCheckbox" type="checkbox" autocomplete="off" '+ (isCorrect ? 'checked="checked"' : '') +'>'
                                        +  '    <span class="slider round"></span>'
                                        +  '</label>';
                        var answerCheckbox = _acbw.firstElementChild;

                        answerWrapper.append(answerText, answerCheckbox, answerDeleteButton);
                        return answerWrapper;
                    };

                    for (var i = 0; i < attributes.answers.length; i++) {
                        answersContainer.appendChild(getAnswerElement(attributes.answers[i].text, attributes.answers[i].correct));
                    }

                    answersContainer.addEventListener('keyup', function(evt) {
                        var _inp = evt.target.closest('input[type="text"]');
                        if (!_inp) return;
                        if (!evt.metaKey && evt.key != 'Meta') {
                            var _wrapper = _inp.closest('.answerWrapper'),
                                thisIndex = Array.from(_wrapper.parentNode.children).indexOf(_wrapper);

                            attributes.answers[thisIndex].text = _inp.value;
                            self.updateQuizVisuals(overlayOrAnnotation);
                            markUnsaved();
                        }
                    });

                    answersContainer.addEventListener('click', function(evt) {
                        var _delBtn = evt.target.closest('.answerDeleteButton');
                        if (!_delBtn) return;
                        var _wrapper = _delBtn.closest('.answerWrapper');
                        var thisIndex = Array.from(_wrapper.parentNode.children).indexOf(_wrapper);

                        attributes.answers.splice(thisIndex, 1);
                        _wrapper.remove();
                        self.updateQuizVisuals(overlayOrAnnotation);
                        markUnsaved();
                    });

                    answersContainer.addEventListener('change', function(evt) {
                        var _cb = evt.target.closest('input[type="checkbox"]');
                        if (!_cb) return;
                        var _wrapper = _cb.closest('.answerWrapper');
                        var thisIndex = Array.from(_wrapper.parentNode.children).indexOf(_wrapper);

                        attributes.answers[thisIndex].correct = _cb.checked;
                        self.updateQuizVisuals(overlayOrAnnotation);
                        markUnsaved();
                    });

                    leftColumn.appendChild(answersContainer);

                    var _nabw = document.createElement('div');
                    _nabw.innerHTML = '<button type="button">'+ this.labels['GenericAdd'] +' <span class="icon-plus"></span></button>';
                    var newAnswerButton = _nabw.firstElementChild;
                    newAnswerButton.addEventListener('click', function() {
                        attributes.answers.push({ 'text': '', 'correct': false });
                        answersContainer.append(getAnswerElement('', false));
                        self.updateQuizVisuals(overlayOrAnnotation);
                        markUnsaved();
                    });

                    leftColumn.appendChild(newAnswerButton);
                    answersRow.appendChild(leftColumn);

                    return answersRow;

                },


                /**
                 * I render the controls for one outcome object (showText, optional jump, resumePlayback).
                 *
                 * @method renderOutcomeControls
                 * @param {Object} overlayOrAnnotation
                 * @param {String} outcomeName 'onCorrectAnswer' | 'onWrongAnswer' | 'onAnswered'
                 * @param {String} jumpDirection 'forward' | 'backward' | null
                 * @param {Function} markUnsaved
                 * @return HTMLElement
                 */
                renderOutcomeControls: function(overlayOrAnnotation, outcomeName, jumpDirection, markUnsaved) {

                    var outcome = overlayOrAnnotation.data.attributes[outcomeName],
                        jumpProperty = (jumpDirection === 'forward') ? 'jumpForward' : 'jumpBackward',
                        jumpLabel = (jumpDirection === 'forward') ? this.labels['GenericJumpForward'] : this.labels['GenericJumpBackward'];

                    var container = document.createElement('div');
                    container.className = 'quizOutcomeControls';

                    var html = '<div class="checkboxRow">'
                        + '    <label class="switch">'
                        + '        <input class="outcomeShowTextCheckbox" type="checkbox" autocomplete="off" '+ (outcome.showText ? 'checked="checked"' : '') +'>'
                        + '        <span class="slider round"></span>'
                        + '    </label>'
                        + '    <label>'+ this.labels['GenericShowText'] +'</label>'
                        + '    <input type="text" class="outcomeShowTextInput '+ (outcome.showText ? 'active' : '') +'">'
                        + '</div>';

                    if (jumpDirection) {
                        html += '<div class="checkboxRow">'
                            + '    <label class="switch">'
                            + '        <input class="outcomeJumpCheckbox" type="checkbox" autocomplete="off" '+ (outcome[jumpProperty] ? 'checked="checked"' : '') +'>'
                            + '        <span class="slider round"></span>'
                            + '    </label>'
                            + '    <label>'+ jumpLabel +'</label>'
                            + '    <input type="text" class="outcomeJumpInput" '+ (outcome[jumpProperty] ? '' : 'disabled="disabled"') +' value="'+ (outcome[jumpProperty] || 20) +'">'
                            + '    <span>'+ this.labels['GenericSeconds'] +'</span>'
                            + '</div>';
                    }

                    html += '<div class="checkboxRow">'
                        + '    <label class="switch">'
                        + '        <input class="outcomeResumeCheckbox" type="checkbox" autocomplete="off" '+ (outcome.resumePlayback ? 'checked="checked"' : '') +'>'
                        + '        <span class="slider round"></span>'
                        + '    </label>'
                        + '    <label>'+ this.labels['GenericContinuePlayback'] +'</label>'
                        + '</div>';

                    container.innerHTML = html;

                    var showTextInput = container.querySelector('.outcomeShowTextInput');
                    showTextInput.value = (outcome.showText) ? outcome.showText : '';

                    showTextInput.addEventListener('keyup', function(evt) {
                        if (!evt.metaKey && evt.key != 'Meta') {
                            outcome.showText = this.value;
                            markUnsaved();
                        }
                    });

                    container.querySelector('.outcomeShowTextCheckbox').addEventListener('change', function() {
                        if (!this.checked) {
                            showTextInput.value = '';
                            showTextInput.classList.remove('active');
                        } else {
                            showTextInput.classList.add('active');
                        }
                        outcome.showText = (this.checked) ? showTextInput.value : false;
                        markUnsaved();
                    });

                    if (jumpDirection) {
                        var jumpInput = container.querySelector('.outcomeJumpInput');
                        jumpInput.addEventListener('keyup', function(evt) {
                            if (!evt.metaKey && evt.key != 'Meta') {
                                outcome[jumpProperty] = parseFloat(this.value);
                                markUnsaved();
                            }
                        });
                        container.querySelector('.outcomeJumpCheckbox').addEventListener('change', function() {
                            jumpInput.disabled = !this.checked;
                            outcome[jumpProperty] = (this.checked) ? parseFloat(jumpInput.value) : false;
                            markUnsaved();
                        });
                    }

                    container.querySelector('.outcomeResumeCheckbox').addEventListener('change', function() {
                        outcome.resumePlayback = this.checked;
                        markUnsaved();
                    });

                    return container;

                }

            }

        }
    }

);
