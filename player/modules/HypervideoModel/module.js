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

	var videoType           	= 'native',
		livestream 				= false,
		duration                = 0,
		durationFull			= 0,
		sourcePath              = '',
		offsetIn 				= 0,
		offsetOut 				= null,

		hypervideoName          = '',
		description             = '',
		creator                 = '',
		creatorId               = '',
		created                 = 0,
		lastchanged             = 0,
		hidden                  = false,

		subtitleFiles           = [],
		subtitles               = [],
		selectedLang            = '',

		overlays                = [],

		codeSnippets            = [],
		events                  = {},
		customCSS               = '',

		annotations             = [],

		unsavedSettings         = false,
		unsavedOverlays         = false,
		unsavedCodeSnippets     = false,
		unsavedEvents           = false,
		unsavedCustomCSS        = false,
		unsavedAnnotations      = false,
		unsavedLayout           = false,
		unsavedConfig           = false,
		unsavedGlobalCSS        = false;




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
		hidden         = hypervideo.hidden;

		// Read in config of Hypervideo
		for (var key in hypervideo.config) {

			if (key === 'layoutArea') { continue; }

			FrameTrail.changeState('hv_config_' + key, hypervideo.config[key]);
		}

		/**
		* This state (as well as the "livestream" boolean) should 
		* only be changed to true by the HypervideoController 
		* (in case a HLS stream is loaded), and not here!
		**/
		FrameTrail.changeState('livestream', false);

		offsetIn  = (videoData.in) ? parseFloat(videoData.in) : 0;
		offsetOut = (videoData.out) ? parseFloat(videoData.out) : null;

		// Set video source and type or NullVideo
		if (videoData.src && videoData.src.length > 3) {

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

			videoType	  = 'canvas';
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
		initModelOfAnnotations(database);
		initModelOfSubtitles(database);


		// Show warning if user tries to leave the page without having saved changes
		$(window).on('beforeunload', function(e) {
			if ( FrameTrail.getState('unsavedChanges') ) {
				// This message is not actually shown to the user in most cases, but the browser needs a return value
				var message = labels['MessageUnsavedChanges'];
				return message;
			}
		});


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

			overlays.push(
				FrameTrail.newObject('Overlay',
					database.overlays[idx]
				)
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

			annotations.push(
				FrameTrail.newObject('Annotation',
					database.annotations[idx]
				)
			);

		}


		// for (var ownerId in database.annotations) {
			// if (database.annotations[ownerId] === FrameTrail.module('Database').hypervideo.mainAnnotation) {
		          // selectedAnnotationSet = mainAnnotationSet = FrameTrail.module('Database').hypervideo.mainAnnotation;
		// 	}
		// }


	};


	/**
	 * I create the {{#crossLink "Subtitle"}}Subtitle{{/crossLink}} objects from the data in the {{#crossLink "Database"}}Database{{/crossLink}} and store them
	 * in my {{#crossLink "HypervideoModel/subtitles:attribute"}}subtitles{{/crossLink}} attribute.
	 *
	 * @method initModelOfSubtitles
	 * @param {Database} database
	 */
	function initModelOfSubtitles(database) {

		for (var lang in database.subtitles) {

			subtitles[lang] = [];

			for (var idx in database.subtitles[lang].cues) {

				subtitles[lang].push(
					FrameTrail.newObject('Subtitle',
						database.subtitles[lang].cues[idx]
					)
				);


			}
		}

		if (subtitles['en']) {
			selectedLang = 'en';
		} else if ( !$.isEmptyObject(database.subtitles) ) {
			for (first in database.subtitles) break;
				selectedLang = first;
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
	 * @return Overlay
	 */
	function newOverlay(protoData) {

		var resourceDatabase = FrameTrail.module('Database').resources,
			newOverlay,
			newData;

			// TODO: clean code
			if ( protoData.type == 'text' || protoData.type == 'quiz' ) {
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
						"width":    30,
						"height":   30
					},
					"events": {
						"onStart": "FrameTrail.module('HypervideoController').pause();"
					}
				}
			} else {
				newData = {
					"name":         resourceDatabase[protoData.resourceId].name,
					"creator":      FrameTrail.getState('username'),
					"creatorId":    FrameTrail.module('UserManagement').userID,
					"created":      Date.now(),
					"type":         resourceDatabase[protoData.resourceId].type,
					"src":          resourceDatabase[protoData.resourceId].src,
					"thumb":        resourceDatabase[protoData.resourceId].thumb,
					"start":        protoData.start,
					"end":          protoData.end,
					"startOffset":  0,
					"endOffset":    0,
					"resourceId":   protoData.resourceId,
					"attributes":   resourceDatabase[protoData.resourceId].attributes,
					"position": {
						"top":      protoData.position.top,
						"left":     protoData.position.left,
						"width":    30,
						"height":   30
					}
				}
			}

			FrameTrail.module('Database').overlays.push(newData);
			newOverlay = FrameTrail.newObject('Overlay', newData)
			overlays.push(newOverlay);

			newUnsavedChange('overlays');

			var overlayData = newData;
			FrameTrail.triggerEvent('userAction', {
				action: 'OverlayAdd',
				overlay: overlayData
			});

			return newOverlay;

	};

	/**
	 * I create a new {{#crossLink "CodeSnippet"}}code snippet{{/crossLink}}.
	 *
	 * I am called from {{#crossLink "CodeSnippetsController/makeTimelineDroppable:method"}}CodeSnippetsController{{/crossLink}}.
	 *
	 * @method newCodeSnippet
	 * @param {} protoData
	 * @return CodeSnippet
	 */
	function newCodeSnippet(protoData) {

		var newCodeSnippet,

			newData = {
							"name":         protoData.name,
							"creator":      FrameTrail.getState('username'),
							"creatorId":    FrameTrail.module('UserManagement').userID,
							"created":      Date.now(),
							"snippet":      protoData.snippet,
							"start":        protoData.start,
							"attributes":   {}
						};


			FrameTrail.module('Database').codeSnippets.timebasedEvents.push(newData);
			newCodeSnippet = FrameTrail.newObject('CodeSnippet', newData)
			codeSnippets.push(newCodeSnippet);

			newUnsavedChange('codeSnippets');

			var codesnippetData = newData;

			FrameTrail.triggerEvent('userAction', {
				action: 'CodeSnippetAdd',
				codesnippet: codesnippetData
			});

			return newCodeSnippet;

	};


	/**
	 * I create a new {{#crossLink "Annotation"}}annotation{{/crossLink}}.
	 *
	 * I am called from {{#crossLink "AnnotationsController/makeTimelineDroppable:method"}}AnnotationsController{{/crossLink}}.
	 *
	 * @method newAnnotation
	 * @param {} protoData
	 * @return Annotation
	 */
	function newAnnotation(protoData) {

		var newAnnotation,
			database         = FrameTrail.module('Database'),
			resourceDatabase = database.resources,
			ownerId          = FrameTrail.module('UserManagement').userID,
			newData;

			// TODO: clean code
			if ( protoData.type == 'text' ) {
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
					"name":         resourceDatabase[protoData.resourceId].name,
					"creator":      FrameTrail.getState('username'),
					"creatorId":    ownerId,
					"created":      Date.now(),
					"type":         resourceDatabase[protoData.resourceId].type,
					"src":          resourceDatabase[protoData.resourceId].src,
					"thumb":        resourceDatabase[protoData.resourceId].thumb,
					"start":        protoData.start,
					"end":          protoData.end,
					"resourceId":   protoData.resourceId,
					"attributes":   resourceDatabase[protoData.resourceId].attributes,
					"tags":         [],
                    "source": {
                        frametrail: true,
                        url: "_data/hypervideos/"
                    }
				};
			}


			FrameTrail.module('Database').annotations.push(newData);

			newAnnotation = FrameTrail.newObject('Annotation', newData);
			annotations.push(newAnnotation);

			newUnsavedChange('annotations');

			var annoData = newData;
			FrameTrail.triggerEvent('userAction', {
				action: 'AnnotationAdd',
				annotation: annoData
			});

			return newAnnotation;

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
	// 	var database = FrameTrail.module('Database'),
	// 		ids = [],
	// 		ownerName,
	// 		ownerColor,
	// 		hypervideoIndexItem,
	// 		annotationfileId;
    //
	// 	for (var ownerId in annotationSets) {
    //
	// 		// annotationfileId    = database.annotationfileIDs[ownerId];
	// 		hypervideoIndexItem = database.hypervideo.annotationfiles[ownerId];
    //
	// 		if (hypervideoIndexItem) {
    //
	// 			ownerName  = hypervideoIndexItem.owner;
	// 			ownerColor = FrameTrail.module('Database').users[ownerId].color;
    //
	// 		} else if (ownerId === FrameTrail.module('UserManagement').userID) {
    //
	// 			ownerName  = FrameTrail.getState('username');
	// 			ownerColor = FrameTrail.getState('userColor');
    //
	// 		} else {
    //
	// 			ownerName  = 'unknown';
	// 			ownerColor = 'FFFFFF';
    //
	// 		}
    //
    //
	// 		ids.push({
	// 			id:      ownerId,
	// 			name:    ownerName,
	// 			color:   ownerColor
	// 		});
    //
	// 	}
    //
	// 	return ids;
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
	// 	var userSets = getAnnotationSets(),
	// 		allAnnotations = new Array();
    //
	// 	for (var i=0; i<userSets.length; i++) {
	// 		var userSet = annotationSets[userSets[i].id];
	// 		allAnnotations = allAnnotations.concat(userSet);
	// 	}
    //
	// 	return allAnnotations.sort(function(a, b){
    //
	// 		if(a.data.start > b.data.start) {
	// 			return 1;
	// 		} else if(a.data.start < b.data.start) {
	// 			return -1;
	// 		} else {
	// 			return 0;
	// 		}
    //
	// 	});
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
	// 	var database = FrameTrail.module('Database'),
	// 		selectID;
    //
    //
	// 	if (anID === null) {
    //
	// 		return selectedAnnotationSet = mainAnnotationSet;
    //
	// 	}
    //
    //
	// 	if (anID === '#myAnnotationSet') {
    //
	// 		selectID = FrameTrail.module('UserManagement').userID;
    //
	// 	} else {
    //
	// 		selectID = anID;
    //
	// 	}
    //
    //
	// 	if (!annotationSets.hasOwnProperty(selectID)) {
    //
	// 		annotationSets[selectID] = [];
    //
	// 	}
    //
	// 	if (!database.annotations.hasOwnProperty(selectID)) {
    //
	// 		database.annotations[selectID] = [];
    //
	// 	}
    //
	// 	return selectedAnnotationSet = selectID;
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

		if (category === 'settings') {

			unsavedSettings = true;

		} else if (category === 'overlays') {

			unsavedOverlays = true;

		} else if (category === 'codeSnippets') {

			unsavedCodeSnippets = true;

		} else if (category === 'events') {

			unsavedEvents = true;

		} else if (category === 'customCSS') {

			unsavedCustomCSS = true;

		} else if (category === 'annotations') {

			unsavedAnnotations = true;

		} else if (category === 'layout') {

			unsavedLayout = true;

		} else if (category === 'config') {

			unsavedConfig = true;

		} else if (category === 'globalCSS') {

			unsavedGlobalCSS = true;

		}

		FrameTrail.module('Sidebar').newUnsavedChange(category);

		FrameTrail.changeState('unsavedChanges', true);

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
	 * @method save
	 * @param {Function} callback
	 * @param {Function} callbackCancel
	 */
	function save(callback, callbackCancel) {

		var saveRequests     = [],
			callbackReturns  = [],
			databaseCallback = function(result) {
				callbackReturns.push(result);
				if(callbackReturns.length === saveRequests.length){
					saveFinished();
				}
			};


		FrameTrail.module('UserManagement').ensureAuthenticated(

			function(){

				FrameTrail.module('InterfaceModal').showStatusMessage(labels['MessageStateSaving']);

				if ( unsavedSettings ) {

					//TODO: avoid this by adding a subtitles dialog to the settings tab
					$('.editHypervideoForm').submit();

				} else if ( unsavedOverlays || unsavedCodeSnippets
					|| unsavedEvents || unsavedCustomCSS || unsavedLayout) {
					saveRequests.push(function(){
						FrameTrail.module('Database').saveHypervideo(databaseCallback);
					});
				}

				if (unsavedAnnotations) {
					saveRequests.push(function(){
						FrameTrail.module('Database').saveAnnotations(databaseCallback);
					});
				}

				if (unsavedConfig) {
					saveRequests.push(function(){
						FrameTrail.module('Database').saveConfig(databaseCallback);
					});
				}

				if (unsavedGlobalCSS) {
					saveRequests.push(function(){
						FrameTrail.module('Database').saveGlobalCSS(databaseCallback);
					});
				}

				for (var i in saveRequests) {
					saveRequests[i].call();
				}

				// deal with save requests without unsaved data (just satisfying ux)
				if (saveRequests.length === 0) {
					saveFinished();
				}

			},

			function(){
				if (callbackCancel) {
					callbackCancel.call();
				}
			}

		);

		function saveFinished() {

			for (var i=0; i < callbackReturns.length; i++) {

				var result = callbackReturns[i];
				if (result.failed) {
					FrameTrail.module('InterfaceModal').showErrorMessage(labels['ErrorSavingData'] +' ('+ result.error +': '+ result.code +')');
					return;
				}

			}

			FrameTrail.module('InterfaceModal').showSuccessMessage(labels['MessageSaveSuccess']);
			FrameTrail.module('InterfaceModal').hideMessage(2000);

			unsavedSettings     = false;
			unsavedOverlays     = false;
			unsavedCodeSnippets = false;
			unsavedEvents       = false;
			unsavedCustomCSS    = false;
			unsavedAnnotations  = false;
			unsavedLayout       = false;
			unsavedConfig       = false;
			unsavedGlobalCSS    = false;
			FrameTrail.changeState('unsavedChanges', false);

			FrameTrail.triggerEvent('userAction', {
				action: 'EditSave'
			});

			if (callback) {
				callback.call();
			}

		};



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

		if (FrameTrail.getState('unsavedChanges')){

				var confirmDialog = $('<div class="confirmSaveChanges" title="'+ labels['MessageSaveChangesQuestionShort'] +'">'
									+ '    <div class="message active">'+ labels['MessageSaveChanges'] +'</div>'
									+ '    <p>'+ labels['MessageSaveChangesQuestion'] +'</p>'
									+ '</div>');

				confirmDialog.dialog({
					resizable: false,
					modal: true,
					close: function() {
					confirmDialog.remove();
					},
					buttons: [
					  	{
							text: labels['GenericYes'],
							click: function() {

								// TODO: Show saving indicator in dialog

								save(function(){
									
									if (FrameTrail.module('RouteNavigation').environment.iframe) {
							            FrameTrail.module('ViewVideo').toggleNativeFullscreenState(false, 'close');
							        }

									FrameTrail.changeState('editMode', false);

									FrameTrail.triggerEvent('userAction', {
										action: 'EditEnd'
									});

									confirmDialog.dialog('close');

									if (logoutAfterLeaving) {
										FrameTrail.module('UserManagement').logout();
									}

									/*
									window.setTimeout(function() {
										window.location.reload();
									}, 100);

									if (logoutAfterLeaving) {
										FrameTrail.module('UserManagement').logout();
									}
									*/
								});

							}
						},
						{
							text: labels['GenericNoDiscard'],
							click: function() {

								FrameTrail.changeState('unsavedChanges', false);
								confirmDialog.dialog('close');

								if (FrameTrail.module('RouteNavigation').environment.iframe) {
						            FrameTrail.module('ViewVideo').toggleNativeFullscreenState(false, 'close');
						        }

								FrameTrail.triggerEvent('userAction', {
									action: 'EditEnd'
								});

								if (logoutAfterLeaving) {
									FrameTrail.module('UserManagement').logout();
								}

								window.setTimeout(function() {
									//window.location.reload();
									updateHypervideo(FrameTrail.module('RouteNavigation').hypervideoID, false, true);
								}, 100);
							}
						},
						{
							text: labels['GenericCancel'],
							click: function() {
						  		confirmDialog.dialog('close');
							}
						}
					]
				});

		} else {

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

		}

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

		if ( FrameTrail.module('HypervideoController') ) {
			FrameTrail.module('HypervideoController').pause();
			FrameTrail.module('HypervideoController').clearIntervals();
		}

		// Set a fake timeout to get the highest timeout id
		var highestTimeoutId = setTimeout(";");
		for (var i = 0 ; i < highestTimeoutId ; i++) {
			clearTimeout(i);
		}

		$(FrameTrail.getState('target')).find('.viewVideo').remove();
		FrameTrail.changeState('viewMode', 'video');

		FrameTrail.module('RouteNavigation').hypervideoID = newHypervideoID;
		//FrameTrail.module('RouteNavigation').hashTime = undefined;

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
					$(FrameTrail.getState('target')).find('.videoStartOverlay').hide();

					FrameTrail.module('HypervideoController').initController(

						function(){

							FrameTrail.changeState('viewMode', 'video');

							if (restartEditMode) {
								FrameTrail.changeState('editMode', 'preview');
							}

							FrameTrail.module('InterfaceModal').hideMessage(600);

							window.setTimeout(function() {
								//FrameTrail.changeState('viewSize', FrameTrail.getState('viewSize'));
								$(window).resize();

								$(FrameTrail.getState('target')).find('.hypervideo video.video').removeClass('nocolor dark');

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


	/**
	 * YET TO IMPLEMENT
	 *
	 * Data exporting can be achieved in various ways.
	 *
	 * @method exportIt
	 */
	function exportIt() {

		alert('The Export-Feature is currently being implemented');

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
		 * Whether the hypervideo is hidden in overview mode.
		 * @type Boolean
		 * @attribute hidden
		 * @readOnly
		 */
		get hidden()            { return hidden          },


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

		removeAnnotation:       removeAnnotation,
		newAnnotation:          newAnnotation,

		// Exception: this is exported to be able to update the subtitles on the fly
		initModelOfSubtitles:   initModelOfSubtitles,

		newUnsavedChange:       newUnsavedChange,

		save:                   save,
		leaveEditMode:          leaveEditMode,
		updateHypervideo:       updateHypervideo,
		exportIt:               exportIt

	}





});
