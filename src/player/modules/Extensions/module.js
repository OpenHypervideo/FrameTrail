/**
 * @module Player
 */


/**
 * I am the Extensions module. I load the extensions an instance names and give
 * them their places in the interface.
 *
 * An extension is code that is not part of FrameTrail. It registers itself with
 * FrameTrail.registerExtension(name, factory) — from a script the host page
 * includes, or from one that I load — and is named in the `extensions` init
 * option or in config.json → extensions:
 *
 *     "extensions": [
 *         { "name": "hello", "script": "extensions/hello/hello.js",
 *           "style": "extensions/hello/hello.css", "settings": { … } }
 *     ]
 *
 * I run after the data has loaded (that is when config.json is known) and
 * before the interface is built. A script or stylesheet that fails to load is
 * reported in the console and skipped: a _data directory is portable and may
 * name an extension that another installation does not have.
 *
 * The places (slots) an extension can take:
 * * sidePanel: a panel docked to the right of the main container, opened from
 *   a button in the title bar. It stays open across edit modes.
 * * titlebarAction: a button in the title bar.
 * * editPanel: an edit mode of its own, with a button among the edit modes in
 *   the sidebar and the shared edit panel (Add / Properties) while it is active.
 *
 * Lifecycle: init(settings) once loaded, onReady() once the interface is up,
 * onHypervideoChange(hypervideoID) whenever a hypervideo has been (re)loaded,
 * onChange handlers like a module's (called by frametrail-core after all
 * modules), onUnload() when the instance is destroyed.
 *
 * See docs/EXTENDING.md, "Writing an Extension".
 *
 * @class Extensions
 * @static
 */


