/**
 * @module Player
 */


/**
 * I am the SubtitlesController. I am responsible for managing all the {{#crossLink "Subtitle"}}subtitles{{/crossLink}}
 * in the current {{#crossLink "HypervideoModel"}}HypervideoModel{{/crossLink}}.
 *
 * @class SubtitlesController
 * @static
 */


FrameTrail.defineModule('SubtitlesController', function(FrameTrail){


    var HypervideoModel   = FrameTrail.module('HypervideoModel'),
        ViewVideo       = FrameTrail.module('ViewVideo'),
        subtitleFiles   = FrameTrail.module('HypervideoModel').subtitleFiles
        subtitles       = FrameTrail.module('HypervideoModel').subtitles

    /**
     * I tell all subtitles in the
     * {{#crossLink "HypervideoModel/subtitles:attribute"}}HypervideoModel/overlays attribute{{/crossLink}}
     * to render themselves into the DOM.
     *
     * @method initController
     */
    function initController() {

        subtitles = HypervideoModel.subtitles;

        initSubtitles();

    };


    /**
     * I first empty all DOM elements, and then ask all
     * subtitles of the current data model, to append new DOM elements.
     * I am also responsible for displaying the captions button & choose menu based on subtitle availability
     *
     * @method initSubtitles
     * @private
     */
    function initSubtitles() {

        var hypervideoID = FrameTrail.module('RouteNavigation').hypervideoID;

        subtitles = FrameTrail.module('HypervideoModel').subtitles;
        subtitleFiles = FrameTrail.module('HypervideoModel').subtitleFiles;

        ViewVideo.CaptionContainer.innerHTML = '';
        var _csl = ViewVideo.CaptionsButton.querySelector('.captionSelectList'); if (_csl) _csl.innerHTML = '';

        if ( !subtitleFiles || !subtitles ) {

            ViewVideo.CaptionsButton.style.display = 'none';

        } else {

            if (!!document.fullscreenEnabled) {
                
                for (var s = 0; s < subtitleFiles.length; s++) {
                    // A listed language whose file could not be loaded has nothing to show.
                    if (!FrameTrail.module('Database').subtitles[subtitleFiles[s].srclang]) { continue; }
                    var captionSelect = document.createElement('div');
                    captionSelect.className = 'captionSelect';
                    captionSelect.dataset.lang = subtitleFiles[s].srclang;
                    captionSelect.dataset.config = 'hv_config_captionsVisible';
                    captionSelect.textContent = FrameTrail.module('Database').subtitles[subtitleFiles[s].srclang].label;
                    captionSelect.addEventListener('click', function(evt) {
                        HypervideoModel.selectedLang = this.dataset.lang;
                        subtitles = HypervideoModel.subtitles;

                        initSubtitles();

                        FrameTrail.changeState('hv_config_captionsVisible', true);

                    });
                    var _csl2 = ViewVideo.CaptionsButton.querySelector('.captionSelectList'); if (_csl2) _csl2.appendChild(captionSelect);
                }


                for (var i = 0; i < subtitles.length; i++) {
                    subtitles[i].renderInDOM();
                }

                ViewVideo.CaptionsButton.style.display = '';
                updateStatesOfSubtitles(FrameTrail.module('HypervideoController').currentTime);

                // update state
                var captionsVisible = FrameTrail.getState('hv_config_captionsVisible');
                FrameTrail.changeState('hv_config_captionsVisible', captionsVisible);

            } else {
                
                ViewVideo.CaptionContainer.style.setProperty('display', 'none', 'important');
                
                var videoElement = FrameTrail.module('ViewVideo').Video;
                
                for (var s=0; s<HypervideoModel.subtitleFiles.length; s++) {
                    var fallbackSrc = HypervideoModel.subtitleFiles[s].src.replace('.vtt', '_iphone.vtt');
                    var vttSource = '_data/hypervideos/' + hypervideoID + '/subtitles/' + fallbackSrc;
                    
                    var track = document.createElement('track');
                    track.kind = 'captions';
                    track.label = HypervideoModel.subtitleFiles[s].srclang;
                    track.srclang = HypervideoModel.subtitleFiles[s].srclang;
                    track.src = vttSource;

                    if (s == 0) {
                        
                        track.setAttribute('default', '');

                        track.addEventListener('load', function() {
                           this.mode = 'showing';
                           videoElement.textTracks[0].mode = 'showing';
                        });
                    }

                    videoElement.appendChild(track);
                }
            }

        }

    };


    /**
     * I am the central method for coordinating the time-based state of the subtitles.
     * I switch them active or inactive based on the current time.
     *
     * @method updateStatesOfSubtitles
     * @param {Number} currentTime
     */
    function updateStatesOfSubtitles(currentTime) {

        for (var idx in subtitles) {

            subtitle = subtitles[idx];

            if (    subtitle.data.startTime <= currentTime
                 && subtitle.data.endTime   >= currentTime) {

                if (!subtitle.activeState) {

                    subtitle.setActive();

                }

            } else {

                if (subtitle.activeState) {

                    subtitle.setInactive();

                }

            }

        }

    };


    /**
     * I react to a change in the global state "editMode".
     *
     * When we enter the editMode "overlays", I prepare all {{#crossLink "Overlay"}}overlays{{/crossLink}}
     * and the editor interface elements.
     *
     * When leaving the editMode "overlays", I restore them.
     *
     * @method toggleEditMode
     * @param {String} editMode
     * @param {String} oldEditMode
     */
    function toggleEditMode(editMode, oldEditMode) {

    };


    return {

        onChange: {

            editMode:       toggleEditMode

        },

        initController:           initController,
        updateStatesOfSubtitles:  updateStatesOfSubtitles,

    };

});
