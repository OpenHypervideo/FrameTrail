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


    var domElement = $(   '<div class="titlebar">'
                            + '  <div class="sidebarToggleWidget" class=""><button class="sidebarToggleButton"><span class="icon-menu"></span></button></div>'
                            + '  <div class="titlebarViewMode">'
                            + '      <button data-viewmode="overview" data-tooltip-bottom-left="Overview"><span class="icon-overview"></span></button>'
                            + '      <button data-viewmode="video"><span class="icon-hypervideo"></span></button>'
                            + '  </div>'
                            + '  <div class="titlebarTitle"></div>'
                            + '  <div class="titlebarActionButtonContainer">'
                            + '      <button class="newHypervideoButton" data-tooltip-bottom-right="New Hypervideo"><span class="icon-hypervideo-add"></span></button>'
                            + '      <button class="manageResourcesButton resourceManagerIcon" data-tooltip-bottom-right="Manage Resources"><span class="icon-folder-open"></span></button>'
                            + '      <button class="startEditButton" data-tooltip-bottom-right="Edit"><span class="icon-edit"></span></button>'
                            + '      <button class="leaveEditModeButton" data-tooltip-bottom-right="Stop Editing"><span class="icon-edit-circled"></span></button>'
                            + '      <button class="userSettingsButton" data-tooltip-bottom-right="User Management"><span class="icon-user"></span></button>'
                            + '      <button class="logoutButton" data-tooltip-bottom-right="Logout"><span class="icon-logout"></span></button>'
                            + '  </div>'
                            + '  <div class="sharingWidget"><button class="sharingWidgetButton" data-tooltip-bottom-right="Share"><span class="icon-share"></span></button></div>'
                            + '</div>'
                          ),
    TitlebarViewMode        = domElement.find('.titlebarViewMode'),
    NewHypervideoButton     = domElement.find('.newHypervideoButton'),
    ManageResourcesButton   = domElement.find('.manageResourcesButton'),
    StartEditButton         = domElement.find('.startEditButton'),
    LeaveEditModeButton     = domElement.find('.leaveEditModeButton'),
    UserSettingsButton      = domElement.find('.userSettingsButton'),
    SharingWidget           = domElement.find('.sharingWidget');


    StartEditButton.click(function(){
        
        if (FrameTrail.module('RouteNavigation').environment.iframe) {
            $(FrameTrail.getState('target'))[0].requestFullscreen();
        }

        FrameTrail.module('UserManagement').ensureAuthenticated(
            function(){

                FrameTrail.changeState('editMode', 'preview');

                FrameTrail.triggerEvent('userAction', {
                    action: 'EditStart'
                });

            },
            function(){ /* Start edit mode canceled */ }
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
            iframeUrl = secUrl + '#',
            label = 'Site';

        if ( FrameTrail.getState('viewMode') == 'video' && RouteNavigation.hypervideoID ) {
            url += 'hypervideo='+ RouteNavigation.hypervideoID;
            iframeUrl += 'hypervideo='+ RouteNavigation.hypervideoID;
            label = 'Hypervideo'
        }

        var shareDialog = $('<div class="shareDialog" title="Share / Embed '+ label +'">'
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


    NewHypervideoButton.click(function(evt) {

        var newDialog = $('<div class="newHypervideoDialog" title="New Hypervideo">'
                        + '    <form class="newHypervideoForm" method="post">'
                        + '        <div class="formColumn column2">'
                        + '            <label for="name">Hypervideo Name</label>'
                        + '            <input type="text" name="name" placeholder="Name" value=""><br>'
                        + '            <input type="checkbox" name="hidden" id="hypervideo_hidden" value="hidden" '+((FrameTrail.module('Database').config.defaultHypervideoHidden.toString() == "true") ? "checked" : "")+'>'
                        + '            <label for="hypervideo_hidden">Hidden from other users?</label>'
                        + '        </div>'
                        + '        <div class="formColumn column2">'
                        + '            <label for="description">Description</label>'
                        + '            <textarea name="description" placeholder="Description"></textarea><br>'
                        + '        </div>'
                        + '        <div style="clear: both;"></div>'
                        + '        <hr>'
                        + '        <div class="newHypervideoTabs">'
                        + '            <ul>'
                        + '                <li><a href="#ChooseVideo">Choose Video</a></li>'
                        + '                <li><a href="#EmptyVideo">Empty Video</a></li>'
                        + '            </ul>'
                        + '            <div id="ChooseVideo">'
                        + '                <button type="button" class="uploadNewVideoResource">Upload new video</button>'
                        + '                <div class="newHypervideoDialogResources"></div>'
                        + '                <input type="hidden" name="resourcesID">'
                        + '            </div>'
                        + '            <div id="EmptyVideo">'
                        + '                <div class="message active">Please set a duration in seconds</div>'
                        + '                <input type="text" name="duration" placeholder="duration">'
                        + '            </div>'
                        + '        </div>'
                        + '        <div class="message error"></div>'
                        + '    </form>'
                        + '</div>');

        // Manage Subtitles
        newDialog.find('.subtitlesPlus').on('click', function() {
            var langOptions, languageSelect;

            for (var lang in FrameTrail.module('Database').subtitlesLangMapping) {
                langOptions += '<option value="'+ lang +'">'+ FrameTrail.module('Database').subtitlesLangMapping[lang] +'</option>';
            }

            languageSelect =  '<select class="subtitlesTmpKeySetter">'
                            + '    <option value="" disabled selected style="display:none;">Language</option>'
                            + langOptions
                            + '</select>';

            newDialog.find('.newSubtitlesContainer').append('<span class="subtitlesItem">'+ languageSelect +'<input type="file" name="subtitles[]"><button class="subtitlesRemove" type="button">x</button><br></span>');
        });

        newDialog.find('.newSubtitlesContainer').on('click', '.subtitlesRemove', function(evt) {
            $(this).parent().remove();
        });

        newDialog.find('.newSubtitlesContainer').on('change', '.subtitlesTmpKeySetter', function() {
            $(this).parent().find('input[type="file"]').attr('name', 'subtitles['+$(this).val()+']');
        });



        FrameTrail.module('ResourceManager').renderList(newDialog.find('.newHypervideoDialogResources'), true,
            'type',
            'contains',
            ['video', 'youtube']
        );

        $('body').on('click.hypervideoAddResourcesItem', '.resourceThumb', function() {

            newDialog.find('.resourceThumb').removeClass('selected');
            $(this).addClass('selected');
            newDialog.find('input[name="resourcesID"]').val($(this).data('resourceid'));

        });

        newDialog.find('.newHypervideoTabs').tabs({
            activate: function(event, ui) {
                if ( ui.newPanel.attr('id') == 'EmptyVideo' ) {
                    newDialog.find('input[name="resourcesID"]').prop('disabled',true);
                    newDialog.find('input[name="duration"]').prop('disabled',false);
                    newDialog.find('.resourceThumb').removeClass('selected');
                } else {
                    newDialog.find('input[name="resourcesID"]').prop('disabled',false);
                    newDialog.find('input[name="duration"]').prop('disabled',true);
                }
            }
        });

        newDialog.find('.newHypervideoForm').ajaxForm({
            method:     'POST',
            url:        '_server/ajaxServer.php',
            beforeSubmit: function (array, form, options) {

                var selectedResourcesID = $('.newHypervideoForm').find('input[name="resourcesID"]').val();
                //console.log(FrameTrail.module('Database').resources[parseInt(selectedResourcesID)]);

                var hypervideoData = {
                    "meta": {
                        "name": $('.newHypervideoForm').find('input[name="name"]').val(),
                        "description": $('.newHypervideoForm').find('textarea[name="description"]').val(),
                        "thumb": (selectedResourcesID.length > 0) ? FrameTrail.module('Database').resources[parseInt(selectedResourcesID)].thumb : null,
                        "creator": FrameTrail.module('Database').users[FrameTrail.module('UserManagement').userID].name,
                        "creatorId": FrameTrail.module('UserManagement').userID,
                        "created": Date.now(),
                        "lastchanged": Date.now()
                    },
                    "config": {
                        "slidingMode": "adjust",
                        "slidingTrigger": "key",
                        "theme": "",
                        "autohideControls": false,
                        "captionsVisible": false,
                        "clipTimeVisible": false,
                        "hidden": $('.newHypervideoForm').find('input[name="hidden"]').is(':checked'),
                        "layoutArea": {
                            "areaTop": [],
                            "areaBottom": [],
                            "areaLeft": [],
                            "areaRight": []
                        }
                    },
                    "clips": [
                        {
                            "resourceId": (selectedResourcesID.length > 0) ? selectedResourcesID : null,
                            "src": (selectedResourcesID.length > 0) ? FrameTrail.module('Database').resources[parseInt(selectedResourcesID)].src : null,
                            "duration": ($('.newHypervideoForm').find('input[name="duration"]').val().length > 0) ? parseFloat($('.newHypervideoForm').find('input[name="duration"]').val()) : 0,
                            "start": 0,
                            "end": 0,
                            "in": 0,
                            "out": 0
                        }
                    ],
                    "globalEvents": {
                        "onReady": "",
                        "onPlay": "",
                        "onPause": "",
                        "onEnded": ""
                    },
                    "customCSS": "",
                    "contents": [],
                    "subtitles": []
                };

                for (var configKey in hypervideoData.config) {
                    var newConfigVal = $('.newHypervideoForm').find('input[data-configkey=' + configKey + ']').val();
                    newConfigVal = (newConfigVal === 'true')
                                    ? true
                                    : (newConfigVal === 'false')
                                        ? false
                                        : (newConfigVal === undefined)
                                            ? hypervideoData.config[configKey]
                                            : newConfigVal;
                    hypervideoData.config[configKey] = newConfigVal;
                }

                $('.newHypervideoForm').find('.newSubtitlesContainer').find('input[type=file]').each(function () {

                    var match = /subtitles\[(.+)\]/g.exec($(this).attr('name'));

                    if (match) {
                        hypervideoData.subtitles.push({
                            "src": match[1] +".vtt",
                            "srclang": match[1]
                        });
                    }
                });

                //console.log(hypervideoData);

                array.push({ name: 'src', value: JSON.stringify(hypervideoData, null, 4) });

            },
            beforeSerialize: function() {

                // Subtitles Validation
                newDialog.dialog('widget').find('.message.error').removeClass('active').html('');

                var err = 0;
                newDialog.find('.subtitlesItem').each(function() {
                    $(this).css({'outline': ''});

                    if (($(this).find('input[type="file"]:first').attr('name') == 'subtitles[]') || ($(this).find('.subtitlesTmpKeySetter').first().val() == '') || ($(this).find('input[type="file"]:first').val().length == 0)) {
                        $(this).css({'outline': '1px solid #cd0a0a'});
                        newDialog.dialog('widget').find('.message.error').addClass('active').html('Subtitles Error: Please fill in all fields.');
                        err++;
                    } else if ( !(new RegExp('(' + ['.vtt'].join('|').replace(/\./g, '\\.') + ')$')).test($(this).find('input[type="file"]:first').val()) ) {
                        $(this).css({'outline': '1px solid #cd0a0a'});
                        newDialog.dialog('widget').find('.message.error').addClass('active').html('Subtitles Error: Wrong format. Please add only .vtt files.');
                        err++;
                    }

                    if (newDialog.find('.subtitlesItem input[type="file"][name="subtitles['+ $(this).find('.subtitlesTmpKeySetter:first').val() +']"]').length > 1 ) {
                        newDialog.dialog('widget').find('.message.error').addClass('active').html('Subtitles Error: Please make sure you assign languages only once.');
                        return false;
                    }

                });
                if (err > 0) {
                    return false;
                }

            },
            dataType:   'json',
            data: {'a': 'hypervideoAdd'},
            success: function(response) {
                switch(response['code']) {
                    case 0:
                        newDialog.dialog('close');
                        FrameTrail.module('Database').loadHypervideoData(
                            function(){
                                FrameTrail.module('ViewOverview').refreshList();
                            },
                            function(){}
                        );
                        break;
                    default:
                        newDialog.dialog('widget').find('.message.error').addClass('active').html(response['string']);
                        break;
                }
            }
        });


        newDialog.find('.uploadNewVideoResource').click(function(){

            FrameTrail.module('ResourceManager').uploadResource(function(){

                var NewHypervideoDialogResources = newDialog.find('.newHypervideoDialogResources');
                NewHypervideoDialogResources.empty();

                FrameTrail.module('ResourceManager').renderList(NewHypervideoDialogResources, true,
                    'type',
                    'contains',
                    'video'
                );

            }, true);

        })


        newDialog.dialog({
            modal: true,
            resizable: false,
            width:      725,
            height:     500,
            create: function() {
                newDialog.find('.message.error').appendTo($(this).dialog('widget').find('.ui-dialog-buttonpane'));
            },
            close: function() {
                $('body').off('click.hypervideoAddResourcesItem');
                $(this).dialog('close');
                $(this).remove();
            },
            buttons: [
                { text: 'Add Hypervideo',
                    click: function() {
                        $('.newHypervideoForm').submit();
                    }
                },
                { text: 'Cancel',
                    click: function() {
                        $( this ).dialog( 'close' );
                    }
                }
            ]
        });

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
            domElement.find('.sidebarToggleWidget').addClass('sidebarActive');

        } else {

            domElement.removeClass('sidebarOpen');
            domElement.find('.sidebarToggleWidget').removeClass('sidebarActive');

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

                NewHypervideoButton.show();
                StartEditButton.hide();
                LeaveEditModeButton.show();
                ManageResourcesButton.show();
                SharingWidget.hide();

            }

        } else {

            domElement.removeClass('editActive');

            NewHypervideoButton.hide();
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
