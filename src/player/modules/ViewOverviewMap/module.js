/**
 * @module Player
 */

/**
 * I am the ViewOverviewMap.
 *
 * I render the "map" variant of the overview: a bounded, fit-to-view canvas
 * with a background image, onto which hypervideos are placed as circular pins.
 *
 * I am driven explicitly by {{#crossLink "ViewOverview"}}ViewOverview{{/crossLink}}
 * and deliberately register no onChange handlers of my own, because module
 * dispatch order is insertion order and would make the ordering between us
 * implicit.
 *
 * Geometry contract
 * -----------------
 * The stage element IS the background image's box: it is sized in px to the
 * aspect-preserving fit of the image inside the viewport, and the image is
 * stretched to fill it exactly. Pins are absolutely positioned children in %,
 * so `left: x%` and `top: y%` are literally normalized image coordinates and
 * stay locked to image features under both fit modes at any container size.
 *
 * Where my data lives
 * -------------------
 * In the "overviewMap" key of hypervideos/_index.json, reachable as
 * Database.overviewMap. It is content — which hypervideos are on the map and
 * where — so it belongs to the library, not to the instance settings. That is
 * also what lets me take the 'library' lock while editing instead of the
 * 'settings' one, so an admin arranging the map no longer blocks another
 * admin's settings dialog, and my saves cannot race theirs.
 *
 * Editing is an explicit mode of its own (setMapEditing), not a side effect of
 * the global edit mode: the lock is what stops two people dragging the same
 * pins, and it should only be held by somebody who is actually arranging the
 * map. Every change is written immediately, so there is no dirty state to
 * reconcile and nothing to lose to a mistimed refresh.
 *
 * @class ViewOverviewMap
 * @static
 */

