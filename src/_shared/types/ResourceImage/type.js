/**
 * @module Shared
 */


/**
 * I am the type definition of a ResourceImage. I represent a resource file of an image.
 *
 * @class ResourceImage
 * @category TypeDefinition
 * @extends Resource
 */



FrameTrail.defineType(

    'ResourceImage',

    function (FrameTrail) {
        return {
            parent: 'Resource',
            constructor: function(resourceData){

                this.resourceData = resourceData;

            },
            prototype: {
                /**
                 * I hold the data object of a ResourceImage, which is stored in the {{#crossLink "Database"}}Database{{/crossLink}} and saved in the resource's _index.json.
                 * @attribute resourceData
                 * @type {}
                 */
                resourceData:   {},
                iconClass:      'icon-picture',


                /**
                 * I render the content of myself, which is a &lt;img&gt; wrapped in a &lt;div class="resourceDetail" ...&gt;
                 *
                 * @method renderContent
                 * @return HTMLElement
                 */
                renderContent: function() {

                    var _wrapper = document.createElement('div');
                    _wrapper.innerHTML = '<div class="resourceDetail" data-type="'+ this.resourceData.type +'">'
                        + '<div class="resourceContent">'
                        + '<img src="'+ FrameTrail.module('RouteNavigation').getResourceURL(this.resourceData.src) +'">'
                        + '<div class="resourceTooltip"></div>'
                        + '</div>'
                        + '</div>';
                    var resourceElement = _wrapper.firstElementChild;

                    resourceElement.appendChild(this.buildResourceOptions({
                        downloadUrl: FrameTrail.module('RouteNavigation').getResourceURL(this.resourceData.src),
                        licenseType: this.resourceData.licenseType,
                        licenseAttribution: this.resourceData.licenseAttribution
                    }));

                    return resourceElement;

                },

                /**
                 * I tell the aspect ratio (width / height) of my image, read from the
                 * rendered <img>, for overlays that keep the shape of their media (see
                 * Overlay.readMediaRatio).
                 *
                 * @method getIntrinsicRatio
                 * @param {HTMLElement} resourceDetail
                 * @param {Function} callback  called with the ratio, or null when it is not known
                 */
                getIntrinsicRatio: function(resourceDetail, callback) {

                    var img = resourceDetail.querySelector('img');
                    if (!img) { callback(null); return; }

                    var answer = function() {
                        callback((img.naturalWidth && img.naturalHeight) ? img.naturalWidth / img.naturalHeight : null);
                    };
                    if (img.complete) { answer(); return; }
                    img.addEventListener('load', answer, { once: true });
                    img.addEventListener('error', function() { callback(null); }, { once: true });

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
                        trueID = FrameTrail.module('Database').getIdOfResource(self.resourceData);
                    } else {
                        trueID = id;
                    }

                    var thumbUrl = (this.resourceData.thumb ? FrameTrail.module('RouteNavigation').getResourceURL(this.resourceData.thumb)
                                    : FrameTrail.module('RouteNavigation').getResourceURL(this.resourceData.src) );

                    var tagList = (this.resourceData.tags ? this.resourceData.tags.join(' ') : '');
                    
                    var _thumbWrapper = document.createElement('div');
                    _thumbWrapper.innerHTML = '<div class="resourceThumb '+ tagList +'" data-license-type="'+ this.resourceData.licenseType +'" data-resourceID="'+ trueID +'" data-type="'+ this.resourceData.type +'" style="--thumb-bg:url('+ thumbUrl +'); background-image: var(--thumb-bg);">'
                        + '<div class="resourceOverlay"><div class="resourceIcon"><span class="icon-picture"></span></div></div>'
                        + '<div class="resourceTitle">'+ this.resourceData.name +'</div>'
                        + '</div>';
                    var thumbElement = _thumbWrapper.firstElementChild;

                    var previewButton = document.createElement('div');
                    previewButton.className = 'resourcePreviewButton';
                    previewButton.innerHTML = '<span class="icon-eye"></span>';
                    previewButton.addEventListener('click', function(evt) {
                        // call the openPreview method (defined in abstract type: Resource)
                        self.openPreview(this.parentElement);
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