FrameTrail.defineModule('Extensions', function(FrameTrail){

    var labels = FrameTrail.module('Localization').labels;

    // The same rules as schemas/config.schema.json: a relative path, so the
    // file is on the page's own origin, without query or fragment.
    var NAME_PATTERN  = /^[a-z0-9][a-z0-9-]*$/,
        PATH_PATTERN  = /^[^\/:?#][^:?#]*$/,
        ICON_PATTERN  = /^[A-Za-z0-9_ -]+$/,
        LOAD_TIMEOUT  = 10000,
        MOBILE_WIDTH  = 768,

        SIDE_PANEL_WIDTH     = 360,
        SIDE_PANEL_MIN_WIDTH = 200,
        SIDE_PANEL_MAX_WIDTH = 800,

        // Edit modes FrameTrail has itself: an edit panel cannot take their names.
        BUILT_IN_EDIT_MODES = ['preview', 'layout', 'overlays', 'codesnippets', 'chapters', 'annotations', 'audio', 'map', 'settings'];

    var loadState       = 'idle',   // 'idle' | 'loading' | 'done'
        waiting         = [],
        loaded          = [],       // [{ name, extension }] in load order
        styleUrls       = [],
        created         = false,
        isReady         = false,

        sidePanelContainer = null,
        sidePanels      = {},       // name → { slot, width, element, toggle, handle }
        wantedSidePanel = null,     // the panel the user opened
        shownSidePanel  = null,     // the panel on screen: wanted, and allowed in this mode
        relayoutTimeout = null,

        titlebarActions = {},       // name → { slot, button }
        editPanels      = {},       // name → { slot, button }
        activeEditPanel = null;


    /**
     * I load the extensions named in the init option and in the config, and
     * call each one's init(settings). The callback runs once they are loaded
     * or have failed — never later than LOAD_TIMEOUT — and at once (in the
     * same turn) when no extension is named. Calls after the first wait for
     * the same load.
     *
     * @method load
     * @param {Function} callback
     */
    function load(callback) {

        if (loadState === 'done') {
            callback();
            return;
        }

        waiting.push(callback);

        if (loadState === 'loading') return;

        loadState = 'loading';

        var entries = collectEntries(),
            pending = [];

        entries.forEach(function(entry) {
            if (entry.styleUrl) {
                styleUrls.push(entry.styleUrl);
                pending.push(addStyle(entry.styleUrl));
            }
            if (entry.scriptUrl) {
                pending.push(loadScript(entry.scriptUrl));
            }
        });

        if (pending.length === 0) {
            finishLoading(entries);
            return;
        }

        Promise.all(pending).then(function() {
            finishLoading(entries);
        });

    }


    /**
     * I read the extension entries from the init option and from the config,
     * in that order. An extension named in both is loaded once; the first
     * entry wins and the later one only fills in what it lacks.
     *
     * @method collectEntries
     * @return {Array} [{ name, script, style, settings, scriptUrl, styleUrl }]
     * @private
     */
    function collectEntries() {

        var Database = FrameTrail.module('Database'),
            byName   = {},
            entries  = [];

        addEntries(FrameTrail.getState('extensions'), 'init option "extensions"');
        addEntries(((Database && Database.config) || {}).extensions, 'config.json → extensions');

        function addEntries(source, origin) {

            if (source === undefined || source === null) return;

            if (!Array.isArray(source)) {
                console.warn('FrameTrail: ' + origin + ' must be a list; ignored.');
                return;
            }

            source.forEach(function(raw) {

                var entry = normalizeEntry(raw, origin);
                if (!entry) return;

                var known = byName[entry.name];

                if (!known) {
                    byName[entry.name] = entry;
                    entries.push(entry);
                    return;
                }

                ['script', 'style', 'scriptUrl', 'styleUrl', 'settings'].forEach(function(key) {
                    if (known[key] === undefined && entry[key] !== undefined) {
                        known[key] = entry[key];
                    }
                });

            });

        }

        return entries;

    }


    /**
     * I check one entry: a name, or { name, script?, style?, settings? }.
     *
     * @method normalizeEntry
     * @param {String|Object} raw
     * @param {String} origin  where the entry came from, for the warning
     * @return {Object|null}
     * @private
     */
    function normalizeEntry(raw, origin) {

        var entry = (typeof raw === 'string') ? { name: raw } : raw;

        if (typeof entry !== 'object' || entry === null || typeof entry.name !== 'string' || !NAME_PATTERN.test(entry.name)) {
            console.warn('FrameTrail: ' + origin + ': ' + JSON.stringify(raw) + ' is not an extension entry ({ name: "lowercase-name", … }); ignored.');
            return null;
        }

        var result = { name: entry.name };

        if (entry.script !== undefined) {
            result.script    = entry.script;
            result.scriptUrl = resolvePath(entry.script);
            if (!result.scriptUrl) {
                console.warn('FrameTrail: ' + origin + ': extension "' + entry.name + '": script "' + entry.script + '" is not a relative path on this origin; extension ignored.');
                return null;
            }
        }

        if (entry.style !== undefined) {
            result.style    = entry.style;
            result.styleUrl = resolvePath(entry.style);
            if (!result.styleUrl) {
                console.warn('FrameTrail: ' + origin + ': extension "' + entry.name + '": style "' + entry.style + '" is not a relative path on this origin; extension ignored.');
                return null;
            }
        }

        // PHP writes an empty object as [], so a config that went through the
        // server can hold [] for {}.
        if (Array.isArray(entry.settings) && entry.settings.length === 0) {
            result.settings = {};
        } else if (entry.settings !== undefined) {
            result.settings = entry.settings;
        }

        return result;

    }


    /**
     * I resolve a relative path against the page, and refuse anything that is
     * not a relative path or that leaves the page's origin (e.g. through a
     * <base> element pointing elsewhere).
     *
     * @method resolvePath
     * @param {String} path
     * @return {String|null} the absolute URL
     * @private
     */
    function resolvePath(path) {

        if (typeof path !== 'string' || !PATH_PATTERN.test(path)) return null;

        try {
            var url = new URL(path, document.baseURI);
            return (url.origin === window.location.origin) ? url.href : null;
        } catch (e) {
            return null;
        }

    }


    /**
     * I add a script to the page, once per page however many instances ask
     * for it, and resolve when it has run, failed or timed out.
     *
     * @method loadScript
     * @param {String} url
     * @return {Promise}
     * @private
     */
    function loadScript(url) {

        return new Promise(function(resolve) {

            var script = Array.prototype.find.call(document.scripts, function(el) { return el.src === url; });

            // A script the host page included itself has already run.
            if (script && !script.hasAttribute('data-frametrail-extension')) {
                resolve();
                return;
            }

            if (script && script.getAttribute('data-frametrail-extension') !== 'loading') {
                resolve();
                return;
            }

            if (!script) {
                script = document.createElement('script');
                script.src = url;
                script.async = false;
                script.setAttribute('data-frametrail-extension', 'loading');
                script.addEventListener('load', function() {
                    script.setAttribute('data-frametrail-extension', 'loaded');
                });
                script.addEventListener('error', function() {
                    script.setAttribute('data-frametrail-extension', 'failed');
                    console.warn('FrameTrail: extension script ' + url + ' could not be loaded.');
                });
                document.head.appendChild(script);
            }

            settleOnLoad(script, url, resolve);

        });

    }


    /**
     * I add a stylesheet to the page, once per page, and count the instances
     * that use it so the last one to unload can remove it. It goes before the
     * global custom.css, which must be able to override it.
     *
     * @method addStyle
     * @param {String} url
     * @return {Promise}
     * @private
     */
    function addStyle(url) {

        return new Promise(function(resolve) {

            var link = Array.prototype.find.call(document.querySelectorAll('link[data-frametrail-extension]'), function(el) { return el.href === url; });

            if (link) {
                link._frametrailUsers = (link._frametrailUsers || 0) + 1;
                if (link.getAttribute('data-frametrail-extension') !== 'loading') {
                    resolve();
                    return;
                }
                settleOnLoad(link, url, resolve);
                return;
            }

            link = document.createElement('link');
            link.rel  = 'stylesheet';
            link.type = 'text/css';
            link.href = url;
            link._frametrailUsers = 1;
            link.setAttribute('data-frametrail-extension', 'loading');
            link.addEventListener('load', function() {
                link.setAttribute('data-frametrail-extension', 'loaded');
            });
            link.addEventListener('error', function() {
                link.setAttribute('data-frametrail-extension', 'failed');
                console.warn('FrameTrail: extension stylesheet ' + url + ' could not be loaded.');
            });

            var customCSS = document.head.querySelector('style.FrameTrailGlobalCustomCSS, link[href*="custom.css"]');
            if (customCSS) {
                document.head.insertBefore(link, customCSS);
            } else {
                document.head.appendChild(link);
            }

            settleOnLoad(link, url, resolve);

        });

    }


    function settleOnLoad(element, url, resolve) {

        var timeout = window.setTimeout(function() {
            console.warn('FrameTrail: ' + url + ' took longer than ' + (LOAD_TIMEOUT / 1000) + ' s to load; continuing without waiting for it.');
            resolve();
        }, LOAD_TIMEOUT);

        function done() {
            window.clearTimeout(timeout);
            resolve();
        }

        element.addEventListener('load', done);
        element.addEventListener('error', done);

    }


    function removeStyle(url) {

        var link = Array.prototype.find.call(document.querySelectorAll('link[data-frametrail-extension]'), function(el) { return el.href === url; });
        if (!link) return;

        link._frametrailUsers = (link._frametrailUsers || 1) - 1;
        if (link._frametrailUsers <= 0) {
            link.remove();
        }

    }


    /**
     * I create the loaded extensions in this instance and call their init.
     *
     * @method finishLoading
     * @param {Array} entries
     * @private
     */
    function finishLoading(entries) {

        entries.forEach(function(entry) {

            var extension;

            try {
                extension = FrameTrail.initExtension(entry.name);
                if (!extension) {
                    console.warn('FrameTrail: extension "' + entry.name + '" is not available'
                        + (entry.script ? ' (' + entry.script + ' did not register it)' : ' (no script given, and the page did not register it)')
                        + '; skipped.');
                }
            } catch (e) {
                console.error('FrameTrail extension "' + entry.name + '": its definition failed; skipped.', e);
            }

            if (!extension) {
                if (entry.styleUrl) releaseStyle(entry.styleUrl);
                return;
            }

            try {
                if (typeof extension.init === 'function') {
                    extension.init.call(extension, (entry.settings === undefined) ? {} : entry.settings);
                }
            } catch (e) {
                console.error('FrameTrail extension "' + entry.name + '": init failed; extension unloaded.', e);
                FrameTrail.unloadExtension(entry.name);
                if (entry.styleUrl) releaseStyle(entry.styleUrl);
                return;
            }

            loaded.push({ name: entry.name, extension: extension });

        });

        loadState = 'done';

        var callbacks = waiting;
        waiting = [];
        callbacks.forEach(function(callback) { callback(); });

    }


    function releaseStyle(url) {

        var idx = styleUrls.indexOf(url);
        if (idx !== -1) styleUrls.splice(idx, 1);
        removeStyle(url);

    }


    /**
     * I am called from {{#crossLink "Interface/create:method"}}Interface/create(){{/crossLink}},
     * after the title bar, the sidebar and the main container exist, and put
     * each extension's slots in place.
     *
     * @method create
     */
    function create() {

        if (created) return;
        created = true;

        loaded.forEach(function(item) {

            var slots = item.extension.slots;
            if (typeof slots !== 'object' || slots === null) return;

            try {
                if (slots.sidePanel)      createSidePanel(item.name, slots.sidePanel);
                if (slots.titlebarAction) createTitlebarAction(item.name, slots.titlebarAction);
                if (slots.editPanel)      createEditPanel(item.name, slots.editPanel);
            } catch (e) {
                console.error('FrameTrail extension "' + item.name + '": its slots could not be created.', e);
            }

        });

        updateSlotVisibility();

    }


    function iconClass(slot) {

        return (typeof slot.icon === 'string' && ICON_PATTERN.test(slot.icon)) ? slot.icon : 'icon-puzzle';

    }


    function labelOf(slot, name) {

        return (typeof slot.label === 'string' && slot.label) ? slot.label : name;

    }


    function callSlot(name, slot, method, args) {

        if (typeof slot[method] !== 'function') return;

        try {
            slot[method].apply(slot, args || []);
        } catch (e) {
            console.error('FrameTrail extension "' + name + '": ' + method + ' failed.', e);
        }

    }


    function titlebarButton(name, slot, className) {

        var button = document.createElement('button'),
            icon   = document.createElement('span'),
            label  = labelOf(slot, name);

        button.type = 'button';
        button.className = className;
        button.setAttribute('data-extension', name);
        button.setAttribute('data-tooltip-bottom-right', label);
        button.setAttribute('aria-label', label);
        icon.className = iconClass(slot);
        button.appendChild(icon);

        return button;

    }


    /**
     * A side panel: a toggle button in the title bar, and the panel itself in
     * the container docked beside .mainContainer. The extension's create(container,
     * panel) builds its content once, now; panel = { open, close, toggle, isOpen }.
     *
     * @method createSidePanel
     * @private
     */
    function createSidePanel(name, slot) {

        var Titlebar = FrameTrail.module('Titlebar');
        if (!Titlebar) return;

        if (!sidePanelContainer) {
            sidePanelContainer = document.createElement('div');
            sidePanelContainer.className = 'sidePanel';
            document.querySelector(FrameTrail.getState('target')).append(sidePanelContainer);
        }

        var label = labelOf(slot, name),
            width = parseInt(slot.width, 10);

        width = isNaN(width) ? SIDE_PANEL_WIDTH : Math.max(SIDE_PANEL_MIN_WIDTH, Math.min(SIDE_PANEL_MAX_WIDTH, width));

        var element = document.createElement('div');
        element.className = 'sidePanelItem';
        element.setAttribute('data-extension', name);
        element.setAttribute('role', 'complementary');
        element.setAttribute('aria-label', label);

        var header = document.createElement('div');
        header.className = 'sidePanelHeader';

        var title = document.createElement('span');
        title.className = 'sidePanelTitle';
        title.textContent = label;

        var closeButton = document.createElement('button');
        closeButton.type = 'button';
        closeButton.className = 'sidePanelCloseButton';
        closeButton.setAttribute('data-tooltip-bottom-right', labels['GenericClose']);
        closeButton.setAttribute('aria-label', labels['GenericClose']);
        closeButton.innerHTML = '<span class="icon-cancel"></span>';
        closeButton.addEventListener('click', function() { closeSidePanel(name); });

        var content = document.createElement('div');
        content.className = 'sidePanelContent';

        header.append(title, closeButton);
        element.append(header, content);
        sidePanelContainer.append(element);

        var toggle = titlebarButton(name, slot, 'sidePanelToggle');
        toggle.addEventListener('click', function() { toggleSidePanel(name); });
        Titlebar.addActionButton(toggle);

        var handle = {
            open:   function() { openSidePanel(name); },
            close:  function() { closeSidePanel(name); },
            toggle: function() { toggleSidePanel(name); },
            get isOpen() { return shownSidePanel === name; }
        };

        sidePanels[name] = { slot: slot, width: width, element: element, toggle: toggle, handle: handle };

        callSlot(name, slot, 'create', [content, handle]);

    }


    function openSidePanel(name) {

        if (!sidePanels[name]) return;
        wantedSidePanel = name;
        applySidePanel();

    }


    function closeSidePanel(name) {

        if (name && wantedSidePanel !== name) return;
        wantedSidePanel = null;
        applySidePanel();

    }


    function toggleSidePanel(name) {

        if (shownSidePanel === name) {
            closeSidePanel(name);
        } else {
            openSidePanel(name);
        }

    }


    /**
     * I show the wanted side panel if its slot is allowed in the current mode
     * (a panel for editing hides when editing ends and comes back with it),
     * dock it beside the main container, and tell the extensions concerned.
     *
     * @method applySidePanel
     * @private
     */
    function applySidePanel() {

        if (!sidePanelContainer) return;

        var previous = shownSidePanel,
            wanted   = wantedSidePanel ? sidePanels[wantedSidePanel] : null;

        shownSidePanel = (wanted && isSlotVisible(wanted.slot)) ? wantedSidePanel : null;

        for (var name in sidePanels) {
            sidePanels[name].element.classList.toggle('active', name === shownSidePanel);
            sidePanels[name].toggle.classList.toggle('active', name === shownSidePanel);
        }

        var target        = document.querySelector(FrameTrail.getState('target')),
            mainContainer = target.querySelector('.mainContainer');

        if (shownSidePanel) {
            target.style.setProperty('--ft-side-panel-width', sidePanels[shownSidePanel].width + 'px');
        }

        sidePanelContainer.classList.toggle('open', !!shownSidePanel);
        sidePanelContainer.classList.toggle('editActive', !!FrameTrail.getState('editMode'));
        if (mainContainer) {
            mainContainer.classList.toggle('sidePanelOpen', !!shownSidePanel);
        }

        if (previous === shownSidePanel) return;

        if (previous && sidePanels[previous]) {
            callSlot(previous, sidePanels[previous].slot, 'onClose');
        }
        if (shownSidePanel) {
            callSlot(shownSidePanel, sidePanels[shownSidePanel].slot, 'onOpen');
        }

        relayout();

    }


    /**
     * The main container changes width without the window doing so, so
     * nothing else would re-lay out the video; content views and other
     * size-dependent parts follow with the usual delayed state.
     *
     * @method relayout
     * @private
     */
    function relayout() {

        var ViewVideo = FrameTrail.module('ViewVideo');

        if (ViewVideo && FrameTrail.getState('viewMode') === 'video') {
            ViewVideo.adjustLayout();
            ViewVideo.adjustHypervideo(true);
        }

        window.clearTimeout(relayoutTimeout);
        relayoutTimeout = window.setTimeout(function() {
            FrameTrail.changeState('viewSizeChanged');
        }, 300);

    }


    function createTitlebarAction(name, slot) {

        var Titlebar = FrameTrail.module('Titlebar');
        if (!Titlebar) return;

        var button = titlebarButton(name, slot, 'extensionAction');
        button.addEventListener('click', function(evt) {
            callSlot(name, slot, 'onClick', [evt]);
        });

        Titlebar.addActionButton(button);

        titlebarActions[name] = { slot: slot, button: button };

    }


    /**
     * An edit mode named after the extension. While it is active the
     * extension gets the shared edit panel: enter(panel) with
     * panel = { add, properties, showTab('add' | 'properties') }, then leave().
     * Unless the slot says editsHypervideo: false, the mode follows the rules
     * of the modes that write to the hypervideo: only for its owner and admins,
     * and it takes the collaboration lock.
     *
     * @method createEditPanel
     * @private
     */
    function createEditPanel(name, slot) {

        var Sidebar = FrameTrail.module('Sidebar');
        if (!Sidebar) return;

        if (BUILT_IN_EDIT_MODES.indexOf(name) !== -1) {
            console.warn('FrameTrail extension "' + name + '": "' + name + '" is a built-in edit mode; editPanel ignored.');
            return;
        }

        var button = Sidebar.addEditModeButton({
            mode:            name,
            label:           labelOf(slot, name),
            icon:            iconClass(slot),
            editsHypervideo: slot.editsHypervideo !== false
        });

        editPanels[name] = { slot: slot, button: button };

    }


    function enterEditPanel(name) {

        var ViewVideo = FrameTrail.module('ViewVideo');
        if (!ViewVideo || !editPanels[name]) return;

        activeEditPanel = name;

        var add        = ViewVideo.EditingOptions,
            properties = ViewVideo.EditPropertiesContainer;

        add.innerHTML = '';
        properties.innerHTML = '';
        properties.classList.remove('active');
        ViewVideo.switchInfoTab('add');

        callSlot(name, editPanels[name].slot, 'enter', [{
            add:        add,
            properties: properties,
            showTab:    function(tab) {
                if (activeEditPanel !== name) return;
                if (tab === 'properties') {
                    properties.classList.add('active');
                    ViewVideo.switchInfoTab('properties');
                } else {
                    ViewVideo.switchInfoTab('add');
                }
            }
        }]);

    }


    function leaveEditPanel() {

        var name = activeEditPanel;
        if (!name) return;

        activeEditPanel = null;

        callSlot(name, editPanels[name].slot, 'leave');

        // Like the built-in modes when their item loses focus: the properties
        // tab goes, so the next mode does not show this one's.
        var ViewVideo = FrameTrail.module('ViewVideo');
        if (ViewVideo) {
            ViewVideo.EditPropertiesContainer.classList.remove('active');
            ViewVideo.EditPropertiesContainer.innerHTML = '';
        }

    }


    function isSlotVisible(slot) {

        var editing = !!FrameTrail.getState('editMode');

        if (slot.when === 'edit') return editing;
        if (slot.when === 'view') return !editing;
        return true;

    }


    function updateSlotVisibility() {

        var name;

        for (name in titlebarActions) {
            titlebarActions[name].button.style.display = isSlotVisible(titlebarActions[name].slot) ? '' : 'none';
        }

        for (name in sidePanels) {
            sidePanels[name].toggle.style.display = isSlotVisible(sidePanels[name].slot) ? '' : 'none';
        }

        applySidePanel();

    }


    /**
     * I react to a change in the global state "editMode".
     *
     * Leaving an extension's edit mode happens at once, before the next mode
     * fills the shared panel. Entering waits until every module has handled
     * the change: the built-in modes clear the panel as they leave, in no
     * guaranteed order, and would otherwise wipe what the extension put there.
     *
     * @method toggleEditMode
     * @param {String|Boolean} editMode
     * @private
     */
    function toggleEditMode(editMode) {

        if (activeEditPanel && activeEditPanel !== editMode) {
            leaveEditPanel();
        }

        if (editPanels[editMode] && activeEditPanel !== editMode) {
            Promise.resolve().then(function() {
                if (FrameTrail.getState('editMode') === editMode && activeEditPanel !== editMode) {
                    enterEditPanel(editMode);
                }
            });
        }

        if (created) {
            updateSlotVisibility();
        }

    }


    function callHook(hook, args) {

        loaded.forEach(function(item) {

            if (typeof item.extension[hook] !== 'function') return;

            try {
                item.extension[hook].apply(item.extension, args || []);
            } catch (e) {
                console.error('FrameTrail extension "' + item.name + '": ' + hook + ' failed.', e);
            }

        });

    }


    /**
     * I am called once the interface is up: the overview is shown, or the
     * first hypervideo is ready to play.
     *
     * @method ready
     */
    function ready() {

        if (isReady) return;
        isReady = true;

        callHook('onReady');

    }


    /**
     * I am called whenever a hypervideo has been loaded and is ready to play:
     * the first one, one the user switched to, and the same one reloaded.
     *
     * @method hypervideoChanged
     * @param {String} hypervideoID
     */
    function hypervideoChanged(hypervideoID) {

        callHook('onHypervideoChange', [hypervideoID]);

    }


    /**
     * I unload every extension (their onUnload) and remove what I added to
     * the page. Called from the instance's destroy().
     *
     * @method unload
     */
    function unload() {

        leaveEditPanel();

        loaded.slice().reverse().forEach(function(item) {
            FrameTrail.unloadExtension(item.name);
        });
        loaded = [];

        styleUrls.forEach(removeStyle);
        styleUrls = [];

        window.clearTimeout(relayoutTimeout);

        var name;
        for (name in sidePanels)      sidePanels[name].toggle.remove();
        for (name in titlebarActions) titlebarActions[name].button.remove();
        for (name in editPanels)      editPanels[name].button.remove();

        if (sidePanelContainer) {
            sidePanelContainer.remove();
            var mainContainer = document.querySelector(FrameTrail.getState('target') + ' .mainContainer');
            if (mainContainer) mainContainer.classList.remove('sidePanelOpen');
        }

        sidePanelContainer = null;
        sidePanels = {};
        titlebarActions = {};
        editPanels = {};
        wantedSidePanel = null;
        shownSidePanel = null;

    }


    return {

        load:              load,
        create:            create,
        ready:             ready,
        hypervideoChanged: hypervideoChanged,
        unload:            unload,

        openSidePanel:     openSidePanel,
        closeSidePanel:    closeSidePanel,
        toggleSidePanel:   toggleSidePanel,

        /**
         * I tell whether an edit mode is an extension's edit panel.
         * @method hasEditPanel
         * @param {String} editMode
         * @return {Boolean}
         */
        hasEditPanel: function(editMode) {
            return !!editPanels[editMode];
        },

        /**
         * I am the width the open side panel takes from the main container,
         * in pixels: 0 when none is open, and on narrow screens, where the
         * panel covers the main container instead.
         * @attribute sidePanelWidth
         * @type Number
         * @readOnly
         */
        get sidePanelWidth() {
            if (!shownSidePanel) return 0;
            var target = document.querySelector(FrameTrail.getState('target'));
            if (target && target.offsetWidth <= MOBILE_WIDTH) return 0;
            return sidePanels[shownSidePanel].width;
        },

        onChange: {
            editMode: toggleEditMode
        }

    };

});
