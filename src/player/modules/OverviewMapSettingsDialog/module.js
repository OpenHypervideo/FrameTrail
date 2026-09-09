/**
 * @module Player
 */

/**
 * I am the OverviewMapSettingsDialog. I edit the overview map's background
 * image, how that background is fitted to the viewport, and the colour behind
 * it.
 *
 * These used to live in the admin settings dialog, next to the instance
 * settings, because that is where they were stored. They are not settings
 * though — they are the map itself, and the marker coordinates only mean
 * anything against the background they were placed on. Now that the whole map
 * is one document in hypervideos/_index.json, its parts are edited in one
 * place, written through one save path, and covered by one lock.
 *
 * I am reachable only from map editing, so whoever opens me already holds that
 * lock. What presentation the overview uses at all — grid or map — stays in
 * the admin settings dialog: that really is a setting.
 *
 * @class OverviewMapSettingsDialog
 * @static
 */

FrameTrail.defineModule('OverviewMapSettingsDialog', function(FrameTrail){

    var labels = FrameTrail.module('Localization').labels;

    // The same checkerboard the hotspot editor uses behind its colour swatch,
    // so "no colour set" reads as transparent rather than as black.
    var CHECKERBOARD = 'background-image:'
                     + 'linear-gradient(45deg,#bbb 25%,transparent 25%),'
                     + 'linear-gradient(-45deg,#bbb 25%,transparent 25%),'
                     + 'linear-gradient(45deg,transparent 75%,#bbb 75%),'
                     + 'linear-gradient(-45deg,transparent 75%,#bbb 75%);'
                     + 'background-size:8px 8px;background-position:0 0,0 4px,4px -4px,-4px 0;background-color:#fff;';


    /**
     * I open the map settings dialog.
     *
     * @method open
     */
    function open() {

        var database = FrameTrail.module('Database'),
            mapData  = database.overviewMap;

        var selectedBackground      = mapData.background || '',
            selectedBackgroundColor = mapData.backgroundColor || '',
            selectedFit             = (mapData.fit === 'cover') ? 'cover' : 'contain';

        var _w = document.createElement('div');
        _w.innerHTML = '<div class="overviewMapSettingsDialog">'
                     + '    <div class="layoutRow">'
                     + '        <div class="column-6">'
                     + '            <label>'+ labels['SettingsOverviewMapBackground'] +'</label>'
                     + '            <div class="message active">'+ labels['MessageOverviewMapNoBackground'] +'</div>'
                     + '            <div class="posterFrameList overviewMapBackgroundList"></div>'
                     + '        </div>'
                     + '        <div class="column-6">'
                     + '            <label for="overviewMapFit">'+ labels['SettingsOverviewMapFit'] +'</label>'
                     + '            <div class="custom-select">'
                     + '                <select id="overviewMapFit" class="overviewMapFitSelect">'
                     + '                    <option value="contain"'+ (selectedFit === 'contain' ? ' selected' : '') +'>'+ labels['SettingsOverviewMapFitContain'] +'</option>'
                     + '                    <option value="cover"'+ (selectedFit === 'cover' ? ' selected' : '') +'>'+ labels['SettingsOverviewMapFitCover'] +'</option>'
                     + '                </select>'
                     + '            </div>'
                     + '            <div class="message active">'+ labels['MessageOverviewMapCrop'] +'</div>'
                     + '            <label for="overviewMapBackgroundColor">'+ labels['SettingsOverviewMapBackgroundColor'] +'</label>'
                     + '            <div style="display:flex; align-items:center; gap:5px;">'
                     + '                <span class="overviewMapBgSwatchWrap" style="'+ CHECKERBOARD +' display:inline-flex; border-radius:3px; overflow:hidden; width: calc(100% - 50px);">'
                     + '                    <input type="color" id="overviewMapBackgroundColor" class="overviewMapBackgroundColor" value="'+ (selectedBackgroundColor || '#000000') +'">'
                     + '                </span>'
                     + '                <button type="button" class="overviewMapBackgroundClear" title="'+ labels['GenericTransparent'] +'" style="'+ CHECKERBOARD +' width:26px; height:26px; padding:0; border:1px solid var(--primary-bg-color); border-radius:3px; cursor:pointer;"></button>'
                     + '            </div>'
                     + '            <div class="message active">'+ labels['MessageOverviewMap'] +'</div>'
                     + '        </div>'
                     + '    </div>'
                     + '</div>';
        var dialogContent = _w.firstElementChild;

        var backgroundList = dialogContent.querySelector('.overviewMapBackgroundList');

        FrameTrail.module('ResourceManager').renderList(backgroundList, true, 'type', 'contains', ['image']);

        // The list renders asynchronously and fades in, so the current
        // selection can only be marked once the loading screen is gone. The
        // attempt count keeps the poll from running forever when the list never
        // loads, or when the dialog is closed before it does.
        if (selectedBackground) {
            var attemptsLeft = 100,
                checkLoaded  = setInterval(function() {
                    if (backgroundList.querySelector('.loadingScreen')) {
                        if (--attemptsLeft > 0) return;
                        clearInterval(checkLoaded);
                        return;
                    }
                    clearInterval(checkLoaded);
                    backgroundList.querySelectorAll('.resourceThumb').forEach(function(thumb) {
                        var resource = database.resources[thumb.dataset.resourceid];
                        if (resource && resource.src === selectedBackground) {
                            thumb.classList.add('selected');
                        }
                    });
                }, 100);
        }

        // Click a selected image again to clear the background.
        dialogContent.addEventListener('click', function(evt) {
            if (evt.target.closest('.resourceEditButton')) return;
            var thumb = evt.target.closest('.overviewMapBackgroundList .resourceThumb');
            if (!thumb) return;

            var wasSelected = thumb.classList.contains('selected');

            backgroundList.querySelectorAll('.resourceThumb').forEach(function(el) { el.classList.remove('selected'); });

            if (wasSelected) {
                selectedBackground = '';
            } else {
                var resource = database.resources[thumb.dataset.resourceid];
                thumb.classList.add('selected');
                selectedBackground = resource ? resource.src : '';
            }
        });

        dialogContent.querySelector('.overviewMapFitSelect').addEventListener('change', function() {
            selectedFit = this.value;
        });

        var colorInput = dialogContent.querySelector('.overviewMapBackgroundColor'),
            colorClear = dialogContent.querySelector('.overviewMapBackgroundClear');

        // The picker sits over a checkerboard; fading it when nothing is set
        // lets the checkerboard show through, which reads as "no colour".
        function syncColorSwatch() {
            colorInput.style.opacity = selectedBackgroundColor ? '1' : '0.25';
            if (selectedBackgroundColor) { colorInput.value = selectedBackgroundColor; }
        }

        syncColorSwatch();

        colorInput.addEventListener('change', function() {
            selectedBackgroundColor = this.value;
            syncColorSwatch();
        });

        colorClear.addEventListener('click', function(evt) {
            evt.preventDefault();
            evt.stopPropagation();
            if (!selectedBackgroundColor) return;
            selectedBackgroundColor = '';
            syncColorSwatch();
        });

        var dialogCtrl = Dialog({
            title:     labels['SettingsOverviewMapSettings'],
            content:   dialogContent,
            modal:     true,
            resizable: false,
            width:     900,
            height:    600,
            close: function() {
                dialogCtrl.destroy();
            },
            buttons: [
                { text: labels['GenericApply'] || labels['GenericSaveChanges'],
                  class: 'applyMapSettingsButton',
                  click: function() { apply(dialogCtrl); }
                },
                { text: labels['GenericCancel'],
                  click: function() { dialogCtrl.close(); }
                }
            ]
        });

        /**
         * I write the three values into the map document and save it.
         */
        function apply(ctrl) {

            var map = database.overviewMap;

            map.background      = selectedBackground;
            map.backgroundColor = selectedBackgroundColor;
            map.fit             = selectedFit;

            FrameTrail.module('InterfaceModal').showStatusMessage(labels['MessageStateSaving']);

            database.saveOverviewMap(function(result) {

                FrameTrail.module('InterfaceModal').hideMessage(500);

                if (!result || !result.success) {
                    FrameTrail.module('InterfaceModal').showErrorMessage(labels['MessageOverviewMapSaveFailed']);
                    FrameTrail.module('InterfaceModal').hideMessage(4000);
                    console.error('FrameTrail: could not save the overview map settings:', result && result.error);
                    return;
                }

                var Collaboration = FrameTrail.module('Collaboration');
                if (Collaboration) {
                    Collaboration.acknowledgeVersion(result.version, 'library', 'global');
                }

                // Nothing observes the map document, so the canvas is told
                // explicitly rather than waiting for a page reload.
                var ViewOverview = FrameTrail.module('ViewOverview'),
                    mapModule    = (ViewOverview && ViewOverview.getMap) ? ViewOverview.getMap() : null;
                if (mapModule && mapModule.reload) mapModule.reload();

                ctrl.close();

            });

        }

    }


    return {

        open: open

    };

});
