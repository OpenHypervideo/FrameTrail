/**
 * @module Player
 */


/**
 * I am the FreeformShapeEditor. I let the outline of a freeform hotspot be drawn
 * and edited on the video.
 *
 * While a freeform hotspot is the selected overlay in the overlay edit mode, I
 * show its points as handles on the overlay box: drag a point to move it,
 * double-click it to switch it between corner and smooth, select it and press
 * Delete / Backspace to remove it, drag a "+" between two points to add one.
 *
 * In draw mode (the "Draw shape" button, and right after a Freeform Hotspot was
 * dropped) a click on the video places a point; clicking the first point,
 * double-clicking or pressing Enter closes the outline, Backspace removes the
 * last point and Esc cancels.
 *
 * Points are stored in attributes.points as 0–100 coordinates of the overlay box
 * (attributes.path is derived from them). After every edit the box is fitted to
 * the outline (see Overlay.fitBoxToLocal), keeping its rotation and, with box
 * motion, changing every keyframe box the same way.
 *
 * @class FreeformShapeEditor
 * @static
 */

FrameTrail.defineModule('FreeformShapeEditor', function(FrameTrail){

    var labels = FrameTrail.module('Localization').labels;

    var SVG_NS  = 'http://www.w3.org/2000/svg',
        MIN_PX  = 8,     // smallest extent of a fitted box (px on the stage)
        SNAP_PX = 8;     // distance to the first point that closes a drawn outline

    var current       = null,   // the selected overlay (whether freeform or not)
        layer         = null,   // its .freeformHandles layer
        points        = [],     // the points shown by the layer
        selectedIndex = null,
        lastTap       = null,   // { index, time } of the last press on a point
        drag          = null,
        drawing       = null;


    /* ------------------------------------------------------------------ */
    /*  Helpers                                                           */
    /* ------------------------------------------------------------------ */

    function isFreeform(overlay) {
        return !!(overlay
            && overlay.data.type === 'hotspot'
            && overlay.data.attributes
            && overlay.data.attributes.shape === 'freeform'
            && FrameTrail.getState('editMode') === 'overlays');
    }

    function round2(v) {
        return Math.round(v * 100) / 100;
    }

    function svgEl(name, className) {
        var node = document.createElementNS(SVG_NS, name);
        if (className) { node.setAttribute('class', className); }
        return node;
    }

    /**
     * I return the pointer position on the stage (pixels of the overlay
     * container, clamped to it).
     */
    function stagePoint(evt) {
        var container = FrameTrail.module('ViewVideo').OverlayContainer,
            rect      = container.getBoundingClientRect(),
            scaleX    = container.offsetWidth  / (rect.width  || 1),
            scaleY    = container.offsetHeight / (rect.height || 1);
        return [
            Math.max(0, Math.min(container.offsetWidth,  (evt.clientX - rect.left) * scaleX)),
            Math.max(0, Math.min(container.offsetHeight, (evt.clientY - rect.top)  * scaleY))
        ];
    }

    function contentDetail(overlay) {
        return overlay.getContentHost().querySelector('.resourceDetail');
    }

    /**
     * I write an edited outline: the box is fitted to the outline (whose points
     * may reach outside it), the points are stored relative to the new box, and
     * the edit becomes one undo step.
     */
    function commitPoints(overlay, newPoints, description) {

        var before = overlay.snapshotState(['position', 'rotation', 'keyframes', 'attributes']),
            box    = overlay.getBoxPx(overlay.editTime()),
            minU   = box.w ? MIN_PX / box.w * 100 : 1,
            minV   = box.h ? MIN_PX / box.h * 100 : 1,
            u0 = Infinity, v0 = Infinity, u1 = -Infinity, v1 = -Infinity;

        // Bounds of the outline itself: a curve through smooth points can bulge past them
        overlay.resourceItem.freeformSegments(newPoints).forEach(function(seg) {
            for (var i = 0; i <= (seg.straight ? 1 : 16); i++) {
                var t = seg.straight ? i : i / 16, mt = 1 - t,
                    x = mt * mt * mt * seg.a.x + 3 * mt * mt * t * seg.c1.x + 3 * mt * t * t * seg.c2.x + t * t * t * seg.b.x,
                    y = mt * mt * mt * seg.a.y + 3 * mt * mt * t * seg.c1.y + 3 * mt * t * t * seg.c2.y + t * t * t * seg.b.y;
                u0 = Math.min(u0, x); u1 = Math.max(u1, x);
                v0 = Math.min(v0, y); v1 = Math.max(v1, y);
            }
        });
        if (u1 - u0 < minU) { var cu = (u0 + u1) / 2; u0 = cu - minU / 2; u1 = cu + minU / 2; }
        if (v1 - v0 < minV) { var cv = (v0 + v1) / 2; v0 = cv - minV / 2; v1 = cv + minV / 2; }

        overlay.fitBoxToLocal(u0, v0, u1, v1);

        var normalized = newPoints.map(function(p) {
            var point = { x: round2((p.x - u0) / (u1 - u0) * 100), y: round2((p.y - v0) / (v1 - v0) * 100) };
            if (p.smooth) { point.smooth = true; }
            return point;
        });

        overlay.data.attributes.points = normalized;
        overlay.data.attributes.path   = overlay.resourceItem.freeformPath(normalized);
        overlay.rerenderContent();

        var OverlaysController = FrameTrail.module('OverlaysController');
        OverlaysController.registerStateUndo(
            overlay,
            labels['SidebarOverlays'] + ' ' + description,
            before,
            overlay.snapshotState(['position', 'rotation', 'keyframes', 'attributes']),
            { rerender: true }
        );
        OverlaysController.refreshMotionControls(overlay);
        FrameTrail.module('HypervideoModel').newUnsavedChange('overlays');

    }


    /* ------------------------------------------------------------------ */
    /*  Point handles                                                     */
    /* ------------------------------------------------------------------ */

    function removeLayer() {
        if (layer) {
            layer.remove();
            layer = null;
        }
    }

    /**
     * I (re)build the handles of the selected overlay, if it is a freeform
     * hotspot and nothing is being drawn: for its stored points, or for a list
     * that is being edited.
     */
    function render(list) {

        removeLayer();

        if (!isFreeform(current) || drawing) {
            selectedIndex = null;
            return;
        }

        points = list || current.resourceItem.freeformPoints(current.data.attributes);
        if (selectedIndex !== null && selectedIndex >= points.length) {
            selectedIndex = null;
        }

        layer = document.createElement('div');
        layer.className = 'freeformHandles';

        var outline = svgEl('svg', 'freeformOutline');
        outline.setAttribute('viewBox', '0 0 100 100');
        outline.setAttribute('preserveAspectRatio', 'none');
        outline.appendChild(svgEl('path', 'freeformOutlineUnder'));
        outline.appendChild(svgEl('path', 'freeformOutlineOver'));
        layer.appendChild(outline);

        points.forEach(function(p, idx) {
            var insert = document.createElement('div');
            insert.className = 'freeformInsert';
            insert.dataset.index = idx;
            insert.addEventListener('pointerdown', onInsertDown);
            layer.appendChild(insert);
        });

        points.forEach(function(p, idx) {
            var handle = document.createElement('div');
            handle.className = 'freeformPoint';
            handle.dataset.index = idx;
            handle.setAttribute('data-tooltip-top', labels['MessageFreeformPoint']);
            handle.addEventListener('pointerdown', onPointDown);
            layer.appendChild(handle);
        });

        layer.addEventListener('click', function(evt) { evt.stopPropagation(); });
        layer.addEventListener('dblclick', function(evt) { evt.stopPropagation(); });

        current.overlayElement.appendChild(layer);

        layout(points);

    }

    /**
     * I place the handles and the outline for a (possibly in-progress) list of
     * points, without rebuilding them.
     */
    function layout(list) {

        if (!layer) { return; }

        var Hotspot  = current.resourceItem,
            pathData = Hotspot.freeformPath(list),
            segments = Hotspot.freeformSegments(list);

        layer.querySelectorAll('.freeformOutline path').forEach(function(path) {
            path.setAttribute('d', pathData);
        });

        layer.querySelectorAll('.freeformPoint').forEach(function(handle) {
            var idx = parseInt(handle.dataset.index, 10),
                p   = list[idx];
            handle.style.left = p.x + '%';
            handle.style.top  = p.y + '%';
            handle.classList.toggle('smooth', !!p.smooth);
            handle.classList.toggle('selected', idx === selectedIndex);
        });

        layer.querySelectorAll('.freeformInsert').forEach(function(handle) {
            var seg = segments[parseInt(handle.dataset.index, 10)];
            handle.style.left = ((seg.a.x + 3 * seg.c1.x + 3 * seg.c2.x + seg.b.x) / 8) + '%';
            handle.style.top  = ((seg.a.y + 3 * seg.c1.y + 3 * seg.c2.y + seg.b.y) / 8) + '%';
        });

    }

    function onPointDown(evt) {

        if (evt.button !== 0) { return; }
        evt.stopPropagation();
        evt.preventDefault();

        var idx = parseInt(this.dataset.index, 10),
            now = Date.now();

        // Double-click (two presses on the same point): corner <-> smooth
        if (!drag && lastTap && lastTap.index === idx && now - lastTap.time < 400) {
            lastTap = null;
            var toggled = points.map(function(p) { return Object.assign({}, p); });
            if (toggled[idx].smooth) { delete toggled[idx].smooth; } else { toggled[idx].smooth = true; }
            commitPoints(current, toggled, labels['SettingsHotspotShape']);
            return;
        }
        lastTap = { index: idx, time: now };

        selectedIndex = idx;
        startPointDrag(evt, idx, points.map(function(p) { return Object.assign({}, p); }));

    }

    function onInsertDown(evt) {

        if (evt.button !== 0) { return; }
        evt.stopPropagation();
        evt.preventDefault();

        var idx      = parseInt(this.dataset.index, 10),
            segments = current.resourceItem.freeformSegments(points),
            seg      = segments[idx],
            inserted = {
                x: (seg.a.x + 3 * seg.c1.x + 3 * seg.c2.x + seg.b.x) / 8,
                y: (seg.a.y + 3 * seg.c1.y + 3 * seg.c2.y + seg.b.y) / 8
            },
            list = points.map(function(p) { return Object.assign({}, p); });

        // On a curved stretch the new point keeps the curve going
        if (!seg.straight) { inserted.smooth = true; }
        list.splice(idx + 1, 0, inserted);

        // Show the new point, then drag it (a plain click inserts it where it is)
        selectedIndex = idx + 1;
        lastTap = null;
        render(list);
        startPointDrag(evt, idx + 1, list.map(function(p) { return Object.assign({}, p); }), true);

    }

    function startPointDrag(evt, idx, list, inserted) {

        var pointer = stagePoint(evt),
            local   = current.stageToLocal(pointer[0], pointer[1]);

        drag = {
            overlay:  current,
            index:    idx,
            points:   list,
            offsetX:  list[idx].x - local[0],
            offsetY:  list[idx].y - local[1],
            startX:   evt.clientX,
            startY:   evt.clientY,
            moved:    false,
            inserted: !!inserted
        };

        layout(list);

        window.addEventListener('pointermove', onDragMove);
        window.addEventListener('pointerup', onDragEnd);
        window.addEventListener('pointercancel', onDragEnd);

    }

    function onDragMove(evt) {

        if (!drag) { return; }

        if (!drag.moved && Math.abs(evt.clientX - drag.startX) < 3 && Math.abs(evt.clientY - drag.startY) < 3) {
            return;
        }
        drag.moved = true;

        var pointer = stagePoint(evt),
            local   = drag.overlay.stageToLocal(pointer[0], pointer[1]),
            p       = drag.points[drag.index];

        p.x = local[0] + drag.offsetX;
        p.y = local[1] + drag.offsetY;

        layout(drag.points);
        drag.overlay.resourceItem.setFreeformPreview(contentDetail(drag.overlay), drag.points);

    }

    function onDragEnd() {

        window.removeEventListener('pointermove', onDragMove);
        window.removeEventListener('pointerup', onDragEnd);
        window.removeEventListener('pointercancel', onDragEnd);

        if (!drag) { return; }

        var done = drag;
        drag = null;

        if (done.moved || done.inserted) {
            FrameTrail.module('ViewVideo').swallowNextClick();
            commitPoints(done.overlay, done.points, labels['SettingsHotspotShape']);
        } else {
            layout(points);
        }

    }

    /**
     * Delete / Backspace remove the selected point (an outline keeps at least
     * three); while drawing, Enter closes and Backspace takes back a point.
     */
    function onKeyDown(evt) {

        var target = evt.target;
        if (target && target.closest && target.closest('input, textarea, select, [contenteditable], .cm-editor')) {
            return;
        }

        if (drawing) {
            if (evt.key === 'Enter') {
                finishDrawing();
            } else if (evt.key === 'Backspace' || evt.key === 'Delete') {
                drawing.points.pop();
                layoutDrawing();
            } else {
                return;
            }
            evt.preventDefault();
            evt.stopPropagation();
            return;
        }

        if ((evt.key === 'Delete' || evt.key === 'Backspace') && layer && selectedIndex !== null && isFreeform(current)) {
            evt.preventDefault();
            evt.stopPropagation();
            if (points.length <= 3) { return; }
            var list = points.map(function(p) { return Object.assign({}, p); });
            list.splice(selectedIndex, 1);
            selectedIndex = null;
            commitPoints(current, list, labels['SettingsHotspotShape']);
        }

    }


    /* ------------------------------------------------------------------ */
    /*  Draw mode                                                         */
    /* ------------------------------------------------------------------ */

    /**
     * I start drawing a new outline for a freeform hotspot on the video.
     * @method startDrawing
     * @param {Overlay} overlay
     */
    function startDrawing(overlay) {

        if (!overlay || FrameTrail.getState('editMode') !== 'overlays') { return; }

        stopDrawing();

        var OverlaysController = FrameTrail.module('OverlaysController');
        if (OverlaysController.overlayInFocus !== overlay) {
            OverlaysController.selectOverlay(overlay);
        }

        var HypervideoController = FrameTrail.module('HypervideoController');
        if (HypervideoController.isPlaying) {
            HypervideoController.pause();
        }

        var OverlayAnimationEditor = FrameTrail.module('OverlayAnimationEditor');
        if (OverlayAnimationEditor) {
            OverlayAnimationEditor.closeKeyframeMenu();
        }

        // A focused "Draw shape" button would take Enter for itself
        if (document.activeElement && document.activeElement.blur) {
            document.activeElement.blur();
        }

        var drawLayer = document.createElement('div');
        drawLayer.className = 'freeformDrawLayer';

        var svg = svgEl('svg');
        svg.setAttribute('viewBox', '0 0 100 100');
        svg.setAttribute('preserveAspectRatio', 'none');
        svg.appendChild(svgEl('path', 'freeformDrawUnder'));
        svg.appendChild(svgEl('path', 'freeformDrawOver'));
        svg.appendChild(svgEl('path', 'freeformDrawRubber'));
        drawLayer.appendChild(svg);

        var hint = document.createElement('div');
        hint.className = 'freeformDrawHint';
        hint.textContent = labels['MessageFreeformDraw'];
        drawLayer.appendChild(hint);

        drawing = {
            overlay: overlay,
            layer:   drawLayer,
            points:  [],     // stage pixels
            pointer: null
        };

        drawLayer.addEventListener('pointerdown', function(evt) {
            evt.stopPropagation();
            evt.preventDefault();
        });
        drawLayer.addEventListener('pointermove', function(evt) {
            if (!drawing) { return; }
            drawing.pointer = stagePoint(evt);
            layoutDrawing();
        });
        drawLayer.addEventListener('pointerleave', function() {
            if (!drawing) { return; }
            drawing.pointer = null;
            layoutDrawing();
        });
        drawLayer.addEventListener('click', function(evt) {
            evt.stopPropagation();
            evt.preventDefault();
            if (!drawing) { return; }
            var p    = stagePoint(evt),
                list = drawing.points,
                last = list[list.length - 1];
            if (list.length >= 3 && Math.hypot(p[0] - list[0][0], p[1] - list[0][1]) <= SNAP_PX) {
                finishDrawing();
                return;
            }
            if (last && Math.hypot(p[0] - last[0], p[1] - last[1]) <= 3) {
                return;
            }
            list.push(p);
            layoutDrawing();
        });
        drawLayer.addEventListener('dblclick', function(evt) {
            evt.stopPropagation();
            evt.preventDefault();
            finishDrawing();
        });

        FrameTrail.module('ViewVideo').OverlayContainer.appendChild(drawLayer);

        render();
        layoutDrawing();

    }

    /**
     * I draw the placed points, the outline so far and the segment to the
     * pointer.
     */
    function layoutDrawing() {

        if (!drawing) { return; }

        var stage = drawing.overlay.stageSize(),
            pct   = function(p) { return round2(p[0] / stage.width * 100) + ',' + round2(p[1] / stage.height * 100); },
            list  = drawing.points,
            layerEl = drawing.layer;

        var d = list.length ? 'M' + list.map(pct).join(' L') : '';
        layerEl.querySelector('.freeformDrawUnder').setAttribute('d', d);
        layerEl.querySelector('.freeformDrawOver').setAttribute('d', d);

        var nearFirst = !!(drawing.pointer && list.length >= 3
            && Math.hypot(drawing.pointer[0] - list[0][0], drawing.pointer[1] - list[0][1]) <= SNAP_PX);

        layerEl.querySelector('.freeformDrawRubber').setAttribute('d',
            (list.length && drawing.pointer) ? 'M' + pct(list[list.length - 1]) + ' L' + pct(nearFirst ? list[0] : drawing.pointer) : '');

        layerEl.querySelectorAll('.freeformDrawPoint').forEach(function(el) { el.remove(); });
        list.forEach(function(p, idx) {
            var dot = document.createElement('div');
            dot.className = 'freeformDrawPoint';
            if (idx === 0 && list.length >= 3) {
                dot.classList.add('closing');
                dot.classList.toggle('active', nearFirst);
            }
            dot.style.left = (p[0] / stage.width  * 100) + '%';
            dot.style.top  = (p[1] / stage.height * 100) + '%';
            layerEl.appendChild(dot);
        });

    }

    /**
     * I close the drawn outline (at least three points) and write it.
     */
    function finishDrawing() {

        if (!drawing || drawing.points.length < 3) { return; }

        var overlay = drawing.overlay,
            local   = drawing.points.map(function(p) {
                var uv = overlay.stageToLocal(p[0], p[1]);
                return { x: uv[0], y: uv[1] };
            });

        stopDrawing();
        FrameTrail.module('ViewVideo').swallowNextClick();
        commitPoints(overlay, local, labels['SettingsHotspotDrawShape']);

    }

    /**
     * I leave draw mode without writing anything (the outline stays as it was).
     * @method stopDrawing
     */
    function stopDrawing() {

        if (!drawing) { return; }

        drawing.layer.remove();
        drawing = null;

        render();

    }

    /**
     * @method isDrawing
     * @return {Boolean}
     */
    function isDrawing() {
        return !!drawing;
    }


    /* ------------------------------------------------------------------ */
    /*  Selection                                                         */
    /* ------------------------------------------------------------------ */

    /**
     * I follow the overlay selection (OverlaysController.setOverlayInFocus):
     * handles for a freeform hotspot, nothing for anything else. A selection
     * change ends draw mode.
     * @method select
     * @param {Overlay|null} overlay
     */
    function select(overlay) {

        if (drawing && drawing.overlay !== overlay) {
            stopDrawing();
        }
        if (current !== overlay) {
            selectedIndex = null;
        }
        current = overlay;
        render();

    }

    /**
     * I rebuild the handles after the overlay's outline, shape or box changed
     * from elsewhere (re-render, undo / redo).
     * @method refresh
     * @param {Overlay} overlay
     */
    function refresh(overlay) {

        if (overlay !== current || drag) { return; }
        render();

    }

    /**
     * Escape cancels drawing, then clears the point selection. I return true
     * when I used the key (see InteractionController).
     * @method handleEscape
     * @return {Boolean}
     */
    function handleEscape() {

        if (drawing) {
            stopDrawing();
            return true;
        }
        if (layer && selectedIndex !== null) {
            selectedIndex = null;
            layout(points);
            return true;
        }
        return false;

    }


    window.addEventListener('keydown', onKeyDown, true);


    return {

        onUnload: function() {
            window.removeEventListener('keydown', onKeyDown, true);
            stopDrawing();
            select(null);
        },

        select:       select,
        refresh:      refresh,
        startDrawing: startDrawing,
        stopDrawing:  stopDrawing,
        isDrawing:    isDrawing,
        handleEscape: handleEscape

    };

});
