/**
 * @module Player
 */


/**
 * I am the ViewOverview
 *
 * @class ViewOverview
 * @static
 */


FrameTrail.defineModule('ViewOverview', function(FrameTrail){

    var labels = FrameTrail.module('Localization').labels;

    var domElement = $(    '<div class="viewOverview">'
                        +  '    <div class="overviewList"></div>'
                        +  '</div>'),

        OverviewList     = domElement.find('.overviewList'),
        listWidthState;




    /**
     * Description
     * @method create
     * @return
     */
    function create() {

        $(FrameTrail.getState('target')).find('.mainContainer').append(domElement);

        toggleViewMode(FrameTrail.getState('viewMode'));
        toggleEditMode(FrameTrail.getState('editMode'));

        OverviewList.perfectScrollbar({
            wheelSpeed: 4,
            suppressScrollX: true,
            wheelPropagation: true
        });

    };


    /**
     * Description
     * @method initList
     * @return
     */
    function initList() {

        var hypervideos = FrameTrail.module('Database').hypervideos,
            hypervideo,
            thumb,
            owner,
            admin = FrameTrail.module('UserManagement').userRole === 'admin',
            editMode = FrameTrail.getState('editMode');
            userColor = FrameTrail.getState('userColor');

        OverviewList.find('.hypervideoThumb').remove();

        for (var id in hypervideos) {

            owner = hypervideos[id].creatorId === FrameTrail.module('UserManagement').userID;


            if ( !hypervideos[id].hidden || owner || admin ) {

                hypervideo = FrameTrail.newObject('Hypervideo', hypervideos[id])

                thumb = hypervideo.renderThumb();


                if ( (admin || owner) && editMode ) {

                    var hypervideoOptions = $('<div class="hypervideoOptions"></div>');
                    //TODO: check if options still necessary or empty
                    thumb.append(hypervideoOptions);

                }

                /*
                if (owner && editMode ) {

                    thumb.addClass('owner').css('border-color', '#' + userColor);

                }
                */

                if ( thumb.attr('data-hypervideoid') == FrameTrail.module('RouteNavigation').hypervideoID ) {
                    thumb.addClass('activeHypervideo');
                }

                thumb.css('transition-duration', '0ms');

                // open hypervideo without reloading the page
                thumb.click(function(evt) {

                    // prevent opening href location
                    evt.preventDefault();
                    evt.stopPropagation();

                    var newHypervideoID = $(this).attr('data-hypervideoid'),
                        update = (FrameTrail.module('RouteNavigation').hypervideoID == undefined) ? false : true;


                    //TODO: PUT IN SEPARATE FUNCTION

                    if ( FrameTrail.module('RouteNavigation').hypervideoID == newHypervideoID ) {

                        FrameTrail.changeState('viewMode', 'video');

                    } else {

                        if ( FrameTrail.getState('editMode') && FrameTrail.getState('unsavedChanges') ) {

                            var confirmDialog = $('<div class="confirmSaveChanges" title="'+ labels['MessageSaveChangesQuestionShort'] +'">'
                                                + '    <div class="message active">'+ labels['MessageSaveChanges'] +'</div>'
                                                + '    <p>'+ labels['MessageSaveChangesQuestion'] +'</p>'
                                                + '</div>');

                            confirmDialog.dialog({
                              resizable: false,
                              modal: true,
                              close: function() {
                                confirmDialog.remove();
                              },
                              buttons: {
                                'Yes': function() {

                                    // TODO: Show saving indicator in dialog

                                    FrameTrail.module('HypervideoModel').save(function(){

                                        history.pushState({
                                            editMode: FrameTrail.getState('editMode')
                                        }, "", "#hypervideo=" + newHypervideoID);

                                        FrameTrail.changeState('editMode', false);

                                        confirmDialog.dialog('close');

                                        OverviewList.find('.hypervideoThumb.activeHypervideo').removeClass('activeHypervideo');
                                        OverviewList.find('.hypervideoThumb[data-hypervideoid="'+ newHypervideoID +'"]').addClass('activeHypervideo');

                                        FrameTrail.module('HypervideoModel').updateHypervideo(newHypervideoID, true, update);

                                    });

                                },
                                'No, discard': function() {

                                    FrameTrail.changeState('unsavedChanges', false);

                                    confirmDialog.dialog('close');

                                    // TODO: Reload new hypervideo
                                    window.location.reload();

                                },
                                Cancel: function() {
                                  confirmDialog.dialog('close');
                                }
                              }
                            });



                        } else {

                            OverviewList.find('.hypervideoThumb.activeHypervideo').removeClass('activeHypervideo');
                            OverviewList.find('.hypervideoThumb[data-hypervideoid="'+ newHypervideoID +'"]').addClass('activeHypervideo');

                            history.pushState({
                                editMode: FrameTrail.getState('editMode')
                            }, "", "#hypervideo=" + newHypervideoID);

                            if ( FrameTrail.getState('editMode') ) {

                                FrameTrail.changeState('editMode', false);

                                FrameTrail.module('HypervideoModel').updateHypervideo(newHypervideoID, true, update);

                            } else {

                                FrameTrail.module('HypervideoModel').updateHypervideo(newHypervideoID, false, update);

                            }

                        }



                    }


                    //TODO END




                });

                OverviewList.append(thumb);

            }


        }

        listWidthState = false;
        changeViewSize();
        OverviewList.find('.hypervideoThumb').css('transition-duration', '');

    }


    /**
     * Description
     * @method toggleSidebarOpen
     * @param {} opened
     * @return
     */
    function toggleSidebarOpen(opened) {

        if ( FrameTrail.getState('viewMode') === 'overview' ) {
            changeViewSize();
        }

    };


    /**
     * Description
     * @method changeViewSize
     * @param {} arrayWidthAndHeight
     * @return
     */
    function changeViewSize(arrayWidthAndHeight) {

        if ( FrameTrail.getState('viewMode') != 'overview' ) return;

        var overviewListHeight = $(FrameTrail.getState('target')).find('.mainContainer').outerHeight()
                                    - (FrameTrail.getState('editMode') ? 24 : 0),
            overviewListWidth = $(FrameTrail.getState('target')).width()
                                    - (FrameTrail.getState('sidebarOpen') ? $(FrameTrail.getState('target')).find('.sidebar').width() : 0);

        OverviewList.height( overviewListHeight );

        if ( overviewListWidth >= 1400 && listWidthState != 1400 ) {

            listWidthState = 1400;

            OverviewList.find('.hypervideoThumb').css({
                height: 220 + 'px',
                margin: 0.8 + '%',
                width: 23 + '%'
            });

        } else if ( overviewListWidth >= 1220 && overviewListWidth < 1400 && listWidthState != 1220 ) {

            listWidthState = 1220;

            OverviewList.find('.hypervideoThumb').css({
                height: 190 + 'px',
                margin: 0.8 + '%',
                width: 23 + '%'
            });

        } else if ( overviewListWidth >= 1010 && overviewListWidth < 1220 && listWidthState != 1010 ) {

            listWidthState = 1010;

            OverviewList.find('.hypervideoThumb').css({
                height: 160 + 'px',
                margin: 0.7 + '%',
                width: 23 + '%'
            });

        } else if ( overviewListWidth >= 900 && overviewListWidth < 1010 && listWidthState != 900 ) {

            listWidthState = 900;

            OverviewList.find('.hypervideoThumb').css({
                height: 180 + 'px',
                margin: 1 + '%',
                width: 30.6 + '%'
            });

        } else if ( overviewListWidth >= 720 && overviewListWidth < 900 && listWidthState != 720 ) {

            listWidthState = 720;

            OverviewList.find('.hypervideoThumb').css({
                height: 160 + 'px',
                margin: 1 + '%',
                width: 30.6 + '%'
            });

        } else if ( overviewListWidth >= 620 && overviewListWidth < 720 && listWidthState != 620 ) {

            listWidthState = 620;

            OverviewList.find('.hypervideoThumb').css({
                height: 140 + 'px',
                margin: 1 + '%',
                width: 30.6 + '%'
            });

        } else if ( overviewListWidth <= 620 && listWidthState != 400 ) {

            listWidthState = 400;

            OverviewList.find('.hypervideoThumb').css({
                height: 120 + 'px',
                margin: 1.2 + '%',
                width: 46.4 + '%'
            });

        }

        OverviewList.perfectScrollbar('update');

    };


    /**
     * Description
     * @method toggleFullscreen
     * @param {} aBoolean
     * @return
     */
    function toggleFullscreen(aBoolean) {


    };


    /**
     * Description
     * @method toogleUnsavedChanges
     * @param {} aBoolean
     * @return
     */
    function toogleUnsavedChanges(aBoolean) {


    };


    /**
     * Description
     * @method toggleViewMode
     * @param {} viewMode
     * @return
     */
    function toggleViewMode(viewMode) {

        if (viewMode === 'overview') {
            listWidthState = false;
            changeViewSize();
            domElement.addClass('active');
            FrameTrail.module('Titlebar').title = labels['GenericOverview'];
        } else if (viewMode != 'resources') {
            domElement.removeClass('active');
        }

    };


    /**
     * Description
     * @method toggleEditMode
     * @param {} editMode
     * @return
     */
    function toggleEditMode(editMode) {

        if (editMode) {

        } else {

        }

        initList();

    };


    /**
     * Description
     * @method updateUserLogin
     * @return
     */
    function updateUserLogin(){

        initList();

    };


    /**
     * Description
     * @method refreshList
     * @return
     */
    function refreshList(){

        initList();

    };


    return {

        onChange: {
            sidebarOpen:    toggleSidebarOpen,
            viewSize:       changeViewSize,
            fullscreen:     toggleFullscreen,
            viewMode:       toggleViewMode,
            editMode:       toggleEditMode,

            loggedIn:       updateUserLogin
        },

        create:      create,
        refreshList: refreshList

    };

});
