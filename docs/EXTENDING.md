# Extending FrameTrail

This guide explains how to extend FrameTrail with new resource types, modules, localization, themes, and backend actions, and how to write an extension: code that plugs into FrameTrail from outside, without changing its files ([Writing an Extension](#writing-an-extension)).

## Adding a New Resource Type

Resource types define how different media (images, videos, social embeds, etc.) are displayed and edited in FrameTrail. All resource types inherit from the base `Resource` type.

### 1. Create the Type Definition

Create `src/_shared/types/ResourceMyType/type.js`:

```javascript
/**
 * @module Shared
 */

/**
 * I am the type definition of ResourceMyType.
 *
 * @class ResourceMyType
 * @category TypeDefinition
 * @extends Resource
 */

FrameTrail.defineType(
    'ResourceMyType',

    function(FrameTrail) {
        return {
            parent: 'Resource',

            constructor: function(resourceData) {
                this.resourceData = resourceData;
            },

            prototype: {

                /**
                 * I render the resource content for display in the player.
                 * @method renderContent
                 * @return {HTMLElement}
                 */
                renderContent: function() {
                    var self = this;

                    var element = document.createElement('div');
                    element.className = 'resourceDetail';
                    element.dataset.type = 'mytype';
                    element.innerHTML = '<div class="myTypeContent"><!-- Your content here --></div>';

                    this.initializeContent(element);

                    return element;
                },

                /**
                 * I render a thumbnail for the resource manager.
                 * @method renderThumb
                 * @param {String} id
                 * @return {HTMLElement}
                 */
                renderThumb: function(id) {
                    var self = this;
                    var trueID = id || FrameTrail.module('Database').getIdOfResource(this.resourceData);

                    var thumbBackground = this.resourceData.thumb
                        ? 'background-image: url(' + FrameTrail.module('RouteNavigation').getResourceURL(this.resourceData.thumb) + ');'
                        : '';

                    var tagList = (this.resourceData.tags ? this.resourceData.tags.join(' ') : '');

                    var thumbElement = document.createElement('div');
                    thumbElement.className = 'resourceThumb ' + tagList;
                    thumbElement.dataset.licenseType = this.resourceData.licenseType;
                    thumbElement.dataset.resourceid = trueID;
                    thumbElement.dataset.type = this.resourceData.type;
                    if (thumbBackground) { thumbElement.style.cssText = thumbBackground; }
                    thumbElement.innerHTML = '<div class="resourceOverlay">'
                        + '    <div class="resourceIcon"><span class="icon-mytype"></span></div>'
                        + '</div>'
                        + '<div class="resourceTitle">' + this.resourceData.name + '</div>';

                    var previewButton = document.createElement('div');
                    previewButton.className = 'resourcePreviewButton';
                    previewButton.innerHTML = '<span class="icon-eye"></span>';
                    previewButton.addEventListener('click', function(evt) {
                        self.openPreview(thumbElement);
                        evt.stopPropagation();
                        evt.preventDefault();
                    });
                    thumbElement.appendChild(previewButton);

                    return thumbElement;
                },

                /**
                 * I render property controls for overlay editing.
                 * @method renderPropertiesControls
                 * @param {Overlay} overlay
                 * @return {Object}
                 */
                renderPropertiesControls: function(overlay) {
                    var basicControls = this.renderBasicPropertiesControls(overlay);

                    // Add custom controls if needed
                    var customControl = document.createElement('div');
                    customControl.className = 'customControl';
                    customControl.innerHTML = '<label>Custom Setting</label>'
                        + '<input type="text" value="' + (overlay.data.attributes.customSetting || '') + '">';

                    customControl.querySelector('input').addEventListener('change', function() {
                        overlay.data.attributes.customSetting = this.value;
                        FrameTrail.module('HypervideoModel').newUnsavedChange('overlays');
                    });

                    basicControls.controlsContainer.querySelector('#OverlayOptions').appendChild(customControl);

                    return basicControls;
                },

                /**
                 * I render time controls for annotation editing.
                 * @method renderTimeControls
                 * @param {Annotation} annotation
                 * @return {Object}
                 */
                renderTimeControls: function(annotation) {
                    return this.renderBasicTimeControls(annotation);
                },

                initializeContent: function(element) {
                    // Load external scripts, initialize plugins, etc.
                }
            }
        };
    }
);
```

### 2. Create the Stylesheet

Create `src/_shared/types/ResourceMyType/style.css`:

```css
/* Resource detail (displayed in player) */
.resourceDetail[data-type="mytype"] {
    width: 100%;
    height: 100%;
}

.resourceDetail[data-type="mytype"] .myTypeContent {
    /* Your styles */
}

/* Thumbnail in resource manager */
.resourceThumb[data-type="mytype"] .resourceOverlay {
    background: rgba(0, 0, 0, 0.3);
}

/* Annotation tile icon */
.tileElement[data-type="mytype"] [class^="icon-"]::before {
    content: '\e800';  /* Your icon code */
}

/* Edit properties panel icon */
.editPropertiesContainer .propertiesTypeIcon[data-type="mytype"] [class^="icon-"]::before {
    content: '\e800';
}
```

### 3. Register in HTML Files

Add the CSS and JS to `src/index.html` and `src/resources.html`:

```html
<!-- In the CSS section (after other type styles) -->
<link rel="stylesheet" type="text/css" href="_shared/types/ResourceMyType/style.css">

<!-- In the JS section (after Resource/type.js, with other resource types) -->
<script type="text/javascript" src="_shared/types/ResourceMyType/type.js"></script>
```

### 4. Add to Build Script

Add entries to `scripts/build.sh` in the appropriate arrays:

```bash
# In CSS_FILES (after other resource type styles)
"_shared/types/ResourceMyType/style.css"

# In JS_FILES (after _shared/types/Resource/type.js, with other resource types)
"_shared/types/ResourceMyType/type.js"
```

### 5. Add to Resource Manager (Optional)

If your resource type should be creatable via the Resource Manager, update `src/_shared/modules/ResourceManager/module.js` to include your type in the add resource dialog.

### 6. Update Backend (For Uploads)

If your resource type involves file uploads, update `src/_server/files.php` to handle the new file type.

### 7. Animate Your Content (Optional)

Every overlay can get entrance, emphasis and exit animations without any work in the type (they animate the overlay's animation layer). If your type's *content* should animate as well — a number counting, bars growing, a stroke drawing itself — implement one of the optional hooks the `OverlayAnimator` looks for. Animations run on the video clock, so they are exact when paused, scrubbed or seeked:

```javascript
// Called whenever the overlay's animations are (re)built. Put CSS animations on
// your elements — keyframe names must start with "ft" — with delays measured
// from ctx.leadInMs (that moment is the overlay's start time).
animateContent: function(resourceDetail, ctx) {

    if (ctx.reducedMotion) { return null; }   // show the end state

    var bar = resourceDetail.querySelector('.myBar');
    bar.style.animation = ctx.entry('ftMyGrow', 800, 'power2Out', ctx.leadInMs, 1, 'both');

    // Optional per-frame JS for what CSS cannot do (e.g. formatted numbers).
    // localMs is the time since the overlay's start; it is called while playing
    // and on every seek, from the overlay's own animation clock.
    return {
        update:  function(localMs) { /* … */ },
        destroy: function() { /* restore the end state */ }
    };
},
```

`ctx` also offers `spanMs` (length of the overlay), `easeCss(id)` / `easeFn(id)` (the shared ease registry) and `editMode`. Two narrower hooks exist: `getTextRevealRoot(resourceDetail)` (the element whose text the text-reveal presets split) and `getStrokeTargets(resourceDetail)` (SVG strokes with `pathLength="1"` that the Draw preset animates). Render your content in its final state — that is what thumbnails, content views and reduced motion show. If your content is re-rendered after an edit, call `overlay.rerenderContent()` (or `overlay.contentChanged()` after an in-place change) so the animations are rebuilt. See `ResourceCounter`, `ResourceChart` and `ResourceCursor` for complete examples.

### 8. Describe the Data

A new type is a new value of the body's `frametrail:type`, so the data model changes with it. Add `schemas/attributes/<type>.schema.json` listing every attribute your code reads, with a `description` and the `default` your code applies; add your type to the `oneOf` lists that reference attribute schemas (overlay and annotation bodies in `content-item.schema.json` and `annotation-file.schema.json`, resources in `resources-index.schema.json`, as applicable); and add it to the resource type table in [docs/DATA-MODEL.md](DATA-MODEL.md#resource-types). Keep to the [schema subset](DATA-MODEL.md#schema-subset).

Then add an item of the new type to the `all-types` test fixture (`tests/fixtures/data/all-types/`: an overlay in `hypervideo.json`, and an annotation and a resource where the type can be one), and run `node tests/run-js.mjs`. It checks the item against your schema and that it survives reading and writing; see [tests/README.md](../tests/README.md).

## Creating a Custom Module

### Module Structure

```javascript
/**
 * @module Player
 */

/**
 * I am MyCustomModule.
 *
 * @class MyCustomModule
 * @static
 */

FrameTrail.defineModule('MyCustomModule', function(FrameTrail) {

    var labels = FrameTrail.module('Localization').labels;

    // Private variables
    var domElement = null;
    var isActive = false;

    // Private methods
    function create() {
        domElement = document.createElement('div');
        domElement.className = 'myCustomModule';
        // Build UI...
    }

    function destroy() {
        if (domElement) {
            domElement.remove();
            domElement = null;
        }
    }

    // State change handlers
    function onEditModeChange(newValue, oldValue) {
        if (newValue) {
            domElement.classList.add('active');
        } else {
            domElement.classList.remove('active');
        }
    }

    function onUnload() {
        destroy();
    }

    // Initialize on module load
    create();

    // Public interface
    return {
        get element() { return domElement; },
        get isActive() { return isActive; },

        onChange: {
            'editMode': onEditModeChange
        },

        onUnload: onUnload
    };
});
```

### Integrating Your Module

1. **Create files**: `src/player/modules/MyCustomModule/module.js` and optionally `style.css`

2. **Register in HTML**: Add `<script>` and `<link>` tags to `src/index.html`

3. **Add to build script**: Add to `JS_FILES` and `CSS_FILES` in `scripts/build.sh`

4. **Initialize**: In the appropriate launcher or parent module:
   ```javascript
   FrameTrail.initModule('MyCustomModule');
   ```

5. **Use from other modules**:
   ```javascript
   var myModule = FrameTrail.module('MyCustomModule');
   ```

## Writing an Extension

An extension is code that is not part of FrameTrail and plugs into it from outside: nothing in `index.html`, `scripts/build.sh` or any module changes. It can add a panel beside the player, a button to the title bar and an edit mode of its own, follows the interface through lifecycle hooks and state changes, reads and changes the hypervideo through [`edit`](#editing-the-hypervideo), and reaches every module the way FrameTrail's own modules do. It can also have a server part that adds actions and routes to the PHP backend ([Server Extensions](#server-extensions)). A complete example is in [`examples/extension-hello/`](../examples/extension-hello/).

### Register It

```javascript
FrameTrail.registerExtension('hello', function(FrameTrail) {

    var labels = FrameTrail.module('Localization').labels;

    return {
        init:               function(settings) { },      // once, after loading
        onReady:            function() { },              // once, when the interface is up
        onHypervideoChange: function(hypervideoID) { },  // whenever a hypervideo has been (re)loaded
        onChange: {                                      // state changes, like a module's
            editMode: function(editMode, oldEditMode) { }
        },
        onUnload:           function() { },              // when the instance is destroyed
        slots: { /* see Slots */ }
    };

});
```

The name consists of lowercase letters, digits and hyphens. The factory is called once for each FrameTrail instance that loads the extension, and receives that instance: the same object modules get, with `module()`, `getState()`, `changeState()`, `addEventListener()` and the rest, so the extension can use any module (`FrameTrail.module('HypervideoModel').overlays`). Everything in the returned object is optional.

### Load It

Two ways, which can be combined:

- **From `config.json`**, on a FrameTrail installation. Copy the extension's files to `extensions/<name>/` next to `index.html` and list it in `_data/config.json`:

  ```json
  "extensions": [
      {
          "name": "hello",
          "script": "extensions/hello/hello.js",
          "style": "extensions/hello/hello.css",
          "settings": { "greeting": "Hello there" }
      }
  ]
  ```

  `script` and `style` are paths relative to the page. The player refuses absolute URLs, root-relative paths and paths with a query, so an extension always comes from the instance's own origin. A platform hosting the instance can switch an extension on by writing this key ([docs/INTEGRATION.md](INTEGRATION.md#switching-extensions-on)). The files are not part of FrameTrail: copy them again after replacing the code with a new release.

- **From the page**, when you embed FrameTrail yourself. Include the script after FrameTrail's and name the extension in the `extensions` init option, with a name or an entry like the ones in `config.json`:

  ```javascript
  FrameTrail.init({
      target: '#player',
      // …
      extensions: [{ name: 'hello', settings: { greeting: 'Hello from the page' } }]
  }, 'PlayerLauncher');
  ```

An extension named in both places is loaded once: the init option's entry wins, and the one in `config.json` fills in what it lacks. A script already on the page is not loaded again.

Extensions are loaded after the data, which is when `config.json` is known, and before the interface is built. Anything that goes wrong is reported in the browser console and skipped, never fatal: a script or stylesheet that does not load (after at most 10 seconds), an entry that is not valid, a factory or `init()` that throws. A `_data` directory is portable and may name an extension that another installation does not have. An exception in one of an extension's hooks or handlers is reported, and the rest carry on.

`settings` are handed to `init()` untouched; FrameTrail neither reads nor validates them. On a public instance anyone can read `config.json`, so settings must never hold a secret. Secrets belong on the server, in `_data/.auth/<name>.php`, which is never served, and only a [server part](#server-extensions) can use them.

### Lifecycle

| Hook | Called |
|------|--------|
| `init(settings)` | once, after loading. Storage, sign-in and the data are known; the interface does not exist yet. |
| `slots` | read right after, while the interface is built (a side panel's `create`). |
| `onReady()` | once, when the interface is up: the overview is shown, or the first hypervideo is ready to play. |
| `onHypervideoChange(hypervideoID)` | whenever a hypervideo has been loaded and is ready to play: the first one, one the user switched to, and the same one reloaded (e.g. after a collaborator's change). |
| `onChange[state](value, oldValue)` | on every change of that state (`editMode`, `viewMode`, `loggedIn`, `unsavedChanges`, …), after FrameTrail's modules have handled it. |
| `onUnload()` | when the instance is destroyed (`instance.destroy()`). FrameTrail then removes the slots and, once no instance uses it, the stylesheet. |

Two things to know:

- Switching to another hypervideo rebuilds the video view and clears every timer pending on the page (`setTimeout` and `setInterval`). Restart yours in `onHypervideoChange`, and keep your DOM in your slots, which survive the switch.
- Types are read once, when the instance starts, before any extension is loaded: an extension cannot add overlay or resource types.

### Slots

`slots` names the places the extension takes in the interface; each one is optional. `label` is the tooltip and title; `icon` is a class of FrameTrail's icon font, e.g. `icon-comment` (default `icon-puzzle`).

**`sidePanel`**: a panel docked to the right of the player and the overview, opened and closed from a button in the title bar. While it is open the main area gives up its width; on screens up to 768 px wide it covers the main area instead. It stays open across edit modes and hypervideo switches. One side panel is open at a time.

```javascript
sidePanel: {
    label:   'Hello',
    icon:    'icon-comment',
    width:   320,                                   // px, 200–800 (default 360)
    when:    'always',                              // 'always' (default), 'edit' or 'view'
    create:  function(container, panel) { },        // once, while the interface is built
    onOpen:  function() { },
    onClose: function() { }
}
```

`create` builds the content into `container`; `panel` has `open()`, `close()`, `toggle()` and `isOpen`. With `when: 'edit'` the button and the panel are there only while editing, and a panel left open comes back when editing starts again (`'view'` is the reverse).

**`titlebarAction`**: a button in the title bar, before FrameTrail's own.

```javascript
titlebarAction: {
    label:   'Say hello',
    icon:    'icon-chat',
    when:    'view',                                // 'always' (default), 'edit' or 'view'
    onClick: function(evt) { }
}
```

**`editPanel`**: an edit mode of its own, named after the extension, with a button after the built-in modes in the sidebar. While it is active, the extension has the edit panel beside the video, which the built-in modes share:

```javascript
editPanel: {
    label:           'Hello',
    icon:            'icon-comment',
    editsHypervideo: true,                          // default; see below
    enter: function(panel) {
        // panel.add and panel.properties are the panel's two tabs, empty;
        // panel.showTab('add' | 'properties') switches between them.
    },
    leave: function() { }                           // stop using the panel; the next mode empties it
}
```

A mode that edits the hypervideo (the default) follows the rules of layout, overlays, custom code and chapters: it is offered to admins and the hypervideo's owner only, entering it claims the collaboration lock, and while another editor holds that lock the video area is blocked. Set `editsHypervideo: false` for a mode that does not write to the hypervideo; like annotations, it is then open to everyone editing. The names of FrameTrail's own modes (`preview`, `layout`, `overlays`, `codesnippets`, `chapters`, `annotations`) cannot be used. While the mode is active, `.mainContainer` carries `data-edit-mode="<name>"`.

### Labels

```javascript
FrameTrail.module('Localization').addLabels({
    en: { HelloTitle: 'Hello' },
    de: { HelloTitle: 'Hallo' }
});
```

A key that exists already is replaced, so prefix yours with the extension's name. A label missing in the current language is shown in English.

### Styling

Use FrameTrail's CSS custom properties (`--primary-bg-color`, `--primary-fg-color`, `--secondary-bg-color`, `--highlight-color`, …), so that the themes apply, and the classes in `src/_shared/styles/generic.css` for buttons, inputs, `custom-select`, `message` and `layoutRow`/`column-*`. Scope your selectors to your slots: `.sidePanelItem[data-extension="<name>"]`, `.titlebar [data-extension="<name>"]`, `.mainContainer[data-edit-mode="<name>"]`. A side panel takes the theme in view mode and the editor's palette while editing, through the same variables; the buttons of `generic.css` are drawn to suit both. A stylesheet listed in `config.json` is added before the global `custom.css`, which can override it.

## Editing the Hypervideo

`edit` reads and changes the hypervideo that is open in the player: on the instance `FrameTrail.init()` returns (`instance.edit`), and on the instance a module or an extension receives (`FrameTrail.edit`). Changes made through it are the editor's changes: the video, the timelines and the content views show them, they are saved by the normal save and autosave, and they can be undone. The page [`examples/edit-api.html`](../examples/edit-api.html) runs through all of it.

```javascript
var edit = instance.edit;

var overlay = edit.add('overlays', {
    body: {
        'frametrail:type':       'text',
        'frametrail:name':       'Welcome',
        'frametrail:attributes': { text: '&lt;p&gt;Hello&lt;/p&gt;' }
    },
    target: { selector: { value: 't=12.5,20&xywh=percent:10,10,40,20' } }
});

edit.update('overlays', overlay.created, { target: { selector: { value: 't=14,22&xywh=percent:10,10,40,20' } } });
edit.add('chapters', { start: 60, title: 'Part two' });
edit.remove('overlays', overlay.created);
```

### The Data

`edit` speaks the stored format described in [DATA-MODEL.md](DATA-MODEL.md) and the schemas in [`schemas/`](../schemas/): what it returns is what a save writes, and what it is given is written as given. Properties FrameTrail does not know, such as a W3C `generator`, are kept.

| Kind | What it is | Referred to by |
|------|------------|----------------|
| `overlays` | overlays, as W3C items | their `created` |
| `codeSnippets` | code snippets, as W3C items | their `created` |
| `annotations` | annotations of every user, as W3C items | their `created` (the user's own), or `{ creator, created }` |
| `chapters` | `{ start, title }` | their `start` (seconds) |
| `contentViews` | the content views of the layout areas | — (set per area) |
| `subtitles` | `{ src, srclang }`; `get` adds the WebVTT text as `vtt` | their language |

A `created` is the ISO 8601 text an item carries (`"2026-10-07T09:36:45.127Z"`).

### Reading

| Method | Returns |
|--------|---------|
| `getHypervideo()` | the hypervideo as its `hypervideo.json` would be saved now (annotations live in their own files) |
| `list(kind, filter)` | all things of a kind. `filter` is a function, or an object: `{ from, to }` (things whose time overlaps the span), `{ type }` (the body's `frametrail:type`), `{ creator }` (the creator's id), `{ area: 'top' }` (content views of one layout area) |
| `get(kind, ref)` | one thing, or `null` |

Reading works whenever a hypervideo is open.

### Writing

| Method | Does |
|--------|------|
| `add(kind, data)` | adds an overlay, code snippet, annotation or chapter and returns it as stored |
| `update(kind, ref, patch)` | changes one with a JSON Merge Patch ([RFC 7386](https://www.rfc-editor.org/rfc/rfc7386)) on its stored form: objects are merged, `null` removes a property, everything else is replaced. Returns it as stored |
| `remove(kind, ref)` | removes one and returns it as it was |
| `setLayout(area, contentViews)` | replaces the content views of a layout area: `'top'`, `'bottom'`, `'left'`, `'right'` (or `'areaTop'`, …) |
| `setSubtitles(lang, vttText)` | sets the subtitles of a language to a WebVTT text, or removes them (`null`). The file is written with the next save |
| `setConfig(patch)` | changes the hypervideo's settings (its `config`, without `layoutArea`) with a JSON Merge Patch |

For a new item `add` fills in what follows from its kind and place: `type`, `frametrail:type`, the `creator` (the signed-in user; for annotations always), a `created` of its own, the target's `type` and `source` (the hypervideo's video) and the selector's `type` and `conformsTo`. What is left to give is the body and `target.selector.value`, with keyframes or a rotation if the overlay moves. A `created` that is given is kept, unless another item of the collection has it already. A chapter cannot start where another one starts, and an item's `created`, `creator` and type cannot be changed: remove it and add a new one.

Before anything changes, the data is validated against the schemas, and a few things the schemas cannot say are checked (an item may not end before it starts; an overlay's type must be one the player can show). What fails is refused with an error, and nothing has changed:

```javascript
try {
    edit.add('chapters', { start: -1 });
} catch (e) {
    e.code;     // 'invalid'
    e.errors;   // [{ path: '/start', message: 'must be >= 0' }] — JSON Pointers into the data given
}
```

`e.code` is `'invalid'` (with `e.errors`), `'notFound'` (no such thing, or no hypervideo open) or `'notAllowed'` (see below); an async transaction that is stopped rejects with `'stopped'` (see [Undo and Transactions](#undo-and-transactions)).

Writes need the permissions the editor needs: edit mode; for overlays, code snippets, chapters, content views, subtitles and settings an admin or the hypervideo's creator, and no collaboration lock held by someone else (writing claims the lock, as the editors that write the hypervideo do); annotations only in the user's own collection. An item of a type the player cannot show (such as the legacy `button`) is listed and kept, but not changed.

### Undo and Transactions

Each write is an undo step. A transaction makes several writes one step:

```javascript
edit.transaction('Add the chapters', function(tx) {
    tx.add('chapters', { start: 0,   title: 'Introduction' });
    tx.add('chapters', { start: 95,  title: 'Method' });
    tx.add('chapters', { start: 240, title: 'Results' });
});
```

The function gets an object with the same methods as `edit`; what goes through it belongs to the transaction. When the function throws, every change made through it is taken back and the error passed on, so a transaction happens completely or not at all. A transaction is over when its function returns; its object cannot be used afterwards.

The function may be `async`, for changes that wait for something (a request, an answer):

```javascript
edit.transaction('Add the chapters', async function(tx) {
    var chapters = await fetch(url, { signal: tx.signal }).then(function(r) { return r.json(); });
    chapters.forEach(function(chapter) { tx.add('chapters', chapter); });
}).catch(function(e) {
    if (e.code === 'stopped') { /* stopped by the user: nothing was changed */ }
});
```

`transaction()` then returns a promise for the function's result; the undo step is registered when it resolves, and the changes are taken back when it rejects. Until then the editor is busy, so that nothing comes between the transaction's changes and its undo step:

- editing by hand waits: the video, the edit panel and the timelines take no input, Undo and Redo are unavailable, the hypervideo's settings dialog does not open; playing and scrubbing go on;
- every other write through `edit`, and every other transaction, is refused (`'notAllowed'`);
- the sidebar shows "Automated editing in progress" with a Stop button.

Stop and leaving edit mode end the transaction early: its changes are taken back, `tx.signal` (an `AbortSignal`) is aborted and the promise rejects with code `'stopped'`. Switching to another hypervideo or reloading the open one ends it the same way, and its changes go with the hypervideo. While the editor is busy the state `editBusy` is `{ description }`, otherwise `false`.

Undoing a step that changed one kind of thing switches to that kind's editor, as for edits made by hand; a step that changed several kinds stays in the current edit mode.

## Adding Localization Strings

### 1. Add to English Locale

Edit `src/_shared/modules/Localization/locale/en.js`:

```javascript
window.FrameTrail_L10n['en'] = {
    // ... existing strings ...

    "MyModuleTitle": "My Module",
    "MyModuleDescription": "Description of my module"
};
```

### 2. Add to Other Locales

Edit `src/_shared/modules/Localization/locale/de.js` (and others):

```javascript
window.FrameTrail_L10n['de'] = {
    // ... existing strings ...

    "MyModuleTitle": "Mein Modul",
    "MyModuleDescription": "Beschreibung meines Moduls"
};
```

### 3. Use in Code

```javascript
var labels = FrameTrail.module('Localization').labels;
var title = labels['MyModuleTitle'];
```

A key missing in the current language is looked up in English. Extensions add their labels at runtime with `Localization.addLabels()` ([Labels](#labels)).

## Adding a Custom Theme

### Define Theme Variables

Edit `src/_shared/styles/variables.css`:

```css
.frametrail-body[data-frametrail-theme="mytheme"] :is(
    .mainContainer:not([data-edit-mode="settings"], [data-edit-mode="overlays"], [data-edit-mode="codesnippets"], [data-edit-mode="annotations"], [data-edit-mode="chapters"], .extensionEditMode),
    .mainContainer[data-edit-mode] .hypervideoContainer,
    .loadingScreen,
    .userLoginOverlay,
    .signInWall,
    .titlebar:not(.editActive),
    .sidePanel:not(.editActive),
    .layoutManager
),
.themeItem[data-theme="mytheme"] {
    /* Required: the 4 core colors */
    --primary-bg-color: #your-bg;
    --secondary-bg-color: rgba(r, g, b, .6);  /* keep semi-transparent */
    --primary-fg-color: #your-text;
    --secondary-fg-color: #your-secondary-text;

    /*
     * These are computed automatically from the 4 above — override only if needed:
     *   --semi-transparent-bg-color       (primary-bg at 80%)
     *   --semi-transparent-fg-color       (primary-fg at 30%)
     *   --semi-transparent-fg-highlight-color  (primary-fg at 40%)
     *
     * These defaults are shared across all built-in themes — override if needed:
     *   --annotation-preview-bg-color: rgba(100, 100, 100, .2)
     *   --highlight-color: #D8D3AD
     *   --tooltip-bg-color: #D8D3AD
     *   --video-background-color: #000
     */
}
```

The theme selector in `HypervideoSettingsDialog` automatically picks up themes defined in CSS.

## Extending the Backend

### Server Extensions

An extension can bring a server part: actions and routes added to FrameTrail's PHP backend without changing any of its files. It is a folder `_server/extensions/<name>/`, named like the extension, whose `extension.php` returns what it offers:

```php
<?php

// Only ever run by FrameTrail's routers, never on its own (see Files below).
if (!function_exists("ftExtensionStorage")) { http_response_code(404); exit; }

function ftHelloPing($ext) {
    return array(
        "status"   => "success",
        "code"     => 0,
        "response" => array("greeting" => $ext["settings"]["greeting"])
    );
}

function ftHelloWhoami($ext) {
    header("Content-Type: text/plain; charset=utf-8");
    $login = userCheckLogin();
    echo ($login["code"] == 1) ? $login["response"]["name"] : "Nobody";
}

return array(
    "actions"  => array("helloPing" => "ftHelloPing"),     // ajaxServer.php?a=helloPing
    "routes"   => array("whoami"    => "ftHelloWhoami"),   // extension.php?e=hello&r=whoami
    "requires" => array("curl")                            // PHP extensions it needs
);
```

The complete example is [`examples/extension-hello/server/`](../examples/extension-hello/server/).

**Switching it on.** The extension's entry in `config.json` → `extensions`, the same entry that loads its browser part, switches the server part on, if the folder is there. An extension named only in the `extensions` init option has no server part: the server never sees init options. An entry without a folder is an extension that only has a browser part, which is not an error.

**Actions** go through `_server/ajaxServer.php`, like FrameTrail's own: a request with `a=<action>` and the `dataPath`, answered with the array the handler returns, as JSON. Name them after the extension (`helloPing`): an action FrameTrail has itself, now or in a later release, always wins, and of two extensions offering the same action, the first in `config.json` does.

**Routes** go through `_server/extension.php?e=<name>&r=<route>` and answer as they like: their own content type, HTTP status codes and methods, a JSON-RPC endpoint, server-sent events. The handler writes its answer itself; an array it returns is sent as JSON. An unknown route answers 404. A route that streams should call `session_write_close()` once it knows who is asking: PHP keeps the session file locked for as long as a request holds it, so an open stream would hold up the same person's heartbeat and saves.

**Handlers** are called with `array("name" => …, "settings" => …)`, where `settings` are the entry's `settings` from `config.json`. Both routers start like every request to FrameTrail's backend (`config.php`): the data directory follows `dataPath`, and the session is there, or the user of a [personal API token](DEPLOYMENT.md#personal-api-tokens-apitokens). FrameTrail checks nothing on a handler's behalf. One that needs a signed-in user asks `requireLogin()` or `requireLogin("admin")`, which re-read the user from `users.json`; `userCheckLogin()` returns the user, `ftIsBearerRequest()` says whether the request came with a token. A handler may include FrameTrail's other server files and call their functions. `hypervideoChange()`, for instance, takes subtitle texts (WebVTT keyed by language) as its last argument, so an extension can write subtitles together with the `hypervideo.json` that lists them, which tells open editors.

**Storage and secrets.** `ftExtensionStorage($name)` returns `_data/.extensions/<name>/`, created on first use: the extension's own folder, never served and never exported. It travels with a copy of `_data/`, so it is no place for secrets. Those belong in `_data/.auth/<name>.php`, a PHP file returning an array, which `ftExtensionSecrets($name)` reads. `config.json` is public on a public instance.

**Requirements.** `requires` names PHP extensions (as `extension_loaded()` knows them). While one is missing, the extension's actions and routes answer with code 503, and admins see the reason in the browser console: `userCheckLogin` reports the server parts of the enabled extensions to admins, as `serverExtensions: [{ name, actions, routes, missing, error }]`. A manifest that throws, or does not return an array, is reported the same way and costs only that extension its answers. A PHP fatal error is the exception: two extensions declaring a function of the same name stop every request that loads both. Prefix your functions, or use closures.

**Files.** The web server never runs a PHP file below `_server/` directly (`.htaccess`), so everything goes through the two routers. PHP's built-in server reads no `.htaccess`: start every PHP file of an extension with the guard above. Keep `extension.php` free of side effects. It is loaded whenever FrameTrail meets an action it does not know, and on every admin's heartbeat.

The files are not part of FrameTrail: copy them again after replacing the code with a new release.

**From JavaScript:**

```javascript
var Storage = FrameTrail.module('StorageManager');

// An action: serverPost() adds the dataPath and resolves with the answer, whatever its code.
Storage.serverPost(new URLSearchParams({ a: 'helloPing' })).then(function(answer) {
    console.log(answer.response.greeting);
});

// A route: the URL with e, r and the dataPath, or null when there is no server.
fetch(Storage.extensionURL('hello', 'whoami')).then(function(r) { return r.text(); });
```

### Adding an Action to FrameTrail Itself

A change to FrameTrail (not an extension) adds a case to `src/_server/ajaxServer.php`:

```php
case "myCustomAction":
    include_once("myCustomModule.php");
    $return = myCustomFunction($_REQUEST["param1"], $_REQUEST["param2"]);
    break;
```

and the function to a file of its own, `src/_server/myCustomModule.php`:

```php
<?php

require_once("./config.php");
require_once("./user.php");

function myCustomFunction($param1, $param2) {
    global $conf;

    if ($err = requireLogin()) return $err;

    // Your logic here...

    return array(
        "status"   => "success",
        "code"     => 0,
        "response" => $result
    );
}
```

Call it with `FrameTrail.module('StorageManager').serverPost(new URLSearchParams({ a: 'myCustomAction', param1: 'value1' }))`, as above. A request made with a personal API token reaches every action except the ones that manage the account and its tokens (`ftBearerRefusesAction()` in `src/_server/tokens.php`); add a new action of that kind there.

## Adding Custom Events

### Fire Custom Events from Modules

```javascript
FrameTrail.triggerEvent('myCustomEvent', {
    timestamp: Date.now(),
    data: 'some value'
});
```

### Listen in Another Module

```javascript
FrameTrail.addEventListener('myCustomEvent', function(event) {
    console.log('Received:', event.detail);
});
```

### Hypervideo Global Events

Users can add JavaScript that runs at specific lifecycle points via the `globalEvents` field in `hypervideo.json`:

```json
{
    "globalEvents": {
        "onReady": "console.log('Hypervideo ready');",
        "onPlay": "console.log('Playing');",
        "onPause": "console.log('Paused');",
        "onEnded": "console.log('Ended');"
    }
}
```

## Undo/Redo Support

When making changes that should be undoable:

```javascript
FrameTrail.module('UndoManager').register({
    category: 'overlays',
    description: 'Change overlay position',

    undo: function() {
        overlay.data.position = previousPosition;
        overlay.updatePosition();
    },

    redo: function() {
        overlay.data.position = newPosition;
        overlay.updatePosition();
    }
});

FrameTrail.module('HypervideoModel').newUnsavedChange('overlays');
```

Several changes that belong together are registered as one step with `registerGroup(description, commands)`: undo reverses the commands in reverse order, redo repeats them in order. A group of commands of one category switches to its edit mode like a single command; a group across categories stays in the current mode, so its commands must work in any mode. Changes made through [`edit`](#editing-the-hypervideo) are registered for you.

## Checklist for New Types and Modules

When adding a new resource type or module to FrameTrail itself, make sure to:

1. Create `type.js` (or `module.js`) and `style.css` in the appropriate directory under `src/`
2. Add `<script>` and `<link>` tags to `src/index.html` (and `src/resources.html` if applicable)
3. Add entries to `scripts/build.sh` in `JS_FILES` and `CSS_FILES` arrays (in correct order)
4. Add localization strings to all locale files in `src/_shared/modules/Localization/locale/` (`en.js`, `de.js`, `fr.js`), in alphabetical key order
5. If you change what is stored in `_data/` (a new resource type, a new attribute, a new key), update `schemas/` and [docs/DATA-MODEL.md](DATA-MODEL.md), add test fixtures for it, run `node scripts/bundle-schemas.mjs` (the player's copy of the schemas) and `node tests/run-js.mjs`
6. Test in both development mode (`src/`) and build mode (`build/`)
7. Test in Chrome and Firefox
8. Test with edit mode enabled and disabled

## Best Practices

1. **Follow existing patterns** — Look at similar modules/types for guidance
2. **Use localization** — Never hardcode user-facing strings
3. **Clean up on unload** — Remove event listeners and DOM elements in `onUnload`
4. **Use CSS custom properties** — For theme compatibility
5. **Test edge cases** — Empty data, missing resources, network errors
