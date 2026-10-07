/**
 * @module Shared
 */

/**
 * Storage adapter for local filesystem via File System Access API.
 * Requires Chrome 86+ or Edge 86+.
 *
 * Mirrors the server _data/ folder structure locally:
 *   my-project/
 *   ├── config.json
 *   ├── users.json
 *   ├── resources/_index.json
 *   └── hypervideos/
 *       ├── _index.json
 *       └── {id}/hypervideo.json, annotations/, subtitles/
 *
 * @class StorageAdapterLocal
 * @extends StorageAdapter
 */

class StorageAdapterLocal extends StorageAdapter {

    constructor() {
        super();
        this._rootHandle = null;
        this._blobURLCache = {};  // path -> blob URL mapping
        this._seenVersions = {};     // path -> version when this adapter last read or wrote the file
        this._writtenVersions = {};  // path -> version when this adapter last wrote the file
    }

    get type() { return 'local'; }
    get displayName() { return 'Local Folder'; }
    get canSave() { return this._rootHandle !== null; }
    get folderName() { return this._rootHandle ? this._rootHandle.name : null; }
    get userInfo() { return this._userInfo || {}; }

    static isSupported() {
        return 'showDirectoryPicker' in window;
    }

    /**
     * Initialize the local adapter.
     * @param {FileSystemDirectoryHandle} [existingHandle] - Restored handle from IndexedDB
     * @return {Promise<Boolean>}
     */
    async init(existingHandle) {
        if (existingHandle) {
            this._rootHandle = existingHandle;
            var permission = await this._rootHandle.requestPermission({ mode: 'readwrite' });
            if (permission !== 'granted') {
                throw new Error('Permission denied');
            }
        } else {
            this._rootHandle = await window.showDirectoryPicker({ mode: 'readwrite' });
        }

        // Check if folder is empty and scaffold if needed
        var isEmpty = true;
        for await (var entry of this._rootHandle.values()) {
            isEmpty = false;
            break;
        }
        if (isEmpty) {
            await this._scaffoldEmptyProject();
        }

        return true;
    }

    /**
     * Update the stored user info (called from UserManagement after guest login).
     * @param {Object} info - User info object {id, name, role, color}
     */
    setUserInfo(info) {
        this._userInfo = info;
    }

    /**
     * Create minimum project structure in an empty folder.
     * @private
     */
    async _scaffoldEmptyProject() {
        var defaultConfig = {
            'areaTopVisible': true,
            'areaBottomVisible': true,
            'areaLeftVisible': false,
            'areaRightVisible': false,
            'defaultTheme': '',
            'userNeedsConfirmation': false,
            'allowUploads': false,
            'allowCaching': false
        };

        await this.writeJSON('config.json', defaultConfig);
        await this.writeJSON('users.json', { 'user-increment': 1, 'user': {} });
        await this.createDirectory('hypervideos');
        await this.writeJSON('hypervideos/_index.json', { 'hypervideo-increment': 0, 'hypervideos': {} });
        await this.createDirectory('resources');
        await this.writeJSON('resources/_index.json', { 'resources': {} });
    }

    async readJSON(path) {
        var handle = await this._getFileHandle(path, false);
        var file = await handle.getFile();
        var text = await file.text();
        this._seenVersions[StorageAdapterLocal._key(path)] = StorageAdapterLocal._versionOf(file);
        return JSON.parse(text);
    }

    async writeJSON(path, data) {
        var handle = await this._getFileHandle(path, true);
        var writable = await handle.createWritable();
        await writable.write(JSON.stringify(data, null, 4));
        await writable.close();
        await this._noteWrite(path, handle);
    }

    /**
     * The version of a file: its modification time and size. The size tells two writes apart on file systems whose timestamps are coarse (FAT and exFAT count in 2 s steps).
     * @param {File} file
     * @return {String}
     * @private
     */
    static _versionOf(file) {
        return file.lastModified + ':' + file.size;
    }

    /**
     * The key of a path in the version maps: the same file is reached as 'hypervideos/./9/…' (index entries are './9') and as 'hypervideos/9/…'.
     * @private
     */
    static _key(path) {
        return path.split('/').filter(function(p) { return p && p !== '.'; }).join('/');
    }

    /**
     * Remember the version a write of this adapter left behind, so a later change can be told apart from our own.
     * @private
     */
    async _noteWrite(path, handle) {
        var version = StorageAdapterLocal._versionOf(await handle.getFile());
        this._seenVersions[StorageAdapterLocal._key(path)] = version;
        this._writtenVersions[StorageAdapterLocal._key(path)] = version;
    }

