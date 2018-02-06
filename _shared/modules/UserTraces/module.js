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


	var sessions = {},
		currentSessionID = null;

	/**
	 * I init saved traces from localstorage.
	 *
	 * @method initTraces
	 * @return 
	 */
	function initTraces() {
		
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

	initTraces();

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
			console.warn('Could not add trace event. Please start session first.');
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
				'id': FrameTrail.module('RouteNavigation').hypervideoID,
				'name': FrameTrail.module('HypervideoModel').hypervideoName
			},
			'currentVideoTime': FrameTrail.module('HypervideoController').currentTime,
			'playing': FrameTrail.module('HypervideoController').isPlaying,
			'editing': FrameTrail.getState('editMode'),
			'attributes': (attributes ? attributes : {})
		}

		if (FrameTrail.module('UserManagement').userID.length > 0) {
			sessions[currentSessionID].user = FrameTrail.module('UserManagement').userID;
		}

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