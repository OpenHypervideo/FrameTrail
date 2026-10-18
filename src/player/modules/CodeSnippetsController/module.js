/**
 * @module Player
 */


/**
 * I am the CodeSnippetsController. I run the {{#crossLink "CodeSnippet"}}codeSnippets{{/crossLink}}
 * of the current {{#crossLink "HypervideoModel"}}HypervideoModel{{/crossLink}} when playback reaches them,
 * and I apply the hypervideo's own CSS.
 *
 * Neither has an editor: code snippets run when they are written into hypervideo.json, and the
 * hypervideo's own CSS is deprecated (the instance's custom.css is the place for CSS), but both
 * still work.
 *
 * @class CodeSnippetsController
 * @static
 */



FrameTrail.defineModule('CodeSnippetsController', function(FrameTrail){

    var codeSnippets = FrameTrail.module('HypervideoModel').codeSnippets;


    /**
     * I compile all codeSnippets in the
     * {{#crossLink "HypervideoModel/codeSnippets:attribute"}}HypervideoModel/codeSnippets attribute{{/crossLink}}
     * and apply the hypervideo's own CSS.
     * @method initController
     */
    function initController() {

        var hypervideoModel = FrameTrail.module('HypervideoModel');

        for (var i = 0; i < hypervideoModel.codeSnippets.length; i++) {

            hypervideoModel.codeSnippets[i].initCodeSnippetFunction();

        }

        initCustomCSS(hypervideoModel.customCSS);

    };


    /**
     * I am a central method of the CodeSnippetsController.
     * I am called from the update functions inside the HypervideoController
     * and I set the activeState of the codeSnippets according to the current time.
     *
     * @method updateStatesOfCodeSnippets
     * @param {Number} currentTime
     */
    function updateStatesOfCodeSnippets(currentTime) {

        var codeSnippet;

        for (var idx in codeSnippets) {

            codeSnippet = codeSnippets[idx];

            if (    codeSnippet.data.start <= currentTime
                 && codeSnippet.data.start+2 >= currentTime) {

                if (!codeSnippet.activeState) {

                    codeSnippet.setActive();

                }

            } else {

                if (codeSnippet.activeState) {

                    codeSnippet.setInactive();

                }

            }

        }

    };


    /**
     * I apply the hypervideo's own CSS rules, in one style element: a hypervideo
     * loaded after another one replaces its rules.
     *
     * @method initCustomCSS
     * @param {String} cssString
     */
    function initCustomCSS(cssString) {

        var styleElement = document.head.querySelector('style.FrameTrailCustomCSS');

        if (!styleElement) {
            styleElement = document.createElement('style');
            styleElement.className = 'FrameTrailCustomCSS';
            document.head.appendChild(styleElement);
        }

        styleElement.textContent = cssString || '';

    };


    return {

        initController:             initController,
        updateStatesOfCodeSnippets: updateStatesOfCodeSnippets

    };

});
