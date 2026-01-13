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

                    var color = (this.resourceData.attributes && this.resourceData.attributes.color) ? this.resourceData.attributes.color : '#ff0000';
                    var linkUrl = (this.resourceData.attributes && this.resourceData.attributes.linkUrl) ? this.resourceData.attributes.linkUrl : '';
                    var innerSize = (this.resourceData.attributes && this.resourceData.attributes.innerSize !== undefined) ? this.resourceData.attributes.innerSize : 0;

                    var resourceDetail = $('<div class="resourceDetail" data-type="hotspot" style="width: 100%; height: 100%; position: relative; display: flex; align-items: center; justify-content: center;">'
                                        +  '    <div class="hotspot-container">'
                                        +  '        <div class="hotspot-circle" style="background-color: ' + color + ';"></div>'
                                        +  '        <div class="hotspot-pulse" style="border-color: ' + color + ';"></div>'
                                        +  '    </div>'
                                        +  '</div>');

                    // Apply mask for donut effect if innerSize > 0
                    if (innerSize > 0) {
                        var innerPercent = innerSize + '%';
                        var maskValue = 'radial-gradient(circle, transparent ' + innerPercent + ', black ' + innerPercent + ')';
                        resourceDetail.find('.hotspot-circle').css({
                            'mask-image': maskValue,
                            '-webkit-mask-image': maskValue
                        });
                    }

                    // Make it clickable if link is provided
                    if (linkUrl) {
                        resourceDetail.css('cursor', 'pointer');
                        resourceDetail.on('click', function() {
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
                        currentAttributes.color = '#ff0000';
                    }
                    if (!currentAttributes.linkUrl) {
                        currentAttributes.linkUrl = '';
                    }
                    if (currentAttributes.innerSize === undefined) {
                        currentAttributes.innerSize = 0;
                    }

                    var hotspotEditorContainer = $('<div class="hotspotEditorContainer"></div>');

                    // Inner circle size (donut hole) control
                    hotspotEditorContainer.append('<label>'+ this.labels['SettingsHotspotInnerSize'] +'</label>');
                    var innerSizeInput = $('<input type="number" min="0" max="95" step="1" value="' + currentAttributes.innerSize + '"/>');
                    var innerSizeLabel = $('<span>%</span>');
                    var innerSizeWrapper = $('<div class="innerSizeWrapper"></div>');
                    innerSizeWrapper.append(innerSizeInput, innerSizeLabel);

                    innerSizeInput.on('change', function() {
                        var newSize = parseFloat($(this).val());
                        if (isNaN(newSize) || newSize < 0) newSize = 0;
                        if (newSize > 95) newSize = 95;
                        $(this).val(newSize);
                        overlayOrAnnotation.data.attributes.innerSize = newSize;

                        if (overlayOrAnnotation.overlayElement) {
                            var hotspotCircle = overlayOrAnnotation.overlayElement.find('.hotspot-circle');
                            var innerPercent = newSize + '%';
                            if (newSize > 0) {
                                var maskValue = 'radial-gradient(circle, transparent ' + innerPercent + ', black ' + innerPercent + ')';
                                hotspotCircle.css({
                                    'mask-image': maskValue,
                                    '-webkit-mask-image': maskValue
                                });
                            } else {
                                // Remove mask for full circle
                                hotspotCircle.css({
                                    'mask-image': '',
                                    '-webkit-mask-image': ''
                                });
                            }
                            FrameTrail.module('HypervideoModel').newUnsavedChange('overlays');
                        } else {
                            // Update annotation elements in dom
                            $(overlayOrAnnotation.contentViewDetailElements).each(function() {
                                var hotspotCircle = $(this).find('.hotspot-circle');
                                var innerPercent = newSize + '%';
                                if (newSize > 0) {
                                    var maskValue = 'radial-gradient(circle, transparent ' + innerPercent + ', black ' + innerPercent + ')';
                                    hotspotCircle.css({
                                        'mask-image': maskValue,
                                        '-webkit-mask-image': maskValue
                                    });
                                } else {
                                    hotspotCircle.css({
                                        'mask-image': '',
                                        '-webkit-mask-image': ''
                                    });
                                }
                            });
                            FrameTrail.module('HypervideoModel').newUnsavedChange('annotations');
                        }
                    });

                    hotspotEditorContainer.append(innerSizeWrapper);

                    // Color picker
                    hotspotEditorContainer.append('<label>'+ this.labels['SettingsHotspotColor'] +'</label>');
                    var colorInput = $('<input type="color" value="' + currentAttributes.color + '"/>');

                    colorInput.on('change', function() {
                        var newColor = $(this).val();
                        overlayOrAnnotation.data.attributes.color = newColor;

                        if (overlayOrAnnotation.overlayElement) {
                            var hotspotCircle = overlayOrAnnotation.overlayElement.find('.hotspot-circle');
                            var hotspotPulse = overlayOrAnnotation.overlayElement.find('.hotspot-pulse');
                            hotspotCircle.css('background-color', newColor);
                            hotspotPulse.css('border-color', newColor);
                            FrameTrail.module('HypervideoModel').newUnsavedChange('overlays');
                        } else {
                            // Update annotation elements in dom
                            $(overlayOrAnnotation.contentViewDetailElements).each(function() {
                                $(this).find('.hotspot-circle').css('background-color', newColor);
                                $(this).find('.hotspot-pulse').css('border-color', newColor);
                            });
                            FrameTrail.module('HypervideoModel').newUnsavedChange('annotations');
                        }
                    });

                    hotspotEditorContainer.append(colorInput);

                    // Link URL input
                    hotspotEditorContainer.append('<label>'+ this.labels['SettingsHotspotLink'] +'</label>');
                    var linkInput = $('<input type="text" placeholder="https://example.com or time in seconds" value="' + currentAttributes.linkUrl + '"/>');

                    linkInput.on('keyup', function(evt) {
                        if (!evt.originalEvent.metaKey && evt.originalEvent.key != 'Meta') {
                            var newUrl = $(this).val();
                            overlayOrAnnotation.data.attributes.linkUrl = newUrl;

                            if (overlayOrAnnotation.overlayElement) {
                                var resourceDetail = overlayOrAnnotation.overlayElement.find('.resourceDetail[data-type="hotspot"]');
                                if (newUrl) {
                                    resourceDetail.css('cursor', 'pointer');
                                } else {
                                    resourceDetail.css('cursor', 'default');
                                }
                                FrameTrail.module('HypervideoModel').newUnsavedChange('overlays');
                            } else {
                                // Update annotation elements in dom
                                $(overlayOrAnnotation.contentViewDetailElements).each(function() {
                                    var resourceDetail = $(this).find('.resourceDetail[data-type="hotspot"]');
                                    if (newUrl) {
                                        resourceDetail.css('cursor', 'pointer');
                                    } else {
                                        resourceDetail.css('cursor', 'default');
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
