/**
 * @module Shared
 */

/**
 * Storage adapter for a project file: one HTML page in the portable HTML
 * format (docs/HTML-FORMAT.md), opened through the File System Access API
 * (Chrome, Edge) and saved in place.
 *
 * The page is read as a _data folder (FrameTrailHTMLFormat.readProject) and
 * kept in memory as a map of paths to contents, so I offer the interface of
 * StorageAdapterLocal and what works with a local folder works with a project
 * file. Every write changes the map and writes the page again: the folder as
 * a project bundle in the page's first data block, the rest of the page as it
 * was (FrameTrailHTMLFormat.writeProject). A write resolves once the file is
 * written; when that fails, the map goes back to what the file holds (the
 * copy of the page from the last read or write) and the write rejects.
 *
 * A file handle gives access to that one file, not to the folder it is in,
 * so media files cannot be stored: resources are URLs, or paths relative to
 * the page's datapath (a resources/ folder beside the file, for a new page).
 *
 * Another tab or program may write the file meanwhile. Before every read and
 * write I look at the file's version (modification time and size, as
 * StorageAdapterLocal does per file) and take a changed file in. Each path has
 * a version of its own, which changes only with that path's contents, so a
 * change is noticed and refused as in a local folder (Collaboration,
 * Database.saveHypervideo).
 *
 * @class StorageAdapterHTMLFile
 * @extends StorageAdapter
 */

class StorageAdapterHTMLFile extends StorageAdapter {

    constructor() {
        super();
        this._reset(null);
        this._userInfo = {};
    }

    get type() { return 'file'; }
    get displayName() { return 'Project File'; }
    get canSave() { return this._handle !== null; }
    get fileName() { return this._handle ? this._handle.name : null; }
    get handle() { return this._handle; }
    /** @return {String|null} what relative media paths of the project resolve against (data-frametrail-datapath) */
    get datapath() { return this._datapath; }
    get userInfo() { return this._userInfo || {}; }

    static isSupported() {
        return typeof window !== 'undefined' && 'showOpenFilePicker' in window && 'showSaveFilePicker' in window;
    }

    /**
     * Update the stored user info (called from UserManagement after guest login).
     * @param {Object} info - User info object {id, name, role, color}
     */
    setUserInfo(info) {
        this._userInfo = info;
    }

    /** @private */
    _reset(handle) {
        this._handle          = handle;
        this._files           = {};    // path -> contents: parsed JSON for .json files, text otherwise
        this._text            = null;  // the page as last read or written
        this._version         = null;  // the file's version then
        this._datapath        = null;
        this._newPage         = null;  // { library, title } while the page is still to be written
        this._pathVersions    = {};    // path -> version of the file when the path's contents last changed
        this._seenVersions    = {};    // path -> version when this adapter last read or wrote the path
        this._writtenVersions = {};    // path -> version when this adapter last wrote the path
        this._pending         = {};    // path -> contents (undefined: deleted), changed since the file was last written
        this._waiting         = [];    // the writes the next write of the file settles
        this._flushTimer      = null;
        this._flushing        = false;
        this._syncing         = null;
    }

    /**
     * What a file holds, read without opening it as the project.
     * @param {FileSystemFileHandle} handle
     * @return {Promise<Object>} { empty, project }: an empty file, a page with a data block
     */
    static async inspect(handle) {
        var text = await (await handle.getFile()).text();
        return {
            empty:   !text.trim(),
            project: FrameTrailHTMLFormat.firstBlockText(text) !== null
        };
    }

