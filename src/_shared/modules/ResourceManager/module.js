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

    var previewController,
        uploadQueue = [],
        completedUploads = [],
        isUploading = false,
        currentUploadDialog = null,
        currentUploadDialogCtrl = null,
        currentSuccessCallback = null,
        serverCapabilities = {
            maxUploadBytes: 500 * 1024 * 1024,
            ffmpegAvailable: false
        },
        openverseSelectedItem = null,
        openverseAbortCtrl = null;


    /**
     * Add a resource entry to the local _index.json and optionally store a file.
     * @method addResourceLocally
     * @param {Object} resourceObj - The resource data object (src, type, name, thumb, attributes, etc.)
     * @param {File|Blob} [fileBlob] - Optional file to store in resources/
     * @param {String} [thumbDataUrl] - Optional base64 data URL for thumbnail
     * @return {Promise<Object>} The response with resId and resource
     * @private
     */
    function addResourceLocally(resourceObj, fileBlob, thumbDataUrl) {
        var adapter = FrameTrail.module('StorageManager').getAdapter();
        var userInfo = adapter.userInfo;

        // Fill in creator info
        resourceObj.creator = userInfo.name || 'Local User';
        resourceObj.creatorId = userInfo.id || 'local';
        resourceObj.created = Math.floor(Date.now() / 1000);

        return adapter.readJSON('resources/_index.json').catch(function() {
            return { 'resources-increment': 0, 'resources': {} };
        }).then(function(indexData) {
            if (!indexData['resources-increment']) {
                indexData['resources-increment'] = 0;
            }
            indexData['resources-increment']++;
            var newId = indexData['resources-increment'];
            indexData['resources'][newId] = resourceObj;

            var tasks = [adapter.writeJSON('resources/_index.json', indexData)];

            // Store file if provided
            if (fileBlob && resourceObj.src && resourceObj.type !== 'url') {
                tasks.push(adapter.writeFile('resources/' + resourceObj.src, fileBlob));
            }

            // Store thumbnail if provided as data URL
            if (thumbDataUrl && resourceObj.thumb) {
                tasks.push(adapter.writeDataUrl('resources/' + resourceObj.thumb, thumbDataUrl));
            }

            return Promise.all(tasks).then(function() {
                return { resId: newId, resource: resourceObj };
            });
        });
    }

    /**
     * Upload a single file locally via File System Access API.
     * @method uploadSingleFileLocally
     * @param {File} file
     * @param {String} type
     * @param {String|null} thumbDataUrl - base64 thumbnail data URL, or null
     * @param {Function} callback - callback(success, errorMessage)
     * @private
     */
    function uploadSingleFileLocally(file, type, thumbDataUrl, callback) {
        var fileName = file.name.replace(/\.[^/.]+$/, ''); // Remove extension
        var fileExt = file.name.split('.').pop().toLowerCase();
        var timestamp = Date.now();
        var adapter = FrameTrail.module('StorageManager').getAdapter();
        var userInfo = adapter.userInfo;
        var userId = userInfo.id || 'local';
        var storedName = (userId + '_' + timestamp + '_' + sanitizeFilename(fileName)).substring(0, 90) + '.' + fileExt;

        var resourceObj = {
            name: fileName,
            src: storedName,
            type: type,
            attributes: {}
        };

        // For video, force .mp4 extension in stored name
        if (type === 'video') {
            storedName = (userId + '_' + timestamp + '_' + sanitizeFilename(fileName)).substring(0, 90) + '.mp4';
            resourceObj.src = storedName;
        }

        // For audio, force .mp3 extension
        if (type === 'audio') {
            storedName = (userId + '_' + timestamp + '_' + sanitizeFilename(fileName)).substring(0, 90) + '.mp3';
            resourceObj.src = storedName;
        }

        // Assign thumbnail filename if provided
        if (thumbDataUrl) {
            resourceObj.thumb = (userId + '_' + timestamp + '_thumb_' + sanitizeFilename(fileName)).substring(0, 90) + '.png';
        }

        addResourceLocally(resourceObj, file, thumbDataUrl).then(function() {
            callback(true);
        }).catch(function(err) {
            callback(false, 'Local save failed: ' + err.message);
        });
    }

    /**
     * Sanitize a filename for local storage.
     * @method sanitizeFilename
     * @param {String} name
     * @return {String}
     * @private
     */
    function sanitizeFilename(name) {
        return name.replace(/[^a-zA-Z0-9_\-]/g, '_');
    }

    /**
     * I tell the {{#crossLink "Database/loadResourceData:method"}}Database{{/crossLink}} to reload the index data.
     * @method updateResourceDatabase
     */
    function updateResourceDatabase() {

        FrameTrail.module('Database').loadResourceData();

    };



    // Domains that actively block meaningful metadata (CDN-locked images, login walls, generic titles).
    // These URLs cannot be embedded AND produce no useful preview, so we block adding them entirely.
    var EMBED_BLOCKLIST = ['instagram.com', 'facebook.com', 'fb.com', 'threads.net', 'linkedin.com'];

    function isEmbedBlocklisted(url) {
        try {
            var hostname = new URL(url).hostname.replace(/^www\./, '');
            return EMBED_BLOCKLIST.some(function(domain) {
                return hostname === domain || hostname.slice(-(domain.length + 1)) === '.' + domain;
            });
        } catch(e) { return false; }
    }

    //Check for valid URL
    var previewTimeout = null;
    ['input'].forEach(function(ev) {
        document.addEventListener(ev, function(evt) {
            if (!evt.target.matches || !evt.target.matches('#resourceInputTabURL input')) { return; }
            clearTimeout(previewTimeout);
            previewTimeout = setTimeout(function() {
                var previewEl = document.querySelector('#resourceInputTabURL .resourceURLPreview');
                if (previewEl) { previewEl.innerHTML = ''; }
                var thumbEl = document.querySelector('.resourceInput[name="thumbnail"]');
                if (thumbEl) { thumbEl.value = ''; }
                var urlInput = document.querySelector('#resourceInputTabURL input');
                var nameInput = document.querySelector('.resourceNameInput');
                checkResourceInput(urlInput ? urlInput.value : '', nameInput ? nameInput.value : '');
            }, 800);
            evt.stopPropagation();
        });
    });

    //Check for Name Length
    ['change', 'paste', 'keyup', 'input'].forEach(function(ev) {
        document.addEventListener(ev, function(evt) {
            if (!evt.target.matches || !evt.target.matches('.resourceNameInput')) { return; }
            var confirmBtn = document.querySelector('.newResourceConfirm');
            if (confirmBtn) { confirmBtn.disabled = evt.target.value.length <= 2; }
            var previewTitle = document.querySelector('.resourceURLPreview .resourceTitle');
            if (previewTitle) { previewTitle.textContent = evt.target.value; }
            evt.stopPropagation();
        });
    });



    /**
     * Detect resource type from file object.
     * Only MP4 and MP3 are accepted output formats. Other video/audio formats
     * are allowed only when FFmpeg is available on the server for transcoding.
     * @method detectResourceType
     * @param {File} file
     * @return {Object} {type: string, needsTranscoding: boolean, canUpload: boolean, error: string}
     */
    function detectResourceType(file) {
        var mimeType = file.type;
        var fileName = file.name.toLowerCase();
        var result = {
            type: null,
            needsTranscoding: false,
            canUpload: true,
            error: null
        };

        // Image detection
        if (mimeType.indexOf('image/') === 0 || /\.(jpg|jpeg|png|gif)$/i.test(fileName)) {
            result.type = 'image';
            return result;
        }

        // PDF detection
        if (mimeType === 'application/pdf' || /\.pdf$/i.test(fileName)) {
            result.type = 'pdf';
            return result;
        }

        // Video detection
        if (mimeType.indexOf('video/') === 0 || /\.(mp4|mov|avi|webm|m4v|mkv|flv)$/i.test(fileName)) {
            result.type = 'video';
            if (mimeType === 'video/mp4' || /\.mp4$/i.test(fileName)) {
                result.needsTranscoding = false;
            } else {
                result.needsTranscoding = true;
                if (serverCapabilities.ffmpegAvailable) {
                    result.canUpload = true;
                } else {
                    result.canUpload = false;
                    result.error = labels['ErrorVideoFileFormat'] + ' (' + file.name + ')';
                }
            }
            return result;
        }

        // Audio detection
        if (mimeType.indexOf('audio/') === 0 || /\.(mp3|wav|ogg|m4a|aac)$/i.test(fileName)) {
            result.type = 'audio';
            if (mimeType === 'audio/mp3' || mimeType === 'audio/mpeg' || /\.mp3$/i.test(fileName)) {
                result.needsTranscoding = false;
            } else {
                result.needsTranscoding = true;
                if (serverCapabilities.ffmpegAvailable) {
                    result.canUpload = true;
                } else {
                    result.canUpload = false;
                    result.error = labels['ErrorAudioFileFormat'] + ' (' + file.name + ')';
                }
            }
            return result;
        }

        // Unknown type
        result.canUpload = false;
        result.error = labels['ErrorUnsupportedFileType'] + ': ' + file.name;
        return result;
    }

    /**
     * Generate a thumbnail from a File object before uploading.
     * Returns a Promise that resolves with a base64 PNG data URL, or null if not possible.
     * @method generateThumbnailFromFile
     * @param {File} file
     * @param {String} type - 'image', 'video', 'pdf', or 'audio'
     * @return {Promise<String|null>}
     * @private
     */
    function generateThumbnailFromFile(file, type) {
        return new Promise(function(resolve) {

            if (type === 'image') {
                var blobUrl = URL.createObjectURL(file);
                var img = new Image();
                img.onload = function() {
                    var maxW = 600;
                    var w = Math.min(img.naturalWidth, maxW);
                    var h = Math.round(img.naturalHeight * (w / img.naturalWidth));
                    var canvas = document.createElement('canvas');
                    canvas.width = w;
                    canvas.height = h;
                    canvas.getContext('2d').drawImage(img, 0, 0, w, h);
                    URL.revokeObjectURL(blobUrl);
                    try { resolve(canvas.toDataURL('image/png')); } catch(e) { resolve(null); }
                };
                img.onerror = function() { URL.revokeObjectURL(blobUrl); resolve(null); };
                img.src = blobUrl;

            } else if (type === 'video') {
                var blobUrl = URL.createObjectURL(file);
                var video = document.createElement('video');
                video.style.cssText = 'position:absolute;visibility:hidden;';
                document.body.appendChild(video);

                video.addEventListener('loadedmetadata', function() {
                    video.currentTime = video.duration / 2;
                });
                video.addEventListener('seeked', function() {
                    var maxW = 600;
                    var vw = video.videoWidth || maxW;
                    var vh = video.videoHeight || 225;
                    var w = Math.min(vw, maxW);
                    var h = Math.round(vh * (w / vw));
                    var canvas = document.createElement('canvas');
                    canvas.width = w;
                    canvas.height = h;
                    canvas.getContext('2d').drawImage(video, 0, 0, w, h);
                    document.body.removeChild(video);
                    URL.revokeObjectURL(blobUrl);
                    try { resolve(canvas.toDataURL('image/png')); } catch(e) { resolve(null); }
                });
                video.addEventListener('error', function() {
                    document.body.removeChild(video);
                    URL.revokeObjectURL(blobUrl);
                    resolve(null);
                });
                video.src = blobUrl;

            } else {
                // Audio and other types: no thumbnail
                resolve(null);
            }

        });
    }

    /**
     * Process upload queue - generates thumbnail then uploads, one file at a time
     * @method processUploadQueue
     * @private
     */
    function processUploadQueue() {
        if (isUploading || uploadQueue.length === 0) {
            return;
        }

        isUploading = true;
        var queueItem = uploadQueue[0];

        queueItem.status = 'generating-thumb';
        updateQueueUI();

        // Generate thumbnail from the file before uploading
        generateThumbnailFromFile(queueItem.file, queueItem.type).then(function(thumbDataUrl) {
            queueItem.thumb = thumbDataUrl;
            queueItem.status = 'uploading';
            updateQueueUI();

            var isLocal = (['local', 'static'].indexOf(FrameTrail.getState('storageMode')) !== -1);
            var uploadFn = isLocal ? uploadSingleFileLocally : uploadSingleFile;

            uploadFn(queueItem.file, queueItem.type, queueItem.thumb, function(success, error) {
                if (success) {
                    queueItem.status = 'completed';
                } else {
                    queueItem.status = 'error';
                    queueItem.error = error;
                }

                completedUploads.push(uploadQueue.shift());
                isUploading = false;
                updateQueueUI();

                if (uploadQueue.length > 0) {
                    setTimeout(processUploadQueue, 100);
                } else {
                    finishBatchUpload();
                }
            });
        });
    }

    /**
     * Update the queue UI display
     * @method updateQueueUI
     * @private
     */
    function updateQueueUI() {
        if (!currentUploadDialog) return;

        var queueContainer = currentUploadDialog.querySelector('.uploadQueue');
        if (!queueContainer) return;

        queueContainer.innerHTML = '';

        var completed = 0;
        var failed = 0;

        // Combine completed and pending uploads for display
        var allItems = completedUploads.concat(uploadQueue);

        allItems.forEach(function(item, index) {
            var statusClass = item.status || 'pending';
            var statusText = item.status === 'error' ? (item.error || 'Failed') :
                             item.status === 'completed' ? 'Completed' :
                             item.status === 'uploading' ? 'Uploading...' :
                             item.status === 'generating-thumb' ? 'Preparing...' : 'Pending';

            if (item.status === 'completed') completed++;
            if (item.status === 'error') failed++;

            var _rw = document.createElement('div');
            _rw.innerHTML = '<div class="queueRow ' + statusClass + '">' +
                             '<span class="fileName">' + item.file.name + '</span>' +
                             '<span class="fileSize">' + bytesToSize(item.file.size) + '</span>' +
                             '<span class="fileType">' + (item.type || '?') + '</span>' +
                             '<span class="status">' + statusText + '</span>' +
                             '</div>';
            queueContainer.appendChild(_rw.firstElementChild);
        });

        // Update summary
        var summary = currentUploadDialog.querySelector('.queueSummary');
        if (summary) {
            var total = allItems.length;
            summary.textContent = 'Uploading: ' + completed + ' of ' + total + ' files' +
                        (failed > 0 ? ' (' + failed + ' failed)' : '');
        }
    }

    /**
     * Finish batch upload and reload resources
     * @method finishBatchUpload
     * @private
     */
    function finishBatchUpload() {
        FrameTrail.module('Database').loadResourceData(function() {
            if (currentUploadDialog && currentUploadDialogCtrl) {
                currentUploadDialog.querySelector('.queueSummary').textContent = 'All uploads complete!';

                var buttons = currentUploadDialogCtrl.getButtons();
                buttons[0].text = 'Close';
                currentUploadDialogCtrl.setButtons(buttons);
                currentUploadDialogCtrl.widget().querySelector('.newResourceConfirm').disabled = false;

                // Call success callback if provided
                if (currentSuccessCallback) {
                    currentSuccessCallback.call();
                }
            }
        });
    }

    /**
     * Upload a single file to the server.
     * @method uploadSingleFile
     * @param {File} file
     * @param {String} type - detected file type ('image', 'video', 'audio', 'pdf')
     * @param {String|null} thumbDataUrl - base64 thumbnail PNG data URL, or null
     * @param {Function} callback - callback(success, errorMessage)
     * @private
     */
    function uploadSingleFile(file, type, thumbDataUrl, callback) {
        var fileName = file.name.replace(/\.[^/.]+$/, ''); // Remove extension

        var adapter = FrameTrail.module('StorageManager').getAdapter();
        var dataPath = (adapter && adapter.dataPathAbsolute) ? adapter.dataPathAbsolute : '';

        var formData = new FormData();
        formData.append('a', 'fileUpload');
        formData.append('name', fileName);
        formData.append('type', type);
        formData.append('file', file); // Unified field — PHP auto-detects type from MIME
        formData.append('dataPath', dataPath);

        if (thumbDataUrl) {
            formData.append('thumb', thumbDataUrl);
        }

        var xhr = new XMLHttpRequest();
        xhr.upload.addEventListener('progress', function(e) {
            if (e.lengthComputable && currentUploadDialog) {
                var pct = Math.round((e.loaded / e.total) * 100);
                currentUploadDialog.querySelector('.uploadProgressBar').style.width = pct + '%';
            }
        });
        xhr.onload = function() {
            var response;
            try { response = JSON.parse(xhr.responseText); } catch(e) { callback(false, 'Network error'); return; }
            if (response.code === 0) {
                callback(true);
            } else {
                callback(false, response.string || 'Upload failed');
            }
        };
        xhr.onerror = function() { callback(false, 'Network error'); };
        xhr.open('POST', '_server/ajaxServer.php');
        xhr.send(formData);
    }

    /**
     * I open a jquery UI dialog, which allows the user to upload a new resource.
     * Three tabs: Paste URL, Upload Files, Add Map.
     *
     * @method uploadResource
     * @param {Function} successCallback
     * @param {Boolean} onlyVideo - if true, only video uploads are allowed (for hypervideo creation)
     */
    function uploadResource(successCallback, onlyVideo) {
        FrameTrail.module('UserManagement').ensureAuthenticated(function(){

            var isLocalMode = (['local', 'static'].indexOf(FrameTrail.getState('storageMode')) !== -1);

            function showUploadDialog() {

                    // Build format badge text based on server capabilities
                    var formatBadgeText = '.jpg · .jpeg · .png · .gif · .pdf · .mp4 · .mp3';
                    if (serverCapabilities.ffmpegAvailable && !isLocalMode) {
                        formatBadgeText += ' · .mov · .avi · .webm · .m4v · .mkv · .flv · .wav · .ogg · .m4a · .aac';
                    }

                    var fileAccept = onlyVideo ? 'video/*' : '*/*';

                    var uploadDialogCtrl;
                    var _udw = document.createElement('div');
                    _udw.innerHTML = '<div class="uploadDialog">'
                                        + '    <div class="resourceInputTabContainer">'
                                        + '        <ul class="resourceInputTabList">'
                                        + (onlyVideo ? '' : '            <li data-type="url"><a href="#resourceInputTabURL">'+ labels['ResourcePasteURL'] +'</a></li>')
                                        + '            <li data-type="file"><a href="#resourceInputTabFile">'+ labels['ResourceUploadFiles'] +'</a></li>'
                                        + (onlyVideo ? '' : '            <li data-type="map"><a href="#resourceInputTabMap">'+ labels['ResourceAddMap'] +'</a></li>')
                                        + (onlyVideo ? '' : '            <li data-type="search"><a href="#resourceInputTabSearch">Search Images</a></li>')
                                        + '        </ul>'
                                        + (onlyVideo ? '' :
                                              '        <div id="resourceInputTabURL">'
                                            + '            <div class="resourceInputMessage message active">'+ labels['MessagePasteAnyURL'] +'</div>'
                                            + '            <input type="text" name="url" placeholder="URL" class="resourceInput">'
                                            + '            <input type="hidden" name="thumbnail" class="resourceInput">'
                                            + '            <input type="hidden" name="embed" class="resourceInput">'
                                            + '            <div class="corsWarning message error">'+ labels['MessageEmbedNotAllowed'] +'</div>'
                                            + '            <div class="resourceURLPreview"></div>'
                                            + '        </div>'
                                        )
                                        + '        <div id="resourceInputTabFile">'
                                        + '            <div class="dropZone">'
                                        + '                <div class="dropZoneContent">'
                                        + '                    <p><span class="icon-upload"></span>'+ labels['MessageDropFilesHere'] +'</p>'
                                        + '                    <button type="button" class="chooseFilesBtn">'+ labels['MessageChooseFiles'] +'</button>'
                                        + '                    <input type="file" class="hiddenFileInput" accept="'+ fileAccept +'" multiple style="display:none">'
                                        + '                </div>'
                                        + '                <div class="formatBadge">'+ formatBadgeText +'</div>'
                                        + '            </div>'
                                        + '            <div class="uploadQueue"></div>'
                                        + '            <div class="queueSummary"></div>'
                                        + '            <div class="uploadProgressBarWrap"><div class="uploadProgressBar"></div></div>'
                                        + '        </div>'
                                        + (onlyVideo ? '' :
                                              '        <div id="resourceInputTabMap">'
                                            + '            <div class="locationSearchWrapper">'
                                            + '                <input type="text" name="locationQ" class="locationQ" placeholder="'+ labels['LocationSearch'] +'">'
                                            + '                <span class="locationSearchCopyright">Data \u00a9 OpenStreetMap contributors, ODbL 1.0.</span>'
                                            + '                <ul class="locationSearchSuggestions"></ul>'
                                            + '            </div>'
                                            + '            <input type="text" name="lat" placeholder="latitude">'
                                            + '            <input type="text" name="lon" placeholder="longitude">'
                                            + '            <input type="hidden" name="boundingBox[]" class="BB1">'
                                            + '            <input type="hidden" name="boundingBox[]" class="BB2">'
                                            + '            <input type="hidden" name="boundingBox[]" class="BB3">'
                                            + '            <input type="hidden" name="boundingBox[]" class="BB4">'
                                            + '        </div>'
                                        )
                                        + (onlyVideo ? '' :
                                              '        <div id="resourceInputTabSearch">'
                                            + '            <div class="openverseSearchBar">'
                                            + '                <input type="text" name="openverseQ" placeholder="Search open-licensed images\u2026">'
                                            + '                <div class="custom-select">'
                                            + '                    <select name="openverseLicense">'
                                            + '                        <option value="">All Open Licenses</option>'
                                            + '                        <option value="cc0">CC0 / Public Domain</option>'
                                            + '                        <option value="by">CC BY</option>'
                                            + '                        <option value="by-sa">CC BY-SA</option>'
                                            + '                        <option value="by-nd">CC BY-ND</option>'
                                            + '                        <option value="by-nc">CC BY-NC</option>'
                                            + '                        <option value="by-nc-sa">CC BY-NC-SA</option>'
                                            + '                        <option value="by-nc-nd">CC BY-NC-ND</option>'
                                            + '                    </select>'
                                            + '                </div>'
                                            + '                <button type="button" class="openverseSearchBtn">Search</button>'
                                            + '            </div>'
                                            + '            <div class="openverseResults"></div>'
                                            + '            <p class="openverseAttribution">Images via <a href="https://openverse.org" target="_blank" rel="noopener">Openverse</a></p>'
                                            + '        </div>'
                                        )
                                        + '    </div>'
                                        + '    <div class="nameInputContainer"' + (onlyVideo ? ' style="display:none"' : '') + '>'
                                        + '        <div class="nameInputMessage">Name</div>'
                                        + '        <input type="text" name="name" placeholder="'+ labels['MessageNewResourceName'] +'" class="resourceNameInput">'
                                        + '    </div>'
                                        + '</div>';
                    var uploadDialog = _udw.firstElementChild;

                    // Store reference to current dialog and callback
                    currentUploadDialog = uploadDialog;
                    currentSuccessCallback = successCallback;

                    // ---- Drop Zone & File Picker ----
                    var dropZone = uploadDialog.querySelector('.dropZone');

                    dropZone.addEventListener('dragover', function(e) {
                        e.preventDefault();
                        e.stopPropagation();
                        dropZone.classList.add('dragover');
                    });

                    dropZone.addEventListener('dragleave', function(e) {
                        e.preventDefault();
                        e.stopPropagation();
                        dropZone.classList.remove('dragover');
                    });

                    dropZone.addEventListener('drop', function(e) {
                        e.preventDefault();
                        e.stopPropagation();
                        dropZone.classList.remove('dragover');
                        var files = e.dataTransfer.files;
                        if (files.length > 0) { handleFilesDrop(files); }
                    });

                    uploadDialog.querySelector('.chooseFilesBtn').addEventListener('click', function(e) {
                        e.stopPropagation();
                        var _hfi = uploadDialog.querySelector('.hiddenFileInput');
                        _hfi.value = '';
                        _hfi.click();
                    });

                    uploadDialog.querySelector('.hiddenFileInput').addEventListener('change', function() {
                        if (this.files.length > 0) { handleFilesDrop(this.files); }
                    });

                    function handleFilesDrop(files) {
                        uploadQueue = [];
                        completedUploads = [];
                        var errors = [];

                        for (var i = 0; i < files.length; i++) {
                            var file = files[i];
                            if (onlyVideo) {
                                // Restrict to video types when onlyVideo is set
                                if (!file.type || file.type.indexOf('video/') !== 0) {
                                    errors.push(labels['ErrorChooseVideoFile'] + ': ' + file.name);
                                    continue;
                                }
                            }
                            if (file.size > serverCapabilities.maxUploadBytes) {
                                errors.push(file.name + ': ' + labels['ErrorFileSize'] + ' (max ' + bytesToSize(serverCapabilities.maxUploadBytes) + ')');
                                continue;
                            }
                            var detection = detectResourceType(file);
                            if (!detection.canUpload) {
                                errors.push(detection.error);
                                continue;
                            }
                            uploadQueue.push({ file: file, type: detection.type, status: 'pending', error: null, thumb: null });
                        }

                        uploadDialog.querySelectorAll('.message.error').forEach(function(el) { el.remove(); });
                        if (errors.length > 0) {
                            uploadDialog.querySelector('#resourceInputTabFile').insertAdjacentHTML('beforeend', '<div class="message active error">' + errors.join('<br>') + '</div>');
                        }

                        if (uploadQueue.length > 0) {
                            uploadDialog.querySelector('.uploadQueue').style.display = 'block';
                            uploadDialog.querySelector('.queueSummary').style.display = 'block';
                            updateQueueUI();
                            setTimeout(function() {
                                var buttons = uploadDialogCtrl.getButtons();
                                buttons[0].text = labels['ResourceUploadStart'] || 'Start Upload';
                                uploadDialogCtrl.setButtons(buttons);
                                uploadDialogCtrl.widget().querySelector('.newResourceConfirm').disabled = false;
                            }, 50);
                        }
                    }

                    // ---- Map tab: Nominatim location search ----
                    if (!onlyVideo) uploadDialog.querySelector('.locationQ').addEventListener('keyup', function() {
                        fetch('https://nominatim.openstreetmap.org/search?q=' + encodeURIComponent(this.value) + '&format=json')
                            .then(function(r) { return r.json(); })
                            .then(function(respText) {
                                var sugg = uploadDialog.querySelector('.locationSearchSuggestions');
                                sugg.innerHTML = '';
                                sugg.style.display = 'block';
                                for (var i = 0; i < respText.length; i++) {
                                    var loc = respText[i];
                                    var li = document.createElement('li');
                                    li.textContent = loc.display_name;
                                    li._locData = loc;
                                    li.addEventListener('click', function() {
                                        var d = this._locData;
                                        uploadDialog.querySelector('input[name="lon"]').value = d.lon;
                                        uploadDialog.querySelector('input[name="lat"]').value = d.lat;
                                        uploadDialog.querySelector('input.BB1').value = d.boundingbox[0];
                                        uploadDialog.querySelector('input.BB2').value = d.boundingbox[1];
                                        uploadDialog.querySelector('input.BB3').value = d.boundingbox[2];
                                        uploadDialog.querySelector('input.BB4').value = d.boundingbox[3];
                                        uploadDialog.querySelector('input[name="name"]').value = d.display_name;
                                        sugg.style.display = 'none';
                                        uploadDialogCtrl.widget().querySelector('.newResourceConfirm').disabled = false;
                                    });
                                    sugg.appendChild(li);
                                }
                            });
                    });

                    // ---- Search Images tab: Openverse ----
                    if (!onlyVideo) {
                        uploadDialog.querySelector('.openverseSearchBtn').addEventListener('click', function() {
                            var q = uploadDialog.querySelector('input[name="openverseQ"]').value.trim();
                            var lic = uploadDialog.querySelector('select[name="openverseLicense"]').value;
                            if (!q) { return; }
                            searchOpenverse(buildOpenverseUrl(q, lic), false);
                        });

                        uploadDialog.querySelector('input[name="openverseQ"]').addEventListener('keydown', function(e) {
                            if (e.key === 'Enter') { uploadDialog.querySelector('.openverseSearchBtn').click(); }
                        });

                        uploadDialog.querySelector('select[name="openverseLicense"]').addEventListener('change', function() {
                            var q = uploadDialog.querySelector('input[name="openverseQ"]').value.trim();
                            if (!q) { return; }
                            searchOpenverse(buildOpenverseUrl(q, this.value), false);
                        });

                    }

                    // ---- Tabs ----
                    FTTabs(uploadDialog.querySelector('.resourceInputTabContainer'), {
                        activate: function(e, ui) {
                            uploadDialog.querySelectorAll('.message.error').forEach(function(el) { el.remove(); });
                            var tabType = ui.newTab.dataset.type;
                            var buttons = uploadDialogCtrl.getButtons();
                            if (tabType === 'url') {
                                uploadDialog.querySelector('.nameInputContainer').style.display = '';
                                buttons[0].text = labels['ResourceAddNew'] || 'Add Resource';
                                uploadDialogCtrl.setButtons(buttons);
                                var hasUrl = uploadDialog.querySelector('.resourceInput[name="url"]').value.length > 3;
                                var embedForbidden = uploadDialog.querySelector('.resourceInput[name="embed"]').value === 'forbidden';
                                uploadDialogCtrl.widget().querySelector('.newResourceConfirm').disabled = !hasUrl || embedForbidden;
                            } else if (tabType === 'file') {
                                uploadDialog.querySelector('.nameInputContainer').style.display = 'none';
                                var hasQueue = uploadQueue.length > 0;
                                buttons[0].text = hasQueue ? (labels['ResourceUploadStart'] || 'Start Upload') : (labels['ResourceAddNew'] || 'Add Resource');
                                uploadDialogCtrl.setButtons(buttons);
                                uploadDialogCtrl.widget().querySelector('.newResourceConfirm').disabled = !hasQueue;
                            } else if (tabType === 'map') {
                                uploadDialog.querySelector('.nameInputContainer').style.display = '';
                                buttons[0].text = labels['ResourceAddNew'] || 'Add Resource';
                                uploadDialogCtrl.setButtons(buttons);
                                var hasCoords = uploadDialog.querySelector('input[name="lat"]').value.length > 0;
                                uploadDialogCtrl.widget().querySelector('.newResourceConfirm').disabled = !hasCoords;
                            } else if (tabType === 'search') {
                                uploadDialog.querySelector('.nameInputContainer').style.display = 'none';
                                buttons[0].text = labels['ResourceAddNew'] || 'Add Resource';
                                uploadDialogCtrl.setButtons(buttons);
                                uploadDialogCtrl.widget().querySelector('.newResourceConfirm').disabled = (openverseSelectedItem === null);
                            }
                        },
                        create: function() {
                            // Hide name input initially if starting on the file tab (onlyVideo mode)
                            if (onlyVideo) {
                                uploadDialog.querySelector('.nameInputContainer').style.display = 'none';
                            }
                        }
                    });

                    // ---- Button click handler ----
                    function getActiveTabType() {
                        var activeIdx = FTTabs(uploadDialog.querySelector('.resourceInputTabContainer'), 'option', 'active');
                        return uploadDialog.querySelectorAll('.resourceInputTabList li')[activeIdx].dataset.type;
                    }

                    function submitURL() {
                        if (previewController) { previewController.abort(); previewController = null; }
                        var resourceName = uploadDialog.querySelector('input[name="name"]').value;
                        if (!resourceName || resourceName.length < 2) {
                            uploadDialog.querySelectorAll('.message.error').forEach(function(el) { el.remove(); });
                            uploadDialog.querySelector('#resourceInputTabURL').insertAdjacentHTML('beforeend', '<div class="message active error">'+ labels['ErrorEmptyName'] +'</div>');
                            return;
                        }
                        var urlObj = checkResourceInput(
                            uploadDialog.querySelector('.resourceInput[name="url"]').value,
                            resourceName,
                            uploadDialog.querySelector('.resourceInput[name="thumbnail"]').value,
                            true
                        );
                        if (!urlObj || !urlObj.src) {
                            uploadDialog.querySelectorAll('.message.error').forEach(function(el) { el.remove(); });
                            uploadDialog.querySelector('#resourceInputTabURL').insertAdjacentHTML('beforeend', '<div class="message active error">'+ labels['ErrorEmptyURL'] +'</div>');
                            return;
                        }
                        urlObj.name = resourceName;

                        // Merge Wikipedia API attributes stored during preview
                        var _wikiAttrInput = uploadDialog.querySelector('.resourceInput[name="wikiAttributes"]');
                        if (_wikiAttrInput && _wikiAttrInput.value) {
                            try {
                                var _wikiAttrs = JSON.parse(_wikiAttrInput.value);
                                if (!urlObj.attributes) { urlObj.attributes = {}; }
                                Object.assign(urlObj.attributes, _wikiAttrs);
                            } catch(e) {}
                        }

                        // If embed is forbidden and the URL is not on the blocklist, save as urlpreview instead
                        if (uploadDialog.querySelector('.resourceInput[name="embed"]').value === 'forbidden'
                                && !isEmbedBlocklisted(uploadDialog.querySelector('.resourceInput[name="url"]').value)) {
                            urlObj.type = 'urlpreview';
                            if (!urlObj.attributes) { urlObj.attributes = {}; }
                            delete urlObj.attributes.embed;
                            var _descAttrInput = uploadDialog.querySelector('.resourceInput[name="urlpreviewAttributes"]');
                            if (_descAttrInput && _descAttrInput.value) {
                                try { Object.assign(urlObj.attributes, JSON.parse(_descAttrInput.value)); } catch(e) {}
                            }
                        }

                        uploadDialogCtrl.widget().querySelector('.newResourceConfirm').disabled = true;

                        if (isLocalMode) {
                            addResourceLocally(urlObj).then(function() {
                                FrameTrail.module('Database').loadResourceData(function() {
                                    uploadDialogCtrl.close();
                                    successCallback && successCallback.call();
                                });
                            }).catch(function(err) {
                                uploadDialog.querySelectorAll('.message.error').forEach(function(el) { el.remove(); });
                                uploadDialog.querySelector('#resourceInputTabURL').insertAdjacentHTML('beforeend', '<div class="message active error">' + err.message + '</div>');
                                uploadDialogCtrl.widget().querySelector('.newResourceConfirm').disabled = false;
                            });
                        } else {
                            var adapter = FrameTrail.module('StorageManager').getAdapter();
                            var dataPath = (adapter && adapter.dataPathAbsolute) ? adapter.dataPathAbsolute : '';
                            fetch(FrameTrail.module('RouteNavigation').resolveServerURL('ajaxServer.php'), {
                                method: 'POST',
                                body: new URLSearchParams({ a: 'fileUpload', type: 'url', name: resourceName, attributes: JSON.stringify(urlObj), dataPath: dataPath })
                            })
                            .then(function(r) { return r.json(); })
                            .then(function(resp) {
                                if (resp.code === 0) {
                                    FrameTrail.module('Database').loadResourceData(function() {
                                        uploadDialogCtrl.close();
                                        successCallback && successCallback.call();
                                    });
                                } else {
                                    uploadDialog.querySelectorAll('.message.error').forEach(function(el) { el.remove(); });
                                    uploadDialog.querySelector('#resourceInputTabURL').insertAdjacentHTML('beforeend', '<div class="message active error">'+ (resp.string || labels['ErrorGeneric']) +'</div>');
                                    uploadDialogCtrl.widget().querySelector('.newResourceConfirm').disabled = false;
                                }
                            })
                            .catch(function() {
                                uploadDialog.querySelectorAll('.message.error').forEach(function(el) { el.remove(); });
                                uploadDialog.querySelector('#resourceInputTabURL').insertAdjacentHTML('beforeend', '<div class="message active error">'+ labels['ErrorGeneric'] +'</div>');
                                uploadDialogCtrl.widget().querySelector('.newResourceConfirm').disabled = false;
                            });
                        }
                    }

                    function submitMap() {
                        var resourceName = uploadDialog.querySelector('input[name="name"]').value;
                        var lat = uploadDialog.querySelector('input[name="lat"]').value;
                        var lon = uploadDialog.querySelector('input[name="lon"]').value;
                        if (!lat || !lon) {
                            uploadDialog.querySelectorAll('.message.error').forEach(function(el) { el.remove(); });
                            uploadDialog.querySelector('#resourceInputTabMap').insertAdjacentHTML('beforeend', '<div class="message active error">'+ labels['ErrorMapNoCoordinates'] +'</div>');
                            return;
                        }
                        if (!resourceName || resourceName.length < 2) {
                            uploadDialog.querySelectorAll('.message.error').forEach(function(el) { el.remove(); });
                            uploadDialog.querySelector('#resourceInputTabMap').insertAdjacentHTML('beforeend', '<div class="message active error">'+ labels['ErrorEmptyName'] +'</div>');
                            return;
                        }
                        uploadDialogCtrl.widget().querySelector('.newResourceConfirm').disabled = true;
                        var mapResource = {
                            src: '', type: 'location', name: resourceName,
                            attributes: {
                                lat: lat, lon: lon,
                                boundingBox: [
                                    uploadDialog.querySelector('input.BB1').value,
                                    uploadDialog.querySelector('input.BB2').value,
                                    uploadDialog.querySelector('input.BB3').value,
                                    uploadDialog.querySelector('input.BB4').value
                                ]
                            }
                        };

                        if (isLocalMode) {
                            addResourceLocally(mapResource).then(function() {
                                FrameTrail.module('Database').loadResourceData(function() {
                                    uploadDialogCtrl.close();
                                    successCallback && successCallback.call();
                                });
                            }).catch(function(err) {
                                uploadDialog.querySelectorAll('.message.error').forEach(function(el) { el.remove(); });
                                uploadDialog.querySelector('#resourceInputTabMap').insertAdjacentHTML('beforeend', '<div class="message active error">' + err.message + '</div>');
                                uploadDialogCtrl.widget().querySelector('.newResourceConfirm').disabled = false;
                            });
                        } else {
                            var adapter = FrameTrail.module('StorageManager').getAdapter();
                            var dataPath = (adapter && adapter.dataPathAbsolute) ? adapter.dataPathAbsolute : '';
                            var mapParams = new URLSearchParams({
                                a: 'fileUpload', type: 'map', name: resourceName,
                                lat: lat, lon: lon, dataPath: dataPath
                            });
                            mapParams.append('boundingBox[]', uploadDialog.querySelector('input.BB1').value);
                            mapParams.append('boundingBox[]', uploadDialog.querySelector('input.BB2').value);
                            mapParams.append('boundingBox[]', uploadDialog.querySelector('input.BB3').value);
                            mapParams.append('boundingBox[]', uploadDialog.querySelector('input.BB4').value);
                            fetch(FrameTrail.module('RouteNavigation').resolveServerURL('ajaxServer.php'), { method: 'POST', body: mapParams })
                            .then(function(r) { return r.json(); })
                            .then(function(resp) {
                                if (resp.code === 0) {
                                    FrameTrail.module('Database').loadResourceData(function() {
                                        uploadDialogCtrl.close();
                                        successCallback && successCallback.call();
                                    });
                                } else {
                                    uploadDialog.querySelectorAll('.message.error').forEach(function(el) { el.remove(); });
                                    uploadDialog.querySelector('#resourceInputTabMap').insertAdjacentHTML('beforeend', '<div class="message active error">'+ (resp.string || labels['ErrorGeneric']) +'</div>');
                                    uploadDialogCtrl.widget().querySelector('.newResourceConfirm').disabled = false;
                                }
                            })
                            .catch(function() {
                                uploadDialog.querySelectorAll('.message.error').forEach(function(el) { el.remove(); });
                                uploadDialog.querySelector('#resourceInputTabMap').insertAdjacentHTML('beforeend', '<div class="message active error">'+ labels['ErrorGeneric'] +'</div>');
                                uploadDialogCtrl.widget().querySelector('.newResourceConfirm').disabled = false;
                            });
                        }
                    }

                    function buildOpenverseUrl(query, license) {
                        var params = new URLSearchParams({ q: query, page_size: 20 });
                        if (license) { params.set('license', license); }
                        return 'https://api.openverse.org/v1/images/?' + params.toString();
                    }

                    function searchOpenverse(url) {
                        if (openverseAbortCtrl) { openverseAbortCtrl.abort(); }
                        openverseAbortCtrl = new AbortController();
                        var resultsEl = uploadDialog.querySelector('.openverseResults');

                        resultsEl.innerHTML = '<div class="workingSpinner dark"></div>';
                        openverseSelectedItem = null;
                        uploadDialogCtrl.widget().querySelector('.newResourceConfirm').disabled = true;

                        fetch(url, { signal: openverseAbortCtrl.signal })
                            .then(function(r) { return r.json(); })
                            .then(function(data) {
                                var spinner = resultsEl.querySelector('.workingSpinner');
                                if (spinner) { spinner.remove(); }
                                resultsEl.innerHTML = '';

                                if (!data.results || data.results.length === 0) {
                                    resultsEl.insertAdjacentHTML('beforeend', '<div class="message active">No results found.</div>');
                                    return;
                                }

                                data.results.forEach(function(item) {
                                    var thumb = document.createElement('div');
                                    thumb.className = 'resourceThumb openverseThumb';
                                    thumb.dataset.licenseType = mapOpenverseLicense(item.license);
                                    thumb.style.backgroundImage = 'url(' + item.thumbnail + ')';
                                    thumb.innerHTML =
                                        '<div class="resourceTitle">' + (item.title || 'Untitled').replace(/</g, '&lt;') + '</div>';

                                    thumb.addEventListener('click', function() {
                                        resultsEl.querySelectorAll('.openverseThumb').forEach(function(t) { t.classList.remove('selected'); });
                                        thumb.classList.add('selected');
                                        openverseSelectedItem = item;
                                        uploadDialogCtrl.widget().querySelector('.newResourceConfirm').disabled = false;
                                    });

                                    resultsEl.appendChild(thumb);
                                });
                            })
                            .catch(function(err) {
                                if (err.name === 'AbortError') { return; }
                                var spinner = resultsEl.querySelector('.workingSpinner');
                                if (spinner) { spinner.remove(); }
                                resultsEl.innerHTML = '';
                                resultsEl.insertAdjacentHTML('beforeend', '<div class="message active error">Search failed. Please try again.</div>');
                            });
                    }

                    function submitOpenverse() {
                        if (!openverseSelectedItem) { return; }
                        var item = openverseSelectedItem;
                        var itemName = item.title || 'Openverse Image';
                        var itemLicense = mapOpenverseLicense(item.license);
                        var itemAttribution = (function() {
                            var parts = [];
                            var titlePart = item.title
                                ? (item.foreign_landing_url
                                    ? '<a href="' + item.foreign_landing_url + '" target="_blank" rel="noopener">' + item.title + '</a>'
                                    : item.title)
                                : null;
                            var creatorPart = item.creator
                                ? (item.creator_url
                                    ? '<a href="' + item.creator_url + '" target="_blank" rel="noopener">' + item.creator + '</a>'
                                    : item.creator)
                                : null;
                            var licensePart = item.license_url
                                ? '<a href="' + item.license_url + '" target="_blank" rel="noopener">' + itemLicense.replace('CC0', 'CC0 1.0') + (item.license_version ? ' ' + item.license_version : '') + '</a>'
                                : itemLicense;
                            if (titlePart) { parts.push(titlePart); }
                            if (creatorPart) { parts.push('by ' + creatorPart); }
                            parts.push(licensePart);
                            return parts.join(' · ');
                        }());
                        uploadDialogCtrl.widget().querySelector('.newResourceConfirm').disabled = true;

                        if (isLocalMode) {
                            // Local mode: no PHP server available, store as external URL reference
                            var resourceObj = {
                                src: item.url,
                                type: 'image',
                                name: itemName,
                                thumb: item.thumbnail,
                                licenseType: itemLicense,
                                licenseAttribution: itemAttribution,
                                attributes: {}
                            };
                            addResourceLocally(resourceObj).then(function() {
                                FrameTrail.module('Database').loadResourceData(function() {
                                    uploadDialogCtrl.close();
                                    successCallback && successCallback.call();
                                });
                            }).catch(function(err) {
                                uploadDialog.querySelector('#resourceInputTabSearch').insertAdjacentHTML('beforeend',
                                    '<div class="message active error">' + err.message + '</div>');
                                uploadDialogCtrl.widget().querySelector('.newResourceConfirm').disabled = false;
                            });
                        } else {
                            // Server mode: PHP downloads, optimizes, generates thumbnail, stores locally
                            var adapter = FrameTrail.module('StorageManager').getAdapter();
                            var dataPath = (adapter && adapter.dataPathAbsolute) ? adapter.dataPathAbsolute : '';
                            fetch(FrameTrail.module('RouteNavigation').resolveServerURL('ajaxServer.php'), {
                                method: 'POST',
                                body: new URLSearchParams({
                                    a: 'fileDownloadFromUrl',
                                    url: item.url,
                                    name: itemName,
                                    licenseType: itemLicense,
                                    licenseAttribution: itemAttribution,
                                    dataPath: dataPath
                                })
                            })
                            .then(function(r) { return r.json(); })
                            .then(function(resp) {
                                if (resp.code === 0) {
                                    FrameTrail.module('Database').loadResourceData(function() {
                                        uploadDialogCtrl.close();
                                        successCallback && successCallback.call();
                                    });
                                } else {
                                    uploadDialog.querySelector('#resourceInputTabSearch').insertAdjacentHTML('beforeend',
                                        '<div class="message active error">' + (resp.string || labels['ErrorGeneric']) + '</div>');
                                    uploadDialogCtrl.widget().querySelector('.newResourceConfirm').disabled = false;
                                }
                            })
                            .catch(function() {
                                uploadDialog.querySelector('#resourceInputTabSearch').insertAdjacentHTML('beforeend',
                                    '<div class="message active error">' + labels['ErrorGeneric'] + '</div>');
                                uploadDialogCtrl.widget().querySelector('.newResourceConfirm').disabled = false;
                            });
                        }
                    }

                    function startBatchUpload() {
                        var buttons = uploadDialogCtrl.getButtons();
                        buttons[0].text = labels['ResourceUploading'] || 'Uploading...';
                        uploadDialogCtrl.setButtons(buttons);
                        uploadDialogCtrl.widget().querySelector('.newResourceConfirm').disabled = true;
                        processUploadQueue();
                    }

                    function resetAndClose() {
                        if (previewController) { previewController.abort(); previewController = null; }
                        if (openverseAbortCtrl) { openverseAbortCtrl.abort(); openverseAbortCtrl = null; }
                        uploadQueue = [];
                        completedUploads = [];
                        isUploading = false;
                        currentUploadDialog = null;
                        currentUploadDialogCtrl = null;
                        currentSuccessCallback = null;
                        openverseSelectedItem = null;
                    }

                    uploadDialogCtrl = Dialog({
                        title: labels['ResourceAddNew'] || 'Add Resource',
                        icon: 'icon-doc-new',
                        resizable: false,
                        width: 680,
                        modal: true,
                        closeOnEscape: false,
                        content: uploadDialog,
                        close: function() {
                            resetAndClose();
                            uploadDialogCtrl.destroy();
                        },
                        buttons: [
                            {
                                class: 'newResourceConfirm',
                                disabled: true,
                                text: labels['ResourceAddNew'] || 'Add Resource',
                                click: function() {
                                    var tabType = getActiveTabType();
                                    if (tabType === 'url') {
                                        submitURL();
                                    } else if (tabType === 'file') {
                                        if (completedUploads.length > 0 && uploadQueue.length === 0) {
                                            uploadDialogCtrl.close();
                                        } else if (uploadQueue.length > 0) {
                                            startBatchUpload();
                                        }
                                    } else if (tabType === 'map') {
                                        submitMap();
                                    } else if (tabType === 'search') {
                                        submitOpenverse();
                                    }
                                }
                            },
                            {
                                text: labels['Cancel'] || 'Cancel',
                                click: function() { uploadDialogCtrl.close(); }
                            }
                        ]
                    });
                    currentUploadDialogCtrl = uploadDialogCtrl;

            } // End of showUploadDialog

            if (isLocalMode) {
                // Local mode: no server to query, use generous defaults
                serverCapabilities = { maxUploadBytes: 500 * 1024 * 1024, ffmpegAvailable: false };
                showUploadDialog();
            } else {
                // Server mode: fetch capabilities with a single request
                var adapter = FrameTrail.module('StorageManager').getAdapter();
                var dataPath = (adapter && adapter.dataPathAbsolute) ? adapter.dataPathAbsolute : '';
                fetch(FrameTrail.module('RouteNavigation').resolveServerURL('ajaxServer.php') + '?a=fileGetCapabilities&dataPath=' + encodeURIComponent(dataPath))
                    .then(function(r) { return r.json(); })
                    .then(function(resp) {
                        if (resp && resp.code === 0) {
                            serverCapabilities = {
                                maxUploadBytes: resp.maxUploadBytes || (500 * 1024 * 1024),
                                ffmpegAvailable: resp.ffmpegAvailable || false
                            };
                        }
                        showUploadDialog();
                    })
                    .catch(function() {
                        showUploadDialog();
                    });
            }

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
     * Synchronous GET returning parsed JSON, or null on error.
     * @method syncGetJSON
     * @private
     */
    function syncGetJSON(url) {
        var xhr = new XMLHttpRequest();
        xhr.open('GET', url, false);
        try { xhr.send(); } catch(e) { return null; }
        if (xhr.status >= 200 && xhr.status < 300) {
            try { return JSON.parse(xhr.responseText); } catch(e) { return null; }
        }
        return null;
    }


    /**
     * I perform some client-side validations on an URI input field
     * @method checkResourceInput
     * @param {String} uriValue
     * @param {String} nameValue
     * @param {String} thumbValue
     * @return
     */
    function checkResourceInput(uriValue, nameValue, thumbValue, skipPreview) {

        if ( uriValue.length > 3 ) {

            // Auto-prepend https:// if no protocol is present
            if (!/^[a-zA-Z][a-zA-Z0-9+\-.]*:\/\//.test(uriValue)) {
                uriValue = 'https://' + uriValue;
                // Also update the input field so the user sees the normalised value
                if (currentUploadDialog) { currentUploadDialog.querySelector('#resourceInputTabURL input[name="url"]').value = uriValue; }
            }

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
                            return createResource("https://www.youtube.com/embed/" + res[1] + tcString,
                                                   "youtube", name, "https://img.youtube.com/vi/" + res[1] + "/hqdefault.jpg");
                        }
                    }
                    return null;
                },
                function (src, name) {
                    // Vimeo
                    var res = /^(http\:\/\/|https\:\/\/)?(www\.)?(vimeo\.com\/)([0-9]+)$/.exec(src);
                    if (res !== null) {
                        // Create the resource beforehand, so that we can update its thumb property asynchronously
                        var r = createResource("https://player.vimeo.com/video/" + res[4], "vimeo", name);
                        var _vimeoData = syncGetJSON("https://vimeo.com/api/v2/video/" + res[4] + ".json");
                        if (_vimeoData) {
                                r.thumb = _vimeoData[0].thumbnail_large;

                                var vimeoID = _vimeoData[0].id.toString();

                                if (!r.name || r.name == vimeoID) {
                                    r.name = _vimeoData[0].title;
                                }
                        }

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
                    // Wistia
                    var res = /(?:fast\.)?wistia\.(?:com|net)\/medias\/([a-zA-Z0-9]+)/.exec(src);
                    if (!res) res = /wi\.st\/medias\/([a-zA-Z0-9]+)/.exec(src);
                    if (res !== null) {
                        return createResource("https://fast.wistia.net/embed/iframe/" + res[1], "wistia", name);
                    }
                    return null;
                },
                function (src, name) {
                    // SoundCloud
                    var thumbSrc = (thumbValue) ? thumbValue : null;
                    if (/soundcloud\.com\/[\w-]+\/[\w-]+/.exec(src)) {
                        return createResource("https://w.soundcloud.com/player/?url=" + encodeURIComponent(src) + "&auto_play=false&show_artwork=true", "soundcloud", name, thumbSrc);
                    }
                    return null;
                },
                function (src, name) {
                    // Twitch
                    var res = /twitch\.tv\/videos\/(\d+)/.exec(src);
                    if (res !== null) {
                        return createResource("https://player.twitch.tv/?video=" + res[1] + "&parent=" + window.location.hostname, "twitch", name);
                    }
                    res = /twitch\.tv\/([\w]+)$/.exec(src);
                    if (res !== null) {
                        return createResource("https://player.twitch.tv/?channel=" + res[1] + "&parent=" + window.location.hostname, "twitch", name);
                    }
                    return null;
                },
                function (src, name) {
                    // Bluesky
                    var res = /bsky\.app\/profile\/([\w.:-]+)\/post\/([\w]+)/.exec(src);
                    if (res !== null) {
                        var fullUrl = "https://bsky.app/profile/" + res[1] + "/post/" + res[2];
                        var r = createResource(fullUrl, "urlpreview", name);
                        r.attributes.originalType = 'bluesky';
                        var _bskyData = syncGetJSON("_server/ajaxServer.php?a=oembedProxy&url=" + encodeURIComponent("https://embed.bsky.app/oembed?url=" + encodeURIComponent(fullUrl)));
                        if (_bskyData) {
                            if (_bskyData.html) {
                                r.attributes.html = _bskyData.html;
                            }
                            if (_bskyData.author_name && (!r.name || r.name.length < 3)) {
                                r.name = _bskyData.author_name + "'s post";
                            }
                        }
                        return r;
                    }
                    return null;
                },
                function (src, name) {
                    // CodePen
                    var res = /codepen\.io\/([\w-]+)\/(?:pen|full|details)\/([\w]+)/.exec(src);
                    if (res !== null) {
                        return createResource("https://codepen.io/" + res[1] + "/embed/" + res[2] + "?default-tab=result", "codepen", name);
                    }
                    return null;
                },
                function (src, name) {
                    // Figma
                    if (/figma\.com\/(file|proto|design|board)\//.exec(src)) {
                        return createResource(src, "figma", name);
                    }
                    return null;
                },
                function (src, name) {
                    // Loom
                    var res = /loom\.com\/share\/([a-zA-Z0-9]+)/.exec(src);
                    if (res !== null) {
                        return createResource("https://www.loom.com/embed/" + res[1], "loom", name);
                    }
                    return null;
                },
                function (src, name) {
                    // X/Twitter
                    var res = /(?:twitter\.com|x\.com)\/([a-zA-Z0-9_]+)\/status\/(\d+)/.exec(src);
                    if (res !== null) {
                        var r = createResource(src, "urlpreview", name);
                        r.attributes.originalType = 'xtwitter';
                        var _twData = syncGetJSON("https://publish.twitter.com/oembed?url=" + encodeURIComponent(src) + "&omit_script=true");
                        if (_twData) {
                            if (_twData.html) r.attributes.html = _twData.html;
                            if (_twData.author_name && (!r.name || r.name.length < 3)) r.name = _twData.author_name + "'s post";
                        }
                        return r;
                    }
                    return null;
                },
                function (src, name) {
                    // TikTok
                    var res = /tiktok\.com\/@([a-zA-Z0-9_.]+)\/video\/(\d+)/.exec(src);
                    if (res !== null) {
                        var r = createResource(src, "urlpreview", name);
                        r.attributes.originalType = 'tiktok';
                        var _ttData = syncGetJSON("https://www.tiktok.com/oembed?url=" + encodeURIComponent(src));
                        if (_ttData) {
                            if (_ttData.html) r.attributes.html = _ttData.html;
                            if (_ttData.thumbnail_url) r.thumb = _ttData.thumbnail_url;
                            if (_ttData.title && (!r.name || r.name.length < 3)) r.name = _ttData.title;
                        }
                        return r;
                    }
                    return null;
                },
                function (src, name) {
                    // Mastodon (/@user/id or /users/user/statuses/id pattern)
                    // For cross-instance URLs (username contains @), resolve the canonical
                    // home-instance URL via the public Mastodon API (CORS: allow *).
                    var res = /^https?:\/\/([^\/]+)\/@([a-zA-Z0-9_.@]+)\/(\d+)/.exec(src);
                    if (!res) res = /^https?:\/\/([^\/]+)\/users\/([a-zA-Z0-9_.@]+)\/statuses\/(\d+)/.exec(src);
                    if (res !== null) {
                        var r = createResource(src, "mastodon", name);
                        r.attributes.instance = res[1];
                        // Cross-instance: username contains a second @
                        if (res[2].indexOf('@') !== -1) {
                            var apiUrl = 'https://' + res[1] + '/api/v1/statuses/' + res[3];
                            var _mstData = syncGetJSON(apiUrl);
                            if (_mstData && _mstData.url) {
                                r.attributes.embedUrl = _mstData.url + '/embed';
                            }
                        }
                        return r;
                    }
                    return null;
                },
                function (src, name) {
                    // Spotify
                    var res = /open\.spotify\.com\/(track|album|playlist|show|episode)\/([a-zA-Z0-9]+)/.exec(src);
                    if (res !== null) {
                        var thumbSrc = (thumbValue) ? thumbValue : null;
                        var r = createResource(src, "spotify", name, thumbSrc);
                        r.attributes.contentType = res[1];
                        r.attributes.contentId = res[2];
                        var _spData = syncGetJSON("https://open.spotify.com/oembed?url=" + encodeURIComponent(src));
                        if (_spData) {
                            if (_spData.html) r.attributes.html = _spData.html;
                            if (_spData.thumbnail_url) r.thumb = _spData.thumbnail_url;
                            if (_spData.title && (!r.name || r.name.length < 3)) r.name = _spData.title;
                        }
                        return r;
                    }
                    return null;
                },
                function (src, name) {
                    // SlideShare
                    var res = /slideshare\.net\/([^\/]+)\/([^\/\?]+)/.exec(src);
                    if (res !== null) {
                        var r = createResource(src, "urlpreview", name);
                        r.attributes.originalType = 'slideshare';
                        var _ssData = syncGetJSON("https://www.slideshare.net/api/oembed/2?url=" + encodeURIComponent(src) + "&format=json");
                        if (_ssData) {
                            if (_ssData.html) r.attributes.html = _ssData.html;
                            if (_ssData.thumbnail) r.thumb = _ssData.thumbnail;
                            if (_ssData.title && (!r.name || r.name.length < 3)) r.name = _ssData.title;
                        }
                        return r;
                    }
                    return null;
                },
                function (src, name) {
                    // Reddit
                    var res = /reddit\.com\/r\/([^\/]+)\/comments\/([a-zA-Z0-9]+)/.exec(src);
                    if (res !== null) {
                        var r = createResource(src, "urlpreview", name);
                        r.attributes.originalType = 'reddit';
                        var _rdData = syncGetJSON("https://www.reddit.com/oembed?url=" + encodeURIComponent(src));
                        if (_rdData) {
                            if (_rdData.html) r.attributes.html = _rdData.html;
                            if (_rdData.author_name && (!r.name || r.name.length < 3)) r.name = _rdData.author_name + "'s post";
                        }
                        return r;
                    }
                    return null;
                },
                function (src, name) {
                    // Flickr
                    var flickr_patterns = [
                        /flickr\.com\/photos\/([^\/]+)\/(\d+)/,
                        /flickr\.com\/photos\/([^\/]+)\/albums\/(\d+)/,
                        /flickr\.com\/photos\/([^\/]+)\/galleries\/(\d+)/
                    ];
                    for (var i in flickr_patterns) {
                        var res = flickr_patterns[i].exec(src);
                        if (res !== null) {
                            var r = createResource(src, "urlpreview", name);
                            r.attributes.originalType = 'flickr';
                            var _flData = syncGetJSON("https://www.flickr.com/services/oembed/?url=" + encodeURIComponent(src) + "&format=json");
                            if (_flData) {
                                if (_flData.type === 'photo') {
                                    r.thumb = _flData.url;
                                    r.attributes.photoUrl = _flData.url;
                                } else if (_flData.html) {
                                    r.attributes.html = _flData.html;
                                }
                                if (_flData.title && (!r.name || r.name.length < 3)) r.name = _flData.title;
                            }
                            return r;
                        }
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
                    if (currentUploadDialog) {
                        var _msgEl = currentUploadDialog.querySelector('.resourceInputMessage');
                        if (_msgEl) { _msgEl.className = 'resourceInputMessage message'; _msgEl.textContent = ''; }
                    }
                    if (!skipPreview) { renderWebsitePreview(uriValue, newResource.type, newResource); }
                    return newResource;
                    break;
                } else {
                    if (currentUploadDialog) {
                        var _msgEl2 = currentUploadDialog.querySelector('.resourceInputMessage');
                        if (_msgEl2) { _msgEl2.className = 'resourceInputMessage message active error'; _msgEl2.textContent = labels['MessageURLNotValid']; }
                    }
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

        if (!currentUploadDialog) return;
        currentUploadDialog.querySelector('#resourceInputTabURL .resourceURLPreview').innerHTML = '';
        currentUploadDialog.querySelector('.resourceInput[name="thumbnail"]').value = '';
        currentUploadDialog.querySelector('.resourceInput[name="embed"]').value = '';
        var _wikiAttrInput = currentUploadDialog.querySelector('.resourceInput[name="wikiAttributes"]');
        if (_wikiAttrInput) { _wikiAttrInput.value = ''; }
        var _descAttrInput = currentUploadDialog.querySelector('.resourceInput[name="urlpreviewAttributes"]');
        if (_descAttrInput) { _descAttrInput.value = ''; }
        var _corsEl = currentUploadDialog.querySelector('#resourceInputTabURL .corsWarning');
        if (_corsEl) {
            _corsEl.className = 'corsWarning message error';
            _corsEl.textContent = labels['MessageEmbedNotAllowed'];
        }
        var _confirmBtn = currentUploadDialogCtrl && currentUploadDialogCtrl.widget().querySelector('.newResourceConfirm');
        if (_confirmBtn) { _confirmBtn.disabled = false; }

        currentUploadDialog.querySelector('#resourceInputTabURL .resourceURLPreview').insertAdjacentHTML('beforeend', '<div class="workingSpinner dark"></div>');

        if ( uriValue.length > 3 ) {

            if (previewController) { previewController.abort(); }
            previewController = new AbortController();

            if ((resourceType == 'webpage' || resourceType == 'wikipedia') && FrameTrail.module('RouteNavigation').hasServer()) {
                var adapter = FrameTrail.module('StorageManager').getAdapter();
                var dataPath = (adapter && adapter.dataPathAbsolute) ? adapter.dataPathAbsolute : '';
                fetch(FrameTrail.module('RouteNavigation').resolveServerURL('ajaxServer.php'), {
                    method: 'POST',
                    cache: 'no-cache',
                    signal: previewController.signal,
                    body: new URLSearchParams({ a: 'fileGetUrlInfo', url: uriValue, dataPath: dataPath })
                })
                .then(function(r) { return r.json(); })
                .then(function(data) {

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

                        // Store Wikipedia API data in a hidden input so submitURL() can pick it up
                        if (resourceType == 'wikipedia' && data.urlInfo && currentUploadDialog) {
                            var _wikiInput = currentUploadDialog.querySelector('.resourceInput[name="wikiAttributes"]');
                            if (!_wikiInput) {
                                _wikiInput = document.createElement('input');
                                _wikiInput.type = 'hidden';
                                _wikiInput.className = 'resourceInput';
                                _wikiInput.name = 'wikiAttributes';
                                currentUploadDialog.querySelector('#resourceInputTabURL').appendChild(_wikiInput);
                            }
                            _wikiInput.value = JSON.stringify({
                                extract:      data.urlInfo.extract      || '',
                                extract_html: data.urlInfo.extract_html || '',
                                description:  data.urlInfo.description  || '',
                                articleUrl:   data.urlInfo.articleUrl   || '',
                                wikiLang:     data.urlInfo.lang         || '',
                                dir:          data.urlInfo.dir          || 'ltr'
                            });
                        }

                        renderResourcePreviewElement(uriValue, resourceType, data.urlInfo.title, data.urlInfo.image, data.urlInfo.description, data.embed);
                    } else if (data.code == 1) {
                        console.log(data.string);
                    }

                })
                .catch(function() { /* aborted or network error — ignore */ });
            } else {
                renderResourcePreviewElement(uriValue, resourceType, resourceObj.name, resourceObj.thumb, resourceObj.description);
            }
            

        } else {
            // uri value length <= 3
        }

    }

    /**
     * I render the actual preview element
     * @method renderResourcePreviewElement
     * @param {String} uriValue
     * @param {String} resourceType
     * @param {String} resourceTitle
     * @param {String} resourceThumb
     * @param {String} resourceDescription
     * @param {String} embed (optional)
     * @return
     */
    function renderResourcePreviewElement(uriValue, resourceType, resourceTitle, resourceThumb, resourceDescription, embed) {
        if (!currentUploadDialog) return;
        currentUploadDialog.querySelector('.resourceInput[name="thumbnail"]').value = resourceThumb || '';
        currentUploadDialog.querySelector('.resourceInput[name="embed"]').value = embed || '';

        var _nameInput = currentUploadDialog.querySelector('.resourceNameInput');
        if (resourceTitle) {
            _nameInput.value = resourceTitle;
            _nameInput.dispatchEvent(new Event('input', { bubbles: true }));
        }

        var previewTitle = (_nameInput.value.length > 3) ? _nameInput.value : resourceTitle;
        var previewImageString = (resourceThumb) ? '--thumb-bg:url('+ resourceThumb +'); background-image: var(--thumb-bg)' : '';

        var _prevw = document.createElement('div');
        _prevw.innerHTML = '<div class="resourceThumb" data-type="'+ resourceType +'" style="'+ previewImageString +'">'
                           +'    <div class="resourceOverlay">'
                           +'    </div>'
                           +'    <div class="resourceTitle">'+ previewTitle +'</div>'
                           +'</div>';
        var previewElem = _prevw.firstElementChild;

        currentUploadDialog.querySelectorAll('#resourceInputTabURL .resourceURLPreview .resourceThumb').forEach(function(el) { el.remove(); });
        currentUploadDialog.querySelector('#resourceInputTabURL .resourceURLPreview').appendChild(previewElem);

        // Store description for urlpreview fallback (picked up in submitURL)
        var _descInput = currentUploadDialog.querySelector('.resourceInput[name="urlpreviewAttributes"]');
        if (!_descInput) {
            _descInput = document.createElement('input');
            _descInput.type = 'hidden';
            _descInput.className = 'resourceInput';
            _descInput.name = 'urlpreviewAttributes';
            currentUploadDialog.querySelector('#resourceInputTabURL').appendChild(_descInput);
        }
        _descInput.value = resourceDescription ? JSON.stringify({ description: resourceDescription }) : '';

        var _corsEl = currentUploadDialog.querySelector('#resourceInputTabURL .corsWarning');
        var _confirmBtn = currentUploadDialogCtrl && currentUploadDialogCtrl.widget().querySelector('.newResourceConfirm');
        if (embed && embed == 'forbidden') {
            if (isEmbedBlocklisted(uriValue)) {
                if (_corsEl) { _corsEl.className = 'corsWarning message error active'; _corsEl.textContent = labels['MessageEmbedNotAllowed']; }
                if (_confirmBtn) { _confirmBtn.disabled = true; }
            } else {
                if (_corsEl) { _corsEl.className = 'corsWarning message warning active'; _corsEl.textContent = labels['MessageEmbedForbiddenPreviewOnly']; }
                if (_confirmBtn) { _confirmBtn.disabled = false; }
            }
        } else {
            if (_corsEl) { _corsEl.className = 'corsWarning message error'; _corsEl.textContent = labels['MessageEmbedNotAllowed']; }
            if (_confirmBtn) { _confirmBtn.disabled = false; }
        }

        var _spinner = currentUploadDialog.querySelector('#resourceInputTabURL .resourceURLPreview .workingSpinner');
        if (_spinner) { _spinner.remove(); }
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
    function mapOpenverseLicense(license) {
        var map = {
            'cc0': 'CC0', 'pdm': 'CC0',
            'by': 'CC-BY', 'by-sa': 'CC-BY-SA',
            'by-nd': 'CC-BY-ND', 'by-nc': 'CC-BY-NC',
            'by-nc-sa': 'CC-BY-NC-SA', 'by-nc-nd': 'CC-BY-NC-ND'
        };
        return map[(license || '').toLowerCase()] || 'CC-BY';
    }


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
        if (currentUploadDialog && currentUploadDialog.querySelector('.resourceInput[name="embed"]').value == 'forbidden') {
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

        if (FrameTrail.getState('storageMode') === 'local') {
            var adapter = FrameTrail.module('StorageManager').getAdapter();
            adapter.readJSON('resources/_index.json').then(function(indexData) {
                if (!indexData.resources[resourceID]) {
                    cancelCallback({ code: 3, string: 'Resource not found' });
                    return;
                }
                var res = indexData.resources[resourceID];
                var deleteTasks = [];

                // Delete the source file if it's a local file (not an external URL)
                if (res.src && !/^(https?:|\/\/|file:|blob:)/.test(res.src)) {
                    deleteTasks.push(adapter.deleteFile('resources/' + res.src).catch(function() {}));
                }
                // Delete the thumbnail file if it's a local file
                if (res.thumb && !/^(https?:|\/\/|file:|blob:)/.test(res.thumb)) {
                    deleteTasks.push(adapter.deleteFile('resources/' + res.thumb).catch(function() {}));
                }

                delete indexData.resources[resourceID];
                deleteTasks.push(adapter.writeJSON('resources/_index.json', indexData));
                return Promise.all(deleteTasks);
            }).then(function() {
                delete FrameTrail.module('Database').resources[resourceID];
                successCallback();
            }).catch(function(err) {
                cancelCallback({ code: 1, string: err.message });
            });
            return;
        }

        var adapter = FrameTrail.module('StorageManager').getAdapter();
        var dataPath = (adapter && adapter.dataPathAbsolute) ? adapter.dataPathAbsolute : '';
        fetch(FrameTrail.module('RouteNavigation').resolveServerURL('ajaxServer.php'), {
            method: 'POST',
            cache: 'no-cache',
            body: new URLSearchParams({ a: 'fileDelete', resourcesID: resourceID, dataPath: dataPath })
        })
        .then(function(r) { return r.json(); })
        .then(function(data) {

            if (data.code === 0) {
                delete FrameTrail.module('Database').resources[resourceID];
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

        targetElement.innerHTML = '';
        targetElement.insertAdjacentHTML('beforeend', '<div class="loadingScreen"><div class="workingSpinner dark"></div></div>');


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
    /**
     * I add a pencil edit button to a resource thumb element if the current user
     * has permission to edit that resource. Used by both renderResult and renderResourcePicker.
     *
     * @method addEditButtonIfAllowed
     * @param {HTMLElement} thumbEl
     * @param {String} resourceID
     * @param {Object} resourceData
     * @private
     */
    function addEditButtonIfAllowed(thumbEl, resourceID, resourceData) {

        var storageMode = FrameTrail.getState('storageMode');
        var canSave = FrameTrail.module('StorageManager').canSave();
        var userMgmt = FrameTrail.module('UserManagement');
        var isOwnerOrAdmin = (String(userMgmt.userID) === String(resourceData.creatorId))
                          || userMgmt.userRole === 'admin';

        if (canSave && (storageMode !== 'server' || isOwnerOrAdmin)) {
            var editBtn = document.createElement('div');
            editBtn.className = 'resourceEditButton';
            editBtn.setAttribute('data-resource-id', resourceID);
            editBtn.title = labels['ResourceEditButton'];
            editBtn.innerHTML = '<span class="icon-pencil"></span>';
            thumbEl.appendChild(editBtn);
        }

    }


    function renderResult(targetElement, array) {

        for (var id in array) {

            var resourceTypeName = 'Resource' + array[id].type.charAt(0).toUpperCase() + array[id].type.slice(1);
            if (!FrameTrail.type(resourceTypeName)) {
                console.warn('Skipping resource with unknown type: ' + array[id].type);
                continue;
            }

            var resourceThumb = FrameTrail.newObject(
                resourceTypeName,
                array[id]
            ).renderThumb(id);

            //add thumb to target element
            targetElement.append(resourceThumb);

            addEditButtonIfAllowed(resourceThumb, id, array[id]);

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

                var _ls = targetElement.querySelector('.loadingScreen');
                if (_ls) { _ls.style.transition = 'opacity 0.6s'; _ls.style.opacity = '0'; setTimeout(function() { if (_ls.parentNode) { _ls.parentNode.removeChild(_ls); } }, 600); }

            },

            function(errorMessage){

                var _lse = targetElement.querySelector('.loadingScreen');
                if (_lse) { _lse.remove(); }
                targetElement.insertAdjacentHTML('beforeend', '<div class="loadingErrorMessage"><div class="message error active">' + errorMessage + '</div></div>');

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

        var storageMode = FrameTrail.getState('storageMode');
        if (storageMode === 'local' || storageMode === 'download') {
            // Client-side filtering using the already-loaded Database resources
            var allResources = FrameTrail.module('Database').resources;
            var result = {};
            if (typeof values === 'string') { values = [values]; }
            for (var k in allResources) {
                if (!allResources.hasOwnProperty(k)) continue;
                var v = allResources[k];
                var match = false;
                if (condition === '==' || condition === 'contains') match = (values.indexOf(v[key]) !== -1);
                else if (condition === '!=') match = (values.indexOf(v[key]) === -1);
                else if (condition === '<=') match = (v[key] <= values[0]);
                else if (condition === '>=') match = (v[key] >= values[0]);
                if (match) result[k] = v;
            }
            renderResult(targetElement, result);
            var _ls2 = targetElement.querySelector('.loadingScreen');
            if (_ls2) { _ls2.style.transition = 'opacity 0.6s'; _ls2.style.opacity = '0'; setTimeout(function() { if (_ls2.parentNode) { _ls2.parentNode.removeChild(_ls2); } }, 600); }
            return;
        }

        // Build POST body: send array values as separate values[] entries so PHP receives a proper array
        // (URLSearchParams.toString() on an array joins with commas, breaking PHP's array detection)
        var adapter = FrameTrail.module('StorageManager').getAdapter();
        var dataPath = (adapter && adapter.dataPathAbsolute) ? adapter.dataPathAbsolute : '';
        var params = new URLSearchParams({ a: 'fileGetByFilter', key: key, condition: condition, dataPath: dataPath });
        (Array.isArray(values) ? values : [values]).forEach(function(v) { params.append('values[]', v); });

        fetch(FrameTrail.module('RouteNavigation').resolveServerURL('ajaxServer.php'), {
            method: 'POST',
            cache: 'no-cache',
            body: params
        })
        .then(function(r) { return r.json(); })
        .then(function(data) {

            if (data.code === 0) {
                renderResult(targetElement, data.result);
            }

            var _ls3 = targetElement.querySelector('.loadingScreen');
            if (_ls3) { _ls3.style.transition = 'opacity 0.6s'; _ls3.style.opacity = '0'; setTimeout(function() { if (_ls3.parentNode) { _ls3.parentNode.removeChild(_ls3); } }, 600); }

        })
        .catch(function() {

            var _ls4 = targetElement.querySelector('.loadingScreen');
            if (_ls4) { _ls4.remove(); }
            targetElement.insertAdjacentHTML('beforeend', '<div class="loadingErrorMessage"><div class="message error active">' + labels['ErrorGeneric'] + '</div></div>');

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

        if (targetElement && targetElement.jquery) { targetElement = targetElement[0]; }
        var resourceDatabase    = FrameTrail.module('Database').resources;
        var _cpw = document.createElement('div');
        _cpw.innerHTML = '<div class="resourcePicker">'
                          + '    <div class="resourcePickerControls">'
                          //+ '        <button class="manageResourcesButton">Manage Resources</button>'
                          + '        <button class="addResourcesButton" data-tooltip-right="'+ labels['ResourceAddNew'] +'"><span class="icon-doc-new"></span></button>'
                          + '    </div>'
                          + '    <div class="resourcePickerList"></div>'
                          + '</div>';
        var container = _cpw.firstElementChild;
        var resourceList = container.querySelector('.resourcePickerList');
        var resourceThumb;

        function refreshPicker() {
            targetElement.innerHTML = '';
            renderResourcePicker(targetElement);
        }

        container.querySelector('.addResourcesButton').addEventListener('click', function() {

            FrameTrail.module('ResourceManager').uploadResource(function(){

                FrameTrail.module('Database').loadResourceData(refreshPicker);

            });

        });

        if (!FrameTrail.module('StorageManager').canSave()) {
            container.querySelector('.addResourcesButton').disabled = true;
        }

        // Delegated click handler for edit buttons
        resourceList.addEventListener('click', function(e) {
            var editBtn = e.target.closest('.resourceEditButton');
            if (!editBtn) { return; }
            e.stopPropagation();
            var resourceID = editBtn.getAttribute('data-resource-id');
            var resourceData = FrameTrail.module('Database').resources[resourceID];
            openEditDialog(resourceID, resourceData, refreshPicker);
        });

        for (var i in resourceDatabase) {

            var resourceTypeName = 'Resource' + resourceDatabase[i].type.charAt(0).toUpperCase() + resourceDatabase[i].type.slice(1);
            if (!FrameTrail.type(resourceTypeName)) {
                console.warn('Skipping resource with unknown type: ' + resourceDatabase[i].type);
                continue;
            }

            resourceThumb = FrameTrail.newObject(
                resourceTypeName,
                resourceDatabase[i]
            ).renderThumb();

            (function(el, id, data) {
                interact(el).draggable({
                    listeners: {
                        start: function(e) {
                            var rect = e.target.getBoundingClientRect();
                            window._ftCurrentDragClone = e.target.cloneNode(true);
                            window._ftCurrentDragClone.style.position = 'fixed';
                            window._ftCurrentDragClone.style.zIndex = '1000';
                            window._ftCurrentDragClone.style.pointerEvents = 'auto';
                            window._ftCurrentDragClone.style.boxSizing = 'border-box';
                            window._ftCurrentDragClone.style.width = rect.width + 'px';
                            window._ftCurrentDragClone.style.height = rect.height + 'px';
                            window._ftCurrentDragClone.style.left = rect.left + 'px';
                            window._ftCurrentDragClone.style.top = rect.top + 'px';
                            window._ftCurrentDragClone.classList.add('ft-drag-clone');
                            document.body.appendChild(window._ftCurrentDragClone);
                            e.target.classList.add('dragPlaceholder');
                            document.body.classList.add('ft-dragging');
                        },
                        move: function(e) {
                            if (window._ftCurrentDragClone) {
                                window._ftCurrentDragClone.style.left = (parseFloat(window._ftCurrentDragClone.style.left) + e.dx) + 'px';
                                window._ftCurrentDragClone.style.top  = (parseFloat(window._ftCurrentDragClone.style.top)  + e.dy) + 'px';
                            }
                        },
                        end: function(e) {
                            e.target.classList.remove('dragPlaceholder');
                            if (window._ftCurrentDragClone) { window._ftCurrentDragClone.remove(); window._ftCurrentDragClone = null; }
                            document.body.classList.remove('ft-dragging');
                        }
                    }
                });

                addEditButtonIfAllowed(el, id, data);

            }(resourceThumb, i, resourceDatabase[i]));

            resourceList.appendChild(resourceThumb);

        }


        targetElement.appendChild(container);

    }


    /**
     * I update the name, licenseType and licenseAttribution of a resource.
     *
     * @method updateResource
     * @param {String} resourceID
     * @param {Object} updateData  Object with keys: name, licenseType, licenseAttribution
     * @param {Function} successCallback
     * @param {Function} cancelCallback
     */
    function updateResource(resourceID, updateData, successCallback, cancelCallback) {

        if (FrameTrail.getState('storageMode') === 'local') {
            var adapter = FrameTrail.module('StorageManager').getAdapter();
            adapter.readJSON('resources/_index.json').then(function(indexData) {
                if (!indexData.resources[resourceID]) {
                    cancelCallback({ code: 3, string: 'Resource not found' });
                    return;
                }
                indexData.resources[resourceID].name = updateData.name;
                indexData.resources[resourceID].licenseType = updateData.licenseType;
                indexData.resources[resourceID].licenseAttribution = updateData.licenseAttribution;
                return adapter.writeJSON('resources/_index.json', indexData).then(function() {
                    // Update in-memory database
                    var db = FrameTrail.module('Database');
                    if (db.resources[resourceID]) {
                        db.resources[resourceID].name = updateData.name;
                        db.resources[resourceID].licenseType = updateData.licenseType;
                        db.resources[resourceID].licenseAttribution = updateData.licenseAttribution;
                    }
                });
            }).then(function() {
                successCallback();
            }).catch(function(err) {
                cancelCallback({ code: 1, string: err.message });
            });
            return;
        }

        var adapter = FrameTrail.module('StorageManager').getAdapter();
        var dataPath = (adapter && adapter.dataPathAbsolute) ? adapter.dataPathAbsolute : '';
        fetch(FrameTrail.module('RouteNavigation').resolveServerURL('ajaxServer.php'), {
            method: 'POST',
            cache: 'no-cache',
            body: new URLSearchParams({
                a: 'fileUpdate',
                resourcesID: resourceID,
                name: updateData.name,
                licenseType: updateData.licenseType,
                licenseAttribution: updateData.licenseAttribution,
                dataPath: dataPath
            })
        })
        .then(function(r) { return r.json(); })
        .then(function(data) {

            if (data.code === 0) {
                // Update in-memory database
                var db = FrameTrail.module('Database');
                if (db.resources[resourceID]) {
                    db.resources[resourceID].name = updateData.name;
                    db.resources[resourceID].licenseType = updateData.licenseType;
                    db.resources[resourceID].licenseAttribution = updateData.licenseAttribution;
                }
                successCallback();
            } else {
                cancelCallback(data);
            }

        });

    };


    /**
     * I build and open a dialog for editing the metadata of a resource (name, license type,
     * license attribution) and for deleting it.
     *
     * @method openEditDialog
     * @param {String} resourceID
     * @param {Object} resourceData
     * @param {Function} refreshCallback  Called after a successful save or delete so the caller can re-render its list.
     * @param {Function} [onSaveSuccess]  Optional extra callback called after a successful save (e.g. to show a status message).
     */
    function openEditDialog(resourceID, resourceData, refreshCallback, onSaveSuccess) {

        var licenseOptions = [
            { value: '',            label: '\u2014 ' + labels['ResourceEditLicenseUnspecified'] + ' \u2014' },
            { value: 'Copyright',   label: 'Copyright' },
            { value: 'CC-BY',       label: 'CC BY' },
            { value: 'CC-BY-SA',    label: 'CC BY-SA' },
            { value: 'CC-BY-ND',    label: 'CC BY-ND' },
            { value: 'CC-BY-NC',    label: 'CC BY-NC' },
            { value: 'CC-BY-NC-SA', label: 'CC BY-NC-SA' },
            { value: 'CC-BY-NC-ND', label: 'CC BY-NC-ND' },
            { value: 'CC0',         label: 'CC0 / Public Domain' }
        ];

        var licenseSelectOptions = licenseOptions.map(function(opt) {
            var selected = (opt.value === (resourceData.licenseType || '')) ? ' selected' : '';
            return '<option value="' + opt.value + '"' + selected + '>' + opt.label + '</option>';
        }).join('');

        var thumbSrc = resourceData.thumb || resourceData.src || '';
        var thumbUrl = thumbSrc ? FrameTrail.module('RouteNavigation').getResourceURL(thumbSrc) : '';
        var thumbStyle = thumbUrl ? '--thumb-bg:url(' + thumbUrl + '); background-image: var(--thumb-bg);' : '';

        var content = document.createElement('div');
        content.className = 'resourceEditDialogContent';
        content.innerHTML = ''
            + '<div class="layoutRow">'
            +     '<div class="column-5">'
            +         '<div class="resourceThumb" data-type="' + resourceData.type + '" style="' + thumbStyle + 'height:140px;margin-top:5px;cursor:default;position:relative;">'
            +         '</div>'
            +     '</div>'
            +     '<div class="column-7">'
            +         '<div class="layoutRow">'
            +             '<div class="column-12">'
            +                 '<label>' + labels['GenericName'] + '</label>'
            +                 '<input type="text" class="resourceEditName" value="">'
            +             '</div>'
            +         '</div>'
            +         '<div class="layoutRow">'
            +             '<div class="column-12">'
            +             '<label>' + labels['ResourceEditLicenseType'] + '</label>'
            +                 '<div class="custom-select"><select class="resourceEditLicenseType">' + licenseSelectOptions + '</select></div>'
            +             '</div>'
            +         '</div>'
            +         '<div class="layoutRow">'
            +             '<div class="column-12">'
            +                 '<label>' + labels['ResourceEditLicenseAttribution'] + '</label>'
            +                 '<input type="text" class="resourceEditLicenseAttribution" value="">'
            +             '</div>'
            +         '</div>'
            +         '<p class="message active mb-0" style="margin-top: 10px;">' + labels['ResourceEditNameNote'] + '</p>'
            +     '</div>'
            + '</div>';

        // Set value of name input after creation (avoids HTML encoding issues)
        content.querySelector('.resourceEditName').value = resourceData.name || '';
        content.querySelector('.resourceEditLicenseAttribution').value = resourceData.licenseAttribution || '';

        var editDialog;
        editDialog = Dialog({
            title:   labels['ResourceEditDialogTitle'],
            icon:    'icon-pencil',
            content: content,
            modal:   true,
            width:   600,
            close:   function() { editDialog.destroy(); }
        });

        var buttonPane = editDialog.widget().querySelector('.ft-dialog-buttonpane');

        var msgEl = document.createElement('div');
        msgEl.className = 'message';
        msgEl.style.flexBasis = '100%';
        buttonPane.appendChild(msgEl);

        var saveBtn = document.createElement('button');
        saveBtn.textContent = labels['GenericSave'];
        buttonPane.appendChild(saveBtn);

        var deleteBtn = document.createElement('button');
        deleteBtn.innerHTML = '<span class="icon-trash"></span> ' + labels['GenericDelete'];
        deleteBtn.style.marginLeft = 'auto';
        buttonPane.appendChild(deleteBtn);

        function showMessage(text, isError) {
            msgEl.textContent = text;
            msgEl.classList.toggle('error', !!isError);
            msgEl.classList.add('active');
        }

        function clearMessage() {
            msgEl.textContent = '';
            msgEl.classList.remove('active', 'error');
        }

        saveBtn.addEventListener('click', function() {
            var name = content.querySelector('.resourceEditName').value.trim();
            if (!name) {
                showMessage(labels['ResourceEditNameRequired'], true);
                return;
            }
            var updateData = {
                name:                name,
                licenseType:         content.querySelector('.resourceEditLicenseType').value,
                licenseAttribution:  content.querySelector('.resourceEditLicenseAttribution').value.trim()
            };
            saveBtn.disabled = true;
            clearMessage();
            updateResource(
                resourceID,
                updateData,
                function() {
                    editDialog.destroy();
                    refreshCallback();
                    if (onSaveSuccess) { onSaveSuccess(); }
                },
                function(data) {
                    saveBtn.disabled = false;
                    showMessage(data.string || labels['GenericError'], true);
                }
            );
        });

        deleteBtn.addEventListener('click', function() {
            ConfirmDialog({
                title:        labels['GenericConfirmDelete'],
                icon:         'icon-trash',
                message:      labels['ResourceEditDeleteConfirm'],
                confirmLabel: labels['GenericYes'],
                cancelLabel:  labels['GenericCancel'],
                onConfirm: function() {
                    deleteBtn.disabled = true;
                    clearMessage();
                    deleteResource(
                        resourceID,
                        function() {
                            editDialog.destroy();
                            refreshCallback();
                        },
                        function(data) {
                            deleteBtn.disabled = false;
                            if (data.code === 5) {
                                showMessage(labels['ResourceEditDeleteInUse'], true);
                            } else {
                                showMessage(data.string || labels['GenericError'], true);
                            }
                        }
                    );
                }
            });
        });

    }


    return {

        renderList:             renderList,
        renderResourcePicker:   renderResourcePicker,
        openEditDialog:         openEditDialog,

        updateResourceDatabase: updateResourceDatabase,
        uploadResource:         uploadResource,
        deleteResource:         deleteResource,
        updateResource:         updateResource

    };


});
