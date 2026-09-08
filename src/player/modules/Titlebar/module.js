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
                            + '      <div class="contextSelectButton userSettingsMenu">'
                            + '          <button class="userSettingsButton collaborationChip"></button>'
                            + '          <div class="contextSelectList"></div>'
                            + '      </div>'
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
        UserSettingsMenu        = domElement.querySelector('.userSettingsMenu'),
        UserSettingsButton      = domElement.querySelector('.userSettingsButton'),
        UserSettingsList        = domElement.querySelector('.userSettingsMenu .contextSelectList'),
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

    /**
     * I draw the user button as an avatar of the person who is logged in —
     * the same chip the presence row uses, so "you" and "everyone else" read
     * as one set rather than an icon next to a row of circles.
     *
     * @method renderUserChip
     */
    function renderUserChip() {

        var Collaboration = FrameTrail.module('Collaboration');
        if (!UserSettingsButton || !Collaboration) return;

        var name  = FrameTrail.getState('username') || '',
            color = FrameTrail.getState('userColor') || '';

        UserSettingsButton.textContent = Collaboration.initialsOf(name);

        if (color) {
            // Stored without a leading # in users.json.
            color = /^#/.test(color) ? color : '#' + color;
            UserSettingsButton.style.backgroundColor = color;
            UserSettingsButton.style.color = Collaboration.readableTextColor(color);
        } else {
            UserSettingsButton.style.backgroundColor = '';
            UserSettingsButton.style.color = '';
        }

        UserSettingsButton.setAttribute('data-tooltip-bottom-right', name || labels['UserMySettings']);

    }


    /**
     * I build the user menu fresh on every open, so a role or name that changed
     * during the session is reflected without rebuilding the title bar.
     *
     * Logout is always here. It is the reason this whole control is shown to
     * guests at all — they have no settings of their own to edit, but they must
     * always be able to leave.
     *
     * @method renderUserMenu
     */
    function renderUserMenu() {

        var UserManagement = FrameTrail.module('UserManagement'),
            isGuest        = UserManagement.isGuestMode(),
            isAdmin        = UserManagement.userRole === 'admin' && !isGuest,
            entries        = [];

        if (isAdmin && FrameTrail.module('ManageUsersDialog')) {
            entries.push({ label: labels['UserAdministration'], action: function() {
                FrameTrail.module('ManageUsersDialog').open();
            }});
        }

        if (!isGuest) {
            entries.push({ label: labels['UserMySettings'], action: function() {
                FrameTrail.module('UserManagement').showMySettings();
            }});
        }

        entries.push({ label: labels['UserLogout'], className: 'userMenuLogout', action: function() {
            // Not logout() directly: this is the path that offers to save
            // unsaved work before the session ends.
            FrameTrail.module('HypervideoModel').leaveEditMode(true);
        }});

        UserSettingsList.innerHTML = '';

        entries.forEach(function(entry) {
            var item = document.createElement('div');
            item.textContent = entry.label;
            if (entry.className) item.className = entry.className;
            item.addEventListener('click', function() {
                closeUserMenu();
                entry.action();
            });
            UserSettingsList.appendChild(item);
        });

    }


    function closeUserMenu() {
        UserSettingsMenu.classList.remove('active');
    }


    UserSettingsButton.addEventListener('click', function(evt){
        evt.stopPropagation();
        if (UserSettingsMenu.classList.contains('active')) {
            closeUserMenu();
            return;
        }
        renderUserMenu();
        UserSettingsMenu.classList.add('active');
    });

    // Unlike the other context menus in the app, this one is not inside a panel
    // that gets torn down — it sits in the title bar for the whole session, so
    // it has to dismiss itself the way a menu is expected to.
    document.addEventListener('click', function(evt) {
        if (UserSettingsMenu.classList.contains('active') && !UserSettingsMenu.contains(evt.target)) {
            closeUserMenu();
        }
    });

    document.addEventListener('keydown', function(evt) {
        if (evt.key === 'Escape') closeUserMenu();
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

                // Show the user menu for every logged-in user, guests included:
                // it carries Logout, which a guest needs as much as anyone. The
                // entries above it are gated when the menu is built.
                if (FrameTrail.getState('loggedIn')) {
                    UserSettingsMenu.style.display = '';
                    renderUserChip();
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

            // Hide the user menu when leaving edit mode
            closeUserMenu();
            UserSettingsMenu.style.display = 'none';

        }

    }


    /**
     * I react to a change in the global state "loggedIn"
     * @method changeUserLogin
     * @param {Boolean} loggedIn
     */
    function changeUserLogin(loggedIn) {

        if (loggedIn) {

            // Only show buttons if in edit mode. The menu is shown to guests
            // too — Logout is in it, and the rest is gated when it is built.
            if (FrameTrail.getState('editMode')) {
                UserSettingsMenu.style.display = '';
                renderUserChip();
            }

            // Show admin settings button if server-authenticated admin and in edit mode
            if (FrameTrail.module('UserManagement').userRole === 'admin' &&
                !FrameTrail.module('UserManagement').isGuestMode() &&
                FrameTrail.getState('editMode')) {
                AdminSettingsButton.style.display = '';
            }

        } else {

            closeUserMenu();
            UserSettingsMenu.style.display = 'none';
            AdminSettingsButton.style.display = 'none';

        }

    }


    /**
     * I react to a change in the global states "userColor" and "username",
     * both of which the user button now draws itself from.
     *
     * @method changeUserColor
     */
    function changeUserColor() {

        renderUserChip();

    }




    return {

        onChange: {
            sidebarOpen:    toggleSidebarOpen,
            unsavedChanges: toogleUnsavedChanges,
            viewMode:       toggleViewMode,
            editMode:       toggleEditMode,
            loggedIn:       changeUserLogin,
            userColor:      changeUserColor,
            username:       changeUserColor,
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
