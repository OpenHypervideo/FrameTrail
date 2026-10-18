/**
 * @module Player
 */


/**
 * I am the type definition of a CodeSnippet.
 *
 * A code snippet is a short piece of code which is executed at a certain point of time.
 * FrameTrail has no editor for code snippets: they run when they are written into hypervideo.json.
 *
 * CodeSnippets are managed by the {{#crossLink "CodeSnippetsController"}}CodeSnippetsController{{/crossLink}}.
 *
 * @class CodeSnippet
 * @category TypeDefinition
 */



FrameTrail.defineType(

    'CodeSnippet',

    function (FrameTrail) {
        return {
            constructor: function(data){

                this.labels = FrameTrail.module('Localization').labels;

                this.data = data;

                this.codeSnippetFunction = new Function('');


            },
            prototype: {

                /**
                 * I hold the data object of a CodeSnippet, which is stored in the {{#crossLink "Database"}}Database{{/crossLink}} and saved in the hypervideo's hypervideo.json file.
                 * @attribute data
                 * @type {}
                 */
                data:                   {},

                /**
                 * I hold the codeSnippetFunction, which will be executed at a certain point of time.
                 * @attribute codeSnippetFunction
                 * @type Function
                 */
                codeSnippetFunction:    null,

                /**
                 * I store my state, wether I am "active" (this is, when my code has been run and my time has not passed yet) or not.
                 * @attribute activeState
                 * @type Boolean
                 */
                activeState:            false,


                /**
                 * I init my ({{#crossLink "CodeSnippet/codeSnippetFunction:attribute"}}this.codeSnippetFunction{{/crossLink}}
                 *
                 * I am called when the CodeSnippet is initialized.
                 *
                 * @method initCodeSnippetFunction
                 */
                initCodeSnippetFunction: function () {

                    try {
                        this.codeSnippetFunction = new Function('FrameTrail', 'hypervideo', this.data.snippet);
                    } catch (exception) {
                        // could not parse and compile JS code!
                        console.warn(this.labels['MessageCodeContainsErrors'] +': '+ exception.message);
                    }

                },


                /**
                 * When I am scheduled to be executed, this is the method to be called.
                 * @method setActive
                 */
                setActive: function () {

                    this.activeState = true;

                    try {
                        this.codeSnippetFunction(FrameTrail, FrameTrail.module('HypervideoController'));
                    } catch (exception) {
                        // do some user error feedback (ex.message)
                        console.warn(this.labels['MessageCodeContainsErrors'] +': '+ exception.message);
                    }

                },

                /**
                 * When I am scheduled to disappear, this is the method to be called.
                 * @method setInactive
                 */
                setInactive: function () {

                    this.activeState = false;

                }

            }


        }
    }

);
