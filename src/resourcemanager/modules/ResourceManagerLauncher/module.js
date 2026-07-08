/**
 * @module ResourceManager
 */

/**
 * I am the ResourceManagerLauncher which launches the stand-alone application ResourceManager.
 *
 * I am the entry point to the application and i am called from __index.html__ with
 *
 *     $(document).ready( function() {
 *
 *          FrameTrail.start('ResourceManagerLauncher', {
 *              // initial global state
 *          });
 *
 *      } );
 *
 * I perform the following tasks:
 * * I init the necessary modules
 * * I ensure the user is logged in
 * * I prepare the interface
 *
 * I am a "one-pass" module, this is: I don't export any public methods or properties, and
 * my sole purpose is to start other modules, after which I am discarded.
 *
 * @class ResourceManagerLauncher
 * @static
 * @main
 */

 FrameTrail.defineModule('ResourceManagerLauncher', function(FrameTrail){


    // Set up Localization
    FrameTrail.initModule('Localization');
    var labels = FrameTrail.module('Localization').labels;
    
    // Set up the various data models
    FrameTrail.initModule('RouteNavigation');
    FrameTrail.initModule('StorageManager');
    FrameTrail.initModule('Database');


    FrameTrail.module('StorageManager').init().then(function() {

        var storageMode = FrameTrail.getState('storageMode');

        if (storageMode === 'needsFolder') {
            var _fdw = document.createElement('div');
            _fdw.innerHTML = '<div class="folderPromptDialog"><p>' + labels['SelectDataFolderDescription'] + '</p></div>';
            var folderDialog = _fdw.firstElementChild;

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
                                continueLoadingRM();
                            }).catch(function(err) {
                                alert(labels['ErrorCouldNotAccessFolder'] + ' ' + err.message);
                            });
                        }
                    }
                ]
            });
            return;
        }

        if (storageMode === 'noStorage') {
            alert(labels['ErrorNoStorageAvailable']);
            return;
        }

        continueLoadingRM();

    }); // StorageManager.init()

    function continueLoadingRM() {

        // Initialize UserManagement early so we can determine — via the server's
        // userCheckLogin — whether this is a private instance BEFORE loading the
        // (gated) config/_data. On a private server instance the user must
        // authenticate first; the session cookie then unlocks the _data reads.
        FrameTrail.initModule('UserManagement');

        FrameTrail.module('UserManagement').isLoggedIn(function(loggedIn) {

            if (FrameTrail.getState('storageMode') === 'server'
                    && FrameTrail.module('UserManagement').isForceLogin()
                    && !loggedIn) {
                FrameTrail.module('UserManagement').ensureAuthenticated(function() {
                    loadConfigAndInitRM();
                }, function() {}, true);
            } else {
                loadConfigAndInitRM();
            }

        });

    }

    function loadConfigAndInitRM() {

        FrameTrail.module('Database').loadConfigData(function() {

            // Resource manager always uses classic theme (no per-project theming)
            var _targetEl = document.querySelector(FrameTrail.getState('target'));
            if (_targetEl) _targetEl.setAttribute('data-frametrail-theme', 'classic');

            // Apply config language before any UI is rendered
            var configLang = (FrameTrail.module('Database').config || {}).defaultLanguage;
            if (configLang) { FrameTrail.module('Localization').setLanguage(configLang); }

            // Initialize UI-building modules AFTER language is set so their
            // HTML is generated with the correct locale from the start.
            FrameTrail.initModule('ResourceManager');
            FrameTrail.initModule('ViewResources');

            // Non-server modes may still set alwaysForceLogin (e.g. local folder):
            // require identification before showing the manager. In server mode
            // we have already authenticated above, so this is a no-op there.
            if (FrameTrail.module('Database').config.alwaysForceLogin && !FrameTrail.getState('loggedIn')) {
                FrameTrail.module('UserManagement').ensureAuthenticated(function() {
                    initResourceManager();
                }, function() {}, true);
            } else {
                initResourceManager();
            }
        }, function(err) {
            alert(err);
        });

    }

    function initResourceManager() {

        appendTitlebar();

        document.querySelector(FrameTrail.getState('target')).insertAdjacentHTML('beforeend', '<div class="mainContainer"></div>');

        FrameTrail.module('ViewResources').create(true);

        FrameTrail.module('UserManagement').isLoggedIn(function(loginState) {
            toggleLoginState(loginState);
            FrameTrail.module('ViewResources').open();
        });

    }

    /**
     * I append the title bar.
     * @method appendTitlebar
     */
    function appendTitlebar() {

        var _tbw = document.createElement('div');
        _tbw.innerHTML = '<div class="titlebar">'
                         + '    <div class="titlebarTitle">'+ labels['ResourceManager'] +'</div>'
                         + '    <div class="titlebarActionButtonContainer">'
                         + '        <button type="button" class="startEditButton" data-tooltip-bottom-left="'+ labels['GenericEditStart'] +'"><span class="icon-edit"></span></button>'
                         + '        <button type="button" class="logoutButton" data-tooltip-bottom-right="'+ labels['UserLogout'] +'"><span class="icon-logout"></span></button>'
                         + '    </div>'
                         + '</div>';
        var titlebar = _tbw.firstElementChild;

        document.querySelector(FrameTrail.getState('target')).append(titlebar);

        titlebar.querySelector('.logoutButton').addEventListener('click', function(){
            FrameTrail.module('UserManagement').logout();
            toggleLoginState(false);
        });

        titlebar.querySelector('.startEditButton').addEventListener('click', function(){
            FrameTrail.module('UserManagement').ensureAuthenticated(function() {

                // login success
                toggleLoginState(true);

            }, function() {
                // login aborted
            });
        });

    }


    /**
     * I toggle the login state (hide / show editing UI).
     * @method toggleLoginState
     * @param {Boolean} loggedIn
     * @private
     */
    function toggleLoginState(loggedIn) {

        var _targetEl = document.querySelector(FrameTrail.getState('target'));
        if (loggedIn) {
            _targetEl.querySelectorAll('.resourcesControls, .logoutButton').forEach(function(el) { el.style.display = ''; });
            _targetEl.querySelector('.startEditButton').style.display = 'none';
            _targetEl.querySelectorAll('.titlebar, .mainContainer').forEach(function(el) { el.classList.add('editActive'); });
            _targetEl.querySelector('.viewResources').classList.remove('resourceManager');
        } else {
            _targetEl.querySelectorAll('.resourcesControls, .logoutButton').forEach(function(el) { el.style.display = 'none'; });
            _targetEl.querySelector('.startEditButton').style.display = '';
            _targetEl.querySelectorAll('.titlebar, .mainContainer').forEach(function(el) { el.classList.remove('editActive'); });
            _targetEl.querySelector('.viewResources').classList.add('resourceManager');
        }

    }





    return null;

});