    /**
     * Open a project file: ask for permission to write it if needed, and read it.
     *
     * options:
     *
     * * files: a folder map written into the file instead of what it holds
     *   (a project saved into it); the page around the data block is kept if
     *   the file is a page in the format;
     * * library, title: for a new page, needed when the file is empty or files
     *   go into a file that is no page in the format;
     * * datapath: for the data block (default: the page's own, './' for a new page);
     * * ask: false to fail instead of asking for permission (asking needs a click).
     *
     * @param {FileSystemFileHandle} handle
     * @param {Object} [options]
     * @return {Promise<Boolean>}
     */
    async init(handle, options) {

        options = options || {};

        var permission = await handle.queryPermission({ mode: 'readwrite' });
        if (permission !== 'granted') {
            if (options.ask === false) { throw new Error('Permission needed'); }
            permission = await handle.requestPermission({ mode: 'readwrite' });
            if (permission !== 'granted') { throw new Error('Permission denied'); }
        }

        var file     = await handle.getFile(),
            text     = await file.text(),
            template = (FrameTrailHTMLFormat.firstBlockText(text) !== null) ? text : null,
            project  = (template && !options.files) ? FrameTrailHTMLFormat.readProject(text) : null;

        if (!template && text.trim()) {
            throw new Error('Not a FrameTrail project file: ' + handle.name);
        }
        if (!template && !options.library) {
            throw new Error('A new page needs the FrameTrail library');
        }

        this._reset(handle);
        this._text     = template;
        this._version  = StorageAdapterHTMLFile._versionOf(file);
        this._datapath = (options.datapath !== undefined) ? options.datapath
                       : project ? project.datapath
                       : template ? FrameTrailHTMLFormat.parse(template)[0].datapath
                       : './';
        if (!template) { this._newPage = { library: options.library, title: options.title }; }

        if (project) {
            this._adopt(project.files, this._version);
            return true;
        }

        // A new page, or a project saved into the file: write it now.
        var files = options.files || FrameTrailHTMLFormat.emptyProject(),
            self  = this;
        Object.keys(files).forEach(function(path) {
            var key = StorageAdapterHTMLFile._key(path);
            self._files[key] = self._pending[key] = StorageAdapterHTMLFile._clone(files[path]);
        });
        await new Promise(function(resolve, reject) {
            self._waiting.push({ resolve: resolve, reject: reject });
            self._flush();
        });
        return true;

    }

    /**
     * The version of a file: its modification time and size.
     * @private
     */
    static _versionOf(file) {
        return file.lastModified + ':' + file.size;
    }

    /**
     * The key of a path in the map ('hypervideos/./9/…' and 'hypervideos/9/…' are the same file).
     * @private
     */
    static _key(path) {
        return String(path).split('/').filter(function(p) { return p && p !== '.'; }).join('/');
    }

    /** @private */
    static _clone(value) {
        return (value === undefined || typeof value === 'string') ? value : JSON.parse(JSON.stringify(value));
    }

    /** @private */
    _has(key) {
        return Object.prototype.hasOwnProperty.call(this._files, key);
    }

    /** @private */
    _keysUnder(path) {
        var prefix = StorageAdapterHTMLFile._key(path);
        prefix = prefix ? prefix + '/' : '';
        return Object.keys(this._files).filter(function(key) { return key.indexOf(prefix) === 0; });
    }

    /**
     * Take in the folder of the file as it is now: the paths whose contents
     * changed get its version, and writes not yet in the file stay.
     * @private
     */
    _adopt(files, version) {

        var old  = this._files,
            self = this;

        Object.keys(files).forEach(function(key) {
            if (!Object.prototype.hasOwnProperty.call(old, key) || JSON.stringify(old[key]) !== JSON.stringify(files[key])) {
                self._pathVersions[key] = version;
            }
        });
        Object.keys(old).forEach(function(key) {
            if (!Object.prototype.hasOwnProperty.call(files, key)) { delete self._pathVersions[key]; }
        });

        this._files   = files;
        this._version = version;

        Object.keys(this._pending).forEach(function(key) { self._apply(key, self._pending[key]); });

    }

    /** @private */
    _apply(key, value) {
        if (value === undefined) { delete this._files[key]; } else { this._files[key] = value; }
    }

