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

    // Live references into the currently open dialog, so the collabState
    // listener can refresh presence without rebuilding anything.
    var presenceContainer     = null,
        lockMessageEl         = null,
        saveButtonEl          = null,
        lockScopeId           = null,
        lockClaimedByDialog   = false,
        sessionOpenedByDialog = false;


    /**
     * This dialog writes the whole hypervideo.json — the very file the editor's
     * soft lock protects — so it takes the same hypervideo scope rather than a
     * scope of its own.
     *
     * @method claimHypervideoLock
     * @param {Object} dialogCtrl
     * @param {String} hypervideoID
     */
    function claimHypervideoLock(dialogCtrl, hypervideoID) {

        var Collaboration = FrameTrail.module('Collaboration');
        if (!Collaboration || !Collaboration.isActive()) return;

        var buttonPane = dialogCtrl.widget().querySelector('.ft-dialog-buttonpane');
        if (!buttonPane) return;

        // Save is the first button as authored; capture it up front so nothing
        // added later can make a positional lookup pick the wrong element.
        saveButtonEl = buttonPane.querySelector('button');
        lockScopeId  = String(hypervideoID);

        var mounted = Collaboration.mountDialogPresence(dialogCtrl);
        if (!mounted) return;

        presenceContainer = mounted.presence;
        lockMessageEl     = mounted.message;

        // Opened from the overview, this dialog is routinely about a hypervideo
        // other than the loaded one — and the hypervideo scope is single: an
        // out-of-band start re-targets the primary session, stopping the loaded
        // video's. Remembering that here is what lets the close path put it
        // back, instead of leaving the sidebar's notices, setEditing and the
        // edit lock all pointed at a video nobody is watching.
        sessionOpenedByDialog = (lockScopeId !== String(FrameTrail.module('RouteNavigation').hypervideoID));

        Collaboration.start('hypervideo', lockScopeId);

        // Already ours from edit mode? Then leave it exactly as it is — taking
        // it again would make us release it when this dialog closes, dropping
        // a lock the editor behind us still needs.
        if (Collaboration.hasLock('hypervideo', lockScopeId)) {
            updateHypervideoPresence();
            return;
        }

        Collaboration.claim(function(result) {
            lockClaimedByDialog = !!(result && result.ok);
            updateHypervideoPresence();
        }, 'hypervideo', lockScopeId);

    }


    /**
     * Release only what this dialog itself claimed.
     *
     * @method releaseHypervideoLock
     */
    function releaseHypervideoLock() {

        var Collaboration = FrameTrail.module('Collaboration');

        if (Collaboration && lockClaimedByDialog && lockScopeId !== null) {
            Collaboration.release(null, 'hypervideo', lockScopeId);
        }

        // Hand the primary hypervideo scope back to whatever is actually
        // loaded. start() is a no-op when its session already exists, so the
        // ordinary case — the dialog opened on the loaded video — never gets
        // here at all.
        if (Collaboration && sessionOpenedByDialog && lockScopeId !== null) {

            Collaboration.stop('hypervideo', lockScopeId);

            var loadedID = FrameTrail.module('RouteNavigation').hypervideoID;
            if (loadedID) {
                Collaboration.start('hypervideo', loadedID);
            }

        }

        presenceContainer     = null;
        lockMessageEl         = null;
        saveButtonEl          = null;
        lockScopeId           = null;
        lockClaimedByDialog   = false;
        sessionOpenedByDialog = false;

    }


    /**
     * Avatars for everyone else on this hypervideo, and Save disabled behind a
     * named message while somebody else holds the lock.
     *
     * @method updateHypervideoPresence
     */
    function updateHypervideoPresence() {

        var Collaboration = FrameTrail.module('Collaboration');
        if (!Collaboration || !presenceContainer || lockScopeId === null) return;

        Collaboration.renderAvatars(presenceContainer, 'hypervideo', lockScopeId);

        var blocked = Collaboration.isLockedByOther('hypervideo', lockScopeId),
            holder  = Collaboration.lockHolder('hypervideo', lockScopeId);

        if (lockMessageEl) {
            lockMessageEl.classList.toggle('active', blocked);
            lockMessageEl.textContent = blocked
                ? labels['MessageCollabLockedBy'].replace('%s', (holder && holder.name) ? holder.name : '')
                : '';
        }

        if (saveButtonEl) saveButtonEl.disabled = blocked;

        // Grey out the form itself. The title bar sits outside .ft-dialog-content,
        // so the avatars and the "X is editing…" message stay fully legible.
        var widget = presenceContainer.closest('.ft-dialog');
        if (widget) widget.classList.toggle('collabLocked', blocked);

    }


    function _serverPost(body) {
        return FrameTrail.module('StorageManager').serverPost(body);
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
     * I tell whether a hypervideo is the one loaded in the editor. This
     * dialog is also opened from the overview, for any hypervideo.
     *
     * @method isLoadedHypervideo
     * @param {String} hypervideoID
     * @return {Boolean}
     */
    function isLoadedHypervideo(hypervideoID) {
        return !!FrameTrail.module('HypervideoModel')
            && String(hypervideoID) === String(FrameTrail.module('RouteNavigation').hypervideoID);
    }

    /**
     * I take the subtitle files the editor has not written yet, when the edited hypervideo is the loaded one: the hypervideo.json this dialog writes lists them, so their files go with it.
     *
     * @method takePendingSubtitles
     * @param {String} hypervideoID
     * @return {Object} { <lang>: WebVTT text, or null to delete }
     */
    function takePendingSubtitles(hypervideoID) {
        return isLoadedHypervideo(hypervideoID) ? FrameTrail.module('HypervideoModel').takePendingSubtitles() : {};
    }

    /**
     * I list what a shorter duration cuts off a hypervideo: overlays and code
     * snippets that start at or after the new end are deleted, overlays that
     * run past it are truncated.
     *
     * It is about the hypervideo being edited, which need not be the one
     * loaded in the editor. For the loaded one I look at the live data (what
     * the editor shows and saves), for any other at what is stored. Items are
     * identified by created, as everywhere.
     *
     * Annotations are left alone: they belong to their authors, and one that
     * starts after the end is simply never reached.
     *
     * @method getOutOfRangeItems
     * @param {String} hypervideoID
     * @param {Number} newDuration - new duration in seconds
     * @return {Object} { overlays: [{ created, action, newEnd }], codeSnippets: [{ created, action }], hasAffectedItems: Boolean }
     */
    function getOutOfRangeItems(hypervideoID, newDuration) {
        var database   = FrameTrail.module('Database'),
            outOfRange = {
                overlays:         [],
                codeSnippets:     [],
                hasAffectedItems: false
            },
            overlays, codeSnippets;

        if (isLoadedHypervideo(hypervideoID)) {
            overlays     = database.overlays;
            codeSnippets = database.codeSnippets.timebasedEvents || [];
        } else {
            var stored = window.FrameTrailSerializer.parseHypervideo(database.hypervideos[hypervideoID].hypervideoData);
            overlays     = stored.overlays;
            codeSnippets = stored.codeSnippets;
        }

        overlays.forEach(function(overlay) {
            if (overlay.start >= newDuration) {
                outOfRange.overlays.push({ created: overlay.created, action: 'delete' });
            } else if (overlay.end > newDuration) {
                outOfRange.overlays.push({ created: overlay.created, action: 'truncate', newEnd: newDuration });
            }
        });

        codeSnippets.forEach(function(snippet) {
            if (snippet.start >= newDuration) {
                outOfRange.codeSnippets.push({ created: snippet.created, action: 'delete' });
            }
        });

        outOfRange.hasAffectedItems = outOfRange.overlays.length > 0 || outOfRange.codeSnippets.length > 0;

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
     * I apply a shorter duration to a hypervideo: its clip gets the new
     * duration, and the items getOutOfRangeItems listed are deleted or
     * truncated.
     *
     * For the hypervideo loaded in the editor that happens to the live items,
     * which the dialog's save then writes — like the name and settings it
     * changes, so nothing is marked unsaved (a duration change ends with the
     * hypervideo reloaded from what was written). Any other hypervideo has no
     * live items and must not touch the loaded one's: I return the cuts, and
     * the dialog applies them to the hypervideo.json it writes (cutContents).
     *
     * @method applyDurationChange
     * @param {String} hypervideoID
     * @param {Number} newDuration
     * @param {Object} outOfRangeItems
     * @param {Object} DatabaseEntry
     * @return {Object|null} the cuts still to apply to the written file
     */
    function applyDurationChange(hypervideoID, newDuration, outOfRangeItems, DatabaseEntry) {

        if (DatabaseEntry.clips && DatabaseEntry.clips[0]) {
            DatabaseEntry.clips[0].duration = newDuration;
        }

        if (!isLoadedHypervideo(hypervideoID)) {
            return outOfRangeItems;
        }

        var HypervideoModel = FrameTrail.module('HypervideoModel'),
            database        = FrameTrail.module('Database');

        function liveItem(list, created) {
            for (var i = 0; i < list.length; i++) {
                if (list[i].data.created === created) { return list[i]; }
            }
            return null;
        }

        function dataIndex(list, created) {
            for (var i = 0; i < list.length; i++) {
                if (list[i].created === created) { return i; }
            }
            return -1;
        }

        if (outOfRangeItems.overlays.length) {
            FrameTrail.module('OverlaysController').overlayInFocus = null;
        }
        if (outOfRangeItems.codeSnippets.length) {
            FrameTrail.module('CodeSnippetsController').codeSnippetInFocus = null;
        }

        outOfRangeItems.overlays.forEach(function(cut) {
            var index = dataIndex(database.overlays, cut.created);
            if (index < 0) { return; }
            if (cut.action === 'truncate') {
                database.overlays[index].end = cut.newEnd;
                return;
            }
            // Overlays of a type that no longer exists are kept in the data
            // but not rendered, so they have no live object.
            var overlay = liveItem(HypervideoModel.overlays, cut.created);
            if (overlay) {
                overlay.removeFromDOM();
                HypervideoModel.overlays.splice(HypervideoModel.overlays.indexOf(overlay), 1);
            }
            database.overlays.splice(index, 1);
        });

        outOfRangeItems.codeSnippets.forEach(function(cut) {
            var snippets = database.codeSnippets.timebasedEvents,
                index    = dataIndex(snippets, cut.created),
                snippet  = liveItem(HypervideoModel.codeSnippets, cut.created);
            if (snippet) {
                snippet.removeFromDOM();
                HypervideoModel.codeSnippets.splice(HypervideoModel.codeSnippets.indexOf(snippet), 1);
            }
            if (index > -1) { snippets.splice(index, 1); }
        });

        HypervideoModel.durationFull = newDuration;
        HypervideoModel.duration = newDuration - HypervideoModel.offsetIn;

        return null;
    }

    /**
     * I apply the cuts applyDurationChange returned for a hypervideo that is
     * not loaded in the editor to the hypervideo.json this dialog writes.
     *
     * @method cutContents
     * @param {Object} hypervideoJSON
     * @param {Object} cuts
     * @return {Object} the new hypervideo.json
     */
    function cutContents(hypervideoJSON, cuts) {

        var Serializer = window.FrameTrailSerializer,
            model      = Serializer.parseHypervideo(hypervideoJSON);

        function apply(items, list) {
            return items.filter(function(item) {
                var cut = list.filter(function(c) { return c.created === item.created; })[0];
                if (!cut) { return true; }
                if (cut.action === 'delete') { return false; }
                item.end = cut.newEnd;
                return true;
            });
        }

        model.overlays     = apply(model.overlays, cuts.overlays);
        model.codeSnippets = apply(model.codeSnippets, cuts.codeSnippets);

        return Serializer.serializeHypervideo(model);
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
        
        if (overlaysToDelete > 0) {
            messageLines.push('• ' + overlaysToDelete + ' ' + labels['DurationChangeOverlaysDeleted']);
        }
        if (overlaysToTruncate > 0) {
            messageLines.push('• ' + overlaysToTruncate + ' ' + labels['DurationChangeOverlaysTruncated'] + ' ' + formattedTime);
        }
        if (snippetsToDelete > 0) {
            messageLines.push('• ' + snippetsToDelete + ' ' + labels['DurationChangeCodeSnippetsDeleted']);
        }
        
        var _cdw = document.createElement('div');
        _cdw.innerHTML = '<div class="durationChangeConfirmDialog">'
                        + '    <div class="message active">'+ labels['DurationChangeWarningMessage'] +'</div>'
                        + '    <div class="affectedItems">' + messageLines.join('<br>') + '</div>'
                        + '</div>';
        var confirmDialog = _cdw.firstElementChild;

        var confirmDialogCtrl = Dialog({
            title:   labels['DurationChangeWarningTitle'],
            icon:    'icon-attention',
            modal:   true,
            width:   450,
            content: confirmDialog,
            close: function() {
                confirmDialogCtrl.destroy();
                if (onCancel) onCancel();
            },
            buttons: [
                { text: labels['GenericApply'],
                    click: function() {
                        confirmDialogCtrl.close();
                        if (onConfirm) onConfirm();
                    }
                },
                { text: labels['GenericCancel'],
                    click: function() {
                        confirmDialogCtrl.close();
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

        // This dialog writes the whole hypervideo.json; not while a transaction of the edit API is changing it.
        if (FrameTrail.getState('editBusy') && isLoadedHypervideo(hypervideoID)) {
            FrameTrail.module('InterfaceModal').showErrorMessage(labels['MessageEditBusy']);
            FrameTrail.module('InterfaceModal').hideMessage(3000);
            return;
        }

        var formBuilder = FrameTrail.module('HypervideoFormBuilder');

        // Check if this is a canvas (empty) video - no resourceId means canvas
        var isCanvasVideo = hypervideo.clips && hypervideo.clips[0] && !hypervideo.clips[0].resourceId && !hypervideo.clips[0].src;
        var originalDuration = isCanvasVideo ? (hypervideo.clips[0].duration || 0) : 0;
        var pendingDurationChange = null; // Will hold { newDuration, outOfRangeItems } if duration change needs confirmation
        
        // Video source replacement tracking
        var originalResourceId = hypervideo.clips && hypervideo.clips[0] ? hypervideo.clips[0].resourceId : null;
        var originalSrc = hypervideo.clips && hypervideo.clips[0] ? hypervideo.clips[0].src : null;
        var pendingSourceChange = null; // Will hold { resourceId, src, duration, outOfRangeItems } if source change needs confirmation
        var sourceChangeConfirmed = false;

        var captionsVisible = hypervideo.config && hypervideo.config.captionsVisible && hypervideo.config.captionsVisible.toString() === 'true';
        var autohideControls = hypervideo.config && hypervideo.config.autohideControls && hypervideo.config.autohideControls.toString() === 'true';

        var _efw = document.createElement('div');
        _efw.innerHTML = '<form method="POST" class="editHypervideoForm">'
                        + formBuilder.generateSettingsRow({
                                name: hypervideo.name || '',
                                captionsVisible: captionsVisible,
                                autohideControls: autohideControls,
                                showExistingSubtitles: true,
                                showExtendedSettings: true
                            })
                        + '    <hr>'
                        + formBuilder.generateVideoSourceSection({
                                duration: isCanvasVideo ? originalDuration : 120,  // Use existing duration or 2 minutes default
                                currentResourceId: originalResourceId || '',
                                currentSrc: originalSrc || '',
                                showUploadButton: true,
                                isEditMode: true
                            })
                        + '    <hr>'
                        + '    <div class="posterFrameSection">'
                        + '        <label>'+ labels['SettingsPosterFrame'] +'</label>'
                        + '        <div class="message active">'+ labels['MessagePosterFrame'] +'</div>'
                        + '        <div class="posterFrameList"></div>'
                        + '        <input type="hidden" name="posterFrame" value="'+ (hypervideo.posterFrame || '') +'">'
                        + '    </div>'
                        + '    <div class="message error"></div>'
                        + '</form>';
        var EditHypervideoForm = _efw.firstElementChild;
        
        // Helper to get duration from form input
        function getDurationFromForm() {
            if (!isCanvasVideo) return originalDuration;
            return formBuilder.timeStringToSeconds(EditHypervideoForm.querySelector('input[name="duration"]').value);
        }

        // Populate existing subtitles using shared module
        formBuilder.populateExistingSubtitles(EditHypervideoForm, hypervideo.subtitles);

        // Attach subtitle event handlers using shared module
        formBuilder.attachSubtitleHandlers(EditHypervideoForm);

        // Video Source Tabs Initialization
        (function() {
            var tabs = EditHypervideoForm.querySelector('.videoSourceTabs');
            var videoList = EditHypervideoForm.querySelector('.videoResourceList');
            
            // Render video resources list
            FrameTrail.module('ResourceManager').renderList(videoList, true, 'type', 'contains', ['video', 'youtube', 'vimeo']);
            
            // Pre-select current video resource after list is loaded (watch for loading screen removal)
            if (originalResourceId) {
                var checkLoaded = setInterval(function() {
                    if (!videoList.querySelector('.loadingScreen')) {
                        clearInterval(checkLoaded);
                        // Use data-resourceID (capital ID) to match the actual attribute
                        var _selThumb = videoList.querySelector('.resourceThumb[data-resourceID="' + originalResourceId + '"]');
                        if (_selThumb) { _selThumb.classList.add('selected'); }
                    }
                }, 100);
            }
            
            // Initialize tabs with appropriate active tab
            FTTabs(tabs, {
                active: isCanvasVideo ? 1 : 0, // Empty Video tab if canvas, Choose Video tab otherwise
                activate: function(event, ui) {
                    // Don't clear selection when switching tabs - preserve current selection
                }
            });
        })();

        // Poster frame image list
        (function() {
            var posterList = EditHypervideoForm.querySelector('.posterFrameList');

            FrameTrail.module('ResourceManager').renderList(posterList, true, 'type', 'contains', ['image']);

            if (hypervideo.posterFrame) {
                var checkPosterLoaded = setInterval(function() {
                    if (!posterList.querySelector('.loadingScreen')) {
                        clearInterval(checkPosterLoaded);
                        posterList.querySelectorAll('.resourceThumb').forEach(function(thumb) {
                            var res = database.resources[thumb.dataset.resourceid];
                            if (res && res.src === hypervideo.posterFrame) {
                                thumb.classList.add('selected');
                            }
                        });
                    }
                }, 100);
            }
        })();

        // Handle poster frame selection (click a selected thumb again to clear)
        EditHypervideoForm.addEventListener('click', function(evt) {
            if (evt.target.closest('.resourceEditButton')) return;
            var _thumb = evt.target.closest('.posterFrameList .resourceThumb');
            if (!_thumb) return;

            var posterInput = EditHypervideoForm.querySelector('input[name="posterFrame"]');
            var wasSelected = _thumb.classList.contains('selected');

            EditHypervideoForm.querySelectorAll('.posterFrameList .resourceThumb').forEach(function(el) { el.classList.remove('selected'); });

            if (wasSelected) {
                posterInput.value = '';
            } else {
                var resource = database.resources[_thumb.dataset.resourceid];
                _thumb.classList.add('selected');
                posterInput.value = resource ? resource.src : '';
            }
        });

        // Handle upload new video resource button
        EditHypervideoForm.querySelector('.uploadNewVideoResource').addEventListener('click', function() {
            FrameTrail.module('ResourceManager').uploadResource(function() {
                var videoList = EditHypervideoForm.querySelector('.videoResourceList');
                videoList.innerHTML = '';
                FrameTrail.module('ResourceManager').renderList(videoList, true, 'type', 'contains', ['video', 'youtube', 'vimeo']);
            });
        });

        // Handle edit button clicks in videoResourceList
        EditHypervideoForm.querySelector('.videoResourceList').addEventListener('click', function(e) {
            var editBtn = e.target.closest('.resourceEditButton');
            if (!editBtn) { return; }
            e.stopPropagation();
            var resourceID = editBtn.getAttribute('data-resource-id');
            var resourceData = FrameTrail.module('Database').resources[resourceID];
            FrameTrail.module('ResourceManager').openEditDialog(resourceID, resourceData, function() {
                var videoList = EditHypervideoForm.querySelector('.videoResourceList');
                videoList.innerHTML = '';
                FrameTrail.module('ResourceManager').renderList(videoList, true, 'type', 'contains', ['video', 'youtube', 'vimeo']);
            });
        });

        // Handle video resource selection
        EditHypervideoForm.addEventListener('click', function(evt) {
            var _thumb = evt.target.closest('.videoResourceList .resourceThumb');
            if (!_thumb) return;
            EditHypervideoForm.querySelectorAll('.videoResourceList .resourceThumb').forEach(function(el) { el.classList.remove('selected'); });
            _thumb.classList.add('selected');

            var resourceId = _thumb.dataset.resourceid;
            var resource = database.resources[resourceId];

            EditHypervideoForm.querySelector('input[name="newResourceId"]').value = resourceId;
            EditHypervideoForm.querySelector('input[name="newResourceSrc"]').value = resource ? resource.src : '';
            // Duration will be determined when video loads - for now use 0 as placeholder
            EditHypervideoForm.querySelector('input[name="newResourceDuration"]').value = resource ? (resource.duration || 0) : 0;

            // Show YouTube warning when selecting a YouTube resource
            var ytWarning = hypervideoDialogCtrl && hypervideoDialogCtrl.widget().querySelector('.youtubeLocalWarning');
            if (ytWarning) {
                if (_thumb.dataset.type === 'youtube') {
                    ytWarning.classList.add('active');
                } else {
                    ytWarning.classList.remove('active');
                }
            }
        });

        // Helper to get new empty video duration
        function getNewEmptyDuration() {
            return formBuilder.timeStringToSeconds(EditHypervideoForm.querySelector('input[name="duration"]').value);
        }

        // Check if source is being changed
        function isSourceChanging() {
            var tabs = EditHypervideoForm.querySelector('.videoSourceTabs');
            var activeTabIndex = tabs.classList.contains('ui-tabs') ? FTTabs(tabs, 'option', 'active') : 0;
            
            if (activeTabIndex === 0) { // Choose Video tab
                var newResourceId = EditHypervideoForm.querySelector('input[name="newResourceId"]').value;
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
            var tabs = EditHypervideoForm.querySelector('.videoSourceTabs');
            var activeTabIndex = tabs.classList.contains('ui-tabs') ? FTTabs(tabs, 'option', 'active') : 0;
            
            if (activeTabIndex === 0) { // Choose Video tab
                var newResourceId = EditHypervideoForm.querySelector('input[name="newResourceId"]').value;
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

        // Cuts of a shorter duration still to apply to the hypervideo.json
        // written below (only for a hypervideo not loaded in the editor).
        var pendingContentCuts = null;

        // The hypervideo.json this dialog writes.
        function hypervideoJSON() {
            var json = FrameTrail.module('Database').convertToDatabaseFormat(thisID);
            return pendingContentCuts ? cutContents(json, pendingContentCuts) : json;
        }

        function updateDatabaseFromForm() {
            // Only called when saving - apply changes to database
            var DatabaseEntry = FrameTrail.module('Database').hypervideos[thisID];

            pendingContentCuts = null;

            DatabaseEntry.name = EditHypervideoForm.querySelector('input[name="name"]').value;

            var posterInput = EditHypervideoForm.querySelector('input[name="posterFrame"]');
            if (posterInput) {
                DatabaseEntry.posterFrame = posterInput.value || null;
            }

            if (DatabaseEntry.config) {
                for (var configKey in DatabaseEntry.config) {
                    if (configKey === 'layoutArea' || configKey === 'theme' || configKey === 'captionsVisible' || configKey === 'autohideControls') { continue; }
                    var newConfigVal = (EditHypervideoForm.querySelector('input[data-configkey="' + configKey + '"]') || {value: undefined}).value;
                    newConfigVal = (newConfigVal === 'true')
                                    ? true
                                    : (newConfigVal === 'false')
                                        ? false
                                        : (newConfigVal === undefined)
                                            ? DatabaseEntry.config[configKey]
                                            : newConfigVal;
                    DatabaseEntry.config[configKey] = newConfigVal;
                }
                var captionsCheckbox = EditHypervideoForm.querySelector('input[name="config[captionsVisible]"]');
                if (captionsCheckbox) {
                    DatabaseEntry.config.captionsVisible = captionsCheckbox.checked;
                }
                var autohideCheckbox = EditHypervideoForm.querySelector('input[name="config[autohideControls]"]');
                if (autohideCheckbox) {
                    DatabaseEntry.config.autohideControls = autohideCheckbox.checked;
                    if (thisID == FrameTrail.module('RouteNavigation').hypervideoID) {
                        FrameTrail.changeState('hv_config_autohideControls', autohideCheckbox.checked);
                    }
                }
            }

            // Handle video source change
            if (pendingSourceChange) {
                // Apply out-of-range item changes
                if (pendingSourceChange.outOfRangeItems && pendingSourceChange.outOfRangeItems.hasAffectedItems) {
                    pendingContentCuts = applyDurationChange(thisID, pendingSourceChange.duration, pendingSourceChange.outOfRangeItems, DatabaseEntry);
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
                pendingContentCuts = applyDurationChange(thisID, pendingDurationChange.newDuration, pendingDurationChange.outOfRangeItems, DatabaseEntry);
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

            EditHypervideoForm.querySelectorAll('.existingSubtitlesItem').forEach(function(item) {
                var lang = item.querySelector('.subtitlesDelete').getAttribute('data-lang');
                if (lang) {
                    DatabaseEntry.subtitles.push({
                        "src": lang +".vtt",
                        "srclang": lang
                    });
                }
            });

            EditHypervideoForm.querySelectorAll('.newSubtitlesContainer input[type=file]').forEach(function(fileInput) {
                var match = /subtitles\[(.+)\]/g.exec(fileInput.getAttribute('name'));
                if (match) {
                    DatabaseEntry.subtitles.push({
                        "src": match[1] +".vtt",
                        "srclang": match[1]
                    });
                }
            });
        }

        var hypervideoDialogCtrl;

        function completeUpdate() {
            var sourceWasChanged = sourceChangeConfirmed;
            var newSourcePath = null;
            if (sourceWasChanged) {
                var newSourceInfo = getNewSourceInfo();
                newSourcePath = newSourceInfo.src;
            }

            FrameTrail.module('Database').loadHypervideoData(
                function(){
                    if (thisID == FrameTrail.module('RouteNavigation').hypervideoID) {
                        FrameTrail.module('Database').hypervideo = FrameTrail.module('Database').hypervideos[thisID];

                        var name = EditHypervideoForm.querySelector('input[name="name"]').value;

                        FrameTrail.module('HypervideoModel').hypervideoName = name;

                        var newPosterFrame = EditHypervideoForm.querySelector('input[name="posterFrame"]').value || null;
                        FrameTrail.module('HypervideoModel').posterFrame = newPosterFrame;
                        var videoEl = FrameTrail.module('ViewVideo').Video;
                        if (videoEl) {
                            if (newPosterFrame) {
                                videoEl.setAttribute('poster', FrameTrail.module('RouteNavigation').getResourceURL(newPosterFrame));
                            } else {
                                videoEl.removeAttribute('poster');
                            }
                        }

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

                                hypervideoDialogCtrl.close();
                            },
                            function() {}
                        );

                        FrameTrail.changeState('viewSize', FrameTrail.getState('viewSize'));
                    } else {
                        FrameTrail.module('ViewOverview').refreshList();
                        hypervideoDialogCtrl.close();
                    }
                },
                function(){
                    EditHypervideoForm.querySelector('.message.error').classList.add('active');
                EditHypervideoForm.querySelector('.message.error').innerHTML = labels['ErrorUpdatingHypervideoData'];
                }
            );
        }

        EditHypervideoForm.addEventListener('submit', function(e) {
            e.preventDefault();
            var form = this;

            // Clear error messages
            EditHypervideoForm.querySelector('.message.error').classList.remove('active');
            EditHypervideoForm.querySelector('.message.error').innerHTML = '';

            // Check for video source change
            if (isSourceChanging() && !sourceChangeConfirmed) {
                var newSourceInfo = getNewSourceInfo();

                // Validate empty video duration
                if (newSourceInfo.type === 'empty' && newSourceInfo.duration < 4) {
                    EditHypervideoForm.querySelector('.message.error').classList.add('active');
                    EditHypervideoForm.querySelector('.message.error').innerHTML = labels['ErrorDurationMinimum4Seconds'];
                    return;
                }

                // Check whether the new duration cuts off any of this hypervideo's items
                if (newSourceInfo.duration > 0) {
                    var outOfRangeItems = getOutOfRangeItems(thisID, newSourceInfo.duration);

                    if (outOfRangeItems.hasAffectedItems) {
                        showDurationChangeConfirmation(newSourceInfo.duration, outOfRangeItems, function() {
                            pendingSourceChange = {
                                resourceId: newSourceInfo.resourceId,
                                src: newSourceInfo.src,
                                duration: newSourceInfo.duration,
                                thumb: newSourceInfo.thumb,
                                outOfRangeItems: outOfRangeItems
                            };
                            sourceChangeConfirmed = true;
                            EditHypervideoForm.requestSubmit();
                        }, function() {
                            EditHypervideoForm.querySelectorAll('.videoResourceList .resourceThumb').forEach(function(el) { el.classList.remove('selected'); });
                            if (originalResourceId) {
                                var _selThumb = EditHypervideoForm.querySelector('.videoResourceList .resourceThumb[data-resourceID="' + originalResourceId + '"]');
                                if (_selThumb) { _selThumb.classList.add('selected'); }
                                EditHypervideoForm.querySelector('input[name="newResourceId"]').value = originalResourceId;
                            } else {
                                EditHypervideoForm.querySelector('input[name="newResourceId"]').value = '';
                            }
                            var tabs = EditHypervideoForm.querySelector('.videoSourceTabs');
                            FTTabs(tabs, 'option', 'active', isCanvasVideo ? 1 : 0);
                        });
                        return;
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

                if (newDuration < 4) {
                    EditHypervideoForm.querySelector('.message.error').classList.add('active');
                    EditHypervideoForm.querySelector('.message.error').innerHTML = labels['ErrorDurationMinimum4Seconds'];
                    return;
                }

                if (newDuration < originalDuration) {
                    var outOfRangeItems = getOutOfRangeItems(thisID, newDuration);

                    if (outOfRangeItems.hasAffectedItems && !pendingDurationChange) {
                        showDurationChangeConfirmation(newDuration, outOfRangeItems, function() {
                            pendingDurationChange = { newDuration: newDuration, outOfRangeItems: outOfRangeItems };
                            EditHypervideoForm.requestSubmit();
                        }, function() {
                            EditHypervideoForm.querySelector('input[name="duration"]').value = formBuilder.secondsToTimeString(originalDuration);
                        });
                        return;
                    }
                }
            }

            // Subtitles Validation
            var err = 0;
            EditHypervideoForm.querySelectorAll('.subtitlesItem').forEach(function(subtitleItem) {
                subtitleItem.style.outline = '';
                var _fileInput = subtitleItem.querySelector('input[type="file"]');
                var _keySetter = subtitleItem.querySelector('.subtitlesTmpKeySetter');
                var _errMsg = EditHypervideoForm.querySelector('.message.error');
                if ((_fileInput && _fileInput.getAttribute('name') == 'subtitles[]') || (_keySetter && _keySetter.value == '')
                        || (_fileInput && _fileInput.value.length == 0)) {
                    subtitleItem.style.outline = '1px solid #cd0a0a';
                    _errMsg.classList.add('active');
                    _errMsg.innerHTML = labels['ErrorSubtitlesEmptyFields'];
                    err++;
                } else if (_fileInput && !(new RegExp('(' + ['.vtt'].join('|').replace(/\./g, '\\.') + ')$')).test(_fileInput.value)) {
                    subtitleItem.style.outline = '1px solid #cd0a0a';
                    _errMsg.classList.add('active');
                    _errMsg.innerHTML = labels['ErrorSubtitlesWrongFormat'];
                    err++;
                }
                var _keyVal = _keySetter ? _keySetter.value : '';
                if (EditHypervideoForm.querySelectorAll('.subtitlesItem input[type="file"][name="subtitles['+ _keyVal +']"]').length > 1
                        || EditHypervideoForm.querySelector('.existingSubtitlesItem .subtitlesDelete[data-lang="'+ _keyVal +'"]') ) {
                    _errMsg.classList.add('active');
                    _errMsg.innerHTML = labels['ErrorSubtitlesLanguageDuplicate'];
                    err++;
                }
            });
            if (err > 0) return;

            // All validation passed - save
            updateDatabaseFromForm();
            var formData = new FormData(form);
            formData.set('a', 'hypervideoChange');
            formData.set('hypervideoID', thisID);
            formData.set('src', JSON.stringify(hypervideoJSON(), null, 4));

            // Compare-and-swap token. This dialog posts the ENTIRE hypervideo.json
            // — every overlay and code snippet included — so without it a settings
            // dialog left open silently reverts everything another editor saved.
            var baseVersion = FrameTrail.module('Database').hypervideos[thisID].lastchanged;
            formData.set('baseVersion', (baseVersion == null ? '' : baseVersion));

            // The hypervideo.json written here lists subtitles that were set in the editor and not saved yet; their files go with it.
            var pendingSubtitles = takePendingSubtitles(thisID),
                deletedHere      = formData.getAll('SubtitlesToDelete[]');
            Object.keys(pendingSubtitles).forEach(function(lang) {
                if (deletedHere.indexOf(lang) !== -1) { return; }
                if (pendingSubtitles[lang] === null) {
                    formData.append('SubtitlesToDelete[]', lang);
                } else {
                    formData.append('subtitles[' + lang + ']', new Blob([pendingSubtitles[lang]], { type: 'text/vtt' }), lang + '.vtt');
                }
            });

            _serverPost(formData)
            .then(function(response) {
                if (response['code'] !== 0 && isLoadedHypervideo(thisID)) {
                    FrameTrail.module('HypervideoModel').returnPendingSubtitles(pendingSubtitles);
                }
                switch(response['code']) {
                    case 7:
                        // Someone else wrote this hypervideo since we opened.
                        var _conflictEl = EditHypervideoForm.querySelector('.message.error');
                        _conflictEl.classList.add('active');
                        _conflictEl.innerHTML = labels['ErrorSaveConflict'];
                        break;
                    case 0:
                        var sourceWasChanged = sourceChangeConfirmed;
                        var newSourcePath = null;
                        if (sourceWasChanged) {
                            var newSourceInfo = getNewSourceInfo();
                            newSourcePath = newSourceInfo.src;
                        }

                        if (sourceWasChanged && newSourcePath !== null) {
                            _serverPost(new URLSearchParams({ a: 'updateAnnotationSources', hypervideoID: thisID, newSourcePath: newSourcePath }))
                            .then(function() { completeUpdate(); })
                            .catch(function() { completeUpdate(); });
                        } else {
                            completeUpdate();
                        }
                        break;
                    default:
                        EditHypervideoForm.querySelector('.message.error').classList.add('active');
                    EditHypervideoForm.querySelector('.message.error').innerHTML = 'Error: '+ response['string'];
                        break;
                }
            });
        });

        /**
         * Save hypervideo settings locally via File System Access API.
         * Mirrors the ajaxForm submit + success handler logic.
         */
        function saveHypervideoLocally() {
            // Run the same beforeSerialize validation by triggering a fake submit check
            EditHypervideoForm.querySelector('.message.error').classList.remove('active');
            EditHypervideoForm.querySelector('.message.error').innerHTML = '';

            // Video source change validation
            if (isSourceChanging() && !sourceChangeConfirmed) {
                var newSourceInfo = getNewSourceInfo();

                if (newSourceInfo.type === 'empty' && newSourceInfo.duration < 4) {
                    EditHypervideoForm.querySelector('.message.error').classList.add('active');
                    EditHypervideoForm.querySelector('.message.error').innerHTML = labels['ErrorDurationMinimum4Seconds'];
                    return;
                }

                if (newSourceInfo.duration > 0) {
                    var outOfRangeItems = getOutOfRangeItems(thisID, newSourceInfo.duration);
                    if (outOfRangeItems.hasAffectedItems) {
                        showDurationChangeConfirmation(newSourceInfo.duration, outOfRangeItems, function() {
                            pendingSourceChange = {
                                resourceId: newSourceInfo.resourceId,
                                src: newSourceInfo.src,
                                duration: newSourceInfo.duration,
                                thumb: newSourceInfo.thumb,
                                outOfRangeItems: outOfRangeItems
                            };
                            sourceChangeConfirmed = true;
                            saveHypervideoLocally();
                        }, function() {
                            EditHypervideoForm.querySelectorAll('.videoResourceList .resourceThumb').forEach(function(el) { el.classList.remove('selected'); });
                            if (originalResourceId) {
                                var _selThumb2 = EditHypervideoForm.querySelector('.videoResourceList .resourceThumb[data-resourceID="' + originalResourceId + '"]');
                                if (_selThumb2) { _selThumb2.classList.add('selected'); }
                                EditHypervideoForm.querySelector('input[name="newResourceId"]').value = originalResourceId;
                            } else {
                                EditHypervideoForm.querySelector('input[name="newResourceId"]').value = '';
                            }
                            var tabs = EditHypervideoForm.querySelector('.videoSourceTabs');
                            FTTabs(tabs, 'option', 'active', isCanvasVideo ? 1 : 0);
                        });
                        return;
                    }
                }

                pendingSourceChange = {
                    resourceId: newSourceInfo.resourceId,
                    src: newSourceInfo.src,
                    duration: newSourceInfo.duration,
                    thumb: newSourceInfo.thumb,
                    outOfRangeItems: null
                };
                sourceChangeConfirmed = true;
            }

            // Canvas video duration validation
            if (isCanvasVideo && !pendingSourceChange) {
                var newDuration = getDurationFromForm();
                if (newDuration < 4) {
                    EditHypervideoForm.querySelector('.message.error').classList.add('active');
                    EditHypervideoForm.querySelector('.message.error').innerHTML = labels['ErrorDurationMinimum4Seconds'];
                    return;
                }
                if (newDuration < originalDuration) {
                    var outOfRangeItems = getOutOfRangeItems(thisID, newDuration);
                    if (outOfRangeItems.hasAffectedItems && !pendingDurationChange) {
                        showDurationChangeConfirmation(newDuration, outOfRangeItems, function() {
                            pendingDurationChange = { newDuration: newDuration, outOfRangeItems: outOfRangeItems };
                            saveHypervideoLocally();
                        }, function() {
                            EditHypervideoForm.querySelector('input[name="duration"]').value = formBuilder.secondsToTimeString(originalDuration);
                        });
                        return;
                    }
                }
            }

            // Subtitles validation
            var err = 0;
            EditHypervideoForm.querySelectorAll('.subtitlesItem').forEach(function(subtitleItem) {
                subtitleItem.style.outline = '';
                var _fileInput = subtitleItem.querySelector('input[type="file"]');
                var _keySetter = subtitleItem.querySelector('.subtitlesTmpKeySetter');
                var _errMsg = EditHypervideoForm.querySelector('.message.error');
                if ((_fileInput && _fileInput.getAttribute('name') == 'subtitles[]') || (_keySetter && _keySetter.value == '')
                        || (_fileInput && _fileInput.value.length == 0)) {
                    subtitleItem.style.outline = '1px solid #cd0a0a';
                    _errMsg.classList.add('active');
                    _errMsg.innerHTML = labels['ErrorSubtitlesEmptyFields'];
                    err++;
                } else if (_fileInput && !(new RegExp('(' + ['.vtt'].join('|').replace(/\./g, '\\.') + ')$')).test(_fileInput.value)) {
                    subtitleItem.style.outline = '1px solid #cd0a0a';
                    _errMsg.classList.add('active');
                    _errMsg.innerHTML = labels['ErrorSubtitlesWrongFormat'];
                    err++;
                }
                var _keyVal = _keySetter ? _keySetter.value : '';
                if (EditHypervideoForm.querySelectorAll('.subtitlesItem input[type="file"][name="subtitles['+ _keyVal +']"]').length > 1
                        || EditHypervideoForm.querySelector('.existingSubtitlesItem .subtitlesDelete[data-lang="'+ _keyVal +'"]') ) {
                    _errMsg.classList.add('active');
                    _errMsg.innerHTML = labels['ErrorSubtitlesLanguageDuplicate'];
                    err++;
                }
            });
            if (err > 0) { return; }

            // Update the database entry from form
            updateDatabaseFromForm();
            var hypervideoData = hypervideoJSON();

            var adapter = FrameTrail.module('StorageManager').getAdapter();
            var basePath = 'hypervideos/' + thisID;

            var sourceWasChanged = sourceChangeConfirmed;
            var newSourcePath = null;
            if (sourceWasChanged) {
                var srcInfo = getNewSourceInfo();
                newSourcePath = srcInfo.src;
            }

            // Collect subtitle deletions (a deleted language leaves a hidden SubtitlesToDelete[] input) and additions
            var subtitlesToDelete = [];
            EditHypervideoForm.querySelectorAll('input[name="SubtitlesToDelete[]"]').forEach(function(input) {
                if (input.value) { subtitlesToDelete.push(input.value); }
            });

            // In a local folder another program may have written the file since we read it: refuse, as the server does (code 7), before anything is written.
            (adapter.isUnchanged ? adapter.isUnchanged(basePath + '/hypervideo.json') : Promise.resolve(true)).then(function(unchanged) {
                if (unchanged) {
                    writeFiles();
                    return;
                }
                var _conflictEl = EditHypervideoForm.querySelector('.message.error');
                _conflictEl.classList.add('active');
                _conflictEl.innerHTML = labels[(FrameTrail.getState('storageMode') === 'file') ? 'ErrorSaveConflictInFile' : 'ErrorSaveConflictInFolder'];
            });

            function writeFiles() {

                var writeTasks = [adapter.writeJSON(basePath + '/hypervideo.json', hypervideoData)];

                // Delete subtitle files
                for (var d = 0; d < subtitlesToDelete.length; d++) {
                    writeTasks.push(adapter.deleteFile(basePath + '/subtitles/' + subtitlesToDelete[d] + '.vtt').catch(function() {}));
                }

                // Subtitles set in the editor and not saved yet, which the hypervideo.json written here lists
                var pendingSubtitles = takePendingSubtitles(thisID);
                Object.keys(pendingSubtitles).forEach(function(lang) {
                    if (subtitlesToDelete.indexOf(lang) !== -1) { return; }
                    var subtitlePath = basePath + '/subtitles/' + lang + '.vtt';
                    if (pendingSubtitles[lang] === null) {
                        writeTasks.push(adapter.deleteFile(subtitlePath).catch(function() {}));
                    } else {
                        writeTasks.push(adapter.createDirectory(basePath + '/subtitles').then(function() {
                            return adapter.writeText(subtitlePath, pendingSubtitles[lang]);
                        }));
                    }
                });

                // Write new subtitle files
                EditHypervideoForm.querySelectorAll('.newSubtitlesContainer input[type=file]').forEach(function(fileInput) {
                    var match = /subtitles\[(.+)\]/g.exec(fileInput.getAttribute('name'));
                    if (match && fileInput.files && fileInput.files[0]) {
                        writeTasks.push(
                            adapter.createDirectory(basePath + '/subtitles').then(function() {
                                return adapter.writeFile(basePath + '/subtitles/' + match[1] + '.vtt', fileInput.files[0]);
                            })
                        );
                    }
                });

                Promise.all(writeTasks).then(function() {
                    // Update annotation sources if video source changed
                    if (sourceWasChanged && newSourcePath !== null) {
                        return updateAnnotationSourcesLocally(adapter, thisID, newSourcePath);
                    }
                }).then(function() {
                    completeUpdate();
                }).catch(function(err) {
                    if (isLoadedHypervideo(thisID)) {
                        FrameTrail.module('HypervideoModel').returnPendingSubtitles(pendingSubtitles);
                    }
                    EditHypervideoForm.querySelector('.message.error').classList.add('active');
                    EditHypervideoForm.querySelector('.message.error').innerHTML = 'Local save failed: ' + (err ? err.message : '');
                });
            }
        }

        /**
         * Update the target.source in all annotation files for a hypervideo.
         */
        function updateAnnotationSourcesLocally(adapter, hvID, newSourcePath) {
            var basePath = 'hypervideos/' + hvID + '/annotations';
            return adapter.listDirectory(basePath).then(function(files) {
                var tasks = [];
                for (var i = 0; i < files.length; i++) {
                    if (files[i] === '_index.json') continue;
                    if (!/\.json$/.test(files[i])) continue;
                    tasks.push((function(filename) {
                        return adapter.readJSON(basePath + '/' + filename).then(function(content) {
                            if (!Array.isArray(content)) return;
                            var modified = false;
                            for (var j = 0; j < content.length; j++) {
                                if (content[j].target && content[j].target.source) {
                                    content[j].target.source = newSourcePath;
                                    modified = true;
                                }
                            }
                            if (modified) {
                                return adapter.writeJSON(basePath + '/' + filename, content);
                            }
                        });
                    })(files[i]));
                }
                return Promise.all(tasks);
            }).catch(function() {});
        }

        var hypervideoDialog = document.createElement('div');
        hypervideoDialog.className = 'hypervideoSettingsDialog';
        hypervideoDialog.appendChild(EditHypervideoForm);

        hypervideoDialogCtrl = Dialog({
            title:   labels['SettingsHypervideoSettings'],
            icon:    'icon-pencil',
            modal:   true,
            width:   830,
            height:  600,
            content: hypervideoDialog,
            close: function() {
                releaseHypervideoLock();
                hypervideoDialogCtrl.destroy();
            },
            buttons: [
                { text: labels['GenericSaveChanges'] || labels['GenericApply'] || 'Save',
                    click: function() {
                        if (FrameTrail.module('StorageManager').isLocal()) {
                            saveHypervideoLocally();
                        } else {
                            EditHypervideoForm.requestSubmit();
                        }
                    }
                },
                { text: labels['GenericCancel'],
                    click: function() {
                        hypervideoDialogCtrl.close();
                    }
                }
            ]
        });

        claimHypervideoLock(hypervideoDialogCtrl, thisID);

        // Add YouTube warning to buttonpane
        var buttonPane = hypervideoDialogCtrl.widget().querySelector('.ft-dialog-buttonpane');
        var ytWarningEl = document.createElement('div');
        ytWarningEl.className = 'youtubeLocalWarning message warning mt-1';
        ytWarningEl.style.flexBasis = '100%';
        ytWarningEl.textContent = labels['WarningYouTubeSource'];
        buttonPane.prepend(ytWarningEl);

        // Show warning if current source is YouTube
        if (originalResourceId && database.resources[originalResourceId] && database.resources[originalResourceId].type === 'youtube') {
            ytWarningEl.classList.add('active');
        }
    }

    /**
     * Delete a hypervideo locally using the File System Access API adapter.
     * @method deleteHypervideoLocally
     */
    function deleteHypervideoLocally(deleteDialogCtrl, thisID) {
        var hypervideos = FrameTrail.module('Database').hypervideos;
        var enteredName = deleteDialogCtrl.element.querySelector('input[name="hypervideoName"]').value;

        if (enteredName.toLowerCase() !== hypervideos[thisID].name.toLowerCase()) {
            var _err = deleteDialogCtrl.element.querySelector('.message.error'); _err.classList.add('active'); _err.innerHTML = labels['ErrorHypervideoNameIncorrect'];
            return;
        }

        var adapter = FrameTrail.module('StorageManager').getAdapter();

        adapter.readJSON('hypervideos/_index.json').then(function(hvi) {
            if (!hvi.hypervideos[thisID]) {
                deleteDialogCtrl.element.querySelector('.message.error').classList.add('active'); deleteDialogCtrl.element.querySelector('.message.error').innerHTML = labels['ErrorHypervideoDoesNotExist'];
                return Promise.reject();
            }
            var hvPath = 'hypervideos/' + hvi.hypervideos[thisID];
            delete hvi.hypervideos[thisID];
            return Promise.all([
                adapter.writeJSON('hypervideos/_index.json', hvi),
                adapter.deleteDirectory(hvPath).catch(function() {})
            ]);
        }).then(function() {
            deleteDialogCtrl.close();
            FrameTrail.module('Database').loadHypervideoData(
                function() {
                    FrameTrail.module('ViewOverview').refreshList();
                    if (thisID == FrameTrail.module('RouteNavigation').hypervideoID) {
                        FrameTrail.module('RouteNavigation').hypervideoID = null;
                        if (FrameTrail.getState('viewMode') === 'video') {
                            // Replace rather than push: the entry we are on
                            // points at a hypervideo that no longer exists, so
                            // Back must not lead to it.
                            FrameTrail.module('RouteNavigation').navigateToView('overview', { replace: true });
                        }
                    }
                },
                function() {}
            );
        }).catch(function() {});
    }

    /**
     * Open a dialog to confirm and execute hypervideo deletion.
     * @method openDeleteDialog
     * @param {String} hypervideoID
     */
    function openDeleteDialog(hypervideoID) {
        var thisID = hypervideoID,
            hypervideos = FrameTrail.module('Database').hypervideos;

        var _ddw = document.createElement('div');
        _ddw.innerHTML = '<div class="deleteHypervideoDialog">'
                           + '<div>'+ labels['MessageDeleteHypervideoQuestion'] +'</div>'
                           + '    <input class="thisHypervideoName" type="text" value="'+ hypervideos[thisID]['name'] +'" readonly>'
                           + '    <div class="message active">'+ labels['MessageDeleteHypervideoReEnter'] +':</div>'
                           + '    <form method="POST" class="deleteHypervideoForm">'
                           + '        <input type="text" name="hypervideoName" placeholder="'+ labels['GenericName'] +'"><br>'
                           + '        <div class="message error"></div>'
                           + '    </form>'
                           + '</div>';
        var deleteDialog = _ddw.firstElementChild;

        var deleteDialogCtrl;
        deleteDialog.querySelector('.deleteHypervideoForm').addEventListener('submit', function(e) {
            e.preventDefault();

            var formData = new FormData(this);
            formData.set('a', 'hypervideoDelete');
            formData.set('hypervideoID', thisID);

            _serverPost(formData)
            .then(function(response) {
                switch(response['code']) {
                    case 0:
                        deleteDialogCtrl.close();
                        FrameTrail.module('Database').loadHypervideoData(
                            function() {
                                FrameTrail.module('ViewOverview').refreshList();
                                if (thisID == FrameTrail.module('RouteNavigation').hypervideoID) {
                                    FrameTrail.module('RouteNavigation').hypervideoID = null;
                                    if (FrameTrail.getState('viewMode') === 'video') {
                                        // Replace rather than push: the entry we
                                        // are on points at a hypervideo that no
                                        // longer exists.
                                        FrameTrail.module('RouteNavigation').navigateToView('overview', { replace: true });
                                    }
                                }
                            },
                            function() {}
                        );
                    break;
                    case 1:
                        var _delErr = deleteDialog.querySelector('.message.error'); _delErr.classList.add('active'); _delErr.innerHTML = labels['ErrorNotLoggedIn'];
                    break;
                    case 2:
                        var _delErr = deleteDialog.querySelector('.message.error'); _delErr.classList.add('active'); _delErr.innerHTML = labels['ErrorNotActivated'];
                    break;
                    case 3:
                        var _delErr = deleteDialog.querySelector('.message.error'); _delErr.classList.add('active'); _delErr.innerHTML = labels['ErrorCouldNotFindHypervideoDirectory'];
                    break;
                    case 4:
                        var _delErr = deleteDialog.querySelector('.message.error'); _delErr.classList.add('active'); _delErr.innerHTML = labels['ErrorHypervideoDoesNotExist'];
                    break;
                    case 5:
                        var _delErr = deleteDialog.querySelector('.message.error'); _delErr.classList.add('active'); _delErr.innerHTML = labels['ErrorHypervideoNameIncorrect'];
                    break;
                    case 6:
                        var _delErr = deleteDialog.querySelector('.message.error'); _delErr.classList.add('active'); _delErr.innerHTML = labels['ErrorHypervideoPermissionDenied'];
                    break;
                }
            });
        });

        deleteDialogCtrl = Dialog({
            modal:   true,
            content: deleteDialog,
            open: function() {
                var _tn = deleteDialog.querySelector('.thisHypervideoName'); _tn.focus(); _tn.select();
            },
            close: function() {
                deleteDialogCtrl.destroy();
            },
            buttons: [
                { text: labels['GenericDeleteHypervideo'],
                    click: function() {
                        if (FrameTrail.module('StorageManager').isLocal()) {
                            deleteHypervideoLocally(deleteDialogCtrl, thisID);
                        } else {
                            deleteDialog.querySelector('.deleteHypervideoForm').dispatchEvent(new Event('submit', {bubbles: true, cancelable: true}));
                        }
                    }
                },
                { text: labels['GenericCancel'],
                    click: function() {
                        deleteDialogCtrl.close();
                    }
                }
            ]
        });
    }

    return {
        open: open,
        openDeleteDialog: openDeleteDialog,

        onChange: {
            collabState: updateHypervideoPresence
        }
    };

});
