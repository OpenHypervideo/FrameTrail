/**
 * @module Player
 */


/**
 * I am the InterfaceModal module.
 *
 * I provide the most basic UI:
 * * display status messages
 * * display loading indicators
 * * display user dialogs
 *
 * @class InterfaceModal
 * @static
 */


FrameTrail.defineModule('InterfaceModal', function(FrameTrail){


    var _lsWrapper = document.createElement('div');
    _lsWrapper.innerHTML = '<div class="loadingScreen">'
                        + '    <div class="loadingTitle"></div>'
                        + '    <div class="workingSpinner"></div>'
                        + '</div>';
    var loadingScreen = _lsWrapper.firstElementChild;
    var statusMessage = document.createElement('div');
    statusMessage.className = 'statusMessage message';

    var targetEl = document.querySelector(FrameTrail.getState('target'));
    targetEl.append(loadingScreen);
    targetEl.append(statusMessage);

    // Show immediately so no app content is visible before the loading screen covers it.
    // showLoadingScreen() still works correctly for subsequent calls (after hideLoadingScreen() hides it).
    loadingScreen.style.display = 'block';
    loadingScreen.classList.add('active');



    /**
     * I show a status message.
     * @method showStatusMessage
     * @param {String} msg
     */
    function showStatusMessage(msg){
        statusMessage.textContent = msg;
        statusMessage.classList.add('active');
        statusMessage.classList.remove('error', 'success');
    }

    /**
     * I show a error message.
     * @method showErrorMessage
     * @param {String} msg
     */
    function showErrorMessage(msg){
        statusMessage.textContent = msg;
        statusMessage.classList.add('active', 'error');
        statusMessage.classList.remove('success');
    }

    /**
     * I show a success message.
     * @method showSuccessMessage
     * @param {String} msg
     */
    function showSuccessMessage(msg){
        statusMessage.textContent = msg;
        statusMessage.classList.add('active', 'success');
        statusMessage.classList.remove('error');
    }


    /**
     * I hide all messages. I do this immediatly, unless a delay is set, in which case I remove the messages after the delay in milliseconds.
     * @method hideMessage
     * @param {Number} delay (optional)
     */
    function hideMessage(delay){

        if (typeof delay === 'number') {

            window.setTimeout(function() {
                statusMessage.textContent = '';
                statusMessage.classList.remove('active');
            }, delay);

        } else {

            statusMessage.textContent = '';
            statusMessage.classList.remove('active');

        }

    }

    /**
     * I show the loading screen.
     * @method showLoadingScreen
     */
    function showLoadingScreen() {

        loadingScreen.style.display = 'block';
        var anim = loadingScreen.animate(
            [{ opacity: '0' }, { opacity: '1' }],
            { duration: 300, easing: 'ease-in-out', fill: 'forwards' }
        );
        anim.finished.then(function() {
            anim.cancel();
            loadingScreen.classList.add('active');
        });

    }

    /**
     * I hide the loading screen.
     * @method hideLoadingScreen
     */
    function hideLoadingScreen() {

        var loadingTitle = loadingScreen.querySelector('.loadingTitle');

        // Animate loadingTitle: delay 1000ms, duration 600ms
        setTimeout(function() {
            var anim = loadingTitle.animate(
                [{ top: '20px', fontSize: '10px' }],
                { duration: 600, easing: 'ease', fill: 'forwards' }
            );
            anim.finished.then(function() {
                anim.cancel();
                loadingTitle.style.top = '';
                loadingTitle.style.fontSize = '';
            });
        }, 1000);

        // Animate loadingScreen: delay 1300ms, duration 400ms
        setTimeout(function() {
            var anim = loadingScreen.animate(
                [{ top: '-100%', backgroundColor: 'rgba(47, 50, 58, 0)' }],
                { duration: 400, easing: 'ease', fill: 'forwards' }
            );
            anim.finished.then(function() {
                anim.cancel();
                loadingScreen.style.display = 'none';
                loadingScreen.classList.remove('active');
                loadingScreen.style.top = '';
                loadingScreen.style.backgroundColor = '';
            });
        }, 1300);

    }

    /**
     * I set the loading screen title.
     * @method setLoadingTitle
     * @param {String} title
     */
    function setLoadingTitle(title) {

        loadingScreen.querySelector('.loadingTitle').textContent = title;

    }

    return {

        showStatusMessage: showStatusMessage,
        showErrorMessage: showErrorMessage,
        showSuccessMessage: showSuccessMessage,
        hideMessage: hideMessage,
        showLoadingScreen: showLoadingScreen,
        hideLoadingScreen: hideLoadingScreen,
        setLoadingTitle: setLoadingTitle

    };

});
