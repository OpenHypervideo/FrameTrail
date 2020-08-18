/**
 * @module Player
 */


/**
 * I am the HypervideoController.
 *
 * I am the central controller module of the application. I control the interactions between the UI elements of the hypervideo and its data model.
 *
 * My two most important jobs are:
 *   * I init the video element, all its UI controls, and my sub-controllers (for annotations, overlays, codeSnippets)
 *   * I control the playback und the update handlers to show time-based contents
 *
 * @class HypervideoController
 * @static
 */


FrameTrail.defineModule('HypervideoController', function(FrameTrail){



	var HypervideoModel        = FrameTrail.module('HypervideoModel'),
		ViewVideo 			   = FrameTrail.module('ViewVideo'),

		AnnotationsController  = FrameTrail.initModule('AnnotationsController'),
		OverlaysController     = FrameTrail.initModule('OverlaysController'),
		CodeSnippetsController = FrameTrail.initModule('CodeSnippetsController'),
		SubtitlesController    = FrameTrail.initModule('SubtitlesController'),
        ViewLayout             = FrameTrail.initModule('ViewLayout'),

		InteractionController  = FrameTrail.initModule('InteractionController'),


		isPlaying              = false,
        isStalled              = false,
        stallRequestedBy       = [],
		currentTime 		   = 0,
		previousTime		   = 0,
		muted 				   = false,
		nullVideoStartDate     = 0,

		highPriorityInterval   = 25,
		lowPriorityInterval    = 150,
		nullVideoInterval      = 25,

		highPriorityIntervalID = null,
		lowPriorityIntervalID  = null,
		nullVideoIntervalID    = null,

		highPriorityUpdater    = null,
		lowPriorityUpdater     = null,

		videoElement           = ViewVideo.Video;

	window.player_youtube = {};


	/**
	 * I initialize the Controller.
	 *
	 * I check, wether there are playable video source files, and append the right &lt;source&gt; nodes to the video element.
	 * Otherwise I prepare the "Null Player", meaning a simulated playback machine, which serves as a timer for update functions.
	 *
	 * After the video has sufficiently loaded (or the "Null Player" is ready), I initalize the UI control (play button and progress bar).
	 *
	 * @method initController
	 * @param {Function} callback
	 * @param {Function} failCallback
	 * @param {Boolean} update
	 */
	function initController(callback, failCallback, update) {

		var RouteNavigation = FrameTrail.module('RouteNavigation'),
			hypervideoID    = RouteNavigation.hypervideoID,
			_video		    = $(videoElement);

		HypervideoModel     = FrameTrail.module('HypervideoModel');

		updateDescriptions();

		_video.width(1920).height(1080);

		if (HypervideoModel.videoType == 'native') {

			highPriorityUpdater = highPriorityUpdater_HTML5;
			lowPriorityUpdater  = lowPriorityUpdater_HTML5;

			FrameTrail.changeState('videoWorking', true);

			if (HypervideoModel.sourcePath.indexOf('.m3u8') != -1) {
				if(Hls.isSupported()) {
					var hls = new Hls();
					hls.loadSource(FrameTrail.module('RouteNavigation').getResourceURL(HypervideoModel.sourcePath));
					hls.attachMedia(videoElement);
					/*
					hls.on(Hls.Events.MANIFEST_PARSED,function() {
						//videoElement.play();
					});
					*/
				}
				// hls.js is not supported on platforms that do not have Media Source Extensions (MSE) enabled.
				// When the browser has built-in HLS support (check using `canPlayType`), we can provide an HLS manifest (i.e. .m3u8 URL) directly to the video element throught the `src` property.
				// This is using the built-in support of the plain video element, without using hls.js.
				// Note: it would be more normal to wait on the 'canplay' event below however on Safari (where you are most likely to find built-in HLS support) the video.src URL must be on the user-driven
				// white-list before a 'canplay' event will be emitted; the last video event that can be reliably listened-for when the URL is not on the white-list is 'loadedmetadata'.
				else if (videoElement.canPlayType('application/vnd.apple.mpegurl')) {
					_video.append('<source src="'+ FrameTrail.module('RouteNavigation').getResourceURL(HypervideoModel.sourcePath)  +'" type="video/mp4"></source>');
					/*
					videoElement.addEventListener('loadedmetadata',function() {
						//videoElement.play();
					});
					*/
				}
			} else {
				_video.append('<source src="'+ FrameTrail.module('RouteNavigation').getResourceURL(HypervideoModel.sourcePath)  +'" type="video/mp4"></source>');
			}

			_video.on('play',  _play);
			_video.on('pause', _pause);

			_video.on('seeking', function() {
				FrameTrail.changeState('videoWorking', true);
			});

			_video.on('waiting', function() {
				FrameTrail.changeState('videoWorking', true);
			});

			_video.on('canplaythrough', function() {
				FrameTrail.changeState('videoWorking', false);
			});

			_video.on('seeked', function() {
				FrameTrail.changeState('videoWorking', false);
			});

			_video.on('ended', function() {
				
				FrameTrail.triggerEvent('ended', {});

				if (HypervideoModel.events.onEnded) {
					try {
		            	var endedEvent = new Function(HypervideoModel.events.onEnded);
		            	endedEvent();
		            } catch (exception) {
		                // could not parse and compile JS code!
		                console.warn('Event handler contains errors: '+ exception.message);
		            }
		        }

			});

			_video.attr('preload', 'metadata');
			videoElement.load();

			initVideo(
				function(){

					HypervideoModel.offsetOut = (HypervideoModel.offsetOut) ? HypervideoModel.offsetOut : videoElement.duration;
					HypervideoModel.durationFull = videoElement.duration;
					HypervideoModel.duration = HypervideoModel.offsetOut - HypervideoModel.offsetIn;

					if (update) {
						AnnotationsController.updateController();
					} else {
						AnnotationsController.initController();
					}

					OverlaysController.initController();
					CodeSnippetsController.initController();
					SubtitlesController.initController();

					initPlayButton();
					initProgressBar();

					InteractionController.initController();

					FrameTrail.triggerEvent('ready', {});

					if (HypervideoModel.events.onReady) {
						try {
		                	var readyEvent = new Function(HypervideoModel.events.onReady);
		                	readyEvent();
			            } catch (exception) {
			                // could not parse and compile JS code!
			                console.warn('Event handler contains errors: '+ exception.message);
			            }
					}

					if (RouteNavigation.hashTime) {
						setCurrentTime(RouteNavigation.hashTime);
					} else {
						setCurrentTime(HypervideoModel.offsetIn);
					}

					FrameTrail.changeState('viewSize', FrameTrail.getState('viewSize'));

					callback.call();

				},
				failCallback
			);

		} else if (HypervideoModel.videoType == 'youtube') {

			highPriorityUpdater = highPriorityUpdater_HTML5;
			lowPriorityUpdater  = lowPriorityUpdater_HTML5;

			FrameTrail.changeState('videoWorking', true);

			window.lastYoutubePlayerID = 'yt_' + Date.now();
			var yt_options = 'autoplay=0&controls=0&rel=0&disablekb=1&enablejsapi=1&fs=0&modestbranding=1&playsinline=1&color=white&origin='+ window.location.origin;
			var yt_iframe = $('<iframe id="'+ window.lastYoutubePlayerID +'" class="player_youtube" type="text/html" width="720" height="405" src="https:'+ HypervideoModel.sourcePath +'?'+ yt_options +'" frameborder="0" allowfullscreen>');
						
			_video.after(yt_iframe);

			if (!window.YT) {
				var tag = document.createElement('script');
				tag.src = "https://www.youtube.com/iframe_api";
				var firstScriptTag = document.getElementsByTagName('script')[0];
				firstScriptTag.parentNode.insertBefore(tag, firstScriptTag);
			} else {
				window.onYouTubeIframeAPIReady();
			}

			window.onYouTubeIframeAPIReady = function() {
				
				window.player_youtube[window.lastYoutubePlayerID] = new window.YT.Player(window.lastYoutubePlayerID, {
					events: {
						'onReady': onPlayerReady,
						'onStateChange': onPlayerStateChange,
						'onError': onError
					}
				});
				
				function onPlayerReady(event) {
					
					//console.log('Player READY', window.lastYoutubePlayerID, event.target.getDuration());
					var HypervideoModel = FrameTrail.module('HypervideoModel');
					HypervideoModel.offsetOut = (HypervideoModel.offsetOut) ? HypervideoModel.offsetOut : event.target.getDuration();
					HypervideoModel.durationFull = event.target.getDuration();
					HypervideoModel.duration = HypervideoModel.offsetOut - HypervideoModel.offsetIn;

					if (update) {
						AnnotationsController.updateController();
					} else {
						AnnotationsController.initController();
					}

					OverlaysController.initController();
					CodeSnippetsController.initController();
					SubtitlesController.initController();

					initPlayButton();
					initProgressBar();

					InteractionController.initController();

					FrameTrail.triggerEvent('ready', {});

					if (HypervideoModel.events.onReady) {
						try {
		                	var readyEvent = new Function(HypervideoModel.events.onReady);
		                	readyEvent();
			            } catch (exception) {
			                // could not parse and compile JS code!
			                console.warn('Event handler contains errors: '+ exception.message);
			            }
					}

					if (RouteNavigation.hashTime) {
						setCurrentTime(RouteNavigation.hashTime);
					} else {
						setCurrentTime(HypervideoModel.offsetIn);
					}

					FrameTrail.changeState('viewSize', FrameTrail.getState('viewSize'));

					callback.call();
				}

				function onPlayerStateChange(event) {
					switch(event.data) {
						case -1:
							// unstarted
							break;
						case 0:
							// ended
							_pause();
							break;
						case 1:
							// playing
							_play();
							FrameTrail.changeState('videoWorking', false);
							break;
						case 2:
							// paused
							_pause();
							break;
						case 3:
							// buffering
							FrameTrail.changeState('videoWorking', true);
							break;
						case 5:
							// video cued
							break;
						default:
						// default
					} 
				}

				function onError(event) {
					switch(event.data) {
						case 2:
							// invalid parameter value
							FrameTrail.module('InterfaceModal').showErrorMessage('Youtube Error: invalid parameter value.');
							break;
						case 5:
							// error in HTML5 player
							FrameTrail.module('InterfaceModal').showErrorMessage('Youtube Error: HTML5 playback error.');
							break;
						case 100:
							// video has not been found (private?)
							FrameTrail.module('InterfaceModal').showErrorMessage('Youtube Error: video not found or private.');
							break;
						case 101:
							// owner does not allow embedding
							FrameTrail.module('InterfaceModal').showErrorMessage('Youtube Error: owner does not allow embedding.');
							break;
						case 101:
							// owner does not allow embedding
							FrameTrail.module('InterfaceModal').showErrorMessage('Youtube Error: owner does not allow embedding.');
							break;
						default:
						// default
					} 
				}
			}

		} else if (HypervideoModel.videoType == 'vimeo') {

			highPriorityUpdater = highPriorityUpdater_NullVideo;
			lowPriorityUpdater  = lowPriorityUpdater_NullVideo;

			FrameTrail.changeState('videoWorking', true);

			console.log('VIMEO API');

		} else {

			FrameTrail.changeState('videoWorking', true);

			highPriorityUpdater = highPriorityUpdater_NullVideo;
			lowPriorityUpdater  = lowPriorityUpdater_NullVideo;

			/*
			var HypervideoModel = FrameTrail.module('HypervideoModel');
			HypervideoModel.offsetOut = (HypervideoModel.offsetOut) ? HypervideoModel.offsetOut : HypervideoModel.duration;
			HypervideoModel.durationFull = HypervideoModel.duration;
			HypervideoModel.duration = HypervideoModel.offsetOut - HypervideoModel.offsetIn;

			console.log(HypervideoModel.durationFull);
			console.log(HypervideoModel.duration);
			console.log(HypervideoModel.offsetIn, HypervideoModel.offsetOut);
			*/

			window.setTimeout(function() {
				
				if (update) {
					AnnotationsController.updateController();
				} else {
					AnnotationsController.initController();
				}

				OverlaysController.initController();
				CodeSnippetsController.initController();
				SubtitlesController.initController();

				initPlayButton();
				initProgressBar();

				InteractionController.initController();

				FrameTrail.triggerEvent('ready', {});
				if (HypervideoModel.events.onReady) {
					try {
	                	var readyEvent = new Function(HypervideoModel.events.onReady);
	                	readyEvent();
		            } catch (exception) {
		                // could not parse and compile JS code!
		                console.warn('Event handler contains errors: '+ exception.message);
		            }
				}

				if (RouteNavigation.hashTime) {
					setCurrentTime(RouteNavigation.hashTime);
				} else {
					setCurrentTime(HypervideoModel.offsetIn);
				}

				FrameTrail.changeState('viewSize', FrameTrail.getState('viewSize'));

				FrameTrail.changeState('videoWorking', true);

				callback.call();
			}, 1100);

		}

		FrameTrail.module('RouteNavigation').onHashTimeChange = function() {
			previousTime = currentTime;

			setCurrentTime(RouteNavigation.hashTime);

			FrameTrail.triggerEvent('userAction', {
				action: 'VideoJumpTime',
				fromTime: previousTime,
				toTime: RouteNavigation.hashTime
			});
		};


	};


	/**
	 * I delay the execution of callback until enough data from the video source file has loaded.
	 *
	 * readyState == 0 means, that metadata is loaded. This is needed to know the __duration__ of the video.
	 *
	 * @method initVideo
	 * @param {Function} callback
	 * @param {Function} failCallback
	 * @private
	 */
	function initVideo(callback, failCallback) {

		var waitingInterval = 500, 	// milliseconds
			counter    		= 50; 	// 25 seconds waiting time


		function checkReadyState() {

			if (videoElement.readyState > 0){

				callback();

			} else {

				if (--counter) {

					window.setTimeout(checkReadyState, waitingInterval);

				} else {

					failCallback(
							'VideoPlayer: Received no data within the time limit of '
						+ 	Math.round(waitingInterval * 50 / 1000)
						+	' seconds.'
					);

				}

			}

		}

		checkReadyState();

	};


	/**
	 * I init the UI of the play button and connect it with the play/pause functions.
	 *
	 * @method initPlayButton
	 * @private
	 */
	function initPlayButton(){

		var ViewVideo = FrameTrail.module('ViewVideo');

		ViewVideo.PlayButton.click(function(){

			if ( isPlaying ) {
				pause();
			} else {
				play();
			}

		});

		ViewVideo.VideoStartOverlay.click(function(){

			if ( !isPlaying ) {
				play();
			}

		});

	};



	/**
	 * I initialize the UI elements of the progress bar.
	 *
	 * This depends on the duration of the video already being known.
	 *
	 * I make the DOM element a jQuery UI Slider, and attach its event listeners.
	 *
	 * @method initProgressBar
	 * @private
	 */
	function initProgressBar() {

		var HypervideoModel = FrameTrail.module('HypervideoModel');
		var ViewVideo = FrameTrail.module('ViewVideo');

		ViewVideo.duration = formatTime(HypervideoModel.duration);
		ViewVideo.durationFull = formatTime(HypervideoModel.durationFull, true);

		ViewVideo.PlayerProgress.slider({
			value: 0,
			step: 0.01,
			orientation: "horizontal",
			range: "min",
			max: HypervideoModel.duration,
			animate: false,

			create: function(evt, ui) {

						var circle      = $('<div class="ui-slider-handle-circle"></div>'),
							innerCircle = $('<div class="ui-slider-handle-circle-inner"></div>'),
							_evtTarget  = $(evt.target);

						innerCircle.appendTo(circle);
						_evtTarget.children('.ui-slider-handle').append(circle);

						ViewVideo.adjustLayout();
						ViewVideo.adjustHypervideo();

					},

			slide:  function(evt, ui) {
						setCurrentTime(HypervideoModel.offsetIn+ui.value);
					},

			start: 	function(evt, ui) {
						previousTime = currentTime;
					},

			stop: 	function(evt, ui) {
						setCurrentTime(HypervideoModel.offsetIn+ui.value);

						FrameTrail.triggerEvent('userAction', {
							action: 'VideoJumpTime',
							fromTime: previousTime,
							toTime: ui.value
						});
					}
		});


	};


	/**
	 * I update the descriptions of the hypervideo, which is shown in the UI in the {{#crossLink "Sidebar"}}Sidebar{{/crossLink}}
	 * @method updateDescriptions
	 */
	function updateDescriptions() {

		var created = new Date(HypervideoModel.created).toLocaleString('de-DE', {
					year: 'numeric',
					month: '2-digit',
					day: '2-digit',
					hour: '2-digit',
					minute: '2-digit'
				}).replace(/\./g, '.'),

			changed = new Date(HypervideoModel.lastchanged).toLocaleString('de-DE', {
					year: 'numeric',
					month: '2-digit',
					day: '2-digit',
					hour: '2-digit',
					minute: '2-digit'
				}).replace(/\./g, '.');

		FrameTrail.module('Sidebar').VideoDescription   = (	'<div>' + HypervideoModel.description + '</div>'
													  +	'<div class="descriptionLabel">Author</div>'
													  +	'<div>' + HypervideoModel.creator + '</div>'
													  + '<div class="descriptionDates">'
													  +	'    <div class="descriptionLabel">Created</div>'
													  +	'    <div>' + created + '</div>'
													  +	'    <div class="descriptionLabel">Last changed</div>'
													  +	'    <div>' + changed + '</div>'
													  + '</div>'

													);

		FrameTrail.module('Titlebar').title = HypervideoModel.hypervideoName;


	};





	/**
	 * I am the high priority update function, when there is a HTML5 video element present.
	 *
	 * I am called from the browser runtime environment via its window.setInterval mechanism. The interval is defined in the
	 * {{#crossLink "HypervideoController/_play:method"}}_play method{{/crossLink}}, and the interval length is set to 40 milliseconds.
	 *
	 * I fetch the currentTime attribute from the video element and store it in {{#crossLink "HypervideoController/currentTime:attribute"}}.
	 *
	 * I update the slider position of the progress bar.
	 *
	 * @method highPriorityUpdater_HTML5
	 * @private
	 */
	function highPriorityUpdater_HTML5() {

		var ViewVideo = FrameTrail.module('ViewVideo');

		if (HypervideoModel.videoType == 'youtube') {
			currentTime = window.player_youtube[window.lastYoutubePlayerID].getCurrentTime();
		} else {
			currentTime = videoElement.currentTime;
		}

		if (ViewVideo.PlayerProgress.data('ui-slider')) {
			ViewVideo.PlayerProgress.slider('value', currentTime-HypervideoModel.offsetIn);
		}

		FrameTrail.triggerEvent('timeupdate', {});

        OverlaysController.checkMediaSynchronization();


	};

	/**
	 * I am the low priority update function, when there is a HTML5 video element present.
	 *
	 * I am called from the browser runtime environment via its window.setInterval mechanism. The interval is defined in the
	 * {{#crossLink "HypervideoController/_play:method"}}_play method{{/crossLink}}, and the interval length is set to 180 milliseconds.
	 *
	 * I perform the following tasks:
	 *
	 * * Display the currentTime in the UI (numeric display in progress bar)
	 * * Call all sub-controllers ({{#crossLink "OverlaysController"}}OverlaysController{{/crossLink}}, {{#crossLink "VideosController"}}VideosController{{/crossLink}}, {{#crossLink "AnnotationsController"}}AnnotationsController{{/crossLink}}), to update the state for which they are responsible for.
	 *
	 * @method lowPriorityUpdater_HTML5
	 * @private
	 */
	function lowPriorityUpdater_HTML5() {

		//console.log('CURRENTTIME: '+currentTime);
		//console.log('CURRENTTIMEOFFSET: ', HypervideoModel.offsetIn);

		var ViewVideo = FrameTrail.module('ViewVideo');
		
		ViewVideo.currentTime = formatTime(currentTime-HypervideoModel.offsetIn);
		ViewVideo.currentTimeFull = formatTime(currentTime, true);

		OverlaysController.updateStatesOfOverlays(currentTime);
		CodeSnippetsController.updateStatesOfCodeSnippets(currentTime);
		//AnnotationsController.updateStatesOfAnnotations(currentTime);
        ViewLayout.updateTimedStateOfContentViews(currentTime);
		SubtitlesController.updateStatesOfSubtitles(currentTime);

	};



	/**
	 * I am the high priority update function, when there is no HTML5 video element ("Null Player").
	 *
	 * I am called from the browser runtime environment via its window.setInterval mechanism. The interval is defined in the
	 * {{#crossLink "HypervideoController/_play:method"}}_play method{{/crossLink}}, and the interval length is set to 40 milliseconds.
	 *
	 * I update the slider position of the progress bar.
	 *
	 * @method highPriorityUpdater_NullVideo
	 * @private
	 */
	function highPriorityUpdater_NullVideo() {

		if (ViewVideo.PlayerProgress.data('ui-slider')) {
			ViewVideo.PlayerProgress.slider('value', currentTime-HypervideoModel.offsetIn);
		}

		FrameTrail.triggerEvent('timeupdate', {});

        OverlaysController.checkMediaSynchronization();

	};

	/**
	 * I am the low priority update function, when there is no HTML5 video element ("Null Player").
	 *
	 * I am called from the browser runtime environment via its window.setInterval mechanism. The interval is defined in the
	 * {{#crossLink "HypervideoController/_play:method"}}_play method{{/crossLink}}, and the interval length is set to 180 milliseconds.
	 *
	 * I perform the following tasks:
	 *
	 * * Display the currentTime in the UI (numeric display in progress bar)
	 * * Call all sub-controllers ({{#crossLink "OverlaysController"}}OverlaysController{{/crossLink}}, {{#crossLink "VideosController"}}VideosController{{/crossLink}}, {{#crossLink "AnnotationsController"}}AnnotationsController{{/crossLink}}), to update the state for which they are responsible for.
	 *
	 * @method lowPriorityUpdater_NullVideo
	 * @private
	 */
	function lowPriorityUpdater_NullVideo() {

		ViewVideo.currentTime = formatTime(currentTime-HypervideoModel.offsetIn);
		ViewVideo.currentTimeFull = formatTime(currentTime, true);

		OverlaysController.updateStatesOfOverlays(currentTime);
		CodeSnippetsController.updateStatesOfCodeSnippets(currentTime);
		//AnnotationsController.updateStatesOfAnnotations(currentTime);
        ViewLayout.updateTimedStateOfContentViews(currentTime);
		SubtitlesController.updateStatesOfSubtitles(currentTime);

	};


	/**
	 * I am the update function of the "Null Player", which sets the {{#crossLink "HypervideoController/currentTime:attribute"}}.
	 *
	 * When the currentTime reaches the duration of the null video, I stop playback.
	 *
	 * @method nullVideoUpdater
	 * @private
	 */
	function nullVideoUpdater() {

		currentTime = (Date.now() - nullVideoStartDate) / 1000;

		if (currentTime >= HypervideoModel.offsetIn+HypervideoModel.duration) {
			currentTime = HypervideoModel.offsetIn+HypervideoModel.duration;
			pause();
		}

	};



	/**
	 * I am the function, which starts the playback of the hypervideo.
	 *
	 * When there is a HTML5 video present, i simply call its .play() method,
	 * which in turn triggers the "play" event of the &lt;video&gt; element;
	 * The {{#crossLink "HypervideoController/_play:method"}}_play(){{/crossLink}} method is set as event handler for this event.
	 *
	 * When there is no HTML5 video ("Null player"), then I do two things:
	 * * I check if the currentTime reached the end of the "null video", and reset it to 0 if necessary.
	 * * I store the computer's current system clock time in the module var nullVideoStartDate (from this number the {{#crossLink "HypervideoController/nullVideoUpdater:method"}}nullVideoUpdater(){{/crossLink}}) can calculate the new currentTime.
	 *
	 * @method play
	 */
	function play() {

        FrameTrail.changeState('videoWorking', false);

		if (HypervideoModel.videoType == 'native') {

			var promise = videoElement.play();
            
            if (promise !== undefined) {

				promise.then(function(_) {
	                onPlaySuccess();
				}).catch(function(error) {
					// play error (most likely autoplay prevented)
				});

			}

		} else if (HypervideoModel.videoType == 'youtube') {

			window.player_youtube[window.lastYoutubePlayerID].playVideo();
			_play();
			onPlaySuccess();

		} else {

			if (!isPlaying){

				if (currentTime === HypervideoModel.duration) {
					currentTime = 0;
				}

				nullVideoStartDate = Date.now() - (currentTime * 1000)
				_play();

				onPlaySuccess();

			}

		}

		function onPlaySuccess() {
			if ( !ViewVideo.VideoStartOverlay.hasClass('inactive') ) {
				ViewVideo.VideoStartOverlay.addClass('inactive').fadeOut();
			}

			FrameTrail.triggerEvent('play', {});

			if (HypervideoModel.events.onPlay) {
				try {
	            	var playEvent = new Function(HypervideoModel.events.onPlay);
	            	playEvent();
	            } catch (exception) {
	                // could not parse and compile JS code!
	                console.warn('Event handler contains errors: '+ exception.message);
	            }
			}
		}

	};


	/**
	 * I pause the playback of the hypervideo.
	 *
	 * When there is a HTML5 video present, i call its .pause() method,
	 * which in turn triggers the "pause" event of the &lt;video&gt; element;
	 * The {{#crossLink "HypervideoController/_pause:method"}}_pause(){{/crossLink}} method is set as event handler for the pause event.
	 *
	 * When there is no HTML5 video ("null player") I directly call the {{#crossLink "HypervideoController/_pause:method"}}_pause(){{/crossLink}} method.
	 *
	 * @method pause
	 */
	function pause() {

		if (HypervideoModel.videoType == 'native') {

			videoElement.pause();

		} else if (HypervideoModel.videoType == 'youtube') {

			if (window.player_youtube[window.lastYoutubePlayerID]) {
				window.player_youtube[window.lastYoutubePlayerID].pauseVideo();
			}
			_pause();

		} else {

			_pause();

		}

		if (currentTime !== HypervideoModel.duration) {

			FrameTrail.triggerEvent('pause', {});

			if (HypervideoModel.events.onPause) {
				try {
	            	var pauseEvent = new Function(HypervideoModel.events.onPause);
	            	pauseEvent();
	            } catch (exception) {
	                // could not parse and compile JS code!
	                console.warn('Event handler contains errors: '+ exception.message);
	            }
			}

		} else if (HypervideoModel.videoType == 'canvas' && currentTime == HypervideoModel.offsetIn+HypervideoModel.duration) {

			FrameTrail.triggerEvent('ended', {});

			// Hack to fire ended event in NullVideo
			if (HypervideoModel.events.onEnded) {
				try {
	            	var endedEvent = new Function(HypervideoModel.events.onEnded);
	            	endedEvent();
	            } catch (exception) {
	                // could not parse and compile JS code!
	                console.warn('Event handler contains errors: '+ exception.message);
	            }
			}

		}

	};


	/**
	 * After playback has started, we need to do several things:
	 * * Register interval functions (highPriorityUpdater and highPriorityInterval; if necessary: nullVideoUpdater)
	 * * Change play button into a pause button
	 * * Tell the {{#crossLink "OverlaysController/syncMedia:method"}}OverlaysController to synchronize media{{/crossLink}}.
	 *
	 * @method _play
	 * @private
	 */
	function _play() {

		var ViewVideo = FrameTrail.module('ViewVideo');

		highPriorityIntervalID = window.setInterval(highPriorityUpdater, highPriorityInterval);
		lowPriorityIntervalID  = window.setInterval(lowPriorityUpdater,  lowPriorityInterval);

		if (HypervideoModel.videoType == 'canvas') {
			nullVideoIntervalID = window.setInterval(nullVideoUpdater,  nullVideoInterval);
		}

		ViewVideo.PlayButton.addClass('playing');

		isPlaying = true;

		OverlaysController.syncMedia();

	};


	/**
	 * After playback has paused, we need to do several things:
	 * * Clear the interval functions (highPriorityUpdater and highPriorityInterval; if necessary: nullVideoUpdater)
	 * * Change pause button back into play button
	 * * Tell the {{#crossLink "OverlaysController/syncMedia:method"}}OverlaysController to synchronize media{{/crossLink}}
	 *
	 * @method _pause
	 * @private
	 */
	function _pause() {

		var ViewVideo = FrameTrail.module('ViewVideo');

		window.clearInterval(highPriorityIntervalID);
		window.clearInterval(lowPriorityIntervalID);

		if (HypervideoModel.videoType == 'canvas') {
			window.clearInterval(nullVideoIntervalID);
		}

		ViewVideo.PlayButton.removeClass('playing');

		isPlaying = false;

		OverlaysController.syncMedia();

	};

    /**
	 * Some media types may request to stall the playback of the main video (for buffering, etc.)
	 *
	 * @method _pause
	 * @param {Boolean} aBoolean
     * @param {Overlay} syncMediaRequestingStall
	 */
	function playbackStalled(aBoolean, syncMediaRequestingStall) {

        if (aBoolean) {

            if (stallRequestedBy.indexOf(syncMediaRequestingStall) < 0) {
                stallRequestedBy.push(syncMediaRequestingStall);
            }


            if (!isStalled) {

                FrameTrail.changeState('videoWorking', true);

                if (HypervideoModel.videoType == 'native') {
                    videoElement.pause();
                } else {
                    window.clearInterval(nullVideoIntervalID);
                }

        		window.clearInterval(highPriorityIntervalID);
        		window.clearInterval(lowPriorityIntervalID);

                isStalled = aBoolean;

            }

        } else {

            var idx = stallRequestedBy.indexOf(syncMediaRequestingStall);
            if (idx >= 0) {
                stallRequestedBy.splice(idx, 1);
            }

            if (stallRequestedBy.length === 0) {

                FrameTrail.changeState('videoWorking', false);

                if (isStalled) {

                    if (HypervideoModel.videoType == 'native') {
            			var promise = videoElement.play();
                        if (promise) {
                            promise.catch(function(){ videoElement.play() });
                        }
            		} else {
        				if (currentTime === HypervideoModel.duration) {
        					currentTime = 0;
        				}
        				nullVideoStartDate = Date.now() - (currentTime * 1000);
                        nullVideoIntervalID = window.setInterval(nullVideoUpdater,  nullVideoInterval);
            		}

                    highPriorityIntervalID = window.setInterval(highPriorityUpdater, highPriorityInterval);
            		lowPriorityIntervalID  = window.setInterval(lowPriorityUpdater,  lowPriorityInterval);

                }

                isStalled = aBoolean;

            }

        }

	};


	/**
	 * The HypervideoController stores the {{#crossLink "HypervideoController/currentTime:attribute"}}currentTime{{/crossLink}}.
	 * When this property is being set, several things have to happen:
	 * * The currentTime of the &lt;video&gt; element has to be updated...
	 * * or – when there is no video source file – the nullVideoStartDate has to be updated
	 * * The update functions have to be called (highPriorityUpdater and lowPriorityUpdater)
	 * * The OverlaysController has to {{#crossLink "OverlaysController/syncMedia:method"}}synchronize media{{/crossLink}}
	 *
	 * @method setCurrentTime
	 * @param {Number} aNumber
	 * @return Number
	 * @private
	 */
	function setCurrentTime(aNumber) {

        var aNumberAsFloat = parseFloat(aNumber);

		if ( isNaN(aNumberAsFloat) ) {
			return;
		}

		if (HypervideoModel.videoType == 'native') {

			videoElement.currentTime = currentTime = aNumberAsFloat;

		} else if (HypervideoModel.videoType == 'youtube') {

			currentTime = aNumberAsFloat;
			window.player_youtube[window.lastYoutubePlayerID].seekTo(currentTime, true);

		} else {

			currentTime = aNumberAsFloat;
			nullVideoStartDate = Date.now() - (currentTime * 1000)

		}

		highPriorityUpdater();
		lowPriorityUpdater();

		OverlaysController.syncMedia();
		
		return aNumberAsFloat;

	};


	/**
	 * The HypervideoController stores the {{#crossLink "HypervideoController/muted:attribute"}}muted{{/crossLink}}.
	 * When this property is being set, the muted attribute of the &lt;video&gt; element has to be updated
	 * (only when there is a video source file)
	 *
	 * @method setMuted
	 * @param {Boolean} muted
	 * @return muted
	 * @private
	 */
	function setMuted(muted) {

		if (HypervideoModel.videoType == 'native') {

			videoElement.muted = muted;

		} else if (HypervideoModel.videoType == 'youtube') {

			if (muted) {
				window.player_youtube[window.lastYoutubePlayerID].mute();
			} else {
				window.player_youtube[window.lastYoutubePlayerID].unMute();
			}

		}

		OverlaysController.muteMedia(muted);



	};


	/**
	 * I take a number, which represents a time in seconds,
	 * and return a formatted string like HH:MM:SS
	 *
	 * @method formatTime
	 * @param {Number} aNumber
	 * @param {Boolean} forceHourDisplay
	 * @return String
	 */
	function formatTime(aNumber, forceHourDisplay) {

		var hours, minutes, seconds, hourValue;

		seconds 	= Math.ceil(aNumber);
		hours 		= Math.floor(seconds / (60 * 60));
		hours 		= (hours >= 10) ? hours : '0' + hours;
		minutes 	= Math.floor(seconds % (60*60) / 60);
		minutes 	= (minutes >= 10) ? minutes : '0' + minutes;
		seconds 	= Math.ceil(seconds % (60*60) % 60);
		seconds 	= (seconds >= 10) ? seconds : '0' + seconds;

		if (hours >= 1 || forceHourDisplay == true) {
			hourValue = hours + ':';
		} else {
			hourValue = '';
		}

		return hourValue + minutes + ':' + seconds;

	};


	/**
	 * Cancel all currently running intervals
	 *
	 * @method clearIntervals
	 * @private
	 */
	function clearIntervals() {

		window.clearInterval(highPriorityIntervalID);
		window.clearInterval(lowPriorityIntervalID);

		if (HypervideoModel.videoType == 'canvas') {
			window.clearInterval(nullVideoIntervalID);
		}

	};


	return {

		initController: initController,

		play: play,
		pause: pause,

        playbackStalled: playbackStalled,

		updateDescriptions: updateDescriptions,
		formatTime: 		formatTime,
		clearIntervals:     clearIntervals,


		/**
		 * This read-only attribute tells if the hypervideo is playing or not.
		 * It is set by {{#crossLink "HypervideoController/_play:method"}}_play(){{/crossLink}} and {{#crossLink "HypervideoController/_pause:method"}}_pause(){{/crossLink}}
		 *
		 * @attribute isPlaying
		 * @readOnly
		 */
		get isPlaying()          { return isPlaying               },



		/**
		 * This attributes stores the currentTime of the hypervideo.
		 *
		 * When this attribute is being read, it returns the value, which was automatically updated by {{#crossLink "HypervideoController/highPriorityUpdater_HTML5:method"}}highPriorityUpdater_HTML5(){{/crossLink}} or respectively {{#crossLink "HypervideoController/nullVideoUpdater:method"}}nullVideoUpdater(){{/crossLink}}.
		 *
		 * When the attribute is being set, like this:
		 *
		 *     FrameTrail.module('HypervideoController').currentTime = 3
		 *
		 * then the {{#crossLink "HypervideoController/setCurrentTime:method"}}setCurrentTime(){{/crossLink}} is called.
		 *
		 * @attribute currentTime
		 */
		get currentTime()         				{ return currentTime             },
		set currentTime(aNumber) 				{ return setCurrentTime(aNumber) },

		/**
		 * These attributes store the muted state of the hypervideo.
		 *
		 * The muted state is set like this:
		 *
		 *     FrameTrail.module('HypervideoController').muted = true
		 *
		 * then the {{#crossLink "HypervideoController/setMuted:method"}}setMuted(){{/crossLink}} is called.
		 *
		 * @attribute muted
		 */
		get muted() 			 { return muted  				  },
		set muted(aBoolean) 	 { return setMuted(aBoolean)  	  }

	}



});
