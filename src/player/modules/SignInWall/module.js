/**
 * @module Player
 */


/**
 * I am the SignInWall module.
 *
 * I am what a project says for itself before it can say anything else.
 *
 * A project that defers sign-in to a platform used to answer an anonymous
 * visitor by becoming a different website: type a project address, land on
 * linkedvideo.local/manage/login, with nothing naming the project you asked
 * for and no way back to it. That reads as a broken link at best and as a
 * phishing hop at worst, and it is the same gesture either way — the visitor
 * never chose to go anywhere.
 *
 * So the asking happens here, on the address the visitor typed, and the
 * navigation happens when somebody picks it. The wall is deliberately the
 * second thing tried, not the first: PlayerLauncher asks the platform quietly
 * in a frame before drawing any of this, so anybody who still has a session
 * next door never sees it at all.
 *
 * What it may say is limited by what a project will tell a stranger. On a
 * private instance config.json is gated, so the project's *name* is not
 * available and should not be — it would tell anyone who guesses a subdomain
 * what is behind it. The hostname is not a secret (the visitor typed it) and
 * the platform's label rides along on userCheckLogin, ungated. Those two are
 * enough to say where you are and whose sign-in this is.
 *
 * @class SignInWall
 * @static
 */


FrameTrail.defineModule('SignInWall', function(FrameTrail){


    var labels = FrameTrail.module('Localization').labels,

        wallElement = null,

        // The wall is the only thing on screen when it is up, so it owns the
        // question of whether anything else may draw. PlayerLauncher asks.
        isVisible = false;


    /**
     * I build the wall for one of the three reasons it exists.
     *
     * @method render
     * @param {String} variant  'private' | 'signin' | 'denied' | 'signedout'
     * @param {Object} options
     * @private
     */
    function render(variant, options) {

        var UserManagement = FrameTrail.module('UserManagement'),
            externalAuth   = UserManagement ? UserManagement.externalAuth() : null,
            platform       = (externalAuth && externalAuth.label) ? externalAuth.label : '',
            host           = window.location.host,
            title          = '',
            text           = '',
            actions        = [];

        if (variant === 'denied') {

            title = labels['SignInWallDeniedTitle'];
            // Says that the account is wrong without saying which account it
            // is. Nothing about the signed-in person crosses the domain
            // boundary to get here, so there is nothing to leak and nothing a
            // crafted URL could put on a page wearing this project's styling.
            text  = labels['SignInWallDeniedText'].replace('%s', platform);

            actions.push({
                label: labels['UserUseDifferentAccount'],
                primary: true,
                action: function() {
                    // Not logout(): that ends both sessions and gives this
                    // page back, which is right for leaving and wrong here.
                    // Pressing this button has already said the account is
                    // wrong, so it goes all the way — out of both sessions,
                    // on to the sign-in form, and back into this project as
                    // whoever signs in there.
                    UserManagement.switchAccount();
                }
            });

            // There used to be a second button out to the platform. It pointed
            // at this project's page over there — which is precisely the page
            // an account without access cannot open, so it answered a dead end
            // with a 404. Switching account is the only thing that helps here,
            // so it is the only thing offered.

        } else {

            title = labels['SignInWallPrivateTitle'];

            // Two different situations, and saying the wrong one is worse than
            // saying nothing. A private project cannot be looked at without an
            // account, and says so. A public one is perfectly visible — signing
            // in is only needed for whatever was just clicked — and telling
            // somebody it is private would be a plain falsehood about a page
            // they can see behind this box.
            text = (variant === 'private')
                    ? labels['SignInWallPrivateText'].replace('%s', platform)
                    : labels['SignInWallSignInText'].replace('%s', platform);

            actions.push({
                label: labels['UserLoginWithProvider'].replace('%s', platform),
                primary: true,
                action: function() {
                    UserManagement.goToExternalLogin();
                }
            });

        }

        // A private project has nothing behind this box, so there is nothing to
        // go back to and no cancel to offer. Anywhere else the box is covering
        // something the person was already allowed to watch, and it has to be
        // able to give it back — including on the wrong-account screen, where
        // somebody may simply want to carry on watching as a visitor.
        if (variant !== 'private' && !options.disallowCancel) {
            actions.push({
                label: labels['GenericCancel'],
                action: function() {
                    hide();
                    if (typeof options.onCancel === 'function') {
                        options.onCancel();
                    }
                }
            });
        }

        // The same overlay the login box uses, for the same reason: it is the
        // one thing on screen and the page behind it must not be reachable.
        // Reused rather than restyled — this needs no stylesheet of its own.
        var wrapper = document.createElement('div');
        wrapper.className = 'signInWall ui-blocking-overlay';

        var box = document.createElement('div');
        box.className = 'ui-overlay-box';

        var titleEl = document.createElement('div');
        titleEl.className = 'boxTitle';
        titleEl.textContent = title;
        box.appendChild(titleEl);

        // The address the visitor typed, shown back to them. The one piece of
        // context that costs nothing to give and answers "am I in the right
        // place?" before anything else does.
        var hostEl = document.createElement('div');
        hostEl.className = 'guestEditHint';
        hostEl.textContent = host;
        box.appendChild(hostEl);

        if (variant === 'signedout') {
            var noticeEl = document.createElement('div');
            noticeEl.className = 'message success active';
            noticeEl.textContent = labels['SignInWallSignedOut'];
            box.appendChild(noticeEl);
        }

        var textEl = document.createElement('div');
        textEl.className = 'guestEditHint';
        textEl.textContent = text;
        box.appendChild(textEl);

        var buttonRow = document.createElement('div');

        actions.forEach(function(entry) {
            var button = document.createElement('button');
            button.type = 'button';
            button.className = entry.primary ? 'primary' : '';
            button.textContent = entry.label;
            button.addEventListener('click', entry.action);
            buttonRow.appendChild(button);
        });

        box.appendChild(buttonRow);
        wrapper.appendChild(box);

        return wrapper;

    }


    /**
     * I put the wall on screen.
     *
     * @method show
     * @param {String} variant  'private' | 'signin' | 'denied' | 'signedout'
     * @param {Object} options (optional)  disallowCancel, onCancel
     */
    function show(variant, options) {

        hide();

        wallElement = render(variant, options || {});

        document.querySelector(FrameTrail.getState('target')).appendChild(wallElement);
        isVisible = true;

        // Nothing is loading any more, and a spinner underneath a question
        // nobody has answered yet only says the page is broken.
        var modal = FrameTrail.module('InterfaceModal');
        if (modal) {
            modal.hideLoadingScreen();
            modal.hideMessage();
        }

    }


    /**
     * I take the wall down.
     *
     * @method hide
     */
    function hide() {

        if (wallElement && wallElement.parentNode) {
            wallElement.parentNode.removeChild(wallElement);
        }

        wallElement = null;
        isVisible = false;

    }


    return {

        show: show,
        hide: hide,

        /**
         * @attribute isVisible
         * @type {Boolean}
         */
        get isVisible() { return isVisible; }

    };

});
