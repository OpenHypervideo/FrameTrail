/**
 * @module Player
 */

/**
 * I am the PlayerLauncher.
 * I am the entry point to the application and i am called from __index.html__ with
 *
 *     $(document).ready( function() {
 *
 *          FrameTrail.start('PlayerLauncher', {
 *              // initial global state
 *          });
 *
 *      } );
 *
 * I initialize all main modules, and then start their init process in the right order.
 * When I am finished, the Application is either up and running, or displays a meaningful
 * error message, why loading has failed.
 * I am a "one-pass" module, this is: I don't export any public methods or properties, and
 * my sole purpose is to start other modules, after which I am discarded.
 *
 * @class PlayerLauncher
 * @static
 * @main
 */

 FrameTrail.defineModule('PlayerLauncher', function(FrameTrail){

    // Set up Localization
    FrameTrail.initModule('Localization');
    var labels = FrameTrail.module('Localization').labels;

    // Set up Overlay interface
    FrameTrail.initModule('InterfaceModal');
    FrameTrail.module('InterfaceModal').showStatusMessage(labels['MessageStateLoadingData']);
    FrameTrail.module('InterfaceModal').showLoadingScreen();

    // Set up the various data models
    FrameTrail.initModule('RouteNavigation');
    FrameTrail.initModule('UserManagement');
    FrameTrail.initModule('Database');
    FrameTrail.initModule('TagModel');
    FrameTrail.initModule('ResourceManager');
    FrameTrail.initModule('HypervideoModel');

    // Set up the interface
    FrameTrail.initModule('Interface');

    // Set up the controller
    if (FrameTrail.module('RouteNavigation').hypervideoID) {
        FrameTrail.initModule('HypervideoController');
    }

    // Set up User Traces
    FrameTrail.initModule('UserTraces');


    // start the actual init process

    if (FrameTrail.module('RouteNavigation').hypervideoID) {

        FrameTrail.module('Database').loadData(

            function () {

                FrameTrail.module('UserTraces').initTraces();

                if (FrameTrail.module('Database').config.alwaysForceLogin) {
                    FrameTrail.module('InterfaceModal').hideMessage();
                    FrameTrail.module('UserManagement').ensureAuthenticated(function() {
                        initHypervideo();
                    }, function() {}, true);
                } else {
                    initHypervideo();
                }

                function initHypervideo() {

                    FrameTrail.module('TagModel').initTagModel(

                        function () {

                            FrameTrail.module('InterfaceModal').setLoadingTitle(FrameTrail.module('Database').hypervideo.name);

                            FrameTrail.module('HypervideoModel').initModel(function(){

                                FrameTrail.module('Interface').create(function(){

                                    FrameTrail.module('InterfaceModal').hideLoadingScreen();

                                    FrameTrail.module('HypervideoController').initController(

                                        function(){

                                            // Finished
                                            FrameTrail.module('InterfaceModal').hideMessage();

                                            $(FrameTrail.getState('target')).find('.hypervideo video.video').removeClass('nocolor dark');

                                        },

                                        function(errorMsg){

                                            // Fail: Init thread was aborted with:
                                            FrameTrail.module('InterfaceModal').showErrorMessage(errorMsg);

                                        }

                                    );

                                });


                            });


                        },

                        function () {
                            FrameTrail.module('InterfaceModal').showErrorMessage(labels['ErrorCouldNotInitTagModel']);
                        }

                    );

                }

            },

            function(errorMsg){

                // Fail: Init was aborted with:
                FrameTrail.module('InterfaceModal').showErrorMessage(errorMsg);

            }

        );

    } else {

        FrameTrail.changeState('viewMode', 'overview');

        FrameTrail.module('Database').loadData(

            function(){

                FrameTrail.module('UserTraces').initTraces();

                if (FrameTrail.module('Database').config.alwaysForceLogin) {
                    FrameTrail.module('InterfaceModal').hideMessage();
                    FrameTrail.module('UserManagement').ensureAuthenticated(function() {
                        initOverview();
                    }, function() {}, true);
                } else {
                    initOverview();
                }

                function initOverview() {

                    FrameTrail.module('InterfaceModal').setLoadingTitle('Overview');

                    FrameTrail.module('Interface').create(function(){

                        // Finished
                        FrameTrail.module('InterfaceModal').hideMessage();
                        FrameTrail.module('InterfaceModal').hideLoadingScreen();

                    });

                }

            },

            function(errorMsg){

                // Fail: Init was aborted with:
                FrameTrail.module('InterfaceModal').showErrorMessage(errorMsg);

            }

        );

    }



    return null;

});