    /**
     * The current version of a file, read from the folder without reading its contents.
     * @param {String} path - Relative path
     * @return {Promise<String|null>} null when the file does not exist
     */
    async fileVersion(path) {
        try {
            var handle = await this._getFileHandle(path, false);
            return StorageAdapterLocal._versionOf(await handle.getFile());
        } catch (e) {
            return null;
        }
    }

    /**
     * The version of a file when this adapter last read or wrote it.
     * @param {String} path - Relative path
     * @return {String|null} null when it has done neither
     */
    seenVersion(path) {
        return this._seenVersions[StorageAdapterLocal._key(path)] || null;
    }

    /**
     * The version of a file when this adapter last wrote it.
     * @param {String} path - Relative path
     * @return {String|null} null when it has not written it
     */
    writtenVersion(path) {
        return this._writtenVersions[StorageAdapterLocal._key(path)] || null;
    }

    /**
     * Whether a file is still as this adapter last read or wrote it, i.e. nothing else has written it since.
     * A file the adapter has not seen, or one that no longer exists, counts as unchanged.
     * @param {String} path - Relative path
     * @return {Promise<Boolean>}
     */
    async isUnchanged(path) {
        var seen = this.seenVersion(path);
        if (!seen) return true;
        var current = await this.fileVersion(path);
        return current === null || current === seen;
    }

    async exists(path) {
        try {
            await this._getFileHandle(path, false);
            return true;
        } catch (e) {
            return false;
        }
    }

    async createDirectory(path) {
        var parts = path.split('/').filter(function(p) { return p && p !== '.'; });
        var dir = this._rootHandle;
        for (var i = 0; i < parts.length; i++) {
            dir = await dir.getDirectoryHandle(parts[i], { create: true });
        }
        return dir;
    }

    /**
     * Navigate the directory tree to get a file handle.
     * @private
     */
    async _getFileHandle(path, create) {
        var parts = path.split('/').filter(function(p) { return p && p !== '.'; });
        var filename = parts.pop();

        var dir = this._rootHandle;
        for (var i = 0; i < parts.length; i++) {
            dir = await dir.getDirectoryHandle(parts[i], { create: create });
        }
        return await dir.getFileHandle(filename, { create: create });
    }

    /**
     * Delete a file from the local filesystem and revoke its cached blob URL.
     * @param {String} path - Relative path (e.g. 'resources/myfile.jpg')
     * @return {Promise<void>}
     */
    async deleteFile(path) {
        var parts = path.split('/').filter(function(p) { return p && p !== '.'; });
        var filename = parts.pop();

        var dir = this._rootHandle;
        for (var i = 0; i < parts.length; i++) {
            dir = await dir.getDirectoryHandle(parts[i], { create: false });
        }
        await dir.removeEntry(filename);

        delete this._seenVersions[StorageAdapterLocal._key(path)];
        delete this._writtenVersions[StorageAdapterLocal._key(path)];

        // Revoke cached blob URL if any
        if (this._blobURLCache[path]) {
            URL.revokeObjectURL(this._blobURLCache[path]);
            delete this._blobURLCache[path];
        }
    }

    /**
     * Delete a directory and all its contents recursively.
     * @param {String} path - Relative path (e.g. 'hypervideos/3')
     * @return {Promise<void>}
     */
    async deleteDirectory(path) {
        var parts = path.split('/').filter(function(p) { return p && p !== '.'; });
        var dirName = parts.pop();

        var parent = this._rootHandle;
        for (var i = 0; i < parts.length; i++) {
            parent = await parent.getDirectoryHandle(parts[i], { create: false });
        }
        await parent.removeEntry(dirName, { recursive: true });
    }

    /**
     * Copy all files from one directory to another (one level deep, plus subdirs recursively).
     * @param {String} srcPath - Source directory path
     * @param {String} destPath - Destination directory path
     * @return {Promise<void>}
     */
    async copyDirectory(srcPath, destPath) {
        var srcDir = await this._getDirHandle(srcPath);
        var destDir = await this.createDirectory(destPath);
        for await (var entry of srcDir.values()) {
            if (entry.kind === 'file') {
                var file = await entry.getFile();
                var destFile = await destDir.getFileHandle(entry.name, { create: true });
                var writable = await destFile.createWritable();
                await writable.write(file);
                await writable.close();
            } else if (entry.kind === 'directory') {
                await this.copyDirectory(srcPath + '/' + entry.name, destPath + '/' + entry.name);
            }
        }
    }

    /**
     * Get a directory handle for a path.
     * @private
     */
    async _getDirHandle(path) {
        var parts = path.split('/').filter(function(p) { return p && p !== '.'; });
        var dir = this._rootHandle;
        for (var i = 0; i < parts.length; i++) {
            dir = await dir.getDirectoryHandle(parts[i], { create: false });
        }
        return dir;
    }

