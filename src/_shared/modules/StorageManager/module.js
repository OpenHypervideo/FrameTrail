/**
 * @module Shared
 */

/**
 * I manage storage adapters and provide a unified interface for reading/writing data.
 *
 * I determine the appropriate storage backend (server, local folder, project file,
 * or download) based on the environment and user actions. Modules use me to get the
 * current adapter for storage operations.
 *
 * @class StorageManager
 * @static
 */

FrameTrail.defineModule('StorageManager', function(FrameTrail) {

    var labels = FrameTrail.module('Localization').labels;

    var _currentAdapter = null,
        _serverAdapter = null,
        _staticAdapter = null,
        _localAdapter = null,
        _downloadAdapter = null,
        _fileAdapter = null,
        _initialized = false,

        // A folder or project file of an earlier session that could not be
        // opened again without asking: { kind: 'local' | 'file', handle }.
        // Asking needs a click, which the storage dialog's Reopen provides.
        _remembered = null,

        // The file of this page (a page in the portable HTML format opened
        // from disk), remembered by an earlier "Save to this file".
        _pageHandle = null;


    /**
     * Initialize storage system. Determines the default adapter based on environment
     * and the `dataPath` / `server` init options.
     *
     * Decision order:
     *   1. Shorthand API (videoElement/videoSource) or inline contents → download (in-memory);
     *      a page in the portable HTML format opened from disk whose file was remembered
     *      by "Save to this file" → file mode, when the file still holds the page's data
     *   2. `server` option provided → probe PHP at that URL → server mode
     *   3. `server` omitted + `dataPath` provided → static mode (CDN, in-memory edits)
     *   4. Neither provided + HTTP(S) → auto-detect PHP at '_server/' → server, or 5.
     *   5. Restore the local folder or project file used last → local or file mode,
     *      else needsFolder (download without the File System Access API)
     *
     * @method init
     * @return {Promise<StorageAdapter>}
     */
    function init() {
        if (_initialized) {
            return Promise.resolve(_currentAdapter);
        }

        _localAdapter    = new StorageAdapterLocal();
        _downloadAdapter = new StorageAdapterDownload();
        _fileAdapter     = (typeof StorageAdapterHTMLFile !== 'undefined' && StorageAdapterHTMLFile.isSupported())
                         ? new StorageAdapterHTMLFile() : null;

        var serverOption   = FrameTrail.getState('server');
        var dataPathOption = FrameTrail.getState('dataPath');
        var onHTTP         = FrameTrail.module('RouteNavigation').environment.server;

        // 1. Shorthand API or full inline data — no server or folder needed
        if (FrameTrail.getState('videoElement') || FrameTrail.getState('videoSource') ||
                FrameTrail.getState('contents') !== null) {
            return _restorePageFile().then(function(restored) {
                if (!restored) {
                    _currentAdapter = _downloadAdapter;
                    FrameTrail.changeState('storageMode', 'download');
                }
                _initialized = true;
                return _currentAdapter;
            });
        }

        // 2. Explicit server option — probe PHP at the provided URL
        if (serverOption !== null) {
            var dataBase = dataPathOption || '_data/';
            _serverAdapter = new StorageAdapterServer(serverOption, dataBase);
            return _serverAdapter.init().then(function() {
                _currentAdapter = _serverAdapter;
                FrameTrail.changeState('storageMode', 'server');
                _initialized = true;
                return _currentAdapter;
            }).catch(function() {
                return _tryLocal();
            });
        }

        // 3. No server + explicit dataPath — static / CDN mode (in-memory edits)
        if (dataPathOption !== null) {
            _staticAdapter  = new StorageAdapterStatic(dataPathOption);
            _currentAdapter = _staticAdapter;
            return _staticAdapter.init().then(function() {
                FrameTrail.changeState('storageMode', 'static');
                _initialized = true;
                return _currentAdapter;
            }).catch(function() {
                // CDN not reachable — fall back to download
                _currentAdapter = _downloadAdapter;
                FrameTrail.changeState('storageMode', 'download');
                _initialized = true;
                return _currentAdapter;
            });
        }

        // 4. Auto-detect: try PHP at the default relative location
        if (onHTTP) {
            _serverAdapter = new StorageAdapterServer('_server/', '_data/');
            return _serverAdapter.init().then(function() {
                _currentAdapter = _serverAdapter;
                // Set state so resolvers (resolveServerURL / resolveDataURL) work correctly
                FrameTrail.changeState('server',   '_server/');
                FrameTrail.changeState('dataPath', '_data/');
                FrameTrail.changeState('storageMode', 'server');
                _initialized = true;
                return _currentAdapter;
            }).catch(function() {
                return _tryLocal();
            });
        }

        // 5. file:// — try to restore a local folder handle
        return _tryLocal();
    }


    /**
     * Try to restore the local folder or the project file used last.
     * If File System Access API is supported but neither can be opened, signal 'needsFolder'.
     * If API is not supported, use the download adapter.
     * @private
     */
    function _tryLocal() {
        if (StorageAdapterLocal.isSupported()) {
            return StorageAdapter.getStored('mode').catch(function() { return null; }).then(function(mode) {
                return (mode === 'file' && _fileAdapter) ? _restoreFile() : _restoreFolder();
            }).then(function(restored) {
                if (!restored) {
                    FrameTrail.changeState('storageMode', 'needsFolder');
                }
                _initialized = true;
                return _currentAdapter;
            }).catch(function() {
                FrameTrail.changeState('storageMode', 'needsFolder');
                _initialized = true;
                return _currentAdapter;
            });
        } else {
            // No File System Access API — use Download adapter so inline-data
            // init options work (view + edit + download-to-save), instead of
            // hard-failing.
            _currentAdapter = _downloadAdapter;
            FrameTrail.changeState('storageMode', 'download');
            _initialized = true;
            return Promise.resolve(_currentAdapter);
        }
    }


    /**
     * Open the folder used last. When that needs asking for permission (a
     * click), remember it for the storage dialog's Reopen.
     * @private
     */
    function _restoreFolder() {
        return _localAdapter.restoreHandle().then(function(restored) {
            if (restored) {
                _currentAdapter = _localAdapter;
                FrameTrail.changeState('storageMode', 'local');
                return true;
            }
            return StorageAdapter.getStored('root').then(function(handle) {
                if (handle) { _remembered = { kind: 'local', handle: handle }; }
                return false;
            });
        });
    }


    /**
     * Open the project file used last, as _restoreFolder does the folder.
     * @private
     */
    function _restoreFile() {
        return StorageAdapter.getStored('file').then(function(handle) {
            if (!handle) { return false; }
            return _fileAdapter.init(handle, { ask: false }).then(function() {
                _enterFileMode(_fileAdapter);
                return true;
            }, function() {
                _remembered = { kind: 'file', handle: handle };
                return false;
            });
        });
    }


    /**
     * Whether this page is a page in the portable HTML format opened from
     * disk, which can be saved into its own file.
     * @private
     */
    function _isPageFile() {
        return !!_fileAdapter && window.location.protocol === 'file:' && !!FrameTrail.getState('bundle');
    }

    /** @private */
    function _pageFileName() {
        return decodeURIComponent(window.location.pathname.split('/').pop());
    }

    /** @private */
    function _pageKey() {
        return 'page:' + decodeURIComponent(window.location.pathname);
    }

    // The data block this page was started from, as it is in the page (the
    // parser turns CRLF into LF; so do we, on both sides).
    function _pageBlockText() {
        var block = document.querySelector('script[type="application/ld+json" i][data-frametrail]');
        return block ? block.textContent.replace(/\r\n?/g, '\n') : null;
    }

    // Whether a file still holds the data this page was loaded with.
    function _holdsThisPage(handle) {
        return handle.getFile().then(function(file) { return file.text(); }).then(function(text) {
            var block = FrameTrailHTMLFormat.firstBlockText(text);
            return block !== null && block.replace(/\r\n?/g, '\n') === _pageBlockText();
        });
    }


    /**
     * A page opened from disk that was saved into its own file before: open
     * that file, if it may be written without asking and still holds what the
     * page was loaded with. Otherwise the page runs in memory as before, and
     * its first "Save to this file" asks for permission.
     * @private
     */
    function _restorePageFile() {
        if (!_isPageFile()) { return Promise.resolve(false); }
        return StorageAdapter.getStored(_pageKey()).then(function(handle) {
            if (!handle) { return false; }
            _pageHandle = handle;
            return handle.queryPermission({ mode: 'readwrite' }).then(function(state) {
                if (state !== 'granted') { return false; }
                return _holdsThisPage(handle).then(function(same) {
                    if (!same) { return false; }
                    return _fileAdapter.init(handle, { ask: false }).then(function() {
                        _enterFileMode(_fileAdapter);
                        return true;
                    });
                });
            });
        }).catch(function(error) {
            console.log('Could not open the file of this page:', error);
            return false;
        });
    }


    /**
     * An opened file adapter becomes the current one. A project file's
     * datapath is applied when it is a URL: a relative one is relative to the
     * file, whose location only a page opened from the file knows (and that
     * page has it already, from its own data block).
     * @private
     */
    function _enterFileMode(adapter) {
        // Who is editing (a guest's name, see UserManagement.loginAsGuest) goes along.
        if (_currentAdapter && _currentAdapter !== adapter && _currentAdapter.userInfo && _currentAdapter.userInfo.id) {
            adapter.setUserInfo(_currentAdapter.userInfo);
        }
        _fileAdapter    = adapter;
        _currentAdapter = adapter;
        if (/^https?:/i.test(_fileAdapter.datapath || '')) {
            FrameTrail.changeState('dataPath', _fileAdapter.datapath);
        }
        FrameTrail.changeState('storageMode', 'file');
    }


    /**
     * Get the current read/write adapter.
     * @method getAdapter
     * @return {StorageAdapter}
     */
    function getAdapter() {
        return _currentAdapter;
    }


    /**
     * @method getServerAdapter
     * @return {StorageAdapterServer}
     */
    function getServerAdapter() {
        return _serverAdapter;
    }


    /**
     * @method getLocalAdapter
     * @return {StorageAdapterLocal}
     */
    function getLocalAdapter() {
        return _localAdapter;
    }


    /**
     * @method getDownloadAdapter
     * @return {StorageAdapterDownload}
     */
    function getDownloadAdapter() {
        return _downloadAdapter;
    }


    /**
     * Switch to local filesystem storage.
     * Prompts user to select a folder via the File System Access API.
     *
     * @method switchToLocal
     * @return {Promise<StorageAdapterLocal>}
     */
    function switchToLocal() {
        if (!StorageAdapterLocal.isSupported()) {
            return Promise.reject(new Error('File System Access API not supported'));
        }
        return _localAdapter.init().then(function() {
            return _localAdapter.persistHandle();
        }).then(function() {
            return StorageAdapter.setStored('mode', 'local');
        }).then(function() {
            _currentAdapter = _localAdapter;
            FrameTrail.changeState('storageMode', 'local');
            return _localAdapter;
        });
    }


    /**
     * Switch to server storage.
     * Requires PHP server to be available and user to be logged in.
     *
     * @method switchToServer
     * @return {Promise<StorageAdapterServer>}
     */
    function switchToServer() {
        if (!FrameTrail.module('RouteNavigation').hasServer()) {
            return Promise.reject(new Error('No server available'));
        }
        _currentAdapter = _serverAdapter;
        FrameTrail.changeState('storageMode', 'server');
        return Promise.resolve(_serverAdapter);
    }


    /* ------------------------------------------------------------------ */
    /*  Project files                                                     */
    /* ------------------------------------------------------------------ */

    function escapeHTML(text) {
        return String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }

    function pickerTypes() {
        return [{ description: labels['ProjectFileType'], accept: { 'text/html': ['.html', '.htm'] } }];
    }

    function titleOf(handle) {
        return handle.name.replace(/\.html?$/i, '');
    }

    // Asking for permission (or opening a picker) needs a click; a picker the
    // user took long over may have outlived the one that opened it.
    function needsClick(error) {
        return !!error && (error.name === 'SecurityError' || error.name === 'NotAllowedError');
    }

    /**
     * A small dialog with one button, for an action that needs a click of its
     * own: asking for permission to write a file, and so on.
     * @private
     */
    function confirmWithClick(message, buttonText, action) {
        return new Promise(function(resolve, reject) {
            var content = document.createElement('div'),
                done    = false,
                ctrl;
            content.innerHTML = '<p>' + message + '</p>';
            ctrl = Dialog({
                title:   labels['ProjectFile'],
                icon:    'icon-doc',
                content: content,
                modal:   true,
                width:   450,
                buttons: [
                    { text: buttonText, click: function() {
                        done = true;
                        ctrl.close();
                        action().then(resolve, reject);
                    } },
                    { text: labels['GenericCancel'], click: function() { ctrl.close(); } }
                ],
                close: function() {
                    ctrl.destroy();
                    if (!done) { var e = new Error('Cancelled'); e.name = 'AbortError'; reject(e); }
                }
            });
        });
    }

    /**
     * Ask where FrameTrail comes from in a new page: 'cdn' (loaded from the
     * web) or 'inline' (inside the file). Resolves in the click of the
     * dialog's button, so a picker may follow.
     * @private
     */
    function chooseLibrary(buttonText) {
        return new Promise(function(resolve, reject) {
            var content = document.createElement('div'),
                done    = false,
                ctrl;
            content.innerHTML = '<p>' + labels['NewPageLibraryDescription'] + '</p>'
                + '<small>' + labels['DownloadLibrary'] + '</small>'
                + '<div style="display: flex; flex-wrap: wrap; gap: 4px 12px; margin-top: 4px;">'
                + '<label><input type="radio" name="newPageLibrary" value="cdn" checked> ' + labels['DownloadLibraryCDN'] + '</label>'
                + '<label><input type="radio" name="newPageLibrary" value="inline"> ' + labels['DownloadLibraryInline'] + '</label>'
                + '</div>';
            ctrl = Dialog({
                title:   labels['ProjectFile'],
                icon:    'icon-doc',
                content: content,
                modal:   true,
                width:   450,
                buttons: [
                    { text: buttonText || labels['GenericContinue'], click: function() {
                        done = true;
                        var scripts = content.querySelector('[name="newPageLibrary"]:checked').value;
                        ctrl.close();
                        resolve(scripts);
                    } },
                    { text: labels['GenericCancel'], click: function() { ctrl.close(); } }
                ],
                close: function() {
                    ctrl.destroy();
                    if (!done) { var e = new Error('Cancelled'); e.name = 'AbortError'; reject(e); }
                }
            });
        });
    }

    // The FrameTrail library for a new page (see BundleExport.library).
    function library(scripts) {
        var BundleExport = FrameTrail.module('BundleExport');
        return BundleExport ? BundleExport.library(scripts) : Promise.resolve(FrameTrailHTMLFormat.cdnLibrary());
    }


    /**
     * Open a project file with a file adapter of its own (asking for
     * permission with a click of its own if the one that started it has
     * lapsed), remember it and make it the current storage. Until then the
     * current storage stays as it is, also when opening fails.
     * @private
     */
    function openFile(handle, options) {
        var adapter = new StorageAdapterHTMLFile();
        return adapter.init(handle, options).catch(function(error) {
            if (!needsClick(error)) { throw error; }
            return confirmWithClick(labels['ProjectFileAllowEditing'].replace('%s', escapeHTML(handle.name)), labels['ProjectFileAllow'], function() {
                return adapter.init(handle, options);
            });
        }).then(function() {
            return rememberFile(handle);
        }).then(function() {
            _remembered = null;
            _enterFileMode(adapter);
            return adapter;
        });
    }

    // The file of this page is remembered for this page; any other file as
    // the one to open next time instead of a folder.
    function rememberFile(handle) {
        var remember = (_isPageFile() && handle.name === _pageFileName())
                     ? StorageAdapter.setStored(_pageKey(), handle).then(function() { _pageHandle = handle; })
                     : StorageAdapter.setStored('file', handle).then(function() { return StorageAdapter.setStored('mode', 'file'); });
        return remember.catch(function(error) {
            console.log('Could not remember the project file:', error);
        });
    }


    /**
     * Open a project file chosen by the user: a page in the portable HTML
     * format, edited and saved in place. An empty file becomes a new project.
     *
     * @method openProjectFile
     * @return {Promise<StorageAdapterHTMLFile>}
     */
    function openProjectFile() {
        if (!_fileAdapter) {
            return Promise.reject(new Error('File System Access API not supported'));
        }
        return window.showOpenFilePicker({ types: pickerTypes(), multiple: false }).then(function(handles) {
            var handle = handles[0];
            return StorageAdapterHTMLFile.inspect(handle).then(function(info) {
                if (info.project) { return {}; }
                if (!info.empty) { throw new Error(labels['ErrorNotAProjectFile']); }
                return chooseLibrary().then(library).then(function(lib) {
                    return { library: lib, title: titleOf(handle) };
                });
            }).then(function(options) {
                return openFile(handle, options);
            });
        });
    }


    /**
     * Create a new project file: an empty project in a page in the portable
     * HTML format, after asking where the page gets FrameTrail from.
     *
     * @method newProjectFile
     * @return {Promise<StorageAdapterHTMLFile>}
     */
    function newProjectFile() {
        if (!_fileAdapter) {
            return Promise.reject(new Error('File System Access API not supported'));
        }
        return chooseLibrary(labels['NewProjectFileCreate']).then(function(scripts) {
            return window.showSaveFilePicker({ suggestedName: 'frametrail-project.html', types: pickerTypes() }).then(function(handle) {
                return library(scripts).then(function(lib) {
                    return openFile(handle, { files: FrameTrailHTMLFormat.emptyProject(), library: lib, title: titleOf(handle), datapath: './' });
                });
            });
        });
    }


    /**
     * Save the project as it is now (see BundleExport.collectFolder) into a
     * project file and go on editing it there: this page's own file when the
     * page was opened from disk (asked for once, then remembered), else a file
     * the user chooses. A chosen page in the format keeps everything but its
     * data block; a new file asks where its page gets FrameTrail from.
     *
     * @method saveToFile
     * @return {Promise<StorageAdapterHTMLFile>}
     */
    function saveToFile() {

        if (!_fileAdapter) {
            return Promise.reject(new Error('File System Access API not supported'));
        }

        var config        = FrameTrail.module('Database').config || {},
            suggestedName = _isPageFile() ? _pageFileName()
                          : String(config.overviewTitle || 'frametrail-project').replace(/[^a-z0-9]/gi, '_').substring(0, 50) + '.html';

        function pick() {
            return window.showSaveFilePicker({ suggestedName: suggestedName, types: pickerTypes() });
        }

        // This page's file, remembered before: if it still holds what the page
        // was loaded with; otherwise (another tab saved it meanwhile) the
        // user decides in the picker.
        var chosen = (_pageHandle && _isPageFile() && FrameTrail.getState('storageMode') === 'download')
                   ? _pageHandle.requestPermission({ mode: 'readwrite' }).then(function(state) {
                         if (state !== 'granted') { return pick(); }
                         return _holdsThisPage(_pageHandle).then(function(same) { return same ? _pageHandle : pick(); });
                     }, pick)
                   : pick();

        return chosen.then(function(handle) {
            return StorageAdapterHTMLFile.inspect(handle).then(function(info) {
                return Promise.all([
                    info.project ? null : chooseLibrary().then(library),
                    FrameTrail.module('BundleExport').collectFolder('project')
                ]).then(function(parts) {
                    // Relative media paths resolve against the datapath: a URL
                    // travels; a relative one is kept for the page's own file
                    // and a new page (most likely beside this one).
                    var current  = FrameTrail.getState('dataPath'),
                        datapath = /^https?:/i.test(current || '') ? current
                                 : info.project ? undefined
                                 : (current || './');
                    return openFile(handle, { files: parts[1], library: parts[0], title: titleOf(handle), datapath: datapath });
                });
            });
        });

    }


    /**
     * Open the folder or project file of an earlier session again, asking
     * for permission (call me from a click).
     *
     * @method reopen
     * @return {Promise}
     */
    function reopen() {
        var remembered = _remembered;
        if (!remembered) {
            return Promise.reject(new Error('Nothing to reopen'));
        }
        if (remembered.kind === 'file') {
            return openFile(remembered.handle, {});
        }
        return _localAdapter.init(remembered.handle).then(function() {
            return StorageAdapter.setStored('mode', 'local');
        }).then(function() {
            _remembered = null;
            _currentAdapter = _localAdapter;
            FrameTrail.changeState('storageMode', 'local');
            return _localAdapter;
        });
    }


    /**
     * The dialog for choosing where the project is: a local folder or a
     * project file — reopen the one of an earlier session, select a folder,
     * open a project file, create a new one. Resolves with the storage mode
     * once one is open; rejects when closed (options.closable).
     *
     * @method openStorageDialog
     * @param {Object} [options] { closable, allowNew }
     * @return {Promise<String>}
     */
    function openStorageDialog(options) {

        options = options || {};

        return new Promise(function(resolve, reject) {

            var mode    = FrameTrail.getState('storageMode'),
                current = (mode === 'file') ? { kind: 'file', name: _fileAdapter.fileName }
                        : (mode === 'local') ? { kind: 'local', name: getFolderName() }
                        : _remembered ? { kind: _remembered.kind, name: _remembered.handle.name }
                        : null,
                done    = false,
                buttons = [],
                ctrl, message;

            var content = document.createElement('div');
            content.className = 'folderPromptDialog';
            content.innerHTML = '<p>' + labels[_fileAdapter ? 'StorageDialogDescription' : 'SelectDataFolderDescription'] + '</p>'
                + (current && current.name
                    ? '<p style="margin-top:8px; color:#666;">' + labels[current.kind === 'file' ? 'CurrentProjectFile' : 'CurrentFolder'] + ': <strong>' + escapeHTML(current.name) + '</strong></p>'
                    : '');

            function run(action) {
                message.classList.remove('active');
                action().then(function() {
                    done = true;
                    ctrl.close();
                    resolve(FrameTrail.getState('storageMode'));
                }).catch(function(error) {
                    if (error && error.name === 'AbortError') { return; }   // a picker or question cancelled
                    message.textContent = (error && error.message) || String(error);
                    message.classList.add('active');
                });
            }

            if (_remembered) {
                buttons.push({ text: labels['StorageReopen'].replace('%s', _remembered.handle.name), click: function() { run(reopen); } });
            }
            buttons.push({ text: labels['SelectFolder'], click: function() { run(switchToLocal); } });
            if (_fileAdapter) {
                buttons.push({ text: labels['OpenProjectFile'], click: function() { run(openProjectFile); } });
                if (options.allowNew !== false) {
                    buttons.push({ text: labels['NewProjectFile'], click: function() { run(newProjectFile); } });
                }
            }

            ctrl = Dialog({
                title:         labels[_fileAdapter ? 'StorageDialogTitle' : 'SelectDataFolder'],
                icon:          'icon-folder-open',
                content:       content,
                modal:         true,
                width:         520,
                closeOnEscape: !!options.closable,
                buttons:       buttons,
                close: function() {
                    ctrl.destroy();
                    if (done) { return; }
                    // A click on the backdrop closes any modal dialog; one
                    // that may not be closed comes back.
                    if (options.closable) { reject(new Error('Cancelled')); }
                    else { openStorageDialog(options).then(resolve, reject); }
                }
            });

            message = document.createElement('div');
            message.className = 'message error';
            message.style.flexBasis = '100%';
            ctrl.widget().querySelector('.ft-dialog-buttonpane').prepend(message);

        });

    }


    /**
     * Check if save is possible with the current adapter.
     * @method canSave
     * @return {Boolean}
     */
    function canSave() {
        if (!_currentAdapter) return false;

        if (_currentAdapter.type === 'server') {
            return FrameTrail.getState('loggedIn') &&
                   !FrameTrail.module('UserManagement').isGuestMode();
        }
        return _currentAdapter.canSave;
    }


    /**
     * Check if server save is available (server present, user logged in, and not in guest mode).
     * @method canSaveToServer
     * @return {Boolean}
     */
    function canSaveToServer() {
        return FrameTrail.module('RouteNavigation').hasServer() &&
               FrameTrail.getState('loggedIn') &&
               !FrameTrail.module('UserManagement').isGuestMode();
    }


    /**
     * Check if local filesystem save is available (API supported).
     * @method canSaveToLocal
     * @return {Boolean}
     */
    function canSaveToLocal() {
        return StorageAdapterLocal.isSupported();
    }


    /**
     * Whether the project can be saved into a project file (saveToFile): the
     * File System Access API is there and the instance has no server.
     * @method canSaveToFile
     * @return {Boolean}
     */
    function canSaveToFile() {
        return !!_fileAdapter && !FrameTrail.module('RouteNavigation').hasServer();
    }


    /**
     * Whether this page, a page in the portable HTML format opened from disk
     * and running in memory, can be saved into its own file (saveToFile).
     * @method canSaveToPageFile
     * @return {Boolean}
     */
    function canSaveToPageFile() {
        return _isPageFile() && FrameTrail.getState('storageMode') === 'download';
    }


    /**
     * Whether this page is a page in the portable HTML format opened from
     * disk (it may be saved into its own file, see saveToFile).
     * @method isPageFile
     * @return {Boolean}
     */
    function isPageFile() {
        return _isPageFile();
    }


    /**
     * Whether the data is on this computer and read and written through the
     * adapter: a local folder ('local') or a project file ('file').
     * @method isLocal
     * @return {Boolean}
     */
    function isLocal() {
        var mode = FrameTrail.getState('storageMode');
        return mode === 'local' || mode === 'file';
    }


    /**
     * Get current user info from the active adapter.
     * @method getCurrentUserInfo
     * @return {Object|null}
     */
    function getCurrentUserInfo() {
        if (_currentAdapter) {
            return _currentAdapter.userInfo;
        }
        return null;
    }


    /**
     * Get the name of the currently selected local folder (if any).
     * @method getFolderName
     * @return {String|null}
     */
    function getFolderName() {
        if (_localAdapter) {
            return _localAdapter.folderName;
        }
        return null;
    }


    /**
     * Get the name of the open project file (if any).
     * @method getFileName
     * @return {String|null}
     */
    function getFileName() {
        return _fileAdapter ? _fileAdapter.fileName : null;
    }


    /**
     * @method getStaticAdapter
     * @return {StorageAdapterStatic|null}
     */
    function getStaticAdapter() {
        return _staticAdapter;
    }


    /**
     * @method getFileAdapter
     * @return {StorageAdapterHTMLFile|null}
     */
    function getFileAdapter() {
        return _fileAdapter;
    }


    /**
     * POST a form body to the PHP backend and resolve with the parsed JSON.
     *
     * Every server action needs the same three things — the resolved endpoint,
     * the dataPath telling PHP which _data directory to use, and a JSON parse —
     * so they live here once rather than in a private copy per module.
     *
     * I resolve with whatever the server replied, including failures: an action
     * that reports "code": 4 is a well-formed answer, not a transport error.
     * Callers branch on the code themselves. I reject only when there is no
     * server configured, or the request never completed.
     *
     * @method serverPost
     * @param {FormData|URLSearchParams} body
     * @return {Promise<Object>}
     */
    function serverPost(body) {

        var serverURL = FrameTrail.module('RouteNavigation').resolveServerURL('ajaxServer.php');
        if (!serverURL) return Promise.reject(new Error('No server configured'));

        var adapter = getAdapter();
        if (adapter && adapter.dataPathAbsolute) body.append('dataPath', adapter.dataPathAbsolute);

        return fetch(serverURL, {
            method: 'POST',
            cache:  'no-cache',
            body:   body
        }).then(function(r) { return r.json(); });

    }


    /**
     * I return the URL of a route of a server extension (_server/extension.php
     * ?e=<name>&r=<route>), with the dataPath the server needs to find this
     * instance's data, or null when there is no server.
     *
     * Actions of a server extension go through serverPost() like FrameTrail's
     * own; routes are for answers that need their own HTTP semantics.
     *
     * @method extensionURL
     * @param {String} name   the extension's name
     * @param {String} route
     * @return {String|null}
     */
    function extensionURL(name, route) {

        var serverURL = FrameTrail.module('RouteNavigation').resolveServerURL('extension.php');
        if (!serverURL) return null;

        var params  = new URLSearchParams({ e: name, r: route }),
            adapter = getAdapter();
        if (adapter && adapter.dataPathAbsolute) params.append('dataPath', adapter.dataPathAbsolute);

        return serverURL + '?' + params.toString();

    }


    return {
        init:               init,
        serverPost:         serverPost,
        extensionURL:       extensionURL,
        getAdapter:         getAdapter,
        getServerAdapter:   getServerAdapter,
        getStaticAdapter:   getStaticAdapter,
        getLocalAdapter:    getLocalAdapter,
        getDownloadAdapter: getDownloadAdapter,
        getFileAdapter:     getFileAdapter,
        switchToLocal:      switchToLocal,
        switchToServer:     switchToServer,
        openProjectFile:    openProjectFile,
        newProjectFile:     newProjectFile,
        saveToFile:         saveToFile,
        reopen:             reopen,
        openStorageDialog:  openStorageDialog,
        isLocal:            isLocal,
        isPageFile:         isPageFile,
        canSave:            canSave,
        canSaveToServer:    canSaveToServer,
        canSaveToLocal:     canSaveToLocal,
        canSaveToFile:      canSaveToFile,
        canSaveToPageFile:  canSaveToPageFile,
        getCurrentUserInfo: getCurrentUserInfo,
        getFolderName:      getFolderName,
        getFileName:        getFileName
    };

});
