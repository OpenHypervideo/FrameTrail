/**
 * @module Shared
 */


/**
 * I am the type definition of a ResourceAudio. I represent a audio file resource on the server.
 *
 * @class ResourceAudio
 * @category TypeDefinition
 * @extends Resource
 */


FrameTrail.defineType(

    'ResourceAudio',

    function (FrameTrail) {
        return {
            parent: 'Resource',
            constructor: function(resourceData){
                this.resourceData = resourceData;
            },
            prototype: {

                /**
                 * I hold the data object of a ResourceAudio, which is stored in the {{#crossLink "Database"}}Database{{/crossLink}} and saved in the resource's _index.json.
                 * @attribute resourceData
                 * @type {}
                 */
                resourceData:   {},


                /**
                 * I render the content of myself, which is a &lt;audio&gt; wrapped in a &lt;div class="resourceDetail" ...&gt;
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

                    return $('<div class="resourceDetail" data-type="'+ this.resourceData.type +'">'
                           + '    <audio controls autobuffer>'
                           +        '<source src="'+ FrameTrail.module('RouteNavigation').getResourceURL(this.resourceData.src) +'" type="audio/mp3">'
                           + '    </audio>'
                           + '    <div class="resourceOptions">'
                           + '        <div class="licenseInformation">'+ licenseString +'</div>'
                           + '        <div class="resourceButtons">'+ downloadButton +'</div>'
                           + '    </div>'
                           + '</div>');

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
                        + '                      <div class="resourceIcon"><span class="icon-volume-up"></span></div>'
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
                 * I extend the PropertiesControls user interface element with special controls for an audio overlay.
                 * This special control is an radio button chooser, to choose, wether the audio overlay should be synchronized with the main video.
                 *
                 * @method renderPropertiesControls
                 * @param {Overlay} overlay
                 * @return &#123; controlsContainer: HTMLElement, changeStart: Function, changeEnd: Function, changeDimensions: Function &#125;
                 */
                renderPropertiesControls: function(overlay) {

                    var basicControls = this.renderBasicPropertiesControls(overlay);

                    /* Add Video Type  Controls */

                    var syncedLabel = $('<div>'+ this.labels['SettingsSynchronization'] +'</div>'),

                        syncedRadio = $('<div class="syncedRadio">'
                                      + '    <input type="radio" id="SyncedTrue" name="radio" value="on" '
                                      +      (overlay.data.attributes.autoPlay ? 'checked="checked"' : '')
                                      + '    ><label for="SyncedTrue">'+ this.labels['SettingsSynchronizationOn'] +'</label>'
                                      + '    <input type="radio" id="SyncedFalse" name="radio" value="off" '
                                      +      (!overlay.data.attributes.autoPlay ? 'checked="checked"' : '')
                                      + '    ><label for="SyncedFalse">'+ this.labels['SettingsSynchronizationOff'] +'</label>'
                                      + '</div>').buttonset();

                        syncedRadio.find('input[name="radio"]').on('change', function () {

                                        if (this.value == 'on') {
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

                    basicControls.controlsContainer.find('#OverlayOptions').append(syncedLabel, syncedRadio);

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
