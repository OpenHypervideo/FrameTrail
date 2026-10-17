/**
 * @module Shared
 */

/**
 * I am the type definition of a ResourceWistia.
 *
 * @class ResourceWistia
 * @category TypeDefinition
 * @extends Resource
 */

FrameTrail.defineType(

    'ResourceWistia',

    function (FrameTrail) {
        return {
            parent: 'Resource',
            constructor: function(resourceData){
                this.resourceData = resourceData;
            },
            prototype: {

                resourceData: {},

                renderContent: function() {

                    var _iframeWrapper = document.createElement('div');
                    _iframeWrapper.innerHTML = '<iframe frameborder="0" allowfullscreen src="'
                        +   this.resourceData.src.replace(/^\/\//, 'https://')
                        +   '?autoPlay=false">'
                        +   '</iframe>';
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
                 * I tell the aspect ratio (width / height) of my player, for overlays
                 * that keep the shape of their media (see Overlay.readMediaRatio): the
                 * embedded player is 16:9.
                 *
                 * @method getIntrinsicRatio
                 * @param {HTMLElement} resourceDetail
                 * @param {Function} callback  called with the ratio
                 */
                getIntrinsicRatio: function(resourceDetail, callback) {

                    callback(16 / 9);

                },

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
                        + '<div class="resourceOverlay"><div class="resourceIcon"><span class="icon-play"></span></div></div>'
                        + '<div class="resourceTitle">'+ this.resourceData.name +'</div>'
                        + '</div>';
                    var thumbElement = _thumbWrapper.firstElementChild;

                    var previewButton = document.createElement('div');
                    previewButton.className = 'resourcePreviewButton';
                    previewButton.innerHTML = '<span class="icon-eye"></span>';
                    previewButton.addEventListener('click', function(evt) {
                        self.openPreview(this.parentElement);
                        evt.stopPropagation();
                        evt.preventDefault();
                    });
                    thumbElement.append(previewButton);

                    return thumbElement;

                },

                renderPropertiesControls: function(overlay) {
                    return this.renderBasicPropertiesControls(overlay);
                },

                renderTimeControls: function(annotation) {
                    return this.renderBasicTimeControls(annotation);
                }

            }
        }
    }

);
