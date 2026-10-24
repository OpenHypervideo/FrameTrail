/**
 * @module Shared
 */


/**
 * I am the type definition of a ResourceLocation. I represent a geo map using Leaflet with OpenStreetMap tiles.
 *
 * Locations are made in the editor, as overlays and annotations (the Location tile), and
 * their place is chosen in the properties: a search and a small map. A resources index may
 * still hold location resources from earlier versions; they are shown and used as before.
 *
 * @class ResourceLocation
 * @category TypeDefinition
 * @extends Resource
 */



FrameTrail.defineType(

    'ResourceLocation',

    function (FrameTrail) {

        // The place search (Nominatim): at most one request per second, the same
        // query answered from the cache. Shared by every editor on the page.
        var lastSearch  = 0,
            searchCache = {};

        return {
            parent: 'Resource',
            constructor: function(resourceData){

                this.resourceData = resourceData;

            },
            prototype: {
                /**
                 * I hold the data object of a ResourceLocation, which is stored in the {{#crossLink "Database"}}Database{{/crossLink}} and saved in the resource's _index.json.
                 * @attribute resourceData
                 * @type {}
                 */
                resourceData:   {},
                iconClass:      'icon-location-2',


                /**
                 * The place a new location starts on (the Location tile): its name and attributes.
                 * @attribute defaultPlace
                 * @type {}
                 */
                defaultPlace: {
                    name:        'Amsterdam',
                    lat:         52.3730796,
                    lon:         4.8924534,
                    boundingBox: [52.2781742, 52.4310638, 4.7287776, 5.0791622]
                },


                /**
                 * Tile provider configurations (no API keys required). Light, dark, soft and sepia
                 * are the OpenStreetMap tiles recoloured by a CSS filter on the tile layer.
                 * The keys name the look, not the provider, so the tiles behind a style can change.
                 * @attribute tileProviders
                 * @type {}
                 */
                tileProviders: {
                    'osm-standard': {
                        url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
                        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
                        maxZoom: 19,
                        label: 'SettingsLocationTileStandard'
                    },
                    'light': {
                        url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
                        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
                        maxZoom: 19,
                        filter: 'grayscale(1) brightness(1.12) contrast(0.8)',
                        label: 'SettingsLocationTileLight'
                    },
                    'dark': {
                        url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
                        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
                        maxZoom: 19,
                        filter: 'invert(1) hue-rotate(180deg) grayscale(0.6) brightness(0.9) contrast(0.95)',
                        background: '#2b2b2b',
                        label: 'SettingsLocationTileDark'
                    },
                    'soft': {
                        url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
                        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
                        maxZoom: 19,
                        filter: 'saturate(0.35) brightness(1.06) contrast(0.88)',
                        label: 'SettingsLocationTileSoft'
                    },
                    'sepia': {
                        url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
                        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
                        maxZoom: 19,
                        filter: 'sepia(0.65) saturate(0.85) contrast(0.95)',
                        label: 'SettingsLocationTileSepia'
                    },
                    'humanitarian': {
                        url: 'https://{s}.tile.openstreetmap.fr/hot/{z}/{x}/{y}.png',
                        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors, Tiles style by <a href="https://www.hotosm.org/">Humanitarian OpenStreetMap Team</a> hosted by <a href="https://openstreetmap.fr/">OpenStreetMap France</a>',
                        maxZoom: 19,
                        label: 'SettingsLocationTileHumanitarian'
                    },
                    'opentopomap': {
                        url: 'https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png',
                        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors, <a href="http://viewfinderpanoramas.org">SRTM</a> | &copy; <a href="https://opentopomap.org">OpenTopoMap</a>',
                        maxZoom: 17,
                        label: 'SettingsLocationTileTerrain'
                    }
                },


                /**
                 * Stored tile styles that are no longer offered, and the style shown instead
                 * (CARTO's raster tiles need an API key since September 2026).
                 * @attribute legacyTileStyles
                 * @type {}
                 */
                legacyTileStyles: {
                    'carto-light': 'light',
                    'carto-dark': 'dark',
                    'carto-voyager': 'soft'
                },


                /**
                 * The closest zoom a bounding box is fitted to.
                 * @attribute FIT_MAX_ZOOM
                 * @type Number
                 */
                FIT_MAX_ZOOM: 17,


                /**
                 * I return the key of the tile provider that shows a stored tile style:
                 * legacy styles map to their replacement, unknown ones to the standard map.
                 * @method resolveTileStyle
                 * @param {String} style
                 * @return {String}
                 */
                resolveTileStyle: function(style) {
                    style = this.legacyTileStyles[style] || style;
                    return this.tileProviders[style] ? style : 'osm-standard';
                },


                /**
                 * I return the attributes of a new location: the default place, fitted to its area.
                 * @method newAttributes
                 * @return {Object}
                 */
                newAttributes: function() {
                    return {
                        lat:         this.defaultPlace.lat,
                        lon:         this.defaultPlace.lon,
                        boundingBox: this.defaultPlace.boundingBox.slice()
                    };
                },


                /**
                 * I return the stored zoom level, or null when there is none (the map then
                 * fits its bounding box, or shows zoom 15).
                 * @method zoomOf
                 * @param {Object} attrs
                 * @return {Number|null}
                 */
                zoomOf: function(attrs) {
                    var zoom = parseInt(attrs.zoom, 10);
                    return Number.isFinite(zoom) ? zoom : null;
                },


                /**
                 * I return the stored bounding box as Leaflet bounds, or null unless it holds
                 * four numbers ([south, north, west, east]; an empty one is often stored as
                 * four empty strings).
                 * @method boundsOf
                 * @param {Object} attrs
                 * @return {L.LatLngBounds|null}
                 */
                boundsOf: function(attrs) {
                    var box = Array.isArray(attrs.boundingBox) ? attrs.boundingBox : [];
                    if (box.length !== 4 || box.some(function(value) { return value === '' || value === null || !Number.isFinite(Number(value)); })) {
                        return null;
                    }
                    box = box.map(Number);
                    return L.latLngBounds([box[0], box[2]], [box[1], box[3]]);
                },


                /**
                 * I return a search result's short name: its own name, else the first part of its address.
                 * @method placeName
                 * @param {Object} result a Nominatim search result
                 * @return {String}
                 */
                placeName: function(result) {
                    var name = (typeof result.name === 'string') ? result.name.trim() : '';
                    return name || String(result.display_name || '').split(',')[0].trim() || this.labels['ResourceTypeLocation'];
                },


                /**
                 * I search places by name (Nominatim). Its usage policy allows no search-as-you-type
                 * and at most one request per second: callers search on Enter or a button only, and a
                 * request that comes too soon waits. The names come in the interface language.
                 * @method searchPlaces
                 * @param {String} query
                 * @return {Promise} the results
                 */
                searchPlaces: function(query) {

                    var localization = FrameTrail.module('Localization'),
                        language     = localization ? localization.language : '',
                        key          = language + '|' + query;

                    if (searchCache[key]) {
                        return Promise.resolve(searchCache[key]);
                    }

                    var wait = Math.max(0, lastSearch + 1000 - Date.now());
                    lastSearch = Date.now() + wait;

                    return new Promise(function(resolve) { setTimeout(resolve, wait); }).then(function() {
                        return fetch('https://nominatim.openstreetmap.org/search?format=json&limit=8&q=' + encodeURIComponent(query)
                            + (language ? '&accept-language=' + encodeURIComponent(language) : ''));
                    }).then(function(response) {
                        if (!response.ok) { throw new Error('Nominatim answered ' + response.status); }
                        return response.json();
                    }).then(function(results) {
                        searchCache[key] = Array.isArray(results) ? results : [];
                        return searchCache[key];
                    });

                },


                /**
                 * Creates a custom colored marker icon using inline SVG
                 * @method createMarkerIcon
                 * @param {String} color - Hex color code
                 * @return {L.DivIcon}
                 */
                createMarkerIcon: function(color) {
                    var markerHtml =
                        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 36" width="24" height="36">' +
                            '<path fill="' + color + '" stroke="#fff" stroke-width="1.5" d="M12 0C5.4 0 0 5.4 0 12c0 7.2 12 24 12 24s12-16.8 12-24c0-6.6-5.4-12-12-12z"/>' +
                            '<circle fill="#fff" cx="12" cy="12" r="5"/>' +
                        '</svg>';

                    return L.divIcon({
                        html: markerHtml,
                        className: 'leaflet-marker-custom',
                        iconSize: [24, 36],
                        iconAnchor: [12, 36],
                        popupAnchor: [0, -36]
                    });
                },


                /**
                 * I make a Leaflet map of attributes in a container that is in the DOM: tile style,
                 * marker, interaction and view (the stored zoom, else the bounding box fitted).
                 * The marker is the map's _ftMarker.
                 *
                 * @method createMap
                 * @param {HTMLElement} container
                 * @param {Object} attrs
                 * @param {Object} [options] { interactive: pan and zoom whatever the attributes say, trackResize }
                 * @return {L.Map}
                 */
                createMap: function(container, attrs, options) {

                    options = options || {};

                    var lat         = parseFloat(attrs.lat),
                        lon         = parseFloat(attrs.lon),
                        hasPosition = Number.isFinite(lat) && Number.isFinite(lon),
                        zoom        = this.zoomOf(attrs),
                        provider    = this.tileProviders[this.resolveTileStyle(attrs.tileStyle)],
                        marker      = attrs.marker || {},
                        controls    = attrs.controls || {};

                    var mapOptions = {
                        center:          hasPosition ? [lat, lon] : [0, 0],
                        zoom:            (zoom !== null) ? zoom : (hasPosition ? 15 : 1),
                        dragging:        options.interactive || controls.dragging !== false,
                        scrollWheelZoom: options.interactive || controls.scrollWheelZoom !== false,
                        zoomControl:     options.interactive || controls.zoomControl !== false,
                        trackResize:     options.trackResize !== false
                    };

                    // If dragging disabled on touch devices, also disable tap
                    if (!mapOptions.dragging) {
                        mapOptions.tap = false;
                    }

                    var map = L.map(container, mapOptions);

                    // Add tile layer. The referrer policy overrides a page's no-referrer
                    // (companion.html): OpenStreetMap refuses tiles without a Referer.
                    var tileOptions = {
                        attribution: provider.attribution,
                        maxZoom: provider.maxZoom || 19,
                        referrerPolicy: 'strict-origin-when-cross-origin'
                    };
                    if (provider.subdomains) {
                        tileOptions.subdomains = provider.subdomains;
                    }
                    var tileLayer = L.tileLayer(provider.url, tileOptions).addTo(map);
                    if (provider.filter) {
                        tileLayer.getContainer().style.filter = provider.filter;
                    }
                    if (provider.background) {
                        map.getContainer().style.background = provider.background;
                    }

                    if (hasPosition && marker.show !== false) {
                        map._ftMarker = L.marker([lat, lon], { icon: this.createMarkerIcon(marker.color || '#e74c3c') }).addTo(map);
                    }

                    // The bounding box when no zoom is stored (a building's would fill the map with it)
                    var bounds = this.boundsOf(attrs);
                    if (bounds && zoom === null) {
                        map.fitBounds(bounds, { animate: false, maxZoom: this.FIT_MAX_ZOOM });
                    }

                    return map;

                },


                /**
                 * I render the content of myself, which is a Leaflet map
                 * wrapped in a &lt;div class="resourceDetail" ...&gt;
                 *
                 * @method renderContent
                 * @return HTMLElement
                 */
                renderContent: function() {

                    var self  = this,
                        attrs = this.resourceData.attributes || {};

                    var _rdw = document.createElement('div');
                    _rdw.innerHTML = '<div class="resourceDetail" data-type="'+ this.resourceData.type +'">'
                                        + '<div class="resourceContent"></div>'
                                        + '</div>';
                    var resourceDetail = _rdw.firstElementChild;
                    var resourceContent = resourceDetail.querySelector('.resourceContent');

                    var provider = this.tileProviders[this.resolveTileStyle(attrs.tileStyle)];
                    if (provider.background) {
                        resourceDetail.style.backgroundColor = provider.background;
                    }

                    // Initialize map after element is in DOM
                    var timer = setTimeout(function() {
                        timer = null;
                        // Stored on resourceDetail: views call invalidateSize() when they resize
                        resourceDetail._leafletMap = self.createMap(resourceContent, attrs);
                        resourceDetail._leafletMap.invalidateSize();
                    }, 100);

                    resourceDetail._ftCleanup = function() {
                        if (timer) {
                            clearTimeout(timer);
                            timer = null;
                        }
                        if (resourceDetail._leafletMap) {
                            resourceDetail._leafletMap.remove();
                            delete resourceDetail._leafletMap;
                        }
                    };

                    resourceDetail.appendChild(this.buildResourceOptions({}));
                    return resourceDetail;

                },

                /**
                 * Several modules need me to render a thumb of myself.
                 *
                 * These thumbs have a special structure of HTMLElements, where several data-attributes carry the information needed by e.g. the {{#crossLink "ResourceManager"}}ResourceManager{{/crossLink}}.
                 *
                 * The id parameter is optional. If it is not passed, the Database tries to find the resource object in its storage.
                 *
                 * @method renderThumb
                 * @param {} id
                 * @return thumbElement
                 */
                renderThumb: function(id) {

                    var trueID,
                        self = this;

                    if (!id) {
                        trueID = FrameTrail.module('Database').getIdOfResource(this.resourceData);
                    } else {
                        trueID = id;
                    }

                    var thumbBackground = (this.resourceData.thumb ?
                            '--thumb-bg: url('+ FrameTrail.module('RouteNavigation').getResourceURL(this.resourceData.thumb) +'); background-image: var(--thumb-bg);' : '' );

                    var tagList = (this.resourceData.tags ? this.resourceData.tags.join(' ') : '');

                    var _tew = document.createElement('div');
                    _tew.innerHTML = '<div class="resourceThumb '+ tagList +'" data-license-type="'+ this.resourceData.licenseType +'" data-resourceID="'+ trueID +'" data-type="'+ this.resourceData.type +'" style="'+ thumbBackground +'">'
                        + '                  <div class="resourceOverlay">'
                        + '                      <div class="resourceIcon"><span class="icon-location-2"></span></div>'
                        + '                  </div>'
                        + '                  <div class="resourceTitle"></div>'
                        + '              </div>';
                    var thumbElement = _tew.firstElementChild;

                    // The name may come from the place search
                    thumbElement.querySelector('.resourceTitle').textContent = this.resourceData.name || '';

                    var previewButton = document.createElement('div');
                    previewButton.className = 'resourcePreviewButton';
                    previewButton.innerHTML = '<span class="icon-eye"></span>';
                    previewButton.addEventListener('click', function(evt) {
                        // call the openPreview method (defined in abstract type: Resource)
                        self.openPreview( this.parentElement );
                        evt.stopPropagation();
                        evt.preventDefault();
                    });
                    thumbElement.appendChild(previewButton);

                    return thumbElement;

                },


                /**
                 * See {{#crossLink "Resource/renderBasicPropertiesControls:method"}}Resource/renderBasicPropertiesControls(){{/crossLink}}
                 * @method renderPropertiesControls
                 * @param {Overlay} overlay
                 * @return &#123; controlsContainer: HTMLElement, changeStart: Function, changeEnd: Function, changeDimensions: Function &#125;
                 */
                renderPropertiesControls: function(overlay) {

                    var basicControls = this.renderBasicPropertiesControls(overlay);

                    basicControls.controlsContainer.querySelector('#OverlayOptions').prepend(this.renderLocationEditor(overlay));

                    return basicControls;

                },


                /**
                 * See {{#crossLink "Resource/renderBasicTimeControls:method"}}Resource/renderBasicTimeControls(){{/crossLink}}
                 * @method renderTimeControls
                 * @param {Annotation} annotation
                 * @return &#123; controlsContainer: HTMLElement, changeStart: Function, changeEnd: Function &#125;
                 */
                renderTimeControls: function(annotation) {

                    var timeControls = this.renderBasicTimeControls(annotation);

                    timeControls.controlsContainer.querySelector('#AnnotationOptions').append(this.renderLocationEditor(annotation));

                    return timeControls;

                },


                /**
                 * I render the editor of a location: the place (a search and a small map — panning
                 * and zooming it sets what the location shows), the tile style, the marker and the
                 * interaction. Every change is one undo step (a snapshot of attributes and name).
                 * @method renderLocationEditor
                 * @param {Object} overlayOrAnnotation
                 * @return HTMLElement
                 */
                renderLocationEditor: function(overlayOrAnnotation) {

                    var self        = this,
                        labels      = this.labels,
                        isOverlay   = !!overlayOrAnnotation.overlayElement,
                        category    = isOverlay ? 'overlays' : 'annotations',
                        elementId   = overlayOrAnnotation.data.created,
                        uid         = 'location-' + Math.random().toString(36).slice(2, 10),
                        pending     = null,
                        miniMap     = null,
                        settingView = false,
                        moveTimer   = null,
                        lastQuery   = '';

                    if (!overlayOrAnnotation.data.attributes) {
                        overlayOrAnnotation.data.attributes = {};
                    }

                    // Undo replaces the attributes object, so it is always read anew
                    var attrs = function() {
                        return overlayOrAnnotation.data.attributes;
                    };
                    var part = function(key) {
                        if (!attrs()[key] || typeof attrs()[key] !== 'object') { attrs()[key] = {}; }
                        return attrs()[key];
                    };

                    var tileStyleOptions = '';
                    for (var styleKey in this.tileProviders) {
                        tileStyleOptions += '<option value="' + styleKey + '">' + labels[this.tileProviders[styleKey].label] + '</option>';
                    }

                    var switchRow = function(className, labelKey) {
                        var id = uid + '-' + className;
                        return '<div class="checkboxRow">'
                            + '    <label class="switch"><input id="' + id + '" type="checkbox" class="' + className + '" autocomplete="off"><span class="slider round"></span></label>'
                            + '    <label for="' + id + '">' + labels[labelKey] + '</label>'
                            + '</div>';
                    };

                    var container = document.createElement('div');
                    container.className = 'locationEditorContainer';
                    container.innerHTML = '<div class="layoutRow">'
                        + '    <div class="column-12">'
                        + '        <label for="' + uid + '-search">' + labels['SettingsLocationPlace'] + '</label>'
                        + '    </div>'
                        + '</div>'
                        + '<div class="layoutRow">'
                        + '    <div class="column-9">'
                        + '        <input id="' + uid + '-search" type="text" class="locationSearchInput" autocomplete="off" placeholder="' + labels['LocationSearch'] + '">'
                        + '    </div>'
                        + '    <div class="column-3">'
                        + '        <button type="button" class="locationSearchButton">' + labels['GenericSearch'] + '</button>'
                        + '    </div>'
                        + '</div>'
                        + '<div class="contextSelectList locationSearchResults" popover="auto" role="listbox"></div>'
                        + '<div class="locationEditorMap"></div>'
                        + '<div class="fieldHint">Data © OpenStreetMap contributors, ODbL 1.0.</div>'
                        + '<div class="layoutRow">'
                        + '    <div class="column-12">'
                        + '        <label>' + labels['SettingsLocationTileStyle'] + '</label>'
                        + '        <div class="custom-select"><select class="locationPropTileStyle">' + tileStyleOptions + '</select></div>'
                        + '    </div>'
                        + '</div>'
                        + '<div class="layoutRow">'
                        + '    <div class="column-4">' + switchRow('locationPropMarkerShow', 'SettingsLocationShowMarker') + '</div>'
                        + '    <div class="column-8">' + switchRow('locationPropZoomControl', 'SettingsLocationShowZoomControls') + '</div>'
                        + '</div>'
                        + '<div class="layoutRow">'
                        + '    <div class="column-4">'
                        + '        <label>' + labels['SettingsLocationMarkerColor'] + '</label>'
                        + '        <input type="color" class="locationPropMarkerColor">'
                        + '    </div>'
                        + '</div>'
                        + '<div class="layoutRow">'
                        + '    <div class="column-4">' + switchRow('locationPropDragging', 'SettingsLocationAllowPanning') + '</div>'
                        + '    <div class="column-8">' + switchRow('locationPropScrollWheelZoom', 'SettingsLocationScrollWheelZoom') + '</div>'
                        + '</div>';

                    var q = function(selector) { return container.querySelector(selector); };

                    var searchInput     = q('.locationSearchInput'),
                        searchButton    = q('.locationSearchButton'),
                        resultList      = q('.locationSearchResults'),
                        mapElement      = q('.locationEditorMap'),
                        tileStyleSelect = q('.locationPropTileStyle'),
                        markerShowInput = q('.locationPropMarkerShow'),
                        markerColor     = q('.locationPropMarkerColor'),
                        zoomControl     = q('.locationPropZoomControl'),
                        draggingInput   = q('.locationPropDragging'),
                        wheelZoomInput  = q('.locationPropScrollWheelZoom');

                    // --- Undo: a change starts with begin() (the state before it) and ends with commit() ---

                    var snapshot = function() {
                        return JSON.parse(JSON.stringify({
                            attributes: attrs(),
                            name:       (overlayOrAnnotation.data.name === undefined) ? null : overlayOrAnnotation.data.name
                        }));
                    };

                    var begin = function() {
                        if (!pending) { pending = snapshot(); }
                    };

                    var findTarget = function() {
                        var items = FrameTrail.module('HypervideoModel')[category];
                        for (var i = 0; i < items.length; i++) {
                            if (items[i].data.created === elementId) { return items[i]; }
                        }
                        return null;
                    };

                    var commit = function(labelKey) {
                        var before = pending,
                            after  = snapshot(),
                            description = (isOverlay ? labels['SidebarOverlays'] : labels['SidebarMyAnnotations']) + ' ' + labels[labelKey];
                        pending = null;
                        if (!before || JSON.stringify(before) === JSON.stringify(after)) { return; }
                        FrameTrail.module('HypervideoModel').newUnsavedChange(category);
                        if (isOverlay) {
                            // Undo and redo render the panel anew
                            FrameTrail.module('OverlaysController').registerStateUndo(
                                overlayOrAnnotation, description, before, after, { rerender: true }
                            );
                            return;
                        }
                        var restore = function(state) {
                            var target = findTarget();
                            if (!target) { return; }
                            target.data.attributes = JSON.parse(JSON.stringify(state.attributes));
                            if (state.name === null) {
                                delete target.data.name;
                            } else {
                                target.data.name = state.name;
                            }
                            rerender(target);
                            if (target === overlayOrAnnotation && container.isConnected) {
                                syncInputs();
                                rebuildMiniMap();
                            }
                            FrameTrail.module('HypervideoModel').newUnsavedChange(category);
                        };
                        FrameTrail.module('UndoManager').register({
                            category: category,
                            description: description,
                            undo: function() { restore(before); },
                            redo: function() { restore(after); }
                        });
                    };

                    // --- Showing a change ---

                    // The item's maps (on the video, in content views) and, after a new place, its label
                    var rerender = function(target) {
                        target = target || overlayOrAnnotation;
                        if (target.overlayElement) {
                            target.rerenderContent();
                        } else {
                            (target.contentViewDetailElements || []).forEach(function(el) {
                                var oldDetail = el.querySelector('.resourceDetail');
                                if (oldDetail) {
                                    if (oldDetail._ftCleanup) { oldDetail._ftCleanup(); }
                                    oldDetail.replaceWith(target.resourceItem.renderContent());
                                }
                            });
                        }
                        if (target.timelineElement) { target.updateLabel(); }
                        // The annotation panel's thumbnail, beside the time controls
                        var panel          = container.closest('.controlsWrapper'),
                            thumbContainer = panel ? panel.querySelector('.previewThumbContainer') : null;
                        if (thumbContainer && target === overlayOrAnnotation) {
                            thumbContainer.innerHTML = '';
                            thumbContainer.appendChild(target.resourceItem.renderThumb());
                        }
                    };

                    var syncInputs = function() {
                        var a = attrs(),
                            marker   = a.marker || {},
                            controls = a.controls || {};
                        tileStyleSelect.value   = self.resolveTileStyle(a.tileStyle);
                        markerShowInput.checked = marker.show !== false;
                        markerColor.value       = /^#[0-9a-fA-F]{6}$/.test(marker.color || '') ? marker.color : '#e74c3c';
                        zoomControl.checked     = controls.zoomControl !== false;
                        draggingInput.checked   = controls.dragging !== false;
                        wheelZoomInput.checked  = controls.scrollWheelZoom !== false;
                    };

                    // --- The mini map: panning and zooming it sets the place and the zoom ---

                    var withoutStoring = function(fn) {
                        settingView = true;
                        try { fn(); } finally { settingView = false; }
                    };

                    // The stored view: the zoom, else the bounding box fitted
                    var showView = function() {
                        if (!miniMap) { return; }
                        var a      = attrs(),
                            lat    = parseFloat(a.lat),
                            lon    = parseFloat(a.lon),
                            zoom   = self.zoomOf(a),
                            bounds = self.boundsOf(a);
                        withoutStoring(function() {
                            miniMap.invalidateSize({ pan: false });
                            if (bounds && zoom === null) {
                                miniMap.fitBounds(bounds, { animate: false, maxZoom: self.FIT_MAX_ZOOM });
                            } else if (Number.isFinite(lat) && Number.isFinite(lon)) {
                                miniMap.setView([lat, lon], (zoom !== null) ? zoom : 15, { animate: false });
                            }
                        });
                    };

                    var buildMiniMap = function() {
                        if (miniMap || !mapElement.isConnected || !mapElement.offsetWidth) { return; }
                        withoutStoring(function() {
                            miniMap = self.createMap(mapElement, attrs(), { interactive: true, trackResize: false });
                        });
                        miniMap.on('movestart', function() {
                            if (!settingView) { begin(); }
                        });
                        miniMap.on('move', function() {
                            if (miniMap._ftMarker) { miniMap._ftMarker.setLatLng(miniMap.getCenter()); }
                        });
                        miniMap.on('moveend', function() {
                            if (settingView) { return; }
                            // One step per gesture: a burst of wheel zooms is one
                            clearTimeout(moveTimer);
                            moveTimer = setTimeout(function() {
                                if (!miniMap) { return; }
                                begin();
                                var center = miniMap.getCenter().wrap(),
                                    a      = attrs();
                                a.lat  = Math.round(center.lat * 1e7) / 1e7;
                                a.lon  = Math.round(center.lng * 1e7) / 1e7;
                                a.zoom = miniMap.getZoom();
                                rerender();
                                commit('SettingsLocationPlace');
                            }, 400);
                        });
                    };

                    var removeMiniMap = function() {
                        clearTimeout(moveTimer);
                        if (miniMap) {
                            miniMap.remove();
                            miniMap = null;
                        }
                    };

                    // Style and marker: the map is made anew
                    var rebuildMiniMap = function() {
                        removeMiniMap();
                        buildMiniMap();
                    };

                    // The map is made once the panel shows it (the Options tab may be hidden at first),
                    // follows its size, and is removed with the panel.
                    var resizeObserver = new ResizeObserver(function() {
                        if (!container.isConnected) {
                            resizeObserver.disconnect();
                            removeMiniMap();
                            return;
                        }
                        if (!miniMap) {
                            buildMiniMap();
                        } else if (mapElement.offsetWidth) {
                            withoutStoring(function() { miniMap.invalidateSize({ pan: false }); });
                        }
                    });
                    resizeObserver.observe(mapElement);

                    // --- The place search ---

                    var placeResults = function() {
                        // Removed with the panel while open: no toggle event comes then
                        if (!container.isConnected) {
                            window.removeEventListener('scroll', placeResults, true);
                            window.removeEventListener('resize', placeResults);
                            return;
                        }
                        // As wide as the search row: addresses are long, they wrap
                        var rect = searchInput.getBoundingClientRect(),
                            row  = searchInput.closest('.layoutRow').getBoundingClientRect();
                        resultList.style.width = row.width + 'px';
                        resultList.style.left  = Math.max(4, Math.min(window.innerWidth - row.width - 4, row.left)) + 'px';
                        resultList.style.top   = Math.max(4, rect.bottom + 2) + 'px';
                    };

                    var showResults = function() {
                        if (!resultList.children.length || !container.isConnected) { return; }
                        if (!resultList.matches(':popover-open')) { resultList.showPopover(); }
                        placeResults();
                    };

                    var message = function(text) {
                        resultList.innerHTML = '';
                        var item = document.createElement('div');
                        item.className = 'locationSearchMessage';
                        item.textContent = text;
                        resultList.appendChild(item);
                        showResults();
                    };

                    var pick = function(result) {
                        var lat = parseFloat(result.lat),
                            lon = parseFloat(result.lon);
                        if (!Number.isFinite(lat) || !Number.isFinite(lon)) { return; }
                        if (resultList.matches(':popover-open')) { resultList.hidePopover(); }
                        begin();
                        var a   = attrs(),
                            box = Array.isArray(result.boundingbox) ? result.boundingbox.map(Number) : [];
                        a.lat = lat;
                        a.lon = lon;
                        if (box.length === 4 && box.every(Number.isFinite)) {
                            a.boundingBox = box;
                        } else {
                            delete a.boundingBox;
                        }
                        // Fitted to the place, until the map is panned or zoomed
                        delete a.zoom;
                        overlayOrAnnotation.data.name = self.placeName(result);
                        rerender();
                        showView();
                        commit('SettingsLocationPlace');
                    };

                    var search = function() {
                        var query = searchInput.value.trim();
                        if (!query) { return; }
                        if (query === lastQuery && resultList.children.length) {
                            showResults();
                            return;
                        }
                        lastQuery = query;
                        searchButton.disabled = true;
                        self.searchPlaces(query).then(function(results) {
                            if (!results.length) {
                                message(labels['MessageLocationNoResults']);
                                return;
                            }
                            resultList.innerHTML = '';
                            results.forEach(function(result) {
                                var item = document.createElement('div');
                                item.tabIndex = 0;
                                item.setAttribute('role', 'option');
                                item.textContent = result.display_name;
                                item.addEventListener('click', function() { pick(result); });
                                item.addEventListener('keydown', function(evt) {
                                    if (evt.key === 'Enter') {
                                        evt.preventDefault();
                                        pick(result);
                                    } else if (evt.key === 'ArrowDown' && item.nextElementSibling) {
                                        evt.preventDefault();
                                        item.nextElementSibling.focus();
                                    } else if (evt.key === 'ArrowUp') {
                                        evt.preventDefault();
                                        (item.previousElementSibling || searchInput).focus();
                                    }
                                });
                                resultList.appendChild(item);
                            });
                            showResults();
                        }).catch(function(error) {
                            console.warn('FrameTrail: the place search failed.', error);
                            lastQuery = '';
                            message(labels['MessageLocationSearchFailed']);
                        }).then(function() {
                            searchButton.disabled = false;
                        });
                    };

                    searchButton.addEventListener('click', search);
                    searchInput.addEventListener('keydown', function(evt) {
                        if (evt.key === 'Enter') {
                            evt.preventDefault();
                            search();
                        } else if (evt.key === 'ArrowDown' && resultList.matches(':popover-open') && resultList.firstElementChild && resultList.firstElementChild.tabIndex === 0) {
                            evt.preventDefault();
                            resultList.firstElementChild.focus();
                        }
                    });
                    // The list stays below the field while the panel scrolls
                    resultList.addEventListener('toggle', function(evt) {
                        if (evt.newState === 'open') {
                            window.addEventListener('scroll', placeResults, true);
                            window.addEventListener('resize', placeResults);
                        } else {
                            window.removeEventListener('scroll', placeResults, true);
                            window.removeEventListener('resize', placeResults);
                        }
                    });

                    // --- Style, marker and interaction ---

                    var change = function(labelKey, write) {
                        begin();
                        write();
                        rerender();
                        rebuildMiniMap();
                        commit(labelKey);
                    };

                    tileStyleSelect.addEventListener('change', function() {
                        var value = this.value;
                        change('SettingsLocationTileStyle', function() { attrs().tileStyle = value; });
                    });

                    markerShowInput.addEventListener('change', function() {
                        var value = this.checked;
                        change('SettingsLocationShowMarker', function() { part('marker').show = value; });
                    });

                    // While a colour is chosen only the item's maps follow; the step is taken on change
                    markerColor.addEventListener('input', function() {
                        begin();
                        part('marker').color = this.value;
                        rerender();
                    });
                    markerColor.addEventListener('change', function() {
                        var value = this.value;
                        change('SettingsLocationMarkerColor', function() { part('marker').color = value; });
                    });

                    zoomControl.addEventListener('change', function() {
                        var value = this.checked;
                        change('SettingsLocationShowZoomControls', function() { part('controls').zoomControl = value; });
                    });

                    draggingInput.addEventListener('change', function() {
                        var value = this.checked;
                        change('SettingsLocationAllowPanning', function() { part('controls').dragging = value; });
                    });

                    wheelZoomInput.addEventListener('change', function() {
                        var value = this.checked;
                        change('SettingsLocationScrollWheelZoom', function() { part('controls').scrollWheelZoom = value; });
                    });

                    syncInputs();

                    return container;

                }




            }
        }
    }


);
