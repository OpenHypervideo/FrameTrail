/**
 * @module Shared
 */


/**
 * I am the type definition of a ResourceQuiz.
 *
 * * Quizzes are made in the editor (the Custom Overlay gallery, the annotations' Custom tab)
 *   and are not listed in the ResourceManager.
 *
 * I support several question types (attributes.questionType):
 * * 'multipleChoice' (default) — one answer is chosen; each answer has an action
 * * 'multiSelect' — several answers can be selected and submitted
 * * 'freeText' — a free text response
 * * 'rating' — a numeric scale response (attributes.ratingScale steps)
 *
 * The rules (choices, decision, what follows) are FrameTrailQuiz's; the QuizController asks a
 * quiz, takes the answers and decides. I render the quiz, hand answers on and show its state
 * (refreshQuizState). Quizzes saved before per-answer actions (onCorrectAnswer, onWrongAnswer)
 * are read as they were and converted by my editor on its first change.
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
                pauseByDefault: true,
                iconClass:      'icon-question-circle-o',


                /**
                 * I render the content of myself: the question, the answer UI for the current
                 * question type, a status line and the place for the decision's result, wrapped in a
                 * <div class="resourceDetail" ...>. Answers go to the QuizController, which decides
                 * (FrameTrailQuiz); refreshQuizState() shows what it says. Every element I render is
                 * kept, so that all of them show the quiz's state (a view, a preview, a phone's sheet).
                 *
                 * @method renderContent
                 * @return HTMLElement
                 */
                renderContent: function() {

                    var attributes   = this.resourceData.attributes || {},
                        questionType = window.FrameTrailQuiz.questionType(attributes);

                    var _rdw = document.createElement('div');
                    _rdw.innerHTML = '<div class="resourceDetail" data-type="quiz" data-question-type="'+ questionType +'">'
                                        +  '    <div class="resourceContent">'
                                        +  '        <div class="resourceQuizQuestion"></div>'
                                        +  '        <div class="resourceQuizAnswersContainer"></div>'
                                        +  '        <div class="quizStatus"></div>'
                                        +  '        <div class="quizResult"></div>'
                                        +  '    </div>'
                                        +  '</div>';
                    var resourceDetail = _rdw.firstElementChild;
                    resourceDetail.querySelector('.resourceQuizQuestion').textContent = attributes.question || '';

                    var answersContainer = resourceDetail.querySelector('.resourceQuizAnswersContainer');

                    switch (questionType) {
                        case 'multiSelect':
                            this.renderMultiSelectContent(answersContainer);
                            break;
                        case 'freeText':
                            this.renderFreeTextContent(answersContainer);
                            break;
                        case 'rating':
                            this.renderRatingContent(answersContainer);
                            break;
                        default:
                            this.renderMultipleChoiceContent(answersContainer);
                            break;
                    }

                    resourceDetail.appendChild(this.buildResourceOptions({
                        licenseType: this.resourceData.licenseType,
                        licenseAttribution: this.resourceData.licenseAttribution
                    }));

                    this._rendered = (this._rendered || []).concat([resourceDetail]);
                    this.refreshQuizState();

                    return resourceDetail;

                },


                /**
                 * I hand an answer to the QuizController, if this quiz may be answered here and now
                 * (not while editing, but in the Preview).
                 *
                 * @method submitAnswer
                 * @param {*} choice
                 */
                submitAnswer: function(choice) {

                    var editMode       = FrameTrail.getState('editMode'),
                        QuizController = FrameTrail.module('QuizController');

                    if ((editMode && editMode !== 'preview') || !QuizController || !QuizController.stateOf(this).canAnswer) {
                        return;
                    }

                    QuizController.answer(this, choice);

                },


                /**
                 * I render the answer buttons for the 'multipleChoice' question type.
                 * @method renderMultipleChoiceContent
                 */
                renderMultipleChoiceContent: function(answersContainer) {

                    var self = this,
                        answers = this.resourceData.attributes.answers || [];

                    for (var i = 0; i < answers.length; i++) {
                        var answerElement = document.createElement('button');
                        answerElement.type = 'button';
                        answerElement.className = 'quizAnswer';
                        answerElement.textContent = (answers[i] && answers[i].text) || '';
                        answerElement.dataset.index = i;
                        answersContainer.appendChild(answerElement);
                    }

                    answersContainer.addEventListener('click', function(evt) {
                        var _btn = evt.target.closest('.quizAnswer');
                        if (!_btn) return;
                        self.submitAnswer(parseInt(_btn.dataset.index, 10));
                    });

                },


                /**
                 * I render toggleable answer buttons plus a submit button for the 'multiSelect' question type.
                 * @method renderMultiSelectContent
                 */
                renderMultiSelectContent: function(answersContainer) {

                    var self = this,
                        answers = this.resourceData.attributes.answers || [];

                    for (var i = 0; i < answers.length; i++) {
                        var answerElement = document.createElement('button');
                        answerElement.type = 'button';
                        answerElement.className = 'quizSelectableAnswer';
                        answerElement.textContent = (answers[i] && answers[i].text) || '';
                        answerElement.dataset.index = i;
                        answersContainer.appendChild(answerElement);
                    }

                    var submitButton = document.createElement('button');
                    submitButton.type = 'button';
                    submitButton.className = 'quizSubmitButton';
                    submitButton.textContent = this.labels['QuizSubmit'];
                    answersContainer.appendChild(submitButton);

                    answersContainer.addEventListener('click', function(evt) {
                        var _answerBtn = evt.target.closest('.quizSelectableAnswer');
                        if (_answerBtn) {
                            if (!_answerBtn.disabled) { _answerBtn.classList.toggle('selected'); }
                            return;
                        }
                        if (!evt.target.closest('.quizSubmitButton')) return;
                        var chosen = [];
                        answersContainer.querySelectorAll('.quizSelectableAnswer.selected').forEach(function(btn) {
                            chosen.push(parseInt(btn.dataset.index, 10));
                        });
                        self.submitAnswer(chosen);
                    });

                },


                /**
                 * I render a text input plus a submit button for the 'freeText' question type.
                 * @method renderFreeTextContent
                 */
                renderFreeTextContent: function(answersContainer) {

                    var self = this;

                    var textInput = document.createElement('textarea');
                    textInput.className = 'quizFreeTextInput';
                    textInput.maxLength = window.FrameTrailQuiz.MAX_TEXT;
                    answersContainer.appendChild(textInput);

                    var submitButton = document.createElement('button');
                    submitButton.type = 'button';
                    submitButton.className = 'quizSubmitButton';
                    submitButton.textContent = this.labels['QuizSubmit'];
                    answersContainer.appendChild(submitButton);

                    submitButton.addEventListener('click', function() {
                        if (!textInput.value.trim()) return;
                        self.submitAnswer(textInput.value);
                    });

                },


                /**
                 * I render a row of scale buttons for the 'rating' question type.
                 * @method renderRatingContent
                 */
                renderRatingContent: function(answersContainer) {

                    var self = this,
                        scale = window.FrameTrailQuiz.ratingScale(this.resourceData.attributes);

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
                        if (!_btn) return;
                        self.submitAnswer(parseInt(_btn.dataset.value, 10));
                    });

                },


                /**
                 * I show the quiz's state (QuizController.stateOf()) in every element I rendered:
                 * whether it may be answered, the answer given here, the decision with right and
                 * wrong (when the quiz marks answers correct), the status line and the result.
                 *
                 * @method refreshQuizState
                 */
                refreshQuizState: function() {

                    var self           = this,
                        Quiz           = window.FrameTrailQuiz,
                        QuizController = FrameTrail.module('QuizController'),
                        attributes     = this.resourceData.attributes || {},
                        state          = QuizController ? QuizController.stateOf(this) : { canAnswer: false },
                        scored         = Quiz.correctOf(attributes, Quiz.questionType(attributes) === 'multiSelect' ? [] : 0) !== null;

                    // Forget elements that were shown and are gone; a few that never were shown are kept a while.
                    this._rendered = (this._rendered || []).filter(function(detail) {
                        if (detail.isConnected) { detail._quizShown = true; }
                        return detail.isConnected || !detail._quizShown;
                    }).slice(-20);

                    this._rendered.forEach(function(detail) {

                        var yours   = state.yours,
                            decided = state.decided || null;

                        detail.classList.toggle('quizOpen', !!state.canAnswer);
                        detail.classList.toggle('quizDecided', !!decided);

                        detail.querySelectorAll('.quizAnswer, .quizSelectableAnswer, .quizRatingButton, .quizSubmitButton, .quizFreeTextInput').forEach(function(control) {
                            control.disabled = !state.canAnswer;
                        });

                        detail.querySelectorAll('.quizAnswer').forEach(function(button) {
                            var index   = parseInt(button.dataset.index, 10),
                                answer  = (attributes.answers || [])[index] || {};
                            button.classList.toggle('selected', yours === index);
                            button.classList.toggle('decided', !!decided && decided.index === index);
                            button.classList.toggle('correct', !!decided && scored && answer.correct === true);
                            button.classList.toggle('wrong', !!decided && scored && yours === index && answer.correct !== true);
                        });

                        detail.querySelectorAll('.quizSelectableAnswer').forEach(function(button) {
                            var index  = parseInt(button.dataset.index, 10),
                                answer = (attributes.answers || [])[index] || {},
                                chosen = Array.isArray(yours) && yours.indexOf(index) >= 0;
                            if (Array.isArray(yours) || decided) { button.classList.toggle('selected', chosen); }
                            button.classList.toggle('correct', !!decided && scored && answer.correct === true);
                            button.classList.toggle('wrong', !!decided && scored && chosen && answer.correct !== true);
                        });

                        detail.querySelectorAll('.quizRatingButton').forEach(function(button) {
                            button.classList.toggle('selected', yours === parseInt(button.dataset.value, 10));
                        });

                        var textInput = detail.querySelector('.quizFreeTextInput');
                        if (textInput && typeof yours === 'string' && document.activeElement !== textInput) {
                            textInput.value = yours;
                        }

                        var status = detail.querySelector('.quizStatus');
                        if (status) {
                            status.textContent = state.status || ((yours !== undefined && state.canAnswer) ? self.labels['QuizThanks'] : '');
                        }

                        var result = detail.querySelector('.quizResult');
                        if (result) {
                            result.innerHTML = '';
                            // Each element gets its own copy: the controller builds a new one per call.
                            var block = QuizController ? QuizController.stateOf(self).result : null;
                            if (block) { result.appendChild(block); }
                        }

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
                        + '                  <div class="resourceTitle"></div>'
                        + '              </div>';
                    var thumbElement = _thw.firstElementChild;
                    thumbElement.querySelector('.resourceTitle').textContent = this.resourceData.name
                        || (this.resourceData.attributes && this.resourceData.attributes.question)
                        || this.labels['ResourceTypeQuiz'];

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

                    var resourceItem = overlayOrAnnotation.resourceItem || this,
                        shown        = (resourceItem._rendered || []).filter(function(detail) { return detail.isConnected; });

                    // Every element showing the quiz (on the video, in views, in previews) is rendered anew in its place.
                    resourceItem._rendered = [];
                    shown.forEach(function(detail) {
                        detail.replaceWith(resourceItem.renderContent());
                    });

                    if (overlayOrAnnotation.contentChanged) { overlayOrAnnotation.contentChanged(); }

                },


                /**
                 * I render the editor of a quiz: question type and question; for multipleChoice
                 * the answers, each with what happens when it is decided (an action, a text shown
                 * with the result, whether it is the default); for the other types what happens
                 * after answering; the rating's scale; an annotation's time to answer.
                 *
                 * A quiz saved before per-answer actions is shown converted
                 * (FrameTrailQuiz.fromLegacy) and becomes so with the first change. A change is
                 * one undo step, taken when the focus leaves the editor or a choice is made.
                 *
                 * @method renderQuizEditor
                 * @param {Object} overlayOrAnnotation
                 * @return HTMLElement
                 */
                renderQuizEditor: function(overlayOrAnnotation) {

                    var self       = this,
                        Quiz       = window.FrameTrailQuiz,
                        labels     = this.labels,
                        attributes = overlayOrAnnotation.data.attributes,
                        isOverlay  = !!overlayOrAnnotation.overlayElement,
                        category   = isOverlay ? 'overlays' : 'annotations',
                        itemId     = overlayOrAnnotation.data.created,
                        legacy     = Quiz.isLegacy(attributes),
                        edited     = legacy ? Quiz.fromLegacy(attributes, overlayOrAnnotation.data.start) : attributes,
                        snapshot   = JSON.stringify(attributes);

                    var ACTIONS = [
                        { value: '',                 label: labels['SettingsQuizActionContinue'] },
                        { value: 'pause',            label: labels['SettingsQuizActionPause'] },
                        { value: 'jumpToTime',       label: labels['ActionPresetJumpToTime'] },
                        { value: 'jumpToHypervideo', label: labels['ActionPresetJumpToHypervideo'] },
                        { value: 'openUrl',          label: labels['ActionOpenUrl'] }
                    ];

                    var container = document.createElement('div');
                    container.className = 'quizEditorContainer';

                    // The attributes object stays the item's: its keys are replaced.
                    var replaceAttributes = function(target, next) {
                        Object.keys(target).forEach(function(key) { delete target[key]; });
                        Object.keys(next).forEach(function(key) { target[key] = next[key]; });
                    };

                    // The first change makes a legacy quiz the converted one shown.
                    var convert = function() {
                        if (!legacy) { return; }
                        legacy = false;
                        replaceAttributes(attributes, edited);
                        edited = attributes;
                    };

                    var changed = function(visual) {
                        FrameTrail.module('HypervideoModel').newUnsavedChange(category);
                        if (visual) { self.updateQuizVisuals(overlayOrAnnotation); }
                    };

                    var findItem = function() {
                        var items = FrameTrail.module('HypervideoModel')[category];
                        for (var i = 0; i < items.length; i++) {
                            if (items[i].data.created === itemId) { return items[i]; }
                        }
                        return null;
                    };

                    var applyState = function(state) {
                        var item = findItem();
                        if (!item) { return; }
                        replaceAttributes(item.data.attributes, JSON.parse(state));
                        self.updateQuizVisuals(item);
                        FrameTrail.module('HypervideoModel').newUnsavedChange(category);
                        if (container.isConnected && item.data.attributes === attributes) {
                            snapshot = state;
                            legacy   = Quiz.isLegacy(attributes);
                            edited   = legacy ? Quiz.fromLegacy(attributes, overlayOrAnnotation.data.start) : attributes;
                            render();
                        }
                    };

                    var commit = function() {
                        var now = JSON.stringify(attributes);
                        if (now === snapshot) { return; }
                        var before = snapshot;
                        snapshot = now;
                        FrameTrail.module('UndoManager').register({
                            category:    category,
                            description: (isOverlay ? labels['SidebarOverlays'] : labels['SidebarMyAnnotations']) + ' ' + labels['ResourceTypeQuiz'],
                            undo: function() { applyState(before); },
                            redo: function() { applyState(now); }
                        });
                    };

                    container.addEventListener('focusout', function(evt) {
                        if (evt.relatedTarget && container.contains(evt.relatedTarget)) { return; }
                        commit();
                    });

                    var field = function(className, value, placeholder) {
                        var input = document.createElement('input');
                        input.type = 'text';
                        input.className = className;
                        input.value = value || '';
                        if (placeholder) { input.placeholder = placeholder; }
                        return input;
                    };

                    var switchControl = function(className, checked, title) {
                        var _sw = document.createElement('div');
                        _sw.innerHTML = '<label class="switch"><input class="'+ className +'" type="checkbox" autocomplete="off"><span class="slider round"></span></label>';
                        var element = _sw.firstElementChild;
                        element.querySelector('input').checked = !!checked;
                        if (title) { element.setAttribute('data-tooltip-bottom-left', title); }
                        return element;
                    };

                    // The text shown with the result, of an answer or of onAnswered.
                    var feedbackField = function(holder) {
                        var input = field('quizFeedbackInput', holder.feedback, labels['SettingsQuizFeedback']);
                        input.addEventListener('input', function() {
                            convert();
                            if (this.value) { holder.feedback = this.value; } else { delete holder.feedback; }
                            changed(false);
                        });
                        return input;
                    };

                    var actionLabel = function(holder) {
                        for (var i = 0; i < ACTIONS.length; i++) {
                            if (ACTIONS[i].value === (holder.action || '')) { return ACTIONS[i].label; }
                        }
                        return ACTIONS[0].label;
                    };

                    var actionControls = function(holder, onChange) {
                        return self.renderActionControls(overlayOrAnnotation, {
                            target:       holder,
                            actions:      ACTIONS,
                            beforeChange: convert,
                            onChange:     function() { commit(); if (onChange) { onChange(); } }
                        });
                    };

                    var renderAnswers = function(body) {

                        var type    = Quiz.questionType(edited),
                            answers = edited.answers;

                        var row = document.createElement('div');
                        row.className = 'layoutRow';
                        var column = document.createElement('div');
                        column.className = 'column-12';
                        column.insertAdjacentHTML('beforeend', '<label>'+ labels['SettingsQuizAnswersLabel'] +'</label>');

                        var list = document.createElement('div');
                        list.className = 'quizEditorAnswersContainer';

                        answers.forEach(function(answer, index) {

                            var wrapper = document.createElement('div');
                            wrapper.className = 'answerWrapper';

                            var text = field('quizAnswerText', answer.text);
                            text.addEventListener('input', function() {
                                convert();
                                answer.text = this.value;
                                changed(true);
                            });

                            var correct = switchControl('answerCheckbox', answer.correct === true, labels['SettingsQuizCorrect']);
                            correct.querySelector('input').addEventListener('change', function() {
                                convert();
                                answer.correct = this.checked;
                                changed(true);
                                commit();
                            });

                            var _db = document.createElement('div');
                            _db.innerHTML = '<button type="button" class="answerDeleteButton"><span class="icon-cancel"></span></button>';
                            var remove = _db.firstElementChild;
                            remove.addEventListener('click', function() {
                                convert();
                                attributes.answers.splice(index, 1);
                                changed(true);
                                commit();
                                render();
                            });

                            wrapper.append(text, correct, remove);

                            if (type === 'multipleChoice') {

                                var then = document.createElement('details');
                                then.className = 'quizAnswerThen';
                                var summary = document.createElement('summary');
                                var updateSummary = function() {
                                    summary.textContent = labels['SettingsQuizThen'] + ' ' + actionLabel(answer)
                                        + (answer.feedback ? ' · ' + answer.feedback : '') + (answer['default'] === true ? ' · ' + labels['SettingsQuizDefaultShort'] : '');
                                };
                                updateSummary();
                                then.appendChild(summary);
                                then.appendChild(actionControls(answer, updateSummary));

                                var feedback = feedbackField(answer);
                                feedback.addEventListener('change', updateSummary);
                                then.appendChild(feedback);

                                var defaultRow = document.createElement('div');
                                defaultRow.className = 'checkboxRow';
                                var defaultSwitch = switchControl('quizDefaultCheckbox', answer['default'] === true);
                                var defaultLabel = document.createElement('label');
                                defaultLabel.textContent = labels['SettingsQuizDefault'];
                                defaultRow.append(defaultSwitch, defaultLabel);
                                defaultSwitch.querySelector('input').addEventListener('change', function() {
                                    convert();
                                    var on = this.checked;
                                    attributes.answers.forEach(function(other) { delete other['default']; });
                                    if (on) { answer['default'] = true; }
                                    changed(false);
                                    commit();
                                    list.querySelectorAll('.quizDefaultCheckbox').forEach(function(box) { if (box !== defaultSwitch.querySelector('input')) { box.checked = false; } });
                                    updateSummary();
                                });
                                defaultLabel.addEventListener('click', function() { defaultSwitch.querySelector('input').click(); });
                                then.appendChild(defaultRow);

                                wrapper.appendChild(then);

                            }

                            list.appendChild(wrapper);

                        });

                        column.appendChild(list);

                        var _ab = document.createElement('div');
                        _ab.innerHTML = '<button type="button">'+ labels['GenericAdd'] +' <span class="icon-plus"></span></button>';
                        var add = _ab.firstElementChild;
                        add.addEventListener('click', function() {
                            convert();
                            attributes.answers.push((type === 'multipleChoice') ? { text: '', correct: false, action: '' } : { text: '', correct: false });
                            changed(true);
                            commit();
                            render();
                        });
                        column.appendChild(add);

                        row.appendChild(column);
                        body.appendChild(row);

                    };

                    var renderAfterAnswering = function(body) {

                        if (!edited.onAnswered || typeof edited.onAnswered !== 'object') {
                            edited.onAnswered = { action: '' };
                        }

                        var row = document.createElement('div');
                        row.className = 'layoutRow';
                        var column = document.createElement('div');
                        column.className = 'column-12';
                        column.insertAdjacentHTML('beforeend', '<label>'+ labels['SettingsActionsOnAnswered'] +'</label>');
                        column.appendChild(actionControls(edited.onAnswered));
                        column.appendChild(feedbackField(edited.onAnswered));
                        row.appendChild(column);
                        body.appendChild(row);

                    };

                    var numberRow = function(labelText, value, min, max, onChange) {
                        var _nr = document.createElement('div');
                        _nr.innerHTML = '<div class="layoutRow"><div class="column-6"><label></label><input type="number" step="1"></div></div>';
                        var row   = _nr.firstElementChild,
                            input = row.querySelector('input');
                        row.querySelector('label').textContent = labelText;
                        input.min = min;
                        if (max !== null) { input.max = max; }
                        input.value = value;
                        input.addEventListener('change', function() {
                            convert();
                            onChange(this);
                            commit();
                        });
                        return row;
                    };

                    var render = function() {

                        container.innerHTML = '';

                        var type = Quiz.questionType(edited);

                        var _hrw = document.createElement('div');
                        _hrw.innerHTML = '<div class="layoutRow">'
                            + '    <div class="column-4">'
                            + '        <label>'+ labels['SettingsQuizTypeLabel'] +'</label>'
                            + '        <div class="custom-select">'
                            + '        <select class="quizTypeSelect">'
                            + '            <option value="multipleChoice">'+ labels['QuizTypeMultipleChoice'] +'</option>'
                            + '            <option value="multiSelect">'+ labels['QuizTypeMultiSelect'] +'</option>'
                            + '            <option value="freeText">'+ labels['QuizTypeFreeText'] +'</option>'
                            + '            <option value="rating">'+ labels['QuizTypeRating'] +'</option>'
                            + '        </select>'
                            + '        </div>'
                            + '    </div>'
                            + '    <div class="column-8">'
                            + '        <label>'+ labels['SettingsQuizQuestionLabel'] +'</label>'
                            + '        <input type="text" class="quizQuestionInput">'
                            + '    </div>'
                            + '</div>';
                        var header = _hrw.firstElementChild;
                        container.appendChild(header);

                        var typeSelect    = header.querySelector('.quizTypeSelect'),
                            questionInput = header.querySelector('.quizQuestionInput');

                        typeSelect.value = type;
                        questionInput.value = edited.question || '';

                        questionInput.addEventListener('input', function() {
                            convert();
                            attributes.question = this.value;
                            changed(true);
                        });

                        typeSelect.addEventListener('change', function() {
                            convert();
                            replaceAttributes(attributes, Quiz.changeType(attributes, this.value, {
                                answer1: labels['SettingsQuizDefaultAnswer1'],
                                answer2: labels['SettingsQuizDefaultAnswer2']
                            }));
                            changed(true);
                            commit();
                            render();
                        });

                        if (Quiz.isChoice(edited)) {
                            renderAnswers(container);
                        }

                        if (type === 'rating') {
                            container.appendChild(numberRow(labels['SettingsQuizRatingScale'], Quiz.ratingScale(edited), 2, 10, function(input) {
                                attributes.ratingScale = Math.max(2, Math.min(10, parseInt(input.value, 10) || 5));
                                input.value = attributes.ratingScale;
                                changed(true);
                            }));
                        }

                        if (type !== 'multipleChoice') {
                            renderAfterAnswering(container);
                        }

                        // The time to answer, where many may answer: in a view, on the phones.
                        if (!isOverlay) {
                            container.appendChild(numberRow(labels['SettingsQuizCountdown'], parseFloat(edited.countdown) || 0, 0, null, function(input) {
                                var seconds = Math.max(0, parseInt(input.value, 10) || 0);
                                if (seconds) { attributes.countdown = seconds; } else { delete attributes.countdown; }
                                input.value = seconds;
                                changed(false);
                            }));
                        }

                    };

                    render();

                    return container;

                }

            }

        }
    }

);
