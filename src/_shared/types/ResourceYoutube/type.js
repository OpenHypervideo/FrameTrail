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
                iconClass:      'icon-youtube',


                /**
                 * I render the content of myself, which is a &lt;iframe&gt; containing the Youtube.com player and with class="resourceDetail".
                 *
                 * @method renderContent
                 * @return HTMLElement
                 */
                renderContent: function() {

                    var timecode = 0;
                    var uri = this.resourceData.src.replace(/^\/\//, 'https://');

                    if ( uri.indexOf('#t=') != -1 ) {
                        var uriParts = uri.split('#t=');
                        uri = uriParts[0];
                        timecode = convertYoutubeTimeToSeconds(uriParts[1]);
                    }

                    var _iframeWrapper = document.createElement('div');
                    _iframeWrapper.innerHTML = '<iframe frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" webkitAllowFullScreen mozallowfullscreen allowFullScreen src="'
                        +   uri
                        +   '?enablejsapi=1&rel=0&theme=light&color=white&showinfo=0&modestbranding=1&autohide=1&cc_load_policy=0&iv_load_policy=3&start='+ timecode +'">'
                        +    '</iframe>';
                    var iframeEl = _iframeWrapper.firstElementChild;
                    iframeEl.addEventListener('error', function() { return true; });

                    var resourceDetail = document.createElement('div');
                    resourceDetail.className = 'resourceDetail';
                    resourceDetail.dataset.type = this.resourceData.type;

                    var resourceContent = document.createElement('div');
                    resourceContent.className = 'resourceContent';
                    resourceContent.appendChild(iframeEl);
                    resourceDetail.appendChild(resourceContent);
                    resourceDetail.appendChild(this.buildResourceOptions({}));

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
                            '--thumb-bg: url('+ FrameTrail.module('RouteNavigation').getResourceURL(this.resourceData.thumb) +'); background-image: var(--thumb-bg);' : '' );

                    var tagList = (this.resourceData.tags ? this.resourceData.tags.join(' ') : '');
                    
                    var _thumbWrapper = document.createElement('div');
                    _thumbWrapper.innerHTML = '<div class="resourceThumb '+ tagList +'" data-license-type="'+ this.resourceData.licenseType +'" data-resourceID="'+ trueID +'" data-type="'+ this.resourceData.type +'" style="'+ thumbBackground +'">'
                        + '<div class="resourceOverlay"><div class="resourceIcon"><span class="icon-youtube"></span></div></div>'
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
