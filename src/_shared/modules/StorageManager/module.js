/**
 * @module Shared
 */

/**
 * I manage storage adapters and provide a unified interface for reading/writing data.
 *
 * I determine the appropriate storage backend (server, local filesystem, or download)
 * based on the environment and user actions. Modules use me to get the current adapter
 * for storage operations.
 *
 * @class StorageManager
 * @static
 */

FrameTrail.defineModule('StorageManager', function(FrameTrail) {

    var _currentAdapter = null,
        _serverAdapter = null,
        _staticAdapter = null,
        _localAdapter = null,
        _downloadAdapter = null,
        _initialized = false;


    /**
     * Initialize storage system. Determines the default adapter based on environment
     * and the `dataPath` / `server` init options.
     *
     * Decision order:
     *   1. Shorthand API (videoElement/videoSource) or inline contents → download (in-memory)
     *   2. `server` option provided → probe PHP at that URL → server mode
     *   3. `server` omitted + `dataPath` provided → static mode (CDN, in-memory edits)
     *   4. Neither provided + HTTP(S) → auto-detect PHP at '_server/' → server or local
     *   5. file:// → try to restore local folder handle
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

        var serverOption   = FrameTrail.getState('server');
        var dataPathOption = FrameTrail.getState('dataPath');
        var onHTTP         = FrameTrail.module('RouteNavigation').environment.server;

        // 1. Shorthand API or full inline data — no server or folder needed
        if (FrameTrail.getState('videoElement') || FrameTrail.getState('videoSource') ||
                FrameTrail.getState('contents') !== null) {
            _currentAdapter = _downloadAdapter;
            FrameTrail.changeState('storageMode', 'download');
            _initialized = true;
            return Promise.resolve(_currentAdapter);
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
     * Try to restore a local folder handle.
     * If File System Access API is supported but no handle exists, signal 'needsFolder'.
     * If API is not supported, signal 'noStorage'.
     * @private
     */
    function _tryLocal() {
        if (StorageAdapterLocal.isSupported()) {
            return _localAdapter.restoreHandle().then(function(restored) {
                if (restored) {
                    _currentAdapter = _localAdapter;
                    FrameTrail.changeState('storageMode', 'local');
                } else {
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
     * @method getStaticAdapter
     * @return {StorageAdapterStatic|null}
     */
    function getStaticAdapter() {
        return _staticAdapter;
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


    return {
        init:               init,
        serverPost:         serverPost,
        getAdapter:         getAdapter,
        getServerAdapter:   getServerAdapter,
        getStaticAdapter:   getStaticAdapter,
        getLocalAdapter:    getLocalAdapter,
        getDownloadAdapter: getDownloadAdapter,
        switchToLocal:      switchToLocal,
        switchToServer:     switchToServer,
        canSave:            canSave,
        canSaveToServer:    canSaveToServer,
        canSaveToLocal:     canSaveToLocal,
        getCurrentUserInfo: getCurrentUserInfo,
        getFolderName:      getFolderName
    };

});
