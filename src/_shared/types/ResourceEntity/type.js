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
                iconClass:      'icon-tag-1',


                /**
                 * I render the content of myself, which is an &lt;iframe&gt; of an IRI wrapped in a &lt;div class="resourceDetail" ...&gt;
                 *
                 * @method renderContent
                 * @return HTMLElement
                 */
                renderContent: function() {

                    // Annotations carry the entity's IRI as uri (frametrail:uri); overlays
                    // and library resources only have src. Either stands in for the other.
                    var uri = this.resourceData.uri || this.resourceData.src || '',
                        src = this.resourceData.src || uri;

                    var iFrameSource = !uri
                        ? 'about:blank'
                        : (src.indexOf('//') != -1) ? uri.replace(/^\/\//, 'https://') : FrameTrail.module('RouteNavigation').getResourceURL(uri);

                    var resourceDetail = document.createElement('div');
                    resourceDetail.className = 'resourceDetail';
                    resourceDetail.dataset.type = this.resourceData.type;

                    var resourceContent = document.createElement('div');
                    resourceContent.className = 'resourceContent';

                    if (this.resourceData.attributes.embed && this.resourceData.attributes.embed == 'forbidden') {

                        var thumbSource = '';
                        if (this.resourceData.thumb) {
                            if (/^(https?:)?\/\//.test(this.resourceData.thumb)) {
                                thumbSource = this.resourceData.thumb.replace(/^\/\//, 'https://');
                            } else {
                                thumbSource = FrameTrail.module('RouteNavigation').getResourceURL(this.resourceData.thumb);
                            }
                        }

                        var _fbWrapper = document.createElement('div');
                        _fbWrapper.innerHTML = '<div class="embedFallback">'
                            + '<div class="resourceDetailPreviewTitle">'+ this.resourceData.name +'</div>'
                            + '<img class="resourceDetailPreviewThumb" src="'+ thumbSource +'"/>'
                            + '</div>';
                        resourceContent.append(_fbWrapper.firstElementChild);

                    } else {

                        var _iframeWrapper = document.createElement('div');
                        _iframeWrapper.innerHTML = '<iframe frameborder="0" webkitAllowFullScreen mozallowfullscreen allowFullScreen src="'
                            + iFrameSource
                            + '" sandbox="allow-same-origin allow-scripts allow-popups allow-forms"></iframe>';
                        var iFrame = _iframeWrapper.firstElementChild;
                        iFrame.addEventListener('error', function() { return true; });
                        iFrame.addEventListener('message', function() { return true; });

                        resourceContent.appendChild(iFrame);

                    }

                    resourceDetail.appendChild(resourceContent);
                    resourceDetail.appendChild(this.buildResourceOptions({
                        openInNewTabUrl: iFrameSource
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

                    var self = this,
                        unescapeHelper = document.createElement('div'),
                        child,
                        unescapedString;

                    var tagList = (this.resourceData.tags ? this.resourceData.tags.join(' ') : '');
                    
                    var _thumbWrapper = document.createElement('div');
                    _thumbWrapper.innerHTML = '<div class="resourceThumb '+ tagList +'" data-license-type="'+ this.resourceData.licenseType +'" data-type="'+ this.resourceData.type +'">'
                        + '<div class="resourceOverlay"><div class="resourceIcon"><span class="icon-tag-1"></span></div></div>'
                        + '<div class="resourceTitle">'+ this.labels['ResourceCustomTextHTML'] +'</div>'
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

                    //var decoded_string = ...; var textOnly = ...; (removed double-decode)

                    var _decodeHelper = document.createElement('div');
                    _decodeHelper.innerHTML = self.resourceData.attributes.text;
                    var decoded_string = _decodeHelper.textContent;
                    thumbElement.insertAdjacentHTML('beforeend', '<div class="resourceTextPreview">'+ decoded_string +'</div>');

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

                },

                getDisplayLabel: function() {
                    if (this.resourceData.attributes && this.resourceData.attributes.text) {
                        var _helper = document.createElement('div');
                        _helper.innerHTML = this.resourceData.attributes.text;
                        var decoded = _helper.textContent;
                        return decoded.substring(0, 50) || this.resourceData.name || 'Entity';
                    }
                    return this.resourceData.name || 'Entity';
                }


            }



        }
    }


);
