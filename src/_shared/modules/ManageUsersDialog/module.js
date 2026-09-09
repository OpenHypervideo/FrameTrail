/**
 * @module Shared
 */

/**
 * I am the ManageUsersDialog. I list every account on this instance and let an
 * admin add, edit and remove them.
 *
 * I used to be a tab in the admin settings dialog, which was the wrong home for
 * two reasons. My writes land in users.json, not config.json, and they take
 * effect the moment they are made rather than waiting for that dialog's Apply —
 * so the soft lock guarding config.json was greying me out for no reason, and
 * one admin with the settings dialog open could stop another from managing
 * users at all. Standing on my own also means I can be opened from wherever
 * users are actually on someone's mind, not only from behind the cog.
 *
 * My writes are field-level and taken under an exclusive file lock on the
 * server, so two admins in here cannot clobber each other and I take no lock.
 * What I do need is to notice when the roster changed underneath me — which I
 * handle by quietly re-reading it, since nothing anyone typed lives in the list
 * itself.
 *
 * @class ManageUsersDialog
 * @static
 */

FrameTrail.defineModule('ManageUsersDialog', function(FrameTrail){

    var labels = FrameTrail.module('Localization').labels;

    // Live references into the currently open dialog, so the collabState
    // listener can work without rebuilding anything. Null when closed.
    var dialogCtrl        = null,
        containerElement  = null,
        presenceContainer = null,
        userRoster        = {},
        changed           = false,
        onChanged         = null;


    function _serverPost(body) {
        return FrameTrail.module('StorageManager').serverPost(body);
    }


    /**
     * I open the user administration dialog.
     *
     * @method open
     * @param {Object} [options] options.onChanged runs once on close, and only
     *                           if something was actually written
     */
    function open(options) {

        if (FrameTrail.module('UserManagement').userRole !== 'admin') {
            console.error('Admin access required');
            return;
        }

        if (dialogCtrl) return;   // modal — only ever one of me

        changed   = false;
        onChanged = (options && options.onChanged) || null;

        var _uaw = document.createElement('div');
        _uaw.innerHTML = '<div class="userAdministrationContainer">'
            + '    <div class="userListHeader">'
            + '        <button class="addUserButton"><span class="icon-plus"></span> '+ labels['UserAdd'] +'</button>'
            + '        <input type="text" class="userFilterInput" placeholder="'+ labels['SettingsFilterByName'] +'">'
            + '    </div>'
            + '    <div class="userList"></div>'
            + '</div>';
        containerElement = _uaw.firstElementChild;

        dialogCtrl = Dialog({
            title:     labels['UserAdministration'],
            icon:      'icon-users',
            content:   containerElement,
            modal:     true,
            resizable: false,
            width:     600,
            height:    520,
            close:     function() {

                if (FrameTrail.module('Collaboration')) {
                    FrameTrail.module('Collaboration').stop('users', 'global');
                }

                var notify = changed ? onChanged : null;

                dialogCtrl.destroy();
                dialogCtrl        = null;
                containerElement  = null;
                presenceContainer = null;
                onChanged         = null;

                // After the teardown, so a callback that reopens me can.
                if (notify) notify();

            }
            // No button pane: every change here is already written by the time
            // you see it, so there is nothing to confirm or cancel. Manage
            // Resources works the same way.
        });

        containerElement.querySelector('.userFilterInput').addEventListener('input', function() {
            renderUserList(this.value);
        });

        containerElement.querySelector('.addUserButton').addEventListener('click', function() {
            openUserEditDialog(null);
        });

        containerElement.querySelector('.userList').addEventListener('click', function(evt) {
            var item = evt.target.closest('.userListItem');
            if (!item) return;
            var uid = item.getAttribute('data-user-id');
            if (evt.target.closest('.editUserButton')) {
                openUserEditDialog(uid);
            } else if (evt.target.closest('.deleteUserButton')) {
                confirmDeleteUser(uid);
            }
        });

        startPresence();
        refreshUserList();

    }


    /**
     * I show who else has this dialog open. There is no lock here — the server
     * writes one field at a time under an exclusive file lock, so concurrent
     * edits are safe — which is exactly why the avatars matter: they are the
     * only sign that somebody else is working on the same roster.
     *
     * @method startPresence
     */
    function startPresence() {

        var Collaboration = FrameTrail.module('Collaboration');
        if (!Collaboration || !Collaboration.isActive()) return;

        var mounted = Collaboration.mountDialogPresence(dialogCtrl);
        if (!mounted) return;

        presenceContainer = mounted.presence;

        Collaboration.start('users', 'global', { observe: false });

    }


    /**
     * I react to the collaboration state changing.
     *
     * The list is a view of server state and nothing in it is unsaved, so when
     * somebody else writes I simply re-read rather than interrupting with a
     * notice. Any edit form is a separate dialog on top of me, holding its own
     * copy of what it is editing, so it is unaffected.
     *
     * @method updatePresence
     */
    function updatePresence() {

        var Collaboration = FrameTrail.module('Collaboration');
        if (!Collaboration || !presenceContainer) return;

        Collaboration.renderAvatars(presenceContainer, 'users', 'global');

        if (Collaboration.isStale('users', 'global')) {
            Collaboration.acknowledgeVersion(null, 'users', 'global');
            refreshUserList();
        }

    }


    // Fetched fresh rather than read from Database.users: that roster is
    // loaded once at boot, possibly before login, and an unauthenticated
    // userGet deliberately omits role/active/mail.
    function refreshUserList() {

        if (!containerElement) return;

        _serverPost(new URLSearchParams({ a: 'userGet' })).then(function(response) {
            if (!containerElement) return;
            userRoster = (response && response.response && response.response.user) || {};
            renderUserList(containerElement.querySelector('.userFilterInput').value);
        }).catch(function() {
            if (containerElement) renderUserList('');
        });

    }


    function renderUserList(filterText) {

        if (!containerElement) return;

        var Collaboration = FrameTrail.module('Collaboration');
        var userList = containerElement.querySelector('.userList');
        var ownID    = String(FrameTrail.module('UserManagement').userID);
        userList.innerHTML = '';

        for (var uid in userRoster) {

            var u = userRoster[uid];
            if (filterText && (u.name || '').toLowerCase().indexOf(filterText.toLowerCase()) === -1) {
                continue;
            }

            var isSelf   = (String(uid) === ownID),
                color    = /^#/.test(u.color || '') ? u.color : '#' + (u.color || '888888'),
                inactive = (String(u.active) === '0');

            var _uiw = document.createElement('div');
            _uiw.innerHTML = '<div class="userListItem'+ (inactive ? ' inactive' : '') + (isSelf ? ' self' : '') +'" data-user-id="'+ uid +'">'
                + '    <span class="collaborationChip userListAvatar"></span>'
                + '    <div class="userListInfo">'
                + '        <div class="userListName"></div>'
                + '        <div class="userListMeta"></div>'
                + '    </div>'
                + '    <div class="userListActions">'
                + '        <button class="editUserButton" title="'+ labels['GenericEditStart'] +'"><span class="icon-pencil"></span></button>'
                + '        <button class="deleteUserButton" title="'+ labels['GenericDelete'] +'"'+ (isSelf ? ' disabled' : '') +'><span class="icon-trash"></span></button>'
                + '    </div>'
                + '</div>';
            var userItem = _uiw.firstElementChild;

            // textContent, not interpolation — names are user-supplied.
            userItem.querySelector('.userListName').textContent =
                (u.name || '') + (isSelf ? '  ·  ' + labels['UserYou'] : '');
            userItem.querySelector('.userListMeta').textContent =
                (u.mail || '') + '  ·  ' + (u.role === 'admin' ? labels['UserRoleAdmin'] : labels['UserRoleUser'])
                + (inactive ? '  ·  ' + labels['UserInactive'] : '');

            var avatar = userItem.querySelector('.userListAvatar');
            avatar.textContent = Collaboration ? Collaboration.initialsOf(u.name) : '';
            avatar.style.backgroundColor = color;
            if (Collaboration) { avatar.style.color = Collaboration.readableTextColor(color); }

            userList.appendChild(userItem);
        }

        if (userList.children.length === 0) {
            userList.insertAdjacentHTML('beforeend', '<div class="message active">'+ labels['UserNoUsersFound'] +'</div>');
        }

    }


    /**
     * Add or edit a user. Creating posts userRegister (the same action the
     * public sign-up uses), editing posts userChange. Both take effect
     * immediately.
     *
     * Editing yourself is how an admin reaches their own profile now that the
     * user button opens this dialog for them — but role and activation are
     * disabled on your own row. The server refuses to let you delete yourself
     * or remove the last admin; nothing stops you demoting or deactivating
     * yourself, and either would lock you out of the instance you administer.
     */
    function openUserEditDialog(userId) {

        var isNew = !userId,
            u     = isNew ? {} : (userRoster[userId] || {}),
            isSelf = !isNew && String(userId) === String(FrameTrail.module('UserManagement').userID);

        var _uew = document.createElement('div');
        _uew.innerHTML = '<div class="userEditForm">'
            + '    <input type="text" class="userEditName" placeholder="'+ labels['UserName'] +'">'
            + '    <input type="text" class="userEditMail" placeholder="'+ labels['UserMail'] +'">'
            + '    <input type="password" class="userEditPasswd" placeholder="'+ (isNew ? labels['UserPassword'] : labels['UserNewPassword']) +'">'
            + '    <div class="userEditColor"></div>'
            + (isNew ? '' :
               '    <div class="userEditRoles">'
             + '        <input type="radio" name="userEditRole" id="userEditRoleAdmin" value="admin"'+ (isSelf ? ' disabled' : '') +'>'
             + '        <label for="userEditRoleAdmin">'+ labels['UserRoleAdmin'] +'</label>'
             + '        <input type="radio" name="userEditRole" id="userEditRoleUser" value="user"'+ (isSelf ? ' disabled' : '') +'>'
             + '        <label for="userEditRoleUser">'+ labels['UserRoleUser'] +'</label><br>'
             + '        <div class="checkboxRow"><label class="switch"><input type="checkbox" id="userEditActive"'+ (isSelf ? ' disabled' : '') +'><span class="slider round"></span></label><label for="userEditActive">'+ labels['UserActive'] +'</label></div>'
             + (isSelf ? '        <div class="message active">'+ labels['MessageUserCannotChangeOwnRole'] +'</div>' : '')
             + '    </div>')
            + '</div>';
        var userEditForm = _uew.firstElementChild;

        userEditForm.querySelector('.userEditName').value = u.name || '';
        userEditForm.querySelector('.userEditMail').value = u.mail || '';

        if (!isNew) {
            var roleEl = userEditForm.querySelector('#userEditRole' + (u.role === 'admin' ? 'Admin' : 'User'));
            if (roleEl) roleEl.checked = true;
            var activeEl = userEditForm.querySelector('#userEditActive');
            if (activeEl) activeEl.checked = (String(u.active) !== '0');
        }

        var userDialogCtrl = Dialog({
            title:     isNew ? labels['UserAdd'] : (isSelf ? labels['UserMySettings'] : labels['UserChangeSettings']),
            icon:      isNew ? 'icon-plus' : 'icon-user',
            content:   userEditForm,
            modal:     true,
            resizable: false,
            width:     460,
            close:     function() { userDialogCtrl.destroy(); },
            buttons: [
                { text: labels['GenericSaveChanges'],
                  click: function() { submitUser(); } },
                { text: labels['GenericCancel'],
                  click: function() { userDialogCtrl.close(); } }
            ]
        });

        var errorEl = document.createElement('div');
        errorEl.className = 'message error dialogError';
        errorEl.style.flexBasis = '100%';
        userDialogCtrl.widget().querySelector('.ft-dialog-buttonpane').prepend(errorEl);

        // The palette lives in UserManagement so it is defined once.
        FrameTrail.module('UserManagement').getUserColorCollection(function() {
            FrameTrail.module('UserManagement').renderUserColorCollectionForm(
                u.color || '', userEditForm.querySelector('.userEditColor'));
        });

        function fail(text) {
            errorEl.classList.add('active');
            errorEl.textContent = text;
        }

        function submitUser() {

            var body = new URLSearchParams();
            body.append('name',   userEditForm.querySelector('.userEditName').value);
            body.append('mail',   userEditForm.querySelector('.userEditMail').value);
            body.append('passwd', userEditForm.querySelector('.userEditPasswd').value);

            var colorInput = userEditForm.querySelector('.userEditColor input[name="color"]');
            if (colorInput) body.append('color', colorInput.value);

            if (isNew) {
                body.append('a', 'userRegister');
            } else {
                body.append('a', 'userChange');
                body.append('userID', userId);
                var role   = userEditForm.querySelector('input[name="userEditRole"]:checked');
                var active = userEditForm.querySelector('#userEditActive');
                // Omitted for your own account, so the server keeps what it has.
                if (role && !isSelf) body.append('role', role.value);
                // The server only accepts the literal strings "1"/"0".
                if (active && !isSelf) body.append('active', active.checked ? '1' : '0');
            }

            _serverPost(body).then(function(response) {

                // userRegister reports 3 when the account was created but
                // still needs activation — a success, not a failure.
                if (response.code === 0 || (isNew && response.code === 3)) {
                    userDialogCtrl.close();
                    noteChange();
                    refreshUserList();
                    // Editing yourself changes what the rest of the UI shows.
                    if (isSelf) {
                        FrameTrail.changeState('username', response.response.name);
                        FrameTrail.changeState('userColor', response.response.color);
                    }
                    return;
                }

                fail(response.string || labels['ErrorGeneric']);

            }).catch(function(e) { fail(e.message); });

        }

    }


    function confirmDeleteUser(userId) {

        var u = userRoster[userId] || {};

        var _cdw = document.createElement('div');
        _cdw.innerHTML = '<div class="confirmDeleteUser">'
            + '    <div class="message error active"></div>'
            + '    <p>'+ labels['UserDeleteKeepsContent'] +'</p>'
            + '</div>';
        var confirmEl = _cdw.firstElementChild;
        confirmEl.querySelector('.message').textContent =
            labels['UserDeleteConfirm'].replace('%s', u.name || '');

        var confirmCtrl = Dialog({
            title:     labels['GenericDelete'],
            icon:      'icon-trash',
            content:   confirmEl,
            modal:     true,
            resizable: false,
            width:     460,
            close:     function() { confirmCtrl.destroy(); },
            buttons: [
                { text: labels['GenericDelete'],
                  click: function() {
                      _serverPost(new URLSearchParams({ a: 'userDelete', userID: userId }))
                      .then(function(response) {
                          if (response.code === 0) {
                              confirmCtrl.close();
                              noteChange();
                              refreshUserList();
                          } else {
                              var el = confirmEl.querySelector('.message');
                              el.textContent = response.string || labels['ErrorGeneric'];
                          }
                      });
                  } },
                { text: labels['GenericCancel'],
                  click: function() { confirmCtrl.close(); } }
            ]
        });

    }


    /**
     * Record that the roster moved, and pull the change into the copy the rest
     * of the app renders from.
     *
     * Database.users is loaded once at boot and drives annotation author names
     * and colours, so without this a colour changed here would not show up
     * anywhere until the next page load.
     *
     * @method noteChange
     */
    function noteChange() {

        changed = true;

        FrameTrail.module('Database').loadUserData(function(){}, function(){});

        var Collaboration = FrameTrail.module('Collaboration');
        if (Collaboration) Collaboration.acknowledgeVersion(null, 'users', 'global');

    }


    return {

        open: open,

        onChange: {
            collabState: updatePresence
        }

    };

});
