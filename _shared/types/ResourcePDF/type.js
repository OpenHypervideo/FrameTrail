/**
 * @module Shared
 */


/**
 * I am the type definition of a ResourcePdf. I represent a PDF document.
 *
 * @class ResourcePdf
 * @category TypeDefinition
 * @extends Resource
 */



FrameTrail.defineType(

    'ResourcePdf',

    function (FrameTrail) {
        return {
            parent: 'Resource',
            constructor: function(resourceData){

                this.resourceData = resourceData;

            },
            prototype: {

                /**
                 * I hold the data object of a ResourcePdf, which is stored in the {{#crossLink "Database"}}Database{{/crossLink}} and saved in the resource's _index.json.
                 * @attribute resourceData
                 * @type {}
                 */
                resourceData:   {},


                /**
                 * I render the content of myself, which is a PDF wrapped in a &lt;div class="resourceDetail" ...&gt;
                 *
                 * @method renderContent
                 * @return HTMLElement
                 */
                renderContent: function() {

                	var resourceDetail = $('<div class="resourceDetail" data-type="'+ this.resourceData.type +'"></div>');

                    var documentSource = (this.resourceData.src.indexOf('//') != -1) ? this.resourceData.src.replace('http:', '') : FrameTrail.module('RouteNavigation').getResourceURL(this.resourceData.src);

                    var licenseType = (this.resourceData.licenseType && this.resourceData.licenseType == 'CC-BY-SA-3.0') ? '<a href="https://creativecommons.org/licenses/by-sa/3.0/" title="License: '+ this.resourceData.licenseType +'" target="_blank"><span class="cc-by-sa-bg-image"></span></a>' : this.resourceData.licenseType;
                    var licenseString = (licenseType) ? licenseType +' - '+ this.resourceData.licenseAttribution : '';

                    var downloadButton = '';
                    if (this.resourceData.licenseType != 'Copyright') {
                        downloadButton = '<a download class="button" href="'+ documentSource +'" data-tooltip-right="'+ this.labels['GenericDownload'] +'"><span class="icon-download"></span></a>';
                    }

                    var pdfDocument = $(
                        '<object'
                    +   ' data="'+ documentSource +'"'
                    +   ' type="application/pdf"'
                    +   ' width="100%"'
                    +   ' height="100%">'
                    +   ' <iframe webkitAllowFullScreen mozallowfullscreen allowFullScreen '
                    +   ' src="'+ documentSource +'"'
                    +   ' width="100%"'
                    +   ' height="100%"'
                    +   ' sandbox="allow-same-origin allow-scripts allow-popups allow-forms"'
                    +   ' frameborder="0"'
                    +   ' style="border: none;">'
                    +   ' <p>Your browser does not support PDFs.'
                    +   ' <a href="'+ documentSource +'">'+ this.labels['GenericDownload'] +'</a>.</p>'
                    +   ' </iframe>'
                    +   '</object>');

                    resourceDetail.append(pdfDocument);

                    resourceDetail.append('<div class="resourceOptions">'
                                       +  '    <div class="licenseInformation">'+ licenseString +'</div>'
                                       +  '    <div class="resourceButtons">'+ downloadButton +'</div>'
                                       +  '</div>');

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
                            'background-image: url('+ FrameTrail.module('RouteNavigation').getResourceURL(this.resourceData.thumb) +');' : '' );

                    var tagList = (this.resourceData.tags ? this.resourceData.tags.join(' ') : '');
                    
                    var thumbElement = $('<div class="resourceThumb '+ tagList +'" data-license-type="'+ this.resourceData.licenseType +'" data-resourceID="'+ trueID +'" data-type="'+ this.resourceData.type +'" style="'+ thumbBackground +'">'
                        + '                  <div class="resourceOverlay">'
                        + '                      <div class="resourceIcon"><span class="icon-file-pdf"></span></div>'
                        + '                  </div>'
                        + '                  <div class="resourceTitle">'+ this.resourceData.name +'</div>'
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
