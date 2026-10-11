/**
 * @module Shared
 */

/**
 * I am the HypervideoFormBuilder. I provide shared form HTML generation
 * for hypervideo dialogs (new and edit).
 *
 * @class HypervideoFormBuilder
 * @static
 */

FrameTrail.defineModule('HypervideoFormBuilder', function(FrameTrail){

    /**
     * Get localization labels (lazy access to avoid initialization issues)
     * @method getLabels
     * @return {Object} labels object
     */
    function getLabels() {
        return FrameTrail.module('Localization').labels;
    }

    /**
     * Convert seconds to HH:MM:SS time string
     * @method secondsToTimeString
     * @param {Number} totalSeconds
     * @return {String} time string in HH:MM:SS format
     */
    function secondsToTimeString(totalSeconds) {
        var h = Math.floor(totalSeconds / 3600);
        var m = Math.floor((totalSeconds % 3600) / 60);
        var s = Math.floor(totalSeconds % 60);
        return String(h).padStart(2, '0') + ':' + String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0');
    }

    /**
     * Convert HH:MM:SS time string to total seconds
     * @method timeStringToSeconds
     * @param {String} timeString - time in HH:MM:SS format
     * @return {Number} total seconds
     */
    function timeStringToSeconds(timeString) {
        if (!timeString) return 0;
        var parts = timeString.split(':');
        var h = parseInt(parts[0]) || 0;
        var m = parseInt(parts[1]) || 0;
        var s = parseInt(parts[2]) || 0;
        return h * 3600 + m * 60 + s;
    }

    /**
     * Generate the settings row HTML: the name, and with the extended settings the player option(s).
     * Subtitles and whether captions show from the start are set in the transcripts edit mode.
     * @method generateSettingsRow
     * @param {Object} options - {
     *   name: '',
     *   autohideControls: false,
     *   showExtendedSettings: false
     * }
     * @return {String} HTML string
     */
    function generateSettingsRow(options) {
        var labels = getLabels();
        options = options || {};
        var name = options.name || '';
        var autohideControls = options.autohideControls || false;
        var showExtendedSettings = options.showExtendedSettings || false;

        var html = '<div class="layoutRow">'
                 // Row 1: Name (full width)
                 + '    <div class="column-12">'
                 + '        <label for="name">'+ labels['GenericName'] +'</label>'
                 + '        <input type="text" name="name" placeholder="'+ labels['SettingsHypervideoName'] +'" value="'+ name +'">'
                 + '    </div>'
                 + '</div>';

        if (showExtendedSettings) {
            html += '<div class="layoutRow" style="margin-top: 7px;">'
                 + '    <div class="column-12">'
                 + '        <div class="checkboxRow"><label class="switch"><input type="checkbox" name="config[autohideControls]" id="autohideControls" '+ (autohideControls ? 'checked' : '') +'><span class="slider round"></span></label><label for="autohideControls">'+ labels['SettingsAutohideControls'] +'</label></div>'
                 + '    </div>'
                 + '</div>';
        }

        return html;
    }

    /**
     * Generate the video source section HTML
     * @method generateVideoSourceSection
     * @param {Object} options - { 
     *   duration: 120,  // Duration in seconds (default 2 minutes)
     *   currentResourceId: null,
     *   currentSrc: null,
     *   showUploadButton: true,
     *   isEditMode: false  // If true, includes newResourceId/Src/Duration hidden inputs
     * }
     * @return {String} HTML string
     */
    function generateVideoSourceSection(options) {
        var labels = getLabels();
        options = options || {};
        // Default duration is 2 minutes (120 seconds)
        var duration = options.duration !== undefined ? options.duration : 120;
        var durationTimeString = secondsToTimeString(duration);
        var currentResourceId = options.currentResourceId || '';
        var currentSrc = options.currentSrc || '';
        var showUploadButton = options.showUploadButton !== false;
        var isEditMode = options.isEditMode || false;

        var html = '<div class="videoSourceSection">'
                 + '    <div class="videoSourceTabs">'
                 + '        <ul>'
                 + '            <li><a href="#ChooseVideo">'+ labels['SettingsChooseVideo'] +'</a></li>'
                 + '            <li><a href="#EmptyVideo">'+ labels['GenericEmptyVideo'] +'</a></li>'
                 + '        </ul>'
                 + '        <div id="ChooseVideo">';

        if (showUploadButton) {
            html += '            <button type="button" class="uploadNewVideoResource"><span class="icon-plus"></span> '+ labels['ResourceUploadVideo'] +'</button>';
        }

        html += '            <div class="videoResourceList"></div>'
              + '            <input type="hidden" name="resourcesID" value="'+ currentResourceId +'">'
              + '        </div>'
              + '        <div id="EmptyVideo">'
              + '            <div class="message active">'+ labels['MessageEmptyVideoSetDuration'] +'</div>'
              + '            <label>'+ labels['GenericDuration'] +':</label>'
              + '            <input type="time" name="duration" step="1" min="00:00:04" value="'+ durationTimeString +'">'
               + '            <label>(HH:MM:SS)</label>'
              + '        </div>'
              + '    </div>';

        // Edit mode needs additional hidden inputs for tracking source changes
        if (isEditMode) {
            html += '    <input type="hidden" name="newResourceId" value="'+ currentResourceId +'">'
                  + '    <input type="hidden" name="newResourceSrc" value="'+ currentSrc +'">'
                  + '    <input type="hidden" name="newResourceDuration" value="">';
        }

        html += '</div>';

        return html;
    }

    // Export public interface
    return {

        // Time conversion utilities
        secondsToTimeString: secondsToTimeString,
        timeStringToSeconds: timeStringToSeconds,

        // Form generation
        generateSettingsRow: generateSettingsRow,
        generateVideoSourceSection: generateVideoSourceSection

    };

});
