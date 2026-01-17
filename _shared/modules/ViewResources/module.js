/**
 * @module Shared
 */


/**
 * I am the ViewResources. I render an user interface which allows the user to add, edit and delete all types of resources which are stored on the server.
 *
 * @class ViewResources
 * @static
 */



FrameTrail.defineModule('ViewResources', function(FrameTrail){

	var labels = FrameTrail.module('Localization').labels;

    var domElement = $(    '<div class="viewResources" title="'+ labels['ResourcesManage'] +'">'
                        +  '    <div class="resourcesControls">'
                        +  '        <button class="resourceUpload"><span class="icon-doc-new"></span>'+ labels['GenericAddNew'] +'</button>'
                        +  '        <button class="resourceDelete"><span class="icon-trash"></span>'+ labels['GenericDelete'] +'</button>'
                        +  '        <button class="resourceDeleteConfirm">'+ labels['GenericConfirmDelete'] +'</button>'
                        +  '        <div class="viewControls">'
                        +  '            <button class="viewToggle" data-view="grid-medium" title="Grid View"><span class="icon-th"></span></button>'
                        +  '            <button class="viewToggle" data-view="list" title="List View"><span class="icon-list"></span></button>'
                        +  '        </div>'
                        +  '        <div class="message"></div>'
                        +  '        <div style="clear: both;"></div>'
                        +  '    </div>'
                        +  '    <div class="resourcesFilter">'
                        +  '        <input id="cbAll" name="ResourceFilterType" type="radio" value="ALL" checked /><label for="cbAll">'+ labels['ResourceTypesAll'] +'</label>'
                        +  '        <input id="cbVideo" name="ResourceFilterType" type="radio" value="video" /><label for="cbVideo">'+ labels['ResourceTypeVideo'] +'</label>'
                        +  '        <input id="cbImage" name="ResourceFilterType" type="radio" value="image" /><label for="cbImage">'+ labels['ResourceTypeImage'] +'</label>'
                        +  '        <input id="cbPDF" name="ResourceFilterType" type="radio" value="pdf" /><label for="cbPDF">'+ labels['ResourceTypePDF'] +'</label>'
                        +  '        <input id="cbAudio" name="ResourceFilterType" type="radio" value="audio" /><label for="cbAudio">'+ labels['ResourceTypeAudio'] +'</label>'
                        +  '        <input id="cbWebpage" name="ResourceFilterType" type="radio" value="webpage" /><label for="cbWebpage">'+ labels['ResourceTypeWebpage'] +'</label>'
                        +  '        <input id="cbLocation" name="ResourceFilterType" type="radio" value="location" /><label for="cbLocation">'+ labels['ResourceTypeLocation'] +'</label>'
                        +  '        <input id="cbWikipedia" name="ResourceFilterType" type="radio" value="wikipedia" /><label for="cbWikipedia">'+ labels['ResourceTypeWikipedia'] +'</label>'
                        +  '        <input id="cbYoutube" name="ResourceFilterType" type="radio" value="youtube" /><label for="cbYoutube">'+ labels['ResourceTypeYoutube'] +'</label>'
                        +  '        <input id="cbVimeo" name="ResourceFilterType" type="radio" value="vimeo" /><label for="cbVimeo">'+ labels['ResourceTypeVimeo'] +'</label>'
                        +  '        <div class="resourcesCheckboxes">'
                        +  '            <input type="checkbox" id="onlyCC" name="onlyCC" /><label for="onlyCC">'+ labels['ResourceTypesOnlyCC'] +'</label>'
                        +  '        </div>'
                        +  '    </div>'
                        +  '    <div class="resourcesList view-grid-medium"></div>'
                        +  '</div>'),


        ResourcesControls      = domElement.find('.resourcesControls'),
        ResourcesFilter        = domElement.find('.resourcesFilter'),
        ResourcesList          = domElement.find('.resourcesList'),
        ResourceUpload         = domElement.find('.resourceUpload'),
        ResourceDelete         = domElement.find('.resourceDelete'),
        ResourceDeleteConfirm  = domElement.find('.resourceDeleteConfirm'),

        deleteActive     = false,

        callback,
        showAsDialog;



    ResourceUpload.click(function(){
        FrameTrail.module('ResourceManager').uploadResource(updateList);
    });

    ResourceDelete.click(toggleDeleteMode);

    ResourceDeleteConfirm.hide();
    ResourceDeleteConfirm.click(function(){
        executeDelete();
    });

    domElement.find('input[name=ResourceFilterType]').change(updateList);

    domElement.find('input[name=onlyCC]').change( function (evt) {
     if ($(this).is(':checked')) {
        ResourcesList.addClass('onlyCC');
     } else {
        ResourcesList.removeClass('onlyCC');
     }
    });

    // View toggle functionality
    domElement.find('.viewToggle').click(function() {
        var viewMode = $(this).data('view');

        // Remove all view classes
        ResourcesList.removeClass('view-grid-small view-grid-medium view-grid-large view-list');

        // Add selected view class
        ResourcesList.addClass('view-' + viewMode);

        // Update active state on buttons
        domElement.find('.viewToggle').removeClass('active');
        $(this).addClass('active');
    });

    // Set initial active state for grid view button
    domElement.find('.viewToggle[data-view="grid-medium"]').addClass('active');





    /**
     * I am called during init process. I prepare the DOM element and append it to the div with the id #MainContainer.
     * My parameter indicates, wether I should be shown in a jqueryUI dialog (for embbed use) or wether I am a "fullscreen" element
     * for use in a stand-alone environment.
     * @method create
     * @param {String} withoutDialog
     */
    function create(withoutDialog) {

        showAsDialog = ! withoutDialog;

        if (showAsDialog) {

            $(FrameTrail.getState('target')).find('.mainContainer').append(domElement);

            domElement.dialog({
                autoOpen: false,
                width: 954,
                height: 600,
                modal: true,
                close: function() {

                    domElement.dialog('close');

                    callback && callback.call();

                }
            });

        } else {
            
            var wrapperElem = $('<div class="resourceManagerContent"></div>');
            
            wrapperElem.append(domElement)
            $(FrameTrail.getState('target')).find('.mainContainer').append(wrapperElem);
        }

        FrameTrail.changeState('viewSize', FrameTrail.getState('viewSize'));

    };


    /**
     * I render the list of resource items. I check the radio boxes for the type of resources which shall be shown and call
     * {{#crossLink "ResourceManager/renderList:method"}}ResourceManager/renderList(){{/crossLink}}).
     * @method updateList
     * @return
     */
    function updateList() {

        var type = domElement.find('input[name=ResourceFilterType]:checked').val();

        if (type === 'ALL') {

            FrameTrail.module('ResourceManager').renderList(ResourcesList, false);

        } else {

            FrameTrail.module('ResourceManager').renderList(ResourcesList, true,
                'type',
                'contains',
                type
            );

        }

    }

    /**
     * I activate or deactivate the delete functionality, according to the module variable deleteActive {Boolean}.
     *
     * When "delete" is active, the resources' thumbs are selectable for deletion, and a "Confirm deletion" button appears.
     *
     * @method toggleDeleteMode
     */
    function toggleDeleteMode() {

        if (deleteActive) {

            ResourceDelete.html('<span class="icon-trash"></span>'+ labels['GenericDelete']).removeClass('active');
            ResourceDeleteConfirm.hide();
            ResourcesList.children('.resourceThumb').removeClass('markedForDeletion').unbind('click');
            deleteActive = false;

            ResourcesControls.find('.message').text('').removeClass('active');

        } else {

            ResourceDelete.html(labels['GenericCancel']).addClass('active');
            ResourceDeleteConfirm.show();
            ResourcesList.children('.resourceThumb').click(function(evt){
                $(evt.currentTarget).toggleClass('markedForDeletion');
            });
            deleteActive = true;

            ResourcesControls.find('.message').text(labels['MessageSelectResourcesToDelete']).removeClass('error').addClass('active');

        }

    }

    /**
     * I execute the deletion of all resources selected by the user.
     * @method executeDelete
     */
    function executeDelete() {

        FrameTrail.module('UserManagement').ensureAuthenticated(function(){

            ResourcesControls.find('.message').text('').removeClass('active');

            var deleteCollection   = [],
                callbackCollection = [];
            ResourcesList.children('.resourceThumb.markedForDeletion').each(function(){
				deleteCollection.push(this.getAttribute('data-resourceid'));
				//deleteCollection.push($(this).data('resourceId'));
            });

            for (var i in deleteCollection) {
                FrameTrail.module('ResourceManager').deleteResource(
                    deleteCollection[i],
                    function(){
                        callbackCollection.push(true);
                        deletionFinished();
                    },
                    function(data){
                        ResourcesControls.find('.message').addClass('error active').text(data.string);
                        callbackCollection.push(false);
                        deletionFinished();
                    }
                );

            }


            function deletionFinished() {

                if (callbackCollection.length !== deleteCollection.length) return;

                // delete finished;
                // callbackCollection contains true/false for success/fail

                if (callbackCollection[0] == true) {
                    updateList();
				    toggleDeleteMode();
                }

            }

        });

    }




    /**
     * I show the DOM element to the user and (optionally) set a callback, when I was opened not as a stand-alone element, but inside a jQuery UI dialog.
     * @method open
     * @param {Function} closeCallback
     */
    function open(closeCallback) {

        updateList();

        if (showAsDialog) {
            callback = closeCallback;
            domElement.dialog('open');
        } else {
            domElement.removeAttr('title');
        }

        FrameTrail.changeState('viewSize', FrameTrail.getState('viewSize'));




    }


    /**
     * I react to a change in the global state "viewSize"
     * @method changeViewSize
     * @param {Array} arrayWidthAndHeight
     */
    function changeViewSize(arrayWidthAndHeight) {

        

    }







   	return {

   		onChange: {
            viewSize: changeViewSize
        },

   		create: create,
        open: open

   	};

});
