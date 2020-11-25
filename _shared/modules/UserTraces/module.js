/**
 * @module Shared
 */


/**
 * I contain all business logic about the UserTraces module.
 *
 * I capture user activity in the client / browser localstorage.
 *
 * @class UserTraces
 * @static
 */



FrameTrail.defineModule('UserTraces', function(FrameTrail){

	var labels = FrameTrail.module('Localization').labels;

	var sessions = {},
		currentSessionID = null;

	/**
	 * I init saved traces from localstorage.
	 *
	 * @method initTraces
	 * @return 
	 */
	function initTraces() {
		
		if (!FrameTrail.module('Database').config.captureUserTraces) {
			return;
		}
		
		FrameTrail.addEventListener('userAction', function(evt) {
			if (evt.detail.action == FrameTrail.module('Database').config.userTracesStartAction) {
				startTrace();
			} else if (evt.detail.action == FrameTrail.module('Database').config.userTracesEndAction) {
				addTraceEvent(evt.detail.action);
				endTrace();
			}
		});
		
		// Add events / actions to be traced

		FrameTrail.addEventListener('play', function(evt) {
			addTraceEvent('VideoPlay');
		});

		FrameTrail.addEventListener('pause', function(evt) {
			addTraceEvent('VideoPause');
		});

		FrameTrail.addEventListener('userAction', function(evt) {
			var attributes = {};

			// clean objects
			if (evt.detail.annotation) {
				var newObject = {};

				newObject.name = evt.detail.annotation.name;
				newObject.type = evt.detail.annotation.type;
				newObject.start = evt.detail.annotation.start;
				newObject.end = evt.detail.annotation.end;
				
				if (evt.detail.annotation.type == 'text') {
					newObject.text = evt.detail.annotation.attributes.text;
				} else if (evt.detail.annotation.src) {
					newObject.source = evt.detail.annotation.src;
				}
				evt.detail.annotation = newObject;
			} else if (evt.detail.overlay) {
				var newObject = {};

				newObject.name = evt.detail.overlay.name;
				newObject.type = evt.detail.overlay.type;
				newObject.start = evt.detail.overlay.start;
				newObject.end = evt.detail.overlay.end;
				
				if (evt.detail.overlay.type == 'text') {
					newObject.text = evt.detail.overlay.attributes.text;
				} else if (evt.detail.overlay.src) {
					newObject.source = evt.detail.overlay.src;
				}
				evt.detail.overlay = newObject;
			}

			switch(evt.detail.action) {
				case 'VideoJumpTime':
					if (evt.detail.fromTime > evt.detail.toTime) {
						evt.detail.action = 'VideoJumpBackward';
					} else {
						evt.detail.action = 'VideoJumpForward';
					}
					attributes.fromTime = evt.detail.fromTime;
					attributes.toTime = evt.detail.toTime;
					attributes.secondsDistance = Math.round(Math.abs(evt.detail.toTime - evt.detail.fromTime));
					break;
				case 'UserLogin':
					attributes.userID = evt.detail.userID;
					attributes.userName = evt.detail.userName;
					attributes.userRole = evt.detail.userRole;
					attributes.userMail = evt.detail.userMail;
					break;
				case 'UserLogout':
					//
					break;
				case 'AnnotationOpen':
					attributes.annotation = evt.detail.annotation;
					break;
				case 'AnnotationAdd':
					attributes.annotation = evt.detail.annotation;
					break;
				case 'AnnotationChange':
					if (evt.detail.changes[0].property == 'attributes.text') {
						evt.detail.action = 'AnnotationChangeText';
					} else {
						evt.detail.action = 'AnnotationChangeTime';
					}
					attributes.annotation = evt.detail.annotation;
					attributes.changes = evt.detail.changes;
					break;
				case 'AnnotationDelete':
					attributes.annotation = evt.detail.annotation;
					break;
				case 'OverlayAdd':
					attributes.overlay = evt.detail.overlay;
					break;
				case 'OverlayChange':
					attributes.overlay = evt.detail.overlay;
					attributes.changes = evt.detail.changes;
					break;
				case 'OverlayDelete':
					attributes.overlay = evt.detail.overlay;
					break;
				case 'CodeSnippetAdd':
					attributes.codesnippet = evt.detail.codesnippet;
					break;
				case 'CodeSnippetChange':
					attributes.codesnippet = evt.detail.codesnippet;
					attributes.changes = evt.detail.changes;
					break;
				case 'CodeSnippetDelete':
					attributes.codesnippet = evt.detail.codesnippet;
					break;
				case 'EditStart':
					//
					break;
				case 'EditSave':
					//
					break;
				case 'EditEnd':
					//
					break;
				case 'WaitStart':
					//
					break;
				case 'WaitEnd':
					//
					break;
				default:
					// default case
			}
			addTraceEvent(evt.detail.action, attributes);
		});

		// Init saved traces

		var savedTraces = localStorage.getItem('frametrail-traces');
		
		if (savedTraces) {
			sessions = JSON.parse(savedTraces);
		} else {
			sessions = {
				1516793040278: {
					'sessionStartTime': 1516793040278,
					'sessionEndTime': 1516800014980,
					'duration': null,
					'user': null,
					'traces': []
				},
				1516800014986: {
					'sessionStartTime': 1516800014986,
					'sessionEndTime': null,
					'duration': null,
					'user': null,
					'traces': []
				}
			}
		}

	}

	/**
	 * I save all traces in localstorage.
	 *
	 * @method saveTraces
	 * @return 
	 */
	function saveTraces() {
		
		localStorage.setItem('frametrail-traces', JSON.stringify(sessions));

	}

	/**
	 * I delete all traces from localstorage.
	 *
	 * @method deleteTraces
	 * @return 
	 */
	function deleteTraces() {
		
		localStorage.removeItem('frametrail-traces');
		
	}

	/**
	 * I start a session trace.
	 *
	 * @method startTrace
	 * @return 
	 */
	function startTrace() {

		if (!FrameTrail.module('Database').config.captureUserTraces) {
			console.warn(labels['ErrorCouldNotStartUserTrace']);
			return;
		}

		//console.log('Start Trace');

		var sessionID = Date.now(),
			sessionData = {
				'sessionStartTime': sessionID,
				'sessionEndTime': null,
				'duration': null,
				'user': null,
				'traces': []
			};

		sessions[sessionID] = sessionData;

		currentSessionID = sessionID;

	}

	/**
	 * I end a session trace.
	 *
	 * @method endTrace
	 * @return 
	 */
	function endTrace() {

		if (!currentSessionID) {
			console.warn(labels['ErrorCouldNotEndUserTrace']);
			return;
		}

		//console.log('EndTrace');

		var timeNow = Date.now(),
			sessionTime = getTimeDifference(sessions[currentSessionID].sessionStartTime, timeNow);

		sessions[currentSessionID].sessionEndTime = timeNow;
		sessions[currentSessionID].duration = sessionTime.hours +':'+ sessionTime.minutes +':'+ sessionTime.seconds;

		currentSessionID = null;

		saveTraces();

	}

	/**
	 * I add a trace event.
	 *
	 * @method addTraceEvent
	 * @param {traceType} String
	 * @param {attributes} Object
	 * @return 
	 */
	function addTraceEvent(traceType, attributes) {

		if (!currentSessionID) {
			//console.warn(labels['ErrorCouldNotAddTraceEvent']);
			return;
		}

		var sessionStartTime = currentSessionID,
			currentTime = Date.now(),
			sessionTime = getTimeDifference(sessionStartTime, currentTime);

		var traceData = {
			'action': traceType,
			'timestamp': currentTime,
			'sessionTime': sessionTime.hours +':'+ sessionTime.minutes +':'+ sessionTime.seconds,
			'currentVideo': {
				'id': (FrameTrail.module('RouteNavigation')) ? FrameTrail.module('RouteNavigation').hypervideoID : null,
				'name': (FrameTrail.module('HypervideoModel')) ? FrameTrail.module('HypervideoModel').hypervideoName : null
			},
			'currentVideoTime': (FrameTrail.module('HypervideoController')) ? FrameTrail.module('HypervideoController').currentTime : null,
			'playing': (FrameTrail.module('HypervideoController')) ? FrameTrail.module('HypervideoController').isPlaying : null,
			'editing': FrameTrail.getState('editMode'),
			'attributes': (attributes ? attributes : {})
		}

		if (FrameTrail.module('UserManagement').userID.length > 0) {
			sessions[currentSessionID].user = FrameTrail.module('UserManagement').userID;
		}

		//console.log(traceData);

		sessions[currentSessionID].traces.push(traceData);
		
	}

	/**
	 * I return the saved trace data.
	 *
	 * @method getTraceData
	 * @return 
	 */
	function getTraceData() {

		return sessions;

	}

	/**
	 * I return the difference between two dates in hours, minutes and seconds.
	 * The first parameter (date1) is the earlier date from which the offset is calculated.
	 *
	 * @method getTimeDifference
	 * @param {date1} Unix Time String
	 * @param {date2} Unix Time String
	 * @return Object
	 */
	function getTimeDifference(date1, date2) {
		
		date1 = new Date(date1);
		date2 = new Date(date2);
		
		var difference = date2.getTime() - date1.getTime();

		var daysDifference = Math.floor(difference/1000/60/60/24);
		difference -= daysDifference*1000*60*60*24

		var hoursDifference = Math.floor(difference/1000/60/60);
		difference -= hoursDifference*1000*60*60

		var minutesDifference = Math.floor(difference/1000/60);
		difference -= minutesDifference*1000*60

		var secondsDifference = Math.floor(difference/1000);

		return {
			'hours': (hoursDifference >= 10) ? hoursDifference : '0' + hoursDifference,
			'minutes': (minutesDifference >= 10) ? minutesDifference : '0' + minutesDifference,
			'seconds': (secondsDifference >= 10) ? secondsDifference : '0' + secondsDifference
		}

	}
	
	return {

		initTraces: 		initTraces,
		startTrace: 		startTrace,
		endTrace: 			endTrace,
		addTraceEvent: 		addTraceEvent,
		deleteTraces: 		deleteTraces,

		/**
		 * The current trace session data.
		 * @attribute traces
		 */
		get traces()    { return getTraceData() }

	};


});