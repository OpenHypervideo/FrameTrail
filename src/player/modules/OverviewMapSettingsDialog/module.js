/**
 * @module Player
 */

/**
 * I am the OverviewMapSettingsDialog. I edit the overview map's background
 * image, how that background is fitted to the viewport, the colour and padding
 * around it, and what the pins on it look like.
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
     * A shortlist of map-pin glyphs from the icon font.
     *
     * The caption on each card is the class name itself, which doubles as the
     * documentation for the free-text field below them — and saves a dozen
     * locale keys that could only ever have restated an icon.
     */
    var PIN_ICONS = ['icon-hypervideo', 'icon-play', 'icon-play-circled',
                     'icon-play-circled2-1', 'icon-video-circled', 'icon-location',
                     'icon-location-circled', 'icon-dot-circled'];

    // Used only if the canvas cannot be reached to ask (a partial deploy),
    // where falling back beats throwing inside a dialog nobody can then close.
    var FALLBACK_ANIMATIONS = ['ripple', 'pulse', 'scale', 'wobble', 'glow'];


    /**
     * I hand back the map canvas, which owns the two rules I have to agree
     * with: which animations exist, and what an icon class may look like.
     *
     * I am only reachable from map editing, so it is always there.
     *
     * @method getMapModule
     * @return {Object|null}
     */
    function getMapModule() {

        var ViewOverview = FrameTrail.module('ViewOverview');

        return (ViewOverview && ViewOverview.getMap) ? ViewOverview.getMap() : null;

    }


    /**
     * I mark the card carrying a value, and no card at all when none does —
     * which is exactly what a hand-typed icon name looks like.
     *
     * @method markOptionCard
     * @param {HTMLElement} wrapper an .optionCards element
     * @param {String} value
     */
    function markOptionCard(wrapper, value) {

        wrapper.querySelectorAll(':scope > div[data-value]').forEach(function(card) {
            card.classList.toggle('active', card.getAttribute('data-value') === value);
        });

        wrapper.setAttribute('data-value', value);

    }


    /**
     * I build the miniature that goes in an option card's thumb.
     *
     * It is not a schematic: it is a real .overviewMap containing a real
     * .overviewMapMarker, so every rule the canvas uses applies to it
     * unchanged and a card can never end up advertising something the map does
     * not do. The pin is given its geometry inline, exactly as layoutMarkers()
     * gives a real pin its own.
     *
     * @method buildPinPreview
     * @param {Object} options { animation, style, icon, size }
     * @return {HTMLElement}
     */
    function buildPinPreview(options) {

        var size = options.size || 22;

        // .overviewMapPreview marks this as a pin standing on the dialog's own
        // ground rather than on a background image, which is what the canvas's
        // inverted pin palette assumes — see the preview block in
        // ViewOverviewMap/style.css.
        var preview = document.createElement('div');
        preview.className = 'overviewMap overviewMapPreview'
                          + ((options.animation && options.animation !== 'none') ? ' pinAnimation-' + options.animation : '')
                          + ((options.style === 'icon') ? ' pinStyle-icon' : '');

        var pin = document.createElement('div');
        pin.className = 'overviewMapMarker';
        pin.style.left     = '50%';
        pin.style.top      = '50%';
        pin.style.width    = size + 'px';
        pin.style.height   = size + 'px';
        pin.style.fontSize = size + 'px';

        var body = document.createElement('div');
        body.className = 'overviewMapMarkerBody';

        if (options.style === 'icon') {
            var glyph = document.createElement('span');
            glyph.className = 'overviewMapMarkerIcon ' + options.icon;
            body.append(glyph);
        } else {
            // Stands in for a hypervideo thumbnail without needing one.
            body.style.backgroundImage = 'linear-gradient(135deg, var(--secondary-fg-color), var(--primary-fg-color))';
        }

        pin.append(body);
        preview.append(pin);

        return preview;

    }


    /**
     * I open the map settings dialog.
     *
     * @method open
     */
    function open() {

        var database  = FrameTrail.module('Database'),
            mapData   = database.overviewMap,
            mapModule = getMapModule();

        var sanitizeIconClass = (mapModule && mapModule.sanitizeIconClass)
                                    ? mapModule.sanitizeIconClass
                                    : function(value) { return String(value || 'icon-location-2'); };

        // The canvas's list plus the option it has no class for: "none" is the
        // absence of an animation, not one of them.
        var animations = ['none'].concat((mapModule && mapModule.pinAnimations) || FALLBACK_ANIMATIONS);

        var selectedBackground      = mapData.background || '',
            selectedBackgroundColor = mapData.backgroundColor || '',
            selectedFit             = (mapData.fit === 'cover') ? 'cover' : 'contain',
            selectedPadding         = (function(value) {
                                          return (isFinite(value) && value > 0) ? value : 0;
                                      })(parseFloat(mapData.padding)),
            selectedPaddingUnit     = (mapData.paddingUnit === 'px') ? 'px' : 'percent',
            selectedPinStyle        = (mapData.pinStyle === 'icon') ? 'icon' : 'thumb',
            selectedPinIcon         = sanitizeIconClass(mapData.pinIcon),
            selectedPinAnimation    = (animations.indexOf(mapData.pinAnimation) !== -1) ? mapData.pinAnimation : 'none';

        var _w = document.createElement('div');
        _w.innerHTML = '<div class="overviewMapSettingsDialog">'
                     + '    <div class="overviewMapSettingsTabs">'
                     + '        <ul>'
                     + '            <li><a href="#OverviewMapBackgroundPanel">'+ labels['SettingsOverviewMapTabBackground'] +'</a></li>'
                     + '            <li><a href="#OverviewMapPinsPanel">'+ labels['SettingsOverviewMapTabPins'] +'</a></li>'
                     + '        </ul>'
                     + '        <div id="OverviewMapBackgroundPanel">'
                     + '            <div class="layoutRow">'
                     + '                <div class="column-6">'
                     + '                    <label>'+ labels['SettingsOverviewMapBackground'] +'</label>'
                     + '                    <div class="message active">'+ labels['MessageOverviewMapNoBackground'] +'</div>'
                     + '                    <div class="posterFrameList overviewMapBackgroundList"></div>'
                     + '                </div>'
                     + '                <div class="column-6">'
                     + '                    <label for="overviewMapFit">'+ labels['SettingsOverviewMapFit'] +'</label>'
                     + '                    <div class="custom-select">'
                     + '                        <select id="overviewMapFit" class="overviewMapFitSelect">'
                     + '                            <option value="contain"'+ (selectedFit === 'contain' ? ' selected' : '') +'>'+ labels['SettingsOverviewMapFitContain'] +'</option>'
                     + '                            <option value="cover"'+ (selectedFit === 'cover' ? ' selected' : '') +'>'+ labels['SettingsOverviewMapFitCover'] +'</option>'
                     + '                        </select>'
                     + '                    </div>'
                     + '                    <div class="message active">'+ labels['MessageOverviewMapCrop'] +'</div>'
                     + '                    <label for="overviewMapPadding">'+ labels['SettingsOverviewMapPadding'] +'</label>'
                     + '                    <div style="display:flex; align-items:center; gap:5px;">'
                     + '                        <input type="number" id="overviewMapPadding" class="overviewMapPadding" min="0" step="1" value="'+ selectedPadding +'" style="flex:1 1 auto; min-width:0;">'
                     + '                        <div class="custom-select" style="flex:0 0 90px;">'
                     + '                            <select class="overviewMapPaddingUnit">'
                     + '                                <option value="percent"'+ (selectedPaddingUnit === 'percent' ? ' selected' : '') +'>%</option>'
                     + '                                <option value="px"'+ (selectedPaddingUnit === 'px' ? ' selected' : '') +'>px</option>'
                     + '                            </select>'
                     + '                        </div>'
                     + '                    </div>'
                     + '                    <div class="message active">'+ labels['MessageOverviewMapPadding'] +'</div>'
                     + '                    <label for="overviewMapBackgroundColor">'+ labels['SettingsOverviewMapBackgroundColor'] +'</label>'
                     + '                    <div style="display:flex; align-items:center; gap:5px;">'
                     + '                        <span class="overviewMapBgSwatchWrap" style="'+ CHECKERBOARD +' display:inline-flex; border-radius:3px; overflow:hidden; width: calc(100% - 50px);">'
                     + '                            <input type="color" id="overviewMapBackgroundColor" class="overviewMapBackgroundColor" value="'+ (selectedBackgroundColor || '#000000') +'">'
                     + '                        </span>'
                     + '                        <button type="button" class="overviewMapBackgroundClear" title="'+ labels['GenericTransparent'] +'" style="'+ CHECKERBOARD +' width:26px; height:26px; padding:0; border:1px solid var(--primary-bg-color); border-radius:3px; cursor:pointer;"></button>'
                     + '                    </div>'
                     + '                    <div class="message active">'+ labels['MessageOverviewMap'] +'</div>'
                     + '                </div>'
                     + '            </div>'
                     + '        </div>'
                     + '        <div id="OverviewMapPinsPanel">'
                     + '            <div class="layoutRow">'
                     // What a pin is made of on the left, how it behaves on the
                     // right. The icon picker belongs under the choice that
                     // turns it on, so it stays in the left column and is shown
                     // and hidden as one block.
                     + '                <div class="column-6">'
                     + '                    <label>'+ labels['SettingsOverviewMapPinContent'] +'</label>'
                     + '                    <div class="overviewMapPinStyleSelect optionCards" data-property="pinStyle" data-value="'+ selectedPinStyle +'"></div>'
                     + '                    <div class="overviewMapIconChoice">'
                     + '                        <label>'+ labels['SettingsOverviewMapPinIcon'] +'</label>'
                     + '                        <div class="overviewMapPinIconSelect optionCards" data-property="pinIcon" data-value="'+ selectedPinIcon +'"></div>'
                     + '                        <label for="overviewMapPinIconCustom">'+ labels['SettingsOverviewMapPinIconCustom'] +'</label>'
                     + '                        <div style="display:flex; align-items:center; gap:8px;">'
                     + '                            <input type="text" id="overviewMapPinIconCustom" class="overviewMapPinIconCustom" placeholder="icon-map" value="'+ selectedPinIcon +'" style="flex:1 1 auto; min-width:0;">'
                     + '                            <span class="overviewMapPinIconEcho optionCardThumb" style="flex:0 0 48px; width:48px; height:48px; border-radius:3px;"></span>'
                     + '                        </div>'
                     + '                        <div class="message active">'+ labels['MessageOverviewMapPinIcon'] +'</div>'
                     + '                    </div>'
                     + '                </div>'
                     + '                <div class="column-6">'
                     + '                    <label>'+ labels['SettingsOverviewMapPinAnimation'] +'</label>'
                     + '                    <div class="overviewMapPinAnimationSelect optionCards" data-property="pinAnimation" data-value="'+ selectedPinAnimation +'"></div>'
                     + '                </div>'
                     + '            </div>'
                     + '        </div>'
                     + '    </div>'
                     + '</div>';
        var dialogContent = _w.firstElementChild;

        FTTabs(dialogContent.querySelector('.overviewMapSettingsTabs'));

        /* Background image */

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

        /* Fit */

        dialogContent.querySelector('.overviewMapFitSelect').addEventListener('change', function() {
            selectedFit = this.value;
        });

        /* Padding */

        var paddingInput = dialogContent.querySelector('.overviewMapPadding'),
            paddingUnit  = dialogContent.querySelector('.overviewMapPaddingUnit');

        // 40 px and 40 % are not the same offer. The canvas clamps again at
        // render time, so this only stops somebody typing 5000 and watching
        // the map vanish.
        function syncPaddingMax() {
            paddingInput.max = (selectedPaddingUnit === 'px') ? '400' : '40';
        }

        syncPaddingMax();

        paddingInput.addEventListener('change', function() {
            var value = parseFloat(this.value);
            selectedPadding = (isFinite(value) && value > 0) ? value : 0;
            this.value = selectedPadding;
        });

        paddingUnit.addEventListener('change', function() {
            selectedPaddingUnit = (this.value === 'px') ? 'px' : 'percent';
            syncPaddingMax();
        });

        /* Background colour */

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

        /* Pins */

        var styleSelect     = dialogContent.querySelector('.overviewMapPinStyleSelect'),
            iconSelect      = dialogContent.querySelector('.overviewMapPinIconSelect'),
            animationSelect = dialogContent.querySelector('.overviewMapPinAnimationSelect'),
            iconChoice      = dialogContent.querySelector('.overviewMapIconChoice'),
            iconInput       = dialogContent.querySelector('.overviewMapPinIconCustom'),
            iconEcho        = dialogContent.querySelector('.overviewMapPinIconEcho');

        /**
         * I put one option card into a wrapper.
         *
         * @param {HTMLElement} wrapper
         * @param {String} value
         * @param {String} caption
         * @param {HTMLElement} preview
         * @param {Boolean} active
         * @param {Number} [thumbHeight] shorter than the default where there
         *                are many cards, so a picker of a dozen glyphs does
         *                not push what comes after it off the dialog
         */
        function appendOptionCard(wrapper, value, caption, preview, active, thumbHeight) {

            var card = document.createElement('div');
            card.setAttribute('data-value', value);
            if (active) card.classList.add('active');

            var thumb = document.createElement('div');
            thumb.className = 'optionCardThumb';
            if (thumbHeight) thumb.style.height = thumbHeight + 'px';
            thumb.append(preview);

            var label = document.createElement('span');
            label.textContent = caption;

            card.append(thumb, label);
            wrapper.append(card);

        }

        function renderStyleCards() {

            styleSelect.innerHTML = '';

            appendOptionCard(styleSelect, 'thumb', labels['SettingsOverviewMapPinContentThumb'],
                             buildPinPreview({ style: 'thumb' }),
                             selectedPinStyle === 'thumb');

            appendOptionCard(styleSelect, 'icon', labels['SettingsOverviewMapPinContentIcon'],
                             buildPinPreview({ style: 'icon', icon: selectedPinIcon }),
                             selectedPinStyle === 'icon');

            styleSelect.setAttribute('data-value', selectedPinStyle);

        }

        function renderIconCards() {

            iconSelect.innerHTML = '';

            PIN_ICONS.forEach(function(iconClass) {
                appendOptionCard(iconSelect, iconClass, iconClass,
                                 buildPinPreview({ style: 'icon', icon: iconClass, size: 26 }),
                                 iconClass === selectedPinIcon, 40);
            });

            iconSelect.setAttribute('data-value', selectedPinIcon);

        }

        /**
         * The animation cards preview the pin style that is actually selected,
         * so what they show is what the map will do — not a stand-in disc for
         * somebody who chose icons.
         */
        function renderAnimationCards() {

            animationSelect.innerHTML = '';

            animations.forEach(function(name) {
                appendOptionCard(animationSelect, name,
                                 labels['SettingsOverviewMapPinAnimation' + name.charAt(0).toUpperCase() + name.slice(1)],
                                 buildPinPreview({ animation: name, style: selectedPinStyle, icon: selectedPinIcon }),
                                 name === selectedPinAnimation);
            });

            animationSelect.setAttribute('data-value', selectedPinAnimation);

        }

        /**
         * The echo is the one honest test of a hand-typed name: a glyph the
         * font does not have renders as nothing, and nothing is what the pins
         * would then show.
         */
        function syncIconEcho() {

            iconEcho.innerHTML = '';
            iconEcho.append(buildPinPreview({ style: 'icon', icon: selectedPinIcon, size: 34 }));

        }

        function syncIconChoiceVisibility() {

            iconChoice.style.display = (selectedPinStyle === 'icon') ? '' : 'none';

        }

        /**
         * I find the card a click landed in, and only a card of my own: in
         * closest() a ':scope > …' selector would bind :scope to the element
         * closest() was called on, so it can never match. The parent check is
         * what makes it a direct child, as .optionCards requires.
         *
         * @param {HTMLElement} wrapper
         * @param {Event} evt
         * @return {HTMLElement|null}
         */
        function pickedCard(wrapper, evt) {

            var card = evt.target.closest('div[data-value]');

            return (card && card.parentElement === wrapper) ? card : null;

        }

        // Delegated, because every one of these groups is re-rendered whenever
        // a choice in another one changes its previews.
        styleSelect.addEventListener('click', function(evt) {
            var card = pickedCard(styleSelect, evt);
            if (!card) return;
            selectedPinStyle = card.getAttribute('data-value');
            markOptionCard(styleSelect, selectedPinStyle);
            syncIconChoiceVisibility();
            renderAnimationCards();
        });

        iconSelect.addEventListener('click', function(evt) {
            var card = pickedCard(iconSelect, evt);
            if (!card) return;
            selectedPinIcon = card.getAttribute('data-value');
            markOptionCard(iconSelect, selectedPinIcon);
            // Picking a card fills the field, so the two never disagree.
            iconInput.value = selectedPinIcon;
            syncIconEcho();
            renderStyleCards();
            renderAnimationCards();
        });

        animationSelect.addEventListener('click', function(evt) {
            var card = pickedCard(animationSelect, evt);
            if (!card) return;
            selectedPinAnimation = card.getAttribute('data-value');
            markOptionCard(animationSelect, selectedPinAnimation);
        });

        // The typed value is not rewritten while typing — that would fight the
        // caret. The cards simply stop matching, which is the honest state: a
        // custom name is not one of the offered ones.
        iconInput.addEventListener('input', function() {
            selectedPinIcon = sanitizeIconClass(this.value);
            markOptionCard(iconSelect, selectedPinIcon);
            syncIconEcho();
            renderStyleCards();
            renderAnimationCards();
        });

        iconInput.addEventListener('change', function() {
            // Normalized once the field is left, so what is saved is visibly
            // what was accepted.
            this.value = selectedPinIcon;
        });

        renderStyleCards();
        renderIconCards();
        renderAnimationCards();
        syncIconEcho();
        syncIconChoiceVisibility();

        var dialogCtrl = Dialog({
            title:     labels['SettingsOverviewMapSettings'],
            icon:      'icon-cog',
            content:   dialogContent,
            modal:     true,
            resizable: false,
            width:     900,
            // Taller than the background tab needs, so that the pins tab can
            // show the animation cards without scrolling past the icon grid.
            // The dialog is capped at 90vh, so a short window still fits.
            height:    680,
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
         * I write the edited values into the map document and save it.
         */
        function apply(ctrl) {

            var map = database.overviewMap;

            map.background      = selectedBackground;
            map.backgroundColor = selectedBackgroundColor;
            map.fit             = selectedFit;
            map.padding         = selectedPadding;
            map.paddingUnit     = selectedPaddingUnit;
            map.pinStyle        = selectedPinStyle;
            // Written even in thumbnail mode, so switching back to icons does
            // not lose the icon that was chosen.
            map.pinIcon         = sanitizeIconClass(selectedPinIcon);
            map.pinAnimation    = selectedPinAnimation;

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
                var mapModule = getMapModule();
                if (mapModule && mapModule.reload) mapModule.reload();

                ctrl.close();

            });

        }

    }


    return {

        open: open

    };

});
