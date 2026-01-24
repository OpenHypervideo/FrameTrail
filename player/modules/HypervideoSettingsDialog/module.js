/**
 * @module Player
 */

/**
 * I am the HypervideoSettingsDialog. I provide a dialog for editing hypervideo-specific settings.
 *
 * @class HypervideoSettingsDialog
 * @static
 */

FrameTrail.defineModule('HypervideoSettingsDialog', function(FrameTrail){

    var labels = FrameTrail.module('Localization').labels;

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
     * Get items that would be out of range if duration is changed
     * @method getOutOfRangeItems
     * @param {Number} newDuration - new duration in seconds
     * @return {Object} { overlays: [], codeSnippets: [], annotations: [], hasAffectedItems: Boolean }
     */
    function getOutOfRangeItems(newDuration) {
        var HypervideoModel = FrameTrail.module('HypervideoModel');
        var outOfRange = { 
            overlays: [], 
            codeSnippets: [], 
            annotations: [],
            hasAffectedItems: false
        };
        
        // Check overlays (start >= newDuration OR end > newDuration)
        if (HypervideoModel.overlays) {
            HypervideoModel.overlays.forEach(function(overlay) {
                if (overlay.data.start >= newDuration) {
                    outOfRange.overlays.push({ item: overlay, action: 'delete' });
                    outOfRange.hasAffectedItems = true;
                } else if (overlay.data.end > newDuration) {
                    outOfRange.overlays.push({ item: overlay, action: 'truncate', newEnd: newDuration });
                    outOfRange.hasAffectedItems = true;
                }
            });
        }
        
        // Check code snippets (only have start time)
        if (HypervideoModel.codeSnippets) {
            HypervideoModel.codeSnippets.forEach(function(snippet) {
                if (snippet.data.start >= newDuration) {
                    outOfRange.codeSnippets.push({ item: snippet, action: 'delete' });
                    outOfRange.hasAffectedItems = true;
                }
            });
        }
        
        // Check annotations (all user annotations)
        if (HypervideoModel.annotations) {
            HypervideoModel.annotations.forEach(function(anno) {
                if (anno.data.start >= newDuration) {
                    outOfRange.annotations.push({ item: anno, action: 'delete' });
                    outOfRange.hasAffectedItems = true;
                } else if (anno.data.end > newDuration) {
                    outOfRange.annotations.push({ item: anno, action: 'truncate', newEnd: newDuration });
                    outOfRange.hasAffectedItems = true;
                }
            });
        }
        
        return outOfRange;
    }

    /**
     * Format time in seconds to MM:SS or HH:MM:SS string
     * @method formatTime
     * @param {Number} seconds
     * @return {String}
     */
    function formatTime(seconds) {
        var hms = secondsToHMS(seconds);
        if (hms.hours > 0) {
            return hms.hours + ':' + String(hms.minutes).padStart(2, '0') + ':' + String(hms.seconds).padStart(2, '0');
        }
        return hms.minutes + ':' + String(hms.seconds).padStart(2, '0');
    }

    /**
     * Apply duration change - delete or truncate out-of-range items
     * @method applyDurationChange
     * @param {Number} newDuration
     * @param {Object} outOfRangeItems
     * @param {Object} DatabaseEntry
     */
    function applyDurationChange(newDuration, outOfRangeItems, DatabaseEntry) {
        var HypervideoModel = FrameTrail.module('HypervideoModel');
        
        // Delete fully out-of-range overlays
        outOfRangeItems.overlays.filter(function(i) { return i.action === 'delete'; }).forEach(function(item) {
            var index = HypervideoModel.overlays.indexOf(item.item);
            if (index > -1) {
                HypervideoModel.overlays.splice(index, 1);
            }
        });
        
        // Truncate partially out-of-range overlays
        outOfRangeItems.overlays.filter(function(i) { return i.action === 'truncate'; }).forEach(function(item) {
            item.item.data.end = item.newEnd;
        });
        
        // Delete out-of-range code snippets
        outOfRangeItems.codeSnippets.filter(function(i) { return i.action === 'delete'; }).forEach(function(item) {
            var index = HypervideoModel.codeSnippets.indexOf(item.item);
            if (index > -1) {
                HypervideoModel.codeSnippets.splice(index, 1);
            }
        });
        
        // Delete fully out-of-range annotations
        outOfRangeItems.annotations.filter(function(i) { return i.action === 'delete'; }).forEach(function(item) {
            var index = HypervideoModel.annotations.indexOf(item.item);
            if (index > -1) {
                HypervideoModel.annotations.splice(index, 1);
            }
        });
        
        // Truncate partially out-of-range annotations
        outOfRangeItems.annotations.filter(function(i) { return i.action === 'truncate'; }).forEach(function(item) {
            item.item.data.end = item.newEnd;
        });
        
        // Update duration in database entry
        if (DatabaseEntry.clips && DatabaseEntry.clips[0]) {
            DatabaseEntry.clips[0].duration = newDuration;
        }
        
        // Update HypervideoModel duration
        HypervideoModel.durationFull = newDuration;
        HypervideoModel.duration = newDuration - HypervideoModel.offsetIn;
    }

    /**
     * Show confirmation dialog for duration change with affected items
     * @method showDurationChangeConfirmation
     * @param {Number} newDuration
     * @param {Object} outOfRangeItems
     * @param {Function} onConfirm - callback when user confirms
     * @param {Function} onCancel - callback when user cancels
     */
    function showDurationChangeConfirmation(newDuration, outOfRangeItems, onConfirm, onCancel) {
        var messageLines = [];
        var formattedTime = formatTime(newDuration);
        
        var overlaysToDelete = outOfRangeItems.overlays.filter(function(i) { return i.action === 'delete'; }).length;
        var overlaysToTruncate = outOfRangeItems.overlays.filter(function(i) { return i.action === 'truncate'; }).length;
        var snippetsToDelete = outOfRangeItems.codeSnippets.filter(function(i) { return i.action === 'delete'; }).length;
        var annotationsToDelete = outOfRangeItems.annotations.filter(function(i) { return i.action === 'delete'; }).length;
        var annotationsToTruncate = outOfRangeItems.annotations.filter(function(i) { return i.action === 'truncate'; }).length;
        
        if (overlaysToDelete > 0) {
            messageLines.push('• ' + overlaysToDelete + ' ' + labels['DurationChangeOverlaysDeleted']);
        }
        if (overlaysToTruncate > 0) {
            messageLines.push('• ' + overlaysToTruncate + ' ' + labels['DurationChangeOverlaysTruncated'] + ' ' + formattedTime);
        }
        if (snippetsToDelete > 0) {
            messageLines.push('• ' + snippetsToDelete + ' ' + labels['DurationChangeCodeSnippetsDeleted']);
        }
        if (annotationsToDelete > 0) {
            messageLines.push('• ' + annotationsToDelete + ' ' + labels['DurationChangeAnnotationsDeleted']);
        }
        if (annotationsToTruncate > 0) {
            messageLines.push('• ' + annotationsToTruncate + ' ' + labels['DurationChangeAnnotationsTruncated'] + ' ' + formattedTime);
        }
        
        var confirmDialog = $('<div class="durationChangeConfirmDialog" title="'+ labels['DurationChangeWarningTitle'] +'">'
                            + '    <div class="message active">'+ labels['DurationChangeWarningMessage'] +'</div>'
                            + '    <div class="affectedItems">' + messageLines.join('<br>') + '</div>'
                            + '</div>');
        
        confirmDialog.dialog({
            modal: true,
            resizable: false,
            width: 450,
            close: function() {
                $(this).remove();
                if (onCancel) onCancel();
            },
            buttons: [
                { text: labels['GenericApply'],
                    click: function() {
                        confirmDialog.dialog('close');
                        if (onConfirm) onConfirm();
                    }
                },
                { text: labels['GenericCancel'],
                    click: function() {
                        confirmDialog.dialog('close');
                    }
                }
            ]
        });
    }

    /**
     * I open the hypervideo settings dialog for a specific hypervideo.
     * @method open
     * @param {String} hypervideoID
     */
    function open(hypervideoID) {

        var database = FrameTrail.module('Database'),
            hypervideo = database.hypervideos[hypervideoID],
            thisID = hypervideoID;

        if (!hypervideo) {
            console.error('Hypervideo not found:', hypervideoID);
            return;
        }

        // Check if this is a canvas (empty) video - no resourceId means canvas
        var isCanvasVideo = hypervideo.clips && hypervideo.clips[0] && !hypervideo.clips[0].resourceId && !hypervideo.clips[0].src;
        var originalDuration = isCanvasVideo ? (hypervideo.clips[0].duration || 0) : 0;
        var originalDurationHMS = secondsToHMS(originalDuration);
        var pendingDurationChange = null; // Will hold { newDuration, outOfRangeItems } if duration change needs confirmation
        
        // Video source replacement tracking
        var originalResourceId = hypervideo.clips && hypervideo.clips[0] ? hypervideo.clips[0].resourceId : null;
        var originalSrc = hypervideo.clips && hypervideo.clips[0] ? hypervideo.clips[0].src : null;
        var pendingSourceChange = null; // Will hold { resourceId, src, duration, outOfRangeItems } if source change needs confirmation
        var sourceChangeConfirmed = false;


        var EditHypervideoForm = $('<form method="POST" class="editHypervideoForm">'
                                  +'    <div class="message error"></div>'
                                  +'    <div class="layoutRow">'
                                  +'        <div class="column-3">'
                                  +'            <label for="name">'+ labels['SettingsHypervideoName'] +'</label>'
                                  +'            <input type="text" name="name" placeholder="'+ labels['SettingsHypervideoName'] +'" value="'+ (hypervideo.name || '') +'"><br>'
                                  +'            <input type="checkbox" name="hidden" id="hypervideo_hidden" value="hidden" '+((hypervideo.hidden && hypervideo.hidden.toString() == "true") ? "checked" : "")+'>'
                                  +'            <label for="hypervideo_hidden">'+ labels['SettingsHiddenFromOtherUsers'] +'</label>'
                                  +'        </div>'
                                  +'        <div class="column-3">'
                                  +'            <label for="description">'+ labels['GenericDescription'] +'</label>'
                                  +'            <textarea name="description" placeholder="'+ labels['GenericDescription'] +'">'+ (hypervideo.description || '') +'</textarea><br>'
                                  +'        </div>'
                                  +'        <div class="column-6">'
                                  +'            <div class="subtitlesSettingsWrapper">'
                                  +'                <div>'+ labels['GenericSubtitles'] +' ('+ labels['MessageSubtitlesAlsoUsedForInteractiveTranscripts'] +')</div>'
                                  +'                <button class="subtitlesPlus" type="button">'+ labels['GenericAdd'] +' <span class="icon-plus"></span></button>'
                                  +'                <input type="checkbox" name="config[captionsVisible]" id="captionsVisible" value="true" '+((hypervideo.config && hypervideo.config.captionsVisible && hypervideo.config.captionsVisible.toString() == 'true') ? "checked" : "")+'>'
                                  +'                <label for="captionsVisible">'+ labels['SettingsSubtitlesShowByDefault'] +'</label>'
                                  +'                <div class="existingSubtitlesContainer"></div>'
                                  +'                <div class="newSubtitlesContainer"></div>'
                                  +'            </div>'
                                  +'        </div>'
                                  +'    </div>'
                                  +'    <hr>'
                                  +'    <div class="videoSourceSection">'
                                  +'        <div>'+ labels['SettingsVideoSource'] +'</div>'
                                  +'        <div class="videoSourceSelector">'
                                  +'            <div class="videoSourceTabs">'
                                  +'                <ul>'
                                  +'                    <li><a href="#ChooseNewVideo">'+ labels['SettingsChooseVideo'] +'</a></li>'
                                  +'                    <li><a href="#SetEmptyVideo">'+ labels['GenericEmptyVideo'] +'</a></li>'
                                  +'                </ul>'
                                  +'                <div id="ChooseNewVideo">'
                                  +'                    <div class="videoResourceList"></div>'
                                  +'                </div>'
                                  +'                <div id="SetEmptyVideo">'
                                  +'                    <div class="emptyVideoDurationInput">'
                                  +'                        <label>'+ labels['GenericDuration'] +':</label>'
                                  +'                        <div class="durationInput">'
                                  +'                            <input type="number" name="new_duration_hours" min="0" max="99" value="'+ (isCanvasVideo ? originalDurationHMS.hours : 0) +'" class="durationHours"> : '
                                  +'                            <input type="number" name="new_duration_minutes" min="0" max="59" value="'+ (isCanvasVideo ? originalDurationHMS.minutes : 5) +'" class="durationMinutes"> : '
                                  +'                            <input type="number" name="new_duration_seconds" min="0" max="59" value="'+ (isCanvasVideo ? originalDurationHMS.seconds : 0) +'" class="durationSeconds">'
                                  +'                            <span class="durationLabel">('+ labels['SettingsDurationHoursMinutesSeconds'] +')</span>'
                                  +'                        </div>'
                                  +'                    </div>'
                                  +'                </div>'
                                  +'            </div>'
                                  +'            <input type="hidden" name="newResourceId" value="'+ (originalResourceId || '') +'">'
                                  +'            <input type="hidden" name="newResourceSrc" value="'+ (originalSrc || '') +'">'
                                  +'            <input type="hidden" name="newResourceDuration" value="">'
                                  +'        </div>'
                                  +'    </div>'
                                  +'    <div class="message error"></div>'
                                  +'</form>');
        
        // Helper to get duration from form inputs (uses Empty Video tab inputs)
        function getDurationFromForm() {
            if (!isCanvasVideo) return originalDuration;
            var hours = parseInt(EditHypervideoForm.find('input[name="new_duration_hours"]').val()) || 0;
            var minutes = parseInt(EditHypervideoForm.find('input[name="new_duration_minutes"]').val()) || 0;
            var seconds = parseInt(EditHypervideoForm.find('input[name="new_duration_seconds"]').val()) || 0;
            return hmsToSeconds(hours, minutes, seconds);
        }

        if (hypervideo.subtitles && hypervideo.subtitles.length > 0) {
            var langMapping = database.subtitlesLangMapping;

            for (var i=0; i < hypervideo.subtitles.length; i++) {
                var currentSubtitles = hypervideo.subtitles[i],
                    existingSubtitlesItem = $('<div class="existingSubtitlesItem"><span>'+ langMapping[hypervideo.subtitles[i].srclang] +'</span></div>'),
                    existingSubtitlesDelete = $('<button class="subtitlesDelete" type="button" data-lang="'+ hypervideo.subtitles[i].srclang +'"><span class="icon-cancel"></span></button>');

                existingSubtitlesDelete.click(function(evt) {
                    $(this).parent().remove();
                    EditHypervideoForm.find('.subtitlesSettingsWrapper').append('<input type="hidden" name="SubtitlesToDelete[]" value="'+ $(this).attr('data-lang') +'">');
                }).appendTo(existingSubtitlesItem);

                EditHypervideoForm.find('.existingSubtitlesContainer').append(existingSubtitlesItem);
            }
        }

        // Manage Subtitles
        EditHypervideoForm.find('.subtitlesPlus').on('click', function() {
            var langOptions = '';
            for (var lang in FrameTrail.module('Database').subtitlesLangMapping) {
                langOptions += '<option value="'+ lang +'">'+ FrameTrail.module('Database').subtitlesLangMapping[lang] +'</option>';
            }

            var languageSelect =  '<select class="subtitlesTmpKeySetter">'
                            + '    <option value="" disabled selected style="display:none;">'+ labels['GenericLanguage'] +'</option>'
                            + langOptions
                            + '</select>';

            EditHypervideoForm.find('.newSubtitlesContainer').append('<span class="subtitlesItem">'+ languageSelect +'<input type="file" name="subtitles[]"><button class="subtitlesRemove" type="button">x</button><br></span>');
        });

        EditHypervideoForm.find('.newSubtitlesContainer').on('click', '.subtitlesRemove', function(evt) {
            $(this).parent().remove();
        });

        EditHypervideoForm.find('.newSubtitlesContainer').on('change', '.subtitlesTmpKeySetter', function() {
            $(this).parent().find('input[type="file"]').attr('name', 'subtitles['+$(this).val()+']');
        });

        // Video Source Tabs Initialization
        (function() {
            var tabs = EditHypervideoForm.find('.videoSourceTabs');
            var videoList = EditHypervideoForm.find('.videoResourceList');
            
            // Render video resources list
            FrameTrail.module('ResourceManager').renderList(videoList, true, 'type', 'contains', ['video', 'youtube', 'vimeo']);
            
            // Pre-select current video resource after list is loaded (watch for loading screen removal)
            if (originalResourceId) {
                var checkLoaded = setInterval(function() {
                    if (videoList.find('.loadingScreen').length === 0) {
                        clearInterval(checkLoaded);
                        // Use data-resourceID (capital ID) to match the actual attribute
                        videoList.find('.resourceThumb[data-resourceID="' + originalResourceId + '"]').addClass('selected');
                    }
                }, 100);
            }
            
            // Initialize jQuery UI tabs with appropriate active tab
            tabs.tabs({
                active: isCanvasVideo ? 1 : 0, // Empty Video tab if canvas, Choose Video tab otherwise
                activate: function(event, ui) {
                    // Don't clear selection when switching tabs - preserve current selection
                }
            });
        })();

        // Handle video resource selection
        EditHypervideoForm.on('click', '.videoResourceList .resourceThumb', function() {
            EditHypervideoForm.find('.videoResourceList .resourceThumb').removeClass('selected');
            $(this).addClass('selected');
            
            var resourceId = $(this).data('resourceid');
            var resource = database.resources[resourceId];
            
            EditHypervideoForm.find('input[name="newResourceId"]').val(resourceId);
            EditHypervideoForm.find('input[name="newResourceSrc"]').val(resource ? resource.src : '');
            // Duration will be determined when video loads - for now use 0 as placeholder
            EditHypervideoForm.find('input[name="newResourceDuration"]').val(resource ? (resource.duration || 0) : 0);
        });

        // Helper to get new empty video duration
        function getNewEmptyDuration() {
            var hours = parseInt(EditHypervideoForm.find('input[name="new_duration_hours"]').val()) || 0;
            var minutes = parseInt(EditHypervideoForm.find('input[name="new_duration_minutes"]').val()) || 0;
            var seconds = parseInt(EditHypervideoForm.find('input[name="new_duration_seconds"]').val()) || 0;
            return hmsToSeconds(hours, minutes, seconds);
        }

        // Check if source is being changed
        function isSourceChanging() {
            var tabs = EditHypervideoForm.find('.videoSourceTabs');
            var activeTabIndex = tabs.hasClass('ui-tabs') ? tabs.tabs('option', 'active') : 0;
            
            if (activeTabIndex === 0) { // Choose Video tab
                var newResourceId = EditHypervideoForm.find('input[name="newResourceId"]').val();
                // Source is changing if a different resource is selected
                return newResourceId && newResourceId != originalResourceId;
            } else if (activeTabIndex === 1) { // Empty Video tab
                // Converting to empty video - changing if currently NOT canvas, or duration changed
                if (!isCanvasVideo) return true; // Changing from video to empty
                return getNewEmptyDuration() !== originalDuration;
            }
            return false;
        }

        // Get the new source info
        function getNewSourceInfo() {
            var tabs = EditHypervideoForm.find('.videoSourceTabs');
            var activeTabIndex = tabs.hasClass('ui-tabs') ? tabs.tabs('option', 'active') : 0;
            
            if (activeTabIndex === 0) { // Choose Video tab
                var newResourceId = EditHypervideoForm.find('input[name="newResourceId"]').val();
                var resource = database.resources[newResourceId];
                return {
                    type: 'video',
                    resourceId: newResourceId,
                    src: resource ? resource.src : '',
                    duration: resource ? (resource.duration || 0) : 0,
                    thumb: resource ? resource.thumb : null
                };
            } else { // Empty Video tab
                return {
                    type: 'empty',
                    resourceId: null,
                    src: null,
                    duration: getNewEmptyDuration(),
                    thumb: null
                };
            }
        }

        function updateDatabaseFromForm() {
            // Only called when saving - apply changes to database
            var DatabaseEntry = FrameTrail.module('Database').hypervideos[thisID];

            DatabaseEntry.name = EditHypervideoForm.find('input[name="name"]').val();
            DatabaseEntry.description = EditHypervideoForm.find('textarea[name="description"]').val();
            DatabaseEntry.hidden = EditHypervideoForm.find('input[name="hidden"]').is(':checked');
            
            if (DatabaseEntry.config) {
                for (var configKey in DatabaseEntry.config) {
                    if (configKey === 'layoutArea' || configKey === 'theme') { continue; }
                    var newConfigVal = EditHypervideoForm.find('input[data-configkey=' + configKey + ']').val();
                    newConfigVal = (newConfigVal === 'true')
                                    ? true
                                    : (newConfigVal === 'false')
                                        ? false
                                        : (newConfigVal === undefined)
                                            ? DatabaseEntry.config[configKey]
                                            : newConfigVal;
                    DatabaseEntry.config[configKey] = newConfigVal;
                }
            }

            // Handle video source change
            if (pendingSourceChange) {
                // Apply out-of-range item changes
                if (pendingSourceChange.outOfRangeItems && pendingSourceChange.outOfRangeItems.hasAffectedItems) {
                    applyDurationChange(pendingSourceChange.duration, pendingSourceChange.outOfRangeItems, DatabaseEntry);
                }
                
                // Update source in clips
                if (DatabaseEntry.clips && DatabaseEntry.clips[0]) {
                    DatabaseEntry.clips[0].resourceId = pendingSourceChange.resourceId;
                    DatabaseEntry.clips[0].src = pendingSourceChange.src;
                    DatabaseEntry.clips[0].duration = pendingSourceChange.duration;
                }
                
                // Update thumbnail to match new video source
                DatabaseEntry.thumb = pendingSourceChange.thumb;
                
                // Update HypervideoModel if this is the current hypervideo
                if (thisID == FrameTrail.module('RouteNavigation').hypervideoID) {
                    var HypervideoModel = FrameTrail.module('HypervideoModel');
                    HypervideoModel.durationFull = pendingSourceChange.duration;
                    HypervideoModel.duration = pendingSourceChange.duration - HypervideoModel.offsetIn;
                }
                
                pendingSourceChange = null;
            }
            // Handle duration change for canvas videos (when not changing source)
            else if (isCanvasVideo && pendingDurationChange) {
                applyDurationChange(pendingDurationChange.newDuration, pendingDurationChange.outOfRangeItems, DatabaseEntry);
                pendingDurationChange = null;
            } else if (isCanvasVideo) {
                // No affected items, just update duration directly
                var newDuration = getDurationFromForm();
                if (DatabaseEntry.clips && DatabaseEntry.clips[0]) {
                    DatabaseEntry.clips[0].duration = newDuration;
                }
                // Update HypervideoModel if this is the current hypervideo
                if (thisID == FrameTrail.module('RouteNavigation').hypervideoID) {
                    var HypervideoModel = FrameTrail.module('HypervideoModel');
                    HypervideoModel.durationFull = newDuration;
                    HypervideoModel.duration = newDuration - HypervideoModel.offsetIn;
                }
            }

            if (!DatabaseEntry.subtitles) {
                DatabaseEntry.subtitles = [];
            }
            DatabaseEntry.subtitles.splice(0, DatabaseEntry.subtitles.length);

            EditHypervideoForm.find('.existingSubtitlesItem').each(function () {
                var lang = $(this).find('.subtitlesDelete').attr('data-lang');
                if (lang) {
                    DatabaseEntry.subtitles.push({
                        "src": lang +".vtt",
                        "srclang": lang
                    });
                }
            });

            EditHypervideoForm.find('.newSubtitlesContainer').find('input[type=file]').each(function () {
                var match = /subtitles\[(.+)\]/g.exec($(this).attr('name'));
                if (match) {
                    DatabaseEntry.subtitles.push({
                        "src": match[1] +".vtt",
                        "srclang": match[1]
                    });
                }
            });
        }

        EditHypervideoForm.ajaxForm({
            method:     'POST',
            url:        '_server/ajaxServer.php',
            beforeSubmit: function (array, form, options) {
                updateDatabaseFromForm();
                array.push({ name: 'src', value:  JSON.stringify(FrameTrail.module("Database").convertToDatabaseFormat(thisID), null, 4) });
            },
            beforeSerialize: function(form, options) {
                // Clear error messages
                EditHypervideoForm.find('.message.error').removeClass('active').html('');

                // Check for video source change
                if (isSourceChanging() && !sourceChangeConfirmed) {
                    var newSourceInfo = getNewSourceInfo();
                    
                    // Validate empty video duration
                    if (newSourceInfo.type === 'empty' && newSourceInfo.duration < 4) {
                        EditHypervideoForm.find('.message.error').addClass('active').html(labels['ErrorDurationMinimum4Seconds']);
                        return false;
                    }
                    
                    // Get current duration for comparison
                    var currentDuration = isCanvasVideo ? originalDuration : (FrameTrail.module('HypervideoModel').durationFull || 0);
                    
                    // Check if new duration is shorter and would affect items
                    if (newSourceInfo.duration > 0 && newSourceInfo.duration < currentDuration) {
                        var outOfRangeItems = getOutOfRangeItems(newSourceInfo.duration);
                        
                        if (outOfRangeItems.hasAffectedItems) {
                            // Show confirmation dialog
                            showDurationChangeConfirmation(newSourceInfo.duration, outOfRangeItems, function() {
                                // User confirmed
                                pendingSourceChange = {
                                    resourceId: newSourceInfo.resourceId,
                                    src: newSourceInfo.src,
                                    duration: newSourceInfo.duration,
                                    thumb: newSourceInfo.thumb,
                                    outOfRangeItems: outOfRangeItems
                                };
                                sourceChangeConfirmed = true;
                                EditHypervideoForm.submit();
                            }, function() {
                                // User cancelled - restore original selection
                                EditHypervideoForm.find('.videoResourceList .resourceThumb').removeClass('selected');
                                if (originalResourceId) {
                                    EditHypervideoForm.find('.videoResourceList .resourceThumb[data-resourceID="' + originalResourceId + '"]').addClass('selected');
                                    EditHypervideoForm.find('input[name="newResourceId"]').val(originalResourceId);
                                } else {
                                    EditHypervideoForm.find('input[name="newResourceId"]').val('');
                                }
                                // Switch back to original tab
                                var tabs = EditHypervideoForm.find('.videoSourceTabs');
                                tabs.tabs('option', 'active', isCanvasVideo ? 1 : 0);
                            });
                            return false;
                        }
                    }
                    
                    // No affected items or new video is longer - proceed with source change
                    pendingSourceChange = {
                        resourceId: newSourceInfo.resourceId,
                        src: newSourceInfo.src,
                        duration: newSourceInfo.duration,
                        thumb: newSourceInfo.thumb,
                        outOfRangeItems: null
                    };
                    sourceChangeConfirmed = true;
                }

                // Duration validation for canvas videos (when not changing source)
                if (isCanvasVideo && !pendingSourceChange) {
                    var newDuration = getDurationFromForm();
                    
                    // Check minimum duration (4 seconds)
                    if (newDuration < 4) {
                        EditHypervideoForm.find('.message.error').addClass('active').html(labels['ErrorDurationMinimum4Seconds']);
                        return false;
                    }
                    
                    // Check if duration is being decreased
                    if (newDuration < originalDuration) {
                        var outOfRangeItems = getOutOfRangeItems(newDuration);
                        
                        if (outOfRangeItems.hasAffectedItems && !pendingDurationChange) {
                            // Show confirmation dialog and abort this submit
                            showDurationChangeConfirmation(newDuration, outOfRangeItems, function() {
                                // User confirmed - store the pending change and resubmit
                                pendingDurationChange = { newDuration: newDuration, outOfRangeItems: outOfRangeItems };
                                EditHypervideoForm.submit();
                            }, function() {
                                // User cancelled - reset duration inputs to original values
                                var hms = secondsToHMS(originalDuration);
                                EditHypervideoForm.find('input[name="new_duration_hours"]').val(hms.hours);
                                EditHypervideoForm.find('input[name="new_duration_minutes"]').val(hms.minutes);
                                EditHypervideoForm.find('input[name="new_duration_seconds"]').val(hms.seconds);
                            });
                            return false;
                        }
                    }
                }

                // Subtitles Validation

                var err = 0;
                EditHypervideoForm.find('.subtitlesItem').each(function() {
                    $(this).css({'outline': ''});

                    if (($(this).find('input[type="file"]:first').attr('name') == 'subtitles[]') || ($(this).find('.subtitlesTmpKeySetter').first().val() == '')
                            || ($(this).find('input[type="file"]:first').val().length == 0)) {
                        $(this).css({'outline': '1px solid #cd0a0a'});
                        EditHypervideoForm.find('.message.error').addClass('active').html(labels['ErrorSubtitlesEmptyFields']);
                        err++;
                    } else if ( !(new RegExp('(' + ['.vtt'].join('|').replace(/\./g, '\\.') + ')$')).test($(this).find('input[type="file"]:first').val()) ) {
                        $(this).css({'outline': '1px solid #cd0a0a'});
                        EditHypervideoForm.find('.message.error').addClass('active').html(labels['ErrorSubtitlesWrongFormat']);
                        err++;
                    }

                    if (EditHypervideoForm.find('.subtitlesItem input[type="file"][name="subtitles['+ $(this).find('.subtitlesTmpKeySetter:first').val() +']"]').length > 1
                            || (EditHypervideoForm.find('.existingSubtitlesItem .subtitlesDelete[data-lang="'+ $(this).find('.subtitlesTmpKeySetter:first').val() +'"]').length > 0 ) ) {
                        EditHypervideoForm.find('.message.error').addClass('active').html(labels['ErrorSubtitlesLanguageDuplicate']);
                        return false;
                    }
                });
                if (err > 0) {
                    return false;
                }
            },
            dataType: 'json',
            data: {
                'a': 'hypervideoChange',
                'hypervideoID': thisID
            },
            success: function(response) {
                switch(response['code']) {
                    case 0:
                        // If source was changed, update annotation sources on server
                        var sourceWasChanged = sourceChangeConfirmed;
                        var newSourcePath = null;
                        
                        if (sourceWasChanged) {
                            var newSourceInfo = getNewSourceInfo();
                            newSourcePath = newSourceInfo.src;
                        }
                        
                        // Function to complete the update
                        function completeUpdate() {
                            FrameTrail.module('Database').loadHypervideoData(
                                function(){
                                    if (thisID == FrameTrail.module('RouteNavigation').hypervideoID) {
                                        FrameTrail.module('Database').hypervideo = FrameTrail.module('Database').hypervideos[thisID];

                                        var name = EditHypervideoForm.find('input[name="name"]').val(),
                                            description = EditHypervideoForm.find('textarea[name="description"]').val();

                                        FrameTrail.module('HypervideoModel').hypervideoName = name;
                                        FrameTrail.module('HypervideoModel').description = description;

                                        FrameTrail.module('HypervideoController').updateDescriptions();

                                        // re-init subtitles
                                        FrameTrail.module('Database').loadSubtitleData(
                                            function() {
                                                FrameTrail.module('ViewOverview').refreshList();

                                                FrameTrail.module('HypervideoModel').subtitleFiles = FrameTrail.module('Database').hypervideo.subtitles;
                                                FrameTrail.module('HypervideoModel').initModelOfSubtitles(FrameTrail.module('Database'));
                                                FrameTrail.module('SubtitlesController').initController();
                                                FrameTrail.changeState('hv_config_captionsVisible', false);

                                                // Refresh timeline if duration or source changed
                                                if (isCanvasVideo || sourceWasChanged) {
                                                    FrameTrail.module('OverlaysController').initController();
                                                    FrameTrail.module('CodeSnippetsController').initController();
                                                    FrameTrail.module('AnnotationsController').initController();
                                                }

                                                // If source was changed, reload the hypervideo to get new video
                                                if (sourceWasChanged) {
                                                    FrameTrail.module('HypervideoModel').updateHypervideo(thisID, FrameTrail.getState('editMode'), true);
                                                }

                                                hypervideoDialog.dialog('close');
                                            },
                                            function() {}
                                        );

                                        FrameTrail.changeState('viewSize', FrameTrail.getState('viewSize'));
                                    } else {
                                        FrameTrail.module('ViewOverview').refreshList();
                                        hypervideoDialog.dialog('close');
                                    }
                                },
                                function(){
                                    EditHypervideoForm.find('.message.error').addClass('active').html(labels['ErrorUpdatingHypervideoData']);
                                }
                            );
                        }
                        
                        // If source changed, update annotation sources first
                        if (sourceWasChanged && newSourcePath !== null) {
                            $.ajax({
                                url: '_server/ajaxServer.php',
                                method: 'POST',
                                dataType: 'json',
                                data: {
                                    'a': 'updateAnnotationSources',
                                    'hypervideoID': thisID,
                                    'newSourcePath': newSourcePath
                                },
                                success: function(annotationResponse) {
                                    // Continue with the rest of the update regardless of annotation update result
                                    completeUpdate();
                                },
                                error: function() {
                                    // Continue anyway - annotation source update is not critical
                                    completeUpdate();
                                }
                            });
                        } else {
                            completeUpdate();
                        }
                        break;
                    default:
                        EditHypervideoForm.find('.message.error').addClass('active').html('Error: '+ response['string']);
                        break;
                }
            }
        });

        var hypervideoDialog = $('<div class="hypervideoSettingsDialog" title="'+ labels['SettingsHypervideoSettings'] +'"></div>');
        hypervideoDialog.append(EditHypervideoForm);

        hypervideoDialog.dialog({
            modal: true,
            resizable: false,
            width: 830,
            height: 600,
            close: function() {
                // If dialog was closed without saving (X button or ESC), nothing happens
                // No changes were applied, so no revert needed
                $(this).remove();
            },
            buttons: [
                { text: labels['GenericSaveChanges'] || labels['GenericApply'] || 'Save',
                    click: function() {
                        EditHypervideoForm.submit();
                    }
                },
                { text: labels['GenericCancel'],
                    click: function() {
                        // Close without applying changes (nothing was applied, so no revert needed)
                        hypervideoDialog.dialog('close');
                    }
                }
            ]
        });
    }

    return {
        open: open
    };

});
