/**
 * @module Shared
 */


/**
 * I am the type definition of a ResourceEntity.
 * * 
 *
 * @class ResourceEntity
 * @category TypeDefinition
 * @extends Resource
 */



FrameTrail.defineType(

    'ResourceEntity',

    function (FrameTrail) {
        return {
            parent: 'Resource',
            constructor: function(resourceData){
                this.resourceData = resourceData;
            },
            prototype: {
                /**
                 * I hold the data object of a custom ResourceEntity, which is not stored in the Database and doesn't appear in the resource's _index.json.
                 * @attribute resourceData
                 * @type {}
                 */
                resourceData:   {},


                /**
                 * I render the content of myself, which is an &lt;iframe&gt; of an IRI wrapped in a &lt;div class="resourceDetail" ...&gt;
                 *
                 * @method renderContent
                 * @return HTMLElement
                 */
                renderContent: function() {

                    var self = this;

                    var resourceDetail = $('<div class="resourceDetail" data-type="'+ this.resourceData.type +'"></div>'),
                        iFrameSource = (this.resourceData.src.indexOf('//') != -1) ? this.resourceData.src/*.replace('http:', '')*/ : FrameTrail.module('RouteNavigation').getResourceURL(this.resourceData.src),
                        downloadButton = '<a class="button" href="'+ iFrameSource +'" target="_blank">Open in new tab</a>';

                    if (this.resourceData.attributes.embed && this.resourceData.attributes.embed == 'forbidden') {

                        var thumbSource = (this.resourceData.thumb) ? this.resourceData.thumb : '';
                        
                        var embedFallback = $(
                                '<div class="embedFallback">'
                            +   '    <div class="resourceDetailPreviewTitle">'+ this.resourceData.name +'</div>'
                            +   '    <img class="resourceDetailPreviewThumb" src="'+ thumbSource +'"/>'
                            +   '</div>'
                        );

                        resourceDetail.append(embedFallback);
                        resourceDetail.append('<div class="resourceOptions"><div class="resourceButtons">'+ downloadButton +'</div></div>');

                    } else {

                        var iFrame = $(
                                '<iframe frameborder="0" webkitAllowFullScreen mozallowfullscreen allowFullScreen src="'
                            +   iFrameSource
                            +   '" sandbox="allow-same-origin allow-scripts allow-popups allow-forms">'
                            +    '</iframe>'
                        ).bind('error, message', function() {
                            return true;
                        });

                        resourceDetail.append(iFrame);
                        resourceDetail.append('<div class="resourceOptions"><div class="resourceButtons">'+ downloadButton +'</div></div>');

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

                    var self = this,
                        unescapeHelper = document.createElement('div'),
                        child,
                        unescapedString;

                    var thumbElement = $('<div class="resourceThumb" data-license-type="'+ this.resourceData.licenseType +'" data-type="'+ this.resourceData.type +'">'
                        + '                  <div class="resourceOverlay">'
                        + '                      <div class="resourceIcon"><span class="icon-tag-1"></span></div>'
                        + '                  </div>'
                        + '                  <div class="resourceTitle">Custom Text/HTML</div>'
                        + '              </div>');

                    var previewButton = $('<div class="resourcePreviewButton"><span class="icon-eye"></span></div>').click(function(evt) {
                        // call the openPreview method (defined in abstract type: Resource)
                        self.openPreview( $(this).parent() );
                        evt.stopPropagation();
                        evt.preventDefault();
                    });
                    thumbElement.append(previewButton);

                    //var decoded_string = $("<div/>").html(self.resourceData.attributes.text).text();
                    //var textOnly = $("<div/>").html(decoded_string).text();
                    //thumbElement.append('<div class="resourceTextPreview">'+ textOnly +'</div>');

                    var decoded_string = $("<div/>").html(self.resourceData.attributes.text).text();
                    thumbElement.append('<div class="resourceTextPreview">'+ decoded_string +'</div>');

                    return thumbElement;

                },


                /**
                 * See {{#crossLink "Resource/renderBasicPropertiesControls:method"}}Resource/renderBasicPropertiesControls(){{/crossLink}}
                 * @method renderPropertiesControls
                 * @param {Overlay} overlay
                 * @return &#123; controlsContainer: HTMLElement, changeStart: Function, changeEnd: Function, changeDimensions: Function &#125;
                 */
                renderPropertiesControls: function(overlay) {

                    return this.renderBasicPropertiesControls(overlay);

                },


                /**
                 * See {{#crossLink "Resource/renderBasicTimeControls:method"}}Resource/renderBasicTimeControls(){{/crossLink}}
                 * @method renderTimeControls
                 * @param {Annotation} annotation
                 * @return &#123; controlsContainer: HTMLElement, changeStart: Function, changeEnd: Function &#125;
                 */
                renderTimeControls: function(annotation) {

                    return this.renderBasicTimeControls(annotation);

                }


            }



        }
    }


);
