/**
 * @module Shared
 */


/**
 * I am the type definition of a ResourceHotspot.
 *
 * * Hotspot Resources only appear in the 'Add Custom Overlay' tab
 *   and are not listed in the ResourceManager.
 *
 * * Hotspot Resources can not be used as Annotation
 *
 * @class ResourceHotspot
 * @category TypeDefinition
 * @extends Resource
 */



FrameTrail.defineType(

    'ResourceHotspot',

    function (FrameTrail) {
        return {
            parent: 'Resource',
            constructor: function(resourceData){
                this.resourceData = resourceData;
            },
            prototype: {
                /**
                 * I hold the data object of a custom ResourceHotspot, which is not stored in the Database and doesn't appear in the resource's _index.json.
                 * @attribute resourceData
                 * @type {}
                 */
                resourceData:   {},
                iconClass:      'icon-link',


                /**
                 * I render the content of myself, which is a &lt;div&gt; containing a pulsating circle hotspot wrapped in a &lt;div class="resourceDetail" ...&gt;
                 *
                 * @method renderContent
                 * @return HTMLElement
                 */
                renderContent: function() {

                    var self = this;

                    var color = (this.resourceData.attributes && this.resourceData.attributes.color) ? this.resourceData.attributes.color : '#0096ff';
                    var linkUrl = (this.resourceData.attributes && this.resourceData.attributes.linkUrl) ? this.resourceData.attributes.linkUrl : '';
                    var borderWidth = (this.resourceData.attributes && this.resourceData.attributes.borderWidth !== undefined) ? this.resourceData.attributes.borderWidth : 5;
                    var shape = (this.resourceData.attributes && this.resourceData.attributes.shape) ? this.resourceData.attributes.shape : 'circle';
                    var borderRadius = (this.resourceData.attributes && this.resourceData.attributes.borderRadius !== undefined) ? this.resourceData.attributes.borderRadius : 10;

                    // Calculate border-radius value based on shape (0% to 50%)
                    var borderRadiusValue;
                    if (shape === 'circle') {
                        borderRadiusValue = '50%';
                    } else if (shape === 'rectangle') {
                        borderRadiusValue = '0';
                    } else { // rounded
                        borderRadiusValue = borderRadius + 'px';
                    }

                    // Calculate border width - we'll set it as a CSS variable and update it
                    // Border width will be a percentage of the smaller dimension
                    var borderWidthValue = borderWidth > 0 ? borderWidth + '%' : '0';

                    // Always use an <a> tag (even when empty, to avoid element replacement during editing)
                    var elementAttrs = ' href="' + (linkUrl || '#') + '"';
                    if (linkUrl && (linkUrl.startsWith('http://') || linkUrl.startsWith('https://'))) {
                        elementAttrs += ' target="_blank"';
                    }

                    var _rdw = document.createElement('div');
                    _rdw.innerHTML = '<div class="resourceDetail" data-type="hotspot">'
                                        +  '    <div class="resourceContent">'
                                        +  '        <div class="hotspot-container">'
                                        +  '            <div class="hotspot-square-wrapper">'
                                        +  '                <a class="hotspot-element"' + elementAttrs + ' style="border-radius: ' + borderRadiusValue + '; border-color: ' + color + '; text-decoration: none; display: block;"></a>'
                                        +  '                <div class="hotspot-pulse" style="border-color: ' + color + '; border-radius: ' + borderRadiusValue + ';"></div>'
                                        +  '            </div>'
                                        +  '        </div>'
                                        +  '    </div>'
                                        +  '</div>';
                    var resourceDetail = _rdw.firstElementChild;

                    var hotspotElement = resourceDetail.querySelector('.hotspot-element');
                    
                    // Helper function to convert hex color to rgba
                    var hexToRgba = function(hex, alpha) {
                        var r = parseInt(hex.slice(1, 3), 16);
                        var g = parseInt(hex.slice(3, 5), 16);
                        var b = parseInt(hex.slice(5, 7), 16);
                        return 'rgba(' + r + ', ' + g + ', ' + b + ', ' + alpha + ')';
                    };
                    
                    // Calculate and set border width in pixels (percentage of smaller dimension)
                    var calculateBorderWidth = function(element, percentage) {
                        if (percentage <= 0) return 0;
                        // Wait for element to be in DOM to get dimensions
                        setTimeout(function() {
                            var width = element.offsetWidth;
                            var height = element.offsetHeight;
                            var smaller = Math.min(width, height);
                            var actualWidth = (smaller * percentage) / 100;
                            element.style.borderWidth = actualWidth + 'px';
                        }, 0);
                        return 0; // Initial value
                    };
                    
                    // Set initial border width
                    calculateBorderWidth(hotspotElement, borderWidth);
                    hotspotElement.style.backgroundColor = 'transparent';
                    hotspotElement.style.borderStyle = 'solid';
                    hotspotElement.style.borderColor = color;
                    
                    // Add hover effect: make background semi-transparent
                    if (borderWidth > 0) {
                        var hoverColor = hexToRgba(color, 0.3);
                        hotspotElement.addEventListener('mouseenter', function() {
                            this.style.backgroundColor = hoverColor;
                        });
                        
                        hotspotElement.addEventListener('mouseleave', function() {
                            this.style.backgroundColor = 'transparent';
                        });
                    }
                    
                    // Route all clicks through the shared overlay action model
                    // (falls back to linkUrl as 'openUrl' for existing hotspot data)
                    hotspotElement.addEventListener('click', function(e) {
                        e.preventDefault();
                        if (FrameTrail.getState('editMode') === 'overlays') { return; }
                        self.executeOverlayAction(self.resourceData.attributes || {});
                    });

                    resourceDetail.appendChild(this.buildResourceOptions({
                        licenseType: this.resourceData.licenseType,
                        licenseAttribution: this.resourceData.licenseAttribution
                    }));

                    return resourceDetail;

                },

                /**
                 * Several modules need me to render a thumb of myself.
                 *
                 * These thumbs have a special structure of HTMLElements, where several data-attributes carry the information needed.
                 *
                 * @method renderThumb
                 * @return thumbElement
                 */
                renderThumb: function() {

                    var self = this;

                    var tagList = (this.resourceData.tags ? this.resourceData.tags.join(' ') : '');

                    var _tew = document.createElement('div');
                    _tew.innerHTML = '<div class="resourceThumb '+ tagList +'" data-license-type="'+ this.resourceData.licenseType +'" data-type="'+ this.resourceData.type +'">'
                        + '                  <div class="resourceOverlay">'
                        + '                      <div class="resourceIcon"><span class="icon-link"></span></div>'
                        + '                  </div>'
                        + '                  <div class="resourceTitle">Hotspot / Link</div>'
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

                    basicControls.controlsContainer.querySelector('#OverlayOptions').prepend(this.renderHotspotEditor(overlay));


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

                    timeControls.controlsContainer.querySelector('#AnnotationOptions').append(this.renderHotspotEditor(annotation));

                    return timeControls;

                },


                /**
                 * I render an editor for hotspot properties (color, link URL)
                 * @method renderHotspotEditor
                 * @param {Object} overlayOrAnnotation
                 * @return &#123; hotspotEditorContainer: HTMLElement;
                 */
                renderHotspotEditor: function(overlayOrAnnotation) {

                    var self = this;
                    var currentAttributes = overlayOrAnnotation.data.attributes || {};

                    if (!currentAttributes.color) {
                        currentAttributes.color = '#0096ff';
                    }
                    if (!currentAttributes.linkUrl) {
                        currentAttributes.linkUrl = '';
                    }
                    if (currentAttributes.borderWidth === undefined) {
                        currentAttributes.borderWidth = 5;
                    }
                    if (!currentAttributes.shape) {
                        currentAttributes.shape = 'circle';
                    }
                    if (currentAttributes.borderRadius === undefined) {
                        currentAttributes.borderRadius = 10;
                    }

                    var hotspotEditorContainer = document.createElement('div');
                    hotspotEditorContainer.className = 'hotspotEditorContainer';

                    // Helper to sync editor UI controls from current data attributes
                    var syncHotspotUI = function(a) {
                        var c = document.querySelector('.hotspotEditorContainer');
                        if (!c) return;
                        c.querySelector('.hotspotPropShape').value = a.shape || 'circle';
                        c.querySelector('.hotspotPropColor').value = a.color || '#0096ff';
                        c.querySelector('.hotspotPropBorderWidth').value = a.borderWidth !== undefined ? a.borderWidth : 5;
                        c.querySelector('.hotspotPropBorderRadius').value = a.borderRadius !== undefined ? a.borderRadius : 10;
                    };

                    // Helper function to convert hex color to rgba
                    var hexToRgba = function(hex, alpha) {
                        var r = parseInt(hex.slice(1, 3), 16);
                        var g = parseInt(hex.slice(3, 5), 16);
                        var b = parseInt(hex.slice(5, 7), 16);
                        return 'rgba(' + r + ', ' + g + ', ' + b + ', ' + alpha + ')';
                    };

                    // Create layout row container for all columns
                    var layoutRow = document.createElement('div');
                    layoutRow.className = 'layoutRow';
                    
                    // Shape and Color columns
                    var shapeColumn = document.createElement('div');
                    shapeColumn.className = 'column-3';
                    var colorColumn = document.createElement('div');
                    colorColumn.className = 'column-3';

                    // Helper function to apply shape, border-radius, and border-width changes
                    var applyShapeChanges = function(overlayOrAnnotation, shape, borderRadius, borderWidth, color) {
                        var borderRadiusValue;
                        if (shape === 'circle') {
                            borderRadiusValue = '50%';
                        } else if (shape === 'rectangle') {
                            borderRadiusValue = '0';
                        } else { // rounded
                            borderRadiusValue = borderRadius + 'px';
                        }
                        
                        // Calculate border width as percentage
                        // Note: CSS doesn't support percentage borders directly, so we'll calculate it
                        // based on the element's size using JavaScript
                        var borderWidthValue = borderWidth > 0 ? borderWidth + '%' : '0';
                        var hoverColor = borderWidth > 0 ? hexToRgba(color, 0.3) : 'transparent';
                        
                        // Helper to calculate actual border width in pixels
                        var calculateBorderWidth = function(element, percentage) {
                            if (percentage <= 0) return 0;
                            var width = element.offsetWidth;
                            var height = element.offsetHeight;
                            var smaller = Math.min(width, height);
                            return (smaller * percentage) / 100;
                        };
                        
                        if (overlayOrAnnotation.overlayElement) {
                            var hotspotElement = overlayOrAnnotation.overlayElement.querySelector('.hotspot-element');
                            var hotspotPulse = overlayOrAnnotation.overlayElement.querySelector('.hotspot-pulse');
                            
                            // Calculate actual border width in pixels
                            var actualBorderWidth = calculateBorderWidth(hotspotElement, borderWidth);
                            
                            hotspotElement.style.borderRadius = borderRadiusValue;
                            hotspotElement.style.borderWidth = actualBorderWidth + 'px';
                            hotspotElement.style.borderColor = color;
                            hotspotElement.style.backgroundColor = 'transparent';
                            hotspotPulse.style.borderRadius = borderRadiusValue;
                            hotspotPulse.style.borderColor = color;
                            
                            // Update hover handlers
                            if (hotspotElement._enterFn) { hotspotElement.removeEventListener('mouseenter', hotspotElement._enterFn); hotspotElement._enterFn = null; }
                            if (hotspotElement._leaveFn) { hotspotElement.removeEventListener('mouseleave', hotspotElement._leaveFn); hotspotElement._leaveFn = null; }
                            if (borderWidth > 0) {
                                hotspotElement._enterFn = function() { this.style.backgroundColor = hoverColor; };
                                hotspotElement._leaveFn = function() { this.style.backgroundColor = 'transparent'; };
                                hotspotElement.addEventListener('mouseenter', hotspotElement._enterFn);
                                hotspotElement.addEventListener('mouseleave', hotspotElement._leaveFn);
                            }
                            
                            FrameTrail.module('HypervideoModel').newUnsavedChange('overlays');
                        } else {
                            // Update annotation elements in dom
                            overlayOrAnnotation.contentViewDetailElements.forEach(function(el) {
                                var hotspotElement = el.querySelector('.hotspot-element');
                                var hotspotPulse = el.querySelector('.hotspot-pulse');
                                
                                // Calculate actual border width in pixels
                                var actualBorderWidth = calculateBorderWidth(hotspotElement, borderWidth);
                                
                                hotspotElement.style.borderRadius = borderRadiusValue;
                                hotspotElement.style.borderWidth = actualBorderWidth + 'px';
                                hotspotElement.style.borderColor = color;
                                hotspotElement.style.backgroundColor = 'transparent';
                                hotspotPulse.style.borderRadius = borderRadiusValue;
                                hotspotPulse.style.borderColor = color;
                                
                                if (hotspotElement._enterFn) { hotspotElement.removeEventListener('mouseenter', hotspotElement._enterFn); hotspotElement._enterFn = null; }
                                if (hotspotElement._leaveFn) { hotspotElement.removeEventListener('mouseleave', hotspotElement._leaveFn); hotspotElement._leaveFn = null; }
                                if (borderWidth > 0) {
                                    hotspotElement._enterFn = function() { this.style.backgroundColor = hoverColor; };
                                    hotspotElement._leaveFn = function() { this.style.backgroundColor = 'transparent'; };
                                    hotspotElement.addEventListener('mouseenter', hotspotElement._enterFn);
                                    hotspotElement.addEventListener('mouseleave', hotspotElement._leaveFn);
                                }
                            });
                            FrameTrail.module('HypervideoModel').newUnsavedChange('annotations');
                        }
                    };

                    // Shape selector column
                    shapeColumn.insertAdjacentHTML('beforeend', '<label>'+ this.labels['SettingsHotspotShape'] +'</label>');
                    var shapeSelect = document.createElement('select');
                    shapeSelect.className = 'hotspotPropShape';
                    shapeSelect.insertAdjacentHTML('beforeend', '<option value="circle"' + (currentAttributes.shape === 'circle' ? ' selected' : '') + '>'+ this.labels['SettingsHotspotShapeCircle'] +'</option>');
                    shapeSelect.insertAdjacentHTML('beforeend', '<option value="rectangle"' + (currentAttributes.shape === 'rectangle' ? ' selected' : '') + '>'+ this.labels['SettingsHotspotShapeRectangle'] +'</option>');
                    shapeSelect.insertAdjacentHTML('beforeend', '<option value="rounded"' + (currentAttributes.shape === 'rounded' ? ' selected' : '') + '>'+ this.labels['SettingsHotspotShapeRounded'] +'</option>');
                    
                    var shapeBeforeChange = currentAttributes.shape || 'circle';
                    shapeSelect.addEventListener('focus', function() {
                        shapeBeforeChange = overlayOrAnnotation.data.attributes.shape || 'circle';
                    });
                    
                    shapeSelect.addEventListener('change', function() {
                        var newShape = this.value;
                        var oldShape = shapeBeforeChange;
                        overlayOrAnnotation.data.attributes.shape = newShape;
                        
                        // Show/hide border radius column based on shape
                        if (newShape === 'rounded') {
                            borderRadiusColumn.style.display = '';
                        } else {
                            borderRadiusColumn.style.display = 'none';
                        }
                        
                        // Apply shape changes
                        var borderWidth = overlayOrAnnotation.data.attributes.borderWidth || 5;
                        var color = overlayOrAnnotation.data.attributes.color || '#0096ff';
                        applyShapeChanges(overlayOrAnnotation, newShape, overlayOrAnnotation.data.attributes.borderRadius, borderWidth, color);
                        
                        // Register undo for shape change
                        if (oldShape !== newShape) {
                            var isOverlay = !!overlayOrAnnotation.overlayElement;
                            var category = isOverlay ? 'overlays' : 'annotations';
                            var elementId = overlayOrAnnotation.data.created;
                            
                            (function(id, oldS, newS, cat, labels, applyFn) {
                                var findElement = function() {
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
                                FrameTrail.module('UndoManager').register({
                                    category: cat,
                                    description: (cat === 'overlays' ? labels['SidebarOverlays'] : labels['SidebarMyAnnotations']) + ' Shape',
                                    undo: function() {
                                        var el = findElement();
                                        if (!el) return;
                                        el.data.attributes.shape = oldS;
                                        var bw = el.data.attributes.borderWidth || 5;
                                        var c = el.data.attributes.color || '#0096ff';
                                        var br = el.data.attributes.borderRadius || 10;
                                        applyFn(el, oldS, br, bw, c);
                                        syncHotspotUI(el.data.attributes);
                                        FrameTrail.module('HypervideoModel').newUnsavedChange(cat);
                                    },
                                    redo: function() {
                                        var el = findElement();
                                        if (!el) return;
                                        el.data.attributes.shape = newS;
                                        var bw = el.data.attributes.borderWidth || 5;
                                        var c = el.data.attributes.color || '#0096ff';
                                        var br = el.data.attributes.borderRadius || 10;
                                        applyFn(el, newS, br, bw, c);
                                        syncHotspotUI(el.data.attributes);
                                        FrameTrail.module('HypervideoModel').newUnsavedChange(cat);
                                    }
                                });
                            })(elementId, oldShape, newShape, category, self.labels, applyShapeChanges);
                        }
                        shapeBeforeChange = newShape;
                    });
                    
                    var shapeWrapper = document.createElement('div');
                    shapeWrapper.className = 'custom-select';
                    shapeWrapper.appendChild(shapeSelect);
                    shapeColumn.appendChild(shapeWrapper);

                    // Color picker column
                    colorColumn.insertAdjacentHTML('beforeend', '<label>'+ this.labels['SettingsHotspotColor'] +'</label>');
                    var colorInput = document.createElement('input');
                    colorInput.type = 'color';
                    colorInput.className = 'hotspotPropColor';
                    colorInput.value = currentAttributes.color;

                    // Helper function to update color visually
                    var updateColor = function(newColor, trackChange) {
                        overlayOrAnnotation.data.attributes.color = newColor;

                        if (overlayOrAnnotation.overlayElement) {
                            var hotspotElement = overlayOrAnnotation.overlayElement.querySelector('.hotspot-element');
                            var hotspotPulse = overlayOrAnnotation.overlayElement.querySelector('.hotspot-pulse');
                            hotspotElement.style.borderColor = newColor;
                            hotspotPulse.style.borderColor = newColor;
                            
                            // Update hover color if border width > 0
                            var borderWidth = overlayOrAnnotation.data.attributes.borderWidth || 5;
                            if (borderWidth > 0) {
                                var hoverColor = hexToRgba(newColor, 0.3);
                                if (hotspotElement._enterFn) { hotspotElement.removeEventListener('mouseenter', hotspotElement._enterFn); hotspotElement._enterFn = null; }
                                if (hotspotElement._leaveFn) { hotspotElement.removeEventListener('mouseleave', hotspotElement._leaveFn); hotspotElement._leaveFn = null; }
                                hotspotElement._enterFn = function() { this.style.backgroundColor = hoverColor; };
                                hotspotElement._leaveFn = function() { this.style.backgroundColor = 'transparent'; };
                                hotspotElement.addEventListener('mouseenter', hotspotElement._enterFn);
                                hotspotElement.addEventListener('mouseleave', hotspotElement._leaveFn);
                            }
                            
                            if (trackChange) {
                                FrameTrail.module('HypervideoModel').newUnsavedChange('overlays');
                            }
                        } else {
                            // Update annotation elements in dom
                            overlayOrAnnotation.contentViewDetailElements.forEach(function(el) {
                                var hotspotElement = el.querySelector('.hotspot-element');
                                var hotspotPulse = el.querySelector('.hotspot-pulse');
                                hotspotElement.style.borderColor = newColor;
                                hotspotPulse.style.borderColor = newColor;
                                
                                // Update hover color if border width > 0
                                var borderWidth = overlayOrAnnotation.data.attributes.borderWidth || 5;
                                if (borderWidth > 0) {
                                    var hoverColor = hexToRgba(newColor, 0.3);
                                    if (hotspotElement._enterFn) { hotspotElement.removeEventListener('mouseenter', hotspotElement._enterFn); hotspotElement._enterFn = null; }
                                    if (hotspotElement._leaveFn) { hotspotElement.removeEventListener('mouseleave', hotspotElement._leaveFn); hotspotElement._leaveFn = null; }
                                    hotspotElement._enterFn = function() { this.style.backgroundColor = hoverColor; };
                                    hotspotElement._leaveFn = function() { this.style.backgroundColor = 'transparent'; };
                                    hotspotElement.addEventListener('mouseenter', hotspotElement._enterFn);
                                    hotspotElement.addEventListener('mouseleave', hotspotElement._leaveFn);
                                }
                            });
                            if (trackChange) {
                                FrameTrail.module('HypervideoModel').newUnsavedChange('annotations');
                            }
                        }
                    };

                    // Update color in real-time as user interacts with picker
                    var colorBeforeChange = currentAttributes.color || '#0096ff';
                    colorInput.addEventListener('focus', function() {
                        colorBeforeChange = overlayOrAnnotation.data.attributes.color || '#0096ff';
                    });
                    
                    colorInput.addEventListener('input', function() {
                        var newColor = this.value;
                        updateColor(newColor, false);
                    });

                    // Track change when picker is closed
                    colorInput.addEventListener('change', function() {
                        var newColor = this.value;
                        updateColor(newColor, true);
                        
                        // Register undo for color change
                        if (colorBeforeChange !== newColor) {
                            var isOverlay = !!overlayOrAnnotation.overlayElement;
                            var category = isOverlay ? 'overlays' : 'annotations';
                            var elementId = overlayOrAnnotation.data.created;
                            
                            (function(id, oldC, newC, cat, labels, applyFn) {
                                var findElement = function() {
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
                                FrameTrail.module('UndoManager').register({
                                    category: cat,
                                    description: (cat === 'overlays' ? labels['SidebarOverlays'] : labels['SidebarMyAnnotations']) + ' Color',
                                    undo: function() {
                                        var el = findElement();
                                        if (!el) return;
                                        el.data.attributes.color = oldC;
                                        var shape = el.data.attributes.shape || 'circle';
                                        var bw = el.data.attributes.borderWidth || 5;
                                        var br = el.data.attributes.borderRadius || 10;
                                        applyFn(el, shape, br, bw, oldC);
                                        syncHotspotUI(el.data.attributes);
                                        FrameTrail.module('HypervideoModel').newUnsavedChange(cat);
                                    },
                                    redo: function() {
                                        var el = findElement();
                                        if (!el) return;
                                        el.data.attributes.color = newC;
                                        var shape = el.data.attributes.shape || 'circle';
                                        var bw = el.data.attributes.borderWidth || 5;
                                        var br = el.data.attributes.borderRadius || 10;
                                        applyFn(el, shape, br, bw, newC);
                                        syncHotspotUI(el.data.attributes);
                                        FrameTrail.module('HypervideoModel').newUnsavedChange(cat);
                                    }
                                });
                            })(elementId, colorBeforeChange, newColor, category, self.labels, applyShapeChanges);
                        }
                        colorBeforeChange = newColor;
                    });

                    colorColumn.appendChild(colorInput);

                    // Border Width and Border Radius columns
                    var borderWidthColumn = document.createElement('div');
                    borderWidthColumn.className = 'column-3';
                    var borderRadiusColumn = document.createElement('div');
                    borderRadiusColumn.className = 'column-3';

                    // Border width control column
                    borderWidthColumn.insertAdjacentHTML('beforeend', '<label>'+ this.labels['SettingsHotspotBorderWidth'] +'</label>');
                    var borderWidthInput = document.createElement('input');
                    borderWidthInput.type = 'number';
                    borderWidthInput.className = 'hotspotPropBorderWidth';
                    borderWidthInput.min = '0'; borderWidthInput.max = '50'; borderWidthInput.step = '0.5';
                    borderWidthInput.value = currentAttributes.borderWidth;
                    var borderWidthLabel = document.createElement('span');
                    borderWidthLabel.textContent = '%';
                    var borderWidthWrapper = document.createElement('div');
                    borderWidthWrapper.className = 'innerSizeWrapper';
                    borderWidthWrapper.append(borderWidthInput, borderWidthLabel);

                    var borderWidthBeforeChange = currentAttributes.borderWidth;
                    borderWidthInput.addEventListener('focus', function() {
                        borderWidthBeforeChange = overlayOrAnnotation.data.attributes.borderWidth;
                    });
                    
                    borderWidthInput.addEventListener('change', function() {
                        var newWidth = parseFloat(this.value);
                        if (isNaN(newWidth) || newWidth < 0) newWidth = 0;
                        if (newWidth > 50) newWidth = 50;
                        this.value = newWidth;
                        var oldWidth = borderWidthBeforeChange;
                        overlayOrAnnotation.data.attributes.borderWidth = newWidth;
                        
                        var shape = overlayOrAnnotation.data.attributes.shape || 'circle';
                        var borderRadius = overlayOrAnnotation.data.attributes.borderRadius || 10;
                        var color = overlayOrAnnotation.data.attributes.color || '#0096ff';
                        
                        // Apply changes
                        applyShapeChanges(overlayOrAnnotation, shape, borderRadius, newWidth, color);
                        FrameTrail.module('HypervideoModel').newUnsavedChange(overlayOrAnnotation.overlayElement ? 'overlays' : 'annotations');
                        
                        // Register undo for border width change
                        if (oldWidth !== newWidth) {
                            var isOverlay = !!overlayOrAnnotation.overlayElement;
                            var category = isOverlay ? 'overlays' : 'annotations';
                            var elementId = overlayOrAnnotation.data.created;
                            
                            (function(id, oldW, newW, cat, labels, applyFn) {
                                var findElement = function() {
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
                                FrameTrail.module('UndoManager').register({
                                    category: cat,
                                    description: (cat === 'overlays' ? labels['SidebarOverlays'] : labels['SidebarMyAnnotations']) + ' Border',
                                    undo: function() {
                                        var el = findElement();
                                        if (!el) return;
                                        el.data.attributes.borderWidth = oldW;
                                        var shape = el.data.attributes.shape || 'circle';
                                        var br = el.data.attributes.borderRadius || 10;
                                        var c = el.data.attributes.color || '#0096ff';
                                        applyFn(el, shape, br, oldW, c);
                                        syncHotspotUI(el.data.attributes);
                                        FrameTrail.module('HypervideoModel').newUnsavedChange(cat);
                                    },
                                    redo: function() {
                                        var el = findElement();
                                        if (!el) return;
                                        el.data.attributes.borderWidth = newW;
                                        var shape = el.data.attributes.shape || 'circle';
                                        var br = el.data.attributes.borderRadius || 10;
                                        var c = el.data.attributes.color || '#0096ff';
                                        applyFn(el, shape, br, newW, c);
                                        syncHotspotUI(el.data.attributes);
                                        FrameTrail.module('HypervideoModel').newUnsavedChange(cat);
                                    }
                                });
                            })(elementId, oldWidth, newWidth, category, self.labels, applyShapeChanges);
                        }
                        borderWidthBeforeChange = newWidth;
                    });

                    borderWidthColumn.appendChild(borderWidthWrapper);

                    // Border radius input column (only visible for rounded rectangles)
                    borderRadiusColumn.insertAdjacentHTML('beforeend', '<label>'+ this.labels['SettingsHotspotBorderRadius'] +'</label>');
                    var borderRadiusInput = document.createElement('input');
                    borderRadiusInput.type = 'number';
                    borderRadiusInput.className = 'hotspotPropBorderRadius';
                    borderRadiusInput.min = '0'; borderRadiusInput.max = '100'; borderRadiusInput.step = '1';
                    borderRadiusInput.value = currentAttributes.borderRadius;
                    var borderRadiusLabel = document.createElement('span');
                    borderRadiusLabel.textContent = 'px';
                    var borderRadiusWrapper = document.createElement('div');
                    borderRadiusWrapper.className = 'innerSizeWrapper';
                    borderRadiusWrapper.append(borderRadiusInput, borderRadiusLabel);
                    
                    // Hide border radius if shape is not rounded
                    if (currentAttributes.shape !== 'rounded') {
                        borderRadiusColumn.style.display = 'none';
                    }
                    
                    var borderRadiusBeforeChange = currentAttributes.borderRadius || 10;
                    borderRadiusInput.addEventListener('focus', function() {
                        borderRadiusBeforeChange = overlayOrAnnotation.data.attributes.borderRadius || 10;
                    });
                    
                    borderRadiusInput.addEventListener('change', function() {
                        var newRadius = parseFloat(this.value);
                        if (isNaN(newRadius) || newRadius < 0) newRadius = 0;
                        if (newRadius > 100) newRadius = 100;
                        this.value = newRadius;
                        var oldRadius = borderRadiusBeforeChange;
                        overlayOrAnnotation.data.attributes.borderRadius = newRadius;
                        
                        // Apply shape changes
                        var borderWidth = overlayOrAnnotation.data.attributes.borderWidth || 5;
                        var color = overlayOrAnnotation.data.attributes.color || '#0096ff';
                        applyShapeChanges(overlayOrAnnotation, overlayOrAnnotation.data.attributes.shape, newRadius, borderWidth, color);
                        
                        // Register undo for border radius change
                        if (oldRadius !== newRadius) {
                            var isOverlay = !!overlayOrAnnotation.overlayElement;
                            var category = isOverlay ? 'overlays' : 'annotations';
                            var elementId = overlayOrAnnotation.data.created;
                            
                            (function(id, oldR, newR, cat, labels, applyFn) {
                                var findElement = function() {
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
                                FrameTrail.module('UndoManager').register({
                                    category: cat,
                                    description: (cat === 'overlays' ? labels['SidebarOverlays'] : labels['SidebarMyAnnotations']) + ' Border Radius',
                                    undo: function() {
                                        var el = findElement();
                                        if (!el) return;
                                        el.data.attributes.borderRadius = oldR;
                                        var shape = el.data.attributes.shape || 'circle';
                                        var bw = el.data.attributes.borderWidth || 5;
                                        var c = el.data.attributes.color || '#0096ff';
                                        applyFn(el, shape, oldR, bw, c);
                                        syncHotspotUI(el.data.attributes);
                                        FrameTrail.module('HypervideoModel').newUnsavedChange(cat);
                                    },
                                    redo: function() {
                                        var el = findElement();
                                        if (!el) return;
                                        el.data.attributes.borderRadius = newR;
                                        var shape = el.data.attributes.shape || 'circle';
                                        var bw = el.data.attributes.borderWidth || 5;
                                        var c = el.data.attributes.color || '#0096ff';
                                        applyFn(el, shape, newR, bw, c);
                                        syncHotspotUI(el.data.attributes);
                                        FrameTrail.module('HypervideoModel').newUnsavedChange(cat);
                                    }
                                });
                            })(elementId, oldRadius, newRadius, category, self.labels, applyShapeChanges);
                        }
                        borderRadiusBeforeChange = newRadius;
                    });

                    borderRadiusColumn.appendChild(borderRadiusWrapper);

                    // Append all columns to layoutRow, then layoutRow to container
                    layoutRow.append(shapeColumn, colorColumn, borderWidthColumn, borderRadiusColumn);
                    hotspotEditorContainer.appendChild(layoutRow);

                    // Link URL input row with picker and delete buttons
                    hotspotEditorContainer.insertAdjacentHTML('beforeend', '<hr><label>'+ this.labels['SettingsHotspotLink'] +'</label>');
                    
                    // Helper function to update link URL and trigger change
                    // Always uses <a> tag, just updates href attribute (same as renderContent)
                    var updateLinkUrl = function(newUrl) {
                        overlayOrAnnotation.data.attributes.linkUrl = newUrl;
                        linkInput.value = newUrl;
                        
                        // Use '#' if empty, same as renderContent
                        var href = newUrl || '#';

                        if (overlayOrAnnotation.overlayElement) {
                            var hotspotElement = overlayOrAnnotation.overlayElement.querySelector('.hotspot-element');
                            hotspotElement.setAttribute('href', href);
                            if (newUrl && (newUrl.startsWith('http://') || newUrl.startsWith('https://'))) {
                                hotspotElement.setAttribute('target', '_blank');
                            } else {
                                hotspotElement.removeAttribute('target');
                            }
                            // Prevent navigation when link is empty (same as renderContent)
                            if (hotspotElement._clickFn) { hotspotElement.removeEventListener('click', hotspotElement._clickFn); hotspotElement._clickFn = null; }
                            if (!newUrl) {
                                hotspotElement._clickFn = function(e) { e.preventDefault(); e.stopPropagation(); };
                                hotspotElement.addEventListener('click', hotspotElement._clickFn);
                            }
                            FrameTrail.module('HypervideoModel').newUnsavedChange('overlays');
                        } else {
                            // Update annotation elements in dom
                            overlayOrAnnotation.contentViewDetailElements.forEach(function(el) {
                                var hotspotElement = el.querySelector('.hotspot-element');
                                hotspotElement.setAttribute('href', href);
                                if (newUrl && (newUrl.startsWith('http://') || newUrl.startsWith('https://'))) {
                                    hotspotElement.setAttribute('target', '_blank');
                                } else {
                                    hotspotElement.removeAttribute('target');
                                }
                                // Prevent navigation when link is empty (same as renderContent)
                                if (hotspotElement._clickFn) { hotspotElement.removeEventListener('click', hotspotElement._clickFn); hotspotElement._clickFn = null; }
                                if (!newUrl) {
                                    hotspotElement._clickFn = function(e) { e.preventDefault(); e.stopPropagation(); };
                                    hotspotElement.addEventListener('click', hotspotElement._clickFn);
                                }
                            });
                            FrameTrail.module('HypervideoModel').newUnsavedChange('annotations');
                        }
                    };
                    
                    // Create row container for link input with buttons
                    var linkInputRow = document.createElement('div');
                    linkInputRow.className = 'linkInputRow';
                    
                    // Text input (stretches to fill remaining width)
                    var linkInput = document.createElement('input');
                    linkInput.type = 'text';
                    linkInput.className = 'linkInput';
                    linkInput.placeholder = 'https://example.com';
                    linkInput.value = currentAttributes.linkUrl;
                    
                    var linkBeforeEdit = '';
                    linkInput.addEventListener('focus', function() {
                        linkBeforeEdit = overlayOrAnnotation.data.attributes.linkUrl || '';
                    });
                    
                    linkInput.addEventListener('blur', function() {
                        var newLink = overlayOrAnnotation.data.attributes.linkUrl || '';
                        if (linkBeforeEdit !== newLink) {
                            var isOverlay = !!overlayOrAnnotation.overlayElement;
                            var category = isOverlay ? 'overlays' : 'annotations';
                            var elementId = overlayOrAnnotation.data.created;
                            
                            (function(id, oldLink, newLnk, cat, labels, updateFn) {
                                var findElement = function() {
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
                                FrameTrail.module('UndoManager').register({
                                    category: cat,
                                    description: (cat === 'overlays' ? labels['SidebarOverlays'] : labels['SidebarMyAnnotations']) + ' Link',
                                    undo: function() {
                                        var el = findElement();
                                        if (!el) return;
                                        updateFn(oldLink);
                                        FrameTrail.module('HypervideoModel').newUnsavedChange(cat);
                                    },
                                    redo: function() {
                                        var el = findElement();
                                        if (!el) return;
                                        updateFn(newLnk);
                                        FrameTrail.module('HypervideoModel').newUnsavedChange(cat);
                                    }
                                });
                            })(elementId, linkBeforeEdit, newLink, category, self.labels, updateLinkUrl);
                        }
                    });
                    
                    linkInput.addEventListener('keyup', function(evt) {
                        if (!evt.metaKey && evt.key != 'Meta') {
                            var newUrl = this.value;
                            updateLinkUrl(newUrl);
                        }
                    });
                    
                    // Delete button (icon only)
                    var _dbw = document.createElement('div');
                    _dbw.innerHTML = '<button type="button" class="button btn btn-sm linkDeleteButton" title="'+ this.labels['GenericDelete'] +'"><span class="icon-cancel"></span></button>';
                    var deleteButton = _dbw.firstElementChild;
                    deleteButton.addEventListener('click', function(evt) {
                        evt.preventDefault();
                        evt.stopPropagation();
                        updateLinkUrl('');
                    });
                    
                    // Picker button (variable size depending on language)
                    var _pbw = document.createElement('div');
                    _pbw.innerHTML = '<button type="button" class="button btn btn-sm hypervideoPickerButton" title="'+ this.labels['SettingsHotspotPickHypervideo'] +'"><span class="icon-hypervideo" style="margin-right: 8px;"></span>'+ this.labels['SettingsHotspotPickHypervideo'] +'</button>';
                    var pickerButton = _pbw.firstElementChild;
                    
                    pickerButton.addEventListener('click', function(evt) {
                        evt.preventDefault();
                        evt.stopPropagation();
                        
                        // Initialize HypervideoPicker module if not already loaded
                        if (!FrameTrail.module('HypervideoPicker')) {
                            FrameTrail.initModule('HypervideoPicker');
                        }
                        
                        // Open picker dialog
                        FrameTrail.module('HypervideoPicker').openPicker(function(hypervideoID) {
                            // Insert hypervideo link into input field
                            var hypervideoLink = '#hypervideo=' + hypervideoID;
                            updateLinkUrl(hypervideoLink);
                        });
                    });
                    
                    // Append elements in order: input, delete button, picker button (from left to right)
                    linkInputRow.appendChild(linkInput);
                    linkInputRow.appendChild(deleteButton);
                    linkInputRow.appendChild(pickerButton);
                    
                    hotspotEditorContainer.appendChild(linkInputRow);

                    return hotspotEditorContainer;

                }



            }



        }
    }


);