    /**
     * Take in a change of the file made by another tab or program.
     * @private
     */
    _sync() {

        if (!this._handle || this._flushing) { return Promise.resolve(); }
        if (this._syncing) { return this._syncing; }

        var self = this;

        this._syncing = (async function() {

            var file    = await self._handle.getFile(),
                version = StorageAdapterHTMLFile._versionOf(file);

            if (version === self._version || self._flushing) { return; }

            var text = await file.text(), project = null;
            try {
                project = FrameTrailHTMLFormat.readProject(text);
            } catch (e) {}

            if (self._flushing) { return; }

            if (!project || project.empty) {
                // Half written, or not a project any more: keep what was read
                // before; the next write puts the project back.
                console.warn('FrameTrail: the project file ' + self._handle.name + ' was changed and cannot be read; keeping what was read before.');
                self._version = version;
                return;
            }

            self._adopt(project.files, version);
            self._text     = text;
            self._datapath = project.datapath;

        })().finally(function() {
            self._syncing = null;
        });

        return this._syncing;

    }

    /** @private */
    async _read(path) {
        await this._sync();
        var key = StorageAdapterHTMLFile._key(path);
        if (!this._has(key)) { throw new Error('File not found: ' + path); }
        this._seenVersions[key] = this._pathVersions[key] || this._version;
        return key;
    }

    async readJSON(path) {
        var value = this._files[await this._read(path)];
        return (typeof value === 'string') ? JSON.parse(value) : StorageAdapterHTMLFile._clone(value);
    }

    /**
     * Read a raw text file (e.g. CSS, VTT).
     * @param {String} path - Relative path
     * @return {Promise<String>}
     */
    async readText(path) {
        var value = this._files[await this._read(path)];
        return (typeof value === 'string') ? value : JSON.stringify(value, null, 4);
    }

    async exists(path) {
        await this._sync();
        return this._has(StorageAdapterHTMLFile._key(path)) || this._keysUnder(path).length > 0;
    }

    /**
     * List the files and folders in a folder.
     * @param {String} path - Directory path
     * @return {Promise<String[]>}
     */
    async listDirectory(path) {
        await this._sync();
        var prefix = StorageAdapterHTMLFile._key(path),
            names  = [];
        prefix = prefix ? prefix + '/' : '';
        this._keysUnder(path).forEach(function(key) {
            var name = key.slice(prefix.length).split('/')[0];
            if (names.indexOf(name) < 0) { names.push(name); }
        });
        if (!names.length && prefix) { throw new Error('Folder not found: ' + path); }
        return names;
    }

    async createDirectory(path) {
        // Folders exist through the files in them.
    }

    async writeJSON(path, data) {
        return this._write([[path, StorageAdapterHTMLFile._clone(data)]]);
    }

    /**
     * Write raw text to a file.
     * @param {String} path - Relative path
     * @param {String} text - Text content
     * @return {Promise<void>}
     */
    async writeText(path, text) {
        return this._write([[path, String(text)]]);
    }

    /**
     * Write a File or Blob: only text files (subtitles, CSS, JSON) can be in a project file.
     * @param {String} path - Relative path
     * @param {File|Blob} blob
     * @return {Promise<void>}
     */
    async writeFile(path, blob) {
        if (!/\.(json|vtt|css)$/i.test(path)) {
            throw new Error('Media files cannot be stored in a project file: ' + path);
        }
        var text = await blob.text();
        return /\.json$/i.test(path) ? this.writeJSON(path, JSON.parse(text)) : this.writeText(path, text);
    }

    async writeDataUrl(path) {
        throw new Error('Media files cannot be stored in a project file: ' + path);
    }

    /**
     * Delete a file.
     * @param {String} path - Relative path
     * @return {Promise<void>}
     */
    async deleteFile(path) {
        await this._sync();
        if (!this._has(StorageAdapterHTMLFile._key(path))) { throw new Error('File not found: ' + path); }
        return this._write([[path, undefined]]);
    }

    /**
     * Delete a folder and everything in it.
     * @param {String} path - Relative path (e.g. 'hypervideos/3')
     * @return {Promise<void>}
     */
    async deleteDirectory(path) {
        await this._sync();
        return this._write(this._keysUnder(path).map(function(key) { return [key, undefined]; }));
    }

