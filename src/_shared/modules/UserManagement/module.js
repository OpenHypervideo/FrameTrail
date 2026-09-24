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
        // lands in the middle of one does not start a second.
        silentRenewInFlight     = false,
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

        var background = !!(options && options.background);

        isLoggedIn(function(loginStatus) {

            if (loginStatus) {

                callback.call();
                return;

            }

            // Ask the platform without moving the page. Free when there is
            // nothing to ask — silentRenew() answers false immediately unless
            // this instance defers to a platform that offered a renewUrl.
            silentRenew(function(renewed, identityChanged, reason) {

                if (renewed) {
                    callback.call();
                    return;
                }

                // Signed in as somebody else next door. Never silently, even
                // for a timer: the next save would be attributed to a person
                // who did not do the work.
                if (identityChanged) {
                    if (!background) {
                        showAccountChangedDialog(!!FrameTrail.getState('unsavedChanges'));
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

                if (externalAuth && externalAuth.mode === 'transparent') {

                    // Identity is the platform's to give, so there is nothing
                    // to ask here — but leaving is still a decision, and it is
                    // only ours to make when nothing would be lost by it.
                    if (FrameTrail.getState('editMode') && FrameTrail.getState('unsavedChanges')) {
                        showSessionEndedDialog(true);
                        if (callbackCancel) callbackCancel.call();
                        return;
                    }

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
            externalSettings = response.externalSettings || null;

            switch(response.code){

                // "You have no session" — which is the ordinary answer for every
                // visitor who has not signed in, not something they asked for.
                // It must stay silent: a logout that announces itself, or that
                // follows the provider's logoutUrl, would bounce an anonymous
                // visitor off the page before it ever finished loading.
                case 0:
                    // Everything the decision below needs has to be read first:
                    // resetLocalSession() clears loggedIn and editMode.
                    var endedUnderUs   = FrameTrail.getState('loggedIn') && !isGuestMode,
                        wasEditing     = !!FrameTrail.getState('editMode'),
                        hadUnsavedWork = !!FrameTrail.getState('unsavedChanges');

                    // Not logout(): there is nothing to tell the server, which
                    // has just finished saying there is no session. Posting
                    // userLogout here would be a request racing the silent
                    // re-auth below — and it would win often enough to matter,
                    // destroying the session the frame had just established.
                    resetLocalSession();

                    // A session that was here a moment ago and is not any more
                    // is not the ordinary anonymous case above — somebody
                    // signed out on the platform, signed in as somebody else,
                    // or the bound ran out. Worth doing something about, and
                    // worth announcing; an anonymous visitor's page load is not.
                    if (endedUnderUs) {

                        FrameTrail.triggerEvent('userAction', {
                            action: 'UserLogout'
                        });

                        if (externalAuth) {
                            handleSessionEnded(wasEditing, hadUnsavedWork);
                        }

                    }

                    callback.call(window, false);
                    break;

                case 1:
                    userSessionLifetime = parseInt(response.session_lifetime);
                    userSessionExpiresIn = (typeof response.session_expires_in === 'number')
                                            ? response.session_expires_in
                                            : null;
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

        window.location.href = FrameTrail.module('RouteNavigation')
                                         .resolveServerURL('sso.php')
                             + '?a=logout'
                             + (then === 'login' ? '&then=login' : '');

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
     * I decide what to do about a session that ended without anyone asking.
     *
     * Three ways this happens, and they are indistinguishable from here: the
     * platform session was signed out, somebody signed in over there as a
     * different person, or the absolute bound ran out. All three mean the same
     * thing — the platform is no longer standing behind this session.
     *
     * Try to fix it invisibly first. If the platform still knows this browser,
     * a frame can fetch a new session without the page moving, and nothing
     * about the next few seconds is ever noticed. Only when that fails does
     * anybody need to be told, and what to tell them depends on what they would
     * lose by being sent away.
     *
     * @method handleSessionEnded
     * @param {Boolean} wasEditing      whether edit mode was open when it ended
     * @param {Boolean} hadUnsavedWork  whether there were changes worth keeping
     * @private
     */
    function handleSessionEnded(wasEditing, hadUnsavedWork) {

        silentRenew(function(renewed, identityChanged) {

            if (identityChanged) {
                showAccountChangedDialog(hadUnsavedWork);
                return;
            }

            if (renewed) {
                // The good case, and the reason the frame exists: the page is
                // where it was, the work is where it was, and the only trace is
                // a request in the network panel.
                return;
            }

            if (wasEditing) {
                showSessionEndedDialog(hadUnsavedWork);
                return;
            }

            if (isPrivateInstance()) {
                // Nothing on this page is readable without a session anyway, so
                // there is nothing to preserve by staying.
                goToExternalLogin();
                return;
            }

            // A public instance simply has an anonymous visitor again, which is
            // a perfectly good state to be in. Say so, because an avatar
            // vanishing without explanation is a small mystery, and leave it:
            // the next thing that needs a session routes through
            // ensureAuthenticated() and heals this without any help from here.
            var modal = FrameTrail.module('InterfaceModal');

            if (modal) {
                modal.showStatusMessage(labels['MessageSessionEnded']);
                modal.hideMessage(5000);
            }

        });

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
     * Strictly a fast path. Every caller must be able to carry on when this
     * answers false, because it will: a platform that has genuinely signed out
     * answers false by design, and that is the common case rather than the
     * exception.
     *
     * @method silentRenew
     * @param {Function} done  called with true only if there is a session again
     * @private
     */
    function silentRenew(done) {

        if (silentRenewInFlight
            || FrameTrail.getState('storageMode') !== 'server'
            || !externalAuth
            || !externalAuth.renewUrl) {
            done(false);
            return;
        }

        silentRenewInFlight = true;

        var frame    = document.createElement('iframe'),
            timer    = null,
            finished = false,
            // Who this session belonged to before the frame went out. A renew
            // is only a continuation if it comes back as the same person.
            previousUserID = userID;

        function finish(renewed, identityChanged, reason) {

            if (finished) return;
            finished = true;

            window.clearTimeout(timer);
            window.removeEventListener('message', onMessage);

            if (frame.parentNode) {
                frame.parentNode.removeChild(frame);
            }

            silentRenewInFlight = false;
            done(renewed, !!identityChanged, reason || null);

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
                finish(false, false, event.data.reason);
                return;
            }

            // Never take the frame's word for it. The worst way for this to
            // fail is to look like it worked and be discovered at save time, so
            // the session is confirmed from the server before anyone relies on
            // it — and isLoggedIn() also puts the interface back together.
            isLoggedIn(function(loggedIn) {

                if (!loggedIn) {
                    finish(false);
                    return;
                }

                // A session, but somebody else's: signed in as a different
                // person at the platform since this one started. Emphatically
                // not a continuation — carrying on would write whatever is
                // unsaved here into the new person's annotation file under
                // their name. Report failure, and let the caller decide what to
                // say; the work stays in memory either way.
                if (previousUserID !== '' && userID !== previousUserID) {
                    finish(false, true);
                    return;
                }

                finish(true);

            });

        }

        window.addEventListener('message', onMessage);

        // Ten seconds is long enough for two redirects and a token exchange on
        // a bad connection, and short enough that a frame which will never
        // answer — the wrong domain, a platform that is down — does not leave
        // somebody staring at an interface that has quietly stopped saving.
        timer = window.setTimeout(function() {
            finish(false);
        }, 10000);

        frame.setAttribute('aria-hidden', 'true');
        frame.style.display = 'none';
        frame.src = externalAuth.renewUrl;

        document.body.appendChild(frame);

    }


    /**
     * I tell somebody who was editing that their session is over.
     *
     * A dialog rather than the redirect the other cases get, because
     * goToExternalLogin() is a whole page load and would take unsaved work with
     * it. Edit mode has already closed by the time this runs — resetLocalSession()
     * saw to that, and it is honest: there is no session to edit against. But
     * the in-memory model is untouched, so the export below still has
     * everything, and it is the one way to get work out of a tab that can no
     * longer save.
     *
     * @method showSessionEndedDialog
     * @param {Boolean} hadUnsavedWork
     * @private
     */
    function showSessionEndedDialog(hadUnsavedWork) {

        var label   = externalAuth ? externalAuth.label : '',
            wrapper = document.createElement('div'),
            buttons = {};

        wrapper.className = 'sessionEndedDialog';
        wrapper.innerHTML = '<div class="message active">'
            + labels['UserSessionEndedText'].replace('%s', label)
            + (hadUnsavedWork ? ' ' + labels['UserSessionEndedUnsavedWarning'] : '')
            + '</div>';

        if (hadUnsavedWork) {
            buttons[labels['GenericExport']] = function() {
                dialogCtrl.close();
                FrameTrail.module('HypervideoModel').saveAs();
            };
        }

        buttons[labels['UserSignInAgain']] = function() {
            dialogCtrl.close();
            goToExternalLogin();
        };

        buttons[labels['GenericNotNow']] = function() {
            dialogCtrl.close();
        };

        var dialogCtrl = Dialog({
            resizable: false,
            modal: true,
            title: labels['UserSessionEndedTitle'],
            content: wrapper,
            close: function() {
                dialogCtrl.destroy();
            },
            buttons: buttons
        });

    }


    /**
     * I say that the person at the platform is no longer the person who was
     * working here.
     *
     * Distinct from the session simply ending, and worth its own words: there
     * *is* a valid session next door, it just belongs to somebody else. Taking
     * it would be the easy thing and the wrong one — whatever is unsaved on
     * this page was authored by the previous account, and saving it now would
     * file it under the new one's name, in the new one's annotation file.
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

        var label   = externalAuth ? externalAuth.label : '',
            wrapper = document.createElement('div'),
            buttons = {};

        wrapper.className = 'sessionEndedDialog';
        wrapper.innerHTML = '<div class="message active">'
            + labels['UserAccountChangedText'].replace('%s', label)
            + (hadUnsavedWork ? ' ' + labels['UserSessionEndedUnsavedWarning'] : '')
            + '</div>';

        if (hadUnsavedWork) {
            buttons[labels['GenericExport']] = function() {
                dialogCtrl.close();
                FrameTrail.module('HypervideoModel').saveAs();
            };
        }

        buttons[labels['UserContinueAsNewAccount']] = function() {
            dialogCtrl.close();
            window.location.reload();
        };

        buttons[labels['GenericNotNow']] = function() {
            dialogCtrl.close();
        };

        var dialogCtrl = Dialog({
            resizable: false,
            modal: true,
            title: labels['UserAccountChangedTitle'],
            content: wrapper,
            close: function() {
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
         * The platform's public description of who owns this instance's
         * settings ({ providerId, label, manageUrl }), or null when the
         * instance manages them itself. While it is set, the settings dialog
         * does not open and its button is not drawn.
         */
        externalSettings:       function() { return externalSettings; },

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
