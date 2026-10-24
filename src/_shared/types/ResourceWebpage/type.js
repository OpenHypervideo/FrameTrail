/**
 * @module Shared
 */


/**
 * I am the type definition of a ResourceWebpage. I represent an external webpage which is displayed in an iframe.
 *
 * @class ResourceWebpage
 * @category TypeDefinition
 * @extends Resource
 */



FrameTrail.defineType(

    'ResourceWebpage',

    function (FrameTrail) {
        return {
            parent: 'Resource',
            constructor: function(resourceData){

                this.resourceData = resourceData;

            },
            prototype: {

                /**
                 * I hold the data object of a ResourceWebpage, which is stored in the {{#crossLink "Database"}}Database{{/crossLink}} and saved in the resource's _index.json.
                 * @attribute resourceData
                 * @type {}
                 */
                resourceData:   {},
                iconClass:      'icon-window',


                /**
                 * I render the content of myself, which is a &lt;iframe&gt; wrapped in a &lt;div class="resourceDetail" ...&gt;
                 *
                 * @method renderContent
                 * @return HTMLElement
                 */
                renderContent: function() {

                    var iFrameSource = (this.resourceData.src.indexOf('//') != -1) ? this.resourceData.src.replace(/^\/\//, 'https://') : FrameTrail.module('RouteNavigation').getResourceURL(this.resourceData.src);

                    var resourceDetail = document.createElement('div');
                    resourceDetail.className = 'resourceDetail';
                    resourceDetail.dataset.type = this.resourceData.type;

                    var resourceContent = document.createElement('div');
                    resourceContent.className = 'resourceContent';

                    if (this.resourceData.attributes.embed && this.resourceData.attributes.embed == 'forbidden') {

                        var thumbSource = '';
                        if (this.resourceData.thumb) {
                            thumbSource = /^(https?:)?\/\//.test(this.resourceData.thumb)
                                ? this.resourceData.thumb.replace(/^\/\//, 'https://')
                                : FrameTrail.module('RouteNavigation').getResourceURL(this.resourceData.thumb);
                        }

                        var domain = '';
                        try { domain = new URL(iFrameSource).hostname.replace(/^www\./, ''); } catch(e) { domain = ''; }

                        var card = document.createElement('div');
                        card.className = 'resourceCard';

                        var cardHtml = '<div class="resourceCardHeader">'
                            + '<span class="resourceCardTypeIcon"><span class="icon-window"></span></span>'
                            + '<div class="resourceCardMeta">'
                            + '<div class="resourceCardTitle">' + (this.resourceData.name || domain || '') + '</div>'
                            + '<div class="resourceCardSubtitle">' + domain + '</div>'
                            + '</div>'
                            + '</div>';

                        if (thumbSource) {
                            cardHtml += '<div class="resourceCardThumb"><img src="' + thumbSource + '" alt=""></div>';
                        }

                        if (this.resourceData.attributes.description) {
                            cardHtml += '<div class="resourceCardContent"><p>' + this.resourceData.attributes.description + '</p></div>';
                        }

                        card.innerHTML = cardHtml;
                        resourceContent.appendChild(card);

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
                            "--thumb-bg: url('"+ FrameTrail.module('RouteNavigation').getResourceURL(this.resourceData.thumb) +"'); background-image: var(--thumb-bg);" : "" );

                    var tagList = (this.resourceData.tags ? this.resourceData.tags.join(' ') : '');

                    // The site's icon, from the icon service the ResourceManager asks
                    // where no server can read the page: shown at icon size
                    if (/^https:\/\/icons\.duckduckgo\.com\/ip3\//.test(this.resourceData.thumb || '')) {
                        tagList += ' siteIconThumb';
                    }

                    var _thumbWrapper = document.createElement('div');
                    _thumbWrapper.innerHTML = '<div class="resourceThumb '+ tagList +'" data-license-type="'+ this.resourceData.licenseType +'" data-resourceID="'+ trueID +'" data-type="'+ this.resourceData.type +'" style="'+ thumbBackground +'">'
                        + '<div class="resourceOverlay"><div class="resourceIcon"><span class="icon-window"></span></div></div>'
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
