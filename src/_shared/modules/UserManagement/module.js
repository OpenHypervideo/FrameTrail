/**
 * @module Shared
 */


/**
 * I contain all business logic about the UserManagement.
 *
 * I control both the UI as well as the data model for user management (registration, settings, administration) and the user login.
 *
 * @class UserManagement
 * @static
 */



FrameTrail.defineModule('UserManagement', function(FrameTrail){

    var labels = FrameTrail.module('Localization').labels;

    var userID                  = '',
        userRole                = '',
        userMail                = '',
        userRegistrationDate    = '',
        userColorCollection     = [],
        userSessionLifetime     = 0,
        userSessionTimeout      = null,
        isGuestMode             = false,
        forceLoginRequired      = false,
        userDialogCtrl          = null,

        userBoxCallback         = null,
        userBoxCallbackCancel   = null,

        domElement = null,

        loginBox = null;

    var _dmw = document.createElement('div');
    _dmw.innerHTML = '<div class="UserBox">'
        + '    <div class="userStatusMessage message">'
        + '    </div>'
        + '    <div class="userTabs">'
        + '        <ul class="userTabMenu">'
        + '            <li class="userTabSettingsMenu">'
        + '                <a href="#UserTabSettings">'+ labels['UserMySettings'] +'</a>'
        + '            </li>'
        + '            <li class="userTabRegistrationMenu">'
        + '                <a href="#UserTabRegistration">'+ labels['UserRegister'] +'</a>'
        + '            </li>'
        + '            <li class="userTabAdministrationMenu">'
        + '                <a href="#UserTabAdministration">'+ labels['UserAdministration'] +'</a>'
        + '            </li>'
        + '        </ul>'
        + '        <div id="UserTabSettings">'
        + '             <form class="settingsForm" method="post">'
        + '                 <p class="settingsFormStatus message"></p>'
        + '                 <input type="text" name="name" id="SettingsForm_name" placeholder="'+ labels['UserName'] +'">'
        + '                 <input type="text" name="mail" id="SettingsForm_mail" placeholder="'+ labels['UserMail'] +'"><br>'
        + '                 <div class="userColor"></div>'
        + '                 <input type="password" name="passwd" id="SettingsForm_passwd" placeholder="'+ labels['UserNewPassword'] +'"><br>'
        + '                 <br>'
        + '                 <input type="hidden" name="a" value="userChange">'
        + '                 <input type="hidden" name="userID" id="SettingsForm_userID" value="">'
        + '                 <input type="submit" value="'+ labels['UserChangeMySettings'] +'">'
        + '             </form>'
        + '        </div>'
        + '        <div id="UserTabRegistration">'
        + '             <form class="registrationForm" method="post">'
        + '                 <p class="registrationFormStatus message"></p>'
        + '                 <input type="text" name="name" placeholder="'+ labels['UserName'] +'">'
        + '                 <input type="text" name="mail" placeholder="'+ labels['UserMail'] +'">'
        + '                 <input type="password" name="passwd" placeholder="'+ labels['UserPassword'] +'">'
        + '                 <input type="hidden" name="a" value="userRegister">'
        + '                 <input type="submit" value="'+ labels['UserRegister'] +'">'
        + '             </form>'
        + '        </div>'
        + '        <div id="UserTabAdministration">'
        + '             <p class="administrationFormStatus message"></p>'
        + '             <button class="administrationFormRefresh">'+ labels['GenericRefresh'] +'</button>'
        + '             <form class="administrationForm" method="post">'
        + '               <div class=\"custom-select\" style=\"float: left; margin-top: 10px;\">'
        + '                   <select name="userID" id="user_change_user">'
        + '                       <option value="" selected disabled>'+ labels['UserSelect'] +'</option>'
        + '                   </select>'
        + '               </div>'
        + '               <div class="userDataContainer">'
        + '                   <input type="text" name="name" id="user_change_name" placeholder="'+ labels['UserName'] +'">'
        + '                   <input type="text" name="mail" id="user_change_mail" placeholder="'+ labels['UserMail'] +'">'
        + '                   <div id="user_change_colorContainer"></div>'
        + '                   <input type="password" name="passwd" id="user_change_passwd" placeholder="'+ labels['UserPassword'] +'"><br>'
        + '                   <input type="radio" name="role" id="user_change_role_admin" value="admin">'
        + '                   <label for="user_change_role_admin">'+ labels['UserRoleAdmin'] +'</label>'
        + '                   <input type="radio" name="role" id="user_change_role_user" value="user">'
        + '                   <label for="user_change_role_user">'+ labels['UserRoleUser'] +'</label><br>'
        + '                   <input type="radio" name="active" id="user_change_active_1" value="1">'
        + '                   <label for="user_change_active_1">'+ labels['UserActive'] +'</label>'
        + '                   <input type="radio" name="active" id="user_change_active_0" value="0">'
        + '                   <label for="user_change_active_0">'+ labels['UserInactive'] +'</label><br>'
        + '                   <input type="hidden" name="a" value="userChange">'
        + '                   <input type="submit" value="'+ labels['UserChangeSettings'] +'">'
        + '               </div>'
        + '             </form>'
        + '        </div>'
        + '    </div>'
        + '</div>';
    domElement = _dmw.firstElementChild;

    var _lbw = document.createElement('div');
    _lbw.innerHTML = '<div class="userLoginOverlay ui-blocking-overlay">'
        + '    <div class="loginBox ui-overlay-box">'
        + '        <div class="boxTitle">'
        + '            <span class="loginTabButton loginBoxTabButton">'+ labels['UserLogin'] +'</span>'
        + '            <span class="loginBoxOrDivider" style="color: #888; font-size: 17px;">'+ labels['UserDividerOr'] +'</span>'
        + '            <span class="createAccountTabButton loginBoxTabButton inactive">'+ labels['UserCreateAccount'] +'</span>'
        + '            <span class="loginBoxOrDivider" style="color: #888; font-size: 17px;">'+ labels['UserDividerOr'] +'</span>'
        + '            <span class="editAsGuestTabButton loginBoxTabButton inactive">'+ labels['UserEditAsGuest'] +'</span>'
        + '        </div>'
        + '        <div class="userTabLogin">'
        + '             <form class="loginForm" method="post">'
        + '                 <p class="loginFormStatus message"></p>'
        + '                 <input type="text" name="mail" placeholder="'+ labels['UserMail'] +'">'
        + '                 <input type="password" name="passwd" placeholder="'+ labels['UserPassword'] +'">'
        + '                 <input type="hidden" name="a" value="userLogin">'
        + '                 <input type="submit" value="Login">'
        + '                 <button type="button" class="loginBoxCancelButton">Cancel</button>'
        + '             </form>'
        + '        </div>'
        + '        <div class="userTabRegister">'
        + '             <form class="userRegistrationForm" method="post">'
        + '                 <p class="userRegistrationFormStatus" class="message"></p>'
        + '                 <input type="text" name="name" placeholder="'+ labels['UserName'] +'">'
        + '                 <input type="text" name="mail" placeholder="'+ labels['UserMail'] +'">'
        + '                 <input type="password" name="passwd" placeholder="'+ labels['UserPassword'] +'">'
        + '                 <input type="hidden" name="a" value="userRegister">'
        + '                 <input type="submit" value="'+ labels['UserCreateAccount'] +'">'
        + '                 <button type="button" class="loginBoxCancelButton">'+ labels['GenericCancel'] +'</button>'
        + '             </form>'
        + '        </div>'
        + '        <div class="userTabGuest">'
        + '             <div class="guestEditHint">'+ labels['UserGuestEditNote'] +'</div>'
        + '             <input type="text" class="guestNameInput" placeholder="'+ labels['UserGuestName'] +'">'
        + '             <button type="button" class="guestContinueButton">'+ labels['UserEditAsGuest'] +'</button>'
        + '             <button type="button" class="loginBoxCancelButton">'+ labels['GenericCancel'] +'</button>'
        + '        </div>'
        + '    </div>'
        + '</div>';
    loginBox = _lbw.firstElementChild;
    loginBox.style.display = 'none';


    /* Administration Box */


    function _serverPost(body) {
        var serverURL = FrameTrail.module('RouteNavigation').resolveServerURL('ajaxServer.php');
        if (!serverURL) return Promise.reject(new Error('No server configured'));
        var adapter = FrameTrail.module('StorageManager').getAdapter();
        if (adapter && adapter.dataPathAbsolute) body.append('dataPath', adapter.dataPathAbsolute);
        return fetch(serverURL, { method: 'POST', body: body })
            .then(function(r) { return r.json(); });
    }
    FTTabs(domElement.querySelector('.userTabs'), {
        heightStyle: 'fill'
    });


    domElement.querySelector('.registrationForm').addEventListener('submit', function(e) {
        e.preventDefault();
        var _form = this;
        _serverPost(new FormData(_form))
        .then(function(response) {
            var _st = domElement.querySelector('.registrationFormStatus');
            switch(response.code){
                case 0:
                    _st.classList.remove('error'); _st.classList.add('active', 'success'); _st.textContent = labels['MessageSuccessfullyRegistered'];
                    break;
                case 1:
                    _st.classList.remove('success'); _st.classList.add('active', 'error'); _st.textContent = labels['ErrorEmptyFieldsMail'];
                    break;
                case 2:
                    _st.classList.remove('success'); _st.classList.add('active', 'error'); _st.textContent = labels['ErrorMailExists'];
                    break;
                case 3:
                    _st.classList.remove('success', 'error'); _st.classList.add('active'); _st.textContent = labels['MessageRegisteredActivationPending'];
                    break;
            }
        });
    });


    domElement.querySelector('.settingsForm').addEventListener('submit', function(e) {
        e.preventDefault();
        var _form = this;
        _serverPost(new FormData(_form))
        .then(function(response) {
            var _st = domElement.querySelector('.settingsFormStatus');
            switch(response.code){
                case 0:
                    FrameTrail.module('Database').users[FrameTrail.module('UserManagement').userID].color = response.response.color;
                    FrameTrail.changeState('username', response.response.name);
                    FrameTrail.changeState('userColor', response.response.color);
                    _st.classList.remove('error'); _st.classList.add('active', 'success'); _st.textContent = labels['MessageSettingsChanged'];
                    break;
                case 1:
                    _st.classList.remove('success'); _st.classList.add('active', 'error'); _st.textContent = labels['ErrorUserDBNotFound'];
                    break;
                case 2:
                    _st.classList.remove('success'); _st.classList.add('active', 'error'); _st.textContent = labels['ErrorUserChanged'];
                    break;
                case 3:
                    _st.classList.remove('success', 'error'); _st.classList.add('active'); _st.textContent = labels['MessageSettingsSavedExceptMail'];
                    break;
                case 4:
                    _st.classList.remove('success'); _st.classList.add('active', 'error'); _st.textContent = labels['ErrorNotLoggedInAnymore'];
                    break;
                case 5:
                    _st.classList.remove('success'); _st.classList.add('active', 'error'); _st.textContent = labels['ErrorAccountDeactivated'];
                    break;
                case 6:
                    _st.classList.remove('success'); _st.classList.add('active', 'error'); _st.textContent = labels['ErrorUserNotFound'];
                    break;
            }
        });
    });


    var refreshAdministrationForm = function(){


        domElement.querySelector('.administrationForm').reset();
        domElement.querySelector('.userDataContainer').style.display = 'none';


        _serverPost(new URLSearchParams({ a: 'userGet' }))
        .then(function(data) {

            if (!data || !data.response) {
                console.error(labels['ErrorNoUserFile']);
                return;
            }

            var allUsers = data.response.user;

            domElement.querySelector('#user_change_user').innerHTML = '<option value="" selected disabled>'+ labels['UserSelect'] +'</option>';

            for (var id in allUsers) {
                domElement.querySelector('#user_change_user').insertAdjacentHTML('beforeend', '<option value="' + id + '">' + allUsers[id].name + '</option>');
            }

        });

    }

    // Bind change event once on the native select element
    domElement.querySelector('#user_change_user').addEventListener('change', function(evt) {

        var selectedUserID = evt.target.value;
        _serverPost(new URLSearchParams({ a: 'userGet', userID: selectedUserID }))
        .then(function(ret) {
            domElement.querySelector('#user_change_name').value = ret['response']['name'];
            domElement.querySelector('#user_change_mail').value = ret['response']['mail'];
            domElement.querySelector('#user_change_passwd').value = '';
            domElement.querySelectorAll(".administrationForm input[name='role']").forEach(function(el) { el.checked = false; el.removeAttribute('checked'); });
            domElement.querySelector('.administrationForm input#user_change_role_' + ret['response']['role']).checked = true;
            domElement.querySelector('.administrationForm input#user_change_role_' + ret['response']['role']).setAttribute('checked', 'checked');
            domElement.querySelectorAll(".administrationForm input[name='active']").forEach(function(el) { el.checked = false; el.removeAttribute('checked'); });
            domElement.querySelector('.administrationForm input#user_change_active_' + ret['response']['active']).checked = true;
            domElement.querySelector('.administrationForm input#user_change_active_' + ret['response']['active']).setAttribute('checked', 'checked');
            getUserColorCollection(function() {
                renderUserColorCollectionForm(ret['response']['color'], domElement.querySelector('#user_change_colorContainer'));
            });
            domElement.querySelector('.userDataContainer').style.display = 'block';
        });

    });


    domElement.querySelector('.administrationFormRefresh').addEventListener('click', refreshAdministrationForm);

    if (FrameTrail.module('RouteNavigation').hasServer() &&
        !FrameTrail.getState('videoElement') &&
        !FrameTrail.getState('videoSource') &&
        !FrameTrail.getState('users')) {
        refreshAdministrationForm();
    }


    domElement.querySelector('.administrationForm').addEventListener('submit', function(e) {
        e.preventDefault();
        var _form = this;
        _serverPost(new FormData(_form))
        .then(function(response) {
            // TODO: Update client userData Object if Admin edited himself via this view instead of "Settings" Tab
            refreshAdministrationForm();
            var _st = domElement.querySelector('.administrationFormStatus');
            switch(response.code){
                case 0:
                    _st.classList.remove('error'); _st.classList.add('active', 'success'); _st.textContent = labels['MessageSettingsChanged'];
                    break;
                case 1:
                    _st.classList.remove('success'); _st.classList.add('active', 'error'); _st.textContent = labels['ErrorUserDBNotFound'];
                    break;
                case 2:
                    _st.classList.remove('success'); _st.classList.add('active', 'error'); _st.textContent = labels['ErrorUserNotAdmin'];
                    break;
                case 3:
                    _st.classList.remove('error', 'success'); _st.classList.add('active'); _st.textContent = labels['MessageSettingsSavedExceptMail'];
                    break;
                case 4:
                    _st.classList.remove('success'); _st.classList.add('active', 'error'); _st.textContent = labels['ErrorNotLoggedInAnymore'];
                    break;
                case 5:
                    _st.classList.remove('success'); _st.classList.add('active', 'error'); _st.textContent = labels['ErrorAccountDeactivated'];
                    break;
                case 6:
                    _st.classList.remove('success'); _st.classList.add('active', 'error'); _st.textContent = labels['ErrorUserNotFound'];
                    break;
            }
        });
    });

    function renderUserColorCollectionForm(selectedColor, targetElement) {
        var _ew = document.createElement('div');
        _ew.innerHTML = "<div class='userColorCollectionContainer'><input type='hidden' name='color' value='"+ selectedColor +"'>"+ labels['UserColor'] +":<div class='userColorCollection'></div></div>";
        var elem = _ew.firstElementChild;
        for (var c in userColorCollection) {
            elem.querySelector('.userColorCollection').insertAdjacentHTML('beforeend', "<div class='userColorCollectionItem"+((userColorCollection[c] == selectedColor) ? " selected" : "")+"' style='background-color:#"+userColorCollection[c]+"' data-color='"+userColorCollection[c]+"'></div>");
        }
        elem.addEventListener('click', function(evt) {
            var item = evt.target.closest('.userColorCollectionItem');
            if (!item) return;
            elem.querySelectorAll('.userColorCollectionItem.selected').forEach(function(el) { el.classList.remove('selected'); });
            item.classList.add('selected');
            elem.querySelector("input[name='color']").value = item.dataset.color;
        });

        var _target = (typeof targetElement === 'string') ? domElement.querySelector(targetElement) : targetElement;
        _target.innerHTML = '';
        _target.appendChild(elem);
    }

    function getUserColorCollection(callback) {
        // Default color collection as fallback (matches ajaxServer.php setupInit)
        var defaultColors = ["597081", "339966", "16a09c", "cd4436", "0073a6", "8b5180", "999933", "CC3399", "7f8c8d", "ae764d", "cf910d", "b85e02"];
        
        // First, try to get config from Database module if it's already loaded
        try {
            var dbConfig = FrameTrail.module('Database').config;
            if (dbConfig && dbConfig.userColorCollection && Array.isArray(dbConfig.userColorCollection)) {
                userColorCollection = dbConfig.userColorCollection;
                if (typeof(callback) == "function") {
                    callback.call();
                }
                return;
            }
        } catch(e) {
            // Database module not available or config not loaded yet
        }
        
        // Fallback: load config.json as text to prevent XML parsing errors,
        // then manually parse JSON.
        fetch(FrameTrail.module('RouteNavigation').resolveDataURL('config.json'), { cache: 'no-cache' })
            .then(function(r) { return r.text(); })
            .then(function(textData) {
                try {
                    var data = JSON.parse(textData);
                    userColorCollection = data["userColorCollection"] || defaultColors;
                } catch(e) {
                    // If JSON parsing fails, use default colors
                    userColorCollection = defaultColors;
                }
                if (typeof(callback) == "function") {
                    callback.call();
                }
            })
            .catch(function() {
                // If config.json doesn't exist or fails to load, use default colors
                userColorCollection = defaultColors;
                if (typeof(callback) == "function") {
                    callback.call();
                }
            });

    }

    /* Login Box */

    loginBox.querySelector('.guestContinueButton').addEventListener('click', function() {
        var name = loginBox.querySelector('.guestNameInput').value.trim();
        if (!name) {
            loginBox.querySelector('.guestNameInput').focus();
            return;
        }
        loginAsGuest(name);
    });

    loginBox.querySelector('.guestNameInput').addEventListener('keypress', function(e) {
        if (e.which === 13) { loginBox.querySelector('.guestContinueButton').click(); }
    });

    loginBox.querySelectorAll('.loginBoxCancelButton').forEach(function(btn) {
        btn.addEventListener('click', function() {
            if(typeof userBoxCallbackCancel === 'function'){
                userBoxCallbackCancel.call();
            }
            closeLoginBox();
        });
    });

    loginBox.querySelectorAll('.loginBoxTabButton').forEach(function(tabBtn) {
        tabBtn.addEventListener('click', function(evt) {

            loginBox.querySelectorAll('.loginBoxTabButton').forEach(function(el) { el.classList.remove('inactive'); });

            if ( this.classList.contains('loginTabButton') ) {

                loginBox.querySelector('.createAccountTabButton').classList.add('inactive');
                loginBox.querySelector('.editAsGuestTabButton').classList.add('inactive');
                loginBox.querySelector('.userTabRegister').style.display = 'none';
                loginBox.querySelector('.userTabGuest').style.display = 'none';
                loginBox.querySelector('.userTabLogin').style.display = 'block';

            } else if ( this.classList.contains('createAccountTabButton') ) {

                loginBox.querySelector('.loginTabButton').classList.add('inactive');
                loginBox.querySelector('.editAsGuestTabButton').classList.add('inactive');
                loginBox.querySelector('.userTabLogin').style.display = 'none';
                loginBox.querySelector('.userTabGuest').style.display = 'none';
                loginBox.querySelector('.userTabRegister').style.display = 'block';

            } else {

                // editAsGuestTabButton
                loginBox.querySelector('.loginTabButton').classList.add('inactive');
                loginBox.querySelector('.createAccountTabButton').classList.add('inactive');
                loginBox.querySelector('.userTabLogin').style.display = 'none';
                loginBox.querySelector('.userTabRegister').style.display = 'none';
                loginBox.querySelector('.userTabGuest').style.display = 'block';

            }

        });
    });

    loginBox.querySelector('.loginForm').addEventListener('submit', function(e) {
        e.preventDefault();
        var _form = this;
        _serverPost(new FormData(_form))
        .then(function(response) {
            //console.log(response);
            var _st = loginBox.querySelector('.loginFormStatus');
            switch(response.code){
                case 0:
                    userSessionLifetime = parseInt(response.session_lifetime);
                    login(response.userdata);
                    FrameTrail.triggerEvent('userAction', {
                        action: 'UserLogin',
                        userID: response.userdata.id,
                        userName: response.userdata.name,
                        userRole: response.userdata.role,
                        userMail: response.userdata.mail
                    });
                    _st.classList.remove('active', 'error', 'success'); _st.textContent = '';
                    updateView(true);
                    if(typeof userBoxCallback === 'function'){
                        userBoxCallback.call();
                        closeLoginBox();
                    }
                    break;
                case 1:
                    _st.classList.remove('success'); _st.classList.add('active', 'error'); _st.textContent = labels['ErrorEmptyFields'];
                    break;
                case 2:
                    _st.classList.remove('success'); _st.classList.add('active', 'error'); _st.textContent = labels['ErrorUserNotFound'];
                    break;
                case 3:
                    _st.classList.remove('success'); _st.classList.add('active', 'error'); _st.textContent = labels['ErrorWrongPassword'];
                    break;
                case 4:
                    _st.classList.remove('success'); _st.classList.add('active', 'error'); _st.textContent = labels['ErrorUserDBNotFound'];
                    break;
                case 5:
                    _st.classList.remove('success'); _st.classList.add('active', 'error'); _st.textContent = labels['ErrorNotActivated'];
                    break;
            }
        });
    });


    loginBox.querySelector('.userRegistrationForm').addEventListener('submit', function(e) {
        e.preventDefault();
        var _form = this;
        _serverPost(new FormData(_form))
        .then(function(response) {
            var _lfs = loginBox.querySelector('.loginFormStatus');
            var _rfs = loginBox.querySelector('.userRegistrationFormStatus');
            switch(response.code){
                case 0:
                    _lfs.classList.remove('error'); _lfs.classList.add('active', 'success'); _lfs.textContent = labels['MessageSuccessfullyRegistered'];
                    loginBox.querySelector('.loginTabButton').click();
                    FrameTrail.module('InterfaceModal').showStatusMessage(labels['MessageUpdatingClientData']);
                    FrameTrail.module('Database').loadData(function() {
                        FrameTrail.module('InterfaceModal').showStatusMessage(labels['MessageClientDataUpdated']);
                        FrameTrail.module('InterfaceModal').hideMessage(800);
                    }, function() {
                        FrameTrail.module('InterfaceModal').showErrorMessage(labels['ErrorUpdatingClientData']);
                    });
                    break;
                case 1:
                    _rfs.classList.remove('success'); _rfs.classList.add('active', 'error'); _rfs.textContent = labels['ErrorEmptyFieldsMail'];
                    break;
                case 2:
                    _rfs.classList.remove('success'); _rfs.classList.add('active', 'error'); _rfs.textContent = labels['ErrorMailExists'];
                    break;
                case 3:
                    _rfs.classList.remove('error'); _rfs.classList.add('active', 'success'); _rfs.textContent = labels['MessageRegisteredActivationPending'];
                    break;
            }
        });
    });

    document.querySelector(FrameTrail.getState('target')).append(loginBox);


    /**
     * I report whether this is a private server instance (config.alwaysForceLogin),
     * which requires a real login to view content and disables the guest bypass.
     *
     * Uses the `forceLogin` flag reported by the server's userCheckLogin (available
     * before Database.config is loaded), and also the loaded config as a fallback.
     * Only meaningful in server mode.
     *
     * @method isPrivateInstance
     * @return {Boolean}
     * @private
     */
    function isPrivateInstance() {
        if (FrameTrail.getState('storageMode') !== 'server') {
            return false;
        }
        if (forceLoginRequired) {
            return true;
        }
        try {
            var cfg = FrameTrail.module('Database').config;
            if (cfg && cfg.alwaysForceLogin) {
                return true;
            }
        } catch (e) {}
        return false;
    }


    /**
     * Sometimes a routine should only execute, if we can ensure the user is logged in at this point.
     *
     * I serve this purpose, by checking wether the user has already logged in, and if not provide him the chance
     * to login (or even create an account first).
     *
     * After the user has logged in I call the callback (the routine which shall execute only with a logged-in user).
     *
     * If the user aborted the offer to login, an optional cancelCallback can be called.
     *
     * @method ensureAuthenticated
     * @param {Function} callback
     * @param {Function} callbackCancel (optional)
     * @param {Boolean} disallowCancel (optional)
     */
    function ensureAuthenticated(callback, callbackCancel, disallowCancel){

        isLoggedIn(function(loginStatus) {

            if (loginStatus) {

                callback.call();

            } else {

                userBoxCallback = callback;
                userBoxCallbackCancel = callbackCancel;
                showLoginBox(disallowCancel);

            }

        });

    }


    /**
     * I check wether the user has logged in, and call the callback with a boolean to indicate this.
     *
     * @method isLoggedIn
     * @param {Function} callback
     */
    function isLoggedIn(callback) {

        var storageMode = FrameTrail.getState('storageMode');

        // Guest mode is set explicitly via loginAsGuest() — session-only, cleared on reload.
        // Works for local, download, AND server mode (when editing as guest on a server instance).
        if (isGuestMode) {
            window.setTimeout(function() {
                callback.call(window, true);
            }, 2);
            return;
        }

        // In local/download/static mode without guest mode active, user is not yet identified.
        // Also applies when storageMode is not yet set but shorthand API options
        // indicate that the Download adapter will be used (videoElement / videoSource).
        if (storageMode === 'local' || storageMode === 'download' || storageMode === 'static' ||
            FrameTrail.getState('videoElement') || FrameTrail.getState('videoSource')) {
            window.setTimeout(function() {
                callback.call(window, false);
            }, 2);
            return;
        }

        if (!FrameTrail.module('RouteNavigation').hasServer() || FrameTrail.getState('users')) {
            window.setTimeout(function() {
                FrameTrail.changeState({
                    editMode: false,
                    loggedIn: false,
                    username: '',
                    userColor: ''
                });
                callback.call(window, false);
            }, 2);

            return;
        }

        _serverPost(new URLSearchParams({ a: 'userCheckLogin' }))
        .then(function(response) {

            // Whether this instance requires login to view content (server-gated).
            // Captured before Database.config is loaded so the boot flow can decide
            // to authenticate before loading gated _data.
            forceLoginRequired = !!response.forceLogin;

            switch(response.code){

                case 0:
                    logout();
                    callback.call(window, false);
                    break;

                case 1:
                    userSessionLifetime = parseInt(response.session_lifetime);
                    login(response.response);
                    callback.call(window, true);
                    break;

                case 2:
                    console.error(labels['ErrorNoUserFile']);
                    FrameTrail.changeState({
                        editMode: false,
                        loggedIn: false,
                        username: '',
                        userColor: ''
                    });
                    callback.call(window, false);
                    break;

                case 3:
                    console.error(labels['ErrorNotActivated']);
                    break;

                case 4:
                    console.error(labels['ErrorWrongRole']);
                    break;

            }

        })
        .catch(function() {
            FrameTrail.changeState({
                editMode: false,
                loggedIn: false,
                username: '',
                userColor: ''
            });
            callback.call(window, false);
        });

    }


    /**
     * I am called to update my local and gloabl state __after__ the server has created a login session.
     *
     * @method login
     * @param {} userData
     * @private
     */
    function login(userData) {

        userID    = userData.id;
        userRole  = userData.role;
        userMail  = userData.mail;
        userRegistrationDate = userData.registrationDate;

        resetSessionTimeout();

        FrameTrail.changeState('username', userData.name);
        FrameTrail.changeState('userColor', userData.color);
        FrameTrail.changeState('loggedIn', true);

        document.querySelector(FrameTrail.getState('target')).classList.add('loggedIn');

        updateView(true);

    }


    /**
     * I log in as a guest (name only, no server session).
     * Sets isGuestMode and stores the name in localStorage for pre-fill convenience.
     *
     * @method loginAsGuest
     * @param {String} name
     * @private
     */
    function loginAsGuest(name) {

        // A private server instance (alwaysForceLogin) must not be viewable or
        // editable as a guest — a real account is required.
        if (isPrivateInstance()) {
            return;
        }

        isGuestMode = true;
        userID   = 'guest_' + Date.now();
        userRole = 'admin';
        userMail = '';
        userRegistrationDate = '';

        localStorage.setItem('frametrail_guest_user', JSON.stringify({ name: name }));

        FrameTrail.changeState('username', name);
        FrameTrail.changeState('userColor', '#666666');
        FrameTrail.changeState('loggedIn', true);

        document.querySelector(FrameTrail.getState('target')).classList.add('loggedIn');

        // Push user info into the active adapter so adapter.userInfo-dependent code works
        var _adapter = FrameTrail.module('StorageManager').getAdapter();
        if (_adapter && _adapter.setUserInfo) {
            _adapter.setUserInfo({ id: userID, name: name, role: 'admin', color: '#666666', mail: '' });
        }

        updateView(true);

        var _callback = userBoxCallback;
        closeLoginBox();

        if (typeof _callback === 'function') {
            _callback.call();
        }

    }


    /**
     * I am called to close the login session and update my local and global state.
     *
     * @method logout
     */
    function logout() {

        // Guest / local / download logout: clear in-memory state, no server call needed.
        if (isGuestMode || FrameTrail.getState('storageMode') !== 'server') {
            isGuestMode = false;
            userID = '';
            userRole = '';
            userMail = '';
            userRegistrationDate = '';
            FrameTrail.changeState({
                editMode: false,
                loggedIn: false,
                username: '',
                userColor: ''
            });
            document.querySelector(FrameTrail.getState('target')).classList.remove('loggedIn');
            updateView(false);
            return;
        }

        _serverPost(new URLSearchParams({ a: 'userLogout' }))
        .then(function(data) {

            if (userID != '') {
                var _lodw = document.createElement('div');
                _lodw.innerHTML = '<div class="loggedOutDialog"><div class="message success active">'+ labels['MessageUserLoggedOut'] +'</div></div>';
                var loggedOutDialog = _lodw.firstElementChild;

                    var loggedOutDialogCtrl = Dialog({
                        resizable: false,
                        modal: true,
                        content: loggedOutDialog,
                        close: function() {
                            try {
                                if (TogetherJS && TogetherJS.running) {
                                    var elementFinder = TogetherJS.require("elementFinder");
                                    var location = elementFinder.elementLocation(loggedOutDialog);
                                    TogetherJS.send({
                                        type: "simulate-dialog-close",
                                        element: location
                                    });
                                }
                            } catch (e) {}

                            FrameTrail.triggerEvent('userAction', {
                                action: 'UserLogout'
                            });

                            if (FrameTrail.module('Database').config.alwaysForceLogin) {
                                FrameTrail.module('InterfaceModal').hideMessage();
                                FrameTrail.module('UserManagement').ensureAuthenticated(function() {}, function() {}, true);
                            }

                            loggedOutDialogCtrl.destroy();
                        },
                        buttons: {
                            "OK": function() {
                                loggedOutDialogCtrl.close();
                            }
                        }
                    });
                }

                userID    = '';
                userRole  = '';
                userMail  = '';
                userRegistrationDate = '';

                FrameTrail.changeState({
                    editMode: false,
                    loggedIn: false,
                    username: '',
                    userColor: ''
                });

                document.querySelector(FrameTrail.getState('target')).classList.remove('loggedIn');

                updateView(false);

                FrameTrail.triggerEvent('userAction', {
                    action: 'UserLogout'
                });

        });

    }


    /**
     * The UI of the UserManagement has to be updated, when the loginStatus changes.
     *
     * I check wether the user is an admin or a normal user, and show and hide the respective tabs (Settings and Administration) accordingly.
     *
     * @method updateView
     * @param {Boolean} loginStatus
     * @private
     */
    function updateView(loginStatus){

        if (loginStatus){

            //domElement.find('#UserStatusMessage').addClass('active').text('Hello! Your are logged in, '+ FrameTrail.getState('username') +'.');

            domElement.querySelector('.userTabSettingsMenu').style.display = '';
            updateSettings();

            if (userRole === 'admin'){
                domElement.querySelector('.userTabAdministrationMenu').style.display = '';
                document.querySelector(FrameTrail.getState('target')).classList.add('frametrail-admin');
            }


        } else {

            domElement.querySelector('.userTabSettingsMenu').style.display = 'none';
            domElement.querySelector('.userTabAdministrationMenu').style.display = 'none';
            document.querySelector(FrameTrail.getState('target')).classList.remove('frametrail-admin');

        }


    }


    /**
     * I update the UI elements of the tab Settings
     * @method updateSettings
     * @private
     */
    function updateSettings() {

        domElement.querySelector('#SettingsForm_name').value   = FrameTrail.getState('username');
        domElement.querySelector('#SettingsForm_mail').value   = userMail;
        //domElement.querySelector('#SettingsForm_color').value  = userColor;
        domElement.querySelector('#SettingsForm_passwd').value = '';
        domElement.querySelector('#SettingsForm_userID').value = userID;

    }


    /**
     * I open the login box.
     * The UI is a single DOM element
     *
     * @method showLoginBox
     * @param {Boolean} disallowCancel
     */
    function showLoginBox(disallowCancel) {

        if (disallowCancel) {
            loginBox.querySelectorAll('.loginBoxCancelButton').forEach(function(el) { el.style.display = 'none'; });
        } else {
            loginBox.querySelectorAll('.loginBoxCancelButton').forEach(function(el) { el.style.display = ''; });
        }

        loginBox.querySelectorAll('.message').forEach(function(el) { el.classList.remove('active', 'error'); el.textContent = ''; });
        loginBox.querySelector('.loginForm').reset();
        loginBox.querySelector('.userRegistrationForm').reset();

        // Pre-fill guest name from localStorage if available
        var savedGuest = localStorage.getItem('frametrail_guest_user');
        if (savedGuest) {
            try {
                var guestData = JSON.parse(savedGuest);
                if (guestData && guestData.name) {
                    loginBox.querySelector('.guestNameInput').value = guestData.name;
                }
            } catch(e) {}
        }

        // In non-server mode, show only the Edit as Guest tab
        var storageMode = FrameTrail.getState('storageMode');
        if (storageMode !== 'server') {
            loginBox.querySelector('.loginTabButton').style.display = 'none';
            loginBox.querySelector('.createAccountTabButton').style.display = 'none';
            loginBox.querySelectorAll('.loginBoxOrDivider').forEach(function(el) { el.style.display = 'none'; });
            loginBox.querySelector('.editAsGuestTabButton').click();
        } else {
            loginBox.querySelector('.loginTabButton').style.display = '';
            loginBox.querySelector('.createAccountTabButton').style.display = '';
            var _dividers = loginBox.querySelectorAll('.loginBoxOrDivider');
            if (isPrivateInstance()) {
                // Private instance: no guest bypass — login or create account only.
                // Hide the Edit-as-Guest tab and the divider that precedes it (the last one).
                loginBox.querySelector('.editAsGuestTabButton').style.display = 'none';
                _dividers.forEach(function(el, i) { el.style.display = (i === _dividers.length - 1) ? 'none' : ''; });
            } else {
                loginBox.querySelector('.editAsGuestTabButton').style.display = '';
                _dividers.forEach(function(el) { el.style.display = ''; });
            }
            // Reset to login tab when showing in server mode
            loginBox.querySelector('.loginTabButton').click();
        }

        loginBox.style.display = 'block';

    }


    /**
     * I close the login box.
     *
     * @method closeLoginBox
     */
    function closeLoginBox() {

        userBoxCallback = null;
        userBoxCallbackCancel = null;

        loginBox.style.display = '';

    }


    /**
     * I open the user administration dialog.
     * The UI is a single DOM element, which is displayed via jQuery UI Dialog
     *
     * @method showAdministrationBox
     */
    function showAdministrationBox() {

        ensureAuthenticated(function() {

            userDialogCtrl = Dialog({
                title: labels['UserManagement'],
                content: domElement,
                modal: true,
                width: 600,
                height: 460,
                open: function() {
                    updateView(true);
                    FTTabs(domElement.querySelector('.userTabs'), 'refresh');
                    getUserColorCollection(function() {
                        renderUserColorCollectionForm(FrameTrail.getState('userColor'),".userColor")
                    });
                },
                close: function() {
                    userDialogCtrl.destroy();
                    userDialogCtrl = null;
                }
            });

        });

    }


    /**
     * I close the user administration dialog (jQuery UI Dialog).
     *
     * @method closeAdministrationBox
     * @return
     */
    function closeAdministrationBox() {

        if (userDialogCtrl) userDialogCtrl.close();

    }


    /**
     * I start the (PHP) session timeout counter.
     *
     * @method startSessionTimeout
     * @return
     */
    function startSessionTimeout() {

        // session lifetime minus 30 seconds
        var timeoutDuration = (userSessionLifetime-30) * 1000;
        //console.log('Starting Session Timeout at: ' + Math.floor( (userSessionLifetime-30) / 60 ) + ' minutes');
        userSessionTimeout = setTimeout(function() {
            // Renew Session
            //console.log('Renewing Session ...');
            isLoggedIn(function(){});
        }, timeoutDuration);

    }


    /**
     * I reset the (PHP) session timeout counter.
     *
     * @method resetSessionTimeout
     * @return
     */
    function resetSessionTimeout() {

        clearTimeout(userSessionTimeout);
        startSessionTimeout();

    }


    // Init the user model
    isLoggedIn(function(){});


    return {

        showLoginBox:           showLoginBox,
        closeLoginBox:          closeLoginBox,
        showAdministrationBox:  showAdministrationBox,
        closeAdministrationBox: closeAdministrationBox,

        isLoggedIn:             isLoggedIn,
        ensureAuthenticated:    ensureAuthenticated,
        logout:                 logout,
        isGuestMode:            function() { return isGuestMode; },
        isForceLogin:           function() { return forceLoginRequired; },

        /**
         * The current userID or an empty String.
         * @attribute userID
         */
        get userID()    { return userID.toString()   },
        /**
         * The users mail adress as a String.
         * @attribute userMail
         */
        get userMail()  { return userMail            },
        /**
         * The users role, which is either 'admin' or 'user', or – when not logged in – an empty String.
         * @attribute userRole
         */
        get userRole()  { return userRole            },
        /**
         * The users registration Date, which is a Number (milliseconds since 01-01-1970)
         * @attribute userRegistrationDate
         */
        get userRegistrationDate() { return userRegistrationDate }

    };


});
