/**
 * @module Shared
 */


/**
 * I am the type definition of a ResourceVideo. I represent a video file resource on the server.
 *
 * Its file is the video (an mp4 after the server's transcoding). Subtitles belong to a hypervideo, not to the video resource.
 *
 * @class ResourceVideo
 * @category TypeDefinition
 * @extends Resource
 */


FrameTrail.defineType(

    'ResourceVideo',

    function (FrameTrail) {
        return {
            parent: 'Resource',
            constructor: function(resourceData){

                this.resourceData = resourceData;

            },
            prototype: {

                /**
                 * I hold the data object of a ResourceVideo, which is stored in the {{#crossLink "Database"}}Database{{/crossLink}} and saved in the resource's _index.json.
                 * @attribute resourceData
                 * @type {}
                 */
                resourceData:   {},
                iconClass:      'icon-play-1',


                /**
                 * I render the content of myself, which is a &lt;video&gt; wrapped in a &lt;div class="resourceDetail" ...&gt;
                 *
                 * @method renderContent
                 * @return HTMLElement
                 */
                renderContent: function() {

                    var _wrapper = document.createElement('div');
                    _wrapper.innerHTML = '<div class="resourceDetail" data-type="'+ this.resourceData.type +'">'
                        + '<div class="resourceContent">'
                        + '<video controls disablePictureInPicture></video>'
                        + '</div>'
                        + '</div>';
                    var resourceDetailElement = _wrapper.firstElementChild;

                    var videoElement = resourceDetailElement.querySelector('video');

                    if (this.resourceData.src.indexOf('.m3u8') != -1) {
                        if(Hls.isSupported()) {
                            var hls = new Hls();
                            hls.loadSource(FrameTrail.module('RouteNavigation').getResourceURL(this.resourceData.src));
                            hls.attachMedia(videoElement);
                            /*
                            hls.on(Hls.Events.MANIFEST_PARSED,function() {
                                //videoElement.play();
                            });
                            */
                        }
                        // hls.js is not supported on platforms that do not have Media Source Extensions (MSE) enabled.
                        // When the browser has built-in HLS support (check using `canPlayType`), we can provide an HLS manifest (i.e. .m3u8 URL) directly to the video element throught the `src` property.
                        // This is using the built-in support of the plain video element, without using hls.js.
                        // Note: it would be more normal to wait on the 'canplay' event below however on Safari (where you are most likely to find built-in HLS support) the video.src URL must be on the user-driven
                        // white-list before a 'canplay' event will be emitted; the last video event that can be reliably listened-for when the URL is not on the white-list is 'loadedmetadata'.
                        else if (videoElement.canPlayType('application/vnd.apple.mpegurl')) {
                            videoElement.insertAdjacentHTML('beforeend', '<source src="'+ FrameTrail.module('RouteNavigation').getResourceURL(this.resourceData.src)  +'" type="video/mp4"></source>');
                            /*
                            videoElement.addEventListener('loadedmetadata',function() {
                                //videoElement.play();
                            });
                            */
                        }
                    } else {
                        videoElement.insertAdjacentHTML('beforeend', '<source src="'+ FrameTrail.module('RouteNavigation').getResourceURL(this.resourceData.src)  +'" type="video/mp4"></source>');
                    }

                    var sourceEl = videoElement.querySelector('source');
                    if (sourceEl) {
                        sourceEl.addEventListener('error', function(err) {
                            console.log('PLAYBACK ERROR: ', err);
                        });
                    }

                    resourceDetailElement.appendChild(this.buildResourceOptions({
                        downloadUrl: FrameTrail.module('RouteNavigation').getResourceURL(this.resourceData.src),
                        licenseType: this.resourceData.licenseType,
                        licenseAttribution: this.resourceData.licenseAttribution
                    }));

                    return resourceDetailElement;

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
                        + '<div class="resourceOverlay"><div class="resourceIcon"><span class="icon-play-1"></span></div></div>'
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
                 * See also {{#crossLink "Resource/renderBasicPropertiesControls:method"}}Resource/renderBasicPropertiesControls(){{/crossLink}}
                 *
                 * I extent the PropertiesControls user interface element with special controls for a video overlay.
                 * This special control is an radio button chooser, to choose, wether the video overlay should be synchronized with the main video.
                 *
                 * @method renderPropertiesControls
                 * @param {Overlay} overlay
                 * @return &#123; controlsContainer: HTMLElement, changeStart: Function, changeEnd: Function, changeDimensions: Function &#125;
                 */
                renderPropertiesControls: function(overlay) {

                    var basicControls = this.renderBasicPropertiesControls(overlay);

                    /* Add Video Type  Controls */

                    var checkboxRow = document.createElement('div');
                    checkboxRow.className = 'checkboxRow';

                    var syncedLabel = document.createElement('label');
                    syncedLabel.setAttribute('for', 'syncedCheckbox');
                    syncedLabel.textContent = this.labels['SettingsSynchronization'];

                    var _switchWrapper = document.createElement('div');
                    _switchWrapper.innerHTML = '<label class="switch">'
                        + '    <input id="syncedCheckbox" class="syncedCheckbox" type="checkbox" autocomplete="off" '+ ((overlay.data.attributes.autoPlay) ? 'checked' : '') +'>'
                        + '    <span class="slider round"></span>'
                        + '</label>';
                    var syncedCheckbox = _switchWrapper.firstElementChild;

                    var self = this;
                    syncedCheckbox.querySelector('input[type="checkbox"]').addEventListener('change', function () {
                        var wasChecked = !this.checked; // opposite of current state
                        if (this.checked) {
                            overlay.data.attributes.autoPlay = true;
                            overlay.syncedMedia = true;
                            overlay.setSyncedMedia(true);
                        } else {
                            overlay.data.attributes.autoPlay = false;
                            overlay.syncedMedia = false;
                            overlay.setSyncedMedia(false);
                        }

                        FrameTrail.module('HypervideoModel').newUnsavedChange('overlays');
                        
                        // Register undo for autoPlay toggle
                        (function(overlayId, oldVal, newVal, labels) {
                            var findOverlay = function() {
                                var overlays = FrameTrail.module('HypervideoModel').overlays;
                                for (var i = 0; i < overlays.length; i++) {
                                    if (overlays[i].data.created === overlayId) {
                                        return overlays[i];
                                    }
                                }
                                return null;
                            };
                            FrameTrail.module('UndoManager').register({
                                category: 'overlays',
                                description: labels['SidebarOverlays'] + ' ' + labels['SettingsSynchronization'],
                                undo: function() {
                                    var o = findOverlay();
                                    if (!o) return;
                                    o.data.attributes.autoPlay = oldVal;
                                    o.syncedMedia = oldVal;
                                    o.setSyncedMedia(oldVal);
                                    FrameTrail.module('HypervideoModel').newUnsavedChange('overlays');
                                },
                                redo: function() {
                                    var o = findOverlay();
                                    if (!o) return;
                                    o.data.attributes.autoPlay = newVal;
                                    o.syncedMedia = newVal;
                                    o.setSyncedMedia(newVal);
                                    FrameTrail.module('HypervideoModel').newUnsavedChange('overlays');
                                }
                            });
                        })(overlay.data.created, wasChecked, this.checked, self.labels);
                    });

                    checkboxRow.append(syncedCheckbox, syncedLabel);

                    basicControls.controlsContainer.querySelector('#OverlayOptions').prepend(checkboxRow);

                    return basicControls;

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
