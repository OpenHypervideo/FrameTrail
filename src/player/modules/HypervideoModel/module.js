/**
 * @module Player
 */


/**
 * I am the HypervideoModel which stores all data which make up the hypervideo.
 *
 * @class HypervideoModel
 * @static
 */

 FrameTrail.defineModule('HypervideoModel', function(FrameTrail){

    var labels = FrameTrail.module('Localization').labels;

    var videoType               = 'native',
        livestream              = false,
        duration                = 0,
        durationFull            = 0,
        sourcePath              = '',
        scrubSprite             = undefined,
        offsetIn                = 0,
        offsetOut               = null,

        hypervideoName          = '',
        description             = '',
        creator                 = '',
        creatorId               = '',
        created                 = 0,
        lastchanged             = 0,
        posterFrame             = null,
        chapters                = [],

        subtitleFiles           = [],
        subtitles               = [],
        selectedLang            = '',

        overlays                = [],

        codeSnippets            = [],
        events                  = {},
        customCSS               = '',

        annotations             = [],

        unsavedOverlays         = false,
        unsavedCodeSnippets     = false,
        unsavedEvents           = false,
        unsavedCustomCSS        = false,
        unsavedAnnotations      = false,
        unsavedChapters         = false,
        unsavedLayout           = false,
        unsavedSubtitles        = false,
        unsavedConfig           = false,

        // Subtitle files to write with the next save: { <lang>: WebVTT text, or null to delete }.
        pendingSubtitles        = {},

        autoSaveTimeout         = null,

        // Two writes must never be in flight at once. Both would carry the
        // baseVersion loaded from disk, so the second to land would lose the
        // server's compare-and-swap and report a conflict — with ourselves.
        saveInFlight            = false,
        pendingSaves            = [],
        // Called once no save is in flight (whenSaveIdle).
        idleWaiters             = [];

    // Long enough that a burst of edits coalesces into one write, short enough
    // that a collaborator's refresh shows recent work.
    var AUTOSAVE_DELAY = 10000;




    /**
     * The data model is initialized after the {{#crossLink "Database"}}Database{{/crossLink}} is ready
     * and before the different views (like {{#crossLink "ViewVideo"}}ViewVideo{{/crossLink}}) are created.
     *
     * I do the following jobs:
     * * I read in the {{#crossLink "Database/hypervideo:attribute"}}hypervideo metadata{{/crossLink}}, and store them in my attributes (like name, description, creator)
     * * I read in the {{#crossLink "Database/hypervideo:attribute"}}configuration of the hypervideo{{/crossLink}} (hypervideo.config) and set the key-value-pairs as global state (FrameTrail.changeState())
     * * I read in the sequence data of the hypervideo, and set the video source file (mp4), or – when their is no resourceId for a video – I set the {{#crossLink "HypervideoModel/duration:attribute"}}duration{{/crossLink}} attribute for a "null video".
     * * I call {{#crossLink "HypervideoModel/initModelOfOverlays:method"}}initModelOfOverlays{{/crossLink}}, {{#crossLink "HypervideoModel/initModelOfCodeSnippets:method"}}initModelOfCodeSnippets{{/crossLink}} and {{#crossLink "HypervideoModel/initModelOfAnnotations:method"}}initModelOfAnnotations{{/crossLink}}.
     * * I return control to the callback.
     *
     * @method initModel
     * @param {Function} callback
     */
    function initModel(callback) {


        var database   = FrameTrail.module('Database'),
            hypervideo = database.hypervideo,
            sequence   = database.sequence,
            videoData  = sequence.clips[0];


        // Read in metadata
        hypervideoName = hypervideo.name;
        description    = hypervideo.description;
        creator        = hypervideo.creator;
        creatorId      = hypervideo.creatorId;
        created        = hypervideo.created;
        lastchanged    = hypervideo.lastchanged;
        posterFrame    = hypervideo.posterFrame || null;
        // Read in config of Hypervideo
        for (var key in hypervideo.config) {

            if (key === 'layoutArea') { continue; }

            FrameTrail.changeState('hv_config_' + key, hypervideo.config[key]);
        }

        // Apply per-hypervideo theme (falls back to global theme)
        var hvTheme = hypervideo.config.theme;
        if (hvTheme) {
            document.querySelector(FrameTrail.getState('target')).setAttribute('data-frametrail-theme', hvTheme);
        } else {
            var globalTheme = database.config.defaultTheme || 'classic';
            document.querySelector(FrameTrail.getState('target')).setAttribute('data-frametrail-theme', globalTheme);
        }

        /**
        * This state (as well as the "livestream" boolean) should 
        * only be changed to true by the HypervideoController 
        * (in case a HLS stream is loaded), and not here!
        **/
        FrameTrail.changeState('livestream', false);

        offsetIn  = (videoData.in) ? parseFloat(videoData.in) : 0;
        offsetOut = (videoData.out) ? parseFloat(videoData.out) : null;

        // Manual scrub preview override (on the video clip):
        //   string  → use this URL as the scrub sprite
        //   false   → disable the scrub preview entirely
        //   unset   → auto-probe {videoBasename}_scrub.jpg (same-origin only)
        scrubSprite = ('scrubSprite' in videoData) ? videoData.scrubSprite : undefined;

        var companion = FrameTrail.getState('companion');

        // Set video source and type or NullVideo
        if (companion) {

            // A paired phone (docs/PAIRING.md) plays no video: its clock follows the
            // desktop's, over the time span the desktop sent (clips[0].duration is
            // often 0, the desktop knows the real one from its video).
            videoType     = 'canvas';
            sourcePath    = '';
            offsetIn      = companion.offsetIn || 0;
            duration      = companion.duration || 0;
            offsetOut     = offsetIn + duration;
            durationFull  = offsetOut;

        } else if (videoData.src && videoData.src.length > 3) {

            sourcePath  = videoData.src;

            var yt_list = [ /youtube\.com\/watch\?v=([^\&\?\/]+)/,
                            /youtube\.com\/embed\/([^\&\?\/]+)/,
                            /youtube\.com\/v\/([^\&\?\/]+)/,
                            /youtu\.be\/([^\&\?\/]+)/ ];
            for (var i in yt_list) {
                var yt_res = yt_list[i].exec(sourcePath);
                if (yt_res !== null) {
                    videoType = 'youtube';
                }
            }
            
            var vimeo_res = /^(http\:\/\/|https\:\/\/|\/\/)?(www\.|player\.)?(vimeo\.com\/)(video\/)?([0-9]+)$/.exec(sourcePath);
            if (vimeo_res !== null) {
                videoType = 'vimeo';
            }

        } else if (!videoData.resourceId) {

            videoType     = 'canvas';
            var offsetOutTmp = (offsetOut) ? offsetOut : videoData.duration;
            duration      = offsetOutTmp - offsetIn;
            durationFull  = videoData.duration;


        } else {

            // TODO: Remove when compatibility no longer needed
            sourcePath  = database.resources[videoData.resourceId].src;

        }

        // Set subtitle files
        subtitleFiles        = hypervideo.subtitles;

        initModelOfOverlays(database);
        initModelOfCodeSnippets(database);
        initModelOfChapters(database);
        initModelOfAnnotations(database);
        initModelOfSubtitles(database);


        // Track presence for this hypervideo. Safe to call on every init: the
        // module no-ops when there is no server or nobody is logged in, and
        // re-targets itself when the hypervideo changes.
        window.clearTimeout(autoSaveTimeout);
        // A save deferred behind an in-flight one belongs to the model we are
        // replacing; flushing it after the swap would report a save of data
        // this init has just discarded.
        pendingSaves = [];
        if (FrameTrail.module('Collaboration')) {
            FrameTrail.module('Collaboration').start('hypervideo', FrameTrail.module('RouteNavigation').hypervideoID);
            // The user's own annotation file of it: written elsewhere (another
            // tab, a script), the editor says so and does not save over it.
            FrameTrail.module('Collaboration').start('annotations', FrameTrail.module('RouteNavigation').hypervideoID, { observe: true });
        }


        callback.call()


    };


    /**
     * I create the {{#crossLink "Overlay"}}Overlay{{/crossLink}} objects from the data in the {{#crossLink "Database"}}Database{{/crossLink}} and store them
     * in my {{#crossLink "HypervideoModel/overlays:attribute"}}overlays{{/crossLink}} attribute.
     *
     * @method initModelOfOverlays
     * @param {Database} database
     * @private
     */
    function initModelOfOverlays(database) {

        for (var idx in database.overlays) {

            var overlayData = database.overlays[idx];
            var resourceTypeName = 'Resource' + overlayData.type.charAt(0).toUpperCase() + overlayData.type.slice(1);

            if (!FrameTrail.type(resourceTypeName)) {
                console.warn('Skipping overlay with unknown resource type: ' + overlayData.type);
                continue;
            }

            overlays.push(
                FrameTrail.newObject('Overlay', overlayData)
            );

        }


    };

    /**
     * I create the {{#crossLink "CodeSnippet"}}CodeSnippet{{/crossLink}} objects from the data in the {{#crossLink "Database"}}Database{{/crossLink}} and store them
     * in my {{#crossLink "HypervideoModel/codeSnippets:attribute"}}codeSnippets{{/crossLink}} attribute.
     *
     * @method initModelOfCodeSnippets
     * @param {Database} database
     * @private
     */
    function initModelOfCodeSnippets(database) {

        for (var idx in database.codeSnippets.timebasedEvents) {

            codeSnippets.push(
                FrameTrail.newObject('CodeSnippet',
                    database.codeSnippets.timebasedEvents[idx]
                )
            );
        }

        events = database.codeSnippets.globalEvents;

        customCSS = database.codeSnippets.customCSS;


    };

    /**
     * I create the {{#crossLink "Chapter"}}Chapter{{/crossLink}} objects from the data in the {{#crossLink "Database"}}Database{{/crossLink}} and store them
     * in my {{#crossLink "HypervideoModel/chapters:attribute"}}chapters{{/crossLink}} attribute.
     *
     * The plain chapter data objects ({ start, title }) remain owned by the Database (database.chapters),
     * which is the live array serialized into hypervideo.json. Each Chapter object wraps one of those
     * data objects by reference, so edits made through the model are reflected on save.
     *
     * @method initModelOfChapters
     * @param {Database} database
     * @private
     */
    function initModelOfChapters(database) {

        chapters = [];

        var chaptersData = database.chapters || [];

        for (var idx in chaptersData) {

            chapters.push(
                FrameTrail.newObject('Chapter', chaptersData[idx])
            );

        }

    };

    /**
     * I create the {{#crossLink "Annotation"}}Annotation{{/crossLink}} objects from the data in the {{#crossLink "Database"}}Database{{/crossLink}} and store them
     * in my {{#crossLink "HypervideoModel/annotations:attribute"}}annotations{{/crossLink}} attribute.
     *
     * Also I select the the main annotation set (from the user who created the hypervideo) as the current one.
     *
     * @method initModelOfAnnotations
     * @param {Database} database
     * @private
     */
    function initModelOfAnnotations(database) {

        // clear previous data
        annotations = [];
        //console.log(database.annotations);
        for (var idx in database.annotations) {

            var annotationData = database.annotations[idx];
            var resourceTypeName = 'Resource' + annotationData.type.charAt(0).toUpperCase() + annotationData.type.slice(1);

            if (!FrameTrail.type(resourceTypeName)) {
                console.warn('Skipping annotation with unknown resource type: ' + annotationData.type);
                continue;
            }

            annotations.push(
                FrameTrail.newObject('Annotation', annotationData)
            );

        }


        // for (var ownerId in database.annotations) {
            // if (database.annotations[ownerId] === FrameTrail.module('Database').hypervideo.mainAnnotation) {
                  // selectedAnnotationSet = mainAnnotationSet = FrameTrail.module('Database').hypervideo.mainAnnotation;
        //  }
        // }


    };


    /**
     * I create the {{#crossLink "Subtitle"}}Subtitle{{/crossLink}} objects from the data in the {{#crossLink "Database"}}Database{{/crossLink}} and store them
     * in my {{#crossLink "HypervideoModel/subtitles:attribute"}}subtitles{{/crossLink}} attribute.
     *
     * Given a language, I rebuild only that one (gone from the Database: removed); otherwise all.
     *
     * @method initModelOfSubtitles
     * @param {Database} database
     * @param {String} [lang]
     */
    function initModelOfSubtitles(database, lang) {

        function build(code) {
            subtitles[code] = (database.subtitles[code].cues || []).map(function(cue) {
                return FrameTrail.newObject('Subtitle', cue);
            });
        }

        if (lang !== undefined) {
            if (database.subtitles[lang]) {
                build(lang);
            } else {
                delete subtitles[lang];
            }
        } else {
            // Called again when subtitles change, so languages that are gone must go here too.
            subtitles = {};
            Object.keys(database.subtitles).forEach(build);
        }

        // Keep the chosen language while it is there.
        if (!subtitles[selectedLang]) {
            selectedLang = subtitles['en'] ? 'en' : (Object.keys(subtitles)[0] || '');
        }


    };



    /**
     * I remove all data of an overlay from the model and from the database.
     *
     * I am called from {{#crossLink "OverlaysController/deleteOverlay:method"}}OverlaysController/deleteOverlay{{/crossLink}}.
     *
     * @method removeOverlay
     * @param {Overlay} overlay
     */
    function removeOverlay(overlay) {

        var idx,
            overlayData = overlay.data;

        idx = overlays.indexOf(overlay);
        overlays.splice(idx, 1);

        idx = FrameTrail.module('Database').overlays.indexOf(overlay.data);
        FrameTrail.module('Database').overlays.splice(idx, 1);

        newUnsavedChange('overlays');

        FrameTrail.triggerEvent('userAction', {
            action: 'OverlayDelete',
            overlay: overlayData
        });

    };

    /**
     * I remove all data of a code snippet from the model and from the database.
     *
     * I am called from {{#crossLink "CodeSnippetsController/deleteCodeSnippet:method"}}CodeSnippetsController/deleteCodeSnippet{{/crossLink}}.
     *
     * @method removeCodeSnippet
     * @param {CodeSnippet} codeSnippet
     */
    function removeCodeSnippet(codeSnippet) {

        var idx,
            codesnippetData = codeSnippet.data;

        idx = codeSnippets.indexOf(codeSnippet);
        codeSnippets.splice(idx, 1);

        idx = FrameTrail.module('Database').codeSnippets.timebasedEvents.indexOf(codeSnippet.data);
        FrameTrail.module('Database').codeSnippets.timebasedEvents.splice(idx, 1);

        newUnsavedChange('codeSnippets');

        FrameTrail.triggerEvent('userAction', {
            action: 'CodeSnippetDelete',
            codesnippet: codesnippetData
        });

    };

    /**
     * I remove a chapter from the model and from the database.
     *
     * I am called from {{#crossLink "ChaptersController/deleteChapter:method"}}ChaptersController/deleteChapter{{/crossLink}}.
     *
     * @method removeChapter
     * @param {Chapter} chapter
     */
    function removeChapter(chapter) {

        var idx,
            database = FrameTrail.module('Database');

        idx = chapters.indexOf(chapter);
        if (idx !== -1) { chapters.splice(idx, 1); }

        idx = database.chapters.indexOf(chapter.data);
        if (idx !== -1) { database.chapters.splice(idx, 1); }

        newUnsavedChange('chapters');

    };


    /**
     * I remove all data of an annotation from the model and from the database.
     *
     * I am called from {{#crossLink "AnnotationsController/deleteAnnotation:method"}}AnnotationsController/deleteAnnotation{{/crossLink}}.
     *
     * @method removeAnnotation
     * @param {Annotation} annotation
     */
    function removeAnnotation(annotation) {

        var database = FrameTrail.module('Database'),
            idx,
            annotationData = annotation.data;

        annotations.splice(annotations.indexOf(annotation), 1);
        database.annotations.splice(database.annotations.indexOf(annotation.data), 1);

        newUnsavedChange('annotations');

        FrameTrail.triggerEvent('userAction', {
            action: 'AnnotationDelete',
            annotation: annotationData
        });

    };


    /**
     * I create a new {{#crossLink "Overlay"}}overlay{{/crossLink}}.
     *
     * I am called from {{#crossLink "OverlaysController/makeTimelineDroppable:method"}}OverlaysController{{/crossLink}}.
     *
     * @method newOverlay
     * @param {} protoData
     * @param {Boolean} skipUndo - If true, skip undo registration (used during undo/redo restore)
     * @return Overlay
     */
    function newOverlay(protoData, skipUndo) {

        var resourceDatabase = FrameTrail.module('Database').resources,
            newOverlayObj,
            newData;

            // Check if protoData already has 'created' timestamp (restoring from undo)
            if (protoData.created) {
                // Restoring from saved data - use as-is
                newData = JSON.parse(JSON.stringify(protoData));
            } else if ( ['text', 'html', 'quiz', 'hotspot', 'cursor', 'counter', 'chart'].indexOf(protoData.type) >= 0 ) {
                // Overlay kinds that do not come from the resource library
                newData = {
                    "name":         protoData.name,
                    "creator":      FrameTrail.getState('username'),
                    "creatorId":    FrameTrail.module('UserManagement').userID,
                    "created":      Date.now(),
                    "type":         protoData.type,
                    "src":          '',
                    "start":        protoData.start,
                    "end":          protoData.end,
                    "attributes":   protoData.attributes,
                    "position": {
                        "top":      protoData.position.top,
                        "left":     protoData.position.left,
                        "width":    protoData.position.width,
                        "height":   protoData.position.height
                    }
                }
                if ( protoData.type == 'quiz' || protoData.type == 'hotspot' ) {
                    // Gallery tiles may pass explicit events; otherwise default to pausing on start.
                    newData.events = protoData.events || {
                        "onStart": "FrameTrail.module('HypervideoController').pause();"
                    };
                } else if ( protoData.events ) {
                    newData.events = protoData.events;
                }
            } else {
                newData = {
                    "name":                 resourceDatabase[protoData.resourceId].name,
                    "creator":              FrameTrail.getState('username'),
                    "creatorId":            FrameTrail.module('UserManagement').userID,
                    "created":              Date.now(),
                    "type":                 resourceDatabase[protoData.resourceId].type,
                    "src":                  resourceDatabase[protoData.resourceId].src,
                    "thumb":                resourceDatabase[protoData.resourceId].thumb,
                    "licenseType":          resourceDatabase[protoData.resourceId].licenseType || null,
                    "licenseAttribution":   resourceDatabase[protoData.resourceId].licenseAttribution || null,
                    "start":                protoData.start,
                    "end":                  protoData.end,
                    "startOffset":          0,
                    "endOffset":            0,
                    "resourceId":           protoData.resourceId,
                    "attributes":           JSON.parse(JSON.stringify(resourceDatabase[protoData.resourceId].attributes || {})),
                    "position": {
                        "top":      protoData.position.top,
                        "left":     protoData.position.left,
                        "width":    30,
                        "height":   30
                    }
                }
            }

            FrameTrail.module('Database').overlays.push(newData);
            newOverlayObj = FrameTrail.newObject('Overlay', newData)
            overlays.push(newOverlayObj);

            newUnsavedChange('overlays');

            var overlayData = newData;
            FrameTrail.triggerEvent('userAction', {
                action: 'OverlayAdd',
                overlay: overlayData
            });

            return newOverlayObj;

    };

    /**
     * I create a new {{#crossLink "CodeSnippet"}}code snippet{{/crossLink}}.
     *
     * I am called from {{#crossLink "CodeSnippetsController/makeTimelineDroppable:method"}}CodeSnippetsController{{/crossLink}}.
     *
     * @method newCodeSnippet
     * @param {} protoData
     * @param {Boolean} skipUndo - If true, skip undo registration (used during undo/redo restore)
     * @return CodeSnippet
     */
    function newCodeSnippet(protoData, skipUndo) {

        var newCodeSnippetObj,
            newData;

            // Check if protoData already has 'created' timestamp (restoring from undo)
            if (protoData.created) {
                // Restoring from saved data - use as-is
                newData = JSON.parse(JSON.stringify(protoData));
            } else {
                newData = {
                                "name":         protoData.name,
                                "creator":      FrameTrail.getState('username'),
                                "creatorId":    FrameTrail.module('UserManagement').userID,
                                "created":      Date.now(),
                                "snippet":      protoData.snippet,
                                "start":        protoData.start,
                                "attributes":   {}
                            };
            }


            FrameTrail.module('Database').codeSnippets.timebasedEvents.push(newData);
            newCodeSnippetObj = FrameTrail.newObject('CodeSnippet', newData)
            codeSnippets.push(newCodeSnippetObj);

            newUnsavedChange('codeSnippets');

            var codesnippetData = newData;

            FrameTrail.triggerEvent('userAction', {
                action: 'CodeSnippetAdd',
                codesnippet: codesnippetData
            });

            return newCodeSnippetObj;

    };


    /**
     * I create a new {{#crossLink "Chapter"}}chapter{{/crossLink}}.
     *
     * I am called from {{#crossLink "ChaptersController/addChapterAtPlayhead:method"}}ChaptersController{{/crossLink}}.
     *
     * The new plain data object ({ start, title }) is pushed into the Database's live chapters
     * array (serialized into hypervideo.json) and wrapped in a Chapter object stored in the model.
     *
     * @method newChapter
     * @param {} protoData - { start, title }
     * @return Chapter
     */
    function newChapter(protoData) {

        // A copy of all of it, so properties another tool added are kept.
        var newData = JSON.parse(JSON.stringify(protoData));

        newData.title = newData.title || '';

        FrameTrail.module('Database').chapters.push(newData);

        var newChapterObj = FrameTrail.newObject('Chapter', newData);
        chapters.push(newChapterObj);

        newUnsavedChange('chapters');

        return newChapterObj;

    };


    /**
     * I create a new {{#crossLink "Annotation"}}annotation{{/crossLink}}.
     *
     * I am called from {{#crossLink "AnnotationsController/makeTimelineDroppable:method"}}AnnotationsController{{/crossLink}}.
     *
     * @method newAnnotation
     * @param {} protoData
     * @param {Boolean} skipUndo - If true, skip undo registration (used during undo/redo restore)
     * @return Annotation
     */
    function newAnnotation(protoData, skipUndo) {

        var newAnnotationObj,
            database         = FrameTrail.module('Database'),
            resourceDatabase = database.resources,
            ownerId          = FrameTrail.module('UserManagement').userID,
            newData;

            // Check if protoData already has 'created' timestamp (restoring from undo)
            if (protoData.created) {
                // Restoring from saved data - use as-is
                newData = JSON.parse(JSON.stringify(protoData));
            } else if ( protoData.type == 'text' || protoData.type == 'html' ) {
                newData = {
                    "name":         protoData.name,
                    "creator":      FrameTrail.getState('username'),
                    "creatorId":    ownerId,
                    "created":      Date.now(),
                    "type":         protoData.type,
                    "src":          '',
                    "start":        protoData.start,
                    "end":          protoData.end,
                    "attributes":   protoData.attributes,
                    "tags":         [],
                    "source": {
                        frametrail: true,
                        url: "_data/hypervideos/"
                    }
                }
            } else if (!protoData.resourceId) {
                newData = {
                    "name":         protoData.name,
                    "creator":      FrameTrail.getState('username'),
                    "creatorId":    ownerId,
                    "created":      Date.now(),
                    "type":         protoData.type,
                    "src":          protoData.src,
                    "thumb":        protoData.thumb,
                    "start":        protoData.start,
                    "end":          protoData.end,
                    "attributes":   protoData.attributes,
                    "tags":         protoData.tags,
                    "source": {
                        frametrail: true,
                        url: "_data/hypervideos/"
                    }
                };
            } else {
                newData = {
                    "name":                 resourceDatabase[protoData.resourceId].name,
                    "creator":              FrameTrail.getState('username'),
                    "creatorId":            ownerId,
                    "created":              Date.now(),
                    "type":                 resourceDatabase[protoData.resourceId].type,
                    "src":                  resourceDatabase[protoData.resourceId].src,
                    "thumb":                resourceDatabase[protoData.resourceId].thumb,
                    "licenseType":          resourceDatabase[protoData.resourceId].licenseType || null,
                    "licenseAttribution":   resourceDatabase[protoData.resourceId].licenseAttribution || null,
                    "start":                protoData.start,
                    "end":                  protoData.end,
                    "resourceId":           protoData.resourceId,
                    "attributes":           JSON.parse(JSON.stringify(resourceDatabase[protoData.resourceId].attributes || {})),
                    "tags":                 [],
                    "source": {
                        frametrail: true,
                        url: "_data/hypervideos/"
                    }
                };
            }


            FrameTrail.module('Database').annotations.push(newData);

            newAnnotationObj = FrameTrail.newObject('Annotation', newData);
            annotations.push(newAnnotationObj);

            newUnsavedChange('annotations');

            var annoData = newData;
            FrameTrail.triggerEvent('userAction', {
                action: 'AnnotationAdd',
                annotation: annoData
            });

            return newAnnotationObj;

    };


    /**
     * I set the subtitles of one language (WebVTT text), or remove them (null), and show the change in the captions. The file is written with the next save.
     *
     * @method setSubtitles
     * @param {String} lang
     * @param {String|null} text
     * @param {Number} [position] where a language that is new goes in the list (undoing a deletion), else at the end
     */
    function setSubtitles(lang, text, position) {

        var database = FrameTrail.module('Database');

        database.setSubtitleData(lang, text, position);

        subtitleFiles = database.hypervideo.subtitles;
        initModelOfSubtitles(database, lang);

        pendingSubtitles[lang] = text;

        if (FrameTrail.module('SubtitlesController')) {
            FrameTrail.module('SubtitlesController').initController(lang);
        }

        // The transcripts editor shows the change when it did not make it (undo, the edit API, a transcriber).
        if (FrameTrail.module('TranscriptsEditor')) {
            FrameTrail.module('TranscriptsEditor').subtitlesChanged(lang);
        }

        // Transcript views show the change, also those showing the first transcript because they name none.
        if (FrameTrail.module('ViewLayout')) {
            FrameTrail.module('ViewLayout').updateTranscriptContentViews();
        }

        newUnsavedChange('subtitles');

    };


    /**
     * I tell which transcript a Transcript view shows: the language it names (transcriptSource) when the hypervideo has
     * subtitles in it, otherwise the first language of the hypervideo's subtitles, or '' when it has none.
     *
     * @method transcriptLanguage
     * @param {String} code - the view's transcriptSource
     * @return {String}
     */
    function transcriptLanguage(code) {

        var files = FrameTrail.module('Database').hypervideo.subtitles,
            langs = Array.isArray(files) ? files.map(function(file) { return file.srclang; }) : [];

        return (code && langs.indexOf(code) !== -1) ? code : (langs[0] || '');

    };


    /**
     * I hand over the subtitle files still to be written ({ <lang>: WebVTT text, or null to delete }) and forget them: for a write of hypervideo.json outside save() — the hypervideo settings dialog — which lists them. When that write fails, it gives them back with returnPendingSubtitles().
     *
     * @method takePendingSubtitles
     * @return {Object}
     */
    function takePendingSubtitles() {

        var writes = pendingSubtitles;

        pendingSubtitles = {};

        return writes;

    };


    /**
     * I take back subtitle files that were not written after all; what was set since wins.
     *
     * @method returnPendingSubtitles
     * @param {Object} writes
     */
    function returnPendingSubtitles(writes) {

        pendingSubtitles = Object.assign(writes || {}, pendingSubtitles);

    };


    /**
     * I replace the hypervideo's settings (its config, without layoutArea, which belongs to the layout) and apply them. They are written with the next save.
     *
     * @method setConfig
     * @param {Object} newConfig
     */
    function setConfig(newConfig) {

        var database = FrameTrail.module('Database'),
            config   = database.hypervideo.config,
            keys     = Object.keys(config).concat(Object.keys(newConfig).filter(function(key) { return !config.hasOwnProperty(key); }));

        // The same object stays: the settings dialog and the save read it.
        keys.forEach(function(key) {

            if (key === 'layoutArea') { return; }

            if (newConfig.hasOwnProperty(key)) {
                config[key] = JSON.parse(JSON.stringify(newConfig[key]));
            } else {
                delete config[key];
            }

            FrameTrail.changeState('hv_config_' + key, config[key]);

        });

        var theme = config.theme || database.config.defaultTheme || 'classic';
        document.querySelector(FrameTrail.getState('target')).setAttribute('data-frametrail-theme', theme);

        newUnsavedChange('config');

    };


    /**
     * When the {{#crossLinks "HypervideoModel/codeSnippets:attribute"}}attribute codeSnippets{{/crossLinks}} is accessed,
     * it needs to return the code snippet objects in an array, which is sorted by the start time. This is what I do.
     *
     * @method getCodeSnippets
     * @return Array of CodeSnippets
     * @private
     */
    function getCodeSnippets() {

        return codeSnippets.sort(function(a, b){

            if(a.data.start > b.data.start) {
                return 1;
            } else if(a.data.start < b.data.start) {
                return -1;
            } else {
                return 0;
            }

        });

    };


    /**
     * Updates the {{#crossLinks "HypervideoModel/events:attribute"}}attribute events{{/crossLinks}}
     * and the respective Database value.
     * I am called from {{#crossLink "CodeSnippetsController/initEditOptions:method"}}CodeSnippetsController{{/crossLink}}.
     *
     * @method updateEvents
     * @return Object of Events
     * @private
     */
    function updateEvents(eventObject) {

        var database = FrameTrail.module('Database');

        database.codeSnippets.globalEvents = eventObject;
        events = eventObject;

        newUnsavedChange('events');

        return events;

    };


    /**
     * Updates the {{#crossLinks "HypervideoModel/customCSS:attribute"}}attribute customCSS{{/crossLinks}}
     * and the respective Database value.
     * I am called from {{#crossLink "CodeSnippetsController/initEditOptions:method"}}CodeSnippetsController{{/crossLink}}.
     *
     * @method updateCustomCSS
     * @return String
     * @private
     */
    function updateCustomCSS(cssString) {

        var database = FrameTrail.module('Database');

        database.codeSnippets.customCSS = cssString;
        customCSS = cssString;

        newUnsavedChange('customCSS');

        return cssString;

    };



    // /**
    //  * Needed for the {{#crossLinks "HypervideoModel/annotationSets:attribute"}}annotationSets attribute{{/crossLinks}}.
    //  * This attribute' purpose is to tell, what users have an annotationfile for the current hypervideo.
    //  *
    //  * I return an array of maps in the format
    //  *
    //  *     [ { id: ownerid, name: ownerName }, ... ]
    //  *
    //  *
    //  * @method getAnnotationSets
    //  * @return Array of { id: ownerId, name: ownerName}
    //  * @private
    //  */
    // function getAnnotationSets() {
    //
    //  var database = FrameTrail.module('Database'),
    //      ids = [],
    //      ownerName,
    //      ownerColor,
    //      hypervideoIndexItem,
    //      annotationfileId;
    //
    //  for (var ownerId in annotationSets) {
    //
    //      // annotationfileId    = database.annotationfileIDs[ownerId];
    //      hypervideoIndexItem = database.hypervideo.annotationfiles[ownerId];
    //
    //      if (hypervideoIndexItem) {
    //
    //          ownerName  = hypervideoIndexItem.owner;
    //          ownerColor = FrameTrail.module('Database').users[ownerId].color;
    //
    //      } else if (ownerId === FrameTrail.module('UserManagement').userID) {
    //
    //          ownerName  = FrameTrail.getState('username');
    //          ownerColor = FrameTrail.getState('userColor');
    //
    //      } else {
    //
    //          ownerName  = 'unknown';
    //          ownerColor = 'FFFFFF';
    //
    //      }
    //
    //
    //      ids.push({
    //          id:      ownerId,
    //          name:    ownerName,
    //          color:   ownerColor
    //      });
    //
    //  }
    //
    //  return ids;
    //
    // };



    /**
     * When the {{#crossLinks "HypervideoModel/annotations:attribute"}}attribute annotations{{/crossLinks}} is accessed,
     * it needs to return an array of the currently selected annotation set (choosen by assigning the annotation's ownerId to {{#crossLinks "HypervideoModel/annotationSet:attribute"}}annotationSet{{/crossLinks}}).
     * The array needs to be sorted by the start time.
     *
     * @method getAnnotations
     * @return Array of Annotations
     * @private
     */
    function getAnnotations() {

        return annotations.sort(function(a, b){

            if(a.data.start > b.data.start) {
                return 1;
            } else if(a.data.start < b.data.start) {
                return -1;
            } else {
                return 0;
            }

        });

    };



    // /**
    //  * When the {{#crossLinks "HypervideoModel/allAnnotations:attribute"}}attribute allAnnotations{{/crossLinks}} is accessed,
    //  * it needs to return an array of all annotations by all users.
    //  * The array needs to be sorted by the start time.
    //  *
    //  * @method getAllAnnotations
    //  * @return Array of Annotations
    //  * @private
    //  */
    // function getAllAnnotations() {
    //
    //  var userSets = getAnnotationSets(),
    //      allAnnotations = new Array();
    //
    //  for (var i=0; i<userSets.length; i++) {
    //      var userSet = annotationSets[userSets[i].id];
    //      allAnnotations = allAnnotations.concat(userSet);
    //  }
    //
    //  return allAnnotations.sort(function(a, b){
    //
    //      if(a.data.start > b.data.start) {
    //          return 1;
    //      } else if(a.data.start < b.data.start) {
    //          return -1;
    //      } else {
    //          return 0;
    //      }
    //
    //  });
    //
    // };



    // /**
    //  * I am needed by the {{#crossLinks "HypervideoModel/annotationSet:attribute"}}annotationSet attribute{{/crossLinks}}.
    //  *
    //  * My parameter can be set in three ways:
    //  * * when the argument is null, I select the main annotation file (from the hypervideo's _index.json entry)
    //  * * when the special string '#myAnnotationSet' is given as argument, I select the logged-in user's ID
    //  * * an all other cases, I take the literal string as the ID to select.
    //  *
    //  * When my user changes the currently selected annotation sets, I have to assure, that both myself and the
    //  * {{#crossLinks "Database"}}Database{{/crossLinks}} have under the respective attribute name an [Array] present, for
    //  * manipulating annotation objects inside them.
    //  *
    //  * @method selectAnnotationSet
    //  * @param {String or null} anID
    //  * @return String
    //  * @private
    //  */
    // function selectAnnotationSet(anID) {
    //
    //  var database = FrameTrail.module('Database'),
    //      selectID;
    //
    //
    //  if (anID === null) {
    //
    //      return selectedAnnotationSet = mainAnnotationSet;
    //
    //  }
    //
    //
    //  if (anID === '#myAnnotationSet') {
    //
    //      selectID = FrameTrail.module('UserManagement').userID;
    //
    //  } else {
    //
    //      selectID = anID;
    //
    //  }
    //
    //
    //  if (!annotationSets.hasOwnProperty(selectID)) {
    //
    //      annotationSets[selectID] = [];
    //
    //  }
    //
    //  if (!database.annotations.hasOwnProperty(selectID)) {
    //
    //      database.annotations[selectID] = [];
    //
    //  }
    //
    //  return selectedAnnotationSet = selectID;
    //
    // };



    /**
     * When the {{#crossLinks "HypervideoModel/subtitles:attribute"}}attribute subtitles{{/crossLinks}} is accessed,
     * it needs to return an array of the currently selected language subtitles (choosen by assigning the selected language to {{#crossLinks "HypervideoModel/selectedLang:attribute"}}selectedLang{{/crossLinks}}).
     *
     * @method getSubtitles
     * @return Object containing the language label and an Array of Subtitles
     * @private
     */
    function getSubtitles() {

        return subtitles[selectedLang];

    };




    /**
     * I serve the purpose to set markers (both visually and in my data model),
     * in which categories (overlays, annotations, codeSnippets) the user has unsaved changes.
     *
     * @method newUnsavedChange
     * @param {String} category
     */
    function newUnsavedChange(category) {

        if (category === 'overlays') {

            unsavedOverlays = true;

        } else if (category === 'codeSnippets') {

            unsavedCodeSnippets = true;

        } else if (category === 'events') {

            unsavedEvents = true;

        } else if (category === 'customCSS') {

            unsavedCustomCSS = true;

        } else if (category === 'annotations') {

            unsavedAnnotations = true;

        } else if (category === 'chapters') {

            unsavedChapters = true;

        } else if (category === 'layout') {

            unsavedLayout = true;

        } else if (category === 'subtitles') {

            unsavedSubtitles = true;

        } else if (category === 'config') {

            unsavedConfig = true;

        }

        FrameTrail.module('Sidebar').newUnsavedChange(category);

        FrameTrail.changeState('unsavedChanges', true);

        var Collaboration = FrameTrail.module('Collaboration');
        if (Collaboration) {
            // Gates takeover: a live editor with work only in their browser
            // must not be overridden.
            Collaboration.setUnsaved(true);
            scheduleAutoSave();
        }

    }


    /**
     * Auto-save writes the work ten seconds after the last change, in every
     * edit session that can save (canSave()), whoever else is present: so that
     * collaborators see it, and so that a closed tab loses little. It does not
     * write while a script's transaction is open (editBusy), and save() itself
     * does not write the hypervideo once the lock has gone to somebody else
     * (Collaboration.confirmLock()).
     *
     * @method scheduleAutoSave
     */
    function scheduleAutoSave() {

        // Unconditional: any edit session that is able to write, saves. This is
        // deliberately independent of the Collaboration module, so it works the
        // same in local-folder mode where there is no server and no presence.
        var StorageManager = FrameTrail.module('StorageManager');
        if (!StorageManager || !StorageManager.canSave()) return;
        if (!FrameTrail.getState('editMode')) return;

        window.clearTimeout(autoSaveTimeout);
        autoSaveTimeout = window.setTimeout(function() {
            // Re-check rather than trusting the state at schedule time: a
            // session can expire during the debounce, and save() would then
            // raise a login box out of a background timer. When we skip, the
            // changes stay dirty and leaveEditMode()'s prompt is the backstop.
            if (!FrameTrail.getState('unsavedChanges')) return;
            if (!FrameTrail.getState('editMode')) return;
            if (!FrameTrail.module('StorageManager').canSave()) return;
            // A script is still changing the hypervideo: its half is not written; try again after it.
            if (FrameTrail.getState('editBusy')) {
                scheduleAutoSave();
                return;
            }

            // silent: a background save must never raise a modal.
            save(null, null, true);
        }, AUTOSAVE_DELAY);

    }


    /**
     * Hand the write lane back once a save has returned.
     *
     * A user-initiated save that arrived while that one was running was
     * deferred rather than dropped, because it owes the user feedback — so it
     * starts here. By then the unsaved-flags are usually already clean, in
     * which case it completes immediately and just reports success, which is
     * exactly what somebody who pressed Save expects to see.
     *
     * After a failed save the deferred ones are discarded instead: they would
     * run into the same error and stack a second dialog on top of the first.
     *
     * @method releaseSave
     * @param {Boolean} runDeferred
     */
    function releaseSave(runDeferred) {

        saveInFlight = false;

        var deferred = pendingSaves;
        pendingSaves = [];

        // Whoever waited for the write lane (whenSaveIdle) has it now, unless a
        // deferred save takes it first — then they wait for that one too.
        if (!runDeferred || !deferred.length) {
            var waiting = idleWaiters;
            idleWaiters = [];
            waiting.forEach(function(waiter) { waiter(); });
        }

        if (!deferred.length) return;

        // Not run: whoever waits for them hears that nothing was saved.
        if (!runDeferred) {
            for (var j = 0; j < deferred.length; j++) {
                if (deferred[j].callbackCancel) deferred[j].callbackCancel.call();
            }
            return;
        }

        save(
            function() {
                for (var i = 0; i < deferred.length; i++) {
                    if (deferred[i].callback) deferred[i].callback.call();
                }
            },
            function() {
                for (var i = 0; i < deferred.length; i++) {
                    if (deferred[i].callbackCancel) deferred[i].callbackCancel.call();
                }
            },
            false,
            { deferred: true }
        );

    }


    /**
     * I call back once no save is in flight: a write of the same hypervideo
     * past the save (the settings dialog) would otherwise compare with the
     * version before it and meet a conflict with the editor's own save.
     *
     * @method whenSaveIdle
     * @param {Function} callback
     */
    function whenSaveIdle(callback) {
        if (!saveInFlight) {
            callback();
            return;
        }
        idleWaiters.push(callback);
    }


    /**
     * The hypervideo itself was written past me, with the editor's state as it
     * is now (the settings dialog writes the open hypervideo whole): what is
     * unsaved still is the annotations, and the written version is the one the
     * next save compares with (the dialog has set it on the entry).
     *
     * @method hypervideoPartSaved
     * @param {Number|String} [version] the server's version of the written file
     */
    function hypervideoPartSaved(version) {

        window.clearTimeout(autoSaveTimeout);

        unsavedOverlays     = false;
        unsavedCodeSnippets = false;
        unsavedEvents       = false;
        unsavedCustomCSS    = false;
        unsavedChapters     = false;
        unsavedLayout       = false;
        unsavedSubtitles    = false;
        unsavedConfig       = false;

        var Collaboration = FrameTrail.module('Collaboration');
        if (Collaboration) {
            Collaboration.acknowledgeVersion(version || null);
            Collaboration.setUnsaved(unsavedAnnotations);
        }

        FrameTrail.changeState('unsavedChanges', unsavedAnnotations || Object.keys(pendingSubtitles).length > 0);

        if (FrameTrail.getState('unsavedChanges')) {
            scheduleAutoSave();
        }

    }


    /**
     * Whether a save can write anything here. A server session that has ended
     * still can, once the user signs in again (save() asks for that); download
     * and static mode, and a guest on a server, never can — their changes
     * leave through Export.
     *
     * @method canPersist
     * @return {Boolean}
     * @private
     */
    function canPersist() {
        return FrameTrail.module('StorageManager').saveTarget() === 'save'
            || (FrameTrail.getState('storageMode') === 'server' && !FrameTrail.module('UserManagement').isGuestMode());
    }


    /**
     * I am the central function for saving changes back to the server.
     *
     * I save only, what is necessary (overlays, annotations, codeSnippets).
     *
     * When all saving requests to the server have completed, I check all their responses.
     * If there where any errors I display them and abort. Otherwise I reset the
     * "unsavedChanges"-markers back to false and the
     * global state (FrameTrail.changeState('unsavedChanges', false)) and call the callback.
     *
     * Note: The second parameter is optional and should not be needed because the user
     * should already be logged in at this point (cancelCallback means, the user canceled the login).
     *
     * callbackCancel is also called when nothing was saved: the login was
     * cancelled, the save failed, or there is nowhere to save to.
     *
     * @method save
     * @param {Function} callback
     * @param {Function} callbackCancel
     * @param {Boolean} [silent] the autosave: no messages, no dialogs
     * @param {Object} [options] { deferred: true } for a save that waited behind another one
     */
    function save(callback, callbackCancel, silent, options) {

        var deferredRun = !!(options && options.deferred);

        // Nothing of an unfinished script edit is written: its transaction is
        // still open (state editBusy). The autosave comes back after it.
        if (FrameTrail.getState('editBusy')) {
            if (silent) {
                scheduleAutoSave();
            } else {
                FrameTrail.module('InterfaceModal').showErrorMessage(labels['MessageEditBusy']);
                FrameTrail.module('InterfaceModal').hideMessage(3000);
            }
            if (callbackCancel) callbackCancel.call();
            return;
        }

        // Where nothing can be written, nothing is reported saved: the changes
        // leave through Export (download and static mode, a guest on a server).
        if (!canPersist()) {
            if (!silent && FrameTrail.module('ExportDialog')) {
                FrameTrail.module('ExportDialog').open();
            }
            if (callbackCancel) callbackCancel.call();
            return;
        }

        // A cue being written in the transcripts editor belongs to an explicit save (not to the automatic one, mid-word).
        if (!silent && FrameTrail.module('TranscriptsEditor')) {
            FrameTrail.module('TranscriptsEditor').flush();
        }

        // A save must never be trailed by the auto-save timer firing into the
        // middle of it. The debounce is armed from the last edit, so ~10s later
        // is precisely when somebody reaches for the Save button.
        window.clearTimeout(autoSaveTimeout);

        if (saveInFlight) {

            if (silent) {
                // An automatic save has nothing to add to a write that is
                // already running. Re-arm the debounce instead, so edits made
                // while it was in flight are still picked up afterwards.
                scheduleAutoSave();
                return;
            }

            // A user-initiated save owes the user an answer, so it is deferred
            // rather than dropped, and runs once the current write returns.
            pendingSaves.push({ callback: callback, callbackCancel: callbackCancel });
            return;

        }

        saveInFlight = true;

        var saveRequests     = [],
            callbackReturns  = [],
            nothingWritten   = false,
            // The hypervideo was not written: the lock went to somebody else.
            lockLost         = false,
            // Each result says which part it is: 'hypervideo' (hypervideo.json
            // with its subtitles) or 'annotations' (the user's annotation file).
            databaseCallback = function(part) {
                return function(result) {
                    result.part = part;
                    callbackReturns.push(result);
                    if(callbackReturns.length === saveRequests.length){
                        saveFinished();
                    }
                };
            };


        // `silent` is also how this save knows nobody asked for it: the only
        // silent save is the one the autosave timer schedules. That matters
        // here more than it does below — a background call may repair a lapsed
        // session in a frame, but it must never answer a timer by navigating
        // the page away from unsaved work, or by raising a dialog over it.
        // When it cannot proceed the changes simply stay dirty, and
        // leaveEditMode()'s prompt is the backstop, exactly as scheduleAutoSave
        // already assumes.
        FrameTrail.module('UserManagement').ensureAuthenticated(

            function(){

                if (!silent) {
                    FrameTrail.module('InterfaceModal').showStatusMessage(labels['MessageStateSaving']);
                }

                var hypervideoDirty = !!(unsavedOverlays || unsavedCodeSnippets
                    || unsavedEvents || unsavedCustomCSS || unsavedChapters || unsavedLayout
                    || unsavedSubtitles || unsavedConfig || Object.keys(pendingSubtitles).length),
                    Collaboration   = FrameTrail.module('Collaboration');

                // Somebody may have taken over the lock since the last poll: the
                // hypervideo is written only by the page that still holds it. The
                // annotations are not under the lock.
                var confirmLock = (hypervideoDirty && Collaboration && Collaboration.confirmLock)
                                ? Collaboration.confirmLock
                                : function(done) { done(true); };

                confirmLock(function(mayWriteHypervideo) {

                    if (hypervideoDirty && !mayWriteHypervideo) {
                        lockLost = true;
                    }

                    if (hypervideoDirty && mayWriteHypervideo) {
                        // Subtitles set from now on belong to the next save.
                        var subtitleWrites = pendingSubtitles;
                        pendingSubtitles = {};
                        saveRequests.push(function(){
                            FrameTrail.module('Database').saveHypervideo(function(result) {
                                if (result.failed) {
                                    // Not written: keep them for the next save, under anything set since.
                                    pendingSubtitles = Object.assign(subtitleWrites, pendingSubtitles);
                                }
                                databaseCallback('hypervideo')(result);
                            }, null, { subtitles: subtitleWrites });
                        });
                    }

                    if (unsavedAnnotations) {
                        saveRequests.push(function(){
                            FrameTrail.module('Database').saveAnnotations(databaseCallback('annotations'));
                        });
                    }

                    for (var i in saveRequests) {
                        saveRequests[i].call();
                    }

                    // Nothing unsaved: nothing is written, and nothing is said about
                    // it — unless this save waited behind another one, whose user
                    // pressed Save and is owed the answer.
                    if (saveRequests.length === 0) {
                        nothingWritten = !lockLost;
                        saveFinished();
                    }

                });

            },

            function(){
                releaseSave(false);
                if (callbackCancel) {
                    callbackCancel.call();
                }
            },

            false,

            { background: !!silent }

        );

        function saveFinished() {

            var Collaboration = FrameTrail.module('Collaboration'),
                hypervideoID  = FrameTrail.module('RouteNavigation').hypervideoID;

            // A part that was written is clean, whatever happened to the other
            // one: otherwise the next save writes it again (and a hypervideo
            // saved next to refused annotations would look unsaved).
            callbackReturns.forEach(function(result) {
                if (result.failed) return;
                if (result.part === 'hypervideo') {
                    unsavedOverlays     = false;
                    unsavedCodeSnippets = false;
                    unsavedEvents       = false;
                    unsavedCustomCSS    = false;
                    unsavedChapters     = false;
                    unsavedLayout       = false;
                    unsavedSubtitles    = false;
                    unsavedConfig       = false;
                    // The post-write version, not the one last polled — or we
                    // look stale against our own save and notify ourselves.
                    // Clean again: a waiting collaborator may take over.
                    if (Collaboration) {
                        Collaboration.acknowledgeVersion(result.version || null);
                        Collaboration.setUnsaved(false);
                    }
                } else if (result.part === 'annotations') {
                    unsavedAnnotations = false;
                    if (Collaboration) { Collaboration.acknowledgeVersion(result.version || null, 'annotations', String(hypervideoID)); }
                }
            });

            var failures = callbackReturns.filter(function(result) { return result.failed; });

            if (failures.length) {

                FrameTrail.changeState('unsavedChanges', true);

                // Compare-and-swap rejected the write: someone (or something)
                // else saved between our load and this save. Writing anyway
                // would erase their work, so offer a reload instead of a bare error.
                var conflicts = failures.filter(function(result) { return result.code === 7; });

                if (conflicts.length) {
                    FrameTrail.module('InterfaceModal').hideMessage();
                    if (silent) {
                        // An automatic save must not interrupt with a modal.
                        // Feed the ordinary "changes available" affordance and
                        // let the user deal with it when they choose to.
                        if (Collaboration) {
                            conflicts.forEach(function(result) {
                                if (result.part === 'annotations') {
                                    Collaboration.markStale('annotations', String(hypervideoID));
                                } else {
                                    Collaboration.markStale();
                                }
                            });
                        }
                    } else {
                        // The hypervideo's conflict, if there is one, says what reloading means.
                        var shown = conflicts.filter(function(result) { return result.part === 'hypervideo'; })[0] || conflicts[0];
                        showSaveConflictDialog(shown.conflict, shown.part);
                    }
                    releaseSave(false);
                    if (callbackCancel) callbackCancel.call();
                    return;
                }

                // The hypervideo is gone (deleted elsewhere: code 4): there is
                // nothing to save it into. Said so, and the work stays for Export.
                if (failures.some(function(result) { return result.part === 'hypervideo' && String(result.code) === '4'; })) {
                    if (!silent) {
                        FrameTrail.module('InterfaceModal').showErrorMessage(labels['ErrorHypervideoGone']);
                    }
                    releaseSave(false);
                    if (callbackCancel) callbackCancel.call();
                    return;
                }

                // The folder or project file cannot be written: the browser
                // withdrew the access, or it was moved or deleted. Not a
                // technical error message, but what can be done about it.
                var storageProblem = failures.filter(function(result) {
                    return ['NotAllowedError', 'SecurityError', 'NotFoundError'].indexOf(result.errorName) !== -1;
                })[0];
                if (storageProblem) {
                    releaseSave(false);
                    if (!silent) {
                        FrameTrail.module('InterfaceModal').hideMessage();
                        showStorageProblemDialog(storageProblem.errorName, function() {
                            save(callback, callbackCancel);
                        }, callbackCancel);
                    } else if (callbackCancel) {
                        callbackCancel.call();
                    }
                    return;
                }

                // Refused for want of a session (code 1: signed out meanwhile, or
                // not permitted): the user signs in, and the save is tried once
                // more. A timer does not ask: the session check tells the user.
                if (failures.some(function(result) { return String(result.code) === '1'; })
                    && !(options && options.retriedAfterSignIn)) {
                    releaseSave(false);
                    if (silent) {
                        FrameTrail.module('UserManagement').isLoggedIn(function() {});
                        if (callbackCancel) callbackCancel.call();
                        return;
                    }
                    FrameTrail.module('InterfaceModal').hideMessage();
                    FrameTrail.module('UserManagement').ensureAuthenticated(function() {
                        save(callback, callbackCancel, false, { retriedAfterSignIn: true });
                    }, function() {
                        if (callbackCancel) callbackCancel.call();
                    });
                    return;
                }

                if (!silent) {
                    var detail = [failures[0].error, failures[0].code].filter(function(part) { return part !== undefined && part !== null && part !== ''; }).join(': ');
                    FrameTrail.module('InterfaceModal').showErrorMessage(labels['ErrorSavingData'] + (detail ? ' (' + detail + ')' : ''));
                }
                releaseSave(false);
                if (callbackCancel) callbackCancel.call();
                return;

            }

            // Whatever was written is clean (above); the hypervideo is not, and
            // cannot be saved here any more: its lock went to somebody else.
            if (lockLost) {
                FrameTrail.changeState('unsavedChanges', true);
                if (!silent) {
                    var holder = Collaboration && Collaboration.lockHolder();
                    FrameTrail.module('InterfaceModal').showErrorMessage(labels['MessageCollabLockLost'].replace('%s', (holder && holder.name) ? holder.name : ''));
                }
                releaseSave(false);
                if (callbackCancel) callbackCancel.call();
                return;
            }

            if (!silent && !(nothingWritten && !deferredRun)) {
                FrameTrail.module('InterfaceModal').showSuccessMessage(labels['MessageSaveSuccess']);
                FrameTrail.module('InterfaceModal').hideMessage(2000);
            } else if (!silent) {
                FrameTrail.module('InterfaceModal').hideMessage();
            }

            unsavedOverlays     = false;
            unsavedCodeSnippets = false;
            unsavedEvents       = false;
            unsavedCustomCSS    = false;
            unsavedAnnotations  = false;
            unsavedChapters     = false;
            unsavedLayout       = false;
            unsavedSubtitles    = false;
            unsavedConfig       = false;
            FrameTrail.changeState('unsavedChanges', false);

            if (Collaboration) {
                // Clean again — a waiting collaborator may now take over.
                Collaboration.setUnsaved(false);
            }

            FrameTrail.triggerEvent('userAction', {
                action: 'EditSave'
            });

            releaseSave(true);

            // Subtitles set while this save was running are still to be written.
            if (Object.keys(pendingSubtitles).length) {
                newUnsavedChange('subtitles');
            }

            if (callback) {
                callback.call();
            }

        };



    }


    /**
     * I save the project into a project file and go on editing it there (see
     * StorageManager.saveToFile): "Save to this file" on a page opened from
     * disk.
     *
     * @method saveToFile
     * @return {Promise<Boolean>} whether everything is saved now
     */
    function saveToFile() {

        var hypervideoID = FrameTrail.module('RouteNavigation').hypervideoID;

        return FrameTrail.module('StorageManager').saveToFile().then(function() {
            // The user's annotation file is in the file now, written by this
            // page: the save below must not take it for one that appeared
            // since the hypervideo was loaded.
            return FrameTrail.module('Database').adoptAnnotationIndex(hypervideoID);
        }).then(function() {
            // Everything is in the file already; this clears the unsaved state.
            return new Promise(function(resolve) {
                save(function() { resolve(true); }, function() { resolve(false); });
            });
        }).catch(function(error) {
            if (error && error.name === 'AbortError') { return false; }   // a picker or question cancelled
            FrameTrail.module('InterfaceModal').showErrorMessage(labels['ErrorSavingData'] + ' (' + ((error && error.message) || error) + ')');
            return false;
        });

    }


    /**
     * I reset what is unsaved, without writing anything: the user discarded
     * it. The model still holds the changes until the caller loads the
     * hypervideo again (or another one, or the page).
     *
     * @method discardUnsaved
     */
    function discardUnsaved() {

        window.clearTimeout(autoSaveTimeout);

        unsavedOverlays     = false;
        unsavedCodeSnippets = false;
        unsavedEvents       = false;
        unsavedCustomCSS    = false;
        unsavedAnnotations  = false;
        unsavedChapters     = false;
        unsavedLayout       = false;
        unsavedSubtitles    = false;
        unsavedConfig       = false;
        pendingSubtitles    = {};
        FrameTrail.changeState('unsavedChanges', false);

        if (FrameTrail.module('Collaboration')) {
            // Nothing of ours is pending any more: a waiting collaborator may take over.
            FrameTrail.module('Collaboration').setUnsaved(false);
        }

    }


    /**
     * I ask what becomes of the unsaved changes before something would drop
     * them: leaving edit mode or signing out, opening another hypervideo, a
     * reload of the page. Where they can be saved: Yes / Discard / Cancel
     * ("Save to this file" on a page opened from disk). Where nothing can be
     * saved (download and static mode, a guest on a server, a server session
     * that has ended): Export / Discard / Cancel — Export opens the Export
     * dialog and leaves everything as it is, so nothing is ever reported saved
     * that was not.
     *
     * Without unsaved changes, proceed runs at once. An async transaction of
     * the edit API still open is taken back first, so the question is about
     * the rest.
     *
     * @method confirmUnsaved
     * @param {Object} options
     * @param {Function} options.proceed  called with 'clean', 'saved' or 'discarded'
     * @param {Function} [options.cancel] called when things stay as they are (Cancel, Export, closing the dialog, a save that did not go through)
     */
    function confirmUnsaved(options) {

        var proceed = options.proceed,
            cancel  = options.cancel || function() {};

        if (FrameTrail.module('EditAPI')) {
            FrameTrail.module('EditAPI').stop(true);
        }

        if (!FrameTrail.getState('unsavedChanges')) {
            proceed('clean');
            return;
        }

        var target     = FrameTrail.module('StorageManager').saveTarget(),
            exportOnly = (target === 'export'),
            decided    = false,
            wrapper    = document.createElement('div');

        wrapper.innerHTML = '<div class="confirmSaveChanges">'
                          + '    <div class="message active">' + labels[exportOnly ? 'MessageChangesExportOnly' : 'MessageSaveChanges'] + '</div>'
                          + (exportOnly ? '' : '    <p>' + labels['MessageSaveChangesQuestion'] + '</p>')
                          + '</div>';

        var confirmDialogCtrl = Dialog({
            title:     labels[exportOnly ? 'MessageUnsavedChangesTitle' : 'MessageSaveChangesQuestionShort'],
            content:   wrapper.firstElementChild,
            resizable: false,
            modal:     true,
            close: function() {
                confirmDialogCtrl.destroy();
                if (!decided) cancel();
            },
            buttons: [
                {
                    text: exportOnly ? labels['GenericExport'] : labels[target === 'pageFile' ? 'SaveToThisFile' : 'GenericYes'],
                    click: function() {
                        if (exportOnly) {
                            // Nothing happens to the changes; what was about to drop them waits for another try.
                            confirmDialogCtrl.close();
                            FrameTrail.module('ExportDialog').open();
                            return;
                        }
                        decided = true;
                        confirmDialogCtrl.close();
                        if (target === 'pageFile') {
                            saveToFile().then(function(saved) {
                                if (saved && !FrameTrail.getState('unsavedChanges')) { proceed('saved'); } else { cancel(); }
                            });
                        } else {
                            save(function() { proceed('saved'); }, cancel);
                        }
                    }
                },
                {
                    text: labels['GenericNoDiscard'],
                    click: function() {
                        decided = true;
                        confirmDialogCtrl.close();
                        discardUnsaved();
                        proceed('discarded');
                    }
                },
                {
                    text: labels['GenericCancel'],
                    click: function() {
                        confirmDialogCtrl.close();
                    }
                }
            ]
        });

    }


    /**
     * The global state "editMode" can be set to false, to trigger all modules to leave their edit mode.
     *
     * __However__, this global state should only be altered by me, because I check first if there were any unsaved changes,
     * and offer the user the possibility to save them.
     *
     * @method leaveEditMode
     * @param {Boolean} logoutAfterLeaving
     */
    function leaveEditMode(logoutAfterLeaving) {

        confirmUnsaved({
            proceed: function(outcome) {

                if (FrameTrail.module('RouteNavigation').environment.iframe) {
                    FrameTrail.module('ViewVideo').toggleNativeFullscreenState(false, 'close');
                }

                FrameTrail.changeState('editMode', false);

                FrameTrail.triggerEvent('userAction', {
                    action: 'EditEnd'
                });

                if (logoutAfterLeaving) {
                    FrameTrail.module('UserManagement').logout();
                }

                // Discarded: back to what is stored.
                if (outcome === 'discarded') {
                    window.setTimeout(function() {
                        updateHypervideo(FrameTrail.module('RouteNavigation').hypervideoID, false, true);
                    }, 100);
                }

            }
        });

    }



    /**
     * A save could not write to the folder or project file. Withdrawn access
     * (NotAllowedError, SecurityError) can be given again — it needs a click,
     * which "Allow" is — and the save then runs again; a folder or file moved
     * or deleted (NotFoundError) cannot, and the work leaves through Export.
     *
     * @method showStorageProblemDialog
     * @param {String} errorName
     * @param {Function} retry   saves again once access is given
     * @param {Function} [cancel]
     * @private
     */
    function showStorageProblemDialog(errorName, retry, cancel) {

        var gone    = (errorName === 'NotFoundError'),
            adapter = FrameTrail.module('StorageManager').getAdapter(),
            wrapper = document.createElement('div'),
            buttons = [];

        wrapper.innerHTML = '<div class="confirmSaveChanges"><div class="message active">'
                          + labels[gone ? 'ErrorStorageGone' : 'ErrorStorageAccessLost'] + '</div></div>';

        if (!gone && adapter && adapter.requestAccess) {
            buttons.push({ text: labels['ProjectFileAllow'], click: function() {
                dialogCtrl.close();
                adapter.requestAccess().then(function(granted) {
                    if (granted) {
                        retry();
                    } else {
                        FrameTrail.module('InterfaceModal').showErrorMessage(labels['ErrorStorageAccessLost']);
                        if (cancel) cancel();
                    }
                });
            } });
        }
        buttons.push({ text: labels['GenericExport'], click: function() {
            dialogCtrl.close();
            if (cancel) cancel();
            FrameTrail.module('ExportDialog').open();
        } });
        buttons.push({ text: labels['GenericCancel'], click: function() {
            dialogCtrl.close();
            if (cancel) cancel();
        } });

        var dialogCtrl = Dialog({
            title:     labels['MessageUnsavedChangesTitle'],
            content:   wrapper.firstElementChild,
            resizable: false,
            modal:     true,
            close: function() {
                dialogCtrl.destroy();
            },
            buttons: buttons
        });

    }


    /**
     * The server refused a save because the document changed underneath us.
     * There is no merge to offer — our in-memory copy and the file on disk have
     * diverged wholesale — so the only honest choices are to discard ours and
     * reload, or to keep editing and deal with it later.
     *
     * @method showSaveConflictDialog
     * @param {Object} conflict server-reported state of the file on disk
     * @param {String} [part] 'annotations' when it is the user's annotation file
     */
    function showSaveConflictDialog(conflict, part) {

        // Who changed it: the last writer the server recorded, else (an older server) the creator.
        var by = (conflict && (conflict.lastWriter || conflict.creator)) ? (conflict.lastWriter || conflict.creator) : '',
            // In a local folder or project file it was another program (or tab), and there is no server.
            // The user's annotation file has one writer, the user: elsewhere, in any mode.
            text = (part === 'annotations') ? labels['ErrorSaveConflictAnnotations']
                 : (FrameTrail.getState('storageMode') === 'local') ? labels['ErrorSaveConflictInFolder']
                 : (FrameTrail.getState('storageMode') === 'file') ? labels['ErrorSaveConflictInFile']
                 : labels['ErrorSaveConflict'];

        var _wrapper = document.createElement('div');
        _wrapper.innerHTML = '<div class="saveConflict">'
                           + '    <div class="message error active">'+ text +'</div>'
                           + '    <p>'+ (by ? labels['ErrorSaveConflictBy'].replace('%s', by) : '') +'</p>'
                           + '</div>';

        var conflictDialogCtrl = Dialog({
            title:     labels['ErrorSaveConflictShort'],
            icon:      'icon-attention',
            content:   _wrapper.firstElementChild,
            resizable: false,
            modal:     true,
            close:     function() { conflictDialogCtrl.destroy(); },
            buttons: [
                {
                    text: labels['GenericContinue'],
                    click: function() { conflictDialogCtrl.destroy(); }
                },
                {
                    text: labels['GenericReloadDiscard'],
                    click: function() {
                        conflictDialogCtrl.destroy();
                        refreshFromServer();
                    }
                }
            ]
        });

    }


    /**
     * Reload this hypervideo from the server, discarding local changes.
     *
     * This is the existing hypervideo-switch path pointed at the hypervideo we
     * are already on, so it tears down and rebuilds the player — playback is
     * interrupted by design. It is only ever run on explicit user action.
     *
     * @method refreshFromServer
     */
    function refreshFromServer() {

        var currentID = FrameTrail.module('RouteNavigation').hypervideoID,
            wasEditing = !!FrameTrail.getState('editMode');

        discardUnsaved();

        var Collaboration = FrameTrail.module('Collaboration');
        if (Collaboration) {
            Collaboration.acknowledgeVersion();
            Collaboration.acknowledgeVersion(null, 'annotations', String(currentID));
        }

        updateHypervideo(currentID, wasEditing, true);

    }


    /**
     * I read the annotations of the open hypervideo again, and nothing else:
     * the Refresh of their notice (they were changed elsewhere — another tab,
     * a script). Unsaved changes of the hypervideo itself stay; the user's own
     * unsaved annotations go (Sidebar asks before).
     *
     * @method refreshAnnotations
     * @return {Promise}
     */
    function refreshAnnotations() {

        var Database     = FrameTrail.module('Database'),
            hypervideoID = FrameTrail.module('RouteNavigation').hypervideoID;

        return Database.adoptAnnotationIndex(hypervideoID).then(function() {
            return new Promise(function(resolve, reject) { Database.loadAnnotationData(resolve, reject); });
        }).then(function() {

            unsavedAnnotations = false;
            initModelOfAnnotations(Database);
            if (FrameTrail.module('AnnotationsController')) {
                FrameTrail.module('AnnotationsController').initController();
            }

            var stillUnsaved = !!(unsavedOverlays || unsavedCodeSnippets || unsavedEvents || unsavedCustomCSS
                || unsavedChapters || unsavedLayout || unsavedSubtitles || unsavedConfig || Object.keys(pendingSubtitles).length);

            var Collaboration = FrameTrail.module('Collaboration');
            if (Collaboration) {
                Collaboration.acknowledgeVersion(null, 'annotations', String(hypervideoID));
                Collaboration.setUnsaved(stillUnsaved);
            }
            FrameTrail.changeState('unsavedChanges', stillUnsaved);

        }, function(error) {
            FrameTrail.module('InterfaceModal').showErrorMessage(labels['ErrorSavingData'] + ' (' + ((error && error.message) || error) + ')');
        });

    }


    /**
     * Reset & Update Hypervideo Data during runtime
     *
     * @method updateHypervideo
     * @param {String} newHypervideoID
     * @param {Boolean} restartEditMode
     * @param {Boolean} update
     */
    function updateHypervideo(newHypervideoID, restartEditMode, update) {

        FrameTrail.module('InterfaceModal').showStatusMessage(labels['MessageStateLoading']);

        // What was unsaved goes with this model: the user was asked before
        // (confirmUnsaved), and the model loaded next starts clean — so must
        // the state, or Save would stay marked for changes nobody holds.
        discardUnsaved();

        // A transaction still changing this hypervideo ends with it.
        if (FrameTrail.module('EditAPI')) {
            FrameTrail.module('EditAPI').stop(false);
        }

        // So does a transcriber at work on it.
        if (FrameTrail.module('TranscriptsEditor')) {
            FrameTrail.module('TranscriptsEditor').reset();
        }

        // Clear undo history when switching hypervideos
        FrameTrail.module('UndoManager').clear();

        if ( FrameTrail.module('HypervideoController') ) {
            FrameTrail.module('HypervideoController').pause();
            FrameTrail.module('HypervideoController').clearIntervals();
        }

        // Set a fake timeout to get the highest timeout id
        var highestTimeoutId = setTimeout(";");
        for (var i = 0 ; i < highestTimeoutId ; i++) {
            clearTimeout(i);
        }

        // The session is not the hypervideo's: its heartbeat, and a renewal on
        // its way, are armed again.
        if (FrameTrail.module('UserManagement').rearmTimers) {
            FrameTrail.module('UserManagement').rearmTimers();
        }

        document.querySelector(FrameTrail.getState('target')).querySelectorAll('.viewVideo').forEach(function(el) { el.remove(); });
        FrameTrail.changeState('viewMode', 'video');

        FrameTrail.module('RouteNavigation').hypervideoID = newHypervideoID;
        // Clear hashTime when switching hypervideos to prevent old time from persisting
        // Check if new URL has t= parameter, and if not, clear the internal hashTime
        var hash = window.location.hash.substring(1);
        var hasTimeParam = hash.split('&').some(function(param) {
            return param.split('=')[0] === 't' && param.split('=')[1];
        });
        if (!hasTimeParam && FrameTrail.module('RouteNavigation').clearHashTime) {
            FrameTrail.module('RouteNavigation').clearHashTime();
        }

        FrameTrail.module('Database').updateHypervideoData(function() {

            if (FrameTrail.module('Database').config.alwaysForceLogin) {
                FrameTrail.module('InterfaceModal').hideMessage();
                FrameTrail.module('UserManagement').ensureAuthenticated(function() {
                    reInitHypervideo();
                }, function() {}, true);
            } else {
                reInitHypervideo();
            }

            function reInitHypervideo() {

                //TODO: Implement proper destroy method

                ra = false;

                FrameTrail.initModule('ViewVideo');
                FrameTrail.initModule('HypervideoModel');
                FrameTrail.initModule('HypervideoController');

                FrameTrail.module('HypervideoModel').initModel(function(){


                    FrameTrail.module('ViewLayout').create();
                    FrameTrail.module('ViewOverview').refreshList();
                    FrameTrail.module('ViewVideo').create();
                    var vsOverlay = document.querySelector(FrameTrail.getState('target') + ' .videoStartOverlay');
                if (vsOverlay) { vsOverlay.style.display = 'none'; }

                    FrameTrail.module('HypervideoController').initController(

                        function(){

                            FrameTrail.changeState('viewMode', 'video');

                            if (restartEditMode) {
                                FrameTrail.changeState('editMode', 'preview');
                            }

                            FrameTrail.module('InterfaceModal').hideMessage(600);

                            if (FrameTrail.module('Extensions')) {
                                FrameTrail.module('Extensions').hypervideoChanged(newHypervideoID);
                            }

                            // The switch cleared the pairing's timers too; a paired phone gets the new hypervideo.
                            if (FrameTrail.module('PairingHost')) {
                                FrameTrail.module('PairingHost').hypervideoChanged(newHypervideoID);
                            }

                            window.setTimeout(function() {
                                //FrameTrail.changeState('viewSize', FrameTrail.getState('viewSize'));
                                window.dispatchEvent(new Event('resize'));

                                var hvVideo = document.querySelector(FrameTrail.getState('target') + ' .hypervideo video.video');
                                if (hvVideo) { hvVideo.classList.remove('nocolor', 'dark'); }

                            }, 300);

                        },

                        function(errorMsg){
                            FrameTrail.module('InterfaceModal').showErrorMessage(errorMsg);
                        },
                        update

                    );

                }, function(errorMsg) {
                    FrameTrail.module('InterfaceModal').showErrorMessage(errorMsg);
                });
            }


        }, function(errorMsg) {
            FrameTrail.module('InterfaceModal').showErrorMessage(errorMsg);
        });

    }


    return {

        /**
         * I return the video type (native, canvas, youtube, vimeo, ...).
         * @attribute videoType
         * @type String
         * @readOnly
         */
        get videoType()         { return videoType   },


        /**
         * I contain the video source path.
         * @attribute sourcePath
         * @readOnly
         * @type {}
         */
        get sourcePath()        { return sourcePath     },


        /**
         * I contain the manual scrub-sprite override set on the video clip.
         * A string URL is used as-is; `false`/`null` disables the scrub
         * preview; `undefined` means "auto-probe by naming convention".
         * @attribute scrubSprite
         * @readOnly
         * @type {String|Boolean|null|undefined}
         */
        get scrubSprite()       { return scrubSprite   },

        /**
         * The hypervideo's creator name
         * @type String
         * @attribute creator
         * @readOnly
         */
        get creator()           { return creator         },

        /**
         * The ID of the hypervideo's creator
         * @type String
         * @attribute creatorId
         * @readOnly
         */
        get creatorId()         { return creatorId       },

        /**
         * The hypervideo's creation date
         * @type Number
         * @attribute created
         * @readOnly
         */
        get created()           { return created         },

        /**
         * The hypervideo's date of latest change
         * @type Number
         * @attribute lastchanged
         * @readOnly
         */
        get lastchanged()       { return lastchanged     },

        /**
         * Get or set the Array of subtitle files (if defined)
         * @attribute subtitleFiles
         * @param {Array} files
         */
        get subtitleFiles()         { return subtitleFiles          },
        set subtitleFiles(files)    { return subtitleFiles = files  },

        /**
         * The Array of subtitles (fetched via {{#crossLink "HypervideoModel/getSubtitles:method"}}getSubtitles(){{/crossLinks}}).
         * @attribute subtitles
         * @readOnly
         */
        get subtitles()         { return getSubtitles()       },

        /**
         * Get or set the subtitle language
         * @type String
         * @attribute lang
         * @param {String} lang
         */
        get selectedLang()          { return selectedLang        },
        set selectedLang(lang)      { return selectedLang = lang },

        /**
         * The overlays of the hypervideo
         * @type Array of Overlay
         * @attribute overlays
         * @readOnly
         */
        get overlays()          { return overlays        },

        /**
         * The codeSnippets of the hypervideo (fetched via {{#crossLink "HypervideoModel/getCodeSnippets:method"}}getCodeSnippets(){{/crossLinks}}).
         * @type Array of CodeSnippets
         * @attribute codeSnippets
         * @readOnly
         */
        get codeSnippets()        { return getCodeSnippets() },

        /**
         * Get or set the global event handlers for the hypervideo.
         * @type Object
         * @attribute events
         * @param {Object} eventObject
         */
        get events()              { return events                     },
        set events(eventObject)   { return updateEvents(eventObject)  },

        /**
         * Get or set the global custom CSS code for the hypervideo.
         * @type String
         * @attribute customCSS
         * @param {String} cssString
         */
        get customCSS()           { return customCSS                  },
        set customCSS(cssString)  { return updateCustomCSS(cssString) },

        // /**
        //  * The annotation sets of the hypervideo (fetched via {{#crossLink "HypervideoModel/getAnnotationSets:method"}}getAnnotationSets(){{/crossLinks}}).
        //  * @type Array of { id: String, name: String }
        //  * @attribute annotationSets
        //  * @readOnly
        //  */
        // get annotationSets()    { return getAnnotationSets() },

        /**
         * The currently selected annotations of the hypervideo (fetched via {{#crossLink "HypervideoModel/getAnnotations:method"}}getAnnotations(){{/crossLinks}}).
         * @type Array of Annotation
         * @attribute annotations
         * @readOnly
         */
        get annotations()       { return getAnnotations() },

        // /**
        //  * All annotations in all sets by all users (fetched via {{#crossLink "HypervideoModel/getAllAnnotations:method"}}getAllAnnotations(){{/crossLinks}}).
        //  * @type Array of Annotation
        //  * @attribute allAnnotations
        //  * @readOnly
        //  */
        // get allAnnotations()       { return getAllAnnotations() },
        //
        // /**
        //  * All annotations sets of the hypervideo in a map of userIDs to their respective annotation set.
        //  * @type Object of Array of Annotation
        //  * @attribute annotationAllSets
        //  */
        // get annotationAllSets() { return annotationSets },

        /**
         * Get or set the hypervideo name
         * @type String
         * @attribute hypervideoName
         * @param {String} aString
         */
        get hypervideoName()         { return hypervideoName           },
        set hypervideoName(aString)  { return hypervideoName = aString },

        /**
         * The hypervideo's poster frame (image src shown before playback starts), or null.
         * @attribute posterFrame
         * @type String or null
         */
        get posterFrame()            { return posterFrame              },
        set posterFrame(aString)     { return posterFrame = aString    },

        /**
         * The hypervideo's chapters (array of {{#crossLink "Chapter"}}Chapter{{/crossLink}} objects,
         * each wrapping a { start, title } data object owned by the Database).
         * @attribute chapters
         * @type Array
         */
        get chapters()               { return chapters                 },

        /**
         * Get or set the hypervideo descritption
         * @type String
         * @attribute description
         * @param {String} aString
         */
        get description()         { return description           },
        set description(aString)  { return description = aString },

        // /**
        //  * The currently selected userID, to decide which annotations should be displayed (setting this attribute is done via {{#crossLink "HypervideoModel/selectAnnotationSet:method"}}selectAnnotationSet(){{/crossLinks}}).
        //  * @type Array of Annotation
        //  * @attribute annotationSet
        //  * @param {} anID
        //  */
        // set annotationSet(anID) { return selectAnnotationSet(anID) },
        // get annotationSet()     { return selectedAnnotationSet     },

        /**
         * The hypervideo's duration.
         *
         * This attribute must not be changed after the init process.
         * It is either set to the duration of the "null video" ({{#crossLink "HypervideoModel/initModel:method"}}HypervideoModel/initModel(){{/crossLinks}}) or
         * or after the video source file's meta data has loaded ({{#crossLink "HypervideoController/initController:method"}}HypervideoController/initController(){{/crossLinks}}).
         *
         * @attribute duration
         * @param {} aNumber
         */
        set duration(aNumber)   { return duration = aNumber },
        get duration()          { return duration           },

        /**
         * The hypervideo's full duration (without taking offsets into account).
         *
         * This attribute must not be changed after the init process.
         * It is either set to the duration of the "null video" ({{#crossLink "HypervideoModel/initModel:method"}}HypervideoModel/initModel(){{/crossLinks}}) or
         * or after the video source file's meta data has loaded ({{#crossLink "HypervideoController/initController:method"}}HypervideoController/initController(){{/crossLinks}}).
         *
         * @attribute duration
         * @param {} aNumber
         */
        set durationFull(aNumber)   { return durationFull = aNumber },
        get durationFull()          { return durationFull           },

        /**
         * Get or set the hypervideo time in (clipping)
         * @type Float
         * @attribute offsetIn
         * @param {String} aNumber
         */
        get offsetIn()         { return offsetIn           },
        set offsetIn(aNumber)  { return offsetIn = aNumber },

        /**
         * Get or set the hypervideo time out (clipping)
         * @type Float
         * @attribute offsetOut
         * @param {String} aNumber
         */
        get offsetOut()         { return offsetOut           },
        set offsetOut(aNumber)  { return offsetOut = aNumber },

        /**
         * Is the video a livestream?
         *
         * @attribute livestream
         * @param {} aBoolean
         */
        set livestream(aBoolean)   { return livestream = aBoolean },
        get livestream()          { return livestream             },



        initModel:              initModel,

        removeOverlay:          removeOverlay,
        newOverlay:             newOverlay,

        removeCodeSnippet:      removeCodeSnippet,
        newCodeSnippet:         newCodeSnippet,

        removeChapter:          removeChapter,
        newChapter:             newChapter,

        removeAnnotation:       removeAnnotation,
        newAnnotation:          newAnnotation,

        // Exception: this is exported to be able to update the subtitles on the fly
        initModelOfSubtitles:   initModelOfSubtitles,

        setSubtitles:           setSubtitles,
        transcriptLanguage:     transcriptLanguage,
        takePendingSubtitles:   takePendingSubtitles,
        returnPendingSubtitles: returnPendingSubtitles,
        setConfig:              setConfig,

        newUnsavedChange:       newUnsavedChange,

        save:                   save,
        saveToFile:             saveToFile,
        confirmUnsaved:         confirmUnsaved,
        discardUnsaved:         discardUnsaved,
        whenSaveIdle:           whenSaveIdle,
        hypervideoPartSaved:    hypervideoPartSaved,
        leaveEditMode:          leaveEditMode,
        updateHypervideo:       updateHypervideo,
        refreshFromServer:      refreshFromServer,
        refreshAnnotations:     refreshAnnotations,
        hasUnsavedAnnotations:  function() { return !!unsavedAnnotations; }

    }





});
