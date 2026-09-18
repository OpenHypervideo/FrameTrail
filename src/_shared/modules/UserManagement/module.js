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
        // The platform's own description of itself, when this instance defers
        // authentication to one. Captured from userCheckLogin rather than from
        // the config, because it has to be known before config.json is loadable.
        externalAuth            = null,
        userDialogCtrl          = null,

        userBoxCallback         = null,
        userBoxCallbackCancel   = null,

        domElement = null,

        loginBox = null;

    var _dmw = document.createElement('div');
    _dmw.innerHTML = '<div class="UserBox">'
        + '    <div class="userStatusMessage message">'
        + '    </div>'
        + '    <div id="UserTabSettings">'
        + '         <form class="settingsForm" method="post">'
        + '             <p class="settingsFormStatus message"></p>'
        + '             <input type="text" name="name" id="SettingsForm_name" placeholder="'+ labels['UserName'] +'">'
        + '             <input type="text" name="mail" id="SettingsForm_mail" placeholder="'+ labels['UserMail'] +'"><br>'
        + '             <div class="userColor"></div>'
        + '             <input type="text" name="avatar" id="SettingsForm_avatar" placeholder="'+ labels['UserAvatarUrl'] +'">'
        + '             <input type="password" name="passwd" id="SettingsForm_passwd" placeholder="'+ labels['UserNewPassword'] +'"><br>'
        + '             <br>'
        + '             <input type="hidden" name="a" value="userChange">'
        + '             <input type="hidden" name="userID" id="SettingsForm_userID" value="">'
        + '             <input type="submit" value="'+ labels['UserChangeMySettings'] +'">'
        + '         </form>'
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
        // Shown instead of all three of the above when the instance defers to a
        // platform: there are no local credentials to offer, so there is nothing
        // to choose between and the box collapses to a single way out.
        + '        <div class="userTabExternal">'
        + '             <div class="guestEditHint externalLoginHint"></div>'
        + '             <button type="button" class="externalLoginButton"></button>'
        + '             <button type="button" class="loginBoxCancelButton">'+ labels['GenericCancel'] +'</button>'
        + '        </div>'
        + '    </div>'
        + '</div>';
    loginBox = _lbw.firstElementChild;
    loginBox.style.display = 'none';


    /* Administration Box */


    function _serverPost(body) {
        return FrameTrail.module('StorageManager').serverPost(body);
    }

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
                    FrameTrail.changeState('userAvatar', response.response.avatar || '');
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

    loginBox.querySelector('.externalLoginButton').addEventListener('click', function() {
        goToExternalLogin();
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
     * Whether this instance renders profile pictures at all. Mirrors
     * ftAvatarMode() server-side; anything but 'off' means a picture can appear.
     *
     * @method avatarsEnabled
     * @return {Boolean}
     * @private
     */
    function avatarsEnabled() {

        try {
            var config = FrameTrail.module('Database').config;

            return !!config && config.userAvatars && config.userAvatars !== 'off';
        } catch (e) {
            return false;
        }

    }


    /**
     * I hand the browser back to the platform, carrying where to return to.
     *
     * The return path is the whole of the current location below the origin, so
     * a link straight into a hypervideo at a timecode survives the round trip
     * and the person lands where they were going rather than at the overview.
     *
     * @method goToExternalLogin
     * @private
     */
    function goToExternalLogin() {

        if (!externalAuth || !externalAuth.loginUrl) {

            // Guarded because this module is shared: the resource manager loads
            // InterfaceModal's script but never initialises it, so module() hands
            // back undefined there and an unguarded call would turn a missing
            // configuration into a crash.
            var message = labels['ErrorExternalAuthFailed']
                            .replace('%s', externalAuth ? externalAuth.label : '');
            var modal   = FrameTrail.module('InterfaceModal');

            if (modal) {
                modal.showErrorMessage(message);
            } else {
                console.error(message);
            }

            return;

        }

        var next = window.location.pathname + window.location.search + window.location.hash;

        window.location.href = externalAuth.loginUrl
            + (externalAuth.loginUrl.indexOf('?') === -1 ? '?' : '&')
            + 'next=' + encodeURIComponent(next);

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

            } else if (externalAuth && externalAuth.mode === 'transparent') {

                // There is nothing to ask. Identity is the platform's to give,
                // and a box offering a choice this instance cannot honour would
                // only be a dead end — so go straight back and return signed.
                goToExternalLogin();

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

            // Rides along for the same reason, and is needed at the same moment:
            // whether a login box can do anything at all has to be known before
            // any UI offers one.
            externalAuth = response.externalAuth || null;

            switch(response.code){

                // "You have no session" — which is the ordinary answer for every
                // visitor who has not signed in, not something they asked for.
                // It must stay silent: a logout that announces itself, or that
                // follows the provider's logoutUrl, would bounce an anonymous
                // visitor off the page before it ever finished loading.
                case 0:
                    logout(true);
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

                // Both of these mean the session is over: the account has been
                // deactivated, removed, or had its role changed out from under
                // it. They used to only log and fall through, which left
                // loggedIn true, the avatar on screen, the keepalive never
                // rescheduled, and — because the callback never fired — any
                // ensureAuthenticated() waiting on this call hanging forever.
                // Terminating here is what makes revocation from outside work
                // at all: the platform removes the record, and the next
                // heartbeat ends the session.
                case 3:
                case 4:
                    console.error(labels[response.code === 3 ? 'ErrorNotActivated' : 'ErrorWrongRole']);
                    logout(true);
                    callback.call(window, false);
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
        FrameTrail.changeState('userAvatar', userData.avatar || '');
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
        FrameTrail.changeState('userAvatar', '');
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
     * I drop every trace of the signed-in person from this tab.
     *
     * Factored out because three paths need exactly this and nothing else: a
     * guest or offline logout, a session revoked elsewhere, and the tail of a
     * normal server logout.
     *
     * @method resetLocalSession
     * @private
     */
    function resetLocalSession() {

        isGuestMode = false;
        userID = '';
        userRole = '';
        userMail = '';
        userRegistrationDate = '';

        FrameTrail.changeState({
            editMode: false,
            loggedIn: false,
            username: '',
            userColor: '',
            userAvatar: ''
        });

        document.querySelector(FrameTrail.getState('target')).classList.remove('loggedIn');
        updateView(false);

    }


    /**
     * I am called to close the login session and update my local and global state.
     *
     * @method logout
     * @param {Boolean} silent  no confirmation dialog and no redirect — used when
     *                          the session ended elsewhere (the account was
     *                          deactivated or removed) rather than by request,
     *                          where announcing a logout nobody asked for, or
     *                          navigating away mid-call, would both be wrong.
     */
    function logout(silent) {

        // Guest / local / download logout: clear in-memory state, no server call needed.
        if (isGuestMode || FrameTrail.getState('storageMode') !== 'server') {
            resetLocalSession();
            return;
        }

        // A silent logout is a session that has already ended somewhere else, so
        // the local state must go now rather than a round trip later. Otherwise
        // whoever was told "you are signed out" — the isLoggedIn callback — sees
        // loggedIn still true when it acts on that, and the interface keeps
        // showing an identity the server has already stopped honouring.
        if (silent) {
            resetLocalSession();
        }

        _serverPost(new URLSearchParams({ a: 'userLogout' }))
        .then(function(data) {

            // On a platform-backed instance, leaving means leaving the platform's
            // session too — staying here would only show a login box that cannot
            // sign anyone in.
            if (!silent && externalAuth && externalAuth.logoutUrl) {
                window.location.href = externalAuth.logoutUrl;
                return;
            }

            if (userID != '' && !silent) {
                var _lodw = document.createElement('div');
                _lodw.innerHTML = '<div class="loggedOutDialog"><div class="message success active">'+ labels['MessageUserLoggedOut'] +'</div></div>';
                var loggedOutDialog = _lodw.firstElementChild;

                    var loggedOutDialogCtrl = Dialog({
                        resizable: false,
                        modal: true,
                        content: loggedOutDialog,
                        close: function() {
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

                // Idempotent, so running it again after a silent logout already
                // did costs nothing.
                resetLocalSession();

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

        // There are no tabs to show or hide any more — this dialog is only ever
        // the current user's own settings. The admin marker class still matters,
        // because it gates admin-only affordances elsewhere in the UI.
        if (loginStatus){

            updateSettings();

            if (userRole === 'admin'){
                document.querySelector(FrameTrail.getState('target')).classList.add('frametrail-admin');
            }

        } else {

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

        // Offered only where a picture would be rendered at all — a field whose
        // value is never drawn is worse than no field.
        var _avatarField = domElement.querySelector('#SettingsForm_avatar');
        _avatarField.value = FrameTrail.getState('userAvatar') || '';
        _avatarField.style.display = avatarsEnabled() ? '' : 'none';

        // Name, mail and password belong to the platform, and the next sign-in
        // rewrites the first two from its token regardless — so offering them
        // here would only invite an edit that silently reverts. The colour is
        // the one thing on this form that is genuinely the person's own.
        if (externalAuth) {
            ['#SettingsForm_name', '#SettingsForm_mail', '#SettingsForm_passwd'].forEach(function(sel) {
                domElement.querySelector(sel).style.display = 'none';
            });
        }

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

        var storageMode = FrameTrail.getState('storageMode');

        // Platform-backed: there are no local credentials on this instance, in
        // either mode — the password and register tabs are not merely hidden,
        // there is nothing behind them — and guest editing would bypass exactly
        // the identity the platform exists to establish. So the box has one row.
        if (externalAuth) {

            loginBox.querySelector('.loginTabButton').style.display = 'none';
            loginBox.querySelector('.createAccountTabButton').style.display = 'none';
            loginBox.querySelector('.editAsGuestTabButton').style.display = 'none';
            loginBox.querySelectorAll('.loginBoxOrDivider').forEach(function(el) { el.style.display = 'none'; });

            loginBox.querySelector('.userTabLogin').style.display = 'none';
            loginBox.querySelector('.userTabRegister').style.display = 'none';
            loginBox.querySelector('.userTabGuest').style.display = 'none';
            loginBox.querySelector('.userTabExternal').style.display = 'block';

            var _label = externalAuth.label || '';
            loginBox.querySelector('.externalLoginHint').textContent =
                labels['UserExternalAccountNote'].replace('%s', _label);
            loginBox.querySelector('.externalLoginButton').textContent =
                labels['UserLoginWithProvider'].replace('%s', _label);

            loginBox.style.display = 'block';
            return;

        }

        loginBox.querySelector('.userTabExternal').style.display = 'none';

        // In non-server mode, show only the Edit as Guest tab
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
     * I open the current user's own settings — name, mail, colour, password.
     *
     * Administering *other* users lives in the admin dialog's User
     * Administration tab, so this dialog has no tabs at all.
     *
     * @method showMySettings
     */
    function showMySettings() {

        ensureAuthenticated(function() {

            userDialogCtrl = Dialog({
                title: labels['UserMySettings'],
                icon: 'icon-user',
                content: domElement,
                modal: true,
                width: 600,
                height: 340,
                open: function() {
                    updateView(true);
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
     * @method closeMySettings
     * @return
     */
    function closeMySettings() {

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
        showMySettings:         showMySettings,
        closeMySettings:        closeMySettings,

        // Reused by the admin dialog's User Administration tab, so the colour
        // palette is defined in exactly one place.
        getUserColorCollection:      getUserColorCollection,
        renderUserColorCollectionForm: renderUserColorCollectionForm,

        isLoggedIn:             isLoggedIn,
        ensureAuthenticated:    ensureAuthenticated,
        logout:                 logout,
        isGuestMode:            function() { return isGuestMode; },
        isForceLogin:           function() { return forceLoginRequired; },

        /**
         * The platform's public description of itself, or null when this
         * instance authenticates locally. Consumers use its presence to decide
         * whether an affordance belongs to FrameTrail or to the platform.
         */
        externalAuth:           function() { return externalAuth; },

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
