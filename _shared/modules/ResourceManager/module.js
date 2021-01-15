/**
 * @module Shared
 */


/**
 * I am the ResourceManager.
 *
 * I contain the business logic for managing all Resources and rendering lists of them for display.
 *
 * I am closely connected with {{#crossLink "ViewResource"}}ViewResource{{/crossLink}}.
 *
 * @class ResourceManager
 * @static
 */


FrameTrail.defineModule('ResourceManager', function(FrameTrail){

	var labels = FrameTrail.module('Localization').labels;

    var maxUploadBytes,
        tmpObj,
        previewXHR;



	/**
	 * I tell the {{#crossLink "Database/loadResourceData:method"}}Database{{/crossLink}} to reload the index data.
	 * @method updateResourceDatabase
	 */
	function updateResourceDatabase() {

		FrameTrail.module('Database').loadResourceData();

	};



	//Check for valid URL
    var previewTimeout = null;
    $(document).on('change paste keyup', '#resourceInputTabURL input', function(evt) {
        clearTimeout(previewTimeout);
        previewTimeout = setTimeout(function() {
            $('#resourceInputTabURL .resourceURLPreview').empty();
            $('.resourceInput[name="thumbnail"]').val('');
            checkResourceInput( $('#resourceInputTabURL input')[0].value, $('.resourceNameInput')[0].value );
        }, 800);
        evt.stopPropagation();
    });

    //Check for Name Length
    $(document).on('change paste keyup input', '.resourceNameInput', function(evt) {
        if ( $(this).val().length > 2 ) {
            $('.newResourceConfirm').button('enable');
        } else {
            $('.newResourceConfirm').button('disable');
        }
        $('.resourceURLPreview .resourceTitle').text($(this).val());
        evt.stopPropagation();
    });



	/**
	 * I open a jquery UI dialog, which allows the user to upload a new resource.
     * When the onlyVideo parameter is set to true, I allow only uploads of videos (needed during creation of a new hypervideo)
	 *
	 * @method uploadResource
	 * @param {Function} successCallback
     * @param {Boolean} onlyVideo
	 *
	 */
	function uploadResource(successCallback, onlyVideo) {
        FrameTrail.module('UserManagement').ensureAuthenticated(function(){

            $.ajax({
                type:     'GET',
                url:        '_server/ajaxServer.php',
                data:       {'a':'fileGetMaxUploadSize'},
                success: function(response) {

                    maxUploadBytes = response.maxuploadbytes;

                    var uploadDialog =  $('<div class="uploadDialog" title="'+ labels['ResourceAddNew'] +'">'
                                        + '    <form class="uploadForm" method="post">'
                                        + '        <div class="resourceInputTabContainer">'
                                        + '            <ul class="resourceInputTabList">'
                                        + '                <li data-type="url"><a href="#resourceInputTabURL">'+ labels['ResourcePasteURL'] +'</a></li>'
                                        + '                <li data-type="image"><a href="#resourceInputTabImage">'+ labels['ResourceUploadImage'] +'</a></li>'
                                        + '                <li data-type="video"><a href="#resourceInputTabVideo">'+ labels['ResourceUploadVideo'] +'</a></li>'
                                        + '                <li data-type="audio"><a href="#resourceInputTabAudio">'+ labels['ResourceUploadAudio'] +'</a></li>'
                                        + '                <li data-type="pdf"><a href="#resourceInputTabPDF">'+ labels['ResourceUploadPDF'] +'</a></li>'
                                        + '                <li data-type="map"><a href="#resourceInputTabMap">'+ labels['ResourceAddMap'] +'</a></li>'
                                        + '            </ul>'
                                        + '            <div id="resourceInputTabURL">'
                                        + '                <div class="resourceInputMessage message active">'+ labels['MessagePasteAnyURL'] +'</div>'
                                        + '                <input type="text" name="url" placeholder="URL" class="resourceInput">'
                                        + '                <input type="hidden" name="thumbnail" class="resourceInput">'
                                        + '                <input type="hidden" name="embed" class="resourceInput">'
                                        + '                <div class="corsWarning message warning">'+ labels['MessageEmbedNotAllowed'] +'</div>'
                                        + '                <div class="resourceURLPreview"></div>'
                                        + '            </div>'
                                        + '            <div id="resourceInputTabImage">'
                                        + '                <div class="message active">'+ labels['MessageAddImageFileFormat'] +' <b>3 MB</b></div>'
                                        + '                <input type="file" name="image">'
                                        + '            </div>'
                                        + '            <div id="resourceInputTabVideo">'
                                        + '                <div class="videoInputMessage message active">'+ labels['MessageAddVideoFileFormat'] +' <b>'+ bytesToSize(maxUploadBytes) +'</b>.<br>'+ labels['MessageMoreInfoVideoConversion'] +'</div>'
                                        + '                <input type="file" name="mp4"> .mp4'
                                        + '            </div>'
                                        + '            <div id="resourceInputTabAudio">'
                                        + '                <div class="audioInputMessage message active">'+ labels['MessageAddAudioFileFormat'] +' <b>3 MB</b>.</div>'
                                        + '                <input type="file" name="audio"> .mp3'
                                        + '            </div>'
                                        + '            <div id="resourceInputTabPDF">'
                                        + '                <div class="pdfInputMessage message active">'+ labels['MessageAddPDFFileFormat'] +' <b>3 MB</b>.</div>'
                                        + '                <input type="file" name="pdf"> .pdf'
                                        + '            </div>'
                                        + '            <div id="resourceInputTabMap">'
                                        + '                <div class="locationSearchWrapper">'
                                        + '                    <input type="text" name="locationQ" class="locationQ" placeholder="'+ labels['LocationSearch'] +'">'
                                        + '                    <span class="locationSearchCopyright">Data © OpenStreetMap contributors, ODbL 1.0.</span>'
                                        + '                    <ul class="locationSearchSuggestions"></ul>'
                                        + '                </div>'
                                        + '                <input type="text" name="lat" placeholder="latitude">'
                                        + '                <input type="text" name="lon" placeholder="longitude">'
                                        + '                <input type="hidden" name="boundingBox[]" class="BB1">'
                                        + '                <input type="hidden" name="boundingBox[]" class="BB2">'
                                        + '                <input type="hidden" name="boundingBox[]" class="BB3">'
                                        + '                <input type="hidden" name="boundingBox[]" class="BB4">'
                                        + '            </div>'
                                        + '        </div>'
                                        + '        <div class="nameInputContainer">'
                                        + '            <div class="nameInputMessage">Name</div>'
                                        + '            <input type="text" name="name" placeholder="'+ labels['MessageNewResourceName'] +'" class="resourceNameInput">'
                                        + '            <input type="hidden" name="a" value="fileUpload">'
                                        + '            <input type="hidden" name="attributes" value="">'
                                        + '            <input type="hidden" name="type" value="url">'
                                        + '        </div>'
                                        + '    </form>'
                                        + '    <div class="progress">'
                                        + '        <div class="bar"></div >'
                                        + '        <div class="percent">0%</div >'
                                        + '        <div class="uploadStatus"></div>'
                                        + '    </div>'
                                        + '</div>'

                                        + '</div>');

                    uploadDialog.find('input[type="file"]').on('change', function() {

                        if (this.files[0].size > maxUploadBytes) {
                            uploadDialog.find('.newResourceConfirm').prop('disabled', true);
                            $('.uploadDialog').append('<div class="message active error">'+ labels['ErrorFileSize'] +'. '+ labels['ErrorFileSizeMax'] +' '+ bytesToSize(maxUploadBytes) +'. <br>'+ labels['ErrorFileSizeMoreInfo'] +'</div>');
                        } else {
                            uploadDialog.find('.newResourceConfirm').prop('disabled', false);
                            uploadDialog.find('.message.error').remove();

                        }

                    });

                    uploadDialog.find('.resourceInputTabContainer').tabs({
                        activate: function(e,ui) {

                            uploadDialog.find('.nameInputContainer input[name="attributes"]').val('');
                            uploadDialog.find('.nameInputContainer input[name="type"]').val($(ui.newTab[0]).data('type'));
                            uploadDialog.find('.message.error').remove();

                        },

                        create: function(e,ui) {

                        	if (onlyVideo) {

                            	uploadDialog.find('.resourceInputTabContainer').tabs(
                            		'option',
                            		'active',
                            		uploadDialog.find('#resourceInputTabVideo').index() - 1
                            	);

                            	uploadDialog.find('.resourceInputTabContainer').tabs('disable');
                            	uploadDialog.find('.resourceInputTabContainer').tabs('enable', '#resourceInputTabVideo');

                            }


                        }

                    });

                    uploadDialog.find('.locationQ').keyup(function(e) {

                        $.getJSON('https://nominatim.openstreetmap.org/search?q='+ uploadDialog.find('.locationQ').val() + '&format=json')
                            .done(function(respText) {

                                uploadDialog.find('.locationSearchSuggestions').empty();
                                uploadDialog.find('.locationSearchSuggestions').show();

                                for (var location in respText) {

                                    var suggestion = $('<li data-lon="'+ respText[location].lon +'" data-lat="'+ respText[location].lat +'" data-display-name="'+ respText[location].display_name +'" data-bb1="'+ respText[location].boundingbox[0] +'" data-bb2="'+ respText[location].boundingbox[1] +'" data-bb3="'+ respText[location].boundingbox[2] +'" data-bb4="'+ respText[location].boundingbox[3] +'">'+ respText[location].display_name +'</li>')
                                        .click(function() {
                                            uploadDialog.find('input[name="lon"]').val( $(this).attr('data-lon') );
                                            uploadDialog.find('input[name="lat"]').val( $(this).attr('data-lat') );
                                            uploadDialog.find('input.BB1').val( $(this).attr('data-bb1') );
                                            uploadDialog.find('input.BB2').val( $(this).attr('data-bb2') );
                                            uploadDialog.find('input.BB3').val( $(this).attr('data-bb3') );
                                            uploadDialog.find('input.BB4').val( $(this).attr('data-bb4') );
                                            uploadDialog.find('input[name="name"]').val( $(this).attr('data-display-name') );
                                            uploadDialog.find('.locationSearchSuggestions').hide();
                                        })
                                        .appendTo( uploadDialog.find('.locationSearchSuggestions') );
                                }
                                //console.log(respText);
                            });

                    });




                    //Ajaxform
                    uploadDialog.find('.uploadForm').ajaxForm({
                        method:     'POST',
                        url:        '_server/ajaxServer.php',
                        beforeSerialize: function() {

                            if (previewXHR) { previewXHR.abort() };

                            uploadDialog.find('.message.error').remove();

                            var tmpType = uploadDialog.find('.nameInputContainer input[name="type"]').val();

                            if (tmpType == 'url') {
                                tmpObj = checkResourceInput( uploadDialog.find('.resourceInput').val(), uploadDialog.find('.resourceNameInput').val(), uploadDialog.find('.resourceInput[name="thumbnail"]').val() );
                                uploadDialog.find('.nameInputContainer input[name="attributes"]').val(JSON.stringify(tmpObj));
                                tmpObj = [];
                            }

                            else if (tmpType == 'image') {
                                uploadDialog.find('#resourceInputTabVideo input').prop('disabled',true);
                                uploadDialog.find('#resourceInputTabPDF input').prop('disabled',true);
                                uploadDialog.find('#resourceInputTabAudio input').prop('disabled',true);
                            }

                            else if (tmpType == 'video') {
                                uploadDialog.find('#resourceInputTabImage input').prop('disabled',true);
                                uploadDialog.find('#resourceInputTabPDF input').prop('disabled',true);
                                uploadDialog.find('#resourceInputTabAudio input').prop('disabled',true);
                            }

                            else if (tmpType == 'audio') {
                                uploadDialog.find('#resourceInputTabImage input').prop('disabled',true);
                                uploadDialog.find('#resourceInputTabVideo input').prop('disabled',true);
                                uploadDialog.find('#resourceInputTabPDF input').prop('disabled',true);
                            }

                            else if (tmpType == 'pdf') {
                                uploadDialog.find('#resourceInputTabImage input').prop('disabled',true);
                                uploadDialog.find('#resourceInputTabVideo input').prop('disabled',true);
                                uploadDialog.find('#resourceInputTabAudio input').prop('disabled',true);
                            }

                            var percentVal = '0%';

                            uploadDialog.find('.bar').width(percentVal);
                            uploadDialog.find('.percent').html(percentVal);
                            uploadDialog.find('.uploadStatus').html('Uploading Resource ...');
                            uploadDialog.find('.progress').show();

                            $('.newResourceConfirm').prop('disabled', true);

                        },
                        beforeSend: function(xhr) {
                            var tmpType = uploadDialog.find('.nameInputContainer input[name="type"]').val();

                            // client side pre-validation (server checks again)
                            if (tmpType == 'video') {
                                if( uploadDialog.find('[name="mp4"]').val().length < 4) {
                                    uploadDialog.find('.progress').hide();
                                    uploadDialog.find('.newResourceConfirm').prop('disabled', false);
                                    $('.uploadDialog').append('<div class="message active error">'+ labels['ErrorChooseVideoFile'] +'</div>');
                                    xhr.abort();
                                }

                            }

                        },
                        data: tmpObj,
                        uploadProgress: function(event, position, total, percentComplete) {

                            var percentVal = percentComplete + '%';

                            uploadDialog.find('.bar').width(percentVal)
                            uploadDialog.find('.percent').html(percentVal);

                        },
                        success: function(respText) {

                            var percentVal = '100%';

                            uploadDialog.find('.bar').width(percentVal)
                            uploadDialog.find('.percent').html(percentVal);

                            switch (respText['code']) {
                                case 0:

                                    // Upload Successful

                                    if (respText['response']['resource']['type'] == 'video' && FrameTrail.module('RouteNavigation').getResourceURL(respText.response.resource.src).indexOf('.m3u8') == -1) {

                                        uploadDialog.find('.uploadStatus').html(labels['MessageGeneratingThumbnail']);

                                        var tmpVideo = $('<video id="tmpVideo" style="visibility: hidden;​ height:​ 300px;​ width:​ 400px;​ position:​ absolute;​">​</video>​');
                                        var tmpCanvas = $('<canvas id="tmpCanvas" width="400px" height="300px" style="visibility: hidden; position: absolute;"></canvas>');
                                        $('body').append(tmpVideo);
                                        $('body').append(tmpCanvas);
                                        var video = document.getElementById('tmpVideo');
                                        var canvas = document.getElementById('tmpCanvas');

                                        if ( (video.canPlayType('video/mp4') || (video.canPlayType('video/mpeg4'))) ) {
                                            video.src = FrameTrail.module('RouteNavigation').getResourceURL(respText.response.resource.src);
                                        } else {
                                            console.log(labels['MessageThumbnailNotGenerated']);
                                        }

                                        video.addEventListener('loadeddata', function() {
                                            // Go to middle & Play
                                            video.currentTime = video.duration/2;
                                            video.play();
                                        });

                                        video.addEventListener('playing', function() {
                                            // Adapt and adjust Video & Canvas Dimensions
                                            //video.width = canvas.width = video.offsetWidth;
                                            //video.height = canvas.height = video.offsetHeight;
                                            // Draw current Video-Frame on Canvas
                                            canvas.getContext('2d').drawImage(video, 0, 0, 400, 300);
                                            video.pause();

                                            try {
                                                canvas.toDataURL();

                                                $.ajax({
                                                    url:        '_server/ajaxServer.php',
                                                    type:       'post',
                                                    data:       {'a':'fileUploadThumb','resourcesID':respText['response']['resId'],'type':respText['response']['resource']['type'],'thumb':canvas.toDataURL()},
                                                    /**
                                                     * Description
                                                     * @method success
                                                     * @return
                                                     */
                                                    success: function() {
                                                        $(video).remove();
                                                        $(canvas).remove();

                                                        //addResource(respText["res"]);
                                                        FrameTrail.module('Database').loadResourceData(function() {
                                                            uploadDialog.dialog('close');
                                                            successCallback && successCallback.call();
                                                        });
                                                    }
                                                });
                                            } catch(error) {
                                                $(image).remove();
                                                $(canvas).remove();

                                                FrameTrail.module('Database').loadResourceData(function() {
                                                    uploadDialog.dialog('close');
                                                    successCallback && successCallback.call();
                                                });
                                            }
                                        });

                                    } else if (respText['response']['resource']['type'] == 'image'
                                                && (/\.(jpg|jpeg|png)$/i.exec(respText['response']['resource']['src'])) ) {

                                        uploadDialog.find('.uploadStatus').html(labels['MessageGeneratingThumbnail']);

                                        var tmpImage = $('<img id="tmpImage" style="visibility: hidden;​ height:​ 250px;​ width:​350px;​ position:​ absolute;​"/>​');
                                        var tmpCanvas = $('<canvas id="tmpCanvas" width="350px" height="250px" style="visibility:hidden; position: absolute;"></canvas>');
                                        $('body').append(tmpImage);
                                        $('body').append(tmpCanvas);
                                        var image = document.getElementById('tmpImage');
                                        var canvas = document.getElementById('tmpCanvas');

                                        image.src = FrameTrail.module('RouteNavigation').getResourceURL(respText['response']['resource']['src']);
                                        image.addEventListener('load', function() {

                                            // Adapt and adjust Image & Canvas Dimensions
                                            //image.width = canvas.width = image.offsetWidth;
                                            //image.height = canvas.height = image.offsetHeight;
                                            // Draw current Image on Canvas
                                            canvas.getContext('2d').drawImage(image, 0, 0, 350, 250);

                                            try {
                                                canvas.toDataURL();

                                                $.ajax({
                                                    url:        '_server/ajaxServer.php',
                                                    type:       'post',
                                                    data:       {'a':'fileUploadThumb','resourcesID':respText['response']['resId'],'type':respText['response']['resource']['type'],'thumb':canvas.toDataURL()},
                                                    success: function() {
                                                        $(image).remove();
                                                        $(canvas).remove();

                                                        //addResource(respText["res"]);
                                                        FrameTrail.module('Database').loadResourceData(function() {
                                                            uploadDialog.dialog('close');
                                                            successCallback && successCallback.call();
                                                        });
                                                    }
                                                });
                                            } catch(error) {
                                                $(image).remove();
                                                $(canvas).remove();

                                                FrameTrail.module('Database').loadResourceData(function() {
                                                    uploadDialog.dialog('close');
                                                    successCallback && successCallback.call();
                                                });
                                            }


                                        });

                                    } else {

                                        //addResource(respText['response']);
                                        FrameTrail.module('Database').loadResourceData(function() {
                                            uploadDialog.dialog('close');
                                            successCallback && successCallback.call();
                                        });

                                    }
                                    break;
                                case 1:
                                    uploadDialog.find('.progress').hide();
                                    uploadDialog.find('.newResourceConfirm').prop('disabled', false);
                                    $('.uploadDialog').append('<div class="message active error">'+ labels['ErrorNotLoggedInAnymore'] +'</div>');
                                    break;
                                case 2:
                                    uploadDialog.find('.progress').hide();
                                    uploadDialog.find('.newResourceConfirm').prop('disabled', false);
                                    $('.uploadDialog').append('<div class="message active error">'+ labels['ErrorNotActivated'] +'</div>');
                                    break;
                                case 3:
                                    uploadDialog.find('.progress').hide();
                                    uploadDialog.find('.newResourceConfirm').prop('disabled', false);
                                    $('.uploadDialog').append('<div class="message active error">'+ labels['ErrorCouldNotFindResourcesDirectory'] +'</div>');
                                    break;
                                case 4:
                                    uploadDialog.find('.progress').hide();
                                    uploadDialog.find('.newResourceConfirm').prop('disabled', false);
                                    $('.uploadDialog').append('<div class="message active error">'+ labels['ErrorChooseImageFile'] +'</div>');
                                    break;
                                case 5:
                                    uploadDialog.find('.progress').hide();
                                    uploadDialog.find('.newResourceConfirm').prop('disabled', false);
                                    $('.uploadDialog').append('<div class="message active error">'+ labels['ErrorChooseVideoFile'] +'</div>');
                                    break;
                                case 6:
                                    uploadDialog.find('.progress').hide();
                                    uploadDialog.find('.newResourceConfirm').prop('disabled', false);
                                    $('.uploadDialog').append('<div class="message active error">'+ labels['ErrorVideoFileFormat'] +'</div>');
                                    break;
                                case 7:
                                    uploadDialog.find('.progress').hide();
                                    uploadDialog.find('.newResourceConfirm').prop('disabled', false);
                                    $('.uploadDialog').append('<div class="message active error">'+ labels['ErrorMapNoCoordinates'] +'</div>');
                                    break;
                                case 8:
                                    uploadDialog.find('.progress').hide();
                                    uploadDialog.find('.newResourceConfirm').prop('disabled', false);
                                    $('.uploadDialog').append('<div class="message active error">'+ labels['ErrorEmptyName'] +'</div>');
                                    break;
                                case 9:
                                    uploadDialog.find('.progress').hide();
                                    uploadDialog.find('.newResourceConfirm').prop('disabled', false);
                                    $('.uploadDialog').append('<div class="message active error">'+ labels['ErrorWrongType'] +'</div>');
                                    break;
                                case 10:
                                    uploadDialog.find('.progress').hide();
                                    uploadDialog.find('.newResourceConfirm').prop('disabled', false);
                                    $('.uploadDialog').append('<div class="message active error">'+ labels['ErrorFileSize'] +'. '+ labels['ErrorFileSizeMoreInfo'] +'</div>');
                                    break;
                                case 11:
                                    uploadDialog.find('.progress').hide();
                                    uploadDialog.find('.newResourceConfirm').prop('disabled', false);
                                    $('.uploadDialog').append('<div class="message active error">'+ labels['ErrorEmptyURL'] +'</div>');
                                    break;
                                case 12:
                                    uploadDialog.find('.progress').hide();
                                    uploadDialog.find('.newResourceConfirm').prop('disabled', false);
                                    $('.uploadDialog').append('<div class="message active error">'+ labels['MessageEmbedNotAllowed'] +'</div>');
                                    break;
                                case 20:
                                    uploadDialog.find('.progress').hide();
                                    uploadDialog.find('.newResourceConfirm').prop('disabled', false);
                                    $('.uploadDialog').append('<div class="message active error">'+ labels['ErrorUploadNotAllowed'] +'</div>');
                                    break;
                                default:
                                    uploadDialog.find('.progress').hide();
                                    uploadDialog.find('.newResourceConfirm').prop('disabled', false);
                                    $('.uploadDialog').append('<div class="message active error">'+ labels['ErrorGeneric'] +'</div>');
                                    break;
                            }
                        }
                    });


                    uploadDialog.dialog({
                        resizable: false,
                        width: 680,
                        height: 'auto',
                        modal: true,
                        close: function() {
                            if (previewXHR) { previewXHR.abort() };
                            $(this).dialog('close');
                            //$(this).find('.uploadForm').resetForm();
                            $(this).remove();
                        },
                        closeOnEscape: false,
                        buttons: [
                            {
                                class: 'newResourceConfirm',
                                text: 'Add Resource',
                                click: function() {
                                    if (previewXHR) { previewXHR.abort() };
                                    $('.uploadForm').submit();
                                }
                            },
                            {
                                text: 'Cancel',
                                click: function() {
                                    $(this).dialog('close');
                                }
                            }
                        ],
                        open: function( event, ui ) {
                            $('.newResourceConfirm').prop('disabled', true);
                        }
                    });


                }
            });

        });
    }


    /**
     * I calculate from the numeric bytesize a human readable string
     * @method bytesToSize
     * @param {Number} bytes
     * @return String
     */
    function bytesToSize(bytes) {
       var sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
       if (bytes == 0) return '0 Byte';
       var i = parseInt(Math.floor(Math.log(bytes) / Math.log(1024)));
       return Math.round(bytes / Math.pow(1024, i), 2) + ' ' + sizes[i];
    }



    /**
     * I perform some client-side validations on an URI input field
     * @method checkResourceInput
     * @param {String} uriValue
     * @param {String} nameValue
     * @param {String} thumbValue
     * @return
     */
    function checkResourceInput(uriValue, nameValue, thumbValue) {

        if ( uriValue.length > 3 ) {

            var newResource = null;

            var checkers = [
                function (src, name) {
                    // Wikipedia
                    var thumbSrc = (thumbValue) ? thumbValue : null;
                    var res = /wikipedia\.org\/wiki\//.exec(src);

                    if (res !== null) {
                        return createResource(src, "wikipedia", name, thumbSrc);
                    }
                    return null;
                },
                function (src, name) {
                    // Youtube
                    // Check various patterns
                    var yt_list = [ /youtube\.com\/watch\?v=([^\&\?\/]+)/,
                                    /youtube\.com\/embed\/([^\&\?\/]+)/,
                                    /youtube\.com\/v\/([^\&\?\/]+)/,
                                    /youtu\.be\/([^\&\?\/]+)/ ];
                    for (var i in yt_list) {
                        var res = yt_list[i].exec(src);
                        if (res !== null) {
                            var timeCode = /t=([0-9]*)/.exec(src),
                                tcString = (timeCode) ? '?start=' + timeCode[1] : '';
                            return createResource("//www.youtube.com/embed/" + res[1] + tcString,
                                                   "youtube", name, "http://img.youtube.com/vi/" + res[1] + "/2.jpg");
                        }
                    }
                    return null;
                },
                function (src, name) {
                    // Vimeo
                    var res = /^(http\:\/\/|https\:\/\/)?(www\.)?(vimeo\.com\/)([0-9]+)$/.exec(src);
                    if (res !== null) {
                        // Create the resource beforehand, so that we can update its thumb property asynchronously
                        var r = createResource("//player.vimeo.com/video/" + res[4], "vimeo", name);
                        $.ajax({
                            url: "http://vimeo.com/api/v2/video/" + res[4] + ".json",
                            async: false,
                            success: function (data) {
                                r.thumb = data[0].thumbnail_large;

                                var vimeoID = data[0].id.toString();

                                if (!r.name || r.name == vimeoID) {
                                    r.name = data[0].title;
                                }
                            }
                        });

                        return r;
                    } else {
                        return null;
                    }
                },
                function (src, name) {
                    // OpenStreeMap
                    var res = /www\.openstreetmap\.org.+#map=(\d+)\/([\d.]+)\/([\d.]+)/.exec(src);
                    if (res) {
                        var r = createResource("", "location", name);
                        r.attributes.lat = res[2];
                        r.attributes.lon = res[3];
                        return r;
                    }
                    res = /www\.openstreetmap\.org.+lat=([\d.]+).+lon=([\d.]+)/.exec(src);
                    if (res) {
                        var r = createResource("", "location", name);
                        r.attributes.lat = res[1];
                        r.attributes.lon = res[2];
                        return r;
                    }
                    return null;
                },
                function (src, name) {
                    // Image
                    if (/\.(gif|jpg|jpeg|png)$/i.exec(src)) {
                        return createResource(src, "image", name, src);
                    } else {
                        // We should do a HEAD request and check the
                        // content-type but it is not possible to do sync
                        // cross-domain requests, so we should return a
                        // Future value.
                        return null;
                    }
                    return null;
                },
                function (src, name) {
                    // Video
                    if (/\.(mp4|m3u8)$/i.exec(src)) {
                        return createResource(src, "video", name);
                    } else {
                        // We should do a HEAD request and check the
                        // content-type but it is not possible to do sync
                        // cross-domain requests, so we should return a
                        // Future value.
                        return null;
                    }
                    return null;
                },
                function (src, name) {
                    // Audio
                    var thumbSrc = (thumbValue) ? thumbValue : null;
                    if (/\.(mp3)$/i.exec(src)) {
                        return createResource(src, "audio", name, thumbSrc);
                    } else {
                        // We should do a HEAD request and check the
                        // content-type but it is not possible to do sync
                        // cross-domain requests, so we should return a
                        // Future value.
                        return null;
                    }
                    return null;
                },
                function (src, name) {
                    // PDF
                    var thumbSrc = (thumbValue) ? thumbValue : null;
                    if (/\.(pdf)/i.exec(src)) {
                        return createResource(src, "pdf", name, thumbSrc);
                    } else {
                        // We should do a HEAD request and check the
                        // content-type but it is not possible to do sync
                        // cross-domain requests, so we should return a
                        // Future value.
                        return null;
                    }
                    return null;
                },
                function (src, name) {
                    // Default fallback, will work for any URL
                    var thumbSrc = (thumbValue) ? thumbValue : null;
                    if (/(http|https):\/\/[\w-]+(\.[\w-]+)+([\w.,@?^=%&amp;:\/~+#-]*[\w@?^=%&amp;\/~+#-])/.exec(src)) {
                        var r = createResource(src, "webpage", name, thumbSrc);
                            //r.thumb = "http://immediatenet.com/t/l3?Size=1024x768&URL="+src;
                        return r;
                    }
                    return null;
                }
            ];

            for (var i in checkers) {
                newResource = checkers[i](uriValue, nameValue);
                if (newResource !== null) {
                    $('.resourceInputMessage').attr('class', 'resourceInputMessage message active success').text(labels['MessageURLValid'] +': '+ newResource.type);
                    renderWebsitePreview(uriValue, newResource.type, newResource);
                    return newResource;
                    break;
                } else {
                    $('.resourceInputMessage').attr('class', 'resourceInputMessage message active error').text(labels['MessageURLNotValid']);
                }
            }

        } else {
            // uri value length <= 3
        }

    }




    /**
     * I render a preview of a resource
     * @method renderWebsitePreview
     * @param {String} uriValue
     * @param {String} resourceType
     * @param {Object} resourceObj (optional)
     * @return
     */
    function renderWebsitePreview(uriValue, resourceType, resourceObj) {

        $('#resourceInputTabURL .resourceURLPreview').empty();
        $('.resourceInput[name="thumbnail"]').val('');
        $('.resourceInput[name="embed"]').val('');
        $('.uploadForm .corsWarning').removeClass('active');

        $('#resourceInputTabURL .resourceURLPreview').append('<div class="workingSpinner dark"></div>');

        if ( uriValue.length > 3 ) {

            if (previewXHR) { previewXHR.abort(); }

            if (resourceType == 'webpage' || resourceType == 'wikipedia') {
                previewXHR = $.ajax({
                    type:   'POST',
                    url:    '_server/ajaxServer.php',
                    cache:  false,
                    data: {
                        a:          'fileGetUrlInfo',
                        url: uriValue
                    }
                }).done(function(data) {

                    //console.log(data);
                    if (data.code == 0) {
                        if (data.urlInfo.image == 'https://en.wikipedia.org/static/apple-touch/wikipedia.png') {
                            data.urlInfo.image = null;
                        }
                        if (!data.urlInfo.title) {
                            data.urlInfo.title = '';
                        }
                        if (!data.urlInfo.description) {
                            data.urlInfo.description = '';
                        }
                        renderResourcePreviewElement(resourceType, data.urlInfo.title, data.urlInfo.image, data.urlInfo.description, data.embed);
                    } else if (data.code == 1) {
                        console.log(data.string);
                    }

                });
            } else {
                renderResourcePreviewElement(resourceType, resourceObj.name, resourceObj.description, resourceObj.thumb);
            }
            

        } else {
            // uri value length <= 3
        }

    }

    /**
     * I render the actual preview element
     * @method renderResourcePreviewElement
     * @param {String} resourceType
     * @param {String} resourceTitle
     * @param {String} resourceThumb
     * @param {String} resourceDescription
     * @param {String} embed (optional)
     * @return
     */
    function renderResourcePreviewElement(resourceType, resourceTitle, resourceThumb, resourceDescription, embed) {
        $('.resourceInput[name="thumbnail"]').val(resourceThumb);
        $('.resourceInput[name="embed"]').val(embed);

        if ($('.resourceNameInput').val().length < 3 && 
            resourceTitle != 'YouTube') {
            $('.resourceNameInput').val(resourceTitle);
            $('.resourceNameInput').trigger('change');
        }
        
        var previewTitle = ($('.resourceNameInput').val().length > 3) ? $('.resourceNameInput').val() : resourceTitle;
        var previewImageString = (resourceThumb) ? 'background-image:url('+ resourceThumb +')' : '';
        
        var previewElem = $('<div class="resourceThumb" data-type="'+ resourceType +'" style="'+ previewImageString +'">'
                           +'    <div class="resourceOverlay">'
                           +'    </div>'
                           +'    <div class="resourceTitle">'+ previewTitle +'</div>'
                           +'</div>');
        
        $('#resourceInputTabURL .resourceURLPreview .resourceThumb').remove();
        $('#resourceInputTabURL .resourceURLPreview').append(previewElem);

        if (embed && embed == 'forbidden') {
            $('.uploadForm .corsWarning').addClass('active');
        } else {
            $('.uploadForm .corsWarning').removeClass('active');
        }

        $('#resourceInputTabURL .resourceURLPreview .workingSpinner').remove();
    }


    /**
     * PLEASE DOCUMENT THIS.
     *
     *
     * @method createResource
     * @param {} src
     * @param {} type
     * @param {} name
     * @param {} thumb
     * @return r
     */
    function createResource(src, type, name, thumb) {
        var r = {};
        r.src = src;
        r.type = type;
        r.name = name;
        if (! r.name) {
            // Use the url basename.
            r.name = src.replace(/^(\w+:)?\/\/([^\/]+\/?).*$/,'$2').replace(/www./g, "").replace(/_/g, " ").replace(/-/g, " ").replace(/\//g, "");
        }
        r.thumb = thumb;
        r.attributes = {};
        if ($('.resourceInput[name="embed"]').val() == 'forbidden') {
            r.attributes['embed'] = 'forbidden';
        }
        return r;
    }



	/**
	 * I delete a resource from the server.
	 *
	 * @method deleteResource
	 * @param {String} resourceID
	 * @param {Function} successCallback
	 * @param {Function} cancelCallback
	 */
	function deleteResource(resourceID, successCallback, cancelCallback) {

		$.ajax({
			type:   'POST',
			url:    '_server/ajaxServer.php',
			cache:  false,
			data: {
				a: 			'fileDelete',
				resourcesID: resourceID
			}
		}).done(function(data) {

			if (data.code === 0) {
				successCallback();
			} else {
				cancelCallback(data);
			}

		});

	};




	/**
	 * I render a list of thumbnails for either all resource items,
	 * or a narrowed down set of them.
	 *
	 * The targetElement should be a &lt;div&gt; or likewise, and will afterwards contain
	 * the elements which were rendered from e.g. {{#crossLink "ResourceImage/renderThumb:method"}}ResourceImage/renderThumb{{/crossLink}}
	 *
	 * If filter is true, then the method will ask the server only for a list of resources which meet the key-condition-value requirements (e.g. "type" "==" "video"). See also server docs!
	 *
	 * @method renderList
	 * @param {HTMLElement} targetElement
	 * @param {Boolean} filter
	 * @param {String} key
	 * @param {String} condition
	 * @param {String} value
	 */
	function renderList(targetElement, filter, key, condition, value) {

		targetElement.empty();
		targetElement.append('<div class="loadingScreen"><div class="workingSpinner dark"></div></div>');


		if (filter) {

			getFilteredList(targetElement, key, condition, value)

		} else {

			getCompleteList(targetElement)

		}


	};




	/**
	 * I call the .renderThumb method for all Resource data objects in the array
	 * (e.g. {{#crossLink "ResourceImage/renderThumb:method"}}ResourceImage/renderThumb{{/crossLink}})
	 * and append the returned element to targetElement.
	 *
	 * @method renderResult
	 * @param {HTMLElement} targetElement
	 * @param {Array} array
	 * @private
	 */
	function renderResult(targetElement, array) {

		for (var id in array) {

			var resourceThumb = FrameTrail.newObject(
				(	'Resource'
				  + array[id].type.charAt(0).toUpperCase()
				  + array[id].type.slice(1)),
				array[id]
			).renderThumb(id);

            //add thumb to target element
			targetElement.append(resourceThumb);

		}

	};



    /**
	 * I am the method choosen, when {{#crossLink "ResourceManager/renderList:method"}}ResourceManager/renderList{{/crossLink}} is called
	 * with filter set to false.
	 *
	 * I update the {{#crossLink "Database/resources:attribute"}}resource database{{/crossLink}} and the render the result into the targetElement
	 *
	 * @method getCompleteList
	 * @param {HTMLElement} targetElement
	 * @private
	 */
	function getCompleteList(targetElement) {

		var database = FrameTrail.module('Database');

		database.loadResourceData(

			function(){

	    		renderResult(targetElement, database.resources);

				targetElement.find('.loadingScreen').fadeOut(600, function() {
                    $(this).remove();
                });

			},

			function(errorMessage){

				targetElement.find('.loadingScreen').remove();
				targetElement.append('<div class="loadingErrorMessage"><div class="message error active">' + errorMessage + '</div></div>');

			}

		);

	}



	/**
	 * I am the method choosen, when {{#crossLink "ResourceManager/renderList:method"}}ResourceManager/renderList{{/crossLink}} is called
	 * with filter set to true.
	 *
	 * The server will be asked to return a list of resources, which meet the requierements specified with key, considition, value
	 * (e.g. "type" "==" "video" ). See the server docs for more details!
	 *
	 * @method getFilteredList
	 * @param {HTMLElement} targetElement
	 * @param {String} key
	 * @param {String} condition
	 * @param {Array} values
	 * @private
	 */
	function getFilteredList(targetElement, key, condition, values) {

		$.ajax({

            type:   'POST',
            url:    '_server/ajaxServer.php',
            cache:  false,

            data: {
            	a: 			'fileGetByFilter',
            	key: 		key,
            	condition: 	condition,
            	values: 	values
            }

        }).done(function(data){

        	if (data.code === 0) {

        		renderResult(targetElement, data.result)

        	}

			targetElement.find('.loadingScreen').fadeOut(600, function() {
                $(this).remove();
            });


		}).fail(function(errorMessage){

			targetElement.find('.loadingScreen').remove();
			targetElement.append('<div class="loadingErrorMessage"><div class="message error active">' + errorMessage + '</div></div>');

		});

	}




	/**
	 * I render into the targetElement, which should be a &lt;div&gt; or likewise, a set of thumbnails.
	 * These thumbnails are draggable in the &lt;div class="mainContainer"&gt; to allow drop actions into timelines or into the overlay container.
	 *
	 * @method renderResourcePicker
	 * @param {HTMLElement} targetElement
	 */
	function renderResourcePicker(targetElement) {

		var resourceDatabase 	= FrameTrail.module('Database').resources,
			container		 	= $(	'<div class="resourcePicker">'
									  + '    <div class="resourcePickerControls">'
									  //+ '        <button class="manageResourcesButton">Manage Resources</button>'
                                      + '        <button class="addResourcesButton" data-tooltip-right="'+ labels['ResourceAddNew'] +'"><span class="icon-doc-new"></span></button>'
									  + '    </div>'
									  + '    <div class="resourcePickerList"></div>'
									  + '</div>'),
			resourceList 		= container.find('.resourcePickerList'),
			resourceThumb;

		container.find('.addResourcesButton').click(function() {

            FrameTrail.module('ResourceManager').uploadResource(function(){

                FrameTrail.module('Database').loadResourceData(function() {
                    targetElement.empty();
                    renderResourcePicker(targetElement);
                });

            });

		});

		for (var i in resourceDatabase) {

			resourceThumb = FrameTrail.newObject(
				(	'Resource'
				  + resourceDatabase[i].type.charAt(0).toUpperCase()
				  + resourceDatabase[i].type.slice(1)),
				resourceDatabase[i]
			).renderThumb();



			resourceThumb.draggable({
				containment: 	'.mainContainer',
				helper: 		'clone',
				revert: 		'invalid',
				revertDuration: 100,
				appendTo: 		'body',
				distance: 		10,
				zIndex: 		1000,

				start: function( event, ui ) {
					ui.helper.css({
						top: $(event.currentTarget).offset().top + "px",
						left: $(event.currentTarget).offset().left + "px",
						width: $(event.currentTarget).width() + "px",
						height: $(event.currentTarget).height() + "px"
					});
					$(event.currentTarget).addClass('dragPlaceholder');
				},

				stop: function( event, ui ) {
					$(event.target).removeClass('dragPlaceholder');
				}

			});

			resourceList.append(resourceThumb);

		}


		targetElement.append(container);

	}


	return {

		renderList: 			renderList,
		renderResourcePicker: 	renderResourcePicker,

		updateResourceDatabase: updateResourceDatabase,
		uploadResource: 		uploadResource,
		deleteResource: 		deleteResource

	};


});
