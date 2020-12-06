/**
 * @module Player
 */


/**
 * I am the Titlebar. I provide a place for a title text, and for two buttons (opening the
 * {{#crossLink "Sidebar"}}Sidebar{{/crossLink}} and – YET TO IMPLEMENT – the social sharing widgets).
 *
 * @class Titlebar
 * @static
 */



FrameTrail.defineModule('Titlebar', function(FrameTrail){

    var labels = FrameTrail.module('Localization').labels;

    var domElement = $(   '<div class="titlebar">'
                            + '  <div class="titlebarViewMode">'
                            + '      <button data-viewmode="overview" data-tooltip-bottom-left="'+ labels['GenericOverview'] +'"><span class="icon-overview"></span></button>'
                            + '      <button data-viewmode="video"><span class="icon-hypervideo"></span></button>'
                            + '  </div>'
                            + '  <div class="titlebarTitle"></div>'
                            + '  <div class="titlebarActionButtonContainer">'
                            + '      <button class="manageResourcesButton resourceManagerIcon" data-tooltip-bottom-right="'+ labels['ResourcesManage'] +'"><span class="icon-folder-open"></span></button>'
                            + '      <button class="startEditButton" data-tooltip-bottom-right="'+ labels['GenericEditStart'] +'"><span class="icon-edit"></span></button>'
                            + '      <button class="leaveEditModeButton" data-tooltip-bottom-right="'+ labels['GenericEditEnd'] +'"><span class="icon-edit-circled"></span></button>'
                            + '      <button class="userSettingsButton" data-tooltip-bottom-right="'+ labels['UserManagement'] +'"><span class="icon-user"></span></button>'
                            + '      <button class="logoutButton" data-tooltip-bottom-right="'+ labels['UserLogout'] +'"><span class="icon-logout"></span></button>'
                            + '  </div>'
                            + '  <div class="sharingWidget"><button class="sharingWidgetButton" data-tooltip-bottom-right="'+ labels['GenericShareEmbed'] +'"><span class="icon-share"></span></button></div>'
                            + '</div>'
                          ),
    TitlebarViewMode        = domElement.find('.titlebarViewMode'),
    ManageResourcesButton   = domElement.find('.manageResourcesButton'),
    StartEditButton         = domElement.find('.startEditButton'),
    LeaveEditModeButton     = domElement.find('.leaveEditModeButton'),
    UserSettingsButton      = domElement.find('.userSettingsButton'),
    SharingWidget           = domElement.find('.sharingWidget');


    StartEditButton.click(function(){
        
        if (FrameTrail.module('RouteNavigation').environment.iframe) {
            FrameTrail.module('ViewVideo').toggleNativeFullscreenState(false, 'open');
        }

        FrameTrail.module('UserManagement').ensureAuthenticated(
            function(){

                FrameTrail.changeState('editMode', 'preview');

                FrameTrail.triggerEvent('userAction', {
                    action: 'EditStart'
                });

            },
            function(){
            	/* Start edit mode canceled */
            	if (FrameTrail.module('RouteNavigation').environment.iframe) {
		            FrameTrail.module('ViewVideo').toggleNativeFullscreenState(false, 'close');
		        }
            }
        );
    });

    LeaveEditModeButton.click(function(){
        FrameTrail.module('HypervideoModel').leaveEditMode();
    });

    UserSettingsButton.click(function(){
        FrameTrail.module('UserManagement').showAdministrationBox();
    });

    domElement.find('.sidebarToggleButton').click(function(){

        FrameTrail.changeState('sidebarOpen', ! FrameTrail.getState('sidebarOpen'));

    });

    if (!FrameTrail.module('RouteNavigation').hypervideoID) {
        domElement.find('button[data-viewmode="video"]').hide();
    }

    TitlebarViewMode.children().click(function(evt){
        FrameTrail.changeState('viewMode', ($(this).attr('data-viewmode')));
    });



    SharingWidget.find('.sharingWidgetButton').click(function(){

        var RouteNavigation = FrameTrail.module('RouteNavigation'),
            baseUrl = window.location.href.split('?')[0].split('#'),
            url = baseUrl[0] + '#',
            secUrl = '//'+ window.location.host + window.location.pathname,
            iframeUrl = secUrl + '#';

        if ( FrameTrail.getState('viewMode') == 'video' && RouteNavigation.hypervideoID ) {
            url += 'hypervideo='+ RouteNavigation.hypervideoID;
            iframeUrl += 'hypervideo='+ RouteNavigation.hypervideoID;
        }

        var shareDialog = $('<div class="shareDialog" title="'+ labels['GenericShareEmbed']+ '">'
                        + '    <div>Link</div>'
                        + '    <input type="text" value="'+ url +'"/>'
                        + '    <div>Embed Code</div>'
                        + '    <textarea style="height: 100px;" readonly><iframe width="800" height="600" scrolling="no" src="'+ iframeUrl +'" frameborder="0" allowfullscreen></iframe></textarea>'
                        + '</div>');

        shareDialog.find('input[type="text"], textarea').click(function() {
            $(this).focus();
            $(this).select();
        });

        shareDialog.dialog({
            modal: true,
            resizable: false,
            width:      500,
            height:     360,
            close: function() {
                $(this).dialog('close');
                $(this).remove();
            },
            buttons: [
                { text: 'OK',
                    click: function() {
                        $( this ).dialog( 'close' );
                    }
                }
            ]
        });

    });

    domElement.find('.logoutButton').click(function(){

        FrameTrail.module('HypervideoModel').leaveEditMode(true);

    });

    ManageResourcesButton.click(function() {
        FrameTrail.module('ViewResources').open();
    });


    /**
     * I am called from {{#crossLink "Interface/create:method"}}Interface/create(){{/crossLink}}.
     *
     * I set up my interface elements.
     *
     * @method create
     */
    function create() {

        toggleSidebarOpen(FrameTrail.getState('sidebarOpen'));
        toogleUnsavedChanges(FrameTrail.getState('unsavedChanges'));
        toggleViewMode(FrameTrail.getState('viewMode'));
        toggleEditMode(FrameTrail.getState('editMode'));

        if ( FrameTrail.getState('embed') ) {
            //domElement.find('#SidebarToggleButton, #SharingWidgetButton').hide();
        }

        $(FrameTrail.getState('target')).append(domElement);

    }



    /**
     * I make changes to my CSS, when the global state "sidebarOpen" changes.
     * @method toggleSidebarOpen
     * @param {Boolean} opened
     */
    function toggleSidebarOpen(opened) {

        if (opened) {

            domElement.addClass('sidebarOpen');

        } else {

            domElement.removeClass('sidebarOpen');

        }

    }



    /**
     * I make changes to my CSS, when the global state "unsavedChanges" changes.
     * @method toogleUnsavedChanges
     * @param {Boolean} aBoolean
     */
    function toogleUnsavedChanges(aBoolean) {

        if(aBoolean){
            TitlebarViewMode.find('[data-viewmode="video"]').addClass('unsavedChanges');
        }else{
            TitlebarViewMode.find('[data-viewmode="video"]').removeClass('unsavedChanges');
        }

    }


    /**
     * I react to a change in the global state "viewMode"
     * @method toggleViewMode
     * @param {String} viewMode
     */
    function toggleViewMode(viewMode) {

        if (FrameTrail.module('RouteNavigation').hypervideoID) {
            domElement.find('button[data-viewmode="video"]').show();

            // count visible hypervideos
            var hypervideos = FrameTrail.module('Database').hypervideos,
                visibleCount = 0;
            for (var id in hypervideos) {
                if (!hypervideos[id].hidden) {
                    visibleCount++;
                }
            }

            // hide 'Overview' and 'Video' controls when there's only one hypervideo
            if (visibleCount == 1) {
                TitlebarViewMode.addClass('hidden');
            }

        }

        TitlebarViewMode.children().removeClass('active');

        domElement.find('[data-viewmode=' + viewMode + ']').addClass('active');

    }


    /**
     * I react to a change in the global state "editMode"
     * @method toggleEditMode
     * @param {String} editMode
     * @param {String} oldEditMode
     */
    function toggleEditMode(editMode, oldEditMode){

        if (editMode) {

            domElement.addClass('editActive');

            if (oldEditMode === false) {

                StartEditButton.hide();
                LeaveEditModeButton.show();
                ManageResourcesButton.show();
                SharingWidget.hide();

            }

        } else {

            domElement.removeClass('editActive');

            StartEditButton.show();

            // Hide Edit Button when not in a server environment
            if (!FrameTrail.module('RouteNavigation').environment.server) {
                StartEditButton.hide();
            }

            LeaveEditModeButton.hide();
            ManageResourcesButton.hide();
            SharingWidget.show();

        }

    }


    /**
     * I react to a change in the global state "loggedIn"
     * @method changeUserLogin
     * @param {Boolean} loggedIn
     */
    function changeUserLogin(loggedIn) {

        if (loggedIn) {

            domElement.find('.logoutButton').show();
            UserSettingsButton.show();

        } else {

            domElement.find('.logoutButton').hide();
            UserSettingsButton.hide();

        }

    }


    /**
     * I react to a change in the global state "userColor"
     * @method changeUserColor
     * @param {String} color
     */
    function changeUserColor(color) {

        if (color.length > 1) {

            /*
            // Too much color in the interface, keep default color for now
            UserSettingsButton.css({
                'border-color': '#' + FrameTrail.getState('userColor'),
                'background-color': '#' + FrameTrail.getState('userColor')
            });
            */

        }

    }





    return {

        onChange: {
            sidebarOpen:    toggleSidebarOpen,
            unsavedChanges: toogleUnsavedChanges,
            viewMode:       toggleViewMode,
            editMode:       toggleEditMode,
            loggedIn:       changeUserLogin,
            userColor:      changeUserColor
        },

        /**
         * I am the text, which should be shown in the title bar.
         * @attribute title
         * @type String
         * @writeOnly
         */
        set title(aString) {
            domElement.find('.titlebarTitle').html(aString);
        },

        /**
         * I am the height of the title bar in pixel.
         * @attribute height
         * @type Number
         * @readOnly
         */
        get height() {
            return FrameTrail.getState('fullscreen') ? 0 : domElement.height();
        },

        create: create

    };


});