    /**
     * Copy everything in a folder into another one.
     * @param {String} srcPath - Source directory path
     * @param {String} destPath - Destination directory path
     * @return {Promise<void>}
     */
    async copyDirectory(srcPath, destPath) {
        await this._sync();
        var from = StorageAdapterHTMLFile._key(srcPath) + '/',
            to   = StorageAdapterHTMLFile._key(destPath) + '/',
            self = this;
        return this._write(this._keysUnder(srcPath).map(function(key) {
            return [to + key.slice(from.length), StorageAdapterHTMLFile._clone(self._files[key])];
        }));
    }

    /**
     * Change the map and write the file; resolves once it is written.
     * @private
     */
    async _write(entries) {

        await this._sync();

        var self = this;
        entries.forEach(function(entry) {
            var key = StorageAdapterHTMLFile._key(entry[0]);
            self._pending[key] = entry[1];
            self._apply(key, entry[1]);
        });

        return new Promise(function(resolve, reject) {
            self._waiting.push({ resolve: resolve, reject: reject });
            if (!self._flushTimer && !self._flushing) {
                // The writes of one step (a save writes several files) go into one write of the file.
                self._flushTimer = setTimeout(function() {
                    self._flushTimer = null;
                    self._flush();
                }, 0);
            }
        });

    }

    /**
     * Write the file: the folder into the page's data block, or a new page.
     * @private
     */
    async _flush() {

        if (this._flushing || !this._waiting.length) { return; }

        var waiting = this._waiting,
            written = this._pending,
            self    = this;

        this._waiting  = [];
        this._pending  = {};
        this._flushing = true;

        try {

            var text = FrameTrailHTMLFormat.writeProject(this._files, this._text, {
                datapath: this._datapath,
                library:  this._newPage && this._newPage.library,
                title:    this._newPage && this._newPage.title
            });

            var writable = await this._handle.createWritable();
            try {
                await writable.write(text);
                await writable.close();
            } catch (e) {
                try { await writable.abort(); } catch (ignore) {}
                throw e;
            }

            var version = StorageAdapterHTMLFile._versionOf(await this._handle.getFile());

            this._text    = text;
            this._version = version;
            this._newPage = null;

            Object.keys(written).forEach(function(key) {
                if (written[key] === undefined) {
                    delete self._pathVersions[key];
                    delete self._seenVersions[key];
                    delete self._writtenVersions[key];
                } else {
                    self._pathVersions[key] = self._seenVersions[key] = self._writtenVersions[key] = version;
                }
            });

            waiting.forEach(function(write) { write.resolve(); });

        } catch (error) {

            // Back to what the file holds, under the writes made meanwhile.
            this._files = this._text ? FrameTrailHTMLFormat.readProject(this._text).files : {};
            Object.keys(this._pending).forEach(function(key) { self._apply(key, self._pending[key]); });

            waiting.forEach(function(write) { write.reject(error); });

        } finally {

            this._flushing = false;
            if (this._waiting.length) { this._flush(); }

        }

    }

    /**
     * The current version of a path, after taking in a change of the file.
     * @param {String} path - Relative path
     * @return {Promise<String|null>} null when there is no such file
     */
    async fileVersion(path) {
        try {
            await this._sync();
        } catch (e) {
            return null;
        }
        var key = StorageAdapterHTMLFile._key(path);
        return this._has(key) ? (this._pathVersions[key] || this._version) : null;
    }

    /**
     * The version of a path when this adapter last read or wrote it.
     * @param {String} path - Relative path
     * @return {String|null}
     */
    seenVersion(path) {
        return this._seenVersions[StorageAdapterHTMLFile._key(path)] || null;
    }

    /**
     * The version of a path when this adapter last wrote it.
     * @param {String} path - Relative path
     * @return {String|null}
     */
    writtenVersion(path) {
        return this._writtenVersions[StorageAdapterHTMLFile._key(path)] || null;
    }

    /**
     * Whether a path is still as this adapter last read or wrote it.
     * A path it has not seen, or one that no longer exists, counts as unchanged.
     * @param {String} path - Relative path
     * @return {Promise<Boolean>}
     */
    async isUnchanged(path) {
        var seen = this.seenVersion(path);
        if (!seen) return true;
        var current = await this.fileVersion(path);
        return current === null || current === seen;
    }

}
