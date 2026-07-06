/**
 * @module Player
 */


/**
 * I am the ViewVideo. I am the most important user interface component. I contain
 * all the visual elements of the hypervideo player, like the main &lt;video&gt; element,
 * the containers for overlays and annotations, their respective timelines
 * and the player control elements.
 *
 * When I am initialized, I prepare all DOM elements and set up their event listeners.
 *
 * @class ViewVideo
 * @static
 */



FrameTrail.defineModule('ViewVideo', function(FrameTrail){

    var labels = FrameTrail.module('Localization').labels;

    var _dvv = document.createElement('div');
    _dvv.innerHTML = '<div class="viewVideo">'
                        + '    <div class="slideArea">'
                        + '        <div class="areaTopDetails layoutAreaDetails" data-area="areaTop"></div>'
                        + '        <div class="areaTopContainer layoutArea" data-area="areaTop">'
                        + '            <div class="layoutAreaTabs"></div>'
                        + '            <div class="layoutAreaContent"></div>'
                        + '        </div>'
                        + '        <div class="playerContainer">'
                        + '            <div class="hypervideoContainer">'
                        + '                <div class="areaLeftContainer layoutArea" data-area="areaLeft">'
                        + '                    <div class="layoutAreaTabs"></div>'
                        + '                    <div class="layoutAreaContent"></div>'
                        + '                </div>'
                        + '                <div class="videoContainer">'
                        + '                    <div class="hypervideo">'
                        + '                        <video class="video nocolor" '+ ((!!document.fullscreenEnabled) ? 'playsinline webkit-playsinline' : '') +' disablePictureInPicture></video>'
                        + '                        <div class="overlayContainer"></div>'
                        + '                        <div class="captionContainer"></div>'
                        + '                    </div>'
                        + '                    <div class="videoStartOverlay">'
                        + '                        <div class="playButtonBig"><span class="icon-play-circled"></span></div>'
                        + '                    </div>'
                        + '                    <div class="expandButton">'
                        + '                        <div class="expandLabel"><span class="icon-resize-full-1"></span></div>'
                        + '                    </div>'
                        + '                    <div class="workingIndicator">'
                        + '                        <div class="workingSpinner"></div>'
                        + '                    </div>'
                        + '                </div>'
                        + '                <div class="areaRightContainer layoutArea" data-area="areaRight">'
                        + '                    <div class="layoutAreaTabs"></div>'
                        + '                    <div class="layoutAreaContent"></div>'
                        + '                </div>'
                        + '                <div class="infoAreaRight">'
                        + '                    <div class="infoAreaRightTabBar">'
                        + '                        <div class="infoAreaRightTab active" data-tab="add"><span class="icon-plus"></span> '+ labels['GenericAdd'] +'</div>'
                        + '                        <div class="infoAreaRightTab" data-tab="properties"><span class="icon-list"></span> '+ labels['GenericProperties'] +'</div>'
                        + '                    </div>'
                        + '                    <div class="infoAreaRightTabContent active" data-tab="add">'
                        + '                        <div class="editingOptions"></div>'
                        + '                    </div>'
                        + '                    <div class="infoAreaRightTabContent" data-tab="properties">'
                        + '                        <div class="editPropertiesContainer"></div>'
                        + '                    </div>'
                        + '                </div>'
                        + '            </div>'
                        + '            <div class="codeSnippetTimeline timeline"></div>'
                        + '            <div class="overlayTimeline timeline"></div>'
                        + '            <div class="playerProgress" role="slider" aria-valuemin="0" aria-valuenow="0">'
                        + '                <div class="ui-slider-range"></div>'
                        + '                <div class="ui-slider-handle"><div class="ui-slider-handle-circle"><div class="ui-slider-handle-circle-inner"></div></div></div>'
                        + '            </div>'
                        + '            <div class="controls">'
                        + '                <div class="leftControlPanel">'
                        + '                    <div class="playButton playerControl"><span class="icon-play-1"></span></div>'
                        + '                    <div class="timeDisplay playerControl">'
                        + '                        <div class="currentTime">00:00</div>'
                        + '                        <div class="totalDuration">00:00</div>'
                        + '                    </div>'
                        + '                    <div class="timeDisplayFull playerControl">'
                        + '                        <div class="currentTimeFull">00:00</div>'
                        + '                        <div class="totalDurationFull">00:00</div>'
                        + '                    </div>'
                        + '                </div>'
                        + '                <div class="rightControlPanel">'
                        + '                    <div class="sharingWidget playerControl"><span class="icon-share"></span></div>'
                        + '                    <div class="annotationSearchButton playerControl contextButton">'
                        + '                        <span class="icon-search"></span>'
                        + '                        <div class="annotationSearchContainer contextButtonContainer">'
                        + '                        </div>'
                        + '                    </div>'
                        + '                    <div class="layoutAreasButton playerControl" style="display:none">'
                        + '                        <span class="icon-th-large-1"></span>'
                        + '                        <div class="layoutAreasPanel"></div>'
                        + '                    </div>'
                        + '                    <div class="chapterButton playerControl" style="display:none">'
                        + '                        <span class="icon-list-bullet"></span>'
                        + '                        <div class="chapterSelectContainer">'
                        + '                            <div class="chapterSelectList"></div>'
                        + '                        </div>'
                        + '                    </div>'
                        + '                    <div class="captionsButton playerControl">'
                        + '                        <span class="icon-captions-off"></span>'
                        + '                        <div class="captionSelectContainer">'
                        + '                            <div class="captionSelect none" data-lang="" data-config="hv_config_captionsVisible">'+ labels['GenericNone'] +'</div>'
                        + '                            <div class="captionSelectList"></div>'
                        + '                        </div>'
                        + '                    </div>'
                        + '                    <div class="volumeButton playerControl"><span class="icon-volume-up"></span></div>'
                        + '                    <div class="fullscreenButton playerControl"><span class="icon-resize-full-alt"></span></div>'
                        + '                </div>'
                        + '            </div>'
                        + '            <div class="annotationTimeline timeline"></div>'
                        + '            <div class="otherUsersContainer"></div>'
                        + '        </div>'
                        + '        <div class="areaBottomContainer layoutArea" data-area="areaBottom">'
                        + '            <div class="layoutAreaTabs"></div>'
                        + '            <div class="layoutAreaContent"></div>'
                        + '        </div>'
                        + '        <div class="areaBottomDetails layoutAreaDetails" data-area="areaBottom"></div>'
                        + '    </div>'
                        + '    <div class="hypervideoLayoutContainer"></div>'
                        + '</div>';
    var domElement = _dvv.firstElementChild,


        slideArea                   = domElement.querySelector('.slideArea'),

        PlayerContainer             = domElement.querySelector('.playerContainer'),
        HypervideoContainer         = domElement.querySelector('.hypervideoContainer'),
        VideoContainer              = domElement.querySelector('.videoContainer'),
        Hypervideo                  = domElement.querySelector('.hypervideo'),
        CaptionContainer            = domElement.querySelector('.captionContainer'),

        AreaTopDetails              = domElement.querySelector('.areaTopDetails'),
        AreaTopContainer            = domElement.querySelector('.areaTopContainer'),

        AreaBottomDetails           = domElement.querySelector('.areaBottomDetails'),
        AreaBottomContainer         = domElement.querySelector('.areaBottomContainer'),

        AreaLeftContainer           = domElement.querySelector('.areaLeftContainer'),

        AreaRightContainer          = domElement.querySelector('.areaRightContainer'),

        AnnotationTimeline          = domElement.querySelector('.annotationTimeline'),

        OverlayTimeline             = domElement.querySelector('.overlayTimeline'),
        OverlayContainer            = domElement.querySelector('.overlayContainer'),

        CodeSnippetTimeline         = domElement.querySelector('.codeSnippetTimeline'),

        Controls                    = domElement.querySelector('.controls'),
        SharingWidget               = domElement.querySelector('.sharingWidget'),
        AnnotationSearchButton      = domElement.querySelector('.annotationSearchButton'),
        InfoAreaRight               = domElement.querySelector('.infoAreaRight'),
        EditingOptions              = domElement.querySelector('.editingOptions'),
        OtherUsersContainer         = domElement.querySelector('.otherUsersContainer'),
        HypervideoLayoutContainer   = domElement.querySelector('.hypervideoLayoutContainer'),


        CurrentTime                 = domElement.querySelector('.currentTime'),
        TotalDuration               = domElement.querySelector('.totalDuration'),
        CurrentTimeFull             = domElement.querySelector('.currentTimeFull'),
        TotalDurationFull           = domElement.querySelector('.totalDurationFull'),
        PlayButton                  = domElement.querySelector('.playButton'),
        VideoStartOverlay           = domElement.querySelector('.videoStartOverlay'),
        VolumeButton                = domElement.querySelector('.volumeButton'),
        FullscreenButton            = domElement.querySelector('.fullscreenButton'),

        PlayerProgress              = domElement.querySelector('.playerProgress'),

        Video                       = domElement.querySelector('.video'),

        EditPropertiesContainer     = domElement.querySelector('.editPropertiesContainer'),

        ExpandButton                = domElement.querySelector('.expandButton'),

        WorkingIndicator            = VideoContainer.querySelector('.workingIndicator'),

        shownDetails                = null,
        wasPlaying                  = false;


    // Adopt existing <video> element when videoElement init option is set (Scenario A).
    // The element was created/owned by the page author; we move it into the player
    // structure and strip browser-native controls so FrameTrail controls take over.
    (function () {
        var _videoElOpt = FrameTrail.getState('videoElement');
        if (!_videoElOpt) { return; }

        var _existingEl = (typeof _videoElOpt === 'string')
            ? document.querySelector(_videoElOpt)
            : _videoElOpt;

        if (!_existingEl) { return; }

        _existingEl.removeAttribute('controls');
        _existingEl.setAttribute('playsinline', '');
        _existingEl.setAttribute('disablePictureInPicture', '');
        _existingEl.classList.add('video');

        // Replace the template <video> inside .hypervideo with the existing element.
        // jQuery's replaceWith moves the DOM node, so the element ends up inside
        // the player structure and is removed from its original position.
        Hypervideo.querySelector('video.video').replaceWith(_existingEl);

        // Point the Video reference at the adopted element
        Video = _existingEl;
    })();


    // Timer reference for the deferred layout correction in changeSlidePosition.
    // Kept here so resize handlers can cancel it before it fires with transitions on.
    var _pendingAdjust = null;

    // Retry handle for adjustHypervideo when VideoContainer has no height yet
    // (e.g. during edit-mode transition layout flux).
    var _pendingHypervideo = null;

    // When true, changeSlidePosition will NOT add the is-sliding class.
    // Used by leaveEditMode to prevent slide animations during the restore sequence,
    // which internally triggers FrameTrail.changeState('slidePosition', 'middle')
    // via toggleConfig_areaTopVisible / toggleConfig_slidingMode — those calls arrive
    // with a real oldState and would otherwise trigger a CSS transition.
    var _suppressSlideAnimation = false;

    /**
     * Instantly freeze CSS transitions on the given elements by pinning transitionDuration to 0ms.
     * @method disableTransitions
     * @param {Array} elements
     */
    function disableTransitions(elements) {
        elements.forEach(function(el) {
            el.style.transitionDuration = '0ms';
            el.style.MozTransitionDuration = '0ms';
            el.style.webkitTransitionDuration = '0ms';
            el.style.OTransitionDuration = '0ms';
        });
    }

    /**
     * Restore transitions to whatever CSS specifies by clearing the inline override.
     * @method restoreTransitions
     * @param {Array} elements
     */
    function restoreTransitions(elements) {
        elements.forEach(function(el) {
            el.style.transitionDuration = '';
            el.style.MozTransitionDuration = '';
            el.style.webkitTransitionDuration = '';
            el.style.OTransitionDuration = '';
        });
    }

    // Sharing Widget: hide when running from file:// or with multiple instances
    if (window.location.protocol === 'file:' || window.FrameTrail.instances.length > 1) {
        SharingWidget.style.display = 'none';
    }

    SharingWidget.addEventListener('click', function() {
        if (window.FrameTrail.instances.length > 1) { return; }

        var RouteNavigation = FrameTrail.module('RouteNavigation'),
            baseUrl = window.location.href.split('?')[0].split('#'),
            url = baseUrl[0] + '#',
            secUrl = window.location.protocol + '//' + window.location.host + window.location.pathname,
            iframeUrl = secUrl + '#';

        if ( FrameTrail.getState('viewMode') == 'video' && RouteNavigation.hypervideoID ) {
            url += 'hypervideo='+ RouteNavigation.hypervideoID;
            iframeUrl += 'hypervideo='+ RouteNavigation.hypervideoID;
        }

        var hypervideoTitle = (FrameTrail.getState('viewMode') == 'video' && RouteNavigation.hypervideoID)
            ? FrameTrail.module('HypervideoModel').hypervideoName.replace(/"/g, '&quot;')
            : '';

        var _sdWrapper = document.createElement('div');
        _sdWrapper.innerHTML = '<div class="shareDialog">'
                        + '    <div>Link</div>'
                        + '    <input type="text" value="'+ url +'"/>'
                        + '    <div>Embed Code</div>'
                        + '    <textarea class="m-0" style="height: 100px;" readonly><iframe width="800" height="600" src="'+ iframeUrl +'" title="'+ hypervideoTitle +'" frameborder="0" allow="fullscreen" allowfullscreen></iframe></textarea>'
                        + '</div>';
        var shareDialog = _sdWrapper.firstElementChild;

        shareDialog.querySelectorAll('input[type="text"], textarea').forEach(function(el) {
            el.addEventListener('click', function() {
                this.focus();
                this.select();
            });
        });

        var shareDialogCtrl = Dialog({
            title:     labels['GenericShareEmbed'],
            content:   shareDialog,
            inheritTheme: SharingWidget,
            modal:     true,
            resizable: false,
            width:     500,
            height:    "auto",
            close: function() {
                shareDialogCtrl.destroy();
            }
        });
    });

    ExpandButton.addEventListener('click', function() {
        showDetails(false);
    });

    InfoAreaRight.addEventListener('click', function(e) {
        var tab = e.target.closest('.infoAreaRightTab');
        if (!tab) return;
        var tabName = tab.dataset.tab;
        switchInfoTab(tabName);
    });

    /**
     * I switch the active tab in the infoAreaRight panel.
     * @method switchInfoTab
     * @param {String} tabName - Either 'properties' or 'add'
     */
    function switchInfoTab(tabName) {
        InfoAreaRight.querySelectorAll('.infoAreaRightTab').forEach(function(el) { el.classList.remove('active'); });
        InfoAreaRight.querySelector('.infoAreaRightTab[data-tab="'+ tabName +'"]').classList.add('active');
        InfoAreaRight.querySelectorAll('.infoAreaRightTabContent').forEach(function(el) { el.classList.remove('active'); });
        InfoAreaRight.querySelector('.infoAreaRightTabContent[data-tab="'+ tabName +'"]').classList.add('active');
        var _tabs = EditingOptions.querySelector('.ui-tabs');
        if (_tabs) { FTTabs(_tabs, 'refresh'); } // Phase 2 bridge

        // Show/hide properties tab button based on whether properties content is active
        var propertiesTab = InfoAreaRight.querySelector('.infoAreaRightTab[data-tab="properties"]');
        if (tabName === 'properties') {
            propertiesTab.style.visibility = '';
        } else if (!EditPropertiesContainer.classList.contains('active')) {
            propertiesTab.style.visibility = 'hidden';
        }
    }

    var layoutAreasButton = Controls.querySelector('.layoutAreasButton');
    var layoutAreasPanel = layoutAreasButton.querySelector('.layoutAreasPanel');
    layoutAreasButton.style.display = 'none';

    layoutAreasButton.addEventListener('click', function(evt) {
        evt.stopPropagation();

        Controls.querySelectorAll('.rightControlPanel .active:not([data-config]):not(.layoutAreasButton):not(.layoutAreasPanel)').forEach(function(el) { el.classList.remove('active'); });
        closeCaptionPanel();

        if (!layoutAreasPanel.classList.contains('active')) {
            updateLayoutAreasPanel();
            layoutAreasPanel.classList.add('active');
            addOutsideClickHandler();
        } else {
            layoutAreasPanel.classList.remove('active');
        }

    });

    layoutAreasPanel.addEventListener('click', function(evt) {
        evt.stopPropagation();
    });

    function updateLayoutAreasPanel() {
        layoutAreasPanel.innerHTML = '';

        var schematic = document.createElement('div');
        schematic.className = 'layoutAreasSchematic';

        var hasTop = FrameTrail.getState('hv_config_areaTopVisible');
        var hasBottom = FrameTrail.getState('hv_config_areaBottomVisible');
        var hasLeft = FrameTrail.getState('hv_config_areaLeftVisible');
        var hasRight = FrameTrail.getState('hv_config_areaRightVisible');

        if (hasTop) {
            var topEl = document.createElement('div');
            topEl.className = 'schematicArea schematicAreaTop';
            topEl.setAttribute('data-size', AreaTopContainer.getAttribute('data-size') || 'small');
            if (!AreaTopContainer.classList.contains('closed')) topEl.classList.add('active');
            topEl.addEventListener('click', function() {
                AreaTopContainer.classList.toggle('closed');
                this.classList.toggle('active');
                FrameTrail.changeState('slidePosition', 'middle');
                window.setTimeout(function() { adjustHypervideo(); }, 250);
            });
            schematic.appendChild(topEl);
        }

        var middleRow = document.createElement('div');
        middleRow.className = 'schematicMiddleRow';

        if (hasLeft) {
            var leftEl = document.createElement('div');
            leftEl.className = 'schematicArea schematicAreaLeft';
            leftEl.setAttribute('data-size', AreaLeftContainer.getAttribute('data-size') || 'small');
            if (!AreaLeftContainer.classList.contains('closed')) leftEl.classList.add('active');
            leftEl.addEventListener('click', function() {
                AreaLeftContainer.classList.toggle('closed');
                this.classList.toggle('active');
                FrameTrail.changeState('slidePosition', 'middle');
                window.setTimeout(function() { adjustHypervideo(); }, 250);
            });
            middleRow.appendChild(leftEl);
        }

        var centerEl = document.createElement('div');
        centerEl.className = 'schematicCenter';
        centerEl.innerHTML = '<span class="icon-play-1"></span>';
        middleRow.appendChild(centerEl);

        if (hasRight) {
            var rightEl = document.createElement('div');
            rightEl.className = 'schematicArea schematicAreaRight';
            rightEl.setAttribute('data-size', AreaRightContainer.getAttribute('data-size') || 'small');
            if (!AreaRightContainer.classList.contains('closed')) rightEl.classList.add('active');
            rightEl.addEventListener('click', function() {
                AreaRightContainer.classList.toggle('closed');
                this.classList.toggle('active');
                FrameTrail.changeState('slidePosition', 'middle');
                window.setTimeout(function() { adjustHypervideo(); }, 250);
            });
            middleRow.appendChild(rightEl);
        }

        schematic.appendChild(middleRow);

        if (hasBottom) {
            var bottomEl = document.createElement('div');
            bottomEl.className = 'schematicArea schematicAreaBottom';
            bottomEl.setAttribute('data-size', AreaBottomContainer.getAttribute('data-size') || 'small');
            if (!AreaBottomContainer.classList.contains('closed')) bottomEl.classList.add('active');
            bottomEl.addEventListener('click', function() {
                AreaBottomContainer.classList.toggle('closed');
                this.classList.toggle('active');
                FrameTrail.changeState('slidePosition', 'middle');
                window.setTimeout(function() { adjustHypervideo(); }, 250);
            });
            schematic.appendChild(bottomEl);
        }

        layoutAreasPanel.appendChild(schematic);
    }

    function updateLayoutAreasButtonVisibility() {
        var hasAny = FrameTrail.getState('hv_config_areaTopVisible')
                  || FrameTrail.getState('hv_config_areaBottomVisible')
                  || FrameTrail.getState('hv_config_areaLeftVisible')
                  || FrameTrail.getState('hv_config_areaRightVisible');
        layoutAreasButton.style.display = hasAny ? '' : 'none';
    }

    var captionsButton = Controls.querySelector('.captionsButton');
    var captionContainer = captionsButton.querySelector('.captionSelectContainer');

    captionsButton.addEventListener('click', function(evt) {
        evt.stopPropagation();

        Controls.querySelectorAll('.rightControlPanel .active:not([data-config]):not(.captionsButton):not(.captionSelectContainer):not(.annotationSetButton)').forEach(function(el) { el.classList.remove('active'); });
        layoutAreasPanel.classList.remove('active');

        if ( !captionContainer.classList.contains('active') ) {
            captionContainer.classList.add('active');
            VideoContainer.style.opacity = '0.3';
            domElement.querySelectorAll('.areaLeftContainer, .areaRightContainer').forEach(function(el) { el.style.opacity = '0.3'; });
            addOutsideClickHandler();
        } else {
            closeCaptionPanel();
        }

    });

    captionContainer.addEventListener('click', function(evt) {
        evt.stopPropagation();
    });

    function closeCaptionPanel() {
        captionContainer.classList.remove('active');
        VideoContainer.style.opacity = '1';
        domElement.querySelectorAll('.areaLeftContainer, .areaRightContainer').forEach(function(el) { el.style.opacity = '1'; });
    }

    var chapterButton = Controls.querySelector('.chapterButton');
    var chapterContainer = chapterButton.querySelector('.chapterSelectContainer');

    chapterButton.addEventListener('click', function(evt) {
        if (evt.target.closest('.chapterSelectContainer')) { return; }
        evt.stopPropagation();

        Controls.querySelectorAll('.rightControlPanel .active:not([data-config]):not(.chapterButton):not(.chapterSelectContainer):not(.annotationSetButton)').forEach(function(el) { el.classList.remove('active'); });
        layoutAreasPanel.classList.remove('active');

        if ( !chapterContainer.classList.contains('active') ) {
            closeCaptionPanel();
            chapterContainer.classList.add('active');
            VideoContainer.style.opacity = '0.3';
            domElement.querySelectorAll('.areaLeftContainer, .areaRightContainer').forEach(function(el) { el.style.opacity = '0.3'; });
            addOutsideClickHandler();
        } else {
            closeChapterPanel();
        }

    });

    function closeChapterPanel() {
        chapterContainer.classList.remove('active');
        VideoContainer.style.opacity = '1';
        domElement.querySelectorAll('.areaLeftContainer, .areaRightContainer').forEach(function(el) { el.style.opacity = '1'; });
    }

    function closeAllPanels() {
        layoutAreasPanel.classList.remove('active');
        closeCaptionPanel();
        closeChapterPanel();
    }

    function addOutsideClickHandler() {
        var handler = function() {
            closeAllPanels();
            document.removeEventListener('click', handler);
        };
        document.addEventListener('click', handler);
    }

    Controls.querySelector('.captionSelect.none').addEventListener('click', function() {
        FrameTrail.changeState('hv_config_captionsVisible', false);
    });

    Controls.querySelector('.contextButton').addEventListener('click', function(evt) {

        var contextButton = this;

        if ( !contextButton.classList.contains('active') ) {

            var _bodyMouseup = function(evt) {

                if ( !evt.target.getAttribute('data-config') && !evt.target.classList.contains('contextButton') ) {
                    contextButton.classList.remove('active');
                    VideoContainer.style.opacity = '1';
                    domElement.querySelectorAll('.areaLeftContainer, .areaRightContainer').forEach(function(el) { el.style.opacity = '1'; });
                    document.body.removeEventListener('mouseup', _bodyMouseup);
                    evt.preventDefault();
                    evt.stopPropagation();
                }

            };
            document.body.addEventListener('mouseup', _bodyMouseup);

            Controls.querySelectorAll('.rightControlPanel .active:not([data-config]):not(.captionsButton)').forEach(function(el) { el.classList.remove('active'); });

            contextButton.classList.add('active');
            VideoContainer.style.opacity = '0.3';
            domElement.querySelectorAll('.areaLeftContainer, .areaRightContainer').forEach(function(el) { el.style.opacity = '0.3'; });

        } else {

            contextButton.classList.remove('active');
            VideoContainer.style.opacity = '1';
            domElement.querySelectorAll('.areaLeftContainer, .areaRightContainer').forEach(function(el) { el.style.opacity = '1'; });

        }

    });

    VolumeButton.addEventListener('click', function() {

        if ( this.classList.contains('active') ) {
            FrameTrail.module('HypervideoController').muted = false;
            this.classList.remove('active');
        } else {
            FrameTrail.module('HypervideoController').muted = true;
            this.classList.add('active');
        }


    });

    AreaTopContainer.addEventListener('click', function(evt) {

        //

    });

    AreaBottomContainer.addEventListener('click', function(evt) {

        if ( FrameTrail.module('AnnotationsController').openedAnnotation && evt.target.classList.contains('areaBottomContainer') ) {
            FrameTrail.module('AnnotationsController').openedAnnotation = null;
        }

    });

    document.addEventListener("fullscreenchange", toggleFullscreenState, false);
    document.addEventListener("webkitfullscreenchange", toggleFullscreenState, false);
    document.addEventListener("mozfullscreenchange", toggleFullscreenState, false);
    Controls.querySelector('.fullscreenButton').addEventListener('click', toggleNativeFullscreenState);


    /**
     * I am called from {{#crossLink "Interface/create:method"}}Interface/create(){{/crossLink}}.
     * I update my local state from the global state variables and append my elements in the DOM tree.
     * @method create
     */
    function create() {
        
        document.querySelector(FrameTrail.getState('target')).querySelector('.mainContainer').appendChild(domElement);

        if (/^((?!chrome|android).)*safari/i.test(navigator.userAgent)) {
            fixGoddamnSafariBug();
        };

        if (FrameTrail.getState('hv_config_clipTimeVisible')) {
            Controls.querySelector('.timeDisplayFull').style.display = 'block';
        }

        toggleViewMode(FrameTrail.getState('viewMode'));

        attachSnapSuppressionListeners();

        toggleConfig_captionsVisible(FrameTrail.getState('hv_config_captionsVisible'));

        FrameTrail.changeState('hv_config_overlaysVisible', true);

        changeSlidePosition('middle');

    }

    function fixGoddamnSafariBug() {

        var _t = document.querySelector(FrameTrail.getState('target'));
        ['.sidebar', '.mainContainer', '.viewVideo', '.slideArea'].forEach(function(sel) {
            var el = _t.querySelector(sel);
            if (!el) return;
            el.style.transitionDuration = '0ms';
            el.style.MozTransitionDuration = '0ms';
            el.style.webkitTransitionDuration = '0ms';
            el.style.OTransitionDuration = '0ms';
        });

        window.setTimeout(function() {

            slidePositionDown();
            showDetails(false);

            //alert('Safari tests are still ongoing. To avoid problems, please switch to any other browser for now.');

            /*
            window.setTimeout(function() {
                slideArea.css({
                    'transition-duration': '',
                    '-moz-transition-duration': '',
                    '-webkit-transition-duration': '',
                    '-o-transition-duration': ''
                });
            }, 300);
            */

        }, 6000);
    }

    /**
     * I am called when the global state "sidebarOpen" changes.
     * @method toggleSidebarOpen
     * @param {Boolean} opened
     */
    function toggleSidebarOpen(opened) {

        adjustHypervideo(true);

    };


    /**
     * I am called when the global state "viewSize" changes (which it does after a window resize,
     * and one time during app start, after all create methods of interface modules have been called).
     * @method changeViewSize
     * @param {Array} arrayWidthAndHeight
     */
    function changeViewSize(arrayWidthAndHeight) {

        // Cancel any pending deferred layout correction from changeSlidePosition —
        // it would fire with transitions active and cause a wobble mid-resize.
        clearTimeout(_pendingAdjust);
        _pendingAdjust = null;

        // Disable the slideArea margin-top transition for the duration of this resize
        // by ensuring the is-sliding class is absent (CSS drives the transition).
        slideArea.classList.remove('is-sliding');

        adjustLayout();
        adjustHypervideo();

    };


    /**
     * I react to changes in the global state viewSizeChanged.
     * The state changes after a window resize event
     * and is meant to be used for performance-heavy operations.
     *
     * @method onViewSizeChanged
     * @private
     */
    function onViewSizeChanged() {

        // Same as changeViewSize: cancel deferred slide adjustments and ensure
        // no margin-top transition fires during the post-resize recalculation.
        clearTimeout(_pendingAdjust);
        _pendingAdjust = null;
        slideArea.classList.remove('is-sliding');

        adjustLayout();
        adjustHypervideo();
        FrameTrail.module('ViewLayout').adjustContentViewLayout();

        domElement.querySelectorAll('.resourceDetail[data-type="location"]').forEach(function(el) {
            if (el._leafletMap) {
                el._leafletMap.invalidateSize();
            }
        });

        var editMode = FrameTrail.getState('editMode');
        if ((editMode == 'overlays' || editMode == 'annotations' || editMode == 'codesnippets')) {
            var _tabs = EditPropertiesContainer.querySelector('.ui-tabs');
            if (_tabs) { FTTabs(_tabs, 'refresh'); } // Phase 2 bridge
        }

    };



    /**
     * I am a central method of the ViewVideo. I rearrange all my child elements.
     * Their position is defined by the global state "editMode" and by the various
     * "hv_config_[...]" states, as well as the current width and height of the display area.
     *
     * I am called from many places, whenever one of the defining variables (see above) changes.
     *
     * @method adjustLayout
     */
    function adjustLayout() {

        var mainContainer = document.querySelector(FrameTrail.getState('target') + ' .mainContainer');
        if (!mainContainer) { return; }

        var editMode            = FrameTrail.getState('editMode'),
            inEditMode          = (editMode != false && editMode != 'preview' && editMode != 'layout'),
            playerMargin        = parseInt(getComputedStyle(PlayerContainer).marginTop),
            editBorder          = (editMode != false) ? 20 : 0,
            slidePosition       = (editMode == 'layout') ? 'middle' : FrameTrail.getState('slidePosition'),
            slidingMode         = FrameTrail.getState('hv_config_slidingMode'),

            areaTopVisible      = ( inEditMode ? false : FrameTrail.getState('hv_config_areaTopVisible') ),
            areaBottomVisible   = ( inEditMode ? false : FrameTrail.getState('hv_config_areaBottomVisible') ),
            areaLeftVisible     = ( inEditMode ? false : FrameTrail.getState('hv_config_areaLeftVisible') ),
            areaRightVisible    = ( inEditMode ? false : FrameTrail.getState('hv_config_areaRightVisible') );

        if (slidingMode == 'overlay') {
            var _abcH = areaBottomVisible ? AreaBottomContainer.offsetHeight : 0;
            var _atcH = areaTopVisible ? AreaTopContainer.offsetHeight : 0;
            var _mcH = mainContainer.offsetHeight;
            var _fb = _mcH - (areaTopVisible ? (_atcH + playerMargin) : 0) - (areaBottomVisible ? (_abcH + playerMargin) : 0) - editBorder;
            PlayerContainer.style.flexGrow = '0';
            PlayerContainer.style.flexShrink = '0';
            PlayerContainer.style.flexBasis = _fb + 'px';
        } else {
            PlayerContainer.style.flex = '';
        }

        if ( slidePosition == 'top' ) {

            if ( slidingMode == 'adjust' ) {

                slideArea.style.marginTop = (
                    - (inEditMode ? playerMargin : 0)
                ) + 'px';
                slideArea.style.minHeight = (
                    mainContainer.offsetHeight
                    + (areaBottomVisible ? AreaBottomDetails.offsetHeight + AreaBottomContainer.offsetHeight : 0)
                    + playerMargin
                    - editBorder
                ) + 'px';

            } else if ( slidingMode == 'overlay' ) {

                slideArea.style.marginTop = (
                    - (areaTopVisible ? AreaTopDetails.offsetHeight : 0)
                    - (areaBottomVisible ? AreaBottomDetails.offsetHeight : 0)
                    - playerMargin
                ) + 'px';

                // slidingMode overlay top behaviour
                var targetOffset = playerMargin + ( (PlayerContainer.offsetHeight - Controls.offsetHeight)/2 ),
                    thisOffset;

                thisOffset = AreaBottomDetails.offsetHeight + AreaBottomContainer.offsetHeight + targetOffset - (AreaBottomDetails.offsetHeight / 2);

                AreaBottomDetails.style.marginTop = thisOffset + 'px';

                AreaBottomContainer.style.marginTop = - thisOffset + 'px';

                AreaTopDetails.style.marginTop = '';

                AreaTopContainer.style.marginTop = '';

            }

        } else if ( slidePosition == 'bottom' ) {

            if ( slidingMode == 'adjust' ) {

                slideArea.style.marginTop = (
                    - (areaTopVisible ? AreaTopDetails.offsetHeight + AreaTopContainer.offsetHeight : 0)
                    - playerMargin
                ) + 'px';
                slideArea.style.minHeight = (
                    mainContainer.offsetHeight
                    + (areaTopVisible ? AreaTopDetails.offsetHeight + AreaTopContainer.offsetHeight : 0)
                    - editBorder
                ) + 'px';

            } else if ( slidingMode == 'overlay' ) {

                slideArea.style.marginTop = (
                    - (areaTopVisible ? AreaTopDetails.offsetHeight : 0)
                    - playerMargin
                ) + 'px';

                var targetOffset = playerMargin + (PlayerContainer.offsetHeight/2) + (OverlayTimeline.offsetHeight*2) + (Controls.offsetHeight/2);

                // slidingMode overlay bottom behaviour
                AreaBottomDetails.style.marginTop = - (targetOffset + AreaBottomContainer.offsetHeight + (AreaBottomDetails.offsetHeight / 2)) + 'px';

                AreaTopDetails.style.marginTop = '';

                AreaTopContainer.style.marginTop = '';

            }

        } else {

            var topMargin = areaTopVisible ? AreaTopDetails.offsetHeight : playerMargin;


            slideArea.style.marginTop = - topMargin + 'px';
            slideArea.style.minHeight = (
                mainContainer.offsetHeight
                + (areaTopVisible ? AreaTopDetails.offsetHeight : playerMargin)
                + (areaBottomVisible ? AreaBottomDetails.offsetHeight : playerMargin)
                - editBorder
            ) + 'px';

            AreaBottomDetails.style.marginTop = '';

            AreaBottomContainer.style.marginTop = '';

            AreaTopDetails.style.marginTop = '';

            AreaTopContainer.style.marginTop = '';

        }

        if ( editMode != false && editMode != 'preview' ) {
            slideArea.style.minHeight = '';
            PlayerContainer.style.marginBottom = '0';
            var _tabs2 = EditingOptions.querySelector('.ui-tabs');
            if (_tabs2) { FTTabs(_tabs2, 'refresh'); } // Phase 2 bridge
        } else {
            PlayerContainer.style.marginBottom = '';
        }


    };



    /**
     * I re-adjust the CSS of the main video and its container (without surrounding elements).
     * I try to fill the available space to fit the video elements.
     *
     * Also I try to animate the transition of the dimensions smoothly, when my single parameter is true.
     *
     * @method adjustHypervideo
     * @param {Boolean} animate
     */
    function adjustHypervideo(animate) {

        var _target = document.querySelector(FrameTrail.getState('target'));
        var _titlebar = _target && _target.querySelector('.titlebar');
        if (!_titlebar) { return; }

        var isMobileWidth = (_target.offsetWidth <= 768),
            inEditMode = (FrameTrail.getState('editMode') != false && FrameTrail.getState('editMode') != 'preview' && FrameTrail.getState('editMode') != 'layout'),
            autohideTitlebar = (FrameTrail.getState('hv_config_autohideControls') && FrameTrail.getState('editMode') == false),
            editBorder = (FrameTrail.getState('editMode') != false) ? (parseInt(getComputedStyle(domElement).borderTopWidth)*2) : 0,
            mainContainerWidth  = _target.offsetWidth
                                    - ((FrameTrail.getState('sidebarOpen') && !FrameTrail.getState('fullscreen')) ? FrameTrail.module('Sidebar').width : 0)
                                    - editBorder,
            mainContainerHeight = _target.offsetHeight
                                    - (autohideTitlebar ? 0 : _titlebar.offsetHeight)
                                    - editBorder,
            _video              = Video,
            videoFit            = (FrameTrail.module('Database').config.videoFit) ? FrameTrail.module('Database').config.videoFit : 'contain';

        if (animate) {
            restoreTransitions([VideoContainer, Hypervideo]);
        } else {
            disableTransitions([VideoContainer, Hypervideo]);
        }

        var widthAuto = (_video.style.width == 'auto');
        var heightAuto = (_video.style.height == 'auto');

        var videoContainerWidth;

        if ( inEditMode ) {
            videoContainerWidth = mainContainerWidth - InfoAreaRight.offsetWidth;
        } else {
            videoContainerWidth = mainContainerWidth
            - ((FrameTrail.getState('hv_config_areaLeftVisible') && !isMobileWidth) ? AreaLeftContainer.offsetWidth : 0)
            - ((FrameTrail.getState('hv_config_areaRightVisible') && !isMobileWidth) ? AreaRightContainer.offsetWidth : 0);
        }

        VideoContainer.style.width = videoContainerWidth + 'px';

        var _vcH = VideoContainer.offsetHeight;

        if (_vcH < 10) {
            // VideoContainer has no height — layout is in a transient state.
            // Bail out and retry to pick up the correct height once layout settles.
            clearTimeout(_pendingHypervideo);
            _pendingHypervideo = window.setTimeout(function() {
                _pendingHypervideo = null;
                adjustHypervideo();
            }, 50);
            return;
        }

        //if ( (_video.height() < VideoContainer.height() && widthAuto) || (_video.width() < videoContainerWidth && heightAuto) ) {
        if ( (_video.offsetHeight < _vcH) || (_video.offsetWidth < videoContainerWidth) ) {
            _video.style.height = FrameTrail.getState('viewSize')[1] + 'px';
            _video.style.width = FrameTrail.getState('viewSize')[0] + 'px';
        }

        var videoWidth = (_video.videoWidth) ? _video.videoWidth : 1920;
        var videoHeight = (_video.videoHeight) ? _video.videoHeight : 1080;

        var scaledWidth, scaledHeight, ratio;

        if (videoFit == 'cover') {

            ratio = Math.max(VideoContainer.offsetWidth / videoWidth, _vcH / videoHeight);
            scaledWidth = videoWidth * ratio;
            scaledHeight = videoHeight * ratio;

        } else {

            // Use the actual rendered width (after flexbox constraints) so the
            // video never overflows VideoContainer at narrow viewports where
            // isMobileWidth skips subtracting the side-area widths from
            // videoContainerWidth but those areas still occupy flex space.
            ratio = Math.min(VideoContainer.offsetWidth / videoWidth, _vcH / videoHeight);
            scaledWidth = videoWidth * ratio;
            scaledHeight = videoHeight * ratio;

        }

        _video.style.height = scaledHeight + 'px';
        _video.style.width = scaledWidth + 'px';

        if (animate) {
            window.setTimeout(function() {
                FrameTrail.module('OverlaysController').rescaleOverlays();
                FrameTrail.module('ViewLayout').adjustContentViewLayout();
            }, 220);
        } else {
            FrameTrail.module('OverlaysController').rescaleOverlays();
            FrameTrail.module('ViewLayout').adjustContentViewLayout();
        }

    };


    /**
     * I react to a change of the global state "fullscreen".
     * @method toggleFullscreen
     * @param {Boolean} aBoolean
     */
    function toggleFullscreen(aBoolean) {

        if (aBoolean) {
            document.querySelector(FrameTrail.getState('target') + ' .fullscreenButton').classList.add('active');
            document.querySelector(FrameTrail.getState('target')).classList.add('inFullscreen');
        } else {
            document.querySelector(FrameTrail.getState('target') + ' .fullscreenButton').classList.remove('active');
            document.querySelector(FrameTrail.getState('target')).classList.remove('inFullscreen');
        }

    };


    /**
     * I react to a change of the global state "unsavedChanges".
     * @method toogleUnsavedChanges
     * @param {Boolean} aBoolean
     */
    function toogleUnsavedChanges(aBoolean) {


    };


    /**
     * I react to a change in the global state "viewMode".
     * @method toggleViewMode
     * @param {String} viewMode
     */
    function toggleViewMode(viewMode) {

        if (viewMode === 'video') {
            domElement.classList.add('active');
            FrameTrail.module('Titlebar').title = FrameTrail.module('HypervideoModel').hypervideoName;
            adjustLayout();
            adjustHypervideo();
        } else if (viewMode != 'resources') {
            domElement.classList.remove('active');
        }

    };


    /**
     * I react to a change in the global state "editMode".
     * @method toggleEditMode
     * @param {} editMode
     * @return
     */
    function toggleEditMode(editMode) {

        resetEditMode();

        switch (editMode) {
            case false:
                leaveEditMode();
                break;
            case 'preview':
                leaveEditMode();
                enterPreviewMode();
                break;
            case 'layout':
                enterLayoutMode();
                break;
            case 'overlays':
                enterOverlayMode();
                break;
            case 'audio':
                enterAudioMode();
                break;
            case 'codesnippets':
                enterCodeSnippetMode();
                break;
            case 'annotations':
                enterAnnotationMode();
                break;
        }

        // Hide sharing widget during editing, show when leaving
        if (editMode) {
            SharingWidget.style.display = 'none';
        } else {
            SharingWidget.style.display = (window.FrameTrail.instances.length > 1) ? 'none' : '';
        }

        if ( editMode && !VideoStartOverlay.classList.contains('inactive') ) {
            VideoStartOverlay.classList.add('inactive');
            VideoStartOverlay.style.display = 'none';
        }


        window.setTimeout(function() {
            FrameTrail.changeState('viewSizeChanged');
        }, 300);

    };

    /**
     * I am called, whenever the editMode changes, to restore the default timeline.
     * @method resetEditMode
     */
    function resetEditMode() {
        domElement.querySelectorAll('.timeline').forEach(function(el) { el.classList.remove('editable'); el.style.flexBasis = ''; el.style.display = ''; });
        InfoAreaRight.classList.remove('active');
        OtherUsersContainer.innerHTML = ''; OtherUsersContainer.classList.remove('active');
        HypervideoLayoutContainer.innerHTML = ''; HypervideoLayoutContainer.classList.remove('active');
    }

    /**
     * I prepare the several UI elements, when one of the editMode is started.
     * @method initEditMode
     */
    function initEditMode() {

        ExpandButton.style.display = 'none';

        VideoContainer.style.opacity = '1';

        InfoAreaRight.style.opacity = '1';

        AreaTopContainer.style.display = 'none';
        AreaTopDetails.style.display = 'none';
        AreaBottomContainer.style.display = 'none';
        AreaBottomDetails.style.display = 'none';
        AreaLeftContainer.style.display = 'none';
        AreaRightContainer.style.display = 'none';

        layoutAreasButton.style.display = 'none';
        layoutAreasPanel.classList.remove('active');

        // Timeline visibility is handled by CSS rules based on .editActive[data-edit-mode]
        // Don't use .show() here as it sets inline display:block that persists after leaving edit mode

        InfoAreaRight.classList.add('active');
        EditPropertiesContainer.style.display = 'flex';
        InfoAreaRight.querySelector('.infoAreaRightTab[data-tab="properties"]').style.visibility = 'hidden';
        switchInfoTab('add');

        // Initialize timeline controls (shared across all edit modes)
        FrameTrail.module('TimelineController').initEditTimelines();

    }

    /**
     * I restore the UI elements to the view mode with no editing features activated.
     * @method leaveEditMode
     */
    function leaveEditMode() {

        // Clean up timeline controls
        FrameTrail.module('TimelineController').destroyEditTimelines();

        // Remove editable class and clear inline display from all timelines
        domElement.querySelectorAll('.timeline').forEach(function(el) { el.classList.remove('editable'); el.style.display = ''; });

        HypervideoLayoutContainer.innerHTML = ''; HypervideoLayoutContainer.classList.remove('active');
        EditPropertiesContainer.removeAttribute('data-editmode'); EditPropertiesContainer.style.display = 'none';

        // Suppress slide animations for the entire restore sequence.
        // toggleConfig_areaTopVisible / toggleConfig_areaBottomVisible /
        // toggleConfig_slidingMode may call FrameTrail.changeState('slidePosition', 'middle')
        // which would otherwise fire onChange with a real oldState, causing is-sliding
        // to be added and producing an unwanted CSS transition during exit.
        _suppressSlideAnimation = true;

        toggleConfig_areaTopVisible(FrameTrail.getState('hv_config_areaTopVisible'));
        toggleConfig_areaBottomVisible(FrameTrail.getState('hv_config_areaBottomVisible'));
        toggleConfig_areaLeftVisible(FrameTrail.getState('hv_config_areaLeftVisible'));
        toggleConfig_areaRightVisible(FrameTrail.getState('hv_config_areaRightVisible'));

        toggleConfig_overlaysVisible(FrameTrail.getState('hv_config_overlaysVisible'));

        toggleConfig_slidingMode(FrameTrail.getState('hv_config_slidingMode'));

        changeSlidePosition(FrameTrail.getState('slidePosition'));

        _suppressSlideAnimation = false;

        Controls.querySelector('.rightControlPanel').style.display = '';

        FrameTrail.module('ViewLayout').updateContentInContentViews();
    }

    /**
     * I am called when the app enters the editMode "preview"
     * @method enterPreviewMode
     */
    function enterPreviewMode() {
        FrameTrail.module('ViewLayout').updateContentInContentViews();
    }


    /**
     * I am called when the app enters the editMode "layout"
     * @method enterLayoutMode
     */
    function enterLayoutMode() {

        AreaTopDetails.style.display = 'none';
        AreaBottomDetails.style.display = 'none';
        
        FrameTrail.module('ViewLayout').initLayoutManager();
        HypervideoLayoutContainer.classList.add('active');

    }

    /**
     * I am called when the app enters the editMode "overlays"
     * @method enterOverlayMode
     */
    function enterOverlayMode() {
        initEditMode();
        OverlayTimeline.classList.add('editable');
        toggleConfig_overlaysVisible(true);

        EditPropertiesContainer.setAttribute('data-editmode', 'overlays');
    }

    /**
     * I am called when the app enters the editMode "audio"
     * @method enterAudioMode
     */
    function enterAudioMode() {
        initEditMode();
    }

    /**
     * I am called when the app enters the editMode "codesnippets"
     * @method enterCodeSnippetMode
     */
    function enterCodeSnippetMode() {
        initEditMode();
        CodeSnippetTimeline.classList.add('editable');

        EditPropertiesContainer.setAttribute('data-editmode', 'codesnippets');
    }

    /**
     * I am called when the app enters the editMode "annotations"
     * @method enterAnnotationMode
     */
    function enterAnnotationMode() {
        initEditMode();
        AnnotationTimeline.classList.add('editable');

        EditPropertiesContainer.setAttribute('data-editmode', 'annotations');
    }

    /**
     * I am called when the global state "hv_config_areaTopVisible" changes.
     *
     * This is a configuration option (saved in the hypervideo's index.json entry).
     *
     * @method toggleConfig_areaTopVisible
     * @param {Boolean} newState
     * @param {Boolean} oldState
     */
    function toggleConfig_areaTopVisible(newState, oldState) {
        if (newState == true) {
            domElement.querySelectorAll('.areaTopContainer, .areaTopDetails').forEach(function(el) { el.style.display = ''; });
        } else {
            domElement.querySelectorAll('.areaTopContainer, .areaTopDetails').forEach(function(el) { el.style.display = 'none'; });
        }
        if ( FrameTrail.getState('slidePosition') != 'middle' ) {
            FrameTrail.changeState('slidePosition', 'middle');
        }
        updateLayoutAreasButtonVisibility();
    };

    /**
     * I am called when the global state "hv_config_areaBottomVisible" changes.
     *
     * This is a configuration option (saved in the hypervideo's index.json entry).
     *
     * @method toggleConfig_areaBottomVisible
     * @param {Boolean} newState
     * @param {Boolean} oldState
     */
    function toggleConfig_areaBottomVisible(newState, oldState) {
        if (newState == true) {
            domElement.querySelectorAll('.areaBottomContainer, .areaBottomDetails').forEach(function(el) { el.style.display = ''; });
        } else {
            domElement.querySelectorAll('.areaBottomContainer, .areaBottomDetails').forEach(function(el) { el.style.display = 'none'; });
        }
        if ( FrameTrail.getState('slidePosition') != 'middle' ) {
            FrameTrail.changeState('slidePosition', 'middle');
        }
        updateLayoutAreasButtonVisibility();
    };

    /**
     * I am called when the global state "hv_config_areaLeftVisible" changes.
     *
     * This is a configuration option (saved in the hypervideo's index.json entry).
     *
     * @method toggleConfig_areaLeftVisible
     * @param {Boolean} newState
     * @param {Boolean} oldState
     */
    function toggleConfig_areaLeftVisible(newState, oldState) {
        if (newState == true) {
            AreaLeftContainer.style.display = '';
        } else {
            AreaLeftContainer.style.display = 'none';
        }
        updateLayoutAreasButtonVisibility();
    };

    /**
     * I am called when the global state "hv_config_areaRightVisible" changes.
     *
     * This is a configuration option (saved in the hypervideo's index.json entry).
     *
     * @method toggleConfig_areaRightVisible
     * @param {Boolean} newState
     * @param {Boolean} oldState
     */
    function toggleConfig_areaRightVisible(newState, oldState) {
        if (newState == true) {
            AreaRightContainer.style.display = '';
        } else {
            AreaRightContainer.style.display = 'none';
        }
        updateLayoutAreasButtonVisibility();
    };

    /**
     * I am called when the global state "hv_config_overlaysVisible" changes.
     *
     * This is a configuration option (saved in the hypervideo's index.json entry).
     *
     * @method toggleConfig_overlaysVisible
     * @param {Boolean} newState
     * @param {Boolean} oldState
     */
    function toggleConfig_overlaysVisible(newState, oldState) {
        if (newState == true) {
            OverlayContainer.style.display = '';
        } else {
            OverlayContainer.style.display = 'none';
        }
    };

    /**
     * I am called when the global state "hv_config_autohideControls" changes.
     *
     * This is a configuration option (saved in the hypervideo's index.json entry).
     *
     * @method toggleConfig_autohideControls
     * @param {Boolean} newState
     * @param {Boolean} oldState
     */
    function toggleConfig_autohideControls(newState, oldState) {

        var _target = document.querySelector(FrameTrail.getState('target'));
        if (newState) {
            _target.classList.add('autohideControls');
        } else {
            _target.classList.remove('autohideControls');
            _target.classList.remove('userinactive');
        }

        adjustHypervideo();

    };


    /**
     * I am called when the global state "hv_config_slidingMode" changes.
     *
     * This is a configuration option (saved in the hypervideo's index.json entry).
     *
     * @method toggleConfig_slidingMode
     * @param {String} newState
     * @param {String} oldState
     */
    function toggleConfig_slidingMode(newState, oldState) {

        if ( FrameTrail.getState('slidePosition') != 'middle' ) {
            FrameTrail.changeState('slidePosition', 'middle');
        }

        adjustLayout();
        adjustHypervideo();

    };


    /**
     * I am called when the global state "hv_config_slidingTrigger" changes.
     *
     * This is a configuration option (saved in the hypervideo's index.json entry).
     *
     * @method toggleConfig_slidingTrigger
     * @param {String} newState
     * @param {String} oldState
     */
    function toggleConfig_slidingTrigger(newState, oldState) {

    };


    /**
     * I am called when the global state "hv_config_captionsVisible" changes.
     *
     * This is a configuration option (saved in the hypervideo's index.json entry).
     *
     * @method toggleConfig_captionsVisible
     * @param {Boolean} newState
     * @param {Boolean} oldState
     */
    function toggleConfig_captionsVisible(newState, oldState) {
        var _cb = Controls.querySelector('.captionsButton');
        if (newState == true && _cb.querySelector('.captionSelect[data-lang="'+ FrameTrail.module('HypervideoModel').selectedLang +'"]') !== null ) {
            _cb.classList.add('active');
            _cb.querySelectorAll('.captionSelect').forEach(function(el) { el.classList.remove('active'); });
            _cb.querySelector('.captionSelect[data-lang="'+ FrameTrail.module('HypervideoModel').selectedLang +'"]').classList.add('active');
            CaptionContainer.style.display = '';
        } else {
            _cb.classList.remove('active');
            _cb.querySelectorAll('.captionSelect').forEach(function(el) { el.classList.remove('active'); });
            _cb.querySelector('.captionSelect.none').classList.add('active');
            CaptionContainer.style.display = 'none';
        }
    };


    /**
     * I am called when the global state "slidePosition" changes.
     *
     * This state is either "top", "middle" or "bottom", and indicates, which area has the most visual weight.
     * The Hypervideocontainer is always displayed in the middle (in different sizes).
     *
     * @method changeSlidePosition
     * @param {String} newState
     * @param {String} oldState
     */
    function changeSlidePosition(newState, oldState) {
        // Update slide-pos classes on the viewVideo element.
        // CSS uses these to control visibility of areaTopDetails / areaBottomDetails,
        // keeping them invisible (and flicker-free) whenever they're off-screen.
        domElement.classList.toggle('slide-pos-top',    newState === 'top');
        domElement.classList.toggle('slide-pos-bottom', newState === 'bottom');

        // Only animate the slideArea when the state genuinely changes through the
        // state system (onChange passes both oldState and newState), and animation
        // has not been suppressed (e.g. during the leaveEditMode restore sequence).
        if (!_suppressSlideAnimation && newState !== oldState && oldState !== undefined) {
            slideArea.classList.add('is-sliding');
        } else {
            // Direct call or suppressed: ensure no stale is-sliding from a prior animation.
            slideArea.classList.remove('is-sliding');
        }

        adjustLayout();
        adjustHypervideo();

        // A second pass 300 ms later corrects dimensions that depend on the
        // post-transition layout (e.g. overlay mode offset calculations).
        // Store the ref so resize handlers can cancel it.
        // Also removes is-sliding so subsequent adjustLayout calls (e.g. from resize)
        // don't accidentally animate.
        clearTimeout(_pendingAdjust);
        _pendingAdjust = window.setTimeout(function() {
            _pendingAdjust = null;
            slideArea.classList.remove('is-sliding');
            adjustLayout();
            adjustHypervideo();
        }, 300);

        if ( FrameTrail.getState('editMode') && FrameTrail.getState('editMode') != 'preview' ) return;

        if ( newState != 'middle' ) {
            ExpandButton.style.display = 'block';
        } else {
            ExpandButton.style.display = 'none';
        }

        if ( newState == 'bottom' ) {
            shownDetails = 'bottom';
        } else if ( newState != 'middle' ) {
            shownDetails = 'top';
        } else {
            shownDetails = null;
        }

        if ( newState != oldState && FrameTrail.getState('hv_config_slidingMode') == 'overlay' ) {

            if ( shownDetails != null ) {

                VideoContainer.style.transition = 'opacity 500ms';
                VideoContainer.style.opacity = '0.2';

                AreaLeftContainer.style.transition = 'opacity 500ms';
                AreaLeftContainer.style.opacity = '0.2';

                AreaRightContainer.style.transition = 'opacity 500ms';
                AreaRightContainer.style.opacity = '0.2';

                wasPlaying = FrameTrail.module('HypervideoController').isPlaying;

                window.setTimeout(function() {
                    FrameTrail.module('HypervideoController').pause();
                }, 500);

            } else if ( wasPlaying ) {

                VideoContainer.style.transition = 'opacity 500ms';
                VideoContainer.style.opacity = '1';

                AreaLeftContainer.style.transition = 'opacity 500ms';
                AreaLeftContainer.style.opacity = '1';

                AreaRightContainer.style.transition = 'opacity 500ms';
                AreaRightContainer.style.opacity = '1';

                window.setTimeout(function() {
                    FrameTrail.module('HypervideoController').play();
                }, 500);

            } else {
                VideoContainer.style.transition = 'opacity 500ms';
                VideoContainer.style.opacity = '1';

                AreaLeftContainer.style.transition = 'opacity 500ms';
                AreaLeftContainer.style.opacity = '1';

                AreaRightContainer.style.transition = 'opacity 500ms';
                AreaRightContainer.style.opacity = '1';
            }


        }
    };

    /**
     * This method changes the global state "slidePosition" from "bottom" to "middle"
     * or from "middle" to "top".
     * @method slidePositionUp
     */
    function slidePositionUp() {

        var slidePosition = FrameTrail.getState('slidePosition');

        if ( slidePosition == 'middle' && FrameTrail.getState('hv_config_areaTopVisible') ) {
            FrameTrail.changeState('slidePosition', 'top');
        } else if ( slidePosition == 'bottom' ) {
            FrameTrail.changeState('slidePosition', 'middle')
        }

    };

    /**
     * This method changes the global state "slidePosition" from "top" to "middle"
     * or from "middle" to "bottom".
     * @method slidePositionDown
     */
    function slidePositionDown() {

        var slidePosition = FrameTrail.getState('slidePosition');

        if ( slidePosition == 'top' ) {
            FrameTrail.changeState('slidePosition', 'middle');
        } else if ( slidePosition == 'middle' && FrameTrail.getState('hv_config_areaBottomVisible') ) {
            FrameTrail.changeState('slidePosition', 'bottom');
        }

    };


    /**
     * This method is used to show the details (aka the content) of either the LayoutArea top or bottom.
     *
     * @method showDetails
     * @param {String} area
     */
    function showDetails(area) {

        shownDetails = area;

        if (!area) {
            FrameTrail.changeState('slidePosition', 'middle');
        } else if ( area == 'top' && FrameTrail.getState('hv_config_areaTopVisible') ) {
                FrameTrail.changeState('slidePosition', 'top');
        } else if ( area == 'bottom' && FrameTrail.getState('hv_config_areaBottomVisible') ) {
            FrameTrail.changeState('slidePosition', 'bottom');
        }

    };


    /**
     * Toggles the visibility of the working (loading) indicator.
     *
     * @method toggleVideoWorking
     * @param {Boolean} working
     */
    function toggleVideoWorking(working) {

        if ( working ) {

            WorkingIndicator.style.display = 'block';

        } else {

            WorkingIndicator.style.display = 'none';

        }

    };

    /**
     * I return the closest element from a given position {top: XX, left: XX} in a collection.
     *
     * @method closestToOffset
     * @param {Object} collection
     * @param {Object} position
     */
    function closestToOffset(collection, position) {
        var el = null, elOffset, x = position.left, y = position.top, distance, dx, dy, minDistance;
        var items = Array.from(collection);
        for (var i = 0; i < items.length; i++) {
            var item = items[i];
            elOffset = { left: item.offsetLeft, top: item.offsetTop, right: item.offsetLeft + item.offsetWidth, bottom: item.offsetTop + item.offsetHeight };

            if (
            (x >= elOffset.left)  && (x <= elOffset.right) &&
            (y >= elOffset.top)   && (y <= elOffset.bottom)
            ) {
                el = item;
                break;
            }

            var offsets = [[elOffset.left, elOffset.top], [elOffset.right, elOffset.top], [elOffset.left, elOffset.bottom], [elOffset.right, elOffset.bottom]];
            for (var off in offsets) {
                dx = offsets[off][0] - x;
                dy = offsets[off][1] - y;
                distance = Math.sqrt((dx*dx) + (dy*dy));
                if (minDistance === undefined || distance < minDistance) {
                    minDistance = distance;
                    el = item;
                }
            }
        }
        return el;
    };


    /**
     * While the Alt/Option key is held, all snapping (timeline and canvas) is
     * suppressed, so the user can position/resize freely without snapping. The
     * flag is kept up to date by the key listeners attached in
     * attachSnapSuppressionListeners(), which run once.
     */
    var _snapSuppressed = false,
        _snapKeyListenersAttached = false;

    function attachSnapSuppressionListeners() {

        if (_snapKeyListenersAttached) { return; }
        _snapKeyListenersAttached = true;

        document.addEventListener('keydown', function(evt) { _snapSuppressed = evt.altKey; }, true);
        document.addEventListener('keyup',   function(evt) { _snapSuppressed = evt.altKey; }, true);
        window.addEventListener('blur',      function() { _snapSuppressed = false; });

    };


    /**
     * I return the closest value from an array of snap target positions,
     * or null when no target is within the given tolerance. I return null
     * unconditionally while snapping is suppressed (Alt/Option held down).
     *
     * @method closestSnapTarget
     * @param {Number} value
     * @param {Array} targets
     * @param {Number} tolerance
     * @return Number or null
     */
    function closestSnapTarget(value, targets, tolerance) {

        if (_snapSuppressed) { return null; }

        var best = null,
            bestDistance = tolerance + 1;

        for (var i = 0; i < targets.length; i++) {
            var distance = Math.abs(targets[i] - value);
            if (distance < bestDistance) {
                bestDistance = distance;
                best = targets[i];
            }
        }

        return (best !== null && bestDistance <= tolerance) ? best : null;

    };


    /**
     * I collect the snap target positions for timeline dragging/resizing:
     * the start and end edges of the other timeline elements in the *same*
     * timeline as the dragged element. I do NOT snap across the three timelines
     * (that snapped to elements the user could not see and felt random), and I
     * deliberately do NOT include the playhead: the drag handlers move the
     * playhead to the dragged element's own start on every frame, so snapping to
     * it made the element snap to itself and crawl along in tolerance-sized steps.
     * Off-screen targets (outside the visible timeline width) are dropped. All
     * positions are px values relative to the left edge of the given reference
     * parent (the dragged element's container).
     *
     * @method getTimelineSnapTargets
     * @param {HTMLElement} referenceParent
     * @param {HTMLElement} excludeElement
     * @return Array
     */
    function getTimelineSnapTargets(referenceParent, excludeElement) {

        var refRect = referenceParent.getBoundingClientRect(),
            refLeft = refRect.left,
            visibleWidth = referenceParent.clientWidth || refRect.width,
            targets = [];

        var inView = function(x) { return x >= -1 && x <= visibleWidth + 1; };

        referenceParent.querySelectorAll('.timelineElement').forEach(function(el) {
            if (el === excludeElement) { return; }
            var rect = el.getBoundingClientRect(),
                left = rect.left - refLeft,
                right = rect.right - refLeft;
            if (inView(left))  { targets.push(left); }
            if (inView(right)) { targets.push(right); }
        });

        return targets;

    };


    /**
     * I compute the snap-adjusted rect for a timeline element occupying
     * [left, left+width] (px, relative to referenceParent), considering which
     * edges are eligible (both edges for a drag, one edge for a resize). I return
     * { left, width, indicator }, where indicator is the px position of the snap
     * guide line (or null when nothing is within tolerance).
     *
     * This is used in a *snap-on-release* fashion: the drag/resize move handlers
     * call me only to show the guide line and never pin the element (so movement
     * stays free and never gets stuck in a chain of nearby snap targets), and the
     * end handlers call me to snap the final drop position. While the Alt/Option
     * key is held, closestSnapTarget returns null, so nothing snaps.
     *
     * @method computeTimelineSnap
     * @param {HTMLElement} referenceParent
     * @param {HTMLElement} excludeElement
     * @param {Number} left
     * @param {Number} width
     * @param {Number} tolerance
     * @param {Object} edges  { left: Boolean, right: Boolean }
     * @return {Object} { left, width, indicator }
     */
    function computeTimelineSnap(referenceParent, excludeElement, left, width, tolerance, edges) {

        var targets = getTimelineSnapTargets(referenceParent, excludeElement);
        edges = edges || { left: true, right: true };

        var sLeft  = edges.left  ? closestSnapTarget(left, targets, tolerance) : null,
            sRight = edges.right ? closestSnapTarget(left + width, targets, tolerance) : null;

        if (edges.left && edges.right) {
            // Drag: the whole element moves, width stays — snap whichever edge is closer.
            if (sLeft !== null && (sRight === null || Math.abs(sLeft - left) <= Math.abs(sRight - (left + width)))) {
                return { left: sLeft, width: width, indicator: sLeft };
            } else if (sRight !== null) {
                return { left: sRight - width, width: width, indicator: sRight };
            }
        } else if (edges.left && sLeft !== null) {
            // Resize left edge: left moves, right edge stays.
            return { left: sLeft, width: width + (left - sLeft), indicator: sLeft };
        } else if (edges.right && sRight !== null) {
            // Resize right edge: right edge moves, left stays.
            return { left: left, width: sRight - left, indicator: sRight };
        }

        return { left: left, width: width, indicator: null };

    };


    var _timelineSnapIndicator = null;

    /**
     * I show an ephemeral vertical snap indicator line at the given px position
     * inside the given timeline container. See also hideTimelineSnapIndicator().
     *
     * @method showTimelineSnapIndicator
     * @param {HTMLElement} container
     * @param {Number} x
     */
    function showTimelineSnapIndicator(container, x) {

        if (!_timelineSnapIndicator) {
            _timelineSnapIndicator = document.createElement('div');
            _timelineSnapIndicator.className = 'timelineSnapIndicator';
        }

        if (_timelineSnapIndicator.parentElement !== container) {
            container.appendChild(_timelineSnapIndicator);
        }

        _timelineSnapIndicator.style.left = x + 'px';

    };


    /**
     * I remove the timeline snap indicator from the DOM (if present).
     * @method hideTimelineSnapIndicator
     */
    function hideTimelineSnapIndicator() {

        if (_timelineSnapIndicator && _timelineSnapIndicator.parentElement) {
            _timelineSnapIndicator.remove();
        }

    };

    /**
     *  Toggle (Enter / Exit) native Fullscreen State
     *
     * @method toggleNativeFullscreenState
     * @param {Object} evt
     * @param {String} forceState
     */
    function toggleNativeFullscreenState(evt, forceState) {
        
        var element = document.querySelector(FrameTrail.getState('fullscreenTarget') || FrameTrail.getState('target'));
        
        if (element.requestFullscreen) {
            if ((!forceState && !document.fullscreen) || (forceState && forceState == 'open')) {
                element.requestFullscreen().catch(function(err) {
                    console.warn('Fullscreen request denied:', err.message);
                });
            } else if (!forceState || forceState == 'close') {
                document.exitFullscreen();
            }
        } else if (element.mozRequestFullScreen) {
            if ((!forceState && !document.mozFullScreen) || (forceState && forceState == 'open')) {
                element.mozRequestFullScreen();
            } else if (!forceState || forceState == 'close') {
                document.mozCancelFullScreen();
            }
        } else if (element.webkitRequestFullScreen) {
            if ((!forceState && !document.webkitIsFullScreen) || (forceState && forceState == 'open')) {
                element.webkitRequestFullScreen();
            } else if (!forceState || forceState == 'close') {
                document.webkitCancelFullScreen();
            }
        }

    }

    /**
     * Toggle internal Fullscreen State
     *
     * @method toggleFullscreenState
     */
    function toggleFullscreenState() {

        var element = document.querySelector(FrameTrail.getState('target') + ' .mainContainer');

        if (element.requestFullScreen) {
            if (!document.fullScreen) {
                FrameTrail.changeState('fullscreen', false);
            } else {
                FrameTrail.changeState('fullscreen', true);
            }

        } else if (element.mozRequestFullScreen) {
            if (!document.mozFullScreen) {
                FrameTrail.changeState('fullscreen', false);
            } else {
                FrameTrail.changeState('fullscreen', true);
            }
        } else if (element.webkitRequestFullScreen) {
            if (!document.webkitIsFullScreen) {
                FrameTrail.changeState('fullscreen', false);
            } else {
                FrameTrail.changeState('fullscreen', true);
            }
        }

        setTimeout(function() {
            window.dispatchEvent(new Event('resize'));
        }, 1000);

    }

    /**
     * Toggles the visibility of the controls.
     * (applied to the body element to simplify third party integrations)
     *
     * @method toggleUserActive
     * @param {Boolean} activeState
     */
    function toggleUserActive(activeState) {

        if (FrameTrail.getState('hv_config_autohideControls')) {
            var _target = document.querySelector(FrameTrail.getState('target'));
            if (activeState) {
                _target.classList.remove('userinactive');
            } else {
                _target.classList.add('userinactive');
            }
        }

    }

    /**
     * Toggles the livestream controls.
     *
     * @method toggleLivestream
     * @param {Boolean} activeState
     */
    function toggleLivestream(activeState) {
        if (activeState) {
            PlayerContainer.classList.add('livestream');
        } else {
            PlayerContainer.classList.remove('livestream');
        }
    }


    return {

        onChange: {

            viewSize:        changeViewSize,
            viewSizeChanged: onViewSizeChanged,
            fullscreen:      toggleFullscreen,
            viewMode:        toggleViewMode,
            editMode:        toggleEditMode,
            slidePosition:   changeSlidePosition,
            videoWorking:    toggleVideoWorking,
            userActive:      toggleUserActive,
            livestream:      toggleLivestream,

            hv_config_areaTopVisible:               toggleConfig_areaTopVisible,
            hv_config_areaBottomVisible:            toggleConfig_areaBottomVisible,
            hv_config_areaLeftVisible:              toggleConfig_areaLeftVisible,
            hv_config_areaRightVisible:             toggleConfig_areaRightVisible,
            hv_config_autohideControls:             toggleConfig_autohideControls,
            hv_config_overlaysVisible:              toggleConfig_overlaysVisible,
            hv_config_slidingMode:                  toggleConfig_slidingMode,
            hv_config_slidingTrigger:               toggleConfig_slidingTrigger,
            hv_config_captionsVisible:              toggleConfig_captionsVisible
        },


        create:                         create,
        toggleSidebarOpen:              toggleSidebarOpen,
        adjustLayout:                   adjustLayout,
        adjustHypervideo:               adjustHypervideo,
        toggleFullscreenState:          toggleFullscreenState,
        toggleNativeFullscreenState:    toggleNativeFullscreenState,
        switchInfoTab:                  switchInfoTab,

        slidePositionUp:         slidePositionUp,
        slidePositionDown:       slidePositionDown,
        closestToOffset:         closestToOffset,
        closestSnapTarget:       closestSnapTarget,
        getTimelineSnapTargets:  getTimelineSnapTargets,
        computeTimelineSnap:     computeTimelineSnap,
        showTimelineSnapIndicator: showTimelineSnapIndicator,
        hideTimelineSnapIndicator: hideTimelineSnapIndicator,

        /**
         * I display a (formated time) string in an area of the progress bar.
         * @attribute currentTime
         * @type String
         */
        set currentTime(aString) { CurrentTime.textContent = aString; },
        /**
         * I display a (formated time) string in an area of the progress bar.
         * @attribute duration
         * @type String
         */
        set duration(aString)    { TotalDuration.textContent = aString; },

        /**
         * I display a (formated time) string in an area of the progress bar.
         * @attribute currentTimeFull
         * @type String
         */
        set currentTimeFull(aString) { CurrentTimeFull.textContent = aString; },
        /**
         * I display a (formated time) string in an area of the progress bar.
         * @attribute durationFull
         * @type String
         */
        set durationFull(aString)    { TotalDurationFull.textContent = aString; },

        /**
         * I contain the HypervideoContainer element.
         * @attribute HypervideoContainer
         * @type HTMLElement
         */
        get HypervideoContainer() { return HypervideoContainer },

        /**
         * I contain the Video element.
         * @attribute Video
         * @type HTMLElement
         */
        get Video()             { return Video          },
        /**
         * I contain the CaptionContainer element.
         * @attribute CaptionContainer
         * @type HTMLElement
         */
        get CaptionContainer()  { return CaptionContainer },
        /**
         * I contain the progress bar element.
         * @attribute PlayerProgress
         * @type HTMLElement
         */
        get PlayerProgress()    { return PlayerProgress },
        get ChapterButton()     { return chapterButton },
        get ChapterSelectList() { return chapterContainer.querySelector('.chapterSelectList') },
        /**
         * I contain the play button element.
         * @attribute PlayButton
         * @type HTMLElement
         */
        get PlayButton()        { return PlayButton     },
        /**
         * I contain the start overlay element (containing the big play button).
         * @attribute VideoStartOverlay
         * @type HTMLElement
         */
        get VideoStartOverlay() { return VideoStartOverlay },
        /**
         * I contain the EditingOptions element (where e.g. the ResourcePicker is rendered).
         * @attribute EditingOptions
         * @type HTMLElement
         */
        get EditingOptions()    { return EditingOptions },
        /**
         * I contain the HypervideoLayoutContainer element.
         * @attribute HypervideoLayoutContainer
         * @type HTMLElement
         */
        get HypervideoLayoutContainer()    { return HypervideoLayoutContainer },
        get OtherUsersContainer()          { return OtherUsersContainer },
        /**
         * I contain the OverlayContainer element.
         * @attribute OverlayContainer
         * @type HTMLElement
         */
        get OverlayContainer()  { return OverlayContainer },
        /**
         * I contain the OverlayTimeline element.
         * @attribute OverlayTimeline
         * @type HTMLElement
         */
        get OverlayTimeline()   { return OverlayTimeline  },

        /**
         * I contain the CodeSnippetTimeline element.
         * @attribute CodeSnippetTimeline
         * @type HTMLElement
         */
        get CodeSnippetTimeline()  { return CodeSnippetTimeline  },

        /**
         * I contain the AreaTopDetails element.
         * @attribute AreaTopDetails
         * @type HTMLElement
         */
        get AreaTopDetails() { return AreaTopDetails },
        /**
         * I contain the AreaTopContainer element.
         * @attribute AreaTopContainer
         * @type HTMLElement
         */
        get AreaTopContainer()     { return AreaTopContainer     },

        /**
         * I contain the AreaBottomDetails element.
         * @attribute AreaBottomDetails
         * @type HTMLElement
         */
        get AreaBottomDetails() { return AreaBottomDetails    },
        /**
         * I contain the AreaBottomContainer element.
         * @attribute AreaBottomContainer
         * @type HTMLElement
         */
        get AreaBottomContainer()     { return AreaBottomContainer     },

        /**
         * I contain the AreaLeftContainer element.
         * @attribute AreaLeftContainer
         * @type HTMLElement
         */
        get AreaLeftContainer()     { return AreaLeftContainer     },

        /**
         * I contain the AreaRightContainer element.
         * @attribute AreaRightContainer
         * @type HTMLElement
         */
        get AreaRightContainer()     { return AreaRightContainer     },

        /**
         * I contain the AnnotationTimeline element.
         * @attribute AnnotationTimeline
         * @type HTMLElement
         */
        get AnnotationTimeline()  { return AnnotationTimeline  },

        /**
         * I contain the EditPropertiesContainer element (where properties of an overlay/annotation can be viewed and – in the case ov overlays – changed).
         * @attribute EditPropertiesContainer
         * @type HTMLElement
         */
        get EditPropertiesContainer() { return EditPropertiesContainer },


        /**
         * This attribute controls wether the view places its visual weight on "annotations" or "videolinks", or none of the both (null).
         * @attribute shownDetails
         * @type String or null
         */
        get shownDetails()     { return shownDetails },
        set shownDetails(mode) { return showDetails(mode) },


        /**
         * I contain the AnnotationSearchButton element.
         * @attribute AnnotationSearchButton
         * @type HTMLElement
         */
        get AnnotationSearchButton() { return AnnotationSearchButton },

        /**
         * I contain the ExpandButton element.
         * @attribute ExpandButton
         * @type HTMLElement
         */
        get ExpandButton() { return ExpandButton },

        /**
         * I contain the CaptionsButton element, including the list of available subtitles.
         * @attribute CaptionsButton
         * @type HTMLElement
         */
        get CaptionsButton() { return Controls.querySelector('.captionsButton') }

    };

});