FrameTrail.defineModule('ViewOverviewMap', function(FrameTrail){

    var labels = FrameTrail.module('Localization').labels;

    /**
     * Smallest rendered pin diameter. Below this a pin stops shrinking with the
     * canvas (it stays anchored, it just no longer scales) so it remains
     * tappable on small screens.
     */
    var MARKER_MIN_PX       = 32,

    /**
     * Diameter of a newly placed pin, as a percentage of stage width.
     */
        MARKER_DEFAULT_SIZE = 6,

    /**
     * Aspect ratio used before a background image has decoded, and when no
     * background image is set at all.
     */
        FALLBACK_BG_W       = 16,
        FALLBACK_BG_H       = 9,

    /**
     * Bound on the container-size-0 retry, so a permanently collapsed
     * container cannot leave a timer running for the life of the page.
     */
        MAX_LAYOUT_RETRIES  = 40,

    /**
     * How long a change waits before it is written. Long enough to collapse
     * the tail of a drag into one request, short enough that letting go of a
     * pin and closing the tab keeps the placement.
     */
        SAVE_DEBOUNCE_MS    = 400,

    /**
     * Smallest the padded inner box may become on either axis. A padding
     * wider than its container would give the stage a negative size, and
     * every pin percentage with it.
     */
        MIN_INNER_PX        = 40,

    /**
     * The pin animations the canvas knows how to run. Kept as a list so that
     * switching one on is switching every other one off, and so that a value
     * the canvas does not know simply animates nothing.
     */
        PIN_ANIMATIONS      = ['ripple', 'pulse', 'scale', 'wobble', 'glow'],

    /**
     * The glyph an icon pin falls back to when none is configured, or when
     * what is configured cannot be a class name.
     */
        DEFAULT_PIN_ICON    = 'icon-location-2';


    var MapRoot         = null,     // .overviewMap  — the viewport box
        MapFrame        = null,     // .overviewMapFrame — the padded inner box
        MapStage        = null,     // .overviewMapStage — the image box
        BackgroundImage = null,
        Popup           = null,
        Toolbar         = null,     // .overviewMapToolbar — shown while editing

        MarkerElements  = {},       // hypervideoID -> pin element
        openHandler     = null,     // set by ViewOverview.create()

        editModeActive  = false,    // the global edit mode
        mapEditActive   = false,    // this module's own "arrange the map" mode

        saveTimer       = null,
        saveFailed      = false,

        pendingAutoPlace   = false,
        autoPlaceKnownIDs  = null,

        resizeObserver  = null,
        layoutRetry     = null,
        layoutRetries   = 0,
        layoutMemo      = null,

        popupHypervideoID = null,
        documentListenersBound = false;


    /**
     * I return the map document.
     *
     * Always read through me and never cache the returned object: the Database
     * refills it in place when the library is re-read, so a cached reference
     * would keep serving the copy that was replaced.
     *
     * @method getMapData
     * @return {Object}
     */
    function getMapData() {

        var mapData = FrameTrail.module('Database').overviewMap;

        if (!mapData.markers || typeof mapData.markers !== 'object') {
            mapData.markers = {};
        }

        return mapData;

    }


    /**
     * I return the marker entry for a hypervideo, or null.
     *
     * @method getMarkerData
     * @param {String} hypervideoID
     * @return {Object|null}
     */
    function getMarkerData(hypervideoID) {

        return getMapData().markers[String(hypervideoID)] || null;

    }


    /**
     * I resolve the configured padding into a pixel inset per axis.
     *
     * A percentage resolves against the viewport box's WIDTH on both axes,
     * exactly as a CSS percentage padding does, so the ring stays the same
     * thickness all the way round instead of stretching with the container's
     * aspect ratio.
     *
     * The clamp is per axis and deliberately not proportional: a padding that
     * is merely generous on a wide window can be wider than a narrow one is
     * tall, and an inner box of zero would take every pin percentage down
     * with it.
     *
     * @method resolvePadding
     * @param {Object} mapData
     * @param {Number} cw viewport box width in px
     * @param {Number} ch viewport box height in px
     * @return {Object} { x: Number, y: Number } in px
     */
    function resolvePadding(mapData, cw, ch) {

        var value = parseFloat(mapData.padding);

        if (!isFinite(value) || value <= 0) return { x: 0, y: 0 };

        var pixels = (mapData.paddingUnit === 'px') ? value : (value / 100) * cw;

        return {
            x: Math.max(0, Math.min(pixels, (cw - MIN_INNER_PX) / 2)),
            y: Math.max(0, Math.min(pixels, (ch - MIN_INNER_PX) / 2))
        };

    }


    /**
     * I return what the pins show: the hypervideo's thumbnail, or one glyph
     * for all of them.
     *
     * @method getPinStyle
     * @return {String} 'icon' or 'thumb'
     */
    function getPinStyle() {

        return (getMapData().pinStyle === 'icon') ? 'icon' : 'thumb';

    }


    /**
     * I reduce whatever was typed or stored to something that can be a class
     * name, and prefix the bare glyph name for anyone who typed 'map' rather
     * than 'icon-map'.
     *
     * This is not hygiene. The value is interpolated into markup when the
     * settings dialog is built and into a class attribute when a pin is; the
     * server stores the map's top-level keys verbatim with no whitelist, and
     * _data files are hand-editable. I am the only gate between the two, so
     * the settings dialog shares me rather than keeping a second copy that
     * can only drift.
     *
     * @method sanitizeIconClass
     * @param {String} value
     * @return {String}
     */
    function sanitizeIconClass(value) {

        var raw = String(value || '').trim();

        if (!/^[A-Za-z0-9_-]+$/.test(raw)) return DEFAULT_PIN_ICON;

        return (raw.indexOf('icon-') === 0) ? raw : ('icon-' + raw);

    }


    /**
     * I return the icon class every pin wears in icon mode.
     *
     * @method getPinIcon
     * @return {String}
     */
    function getPinIcon() {

        return sanitizeIconClass(getMapData().pinIcon);

    }


    /**
     * @method getPinAnimation
     * @return {String} one of PIN_ANIMATIONS, or 'none'
     */
    function getPinAnimation() {

        var value = getMapData().pinAnimation;

        return (PIN_ANIMATIONS.indexOf(value) !== -1) ? value : 'none';

    }


    /**
     * I decide whether the current user may re-arrange the map right now.
     *
     * The map is instance-wide and the server only lets admins write it, so
     * this is deliberately stricter than the gate on the per-hypervideo
     * edit/delete buttons. Everything that shows or enables a map editing
     * control has to ask me and nothing else — a control that is offered on a
     * looser test than the action behind it accepts is a button that silently
     * does nothing.
     *
     * @method canEditMap
     * @return {Boolean}
     */
    function canEditMap() {

        return mapEditActive && mayEditMap() && !isMapLockedByOther();

    }


    /**
     * I decide whether the current user may enter map editing at all —
     * everything canEditMap() asks except the mode and the lock, so the
     * "Edit map" toggle itself can be offered before either is settled.
     *
     * @method mayEditMap
     * @return {Boolean}
     */
    function mayEditMap() {

        return !!FrameTrail.getState('editMode')
            && FrameTrail.module('UserManagement').userRole === 'admin'
            && FrameTrail.module('StorageManager').canSave();

    }


    /**
     * The map lives in hypervideos/_index.json, which is what the 'library'
     * scope guards — so that is the lock it takes. Without it two admins could
     * drag the same pins and only the second one's save would be refused.
     *
     * @method isMapLockedByOther
     * @return {Boolean}
     */
    function isMapLockedByOther() {

        var Collaboration = FrameTrail.module('Collaboration');
        return !!(Collaboration && Collaboration.isLockedByOther('library', 'global'));

    }


    /**
     * I re-apply the edit affordances after the lock changed hands.
     *
     * ViewOverview calls me — I register no onChange of my own, so that the
     * order in which the overview and its map react stays explicit.
     *
     * Losing or gaining the lock changes whether pins are draggable, which is
     * decided per pin when it is built, so the pins are rebuilt rather than
     * just re-classed.
     *
     * @method reflectLock
     */
    function reflectLock() {

        if (!MapRoot) return;

        var editable = canEditMap();

        if (MapRoot.classList.contains('editActive') !== editable) {
            MapRoot.classList.toggle('editActive', editable);
            renderMarkers();
            return;
        }

        MapRoot.classList.toggle('editActive', editable);

    }


    /**
     * I build my DOM and start observing my own size.
     *
     * @method create
     * @param {HTMLElement} parentElement The .viewOverview element
     */
    function create(parentElement) {

        var _wrapper = document.createElement('div');
        // The toolbar sits on the canvas rather than in the sidebar: everything
        // on it acts on the map, and it only exists while the map is being
        // arranged. "Done" is what ends that — a mode nobody can see the end of
        // is a mode people stay in, holding the lock against everyone else.
        _wrapper.innerHTML = '<div class="overviewMap">'
                           + '    <div class="overviewMapFrame">'
                           + '        <div class="overviewMapStage">'
                           + '            <img class="overviewMapBackground" alt="">'
                           + '        </div>'
                           + '    </div>'
                           + '    <div class="overviewMapToolbar">'
                           + '        <button class="overviewMapAddButton" data-tooltip-bottom-left="'+ labels['OverviewMapAddHypervideo'] +'"><span class="icon-plus-squared"></span></button>'
                           + '        <button class="overviewMapSettingsButton" data-tooltip-bottom-left="'+ labels['SettingsOverviewMapSettings'] +'"><span class="icon-cog"></span></button>'
                           + '        <button class="overviewMapDoneButton"><span class="icon-ok"></span><span>'+ labels['OverviewMapEditDone'] +'</span></button>'
                           + '    </div>'
                           + '    <div class="overviewMapPopup"></div>'
                           + '</div>';

        MapRoot         = _wrapper.firstElementChild;
        MapFrame        = MapRoot.querySelector('.overviewMapFrame');
        MapStage        = MapRoot.querySelector('.overviewMapStage');
        BackgroundImage = MapRoot.querySelector('.overviewMapBackground');
        Popup           = MapRoot.querySelector('.overviewMapPopup');
        Toolbar         = MapRoot.querySelector('.overviewMapToolbar');

        // An open card would sit behind the dialog these two raise, and be
        // stale by the time it came back — the pins may have moved.
        Toolbar.querySelector('.overviewMapAddButton').addEventListener('click', function(evt) {
            evt.stopPropagation();
            closePopup();
            addHypervideo();
        });

        Toolbar.querySelector('.overviewMapSettingsButton').addEventListener('click', function(evt) {
            evt.stopPropagation();
            closePopup();
            if (!canEditMap()) { reportEditRefused(); return; }
            FrameTrail.module('OverviewMapSettingsDialog').open();
        });

        Toolbar.querySelector('.overviewMapDoneButton').addEventListener('click', function(evt) {
            evt.stopPropagation();
            setMapEditing(false);
        });

        parentElement.append(MapRoot);

        // Clicking empty canvas closes the popup.
        MapRoot.addEventListener('click', function(evt) {
            if (evt.target.closest('.overviewMapPopup')) return;
            closePopup();
        });

        bindDocumentListeners();

        // ViewOverview.changeViewSize() only fires on the `viewSize` state, which
        // does NOT change when the sidebar opens: .mainContainer animates its
        // width over 200ms while Interface's ResizeObserver watches the root
        // element instead. Our own observer covers that transition frame by
        // frame, plus .active toggling and the editActive border.
        if (typeof ResizeObserver !== 'undefined') {
            resizeObserver = new ResizeObserver(function() {
                layoutStage();
            });
            resizeObserver.observe(MapRoot);
        }

    }


    /**
     * I close the popup on Escape.
     *
     * @method bindDocumentListeners
     */
    function bindDocumentListeners() {

        if (documentListenersBound) return;
        documentListenersBound = true;

        document.addEventListener('keydown', function(evt) {
            if (evt.key === 'Escape' && popupHypervideoID !== null) {
                closePopup();
            }
        });

    }


    /**
     * I receive the shared open-a-hypervideo behaviour from ViewOverview, so
     * that I never have to reach back into it (which would be a circular
     * module lookup during its own create()).
     *
     * @method setOpenHandler
     * @param {Function} fn  fn(hypervideoID, sourceElement)
     */
    function setOpenHandler(fn) {
        openHandler = fn;
    }


    /* ------------------------------------------------------------------ *
     *  Geometry
     * ------------------------------------------------------------------ */

    /**
     * I size and position the stage so that the background image fits the
     * viewport under the effective fit mode, then lay out the pins.
     *
     * @method layoutStage
     */
    function layoutStage() {

        if (!MapRoot) return;

        var cw = MapRoot.offsetWidth,
            ch = MapRoot.offsetHeight;

        if (cw < 10 || ch < 10) {
            scheduleLayoutRetry();
            return;
        }

        cancelLayoutRetry();

        var bgW = FALLBACK_BG_W,
            bgH = FALLBACK_BG_H;

        if (BackgroundImage.getAttribute('src') && BackgroundImage.complete && BackgroundImage.naturalWidth > 0) {
            bgW = BackgroundImage.naturalWidth;
            bgH = BackgroundImage.naturalHeight;
        }

        var mapData = getMapData(),
            fit     = (mapData.fit === 'cover') ? 'cover' : 'contain',
            pad     = resolvePadding(mapData, cw, ch),
            frameW  = cw - 2 * pad.x,
            frameH  = ch - 2 * pad.y;

        // Only 'cover' has an overscan to clip, and clipping costs the pins
        // near the edge the label and ripple room the padding was added to
        // give them. Set before the memo check, so it is right on a memo hit.
        MapRoot.classList.toggle('fitCover', fit === 'cover');

        // The padding is part of the geometry: without it here, changing the
        // ring would leave the stage sitting exactly where it was.
        var memo = [cw, ch, fit, bgW, bgH, pad.x, pad.y].join('|');
        if (memo === layoutMemo) return;
        layoutMemo = memo;

        var scale  = (fit === 'cover')
                        ? Math.max(frameW / bgW, frameH / bgH)
                        : Math.min(frameW / bgW, frameH / bgH),
            stageW = bgW * scale,
            stageH = bgH * scale;

        MapFrame.style.left   = pad.x + 'px';
        MapFrame.style.top    = pad.y + 'px';
        MapFrame.style.width  = frameW + 'px';
        MapFrame.style.height = frameH + 'px';

        // Not rounded on purpose: rounding introduces sub-pixel drift between
        // the image and the %-positioned pins. Offsets are against the frame,
        // which is the stage's containing block.
        MapStage.style.left   = ((frameW - stageW) / 2) + 'px';
        MapStage.style.top    = ((frameH - stageH) / 2) + 'px';
        MapStage.style.width  = stageW + 'px';
        MapStage.style.height = stageH + 'px';

        layoutMarkers(stageW);
        positionPopup();

    }


    /**
     * I retry the layout while the container has no usable size yet.
     *
     * The guard on visibility matters: .viewOverview is display:none until it
     * has the .active class, so without it we would re-arm a 50ms timer for
     * the entire time the user spends in video view.
     *
     * @method scheduleLayoutRetry
     */
    function scheduleLayoutRetry() {

        if (layoutRetry) return;

        if (FrameTrail.getState('viewMode') !== 'overview') return;
        if (!MapRoot.closest('.viewOverview') || !MapRoot.closest('.viewOverview').classList.contains('active')) return;
        if (layoutRetries >= MAX_LAYOUT_RETRIES) return;

        layoutRetries++;
        layoutRetry = window.setTimeout(function() {
            layoutRetry = null;
            layoutStage();
        }, 50);

    }


    /**
     * @method cancelLayoutRetry
     */
    function cancelLayoutRetry() {

        if (layoutRetry) {
            window.clearTimeout(layoutRetry);
            layoutRetry = null;
        }
        layoutRetries = 0;

    }


    /**
     * I position and size every pin from its stored data.
     *
     * @method layoutMarkers
     * @param {Number} stageW Current stage width in px
     */
    function layoutMarkers(stageW) {

        Object.keys(MarkerElements).forEach(function(hypervideoID) {

            var element = MarkerElements[hypervideoID],
                data    = getMarkerData(hypervideoID);

            if (!element || !data) return;

            var diameter = Math.max(MARKER_MIN_PX, (data.size / 100) * stageW);

            element.style.left = (data.x * 100) + '%';
            element.style.top  = (data.y * 100) + '%';

            applyMarkerDiameter(element, diameter);

        });

    }


    /**
     * I write a pin's rendered diameter onto its element.
     *
     * The font-size is the diameter, not decoration: an icon pin's glyph is
     * sized in em, so this is the one thing that makes it track the pin. It
     * lives here rather than at each call site because the resize gesture sizes
     * a pin directly, without going through layoutMarkers() — and a second copy
     * of these three lines is exactly how the glyph came to stop resizing until
     * the next full render.
     *
     * Harmless in thumbnail mode: everything else inside a pin is sized in px,
     * the label included.
     *
     * @method applyMarkerDiameter
     * @param {HTMLElement} element
     * @param {Number} diameter in px
     */
    function applyMarkerDiameter(element, diameter) {

        element.style.width    = diameter + 'px';
        element.style.height   = diameter + 'px';
        element.style.fontSize = diameter + 'px';

    }


    /**
     * I point the background image element at the configured resource.
     *
     * @method applyBackground
     */
    function applyBackground() {

        var mapData = getMapData(),
            src     = mapData.background,
            url     = src ? FrameTrail.module('RouteNavigation').getResourceURL(src) : '';

        // The colour belongs on the viewport box: that is the letterbox area
        // around the image under 'contain'. Setting it on the stage alone is
        // invisible, because the <img> fills the stage 100% x 100%. It is also
        // set on the stage, for the no-image case and for images with alpha.
        MapRoot.style.backgroundColor  = mapData.backgroundColor || '';
        MapStage.style.backgroundColor = mapData.backgroundColor || '';

        if (BackgroundImage.getAttribute('src') === url) return;

        if (!url) {
            BackgroundImage.removeAttribute('src');
            MapRoot.classList.add('noBackground');
            layoutMemo = null;
            return;
        }

        MapRoot.classList.remove('noBackground');

        // naturalWidth is only meaningful once this has fired. Until then
        // layoutStage() uses the fallback aspect, then snaps into place.
        // The error listener matters in local storage mode, where a cached
        // blob URL can have been revoked.
        BackgroundImage.addEventListener('load',  onBackgroundSettled, { once: true });
        BackgroundImage.addEventListener('error', onBackgroundSettled, { once: true });

        BackgroundImage.setAttribute('src', url);
        layoutMemo = null;

    }


    /**
     * I put the map-wide pin appearance on the viewport box.
     *
     * One class per property on one element, rather than a class on every pin:
     * these are properties of the map, not of any one pin, and no pin should
     * have to be rebuilt to change how the map animates. It is also what lets
     * the settings dialog preview a choice by putting a real pin inside a real
     * (miniature) viewport box, instead of maintaining a second set of rules
     * that can only drift from these.
     *
     * @method applyPinAppearance
     */
    function applyPinAppearance() {

        var animation = getPinAnimation();

        PIN_ANIMATIONS.forEach(function(name) {
            MapRoot.classList.toggle('pinAnimation-' + name, name === animation);
        });

        MapRoot.classList.toggle('pinStyle-icon', getPinStyle() === 'icon');

    }


    /**
     * @method onBackgroundSettled
     */
    function onBackgroundSettled() {

        layoutMemo = null;
        layoutStage();

    }


    /* ------------------------------------------------------------------ *
     *  Rendering
     * ------------------------------------------------------------------ */

    /**
     * I rebuild all pins from the stored map data.
     *
     * I always read from the config rather than trusting the DOM, so unsaved
     * in-memory edits survive an external refreshList() (after a hypervideo is
     * deleted, or its settings saved) without any extra bookkeeping.
     *
     * @method renderMarkers
     */
    function renderMarkers() {

        if (!MapRoot) return;

        var database = FrameTrail.module('Database'),
            reopenID = popupHypervideoID;

        closePopup();

        Object.keys(MarkerElements).forEach(function(hypervideoID) {
            var element = MarkerElements[hypervideoID];
            // Each corner handle is its own interactable; unset them all before
            // dropping the pin, matching Overlay/type.js:748.
            element.querySelectorAll('.ui-resizable-handle').forEach(function(handle) {
                try { interact(handle).unset(); } catch (ex) {}
            });
            try { interact(element).unset(); } catch (ex) {}
            element.remove();
        });
        MarkerElements = {};

        applyAutoPlace();
        applyBackground();
        applyPinAppearance();

        var markers        = getMapData().markers,
            activeID       = FrameTrail.module('RouteNavigation').hypervideoID,
            editable       = canEditMap(),
            pinStyle       = getPinStyle(),
            pinIcon        = getPinIcon();

        Object.keys(markers).forEach(function(hypervideoID) {

            var hypervideo = database.hypervideos[hypervideoID];

            // The hypervideo may have been deleted since it was placed.
            // Dangling entries are pruned on the next save.
            if (!hypervideo) return;

            var marker = document.createElement('div');
            marker.className = 'overviewMapMarker';
            marker.setAttribute('data-hypervideoid', hypervideoID);
            marker.setAttribute('data-name', hypervideo.name || '');

            // Everything the pin looks like lives on an inner element, and
            // everything it IS — the anchor point, the hit area, the resize
            // handles — stays on the pin itself. That split is what lets the
            // animations transform the pin's appearance without dragging the
            // title label round with it, without clobbering the centring
            // translate, and without moving the resize handles out from under
            // the cursor while the map is being arranged.
            var markerBody = document.createElement('div');
            markerBody.className = 'overviewMapMarkerBody';

            if (pinStyle === 'icon') {
                // A child span rather than an icon class on the body: the
                // font's rule renders the glyph through ::before, which the
                // body would then have no way to also use for anything else.
                var markerIcon = document.createElement('span');
                markerIcon.className = 'overviewMapMarkerIcon ' + pinIcon;
                markerBody.append(markerIcon);
            } else if (hypervideo.thumb) {
                markerBody.style.backgroundImage = 'url(' + FrameTrail.module('RouteNavigation').getResourceURL(hypervideo.thumb) + ')';
            }

            marker.append(markerBody);

            if (hypervideoID == activeID) {
                marker.classList.add('activeHypervideo');
            }

            var markerLabel = document.createElement('div');
            markerLabel.className = 'overviewMapMarkerLabel';
            markerLabel.textContent = hypervideo.name || '';
            marker.append(markerLabel);

            (function(id, element) {
                element.addEventListener('click', function(evt) {
                    evt.preventDefault();
                    // Must not reach the canvas handler, which closes the popup.
                    evt.stopPropagation();

                    // mouseup at the end of a drag or resize also produces a
                    // click on the pin. Without this the card would pop open
                    // every time the pin is moved.
                    if (element._ftSuppressClick) {
                        element._ftSuppressClick = false;
                        return;
                    }

                    openPopup(id);
                });
            })(hypervideoID, marker);

            if (editable) {
                makeMarkerEditable(marker, hypervideoID);
            }

            MapStage.append(marker);
            MarkerElements[hypervideoID] = marker;

        });

        layoutMemo = null;
        layoutStage();

        if (reopenID && MarkerElements[reopenID]) {
            openPopup(reopenID);
        }

    }


    /**
     * I place a hypervideo that was just created from the overview's own
     * "new hypervideo" button.
     *
     * That flow navigates straight into the new hypervideo, so without this
     * the button would look like it did nothing on a map where unplaced
     * hypervideos are hidden. Only hypervideos created through that button
     * are auto-placed; anything created elsewhere is left alone.
     *
     * @method applyAutoPlace
     */
    function applyAutoPlace() {

        if (!pendingAutoPlace) return;

        var known   = autoPlaceKnownIDs || [],
            placed  = false;

        Object.keys(FrameTrail.module('Database').hypervideos).forEach(function(hypervideoID) {

            if (placed) return;
            if (known.indexOf(hypervideoID) !== -1) return;
            if (getMarkerData(hypervideoID)) return;

            placeMarker(hypervideoID);
            placed = true;

        });

        pendingAutoPlace  = false;
        autoPlaceKnownIDs = null;

        if (placed) scheduleMapSave();

    }


    /**
     * I put a hypervideo on the canvas at the first spot that is not already
     * taken.
     *
     * Everything used to be dropped at dead centre, which meant the second pin
     * landed exactly underneath the first — indistinguishable from the button
     * having done nothing at all. Walking outwards in a coarse spiral keeps new
     * pins near the middle (where they are easy to find and drag away) while
     * making every one of them visible the moment it appears.
     *
     * @method placeMarker
     * @param {String} hypervideoID
     * @return {Object} the new marker entry
     */
    function placeMarker(hypervideoID) {

        var step   = 0.09,
            radius = 0,
            angle  = 0,
            x      = 0.5,
            y      = 0.5;

        // Bounded: past a couple of turns the canvas is crowded enough that
        // landing on top of something is the least of anyone's problems.
        for (var attempt = 0; attempt < 48 && isSpotTaken(x, y); attempt++) {
            angle += Math.PI / 3;
            if (attempt % 6 === 5) radius += step;
            x = Math.max(0.05, Math.min(0.95, 0.5 + Math.cos(angle) * radius));
            y = Math.max(0.05, Math.min(0.95, 0.5 + Math.sin(angle) * radius));
        }

        var marker = { x: x, y: y, size: MARKER_DEFAULT_SIZE };

        getMapData().markers[String(hypervideoID)] = marker;

        return marker;

    }


    /**
     * @method isSpotTaken
     * @param {Number} x
     * @param {Number} y
     * @return {Boolean}
     */
    function isSpotTaken(x, y) {

        var markers = getMapData().markers;

        return Object.keys(markers).some(function(hypervideoID) {
            var marker = markers[hypervideoID];
            return Math.abs(marker.x - x) < 0.04 && Math.abs(marker.y - y) < 0.04;
        });

    }


    /**
     * I record that the next new hypervideo should be dropped onto the canvas.
     *
     * @method notePendingAutoPlace
     */
    function notePendingAutoPlace() {

        // Deliberately not canEditMap(): creating a hypervideo is offered
        // outside map editing, and a new hypervideo that silently fails to
        // appear is the exact trap this exists to close. Only somebody else
        // holding the lock is a reason to skip it.
        if (!mayEditMap() || isMapLockedByOther()) return;

        pendingAutoPlace  = true;
        autoPlaceKnownIDs = Object.keys(FrameTrail.module('Database').hypervideos);

    }


    /* ------------------------------------------------------------------ *
     *  Popup card
     * ------------------------------------------------------------------ */

    /**
     * I open the card for a pin.
     *
     * The card is a real .hypervideoThumb (so the grid's option buttons and
     * styling drop straight in) but lives outside the stage, both so it is not
     * clipped by the stage's overflow and so it cannot be picked up by the
     * [data-hypervideoid] lookups ViewOverview uses to find animation anchors.
     * For the latter reason its data-hypervideoid attribute is removed.
     *
     * @method openPopup
     * @param {String} hypervideoID
     */
    function openPopup(hypervideoID) {

        var database   = FrameTrail.module('Database'),
            hypervideo = database.hypervideos[hypervideoID];

        if (!hypervideo) return;

        closePopup();

        var card = FrameTrail.newObject('Hypervideo', hypervideo).renderThumb();
        card.classList.add('mapCard');
        card.removeAttribute('data-hypervideoid');

        var admin    = FrameTrail.module('UserManagement').userRole === 'admin',
            owner    = hypervideo.creatorId === FrameTrail.module('UserManagement').userID,
            editMode = FrameTrail.getState('editMode');

        if ((admin || owner) && editMode && FrameTrail.module('StorageManager').canSave()) {
            card.append(buildCardOptions(hypervideoID, admin));
        }

        card.addEventListener('click', function(evt) {
            if (evt.target.closest('.hypervideoOptions')) return;
            evt.preventDefault();
            evt.stopPropagation();
            closePopup();
            // Animate from the pin, never from the card: the card is detached
            // immediately and would measure 0x0 by the time ViewOverview reads
            // its rect inside a later requestAnimationFrame.
            if (openHandler) openHandler(hypervideoID, MarkerElements[hypervideoID] || null);
        });

        Popup.innerHTML = '';
        Popup.append(card);
        Popup.classList.add('open');

        popupHypervideoID = hypervideoID;
        positionPopup();

    }


    /**
     * I build the edit / delete / remove-from-map buttons for a card.
     *
     * @method buildCardOptions
     * @param {String} hypervideoID
     * @param {Boolean} admin
     * @return {HTMLElement}
     */
    function buildCardOptions(hypervideoID, admin) {

        var options = document.createElement('div');
        options.className = 'hypervideoOptions';

        var editButton = document.createElement('button');
        editButton.className = 'hypervideoEditButton';
        editButton.setAttribute('data-tooltip-bottom-right', labels['SettingsHypervideoSettings']);
        editButton.innerHTML = '<span class="icon-pencil"></span>';
        editButton.addEventListener('click', function(evt) {
            evt.preventDefault();
            evt.stopPropagation();
            closePopup();
            FrameTrail.module('HypervideoSettingsDialog').open(hypervideoID);
        });
        options.append(editButton);

        var deleteButton = document.createElement('button');
        deleteButton.className = 'hypervideoDeleteButton';
        deleteButton.setAttribute('data-tooltip-bottom-right', labels['GenericDeleteHypervideo']);
        deleteButton.innerHTML = '<span class="icon-trash"></span>';
        deleteButton.addEventListener('click', function(evt) {
            evt.preventDefault();
            evt.stopPropagation();
            closePopup();
            // Drop the placement too, so deleting from the map does not leave
            // a dangling entry behind.
            if (canEditMap()) {
                removeMarker(hypervideoID);
            }
            FrameTrail.module('HypervideoSettingsDialog').openDeleteDialog(hypervideoID);
        });
        options.append(deleteButton);

        if (admin && canEditMap()) {
            var removeButton = document.createElement('button');
            removeButton.className = 'hypervideoRemoveFromMapButton';
            removeButton.setAttribute('data-tooltip-bottom-right', labels['OverviewMapRemoveHypervideo']);
            removeButton.innerHTML = '<span class="icon-cancel-circled"></span>';
            removeButton.addEventListener('click', function(evt) {
                evt.preventDefault();
                evt.stopPropagation();
                closePopup();
                removeMarker(hypervideoID);
                renderMarkers();
            });
            options.append(removeButton);
        }

        return options;

    }


    /**
     * I centre the open card over its pin, clamped so that it stays inside
     * the canvas.
     *
     * @method positionPopup
     */
    function positionPopup() {

        if (popupHypervideoID === null || !Popup.classList.contains('open')) return;

        var marker = MarkerElements[popupHypervideoID];
        if (!marker) { closePopup(); return; }

        var rootRect   = MapRoot.getBoundingClientRect(),
            markerRect = marker.getBoundingClientRect(),
            popupW     = Popup.offsetWidth,
            popupH     = Popup.offsetHeight,
            gap        = 10;

        // Centred over the pin, covering it, so the card sits exactly on the
        // point of interest rather than pointing at it from below.
        var centerX = markerRect.left + markerRect.width  / 2 - rootRect.left,
            centerY = markerRect.top  + markerRect.height / 2 - rootRect.top,
            left    = centerX - popupW / 2,
            top     = centerY - popupH / 2;

        left = Math.max(gap, Math.min(rootRect.width - popupW - gap, left));
        top  = Math.max(gap, Math.min(rootRect.height - popupH - gap, top));

        Popup.style.left = left + 'px';
        Popup.style.top  = top + 'px';

    }


    /**
     * @method closePopup
     */
    function closePopup() {

        if (!Popup) return;

        Popup.classList.remove('open');
        Popup.innerHTML = '';
        popupHypervideoID = null;

    }


    /* ------------------------------------------------------------------ *
     *  Editing
     * ------------------------------------------------------------------ */

    /**
     * I make a pin draggable and resizable.
     *
     * Unlike the Overlay precedent, which converts % to px on drag start and
     * back on drag end, I write the normalized data on every move and derive
     * the DOM from it. The ResizeObserver can fire mid-drag (the sidebar
     * transition alone fires it every frame) and layoutStage() would otherwise
     * stomp the in-flight px position back to the stored percentage.
     *
     * @method makeMarkerEditable
     * @param {HTMLElement} marker
     * @param {String} hypervideoID
     */
    function makeMarkerEditable(marker, hypervideoID) {

        marker.classList.add('editable');
        marker.classList.add('ui-resizable');

        // Same handle markup and class names the overlay editor uses, so the
        // two canvases behave and read alike.
        ['ne', 'se', 'sw', 'nw'].forEach(function(dir) {
            if (marker.querySelector('.ui-resizable-' + dir)) return;
            var handle = document.createElement('div');
            handle.className = 'ui-resizable-handle ui-resizable-' + dir;
            marker.appendChild(handle);
            makeHandleResizable(handle, marker, hypervideoID);
        });

        interact(marker).draggable({
            ignoreFrom: '.ui-resizable-handle',
            listeners: {
                start: function() {
                    closePopup();
                    marker.classList.add('dragging');
                },
                move: function(evt) {
                    var data = getMarkerData(hypervideoID);
                    if (!data) return;

                    marker._ftSuppressClick = true;

                    // Clamp the anchor, not the box: the pin's centre is what
                    // must stay on the image.
                    data.x = Math.max(0, Math.min(1, data.x + evt.dx / MapStage.offsetWidth));
                    data.y = Math.max(0, Math.min(1, data.y + evt.dy / MapStage.offsetHeight));

                    marker.style.left = (data.x * 100) + '%';
                    marker.style.top  = (data.y * 100) + '%';
                },
                end: function() {
                    marker.classList.remove('dragging');
                    scheduleMapSave();
                }
            }
        });

    }


    /**
     * I make one corner handle resize its pin.
     *
     * Each corner drives the same radial calculation rather than interact's
     * resizable(), which writes width *and* left/top and would fight the
     * translate(-50%, -50%) that keeps a pin centred on its anchor. Measuring
     * the pointer's distance from the centre instead grows the circle
     * symmetrically from whichever corner is grabbed, so the pin never drifts
     * off the feature it marks and stays perfectly round.
     *
     * The handles sit outside the pin's bounding box, so the grab point is
     * further from the centre than the radius is. The offset between the two is
     * captured on pointer-down and held for the drag, otherwise the pin would
     * jump to the grab distance the moment a handle was touched.
     *
     * @method makeHandleResizable
     * @param {HTMLElement} handle
     * @param {HTMLElement} marker
     * @param {String} hypervideoID
     */
    function makeHandleResizable(handle, marker, hypervideoID) {

        var grabOffset = 0;

        function pointerRadius(clientX, clientY) {

            var data = getMarkerData(hypervideoID);
            if (!data) return null;

            var stageRect = MapStage.getBoundingClientRect(),
                centerX   = stageRect.left + data.x * stageRect.width,
                centerY   = stageRect.top  + data.y * stageRect.height;

            return Math.sqrt(
                Math.pow(clientX - centerX, 2) +
                Math.pow(clientY - centerY, 2)
            );

        }

        interact(handle).draggable({
            listeners: {
                start: function(evt) {
                    evt.stopPropagation();
                    closePopup();
                    marker.classList.add('resizing');

                    var radius = pointerRadius(evt.clientX, evt.clientY);
                    grabOffset = (radius === null) ? 0 : radius - (marker.offsetWidth / 2);
                },
                move: function(evt) {
                    var data = getMarkerData(hypervideoID);
                    if (!data) return;

                    marker._ftSuppressClick = true;

                    var radius = pointerRadius(evt.clientX, evt.clientY);
                    if (radius === null) return;

                    var stageRect = MapStage.getBoundingClientRect(),
                        diameter  = 2 * (radius - grabOffset);

                    diameter = Math.max(MARKER_MIN_PX, Math.min(stageRect.width * 0.5, diameter));

                    data.size = diameter / stageRect.width * 100;

                    applyMarkerDiameter(marker, diameter);
                },
                end: function() {
                    marker.classList.remove('resizing');
                    scheduleMapSave();
                }
            }
        // interact.js writes an inline `cursor` on whatever it is dragging, and
        // for a draggable that is always `move` — which would beat the
        // directional cursors in generic.css on hover. The overlay canvas does
        // not hit this because its corners use resizable(), whose cursor is
        // directional. Turning interact's cursor handling off leaves the cursor
        // entirely to CSS, where both surfaces already agree.
        }).styleCursor(false);

    }


    /**
     * I remove a hypervideo's placement without touching the hypervideo.
     *
     * @method removeMarker
     * @param {String} hypervideoID
     */
    function removeMarker(hypervideoID) {

        delete getMapData().markers[String(hypervideoID)];

        scheduleMapSave();

    }


    /**
     * I open the hypervideo picker so an admin can place an existing
     * hypervideo that is not on the map yet.
     *
     * @method addHypervideo
     */
    function addHypervideo() {

        // Never fail silently here. The controls are gated on canEditMap() too,
        // so reaching this at all means the two disagreed — say why rather than
        // leaving a live-looking button that does nothing.
        if (!canEditMap()) {
            console.debug('FrameTrail: cannot add to the overview map —',
                          'mapEditActive:', mapEditActive,
                          'mayEdit:', mayEditMap(),
                          'lockedByOther:', isMapLockedByOther());
            reportEditRefused();
            return;
        }

        var placed = Object.keys(getMapData().markers);

        if (!FrameTrail.module('HypervideoPicker')) {
            FrameTrail.initModule('HypervideoPicker');
        }

        FrameTrail.module('HypervideoPicker').openPicker(function(hypervideoID) {

            if (getMarkerData(hypervideoID)) return;

            placeMarker(hypervideoID);
            scheduleMapSave();
            renderMarkers();

            // Say where it landed. Without this the only evidence that the
            // picker did anything is a new pin somewhere on a canvas the user
            // was not looking at.
            openPopup(String(hypervideoID));

        }, { exclude: placed });

    }


    /**
     * I explain why an edit was refused.
     *
     * @method reportEditRefused
     */
    function reportEditRefused() {

        var Collaboration = FrameTrail.module('Collaboration');

        if (isMapLockedByOther()) {
            var holder = Collaboration.lockHolder('library', 'global');
            FrameTrail.module('InterfaceModal').showErrorMessage(
                labels['MessageCollabOverviewLockedBy'].replace('%s', (holder && holder.name) ? holder.name : '')
            );
            FrameTrail.module('InterfaceModal').hideMessage(3000);
        }

    }


    /* ------------------------------------------------------------------ *
     *  Saving
     * ------------------------------------------------------------------ */

    /**
     * I write the map after every change, coalescing bursts.
     *
     * There is no dirty flag and no save button on purpose. The map used to
     * carry both, because it lived in config.json and a save meant rewriting a
     * file the settings dialog also owned — so writing eagerly would have
     * clobbered somebody's settings, and the alternative was a second,
     * parallel save/discard flow that the rest of the overview knew nothing
     * about. Now the map is its own document, written through its own narrow
     * server action while we hold the lock: there is nothing left to race, so
     * a change can simply be saved when it is made.
     *
     * @method scheduleMapSave
     */
    function scheduleMapSave() {

        if (saveTimer) window.clearTimeout(saveTimer);

        saveTimer = window.setTimeout(function() {
            saveTimer = null;
            saveMap();
        }, SAVE_DEBOUNCE_MS);

    }


    /**
     * I write the map now, if a save is pending.
     *
     * Called when leaving map editing, so the last drag of a session is never
     * left sitting in the debounce.
     *
     * @method flushMapSave
     */
    function flushMapSave() {

        if (!saveTimer) return;

        window.clearTimeout(saveTimer);
        saveTimer = null;
        saveMap();

    }


    /**
     * @method roundCoordinate
     * @param {Number} value
     * @return {Number}
     */
    function roundCoordinate(value) {

        return (typeof value === 'number' && isFinite(value))
             ? Math.round(value * 1e6) / 1e6
             : value;

    }


    /**
     * @method saveMap
     */
    function saveMap() {

        var database = FrameTrail.module('Database'),
            mapData  = getMapData();

        Object.keys(mapData.markers).forEach(function(hypervideoID) {

            // Drop placements whose hypervideo no longer exists. They render as
            // nothing at all, so they are invisible until somebody reads the file.
            if (!database.hypervideos[hypervideoID]) {
                delete mapData.markers[hypervideoID];
                return;
            }

            // A drag leaves a full-precision double behind, and how much of it
            // survives a round trip is the server's float settings' business,
            // not ours — one PHP install writes 17 digits, another writes the
            // exact binary expansion and the file grows unreadable. Six decimals
            // of a normalized coordinate is well under a pixel on any image
            // anyone will use as a map.
            var marker = mapData.markers[hypervideoID];
            marker.x    = roundCoordinate(marker.x);
            marker.y    = roundCoordinate(marker.y);
            marker.size = roundCoordinate(marker.size);

        });

        database.saveOverviewMap(function(result) {

            var Collaboration = FrameTrail.module('Collaboration');

            if (result && result.success) {
                setSaveFailed(false);
                if (Collaboration) {
                    Collaboration.acknowledgeVersion(result.version, 'library', 'global');
                }
                return;
            }

            // Rare: we hold the lock, so nobody should be writing the map
            // underneath us. Feed the ordinary staleness affordance rather than
            // raising a dialog over a canvas the user is still dragging on —
            // the sidebar's Refresh re-reads the library and the map with it.
            setSaveFailed(true);

            FrameTrail.module('InterfaceModal').showErrorMessage(labels['MessageOverviewMapSaveFailed']);
            FrameTrail.module('InterfaceModal').hideMessage(4000);

            console.error('FrameTrail: could not save the overview map:', result && result.error);

            if (result && result.code === 7 && Collaboration) {
                Collaboration.markStale('library', 'global');
            }

        });

    }


    /**
     * I mark the map as diverged from what is on disk.
     *
     * @method setSaveFailed
     * @param {Boolean} flag
     */
    function setSaveFailed(flag) {

        if (saveFailed === !!flag) return;
        saveFailed = !!flag;

        var Sidebar = FrameTrail.module('Sidebar');
        if (Sidebar && Sidebar.setOverviewMapSaveFailed) {
            Sidebar.setOverviewMapSaveFailed(saveFailed);
        }

    }


    /* ------------------------------------------------------------------ *
     *  Edit mode
     * ------------------------------------------------------------------ */

    /**
     * I react to the global edit mode being entered or left.
     *
     * I do not claim anything here: the global edit mode is also on while
     * somebody is only adding a hypervideo or looking around, and a lock held
     * for that would stop another admin arranging the map for no reason.
     * Leaving it does end a map editing session, though — there is no way back
     * to the controls from outside edit mode.
     *
     * @method toggleEditMode
     * @param {String|Boolean} editMode
     */
    function toggleEditMode(editMode) {

        if (!MapRoot) return;

        editModeActive = !!editMode;

        if (!editModeActive && mapEditActive) {
            setMapEditing(false);
        }

        reflectLock();

        // Edit mode does not change the geometry (the canvas renders the
        // configured fit either way), but the editActive border does resize
        // the container.
        layoutStage();

    }


    /**
     * I enter or leave map editing, taking and giving back the lock.
     *
     * @method setMapEditing
     * @param {Boolean} value
     */
    function setMapEditing(value) {

        value = !!value && mayEditMap();

        if (value === mapEditActive) return;

        var Collaboration = FrameTrail.module('Collaboration');

        mapEditActive = value;

        if (mapEditActive) {

            if (Collaboration) {
                // Promote the session that is already watching the library and
                // take the lock. A refusal is fine: canEditMap() then stays
                // false and the sidebar names whoever holds it.
                Collaboration.claim(function() { reflectLock(); }, 'library', 'global');
            }

        } else {

            closePopup();
            flushMapSave();

            // Demote rather than stop — the scope stays watched for the rest of
            // the session, so we still hear about changes. Demoting releases
            // the lock, so leaving map editing never strands one.
            if (Collaboration) {
                Collaboration.setObserving(true, 'library', 'global');
            }

        }

        reflectLock();
        renderMarkers();

        var Sidebar = FrameTrail.module('Sidebar');
        if (Sidebar && Sidebar.refreshOverviewMapControls) {
            Sidebar.refreshOverviewMapControls();
        }

    }


    /**
     * @method isMapEditing
     * @return {Boolean}
     */
    function isMapEditing() {
        return mapEditActive;
    }


    /* ------------------------------------------------------------------ *
     *  Accessors used by ViewOverview
     * ------------------------------------------------------------------ */

    /**
     * I repaint from the current map document.
     *
     * Called after the background, colour or fit were changed, and after the
     * library was re-read, so a change takes effect immediately instead of
     * only on the next page load.
     *
     * @method reload
     */
    function reload() {

        if (!MapRoot) return;

        setSaveFailed(false);

        layoutMemo = null;
        renderMarkers();

    }


    /**
     * @method getMarkerElement
     * @param {String} hypervideoID
     * @return {HTMLElement|null}
     */
    function getMarkerElement(hypervideoID) {
        return MarkerElements[hypervideoID] || null;
    }


    /**
     * @method isEmpty
     * @return {Boolean}
     */
    function isEmpty() {
        return Object.keys(MarkerElements).length === 0;
    }


    /**
     * @method layout
     */
    function layout() {
        layoutStage();
    }


    return {

        create:             create,
        setOpenHandler:     setOpenHandler,
        renderMarkers:      renderMarkers,
        layout:             layout,
        closePopup:         closePopup,
        getMarkerElement:   getMarkerElement,
        toggleEditMode:     toggleEditMode,
        setMapEditing:      setMapEditing,
        isMapEditing:       isMapEditing,
        canEditMap:         canEditMap,
        mayEditMap:         mayEditMap,
        isLockedByOther:    isMapLockedByOther,
        reflectLock:        reflectLock,
        reload:             reload,
        addHypervideo:      addHypervideo,
        notePendingAutoPlace: notePendingAutoPlace,
        isEmpty:            isEmpty,

        // Shared with OverviewMapSettingsDialog, so that the list it offers
        // and the rule it validates against are the ones the canvas actually
        // implements.
        pinAnimations:      PIN_ANIMATIONS,
        defaultPinIcon:     DEFAULT_PIN_ICON,
        sanitizeIconClass:  sanitizeIconClass

    };

});
