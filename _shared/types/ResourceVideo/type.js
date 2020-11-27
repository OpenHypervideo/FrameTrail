/**
 * @module Shared
 */


/**
 * I am the type definition of a ResourceVideo. I represent a video file resource on the server.
 *
 * Unlike other resource types, which have one or no file at all, a video resource consists of an mp4 and a webm file, plus an arbitrary amount of subtitle files.
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


                /**
                 * I render the content of myself, which is a &lt;video&gt; wrapped in a &lt;div class="resourceDetail" ...&gt;
                 *
                 * @method renderContent
                 * @return HTMLElement
                 */
                renderContent: function() {

                    var licenseType = (this.resourceData.licenseType && this.resourceData.licenseType == 'CC-BY-SA-3.0') ? '<a href="https://creativecommons.org/licenses/by-sa/3.0/" title="License: '+ this.resourceData.licenseType +'" target="_blank"><span class="cc-by-sa-bg-image"></span></a>' : this.resourceData.licenseType;
                    var licenseString = (licenseType) ? licenseType +' - '+ this.resourceData.licenseAttribution : '';

                    var downloadButton = '';
                    if (this.resourceData.licenseType != 'Copyright') {
                        downloadButton = '<a download class="button" href="'+ FrameTrail.module('RouteNavigation').getResourceURL(this.resourceData.src) +'" data-tooltip-bottom-right="'+ this.labels['GenericDownload'] +'"><span class="icon-download"></span></a>';
                    }

                    var resourceDetailElement = $('<div class="resourceDetail" data-type="'+ this.resourceData.type +'">'
                           + '    <video controls disablePictureInPicture>'
                           + '    </video>'
                           + '    <div class="resourceOptions">'
                           + '        <div class="licenseInformation">'+ licenseString +'</div>'
                           + '        <div class="resourceButtons">'+ downloadButton +'</div>'
                           + '    </div>'
                           + '</div>');
                    
                    var videoElement = resourceDetailElement.find('video').eq(0)[0];

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
                            $(videoElement).append('<source src="'+ FrameTrail.module('RouteNavigation').getResourceURL(this.resourceData.src)  +'" type="video/mp4"></source>');
                            /*
                            videoElement.addEventListener('loadedmetadata',function() {
                                //videoElement.play();
                            });
                            */
                        }
                    } else {
                        $(videoElement).append('<source src="'+ FrameTrail.module('RouteNavigation').getResourceURL(this.resourceData.src)  +'" type="video/mp4"></source>');
                    }

                    $(videoElement).find('source').on('error', function(err) {
                        console.log('PLAYBACK ERROR: ', err);
                    });

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
                            'background-image: url('+ FrameTrail.module('RouteNavigation').getResourceURL(this.resourceData.thumb) +');' : '' );

                    var thumbElement = $('<div class="resourceThumb" data-license-type="'+ this.resourceData.licenseType +'" data-resourceID="'+ trueID +'" data-type="'+ this.resourceData.type +'" style="'+ thumbBackground +'">'
                        + '                  <div class="resourceOverlay">'
                        + '                      <div class="resourceIcon"><span class="icon-play-1"></span></div>'
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

                    var checkboxRow = $('<div class="checkboxRow"></div>');

                    var syncedLabel = $('<label for="syncedCheckbox">'+ this.labels['SettingsSynchronization'] +'</label>'),
                        checkedString = (overlay.data.attributes.autoPlay) ? 'checked="checked"' : '',
                        syncedCheckbox = $('<label class="switch">'
                                        +  '    <input id="syncedCheckbox" class="syncedCheckbox" type="checkbox" autocomplete="off" '+ checkedString +'>'
                                        +  '    <span class="slider round"></span>'
                                        +  '</label>');

                    syncedCheckbox.find('input[type="checkbox"]').on('change', function () {
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
                    });

                    checkboxRow.append(syncedCheckbox, syncedLabel);

                    basicControls.controlsContainer.find('#OverlayOptions').append(checkboxRow);

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
