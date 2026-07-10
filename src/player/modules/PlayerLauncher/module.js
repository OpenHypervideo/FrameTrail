/**
 * @module Player
 */

/**
 * I am the PlayerLauncher.
 * I am the entry point to the application and i am called from __index.html__ with
 *
 *     $(document).ready( function() {
 *
 *          FrameTrail.start('PlayerLauncher', {
 *              // initial global state
 *          });
 *
 *      } );
 *
 * I initialize all main modules, and then start their init process in the right order.
 * When I am finished, the Application is either up and running, or displays a meaningful
 * error message, why loading has failed.
 * I am a "one-pass" module, this is: I don't export any public methods or properties, and
 * my sole purpose is to start other modules, after which I am discarded.
 *
 * @class PlayerLauncher
 * @static
 * @main
 */

 FrameTrail.defineModule('PlayerLauncher', function(FrameTrail){

    // ─── Simple init shorthand pre-processing ───────────────────────────────
    // Must run BEFORE RouteNavigation.initModule so that `startID: 0` is in
    // state when RouteNavigation captures it into its `hypervideoID` closure.
    // If the caller used the shorthand API (videoElement / videoSource +
    // annotations) instead of the full `contents` array, synthesize a minimal
    // single-hypervideo contents array here so the rest of the init chain
    // works without modification.
    if (!FrameTrail.getState('contents')) {

        var _videoSrc    = null;
        var _videoElOpt  = FrameTrail.getState('videoElement');
        var _videoSrcOpt = FrameTrail.getState('videoSource');
        var _annoOpt     = FrameTrail.getState('annotations');

        if (_videoElOpt) {
            // Scenario A — adopt existing <video> element
            var _el = (typeof _videoElOpt === 'string')
                ? document.querySelector(_videoElOpt)
                : _videoElOpt;
            if (_el) {
                _videoSrc = _el.getAttribute('src') || _el.currentSrc || '';
            }
        } else if (_videoSrcOpt) {
            // Scenario B — explicit target container + video URL
            _videoSrc = _videoSrcOpt;
        }

        if (_videoSrc !== null) {
            var _annotations = !_annoOpt      ? []
                : Array.isArray(_annoOpt)     ? _annoOpt
                : [_annoOpt];

            FrameTrail.changeState('contents', [{
                hypervideo: {
                    meta: {
                        name:        'Video',
                        description: '',
                        thumb:       null,
                        creator:     'guest',
                        creatorId:   'guest',
                        created:     Date.now(),
                        lastchanged: Date.now()
                    },
                    config: {
                        hidden:            false,
                        slidingMode:       'none',
                        slidingTrigger:    'click',
                        autohideControls:  false,
                        captionsVisible:   false,
                        clipTimeVisible:   false,
                        layoutArea: {
                            areaTop:    [],
                            areaBottom: [],
                            areaLeft:   [],
                            areaRight:  []
                        }
                    },
                    clips: [{
                        src:        _videoSrc,
                        duration:   0,
                        in:         0,
                        out:        0,
                        resourceId: null
                    }],
                    contents:     [],
                    subtitles:    [],
                    globalEvents: {},
                    customCSS:    ''
                },
                annotations: _annotations
            }]);

            FrameTrail.changeState('startID', '0');
        }
    }
    // ─── end simple init shorthand pre-processing ────────────────────────────


    // Set up Localization
    FrameTrail.initModule('Localization');
    var labels = FrameTrail.module('Localization').labels;

    // Set up Tooltips (top-layer via Popover API — escapes overflow clipping)
    FrameTrail.initModule('Tooltip');

    // Set up Overlay interface
    FrameTrail.initModule('InterfaceModal');
    FrameTrail.module('InterfaceModal').showStatusMessage(labels['MessageStateLoadingData']);

    // Set up the various data models
    FrameTrail.initModule('RouteNavigation');
    FrameTrail.initModule('StorageManager');
    FrameTrail.initModule('UserManagement');
    FrameTrail.initModule('Database');
    FrameTrail.initModule('TagModel');
    FrameTrail.initModule('ResourceManager');
    FrameTrail.initModule('HypervideoFormBuilder');
    FrameTrail.initModule('HypervideoModel');

    // Set up Timeline Controller
    FrameTrail.initModule('TimelineController');

    // Set up User Traces
    FrameTrail.initModule('UserTraces');

    // Set up Undo Manager
    FrameTrail.initModule('UndoManager');


    // Initialize storage, then start the actual init process

    FrameTrail.module('StorageManager').init().then(function() {

        var storageMode = FrameTrail.getState('storageMode');

        if (storageMode === 'needsFolder') {
            // File System Access API available but no folder selected — prompt user
            showFolderPrompt();
            return;
        }

        if (storageMode === 'download' && window.location.protocol === 'file:' && FrameTrail.getState('config') === null) {
            // Browser opened the file directly but doesn't support the File System Access API
            // (e.g. Firefox, Safari). There is no way to load persistent data in this context.
            // Only applies when no inline config was provided — examples with inline data work fine.
            FrameTrail.module('InterfaceModal').hideLoadingScreen();
            FrameTrail.module('InterfaceModal').showErrorMessage(labels['ErrorBrowserFileProtocol']);
            return;
        }

        // Sync login state now that storageMode is known.
        // UserManagement.isLoggedIn() ran at module-init time before storageMode
        // was set, so loggedIn may be stale (false) for local/download modes.
        FrameTrail.module('UserManagement').isLoggedIn(function() {
            continueLoading();
        });

    });

    function continueLoading() {

        // Private server instance (config.alwaysForceLogin): the _data files are
        // gated behind a valid session, so we must authenticate BEFORE loading
        // any data. The privacy flag comes from the server's userCheckLogin
        // response (available before Database.config is loaded). After a
        // successful login the session cookie is set and continueLoading() reruns
        // — this time loggedIn is true, so it proceeds to load.
        if (FrameTrail.getState('storageMode') === 'server'
                && FrameTrail.module('UserManagement').isForceLogin()
                && !FrameTrail.getState('loggedIn')) {
            FrameTrail.module('InterfaceModal').hideMessage();
            FrameTrail.module('UserManagement').ensureAuthenticated(function() {
                continueLoading();
            }, function() {}, true);
            return;
        }

        if (FrameTrail.module('RouteNavigation').hypervideoID) {

            FrameTrail.module('Database').loadData(

                function () {

                    // Apply config language before any UI is rendered
                    var configLang = (FrameTrail.module('Database').config || {}).defaultLanguage;
                    if (configLang) { FrameTrail.module('Localization').setLanguage(configLang); }

                    // Initialize UI modules after language is set so labels are correct
                    FrameTrail.initModule('Interface');
                    FrameTrail.initModule('HypervideoController');

                    FrameTrail.module('UserTraces').initTraces();

                    if (FrameTrail.module('Database').config.alwaysForceLogin) {
                        FrameTrail.module('InterfaceModal').hideMessage();
                        FrameTrail.module('UserManagement').ensureAuthenticated(function() {
                            initHypervideo();
                        }, function() {}, true);
                    } else {
                        initHypervideo();
                    }

                    function initHypervideo() {

                        FrameTrail.module('TagModel').initTagModel(

                            function () {
                                try {

                                FrameTrail.module('InterfaceModal').setLoadingTitle(FrameTrail.module('Database').hypervideo.name);

                                FrameTrail.module('HypervideoModel').initModel(function(){

                                    FrameTrail.module('Interface').create(function(){

                                        FrameTrail.module('InterfaceModal').hideLoadingScreen();

                                        FrameTrail.module('HypervideoController').initController(

                                            function(){

                                                // Finished
                                                FrameTrail.module('InterfaceModal').hideMessage();

                                                var hvVid = document.querySelector(FrameTrail.getState('target') + ' .hypervideo video.video');
                                                if (hvVid) { hvVid.classList.remove('nocolor', 'dark'); }

                                            },

                                            function(errorMsg){

                                                // Fail: Init thread was aborted with:
                                                FrameTrail.module('InterfaceModal').showErrorMessage(errorMsg);

                                            }

                                        );

                                    });


                                });

                                } catch (e) {
                                    console.error('FrameTrail init error:', e);
                                    FrameTrail.module('InterfaceModal').showErrorMessage(labels['ErrorGeneric'] + ': ' + e.message);
                                }

                            },

                            function (errorMsg) {
                                console.error('FrameTrail TagModel init error:', errorMsg);
                                FrameTrail.module('InterfaceModal').showErrorMessage(errorMsg || labels['ErrorCouldNotInitTagModel']);
                            }

                        );

                    }

                },

                function(errorMsg){

                    // Fail: Init was aborted with:
                    FrameTrail.module('InterfaceModal').showErrorMessage(errorMsg);
                    if (FrameTrail.getState('storageMode') === 'local') {
                        showFolderPrompt();
                    }

                }

            );

        } else {

            FrameTrail.changeState('viewMode', 'overview');

            FrameTrail.module('Database').loadData(

                function(){

                    // Auto-open if there is exactly one hypervideo and no explicit ID was requested
                    var hvIDs = Object.keys(FrameTrail.module('Database').hypervideos);
                    if (hvIDs.length === 1) {
                        FrameTrail.module('RouteNavigation').hypervideoID = hvIDs[0];
                        FrameTrail.changeState('viewMode', 'video');
                        continueLoading();
                        return;
                    }

                    // Apply config language before any UI is rendered
                    var configLang = (FrameTrail.module('Database').config || {}).defaultLanguage;
                    if (configLang) { FrameTrail.module('Localization').setLanguage(configLang); }

                    // Initialize UI modules after language is set so labels are correct
                    FrameTrail.initModule('Interface');

                    FrameTrail.module('UserTraces').initTraces();

                    if (FrameTrail.module('Database').config.alwaysForceLogin) {
                        FrameTrail.module('InterfaceModal').hideMessage();
                        FrameTrail.module('UserManagement').ensureAuthenticated(function() {
                            initOverview();
                        }, function() {}, true);
                    } else {
                        initOverview();
                    }

                    function initOverview() {

                        FrameTrail.module('InterfaceModal').setLoadingTitle(labels['GenericOverview']);

                        FrameTrail.module('Interface').create(function(){

                            // Finished
                            FrameTrail.module('InterfaceModal').hideMessage();
                            FrameTrail.module('InterfaceModal').hideLoadingScreen();

                        });

                    }

                },

                function(errorMsg){

                    // Fail: Init was aborted with:
                    FrameTrail.module('InterfaceModal').showErrorMessage(errorMsg);
                    if (FrameTrail.getState('storageMode') === 'local') {
                        showFolderPrompt();
                    }

                }

            );

        }

    }


    function showFolderPrompt() {
        FrameTrail.module('InterfaceModal').hideLoadingScreen();
        FrameTrail.module('InterfaceModal').hideMessage();

        var currentFolder = FrameTrail.module('StorageManager').getFolderName();
        var folderInfo = currentFolder
            ? '<p style="margin-top:8px; color:#666;">' + labels['CurrentFolder'] + ': <strong>' + currentFolder + '</strong></p>'
            : '';

        var _fdWrapper = document.createElement('div');
        _fdWrapper.innerHTML = '<div class="folderPromptDialog">'
            + '<p>' + labels['SelectDataFolderDescription'] + '</p>'
            + folderInfo
            + '</div>';
        var folderDialog = _fdWrapper.firstElementChild;

        var folderDialogCtrl = Dialog({
            title:         labels['SelectDataFolder'],
            content:       folderDialog,
            modal:         true,
            width:         450,
            closeOnEscape: false,
            buttons: [
                {
                    text: labels['SelectFolder'],
                    click: function() {
                        FrameTrail.module('StorageManager').switchToLocal().then(function() {
                            folderDialogCtrl.destroy();
                            // Clear hypervideo hash — old ID likely doesn't exist in new folder
                            if (window.location.hash) {
                                window.location.hash = '';
                                window.location.reload();
                                return;
                            }
                            FrameTrail.module('InterfaceModal').showStatusMessage(labels['MessageStateLoadingData']);
                            FrameTrail.module('InterfaceModal').showLoadingScreen();
                            continueLoading();
                        }).catch(function(err) {
                            FrameTrail.module('InterfaceModal').showErrorMessage(labels['ErrorCouldNotAccessFolder'] + ' ' + err.message);
                        });
                    }
                }
            ]
        });
    }


    return null;

});
