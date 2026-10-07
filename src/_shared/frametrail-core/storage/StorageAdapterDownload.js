/**
 * @module Shared
 */

/**
 * Storage adapter for the in-memory modes ('download', and 'static' through
 * StorageAdapterStatic): used when there is neither a server nor the File
 * System Access API (Firefox, Safari). Stores data in memory; work leaves the
 * page through Save As (see BundleExport).
 *
 * @class StorageAdapterDownload
 * @extends StorageAdapter
 */

class StorageAdapterDownload extends StorageAdapter {

    constructor() {
        super();
        this._data = {};  // In-memory cache
        this._userInfo = {};  // Set by UserManagement after guest login
    }

    get type() { return 'download'; }
    get displayName() { return 'Download'; }
    get canSave() { return false; }  // In-memory only — no persistent save target; use Save As / download
    get userInfo() { return this._userInfo; }

    /**
     * Update the stored user info (called from UserManagement after guest login).
     * @param {Object} info - User info object {id, name, role, color}
     */
    setUserInfo(info) {
        this._userInfo = info;
    }

    async init() {
        return true;
    }

    async readJSON(path) {
        if (this._data[path]) {
            return this._data[path];
        }
        throw new Error('File not in memory: ' + path);
    }

    async readText(path) {
        if (this._data[path]) {
            return this._data[path];
        }
        throw new Error('File not in memory: ' + path);
    }

    async writeJSON(path, data) {
        this._data[path] = data;
    }

    async exists(path) {
        return path in this._data;
    }

    async createDirectory(path) {
        // No-op for in-memory storage
    }

}
