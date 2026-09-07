/**
 * @module Player
 */


/**
 * I am the Titlebar. I provide a place for a title text, and for two buttons (opening the
 * {{#crossLink "Sidebar"}}Sidebar{{/crossLink}} and – YET TO IMPLEMENT – the social sharing widgets).
 *
 * @class Titlebar
 * @static
 */



FrameTrail.defineModule('Titlebar', function(FrameTrail){

    var labels = FrameTrail.module('Localization').labels;

    var _tbWrapper = document.createElement('div');
    _tbWrapper.innerHTML = '<div class="titlebar">'
                            + '  <div class="titlebarViewMode">'
                            + '      <button data-viewmode="overview" data-tooltip-bottom-left="'+ labels['GenericOverview'] +'"><span class="icon-overview"></span></button>'
                            + '      <button data-viewmode="video"><span class="icon-hypervideo"></span></button>'
                            + '  </div>'
                            + '  <div class="titlebarTitle"><button class="hypervideoEditButton" data-tooltip-bottom-right="'+ labels['SettingsHypervideoSettings'] +'"><span class="icon-pencil"></span></button><button class="hypervideoDeleteButton" data-tooltip-bottom-right="'+ labels['GenericDeleteHypervideo'] +'"><span class="icon-trash"></span></button></div>'
                            + '  <div class="titlebarActionButtonContainer">'
                            + '      <div class="collaborationPresence"></div>'
                            + '      <button class="adminSettingsButton" data-tooltip-bottom-right="'+ labels['GenericAdministration'] +'"><span class="icon-cog"></span></button>'
                            + '      <button class="manageResourcesButton resourceManagerIcon" data-tooltip-bottom-right="'+ labels['ResourcesManage'] +'"><span class="icon-folder-open"></span></button>'
                            + '      <button class="userSettingsButton" data-tooltip-bottom-right="'+ labels['UserMySettings'] +'"><span class="icon-user"></span></button>'
                            + '      <button class="logoutButton" data-tooltip-bottom-right="'+ labels['UserLogout'] +'"><span class="icon-logout"></span></button>'
                            + '      <button class="startEditButton" data-tooltip-bottom-right="'+ labels['GenericEditStart'] +'"><span class="icon-edit"></span></button>'
                            + '      <button class="leaveEditModeButton" data-tooltip-bottom-right="'+ labels['GenericEditEnd'] +'"><span class="icon-ok-squared"></span></button>'
                            + '  </div>'
                            + '</div>';
    var domElement = _tbWrapper.firstElementChild;

    var TitlebarViewMode        = domElement.querySelector('.titlebarViewMode'),
        TitlebarTitle           = domElement.querySelector('.titlebarTitle'),
        HypervideoEditButton    = domElement.querySelector('.hypervideoEditButton'),
        HypervideoDeleteButton  = domElement.querySelector('.hypervideoDeleteButton'),
        ManageResourcesButton   = domElement.querySelector('.manageResourcesButton'),
        AdminSettingsButton     = domElement.querySelector('.adminSettingsButton'),
        StartEditButton         = domElement.querySelector('.startEditButton'),
        LeaveEditModeButton     = domElement.querySelector('.leaveEditModeButton'),
        UserSettingsButton      = domElement.querySelector('.userSettingsButton'),
        CollaborationPresence   = domElement.querySelector('.collaborationPresence');


    /**
     * I show one avatar per other person currently in this hypervideo. The
     * rendering itself lives in the Collaboration module, because the settings
     * dialogs show the same avatars for their own scopes.
     *
     * @method renderPresence
     */
    function renderPresence() {

        var Collaboration = FrameTrail.module('Collaboration');
        if (!CollaborationPresence || !Collaboration) return;

        Collaboration.renderAvatars(CollaborationPresence);

    }

    StartEditButton.addEventListener('click', function(){

        if (FrameTrail.module('RouteNavigation').environment.iframe) {
            FrameTrail.module('ViewVideo').toggleNativeFullscreenState(false, 'open');
        }

        FrameTrail.module('UserManagement').ensureAuthenticated(
            function(){

                FrameTrail.changeState('editMode', 'preview');

                FrameTrail.triggerEvent('userAction', {
                    action: 'EditStart'
                });

            },
            function(){
                /* Start edit mode canceled */
                if (FrameTrail.module('RouteNavigation').environment.iframe) {
                    FrameTrail.module('ViewVideo').toggleNativeFullscreenState(false, 'close');
                }
            }
        );
    });

    LeaveEditModeButton.addEventListener('click', function(){
        FrameTrail.module('HypervideoModel').leaveEditMode();
    });

    UserSettingsButton.addEventListener('click', function(){
        FrameTrail.module('UserManagement').showMySettings();
    });

    domElement.querySelector('.sidebarToggleButton') && domElement.querySelector('.sidebarToggleButton').addEventListener('click', function(){

        FrameTrail.changeState('sidebarOpen', ! FrameTrail.getState('sidebarOpen'));

    });

    if (!FrameTrail.module('RouteNavigation').hypervideoID) {
        domElement.querySelector('button[data-viewmode="video"]').style.display = 'none';
    }

    TitlebarViewMode.addEventListener('click', function(evt) {
        var btn = evt.target.closest('button');
        if (btn) { FrameTrail.changeState('viewMode', btn.getAttribute('data-viewmode')); }
    });


    domElement.querySelector('.logoutButton').addEventListener('click', function(){

        FrameTrail.module('HypervideoModel').leaveEditMode(true);

    });

    ManageResourcesButton.addEventListener('click', function() {
        FrameTrail.module('ViewResources').open();
    });

    AdminSettingsButton.addEventListener('click', function() {
        FrameTrail.module('AdminSettingsDialog').open();
    });

    // Use event delegation to handle clicks even if buttons are recreated
    domElement.addEventListener('click', function(evt) {
        if (evt.target.closest('.hypervideoEditButton')) {
            evt.preventDefault();
            evt.stopPropagation();
            var hypervideoID = FrameTrail.module('RouteNavigation').hypervideoID;
            if (hypervideoID) {
                FrameTrail.module('HypervideoSettingsDialog').open(hypervideoID);
            }
        } else if (evt.target.closest('.hypervideoDeleteButton')) {
            evt.preventDefault();
            evt.stopPropagation();
            var hypervideoID = FrameTrail.module('RouteNavigation').hypervideoID;
            if (hypervideoID) {
                FrameTrail.module('HypervideoSettingsDialog').openDeleteDialog(hypervideoID);
            }
        }
    });

    /**
     * I check if the current user can edit the current hypervideo.
     * User must be admin or the owner (creator) of the hypervideo.
     * @method canEditCurrentHypervideo
     * @return {Boolean}
     */
    function canEditCurrentHypervideo() {
        var userRole = FrameTrail.module('UserManagement').userRole;
        var userID = FrameTrail.module('UserManagement').userID;
        var creatorId = FrameTrail.module('HypervideoModel').creatorId;

        // Guests can edit hypervideo settings only if they can actually save (local mode);
        // server+guest and download mode cannot persist hypervideo settings changes
        if (FrameTrail.module('UserManagement').isGuestMode()) {
            return FrameTrail.module('StorageManager').canSave();
        }

        return userRole === 'admin' || String(creatorId) === String(userID);
    }


    /**
     * I am called from {{#crossLink "Interface/create:method"}}Interface/create(){{/crossLink}}.
     *
     * I set up my interface elements.
     *
     * @method create
     */
    function create() {

        toggleSidebarOpen(FrameTrail.getState('sidebarOpen'));
        toogleUnsavedChanges(FrameTrail.getState('unsavedChanges'));
        toggleViewMode(FrameTrail.getState('viewMode'));
        toggleEditMode(FrameTrail.getState('editMode'));

        if ( FrameTrail.getState('embed') ) {
        }

        document.querySelector(FrameTrail.getState('target')).append(domElement);

    }



    /**
     * I make changes to my CSS, when the global state "sidebarOpen" changes.
     * @method toggleSidebarOpen
     * @param {Boolean} opened
     */
    function toggleSidebarOpen(opened) {

        if (opened) {

            domElement.classList.add('sidebarOpen');

        } else {

            domElement.classList.remove('sidebarOpen');

        }

    }



    /**
     * I make changes to my CSS, when the global state "unsavedChanges" changes.
     * @method toogleUnsavedChanges
     * @param {Boolean} aBoolean
     */
    function toogleUnsavedChanges(aBoolean) {

        if(aBoolean){
            TitlebarViewMode.querySelector('[data-viewmode="video"]').classList.add('unsavedChanges');
        }else{
            TitlebarViewMode.querySelector('[data-viewmode="video"]').classList.remove('unsavedChanges');
        }

    }


    /**
     * I react to a change in the global state "viewMode"
     * @method toggleViewMode
     * @param {String} viewMode
     */
    function toggleViewMode(viewMode) {

        if (FrameTrail.module('RouteNavigation').hypervideoID) {
            domElement.querySelector('button[data-viewmode="video"]').style.display = '';

            // count visible hypervideos
            var hypervideos = FrameTrail.module('Database').hypervideos,
                visibleCount = 0;
            for (var id in hypervideos) {
                if (!hypervideos[id].hidden) {
                    visibleCount++;
                }
            }

            // hide 'Overview' and 'Video' controls when there's only one hypervideo
            if (visibleCount == 1) {
                TitlebarViewMode.classList.add('hidden');
            }

        }

        TitlebarViewMode.querySelectorAll('button').forEach(function(b) { b.classList.remove('active'); });

        domElement.querySelector('[data-viewmode=' + viewMode + ']').classList.add('active');

        // Show/hide hypervideo edit/delete buttons based on view mode, edit mode, and permission
        var showHvButtons = viewMode === 'video' && FrameTrail.getState('editMode') && FrameTrail.module('RouteNavigation').hypervideoID && canEditCurrentHypervideo();
        if (showHvButtons) {
            HypervideoEditButton.classList.add('active');
            HypervideoDeleteButton.classList.add('active');
        } else {
            HypervideoEditButton.classList.remove('active');
            HypervideoDeleteButton.classList.remove('active');
        }

    }


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

                StartEditButton.style.display = 'none';
                LeaveEditModeButton.style.display = '';
                ManageResourcesButton.style.display = '';

                // Show hypervideo edit/delete buttons if in video view and user has permission
                if (FrameTrail.getState('viewMode') === 'video' && FrameTrail.module('RouteNavigation').hypervideoID && canEditCurrentHypervideo()) {
                    HypervideoEditButton.classList.add('active');
                    HypervideoDeleteButton.classList.add('active');
                }

                // Show admin settings button if server-authenticated admin (not guest)
                if (FrameTrail.module('UserManagement').userRole === 'admin' &&
                    !FrameTrail.module('UserManagement').isGuestMode()) {
                    AdminSettingsButton.style.display = '';
                }

                // Show logout button for all logged-in users (including guest)
                if (FrameTrail.getState('loggedIn')) {
                    domElement.querySelector('.logoutButton').style.display = '';
                }

                // Show user settings only for server-authenticated (non-guest) users
                if (FrameTrail.getState('loggedIn') && !FrameTrail.module('UserManagement').isGuestMode()) {
                    UserSettingsButton.style.display = '';
                }

            }

        } else {

            domElement.classList.remove('editActive');

            // Edit is always available — guest mode allows editing in all storage modes
            StartEditButton.style.display = '';

            LeaveEditModeButton.style.display = 'none';
            ManageResourcesButton.style.display = 'none';
            HypervideoEditButton.classList.remove('active');
            HypervideoDeleteButton.classList.remove('active');
            AdminSettingsButton.style.display = 'none';

            // Hide user settings and logout buttons when leaving edit mode
            UserSettingsButton.style.display = 'none';
            domElement.querySelector('.logoutButton').style.display = 'none';

        }

    }


    /**
     * I react to a change in the global state "loggedIn"
     * @method changeUserLogin
     * @param {Boolean} loggedIn
     */
    function changeUserLogin(loggedIn) {

        if (loggedIn) {

            // Only show buttons if in edit mode
            if (FrameTrail.getState('editMode')) {
                // Logout for all logged-in users
                domElement.querySelector('.logoutButton').style.display = '';

                // User settings only for server-authenticated (non-guest) users
                if (!FrameTrail.module('UserManagement').isGuestMode()) {
                    UserSettingsButton.style.display = '';
                }
            }

            // Show admin settings button if server-authenticated admin and in edit mode
            if (FrameTrail.module('UserManagement').userRole === 'admin' &&
                !FrameTrail.module('UserManagement').isGuestMode() &&
                FrameTrail.getState('editMode')) {
                AdminSettingsButton.style.display = '';
            }

        } else {

            domElement.querySelector('.logoutButton').style.display = 'none';
            UserSettingsButton.style.display = 'none';
            AdminSettingsButton.style.display = 'none';

        }

    }


    /**
     * I react to a change in the global state "userColor"
     * @method changeUserColor
     * @param {String} color
     */
    function changeUserColor(color) {

        if (color.length > 1) {

            /*
            // Too much color in the interface, keep default color for now
            UserSettingsButton.css({
                'border-color': '#' + FrameTrail.getState('userColor'),
                'background-color': '#' + FrameTrail.getState('userColor')
            });
            */

        }

    }




    return {

        onChange: {
            sidebarOpen:    toggleSidebarOpen,
            unsavedChanges: toogleUnsavedChanges,
            viewMode:       toggleViewMode,
            editMode:       toggleEditMode,
            loggedIn:       changeUserLogin,
            userColor:      changeUserColor,
            collabState:    renderPresence
        },

        /**
         * I am the text, which should be shown in the title bar.
         * @attribute title
         * @type String
         * @writeOnly
         */
        set title(aString) {
            var titleText = aString;
            var editButton = TitlebarTitle.querySelector('.hypervideoEditButton');
            var deleteButton = TitlebarTitle.querySelector('.hypervideoDeleteButton');
            TitlebarTitle.innerHTML = '';

            // Show folder name before title when in local storage mode
            if (FrameTrail.getState('storageMode') === 'local') {
                var adapter = FrameTrail.module('StorageManager').getAdapter();
                if (adapter && adapter.folderName) {
                    var folderIndicator = document.createElement('span');
                    folderIndicator.className = 'localFolderIndicator';
                    folderIndicator.title = 'Click to change folder';
                    folderIndicator.textContent = '\ud83d\udcc2 ' + adapter.folderName;
                    folderIndicator.addEventListener('click', function() {
                        FrameTrail.module('StorageManager').switchToLocal().then(function() {
                            // Clear hash so we reload to overview, not a hypervideo ID from the old folder
                            window.location.hash = '';
                            window.location.reload();
                        }).catch(function() {
                            // User cancelled the folder picker
                        });
                    });
                    TitlebarTitle.append(folderIndicator);
                }
            }

            TitlebarTitle.insertAdjacentHTML('beforeend', '<span>' + titleText + '</span>');

            if (editButton) {
                TitlebarTitle.append(editButton);
            }
            if (deleteButton) {
                TitlebarTitle.append(deleteButton);
            }
        },

        /**
         * I am the height of the title bar in pixel.
         * @attribute height
         * @type Number
         * @readOnly
         */
        get height() {
            return FrameTrail.getState('fullscreen') ? 0 : domElement.offsetHeight;
        },

        create: create

    };


});
