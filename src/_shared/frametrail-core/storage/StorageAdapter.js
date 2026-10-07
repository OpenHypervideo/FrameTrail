/**
 * @module Shared
 */

/**
 * Base class for storage adapters.
 * Provides the interface that all storage backends must implement.
 *
 * @class StorageAdapter
 */

class StorageAdapter {

    constructor() {
        this._userInfo = null;
    }

    /** @return {String} Adapter type identifier */
    get type() { return 'base'; }

    /** @return {String} Human-readable name for UI */
    get displayName() { return 'Base Storage'; }

    /** @return {Boolean} Whether this adapter can persist writes */
    get canSave() { return false; }

    /** @return {Object|null} User info for this storage context */
    get userInfo() { return this._userInfo; }

    /**
     * Read a JSON file from storage.
     * @param {String} path - Relative path (e.g. 'config.json', 'hypervideos/1/hypervideo.json')
     * @return {Promise<Object>} Parsed JSON data
     */
    async readJSON(path) { throw new Error('Not implemented'); }

    /**
     * Read a raw text file from storage (e.g. VTT subtitles, CSS).
     * @param {String} path - Relative path
     * @return {Promise<String>} Raw text content
     */
    async readText(path) { throw new Error('Not implemented'); }

    /**
     * Check if a file exists in storage.
     * @param {String} path - Relative path
     * @return {Promise<Boolean>}
     */
    async exists(path) { throw new Error('Not implemented'); }

    /**
     * Write JSON data to storage.
     * @param {String} path - Relative path
     * @param {Object} data - Data to write
     * @return {Promise<void>}
     */
    async writeJSON(path, data) { throw new Error('Not implemented'); }

    /**
     * Create a directory in storage.
     * @param {String} path - Directory path
     * @return {Promise<void>}
     */
    async createDirectory(path) { throw new Error('Not implemented'); }

    /**
     * Initialize the adapter. Must be called before use.
     * @return {Promise<Boolean>}
     */
    async init() { throw new Error('Not implemented'); }

    /**
     * Read a value remembered across sessions: a handle of the File System
     * Access API (a folder or a project file) or a short string, in the
     * IndexedDB store 'frametrail-storage' / 'handles'.
     * @param {String} key
     * @return {Promise<*>} undefined when there is none
     */
    static async getStored(key) {
        var db = await StorageAdapter._handleDB();
        return new Promise(function(resolve, reject) {
            var request = db.transaction('handles', 'readonly').objectStore('handles').get(key);
            request.onsuccess = function() { resolve(request.result); };
            request.onerror = function() { reject(request.error); };
        });
    }

    /**
     * Remember a value across sessions (see getStored); undefined forgets it.
     * @param {String} key
     * @param {*} value
     * @return {Promise<void>}
     */
    static async setStored(key, value) {
        var db = await StorageAdapter._handleDB();
        return new Promise(function(resolve, reject) {
            var tx    = db.transaction('handles', 'readwrite'),
                store = tx.objectStore('handles');
            if (value === undefined) { store.delete(key); } else { store.put(value, key); }
            tx.oncomplete = function() { resolve(); };
            tx.onerror = function() { reject(tx.error); };
        });
    }

    /** @private */
    static _handleDB() {
        return new Promise(function(resolve, reject) {
            var request = indexedDB.open('frametrail-storage', 1);
            request.onerror = function() { reject(request.error); };
            request.onsuccess = function() { resolve(request.result); };
            request.onupgradeneeded = function(e) {
                e.target.result.createObjectStore('handles');
            };
        });
    }

}
