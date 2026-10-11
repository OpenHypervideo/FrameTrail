/**
 * @module Player
 */


/**
 * I am the SubtitlesController. I am responsible for managing all the {{#crossLink "Subtitle"}}subtitles{{/crossLink}}
 * in the current {{#crossLink "HypervideoModel"}}HypervideoModel{{/crossLink}}: the captions on the video, the CC button's
 * list of languages, and, where the player cannot go fullscreen itself (iOS), the video's own text tracks.
 *
 * @class SubtitlesController
 * @static
 */


FrameTrail.defineModule('SubtitlesController', function(FrameTrail){


    var HypervideoModel = FrameTrail.module('HypervideoModel'),
        ViewVideo       = FrameTrail.module('ViewVideo'),
        subtitleFiles   = HypervideoModel.subtitleFiles,
        subtitles       = HypervideoModel.subtitles,
        shownLang       = null,     // the language whose captions are in the DOM
        trackURLs       = [];

    /**
     * I show the subtitles of the current data model: all of them when no language is given, otherwise
     * only what a change of that language needs (its captions only when it is the one shown).
     *
     * @method initController
     * @param {String} [lang] the language that changed
     */
    function initController(lang) {

        if (lang !== undefined && lang !== shownLang && shownLang === HypervideoModel.selectedLang && !!document.fullscreenEnabled) {
            subtitleFiles = HypervideoModel.subtitleFiles;
            renderLanguageList();
            updateButtonVisibility();
            return;
        }

        initSubtitles();

    };


    /**
     * I list the languages in the CC button's menu.
     *
     * @method renderLanguageList
     * @private
     */
    function renderLanguageList() {

        var list     = ViewVideo.CaptionsButton.querySelector('.captionSelectList'),
            database = FrameTrail.module('Database');

        if (!list) { return; }

        list.innerHTML = '';

        (subtitleFiles || []).forEach(function(file) {

            // A listed language whose file could not be loaded has nothing to show.
            if (!database.subtitles[file.srclang]) { return; }

            var captionSelect = document.createElement('div');
            captionSelect.className = 'captionSelect';
            captionSelect.dataset.lang = file.srclang;
            captionSelect.dataset.config = 'hv_config_captionsVisible';
            captionSelect.textContent = database.subtitles[file.srclang].label;
            captionSelect.addEventListener('click', function() {
                HypervideoModel.selectedLang = this.dataset.lang;
                initSubtitles();
                FrameTrail.changeState('hv_config_captionsVisible', true);
            });

            list.appendChild(captionSelect);

        });

    };


    /**
     * I show the CC button while there are subtitles to choose from.
     *
     * @method updateButtonVisibility
     * @private
     */
    function updateButtonVisibility() {

        var hasAny = Object.keys(FrameTrail.module('Database').subtitles).length > 0;

        ViewVideo.CaptionsButton.style.display = hasAny ? '' : 'none';

        // update state
        FrameTrail.changeState('hv_config_captionsVisible', FrameTrail.getState('hv_config_captionsVisible'));

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

        subtitles     = HypervideoModel.subtitles;
        subtitleFiles = HypervideoModel.subtitleFiles;
        shownLang     = HypervideoModel.selectedLang;

        ViewVideo.CaptionContainer.innerHTML = '';

        var list = ViewVideo.CaptionsButton.querySelector('.captionSelectList');
        if (list) { list.innerHTML = ''; }

        if ( !subtitleFiles || !subtitles ) {

            ViewVideo.CaptionsButton.style.display = 'none';
            removeTextTracks();

        } else if (!!document.fullscreenEnabled) {

            renderLanguageList();

            for (var i = 0; i < subtitles.length; i++) {
                subtitles[i].renderInDOM();
            }

            ViewVideo.CaptionsButton.style.display = '';
            updateStatesOfSubtitles(FrameTrail.module('HypervideoController').currentTime);

            // update state
            var captionsVisible = FrameTrail.getState('hv_config_captionsVisible');
            FrameTrail.changeState('hv_config_captionsVisible', captionsVisible);

        } else {

            // The video goes fullscreen natively here, where our captions are not on it: it gets text tracks instead.
            ViewVideo.CaptionContainer.style.setProperty('display', 'none', 'important');

            addTextTracks();

        }

    };


    /**
     * I remove the text tracks I gave the video, and free their texts.
     *
     * @method removeTextTracks
     * @private
     */
    function removeTextTracks() {

        var videoElement = ViewVideo.Video;

        if (videoElement && videoElement.querySelectorAll) {
            videoElement.querySelectorAll('track[data-frametrail-track]').forEach(function(track) { track.remove(); });
        }

        trackURLs.forEach(function(url) { URL.revokeObjectURL(url); });
        trackURLs = [];

    };


    /**
     * I give an HTML5 video a text track per language, made from the loaded WebVTT texts.
     *
     * @method addTextTracks
     * @private
     */
    function addTextTracks() {

        removeTextTracks();

        var videoElement = ViewVideo.Video,
            database     = FrameTrail.module('Database');

        if (!videoElement || videoElement.tagName !== 'VIDEO') { return; }

        subtitleFiles.forEach(function(file, s) {

            var loaded = database.subtitles[file.srclang];

            if (!loaded || typeof loaded.vtt !== 'string') { return; }

            var url   = URL.createObjectURL(new Blob([loaded.vtt], { type: 'text/vtt' })),
                track = document.createElement('track');

            trackURLs.push(url);

            track.kind    = 'captions';
            track.label   = loaded.label;
            track.srclang = file.srclang;
            track.src     = url;
            track.setAttribute('data-frametrail-track', '');

            if (s == 0) {

                track.setAttribute('default', '');

                track.addEventListener('load', function() {
                   this.mode = 'showing';
                   videoElement.textTracks[0].mode = 'showing';
                });
            }

            videoElement.appendChild(track);

        });

    };


    /**
     * I am the central method for coordinating the time-based state of the subtitles.
     * I switch them active or inactive based on the current time.
     *
     * @method updateStatesOfSubtitles
     * @param {Number} currentTime
     */
    function updateStatesOfSubtitles(currentTime) {

        if (!subtitles) { return; }

        for (var i = 0; i < subtitles.length; i++) {

            var subtitle = subtitles[i];

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


    return {

        initController:           initController,
        updateStatesOfSubtitles:  updateStatesOfSubtitles

    };

});
