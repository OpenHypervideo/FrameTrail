# Extending FrameTrail

This guide explains how to extend FrameTrail with new resource types, modules, localization, themes, and backend actions.

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

## Adding a Custom Theme

### Define Theme Variables

Edit `src/_shared/styles/variables.css`:

```css
.frametrail-body[data-frametrail-theme="mytheme"] :is(
    .mainContainer:not([data-edit-mode="settings"], [data-edit-mode="overlays"], [data-edit-mode="codesnippets"], [data-edit-mode="annotations"]),
    .loadingScreen,
    .userLoginOverlay,
    .titlebar:not(.editActive),
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

### Adding a New API Action

Edit `src/_server/ajaxServer.php`:

```php
case "myCustomAction":
    require_once("myCustomModule.php");
    $return = myCustomFunction($_POST["param1"], $_POST["param2"]);
    break;
```

Create `src/_server/myCustomModule.php`:

```php
<?php

require_once("./config.php");
require_once("./user.php");

function myCustomFunction($param1, $param2) {
    global $conf;

    $login = userCheckLogin("user");
    if ($login["code"] != 1) {
        return array(
            "status" => "fail",
            "code" => 1,
            "string" => "Not logged in"
        );
    }

    // Your logic here...

    return array(
        "status" => "success",
        "code" => 0,
        "response" => $result
    );
}
```

### Call from JavaScript

```javascript
// Via the FrameTrail Database module (preferred — uses resolveServerURL automatically)
FrameTrail.module('Database').ajax('myCustomAction', {
    param1: 'value1',
    param2: 'value2'
}, function(response) {
    if (response.status === 'success') {
        console.log(response.response);
    }
});

// Or directly via fetch
fetch('_server/ajaxServer.php', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ a: 'myCustomAction', param1: 'value1', param2: 'value2' })
}).then(function(r) { return r.json(); }).then(function(response) {
    if (response.status === 'success') {
        console.log(response.response);
    }
});
```

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

## Checklist for New Extensions

When adding a new resource type or module, make sure to:

1. Create `type.js` (or `module.js`) and `style.css` in the appropriate directory under `src/`
2. Add `<script>` and `<link>` tags to `src/index.html` (and `src/resources.html` if applicable)
3. Add entries to `scripts/build.sh` in `JS_FILES` and `CSS_FILES` arrays (in correct order)
4. Add localization strings to all locale files in `src/_shared/modules/Localization/locale/` (`en.js`, `de.js`, `fr.js`), in alphabetical key order
5. Test in both development mode (`src/`) and build mode (`build/`)
6. Test in Chrome and Firefox
7. Test with edit mode enabled and disabled

## Best Practices

1. **Follow existing patterns** — Look at similar modules/types for guidance
2. **Use localization** — Never hardcode user-facing strings
3. **Clean up on unload** — Remove event listeners and DOM elements in `onUnload`
4. **Use CSS custom properties** — For theme compatibility
5. **Test edge cases** — Empty data, missing resources, network errors