    /**
     * List files in a directory.
     * @param {String} path - Directory path
     * @return {Promise<String[]>} Array of filenames
     */
    async listDirectory(path) {
        var parts = path.split('/').filter(function(p) { return p && p !== '.'; });
        var dir = this._rootHandle;
        for (var i = 0; i < parts.length; i++) {
            dir = await dir.getDirectoryHandle(parts[i], { create: false });
        }
        var entries = [];
        for await (var entry of dir.values()) {
            entries.push(entry.name);
        }
        return entries;
    }

    /**
     * Read a raw text file (e.g. CSS, VTT).
     * @param {String} path - Relative path
     * @return {Promise<String>}
     */
    async readText(path) {
        var handle = await this._getFileHandle(path, false);
        var file = await handle.getFile();
        var text = await file.text();
        this._seenVersions[StorageAdapterLocal._key(path)] = StorageAdapterLocal._versionOf(file);
        return text;
    }

    /**
     * Write raw text to a file.
     * @param {String} path - Relative path
     * @param {String} text - Text content
     * @return {Promise<void>}
     */
    async writeText(path, text) {
        var handle = await this._getFileHandle(path, true);
        var writable = await handle.createWritable();
        await writable.write(text);
        await writable.close();
        await this._noteWrite(path, handle);
    }

    /**
     * Write a File or Blob to the local filesystem.
     * @param {String} path - Relative path (e.g. 'resources/myfile.jpg')
     * @param {File|Blob} blob - The file data to write
     * @return {Promise<void>}
     */
    async writeFile(path, blob) {
        var handle = await this._getFileHandle(path, true);
        var writable = await handle.createWritable();
        await writable.write(blob);
        await writable.close();
        await this._noteWrite(path, handle);
    }

    /**
     * Write a base64 data URL as a binary file.
     * @param {String} path - Relative path
     * @param {String} dataUrl - Data URL (e.g. 'data:image/png;base64,...')
     * @return {Promise<void>}
     */
    async writeDataUrl(path, dataUrl) {
        var response = await fetch(dataUrl);
        var blob = await response.blob();
        await this.writeFile(path, blob);
    }

    /**
     * Get a blob URL for a file in the local folder.
     * Caches the result so subsequent calls return the same URL.
     * @param {String} path - Relative path (e.g. 'resources/myfile.jpg')
     * @return {Promise<String>} Blob URL
     */
    async getFileAsURL(path) {
        if (this._blobURLCache[path]) {
            return this._blobURLCache[path];
        }
        try {
            var handle = await this._getFileHandle(path, false);
            var file = await handle.getFile();
            var url = URL.createObjectURL(file);
            this._blobURLCache[path] = url;
            return url;
        } catch (e) {
            return null;
        }
    }

    /**
     * Pre-load blob URLs for all local resource files (src and thumb).
     * Call this after loading the resource index so that getResourceURL()
     * can return blob URLs synchronously.
     * @param {Object} resources - The resources map from _index.json
     * @return {Promise<void>}
     */
    async preloadResourceURLs(resources) {
        var tasks = [];
        for (var id in resources) {
            if (!resources.hasOwnProperty(id)) continue;
            var res = resources[id];
            // Only preload local files (not external URLs)
            if (res.src && !/^(https?:|\/\/|file:)/.test(res.src)) {
                tasks.push(this.getFileAsURL('resources/' + res.src));
            }
            if (res.thumb && !/^(https?:|\/\/|file:)/.test(res.thumb)) {
                tasks.push(this.getFileAsURL('resources/' + res.thumb));
            }
        }
        await Promise.all(tasks);
    }

    /**
     * Look up a cached blob URL for a resource file path.
     * Returns the blob URL if cached, or null.
     * @param {String} relativePath - e.g. 'resources/myfile.jpg'
     * @return {String|null}
     */
    getBlobURL(relativePath) {
        return this._blobURLCache[relativePath] || null;
    }

    /**
     * Persist the directory handle to IndexedDB for session restore.
     */
    async persistHandle() {
        if (!this._rootHandle) return;
        await StorageAdapter.setStored('root', this._rootHandle);
    }

    /**
     * Attempt to restore a previously persisted handle.
     * @return {Promise<Boolean>} Whether restore succeeded
     */
    async restoreHandle() {
        try {
            var handle = await StorageAdapter.getStored('root');
            if (handle) {
                await this.init(handle);
                return true;
            }
        } catch (e) {
            console.log('Could not restore handle:', e);
        }
        return false;
    }

}
