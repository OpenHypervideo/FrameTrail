/**
 * @module Player
 */


/**
 * I am the CodeSnippetsController. I am responsible for managing all the {{#crossLink "CodeSnippet"}}codeSnippets{{/crossLink}}
 * in the current {{#crossLink "HypervideoModel"}}HypervideoModel{{/crossLink}}, and for displaying them for viewing and editing.
 *
 * @class CodeSnippetsController
 * @static
 */



FrameTrail.defineModule('CodeSnippetsController', function(FrameTrail){

    var labels = FrameTrail.module('Localization').labels;

    var codeSnippets       = FrameTrail.module('HypervideoModel').codeSnippets, // can be shadowed be function local vars
        ViewVideo          = FrameTrail.module('ViewVideo'),
        codeSnippetInFocus = null;


    /**
     * I tell all codeSnippets in the
     * {{#crossLink "HypervideoModel/codeSnippets:attribute"}}HypervideoModel/codeSnippets attribute{{/crossLink}}
     * to render their elements into the DOM.
     * @method initController
     */
    function initController() {

        var hypervideoModel = FrameTrail.module('HypervideoModel');

        for (var i = 0; i < hypervideoModel.codeSnippets.length; i++) {

            hypervideoModel.codeSnippets[i].renderTimelineInDOM();
            hypervideoModel.codeSnippets[i].initCodeSnippetFunction();

        }

        initCustomCSS(hypervideoModel.customCSS);

    };



    /**
     * I remove all tileElements and codeSnippetElements from the DOM and then
     * re-append them again.
     *
     * This has the purpose that the DOM elements must appear in a sorted order by their start time. So this method has to called
     * after the user has finished editing.
     *
     * @method rearrangeTilesAndContent
     */
    function rearrangeTilesAndContent() {

        var codeSnippets = FrameTrail.module('HypervideoModel').codeSnippets;

        for (var i = 0; i < codeSnippets.length; i++) {

            codeSnippets[i].initCodeSnippetFunction();

        }


    };


    /**
     * I am a central method of the CodeSnippetsController.
     * I am called from the update functions inside the HypervideoController
     * and I set the activeState of the codeSnippets according to the current time.
     *
     * @method updateStatesOfCodeSnippets
     * @param {Number} currentTime
     */
    function updateStatesOfCodeSnippets(currentTime) {

        var codeSnippet;

        for (var idx in codeSnippets) {

            codeSnippet = codeSnippets[idx];

            if (    codeSnippet.data.start <= currentTime
                 && codeSnippet.data.start+2 >= currentTime) {

                if (!codeSnippet.activeState && !codeSnippetInFocus) {

                    codeSnippet.setActive();

                }

            } else {

                if (codeSnippet.activeState) {

                    codeSnippet.setInactive();

                }

            }

        }

        if (codeSnippetInFocus && !codeSnippetInFocus.activeState) {
            // don't execute custom code when editing snippet
            //codeSnippetInFocus.setActive();
        }


    };


    /**
     * When we are in the editMode annotations, the timeline should
     * show all timeline elements stacked, which is what I do.
     * @method stackTimelineView
     */
    function stackTimelineView() {

        var cstEl   = ViewVideo.CodeSnippetTimeline;
        var scroller = cstEl.querySelector('.timelineScroller');
        if (scroller) {
            // Reset inline heights first so elements resolve to their CSS-defined height
            // (avoids circular dependency: elements height:100% → scroller min-height:100% → inflated)
            scroller.style.height    = '';
            scroller.style.flexBasis = '';
            cstEl.style.height    = '';
            cstEl.style.minHeight = '';
            cstEl.style.flexBasis = '';
            CollisionDetection(scroller, {spacing:0, includeVerticalMargins: true, exclude: '.timelinePlayhead', containerPadding: 4});
            // Read the inline value CollisionDetection just wrote (not .css() which is affected by CSS min-height:100%)
            var stackedHeight = scroller.style.height;
            cstEl.style.height     = stackedHeight;
            cstEl.style.flexBasis  = stackedHeight;
            cstEl.style.flexShrink = '0';
        } else {
            CollisionDetection(cstEl, {spacing:0, includeVerticalMargins: true});
        }
        ViewVideo.adjustLayout();
        ViewVideo.adjustHypervideo();

        if (FrameTrail.module('TimelineController').initialized) {
            FrameTrail.module('TimelineController').refreshMinimap();
        }

    };


    /**
     * When we are in the editMode annotations, the timeline should
     * show all timeline elements stacked. After leaving this mode,
     * I have to reset the timelineElements and the timeline to their normal
     * layout.
     * @method resetTimelineView
     * @private
     */
    function resetTimelineView() {

        var cstEl = ViewVideo.CodeSnippetTimeline;
        cstEl.style.height     = '';
        cstEl.style.minHeight  = '';
        cstEl.style.flexBasis  = '';
        cstEl.style.flexShrink = '';
        var target = cstEl.querySelector('.timelineScroller');
        if (target) {
            target.style.height    = '';
            target.style.flexBasis = '';
        }
        var targetContainer = target || cstEl;
        targetContainer.querySelectorAll(':scope > .timelineElement').forEach(function(el) {
            el.style.top    = '';
            el.style.right  = '';
            el.style.bottom = '';
            el.style.height = '';
        });

    };



    /**
     * When the editMode 'codesnippets' was entered, the #EditingOptions area
     * should show two tabs:
     * * a list of (draggable) thumbnails with available hypervideos
     * * a text form, where the user can manually input a link URL
     *
     * @method initEditOptions
     * @private
     */

    /**
     * I create a no-code "action preset" picker: a select element which inserts
     * ready-made JavaScript for common actions into a CodeMirror 6 editor.
     *
     * @method renderActionPresetPicker
     * @param {Function} getEditorView Function returning the target CM6 EditorView
     * @return HTMLElement
     */
    function renderActionPresetPicker(getEditorView) {

        var presets = [
            { label: labels['ActionPresetPause'],            code: 'hypervideo.pause();' },
            { label: labels['ActionPresetPlay'],             code: 'hypervideo.play();' },
            { label: labels['ActionPresetJumpToTime'],       code: 'hypervideo.currentTime = 10; // ' + labels['ActionPresetJumpToTimeHint'] },
            { label: labels['ActionPresetJumpToHypervideo'], code: "window.location.hash = 'hypervideo=HYPERVIDEO_ID'; // " + labels['ActionPresetJumpToHypervideoHint'] },
            { label: labels['ActionPresetShowMessage'],      code: "window.alert('" + labels['ActionPresetShowMessageDefault'] + "');" }
        ];

        var wrapper = document.createElement('div');
        wrapper.className = 'custom-select actionPresetPicker';

        var select = document.createElement('select');
        var optionsHTML = '<option value="" disabled selected style="display:none;">'+ labels['ActionPresetInsert'] +'</option>';
        for (var i = 0; i < presets.length; i++) {
            optionsHTML += '<option value="'+ i +'">'+ presets[i].label +'</option>';
        }
        select.innerHTML = optionsHTML;

        select.addEventListener('change', function() {
            var preset = presets[parseInt(this.value, 10)];
            this.value = '';
            if (!preset) { return; }

            var editorView = getEditorView();
            if (!editorView) { return; }

            var doc = editorView.state.doc,
                insert = preset.code + '\n';

            if (doc.length > 0 && doc.sliceString(doc.length - 1) !== '\n') {
                insert = '\n' + insert;
            }

            editorView.dispatch({ changes: { from: doc.length, insert: insert } });
            editorView.focus();
        });

        wrapper.appendChild(select);

        return wrapper;

    };


    function initEditOptions() {

        ViewVideo.EditingOptions.innerHTML = '';

        var _hint = document.createElement('div');
        _hint.className = 'message active';
        _hint.innerHTML = '<span class="icon-code"></span> ' + labels['MessageHintDragCodeSnippets'];
        ViewVideo.EditingOptions.appendChild(_hint);

        var hypervideos = FrameTrail.module('Database').hypervideos,
            thumb,
            events      = FrameTrail.module('HypervideoModel').events,
            customCSS   = FrameTrail.module('HypervideoModel').customCSS;

            var _cseWrapper = document.createElement('div');
            _cseWrapper.innerHTML = '<div class="codeSnippetEditingTabs">' +
                '    <ul>' +
                '        <li><a href="#CodeSnippetList">'+ labels['SidebarCustomCode'] +'</a></li>' +
                '        <li><a href="#CustomCSS">CSS</a></li>' +
                '        <li class="ui-tabs-right"><a href="#EventOnEnded">onEnded</a></li>' +
                '        <li class="ui-tabs-right"><a href="#EventOnPause">onPause</a></li>' +
                '        <li class="ui-tabs-right"><a href="#EventOnPlay">onPlay</a></li>' +
                '        <li class="ui-tabs-right"><a href="#EventOnReady">onReady</a></li>' +
                '        <li class="ui-tabs-right tab-label">Events: </li>' +
                '    </ul>' +
                '    <div id="CustomCSS">' +
                '        <div class="message active">'+ labels['MessageCustomCSSHypervideo'] +'</div>' +
                '        <div style="position: relative; height: calc(100% - 23px);">' +
                '            <textarea class="customCSS cssTextarea">' + (customCSS ? customCSS : '') + '</textarea>' +
                '        </div>' +
                '    </div>' +
                '    <div id="CodeSnippetList">' +
                '    </div>' +
                '    <div id="EventOnReady">' +
                '        <textarea class="onReadyCode codeTextarea" data-eventname="onReady">' + (events.onReady ? events.onReady : '') + '</textarea>' +
                '        <button class="executeEventCode">'+ labels['SettingsTestCode'] +'</button>' +
                '    </div>' +
                '    <div id="EventOnPlay">' +
                '        <textarea class="onPlayCode codeTextarea" data-eventname="onPlay">' + (events.onPlay ? events.onPlay : '') + '</textarea>' +
                '        <button class="executeEventCode">'+ labels['SettingsTestCode'] +'</button>' +
                '    </div>' +
                '    <div id="EventOnPause">' +
                '        <textarea class="onPauseCode codeTextarea" data-eventname="onPause">' + (events.onPause ? events.onPause : '') + '</textarea>' +
                '        <button class="executeEventCode">'+ labels['SettingsTestCode'] +'</button>' +
                '    </div>' +
                '    <div id="EventOnEnded">' +
                '        <textarea class="onEndedCode codeTextarea" data-eventname="onEnded">' + (events.onEnded ? events.onEnded : '') + '</textarea>' +
                '        <button class="executeEventCode">'+ labels['SettingsTestCode'] +'</button>' +
                '    </div>' +
                '</div>';
            var codeSnippetEditingOptions = _cseWrapper.firstElementChild;

        FTTabs(codeSnippetEditingOptions, {
            heightStyle: 'fill',
            activate: function(event, ui) {
                var cm6Wrapper = ui.newPanel.querySelector('.cm6-wrapper');
                if (cm6Wrapper && cm6Wrapper._cm6view) { cm6Wrapper._cm6view.requestMeasure(); }
            }
        });

            var codeSnippetList = codeSnippetEditingOptions.querySelector('#CodeSnippetList');

        codeSnippetEditingOptions.addEventListener('click', function(evt) {
            var btn = evt.target.closest('.executeEventCode');
            if (!btn) { return; }
            var textarea = btn.parentElement.querySelector('textarea');
            var cmWrapper = btn.parentElement.querySelector('.cm6-wrapper');
            var code = (cmWrapper && cmWrapper._cm6view)
                        ? cmWrapper._cm6view.state.doc.toString()
                        : (textarea ? textarea.value : '');
            try {
                var testRun = new Function('FrameTrail', 'hypervideo', code);
                testRun(FrameTrail, FrameTrail.module('HypervideoController'));
            } catch (exception) {
                alert(labels['MessageCodeContainsErrors'] +': '+ exception.message);
            }
        });

        // Append Editing Options
        ViewVideo.EditingOptions.appendChild(codeSnippetEditingOptions);

        /* Append custom code snippet element to 'Custom Code Snippet' tab */
        // TODO: Move to separate function
        var _cseWrapper2 = document.createElement('div');
        _cseWrapper2.innerHTML = '<div class="codeSnippetElement" data-type="codesnippet">' +
            '<div class="codeSnippetTitle">'+ labels['SettingsCodeSnippetCustom'] +'</div>' +
            '</div>';
        var codeSnippetElement = _cseWrapper2.firstElementChild;

        (function() {
            var dragClone = null;
            interact(codeSnippetElement).draggable({
                listeners: {
                    start: function(e) {
                        var rect = e.target.getBoundingClientRect();
                        dragClone = e.target.cloneNode(true);
                        dragClone.style.position = 'fixed';
                        dragClone.style.zIndex = '1000';
                        dragClone.style.pointerEvents = 'auto';
                        dragClone.style.boxSizing = 'border-box';
                        dragClone.style.width = rect.width + 'px';
                        dragClone.style.height = rect.height + 'px';
                        dragClone.style.left = rect.left + 'px';
                        dragClone.style.top = rect.top + 'px';
                        dragClone.classList.add('ft-drag-clone');
                        document.body.appendChild(dragClone);
                        e.target.classList.add('dragPlaceholder');
                        document.body.classList.add('ft-dragging');
                    },
                    move: function(e) {
                        if (dragClone) {
                            dragClone.style.left = (parseFloat(dragClone.style.left) + e.dx) + 'px';
                            dragClone.style.top  = (parseFloat(dragClone.style.top)  + e.dy) + 'px';
                        }
                    },
                    end: function(e) {
                        e.target.classList.remove('dragPlaceholder');
                        if (dragClone) { dragClone.remove(); dragClone = null; }
                        document.body.classList.remove('ft-dragging');
                    }
                }
            });
        }());

        codeSnippetList.append(codeSnippetElement);

        // Init CodeMirror 6 editors for Events

        var CM6 = window.FrameTrailCM6;
        var codeTextareas = Array.from(codeSnippetEditingOptions.querySelectorAll('.codeTextarea'));

        for (var i=0; i<codeTextareas.length; i++) {
            (function(textarea) {
                var cm6Wrapper = document.createElement('div');
                cm6Wrapper.className = 'cm6-wrapper';
                cm6Wrapper.style.height = 'calc(100% - 40px)';
                textarea.insertAdjacentElement('afterend', cm6Wrapper);
                textarea.style.display = 'none';
                var codeEditor = new CM6.EditorView({
                    state: CM6.EditorState.create({
                        doc: textarea.value,
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
                                var currentEvents = FrameTrail.module('HypervideoModel').events;
                                currentEvents[textarea.dataset.eventname] = update.state.doc.toString();
                                FrameTrail.module('HypervideoModel').events = currentEvents;
                            })
                        ]
                    }),
                    parent: cm6Wrapper
                });
                cm6Wrapper._cm6view = codeEditor;

                cm6Wrapper.insertAdjacentElement('beforebegin', renderActionPresetPicker(function() {
                    return cm6Wrapper._cm6view;
                }));
            })(codeTextareas[i]);
        }

        // Init CodeMirror 6 editors for Custom CSS

        var cssTextareas = Array.from(codeSnippetEditingOptions.querySelectorAll('.cssTextarea'));

        for (var i=0; i<cssTextareas.length; i++) {
            (function(textarea) {
                var cm6Wrapper = document.createElement('div');
                cm6Wrapper.className = 'cm6-wrapper';
                cm6Wrapper.style.height = '100%';
                textarea.insertAdjacentElement('afterend', cm6Wrapper);
                textarea.style.display = 'none';
                var codeEditor = new CM6.EditorView({
                    state: CM6.EditorState.create({
                        doc: textarea.value,
                        extensions: [
                            CM6.oneDark,
                            CM6.lineNumbers(),
                            CM6.highlightActiveLine(),
                            CM6.highlightActiveLineGutter(),
                            CM6.drawSelection(),
                            CM6.history(),
                            CM6.keymap.of([].concat(CM6.defaultKeymap, CM6.historyKeymap)),
                            CM6.EditorView.lineWrapping,
                            CM6.StreamLanguage.define(CM6.legacyModes.css),
                            window.FrameTrailCM6Linters.css,
                            CM6.lintGutter(),
                            CM6.EditorView.updateListener.of(function(update) {
                                if (!update.docChanged) { return; }
                                var newValue = update.state.doc.toString();
                                FrameTrail.module('HypervideoModel').customCSS = newValue;
                                updateCustomCSS(newValue);
                            })
                        ]
                    }),
                    parent: cm6Wrapper
                });
                cm6Wrapper._cm6view = codeEditor;
            })(cssTextareas[i]);
        }


    };


    /**
     * When the editMode 'codesnippets' has been entered, the
     * codeSnippet timeline should be droppable for new items
     * (from the tab of available hypervideos, see {{#crossLink "CodeSnippetsController/initEditOptions:method"}}CodeSnippetsController/initEditOptions{{/crossLink}}).
     * A drop event should trigger the process of creating a new codeSnippet.
     * My parameter is true or false to activate or deactivate this behavior.
     * @method makeTimelineDroppable
     * @param {Boolean} active
     */
    function makeTimelineDroppable(active) {

        if (active) {

            interact(ViewVideo.CodeSnippetTimeline).dropzone({
                accept:  '.codeSnippetElement',
                overlap: 'pointer',
                ondropactivate:   function(e) { e.target.classList.add('droppableActive'); },
                ondropdeactivate: function(e) { e.target.classList.remove('droppableActive', 'droppableHover'); var _sh = ViewVideo.PlayerProgress.querySelector('.ui-slider-handle'); if (_sh) _sh.classList.remove('highlight'); },
                ondragenter:      function(e) { e.target.classList.add('droppableHover'); var _sh = ViewVideo.PlayerProgress.querySelector('.ui-slider-handle'); if (_sh) _sh.classList.add('highlight'); },
                ondragleave:      function(e) { e.target.classList.remove('droppableHover'); var _sh = ViewVideo.PlayerProgress.querySelector('.ui-slider-handle'); if (_sh) _sh.classList.remove('highlight'); },
                ondrop: function(e) {
                    var codeSnippetTitle = e.relatedTarget.querySelector('.codeSnippetTitle').textContent,
                        startTime        = FrameTrail.module('HypervideoController').currentTime,
                        newCodeSnippet   = FrameTrail.module('HypervideoModel').newCodeSnippet({
                            "start":   startTime,
                            "name":    codeSnippetTitle,
                            "snippet": 'console.log("Hello, I am a Code Snippet");'
                        });

                    newCodeSnippet.renderTimelineInDOM();
                    rearrangeTilesAndContent();
                    newCodeSnippet.startEditing();
                    updateStatesOfCodeSnippets(FrameTrail.module('HypervideoController').currentTime);
                    setCodeSnippetInFocus(newCodeSnippet);
                    stackTimelineView();
                    FrameTrail.module('TimelineController').refreshMinimap();

                    // Register undo command for adding code snippet
                    (function(codeSnippetData) {
                        var findCodeSnippet = function() {
                            var codeSnippets = FrameTrail.module('HypervideoModel').codeSnippets;
                            for (var i = 0; i < codeSnippets.length; i++) {
                                if (codeSnippets[i].data.created === codeSnippetData.created) { return codeSnippets[i]; }
                            }
                            return null;
                        };
                        FrameTrail.module('UndoManager').register({
                            category: 'codeSnippets',
                            description: labels['SidebarCustomCode'] + ' ' + labels['GenericAdd'],
                            undo: function() {
                                var codeSnippet = findCodeSnippet();
                                if (codeSnippet) { deleteCodeSnippet(codeSnippet, true); }
                            },
                            redo: function() {
                                var restoredCodeSnippet = FrameTrail.module('HypervideoModel').newCodeSnippet(codeSnippetData, true);
                                restoredCodeSnippet.renderTimelineInDOM();
                                restoredCodeSnippet.startEditing();
                                updateStatesOfCodeSnippets(FrameTrail.module('HypervideoController').currentTime);
                                stackTimelineView();
                                FrameTrail.module('TimelineController').refreshMinimap();
                            }
                        });
                    })(JSON.parse(JSON.stringify(newCodeSnippet.data)));

                    var _sh = ViewVideo.PlayerProgress.querySelector('.ui-slider-handle'); if (_sh) _sh.classList.remove('highlight');
                }
            });

        } else {

            interact(ViewVideo.CodeSnippetTimeline).unset();

        }

    }



    /**
     * When a codeSnippet is set into focus, I have to tell
     * the old codeSnippet in the var codeSnippetInFocus, that it
     * is no longer in focus. Then I store the codeSnippet (or null)
     * from my parameter in the var codeSnippetInFocus, and inform it
     * about it.
     * @method setCodeSnippetInFocus
     * @param {CodeSnippet} codeSnippet
     * @private
     */
    function setCodeSnippetInFocus(codeSnippet) {


        if (codeSnippetInFocus) {

            codeSnippetInFocus.permanentFocusState = false;
            codeSnippetInFocus.removedFromFocus();

        }

        codeSnippetInFocus = codeSnippet;

        if (codeSnippetInFocus) {
            codeSnippetInFocus.gotInFocus();
        }

        updateStatesOfCodeSnippets(FrameTrail.module('HypervideoController').currentTime);

        return codeSnippet;


    };




    /**
     * I listens to the global state 'editMode'.
     *
     * If we enter the editMode "codesnippets" I prepare all codeSnippets for editing, prepare the timeline
     * and the "editOptions" interface.
     *
     * When leaving I reset them.
     *
     * @method toggleEditMode
     * @param {String} editMode
     * @param {String} oldEditMode
     */
    function toggleEditMode(editMode, oldEditMode) {

        var codeSnippets = FrameTrail.module('HypervideoModel').codeSnippets;


        if(editMode === 'codesnippets' && oldEditMode !== 'codesnippets') {

            for (var idx in codeSnippets) {

                codeSnippets[idx].startEditing();

            }

            stackTimelineView();
            initEditOptions();
            makeTimelineDroppable(true);



        } else if (oldEditMode === 'codesnippets' && editMode !== 'codesnippets') {

            for (var idx in codeSnippets) {

                codeSnippets[idx].stopEditing();

            }

            setCodeSnippetInFocus(null);
            resetTimelineView();
            rearrangeTilesAndContent();
            makeTimelineDroppable(false);

        }

    }


    /**
     * I react to changes in the global state "viewSize" (which is triggerd by a resize event of the window).
     * @method changeViewSize
     */
    function changeViewSize() {



    }


    /**
     * I react to changes in the global state viewSizeChanged.
     * The state changes after a window resize event
     * and is meant to be used for performance-heavy operations.
     *
     * @method onViewSizeChanged
     * @private
     */
    function onViewSizeChanged() {

        if (codeSnippetInFocus && codeSnippetInFocus.cm6Wrapper) {
            var editorHeight = ViewVideo.EditPropertiesContainer.offsetHeight - 70;
            codeSnippetInFocus.cm6Wrapper.style.height = editorHeight + 'px';
        }

    }


    /**
     * I react to changes in the global state "sidebarOpen".
     * @method toggleSidebarOpen
     */
    function toggleSidebarOpen() {



    }


    /**
     * I open the codeSnippetElement of a codeSnippet in the codeSnippetContainer.
     *
     * If my parameter is null, I close the codeSnippetContainer.
     *
     * @method setOpenedCodeSnippet
     * @param {CodeSnippet} codeSnippet
     */
    function setOpenedCodeSnippet(codeSnippet) {

        openedCodeSnippet = codeSnippet

        for (var idx in codeSnippets) {

            codeSnippets[idx].codeSnippetElement.classList.remove('open');
            codeSnippets[idx].tileElement.classList.remove('open');

            var iframeEl = codeSnippets[idx].codeSnippetElement.querySelector('iframe');
            if (iframeEl) { iframeEl.setAttribute('src', ''); }

        }

        if (codeSnippet) {

            // randomVersion allows to use the same iFrame src several times
            var randomVersion  = Math.round(Math.random() * (100 - 1) + 1),
                fragmentSplit  = codeSnippet.data.href.split('#'),
                randomizedLink = fragmentSplit[0] + '&v=' + randomVersion + '#' + fragmentSplit[1];

            var iframeEl2 = codeSnippet.codeSnippetElement.querySelector('iframe');
            if (iframeEl2) { iframeEl2.setAttribute('src', randomizedLink); }

            codeSnippet.codeSnippetElement.classList.add('open');
            codeSnippet.tileElement.classList.add('open');
            ViewVideo.shownDetails = 'codeSnippets';

        } else {

            ViewVideo.shownDetails = null;

        }

    }


    /**
     * I am the starting point for the process of deleting
     * a codeSnippet. I call other necessary methods for it.
     * @method deleteCodeSnippet
     * @param {CodeSnippet} codeSnippet
     * @param {Boolean} skipUndo - If true, don't register undo command (used during undo/redo)
     */
    function deleteCodeSnippet(codeSnippet, skipUndo) {

        // Capture data before deletion for undo
        var codeSnippetData = JSON.parse(JSON.stringify(codeSnippet.data));

        setCodeSnippetInFocus(null);
        codeSnippet.removeFromDOM();
        FrameTrail.module('HypervideoModel').removeCodeSnippet(codeSnippet);
        stackTimelineView();
        FrameTrail.module('TimelineController').refreshMinimap();

        // Register undo command
        if (!skipUndo) {
            FrameTrail.module('UndoManager').register({
                category: 'codeSnippets',
                description: labels['SidebarCustomCode'] + ' ' + labels['GenericDelete'],
                undo: function() {
                    // Recreate the code snippet
                    var newCodeSnippet = FrameTrail.module('HypervideoModel').newCodeSnippet(codeSnippetData, true);
                    newCodeSnippet.renderTimelineInDOM();
                    newCodeSnippet.startEditing();
                    updateStatesOfCodeSnippets(FrameTrail.module('HypervideoController').currentTime);
                    stackTimelineView();
                    FrameTrail.module('TimelineController').refreshMinimap();
                },
                redo: function() {
                    // Find the code snippet by matching data and delete it again
                    var codeSnippetsArray = FrameTrail.module('HypervideoModel').codeSnippets;
                    for (var i = 0; i < codeSnippetsArray.length; i++) {
                        if (codeSnippetsArray[i].data.created === codeSnippetData.created) {
                            deleteCodeSnippet(codeSnippetsArray[i], true);
                            break;
                        }
                    }
                }
            });
        }

    }


    /**
     * I initialize the custom CSS rules.
     *
     * @method initCustomCSS
     * @param {String} cssString
     */
    function initCustomCSS(cssString) {

        document.head.insertAdjacentHTML('beforeend', '<style class="FrameTrailCustomCSS" type="text/css">'+ cssString +'</style>');

    }


    /**
     * I dynamically update the custom CSS rules.
     *
     * @method updateCustomCSS
     * @param {String} cssString
     */
    function updateCustomCSS(cssString) {
        var _csStyle = document.head.querySelector('style.FrameTrailCustomCSS');
        if (_csStyle) { _csStyle.textContent = cssString; }

    }


    /**
     * I react to changes in the global state "viewMode".
     *
     * @method toggleViewMode
     * @param {String} viewMode
     * @param {String} oldViewMode
     */
    function toggleViewMode(viewMode, oldViewMode){



    }


    return {

        onChange: {
            editMode:        toggleEditMode,
            viewSize:        changeViewSize,
            viewSizeChanged: onViewSizeChanged,
            sidebarOpen:     toggleSidebarOpen,
            viewMode:        toggleViewMode
        },

        initController:             initController,
        updateStatesOfCodeSnippets:   updateStatesOfCodeSnippets,
        stackTimelineView:          stackTimelineView,
        deleteCodeSnippet:            deleteCodeSnippet,
        renderActionPresetPicker:     renderActionPresetPicker,

        /**
         * I hold the currently opened codeSnippet (or null, when there is no opened snippet).
         * I use the {{#crossLink "CodeSnippetsController/setOpenedLink:method"}}CodeSnippetsController/setOpenedLink(){{/crossLink}}.
         * @attribute openedLink
         * @type CodeSnippet
         */
        get openedCodeSnippet()              { return openedCodeSnippet                 },
        set openedCodeSnippet(codeSnippet)   { return setOpenedCodeSnippet(codeSnippet) },

        /**
         * I hold the codeSnippet which is "in focus" (or null, when there is no snippet in focus).
         * I use the {{#crossLink "CodeSnippetsController/setCodeSnippetInFocus:method"}}CodeSnippetsController/setCodeSnippetInFocus(){{/crossLink}}.
         * @attribute codeSnippetInFocus
         * @type CodeSnippet
         */
        set codeSnippetInFocus(codeSnippet) { return setCodeSnippetInFocus(codeSnippet) },
        get codeSnippetInFocus()            { return codeSnippetInFocus               }


    };

});
