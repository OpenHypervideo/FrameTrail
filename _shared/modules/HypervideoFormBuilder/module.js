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
     * Convert seconds to hours, minutes, seconds object
     * @method secondsToHMS
     * @param {Number} totalSeconds
     * @return {Object} { hours, minutes, seconds }
     */
    function secondsToHMS(totalSeconds) {
        var h = Math.floor(totalSeconds / 3600);
        var m = Math.floor((totalSeconds % 3600) / 60);
        var s = Math.floor(totalSeconds % 60);
        return { hours: h, minutes: m, seconds: s };
    }

    /**
     * Convert hours, minutes, seconds to total seconds
     * @method hmsToSeconds
     * @param {Number} h - hours
     * @param {Number} m - minutes
     * @param {Number} s - seconds
     * @return {Number} total seconds
     */
    function hmsToSeconds(h, m, s) {
        return (parseInt(h) || 0) * 3600 + (parseInt(m) || 0) * 60 + (parseInt(s) || 0);
    }

    /**
     * Generate the settings row HTML (basic info + subtitles in one row)
     * @method generateSettingsRow
     * @param {Object} options - {
     *   name: '',
     *   description: '',
     *   hidden: false,
     *   captionsVisible: false,
     *   showExistingSubtitles: false
     * }
     * @return {String} HTML string
     */
    function generateSettingsRow(options) {
        var labels = getLabels();
        options = options || {};
        var name = options.name || '';
        var description = options.description || '';
        var hidden = options.hidden || false;
        var captionsVisible = options.captionsVisible || false;
        var showExistingSubtitles = options.showExistingSubtitles || false;

        var html = '<div class="layoutRow">'
                 // Column 1: Name & Hidden
                 + '    <div class="column-3">'
                 + '        <label for="name">'+ labels['SettingsHypervideoName'] +'</label>'
                 + '        <input type="text" name="name" placeholder="'+ labels['SettingsHypervideoName'] +'" value="'+ name +'"><br>'
                 + '        <input type="checkbox" name="hidden" id="hypervideo_hidden" value="hidden" '+ (hidden ? 'checked' : '') +'>'
                 + '        <label for="hypervideo_hidden">'+ labels['SettingsHiddenFromOtherUsers'] +'</label>'
                 + '    </div>'
                 // Column 2: Description
                 + '    <div class="column-3">'
                 + '        <label for="description">'+ labels['GenericDescription'] +'</label>'
                 + '        <textarea name="description" placeholder="'+ labels['GenericDescription'] +'">'+ description +'</textarea><br>'
                 + '    </div>'
                 // Column 3: Subtitles
                 + '    <div class="column-6">'
                 + '        <div class="subtitlesSettingsWrapper">'
                 + '            <div>'+ labels['GenericSubtitles'] +' ('+ labels['MessageSubtitlesAlsoUsedForInteractiveTranscripts'] +')</div>'
                 + '            <button class="subtitlesPlus" type="button">'+ labels['GenericAdd'] +' <span class="icon-plus"></span></button>'
                 + '            <input type="checkbox" name="config[captionsVisible]" id="captionsVisible" value="true" '+ (captionsVisible ? 'checked' : '') +'>'
                 + '            <label for="captionsVisible">'+ labels['SettingsSubtitlesShowByDefault'] +'</label>';

        if (showExistingSubtitles) {
            html += '            <div class="existingSubtitlesContainer"></div>';
        }

        html += '            <div class="newSubtitlesContainer"></div>'
              + '        </div>'
              + '    </div>'
              + '</div>';

        return html;
    }

    /**
     * Generate the video source section HTML
     * @method generateVideoSourceSection
     * @param {Object} options - { 
     *   durationHMS: { hours: 0, minutes: 0, seconds: 4 },
     *   currentResourceId: null,
     *   currentSrc: null,
     *   showUploadButton: true,
     *   durationInputPrefix: '',  // Use 'new_' for edit dialog
     *   isEditMode: false  // If true, includes newResourceId/Src/Duration hidden inputs
     * }
     * @return {String} HTML string
     */
    function generateVideoSourceSection(options) {
        var labels = getLabels();
        options = options || {};
        var durationHMS = options.durationHMS || { hours: 0, minutes: 0, seconds: 4 };
        var currentResourceId = options.currentResourceId || '';
        var currentSrc = options.currentSrc || '';
        var showUploadButton = options.showUploadButton !== false;
        var durationInputPrefix = options.durationInputPrefix || '';
        var isEditMode = options.isEditMode || false;

        var html = '<div class="videoSourceSection">'
                 + '    <div>'+ labels['SettingsVideoSource'] +'</div>'
                 + '    <div class="videoSourceTabs">'
                 + '        <ul>'
                 + '            <li><a href="#ChooseVideo">'+ labels['SettingsChooseVideo'] +'</a></li>'
                 + '            <li><a href="#EmptyVideo">'+ labels['GenericEmptyVideo'] +'</a></li>'
                 + '        </ul>'
                 + '        <div id="ChooseVideo">';

        if (showUploadButton) {
            html += '            <button type="button" class="uploadNewVideoResource">'+ labels['ResourceUploadVideo'] +'</button>';
        }

        html += '            <div class="videoResourceList"></div>'
              + '            <input type="hidden" name="resourcesID" value="'+ currentResourceId +'">'
              + '        </div>'
              + '        <div id="EmptyVideo">'
              + '            <div class="message active">'+ labels['MessageEmptyVideoSetDuration'] +'</div>'
              + '            <label>'+ labels['GenericDuration'] +':</label>'
              + '            <div class="durationInput">'
              + '                <input type="number" name="'+ durationInputPrefix +'duration_hours" min="0" max="99" value="'+ durationHMS.hours +'" class="durationHours"> : '
              + '                <input type="number" name="'+ durationInputPrefix +'duration_minutes" min="0" max="59" value="'+ durationHMS.minutes +'" class="durationMinutes"> : '
              + '                <input type="number" name="'+ durationInputPrefix +'duration_seconds" min="0" max="59" value="'+ durationHMS.seconds +'" class="durationSeconds">'
              + '                <span class="durationLabel">('+ labels['SettingsDurationHoursMinutesSeconds'] +')</span>'
              + '            </div>'
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
     * Generate the language options HTML for subtitle language dropdown
     * @method generateLanguageOptions
     * @return {String} HTML string with option elements
     */
    function generateLanguageOptions() {
        var langOptions = '';
        var langMapping = FrameTrail.module('Database').subtitlesLangMapping;
        
        for (var lang in langMapping) {
            langOptions += '<option value="'+ lang +'">'+ langMapping[lang] +'</option>';
        }
        
        return langOptions;
    }

    /**
     * Create a new subtitle item element
     * @method createSubtitleItem
     * @return {jQuery} jQuery element for a new subtitle item
     */
    function createSubtitleItem() {
        var labels = getLabels();
        var langOptions = generateLanguageOptions();
        
        var languageSelect = '<select class="subtitlesTmpKeySetter">'
                           + '    <option value="" disabled selected style="display:none;">'+ labels['GenericLanguage'] +'</option>'
                           + langOptions
                           + '</select>';

        return $('<span class="subtitlesItem">'+ languageSelect +'<input type="file" name="subtitles[]"><button class="subtitlesRemove" type="button">x</button><br></span>');
    }

    /**
     * Attach subtitle event handlers to a form element
     * @method attachSubtitleHandlers
     * @param {jQuery} formElement - The form jQuery element
     */
    function attachSubtitleHandlers(formElement) {
        // Add new subtitle item
        formElement.find('.subtitlesPlus').on('click', function() {
            var subtitleItem = createSubtitleItem();
            formElement.find('.newSubtitlesContainer').append(subtitleItem);
        });

        // Remove subtitle item
        formElement.find('.newSubtitlesContainer').on('click', '.subtitlesRemove', function(evt) {
            $(this).parent().remove();
        });

        // Update file input name when language is selected
        formElement.find('.newSubtitlesContainer').on('change', '.subtitlesTmpKeySetter', function() {
            $(this).parent().find('input[type="file"]').attr('name', 'subtitles['+ $(this).val() +']');
        });
    }

    /**
     * Populate existing subtitles in the edit dialog
     * @method populateExistingSubtitles
     * @param {jQuery} formElement - The form jQuery element
     * @param {Array} subtitles - Array of subtitle objects { src, srclang }
     */
    function populateExistingSubtitles(formElement, subtitles) {
        if (!subtitles || subtitles.length === 0) return;

        var langMapping = FrameTrail.module('Database').subtitlesLangMapping;
        var container = formElement.find('.existingSubtitlesContainer');

        for (var i = 0; i < subtitles.length; i++) {
            var currentSubtitle = subtitles[i];
            var langName = langMapping[currentSubtitle.srclang] || currentSubtitle.srclang;
            
            var existingItem = $('<div class="existingSubtitlesItem"><span>'+ langName +'</span></div>');
            var deleteButton = $('<button class="subtitlesDelete" type="button" data-lang="'+ currentSubtitle.srclang +'"><span class="icon-cancel"></span></button>');

            deleteButton.click(function(evt) {
                $(this).parent().remove();
                formElement.find('.subtitlesSettingsWrapper').append('<input type="hidden" name="SubtitlesToDelete[]" value="'+ $(this).attr('data-lang') +'">');
            });

            deleteButton.appendTo(existingItem);
            container.append(existingItem);
        }
    }

    /**
     * Validate subtitle fields in a form
     * @method validateSubtitles
     * @param {jQuery} formElement - The form jQuery element
     * @param {jQuery} errorContainer - The error message container
     * @return {Boolean} true if valid, false otherwise
     */
    function validateSubtitles(formElement, errorContainer) {
        var labels = getLabels();
        var err = 0;

        formElement.find('.subtitlesItem').each(function() {
            $(this).css({'outline': ''});

            var fileInput = $(this).find('input[type="file"]:first');
            var langSelect = $(this).find('.subtitlesTmpKeySetter:first');

            // Check if language is selected and file is chosen
            if (fileInput.attr('name') === 'subtitles[]' || 
                langSelect.val() === '' || 
                fileInput.val().length === 0) {
                $(this).css({'outline': '1px solid #cd0a0a'});
                errorContainer.addClass('active').html(labels['ErrorSubtitlesEmptyFields']);
                err++;
            } 
            // Check file extension is .vtt
            else if (!(new RegExp('(' + ['.vtt'].join('|').replace(/\./g, '\\.') + ')$')).test(fileInput.val())) {
                $(this).css({'outline': '1px solid #cd0a0a'});
                errorContainer.addClass('active').html(labels['ErrorSubtitlesWrongFormat']);
                err++;
            }

            // Check for duplicate languages
            var selectedLang = langSelect.val();
            if (selectedLang && formElement.find('.subtitlesItem input[type="file"][name="subtitles['+ selectedLang +']"]').length > 1) {
                errorContainer.addClass('active').html(labels['ErrorSubtitlesLanguageDuplicate']);
                err++;
            }
        });

        return err === 0;
    }

    /**
     * Extract subtitle data from form for saving
     * @method extractSubtitleData
     * @param {jQuery} formElement - The form jQuery element
     * @return {Array} Array of subtitle objects { src, srclang }
     */
    function extractSubtitleData(formElement) {
        var subtitles = [];

        formElement.find('.newSubtitlesContainer').find('input[type=file]').each(function() {
            var match = /subtitles\[(.+)\]/g.exec($(this).attr('name'));

            if (match) {
                subtitles.push({
                    "src": match[1] + ".vtt",
                    "srclang": match[1]
                });
            }
        });

        return subtitles;
    }

    /**
     * Initialize video source tabs with jQuery UI
     * @method initVideoSourceTabs
     * @param {jQuery} formElement - The form jQuery element
     * @param {Boolean} isCanvasVideo - Whether current video is a canvas/empty video
     * @param {Function} onTabChange - Optional callback when tab changes
     */
    function initVideoSourceTabs(formElement, isCanvasVideo, onTabChange) {
        formElement.find('.videoSourceTabs').tabs({
            active: isCanvasVideo ? 1 : 0,
            activate: function(event, ui) {
                if (ui.newPanel.attr('id') === 'EmptyVideo') {
                    formElement.find('input[name="resourcesID"]').prop('disabled', true);
                    formElement.find('.durationInput input').prop('disabled', false);
                    formElement.find('.resourceThumb').removeClass('selected');
                } else {
                    formElement.find('input[name="resourcesID"]').prop('disabled', false);
                    formElement.find('.durationInput input').prop('disabled', true);
                }
                if (onTabChange) onTabChange(event, ui);
            }
        });
    }

    // Export public interface
    return {

        secondsToHMS: secondsToHMS,
        hmsToSeconds: hmsToSeconds,

        generateSettingsRow: generateSettingsRow,
        generateVideoSourceSection: generateVideoSourceSection,

        createSubtitleItem: createSubtitleItem,
        attachSubtitleHandlers: attachSubtitleHandlers,
        populateExistingSubtitles: populateExistingSubtitles,
        validateSubtitles: validateSubtitles,
        extractSubtitleData: extractSubtitleData,
        initVideoSourceTabs: initVideoSourceTabs

    };

});
