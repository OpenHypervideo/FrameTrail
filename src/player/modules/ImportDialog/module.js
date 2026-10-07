/**
 * @module Player
 */


/**
 * I am the ImportDialog. I bring hypervideos into this instance from a file:
 *
 * * a page in the portable HTML format (FrameTrailHTMLFormat), or a page
 *   FrameTrail exported before that format — read, never run;
 * * a bundle as JSON, or a hypervideo.json exported before bundles;
 * * a zip of a _data folder (Save As "All Data", or the server's export with
 *   media files).
 *
 * Every hypervideo gets a new id and belongs to the importing user. Resource
 * ids are remapped (resources already here are reused), media files a zip
 * carries are copied, all other relative media paths point at the folder the
 * file came from. Other users' annotations go into the importing user's own
 * annotation file, each keeping its creator. Code (global events, code
 * snippets, custom CSS) is only imported when the user asks for it, and in
 * server mode only by an administrator; so are the project-level parts of a
 * project (overview map, playback settings, global CSS).
 *
 * I write through the active storage: the server's actions, or the local
 * folder. In memory (download and static mode) there is nowhere to import to.
 *
 * @class ImportDialog
 * @static
 */

FrameTrail.defineModule('ImportDialog', function(FrameTrail){

    var labels     = FrameTrail.module('Localization').labels,
        Serializer = window.FrameTrailSerializer,
        HTMLFormat = window.FrameTrailHTMLFormat,
        validator  = null;

    // Resource types whose src is a file in resources/ when it is not a URL.
    var FILE_TYPES = ['image', 'video', 'audio', 'pdf'];


    function isObject(value) {
        return value !== null && typeof value === 'object' && !Array.isArray(value);
    }

    function clone(value) {
        return (value === undefined) ? undefined : JSON.parse(JSON.stringify(value));
    }

    function escapeHTML(text) {
        return String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }

    // A path relative to resources/: not a URL, not absolute, not empty.
    function isRelativePath(value) {
        return typeof value === 'string' && value !== '' && !/^([a-z][a-z0-9+.-]*:|\/)/i.test(value);
    }

    function storageMode() {
        return FrameTrail.getState('storageMode');
    }

    function isAdmin() {
        return storageMode() === 'local' || FrameTrail.module('UserManagement').userRole === 'admin';
    }

    function serverPost(params) {
        var body = (params instanceof FormData) ? params : new URLSearchParams(params);
        return FrameTrail.module('StorageManager').serverPost(body).then(function(data) {
            if (!data || data.code !== 0) {
                throw new Error((data && data.string) || ('Server error ' + (data ? data.code : '')));
            }
            return data;
        });
    }


    /* ------------------------------------------------------------------ */
    /*  Reading a file                                                    */
    /* ------------------------------------------------------------------ */

    /**
     * I read a file into what an import needs:
     *
     *     { bundle, datapath, media }
     *
     * datapath is what the bundle's relative media paths resolve against (or
     * null); media are the files under resources/ a zip carries, by name.
     *
     * @method readFile
     * @param {File} file
     * @return {Promise}
     */
    function readFile(file) {

        if (/\.zip$/i.test(file.name)) {
            return file.arrayBuffer().then(readZip);
        }

        return file.text().then(function(text) {

            var trimmed = text.replace(/^﻿/, '').trim();

            if (trimmed.charAt(0) === '{') {
                var json = JSON.parse(trimmed);
                if (json.bundle === 'hypervideo' || json.bundle === 'project') {
                    return { bundle: json, datapath: null, media: {} };
                }
                if (isObject(json.meta) && Array.isArray(json.clips)) {
                    // A hypervideo.json, as Save As JSON wrote it before bundles.
                    var datapath = (typeof json.dataPath === 'string') ? json.dataPath : null;
                    delete json.dataPath;
                    return { bundle: HTMLFormat.hypervideoBundle(json), datapath: datapath, media: {} };
                }
                throw new Error(labels['ImportErrorNoData']);
            }

            var blocks = HTMLFormat.parse(text);
            if (blocks.length) {
                return { bundle: blocks[0].bundle, datapath: blocks[0].datapath, media: {} };
            }

            var legacy = HTMLFormat.parseLegacy(text);
            if (legacy) {
                return { bundle: legacy.bundle, datapath: legacy.datapath, media: {} };
            }

            throw new Error(labels['ImportErrorNoData']);

        });

    }

    // A zip of a _data folder: Save As "All Data" has it at the top, the
    // server's export below _data/. Never users.json, nothing in dot folders.
    function readZip(buffer) {

        var entries = fflate.unzipSync(new Uint8Array(buffer)),
            index   = Object.keys(entries).filter(function(path) {
                return /(^|\/)hypervideos\/_index\.json$/.test(path);
            }).sort(function(a, b) { return a.length - b.length; })[0];

        if (!index) { throw new Error(labels['ImportErrorNoData']); }

        var prefix  = index.slice(0, index.length - 'hypervideos/_index.json'.length),
            decoder = new TextDecoder(),
            files   = {},
            media   = {};

        Object.keys(entries).forEach(function(path) {
            if (path.indexOf(prefix) !== 0 || /\/$/.test(path)) { return; }
            var rel = path.slice(prefix.length);
            if (!rel || rel === 'users.json' || rel.split('/').some(function(part) { return part.charAt(0) === '.'; })) { return; }
            if (/^resources\/[^\/]+$/.test(rel) && rel !== 'resources/_index.json') {
                media[rel.slice('resources/'.length)] = new Blob([entries[path]]);
            } else if (/\.(json|vtt|css)$/.test(rel)) {
                files[rel] = decoder.decode(entries[path]);
            }
        });

        return { bundle: Serializer.readBundle(files, 'folder', { bundle: 'project' }), datapath: null, media: media };

    }

    // [{ path, message }] of the bundle against its schema.
    function validate(bundle) {
        if (!validator) { validator = window.FrameTrailSchema.create(window.FrameTrailSchemas); }
        if (!isObject(bundle) || (bundle.bundle !== 'hypervideo' && bundle.bundle !== 'project')) {
            return [{ path: '/bundle', message: 'must be "hypervideo" or "project"' }];
        }
        return validator.validate(bundle.bundle + '-bundle.schema.json', bundle);
    }

    // The hypervideo bundles of a bundle, in order, by their source id.
    function hypervideosOf(bundle) {
        if (bundle.bundle === 'project') {
            return Object.keys(bundle.hypervideos || {}).map(function(id) {
                return { id: id, bundle: bundle.hypervideos[id] };
            });
        }
        return [{ id: (bundle.id != null) ? String(bundle.id) : '', bundle: bundle }];
    }

    function resourcesOf(bundle) {
        if (bundle.bundle === 'project') { return (bundle.resources && bundle.resources.resources) || {}; }
        return bundle.resources || {};
    }

    function annotationsOf(hypervideoBundle) {
        var files = (hypervideoBundle.annotations && hypervideoBundle.annotations.files) || {},
            all   = [];
        Object.keys(files).forEach(function(fileID) {
            if (Array.isArray(files[fileID])) { all = all.concat(files[fileID]); }
        });
        return all;
    }

    // What of a hypervideo is code: global events, code snippets, custom CSS.
    function codeOf(hypervideo) {
        var events   = isObject(hypervideo.globalEvents) ? Object.keys(hypervideo.globalEvents).filter(function(key) { return String(hypervideo.globalEvents[key] || '').trim(); }) : [],
            snippets = (hypervideo.contents || []).filter(function(item) { return item && item['frametrail:type'] === 'CodeSnippet'; }).length,
            css      = typeof hypervideo.customCSS === 'string' && hypervideo.customCSS.trim() !== '';
        return { events: events.length, snippets: snippets, css: css, any: !!(events.length || snippets || css) };
    }


    /* ------------------------------------------------------------------ */
    /*  Rewriting                                                         */
    /* ------------------------------------------------------------------ */

    // A relative media path in its new form: the file copied here, or the
    // file at the source.
    function mapPath(ctx, value) {
        if (!isRelativePath(value)) { return value; }
        if (Object.prototype.hasOwnProperty.call(ctx.paths, value)) { return ctx.paths[value]; }
        if (ctx.datapath) { return new URL('resources/' + value, ctx.datapath).href; }
        if (ctx.unresolved.indexOf(value) < 0) { ctx.unresolved.push(value); }
        return value;
    }

    // A resource id in its new form: the same JavaScript type, or undefined.
    function mapResourceID(ctx, value) {
        var mapped = ctx.resources[String(value)];
        if (!mapped) { return undefined; }
        return (typeof value === 'number') ? Number(mapped.id) : String(mapped.id);
    }

    // An item names the video it is on in target.source; relative, that is a file in resources/ too.
    function rewriteItem(ctx, item) {
        if (!isObject(item)) { return; }
        rewriteBody(ctx, item.body);
        if (isObject(item.target) && typeof item.target.source === 'string') { item.target.source = mapPath(ctx, item.target.source); }
    }

    function rewriteBody(ctx, body) {
        if (!isObject(body)) { return; }
        var type = body['frametrail:type'];
        if (body['frametrail:resourceId'] != null && body['frametrail:resourceId'] !== '') {
            var resourceID = mapResourceID(ctx, body['frametrail:resourceId']);
            if (resourceID === undefined) { delete body['frametrail:resourceId']; }
            else { body['frametrail:resourceId'] = resourceID; }
        }
        if (FILE_TYPES.indexOf(type) >= 0) {
            var field = Serializer.RESOURCE_TYPES[type].src;
            if (typeof body[field] === 'string') { body[field] = mapPath(ctx, body[field]); }
        }
        if (typeof body['frametrail:thumb'] === 'string') { body['frametrail:thumb'] = mapPath(ctx, body['frametrail:thumb']); }
    }

    // Hotspots that jump to another hypervideo of the import.
    function remapJumps(hypervideo, ids) {
        var changed = false;
        (hypervideo.contents || []).forEach(function(item) {
            var attributes = item && isObject(item.body) ? item.body['frametrail:attributes'] : null;
            if (isObject(attributes) && attributes.action === 'jumpToHypervideo' && attributes.actionTarget != null
                    && Object.prototype.hasOwnProperty.call(ids, String(attributes.actionTarget))) {
                attributes.actionTarget = String(ids[String(attributes.actionTarget)]);
                changed = true;
            }
        });
        return changed;
    }

    /**
     * A hypervideo ready to be written here: owned by the importing user,
     * resources and media paths rewritten, code removed unless asked for,
     * subtitles reduced to those with a text, as <lang>.vtt.
     *
     *     { hypervideo, subtitles: { lang: text }, annotations: [] }
     */
    function prepare(ctx, hypervideoBundle) {

        var hypervideo = clone(hypervideoBundle.hypervideo),
            texts      = hypervideoBundle.subtitles || {},
            subtitles  = {},
            user       = FrameTrail.module('UserManagement');

        hypervideo.meta = hypervideo.meta || {};
        hypervideo.meta.creator     = FrameTrail.getState('username') || user.userID;
        hypervideo.meta.creatorId   = String(user.userID);
        hypervideo.meta.lastchanged = Date.now();
        if (typeof hypervideo.meta.thumb === 'string') { hypervideo.meta.thumb = mapPath(ctx, hypervideo.meta.thumb); }

        (hypervideo.clips || []).forEach(function(clip) {
            if (!isObject(clip)) { return; }
            if (clip.resourceId != null && clip.resourceId !== '') {
                var resourceID = mapResourceID(ctx, clip.resourceId);
                clip.resourceId = (resourceID === undefined) ? null : resourceID;
            }
            if (typeof clip.src === 'string') { clip.src = mapPath(ctx, clip.src); }
        });

        hypervideo.contents = (hypervideo.contents || []).filter(function(item) {
            return ctx.code || !(item && item['frametrail:type'] === 'CodeSnippet');
        });
        hypervideo.contents.forEach(function(item) { rewriteItem(ctx, item); });

        if (!ctx.code) {
            if (isObject(hypervideo.globalEvents)) {
                Object.keys(hypervideo.globalEvents).forEach(function(key) { hypervideo.globalEvents[key] = ''; });
            }
            if (typeof hypervideo.customCSS === 'string') { hypervideo.customCSS = ''; }
        }

        hypervideo.subtitles = (hypervideo.subtitles || []).filter(function(entry) {
            return isObject(entry) && entry.srclang && typeof texts[entry.srclang] === 'string';
        }).map(function(entry) {
            subtitles[entry.srclang] = texts[entry.srclang];
            return Object.assign({}, entry, { src: entry.srclang + '.vtt' });
        });

        var annotations = ctx.annotations ? clone(annotationsOf(hypervideoBundle)) : [];
        annotations.forEach(function(annotation) { rewriteItem(ctx, annotation); });

        return { hypervideo: hypervideo, subtitles: subtitles, annotations: annotations };

    }


    /* ------------------------------------------------------------------ */
    /*  Writing                                                           */
    /* ------------------------------------------------------------------ */

    // A target resource matching a source one: the same file or URL.
    function resourceKey(resource) {
        if (!isObject(resource)) { return null; }
        if (resource.type === 'location') {
            var attributes = resource.attributes || {};
            return 'location:' + attributes.lat + ',' + (attributes.lon != null ? attributes.lon : attributes.lng);
        }
        if (!resource.src) { return null; }
        return resource.type + ':' + FrameTrail.module('RouteNavigation').getResourceURL(resource.src);
    }

    // A free file name in resources/ (local folder).
    function freeName(adapter, name) {
        return adapter.exists('resources/' + name).then(function(taken) {
            return taken ? Date.now() + '_' + name : name;
        });
    }

    /**
     * Media files of a zip, copied into the local folder's resources/.
     */
    function copyMediaLocally(ctx) {
        var adapter = FrameTrail.module('StorageManager').getAdapter();
        return Object.keys(ctx.media).reduce(function(chain, name) {
            return chain.then(function() {
                return freeName(adapter, name).then(function(target) {
                    return adapter.writeFile('resources/' + target, ctx.media[name]).then(function() {
                        ctx.paths[name] = target;
                    });
                });
            });
        }, Promise.resolve());
    }

    /**
     * The resources of the import: reused where this instance has the same
     * file or URL, created otherwise. Fills ctx.resources (old id → { id,
     * src, thumb }) and ctx.paths (old relative path → new path).
     */
    function importResources(ctx, source) {

        var Database = FrameTrail.module('Database'),
            existing = {},
            ids      = Object.keys(source).sort(function(a, b) { return (parseInt(a, 10) || 0) - (parseInt(b, 10) || 0); });

        Object.keys(Database.resources || {}).forEach(function(id) {
            var key = resourceKey(Database.resources[id]);
            if (key && !existing[key]) { existing[key] = id; }
        });

        // The entry as it would be here: paths rewritten, owned by the importer.
        function entryOf(resource) {
            var entry = clone(resource);
            if (FILE_TYPES.indexOf(entry.type) >= 0 && typeof entry.src === 'string') { entry.src = mapPath(ctx, entry.src); }
            if (typeof entry.thumb === 'string') { entry.thumb = mapPath(ctx, entry.thumb); }
            return entry;
        }

        function reuse(oldID, resource, entry) {
            var key = resourceKey(entry), id = key && existing[key];
            if (!id) { return false; }
            var target = Database.resources[id];
            ctx.resources[oldID] = { id: id, src: target.src, thumb: target.thumb };
            if (isRelativePath(resource.src)) { ctx.paths[resource.src] = target.src; }
            if (isRelativePath(resource.thumb) && target.thumb && !Object.prototype.hasOwnProperty.call(ctx.paths, resource.thumb)) { ctx.paths[resource.thumb] = target.thumb; }
            ctx.report.resourcesReused++;
            return true;
        }

        if (storageMode() === 'local') {

            var adapter = FrameTrail.module('StorageManager').getAdapter(),
                user    = FrameTrail.module('UserManagement');

            return adapter.readJSON('resources/_index.json').catch(function() {
                return { 'resources-increment': 0, 'resources': {} };
            }).then(function(index) {
                if (!isObject(index.resources) || Array.isArray(index.resources)) { index.resources = {}; }
                index['resources-increment'] = parseInt(index['resources-increment'], 10) || 0;
                ids.forEach(function(oldID) {
                    var resource = source[oldID], entry = entryOf(resource);
                    if (reuse(oldID, resource, entry)) { return; }
                    entry.creator   = FrameTrail.getState('username') || 'Local User';
                    entry.creatorId = String(user.userID || 'local');
                    entry.created   = Math.floor(Date.now() / 1000);
                    var id = String(++index['resources-increment']);
                    index.resources[id] = entry;
                    ctx.resources[oldID] = { id: id, src: entry.src, thumb: entry.thumb };
                    ctx.report.resourcesCreated++;
                });
                return adapter.writeJSON('resources/_index.json', index);
            });

        }

        // Server: one request per resource, in order.
        return ids.reduce(function(chain, oldID) {
            return chain.then(function() {

                var resource = source[oldID], request;

                // A file the zip carries is uploaded, as a new resource with its
                // own name — unless this instance has a file of that name.
                if (FILE_TYPES.indexOf(resource.type) >= 0 && isRelativePath(resource.src) && ctx.media[resource.src]) {
                    if (reuse(oldID, resource, resource)) { return; }
                    var form = new FormData();
                    form.append('a', 'fileUpload');
                    form.append('type', resource.type);
                    form.append('name', resource.name || resource.src);
                    form.append('description', resource.description || '');
                    form.append('file', new File([ctx.media[resource.src]], resource.src));
                    request = serverPost(form).then(function(data) {
                        ctx.paths[resource.src] = data.response.resource.src;
                        // A file that is both, src and thumb, stays the file.
                        if (isRelativePath(resource.thumb) && data.response.resource.thumb && resource.thumb !== resource.src) { ctx.paths[resource.thumb] = data.response.resource.thumb; }
                        return data;
                    });
                } else {
                    var entry = entryOf(resource);
                    if (reuse(oldID, resource, entry)) { return; }
                    if (entry.type === 'location') {
                        var attributes = entry.attributes || {},
                            params     = new URLSearchParams({ a: 'fileUpload', type: 'map', name: entry.name || 'Location', lat: attributes.lat, lon: (attributes.lon != null ? attributes.lon : attributes.lng) });
                        (Array.isArray(attributes.boundingBox) ? attributes.boundingBox : []).forEach(function(value) { params.append('boundingBox[]', value); });
                        request = serverPost(params);
                    } else {
                        request = serverPost({ a: 'fileUpload', type: 'url', name: entry.name || entry.src, description: entry.description || '',
                                               attributes: JSON.stringify({ src: entry.src, type: entry.type, attributes: entry.attributes || {}, thumb: entry.thumb }) });
                    }
                }

                return request.then(function(data) {
                    var created = data.response.resource;
                    ctx.resources[oldID] = { id: String(data.response.resId), src: created.src, thumb: created.thumb };
                    ctx.report.resourcesCreated++;
                    if (resource.licenseType || resource.licenseAttribution) {
                        return serverPost({ a: 'fileUpdate', resourcesID: data.response.resId, name: created.name,
                                            licenseType: resource.licenseType || '', licenseAttribution: resource.licenseAttribution || '' }).catch(function() {});
                    }
                }, function(error) {
                    ctx.report.problems.push(labels['ImportProblemResource'].replace('%s', resource.name || oldID) + ' ' + error.message);
                });

            });
        }, Promise.resolve());

    }

    // The hypervideos, written here; fills ctx.ids (old id → new id).
    function writeHypervideos(ctx, prepared) {

        var user = FrameTrail.module('UserManagement');

        if (storageMode() === 'local') {

            var adapter = FrameTrail.module('StorageManager').getAdapter(),
                time    = Math.floor(Date.now() / 1000);

            return adapter.readJSON('hypervideos/_index.json').catch(function() {
                return { 'hypervideo-increment': 0, 'hypervideos': {} };
            }).then(function(index) {

                if (!isObject(index.hypervideos) || Array.isArray(index.hypervideos)) { index.hypervideos = {}; }
                index['hypervideo-increment'] = parseInt(index['hypervideo-increment'], 10) || 0;
                prepared.forEach(function(item) {
                    var id = String(++index['hypervideo-increment']);
                    index.hypervideos[id] = './' + id;
                    ctx.ids[item.sourceID] = id;
                });
                prepared.forEach(function(item) { remapJumps(item.hypervideo, ctx.ids); });

                // As a new hypervideo is made here (Sidebar), then the index last:
                // a hypervideo whose folder was not written is never listed.
                return prepared.reduce(function(chain, item) {
                    return chain.then(function() {
                        var dir = 'hypervideos/' + ctx.ids[item.sourceID] + '/';
                        return Promise.all([adapter.createDirectory(dir + 'annotations'), adapter.createDirectory(dir + 'subtitles')]).then(function() {
                            return Promise.all([
                                adapter.writeJSON(dir + 'hypervideo.json', item.hypervideo),
                                adapter.writeJSON(dir + 'annotations/_index.json', {
                                    'mainAnnotation': '1',
                                    'annotationfiles': { '1': { name: 'main', description: '', created: time, lastchanged: time, hidden: false,
                                                                 owner: FrameTrail.getState('username') || 'Local User', ownerId: String(user.userID || 'local') } }
                                }),
                                adapter.writeJSON(dir + 'annotations/1.json', [])
                            ].concat(Object.keys(item.subtitles).map(function(lang) {
                                return adapter.writeText(dir + 'subtitles/' + lang + '.vtt', item.subtitles[lang]);
                            })));
                        });
                    });
                }, Promise.resolve()).then(function() {
                    return adapter.writeJSON('hypervideos/_index.json', index);
                });

            });

        }

        // Server: hypervideoAdd, with the subtitle files as uploads; the ids
        // are known only afterwards, so jumps between them are set second.
        return prepared.reduce(function(chain, item) {
            return chain.then(function() {
                var form = new FormData();
                form.append('a', 'hypervideoAdd');
                form.append('src', JSON.stringify(item.hypervideo, null, 4));
                Object.keys(item.subtitles).forEach(function(lang) {
                    form.append('subtitles[' + lang + ']', new Blob([item.subtitles[lang]], { type: 'text/vtt' }), lang + '.vtt');
                });
                return serverPost(form).then(function(data) {
                    ctx.ids[item.sourceID] = String(data.newHypervideoID);
                }, function(error) {
                    ctx.report.problems.push(labels['ImportProblemHypervideo'].replace('%s', (item.hypervideo.meta && item.hypervideo.meta.name) || item.sourceID) + ' ' + error.message);
                });
            });
        }, Promise.resolve()).then(function() {
            return prepared.reduce(function(chain, item) {
                return chain.then(function() {
                    if (!ctx.ids[item.sourceID] || !remapJumps(item.hypervideo, ctx.ids)) { return; }
                    return serverPost({ a: 'hypervideoChange', hypervideoID: ctx.ids[item.sourceID],
                                        src: JSON.stringify(item.hypervideo, null, 4), baseVersion: item.hypervideo.meta.lastchanged }).catch(function(error) {
                        ctx.report.problems.push(error.message);
                    });
                });
            }, Promise.resolve());
        });

    }

    // Everyone's annotations, in the importing user's file of each hypervideo.
    function writeAnnotations(ctx, prepared) {

        var userID      = FrameTrail.module('UserManagement').userID,
            name        = FrameTrail.getState('username'),
            description = name + '\'s annotations';

        return prepared.reduce(function(chain, item) {
            return chain.then(function() {

                var id = ctx.ids[item.sourceID];
                if (!id || !item.annotations.length) { return; }

                if (storageMode() === 'local') {
                    var adapter = FrameTrail.module('StorageManager').getAdapter(),
                        dir     = 'hypervideos/' + id + '/annotations/',
                        now     = Math.floor(Date.now() / 1000);
                    return adapter.writeJSON(dir + userID + '.json', item.annotations).then(function() {
                        return adapter.readJSON(dir + '_index.json').catch(function() { return {}; });
                    }).then(function(index) {
                        return adapter.writeJSON(dir + '_index.json', Serializer.setAnnotationIndexEntry(index, userID, {
                            name: name, description: description, created: now, lastchanged: now,
                            hidden: false, owner: name, ownerId: String(userID)
                        }));
                    }).then(function() {
                        ctx.report.annotations += item.annotations.length;
                    });
                }

                return serverPost({ a: 'annotationfileSave', hypervideoID: id, action: 'saveAs', annotationfileID: userID,
                                    name: name, description: description, hidden: false,
                                    src: JSON.stringify(item.annotations, null, 4) }).then(function() {
                    ctx.report.annotations += item.annotations.length;
                }, function(error) {
                    ctx.report.problems.push(error.message);
                });

            });
        }, Promise.resolve());

    }

    // Tag definitions this instance does not have yet.
    function importTags(ctx, tagdefinitions) {

        var have    = FrameTrail.module('TagModel').getAllTags() || {},
            missing = Object.keys(tagdefinitions || {}).filter(function(tag) { return !have[tag]; });

        if (!missing.length) { return Promise.resolve(); }

        if (!isAdmin()) {
            ctx.report.problems.push(labels['ImportProblemTags']);
            return Promise.resolve();
        }

        if (storageMode() === 'local') {
            var adapter = FrameTrail.module('StorageManager').getAdapter();
            return adapter.readJSON('tagdefinitions.json').catch(function() { return {}; }).then(function(data) {
                missing.forEach(function(tag) { data[tag] = clone(tagdefinitions[tag]); });
                return adapter.writeJSON('tagdefinitions.json', data);
            });
        }

        return missing.reduce(function(chain, tag) {
            return chain.then(function() {
                return Object.keys(tagdefinitions[tag] || {}).reduce(function(inner, lang) {
                    return inner.then(function() {
                        var entry = tagdefinitions[tag][lang] || {};
                        return serverPost({ a: 'tagSet', tagName: tag, lang: lang, label: entry.label || tag, description: entry.description || '' });
                    });
                }, Promise.resolve());
            }).catch(function(error) {
                ctx.report.problems.push(error.message);
            });
        }, Promise.resolve());

    }

    // The project's overview map, playback settings and global CSS, as chosen.
    function importProjectParts(ctx, bundle) {

        var Database = FrameTrail.module('Database'),
            tasks    = Promise.resolve();

        if (ctx.parts.map && bundle.hypervideosIndex && isObject(bundle.hypervideosIndex.overviewMap)) {
            tasks = tasks.then(function() {
                var map = clone(bundle.hypervideosIndex.overviewMap), markers = {};
                Object.keys(map.markers || {}).forEach(function(sourceID) {
                    if (ctx.ids[sourceID]) { markers[ctx.ids[sourceID]] = map.markers[sourceID]; }
                });
                map.markers = markers;
                if (typeof map.background === 'string') { map.background = mapPath(ctx, map.background); }
                map.lastchanged = Date.now();
                if (storageMode() === 'local') {
                    var adapter = FrameTrail.module('StorageManager').getAdapter();
                    return adapter.readJSON('hypervideos/_index.json').then(function(index) {
                        index.overviewMap = map;
                        return adapter.writeJSON('hypervideos/_index.json', index);
                    });
                }
                var current = Database.overviewMap || {};
                return serverPost({ a: 'overviewMapChange', src: JSON.stringify(map), baseVersion: (current.lastchanged == null ? '' : current.lastchanged) });
            }).catch(function(error) { ctx.report.problems.push(error.message); });
        }

        if (ctx.parts.settings && isObject(bundle.config)) {
            tasks = tasks.then(function() {
                return new Promise(function(resolve) {
                    Serializer.PLAYBACK_CONFIG_KEYS.forEach(function(key) {
                        if (bundle.config[key] !== undefined) { Database.config[key] = bundle.config[key]; }
                    });
                    Database.saveConfig(function(result) {
                        if (result && result.failed) { ctx.report.problems.push(labels['ImportProblemSettings'] + ' ' + (result.error || result.code || '')); }
                        resolve();
                    });
                });
            });
        }

        if (ctx.parts.css && ctx.code && typeof bundle.customCSS === 'string' && bundle.customCSS.trim()) {
            tasks = tasks.then(function() {
                var styleEl = document.head.querySelector('style.FrameTrailGlobalCustomCSS'),
                    current = styleEl ? Promise.resolve(styleEl.textContent)
                                      : FrameTrail.module('StorageManager').getAdapter().readText('custom.css').catch(function() { return ''; });
                return current.then(function(css) {
                    if (!styleEl) {
                        styleEl = document.createElement('style');
                        styleEl.className = 'FrameTrailGlobalCustomCSS';
                        document.head.appendChild(styleEl);
                    }
                    styleEl.textContent = (css && css.trim() ? css.replace(/\s+$/, '') + '\n\n' : '') + bundle.customCSS;
                    return new Promise(function(resolve) {
                        Database.saveGlobalCSS(function(result) {
                            if (result && result.failed) { ctx.report.problems.push(labels['ImportProblemCSS'] + ' ' + (result.error || result.code || '')); }
                            resolve();
                        });
                    });
                });
            });
        }

        return tasks;

    }

    // The library shown again, with what was imported.
    function reload() {
        var Database = FrameTrail.module('Database');
        return new Promise(function(resolve) {
            Database.loadResourceData(function() {
                Database.loadHypervideoData(function() {
                    FrameTrail.module('TagModel').updateTagModel(function() {}, function() {});
                    var ViewOverview = FrameTrail.module('ViewOverview'),
                        map          = (ViewOverview && ViewOverview.getMap) ? ViewOverview.getMap() : null;
                    if (map && map.reload) { map.reload(); }
                    if (ViewOverview) { ViewOverview.refreshList(); }
                    if (FrameTrail.module('Collaboration')) { FrameTrail.module('Collaboration').acknowledgeVersion(null, 'library', 'global'); }
                    resolve();
                }, resolve);
            }, resolve);
        });
    }

    /**
     * I import what a file was read into (see readFile).
     *
     * options: annotations (others' annotations too), code (global events,
     * code snippets, custom CSS), parts: { map, settings, css } of a project.
     *
     * @method importBundle
     * @param {Object} source  { bundle, datapath, media }
     * @param {Object} options
     * @return {Promise} { hypervideos: [new ids], resourcesCreated, resourcesReused, annotations, unresolved, problems }
     */
    function importBundle(source, options) {

        var bundle = source.bundle,
            ctx = {
                datapath:    source.datapath ? new URL(source.datapath, window.location.href).href : null,
                media:       source.media || {},
                annotations: !!options.annotations,
                code:        !!options.code,
                parts:       options.parts || {},
                resources:   {},
                paths:       {},
                ids:         {},
                unresolved:  [],
                report:      { hypervideos: [], resourcesCreated: 0, resourcesReused: 0, annotations: 0, unresolved: [], problems: [] }
            };

        var copy = (storageMode() === 'local' && Object.keys(ctx.media).length) ? copyMediaLocally(ctx) : Promise.resolve();

        return copy.then(function() {
            return importResources(ctx, resourcesOf(bundle));
        }).then(function() {
            var prepared = hypervideosOf(bundle).map(function(entry) {
                var item = prepare(ctx, entry.bundle);
                item.sourceID = entry.id;
                return item;
            });
            return writeHypervideos(ctx, prepared).then(function() {
                return ctx.annotations ? writeAnnotations(ctx, prepared) : null;
            });
        }).then(function() {
            return importTags(ctx, bundle.tagdefinitions);
        }).then(function() {
            return (bundle.bundle === 'project') ? importProjectParts(ctx, bundle) : null;
        }).then(reload).then(function() {
            ctx.report.hypervideos = Object.keys(ctx.ids).map(function(sourceID) { return ctx.ids[sourceID]; });
            ctx.report.unresolved  = ctx.unresolved;
            return ctx.report;
        });

    }


    /* ------------------------------------------------------------------ */
    /*  The dialog                                                        */
    /* ------------------------------------------------------------------ */

    function switchRow(name, label, checked, disabled, hint) {
        return '<div class="checkboxRow">'
             + '<label class="switch"><input type="checkbox" name="' + name + '"' + (checked ? ' checked' : '') + (disabled ? ' disabled' : '') + '><span class="slider round"></span></label>'
             + '<label' + (disabled ? ' style="opacity: 0.4;"' : '') + '>' + label + (hint ? ' <small>(' + hint + ')</small>' : '') + '</label>'
             + '</div>';
    }

    function summaryHTML(source) {

        var bundle  = source.bundle,
            items   = hypervideosOf(bundle),
            server  = storageMode() === 'server',
            admin   = isAdmin(),
            managed = !!FrameTrail.module('UserManagement').externalSettings(),
            empty   = !Object.keys(FrameTrail.module('Database').hypervideos || {}).length,
            hasCode = items.some(function(entry) { return codeOf(entry.bundle.hypervideo).any; }) || (bundle.bundle === 'project' && typeof bundle.customCSS === 'string' && bundle.customCSS.trim() !== ''),
            hasNotes = items.some(function(entry) { return annotationsOf(entry.bundle).length; }),
            html    = '';

        items.forEach(function(entry) {
            var hypervideo = entry.bundle.hypervideo,
                code       = codeOf(hypervideo),
                languages  = Object.keys(entry.bundle.subtitles || {}),
                details    = [labels['ImportAnnotationCount'].replace('%s', annotationsOf(entry.bundle).length)];
            if (languages.length) { details.push(labels['ImportSubtitleLanguages'].replace('%s', languages.join(', '))); }
            if (code.any) { details.push(labels['ImportHasCode']); }
            html += '<div><strong>' + escapeHTML((hypervideo.meta && hypervideo.meta.name) || entry.id) + '</strong> — ' + escapeHTML(details.join(', ')) + '</div>';
        });

        html += '<p>' + labels['ImportResourceCount'].replace('%s', Object.keys(resourcesOf(bundle)).length) + '</p>';

        if (hasNotes) {
            html += switchRow('importAnnotations', labels['ImportOptionAnnotations'], true, false);
        }
        if (hasCode) {
            html += switchRow('importCode', labels['ImportOptionCode'], false, server && !admin, (server && !admin) ? labels['ImportAdminOnly'] : '');
        }

        if (bundle.bundle === 'project') {
            var partsDisabled = server && !admin;
            if (bundle.hypervideosIndex && isObject(bundle.hypervideosIndex.overviewMap)) {
                html += switchRow('importMap', labels['ImportOptionMap'], empty && !partsDisabled, partsDisabled, partsDisabled ? labels['ImportAdminOnly'] : '');
            }
            if (isObject(bundle.config) && Object.keys(bundle.config).length) {
                html += switchRow('importSettings', labels['ImportOptionSettings'], empty && !partsDisabled && !managed, partsDisabled || managed,
                                  managed ? labels['ImportManagedSettings'] : (partsDisabled ? labels['ImportAdminOnly'] : ''));
            }
            if (typeof bundle.customCSS === 'string' && bundle.customCSS.trim() !== '') {
                html += switchRow('importCSS', labels['ImportOptionCSS'], empty && !partsDisabled && !managed, partsDisabled || managed,
                                  managed ? labels['ImportManagedSettings'] : (partsDisabled ? labels['ImportAdminOnly'] : ''));
            }
        }

        return html;

    }

    /**
     * I open the import dialog.
     *
     * @method open
     */
    function open() {

        if (['server', 'local'].indexOf(storageMode()) < 0 || !FrameTrail.module('StorageManager').canSave()) { return; }

        var wrapper = document.createElement('div');
        wrapper.innerHTML = '<div class="importDialog">'
                          + '<p>' + labels['ImportChooseFile'] + '</p>'
                          + '<input type="file" class="importFile" accept=".html,.htm,.json,.zip">'
                          + '<div class="importSummary"></div>'
                          + '</div>';

        var content  = wrapper.firstElementChild,
            fileEl   = content.querySelector('.importFile'),
            summary  = content.querySelector('.importSummary'),
            source   = null,
            dialogCtrl, importButton, messageEl;

        function showMessage(text, kind) {
            messageEl.className = 'message active ' + (kind || 'error');
            messageEl.innerHTML = text;
        }

        fileEl.addEventListener('change', function() {
            source = null;
            summary.innerHTML = '';
            importButton.disabled = true;
            messageEl.className = 'message';
            if (!fileEl.files || !fileEl.files[0]) { return; }
            readFile(fileEl.files[0]).then(function(read) {
                var errors = validate(read.bundle);
                if (errors.length) {
                    showMessage(labels['ImportErrorInvalid'] + '<br>' + errors.slice(0, 8).map(function(e) {
                        return escapeHTML((e.path || '/') + ': ' + e.message);
                    }).join('<br>') + (errors.length > 8 ? '<br>…' : ''));
                    return;
                }
                source = read;
                summary.innerHTML = summaryHTML(read);
                importButton.disabled = false;
            }).catch(function(error) {
                showMessage(escapeHTML(error.message));
            });
        });

        function checkedBox(name) {
            var input = summary.querySelector('[name="' + name + '"]');
            return !!(input && input.checked && !input.disabled);
        }

        dialogCtrl = Dialog({
            title:     labels['GenericImport'],
            icon:      'icon-upload',
            content:   content,
            modal:     true,
            width:     640,
            resizable: false,
            close:     function() { dialogCtrl.destroy(); },
            buttons: [
                { text: labels['GenericImport'], click: function() {
                    if (!source) { return; }
                    importButton.disabled = true;
                    fileEl.disabled = true;
                    showMessage(labels['ImportRunning'], 'active');
                    importBundle(source, {
                        annotations: checkedBox('importAnnotations'),
                        code:        checkedBox('importCode'),
                        parts:       { map: checkedBox('importMap'), settings: checkedBox('importSettings'), css: checkedBox('importCSS') }
                    }).then(function(report) {
                        var lines = [labels['ImportDone'].replace('%s', report.hypervideos.length)];
                        if (report.unresolved.length) { lines.push(labels['ImportProblemMedia'].replace('%s', report.unresolved.map(escapeHTML).join(', '))); }
                        report.problems.forEach(function(problem) { lines.push(escapeHTML(problem)); });
                        showMessage(lines.join('<br>'), (report.problems.length || report.unresolved.length) ? 'warning' : 'success');
                    }, function(error) {
                        showMessage(labels['ImportFailed'].replace('%s', escapeHTML(error.message)));
                    });
                } },
                { text: labels['GenericClose'], click: function() { dialogCtrl.close(); } }
            ]
        });

        var buttonPane = dialogCtrl.widget().querySelector('.ft-dialog-buttonpane');
        messageEl = document.createElement('div');
        messageEl.className = 'message';
        messageEl.style.flexBasis = '100%';
        buttonPane.prepend(messageEl);
        importButton = buttonPane.querySelector('button');
        importButton.disabled = true;

    }


    return {
        open:         open,
        readFile:     readFile,
        validate:     validate,
        importBundle: importBundle
    };

});
