/**
 * @module Player
 */


/**
 * I am the type definition of a single Subtitle.
 *
 * Subtitles display in a separate layer on top of the video.
 *
 * Subtitles are managed by the {{#crossLink "SubtitlesController"}}SubtitlesController{{/crossLink}}.
 *
 * @class Subtitle
 * @category TypeDefinition
 */



FrameTrail.defineType(

    'Subtitle',

    function (FrameTrail) {
        return {
            constructor: function(data){

                this.data = data;

                this.subtitleElement = document.createElement('div');
                this.subtitleElement.className = 'subtitleElement';

            },
            prototype: {
                /**
                 * I hold the data object of a single Subtitle, which is stored in the {{#crossLink "Database"}}Database{{/crossLink}}.
                 * @attribute data
                 * @type {}
                 */
                data:                   {},

                /**
                 * I store my state, wether I am "active" (visible) or not active (invisible).
                 * @attribute activeState
                 * @type Boolean
                 */
                activeState:            false,

                /**
                 * I hold the subtitleElement (a jquery-enabled HTMLElement), which indicates my start and end time.
                 * @attribute subtitleElement
                 * @type HTMLElement
                 */
                subtitleElement:        null,

                /**
                 * I render my DOM elements ({{#crossLink "Overlay/timelineElement:attribute"}}Overlay/timelineElement{{/crossLink}}
                 * and {{#crossLink "Overlay/overlayElement:attribute"}}Overlay/overlayElement{{/crossLink}}) into the DOM.
                 *
                 * I am called, when the Overlay is initialized. My counterpart ist {{#crossLink "Overlay/removeFromDOM:method"}}Overlay/removeFromDOM{{/crossLink}}.
                 *
                 * @method renderInDOM
                 */
                renderInDOM: function () {


                    var ViewVideo = FrameTrail.module('ViewVideo');

                    ViewVideo.CaptionContainer.appendChild(this.subtitleElement);

                    this.renderText();

                },

                /**
                 * I show my cue text: its markup as elements (vtt.js makes only those WebVTT allows, so nothing in a cue runs), and the speaker of a voice tag in front.
                 *
                 * @method renderText
                 */
                renderText: function () {

                    var voice = window.FrameTrailWebVTT.speakerOf(this.data.text),
                        tree  = window.WebVTT.convertCueToDOMTree(window, voice.text);

                    this.subtitleElement.innerHTML = '';

                    if (voice.speaker) {
                        var speakerElement = document.createElement('span');
                        speakerElement.className = 'subtitleSpeaker';
                        speakerElement.textContent = voice.speaker + ': ';
                        this.subtitleElement.appendChild(speakerElement);
                    }

                    if (tree) {
                        while (tree.firstChild) {
                            this.subtitleElement.appendChild(tree.firstChild);
                        }
                    }

                },

                /**
                 * I change my cue text (the transcripts editor, while a cue is being typed) and show it.
                 *
                 * @method setText
                 * @param {String} text cue text, as stored
                 */
                setText: function (text) {

                    this.data.text = text;
                    this.renderText();

                },

                /**
                 * I remove my DOM element ({{#crossLink "Subtitle/subtitleElement:attribute"}}Subtitle/subtitleElement{{/crossLink}} from the DOM.
                 *
                 * I am called when the single Subtitle is to be deleted.
                 *
                 * @method removeFromDOM
                 */
                removeFromDOM: function () {

                    this.subtitleElement.remove();

                },


                /**
                 * When I am scheduled to be displayed, this is the method to be called.
                 * @method setActive
                 */
                setActive: function () {

                    this.subtitleElement.classList.add('active');
                    this.activeState = true;

                },

                /**
                 * When I am scheduled to disappear, this is the method to be called.
                 * @method setInactive
                 */
                setInactive: function () {

                    this.subtitleElement.classList.remove('active');
                    this.activeState = false;

                }



            }


        }
    }


);
