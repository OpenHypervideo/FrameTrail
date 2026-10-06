/**
 * @module Shared
 */


/**
 * I am the type definition of a ResourceCursor: a mouse pointer drawn over the
 * video, e.g. for software tutorials. It moves with the overlay's box-motion
 * keyframes (the pointer's tip is the top-left corner of the box) and shows a
 * press + ripple at the click times set in attributes.clicks (seconds from the
 * overlay's start).
 *
 * * Cursor Resources only appear in the 'Custom Overlay' gallery
 *   and are not listed in the ResourceManager.
 *
 * Inspired by the oversized-cursor and dart-cursor components of HyperFrames
 * (https://github.com/heygen-com/hyperframes), Copyright 2026 HeyGen, Inc.,
 * Apache License 2.0; reimplemented for FrameTrail (generic glyphs, CSS motion).
 *
 * @class ResourceCursor
 * @category TypeDefinition
 * @extends Resource
 */



FrameTrail.defineType(

    'ResourceCursor',

    function (FrameTrail) {

        // Glyphs and the position of their tip (fraction of the glyph box)
        var GLYPHS = {
            arrow: {
                viewBox: '0 0 24 32',
                path:    'M3,2 L3,26 L9,20.5 L13.2,29.6 L17,27.9 L12.9,18.9 L21,18.9 Z',
                tip:     [3 / 24, 2 / 32]
            },
            hand: {
                viewBox: '0 0 28 34',
                path:    'M10,2.5 C11.4,2.5 12.5,3.6 12.5,5 L12.5,13.5 L13.5,13.5 C13.5,12.4 14.4,11.5 15.5,11.5 C16.6,11.5 17.5,12.4 17.5,13.5 L17.5,14.5 C17.5,13.4 18.4,12.5 19.5,12.5 C20.6,12.5 21.5,13.4 21.5,14.5 L21.5,15.5 C21.5,14.4 22.4,13.5 23.5,13.5 C24.6,13.5 25.5,14.4 25.5,15.5 L25.5,24 C25.5,28.4 21.9,32 17.5,32 L14.5,32 C11.9,32 9.6,30.7 8.2,28.5 L3.7,21.3 C3.1,20.3 3.4,19.1 4.3,18.5 C5.2,17.9 6.4,18.1 7.1,18.9 L7.5,19.4 L7.5,5 C7.5,3.6 8.6,2.5 10,2.5 Z',
                tip:     [10 / 28, 2.5 / 34]
            }
        };

        return {
            parent: 'Resource',
            constructor: function(resourceData){
                this.resourceData = resourceData;
            },
            prototype: {

                resourceData:   {},
                iconClass:      'icon-mouse-pointer',


                /**
                 * I return my attributes with defaults applied.
                 * @method getSettings
                 * @return {Object}
                 */
                getSettings: function() {

                    var a = this.resourceData.attributes || {},
                        clicks = Array.isArray(a.clicks) ? a.clicks : String(a.clicks || '').split(/[,;\s]+/);

                    return {
                        style:        GLYPHS[a.style] ? a.style : 'arrow',
                        color:        a.color || '#ffffff',
                        outlineColor: a.outlineColor || '#111111',
                        clicks:       clicks.map(function(c) { return parseFloat(c); }).filter(function(c) { return isFinite(c) && c >= 0; }).sort(function(x, y) { return x - y; })
                    };

                },


                /**
                 * @method renderContent
                 * @return HTMLElement
                 */
                renderContent: function() {

                    var settings = this.getSettings(),
                        glyph = GLYPHS[settings.style];

                    var resourceDetail = document.createElement('div');
                    resourceDetail.className = 'resourceDetail';
                    resourceDetail.dataset.type = 'cursor';

                    var resourceContent = document.createElement('div');
                    resourceContent.className = 'resourceContent';

                    var ripple = document.createElement('div');
                    ripple.className = 'cursorRipple';
                    ripple.style.left = (glyph.tip[0] * 100) + '%';
                    ripple.style.top  = (glyph.tip[1] * 100) + '%';
                    ripple.style.borderColor = settings.color;

                    var svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
                    svg.setAttribute('class', 'cursorGlyph');
                    svg.setAttribute('viewBox', glyph.viewBox);
                    svg.setAttribute('preserveAspectRatio', 'xMinYMin meet');
                    svg.setAttribute('aria-hidden', 'true');
                    svg.style.transformOrigin = (glyph.tip[0] * 100) + '% ' + (glyph.tip[1] * 100) + '%';

                    var path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
                    path.setAttribute('d', glyph.path);
                    path.setAttribute('fill', settings.color);
                    path.setAttribute('stroke', settings.outlineColor);
                    path.setAttribute('stroke-width', '1.5');
                    path.setAttribute('stroke-linejoin', 'round');
                    svg.appendChild(path);

                    resourceContent.append(ripple, svg);
                    resourceDetail.appendChild(resourceContent);

                    return resourceDetail;

                },

                /**
                 * OverlayAnimator hook: a press and a ripple at every click time.
                 *
                 * @method animateContent
                 * @param {HTMLElement} resourceDetail
                 * @param {Object} ctx
                 * @return null
                 */
                animateContent: function(resourceDetail, ctx) {

                    var settings = this.getSettings(),
                        glyph  = resourceDetail.querySelector('.cursorGlyph'),
                        ripple = resourceDetail.querySelector('.cursorRipple'),
                        clicks = settings.clicks.filter(function(c) { return c * 1000 <= ctx.spanMs; });

                    if (!clicks.length || !glyph || !ripple) { return null; }

                    glyph.style.animation = clicks.map(function(c) {
                        return ctx.entry('ftCursorPress', 240, 'easeOut', ctx.leadInMs + c * 1000, 1, 'none');
                    }).join(', ');

                    if (!ctx.reducedMotion) {
                        ripple.style.animation = clicks.map(function(c) {
                            return ctx.entry('ftCursorRipple', 650, 'power2Out', ctx.leadInMs + c * 1000, 1, 'none');
                        }).join(', ');
                    }

                    return null;

                },


                /**
                 * @method renderThumb
                 * @return thumbElement
                 */
                renderThumb: function() {

                    var thumb = document.createElement('div');
                    thumb.className = 'resourceThumb';
                    thumb.dataset.type = 'cursor';
                    thumb.innerHTML = '<div class="resourceOverlay"><div class="resourceIcon"><span class="icon-mouse-pointer"></span></div></div>'
                                    + '<div class="resourceTitle"></div>';
                    thumb.querySelector('.resourceTitle').textContent = this.labels['ResourceTypeCursor'];
                    return thumb;

                },

                getDisplayLabel: function() {

                    return this.resourceData.name || this.labels['ResourceTypeCursor'];

                },


                /**
                 * See {{#crossLink "Resource/renderBasicPropertiesControls:method"}}Resource/renderBasicPropertiesControls(){{/crossLink}}
                 * @method renderPropertiesControls
                 * @param {Overlay} overlay
                 */
                renderPropertiesControls: function(overlay) {

                    var labels = this.labels,
                        basicControls = this.renderBasicPropertiesControls(overlay);

                    // Clicks are edited as text ("0.5, 2.25") and stored as an array
                    var form = this.renderAttributeForm(overlay, [
                        [
                            { key: 'style', type: 'select', labelKey: 'SettingsCursorStyle', column: 4, options: [
                                { value: 'arrow', label: labels['SettingsCursorStyleArrow'] },
                                { value: 'hand',  label: labels['SettingsCursorStyleHand'] }
                            ] },
                            { key: 'color',        type: 'color', labelKey: 'SettingsCursorColor',   column: 4 },
                            { key: 'outlineColor', type: 'color', labelKey: 'SettingsCursorOutline', column: 4 }
                        ]
                    ]);

                    var clicksRow = document.createElement('div');
                    clicksRow.className = 'layoutRow';
                    clicksRow.innerHTML = '<div class="column-8">'
                        + '    <label>' + labels['SettingsCursorClicks'] + '</label>'
                        + '    <input type="text" class="cursorClicksInput">'
                        + '    <div class="fieldHint">' + labels['MessageCursorClicks'] + '</div>'
                        + '</div>'
                        + '<div class="column-4">'
                        + '    <label>&nbsp;</label>'
                        + '    <button type="button" class="cursorAddClick"><span class="icon-plus"></span> ' + labels['SettingsCursorAddClick'] + '</button>'
                        + '</div>';
                    form.insertBefore(clicksRow, form.lastElementChild);

                    var clicksInput = clicksRow.querySelector('.cursorClicksInput'),
                        settings = this.getSettings(),
                        before = null;

                    clicksInput.value = settings.clicks.join(', ');

                    var applyClicks = function(list) {
                        if (!before) { before = overlay.snapshotState(['attributes']); }
                        overlay.data.attributes.clicks = list;
                        overlay.rerenderContent();
                        FrameTrail.module('OverlaysController').registerStateUndo(
                            overlay, labels['SidebarOverlays'] + ' ' + labels['SettingsCursorClicks'], before, overlay.snapshotState(['attributes']), { rerender: true }
                        );
                        before = null;
                        FrameTrail.module('HypervideoModel').newUnsavedChange('overlays');
                    };

                    clicksInput.addEventListener('focus', function() {
                        before = overlay.snapshotState(['attributes']);
                    });
                    clicksInput.addEventListener('change', function() {
                        var list = this.value.split(/[,;\s]+/).map(function(v) { return parseFloat(v.replace(',', '.')); })
                            .filter(function(v) { return isFinite(v) && v >= 0; })
                            .sort(function(x, y) { return x - y; })
                            .map(function(v) { return Math.round(v * 100) / 100; });
                        this.value = list.join(', ');
                        applyClicks(list);
                    });

                    clicksRow.querySelector('.cursorAddClick').addEventListener('click', function() {
                        var relative = Math.round((overlay.playheadTime() - overlay.data.start) * 100) / 100;
                        if (relative < 0 || relative > overlay.data.end - overlay.data.start) { return; }
                        var list = settings.clicks.concat([relative]).sort(function(x, y) { return x - y; });
                        clicksInput.value = list.join(', ');
                        settings.clicks = list;
                        applyClicks(list);
                    });

                    basicControls.controlsContainer.querySelector('#OverlayOptions').prepend(form);

                    return basicControls;

                }

            }

        }
    }

);
