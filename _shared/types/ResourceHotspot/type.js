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

                    var resourceDetail = $('<div class="resourceDetail" data-type="hotspot" style="width: 100%; height: 100%; position: relative; display: flex; align-items: center; justify-content: center;">'
                                        +  '    <div class="hotspot-container">'
                                        +  '        <div class="hotspot-square-wrapper">'
                                        +  '            <div class="hotspot-element" style="border-radius: ' + borderRadiusValue + '; border-color: ' + color + ';"></div>'
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

                    // Make it clickable if link is provided - only on the element itself
                    if (linkUrl) {
                        hotspotElement.css('cursor', 'pointer');
                        hotspotElement.on('click', function(e) {
                            e.stopPropagation(); // Prevent event bubbling
                            if (linkUrl.startsWith('http://') || linkUrl.startsWith('https://')) {
                                window.open(linkUrl, '_blank');
                            } else {
                                // Internal navigation - treat as time in seconds
                                var time = parseFloat(linkUrl);
                                if (!isNaN(time)) {
                                    FrameTrail.module('HypervideoController').currentTime = time;
                                }
                            }
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

                    // Create form row container for all columns
                    var formRow = $('<div class="formRow"></div>');
                    
                    // Shape and Color columns
                    var shapeColumn = $('<div class="formColumn column2"></div>');
                    var colorColumn = $('<div class="formColumn column2"></div>');

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
                    
                    shapeSelect.on('change', function() {
                        var newShape = $(this).val();
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
                    });
                    
                    shapeColumn.append(shapeSelect);

                    // Color picker column
                    colorColumn.append('<label>'+ this.labels['SettingsHotspotColor'] +'</label>');
                    var colorInput = $('<input type="color" value="' + currentAttributes.color + '"/>');

                    colorInput.on('change', function() {
                        var newColor = $(this).val();
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
                            
                            FrameTrail.module('HypervideoModel').newUnsavedChange('overlays');
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
                            FrameTrail.module('HypervideoModel').newUnsavedChange('annotations');
                        }
                    });

                    colorColumn.append(colorInput);

                    // Border Width and Border Radius columns
                    var borderWidthColumn = $('<div class="formColumn column2"></div>');
                    var borderRadiusColumn = $('<div class="formColumn column2"></div>');

                    // Border width control column
                    borderWidthColumn.append('<label>'+ this.labels['SettingsHotspotBorderWidth'] +'</label>');
                    var borderWidthInput = $('<input type="number" min="0" max="50" step="0.5" value="' + currentAttributes.borderWidth + '"/>');
                    var borderWidthLabel = $('<span>%</span>');
                    var borderWidthWrapper = $('<div class="innerSizeWrapper"></div>');
                    borderWidthWrapper.append(borderWidthInput, borderWidthLabel);

                    borderWidthInput.on('change', function() {
                        var newWidth = parseFloat($(this).val());
                        if (isNaN(newWidth) || newWidth < 0) newWidth = 0;
                        if (newWidth > 50) newWidth = 50;
                        $(this).val(newWidth);
                        overlayOrAnnotation.data.attributes.borderWidth = newWidth;
                        
                        var shape = overlayOrAnnotation.data.attributes.shape || 'circle';
                        var borderRadius = overlayOrAnnotation.data.attributes.borderRadius || 10;
                        var color = overlayOrAnnotation.data.attributes.color || '#0096ff';
                        
                        // Apply changes
                        applyShapeChanges(overlayOrAnnotation, shape, borderRadius, newWidth, color);
                        FrameTrail.module('HypervideoModel').newUnsavedChange(overlayOrAnnotation.overlayElement ? 'overlays' : 'annotations');
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
                    
                    borderRadiusInput.on('change', function() {
                        var newRadius = parseFloat($(this).val());
                        if (isNaN(newRadius) || newRadius < 0) newRadius = 0;
                        if (newRadius > 100) newRadius = 100;
                        $(this).val(newRadius);
                        overlayOrAnnotation.data.attributes.borderRadius = newRadius;
                        
                        // Apply shape changes
                        var borderWidth = overlayOrAnnotation.data.attributes.borderWidth || 5;
                        var color = overlayOrAnnotation.data.attributes.color || '#0096ff';
                        applyShapeChanges(overlayOrAnnotation, overlayOrAnnotation.data.attributes.shape, newRadius, borderWidth, color);
                    });

                    borderRadiusColumn.append(borderRadiusWrapper);

                    // Append all columns to formRow, then formRow to container
                    formRow.append(shapeColumn, colorColumn, borderWidthColumn, borderRadiusColumn);
                    hotspotEditorContainer.append(formRow);

                    // Link URL input (full width, not in columns)
                    hotspotEditorContainer.append('<label>'+ this.labels['SettingsHotspotLink'] +'</label>');
                    var linkInput = $('<input type="text" placeholder="https://example.com or time in seconds" value="' + currentAttributes.linkUrl + '"/>');

                    linkInput.on('keyup', function(evt) {
                        if (!evt.originalEvent.metaKey && evt.originalEvent.key != 'Meta') {
                            var newUrl = $(this).val();
                            overlayOrAnnotation.data.attributes.linkUrl = newUrl;

                            if (overlayOrAnnotation.overlayElement) {
                                var hotspotElement = overlayOrAnnotation.overlayElement.find('.hotspot-element');
                                // Remove existing click handler
                                hotspotElement.off('click');
                                
                                if (newUrl) {
                                    hotspotElement.css('cursor', 'pointer');
                                    // Attach click handler to the element
                                    hotspotElement.on('click', function(e) {
                                        e.stopPropagation();
                                        if (newUrl.startsWith('http://') || newUrl.startsWith('https://')) {
                                            window.open(newUrl, '_blank');
                                        } else {
                                            // Internal navigation - treat as time in seconds
                                            var time = parseFloat(newUrl);
                                            if (!isNaN(time)) {
                                                FrameTrail.module('HypervideoController').currentTime = time;
                                            }
                                        }
                                    });
                                } else {
                                    hotspotElement.css('cursor', 'default');
                                }
                                FrameTrail.module('HypervideoModel').newUnsavedChange('overlays');
                            } else {
                                // Update annotation elements in dom
                                $(overlayOrAnnotation.contentViewDetailElements).each(function() {
                                    var hotspotElement = $(this).find('.hotspot-element');
                                    // Remove existing click handler
                                    hotspotElement.off('click');
                                    
                                    if (newUrl) {
                                        hotspotElement.css('cursor', 'pointer');
                                        // Attach click handler to the element
                                        hotspotElement.on('click', function(e) {
                                            e.stopPropagation();
                                            if (newUrl.startsWith('http://') || newUrl.startsWith('https://')) {
                                                window.open(newUrl, '_blank');
                                            } else {
                                                // Internal navigation - treat as time in seconds
                                                var time = parseFloat(newUrl);
                                                if (!isNaN(time)) {
                                                    FrameTrail.module('HypervideoController').currentTime = time;
                                                }
                                            }
                                        });
                                    } else {
                                        hotspotElement.css('cursor', 'default');
                                    }
                                });
                                FrameTrail.module('HypervideoModel').newUnsavedChange('annotations');
                            }
                        }
                    });

                    hotspotEditorContainer.append(linkInput);

                    return hotspotEditorContainer;

                }



            }



        }
    }


);
