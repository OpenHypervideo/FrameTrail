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
        MAX_LAYOUT_RETRIES  = 40;


    var MapRoot         = null,     // .overviewMap  — the viewport box
        MapStage        = null,     // .overviewMapStage — the image box
        BackgroundImage = null,
        Popup           = null,

        MarkerElements  = {},       // hypervideoID -> pin element
        openHandler     = null,     // set by ViewOverview.create()

        editModeActive  = false,
        mapDirty        = false,
        editSnapshot    = null,     // deep clone taken on entering edit mode

        pendingAutoPlace   = false,
        autoPlaceKnownIDs  = null,

        resizeObserver  = null,
        layoutRetry     = null,
        layoutRetries   = 0,
        layoutMemo      = null,

        popupHypervideoID = null,
        documentListenersBound = false;


    /**
     * I return the map data object from the config, creating a well-formed
     * empty one if it does not exist yet.
     *
     * Always read through me and never cache the returned object: saving does
     * not round-trip the config, but AdminSettingsDialog can replace the whole
     * `config` object underneath us.
     *
     * @method getMapData
     * @return {Object}
     */
    function getMapData() {

        var config = FrameTrail.module('Database').config;

        if (!config.overviewMap || typeof config.overviewMap !== 'object') {
            config.overviewMap = {};
        }

        if (!Array.isArray(config.overviewMap.markers)) {
            config.overviewMap.markers = [];
        }

        return config.overviewMap;

    }


    /**
     * I return the marker entry for a hypervideo, or null.
     *
     * @method getMarkerData
     * @param {String} hypervideoID
     * @return {Object|null}
     */
    function getMarkerData(hypervideoID) {

        var markers = getMapData().markers;

        for (var i = 0; i < markers.length; i++) {
            if (String(markers[i].hypervideoID) === String(hypervideoID)) {
                return markers[i];
            }
        }

        return null;

    }


    /**
     * I decide whether the current user may re-arrange the map.
     *
     * Placement is stored in config.json, and the server only lets admins write
     * that file, so this is deliberately stricter than the gate used for the
     * per-hypervideo edit/delete buttons.
     *
     * @method canEditMap
     * @return {Boolean}
     */
    function canEditMap() {

        return !!FrameTrail.getState('editMode')
            && FrameTrail.module('UserManagement').userRole === 'admin'
            && FrameTrail.module('StorageManager').canSave();

    }


    /**
     * I build my DOM and start observing my own size.
     *
     * @method create
     * @param {HTMLElement} parentElement The .viewOverview element
     */
    function create(parentElement) {

        var _wrapper = document.createElement('div');
        _wrapper.innerHTML = '<div class="overviewMap">'
                           + '    <div class="overviewMapStage">'
                           + '        <img class="overviewMapBackground" alt="">'
                           + '    </div>'
                           + '    <div class="overviewMapPopup"></div>'
                           + '</div>';

        MapRoot         = _wrapper.firstElementChild;
        MapStage        = MapRoot.querySelector('.overviewMapStage');
        BackgroundImage = MapRoot.querySelector('.overviewMapBackground');
        Popup           = MapRoot.querySelector('.overviewMapPopup');

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
            fit     = (mapData.fit === 'cover') ? 'cover' : 'contain';

        var memo = [cw, ch, fit, bgW, bgH].join('|');
        if (memo === layoutMemo) return;
        layoutMemo = memo;

        var scale  = (fit === 'cover')
                        ? Math.max(cw / bgW, ch / bgH)
                        : Math.min(cw / bgW, ch / bgH),
            stageW = bgW * scale,
            stageH = bgH * scale;

        // Not rounded on purpose: rounding introduces sub-pixel drift between
        // the image and the %-positioned pins.
        MapStage.style.left   = ((cw - stageW) / 2) + 'px';
        MapStage.style.top    = ((ch - stageH) / 2) + 'px';
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

            element.style.left   = (data.x * 100) + '%';
            element.style.top    = (data.y * 100) + '%';
            element.style.width  = diameter + 'px';
            element.style.height = diameter + 'px';

        });

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
            admin    = FrameTrail.module('UserManagement').userRole === 'admin',
            userID   = FrameTrail.module('UserManagement').userID,
            reopenID = popupHypervideoID;

        closePopup();

        Object.keys(MarkerElements).forEach(function(hypervideoID) {
            try { interact(MarkerElements[hypervideoID]).unset(); } catch (ex) {}
            MarkerElements[hypervideoID].remove();
        });
        MarkerElements = {};

        applyAutoPlace();
        applyBackground();

        var markers        = getMapData().markers,
            activeID       = FrameTrail.module('RouteNavigation').hypervideoID,
            editable       = canEditMap();

        markers.forEach(function(markerData) {

            var hypervideoID = String(markerData.hypervideoID),
                hypervideo   = database.hypervideos[hypervideoID];

            // The hypervideo may have been deleted since it was placed.
            // Dangling entries are pruned on the next save.
            if (!hypervideo) return;

            // Stricter than the grid, which does not filter hidden at all:
            // a curated public map must not leak someone else's hidden video.
            var owner = hypervideo.creatorId === userID;
            if (hypervideo.hidden && !owner && !admin) return;

            var marker = document.createElement('div');
            marker.className = 'overviewMapMarker';
            marker.setAttribute('data-hypervideoid', hypervideoID);
            marker.setAttribute('data-name', hypervideo.name || '');

            if (hypervideo.thumb) {
                marker.style.backgroundImage = 'url(' + FrameTrail.module('RouteNavigation').getResourceURL(hypervideo.thumb) + ')';
            }

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
            mapData = getMapData(),
            placed  = false;

        Object.keys(FrameTrail.module('Database').hypervideos).forEach(function(hypervideoID) {

            if (placed) return;
            if (known.indexOf(hypervideoID) !== -1) return;
            if (getMarkerData(hypervideoID)) return;

            mapData.markers.push({
                hypervideoID: hypervideoID,
                x:            0.5,
                y:            0.5,
                size:         MARKER_DEFAULT_SIZE
            });

            placed = true;
            setDirty(true);

        });

        pendingAutoPlace  = false;
        autoPlaceKnownIDs = null;

    }


    /**
     * I record that the next new hypervideo should be dropped onto the canvas.
     *
     * @method notePendingAutoPlace
     */
    function notePendingAutoPlace() {

        if (!canEditMap()) return;

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

        var handle = document.createElement('div');
        handle.className = 'overviewMapMarkerHandle';
        marker.append(handle);

        interact(marker).draggable({
            ignoreFrom: '.overviewMapMarkerHandle',
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

                    setDirty(true);
                },
                end: function() {
                    marker.classList.remove('dragging');
                }
            }
        });

        // A single radial handle rather than interact's resizable(), which
        // writes both width and left and would fight translate(-50%, -50%).
        interact(handle).draggable({
            listeners: {
                start: function(evt) {
                    evt.stopPropagation();
                    closePopup();
                },
                move: function(evt) {
                    var data = getMarkerData(hypervideoID);
                    if (!data) return;

                    marker._ftSuppressClick = true;

                    var stageRect = MapStage.getBoundingClientRect(),
                        centerX   = stageRect.left + data.x * stageRect.width,
                        centerY   = stageRect.top  + data.y * stageRect.height,
                        diameter  = 2 * Math.sqrt(
                            Math.pow(evt.clientX - centerX, 2) +
                            Math.pow(evt.clientY - centerY, 2)
                        );

                    diameter = Math.max(MARKER_MIN_PX, Math.min(stageRect.width * 0.5, diameter));

                    data.size = diameter / stageRect.width * 100;

                    marker.style.width  = diameter + 'px';
                    marker.style.height = diameter + 'px';

                    setDirty(true);
                }
            }
        });

    }


    /**
     * I remove a hypervideo's placement without touching the hypervideo.
     *
     * @method removeMarker
     * @param {String} hypervideoID
     */
    function removeMarker(hypervideoID) {

        var mapData = getMapData();

        mapData.markers = mapData.markers.filter(function(marker) {
            return String(marker.hypervideoID) !== String(hypervideoID);
        });

        setDirty(true);

    }


    /**
     * I open the hypervideo picker so an admin can place an existing
     * hypervideo that is not on the map yet.
     *
     * @method addHypervideo
     */
    function addHypervideo() {

        if (!canEditMap()) return;

        var placed = getMapData().markers.map(function(marker) {
            return String(marker.hypervideoID);
        });

        if (!FrameTrail.module('HypervideoPicker')) {
            FrameTrail.initModule('HypervideoPicker');
        }

        FrameTrail.module('HypervideoPicker').openPicker(function(hypervideoID) {

            if (getMarkerData(hypervideoID)) return;

            getMapData().markers.push({
                hypervideoID: String(hypervideoID),
                x:            0.5,
                y:            0.5,
                size:         MARKER_DEFAULT_SIZE
            });

            setDirty(true);
            renderMarkers();

        }, { exclude: placed });

    }


    /* ------------------------------------------------------------------ *
     *  Dirty state & saving
     * ------------------------------------------------------------------ */

    /**
     * I track unsaved map changes.
     *
     * Deliberately a module-local flag rather than the global `unsavedChanges`
     * state: that state is owned by HypervideoModel, and its "save" path only
     * ever writes the hypervideo and its annotations. Setting it here would
     * mean the leave-edit-mode dialog's "yes, save" button silently discarded
     * the map layout.
     *
     * @method setDirty
     * @param {Boolean} flag
     */
    function setDirty(flag) {

        if (mapDirty === flag) return;
        mapDirty = flag;

        var Sidebar = FrameTrail.module('Sidebar');
        if (Sidebar && Sidebar.setOverviewMapDirty) {
            Sidebar.setOverviewMapDirty(flag);
        }

    }


    /**
     * @method hasUnsavedChanges
     * @return {Boolean}
     */
    function hasUnsavedChanges() {
        return mapDirty;
    }


    /**
     * I write the map layout back into config.json.
     *
     * @method saveLayout
     * @param {Function} callback Optional, receives a Boolean success flag
     */
    function saveLayout(callback) {

        var database = FrameTrail.module('Database'),
            mapData  = getMapData();

        // Prune placements whose hypervideo no longer exists.
        mapData.markers = mapData.markers.filter(function(marker) {
            return !!database.hypervideos[String(marker.hypervideoID)];
        });

        FrameTrail.module('InterfaceModal').showStatusMessage(labels['MessageStateSaving']);

        database.saveConfig(function(result) {

            FrameTrail.module('InterfaceModal').hideMessage(500);

            if (!result || !result.success) {
                FrameTrail.module('InterfaceModal').showErrorMessage(labels['ErrorSavingSettings']);
                console.error('FrameTrail: could not save overview map layout:', result && result.error);
                if (callback) callback(false);
                return;
            }

            setDirty(false);
            editSnapshot = JSON.parse(JSON.stringify(getMapData()));

            if (callback) callback(true);

        });

    }


    /**
     * I restore the map to the state it had when edit mode was entered.
     *
     * @method discardChanges
     */
    function discardChanges() {

        if (editSnapshot) {
            FrameTrail.module('Database').config.overviewMap = JSON.parse(JSON.stringify(editSnapshot));
        }

        setDirty(false);
        renderMarkers();

    }


    /**
     * I react to edit mode being entered or left.
     *
     * @method toggleEditMode
     * @param {String|Boolean} editMode
     */
    function toggleEditMode(editMode) {

        var active = !!editMode;

        if (!MapRoot) return;

        if (active && !editModeActive) {
            editSnapshot = JSON.parse(JSON.stringify(getMapData()));
        }

        editModeActive = active;
        MapRoot.classList.toggle('editActive', active && canEditMap());

        if (!active) {
            closePopup();
            if (mapDirty) {
                promptSaveOrDiscard();
            }
        }

        // Edit mode does not change the geometry (the canvas renders the
        // configured fit either way), but the editActive border does resize
        // the container.
        layoutStage();

    }


    /**
     * I ask whether to keep or drop unsaved map changes.
     *
     * There is no Cancel: by the time this runs the editMode state has already
     * been written, so vetoing would require a re-entrant changeState.
     *
     * @method promptSaveOrDiscard
     */
    function promptSaveOrDiscard() {

        var content = document.createElement('div');
        content.className = 'confirmSaveChanges';
        content.innerHTML = '<div class="message active">'+ labels['OverviewMapSaveQuestion'] +'</div>';

        var dialogCtrl = Dialog({
            title:     labels['OverviewMapSaveQuestionShort'],
            content:   content,
            modal:     true,
            resizable: false,
            close: function() {
                dialogCtrl.destroy();
            },
            buttons: [
                {
                    text: labels['GenericSaveChanges'],
                    click: function() {
                        saveLayout();
                        dialogCtrl.close();
                    }
                },
                {
                    text: labels['GenericNoDiscard'],
                    click: function() {
                        discardChanges();
                        dialogCtrl.close();
                    }
                }
            ]
        });

    }


    /* ------------------------------------------------------------------ *
     *  Accessors used by ViewOverview
     * ------------------------------------------------------------------ */

    /**
     * I re-read the map settings from the config and repaint.
     *
     * AdminSettingsDialog calls me after it applies background / colour / fit,
     * so those take effect immediately instead of only on the next page load.
     *
     * Its save serialises the whole config object, so any pending marker edits
     * were written to disk along with it — hence the dirty flag is cleared and
     * the edit-session snapshot re-taken.
     *
     * @method reloadFromConfig
     */
    function reloadFromConfig() {

        if (!MapRoot) return;

        setDirty(false);
        editSnapshot = JSON.parse(JSON.stringify(getMapData()));

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
        reloadFromConfig:   reloadFromConfig,
        hasUnsavedChanges:  hasUnsavedChanges,
        saveLayout:         saveLayout,
        discardChanges:     discardChanges,
        addHypervideo:      addHypervideo,
        notePendingAutoPlace: notePendingAutoPlace,
        isEmpty:            isEmpty

    };

});
