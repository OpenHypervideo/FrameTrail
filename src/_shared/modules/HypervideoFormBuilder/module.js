/**
 * @module Shared
 */

/**
 * I am the HypervideoFormBuilder. I provide shared form HTML generation
 * for hypervideo dialogs (new and edit), and form controls the editors share.
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
     * Generate the settings row HTML: the name.
     * Subtitles and whether captions show from the start are set in the transcripts edit mode,
     * whether the controls hide when inactive and the poster frame in the Advanced Options of the hypervideo settings.
     * @method generateSettingsRow
     * @param {Object} options - {
     *   name: ''
     * }
     * @return {String} HTML string
     */
    function generateSettingsRow(options) {
        var labels = getLabels();
        options = options || {};
        var name = options.name || '';

        var html = '<div class="layoutRow">'
                 // Row 1: Name (full width)
                 + '    <div class="column-12">'
                 + '        <label for="name">'+ labels['GenericName'] +'</label>'
                 + '        <input type="text" name="name" placeholder="'+ labels['SettingsHypervideoName'] +'" value="'+ name +'">'
                 + '    </div>'
                 + '</div>';

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

    /**
     * I create a no-code "action preset" picker: a select element which inserts
     * ready-made JavaScript for common actions into a CodeMirror 6 editor
     * (the overlay actions, the hypervideo events).
     *
     * @method renderActionPresetPicker
     * @param {Function} getEditorView Function returning the target CM6 EditorView
     * @return HTMLElement
     */
    function renderActionPresetPicker(getEditorView) {
        var labels = getLabels();

        var presets = [
            { label: labels['ActionPresetPause'],            code: 'hypervideo.pause();' },
            { label: labels['ActionPresetPlay'],             code: 'hypervideo.play();' },
            { label: labels['ActionPresetJumpToTime'],       code: 'hypervideo.currentTime = 10; // ' + labels['ActionPresetJumpToTimeHint'] },
            { label: labels['ActionPresetJumpToHypervideo'], code: "window.location.hash = 'hypervideo=HYPERVIDEO_ID'; // " + labels['ActionPresetJumpToHypervideoHint'] },
            { label: labels['ActionPresetShowMessage'],      code: "window.alert('" + labels['ActionPresetShowMessageDefault'] + "');" }
        ];

        // Open / close a layout area: one preset per area, so there is nothing to edit in the code.
        // All four are always offered: the picker also serves the events of hypervideos that are not
        // open, whose areas are not known here. A call for an area without views does nothing.
        var areas = [
            { name: 'top',    label: labels['LayoutAreaTop'] },
            { name: 'bottom', label: labels['LayoutAreaBottom'] },
            { name: 'left',   label: labels['LayoutAreaLeft'] },
            { name: 'right',  label: labels['LayoutAreaRight'] }
        ];
        [
            { group: labels['ActionPresetOpenLayoutArea'],  method: 'openLayoutArea' },
            { group: labels['ActionPresetCloseLayoutArea'], method: 'closeLayoutArea' }
        ].forEach(function(action) {
            areas.forEach(function(area) {
                presets.push({
                    group: action.group,
                    label: area.label.charAt(0).toUpperCase() + area.label.slice(1),
                    code:  'hypervideo.' + action.method + "('" + area.name + "');"
                });
            });
        });

        var wrapper = document.createElement('div');
        wrapper.className = 'custom-select actionPresetPicker';

        var select = document.createElement('select');

        var placeholder = document.createElement('option');
        placeholder.value = '';
        placeholder.disabled = true;
        placeholder.selected = true;
        placeholder.style.display = 'none';
        placeholder.textContent = labels['ActionPresetInsert'];
        select.appendChild(placeholder);

        // Presets with a group are listed under it; the option's value stays the preset's index
        var groups = {};
        presets.forEach(function(preset, index) {
            var option = document.createElement('option');
            option.value = index;
            option.textContent = preset.label;

            if (!preset.group) {
                select.appendChild(option);
                return;
            }
            if (!groups[preset.group]) {
                groups[preset.group] = document.createElement('optgroup');
                groups[preset.group].label = preset.group;
                select.appendChild(groups[preset.group]);
            }
            groups[preset.group].appendChild(option);
        });

        select.addEventListener('change', function() {
            var preset = presets[parseInt(this.value, 10)];
            this.value = '';
            if (!preset) { return; }

            var editorView = getEditorView();
            if (!editorView) { return; }

            var doc = editorView.state.doc,
                insert = preset.code + '\n';

            if (doc.length > 0 && doc.sliceString(doc.length - 1) !== '\n') {
                insert = '\n' + insert;
            }

            editorView.dispatch({ changes: { from: doc.length, insert: insert } });
            editorView.focus();
        });

        wrapper.appendChild(select);

        return wrapper;
    }

    // Export public interface
    return {

        // Time conversion utilities
        secondsToTimeString: secondsToTimeString,
        timeStringToSeconds: timeStringToSeconds,

        // Form generation
        generateSettingsRow: generateSettingsRow,
        generateVideoSourceSection: generateVideoSourceSection,

        // Form controls
        renderActionPresetPicker: renderActionPresetPicker

    };

});
