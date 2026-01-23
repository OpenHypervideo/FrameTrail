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
                            + '  <div class="titlebarTitle"><button class="hypervideoEditButton" data-tooltip-bottom="'+ labels['SettingsHypervideoSettings'] +'"><span class="icon-pencil"></span></button></div>'
                            + '  <div class="titlebarActionButtonContainer">'
                            + '      <button class="adminSettingsButton" data-tooltip-bottom-right="'+ labels['GenericAdministration'] +'"><span class="icon-cog"></span></button>'
                            + '      <button class="manageResourcesButton resourceManagerIcon" data-tooltip-bottom-right="'+ labels['ResourcesManage'] +'"><span class="icon-folder-open"></span></button>'
                            + '      <button class="userSettingsButton" data-tooltip-bottom-right="'+ labels['UserManagement'] +'"><span class="icon-user"></span></button>'
                            + '      <button class="logoutButton" data-tooltip-bottom-right="'+ labels['UserLogout'] +'"><span class="icon-logout"></span></button>'
                            + '      <button class="startEditButton" data-tooltip-bottom-right="'+ labels['GenericEditStart'] +'"><span class="icon-edit"></span></button>'
                            + '      <button class="leaveEditModeButton" data-tooltip-bottom-right="'+ labels['GenericEditEnd'] +'"><span class="icon-ok-squared"></span></button>'
                            + '  </div>'
                            + '  <div class="sharingWidget"><button class="sharingWidgetButton" data-tooltip-bottom-right="'+ labels['GenericShareEmbed'] +'"><span class="icon-share"></span></button></div>'
                            + '</div>'
                          ),
    TitlebarViewMode        = domElement.find('.titlebarViewMode'),
    TitlebarTitle           = domElement.find('.titlebarTitle'),
    HypervideoEditButton    = domElement.find('.hypervideoEditButton'),
    ManageResourcesButton   = domElement.find('.manageResourcesButton'),
    AdminSettingsButton     = domElement.find('.adminSettingsButton'),
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

    AdminSettingsButton.click(function() {
        FrameTrail.module('AdminSettingsDialog').open();
    });

    // Use event delegation to handle clicks even if button is recreated
    domElement.on('click', '.hypervideoEditButton', function(evt) {
        evt.preventDefault();
        evt.stopPropagation();
        var hypervideoID = FrameTrail.module('RouteNavigation').hypervideoID;
        if (hypervideoID) {
            FrameTrail.module('HypervideoSettingsDialog').open(hypervideoID);
        }
    });

    /**
     * I check if the current user can edit the current hypervideo.
     * User must be admin or the owner (creator) of the hypervideo.
     * @method canEditCurrentHypervideo
     * @return {Boolean}
     */
    function canEditCurrentHypervideo() {
        var userRole = FrameTrail.module('UserManagement').userRole;
        var userID = FrameTrail.module('UserManagement').userID;
        var creatorId = FrameTrail.module('HypervideoModel').creatorId;
        
        return userRole === 'admin' || String(creatorId) === String(userID);
    }


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

        // Show/hide hypervideo edit button based on view mode, edit mode, and permission
        if (viewMode === 'video' && FrameTrail.getState('editMode') && FrameTrail.module('RouteNavigation').hypervideoID && canEditCurrentHypervideo()) {
            HypervideoEditButton.addClass('active');
        } else {
            HypervideoEditButton.removeClass('active');
        }

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

                // Show hypervideo edit button if in video view and user has permission
                if (FrameTrail.getState('viewMode') === 'video' && FrameTrail.module('RouteNavigation').hypervideoID && canEditCurrentHypervideo()) {
                    HypervideoEditButton.addClass('active');
                }

                // Show admin settings button if admin
                if (FrameTrail.module('UserManagement').userRole === 'admin') {
                    AdminSettingsButton.show();
                }

                // Show user settings and logout buttons if logged in
                if (FrameTrail.getState('loggedIn')) {
                    UserSettingsButton.show();
                    domElement.find('.logoutButton').show();
                }

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
            HypervideoEditButton.removeClass('active');
            AdminSettingsButton.hide();
            SharingWidget.show();

            // Hide user settings and logout buttons when leaving edit mode
            UserSettingsButton.hide();
            domElement.find('.logoutButton').hide();

        }

    }


    /**
     * I react to a change in the global state "loggedIn"
     * @method changeUserLogin
     * @param {Boolean} loggedIn
     */
    function changeUserLogin(loggedIn) {

        if (loggedIn) {

            // Only show user settings and logout buttons if in edit mode
            if (FrameTrail.getState('editMode')) {
                domElement.find('.logoutButton').show();
                UserSettingsButton.show();
            }

            // Show admin settings button if admin and in edit mode
            if (FrameTrail.module('UserManagement').userRole === 'admin' && FrameTrail.getState('editMode')) {
                AdminSettingsButton.show();
            }

        } else {

            domElement.find('.logoutButton').hide();
            UserSettingsButton.hide();
            AdminSettingsButton.hide();

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
            var titleText = aString;
            var editButton = TitlebarTitle.find('.hypervideoEditButton');
            TitlebarTitle.html(titleText);
            if (editButton.length > 0) {
                TitlebarTitle.append(editButton);
            }
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
