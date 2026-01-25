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


                /**
                 * I render the content of myself, which is a &lt;div&gt; containing a pulsating circle hotspot wrapped in a &lt;div class="resourceDetail" ...&gt;
                 *
                 * @method renderContent
                 * @return HTMLElement
                 */
                renderContent: function() {

                    var self = this;

                    var licenseType = (this.resourceData.licenseType && this.resourceData.licenseType == 'CC-BY-SA-3.0') ? '<a href="https://creativecommons.org/licenses/by-sa/3.0/" title="License: '+ this.resourceData.licenseType +'" target="_blank"><span class="cc-by-sa-bg-image"></span></a>' : this.resourceData.licenseType;
                    var licenseString = (licenseType) ? licenseType +' - '+ this.resourceData.licenseAttribution : '';

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

                    var resourceDetail = $('<div class="resourceDetail" data-type="hotspot" style="width: 100%; height: 100%; position: relative; display: flex; align-items: center; justify-content: center;">'
                                        +  '    <div class="hotspot-container">'
                                        +  '        <div class="hotspot-square-wrapper">'
                                        +  '            <a class="hotspot-element"' + elementAttrs + ' style="border-radius: ' + borderRadiusValue + '; border-color: ' + color + '; text-decoration: none; display: block;"></a>'
                                        +  '            <div class="hotspot-pulse" style="border-color: ' + color + '; border-radius: ' + borderRadiusValue + ';"></div>'
                                        +  '        </div>'
                                        +  '    </div>'
                                        +  '</div>');

                    var hotspotElement = resourceDetail.find('.hotspot-element');
                    
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
                            var width = element.width();
                            var height = element.height();
                            var smaller = Math.min(width, height);
                            var actualWidth = (smaller * percentage) / 100;
                            element.css('border-width', actualWidth + 'px');
                        }, 0);
                        return 0; // Initial value
                    };
                    
                    // Set initial border width
                    calculateBorderWidth(hotspotElement, borderWidth);
                    hotspotElement.css({
                        'background-color': 'transparent',
                        'border-style': 'solid',
                        'border-color': color
                    });
                    
                    // Add hover effect: make background semi-transparent
                    if (borderWidth > 0) {
                        var hoverColor = hexToRgba(color, 0.3);
                        hotspotElement.on('mouseenter', function() {
                            $(this).css('background-color', hoverColor);
                        });
                        
                        hotspotElement.on('mouseleave', function() {
                            $(this).css('background-color', 'transparent');
                        });
                    }
                    
                    // Prevent navigation when link is empty (href="#")
                    if (!linkUrl) {
                        hotspotElement.on('click', function(e) {
                            e.preventDefault();
                            e.stopPropagation();
                        });
                    }

                    resourceDetail.append('<div class="resourceOptions"><div class="licenseInformation">'+ licenseString +'</div><div class="resourceButtons"></div>');

                    if (this.resourceData.start) {
                        var jumpToTimeButton = $('<button class="button btn btn-sm" data-start="'+ this.resourceData.start +'" data-end="'+ this.resourceData.end +'"><span class="icon-play-1"></span></button>');
                        jumpToTimeButton.click(function(){
                            var time = $(this).attr('data-start');
                            FrameTrail.module('HypervideoController').currentTime = time;
                        });
                        resourceDetail.find('.resourceButtons').append(jumpToTimeButton);
                    }

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

                    var thumbElement = $('<div class="resourceThumb '+ tagList +'" data-license-type="'+ this.resourceData.licenseType +'" data-type="'+ this.resourceData.type +'">'
                        + '                  <div class="resourceOverlay">'
                        + '                      <div class="resourceIcon"><span class="icon-link"></span></div>'
                        + '                  </div>'
                        + '                  <div class="resourceTitle">Hotspot / Link</div>'
                        + '              </div>');

                    var previewButton = $('<div class="resourcePreviewButton"><span class="icon-eye"></span></div>').click(function(evt) {
                        // call the openPreview method (defined in abstract type: Resource)
                        self.openPreview( $(this).parent() );
                        evt.stopPropagation();
                        evt.preventDefault();
                    });
                    thumbElement.append(previewButton);

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

                    basicControls.controlsContainer.find('#OverlayOptions').append(this.renderHotspotEditor(overlay));


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

                    timeControls.controlsContainer.find('#AnnotationOptions').append(this.renderHotspotEditor(annotation));

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

                    var hotspotEditorContainer = $('<div class="hotspotEditorContainer"></div>');

                    // Helper function to convert hex color to rgba
                    var hexToRgba = function(hex, alpha) {
                        var r = parseInt(hex.slice(1, 3), 16);
                        var g = parseInt(hex.slice(3, 5), 16);
                        var b = parseInt(hex.slice(5, 7), 16);
                        return 'rgba(' + r + ', ' + g + ', ' + b + ', ' + alpha + ')';
                    };

                    // Create layout row container for all columns
                    var layoutRow = $('<div class="layoutRow"></div>');
                    
                    // Shape and Color columns
                    var shapeColumn = $('<div class="column-3"></div>');
                    var colorColumn = $('<div class="column-3"></div>');

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
                            var width = element.width();
                            var height = element.height();
                            var smaller = Math.min(width, height);
                            return (smaller * percentage) / 100;
                        };
                        
                        if (overlayOrAnnotation.overlayElement) {
                            var hotspotElement = overlayOrAnnotation.overlayElement.find('.hotspot-element');
                            var hotspotPulse = overlayOrAnnotation.overlayElement.find('.hotspot-pulse');
                            
                            // Calculate actual border width in pixels
                            var actualBorderWidth = calculateBorderWidth(hotspotElement, borderWidth);
                            
                            hotspotElement.css({
                                'border-radius': borderRadiusValue,
                                'border-width': actualBorderWidth + 'px',
                                'border-color': color,
                                'background-color': 'transparent'
                            });
                            hotspotPulse.css('border-radius', borderRadiusValue);
                            
                            // Update hover handlers
                            hotspotElement.off('mouseenter mouseleave');
                            if (borderWidth > 0) {
                                hotspotElement.on('mouseenter', function() {
                                    $(this).css('background-color', hoverColor);
                                });
                                hotspotElement.on('mouseleave', function() {
                                    $(this).css('background-color', 'transparent');
                                });
                            }
                            
                            FrameTrail.module('HypervideoModel').newUnsavedChange('overlays');
                        } else {
                            // Update annotation elements in dom
                            $(overlayOrAnnotation.contentViewDetailElements).each(function() {
                                var hotspotElement = $(this).find('.hotspot-element');
                                var hotspotPulse = $(this).find('.hotspot-pulse');
                                
                                // Calculate actual border width in pixels
                                var actualBorderWidth = calculateBorderWidth(hotspotElement, borderWidth);
                                
                                hotspotElement.css({
                                    'border-radius': borderRadiusValue,
                                    'border-width': actualBorderWidth + 'px',
                                    'border-color': color,
                                    'background-color': 'transparent'
                                });
                                hotspotPulse.css('border-radius', borderRadiusValue);
                                
                                hotspotElement.off('mouseenter mouseleave');
                                if (borderWidth > 0) {
                                    hotspotElement.on('mouseenter', function() {
                                        $(this).css('background-color', hoverColor);
                                    });
                                    hotspotElement.on('mouseleave', function() {
                                        $(this).css('background-color', 'transparent');
                                    });
                                }
                            });
                            FrameTrail.module('HypervideoModel').newUnsavedChange('annotations');
                        }
                    };

                    // Shape selector column
                    shapeColumn.append('<label>'+ this.labels['SettingsHotspotShape'] +'</label>');
                    var shapeSelect = $('<select></select>');
                    shapeSelect.append('<option value="circle"' + (currentAttributes.shape === 'circle' ? ' selected' : '') + '>'+ this.labels['SettingsHotspotShapeCircle'] +'</option>');
                    shapeSelect.append('<option value="rectangle"' + (currentAttributes.shape === 'rectangle' ? ' selected' : '') + '>'+ this.labels['SettingsHotspotShapeRectangle'] +'</option>');
                    shapeSelect.append('<option value="rounded"' + (currentAttributes.shape === 'rounded' ? ' selected' : '') + '>'+ this.labels['SettingsHotspotShapeRounded'] +'</option>');
                    
                    var shapeBeforeChange = currentAttributes.shape || 'circle';
                    shapeSelect.on('focus', function() {
                        shapeBeforeChange = overlayOrAnnotation.data.attributes.shape || 'circle';
                    });
                    
                    shapeSelect.on('change', function() {
                        var newShape = $(this).val();
                        var oldShape = shapeBeforeChange;
                        overlayOrAnnotation.data.attributes.shape = newShape;
                        
                        // Show/hide border radius column based on shape
                        if (newShape === 'rounded') {
                            borderRadiusColumn.show();
                        } else {
                            borderRadiusColumn.hide();
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
                            
                            (function(id, oldS, newS, cat, labels) {
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
                                        FrameTrail.module('HypervideoModel').newUnsavedChange(cat);
                                    },
                                    redo: function() {
                                        var el = findElement();
                                        if (!el) return;
                                        el.data.attributes.shape = newS;
                                        FrameTrail.module('HypervideoModel').newUnsavedChange(cat);
                                    }
                                });
                            })(elementId, oldShape, newShape, category, self.labels);
                        }
                        shapeBeforeChange = newShape;
                    });
                    
                    shapeColumn.append(shapeSelect);

                    // Color picker column
                    colorColumn.append('<label>'+ this.labels['SettingsHotspotColor'] +'</label>');
                    var colorInput = $('<input type="color" value="' + currentAttributes.color + '"/>');

                    // Helper function to update color visually
                    var updateColor = function(newColor, trackChange) {
                        overlayOrAnnotation.data.attributes.color = newColor;

                        if (overlayOrAnnotation.overlayElement) {
                            var hotspotElement = overlayOrAnnotation.overlayElement.find('.hotspot-element');
                            var hotspotPulse = overlayOrAnnotation.overlayElement.find('.hotspot-pulse');
                            hotspotElement.css('border-color', newColor);
                            hotspotPulse.css('border-color', newColor);
                            
                            // Update hover color if border width > 0
                            var borderWidth = overlayOrAnnotation.data.attributes.borderWidth || 5;
                            if (borderWidth > 0) {
                                var hoverColor = hexToRgba(newColor, 0.3);
                                hotspotElement.off('mouseenter mouseleave');
                                hotspotElement.on('mouseenter', function() {
                                    $(this).css('background-color', hoverColor);
                                });
                                hotspotElement.on('mouseleave', function() {
                                    $(this).css('background-color', 'transparent');
                                });
                            }
                            
                            if (trackChange) {
                                FrameTrail.module('HypervideoModel').newUnsavedChange('overlays');
                            }
                        } else {
                            // Update annotation elements in dom
                            $(overlayOrAnnotation.contentViewDetailElements).each(function() {
                                var hotspotElement = $(this).find('.hotspot-element');
                                var hotspotPulse = $(this).find('.hotspot-pulse');
                                hotspotElement.css('border-color', newColor);
                                hotspotPulse.css('border-color', newColor);
                                
                                // Update hover color if border width > 0
                                var borderWidth = overlayOrAnnotation.data.attributes.borderWidth || 5;
                                if (borderWidth > 0) {
                                    var hoverColor = hexToRgba(newColor, 0.3);
                                    hotspotElement.off('mouseenter mouseleave');
                                    hotspotElement.on('mouseenter', function() {
                                        $(this).css('background-color', hoverColor);
                                    });
                                    hotspotElement.on('mouseleave', function() {
                                        $(this).css('background-color', 'transparent');
                                    });
                                }
                            });
                            if (trackChange) {
                                FrameTrail.module('HypervideoModel').newUnsavedChange('annotations');
                            }
                        }
                    };

                    // Update color in real-time as user interacts with picker
                    var colorBeforeChange = currentAttributes.color || '#0096ff';
                    colorInput.on('focus', function() {
                        colorBeforeChange = overlayOrAnnotation.data.attributes.color || '#0096ff';
                    });
                    
                    colorInput.on('input', function() {
                        var newColor = $(this).val();
                        updateColor(newColor, false);
                    });

                    // Track change when picker is closed
                    colorInput.on('change', function() {
                        var newColor = $(this).val();
                        updateColor(newColor, true);
                        
                        // Register undo for color change
                        if (colorBeforeChange !== newColor) {
                            var isOverlay = !!overlayOrAnnotation.overlayElement;
                            var category = isOverlay ? 'overlays' : 'annotations';
                            var elementId = overlayOrAnnotation.data.created;
                            
                            (function(id, oldC, newC, cat, labels) {
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
                                        FrameTrail.module('HypervideoModel').newUnsavedChange(cat);
                                    },
                                    redo: function() {
                                        var el = findElement();
                                        if (!el) return;
                                        el.data.attributes.color = newC;
                                        FrameTrail.module('HypervideoModel').newUnsavedChange(cat);
                                    }
                                });
                            })(elementId, colorBeforeChange, newColor, category, self.labels);
                        }
                        colorBeforeChange = newColor;
                    });

                    colorColumn.append(colorInput);

                    // Border Width and Border Radius columns
                    var borderWidthColumn = $('<div class="column-3"></div>');
                    var borderRadiusColumn = $('<div class="column-3"></div>');

                    // Border width control column
                    borderWidthColumn.append('<label>'+ this.labels['SettingsHotspotBorderWidth'] +'</label>');
                    var borderWidthInput = $('<input type="number" min="0" max="50" step="0.5" value="' + currentAttributes.borderWidth + '"/>');
                    var borderWidthLabel = $('<span>%</span>');
                    var borderWidthWrapper = $('<div class="innerSizeWrapper"></div>');
                    borderWidthWrapper.append(borderWidthInput, borderWidthLabel);

                    var borderWidthBeforeChange = currentAttributes.borderWidth;
                    borderWidthInput.on('focus', function() {
                        borderWidthBeforeChange = overlayOrAnnotation.data.attributes.borderWidth;
                    });
                    
                    borderWidthInput.on('change', function() {
                        var newWidth = parseFloat($(this).val());
                        if (isNaN(newWidth) || newWidth < 0) newWidth = 0;
                        if (newWidth > 50) newWidth = 50;
                        $(this).val(newWidth);
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
                            
                            (function(id, oldW, newW, cat, labels) {
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
                                        FrameTrail.module('HypervideoModel').newUnsavedChange(cat);
                                    },
                                    redo: function() {
                                        var el = findElement();
                                        if (!el) return;
                                        el.data.attributes.borderWidth = newW;
                                        FrameTrail.module('HypervideoModel').newUnsavedChange(cat);
                                    }
                                });
                            })(elementId, oldWidth, newWidth, category, self.labels);
                        }
                        borderWidthBeforeChange = newWidth;
                    });

                    borderWidthColumn.append(borderWidthWrapper);

                    // Border radius input column (only visible for rounded rectangles)
                    borderRadiusColumn.append('<label>'+ this.labels['SettingsHotspotBorderRadius'] +'</label>');
                    var borderRadiusInput = $('<input type="number" min="0" max="100" step="1" value="' + currentAttributes.borderRadius + '"/>');
                    var borderRadiusLabel = $('<span>px</span>');
                    var borderRadiusWrapper = $('<div class="innerSizeWrapper"></div>');
                    borderRadiusWrapper.append(borderRadiusInput, borderRadiusLabel);
                    
                    // Hide border radius if shape is not rounded
                    if (currentAttributes.shape !== 'rounded') {
                        borderRadiusColumn.hide();
                    }
                    
                    var borderRadiusBeforeChange = currentAttributes.borderRadius || 10;
                    borderRadiusInput.on('focus', function() {
                        borderRadiusBeforeChange = overlayOrAnnotation.data.attributes.borderRadius || 10;
                    });
                    
                    borderRadiusInput.on('change', function() {
                        var newRadius = parseFloat($(this).val());
                        if (isNaN(newRadius) || newRadius < 0) newRadius = 0;
                        if (newRadius > 100) newRadius = 100;
                        $(this).val(newRadius);
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
                            
                            (function(id, oldR, newR, cat, labels) {
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
                                        FrameTrail.module('HypervideoModel').newUnsavedChange(cat);
                                    },
                                    redo: function() {
                                        var el = findElement();
                                        if (!el) return;
                                        el.data.attributes.borderRadius = newR;
                                        FrameTrail.module('HypervideoModel').newUnsavedChange(cat);
                                    }
                                });
                            })(elementId, oldRadius, newRadius, category, self.labels);
                        }
                        borderRadiusBeforeChange = newRadius;
                    });

                    borderRadiusColumn.append(borderRadiusWrapper);

                    // Append all columns to layoutRow, then layoutRow to container
                    layoutRow.append(shapeColumn, colorColumn, borderWidthColumn, borderRadiusColumn);
                    hotspotEditorContainer.append(layoutRow);

                    // Link URL input row with picker and delete buttons
                    var linkLabel = $('<hr><label>'+ this.labels['SettingsHotspotLink'] +'</label>');
                    hotspotEditorContainer.append(linkLabel);
                    
                    // Helper function to update link URL and trigger change
                    // Always uses <a> tag, just updates href attribute (same as renderContent)
                    var updateLinkUrl = function(newUrl) {
                        overlayOrAnnotation.data.attributes.linkUrl = newUrl;
                        linkInput.val(newUrl);
                        
                        // Use '#' if empty, same as renderContent
                        var href = newUrl || '#';

                        if (overlayOrAnnotation.overlayElement) {
                            var hotspotElement = overlayOrAnnotation.overlayElement.find('.hotspot-element');
                            hotspotElement.attr('href', href);
                            if (newUrl && (newUrl.startsWith('http://') || newUrl.startsWith('https://'))) {
                                hotspotElement.attr('target', '_blank');
                            } else {
                                hotspotElement.removeAttr('target');
                            }
                            // Prevent navigation when link is empty (same as renderContent)
                            hotspotElement.off('click');
                            if (!newUrl) {
                                hotspotElement.on('click', function(e) {
                                    e.preventDefault();
                                    e.stopPropagation();
                                });
                            }
                            FrameTrail.module('HypervideoModel').newUnsavedChange('overlays');
                        } else {
                            // Update annotation elements in dom
                            $(overlayOrAnnotation.contentViewDetailElements).each(function() {
                                var hotspotElement = $(this).find('.hotspot-element');
                                hotspotElement.attr('href', href);
                                if (newUrl && (newUrl.startsWith('http://') || newUrl.startsWith('https://'))) {
                                    hotspotElement.attr('target', '_blank');
                                } else {
                                    hotspotElement.removeAttr('target');
                                }
                                // Prevent navigation when link is empty (same as renderContent)
                                hotspotElement.off('click');
                                if (!newUrl) {
                                    hotspotElement.on('click', function(e) {
                                        e.preventDefault();
                                        e.stopPropagation();
                                    });
                                }
                            });
                            FrameTrail.module('HypervideoModel').newUnsavedChange('annotations');
                        }
                    };
                    
                    // Create row container for link input with buttons
                    var linkInputRow = $('<div class="linkInputRow"></div>');
                    
                    // Text input (stretches to fill remaining width)
                    var linkInput = $('<input type="text" class="linkInput" placeholder="https://example.com" value="' + currentAttributes.linkUrl + '"/>');
                    
                    var linkBeforeEdit = '';
                    linkInput.on('focus', function() {
                        linkBeforeEdit = overlayOrAnnotation.data.attributes.linkUrl || '';
                    });
                    
                    linkInput.on('blur', function() {
                        var newLink = overlayOrAnnotation.data.attributes.linkUrl || '';
                        if (linkBeforeEdit !== newLink) {
                            var isOverlay = !!overlayOrAnnotation.overlayElement;
                            var category = isOverlay ? 'overlays' : 'annotations';
                            var elementId = overlayOrAnnotation.data.created;
                            
                            (function(id, oldLink, newLnk, cat, labels) {
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
                                        el.data.attributes.linkUrl = oldLink;
                                        FrameTrail.module('HypervideoModel').newUnsavedChange(cat);
                                    },
                                    redo: function() {
                                        var el = findElement();
                                        if (!el) return;
                                        el.data.attributes.linkUrl = newLnk;
                                        FrameTrail.module('HypervideoModel').newUnsavedChange(cat);
                                    }
                                });
                            })(elementId, linkBeforeEdit, newLink, category, self.labels);
                        }
                    });
                    
                    linkInput.on('keyup', function(evt) {
                        if (!evt.originalEvent.metaKey && evt.originalEvent.key != 'Meta') {
                            var newUrl = $(this).val();
                            updateLinkUrl(newUrl);
                        }
                    });
                    
                    // Delete button (icon only)
                    var deleteButton = $('<button type="button" class="button btn btn-sm linkDeleteButton" title="'+ this.labels['GenericDelete'] +'"><span class="icon-cancel"></span></button>');
                    deleteButton.click(function(evt) {
                        evt.preventDefault();
                        evt.stopPropagation();
                        updateLinkUrl('');
                    });
                    
                    // Picker button (variable size depending on language)
                    var pickerButton = $('<button type="button" class="button btn btn-sm hypervideoPickerButton" title="'+ this.labels['SettingsHotspotPickHypervideo'] +'"><span class="icon-hypervideo" style="margin-right: 8px;"></span>'+ this.labels['SettingsHotspotPickHypervideo'] +'</button>');
                    
                    pickerButton.click(function(evt) {
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
                    linkInputRow.append(linkInput);
                    linkInputRow.append(deleteButton);
                    linkInputRow.append(pickerButton);
                    
                    hotspotEditorContainer.append(linkInputRow);

                    return hotspotEditorContainer;

                }



            }



        }
    }


);
