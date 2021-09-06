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

    var domElement  = $(  '<div class="viewVideo">'
                        + '    <div class="areaLeftDetails layoutAreaDetails" data-area="areaLeft"></div>'
                        + '    <div class="slideArea">'
                        + '        <div class="areaTopDetails layoutAreaDetails" data-area="areaTop"></div>'
                        + '        <div class="areaTopContainer layoutArea" data-area="areaTop">'
                        + '            <div class="layoutAreaTabs"></div>'
                        + '            <div class="layoutAreaContent"></div>'
                        + '            <div class="layoutAreaToggleCloseButton"></div>'
                        + '        </div>'
                        + '        <div class="playerContainer">'
                        + '            <div class="hypervideoContainer">'
                        + '                <div class="areaLeftContainer layoutArea" data-area="areaLeft">'
                        + '                    <div class="layoutAreaTabs"></div>'
                        + '                    <div class="layoutAreaContent"></div>'
                        + '                    <div class="layoutAreaToggleCloseButton"></div>'
                        + '                </div>'
                        + '                <div class="videoContainer">'
                        + '                    <div class="hypervideo">'
                        + '                        <video class="video nocolor" '+ ((!!screenfull) ? 'playsinline webkit-playsinline' : '') +' disablePictureInPicture></video>'
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
                        + '                    <div class="layoutAreaToggleCloseButton"></div>'
                        + '                </div>'
                        + '                <div class="infoAreaRight">'
                        + '                    <div class="editPropertiesContainer"></div>'
                        + '                </div>'
                        + '            </div>'
                        + '            <div class="codeSnippetTimeline timeline"></div>'
                        + '            <div class="overlayTimeline timeline"></div>'
                        + '            <div class="playerProgress"></div>'
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
                        + '                    <div class="annotationSearchButton playerControl contextButton">'
                        + '                        <span class="icon-search"></span>'
                        + '                        <div class="annotationSearchContainer contextButtonContainer">'
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
                        + '        </div>'
                        + '        <div class="areaBottomContainer layoutArea" data-area="areaBottom">'
                        + '            <div class="layoutAreaTabs"></div>'
                        + '            <div class="layoutAreaContent"></div>'
                        + '            <div class="layoutAreaToggleCloseButton"></div>'
                        + '        </div>'
                        + '        <div class="areaBottomDetails layoutAreaDetails" data-area="areaBottom"></div>'
                        + '    </div>'
                        + '    <div class="areaRightDetails layoutAreaDetails" data-area="areaRight"></div>'
                        + '    <div class="editingOptions"></div>'
                        + '    <div class="hypervideoLayoutContainer"></div>'
                        + '</div>'),


        slideArea                   = domElement.children('.slideArea'),

        PlayerContainer             = domElement.find('.playerContainer'),
        HypervideoContainer         = domElement.find('.hypervideoContainer'),
        VideoContainer              = domElement.find('.videoContainer'),
        Hypervideo                  = domElement.find('.hypervideo'),
        CaptionContainer            = domElement.find('.captionContainer'),

        AreaTopDetails              = domElement.find('.areaTopDetails'),
        AreaTopContainer            = domElement.find('.areaTopContainer'),

        AreaBottomDetails           = domElement.find('.areaBottomDetails'),
        AreaBottomContainer         = domElement.find('.areaBottomContainer'),

        AreaLeftDetails             = domElement.find('.areaLeftDetails'),
        AreaLeftContainer           = domElement.find('.areaLeftContainer'),

        AreaRightDetails            = domElement.find('.areaRightDetails'),
        AreaRightContainer          = domElement.find('.areaRightContainer'),

        AnnotationTimeline          = domElement.find('.annotationTimeline'),

        OverlayTimeline             = domElement.find('.overlayTimeline'),
        OverlayContainer            = domElement.find('.overlayContainer'),

        CodeSnippetTimeline         = domElement.find('.codeSnippetTimeline'),

        Controls                    = domElement.find('.controls'),
        AnnotationSearchButton      = domElement.find('.annotationSearchButton'),
        EditingOptions              = domElement.find('.editingOptions'),
        HypervideoLayoutContainer   = domElement.find('.hypervideoLayoutContainer'),


        CurrentTime                 = domElement.find('.currentTime'),
        TotalDuration               = domElement.find('.totalDuration'),
        CurrentTimeFull             = domElement.find('.currentTimeFull'),
        TotalDurationFull           = domElement.find('.totalDurationFull'),
        PlayButton                  = domElement.find('.playButton'),
        VideoStartOverlay           = domElement.find('.videoStartOverlay'),
        VolumeButton                = domElement.find('.volumeButton'),
        FullscreenButton            = domElement.find('.fullscreenButton'),

        PlayerProgress              = domElement.find('.playerProgress'),

        Video                       = domElement.find('.video')[0],

        EditPropertiesContainer     = domElement.find('.editPropertiesContainer'),

        ExpandButton                = domElement.find('.expandButton'),

        WorkingIndicator            = VideoContainer.find('.workingIndicator'),

        shownDetails                = null,
        wasPlaying                  = false;


    ExpandButton.click(function() {
        showDetails(false);
    });

    Controls.find('.captionsButton').click(function() {

        Controls.find('.rightControlPanel .active').not('[data-config], .captionsButton, .captionSelectContainer, .annotationSetButton').removeClass('active');

        if ( !$(this).children('.captionSelectContainer').hasClass('active') ) {
            $(this).children('.captionSelectContainer').addClass('active');
            VideoContainer.css('opacity', 0.3);
            domElement.find('.areaLeftContainer, .areaRightContainer').css('opacity', 0.3);
        } else {
            $(this).children('.captionSelectContainer').removeClass('active');
            VideoContainer.css('opacity', 1);
            domElement.find('.areaLeftContainer, .areaRightContainer').css('opacity', 1);
        }

    });

    Controls.find('.captionSelect.none').click(function() {
        FrameTrail.changeState('hv_config_captionsVisible', false);
    });

    Controls.find('.contextButton').click(function(evt) {

        var contextButton = $(this);

        if ( !contextButton.hasClass('active') ) {

            $('body').on('mouseup', function(evt) {

                if ( !$(evt.target).attr('data-config') && !$(evt.target).hasClass('contextButton') ) {
                    contextButton.removeClass('active');
                    VideoContainer.css('opacity', 1);
                    domElement.find('.areaLeftContainer, .areaRightContainer').css('opacity', 1);
                    $('body').off('mouseup');
                    evt.preventDefault();
                    evt.stopPropagation();
                }

            });

            Controls.find('.rightControlPanel .active').not('[data-config], .captionsButton').removeClass('active');

            contextButton.addClass('active');
            VideoContainer.css('opacity', 0.3);
            domElement.find('.areaLeftContainer, .areaRightContainer').css('opacity', 0.3);

        } else {

            contextButton.removeClass('active');
            VideoContainer.css('opacity', 1);
            domElement.find('.areaLeftContainer, .areaRightContainer').css('opacity', 1);

        }

    });

    VolumeButton.click(function() {

        if ( $(this).hasClass('active') ) {
            FrameTrail.module('HypervideoController').muted = false;
            $(this).removeClass('active');
        } else {
            FrameTrail.module('HypervideoController').muted = true;
            $(this).addClass('active');
        }


    });

    AreaTopContainer.click(function(evt) {

        //

    });

    AreaBottomContainer.click(function(evt) {

        if ( FrameTrail.module('AnnotationsController').openedAnnotation && $(evt.target).hasClass('areaBottomContainer') ) {
            FrameTrail.module('AnnotationsController').openedAnnotation = null;
        }

    });

    domElement.find('.layoutAreaToggleCloseButton').click(function() {
        $(this).parent('.layoutArea').toggleClass('closed');
        showDetails(false);
        window.setTimeout(function() {
            adjustHypervideo();
        }, 250);
    });

    document.addEventListener("fullscreenchange", toggleFullscreenState, false);
    document.addEventListener("webkitfullscreenchange", toggleFullscreenState, false);
    document.addEventListener("mozfullscreenchange", toggleFullscreenState, false);
    Controls.find('.fullscreenButton').click(toggleNativeFullscreenState);


    /**
     * I am called from {{#crossLink "Interface/create:method"}}Interface/create(){{/crossLink}}.
     * I update my local state from the global state variables and append my elements in the DOM tree.
     * @method create
     */
    function create() {
        
        $(FrameTrail.getState('target')).find('.mainContainer').append(domElement);

        if (/^((?!chrome|android).)*safari/i.test(navigator.userAgent)) {
            fixGoddamnSafariBug();
        };

        if (FrameTrail.getState('hv_config_clipTimeVisible')) {
            Controls.find('.timeDisplayFull').show();
        }

        toggleViewMode(FrameTrail.getState('viewMode'));

        toggleConfig_captionsVisible(FrameTrail.getState('hv_config_captionsVisible'));

        FrameTrail.changeState('hv_config_overlaysVisible', true);

        changeSlidePosition('middle');

    }

    function fixGoddamnSafariBug() {

        $($(FrameTrail.getState('target')).find('.sidebar'), $(FrameTrail.getState('target')).find('.mainContainer'), $(FrameTrail.getState('target')).find('.viewVideo'), $(FrameTrail.getState('target')).find('.slideArea') ).css({
            'transition-duration': '0ms',
            '-moz-transition-duration': '0ms',
            '-webkit-transition-duration': '0ms',
            '-o-transition-duration': '0ms'
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

        slideArea.css({
            'transition-duration': '0ms',
            '-moz-transition-duration': '0ms',
            '-webkit-transition-duration': '0ms',
            '-o-transition-duration': '0ms'
        });

        adjustLayout();
        adjustHypervideo();

        if (/^((?!chrome|android).)*safari/i.test(navigator.userAgent) == false) {
            slideArea.css({
                'transition-duration': '',
                '-moz-transition-duration': '',
                '-webkit-transition-duration': '',
                '-o-transition-duration': ''
            });
        }

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

        slideArea.css({
            'transition-duration': '0ms',
            '-moz-transition-duration': '0ms',
            '-webkit-transition-duration': '0ms',
            '-o-transition-duration': '0ms'
        });

        adjustLayout();
        adjustHypervideo();

        if (/^((?!chrome|android).)*safari/i.test(navigator.userAgent) == false) {
            slideArea.css({
                'transition-duration': '',
                '-moz-transition-duration': '',
                '-webkit-transition-duration': '',
                '-o-transition-duration': ''
            });
        }

        domElement.find('.resourceDetail[data-type="location"]').each(function() {
            if ( $(this).data('map') ) {
                $(this).data('map').updateSize();
            }
        });

        var editMode = FrameTrail.getState('editMode');
        if ((editMode == 'overlays' || editMode == 'annotations' || editMode == 'codesnippets') 
            && EditPropertiesContainer.find('.ui-tabs').length != 0) {
            EditPropertiesContainer.find('.ui-tabs').tabs('refresh');
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


        var editMode            = FrameTrail.getState('editMode'),
            playerMargin        = parseInt(PlayerContainer.css('marginTop')),
            editBorder          = (editMode != false) ? 20 : 0,
            slidePosition       = (editMode == 'settings') ? 'middle' : FrameTrail.getState('slidePosition'),
            slidingMode         = FrameTrail.getState('hv_config_slidingMode'),

            areaTopVisible      = ( (editMode != false && editMode != 'preview' && editMode != 'settings') ? false : FrameTrail.getState('hv_config_areaTopVisible') ),
            areaBottomVisible   = ( (editMode != false && editMode != 'preview' && editMode != 'settings') ? false : FrameTrail.getState('hv_config_areaBottomVisible') ),
            areaLeftVisible     = ( (editMode != false && editMode != 'preview' && editMode != 'settings') ? false : FrameTrail.getState('hv_config_areaLeftVisible') ),
            areaRightVisible    = ( (editMode != false && editMode != 'preview' && editMode != 'settings') ? false : FrameTrail.getState('hv_config_areaRightVisible') );

        if (slidingMode == 'overlay') {
            PlayerContainer.css({
                'flex-grow': 0,
                'flex-shrink': 0,
                'flex-basis':
                    $(FrameTrail.getState('target')).find('.mainContainer').height()
                    - ((areaTopVisible) ? (AreaTopContainer.height() + playerMargin) : 0)
                    - ((areaBottomVisible) ? (AreaBottomContainer.height() + playerMargin) : 0)
                    - editBorder
                    + 'px'
            });
        } else {
            PlayerContainer.css({
                'flex': ''
            });
        }

        if ( slidePosition == 'top' ) {

            if ( slidingMode == 'adjust' ) {

                slideArea.css({
                    marginTop:
                        - ((editMode != false && editMode != 'preview' && editMode != 'settings') ? playerMargin : 0)
                        + 'px',
                    minHeight:
                        $(FrameTrail.getState('target')).find('.mainContainer').height()
                        + (areaBottomVisible ? AreaBottomDetails.height() + AreaBottomContainer.height() : 0)
                        + playerMargin
                        - editBorder
                        + 'px'
                });

            } else if ( slidingMode == 'overlay' ) {

                slideArea.css({
                    marginTop:
                        - (areaTopVisible ? AreaTopDetails.height() : 0)
                        - (areaBottomVisible ? AreaBottomDetails.height() : 0)
                        - playerMargin
                        + 'px'
                });

                // slidingMode overlay top behaviour
                var targetOffset = playerMargin + ( (PlayerContainer.height() - Controls.height())/2 ),
                    thisOffset;

                thisOffset = AreaBottomDetails.height() + AreaBottomContainer.height() + targetOffset - (AreaBottomDetails.height() / 2);

                AreaBottomDetails.css({
                    marginTop: thisOffset + 'px'
                });

                AreaBottomContainer.css({
                    marginTop: - thisOffset + 'px'
                });

                AreaTopDetails.css({
                    marginTop: ''
                });

                AreaTopContainer.css({
                    marginTop: ''
                });

            }

        } else if ( slidePosition == 'bottom' ) {

            if ( slidingMode == 'adjust' ) {

                slideArea.css({
                    marginTop:
                        - (areaTopVisible ? AreaTopDetails.height() + AreaTopContainer.height() : 0)
                        - playerMargin
                        + 'px',
                    minHeight:
                        $(FrameTrail.getState('target')).find('.mainContainer').height()
                        + (areaTopVisible ? AreaTopDetails.height() + AreaTopContainer.height() : 0)
                        - editBorder
                        + 'px'
                });

            } else if ( slidingMode == 'overlay' ) {

                slideArea.css({
                    marginTop:
                        - (areaTopVisible ? AreaTopDetails.height() : 0)
                        - playerMargin
                        + 'px'
                });

                var targetOffset = playerMargin + (PlayerContainer.height()/2) + (OverlayTimeline.height()*2) + (Controls.height()/2);

                // slidingMode overlay bottom behaviour
                AreaBottomDetails.css({
                    marginTop: - (targetOffset + AreaBottomContainer.height() + (AreaBottomDetails.height() / 2)) + 'px'
                });

                AreaTopDetails.css({
                    marginTop: ''
                });

                AreaTopContainer.css({
                    marginTop: ''
                });

            }

        } else {

            var topMargin = (areaTopVisible && editMode != 'settings') ? AreaTopDetails.height() : playerMargin;

            if ( areaTopVisible && editMode == 'settings' ) {
                topMargin = 0;
            }


            slideArea.css({
                marginTop:
                    - topMargin
                    + 'px',
                minHeight:
                    $(FrameTrail.getState('target')).find('.mainContainer').height()
                    + ((areaTopVisible && editMode != 'settings') ? AreaTopDetails.height() : playerMargin)
                    + ((areaBottomVisible && editMode != 'settings') ? AreaBottomDetails.height() : playerMargin)
                    - editBorder
                    + 'px'
            });

            AreaBottomDetails.css({
                marginTop: ''
            });

            AreaBottomContainer.css({
                marginTop: ''
            });

            AreaTopDetails.css({
                marginTop: ''
            });

            AreaTopContainer.css({
                marginTop: ''
            });

        }

        if ( editMode != false && editMode != 'preview' ) {
            slideArea.css({
                minHeight: ''
            });
            PlayerContainer.css({
                marginBottom: (editMode == 'settings' && areaBottomVisible) ? '' : 0
            });
            EditingOptions.find('.ui-tabs').tabs('refresh');
        } else {
            PlayerContainer.css({
                marginBottom: ''
            });
        }

        PlayerProgress.css({
            height:
                Controls.height()
            +   ((editMode == 'codesnippets') ? CodeSnippetTimeline.height() : OverlayTimeline.height())
            +   ((editMode == 'annotations') ? AnnotationTimeline.height() : 0)
        });

        slideArea.children('svg').css({
            width: $(document).width() + 'px',
            height: slideArea.height() + 'px'
        });

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


        var isMobileWidth = ($(window).width() <= 768),
            editBorder = (FrameTrail.getState('editMode') != false) ? (parseInt(domElement.css('borderTopWidth'))*2) : 0;
            mainContainerWidth  = $(FrameTrail.getState('target')).width()
                                    - ((FrameTrail.getState('sidebarOpen') && !FrameTrail.getState('fullscreen')) ? FrameTrail.module('Sidebar').width : 0)
                                    - editBorder,
            mainContainerHeight = $(FrameTrail.getState('target')).height()
                                    - $(FrameTrail.getState('target')).find('.titlebar').height()
                                    - editBorder,
            _video              = $(Video),
            videoFit            = (FrameTrail.module('Database').config.videoFit) ? FrameTrail.module('Database').config.videoFit : 'contain';

        if (animate) {
            VideoContainer.css({
                'transition-duration': '',
                '-moz-transition-duration': '',
                '-webkit-transition-duration': '',
                '-o-transition-duration': ''
            });
            Hypervideo.css({
                'transition-duration': '',
                '-moz-transition-duration': '',
                '-webkit-transition-duration': '',
                '-o-transition-duration': ''
            });
        } else {
            VideoContainer.css({
                'transition-duration': '0ms',
                '-moz-transition-duration': '0ms',
                '-webkit-transition-duration': '0ms',
                '-o-transition-duration': '0ms'
            });
            Hypervideo.css({
                'transition-duration': '0ms',
                '-moz-transition-duration': '0ms',
                '-webkit-transition-duration': '0ms',
                '-o-transition-duration': '0ms'
            });
        }

        var widthAuto = (_video[0].style.width == 'auto');
        var heightAuto = (_video[0].style.height == 'auto');

        var videoContainerWidth;

        if ( ( FrameTrail.getState('editMode') != false && FrameTrail.getState('editMode') != 'preview' && FrameTrail.getState('editMode') != 'settings' ) ) {
            videoContainerWidth = mainContainerWidth - domElement.find('.infoAreaRight').outerWidth();
        } else {
            videoContainerWidth = mainContainerWidth
            - ((FrameTrail.getState('hv_config_areaLeftVisible') && !isMobileWidth) ? AreaLeftContainer.outerWidth() : 0)
            - ((FrameTrail.getState('hv_config_areaRightVisible') && !isMobileWidth) ? AreaRightContainer.outerWidth() : 0);
        }

        VideoContainer.width(videoContainerWidth);

        //if ( (_video.height() < VideoContainer.height() && widthAuto) || (_video.width() < videoContainerWidth && heightAuto) ) {
        if ( (_video.height() < VideoContainer.height()) || (_video.width() < videoContainerWidth) ) {
            _video.css({
                height: FrameTrail.getState('viewSize')[1] + 'px',
                width: FrameTrail.getState('viewSize')[0] + 'px'
            });
        }

        if (videoFit == 'cover') {
            
            var videoWidth = (_video[0].videoWidth) ? _video[0].videoWidth : 1920;
            var videoHeight = (_video[0].videoHeight) ? _video[0].videoHeight : 1080;
            var ratio = Math.max(VideoContainer.width() / videoWidth, VideoContainer.height() /videoHeight);
            var scaledWidth = videoWidth * ratio;
            var scaledHeight = videoHeight * ratio;

            _video.css({
                height: scaledHeight + 'px',
                width: scaledWidth + 'px'
            });

        } else {

            if (_video.height() >= VideoContainer.height()) {
                _video.css({
                    height: VideoContainer.height() + 'px',
                    width: 'auto'
                });
            }

            if (_video.width() >= videoContainerWidth) {
                _video.css({
                    height: 'auto',
                    width: videoContainerWidth + 'px'
                });
            }

        }

        Hypervideo.css({
            marginLeft: - _video.width()/2 + 'px',
            marginTop: - _video.height()/2 + 'px',
            height: _video.height()
        });

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
            $(FrameTrail.getState('target')).find('.fullscreenButton').addClass('active');
            $(FrameTrail.getState('target')).addClass('inFullscreen');
        } else {
            $(FrameTrail.getState('target')).find('.fullscreenButton').removeClass('active');
            $(FrameTrail.getState('target')).removeClass('inFullscreen');
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
            domElement.addClass('active');
            FrameTrail.module('Titlebar').title = FrameTrail.module('HypervideoModel').hypervideoName;
            adjustLayout();
            adjustHypervideo();
        } else if (viewMode != 'resources') {
            domElement.removeClass('active');
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
            case 'settings':
                enterSettingsMode();
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

        if ( editMode && !VideoStartOverlay.hasClass('inactive') ) {
            VideoStartOverlay.addClass('inactive').fadeOut();
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
        domElement.find('.timeline').removeClass('editable').css('flex-basis', '');
        AnnotationTimeline.hide();
        domElement.find('.infoAreaRight').hide();
        HypervideoLayoutContainer.empty().removeClass('active');
    }

    /**
     * I prepare the several UI elements, when one of the editMode is started.
     * @method initEditMode
     */
    function initEditMode() {

        ExpandButton.hide();

        $(VideoContainer).css({
            opacity: 1
        });

        domElement.find('.infoAreaRight').css({
            opacity: 1
        });

        AreaTopContainer.hide();
        AreaTopDetails.hide();
        AreaBottomContainer.hide();
        AreaBottomDetails.hide();
        AreaLeftContainer.hide();
        AreaRightContainer.hide();

        domElement.find('.timeline').not('.codeSnippetTimeline, .annotationTimeline').show();

        EditingOptions.addClass('active');

        domElement.find('.infoAreaRight').show();
        EditPropertiesContainer.show();

        Controls.find('.rightControlPanel').hide();

    }

    /**
     * I restore the UI elements to the view mode with no editing features activated.
     * @method leaveEditMode
     */
    function leaveEditMode() {
        EditingOptions.removeClass('active');
        HypervideoLayoutContainer.empty().removeClass('active');
        EditPropertiesContainer.removeAttr('data-editmode').hide();

        toggleConfig_areaTopVisible(FrameTrail.getState('hv_config_areaTopVisible'));
        toggleConfig_areaBottomVisible(FrameTrail.getState('hv_config_areaBottomVisible'));
        toggleConfig_areaLeftVisible(FrameTrail.getState('hv_config_areaLeftVisible'));
        toggleConfig_areaRightVisible(FrameTrail.getState('hv_config_areaRightVisible'));

        toggleConfig_overlaysVisible(FrameTrail.getState('hv_config_overlaysVisible'));

        toggleConfig_slidingMode(FrameTrail.getState('hv_config_slidingMode'));

        changeSlidePosition(FrameTrail.getState('slidePosition'));

        Controls.find('.rightControlPanel').show();

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
     * I am called when the app enters the editMode "settings"
     * @method enterSettingsMode
     */
    function enterSettingsMode() {

        AreaTopDetails.hide();
        AreaBottomDetails.hide();
        
        FrameTrail.module('ViewLayout').initLayoutManager();
        HypervideoLayoutContainer.addClass('active');

    }

    /**
     * I am called when the app enters the editMode "overlays"
     * @method enterOverlayMode
     */
    function enterOverlayMode() {
        initEditMode();
        OverlayTimeline.addClass('editable');
        toggleConfig_overlaysVisible(true);

        EditPropertiesContainer
            .html('<span class="icon-object-ungroup"></span><div class="message active">'+ labels['MessageHintDragOverlays'] +'</div>')
            .attr('data-editmode', 'overlays');
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
        CodeSnippetTimeline.addClass('editable');

        EditPropertiesContainer
            .html('<span class="icon-code"></span><div class="message active">'+ labels['MessageHintDragCodeSnippets'] +'</div>')
            .attr('data-editmode', 'codesnippets');
    }

    /**
     * I am called when the app enters the editMode "annotations"
     * @method enterAnnotationMode
     */
    function enterAnnotationMode() {
        initEditMode();
        AnnotationTimeline.show().addClass('editable');

        EditPropertiesContainer
            .html('<span class="icon-annotations"></span><div class="message active">'+ labels['MessageHintDragAnnotations'] +'</div>')
            .attr('data-editmode', 'annotations');
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
            domElement.find('.areaTopContainer, .areaTopDetails').show();
        } else {
            domElement.find('.areaTopContainer, .areaTopDetails').hide();
        }
        if ( FrameTrail.getState('slidePosition') != 'middle' ) {
            FrameTrail.changeState('slidePosition', 'middle');
        }
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
            domElement.find('.areaBottomContainer, .areaBottomDetails').show();
        } else {
            domElement.find('.areaBottomContainer, .areaBottomDetails').hide();
        }
        if ( FrameTrail.getState('slidePosition') != 'middle' ) {
            FrameTrail.changeState('slidePosition', 'middle');
        }
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
            AreaLeftContainer.show();
        } else {
            AreaLeftContainer.hide();
        }
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
            AreaRightContainer.show();
        } else {
            AreaRightContainer.hide();
        }
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
            OverlayContainer.show();
        } else {
            OverlayContainer.hide();
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
        if (newState == true && Controls.find('.captionsButton').find('.captionSelect[data-lang="'+ FrameTrail.module('HypervideoModel').selectedLang +'"]').length > 0 ) {
            Controls.find('.captionsButton').addClass('active');
            Controls.find('.captionsButton').find('.captionSelect').removeClass('active');
            Controls.find('.captionsButton').find('.captionSelect[data-lang="'+ FrameTrail.module('HypervideoModel').selectedLang +'"]').addClass('active');
            CaptionContainer.show();
        } else {
            Controls.find('.captionsButton').removeClass('active');
            Controls.find('.captionsButton').find('.captionSelect').removeClass('active');
            Controls.find('.captionsButton').find('.captionSelect.none').addClass('active');
            CaptionContainer.hide();
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
        adjustLayout();
        adjustHypervideo();
        window.setTimeout(function() {
            adjustLayout();
            adjustHypervideo();
        }, 300);

        if ( FrameTrail.getState('editMode') && FrameTrail.getState('editMode') != 'preview' ) return;

        if ( newState != 'middle' ) {
            ExpandButton.show();
        } else {
            ExpandButton.hide();
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

                $(VideoContainer).animate({
                    opacity: 0.2
                }, 500);

                AreaLeftContainer.animate({
                    opacity: 0.2
                }, 500);

                AreaRightContainer.animate({
                    opacity: 0.2
                }, 500);

                wasPlaying = FrameTrail.module('HypervideoController').isPlaying;

                window.setTimeout(function() {
                    FrameTrail.module('HypervideoController').pause();
                }, 500);

            } else if ( wasPlaying ) {

                $(VideoContainer).animate({
                    opacity: 1
                }, 500);

                AreaLeftContainer.animate({
                    opacity: 1
                }, 500);

                AreaRightContainer.animate({
                    opacity: 1
                }, 500);

                window.setTimeout(function() {
                    FrameTrail.module('HypervideoController').play();
                }, 500);

            } else {
                $(VideoContainer).animate({
                    opacity: 1
                }, 500);

                AreaLeftContainer.animate({
                    opacity: 1
                }, 500);

                AreaRightContainer.animate({
                    opacity: 1
                }, 500);
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
     * Toggles the visibility of a vertical grid based on the positions of all timeline items
     * in each category (Overlays, Annotations). This grid is used to allow snapping
     * items to positions of other timeline items.
     *
     * @method toggleGrid
     * @param {Boolean} visible
     */
    function toggleGrid(visible) {

        if ( !FrameTrail.getState('editMode') || FrameTrail.getState('editMode') == 'preview' ) {
            return;
        }

        var timelineItems = $(FrameTrail.getState('target')).find('.timelineElement').not('.ui-draggable'),
            draggableElements = $(FrameTrail.getState('target')).find('.timelineElement.ui-draggableable');
            GridContainer = $('<div class="gridContainer" style="position: absolute; top: 0; left: 0; width: 100%; height: 100%; z-index: 3"></div>');


        if ( visible ) {

            for (var i = 0; i < timelineItems.length; i++) { // vertical grid lines

                var position = $(timelineItems[i]).position();

                $('<div class="gridline"></div>').css({
                    'position': 'absolute',
                    'top': 0,
                    'left': position.left,
                    'width': 1,
                    'height': 100 + '%',
                    'background-color': '#ff9900'
                }).appendTo(GridContainer);

                $('<div class="gridline"></div>').css({
                    'position': 'absolute',
                    'top': 0,
                    'left': position.left + $(timelineItems[i]).width(),
                    'width': 1,
                    'height': 100 + '%',
                    'background-color': '#ff9900'
                }).appendTo(GridContainer);

            }

            GridContainer.appendTo(PlayerProgress);

        } else {

            PlayerProgress.find('.gridContainer').remove();

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

            WorkingIndicator.show();

        } else {

            WorkingIndicator.hide();

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
        collection.each(function() {
            elOffset = $(this).position();

            if (
            (x >= elOffset.left)  && (x <= elOffset.right) &&
            (y >= elOffset.top)   && (y <= elOffset.bottom)
            ) {
                el = $(this);
                return false;
            }

            var offsets = [[elOffset.left, elOffset.top], [elOffset.right, elOffset.top], [elOffset.left, elOffset.bottom], [elOffset.right, elOffset.bottom]];
            for (off in offsets) {
                dx = offsets[off][0] - x;
                dy = offsets[off][1] - y;
                distance = Math.sqrt((dx*dx) + (dy*dy));
                if (minDistance === undefined || distance < minDistance) {
                    minDistance = distance;
                    el = $(this);
                }
            }
        });
        return el;
    };

    /**
     *  Toggle (Enter / Exit) native Fullscreen State
     *
     * @method toggleNativeFullscreenState
     * @param {Object} evt
     * @param {String} forceState
     */
    function toggleNativeFullscreenState(evt, forceState) {
        
        var element = $(FrameTrail.getState('target'))[0];
        
        if (element.requestFullscreen) {
            if ((!forceState && !document.fullscreen) || (forceState && forceState == 'open')) {
                element.requestFullscreen();
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

        var element = $(FrameTrail.getState('target')).find('.mainContainer')[0];

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
            $(window).resize();
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
            if (activeState) {
                $('body').removeClass('userinactive');
            } else {
                $('body').addClass('userinactive');
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
            PlayerContainer.addClass('livestream');
        } else {
            PlayerContainer.removeClass('livestream');
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
            xKey:            toggleGrid,
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

        slidePositionUp:         slidePositionUp,
        slidePositionDown:       slidePositionDown,
        closestToOffset:         closestToOffset,

        /**
         * I display a (formated time) string in an area of the progress bar.
         * @attribute currentTime
         * @type String
         */
        set currentTime(aString) { return CurrentTime.text(aString)   },
        /**
         * I display a (formated time) string in an area of the progress bar.
         * @attribute duration
         * @type String
         */
        set duration(aString)    { return TotalDuration.text(aString) },

        /**
         * I display a (formated time) string in an area of the progress bar.
         * @attribute currentTimeFull
         * @type String
         */
        set currentTimeFull(aString) { return CurrentTimeFull.text(aString)   },
        /**
         * I display a (formated time) string in an area of the progress bar.
         * @attribute durationFull
         * @type String
         */
        set durationFull(aString)    { return TotalDurationFull.text(aString) },

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
         * I contain the AreaLeftDetails element.
         * @attribute AreaLeftDetails
         * @type HTMLElement
         */
        get AreaLeftDetails() { return AreaLeftDetails    },
        /**
         * I contain the AreaLeftContainer element.
         * @attribute AreaLeftContainer
         * @type HTMLElement
         */
        get AreaLeftContainer()     { return AreaLeftContainer     },

        /**
         * I contain the AreaRightDetails element.
         * @attribute AreaRightDetails
         * @type HTMLElement
         */
        get AreaRightDetails() { return AreaRightDetails    },
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
        get CaptionsButton() { return Controls.find('.captionsButton') }

    };

});
