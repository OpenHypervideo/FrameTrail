/**
 * @module Shared
 */


/**
 * I am the type definition of a ResourceLocation. I represent a geo map using Leaflet with OpenStreetMap tiles.
 *
 * @class ResourceLocation
 * @category TypeDefinition
 * @extends Resource
 */



FrameTrail.defineType(

    'ResourceLocation',

    function (FrameTrail) {
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
                 * Tile provider configurations (no API keys required)
                 * @attribute tileProviders
                 * @type {}
                 */
                tileProviders: {
                    'osm-standard': {
                        url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
                        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
                        maxZoom: 19
                    },
                    'carto-light': {
                        url: 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png',
                        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
                        maxZoom: 20,
                        subdomains: 'abcd'
                    },
                    'carto-dark': {
                        url: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
                        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
                        maxZoom: 20,
                        subdomains: 'abcd'
                    },
                    'carto-voyager': {
                        url: 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png',
                        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
                        maxZoom: 20,
                        subdomains: 'abcd'
                    },
                    'opentopomap': {
                        url: 'https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png',
                        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors, <a href="http://viewfinderpanoramas.org">SRTM</a> | &copy; <a href="https://opentopomap.org">OpenTopoMap</a>',
                        maxZoom: 17
                    }
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
                 * I render the content of myself, which is a Leaflet map
                 * wrapped in a &lt;div class="resourceDetail" ...&gt;
                 *
                 * @method renderContent
                 * @return HTMLElement
                 */
                renderContent: function() {

                    var self = this;
                    var attrs = this.resourceData.attributes;

                    var _rdw = document.createElement('div');
                    _rdw.innerHTML = '<div class="resourceDetail" data-type="'+ this.resourceData.type +'">'
                                        + '<div class="resourceContent"></div>'
                                        + '</div>';
                    var resourceDetail = _rdw.firstElementChild;
                    var resourceContent = resourceDetail.querySelector('.resourceContent');

                    // Parse coordinates
                    var lat = parseFloat(attrs.lat);
                    var lon = parseFloat(attrs.lon);

                    // Get settings with defaults (backward compatible)
                    var tileStyle = attrs.tileStyle || 'osm-standard';
                    var zoom = parseInt(attrs.zoom, 10) || 15;
                    var showMarker = attrs.marker ? attrs.marker.show !== false : true;
                    var markerColor = (attrs.marker && attrs.marker.color) ? attrs.marker.color : '#e74c3c';
                    var allowDragging = attrs.controls ? attrs.controls.dragging !== false : true;
                    var allowScrollWheelZoom = attrs.controls ? attrs.controls.scrollWheelZoom !== false : true;
                    var showZoomControl = attrs.controls ? attrs.controls.zoomControl !== false : true;

                    // Get tile provider config
                    var provider = this.tileProviders[tileStyle] || this.tileProviders['osm-standard'];

                    // Initialize map after element is in DOM
                    setTimeout(function() {
                        var mapOptions = {
                            center: [lat, lon],
                            zoom: zoom,
                            dragging: allowDragging,
                            scrollWheelZoom: allowScrollWheelZoom,
                            zoomControl: showZoomControl
                        };

                        // If dragging disabled on touch devices, also disable tap
                        if (!allowDragging) {
                            mapOptions.tap = false;
                        }

                        var map = L.map(resourceContent, mapOptions);

                        // Add tile layer
                        var tileOptions = {
                            attribution: provider.attribution,
                            maxZoom: provider.maxZoom || 19
                        };
                        if (provider.subdomains) {
                            tileOptions.subdomains = provider.subdomains;
                        }
                        L.tileLayer(provider.url, tileOptions).addTo(map);

                        // Add marker if enabled
                        if (showMarker) {
                            var icon = self.createMarkerIcon(markerColor);
                            L.marker([lat, lon], { icon: icon }).addTo(map);
                        }

                        // Handle boundingBox if provided and no explicit zoom
                        if (attrs.boundingBox && !attrs.zoom) {
                            var bounds = L.latLngBounds(
                                [attrs.boundingBox[0], attrs.boundingBox[2]],  // SW
                                [attrs.boundingBox[1], attrs.boundingBox[3]]   // NE
                            );
                            map.fitBounds(bounds);
                        }

                        // Store map reference on resourceDetail for refreshMap compatibility
                        resourceDetail._leafletMap = map;

                        // Handle resize
                        map.invalidateSize();

                    }, 100);

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
                        + '                  <div class="resourceTitle">'+ this.resourceData.name +'</div>'
                        + '              </div>';
                    var thumbElement = _tew.firstElementChild;

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
                 * I render an editor for location properties (tile style, zoom, marker, interaction controls)
                 * with per-property undo/redo support following the ResourceHotspot pattern.
                 * @method renderLocationEditor
                 * @param {Object} overlayOrAnnotation
                 * @return HTMLElement
                 */
                renderLocationEditor: function(overlayOrAnnotation) {

                    var self = this;
                    var attrs = overlayOrAnnotation.data.attributes;

                    // Ensure nested structures exist
                    if (!attrs.marker) {
                        attrs.marker = {};
                    }
                    if (!attrs.controls) {
                        attrs.controls = {};
                    }

                    // Current values with defaults
                    var currentTileStyle = attrs.tileStyle || 'osm-standard';
                    var currentZoom = attrs.zoom || 15;
                    var currentMarkerShow = attrs.marker.show !== false;
                    var currentMarkerColor = attrs.marker.color || '#e74c3c';
                    var currentDragging = attrs.controls.dragging !== false;
                    var currentZoomControl = attrs.controls.zoomControl !== false;
                    var currentScrollWheelZoom = attrs.controls.scrollWheelZoom !== false;

                    // Determine if overlay or annotation
                    var isOverlay = !!overlayOrAnnotation.overlayElement;
                    var category = isOverlay ? 'overlays' : 'annotations';
                    var elementId = overlayOrAnnotation.data.created;

                    // Helper to find element by created timestamp (for undo/redo closures)
                    var findElement = function(id, cat) {
                        var arr = cat === 'overlays' ?
                            FrameTrail.module('HypervideoModel').overlays :
                            FrameTrail.module('HypervideoModel').annotations;
                        for (var i = 0; i < arr.length; i++) {
                            if (arr[i].data.created === id) {
                                return arr[i];
                            }
                        }
                        return null;
                    };

                    // Helper to re-render the map (preserves resize handles on overlayElement)
                    var refreshMap = function(el) {
                        if (el.overlayElement) {
                            var mapContainer = el.overlayElement.querySelector('.resourceDetail[data-type="location"]');
                            if (mapContainer) {
                                if (mapContainer._leafletMap) {
                                    mapContainer._leafletMap.remove();
                                    delete mapContainer._leafletMap;
                                }
                                mapContainer.remove();
                            }
                            (el.getContentHost ? el.getContentHost() : el.overlayElement).prepend(el.resourceItem.renderContent());
                        } else {
                            (el.contentViewDetailElements || []).forEach(function(item) {
                                var cvItem = item.jquery ? item[0] : item;
                                var mapContainer = cvItem.querySelector('.resourceDetail[data-type="location"]');
                                if (mapContainer) {
                                    if (mapContainer._leafletMap) {
                                        mapContainer._leafletMap.remove();
                                        delete mapContainer._leafletMap;
                                    }
                                    mapContainer.remove();
                                }
                                cvItem.appendChild(el.resourceItem.renderContent());
                            });
                        }
                    };

                    // Helper to sync editor UI controls from current data attributes
                    var syncEditorUI = function(a) {
                        var c = document.querySelector('.locationEditorContainer');
                        if (!c) return;
                        c.querySelector('.locationPropTileStyle').value = a.tileStyle || 'osm-standard';
                        c.querySelector('.locationPropZoom').value = a.zoom || 15;

                        c.querySelector('.locationPropMarkerShow').checked = a.marker ? a.marker.show !== false : true;
                        c.querySelector('.locationPropMarkerColor').value = a.marker && a.marker.color ? a.marker.color : '#e74c3c';
                        c.querySelector('.locationPropDragging').checked = a.controls ? a.controls.dragging !== false : true;
                        c.querySelector('.locationPropZoomControl').checked = a.controls ? a.controls.zoomControl !== false : true;
                        c.querySelector('.locationPropScrollWheelZoom').checked = a.controls ? a.controls.scrollWheelZoom !== false : true;
                    };

                    // Build location-specific controls HTML
                    var locationEditorContainer = document.createElement('div');
                    locationEditorContainer.className = 'locationEditorContainer';
                    locationEditorContainer.innerHTML =
                        '<div class="layoutRow">'
                        + '<div class="column-12">'
                        + '<label>' + this.labels['SettingsLocationTileStyle'] + '</label>'
                        + '<div class="custom-select">'
                        + '<select class="locationPropTileStyle">'
                        + '<option value="osm-standard">OpenStreetMap (Standard)</option>'
                        + '<option value="carto-light">Light (CARTO Positron)</option>'
                        + '<option value="carto-dark">Dark (CARTO Dark Matter)</option>'
                        + '<option value="carto-voyager">Colorful (CARTO Voyager)</option>'
                        + '<option value="opentopomap">Terrain (OpenTopoMap)</option>'
                        + '</select>'
                        + '</div>'
                        + '</div>'
                        + '</div>'
                        + '<div class="layoutRow">'
                        + '<div class="column-4">'
                        + '<div class="checkboxRow">'
                        + '<label class="switch">'
                        + '<input id="locationPropMarkerShow" type="checkbox" class="locationPropMarkerShow"' + (currentMarkerShow ? ' checked' : '') + '>'
                        + '<span class="slider round"></span>'
                        + '</label>'
                        + '<label for="locationPropMarkerShow">' + this.labels['SettingsLocationShowMarker'] + '</label>'
                        + '</div>'
                        + '</div>'
                        + '<div class="column-8">'
                        + '<div class="checkboxRow">'
                        + '<label class="switch">'
                        + '<input id="locationPropZoomControl" type="checkbox" class="locationPropZoomControl"' + (currentZoomControl ? ' checked' : '') + '>'
                        + '<span class="slider round"></span>'
                        + '</label>'
                        + '<label for="locationPropZoomControl">' + this.labels['SettingsLocationShowZoomControls'] + '</label>'
                        + '</div>'
                        + '</div>'
                        + '</div>'
                        + '<div class="layoutRow">'
                        + '<div class="column-4">'
                        + '<label>' + this.labels['SettingsLocationMarkerColor'] + '</label>'
                        + '<input type="color" class="locationPropMarkerColor" value="' + currentMarkerColor + '"/>'
                        + '</div>'
                        + '<div class="column-8">'
                        + '<label>' + this.labels['SettingsLocationZoomLevel'] + '</label>'
                        + '<input type="range" class="locationPropZoom" min="1" max="19" value="' + currentZoom + '">'
                        + '</div>'
                        + '</div>'
                        + '<div class="layoutRow">'
                        + '<div class="column-4">'
                        + '<div class="checkboxRow">'
                        + '<label class="switch">'
                        + '<input id="locationPropDragging" type="checkbox" class="locationPropDragging"' + (currentDragging ? ' checked' : '') + '>'
                        + '<span class="slider round"></span>'
                        + '</label>'
                        + '<label for="locationPropDragging">' + this.labels['SettingsLocationAllowPanning'] + '</label>'
                        + '</div>'
                        + '</div>'
                        + '<div class="column-4">'
                        + '<div class="checkboxRow">'
                        + '<label class="switch">'
                        + '<input id="locationPropScrollWheelZoom" type="checkbox" class="locationPropScrollWheelZoom"' + (currentScrollWheelZoom ? ' checked' : '') + '>'
                        + '<span class="slider round"></span>'
                        + '</label>'
                        + '<label for="locationPropScrollWheelZoom">' + this.labels['SettingsLocationScrollWheelZoom'] + '</label>'
                        + '</div>'
                        + '</div>'
                        + '</div>';

                    // Set current tile style selection
                    locationEditorContainer.querySelector('.locationPropTileStyle').value = currentTileStyle;

                    // ============================================
                    // TILE STYLE with Undo
                    // ============================================
                    var tileStyleBeforeChange = currentTileStyle;
                    locationEditorContainer.querySelector('.locationPropTileStyle').addEventListener('focus', function() {
                        tileStyleBeforeChange = overlayOrAnnotation.data.attributes.tileStyle || 'osm-standard';
                    });

                    locationEditorContainer.querySelector('.locationPropTileStyle').addEventListener('change', function() {
                        var newStyle = this.value;
                        var oldStyle = tileStyleBeforeChange;
                        overlayOrAnnotation.data.attributes.tileStyle = newStyle;
                        refreshMap(overlayOrAnnotation);
                        FrameTrail.module('HypervideoModel').newUnsavedChange(category);

                        if (oldStyle !== newStyle) {
                            (function(id, oldVal, newVal, cat, labels) {
                                FrameTrail.module('UndoManager').register({
                                    category: cat,
                                    description: (cat === 'overlays' ? labels['SidebarOverlays'] : labels['SidebarMyAnnotations']) + ' ' + labels['SettingsLocationTileStyle'],
                                    undo: function() {
                                        var el = findElement(id, cat);
                                        if (!el) return;
                                        el.data.attributes.tileStyle = oldVal;
                                        refreshMap(el);
                                        syncEditorUI(el.data.attributes);
                                        FrameTrail.module('HypervideoModel').newUnsavedChange(cat);
                                    },
                                    redo: function() {
                                        var el = findElement(id, cat);
                                        if (!el) return;
                                        el.data.attributes.tileStyle = newVal;
                                        refreshMap(el);
                                        syncEditorUI(el.data.attributes);
                                        FrameTrail.module('HypervideoModel').newUnsavedChange(cat);
                                    }
                                });
                            })(elementId, oldStyle, newStyle, category, self.labels);
                        }
                        tileStyleBeforeChange = newStyle;
                    });

                    // ============================================
                    // ZOOM LEVEL with Undo
                    // ============================================
                    var zoomBeforeChange = currentZoom;
                    locationEditorContainer.querySelector('.locationPropZoom').addEventListener('focus', function() {
                        zoomBeforeChange = overlayOrAnnotation.data.attributes.zoom || 15;
                    });



                    locationEditorContainer.querySelector('.locationPropZoom').addEventListener('change', function() {
                        var newZoom = parseInt(this.value, 10);
                        var oldZoom = zoomBeforeChange;
                        overlayOrAnnotation.data.attributes.zoom = newZoom;
                        refreshMap(overlayOrAnnotation);
                        FrameTrail.module('HypervideoModel').newUnsavedChange(category);

                        if (oldZoom !== newZoom) {
                            (function(id, oldVal, newVal, cat, labels) {
                                FrameTrail.module('UndoManager').register({
                                    category: cat,
                                    description: (cat === 'overlays' ? labels['SidebarOverlays'] : labels['SidebarMyAnnotations']) + ' ' + labels['SettingsLocationZoomLevel'],
                                    undo: function() {
                                        var el = findElement(id, cat);
                                        if (!el) return;
                                        el.data.attributes.zoom = oldVal;
                                        refreshMap(el);
                                        syncEditorUI(el.data.attributes);
                                        FrameTrail.module('HypervideoModel').newUnsavedChange(cat);
                                    },
                                    redo: function() {
                                        var el = findElement(id, cat);
                                        if (!el) return;
                                        el.data.attributes.zoom = newVal;
                                        refreshMap(el);
                                        syncEditorUI(el.data.attributes);
                                        FrameTrail.module('HypervideoModel').newUnsavedChange(cat);
                                    }
                                });
                            })(elementId, oldZoom, newZoom, category, self.labels);
                        }
                        zoomBeforeChange = newZoom;
                    });

                    // ============================================
                    // MARKER SHOW with Undo
                    // ============================================
                    var markerShowBeforeChange = currentMarkerShow;
                    locationEditorContainer.querySelector('.locationPropMarkerShow').addEventListener('focus', function() {
                        markerShowBeforeChange = overlayOrAnnotation.data.attributes.marker.show !== false;
                    });

                    locationEditorContainer.querySelector('.locationPropMarkerShow').addEventListener('change', function() {
                        var newValue = this.checked;
                        var oldValue = markerShowBeforeChange;
                        overlayOrAnnotation.data.attributes.marker.show = newValue;
                        refreshMap(overlayOrAnnotation);
                        FrameTrail.module('HypervideoModel').newUnsavedChange(category);

                        if (oldValue !== newValue) {
                            (function(id, oldVal, newVal, cat, labels) {
                                FrameTrail.module('UndoManager').register({
                                    category: cat,
                                    description: (cat === 'overlays' ? labels['SidebarOverlays'] : labels['SidebarMyAnnotations']) + ' ' + labels['SettingsLocationShowMarker'],
                                    undo: function() {
                                        var el = findElement(id, cat);
                                        if (!el) return;
                                        if (!el.data.attributes.marker) el.data.attributes.marker = {};
                                        el.data.attributes.marker.show = oldVal;
                                        refreshMap(el);
                                        syncEditorUI(el.data.attributes);
                                        FrameTrail.module('HypervideoModel').newUnsavedChange(cat);
                                    },
                                    redo: function() {
                                        var el = findElement(id, cat);
                                        if (!el) return;
                                        if (!el.data.attributes.marker) el.data.attributes.marker = {};
                                        el.data.attributes.marker.show = newVal;
                                        refreshMap(el);
                                        syncEditorUI(el.data.attributes);
                                        FrameTrail.module('HypervideoModel').newUnsavedChange(cat);
                                    }
                                });
                            })(elementId, oldValue, newValue, category, self.labels);
                        }
                        markerShowBeforeChange = newValue;
                    });

                    // ============================================
                    // MARKER COLOR with Undo
                    // ============================================
                    var markerColorBeforeChange = currentMarkerColor;
                    locationEditorContainer.querySelector('.locationPropMarkerColor').addEventListener('focus', function() {
                        markerColorBeforeChange = (overlayOrAnnotation.data.attributes.marker && overlayOrAnnotation.data.attributes.marker.color) || '#e74c3c';
                    });

                    locationEditorContainer.querySelector('.locationPropMarkerColor').addEventListener('input', function() {
                        overlayOrAnnotation.data.attributes.marker.color = this.value;
                        refreshMap(overlayOrAnnotation);
                    });

                    locationEditorContainer.querySelector('.locationPropMarkerColor').addEventListener('change', function() {
                        var newColor = this.value;
                        var oldColor = markerColorBeforeChange;
                        overlayOrAnnotation.data.attributes.marker.color = newColor;
                        refreshMap(overlayOrAnnotation);
                        FrameTrail.module('HypervideoModel').newUnsavedChange(category);

                        if (oldColor !== newColor) {
                            (function(id, oldVal, newVal, cat, labels) {
                                FrameTrail.module('UndoManager').register({
                                    category: cat,
                                    description: (cat === 'overlays' ? labels['SidebarOverlays'] : labels['SidebarMyAnnotations']) + ' ' + labels['SettingsLocationMarkerColor'],
                                    undo: function() {
                                        var el = findElement(id, cat);
                                        if (!el) return;
                                        if (!el.data.attributes.marker) el.data.attributes.marker = {};
                                        el.data.attributes.marker.color = oldVal;
                                        refreshMap(el);
                                        syncEditorUI(el.data.attributes);
                                        FrameTrail.module('HypervideoModel').newUnsavedChange(cat);
                                    },
                                    redo: function() {
                                        var el = findElement(id, cat);
                                        if (!el) return;
                                        if (!el.data.attributes.marker) el.data.attributes.marker = {};
                                        el.data.attributes.marker.color = newVal;
                                        refreshMap(el);
                                        syncEditorUI(el.data.attributes);
                                        FrameTrail.module('HypervideoModel').newUnsavedChange(cat);
                                    }
                                });
                            })(elementId, oldColor, newColor, category, self.labels);
                        }
                        markerColorBeforeChange = newColor;
                    });

                    // ============================================
                    // DRAGGING with Undo
                    // ============================================
                    var draggingBeforeChange = currentDragging;
                    locationEditorContainer.querySelector('.locationPropDragging').addEventListener('focus', function() {
                        draggingBeforeChange = overlayOrAnnotation.data.attributes.controls.dragging !== false;
                    });

                    locationEditorContainer.querySelector('.locationPropDragging').addEventListener('change', function() {
                        var newValue = this.checked;
                        var oldValue = draggingBeforeChange;
                        overlayOrAnnotation.data.attributes.controls.dragging = newValue;
                        refreshMap(overlayOrAnnotation);
                        FrameTrail.module('HypervideoModel').newUnsavedChange(category);

                        if (oldValue !== newValue) {
                            (function(id, oldVal, newVal, cat, labels) {
                                FrameTrail.module('UndoManager').register({
                                    category: cat,
                                    description: (cat === 'overlays' ? labels['SidebarOverlays'] : labels['SidebarMyAnnotations']) + ' ' + labels['SettingsLocationAllowPanning'],
                                    undo: function() {
                                        var el = findElement(id, cat);
                                        if (!el) return;
                                        if (!el.data.attributes.controls) el.data.attributes.controls = {};
                                        el.data.attributes.controls.dragging = oldVal;
                                        refreshMap(el);
                                        syncEditorUI(el.data.attributes);
                                        FrameTrail.module('HypervideoModel').newUnsavedChange(cat);
                                    },
                                    redo: function() {
                                        var el = findElement(id, cat);
                                        if (!el) return;
                                        if (!el.data.attributes.controls) el.data.attributes.controls = {};
                                        el.data.attributes.controls.dragging = newVal;
                                        refreshMap(el);
                                        syncEditorUI(el.data.attributes);
                                        FrameTrail.module('HypervideoModel').newUnsavedChange(cat);
                                    }
                                });
                            })(elementId, oldValue, newValue, category, self.labels);
                        }
                        draggingBeforeChange = newValue;
                    });

                    // ============================================
                    // ZOOM CONTROL with Undo
                    // ============================================
                    var zoomControlBeforeChange = currentZoomControl;
                    locationEditorContainer.querySelector('.locationPropZoomControl').addEventListener('focus', function() {
                        zoomControlBeforeChange = overlayOrAnnotation.data.attributes.controls.zoomControl !== false;
                    });

                    locationEditorContainer.querySelector('.locationPropZoomControl').addEventListener('change', function() {
                        var newValue = this.checked;
                        var oldValue = zoomControlBeforeChange;
                        overlayOrAnnotation.data.attributes.controls.zoomControl = newValue;
                        refreshMap(overlayOrAnnotation);
                        FrameTrail.module('HypervideoModel').newUnsavedChange(category);

                        if (oldValue !== newValue) {
                            (function(id, oldVal, newVal, cat, labels) {
                                FrameTrail.module('UndoManager').register({
                                    category: cat,
                                    description: (cat === 'overlays' ? labels['SidebarOverlays'] : labels['SidebarMyAnnotations']) + ' ' + labels['SettingsLocationShowZoomControls'],
                                    undo: function() {
                                        var el = findElement(id, cat);
                                        if (!el) return;
                                        if (!el.data.attributes.controls) el.data.attributes.controls = {};
                                        el.data.attributes.controls.zoomControl = oldVal;
                                        refreshMap(el);
                                        syncEditorUI(el.data.attributes);
                                        FrameTrail.module('HypervideoModel').newUnsavedChange(cat);
                                    },
                                    redo: function() {
                                        var el = findElement(id, cat);
                                        if (!el) return;
                                        if (!el.data.attributes.controls) el.data.attributes.controls = {};
                                        el.data.attributes.controls.zoomControl = newVal;
                                        refreshMap(el);
                                        syncEditorUI(el.data.attributes);
                                        FrameTrail.module('HypervideoModel').newUnsavedChange(cat);
                                    }
                                });
                            })(elementId, oldValue, newValue, category, self.labels);
                        }
                        zoomControlBeforeChange = newValue;
                    });

                    // ============================================
                    // SCROLL WHEEL ZOOM with Undo
                    // ============================================
                    var scrollWheelZoomBeforeChange = currentScrollWheelZoom;
                    locationEditorContainer.querySelector('.locationPropScrollWheelZoom').addEventListener('focus', function() {
                        scrollWheelZoomBeforeChange = overlayOrAnnotation.data.attributes.controls.scrollWheelZoom !== false;
                    });

                    locationEditorContainer.querySelector('.locationPropScrollWheelZoom').addEventListener('change', function() {
                        var newValue = this.checked;
                        var oldValue = scrollWheelZoomBeforeChange;
                        overlayOrAnnotation.data.attributes.controls.scrollWheelZoom = newValue;
                        refreshMap(overlayOrAnnotation);
                        FrameTrail.module('HypervideoModel').newUnsavedChange(category);

                        if (oldValue !== newValue) {
                            (function(id, oldVal, newVal, cat, labels) {
                                FrameTrail.module('UndoManager').register({
                                    category: cat,
                                    description: (cat === 'overlays' ? labels['SidebarOverlays'] : labels['SidebarMyAnnotations']) + ' ' + labels['SettingsLocationScrollWheelZoom'],
                                    undo: function() {
                                        var el = findElement(id, cat);
                                        if (!el) return;
                                        if (!el.data.attributes.controls) el.data.attributes.controls = {};
                                        el.data.attributes.controls.scrollWheelZoom = oldVal;
                                        refreshMap(el);
                                        syncEditorUI(el.data.attributes);
                                        FrameTrail.module('HypervideoModel').newUnsavedChange(cat);
                                    },
                                    redo: function() {
                                        var el = findElement(id, cat);
                                        if (!el) return;
                                        if (!el.data.attributes.controls) el.data.attributes.controls = {};
                                        el.data.attributes.controls.scrollWheelZoom = newVal;
                                        refreshMap(el);
                                        syncEditorUI(el.data.attributes);
                                        FrameTrail.module('HypervideoModel').newUnsavedChange(cat);
                                    }
                                });
                            })(elementId, oldValue, newValue, category, self.labels);
                        }
                        scrollWheelZoomBeforeChange = newValue;
                    });

                    return locationEditorContainer;

                }




            }
        }
    }


);
