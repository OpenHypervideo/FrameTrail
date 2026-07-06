/**
 * @module Player
 */


/**
 * I am the Sidebar. I provide the basic navigation for the user interface.
 *
 * @class Sidebar
 * @static
 */



FrameTrail.defineModule('Sidebar', function(FrameTrail){

    function _serverPost(body) {
        var serverURL = FrameTrail.module('RouteNavigation').resolveServerURL('ajaxServer.php');
        if (!serverURL) return Promise.reject(new Error('No server configured'));
        var adapter = FrameTrail.module('StorageManager').getAdapter();
        if (adapter && adapter.dataPathAbsolute) body.append('dataPath', adapter.dataPathAbsolute);
        return fetch(serverURL, { method: 'POST', body: body }).then(function(r) { return r.json(); });
    }

    var labels = FrameTrail.module('Localization').labels;

    var _sdw = document.createElement('div');
    _sdw.innerHTML = '<div class="sidebar">'
                   + '    <div class="sidebarContainer">'
                   + '        <div data-viewmode="overview">'
                   + '            <div class="viewmodeControls">'
                   + '                <div class="viewModeActionButtonContainer">'
                   + '                    <button class="newHypervideoButton" data-tooltip-bottom-left="'+ labels['HypervideoNew'] +'"><span class="icon-hypervideo-add"></span></button>'
                   + '                    <button class="exportButton" data-tooltip-bottom-left="'+ labels['GenericExport'] +'"><span class="icon-download"></span></button>'
                   + '                    <div style="clear: both;"></div>'
                   + '                </div>'
                   + '            </div>'
                   + '        </div>'
                   + '        <div data-viewmode="video">'
                   + '            <div class="viewmodeControls">'
                   + '                <div class="viewModeActionButtonContainer">'
                   + '                    <button class="newHypervideoButton" data-tooltip-bottom-left="'+ labels['HypervideoNew'] +'"><span class="icon-hypervideo-add"></span></button>'
                   + '                    <button class="forkButton" data-tooltip-bottom-left="'+ labels['GenericForkHypervideo'] +'"><span class="icon-hypervideo-fork"></span></button>'
                   + '                    <button class="saveButton" data-tooltip-bottom-left="'+ labels['GenericSaveChanges'] +'"><span class="icon-floppy"></span></button>'
                   + '                    <button class="saveAsButton" data-tooltip-bottom-left="'+ labels['GenericSaveAs'] +'"><span class="icon-export"></span></button>'
                   + '                    <button class="undoButton" disabled data-tooltip-bottom-left="'+ labels['GenericUndo'] +'"><span class="icon-ccw"></span></button>'
                   + '                    <button class="redoButton" disabled data-tooltip-bottom-left="'+ labels['GenericRedo'] +'"><span class="icon-cw"></span></button>'
                   + '                    <button class="exportButton" data-tooltip-bottom-left="'+ labels['GenericExportHypervideo'] +'"><span class="icon-download"></span></button>'
                   + '                    <div style="clear: both;"></div>'
                   + '                </div>'
                   + '                <button class="editMode" data-editmode="preview"><span class="icon-eye"></span><span class="editModeLabel">'+ labels['SidebarPreview'] +'</span></button>'
                   + '                <button class="editMode" data-editmode="layout"><span class="icon-website"></span><span class="editModeLabel">'+ labels['SidebarLayout'] +'</span></button>'
                   + '                <button class="editMode" data-editmode="overlays"><span class="icon-object-ungroup"></span><span class="editModeLabel">'+ labels['SidebarOverlays'] +'</span></button>'
                   + '                <button class="editMode" data-editmode="codesnippets"><span class="icon-code"></span><span class="editModeLabel">'+ labels['SidebarCustomCode'] +'</span></button>'
                   + '                <button class="editMode" data-editmode="chapters"><span class="icon-list-bullet"></span><span class="editModeLabel">'+ labels['SidebarChapters'] +'</span></button>'
                   + '                <button class="editMode" data-editmode="annotations"><span class="icon-annotations"></span><span class="editModeLabel">'+ labels['SidebarMyAnnotations'] +'<span class="icon-user"></span></button>'
                   + '            </div>'
                   + '        </div>'
                   + '    </div>'
                   + '    </div>'
                   + '</div>'
    var domElement = _sdw.firstElementChild;

    var sidebarContainer       = domElement.querySelector('.sidebarContainer'),
        overviewContainer      = sidebarContainer.querySelector(':scope > [data-viewmode="overview"]'),
        videoContainer         = sidebarContainer.querySelector(':scope > [data-viewmode="video"]'),
        videoContainerControls = videoContainer.querySelector(':scope > .viewmodeControls'),
        resourcesContainer     = sidebarContainer.querySelector(':scope > [data-viewmode="resources"]'),

        NewHypervideoButton    = domElement.querySelectorAll('.newHypervideoButton'),
        SaveButton             = domElement.querySelector('.saveButton'),
        SaveAsButton           = domElement.querySelector('.saveAsButton'),
        ForkButton             = domElement.querySelector('.forkButton'),
        ExportButton           = domElement.querySelectorAll('.exportButton'),
        UndoButton             = domElement.querySelector('.undoButton'),
        RedoButton             = domElement.querySelector('.redoButton');

    var _resourcesItemHandler = null;


    /**
     * Add a hypervideo locally using the File System Access API adapter.
     * Replicates the server-side hypervideoAdd logic.
     */
    function addHypervideoLocally(newDialogCtrl, validateFn, getDurationFn) {
        // Validation
        var _err = newDialogCtrl.widget().querySelector('.message.error'); _err.classList.remove('active'); _err.innerHTML = '';
        if (!validateFn()) {
            var activeTab = FTTabs(newDialogCtrl.element.querySelector('.videoSourceTabs'), 'option', 'active');
            if (activeTab === 0) {
                _err.classList.add('active'); _err.innerHTML = labels['ErrorSelectVideoFromList'];
            } else if (activeTab === 1) {
                _err.classList.add('active'); _err.innerHTML = labels['ErrorDurationMinimum4Seconds'];
            }
            return;
        }

        var formBuilder = FrameTrail.module('HypervideoFormBuilder');
        var selectedResourcesID = newDialogCtrl.element.querySelector('input[name="resourcesID"]').value || '';
        var adapter = FrameTrail.module('StorageManager').getAdapter();
        var userInfo = adapter.userInfo;

        var hypervideoData = {
            "meta": {
                "name": newDialogCtrl.element.querySelector('input[name="name"]').value,
                "description": "",
                "thumb": (selectedResourcesID.length > 0) ? FrameTrail.module('Database').resources[parseInt(selectedResourcesID)].thumb : null,
                "creator": userInfo.name || 'Local User',
                "creatorId": userInfo.id || 'local',
                "created": Date.now(),
                "lastchanged": Date.now()
            },
            "config": {
                "slidingMode": "adjust",
                "slidingTrigger": "key",
                "theme": "",
                "autohideControls": (newDialogCtrl.element.querySelector('input[name="config[autohideControls]"]') || {}).checked || false,
                "captionsVisible": (newDialogCtrl.element.querySelector('input[name="config[captionsVisible]"]') || {}).checked || false,
                "clipTimeVisible": false,
                "layoutArea": {
                    "areaTop": [],
                    "areaBottom": [],
                    "areaLeft": [],
                    "areaRight": []
                }
            },
            "clips": [
                {
                    "resourceId": (selectedResourcesID.length > 0) ? selectedResourcesID : null,
                    "src": (selectedResourcesID.length > 0) ? FrameTrail.module('Database').resources[parseInt(selectedResourcesID)].src : null,
                    "duration": (selectedResourcesID.length === 0) ? getDurationFn() : 0,
                    "start": 0,
                    "end": 0,
                    "in": 0,
                    "out": 0
                }
            ],
            "globalEvents": {
                "onReady": "",
                "onPlay": "",
                "onPause": "",
                "onEnded": ""
            },
            "customCSS": "",
            "contents": [],
            "subtitles": []
        };

        // Apply config overrides from form
        for (var configKey in hypervideoData.config) {
            var newConfigVal = (newDialogCtrl.element.querySelector('input[data-configkey="' + configKey + '"]') || {value: undefined}).value;
            newConfigVal = (newConfigVal === 'true')
                            ? true
                            : (newConfigVal === 'false')
                                ? false
                                : (newConfigVal === undefined)
                                    ? hypervideoData.config[configKey]
                                    : newConfigVal;
            hypervideoData.config[configKey] = newConfigVal;
        }

        // Collect subtitle info
        Array.from(newDialogCtrl.element.querySelectorAll('.newSubtitlesContainer input[type=file]')).forEach(function(el) {
            var match = /subtitles\[(.+)\]/g.exec(el.getAttribute('name'));
            if (match) {
                hypervideoData.subtitles.push({
                    "src": match[1] + ".vtt",
                    "srclang": match[1]
                });
            }
        });

        hypervideoData["annotation-increment"] = 1;

        var time = Math.floor(Date.now() / 1000);

        // Read hypervideo index, increment, create folder structure
        adapter.readJSON('hypervideos/_index.json').catch(function() {
            return { 'hypervideo-increment': 0, 'hypervideos': {} };
        }).then(function(hvi) {
            if (!hvi['hypervideo-increment']) { hvi['hypervideo-increment'] = 0; }
            hvi['hypervideo-increment']++;
            var newID = hvi['hypervideo-increment'];
            hvi['hypervideos'][newID] = './' + newID;

            var basePath = 'hypervideos/' + newID;

            var annotationIndex = {
                "mainAnnotation": "1",
                "annotationfiles": {
                    "1": {
                        "name": "main",
                        "description": "",
                        "created": time,
                        "lastchanged": time,
                        "hidden": false,
                        "owner": userInfo.name || 'Local User',
                        "ownerId": String(userInfo.id || 'local')
                    }
                }
            };

            var tasks = [
                adapter.writeJSON('hypervideos/_index.json', hvi),
                adapter.createDirectory(basePath + '/annotations'),
                adapter.createDirectory(basePath + '/subtitles')
            ];

            return Promise.all(tasks).then(function() {
                var writeTasks = [
                    adapter.writeJSON(basePath + '/hypervideo.json', hypervideoData),
                    adapter.writeJSON(basePath + '/annotations/_index.json', annotationIndex),
                    adapter.writeJSON(basePath + '/annotations/1.json', [])
                ];

                // Write subtitle files
                Array.from(newDialogCtrl.element.querySelectorAll('.newSubtitlesContainer input[type=file]')).forEach(function(el) {
                    var match = /subtitles\[(.+)\]/g.exec(el.getAttribute('name'));
                    if (match && el.files && el.files[0]) {
                        writeTasks.push(adapter.writeFile(basePath + '/subtitles/' + match[1] + '.vtt', el.files[0]));
                    }
                });

                return Promise.all(writeTasks).then(function() {
                    return newID;
                });
            });
        }).then(function(newID) {
            var wasEditMode = FrameTrail.getState('editMode');
            newDialogCtrl.close();
            FrameTrail.module('Database').loadHypervideoData(
                function() {
                    FrameTrail.module('ViewOverview').refreshList();
                    history.pushState({ editMode: wasEditMode }, '', '#hypervideo=' + newID);
                    if (wasEditMode) {
                        FrameTrail.changeState('editMode', false);
                    }
                    FrameTrail.module('HypervideoModel').updateHypervideo(newID, wasEditMode, true);
                },
                function() {}
            );
        }).catch(function(err) {
            newDialogCtrl.widget().querySelector('.message.error').classList.add('active'); newDialogCtrl.widget().querySelector('.message.error').innerHTML = 'Local save failed: ' + err.message;
        });
    }

    /**
     * Fork/clone a hypervideo locally.
     * Copies the entire hypervideo directory and updates the index.
     */
    function forkHypervideoLocally(forkDialogCtrl, thisID) {
        var adapter = FrameTrail.module('StorageManager').getAdapter();
        var userInfo = adapter.userInfo;

        var currentData = FrameTrail.module('Database').convertToDatabaseFormat(thisID);
        currentData.meta.name = forkDialogCtrl.element.querySelector('input[name="name"]').value;
        currentData.meta.creator = userInfo.name || 'Local User';
        currentData.meta.creatorId = userInfo.id || 'local';
        currentData.meta.created = Date.now();
        currentData.meta.lastchanged = Date.now();

        if (!currentData.meta.name || currentData.meta.name.length < 3) {
            var _err = forkDialogCtrl.element.querySelector('.message.error'); _err.classList.add('active'); _err.innerHTML = labels['ErrorGeneric'];
            return;
        }

        adapter.readJSON('hypervideos/_index.json').then(function(hvi) {
            if (!hvi['hypervideo-increment']) { hvi['hypervideo-increment'] = 0; }
            hvi['hypervideo-increment']++;
            var newID = hvi['hypervideo-increment'];
            var srcPath = 'hypervideos/' + hvi.hypervideos[thisID];
            var destPath = 'hypervideos/' + newID;

            hvi.hypervideos[newID] = './' + newID;

            // Copy the directory, then overwrite hypervideo.json and annotations
            return adapter.copyDirectory(srcPath, destPath).then(function() {
                var time = Math.floor(Date.now() / 1000);
                var annotationIndex = {
                    "mainAnnotation": "1",
                    "annotation-increment": 1,
                    "annotationfiles": {
                        "1": {
                            "name": "main",
                            "description": "",
                            "created": time,
                            "lastchanged": time,
                            "hidden": false,
                            "owner": userInfo.name || 'Local User',
                            "ownerId": String(userInfo.id || 'local')
                        }
                    }
                };

                return Promise.all([
                    adapter.writeJSON('hypervideos/_index.json', hvi),
                    adapter.writeJSON(destPath + '/hypervideo.json', currentData),
                    adapter.writeJSON(destPath + '/annotations/_index.json', annotationIndex),
                    adapter.writeJSON(destPath + '/annotations/1.json', [])
                ]).then(function() {
                    return newID;
                });
            });
        }).then(function(newID) {
            var wasEditMode = FrameTrail.getState('editMode');
            forkDialogCtrl.close();

            FrameTrail.module('Database').loadHypervideoData(
                function() {
                    FrameTrail.module('ViewOverview').refreshList();

                    history.pushState({ editMode: wasEditMode }, '', '#hypervideo=' + newID);

                    if (wasEditMode) {
                        FrameTrail.changeState('editMode', false);
                    }

                    FrameTrail.module('HypervideoModel').updateHypervideo(newID, wasEditMode, true);
                },
                function() {}
            );
        }).catch(function(err) {
            forkDialogCtrl.element.querySelector('.message.error').classList.add('active'); forkDialogCtrl.element.querySelector('.message.error').innerHTML = 'Local fork failed: ' + (err ? err.message : '');
        });
    }

    NewHypervideoButton.forEach(function(btn) { btn.addEventListener('click', function(evt) {

        var formBuilder = FrameTrail.module('HypervideoFormBuilder');

        var _ndw = document.createElement('div');
        _ndw.innerHTML = '<div class="newHypervideoDialog">'
                        + '    <form class="newHypervideoForm" method="post">'
                        + formBuilder.generateSettingsRow({})
                        + '        <hr>'
                        + formBuilder.generateVideoSourceSection({ 
                              duration: 120,  // 2 minutes default
                              showUploadButton: true
                          })
                        + '        <div class="message error"></div>'
                        + '    </form>'
                        + '</div>';
        var newDialog = _ndw.firstElementChild;

        // Attach subtitle event handlers using shared module
        formBuilder.attachSubtitleHandlers(newDialog);

        // Render video resource list
        FrameTrail.module('ResourceManager').renderList(newDialog.querySelector('.videoResourceList'), true,
            'type',
            'contains',
            ['video', 'youtube', 'vimeo']
        );

        // Store reference to the Add Hypervideo button for enabling/disabling
        var addHypervideoButton = null;

        // Validation function to check if form is valid
        function validateHypervideoForm() {
            var activeTab = FTTabs(newDialog.querySelector('.videoSourceTabs'), 'option', 'active');
            var isChooseVideoTab = (activeTab === 0); // First tab is ChooseVideo
            var isEmptyVideoTab = (activeTab === 1); // Second tab is EmptyVideo
            
            if (isChooseVideoTab) {
                // Choose Video tab: must have a selected video
                var hasSelectedVideo = newDialog.querySelector('.resourceThumb.selected') !== null;
                return hasSelectedVideo;
            } else if (isEmptyVideoTab) {
                // Empty Video tab: must have duration >= 4 seconds
                var durationValue = formBuilder.timeStringToSeconds(newDialog.querySelector('input[name="duration"]').value);
                return durationValue >= 4;
            }
            
            return false;
        }
        
        // Get duration in seconds from time input
        function getDurationFromInputs() {
            return formBuilder.timeStringToSeconds(newDialog.querySelector('input[name="duration"]').value);
        }

        // Function to update the Add Hypervideo button state
        function updateAddButtonState() {
            if (addHypervideoButton) {
                var isValid = validateHypervideoForm();
                addHypervideoButton.disabled = !isValid;
            }
        }

        _resourcesItemHandler = function(evt) {
            var thumb = evt.target.closest('.newHypervideoDialog .resourceThumb');
            if (!thumb) return;
            newDialog.querySelectorAll('.resourceThumb').forEach(function(el) { el.classList.remove('selected'); });
            thumb.classList.add('selected');
            newDialog.querySelector('input[name="resourcesID"]').value = thumb.dataset.resourceid;

            // Show YouTube warning when selecting a YouTube resource
            var ytWarning = newDialogCtrl && newDialogCtrl.widget().querySelector('.youtubeLocalWarning');
            if (ytWarning) {
                if (thumb.dataset.type === 'youtube') {
                    ytWarning.classList.add('active');
                } else {
                    ytWarning.classList.remove('active');
                }
            }

            // Update button state when video is selected
            updateAddButtonState();
        };
        document.body.addEventListener('click', _resourcesItemHandler);

        FTTabs(newDialog.querySelector('.videoSourceTabs'), {
            activate: function(event, ui) {
                if ( ui.newPanel.id == 'EmptyVideo' ) {
                    newDialog.querySelector('input[name="resourcesID"]').disabled = true;
                    newDialog.querySelector('input[name="duration"]').disabled = false;
                    newDialog.querySelectorAll('.resourceThumb').forEach(function(el) { el.classList.remove('selected'); });
                } else {
                    newDialog.querySelector('input[name="resourcesID"]').disabled = false;
                    newDialog.querySelector('input[name="duration"]').disabled = true;
                }
                
                // Update button state when tab changes
                updateAddButtonState();
            }
        });

        // Listen for changes to the duration input
        newDialog.querySelector('input[name="duration"]').addEventListener('input', function() {
            updateAddButtonState();
        });
        newDialog.querySelector('input[name="duration"]').addEventListener('change', function() {
            updateAddButtonState();
        });

        var newDialogCtrl;
        newDialog.querySelector('.newHypervideoForm').addEventListener('submit', function(e) {
            e.preventDefault();
            var form = this;

            // Validation
            var _dlgErr = newDialogCtrl.widget().querySelector('.message.error'); _dlgErr.classList.remove('active'); _dlgErr.innerHTML = '';

            if (!validateHypervideoForm()) {
                var activeTab = FTTabs(newDialog.querySelector('.videoSourceTabs'), 'option', 'active');
                var isChooseVideoTab = (activeTab === 0);
                var isEmptyVideoTab = (activeTab === 1);

                if (isChooseVideoTab) {
                    _dlgErr.classList.add('active'); _dlgErr.innerHTML = labels['ErrorSelectVideoFromList'];
                } else if (isEmptyVideoTab) {
                    _dlgErr.classList.add('active'); _dlgErr.innerHTML = labels['ErrorDurationMinimum4Seconds'];
                } else {
                    _dlgErr.classList.add('active'); _dlgErr.innerHTML = labels['ErrorChooseVideoOrSetDuration'];
                }
                return;
            }

            // Subtitles Validation
            var err = 0;
            Array.from(newDialog.querySelectorAll('.subtitlesItem')).forEach(function(el) {
                el.style.outline = '';

                if ((el.querySelector('input[type="file"]').getAttribute('name') == 'subtitles[]') || (el.querySelector('.subtitlesTmpKeySetter').value == '') || (el.querySelector('input[type="file"]').value.length == 0)) {
                    el.style.outline = '1px solid #cd0a0a';
                    _dlgErr.classList.add('active'); _dlgErr.innerHTML = labels['ErrorSubtitlesEmptyFields'];
                    err++;
                } else if ( !(new RegExp('(' + ['.vtt'].join('|').replace(/\\./g, '\\\\.') + ')$')).test(el.querySelector('input[type="file"]').value) ) {
                    el.style.outline = '1px solid #cd0a0a';
                    _dlgErr.classList.add('active'); _dlgErr.innerHTML = labels['ErrorSubtitlesWrongFormat'];
                    err++;
                }

                if (newDialog.querySelectorAll('.subtitlesItem input[type="file"][name="subtitles['+ el.querySelector('.subtitlesTmpKeySetter').value +']"]').length > 1 ) {
                    _dlgErr.classList.add('active'); _dlgErr.innerHTML = labels['ErrorSubtitlesLanguageDuplicate'];
                    return;
                }
            });
            if (err > 0) return;

            // Build hypervideoData
            var selectedResourcesID = newDialog.querySelector('input[name="resourcesID"]').value || '';

            var hypervideoData = {
                "meta": {
                    "name": newDialog.querySelector('input[name="name"]').value,
                    "description": "",
                    "thumb": (selectedResourcesID.length > 0) ? FrameTrail.module('Database').resources[parseInt(selectedResourcesID)].thumb : null,
                    "creator": FrameTrail.module('Database').users[FrameTrail.module('UserManagement').userID].name,
                    "creatorId": FrameTrail.module('UserManagement').userID,
                    "created": Date.now(),
                    "lastchanged": Date.now()
                },
                "config": {
                    "slidingMode": "adjust",
                    "slidingTrigger": "key",
                    "theme": "",
                    "autohideControls": (newDialog.querySelector('input[name="config[autohideControls]"]') || {}).checked || false,
                    "captionsVisible": (newDialog.querySelector('input[name="config[captionsVisible]"]') || {}).checked || false,
                    "clipTimeVisible": false,
                    "layoutArea": {
                        "areaTop": [],
                        "areaBottom": [],
                        "areaLeft": [],
                        "areaRight": []
                    }
                },
                "clips": [
                    {
                        "resourceId": (selectedResourcesID.length > 0) ? selectedResourcesID : null,
                        "src": (selectedResourcesID.length > 0) ? FrameTrail.module('Database').resources[parseInt(selectedResourcesID)].src : null,
                        "duration": (selectedResourcesID.length === 0) ? getDurationFromInputs() : 0,
                        "start": 0,
                        "end": 0,
                        "in": 0,
                        "out": 0
                    }
                ],
                "globalEvents": {
                    "onReady": "",
                    "onPlay": "",
                    "onPause": "",
                    "onEnded": ""
                },
                "customCSS": "",
                "contents": [],
                "subtitles": []
            };

            for (var configKey in hypervideoData.config) {
                var newConfigVal = (newDialog.querySelector('input[data-configkey="' + configKey + '"]') || {value: undefined}).value;
                newConfigVal = (newConfigVal === 'true')
                                ? true
                                : (newConfigVal === 'false')
                                    ? false
                                    : (newConfigVal === undefined)
                                        ? hypervideoData.config[configKey]
                                        : newConfigVal;
                hypervideoData.config[configKey] = newConfigVal;
            }

            Array.from(newDialog.querySelectorAll('.newSubtitlesContainer input[type=file]')).forEach(function(el) {
                var match = /subtitles\[(.+)\]/g.exec(el.getAttribute('name'));
                if (match) {
                    hypervideoData.subtitles.push({
                        "src": match[1] + ".vtt",
                        "srclang": match[1]
                    });
                }
            });

            var formData = new FormData(form);
            formData.set('a', 'hypervideoAdd');
            formData.set('src', JSON.stringify(hypervideoData, null, 4));

            _serverPost(formData)
            .then(function(response) {
                switch(response['code']) {
                    case 0:
                        var newID = response['newHypervideoID'];
                        var wasEditMode = FrameTrail.getState('editMode');
                        newDialogCtrl.close();
                        FrameTrail.module('Database').loadHypervideoData(
                            function(){
                                FrameTrail.module('ViewOverview').refreshList();
                                history.pushState({ editMode: wasEditMode }, '', '#hypervideo=' + newID);
                                if (wasEditMode) {
                                    FrameTrail.changeState('editMode', false);
                                }
                                FrameTrail.module('HypervideoModel').updateHypervideo(newID, wasEditMode, true);
                            },
                            function(){}
                        );
                        break;
                    default:
                        newDialogCtrl.widget().querySelector('.message.error').classList.add('active'); newDialogCtrl.widget().querySelector('.message.error').innerHTML = response['string'];
                        break;
                }
            });
        });


        newDialog.querySelector('.uploadNewVideoResource').addEventListener('click', function(){

            FrameTrail.module('ResourceManager').uploadResource(function(){

                var videoResourceList = newDialog.querySelector('.videoResourceList');
                videoResourceList.innerHTML = '';

                FrameTrail.module('ResourceManager').renderList(videoResourceList, true,
                    'type',
                    'contains',
                    ['video', 'youtube', 'vimeo']
                );

            });

        });

        // Handle edit button clicks in videoResourceList
        newDialog.querySelector('.videoResourceList').addEventListener('click', function(e) {
            var editBtn = e.target.closest('.resourceEditButton');
            if (!editBtn) { return; }
            e.stopPropagation();
            var resourceID = editBtn.getAttribute('data-resource-id');
            var resourceData = FrameTrail.module('Database').resources[resourceID];
            FrameTrail.module('ResourceManager').openEditDialog(resourceID, resourceData, function() {
                var videoResourceList = newDialog.querySelector('.videoResourceList');
                videoResourceList.innerHTML = '';
                FrameTrail.module('ResourceManager').renderList(videoResourceList, true,
                    'type',
                    'contains',
                    ['video', 'youtube', 'vimeo']
                );
            });
        });


        newDialogCtrl = Dialog({
            modal:    true,
            width:    830,
            height:   600,
            content:  newDialog,
            autoOpen: false,
            open: function() {
                var buttonPane = newDialogCtrl.widget().querySelector('.ft-dialog-buttonpane');
                var ytWarningEl = document.createElement('div');
                ytWarningEl.className = 'youtubeLocalWarning message warning mt-1';
                ytWarningEl.style.flexBasis = '100%';
                ytWarningEl.textContent = labels['WarningYouTubeSource'];
                buttonPane.prepend(ytWarningEl);
                buttonPane.append(newDialog.querySelector('.message.error'));
                addHypervideoButton = buttonPane.querySelector('button');
                addHypervideoButton.disabled = true;
                updateAddButtonState();
            },
            close: function() {
                if (_resourcesItemHandler) { document.body.removeEventListener('click', _resourcesItemHandler); _resourcesItemHandler = null; }
                newDialogCtrl.destroy();
            },
            buttons: [
                { text: labels['HypervideoNew'],
                    click: function() {
                        if (FrameTrail.getState('storageMode') === 'local') {
                            addHypervideoLocally(newDialogCtrl, validateHypervideoForm, getDurationFromInputs);
                        } else {
                            newDialog.querySelector('.newHypervideoForm').dispatchEvent(new Event('submit', {bubbles: true, cancelable: true}));
                        }
                    }
                },
                { text: labels['GenericCancel'],
                    click: function() {
                        newDialogCtrl.close();
                    }
                }
            ]
        });
        newDialogCtrl.open();

    }); });

    SaveButton.addEventListener('click', function(){
        if (FrameTrail.module('StorageManager').canSave()) {
            FrameTrail.module('HypervideoModel').save();
        } else {
            FrameTrail.module('HypervideoModel').saveAs();
        }
    });

    SaveAsButton.addEventListener('click', function(){
        FrameTrail.module('HypervideoModel').saveAs();
    });

    UndoButton.addEventListener('click', function(){
        FrameTrail.module('UndoManager').undo();
    });

    RedoButton.addEventListener('click', function(){
        FrameTrail.module('UndoManager').redo();
    });

    // Listen for undo state changes to update button states
    FrameTrail.addEventListener('undoStateChanged', function(evt) {
        var state = evt.detail;
        UndoButton.disabled = !state.canUndo;
        RedoButton.disabled = !state.canRedo;

        // Update tooltips with action descriptions
        if (state.undoDescription) {
            UndoButton.setAttribute('data-tooltip-bottom-left', labels['GenericUndo'] + ': ' + state.undoDescription);
        } else {
            UndoButton.setAttribute('data-tooltip-bottom-left', labels['GenericUndo']);
        }
        if (state.redoDescription) {
            RedoButton.setAttribute('data-tooltip-bottom-left', labels['GenericRedo'] + ': ' + state.redoDescription);
        } else {
            RedoButton.setAttribute('data-tooltip-bottom-left', labels['GenericRedo']);
        }
    });

    ForkButton.addEventListener('click', function(evt) {

        evt.preventDefault();
        evt.stopPropagation();

        var thisID = FrameTrail.module('RouteNavigation').hypervideoID,
            thisHypervideo = FrameTrail.module('Database').hypervideo;

        var _fdw = document.createElement('div');
        _fdw.innerHTML = '<div class="forkHypervideoDialog">'
                         + '    <div class="message active">'+ labels['MessageForkHypervideo'] +'</div>'
                         + '    <form method="POST" class="forkHypervideoForm">'
                         + '        <input type="text" name="name" placeholder="" value="'+ thisHypervideo.name +'"><br>'
                         + '        <div class="message error"></div>'
                         + '    </form>'
                         + '</div>';
        var forkDialog = _fdw.firstElementChild;

        var forkDialogCtrl;
        forkDialog.querySelector('.forkHypervideoForm').addEventListener('submit', function(e) {
            e.preventDefault();
            var form = this;

            var currentData = FrameTrail.module("Database").convertToDatabaseFormat(thisID);
            currentData.meta.name = forkDialog.querySelector('input[name="name"]').value;
            currentData.meta.creator = FrameTrail.module('Database').users[FrameTrail.module('UserManagement').userID].name;
            currentData.meta.creatorId = FrameTrail.module('UserManagement').userID;

            var formData = new FormData(form);
            formData.set('a', 'hypervideoClone');
            formData.set('hypervideoID', thisID);
            formData.set('src', JSON.stringify(currentData, null, 4));

            _serverPost(formData)
            .then(function(response) {
                switch(response['code']) {
                    case 0:
                        var wasEditMode = FrameTrail.getState('editMode');

                        forkDialogCtrl.close();
                        FrameTrail.module('Database').loadHypervideoData(
                            function(){
                                FrameTrail.module('ViewOverview').refreshList();

                                var newHypervideoID = response['newHypervideoID'];

                                history.pushState({
                                    editMode: wasEditMode
                                }, "", "#hypervideo=" + newHypervideoID);

                                if (wasEditMode) {
                                    FrameTrail.changeState('editMode', false);
                                }

                                FrameTrail.module('HypervideoModel').updateHypervideo(newHypervideoID, wasEditMode, true);
                            },
                            function(){}
                        );

                        break;
                    default:
                        var _frkErr = forkDialog.querySelector('.message.error'); _frkErr.classList.add('active'); _frkErr.innerHTML = labels['ErrorGeneric'];
                        break;
                }
            });
        });

        forkDialogCtrl = Dialog({
            modal:   true,
            content: forkDialog,
            close: function() {
                forkDialogCtrl.destroy();
            },
            buttons: [
                { text: labels['GenericForkHypervideo'],
                    click: function() {
                        if (FrameTrail.getState('storageMode') === 'local') {
                            forkHypervideoLocally(forkDialogCtrl, thisID);
                        } else {
                            forkDialog.querySelector('.forkHypervideoForm').dispatchEvent(new Event('submit', {bubbles: true, cancelable: true}));
                        }
                    }
                },
                { text: labels['GenericCancel'],
                    click: function() {
                        forkDialogCtrl.close();
                    }
                }
            ]
        });

    });

    ExportButton.forEach(function(btn) { btn.addEventListener('click', function(){
        FrameTrail.module('HypervideoModel').exportIt();
    }); });

    videoContainerControls.querySelectorAll('.editMode').forEach(function(btn) {
        btn.addEventListener('click', function(evt) {
            FrameTrail.changeState('editMode', this.dataset.editmode);
        });
    });


    /**
     * I am called from {{#crossLink "Interface/create:method"}}Interface/create(){{/crossLink}} and set up all my elements.
     * @method create
     */
    function create() {

        toggleSidebarOpen(FrameTrail.getState('sidebarOpen'));
        changeViewSize(FrameTrail.getState('viewSize'));
        toggleFullscreen(FrameTrail.getState('fullscreen'));
        toogleUnsavedChanges(FrameTrail.getState('unsavedChanges'));
        toggleViewMode(FrameTrail.getState('viewMode'));
        toggleEditMode(FrameTrail.getState('editMode'));

        document.querySelector(FrameTrail.getState('target')).append(domElement);

        if ( FrameTrail.getState('embed') ) {
            //domElement.find('.viewmodeControls').hide();
        }



    };


    /**
     * I react to a change in the global state "sidebarOpen"
     * @method toggleSidebarOpen
     * @param {Boolean} opened
     */
    function toggleSidebarOpen(opened) {

        if (opened) {
            domElement.classList.add('open');
        } else {
            domElement.classList.remove('open');
        }

    };


    /**
     * I react to a change in the global state "viewSize"
     * @method changeViewSize
     * @param {Array} arrayWidthAndHeight
     */
    function changeViewSize(arrayWidthAndHeight) {

        

    };


    /**
     * I react to a change in the global state "fullscreen"
     * @method toggleFullscreen
     * @param {Boolean} aBoolean
     */
    function toggleFullscreen(aBoolean) {



    };


    /**
     * I react to a change in the global state "unsavedChanges"
     * @method toogleUnsavedChanges
     * @param {Boolean} aBoolean
     */
    function toogleUnsavedChanges(aBoolean) {

        var noDirectSave = !FrameTrail.module('StorageManager').canSave();

        if (aBoolean) {
            domElement.querySelectorAll('button[data-viewmode="video"]').forEach(function(el) { el.classList.add('unsavedChanges'); });
            if (noDirectSave) {
                SaveAsButton.classList.add('unsavedChanges');
            } else {
                SaveButton.classList.add('unsavedChanges');
            }
        } else {
            domElement.querySelectorAll('button[data-viewmode="video"]').forEach(function(el) { el.classList.remove('unsavedChanges'); });
            domElement.querySelectorAll('button.editMode').forEach(function(el) { el.classList.remove('unsavedChanges'); });
            SaveButton.classList.remove('unsavedChanges');
            SaveAsButton.classList.remove('unsavedChanges');
        }

    };

    /**
     * I am called from the {{#crossLink "HypervideoModel/newUnsavedChange:method"}}HypervideoModel/newUnsavedChange(){{/crossLink}}.
     *
     * I mark the categories (overlays, annotations, codeSnippets), which have unsaved changes inside them.
     *
     * @method newUnsavedChange
     * @param {String} category
     */
    function newUnsavedChange(category) {

        if (category == 'codeSnippets' || category == 'events' || category == 'customCSS') {
            // camelCase not valid in attributes
            domElement.querySelector('button[data-editmode="codesnippets"]').classList.add('unsavedChanges');
        } else if (category == 'layout') {
            domElement.querySelector('button[data-editmode="layout"]').classList.add('unsavedChanges');
        } else {
            domElement.querySelector('button[data-editmode="'+category+'"]').classList.add('unsavedChanges');
        }

    };



    /**
     * I react to a change in the global state "viewMode"
     * @method toggleViewMode
     * @param {String} viewMode
     */
    function toggleViewMode(viewMode) {

        Array.from(sidebarContainer.children).forEach(function(el) { el.classList.remove('active'); });

        domElement.querySelector('[data-viewmode="' + viewMode + '"]').classList.add('active');

        changeViewSize();

        // Update button permissions when entering video mode (after hypervideo switch)
        if (viewMode === 'video') {
            updateEditModeButtonPermissions();
        }

    };

    /**
     * I react to a change in the global state "editMode"
     * @method toggleEditMode
     * @param {String} editMode
     * @param {String} oldEditMode
     */
    function toggleEditMode(editMode, oldEditMode){

        if (editMode) {

            domElement.classList.add('editActive');

            if (oldEditMode === false) {

                var _canSave = FrameTrail.module('StorageManager').canSave();
                var _isGuest = FrameTrail.module('UserManagement').isGuestMode();
                NewHypervideoButton.forEach(function(btn) { btn.style.display = ''; btn.disabled = _isGuest && !_canSave; });
                ForkButton.style.display = ''; ForkButton.disabled = _isGuest && !_canSave;
                ExportButton.forEach(function(btn) { btn.style.display = 'none'; });
                SaveButton.style.display = ''; SaveButton.disabled = !_canSave;
                SaveAsButton.style.display = '';
                UndoButton.style.display = '';
                RedoButton.style.display = '';

                videoContainerControls.querySelectorAll('.editMode').forEach(function(el) { el.classList.add('inEditMode'); });

            }

            videoContainerControls.querySelectorAll('.editMode').forEach(function(el) { el.classList.remove('active'); });

            videoContainerControls.querySelector('[data-editmode="' + editMode + '"]').classList.add('active');

            FrameTrail.changeState('sidebarOpen', true);


        } else {

            domElement.classList.remove('editActive');

            NewHypervideoButton.forEach(function(btn) { btn.style.display = 'none'; });
            //ExportButton.show();
            SaveButton.style.display = 'none';
            SaveAsButton.style.display = 'none';
            UndoButton.style.display = 'none';
            RedoButton.style.display = 'none';
            ForkButton.style.display = 'none';

            videoContainerControls.querySelectorAll('.editMode').forEach(function(el) { el.classList.remove('inEditMode'); });

            FrameTrail.changeState('sidebarOpen', false);

        }

        changeViewSize();


    }


    /**
     * I update the disabled state of edit mode buttons based on user permissions.
     * Admins and hypervideo owners can edit all aspects (layout, overlays, codesnippets).
     * Other users can only edit annotations.
     * @method updateEditModeButtonPermissions
     */
    function updateEditModeButtonPermissions() {

        if (!FrameTrail.getState('loggedIn')) {
            return;
        }

        if (FrameTrail.module('RouteNavigation').hypervideoID) {
            if (FrameTrail.module('UserManagement').userRole == 'admin' || parseInt(FrameTrail.module('HypervideoModel').creatorId) == FrameTrail.module('UserManagement').userID) {
                // Admin or owner: enable all buttons
                videoContainerControls.querySelectorAll('.editMode').forEach(function(el) { el.classList.remove('disabled'); });
            } else {
                // Non-owner: disable layout, overlays, codesnippets (can only edit annotations)
                videoContainerControls.querySelectorAll('.editMode').forEach(function(el) { el.classList.remove('disabled'); });
                videoContainerControls.querySelector('.editMode[data-editmode="layout"]').classList.add('disabled');
                videoContainerControls.querySelector('.editMode[data-editmode="overlays"]').classList.add('disabled');
                videoContainerControls.querySelector('.editMode[data-editmode="codesnippets"]').classList.add('disabled');
                videoContainerControls.querySelector('.editMode[data-editmode="chapters"]').classList.add('disabled');
            }
        }

    }


    /**
     * I react to a change in the global state "loggedIn"
     * @method changeUserLogin
     * @param {Boolean} loggedIn
     */
    function changeUserLogin(loggedIn) {

        if (loggedIn) {
            updateEditModeButtonPermissions();
        }

    }




    return {

        create: create,

        onChange: {
            sidebarOpen:    toggleSidebarOpen,
            viewSize:       changeViewSize,
            fullscreen:     toggleFullscreen,
            unsavedChanges: toogleUnsavedChanges,
            viewMode:       toggleViewMode,
            editMode:       toggleEditMode,
            loggedIn:       changeUserLogin
        },

        newUnsavedChange: newUnsavedChange,

        /**
         * I am the width of the sidebar's DOM element.
         * @attribute width
         * @type Number
         * @readOnly
         */
        get width() { return domElement.offsetWidth; }

    };

});
