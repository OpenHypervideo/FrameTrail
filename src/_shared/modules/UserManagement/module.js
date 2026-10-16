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
        // How long the server says this session may still live, when a platform
        // established it. Null whenever the question does not apply — a local
        // password session, or one with no absolute bound. The heartbeat aims
        // at whichever of this and the idle lifetime comes first.
        userSessionExpiresIn    = null,
        // Set while a silent re-auth frame is in flight, so a heartbeat that
        // lands in the middle of one does not start a second: whoever asks
        // meanwhile waits for its answer (renewWaiters). armRenewTimeout arms
        // its deadline again after a timer sweep (rearmTimers).
        silentRenewInFlight     = false,
        renewWaiters            = [],
        armRenewTimeout         = null,
        // The account the work on this page belongs to: the last one signed in
        // here with a server session. Unlike userID it outlives the end of the
        // session — it is how a session that comes back as somebody else is
        // told apart from one that comes back, and whose annotations an export
        // after the end of a session holds. Cleared by a logout the user asked
        // for, and by guest mode.
        workingAs               = '',
        workingAsName           = '',
        // The account a session was found to belong to instead, once the
        // account-changed dialog has told the user (the heartbeat does not ask
        // again for the same one), and whether that dialog is open.
        accountChangeNotedFor   = null,
        accountChangedOpen      = false,
        sessionEndedOpen        = false,
        isGuestMode             = false,
        forceLoginRequired      = false,
        // The platform's own description of itself, when this instance defers
        // authentication to one. Captured from userCheckLogin rather than from
        // the config, because it has to be known before config.json is loadable.
        externalAuth            = null,
        // Whether the platform hosting this instance owns its settings, and
        // where they are edited instead. Captured from userCheckLogin on every
        // heartbeat, so a settings button drawn before the platform took them
        // over goes away without a reload.
        externalSettings        = null,
        // Whether this person may manage personal API tokens in My Settings:
        // the server's answer (config.json → apiTokens, never under external
        // authentication), captured from userCheckLogin.
        apiTokensOffered        = false,
        // What the server parts of the enabled extensions offer and lack, sent
        // to admins only; and which of their problems were reported already.
        serverExtensions        = [],
        serverExtensionProblems = {},
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
        // Personal API tokens: shown only where the instance offers them
        // (config.json → apiTokens). The list reuses the user list's rows.
        + '    <div class="apiTokens">'
        + '        <div class="mt-1"><label>'+ labels['UserApiTokens'] +'</label></div>'
        + '        <div class="fieldHint">'+ labels['MessageApiTokens'] +'</div>'
        + '        <div class="apiTokenNew"></div>'
        + '        <div class="userList apiTokenList"></div>'
        + '        <div class="layoutRow">'
        + '            <div class="column-5"><input type="text" class="apiTokenName" maxlength="80" placeholder="'+ labels['UserApiTokenName'] +'"></div>'
        + '            <div class="column-4">'
        + '                <div class="custom-select">'
        + '                    <select class="apiTokenExpiry">'
        + '                        <option value="30">'+ labels['UserApiTokenExpiresIn'].replace('%s', '30') +'</option>'
        + '                        <option value="90" selected>'+ labels['UserApiTokenExpiresIn'].replace('%s', '90') +'</option>'
        + '                        <option value="365">'+ labels['UserApiTokenExpiresIn'].replace('%s', '365') +'</option>'
        + '                        <option value="0">'+ labels['UserApiTokenNoExpiry'] +'</option>'
        + '                    </select>'
        + '                </div>'
        + '            </div>'
        + '            <div class="column-3"><button type="button" class="apiTokenCreateButton">'+ labels['UserApiTokenCreate'] +'</button></div>'
        + '        </div>'
        + '        <p class="apiTokenStatus message"></p>'
        + '    </div>'
        + '</div>';
    domElement = _dmw.firstElementChild;
    domElement.querySelector('.apiTokens').style.display = 'none';

    domElement.querySelector('.apiTokenCreateButton').addEventListener('click', function() {
        createApiToken();
    });

    domElement.querySelector('.apiTokenName').addEventListener('keydown', function(evt) {
        if (evt.key === 'Enter') { evt.preventDefault(); createApiToken(); }
    });

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
        + '                 <div class="buttonRow">'
        + '                     <input type="submit" value="'+ labels['UserLogin'] +'">'
        + '                     <button type="button" class="loginBoxCancelButton secondary">'+ labels['GenericCancel'] +'</button>'
        + '                 </div>'
        + '             </form>'
        + '        </div>'
        + '        <div class="userTabRegister">'
        + '             <form class="userRegistrationForm" method="post">'
        + '                 <p class="userRegistrationFormStatus message"></p>'
        + '                 <input type="text" name="name" placeholder="'+ labels['UserName'] +'">'
        + '                 <input type="text" name="mail" placeholder="'+ labels['UserMail'] +'">'
        + '                 <input type="password" name="passwd" placeholder="'+ labels['UserPassword'] +'">'
        + '                 <input type="hidden" name="a" value="userRegister">'
        + '                 <div class="buttonRow">'
        + '                     <input type="submit" value="'+ labels['UserCreateAccount'] +'">'
        + '                     <button type="button" class="loginBoxCancelButton secondary">'+ labels['GenericCancel'] +'</button>'
        + '                 </div>'
        + '             </form>'
        + '        </div>'
        + '        <div class="userTabGuest">'
        + '             <div class="guestEditHint">'+ labels['UserGuestEditNote'] +'</div>'
        + '             <input type="text" class="guestNameInput" placeholder="'+ labels['UserGuestName'] +'">'
        + '             <div class="buttonRow">'
        + '                 <button type="button" class="guestContinueButton">'+ labels['UserEditAsGuest'] +'</button>'
        + '                 <button type="button" class="loginBoxCancelButton secondary">'+ labels['GenericCancel'] +'</button>'
        + '             </div>'
        + '        </div>'
        // Shown instead of all three of the above when the instance defers to a
        // platform: there are no local credentials to offer, so there is nothing
        // to choose between and the box collapses to a single way out.
        + '        <div class="userTabExternal">'
        + '             <div class="guestEditHint externalLoginHint"></div>'
        + '             <div class="buttonRow">'
        + '                 <button type="button" class="externalLoginButton"></button>'
        + '                 <button type="button" class="loginBoxCancelButton secondary">'+ labels['GenericCancel'] +'</button>'
        + '             </div>'
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
                    // Signed in as somebody else than the account whose unsaved
                    // work is open here: it is not theirs. What waited for the
                    // sign-in (a save) does not run under their name.
                    if (workingAs && String(response.userdata.id) !== workingAs && FrameTrail.getState('unsavedChanges')) {
                        var _cancel = userBoxCallbackCancel;
                        _st.classList.remove('active', 'error', 'success'); _st.textContent = '';
                        closeLoginBox();
                        if (typeof _cancel === 'function') { _cancel.call(); }
                        accountChangeNotedFor = String(response.userdata.id);
                        showAccountChangedDialog(true);
                        break;
                    }
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


    // Where an interrupted intention waits out the round trip to the platform.
    // Session-scoped, so it cannot outlive the tab that formed it.
    var AUTH_INTENT_KEY = 'frametrail.authIntent';

    // An intention older than this is not one any more — somebody left the tab
    // open, came back, and would be startled to find it acting on a decision
    // they no longer remember making.
    var AUTH_INTENT_MAX_AGE = 5 * 60 * 1000;


    /**
     * I write down what somebody was trying to do, in case it costs a page.
     *
     * Session storage rather than the return URL: a link someone shares should
     * not push a stranger into edit mode, and the address bar should stay
     * readable. Stamped, because an intent recovered an hour later has stopped
     * describing anything anyone remembers wanting.
     *
     * Called before the attempt, not during the navigation, because by the time
     * we know a navigation is needed the caller's own context is gone.
     *
     * @method rememberIntent
     * @param {String} intent
     */
    function rememberIntent(intent) {

        try {
            window.sessionStorage.setItem(AUTH_INTENT_KEY, JSON.stringify({
                intent: intent,
                at: Date.now()
            }));
        } catch (e) {
            // Private windows and blocked site data both land here. The round
            // trip still works; it just forgets what it was for.
        }

    }


    /**
     * I drop a remembered intention that turned out not to need remembering.
     *
     * The common path now: the frame answered, nothing navigated, and the thing
     * happened immediately. Leaving the note behind would have the next reload
     * act on it a second time.
     *
     * @method forgetIntent
     */
    function forgetIntent() {

        try {
            window.sessionStorage.removeItem(AUTH_INTENT_KEY);
        } catch (e) {}

    }


    /**
     * I take back the intention that was interrupted by a sign-in, once.
     *
     * Reading it clears it, whether or not it was still fresh: an intent that
     * survives into a second page load has stopped describing anything real.
     *
     * @method consumeAuthIntent
     * @return {String|null}
     */
    function consumeAuthIntent() {

        var raw = null;

        try {
            raw = window.sessionStorage.getItem(AUTH_INTENT_KEY);
            window.sessionStorage.removeItem(AUTH_INTENT_KEY);
        } catch (e) {
            return null;
        }

        if (!raw) return null;

        try {
            var stored = JSON.parse(raw);

            if (!stored || typeof stored.at !== 'number') return null;
            if ((Date.now() - stored.at) > AUTH_INTENT_MAX_AGE) return null;

            return stored.intent || null;
        } catch (e) {
            return null;
        }

    }


    /**
     * I am the way out to the platform, when there is something to lose.
     *
     * Where goToExternalLogin() simply goes, this asks first — on this project's
     * own domain, where the person already is. That matters more than it
     * sounds: a page that answers a click by silently becoming
     * linkedvideo.local/manage/login reads as a broken link or a phish, and
     * gives no way back. The wall says whose sign-in this is and what it is
     * for, and the navigation happens when somebody chooses it.
     *
     * Falls through to the bare navigation wherever the wall cannot be drawn —
     * the resource manager, which never initialises player modules.
     *
     * @method requestExternalLogin
     * @param {Boolean} disallowCancel
     * @private
     */
    function requestExternalLogin(disallowCancel, onCancel, reason) {

        var wall = FrameTrail.module('SignInWall');

        if (wall) {

            // Being signed in already is the case that used to be handled
            // worst: the box said "sign in", the only button led out to the
            // platform, and the platform sent them back to be told something
            // this browser could have said a screen earlier. When the platform
            // names the reason, say it here and offer the one thing that
            // actually helps.
            var variant = (reason === 'noaccess')
                            ? 'denied'
                            : (isPrivateInstance() ? 'private' : 'signin');

            wall.show(variant, {
                disallowCancel: disallowCancel,
                onCancel: onCancel
            });
            return;
        }

        goToExternalLogin();

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
     * On a platform-backed instance the first answer to "there is no session"
     * is no longer "leave the page". It is to ask the platform quietly, in a
     * frame, and carry on if it says yes — which it usually does, because
     * somebody working in a project generally still has a session open next
     * door. That single step is what makes clicking Edit take one click
     * instead of two: nothing navigates, so this callback is never lost.
     *
     * When the quiet route fails, what happens next depends on who asked and
     * on what is at stake. The governing rule, and the reason for the
     * `background` option:
     *
     *     nothing navigates away while editMode is set and there are
     *     unsaved changes, and nothing initiated by a timer navigates at all.
     *
     * Handing that decision to the browser — which is what an unguarded
     * redirect does — produces a generic "Leave site?" whose Leave loses the
     * work and whose Stay strands the person with no explanation.
     *
     * @method ensureAuthenticated
     * @param {Function} callback
     * @param {Function} callbackCancel (optional)
     * @param {Boolean} disallowCancel (optional)
     * @param {Object} options (optional)
     *            background: true when a timer asked, not a person. Such a call
     *            may repair a session silently but must never navigate and must
     *            never raise a dialog: the work stays dirty, and leaveEditMode()
     *            remains the backstop it was always meant to be.
     */
    function ensureAuthenticated(callback, callbackCancel, disallowCancel, options){

        var background = !!(options && options.background),
            // Read now: the check below may end the session, and with it edit mode.
            hadUnsavedWork = !!FrameTrail.getState('unsavedChanges');

        // Quiet: a session that ended is handled here, by what the caller
        // needs (a login box, the platform), not announced as well. A timer
        // has nobody waiting for a login box, so for it the end is announced
        // as the heartbeat would (a dialog, never a navigation away from work).
        isLoggedIn(function(loginStatus, why) {

            if (loginStatus) {

                callback.call();
                return;

            }

            // Signed in as somebody else in this browser. Never silently, even
            // for a timer: the next save would be attributed to a person who
            // did not do the work.
            if (why === 'changed') {
                if (!background) {
                    showAccountChangedDialog(hadUnsavedWork);
                }
                if (callbackCancel) callbackCancel.call();
                return;
            }

            // Ask the platform without moving the page. Free when there is
            // nothing to ask — silentRenew() answers false immediately unless
            // this instance defers to a platform that offered a renewUrl — and
            // not asked twice: a session that ended under us was renewed by the
            // check just now if it could be.
            var renew = (why === 'renewFailed')
                      ? function(done) { done(false, false, null); }
                      : silentRenew;

            renew(function(renewed, identityChanged, reason) {

                if (renewed) {
                    callback.call();
                    return;
                }

                if (identityChanged) {
                    if (!background) {
                        showAccountChangedDialog(hadUnsavedWork);
                    }
                    if (callbackCancel) callbackCancel.call();
                    return;
                }

                if (background) {
                    // A timer asked. Answering it with a dialog or a
                    // navigation would be answering a question nobody posed.
                    if (callbackCancel) callbackCancel.call();
                    return;
                }

                // Signing in with a platform leaves the page, and unsaved work
                // would go with it: say so first, and offer the export.
                if (externalAuth && hadUnsavedWork) {
                    showSessionEndedDialog(true, FrameTrail.getState('editMode'));
                    if (callbackCancel) callbackCancel.call();
                    return;
                }

                if (externalAuth && externalAuth.mode === 'transparent') {

                    // The cancel is handed to the wall rather than fired now:
                    // the box is a question, and answering it for the caller
                    // before anybody has looked at it would unwind the very
                    // thing it is asking about.
                    requestExternalLogin(disallowCancel, function() {
                        if (callbackCancel) callbackCancel.call();
                    }, reason);

                    return;

                }

                userBoxCallback = callback;
                userBoxCallbackCancel = callbackCancel;
                showLoginBox(disallowCancel);

            });

        }, { quiet: !background });

    }


    /**
     * I check wether the user has logged in, and call the callback with a boolean to indicate this.
     *
     * The callback's second argument says why not, where it matters:
     * 'changed' (the session in this browser is somebody else's now — see
     * sessionPresent), 'renewFailed' (it ended, and the platform could not
     * renew it), 'ended' (it ended, nothing to renew it with).
     *
     * The session ending is announced here (sessionGone) — unless options.quiet:
     * then the caller handles it (ensureAuthenticated shows the login box).
     *
     * @method isLoggedIn
     * @param {Function} callback  (loggedIn, why)
     * @param {Object} [options]   quiet: do not announce; noRenew: do not ask the platform (the renewal confirming itself)
     */
    function isLoggedIn(callback, options) {

        options = options || {};

        var storageMode = FrameTrail.getState('storageMode');

        // Guest mode is set explicitly via loginAsGuest() — session-only, cleared on reload.
        // Works for local, download, AND server mode (when editing as guest on a server instance).
        if (isGuestMode) {
            window.setTimeout(function() {
                callback.call(window, true);
            }, 2);
            return;
        }

        // In local/file/download/static mode without guest mode active, user is not yet identified.
        // Also applies when storageMode is not yet set but shorthand API options
        // indicate that the Download adapter will be used (videoElement / videoSource).
        if (storageMode === 'local' || storageMode === 'file' || storageMode === 'download' || storageMode === 'static' ||
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
            externalSettings = response.externalSettings || null;
            apiTokensOffered = !!response.apiTokens;

            switch(response.code){

                // "You have no session" — which is the ordinary answer for every
                // visitor who has not signed in, not something they asked for.
                // It must stay silent: a logout that announces itself, or that
                // follows the provider's logoutUrl, would bounce an anonymous
                // visitor off the page before it ever finished loading.
                case 0:
                    sessionMissing(callback, options);
                    break;

                case 1:
                    sessionPresent(response, callback, options);
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
                    var revokedWhileEditing = !!FrameTrail.getState('editMode'),
                        revokedUnsavedWork  = !!FrameTrail.getState('unsavedChanges'),
                        revokedUnderUs      = FrameTrail.getState('loggedIn') && !isGuestMode;
                    logout(true);
                    // Told why, and the work is kept: Export is the way out of a
                    // tab whose account can no longer save.
                    if (revokedUnderUs && !options.quiet && (revokedWhileEditing || revokedUnsavedWork)) {
                        showSessionEndedDialog(revokedUnsavedWork, revokedWhileEditing, 'revoked');
                    }
                    callback.call(window, false, 'ended');
                    break;

            }

        }, function() {
            // The server could not be reached. That says nothing about the
            // session: nothing is reset (closing edit mode here used to throw
            // people out of their work on a flaky connection), the answer is
            // what was known, and the heartbeat looks again soon.
            if (FrameTrail.getState('loggedIn') && !isGuestMode) {
                retrySessionCheckSoon();
            }
            callback.call(window, !!FrameTrail.getState('loggedIn'));
        });

    }


    /**
     * The server says there is a session (userCheckLogin, code 1).
     *
     * Usually the one this page has. But the session is the browser's, not the
     * tab's: another tab may have signed in as somebody else, or the platform
     * may have. While edit mode is open or there is unsaved work here, that
     * person is not adopted — whatever is unsaved was authored by the account
     * the page worked as, and saving it now would file it under the new one's
     * name. The page is signed out instead, the work stays, and the
     * account-changed dialog says so (once per account, for the heartbeat).
     *
     * @method sessionPresent
     * @param {Object} response
     * @param {Function} callback
     * @param {Object} options
     * @private
     */
    function sessionPresent(response, callback, options) {

        var incoming = String(response.response.id);

        if (workingAs && incoming !== workingAs
            && (FrameTrail.getState('editMode') || FrameTrail.getState('unsavedChanges'))) {

            var hadUnsavedWork = !!FrameTrail.getState('unsavedChanges');

            resetLocalSession();

            if (!options.quiet && accountChangeNotedFor !== incoming) {
                accountChangeNotedFor = incoming;
                showAccountChangedDialog(hadUnsavedWork);
            }

            callback.call(window, false, 'changed');
            return;

        }

        userSessionLifetime = parseInt(response.session_lifetime);
        userSessionExpiresIn = (typeof response.session_expires_in === 'number')
                                ? response.session_expires_in
                                : null;
        reportServerExtensions(response.serverExtensions);
        login(response.response);
        callback.call(window, true);

    }


    /**
     * The server says there is no session (userCheckLogin, code 0).
     *
     * For an anonymous visitor that is the ordinary answer, and nothing
     * happens. A session that was here a moment ago and is not any more is
     * another matter — somebody signed out (here, in another tab, on the
     * platform), the session expired, or somebody else signed in on the
     * platform. On a platform that offers it, the platform is asked quietly
     * first, before anything on screen changes: renewed, the editor goes on
     * exactly where it was, edit mode included.
     *
     * @method sessionMissing
     * @param {Function} callback
     * @param {Object} options
     * @private
     */
    function sessionMissing(callback, options) {

        var endedUnderUs   = FrameTrail.getState('loggedIn') && !isGuestMode,
            wasEditing     = !!FrameTrail.getState('editMode'),
            hadUnsavedWork = !!FrameTrail.getState('unsavedChanges');

        if (!endedUnderUs) {
            // Not logout(): there is nothing to tell the server, which has just
            // finished saying there is no session.
            resetLocalSession();
            callback.call(window, false, 'ended');
            return;
        }

        if (!options.noRenew && canRenewSilently()) {
            renewSession(function(result) {
                if (result === 'renewed') {
                    callback.call(window, true);
                    return;
                }
                sessionGone(wasEditing, hadUnsavedWork, result, options);
                callback.call(window, false, (result === 'changed') ? 'changed' : 'renewFailed');
            });
            return;
        }

        // The renewal confirming itself found no session: it reports that, and
        // whoever started it decides what to say.
        if (options.noRenew) {
            resetLocalSession();
            callback.call(window, false, 'ended');
            return;
        }

        sessionGone(wasEditing, hadUnsavedWork, 'ended', options);
        callback.call(window, false, 'ended');

    }


    /**
     * A session that was here has ended and was not renewed: the page signs
     * out (the in-memory work is untouched), and — unless the caller handles
     * it (options.quiet) — the user is told, by what is at stake.
     *
     * @method sessionGone
     * @param {Boolean} wasEditing
     * @param {Boolean} hadUnsavedWork
     * @param {String} result  'ended', 'failed' or 'changed'
     * @param {Object} options
     * @private
     */
    function sessionGone(wasEditing, hadUnsavedWork, result, options) {

        // Not logout(): there is nothing to tell the server, which has just
        // finished saying there is no session. Posting userLogout here could
        // also destroy a session a renewal has just established.
        resetLocalSession();

        FrameTrail.triggerEvent('userAction', {
            action: 'UserLogout'
        });

        if (options.quiet) return;

        if (result === 'changed') {
            showAccountChangedDialog(hadUnsavedWork);
            return;
        }

        announceSessionEnded(wasEditing, hadUnsavedWork);

    }


    /**
     * I tell the user that the session has ended, by what they would lose.
     *
     * Editing, or with unsaved changes: the session-ended dialog (Export, Sign
     * in again, Not now) — never a navigation, which would take the work with
     * it. Otherwise, on a private platform instance, nothing on the page is
     * readable without a session, so the sign-in is the way on; anywhere else
     * an anonymous visitor is a perfectly good state, and a short message
     * says why the avatar went.
     *
     * @method announceSessionEnded
     * @param {Boolean} wasEditing
     * @param {Boolean} hadUnsavedWork
     * @private
     */
    function announceSessionEnded(wasEditing, hadUnsavedWork) {

        if (wasEditing || hadUnsavedWork) {
            showSessionEndedDialog(hadUnsavedWork, wasEditing);
            return;
        }

        if (externalAuth && isPrivateInstance()) {
            goToExternalLogin();
            return;
        }

        var modal = FrameTrail.module('InterfaceModal');

        if (modal) {
            modal.showStatusMessage(labels['MessageSessionEnded']);
            modal.hideMessage(5000);
        }

    }


    /**
     * The heartbeat could not reach the server: look again in half a minute
     * rather than at the end of the session's lifetime.
     *
     * @method retrySessionCheckSoon
     * @private
     */
    function retrySessionCheckSoon() {

        clearTimeout(userSessionTimeout);
        userSessionTimeout = setTimeout(function() {
            isLoggedIn(function(){});
        }, 30000);

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

        // The work on this page is this account's from now on.
        workingAs     = String(userData.id);
        workingAsName = userData.name || '';
        accountChangeNotedFor = null;

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

        // The same name is the same user in every session, browser and machine:
        // in local-folder mode the id names the guest's annotation file and
        // decides which annotations are theirs to edit. Local mode has no
        // authentication anyway: whoever types a name is that guest.
        isGuestMode = true;
        // A guest has no server session whose identity could change under it.
        workingAs     = '';
        workingAsName = '';
        userID   = window.FrameTrailSerializer.guestUserID(name);
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
        // Belongs to the session that just ended; leaving it behind would have
        // the next heartbeat aim at a deadline that no longer means anything.
        userSessionExpiresIn = null;

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

        // Asked for: whatever is open here is nobody's account's work any more.
        // (A silent logout is a session that ended elsewhere: the work is still theirs.)
        if (!silent) {
            workingAs     = '';
            workingAsName = '';
        }

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

        // On a platform-backed instance, leaving means leaving the platform's
        // session too — staying here would only show a login box that cannot
        // sign anyone in.
        //
        // One navigation, not two steps. sso.php ends this session and then
        // hands the browser to the platform, which ends its own and clears the
        // cookie every other open project is watching. Done as an ajax call
        // followed by a redirect, either half could succeed alone — and the
        // redirect only ever ran from the fetch's success path, so a failed
        // request left the person signed in with nothing on screen to say so.
        //
        // externalAuth.logoutUrl is the *signal* that there is a platform to
        // return to, not the target: the target is our own sso.php, which reads
        // that URL server-side as its second hop.
        if (!silent && externalAuth && externalAuth.logoutUrl) {
            leaveToPlatform(null);
            return;
        }

        _serverPost(new URLSearchParams({ a: 'userLogout' }))
        .then(function(data) {

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

        })
        // A logout that could not reach the server is still a logout as far as
        // this tab is concerned; leaving the interface showing an identity
        // nobody is standing behind would be the worse of the two answers.
        .catch(function() {
            resetLocalSession();
        });

    }


    /**
     * I hand the browser to our own sso.php, which ends both sessions in turn.
     *
     * One navigation, not two steps: sso.php ends this project's session and
     * then hands the browser to the platform, which ends its own and clears the
     * cookie every other open project is watching. Done as an ajax call
     * followed by a redirect, either half could succeed alone — and the
     * redirect only ever ran from the fetch's success path, so a failed request
     * left the person signed in with nothing on screen to say so.
     *
     * externalAuth.logoutUrl is the *signal* that there is a platform to return
     * to, not the target: the target is our own sso.php, which reads that URL
     * server-side as its second hop.
     *
     * @method leaveToPlatform
     * @param {String|null} then  what to ask the platform to do afterwards.
     *            'login' means "and bring them back signed in"; null means
     *            "just leave", which returns to this project signed out.
     * @private
     */
    function leaveToPlatform(then) {

        FrameTrail.triggerEvent('userAction', {
            action: 'UserLogout'
        });

        // dataPath: a session belongs to its data folder (config.php), so
        // sso.php has to know which one to end.
        var dataPath = (FrameTrail.module('StorageManager').getAdapter() || {}).dataPathAbsolute;

        window.location.href = FrameTrail.module('RouteNavigation')
                                         .resolveServerURL('sso.php')
                             + '?a=logout'
                             + (then === 'login' ? '&then=login' : '')
                             + (dataPath ? '&dataPath=' + encodeURIComponent(dataPath) : '');

    }


    /**
     * I sign out of everything and go straight to signing back in.
     *
     * Distinct from logout(), which ends the session and gives the project
     * back. That is right for somebody leaving, and wrong for somebody who
     * pressed a button that already said they want to be a different person:
     * returning them to a page they cannot use, so they can ask again for the
     * thing they just asked for, is two clicks that decide nothing.
     *
     * The hint travels to the platform and is spent there, because it is the
     * platform that knows where its own sign-in is — and the project's loginUrl
     * is a platform route precisely so that signing in comes back here.
     *
     * @method switchAccount
     */
    function switchAccount() {

        // Nothing to switch away from: no platform holds this identity, so the
        // ordinary logout is the whole of what can be done.
        if (isGuestMode
            || FrameTrail.getState('storageMode') !== 'server'
            || !externalAuth
            || !externalAuth.logoutUrl) {
            logout();
            return;
        }

        leaveToPlatform('login');

    }


    /**
     * Whether a session that ended can be renewed without moving the page:
     * a platform that offers a renewUrl (see renewSession).
     *
     * @method canRenewSilently
     * @return {Boolean}
     * @private
     */
    function canRenewSilently() {
        return FrameTrail.getState('storageMode') === 'server' && !!externalAuth && !!externalAuth.renewUrl;
    }


    /**
     * I ask the platform for a new session without moving the page.
     *
     * A hidden frame walks the same hand-off a normal launch walks: the
     * platform mints a token, redirects the frame to our own sso.php, and that
     * establishes the session — a first-party cookie for this very origin,
     * because by the last hop the frame is on it. Then it says so, and we are
     * signed in again with nothing on screen having changed.
     *
     * This works only because a project lives at a subdomain of the platform's
     * own domain. Same site, so the frame is first-party and the cookies each
     * hop needs are actually sent. Against an unrelated domain the frame would
     * silently get nowhere, which is exactly what the timeout is for.
     *
     * One renewal at a time: whoever asks while one is on its way gets its
     * answer — a save must not be told "no" because the heartbeat happened to
     * ask first.
     *
     * Strictly a fast path. Every caller must be able to carry on when this
     * answers 'failed', because it will: a platform that has genuinely signed
     * out answers so by design, and that is the common case rather than the
     * exception.
     *
     * @method renewSession
     * @param {Function} done  called with 'renewed', 'changed' (a session, but somebody else's) or 'failed', and the platform's reason
     * @private
     */
    function renewSession(done) {

        if (!canRenewSilently()) {
            done('failed', null);
            return;
        }

        renewWaiters.push(done);

        if (silentRenewInFlight) return;

        silentRenewInFlight = true;

        var frame    = document.createElement('iframe'),
            timer    = null,
            finished = false;

        function finish(result, reason) {

            if (finished) return;
            finished = true;

            window.clearTimeout(timer);
            window.removeEventListener('message', onMessage);
            armRenewTimeout = null;

            if (frame.parentNode) {
                frame.parentNode.removeChild(frame);
            }

            silentRenewInFlight = false;

            var waiters = renewWaiters;
            renewWaiters = [];
            waiters.forEach(function(waiter) {
                try { waiter(result, reason || null); } catch (e) { console.error(e); }
            });

        }

        // Two origins may legitimately answer, because the two answers are
        // given in different places. A success walks all the way back to our
        // own sso.php, so it speaks from this origin. A failure is decided by
        // the platform before it ever mints anything, so it speaks from there —
        // and refusing that message is not a safe default, it just leaves the
        // page waiting out the timeout for an answer that already arrived.
        //
        // The platform's origin is taken from the renewUrl in the config, which
        // is written server-side and is exactly as trusted as the rest of it.
        var platformOrigin = null;

        try {
            platformOrigin = new URL(externalAuth.renewUrl, window.location.href).origin;
        } catch (e) {}

        function onMessage(event) {

            if (event.origin !== window.location.origin
                && (platformOrigin === null || event.origin !== platformOrigin)) {
                return;
            }

            if (!event.data || event.data.frametrail !== 'sso') return;

            if (!event.data.ok) {
                // Why it failed, when the platform said. 'nosession' and
                // 'noaccess' need opposite things offered to them, and asking
                // the person to find out for themselves — by sending them to
                // the platform and back — is what this is here to avoid.
                finish('failed', event.data.reason);
                return;
            }

            // Never take the frame's word for it. The worst way for this to
            // fail is to look like it worked and be discovered at save time, so
            // the session is confirmed from the server before anyone relies on
            // it — and isLoggedIn() also puts the interface back together. It
            // also tells a session that came back as somebody else
            // (sessionPresent): emphatically not a continuation.
            isLoggedIn(function(loggedIn, why) {
                finish(loggedIn ? 'renewed' : ((why === 'changed') ? 'changed' : 'failed'));
            }, { quiet: true, noRenew: true });

        }

        window.addEventListener('message', onMessage);

        // Ten seconds is long enough for two redirects and a token exchange on
        // a bad connection, and short enough that a frame which will never
        // answer — the wrong domain, a platform that is down — does not leave
        // somebody staring at an interface that has quietly stopped saving.
        // Armed again by rearmTimers() when a hypervideo switch clears every
        // timer on the page, or the renewal would never end.
        armRenewTimeout = function() {
            window.clearTimeout(timer);
            timer = window.setTimeout(function() {
                finish('failed');
            }, 10000);
        };
        armRenewTimeout();

        frame.setAttribute('aria-hidden', 'true');
        frame.style.display = 'none';
        frame.src = externalAuth.renewUrl;

        document.body.appendChild(frame);

    }


    /**
     * I ask the platform for a new session without moving the page (see
     * renewSession), for callers that want to know only whether it worked.
     *
     * @method silentRenew
     * @param {Function} done  called with (renewed, identityChanged, reason)
     */
    function silentRenew(done) {
        renewSession(function(result, reason) {
            done(result === 'renewed', result === 'changed', reason || null);
        });
    }


    /**
     * I tell somebody who was editing, or has unsaved changes, that their
     * session is over.
     *
     * A dialog rather than the redirect the other cases get, because
     * goToExternalLogin() is a whole page load and would take unsaved work with
     * it. Edit mode has already closed by the time this runs — resetLocalSession()
     * saw to that, and it is honest: there is no session to edit against. But
     * the in-memory model is untouched, so the export below still has
     * everything (BundleExport takes the own annotations of workingAs), and it
     * is the one way to get work out of a tab that can no longer save.
     *
     * With an account of this instance, signing in again happens right here
     * (the login box), and the work, still in the page, can be saved after it;
     * with a platform it leaves the page. An account that was deactivated or
     * removed (reason 'revoked') cannot sign in again at all.
     *
     * @method showSessionEndedDialog
     * @param {Boolean} hadUnsavedWork
     * @param {Boolean} [wasEditing]  sign in again opens edit mode again
     * @param {String} [reason]       'revoked': the account cannot sign in any more
     * @private
     */
    function showSessionEndedDialog(hadUnsavedWork, wasEditing, reason) {

        if (sessionEndedOpen) return;

        var label   = externalAuth ? externalAuth.label : '',
            revoked = (reason === 'revoked'),
            text    = revoked ? labels['UserAccountRevokedText']
                    : externalAuth ? labels['UserSessionEndedText'].replace('%s', label)
                    : labels['UserSessionEndedLocalText'],
            warning = !hadUnsavedWork ? ''
                    : (externalAuth && !revoked) ? labels['UserSessionEndedUnsavedWarning']
                    : labels['UserUnsavedExportHint'],
            wrapper = document.createElement('div'),
            buttons = {};

        wrapper.className = 'sessionEndedDialog';
        wrapper.innerHTML = '<div class="message active">'
            + text
            + (warning ? ' ' + warning : '')
            + '</div>';

        if (hadUnsavedWork) {
            buttons[labels['GenericExport']] = function() {
                dialogCtrl.close();
                FrameTrail.module('ExportDialog').open();
            };
        }

        if (!revoked) {
            buttons[labels['UserSignInAgain']] = function() {
                dialogCtrl.close();
                if (externalAuth) {
                    goToExternalLogin();
                    return;
                }
                // In place: the work is still here, and goes on being edited.
                userBoxCallback = function() {
                    if (wasEditing && !FrameTrail.getState('editMode')) {
                        FrameTrail.changeState('editMode', 'preview');
                    }
                };
                userBoxCallbackCancel = null;
                showLoginBox(false);
            };
        }

        buttons[labels['GenericNotNow']] = function() {
            dialogCtrl.close();
        };

        sessionEndedOpen = true;

        var dialogCtrl = Dialog({
            resizable: false,
            modal: true,
            title: labels['UserSessionEndedTitle'],
            content: wrapper,
            close: function() {
                sessionEndedOpen = false;
                dialogCtrl.destroy();
            },
            buttons: buttons
        });

    }


    /**
     * I say that the person signed in in this browser is no longer the person
     * who was working here.
     *
     * Distinct from the session simply ending, and worth its own words: there
     * *is* a valid session, it just belongs to somebody else — signed in at the
     * platform, or in another tab. Taking it would be the easy thing and the
     * wrong one — whatever is unsaved on this page was authored by the
     * previous account, and saving it now would file it under the new one's
     * name, in the new one's annotation file.
     *
     * So nothing is adopted until it is chosen. Continuing reloads the page
     * under the new identity, which is honest about what it costs; the export
     * is offered first, because it is the only way the previous account's work
     * leaves this tab intact.
     *
     * @method showAccountChangedDialog
     * @param {Boolean} hadUnsavedWork
     * @private
     */
    function showAccountChangedDialog(hadUnsavedWork) {

        if (accountChangedOpen) return;

        var label   = externalAuth ? externalAuth.label : '',
            text    = externalAuth ? labels['UserAccountChangedText'].replace('%s', label) : labels['UserAccountChangedLocalText'],
            warning = !hadUnsavedWork ? '' : (externalAuth ? labels['UserSessionEndedUnsavedWarning'] : labels['UserUnsavedExportHint']),
            wrapper = document.createElement('div'),
            buttons = {};

        wrapper.className = 'sessionEndedDialog';
        wrapper.innerHTML = '<div class="message active">'
            + text
            + (warning ? ' ' + warning : '')
            + '</div>';

        if (hadUnsavedWork) {
            buttons[labels['GenericExport']] = function() {
                dialogCtrl.close();
                FrameTrail.module('ExportDialog').open();
            };
        }

        buttons[labels['UserContinueAsNewAccount']] = function() {
            dialogCtrl.close();
            // Chosen: the previous account's unsaved work goes (or the browser
            // would ask about leaving it once more).
            if (FrameTrail.module('HypervideoModel') && FrameTrail.module('HypervideoModel').discardUnsaved) {
                FrameTrail.module('HypervideoModel').discardUnsaved();
            }
            window.location.reload();
        };

        buttons[labels['GenericNotNow']] = function() {
            dialogCtrl.close();
        };

        accountChangedOpen = true;

        var dialogCtrl = Dialog({
            resizable: false,
            modal: true,
            title: labels['UserAccountChangedTitle'],
            content: wrapper,
            close: function() {
                accountChangedOpen = false;
                dialogCtrl.destroy();
            },
            buttons: buttons
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
     * I say whether My Settings offers personal API tokens: the server said so
     * for this person (config.json → apiTokens, which it never honours under
     * external authentication, where the platform hands tokens out), and this
     * is a real account rather than a guest.
     *
     * @method apiTokensAvailable
     * @return {Boolean}
     * @private
     */
    function apiTokensAvailable() {

        return apiTokensOffered
            && !isGuestMode
            && !externalAuth
            && FrameTrail.getState('storageMode') === 'server';

    }


    /**
     * I show or hide the token section of My Settings and, when it is shown,
     * load the list. A token shown after creating it is cleared: its value is
     * never shown twice.
     *
     * @method refreshApiTokens
     * @private
     */
    function refreshApiTokens() {

        var section = domElement.querySelector('.apiTokens');

        domElement.querySelector('.apiTokenNew').innerHTML = '';
        apiTokenStatus('', null);

        if (!apiTokensAvailable()) {
            section.style.display = 'none';
            return;
        }

        section.style.display = '';

        _serverPost(new URLSearchParams({ a: 'userTokenList' }))
        .then(function(response) {
            if (response.code === 0) {
                renderApiTokens(response.response || []);
            } else {
                apiTokenStatus(apiTokenError(response.code), 'error');
            }
        })
        .catch(function() {
            apiTokenStatus(labels['ErrorGeneric'], 'error');
        });

    }


    /**
     * I render the token list, newest first.
     *
     * @method renderApiTokens
     * @param {Array} tokens  as userTokenList returns them (no hashes)
     * @private
     */
    function renderApiTokens(tokens) {

        var list = domElement.querySelector('.apiTokenList'),
            now  = Date.now() / 1000;

        list.innerHTML = '';

        // Reversed first, so tokens created in the same second (created is in
        // seconds) still come newest first: the server lists them oldest first.
        tokens.slice().reverse().sort(function(a, b) { return (b.created || 0) - (a.created || 0); }).forEach(function(token) {

            var _tw = document.createElement('div');
            _tw.innerHTML = '<div class="userListItem">'
                + '    <div class="userListInfo">'
                + '        <div class="userListName"></div>'
                + '        <div class="userListMeta"></div>'
                + '    </div>'
                + '    <div class="userListActions">'
                + '        <button type="button" class="revokeApiTokenButton" title="'+ labels['UserApiTokenRevoke'] +'"><span class="icon-trash"></span></button>'
                + '    </div>'
                + '</div>';
            var item = _tw.firstElementChild;

            var expired = (token.expires && token.expires <= now);
            if (expired) item.classList.add('inactive');

            // textContent, not interpolation: the label is user-supplied.
            item.querySelector('.userListName').textContent = token.label;
            item.querySelector('.userListMeta').textContent = [
                labels['UserApiTokenCreatedOn'].replace('%s', formatTokenDate(token.created)),
                token.lastUsed ? labels['UserApiTokenLastUsed'].replace('%s', formatTokenDate(token.lastUsed)) : labels['UserApiTokenNeverUsed'],
                expired ? labels['UserApiTokenExpired']
                        : (token.expires ? labels['UserApiTokenExpiresOn'].replace('%s', formatTokenDate(token.expires)) : labels['UserApiTokenNoExpiry'])
            ].join('  ·  ');

            item.querySelector('.revokeApiTokenButton').addEventListener('click', function() {
                revokeApiToken(token);
            });

            list.appendChild(item);

        });

        if (list.children.length === 0) {
            list.insertAdjacentHTML('beforeend', '<div class="message active">'+ labels['UserApiTokenNone'] +'</div>');
        }

    }


    /**
     * I create a token from the name and expiry fields and show its value, the
     * only time it is ever shown.
     *
     * @method createApiToken
     * @private
     */
    function createApiToken() {

        var nameField = domElement.querySelector('.apiTokenName'),
            name      = nameField.value.trim(),
            newArea   = domElement.querySelector('.apiTokenNew');

        if (!name) {
            apiTokenStatus(labels['ErrorApiTokenName'], 'error');
            nameField.focus();
            return;
        }

        _serverPost(new URLSearchParams({
            a:             'userTokenCreate',
            label:         name,
            expiresInDays: domElement.querySelector('.apiTokenExpiry').value
        }))
        .then(function(response) {

            if (response.code !== 0) {
                apiTokenStatus(apiTokenError(response.code), 'error');
                return;
            }

            apiTokenStatus('', null);
            nameField.value = '';

            var _nw = document.createElement('div');
            _nw.innerHTML = '<div>'
                + '    <div class="message active success">'+ labels['UserApiTokenCopyNow'] +'</div>'
                + '    <div class="layoutRow">'
                + '        <div class="column-9"><input type="text" class="apiTokenValue" readonly></div>'
                + '        <div class="column-3"><button type="button" class="apiTokenCopyButton">'+ labels['GenericCopy'] +'</button></div>'
                + '    </div>'
                + '</div>';
            var shown = _nw.firstElementChild,
                field = shown.querySelector('.apiTokenValue');

            field.value = response.response.token;
            field.addEventListener('focus', function() { field.select(); });

            shown.querySelector('.apiTokenCopyButton').addEventListener('click', function() {
                var button = this;
                copyText(field, function() { button.textContent = labels['GenericCopied']; });
            });

            newArea.innerHTML = '';
            newArea.appendChild(shown);
            field.select();

            refreshApiTokenList();

        })
        .catch(function() {
            apiTokenStatus(labels['ErrorGeneric'], 'error');
        });

    }


    /**
     * I reload the list without touching a token value shown above it.
     *
     * @method refreshApiTokenList
     * @private
     */
    function refreshApiTokenList() {

        _serverPost(new URLSearchParams({ a: 'userTokenList' }))
        .then(function(response) {
            if (response.code === 0) renderApiTokens(response.response || []);
        });

    }


    /**
     * I revoke a token after asking. Programs using it lose access with their
     * next request.
     *
     * @method revokeApiToken
     * @param {Object} token
     * @private
     */
    function revokeApiToken(token) {

        // A function, so a "$&" in the user-supplied label stays literal.
        if (!window.confirm(labels['UserApiTokenRevokeConfirm'].replace('%s', function() { return token.label; }))) return;

        _serverPost(new URLSearchParams({ a: 'userTokenRevoke', tokenID: token.id }))
        .then(function(response) {
            // 4: already gone, which is what was asked for.
            if (response.code !== 0 && response.code !== 4) {
                apiTokenStatus(apiTokenError(response.code), 'error');
            } else {
                apiTokenStatus('', null);
            }
            refreshApiTokenList();
        })
        .catch(function() {
            apiTokenStatus(labels['ErrorGeneric'], 'error');
        });

    }


    /**
     * @method apiTokenError
     * @param {Number} code  of userTokenCreate / userTokenList / userTokenRevoke
     * @return {String}
     * @private
     */
    function apiTokenError(code) {

        switch (code) {
            case 1:  return labels['ErrorNotLoggedInAnymore'];
            case 2:  return labels['ErrorApiTokensUnavailable'];
            case 3:  return labels['ErrorApiTokenName'];
            case 5:  return labels['ErrorApiTokenLimit'];
            default: return labels['ErrorGeneric'];
        }

    }


    /**
     * @method apiTokenStatus
     * @param {String} text      empty hides the message
     * @param {String|null} kind 'error', 'success' or null
     * @private
     */
    function apiTokenStatus(text, kind) {

        var status = domElement.querySelector('.apiTokenStatus');

        status.classList.remove('active', 'error', 'success');
        status.textContent = text;
        if (text) status.classList.add('active');
        if (text && kind) status.classList.add(kind);

    }


    /**
     * @method formatTokenDate
     * @param {Number} seconds  Unix time, as users.json keeps it
     * @return {String}
     * @private
     */
    function formatTokenDate(seconds) {

        try {
            return new Date(seconds * 1000).toLocaleDateString(FrameTrail.module('Localization').language);
        } catch (e) {
            return new Date(seconds * 1000).toLocaleDateString();
        }

    }


    /**
     * I copy a field's text to the clipboard.
     *
     * @method copyText
     * @param {HTMLInputElement} field
     * @param {Function} done
     * @private
     */
    function copyText(field, done) {

        field.select();

        if (navigator.clipboard && window.isSecureContext) {
            navigator.clipboard.writeText(field.value).then(done, function() {
                if (document.execCommand('copy')) done();
            });
        } else if (document.execCommand('copy')) {
            done();
        }

    }


    /**
     * I tell admins, in the console and once per page, about server extensions
     * that cannot work: a missing PHP extension, a manifest that does not load.
     *
     * @method reportServerExtensions
     * @param {Array|undefined} list  userCheckLogin's serverExtensions
     * @private
     */
    function reportServerExtensions(list) {

        serverExtensions = Array.isArray(list) ? list : [];

        serverExtensions.forEach(function(ext) {

            var problem = ext.error
                ? ext.error
                : ((ext.missing && ext.missing.length) ? 'needs the PHP extension(s) ' + ext.missing.join(', ') + ', which this server does not have' : null);

            if (!problem || serverExtensionProblems[ext.name] === problem) return;

            serverExtensionProblems[ext.name] = problem;
            console.warn('FrameTrail: server extension "' + ext.name + '": ' + problem + '.');

        });

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
                // Taller where the token section is part of it.
                height: apiTokensAvailable() ? 640 : 340,
                open: function() {
                    updateView(true);
                    getUserColorCollection(function() {
                        renderUserColorCollectionForm(FrameTrail.getState('userColor'),".userColor")
                    });
                    refreshApiTokens();
                },
                close: function() {
                    // A token value shown after creating it must not be there
                    // when the dialog opens again.
                    domElement.querySelector('.apiTokenNew').innerHTML = '';
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

        // The heartbeat is here to renew the PHP session, so it normally lands
        // just before the idle lifetime runs out. A session a platform
        // established also has an absolute deadline that no amount of renewing
        // moves — and landing a whole lifetime after that one would leave
        // somebody looking at an interface that has quietly stopped being able
        // to save. When the server names that deadline, aim just past it.
        var renewAt  = (userSessionLifetime - 30) * 1000,
            expireAt = (userSessionExpiresIn === null)
                        ? Infinity
                        : (userSessionExpiresIn + 2) * 1000,
            timeoutDuration = Math.max(5000, Math.min(renewAt, expireAt));

        userSessionTimeout = setTimeout(function() {
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


    /**
     * Opening another hypervideo clears every timer on the page
     * (HypervideoModel.updateHypervideo): the heartbeat, and the deadline of a
     * renewal on its way, are armed again here — or the session would go
     * unrenewed until the next save, and a renewal would never end.
     *
     * @method rearmTimers
     */
    function rearmTimers() {

        if (FrameTrail.getState('loggedIn') && !isGuestMode && FrameTrail.getState('storageMode') === 'server') {
            resetSessionTimeout();
        }

        if (silentRenewInFlight && armRenewTimeout) {
            armRenewTimeout();
        }

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
        switchAccount:          switchAccount,
        consumeAuthIntent:      consumeAuthIntent,
        rememberIntent:         rememberIntent,
        forgetIntent:           forgetIntent,
        goToExternalLogin:      goToExternalLogin,
        silentRenew:            silentRenew,
        rearmTimers:            rearmTimers,
        logout:                 logout,

        /**
         * The account whose work is open here — the last one signed in with a
         * server session, also after that session ended ('' for none, and for
         * guests, whose userID it is). An export takes its annotations.
         */
        workingAs:              function() { return workingAs; },
        workingAsName:          function() { return workingAsName; },
        isGuestMode:            function() { return isGuestMode; },
        isForceLogin:           function() { return forceLoginRequired; },

        /**
         * The platform's public description of itself, or null when this
         * instance authenticates locally. Consumers use its presence to decide
         * whether an affordance belongs to FrameTrail or to the platform.
         */
        externalAuth:           function() { return externalAuth; },

        /**
         * The platform's public description of who owns this instance's
         * settings ({ providerId, label, manageUrl }), or null when the
         * instance manages them itself. While it is set, the settings dialog
         * does not open and its button is not drawn.
         */
        externalSettings:       function() { return externalSettings; },

        /**
         * For admins: the server parts of the enabled extensions as the
         * server reports them ([{ name, actions, routes, missing, error }]),
         * an empty list for everyone else.
         */
        serverExtensions:       function() { return serverExtensions; },

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
