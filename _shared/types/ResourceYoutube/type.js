/**
 * @module Shared
 */


/**
 * I am the type definition of a ResourceYoutube. I represent an emmbedded Youtube.com player.
 *
 * @class ResourceYoutube
 * @category TypeDefinition
 * @extends Resource
 */


FrameTrail.defineType(

    'ResourceYoutube',

    function (FrameTrail) {
        return {
            parent: 'Resource',
            constructor: function(resourceData){

                this.resourceData = resourceData;

            },
            prototype: {

                /**
                 * I hold the data object of a ResourceYoutube, which is stored in the {{#crossLink "Database"}}Database{{/crossLink}} and saved in the resource's _index.json.
                 * @attribute resourceData
                 * @type {}
                 */
                resourceData:   {},


                /**
                 * I render the content of myself, which is a &lt;iframe&gt; containing the Youtube.com player and with class="resourceDetail".
                 *
                 * @method renderContent
                 * @return HTMLElement
                 */
                renderContent: function() {

                    var timecode = 0;
                    var uri = this.resourceData.src;

                    if ( uri.indexOf('#t=') != -1 ) {
                        var uriParts = uri.split('#t=');
                        uri = uriParts[0];
                        timecode = convertYoutubeTimeToSeconds(uriParts[1]);
                    }

                	var resourceDetail = $(
                            '<iframe class="resourceDetail" data-type="'+ this.resourceData.type +'" '
                        +   'frameborder="0" webkitAllowFullScreen mozallowfullscreen allowFullScreen src="'
                        +   uri
                        +   '?rel=0&theme=light&color=white&showinfo=0&modestbranding=1&autohide=1&start='+ timecode +'">'
                        +    '</iframe>'
                    ).bind('error', function() {
                        return true;
                    });

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
                        + '                      <div class="resourceIcon"><span class="icon-youtube"></span></div>'
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
                // XhXXmXXs to seconds

                /**
                 * Description
                 * @method convertYoutubeTimeToSeconds
                 * @param {} timestamp
                 * @return timestamp
                 */
                convertYoutubeTimeToSeconds: function(timestamp) {
                    var a = timestamp.match(/\d+/g),
                        timestamp = 0;

                    if(a.length == 3) {
                        timestamp = timestamp + parseInt(a[0]) * 3600;
                        timestamp = timestamp + parseInt(a[1]) * 60;
                        timestamp = timestamp + parseInt(a[2]);
                    }

                    if(a.length == 2) {
                        timestamp = timestamp + parseInt(a[0]) * 60;
                        timestamp = timestamp + parseInt(a[1]);
                    }

                    if(a.length == 1) {
                        timestamp = timestamp + parseInt(a[0]);
                    }

                    return timestamp;


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
