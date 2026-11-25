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
 * On a hotspot with box motion the outline can change over time: moving a point
 * writes the outline of the keyframe at the playhead (making the keyframe if
 * there is none, as a box change does). From the first such move on, every
 * keyframe carries an outline (points on the keyframes; the first keyframe's is
 * also attributes.points), and the handles show the outline of the edit time.
 * Adding or removing a point, and corner or curve, apply to every keyframe.
 * A new drawing replaces the outline of every keyframe: it is static again.
 * The rules of such a track, its sampling and its edits are in
 * FrameTrailKeyframes.
 *
 * @class FreeformShapeEditor
 * @static
 */

FrameTrail.defineModule('FreeformShapeEditor', function(FrameTrail){

    var labels    = FrameTrail.module('Localization').labels,
        Keyframes = window.FrameTrailKeyframes;

    var SVG_NS  = 'http://www.w3.org/2000/svg',
        MIN_PX  = 8,     // smallest extent of a fitted box (px on the stage)
        SNAP_PX = 8,     // distance to the first point that closes a drawn outline
        UNDO_KEYS = ['position', 'rotation', 'keyframes', 'attributes'];

    var current       = null,   // the selected overlay (whether freeform or not)
        layer         = null,   // its .freeformHandles layer
        points        = [],     // the points shown by the layer: the outline at the edit time
        followed      = null,   // the content element whose outline the handles follow
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

    function clonePoint(p) {
        return Object.assign({}, p);
    }

    /**
     * I return the outline of an overlay at its edit time: sampled from its
     * keyframes while they carry outlines, else the one of its attributes.
     */
    function outlineOf(overlay) {
        return (overlay.hasKeyframeOutlines() && Keyframes.samplePoints(overlay.data.keyframes, overlay.editTime()))
            || overlay.resourceItem.freeformPoints(overlay.data.attributes);
    }

    /**
     * I return the bounds [u0, v0, u1, v1] of an outline in a box of w × h
     * pixels: of the outline itself (a curve can bulge past its points), and
     * never smaller than MIN_PX.
     */
    function boundsOf(list, w, h) {

        var b    = Keyframes.outlineBounds(list),
            minU = w ? MIN_PX / w * 100 : 1,
            minV = h ? MIN_PX / h * 100 : 1;

        if (b[2] - b[0] < minU) { var cu = (b[0] + b[2]) / 2; b[0] = cu - minU / 2; b[2] = cu + minU / 2; }
        if (b[3] - b[1] < minV) { var cv = (b[1] + b[3]) / 2; b[1] = cv - minV / 2; b[3] = cv + minV / 2; }

        return b;

    }

    /**
     * I write an outline that is the same at every time: the box is fitted to
     * it (with box motion every keyframe box the same way), and its points are
     * stored relative to the new box.
     */
    function writeStatic(overlay, list) {

        var box    = overlay.getBoxPx(overlay.editTime()),
            bounds = boundsOf(list, box.w, box.h);

        overlay.fitBoxToLocal(bounds[0], bounds[1], bounds[2], bounds[3]);

        var normalized = Keyframes.fitPoints(list, bounds);

        overlay.data.attributes.points = normalized;
        overlay.data.attributes.path   = overlay.resourceItem.freeformPath(normalized);

    }

    /**
     * I write a change of an outline into the keyframes of a hotspot with box
     * motion (see commit for the changes).
     *
     * A change of structure goes into every keyframe, so they keep the same
     * number of points and the same corners and curves. A point that was
     * moved is the outline of the edit time: of the keyframe there, which is
     * made when there is none and takes the box that is shown at that time
     * (the points were dragged in that box). Where an outline changed, the
     * keyframe's box is fitted to it.
     */
    function writeKeyframes(overlay, change) {

        var t         = overlay.editTime(),
            rect      = overlay.getRectAt(t),
            stage     = overlay.stageSize(),
            kfs       = overlay.data.keyframes,
            structure = (change.op !== 'move'),
            moved     = (change.op === 'move') || (change.op === 'insert' && change.moved),
            edited    = -1;

        if (!overlay.hasKeyframeOutlines()) {
            // From now on the outline changes with the keyframes: each starts with the outline as it is
            var base = overlay.resourceItem.freeformPoints(overlay.data.attributes);
            if (change.op === 'insert') {
                base.splice(change.index + 1, 0, Keyframes.outlineMidpoint(base, change.index));
            }
            kfs = Keyframes.seedPoints(kfs, base);
        } else if (change.op === 'insert') {
            kfs = Keyframes.insertPoint(kfs, change.index);
        } else if (change.op === 'remove') {
            kfs = Keyframes.removePoint(kfs, change.index);
        } else if (change.op === 'smooth') {
            kfs = Keyframes.smoothPoint(kfs, change.index, change.smooth);
        } else {
            kfs = kfs.slice();
        }

        if (moved) {
            var at = {
                xywh:   [rect.left, rect.top, rect.width, rect.height],
                r:      rect.rotation,
                points: change.points.map(clonePoint)
            };
            edited = overlay.keyframeIndexAt(t);
            if (edited !== -1) {
                kfs[edited] = Object.assign({}, kfs[edited], at);
            } else {
                edited = kfs.length;
                kfs.push(Object.assign({ t: t }, at));
            }
        }

        kfs = kfs.map(function(kf, idx) {
            if (!structure && idx !== edited) { return kf; }
            var bounds = boundsOf(kf.points, kf.xywh[2] / 100 * stage.width, kf.xywh[3] / 100 * stage.height);
            return Object.assign({}, kf, {
                xywh:   overlay.fitRect(kf.xywh, kf.r, bounds[0], bounds[1], bounds[2], bounds[3]),
                points: Keyframes.fitPoints(kf.points, bounds)
            });
        });

        // Normalises, keeps my position and the outline of the attributes (the first keyframe's) in step
        overlay.setKeyframes(kfs);

    }

    /**
     * I write an edited outline as one undo step. change is
     *
     *     { op: 'move',   points }                 a point was dragged
     *     { op: 'insert', points, index, moved }   a point was added after point index (and maybe dragged)
     *     { op: 'remove', points, index }          point index was removed
     *     { op: 'smooth', points, index, smooth }  point index became a curve or a corner
     *     { op: 'draw',   points }                 a new outline was drawn
     *
     * with points the whole outline after the change, in the box shown at the
     * edit time (they may reach outside it).
     *
     * Without box motion the outline is the one of the attributes. With box
     * motion a moved point is written into the keyframe at the playhead, and
     * from then on the keyframes carry the outline; changes of structure
     * follow where the outline is (attributes or keyframes). A drawing
     * replaces the outline at every time: the keyframes lose theirs.
     */
    function commit(overlay, change, description) {

        var before  = overlay.snapshotState(UNDO_KEYS),
            atTime  = (change.op === 'move') || (change.op === 'insert' && change.moved);

        if (change.op === 'draw' && overlay.hasKeyframeOutlines()) {
            overlay.setKeyframes(Keyframes.stripPoints(overlay.data.keyframes), { inherit: false });
        }

        if (overlay.hasKeyframes() && change.op !== 'draw' && (atTime || overlay.hasKeyframeOutlines())) {
            writeKeyframes(overlay, change);
        } else {
            writeStatic(overlay, change.points);
        }

        overlay.rerenderContent();

        var OverlaysController = FrameTrail.module('OverlaysController');
        OverlaysController.registerStateUndo(
            overlay,
            labels['SidebarOverlays'] + ' ' + description,
            before,
            overlay.snapshotState(UNDO_KEYS),
            { rerender: true }
        );
        OverlaysController.refreshMotionControls(overlay);
        FrameTrail.module('HypervideoModel').newUnsavedChange('overlays');

    }


    /* ------------------------------------------------------------------ */
    /*  Point handles                                                     */
    /* ------------------------------------------------------------------ */

    function removeLayer() {
        unfollow();
        if (layer) {
            layer.remove();
            layer = null;
        }
    }

    /**
     * The handles follow the outline that is shown: an outline that changes
     * with the keyframes is redrawn with the video time (ResourceHotspot's
     * animateOutline), and tells me through this listener. Not while a point
     * is dragged: then the handles lead.
     */
    function follow(detail) {

        unfollow();
        if (!detail) { return; }

        followed = detail;
        detail._ftOutlineListener = function(shown) {
            if (drag || !layer || !shown || shown.length !== points.length) { return; }
            points = shown.map(clonePoint);
            layout(points);
        };

    }

    function unfollow() {
        if (followed) {
            delete followed._ftOutlineListener;
            delete followed._ftOutlineHeld;
            followed = null;
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

        points = list || outlineOf(current);
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
        follow(contentDetail(current));

    }

    /**
     * I place the handles and the outline for a (possibly in-progress) list of
     * points, without rebuilding them.
     */
    function layout(list) {

        if (!layer) { return; }

        var pathData = current.resourceItem.freeformPath(list);

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
            var middle = Keyframes.outlineMidpoint(list, parseInt(handle.dataset.index, 10));
            handle.style.left = middle.x + '%';
            handle.style.top  = middle.y + '%';
        });

    }

    function onPointDown(evt) {

        if (evt.button !== 0) { return; }
        evt.stopPropagation();
        evt.preventDefault();

        var idx = parseInt(this.dataset.index, 10),
            now = Date.now();

        settle();

        // Double-click (two presses on the same point): corner <-> smooth
        if (!drag && lastTap && lastTap.index === idx && now - lastTap.time < 400) {
            lastTap = null;
            var toggled = points.map(clonePoint),
                smooth  = !toggled[idx].smooth;
            if (smooth) { toggled[idx].smooth = true; } else { delete toggled[idx].smooth; }
            commit(current, { op: 'smooth', points: toggled, index: idx, smooth: smooth }, labels['SettingsHotspotShape']);
            return;
        }
        lastTap = { index: idx, time: now };

        selectedIndex = idx;
        startPointDrag(evt, idx, points.map(clonePoint));

    }

    /**
     * Before the outline is changed at the playhead: an outline that changes
     * over time is edited with the video standing still, and the points are
     * those of the edit time, from the data (what is shown can be a frame off).
     */
    function settle() {

        if (!current.hasKeyframes()) { return; }

        var HypervideoController = FrameTrail.module('HypervideoController');
        if (HypervideoController.isPlaying) {
            HypervideoController.pause();
        }
        if (!drag && current.hasKeyframeOutlines()) {
            points = outlineOf(current);
        }

    }

    function onInsertDown(evt) {

        if (evt.button !== 0) { return; }
        evt.stopPropagation();
        evt.preventDefault();

        settle();

        var idx  = parseInt(this.dataset.index, 10),
            list = points.map(clonePoint);

        // In the middle of the stretch; on a curved one the new point keeps the curve going
        list.splice(idx + 1, 0, Keyframes.outlineMidpoint(points, idx));

        // Show the new point, then drag it (a plain click inserts it where it is)
        selectedIndex = idx + 1;
        lastTap = null;
        render(list);
        startPointDrag(evt, idx + 1, list.map(clonePoint), true);

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

        // The outline shown stands still while its points are dragged
        if (followed) { followed._ftOutlineHeld = true; }

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

        if (followed) { delete followed._ftOutlineHeld; }

        if (done.moved || done.inserted) {
            FrameTrail.module('ViewVideo').swallowNextClick();
            commit(done.overlay, done.inserted
                ? { op: 'insert', points: done.points, index: done.index - 1, moved: done.moved }
                : { op: 'move', points: done.points }, labels['SettingsHotspotShape']);
        } else {
            layout(points);
            // What was held back while the point was pressed
            var OverlayAnimator = FrameTrail.module('OverlayAnimator');
            if (OverlayAnimator) { OverlayAnimator.syncAll(); }
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

        // Editing by hand waits while a transaction of the edit API changes the hypervideo.
        if (FrameTrail.getState('editBusy')) {
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
            settle();
            var list    = points.map(clonePoint),
                removed = selectedIndex;
            list.splice(removed, 1);
            selectedIndex = null;
            commit(current, { op: 'remove', points: list, index: removed }, labels['SettingsHotspotShape']);
        }

    }


    /* ------------------------------------------------------------------ */
    /*  Draw mode                                                         */
    /* ------------------------------------------------------------------ */

    /**
     * I start drawing a new outline for a freeform hotspot on the video. An
     * outline that changes over time is replaced at every time by the
     * drawing, so I ask first.
     * @method startDrawing
     * @param {Overlay} overlay
     * @param {Boolean} confirmed (internal) the question was answered
     */
    function startDrawing(overlay, confirmed) {

        if (!overlay || FrameTrail.getState('editMode') !== 'overlays') { return; }

        if (!confirmed && isFreeform(overlay) && overlay.hasKeyframeOutlines()) {
            ConfirmDialog({
                title:        labels['SettingsHotspotDrawShape'],
                icon:         'icon-assembly-reference',
                message:      labels['MessageFreeformRedraw'],
                confirmLabel: labels['SettingsHotspotDrawShape'],
                cancelLabel:  labels['GenericCancel'],
                onConfirm:    function() { startDrawing(overlay, true); }
            });
            return;
        }

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
        commit(overlay, { op: 'draw', points: local }, labels['SettingsHotspotDrawShape']);

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
