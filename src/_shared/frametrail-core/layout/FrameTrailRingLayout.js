/**
 * @module Shared
 */


/**
 * I am FrameTrailRingLayout: the geometry of the circular layout area, annotation thumbnails in rings of
 * cells around the video. I touch neither the DOM nor any FrameTrail instance, so I run in the browser as a
 * plain script (window.FrameTrailRingLayout) and in Node under require(), for tools and tests.
 *
 * The grid fills the whole space; its cells are shaped like thumbnails (cellRatio = height / width) and
 * sized relative to the video's width without a ring (across cells span it). k rings leave an inner block
 * of (columns - 2k) x (rows - 2k) cells, into which the video is fitted (letterboxed when the block has
 * another shape). Slots are in spiral order: ring 1 starts left of the video's bottom row and runs
 * clockwise (up, right, down, left), ending in its bottom-left corner; ring 2 starts left of that corner.
 *
 * A gap (pixels) lies between the cells, between the ring and the inner block, and between the ring and
 * the space's edges.
 *
 * @class FrameTrailRingLayout
 * @static
 */

(function(factory) {

    var api = factory();

    if (typeof window !== 'undefined') {
        window.FrameTrailRingLayout = api;
    }
    if (typeof module === 'object' && module && module.exports) {
        module.exports = api;
    }

})(function() {

    // How many cells span the video's ringless width, per size, in the order they are tried
    var STEPS = {
        medium: [8, 10, 12, 14, 16],
        small:  [16, 20, 24]
    };

    var CELL_RATIO      = 0.7,
        MIN_VIDEO_SHARE = 0.5;

    function capacity(cols, rows, rings) {
        var cap = 0;
        for (var j = 1; j <= rings; j++) {
            cap += 2 * cols + 2 * rows + 8 * j - 4;
        }
        return cap;
    }

    // Grid coordinates of ring j's cells in spiral order; the inner block covers c 0..cols-1, r 0..rows-1.
    function ringCells(cols, rows, j) {
        var cells = [], c, r;
        for (r = rows + j - 2; r >= -j; r--)       { cells.push([-j, r]); }            // left, upwards, to the top-left corner
        for (c = -j + 1; c <= cols - 1 + j; c++)   { cells.push([c, -j]); }            // top, rightwards, to the top-right corner
        for (r = -j + 1; r <= rows - 1 + j; r++)   { cells.push([cols - 1 + j, r]); }  // right, downwards, to the bottom-right corner
        for (c = cols - 2 + j; c >= -j; c--)       { cells.push([c, rows - 1 + j]); }  // bottom, leftwards, to the bottom-left corner
        return cells;
    }

    // The width of a cell for a pitch (the space across cells span, divided by them) less the gap; a gap may
    // take at most three quarters of the pitch.
    function cellWidth(pitch, gap) {
        return Math.max(pitch / 4, pitch - gap);
    }

    function fitFor(W, H, A, across, count, minShare, cellRatio, gap) {
        var U = Math.min(W, H * A),
            pitch = U / across,
            cw0 = pitch - gap,
            ch0 = cw0 * cellRatio,
            Wg = W - 2 * gap,
            Hg = H - 2 * gap;

        if (cw0 < pitch / 4 || !(Wg > 0) || !(Hg > 0)) { return null; }

        var totalCols = Math.max(3, Math.round((Wg + gap) / (cw0 + gap))),
            totalRows = Math.max(3, Math.round((Hg + gap) / (ch0 + gap))),
            cw = (Wg - (totalCols - 1) * gap) / totalCols,
            ch = (Hg - (totalRows - 1) * gap) / totalRows;

        for (var k = 1; 2 * k < Math.min(totalCols, totalRows); k++) {
            var cols = totalCols - 2 * k,
                rows = totalRows - 2 * k,
                bw = cols * cw + (cols - 1) * gap,
                bh = rows * ch + (rows - 1) * gap,
                vw = Math.min(bw, bh * A),
                vh = vw / A;
            if (vw < minShare * U) { return null; }
            if (capacity(cols, rows, k) >= count) {
                return { across: across, rings: k, cols: cols, rows: rows, cw: cw, ch: ch, bw: bw, bh: bh, vw: vw, vh: vh };
            }
        }
        return null;
    }

    /**
     * I lay out a ring of count thumbnails in a space of width x height, around a video of the given aspect
     * ratio (width / height); size is 'small' or 'medium', gap the pixels between the thumbnails and between
     * them and the video's block (default 0). I return null when they do not fit (the caller shows a strip),
     * else { across, rings, cols, rows, count, gap, cell: { w, h }, box: rect, video: rect,
     * slots: [{ x, y, w, h, ring, c, r }] } with slots the thumbnails, box the inner block, video the video
     * fitted into it.
     *
     * @method layout
     * @param {Object} opts { width, height, aspect, count, size, gap?, minVideoShare?, cellRatio? }
     * @return {Object|null}
     */
    function layout(opts) {
        var W = opts.width,
            H = opts.height,
            A = opts.aspect || 16 / 9,
            gap = Math.max(0, opts.gap || 0),
            count = Math.max(1, opts.count || 0),
            minShare = (opts.minVideoShare != null) ? opts.minVideoShare : MIN_VIDEO_SHARE,
            cellRatio = opts.cellRatio || CELL_RATIO,
            steps = STEPS[opts.size] || STEPS.medium,
            fit = null;

        if (!(W > 0) || !(H > 0)) { return null; }

        for (var i = 0; i < steps.length && !fit; i++) {
            fit = fitFor(W, H, A, steps[i], count, minShare, cellRatio, gap);
        }
        if (!fit) { return null; }

        var k = fit.rings,
            stepX = fit.cw + gap,
            stepY = fit.ch + gap,
            x0 = gap + k * stepX,
            y0 = gap + k * stepY,
            slots = [];

        for (var j = 1; j <= k; j++) {
            ringCells(fit.cols, fit.rows, j).forEach(function(cell) {
                slots.push({ x: gap + (cell[0] + k) * stepX, y: gap + (cell[1] + k) * stepY, w: fit.cw, h: fit.ch, ring: j, c: cell[0], r: cell[1] });
            });
        }

        return {
            across: fit.across,
            rings:  k,
            cols:   fit.cols,
            rows:   fit.rows,
            count:  opts.count || 0,
            gap:    gap,
            cell:   { w: fit.cw, h: fit.ch },
            box:    { x: x0, y: y0, w: fit.bw, h: fit.bh },
            video:  { x: x0 + (fit.bw - fit.vw) / 2, y: y0 + (fit.bh - fit.vh) / 2, w: fit.vw, h: fit.vh },
            slots:  slots
        };
    }

    /**
     * I lay out the strip that stands in for the ring on narrow players: one row of cells a gap below the
     * video and a gap from the space's sides and bottom, the video and the strip centred together.
     * { cell, gap, box, video, strip } (rects).
     *
     * @method strip
     * @param {Object} opts { width, height, aspect, size, gap?, cellRatio? }
     * @return {Object}
     */
    function strip(opts) {
        var W = opts.width,
            H = opts.height,
            A = opts.aspect || 16 / 9,
            gap = Math.max(0, opts.gap || 0),
            across = (STEPS[opts.size] || STEPS.medium)[0],
            U = Math.min(W, H * A),
            cw = cellWidth(U / across, gap),
            ch = cw * (opts.cellRatio || CELL_RATIO),
            vw = Math.min(W, (H - ch - 2 * gap) * A),
            vh = vw / A,
            top = (H - vh - ch - 2 * gap) / 2;

        return {
            cell:  { w: cw, h: ch },
            gap:   gap,
            box:   { x: 0, y: top, w: W, h: vh },
            video: { x: (W - vw) / 2, y: top, w: vw, h: vh },
            strip: { x: gap, y: top + vh + gap, w: W - 2 * gap, h: ch }
        };
    }

    /**
     * I give each item a slot: times (seconds from the video's start, in item order, ascending) on a track
     * of slotCount slots spanning duration. An item takes the slot holding its time, the next free one when
     * taken; at the end they are pulled back. Strictly increasing; null when there are more items than
     * slots. Without a duration, in order.
     *
     * @method placeByTime
     * @param {Array} times
     * @param {Number} duration
     * @param {Number} slotCount
     * @return {Array|null}
     */
    function placeByTime(times, duration, slotCount) {
        var n = times.length,
            out = new Array(n),
            i;
        if (n > slotCount) { return null; }
        for (i = 0; i < n; i++) {
            var ideal = (duration > 0) ? Math.floor(times[i] / duration * slotCount) : i;
            ideal = Math.max(0, Math.min(slotCount - 1, ideal));
            out[i] = (i > 0) ? Math.max(ideal, out[i - 1] + 1) : ideal;
        }
        for (i = n - 1; i >= 0; i--) {
            out[i] = Math.min(out[i], (i === n - 1) ? slotCount - 1 : out[i + 1] - 1);
        }
        return out;
    }

    return {

        STEPS:       STEPS,

        capacity:    capacity,
        layout:      layout,
        placeByTime: placeByTime,
        strip:       strip

    };

});
