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
     * @param {Object} options Optional. `exclude` is a list of hypervideo IDs
     *                         to leave out of the list (e.g. ones already
     *                         placed on the overview map).
     */
    function openPicker(callback, options) {

        var exclude = (options && Array.isArray(options.exclude))
                        ? options.exclude.map(String)
                        : [];

        var hypervideos = FrameTrail.module('Database').hypervideos,
            admin = FrameTrail.module('UserManagement').userRole === 'admin',
            currentHypervideoID = FrameTrail.module('RouteNavigation').hypervideoID;

        // Create dialog container
        var pickerDialog = document.createElement('div');
        pickerDialog.className = 'hypervideoPickerDialog';
        pickerDialog.innerHTML = '<div class="hypervideoPickerList"></div>';
        var pickerList = pickerDialog.querySelector('.hypervideoPickerList');

        // Declare ctrl before the loop so click handlers can reference it via closure
        var pickerDialogCtrl;

        // Render hypervideo thumbs
        for (var id in hypervideos) {
            var owner = hypervideos[id].creatorId === FrameTrail.module('UserManagement').userID;

            if (exclude.indexOf(String(id)) !== -1) continue;

            // Show hypervideo if not hidden, or if user is owner/admin
            if (!hypervideos[id].hidden || owner || admin) {

                // One entry with incomplete data used to take the whole picker
                // with it: this loop runs before the dialog is opened, so a
                // throw here left the caller's button looking dead. Skip the
                // entry, say so, and show the rest.
                try {

                    var hypervideo = FrameTrail.newObject('Hypervideo', hypervideos[id]);
                    var thumb = hypervideo.renderThumb();

                    // Mark current hypervideo
                    if (thumb.dataset.hypervideoid == currentHypervideoID) {
                        thumb.classList.add('activeHypervideo');
                    }

                    // Add selection behavior (hypervideoIcon has no listeners in vanilla renderThumb)
                    thumb.querySelector('.hypervideoIcon').style.cursor = 'pointer';

                    thumb.addEventListener('click', function(evt) {
                        evt.preventDefault();
                        evt.stopPropagation();

                        var selectedHypervideoID = this.dataset.hypervideoid;

                        // Close dialog
                        pickerDialogCtrl.close();

                        // Call callback with selected hypervideo ID
                        if (callback && typeof callback === 'function') {
                            callback(selectedHypervideoID);
                        }
                    });

                    pickerList.append(thumb);

                } catch (exception) {
                    console.error('FrameTrail: could not render hypervideo ' + id + ' in the picker:', exception);
                }

            }
        }

        // Open dialog - CSS Grid handles responsive layout automatically
        pickerDialogCtrl = Dialog({
            title:     labels['HypervideoPickerTitle'],
            content:   pickerDialog,
            resizable: true,
            width:     900,
            height:    600,
            modal:     true,
            close: function() {
                pickerDialogCtrl.destroy();
            }
        });


    }

    return {
        openPicker: openPicker
    };

});
