/**
 * @module Shared
 */

/**
 * I am the HypervideoPicker.
 * I provide a reusable dialog component for selecting hypervideos.
 *
 * @class HypervideoPicker
 * @static
 */

FrameTrail.defineModule('HypervideoPicker', function(FrameTrail){

    var labels = FrameTrail.module('Localization').labels;

    /**
     * Opens a dialog with a list of hypervideos for selection.
     * When a hypervideo is clicked, the callback is called with the hypervideo ID.
     *
     * @method openPicker
     * @param {Function} callback Function called with hypervideoID when a hypervideo is selected
     */
    function openPicker(callback) {

        var hypervideos = FrameTrail.module('Database').hypervideos,
            admin = FrameTrail.module('UserManagement').userRole === 'admin',
            currentHypervideoID = FrameTrail.module('RouteNavigation').hypervideoID;

        // Create dialog container
        var pickerDialog = $('<div class="hypervideoPickerDialog" title="'+ labels['HypervideoPickerTitle'] +'">'
                            + '    <div class="hypervideoPickerList"></div>'
                            + '</div>'),
            pickerList = pickerDialog.find('.hypervideoPickerList');

        // Initialize perfect scrollbar
        pickerList.perfectScrollbar({
            wheelSpeed: 4,
            suppressScrollX: true,
            wheelPropagation: true
        });

        // Clear any existing thumbs
        pickerList.find('.hypervideoThumb').remove();

        // Render hypervideo thumbs
        for (var id in hypervideos) {
            var owner = hypervideos[id].creatorId === FrameTrail.module('UserManagement').userID;

            // Show hypervideo if not hidden, or if user is owner/admin
            if (!hypervideos[id].hidden || owner || admin) {
                var hypervideo = FrameTrail.newObject('Hypervideo', hypervideos[id]);
                var thumb = hypervideo.renderThumb();

                // Mark current hypervideo
                if (thumb.attr('data-hypervideoid') == currentHypervideoID) {
                    thumb.addClass('activeHypervideo');
                }

                // Remove the default click behavior and add selection behavior
                thumb.find('.hypervideoIcon').off('click');
                thumb.find('.hypervideoIcon').css('cursor', 'pointer');
                
                thumb.click(function(evt) {
                    evt.preventDefault();
                    evt.stopPropagation();

                    var selectedHypervideoID = $(this).attr('data-hypervideoid');
                    
                    // Close dialog
                    pickerDialog.dialog('close');
                    
                    // Call callback with selected hypervideo ID
                    if (callback && typeof callback === 'function') {
                        callback(selectedHypervideoID);
                    }
                });

                pickerList.append(thumb);
            }
        }

        // Open dialog - CSS Grid handles responsive layout automatically
        pickerDialog.dialog({
            resizable: true,
            width: 900,
            height: 600,
            modal: true,
            close: function() {
                pickerDialog.remove();
            }
        });

        // Update scrollbar after dialog is shown
        setTimeout(function() {
            pickerList.perfectScrollbar('update');
        }, 100);
    }

    return {
        openPicker: openPicker
    };

});
