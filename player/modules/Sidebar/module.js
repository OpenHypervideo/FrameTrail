/**
 * @module Player
 */


/**
 * I am the Sidebar. I provide the basic navigation for the user interface.
 *
 * @class Sidebar
 * @static
 */



FrameTrail.defineModule('Sidebar', function(FrameTrail){

    var labels = FrameTrail.module('Localization').labels;

    var domElement  = $(      '<div class="sidebar">'
                            + '    <div class="sidebarContainer">'
                            + '        <div data-viewmode="overview">'
                            + '            <div class="viewmodeControls">'
                            + '                <div class="viewModeActionButtonContainer">'
                            + '                    <button class="newHypervideoButton" data-tooltip-bottom-left="'+ labels['HypervideoNew'] +'"><span class="icon-hypervideo-add"></span></button>'
                            + '                    <button class="exportButton" data-tooltip-bottom-left="'+ labels['GenericExport'] +'"><span class="icon-download"></span></button>'
                            + '                    <div style="clear: both;"></div>'
                            + '                </div>'
                            + '            </div>'
                            + '        </div>'
                            + '        <div data-viewmode="video">'
                            + '            <div class="viewmodeControls">'
                            + '                <div class="viewModeActionButtonContainer">'
                            + '                    <button class="newHypervideoButton" data-tooltip-bottom-left="'+ labels['HypervideoNew'] +'"><span class="icon-hypervideo-add"></span></button>'
                            + '                    <button class="forkButton" data-tooltip-bottom-left="'+ labels['GenericForkHypervideo'] +'"><span class="icon-hypervideo-fork"></span></button>'
                            + '                    <button class="saveButton" data-tooltip-bottom-left="'+ labels['GenericSaveChanges'] +'"><span class="icon-floppy"></span></button>'
                            + '                    <button class="exportButton" data-tooltip-bottom-left="'+ labels['GenericExportHypervideo'] +'"><span class="icon-download"></span></button>'
                            + '                    <div style="clear: both;"></div>'
                            + '                </div>'
                            + '                <button class="editMode" data-editmode="preview"><span class="icon-eye"></span><span class="editModeLabel">'+ labels['SidebarPreview'] +'</span></button>'
                            + '                <button class="editMode" data-editmode="settings"><span class="icon-cog"></span><span class="editModeLabel">'+ labels['SidebarSettings'] +'</span></button>'
                            + '                <button class="editMode" data-editmode="overlays"><span class="icon-object-ungroup"></span><span class="editModeLabel">'+ labels['SidebarOverlays'] +'</span></button>'
                            + '                <button class="editMode" data-editmode="codesnippets"><span class="icon-code"></span><span class="editModeLabel">'+ labels['SidebarCustomCode'] +'</span></button>'
                            + '                <button class="editMode" data-editmode="annotations"><span class="icon-annotations"></span><span class="editModeLabel">'+ labels['SidebarMyAnnotations'] +'<span class="icon-user"></span></button>'
                            + '            </div>'
                            + '            <button class="hypervideoDeleteButton" data-tooltip-top-left="'+ labels['GenericDeleteHypervideo'] +'"><span class="icon-trash"></span></button>'
                            + '        </div>'
                            + '    </div>'
                            + '    </div>'
                            + '</div>'
                        ),

        sidebarContainer       = domElement.find('.sidebarContainer'),
        overviewContainer      = sidebarContainer.children('[data-viewmode="overview"]'),
        videoContainer         = sidebarContainer.children('[data-viewmode="video"]'),
        videoContainerControls = videoContainer.children('.viewmodeControls'),
        resourcesContainer     = sidebarContainer.children('[data-viewmode="resources"]'),

        NewHypervideoButton    = domElement.find('.newHypervideoButton'),
        SaveButton             = domElement.find('.saveButton'),
        ForkButton             = domElement.find('.forkButton'),
        ExportButton           = domElement.find('.exportButton'),
        DeleteButton           = domElement.find('.hypervideoDeleteButton');


    NewHypervideoButton.click(function(evt) {

        var newDialog = $('<div class="newHypervideoDialog" title="'+ labels['HypervideoNew'] +'">'
                        + '    <form class="newHypervideoForm" method="post">'
                        + '        <div class="formColumn column2">'
                        + '            <label for="name">'+ labels['SettingsHypervideoName'] +'</label>'
                        + '            <input type="text" name="name" placeholder="'+ labels['SettingsHypervideoName'] +'" value=""><br>'
                        + '            <input type="checkbox" name="hidden" id="hypervideo_hidden" value="hidden" '+((FrameTrail.module('Database').config.defaultHypervideoHidden.toString() == "true") ? "checked" : "")+'>'
                        + '            <label for="hypervideo_hidden">'+ labels['SettingsHiddenFromOtherUsers'] +'</label>'
                        + '        </div>'
                        + '        <div class="formColumn column2">'
                        + '            <label for="description">'+ labels['SettingsHypervideoDescription'] +'</label>'
                        + '            <textarea name="description" placeholder="'+ labels['SettingsHypervideoDescription'] +'"></textarea><br>'
                        + '        </div>'
                        + '        <div style="clear: both;"></div>'
                        + '        <hr>'
                        + '        <div class="newHypervideoTabs">'
                        + '            <ul>'
                        + '                <li><a href="#ChooseVideo">'+ labels['SettingsChooseVideo'] +'</a></li>'
                        + '                <li><a href="#EmptyVideo">'+ labels['GenericEmptyVideo'] +'</a></li>'
                        + '            </ul>'
                        + '            <div id="ChooseVideo">'
                        + '                <button type="button" class="uploadNewVideoResource">'+ labels['ResourceUploadVideo'] +'</button>'
                        + '                <div class="newHypervideoDialogResources"></div>'
                        + '                <input type="hidden" name="resourcesID">'
                        + '            </div>'
                        + '            <div id="EmptyVideo">'
                        + '                <div class="message active">'+ labels['MessageEmptyVideoSetDuration'] +'</div>'
                        + '                <input type="text" name="duration" placeholder="'+ labels['GenericDuration'] +'">'
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
                            + '    <option value="" disabled selected style="display:none;">'+ labels['GenericLanguage'] +'</option>'
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
            ['video', 'youtube', 'vimeo']
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
                        newDialog.dialog('widget').find('.message.error').addClass('active').html(labels['ErrorSubtitlesEmptyFields']);
                        err++;
                    } else if ( !(new RegExp('(' + ['.vtt'].join('|').replace(/\./g, '\\.') + ')$')).test($(this).find('input[type="file"]:first').val()) ) {
                        $(this).css({'outline': '1px solid #cd0a0a'});
                        newDialog.dialog('widget').find('.message.error').addClass('active').html(labels['ErrorSubtitlesWrongFormat']);
                        err++;
                    }

                    if (newDialog.find('.subtitlesItem input[type="file"][name="subtitles['+ $(this).find('.subtitlesTmpKeySetter:first').val() +']"]').length > 1 ) {
                        newDialog.dialog('widget').find('.message.error').addClass('active').html(labels['ErrorSubtitlesLanguageDuplicate']);
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
                { text: labels['HypervideoAdd'],
                    click: function() {
                        $('.newHypervideoForm').submit();
                    }
                },
                { text: labels['GenericCancel'],
                    click: function() {
                        $( this ).dialog( 'close' );
                    }
                }
            ]
        });

    });

    SaveButton.click(function(){
        FrameTrail.module('HypervideoModel').save();
    });

    ForkButton.click(function(evt) {

        evt.preventDefault();
        evt.stopPropagation();

        var thisID = FrameTrail.module('RouteNavigation').hypervideoID,
            thisHypervideo = FrameTrail.module('Database').hypervideo;

        var forkDialog = $('<div class="forkHypervideoDialog" title="'+ labels['GenericForkHypervideo'] +'">'
                         + '    <div class="message active">'+ labels['MessageForkHypervideo'] +'</div>'
                         + '    <form method="POST" class="forkHypervideoForm">'
                         + '        <input type="text" name="name" placeholder="" value="'+ thisHypervideo.name +'"><br>'
                         + '        <textarea name="description" placeholder="">'+ thisHypervideo.description +'</textarea><br>'
                         + '        <div class="message error"></div>'
                         + '    </form>'
                         + '</div>');

        forkDialog.find('.forkHypervideoForm').ajaxForm({
            method:     'POST',
            url:        '_server/ajaxServer.php',
            dataType:   'json',
            thisID: thisID,
            data: {'a': 'hypervideoClone', 'hypervideoID': thisID},
            beforeSubmit: function (array, form, options) {

                var currentData = FrameTrail.module("Database").convertToDatabaseFormat(thisID);

                //console.log(currentData);
                currentData.meta.name = $('.forkHypervideoForm').find('input[name="name"]').val();
                currentData.meta.description = $('.forkHypervideoForm').find('textarea[name="description"]').val();
                currentData.meta.creator = FrameTrail.module('Database').users[FrameTrail.module('UserManagement').userID].name;
                currentData.meta.creatorId = FrameTrail.module('UserManagement').userID;

                array.push({ name: 'src', value: JSON.stringify(currentData, null, 4) });

            },
            success: function(response) {
                switch(response['code']) {
                    case 0:
                        // TODO: UPDATE LIST / HYPERVIDEO OBJECT IN CLIENT! @Michi
                        forkDialog.dialog('close');
                        FrameTrail.module('Database').loadHypervideoData(
                            function(){
                                FrameTrail.module('ViewOverview').refreshList();
                                alert('TODO: switch to new hypervideo');
                            },
                            function(){}
                        );

                        break;
                    default:
                        //TODO: push nice error texts into error box.
                        forkDialog.find('.message.error').addClass('active').html(labels['ErrorGeneric']);
                        break;
                }
            }
        });

        forkDialog.dialog({
            modal: true,
            resizable: false,
            close: function() {
                $(this).dialog('close');
                $(this).remove();
            },
            buttons: [
                { text: labels['GenericForkHypervideo'],
                    click: function() {

                        $('.forkHypervideoForm').submit();

                    }
                },
                { text: labels['GenericCancel'],
                    click: function() {
                        $( this ).dialog( 'close' );
                    }
                }
            ]
        });

    });

    ExportButton.click(function(){
        FrameTrail.module('HypervideoModel').exportIt();
    });

    DeleteButton.click(function(evt) {

        evt.preventDefault();
        evt.stopPropagation();

        var thisID = FrameTrail.module('RouteNavigation').hypervideoID,
            hypervideos = FrameTrail.module('Database').hypervideos;

        var deleteDialog = $('<div class="deleteHypervideoDialog" title="'+ labels['GenericDeleteHypervideo'] +'">'
                           + '<div>'+ labels['MessageDeleteHypervideoQuestion'] +'</div>'
                           + '    <input class="thisHypervideoName" type="text" value="'+ hypervideos[thisID]['name'] +'" readonly>'
                           + '    <div class="message active">'+ labels['MessageDeleteHypervideoReEnter'] +':</div>'
                           + '    <form method="POST" class="deleteHypervideoForm">'
                           + '        <input type="text" name="hypervideoName" placeholder="'+ labels['GenericName'] +'"><br>'
                           + '        <div class="message error"></div>'
                           + '    </form>'
                           + '</div>');


        deleteDialog.find('.deleteHypervideoForm').ajaxForm({
            method:     'POST',
            url:        '_server/ajaxServer.php',
            dataType:   'json',
            thisID: thisID,
            data: {a: 'hypervideoDelete', hypervideoID: thisID},
            success: function(response) {
                switch(response['code']) {
                    case 0:
                        // TODO: find a nice way to remove Element of deleted Hypervideo from Overview List
                        deleteDialog.dialog('close');
                        $('#OverviewList div[data-hypervideoid="'+thisID+'"]').remove();

                        // Redirect to Overview when current Hypervideo has been deleted
                        if ( thisID == FrameTrail.module('RouteNavigation').hypervideoID ) {
                            alert(labels['MessageDeleteHypervideoRedirect']);
                            window.location.hash = "#";
                        }

                    break;
                    case 1:
                        deleteDialog.find('.message.error').addClass('active').html(labels['ErrorNotLoggedIn']);
                    break;
                    case 2:
                        deleteDialog.find('.message.error').addClass('active').html(labels['ErrorNotActivated']);
                    break;
                    case 3:
                        deleteDialog.find('.message.error').addClass('active').html(labels['ErrorCouldNotFindHypervideoDirectory']);
                    break;
                    case 4:
                        deleteDialog.find('.message.error').addClass('active').html(labels['ErrorHypervideoDoesNotExist']);
                    break;
                    case 5:
                        deleteDialog.find('.message.error').addClass('active').html(labels['ErrorHypervideoNameIncorrect']);
                    break;
                    case 6:
                        //TODO push nice texts into error box.
                        deleteDialog.find('.message.error').addClass('active').html(labels['ErrorHypervideoPermissionDenied']);
                    break;
                }
            }
        });

        deleteDialog.dialog({
                modal: true,
                resizable: false,
                open: function() {
                    deleteDialog.find('.thisHypervideoName').focus().select();
                },
                close: function() {
                    $(this).dialog('close');
                    $(this).remove();
                },
                buttons: [
                    { text: labels['GenericDeleteHypervideo'],
                        click: function() {
                            $('.deleteHypervideoForm').submit();
                        }
                    },
                    { text: labels['GenericCancel'],
                        click: function() {
                            $( this ).dialog( 'close' );
                        }
                    }
                ]
            });

    });


    videoContainerControls.find('.editMode').click(function(evt){
        FrameTrail.changeState('editMode', ($(this).attr('data-editmode')));
    });


    /**
     * I am called from {{#crossLink "Interface/create:method"}}Interface/create(){{/crossLink}} and set up all my elements.
     * @method create
     */
    function create() {

        toggleSidebarOpen(FrameTrail.getState('sidebarOpen'));
        changeViewSize(FrameTrail.getState('viewSize'));
        toggleFullscreen(FrameTrail.getState('fullscreen'));
        toogleUnsavedChanges(FrameTrail.getState('unsavedChanges'));
        toggleViewMode(FrameTrail.getState('viewMode'));
        toggleEditMode(FrameTrail.getState('editMode'));

        $(FrameTrail.getState('target')).append(domElement);

        if ( FrameTrail.getState('embed') ) {
            //domElement.find('.viewmodeControls').hide();
        }



    };


    /**
     * I react to a change in the global state "sidebarOpen"
     * @method toggleSidebarOpen
     * @param {Boolean} opened
     */
    function toggleSidebarOpen(opened) {

        if (opened) {
            domElement.addClass('open');
        } else {
            domElement.removeClass('open');
        }

    };


    /**
     * I react to a change in the global state "viewSize"
     * @method changeViewSize
     * @param {Array} arrayWidthAndHeight
     */
    function changeViewSize(arrayWidthAndHeight) {

        

    };


    /**
     * I react to a change in the global state "fullscreen"
     * @method toggleFullscreen
     * @param {Boolean} aBoolean
     */
    function toggleFullscreen(aBoolean) {



    };


    /**
     * I react to a change in the global state "unsavedChanges"
     * @method toogleUnsavedChanges
     * @param {Boolean} aBoolean
     */
    function toogleUnsavedChanges(aBoolean) {

        if (aBoolean) {
            domElement.find('button[data-viewmode="video"]').addClass('unsavedChanges')
            SaveButton.addClass('unsavedChanges')
        } else {
            domElement.find('button[data-viewmode="video"]').removeClass('unsavedChanges')
            domElement.find('button.editMode').removeClass('unsavedChanges')
            SaveButton.removeClass('unsavedChanges')
        }

    };

    /**
     * I am called from the {{#crossLink "HypervideoModel/newUnsavedChange:method"}}HypervideoModel/newUnsavedChange(){{/crossLink}}.
     *
     * I mark the categories (overlays, annotations, codeSnippets), which have unsaved changes inside them.
     *
     * @method newUnsavedChange
     * @param {String} category
     */
    function newUnsavedChange(category) {

        if (category == 'codeSnippets' || category == 'events' || category == 'customCSS') {
            // camelCase not valid in attributes
            domElement.find('button[data-editmode="codesnippets"]').addClass('unsavedChanges');
        } else if (category == 'config' || category == 'layout' || category == 'globalCSS') {
            domElement.find('button[data-editmode="settings"]').addClass('unsavedChanges');
        } else {
            domElement.find('button[data-editmode="'+category+'"]').addClass('unsavedChanges');
        }

    };



    /**
     * I react to a change in the global state "viewMode"
     * @method toggleViewMode
     * @param {String} viewMode
     */
    function toggleViewMode(viewMode) {

        sidebarContainer.children().removeClass('active');

        domElement.find('[data-viewmode=' + viewMode + ']').addClass('active');

        changeViewSize();

    };

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
                ExportButton.hide();
                SaveButton.show();

                videoContainerControls.find('.editMode').addClass('inEditMode');

            }

            videoContainerControls.find('.editMode').removeClass('active');

            videoContainerControls.find('[data-editmode="' + editMode + '"]').addClass('active');

            FrameTrail.changeState('sidebarOpen', true);


        } else {

            domElement.removeClass('editActive');

            NewHypervideoButton.hide();
            //ExportButton.show();
            SaveButton.hide();

            videoContainerControls.find('.editMode').removeClass('inEditMode');

            FrameTrail.changeState('sidebarOpen', false);

        }

        changeViewSize();


    }


    /**
     * I react to a change in the global state "loggedIn"
     * @method changeUserLogin
     * @param {Boolean} loggedIn
     */
    function changeUserLogin(loggedIn) {

        if (loggedIn) {

            if ( FrameTrail.module('RouteNavigation').hypervideoID ) {
                //console.log(FrameTrail.module('HypervideoModel').creatorId);
                //console.log(FrameTrail.module('UserManagement').userID);
                if (FrameTrail.module('UserManagement').userRole == 'admin' || parseInt(FrameTrail.module('HypervideoModel').creatorId) == FrameTrail.module('UserManagement').userID) {

                    videoContainerControls.find('.editMode').removeClass('disabled');

                } else {

                    videoContainerControls.find('.editMode[data-editmode="settings"]').addClass('disabled');
                    videoContainerControls.find('.editMode[data-editmode="overlays"]').addClass('disabled');
                    videoContainerControls.find('.editMode[data-editmode="codesnippets"]').addClass('disabled');

                }
            }

        } else {

            // not logged in

        }

    }




    return {

        create: create,

        onChange: {
            sidebarOpen:    toggleSidebarOpen,
            viewSize:       changeViewSize,
            fullscreen:     toggleFullscreen,
            unsavedChanges: toogleUnsavedChanges,
            viewMode:       toggleViewMode,
            editMode:       toggleEditMode,
            loggedIn:       changeUserLogin
        },

        newUnsavedChange: newUnsavedChange,

        /**
         * I am the width of the sidebar's DOM element.
         * @attribute width
         * @type Number
         * @readOnly
         */
        get width() { return domElement.width() }

    };

});
