/**
 * @module Shared
 */

/**
 * I contain all business logic about the Localization module.
 *
 * I contain a reference to all labels in the currently specified locale.
 *
 * @class Localization
 * @static
 */

FrameTrail.defineModule('Localization', function(FrameTrail){

	var locale = (FrameTrail.getState('language')) ? FrameTrail.getState('language') : 'en-US',
		labels = null;

	/**
	 * I init the Localization module.
	 *
	 * @method updateLabels
	 * @return 
	 */
	function updateLabels() {
		
		if (window.FrameTrail_L10n[locale]) {
			labels = window.FrameTrail_L10n[locale];
		} else {
			labels = window.FrameTrail_L10n['en-US'];
		}

	}

	updateLabels();
	
	return {

		updateLabels: 	updateLabels,

		/**
		 * The current label data.
		 * @attribute labels
		 */
		get labels()    { return labels }

	};


});