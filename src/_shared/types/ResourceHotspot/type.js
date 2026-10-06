/**
 * @module Shared
 */


/**
 * I am the type definition of a ResourceHotspot.
 *
 * * Hotspot Resources only appear in the 'Add Custom Overlay' tab
 *   and are not listed in the ResourceManager.
 *
 * * Hotspot Resources can not be used as Annotation
 *
 * @class ResourceHotspot
 * @category TypeDefinition
 * @extends Resource
 */



FrameTrail.defineType(

    'ResourceHotspot',

    function (FrameTrail) {
        return {
            parent: 'Resource',
            constructor: function(resourceData){
                this.resourceData = resourceData;
            },
            prototype: {
                /**
                 * I hold the data object of a custom ResourceHotspot, which is not stored in the Database and doesn't appear in the resource's _index.json.
                 * @attribute resourceData
                 * @type {}
                 */
                resourceData:   {},
                iconClass:      'icon-link',


                /**
                 * I render the content of myself, which is a &lt;div&gt; containing a pulsating circle hotspot wrapped in a &lt;div class="resourceDetail" ...&gt;
                 *
                 * @method renderContent
                 * @return HTMLElement
                 */
                renderContent: function() {

                    var self = this;

                    var attrs = this.resourceData.attributes || {};
                    var color = attrs.color ? attrs.color : '#0096ff';
                    var linkUrl = attrs.linkUrl ? attrs.linkUrl : '';
                    var borderWidth = (attrs.borderWidth !== undefined) ? attrs.borderWidth : 5;
                    var shape = attrs.shape ? attrs.shape : 'circle';
                    var borderRadius = (attrs.borderRadius !== undefined) ? attrs.borderRadius : 10;
                    var text = attrs.text ? attrs.text : '';
                    var textColor = attrs.textColor ? attrs.textColor : '#ffffff';
                    var backgroundColor = attrs.backgroundColor ? attrs.backgroundColor : '';

                    // Calculate border-radius value based on shape (0% to 50%)
                    var borderRadiusValue;
                    if (shape === 'circle') {
                        borderRadiusValue = '50%';
                    } else if (shape === 'rectangle') {
                        borderRadiusValue = '0';
                    } else { // rounded
                        borderRadiusValue = borderRadius + 'px';
                    }

                    // Calculate border width - we'll set it as a CSS variable and update it
                    // Border width will be a percentage of the smaller dimension
                    var borderWidthValue = borderWidth > 0 ? borderWidth + '%' : '0';

                    // Always use an <a> tag (even when empty, to avoid element replacement during editing)
                    var elementAttrs = ' href="' + (linkUrl || '#') + '"';
                    if (linkUrl && (linkUrl.startsWith('http://') || linkUrl.startsWith('https://'))) {
                        elementAttrs += ' target="_blank"';
                    }

                    // A filled background makes the hotspot read as a button; the pulse ring is
                    // then hidden so it looks like a solid call-to-action rather than a marker.
                    var pulseDisplay = backgroundColor ? 'none' : '';
                    var labelStyle = 'position:absolute; top:50%; left:50%; transform:translate(-50%,-50%); '
                                   + 'width:90%; text-align:center; pointer-events:none; overflow:hidden; '
                                   + 'text-overflow:ellipsis; color:' + textColor + ';';

                    // Arrow, underline and freeform shapes, and any shape whose outline
                    // draws itself (Draw entrance / exit), are rendered as an SVG stroke.
                    // All other hotspots keep the CSS border rendering.
                    var svgMode   = this.usesSvg(attrs),
                        lineShape = (shape === 'arrow' || shape === 'underline');

                    if (lineShape || shape === 'freeform') {
                        pulseDisplay = 'none';
                    }

                    var _rdw = document.createElement('div');
                    _rdw.innerHTML = '<div class="resourceDetail" data-type="hotspot" data-shape="' + shape + '">'
                                        +  '    <div class="resourceContent">'
                                        +  '        <div class="hotspot-container">'
                                        +  '            <div class="hotspot-square-wrapper">'
                                        +  '                <a class="hotspot-element"' + elementAttrs + ' style="border-radius: ' + borderRadiusValue + '; border-color: ' + color + '; text-decoration: none; display: block;">'
                                        +  '                    <span class="hotspot-label" style="' + labelStyle + '"></span>'
                                        +  '                </a>'
                                        +  '                <div class="hotspot-pulse" style="border-color: ' + color + '; border-radius: ' + borderRadiusValue + '; display: ' + pulseDisplay + ';"></div>'
                                        +  '            </div>'
                                        +  '        </div>'
                                        +  '    </div>'
                                        +  '</div>';
                    var resourceDetail = _rdw.firstElementChild;

                    var hotspotElement = resourceDetail.querySelector('.hotspot-element');
                    resourceDetail.querySelector('.hotspot-label').textContent = text;

                    if (svgMode) {
                        this.renderSvgStroke(resourceDetail, attrs);
                        // The stroke replaces the border; fill and label stay on the link
                        borderWidth = 0;
                    }
                    
                    // Helper function to convert hex color to rgba
                    var hexToRgba = function(hex, alpha) {
                        var r = parseInt(hex.slice(1, 3), 16);
                        var g = parseInt(hex.slice(3, 5), 16);
                        var b = parseInt(hex.slice(5, 7), 16);
                        return 'rgba(' + r + ', ' + g + ', ' + b + ', ' + alpha + ')';
                    };
                    
                    // Calculate and set border width in pixels (percentage of smaller dimension)
                    var calculateBorderWidth = function(element, percentage) {
                        if (percentage <= 0) return 0;
                        // Wait for element to be in DOM to get dimensions
                        setTimeout(function() {
                            var width = element.offsetWidth;
                            var height = element.offsetHeight;
                            var smaller = Math.min(width, height);
                            var actualWidth = (smaller * percentage) / 100;
                            element.style.borderWidth = actualWidth + 'px';
                        }, 0);
                        return 0; // Initial value
                    };
                    
                    // Set initial border width
                    calculateBorderWidth(hotspotElement, borderWidth);
                    hotspotElement.style.backgroundColor = backgroundColor || 'transparent';
                    hotspotElement.style.borderStyle = 'solid';
                    hotspotElement.style.borderColor = color;
                    if (svgMode) {
                        hotspotElement.style.borderWidth = '0';
                        hotspotElement.style.boxShadow = 'none';
                    }

                    // Add hover effect: make background semi-transparent (only for marker-style
                    // hotspots with a visible outline and no solid fill; lines have no area)
                    var outlineWidth = svgMode ? ((attrs.borderWidth !== undefined) ? attrs.borderWidth : 5) : borderWidth;
                    if (outlineWidth > 0 && !backgroundColor && !lineShape) {
                        var hoverColor = hexToRgba(color, 0.3);
                        hotspotElement._enterFn = function() { this.style.backgroundColor = hoverColor; };
                        hotspotElement._leaveFn = function() { this.style.backgroundColor = 'transparent'; };
                        hotspotElement.addEventListener('mouseenter', hotspotElement._enterFn);
                        hotspotElement.addEventListener('mouseleave', hotspotElement._leaveFn);
                    }
                    
                    // Route all clicks through the shared overlay action model
                    // (falls back to linkUrl as 'openUrl' for existing hotspot data)
                    hotspotElement.addEventListener('click', function(e) {
                        e.preventDefault();
                        if (FrameTrail.getState('editMode') === 'overlays') { return; }
                        self.executeOverlayAction(self.resourceData.attributes || {});
                    });

                    resourceDetail.appendChild(this.buildResourceOptions({
                        licenseType: this.resourceData.licenseType,
                        licenseAttribution: this.resourceData.licenseAttribution
                    }));

                    return resourceDetail;

                },

                /**
                 * I tell whether a hotspot renders its outline as an SVG stroke: the
                 * arrow, underline and freeform shapes always, other shapes while a Draw
                 * entrance or exit is set (their CSS border cannot draw itself).
                 *
                 * @method usesSvg
                 * @param {Object} attrs
                 * @return {Boolean}
                 */
                usesSvg: function(attrs) {

                    attrs = attrs || {};
                    var animation = attrs.animation || {};
                    return ['arrow', 'underline', 'freeform'].indexOf(attrs.shape) >= 0
                        || !!(animation['in'] && animation['in'].preset === 'draw')
                        || !!(animation.out && animation.out.preset === 'undraw');

                },

                /**
                 * I add the SVG stroke of a hotspot to its rendered content. Geometry is
                 * laid out in pixels of the hotspot box (re-laid out on resize), so
                 * arrowheads and rounded corners never distort; the freeform outline is
                 * given in 0–100 box coordinates (attributes.points, or a legacy
                 * attributes.path) and stretches with the box.
                 *
                 * The arrow shape is ported from the hw-arrow / svg-stroke-trace recipes
                 * of HyperFrames (https://github.com/heygen-com/hyperframes), Copyright
                 * 2026 HeyGen, Inc., Apache License 2.0, modified (clean strokes, eight
                 * directions, one path so a Draw entrance traces shaft, then head).
                 *
                 * @method renderSvgStroke
                 * @param {HTMLElement} resourceDetail
                 * @param {Object} attrs
                 */
                renderSvgStroke: function(resourceDetail, attrs) {

                    var SVG_NS  = 'http://www.w3.org/2000/svg',
                        shape   = attrs.shape || 'circle',
                        color   = attrs.color || '#0096ff',
                        widthPct = (attrs.borderWidth !== undefined) ? attrs.borderWidth : 5,
                        wrapper = resourceDetail.querySelector('.hotspot-square-wrapper'),
                        link    = resourceDetail.querySelector('.hotspot-element');

                    var svg = document.createElementNS(SVG_NS, 'svg');
                    svg.setAttribute('class', 'hotspot-svg');
                    svg.setAttribute('aria-hidden', 'true');

                    var stroke = document.createElementNS(SVG_NS, 'path');
                    stroke.setAttribute('class', 'hotspot-stroke');
                    stroke.setAttribute('pathLength', '1');
                    stroke.setAttribute('fill', 'none');
                    stroke.setAttribute('stroke', color);
                    stroke.setAttribute('stroke-linecap', 'round');
                    stroke.setAttribute('stroke-linejoin', 'round');
                    svg.appendChild(stroke);

                    wrapper.insertBefore(svg, link);

                    if (shape === 'freeform') {

                        var hotspot = this,
                            // Points (edited on the video) win; a path-only legacy shape clips as written
                            pathData = this.validFreeformPoints(attrs.points)
                                ? this.freeformPath(attrs.points)
                                : (attrs.path || this.freeformPath(this.defaultFreeformPoints()));

                        // The stroke is laid out in pixels (not a stretched 0–100 viewBox with a
                        // non-scaling stroke, where the dash of a Draw animation would not span
                        // the whole outline)
                        resourceDetail._ftFreeformPoints = this.freeformPoints(attrs);
                        resourceDetail._ftFreeformLegacyPath = this.validFreeformPoints(attrs.points) ? null : (attrs.path || null);
                        resourceDetail._ftFreeformLayout = function() {
                            var w = wrapper.offsetWidth, h = wrapper.offsetHeight;
                            if (!w || !h) { return; }
                            var legacy = resourceDetail._ftFreeformLegacyPath && hotspot.scalePathData(resourceDetail._ftFreeformLegacyPath, w / 100, h / 100);
                            svg.setAttribute('viewBox', '0 0 ' + w + ' ' + h);
                            stroke.setAttribute('stroke-width', Math.max(0.5, Math.min(w, h) * widthPct / 100));
                            stroke.setAttribute('d', legacy || hotspot.freeformPath(resourceDetail._ftFreeformPoints, w / 100, h / 100));
                        };

                        // Clicks only inside the shape
                        var clipId = 'ftHotspotClip' + Math.random().toString(36).slice(2, 10),
                            defs   = document.createElementNS(SVG_NS, 'defs'),
                            clip   = document.createElementNS(SVG_NS, 'clipPath'),
                            clipShape = document.createElementNS(SVG_NS, 'path');
                        clip.setAttribute('id', clipId);
                        clip.setAttribute('clipPathUnits', 'objectBoundingBox');
                        clipShape.setAttribute('d', pathData);
                        clipShape.setAttribute('transform', 'scale(0.01)');
                        clip.appendChild(clipShape);
                        defs.appendChild(clip);
                        svg.appendChild(defs);
                        link.style.clipPath = 'url(#' + clipId + ')';
                        link.style.borderRadius = '0';

                        this._observeSize(resourceDetail, wrapper, resourceDetail._ftFreeformLayout);
                        return;
                    }

                    var self = this;
                    var layout = function() {
                        var w = wrapper.offsetWidth,
                            h = wrapper.offsetHeight;
                        if (!w || !h) { return; }
                        var sw = Math.max(0.5, Math.min(w, h) * widthPct / 100);
                        svg.setAttribute('viewBox', '0 0 ' + w + ' ' + h);
                        stroke.setAttribute('stroke-width', sw);
                        stroke.setAttribute('d', self.svgShapePath(shape, w, h, sw, attrs));
                    };
                    this._observeSize(resourceDetail, wrapper, layout);

                },

                /**
                 * The shape a new freeform hotspot starts with (a pentagon).
                 * @method defaultFreeformPoints
                 * @return {Array}
                 */
                defaultFreeformPoints: function() {

                    return [{ x: 50, y: 4 }, { x: 96, y: 36 }, { x: 80, y: 94 }, { x: 20, y: 94 }, { x: 4, y: 36 }];

                },

                /**
                 * I tell whether a points list can describe a freeform outline.
                 * @method validFreeformPoints
                 * @param {Array} points
                 * @return {Boolean}
                 */
                validFreeformPoints: function(points) {

                    return Array.isArray(points) && points.length >= 3 && points.every(function(p) {
                        return p && isFinite(p.x) && isFinite(p.y);
                    });

                },

                /**
                 * I return the editable points of a freeform outline: its points, or
                 * points read from a legacy path, or the default shape. Points are in
                 * 0–100 box coordinates; smooth points let the outline curve through
                 * them, the others are corners.
                 * @method freeformPoints
                 * @param {Object} attrs
                 * @return {Array} [{ x, y, smooth? }]
                 */
                freeformPoints: function(attrs) {

                    attrs = attrs || {};
                    if (this.validFreeformPoints(attrs.points)) {
                        return attrs.points.map(function(p) {
                            var point = { x: parseFloat(p.x), y: parseFloat(p.y) };
                            if (p.smooth) { point.smooth = true; }
                            return point;
                        });
                    }
                    return (attrs.path && this.parseFreeformPath(attrs.path)) || this.defaultFreeformPoints();

                },

                /**
                 * I read the points of a legacy freeform path (its first subpath).
                 * Straight paths (M/L/H/V/Z) are read exactly; paths with curves are
                 * sampled into smooth points.
                 * @method parseFreeformPath
                 * @param {String} path
                 * @return {Array|null}
                 */
                parseFreeformPath: function(path) {

                    path = String(path || '');

                    if (/[CcSsQqTtAa]/.test(path)) {
                        var SVG_NS = 'http://www.w3.org/2000/svg',
                            svg    = document.createElementNS(SVG_NS, 'svg'),
                            el     = document.createElementNS(SVG_NS, 'path'),
                            sampled = [];
                        svg.setAttribute('style', 'position:absolute;width:0;height:0;overflow:hidden;visibility:hidden');
                        el.setAttribute('d', path);
                        svg.appendChild(el);
                        document.body.appendChild(svg);
                        try {
                            var length = el.getTotalLength();
                            for (var s = 0; s < 24 && length > 0; s++) {
                                var pt = el.getPointAtLength(length * s / 24);
                                sampled.push({ x: Math.round(pt.x * 100) / 100, y: Math.round(pt.y * 100) / 100, smooth: true });
                            }
                        } catch (e) {}
                        svg.remove();
                        return sampled.length >= 3 ? sampled : null;
                    }

                    var tokens = path.match(/[MmLlHhVvZz]|-?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?/g) || [],
                        points = [],
                        x = 0, y = 0,
                        cmd = null,
                        i = 0;

                    var num = function() { return parseFloat(tokens[i++]); };

                    while (i < tokens.length) {
                        var token = tokens[i];
                        if (/[A-Za-z]/.test(token)) {
                            if ((token === 'M' || token === 'm') && points.length) { break; }
                            cmd = token;
                            i++;
                            continue;
                        }
                        switch (cmd) {
                            case 'M': x = num(); y = num(); cmd = 'L'; break;
                            case 'm': x += num(); y += num(); cmd = 'l'; break;
                            case 'L': x = num(); y = num(); break;
                            case 'l': x += num(); y += num(); break;
                            case 'H': x = num(); break;
                            case 'h': x += num(); break;
                            case 'V': y = num(); break;
                            case 'v': y += num(); break;
                            default:  i++; continue;
                        }
                        if (isFinite(x) && isFinite(y)) {
                            points.push({ x: x, y: y });
                        }
                    }

                    var first = points[0], last = points[points.length - 1];
                    if (points.length > 1 && Math.abs(first.x - last.x) < 0.001 && Math.abs(first.y - last.y) < 0.001) {
                        points.pop();
                    }

                    return points.length >= 3 ? points : null;

                },

                /**
                 * I scale legacy freeform path data from 0–100 box coordinates to
                 * pixels, exactly. I return null for paths with arcs (which do not
                 * survive a non-uniform scale) or anything I cannot read.
                 * @method scalePathData
                 * @param {String} path
                 * @param {Number} scaleX
                 * @param {Number} scaleY
                 * @return {String|null}
                 */
                scalePathData: function(path, scaleX, scaleY) {

                    path = String(path || '');
                    if (/[Aa]/.test(path)) { return null; }

                    var tokens = path.match(/[MmLlHhVvCcSsQqTtZz]|-?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?/g),
                        axes   = { M: 'xy', L: 'xy', T: 'xy', H: 'x', V: 'y', C: 'xyxyxy', S: 'xyxy', Q: 'xyxy', Z: '' },
                        out    = [],
                        cmd    = null,
                        k      = 0;

                    if (!tokens || !/[Mm]/.test(tokens[0])) { return null; }

                    for (var i = 0; i < tokens.length; i++) {
                        var token = tokens[i];
                        if (/[A-Za-z]/.test(token)) {
                            cmd = token.toUpperCase();
                            k = 0;
                            out.push(token);
                            continue;
                        }
                        var pattern = axes[cmd];
                        if (!pattern) { return null; }
                        var axis = pattern.charAt(k % pattern.length);
                        k++;
                        out.push(Math.round(parseFloat(token) * (axis === 'x' ? scaleX : scaleY) * 100) / 100);
                    }

                    return out.join(' ');

                },

                /**
                 * I return the segments of a closed freeform outline as cubic curves
                 * (Catmull-Rom tangents at smooth points, none at corners).
                 * @method freeformSegments
                 * @param {Array} points
                 * @return {Array} [{ a, c1, c2, b, straight }]
                 */
                freeformSegments: function(points) {

                    var n = points.length,
                        tangent = function(i) {
                            var p = points[i], prev = points[(i - 1 + n) % n], next = points[(i + 1) % n];
                            return p.smooth ? [(next.x - prev.x) / 6, (next.y - prev.y) / 6] : [0, 0];
                        };

                    return points.map(function(a, i) {
                        var j  = (i + 1) % n,
                            b  = points[j],
                            ta = tangent(i),
                            tb = tangent(j);
                        return {
                            a:        a,
                            c1:       { x: a.x + ta[0], y: a.y + ta[1] },
                            c2:       { x: b.x - tb[0], y: b.y - tb[1] },
                            b:        b,
                            straight: !a.smooth && !b.smooth
                        };
                    });

                },

                /**
                 * I return the SVG path data of a closed freeform outline, in 0–100
                 * box coordinates or, with scale factors, in pixels of the box.
                 * @method freeformPath
                 * @param {Array} points
                 * @param {Number} scaleX (optional)
                 * @param {Number} scaleY (optional)
                 * @return {String}
                 */
                freeformPath: function(points, scaleX, scaleY) {

                    var sx = scaleX || 1,
                        sy = scaleY || 1,
                        r2 = function(v) { return Math.round(v * 100) / 100; },
                        pt = function(p) { return r2(p.x * sx) + ',' + r2(p.y * sy); },
                        segments = this.freeformSegments(points),
                        d = 'M' + pt(points[0]);

                    segments.forEach(function(seg, idx) {
                        if (seg.straight) {
                            // the closing segment is drawn by Z
                            if (idx < segments.length - 1) { d += ' L' + pt(seg.b); }
                        } else {
                            d += ' C' + pt(seg.c1) + ' ' + pt(seg.c2) + ' ' + pt(seg.b);
                        }
                    });

                    return d + ' Z';

                },

                /**
                 * While a freeform outline is edited, I show new points without
                 * re-rendering: the stroke and the clip area of the link follow them.
                 * @method setFreeformPreview
                 * @param {HTMLElement} resourceDetail
                 * @param {Array} points
                 */
                setFreeformPreview: function(resourceDetail, points) {

                    if (!resourceDetail || !resourceDetail._ftFreeformLayout) { return; }
                    resourceDetail._ftFreeformPoints     = points;
                    resourceDetail._ftFreeformLegacyPath = null;
                    resourceDetail._ftFreeformLayout();
                    var clipShape = resourceDetail.querySelector('clipPath path');
                    if (clipShape) { clipShape.setAttribute('d', this.freeformPath(points)); }

                },

                /**
                 * I lay out an SVG geometry now and whenever the hotspot box resizes.
                 * @method _observeSize
                 * @private
                 */
                _observeSize: function(resourceDetail, element, layout) {

                    window.requestAnimationFrame(layout);
                    if (window.ResizeObserver) {
                        var observer = new ResizeObserver(layout);
                        observer.observe(element);
                        resourceDetail._ftCleanup = function() { observer.disconnect(); };
                    }

                },

                /**
                 * I return the SVG path data of a hotspot outline in pixels of a w×h box
                 * (stroke width sw kept inside the box).
                 *
                 * @method svgShapePath
                 * @param {String} shape
                 * @param {Number} w
                 * @param {Number} h
                 * @param {Number} sw
                 * @param {Object} attrs
                 * @return {String}
                 */
                svgShapePath: function(shape, w, h, sw, attrs) {

                    var r2 = function(v) { return Math.round(v * 100) / 100; },
                        m  = sw / 2;

                    if (shape === 'underline') {
                        return 'M' + r2(m) + ',' + r2(h - m) + ' L' + r2(w - m) + ',' + r2(h - m);
                    }

                    if (shape === 'circle') {
                        var rx = Math.max(0, w / 2 - m), ry = Math.max(0, h / 2 - m), cx = w / 2, cy = h / 2;
                        return 'M' + r2(cx) + ',' + r2(cy - ry)
                             + ' A' + r2(rx) + ',' + r2(ry) + ' 0 1 1 ' + r2(cx) + ',' + r2(cy + ry)
                             + ' A' + r2(rx) + ',' + r2(ry) + ' 0 1 1 ' + r2(cx) + ',' + r2(cy - ry) + ' Z';
                    }

                    if (shape === 'rectangle' || shape === 'rounded') {
                        var x0 = m, y0 = m, x1 = w - m, y1 = h - m,
                            rad = (shape === 'rounded') ? Math.max(0, Math.min((attrs.borderRadius !== undefined ? attrs.borderRadius : 10), (x1 - x0) / 2, (y1 - y0) / 2)) : 0;
                        if (!rad) {
                            return 'M' + r2(x0) + ',' + r2(y0) + ' L' + r2(x1) + ',' + r2(y0) + ' L' + r2(x1) + ',' + r2(y1) + ' L' + r2(x0) + ',' + r2(y1) + ' Z';
                        }
                        return 'M' + r2(x0 + rad) + ',' + r2(y0)
                             + ' L' + r2(x1 - rad) + ',' + r2(y0) + ' A' + r2(rad) + ',' + r2(rad) + ' 0 0 1 ' + r2(x1) + ',' + r2(y0 + rad)
                             + ' L' + r2(x1) + ',' + r2(y1 - rad) + ' A' + r2(rad) + ',' + r2(rad) + ' 0 0 1 ' + r2(x1 - rad) + ',' + r2(y1)
                             + ' L' + r2(x0 + rad) + ',' + r2(y1) + ' A' + r2(rad) + ',' + r2(rad) + ' 0 0 1 ' + r2(x0) + ',' + r2(y1 - rad)
                             + ' L' + r2(x0) + ',' + r2(y0 + rad) + ' A' + r2(rad) + ',' + r2(rad) + ' 0 0 1 ' + r2(x0 + rad) + ',' + r2(y0) + ' Z';
                    }

                    // Arrow: tail → tip along the direction, optionally curved, then the head
                    var vectors = {
                        right: [1, 0], left: [-1, 0], up: [0, -1], down: [0, 1],
                        upRight: [1, -1], upLeft: [-1, -1], downRight: [1, 1], downLeft: [-1, 1]
                    };
                    var v   = vectors[attrs.direction] || vectors.right,
                        pad = Math.max(m, sw),
                        cx2 = w / 2, cy2 = h / 2,
                        tail = [cx2 - v[0] * (w / 2 - pad), cy2 - v[1] * (h / 2 - pad)],
                        tip  = [cx2 + v[0] * (w / 2 - pad), cy2 + v[1] * (h / 2 - pad)];

                    if (v[0] === 0) { tail[0] = tip[0] = cx2; }
                    if (v[1] === 0) { tail[1] = tip[1] = cy2; }

                    var dx = tip[0] - tail[0], dy = tip[1] - tail[1],
                        len = Math.sqrt(dx * dx + dy * dy) || 1,
                        nx = -dy / len, ny = dx / len,   // perpendicular
                        curve = attrs.curve || 'straight',
                        d, endDir;

                    if (curve === 'curved') {
                        var c = [tail[0] + dx / 2 + nx * len * 0.22, tail[1] + dy / 2 + ny * len * 0.22];
                        d = 'M' + r2(tail[0]) + ',' + r2(tail[1]) + ' Q' + r2(c[0]) + ',' + r2(c[1]) + ' ' + r2(tip[0]) + ',' + r2(tip[1]);
                        endDir = [tip[0] - c[0], tip[1] - c[1]];
                    } else if (curve === 'swoop') {
                        var c1 = [tail[0] + dx * 0.15 + nx * len * 0.5, tail[1] + dy * 0.15 + ny * len * 0.5],
                            c2 = [tail[0] + dx * 0.7 + nx * len * 0.42, tail[1] + dy * 0.7 + ny * len * 0.42];
                        d = 'M' + r2(tail[0]) + ',' + r2(tail[1]) + ' C' + r2(c1[0]) + ',' + r2(c1[1]) + ' ' + r2(c2[0]) + ',' + r2(c2[1]) + ' ' + r2(tip[0]) + ',' + r2(tip[1]);
                        endDir = [tip[0] - c2[0], tip[1] - c2[1]];
                    } else {
                        d = 'M' + r2(tail[0]) + ',' + r2(tail[1]) + ' L' + r2(tip[0]) + ',' + r2(tip[1]);
                        endDir = [dx, dy];
                    }

                    var el = Math.sqrt(endDir[0] * endDir[0] + endDir[1] * endDir[1]) || 1,
                        ux = endDir[0] / el, uy = endDir[1] / el,
                        head = Math.max(sw * 2.5, Math.min(len * 0.35, Math.min(w, h) * 0.45)),
                        spread = 0.5,   // ~27° each side
                        b1 = [tip[0] - head * (ux * Math.cos(spread) - uy * Math.sin(spread)), tip[1] - head * (uy * Math.cos(spread) + ux * Math.sin(spread))],
                        b2 = [tip[0] - head * (ux * Math.cos(spread) + uy * Math.sin(spread)), tip[1] - head * (uy * Math.cos(spread) - ux * Math.sin(spread))];

                    return d + ' L' + r2(b1[0]) + ',' + r2(b1[1]) + ' M' + r2(tip[0]) + ',' + r2(tip[1]) + ' L' + r2(b2[0]) + ',' + r2(b2[1]);

                },

                /**
                 * The stroke elements a Draw entrance / exit animates.
                 *
                 * @method getStrokeTargets
                 * @param {HTMLElement} resourceDetail
                 * @return {Array}
                 */
                getStrokeTargets: function(resourceDetail) {

                    return Array.prototype.slice.call(resourceDetail.querySelectorAll('.hotspot-stroke'));

                },

                /**
                 * Several modules need me to render a thumb of myself.
                 *
                 * These thumbs have a special structure of HTMLElements, where several data-attributes carry the information needed.
                 *
                 * @method renderThumb
                 * @return thumbElement
                 */
                renderThumb: function() {

                    var self = this;

                    var tagList = (this.resourceData.tags ? this.resourceData.tags.join(' ') : '');

                    var _tew = document.createElement('div');
                    _tew.innerHTML = '<div class="resourceThumb '+ tagList +'" data-license-type="'+ this.resourceData.licenseType +'" data-type="'+ this.resourceData.type +'">'
                        + '                  <div class="resourceOverlay">'
                        + '                      <div class="resourceIcon"><span class="icon-link"></span></div>'
                        + '                  </div>'
                        + '                  <div class="resourceTitle">Hotspot / Link</div>'
                        + '              </div>';
                    var thumbElement = _tew.firstElementChild;

                    var previewButton = document.createElement('div');
                    previewButton.className = 'resourcePreviewButton';
                    previewButton.innerHTML = '<span class="icon-eye"></span>';
                    previewButton.addEventListener('click', function(evt) {
                        // call the openPreview method (defined in abstract type: Resource)
                        self.openPreview( this.parentElement );
                        evt.stopPropagation();
                        evt.preventDefault();
                    });
                    thumbElement.appendChild(previewButton);

                    return thumbElement;

                },


                /**
                 * See {{#crossLink "Resource/renderBasicPropertiesControls:method"}}Resource/renderBasicPropertiesControls(){{/crossLink}}
                 * @method renderPropertiesControls
                 * @param {Overlay} overlay
                 * @return &#123; controlsContainer: HTMLElement, changeStart: Function, changeEnd: Function, changeDimensions: Function &#125;
                 */
                renderPropertiesControls: function(overlay) {

                    var basicControls = this.renderBasicPropertiesControls(overlay);

                    basicControls.controlsContainer.querySelector('#OverlayOptions').prepend(this.renderHotspotEditor(overlay));


                    return basicControls;

                },


                /**
                 * See {{#crossLink "Resource/renderBasicTimeControls:method"}}Resource/renderBasicTimeControls(){{/crossLink}}
                 * @method renderTimeControls
                 * @param {Annotation} annotation
                 * @return &#123; controlsContainer: HTMLElement, changeStart: Function, changeEnd: Function &#125;
                 */
                renderTimeControls: function(annotation) {

                    var timeControls = this.renderBasicTimeControls(annotation);

                    timeControls.controlsContainer.querySelector('#AnnotationOptions').append(this.renderHotspotEditor(annotation));

                    return timeControls;

                },


                /**
                 * I render an editor for hotspot properties (color, link URL)
                 * @method renderHotspotEditor
                 * @param {Object} overlayOrAnnotation
                 * @return &#123; hotspotEditorContainer: HTMLElement;
                 */
                renderHotspotEditor: function(overlayOrAnnotation) {

                    var self = this;
                    var currentAttributes = overlayOrAnnotation.data.attributes || {};

                    if (!currentAttributes.color) {
                        currentAttributes.color = '#0096ff';
                    }
                    if (!currentAttributes.linkUrl) {
                        currentAttributes.linkUrl = '';
                    }
                    if (currentAttributes.borderWidth === undefined) {
                        currentAttributes.borderWidth = 5;
                    }
                    if (!currentAttributes.shape) {
                        currentAttributes.shape = 'circle';
                    }
                    if (currentAttributes.borderRadius === undefined) {
                        currentAttributes.borderRadius = 10;
                    }
                    if (currentAttributes.text === undefined) {
                        currentAttributes.text = '';
                    }
                    if (!currentAttributes.textColor) {
                        currentAttributes.textColor = '#ffffff';
                    }
                    if (currentAttributes.backgroundColor === undefined) {
                        currentAttributes.backgroundColor = '';
                    }

                    var hotspotEditorContainer = document.createElement('div');
                    hotspotEditorContainer.className = 'hotspotEditorContainer';

                    // Helper to sync editor UI controls from current data attributes
                    var syncHotspotUI = function(a) {
                        var c = document.querySelector('.hotspotEditorContainer');
                        if (!c) return;
                        c.querySelector('.hotspotPropShape').value = a.shape || 'circle';
                        c.querySelector('.hotspotPropColor').value = a.color || '#0096ff';
                        c.querySelector('.hotspotPropBorderWidth').value = a.borderWidth !== undefined ? a.borderWidth : 5;
                        c.querySelector('.hotspotPropBorderRadius').value = a.borderRadius !== undefined ? a.borderRadius : 10;
                    };

                    // Helper function to convert hex color to rgba
                    var hexToRgba = function(hex, alpha) {
                        var r = parseInt(hex.slice(1, 3), 16);
                        var g = parseInt(hex.slice(3, 5), 16);
                        var b = parseInt(hex.slice(5, 7), 16);
                        return 'rgba(' + r + ', ' + g + ', ' + b + ', ' + alpha + ')';
                    };

                    // Create layout row container for all columns
                    var layoutRow = document.createElement('div');
                    layoutRow.className = 'layoutRow';
                    
                    // Shape and Color columns
                    var shapeColumn = document.createElement('div');
                    shapeColumn.className = 'column-3';
                    var colorColumn = document.createElement('div');
                    colorColumn.className = 'column-3';

                    // Hotspots drawn as SVG (new shapes, Draw animations) are re-rendered
                    // instead of having their CSS border patched.
                    var rerenderHotspot = function(target) {
                        if (target.rerenderContent) {
                            target.rerenderContent();
                            FrameTrail.module('HypervideoModel').newUnsavedChange('overlays');
                        } else {
                            (target.contentViewDetailElements || []).forEach(function(el) {
                                var oldDetail = el.querySelector('.resourceDetail');
                                if (oldDetail) {
                                    if (oldDetail._ftCleanup) { oldDetail._ftCleanup(); }
                                    oldDetail.replaceWith(target.resourceItem.renderContent());
                                }
                            });
                            FrameTrail.module('HypervideoModel').newUnsavedChange('annotations');
                        }
                    };
                    var isSvgRendered = function(target) {
                        var root = target.overlayElement || ((target.contentViewDetailElements || [])[0]);
                        return self.usesSvg(target.data.attributes) || !!(root && root.querySelector && root.querySelector('.hotspot-svg'));
                    };

                    // Helper function to apply shape, border-radius, and border-width changes
                    var applyShapeChanges = function(overlayOrAnnotation, shape, borderRadius, borderWidth, color) {
                        if (isSvgRendered(overlayOrAnnotation)) {
                            rerenderHotspot(overlayOrAnnotation);
                            return;
                        }
                        var bg = overlayOrAnnotation.data.attributes.backgroundColor || '';
                        var borderRadiusValue;
                        if (shape === 'circle') {
                            borderRadiusValue = '50%';
                        } else if (shape === 'rectangle') {
                            borderRadiusValue = '0';
                        } else { // rounded
                            borderRadiusValue = borderRadius + 'px';
                        }
                        
                        // Calculate border width as percentage
                        // Note: CSS doesn't support percentage borders directly, so we'll calculate it
                        // based on the element's size using JavaScript
                        var borderWidthValue = borderWidth > 0 ? borderWidth + '%' : '0';
                        var hoverColor = borderWidth > 0 ? hexToRgba(color, 0.3) : 'transparent';
                        
                        // Helper to calculate actual border width in pixels
                        var calculateBorderWidth = function(element, percentage) {
                            if (percentage <= 0) return 0;
                            var width = element.offsetWidth;
                            var height = element.offsetHeight;
                            var smaller = Math.min(width, height);
                            return (smaller * percentage) / 100;
                        };
                        
                        if (overlayOrAnnotation.overlayElement) {
                            var hotspotElement = overlayOrAnnotation.overlayElement.querySelector('.hotspot-element');
                            var hotspotPulse = overlayOrAnnotation.overlayElement.querySelector('.hotspot-pulse');
                            
                            // Calculate actual border width in pixels
                            var actualBorderWidth = calculateBorderWidth(hotspotElement, borderWidth);
                            
                            hotspotElement.style.borderRadius = borderRadiusValue;
                            hotspotElement.style.borderWidth = actualBorderWidth + 'px';
                            hotspotElement.style.borderColor = color;
                            hotspotElement.style.backgroundColor = bg || 'transparent';
                            hotspotPulse.style.borderRadius = borderRadiusValue;
                            hotspotPulse.style.borderColor = color;
                            hotspotPulse.style.display = bg ? 'none' : '';

                            // Update hover handlers (a solid fill overrides the marker hover)
                            if (hotspotElement._enterFn) { hotspotElement.removeEventListener('mouseenter', hotspotElement._enterFn); hotspotElement._enterFn = null; }
                            if (hotspotElement._leaveFn) { hotspotElement.removeEventListener('mouseleave', hotspotElement._leaveFn); hotspotElement._leaveFn = null; }
                            if (borderWidth > 0 && !bg) {
                                hotspotElement._enterFn = function() { this.style.backgroundColor = hoverColor; };
                                hotspotElement._leaveFn = function() { this.style.backgroundColor = 'transparent'; };
                                hotspotElement.addEventListener('mouseenter', hotspotElement._enterFn);
                                hotspotElement.addEventListener('mouseleave', hotspotElement._leaveFn);
                            }

                            FrameTrail.module('HypervideoModel').newUnsavedChange('overlays');
                        } else {
                            // Update annotation elements in dom
                            overlayOrAnnotation.contentViewDetailElements.forEach(function(el) {
                                var hotspotElement = el.querySelector('.hotspot-element');
                                var hotspotPulse = el.querySelector('.hotspot-pulse');
                                
                                // Calculate actual border width in pixels
                                var actualBorderWidth = calculateBorderWidth(hotspotElement, borderWidth);
                                
                                hotspotElement.style.borderRadius = borderRadiusValue;
                                hotspotElement.style.borderWidth = actualBorderWidth + 'px';
                                hotspotElement.style.borderColor = color;
                                hotspotElement.style.backgroundColor = bg || 'transparent';
                                hotspotPulse.style.borderRadius = borderRadiusValue;
                                hotspotPulse.style.borderColor = color;
                                hotspotPulse.style.display = bg ? 'none' : '';

                                if (hotspotElement._enterFn) { hotspotElement.removeEventListener('mouseenter', hotspotElement._enterFn); hotspotElement._enterFn = null; }
                                if (hotspotElement._leaveFn) { hotspotElement.removeEventListener('mouseleave', hotspotElement._leaveFn); hotspotElement._leaveFn = null; }
                                if (borderWidth > 0 && !bg) {
                                    hotspotElement._enterFn = function() { this.style.backgroundColor = hoverColor; };
                                    hotspotElement._leaveFn = function() { this.style.backgroundColor = 'transparent'; };
                                    hotspotElement.addEventListener('mouseenter', hotspotElement._enterFn);
                                    hotspotElement.addEventListener('mouseleave', hotspotElement._leaveFn);
                                }
                            });
                            FrameTrail.module('HypervideoModel').newUnsavedChange('annotations');
                        }
                    };

                    // Shape selector column
                    shapeColumn.insertAdjacentHTML('beforeend', '<label>'+ this.labels['SettingsHotspotShape'] +'</label>');
                    var shapeSelect = document.createElement('select');
                    shapeSelect.className = 'hotspotPropShape';
                    shapeSelect.insertAdjacentHTML('beforeend', '<option value="circle"' + (currentAttributes.shape === 'circle' ? ' selected' : '') + '>'+ this.labels['SettingsHotspotShapeCircle'] +'</option>');
                    shapeSelect.insertAdjacentHTML('beforeend', '<option value="rectangle"' + (currentAttributes.shape === 'rectangle' ? ' selected' : '') + '>'+ this.labels['SettingsHotspotShapeRectangle'] +'</option>');
                    shapeSelect.insertAdjacentHTML('beforeend', '<option value="rounded"' + (currentAttributes.shape === 'rounded' ? ' selected' : '') + '>'+ this.labels['SettingsHotspotShapeRounded'] +'</option>');
                    shapeSelect.insertAdjacentHTML('beforeend', '<option value="arrow"' + (currentAttributes.shape === 'arrow' ? ' selected' : '') + '>'+ this.labels['SettingsHotspotShapeArrow'] +'</option>');
                    shapeSelect.insertAdjacentHTML('beforeend', '<option value="underline"' + (currentAttributes.shape === 'underline' ? ' selected' : '') + '>'+ this.labels['SettingsHotspotShapeUnderline'] +'</option>');
                    shapeSelect.insertAdjacentHTML('beforeend', '<option value="freeform"' + (currentAttributes.shape === 'freeform' ? ' selected' : '') + '>'+ this.labels['SettingsHotspotShapeFreeform'] +'</option>');
                    
                    var shapeBeforeChange = currentAttributes.shape || 'circle';
                    shapeSelect.addEventListener('focus', function() {
                        shapeBeforeChange = overlayOrAnnotation.data.attributes.shape || 'circle';
                    });
                    
                    shapeSelect.addEventListener('change', function() {
                        var newShape = this.value;
                        var oldShape = shapeBeforeChange;
                        overlayOrAnnotation.data.attributes.shape = newShape;
                        
                        // Show/hide border radius column based on shape
                        if (newShape === 'rounded') {
                            borderRadiusColumn.style.display = '';
                        } else {
                            borderRadiusColumn.style.display = 'none';
                        }
                        syncShapeRows(newShape);
                        
                        // Apply shape changes
                        var borderWidth = overlayOrAnnotation.data.attributes.borderWidth || 5;
                        var color = overlayOrAnnotation.data.attributes.color || '#0096ff';
                        applyShapeChanges(overlayOrAnnotation, newShape, overlayOrAnnotation.data.attributes.borderRadius, borderWidth, color);
                        
                        // Register undo for shape change
                        if (oldShape !== newShape) {
                            var isOverlay = !!overlayOrAnnotation.overlayElement;
                            var category = isOverlay ? 'overlays' : 'annotations';
                            var elementId = overlayOrAnnotation.data.created;
                            
                            (function(id, oldS, newS, cat, labels, applyFn) {
                                var findElement = function() {
                                    var arr = cat === 'overlays' ? 
                                        FrameTrail.module('HypervideoModel').overlays : 
                                        FrameTrail.module('HypervideoModel').annotations;
                                    for (var i = 0; i < arr.length; i++) {
                                        if (arr[i].data.created === id) {
                                            return arr[i];
                                        }
                                    }
                                    return null;
                                };
                                FrameTrail.module('UndoManager').register({
                                    category: cat,
                                    description: (cat === 'overlays' ? labels['SidebarOverlays'] : labels['SidebarMyAnnotations']) + ' Shape',
                                    undo: function() {
                                        var el = findElement();
                                        if (!el) return;
                                        el.data.attributes.shape = oldS;
                                        var bw = el.data.attributes.borderWidth || 5;
                                        var c = el.data.attributes.color || '#0096ff';
                                        var br = el.data.attributes.borderRadius || 10;
                                        applyFn(el, oldS, br, bw, c);
                                        syncHotspotUI(el.data.attributes);
                                        FrameTrail.module('HypervideoModel').newUnsavedChange(cat);
                                    },
                                    redo: function() {
                                        var el = findElement();
                                        if (!el) return;
                                        el.data.attributes.shape = newS;
                                        var bw = el.data.attributes.borderWidth || 5;
                                        var c = el.data.attributes.color || '#0096ff';
                                        var br = el.data.attributes.borderRadius || 10;
                                        applyFn(el, newS, br, bw, c);
                                        syncHotspotUI(el.data.attributes);
                                        FrameTrail.module('HypervideoModel').newUnsavedChange(cat);
                                    }
                                });
                            })(elementId, oldShape, newShape, category, self.labels, applyShapeChanges);
                        }
                        shapeBeforeChange = newShape;
                    });
                    
                    var shapeWrapper = document.createElement('div');
                    shapeWrapper.className = 'custom-select';
                    shapeWrapper.appendChild(shapeSelect);
                    shapeColumn.appendChild(shapeWrapper);

                    // Color picker column
                    colorColumn.insertAdjacentHTML('beforeend', '<label>'+ this.labels['SettingsHotspotColor'] +'</label>');
                    var colorInput = document.createElement('input');
                    colorInput.type = 'color';
                    colorInput.className = 'hotspotPropColor';
                    colorInput.value = currentAttributes.color;

                    // Helper function to update color visually
                    var updateColor = function(newColor, trackChange) {
                        overlayOrAnnotation.data.attributes.color = newColor;

                        if (isSvgRendered(overlayOrAnnotation)) {
                            var strokeRoots = overlayOrAnnotation.overlayElement
                                ? [overlayOrAnnotation.overlayElement]
                                : (overlayOrAnnotation.contentViewDetailElements || []);
                            strokeRoots.forEach(function(el) {
                                el.querySelectorAll('.hotspot-stroke').forEach(function(path) { path.setAttribute('stroke', newColor); });
                                var pulse = el.querySelector('.hotspot-pulse');
                                if (pulse) { pulse.style.borderColor = newColor; }
                            });
                            if (trackChange) {
                                FrameTrail.module('HypervideoModel').newUnsavedChange(overlayOrAnnotation.overlayElement ? 'overlays' : 'annotations');
                            }
                            return;
                        }

                        if (overlayOrAnnotation.overlayElement) {
                            var hotspotElement = overlayOrAnnotation.overlayElement.querySelector('.hotspot-element');
                            var hotspotPulse = overlayOrAnnotation.overlayElement.querySelector('.hotspot-pulse');
                            hotspotElement.style.borderColor = newColor;
                            hotspotPulse.style.borderColor = newColor;
                            
                            // Update hover color if border width > 0 (skip when a solid fill is set)
                            var borderWidth = overlayOrAnnotation.data.attributes.borderWidth || 5;
                            if (borderWidth > 0 && !overlayOrAnnotation.data.attributes.backgroundColor) {
                                var hoverColor = hexToRgba(newColor, 0.3);
                                if (hotspotElement._enterFn) { hotspotElement.removeEventListener('mouseenter', hotspotElement._enterFn); hotspotElement._enterFn = null; }
                                if (hotspotElement._leaveFn) { hotspotElement.removeEventListener('mouseleave', hotspotElement._leaveFn); hotspotElement._leaveFn = null; }
                                hotspotElement._enterFn = function() { this.style.backgroundColor = hoverColor; };
                                hotspotElement._leaveFn = function() { this.style.backgroundColor = 'transparent'; };
                                hotspotElement.addEventListener('mouseenter', hotspotElement._enterFn);
                                hotspotElement.addEventListener('mouseleave', hotspotElement._leaveFn);
                            }

                            if (trackChange) {
                                FrameTrail.module('HypervideoModel').newUnsavedChange('overlays');
                            }
                        } else {
                            // Update annotation elements in dom
                            overlayOrAnnotation.contentViewDetailElements.forEach(function(el) {
                                var hotspotElement = el.querySelector('.hotspot-element');
                                var hotspotPulse = el.querySelector('.hotspot-pulse');
                                hotspotElement.style.borderColor = newColor;
                                hotspotPulse.style.borderColor = newColor;
                                
                                // Update hover color if border width > 0 (skip when a solid fill is set)
                                var borderWidth = overlayOrAnnotation.data.attributes.borderWidth || 5;
                                if (borderWidth > 0 && !overlayOrAnnotation.data.attributes.backgroundColor) {
                                    var hoverColor = hexToRgba(newColor, 0.3);
                                    if (hotspotElement._enterFn) { hotspotElement.removeEventListener('mouseenter', hotspotElement._enterFn); hotspotElement._enterFn = null; }
                                    if (hotspotElement._leaveFn) { hotspotElement.removeEventListener('mouseleave', hotspotElement._leaveFn); hotspotElement._leaveFn = null; }
                                    hotspotElement._enterFn = function() { this.style.backgroundColor = hoverColor; };
                                    hotspotElement._leaveFn = function() { this.style.backgroundColor = 'transparent'; };
                                    hotspotElement.addEventListener('mouseenter', hotspotElement._enterFn);
                                    hotspotElement.addEventListener('mouseleave', hotspotElement._leaveFn);
                                }
                            });
                            if (trackChange) {
                                FrameTrail.module('HypervideoModel').newUnsavedChange('annotations');
                            }
                        }
                    };

                    // Update color in real-time as user interacts with picker
                    var colorBeforeChange = currentAttributes.color || '#0096ff';
                    colorInput.addEventListener('focus', function() {
                        colorBeforeChange = overlayOrAnnotation.data.attributes.color || '#0096ff';
                    });
                    
                    colorInput.addEventListener('input', function() {
                        var newColor = this.value;
                        updateColor(newColor, false);
                    });

                    // Track change when picker is closed
                    colorInput.addEventListener('change', function() {
                        var newColor = this.value;
                        updateColor(newColor, true);
                        
                        // Register undo for color change
                        if (colorBeforeChange !== newColor) {
                            var isOverlay = !!overlayOrAnnotation.overlayElement;
                            var category = isOverlay ? 'overlays' : 'annotations';
                            var elementId = overlayOrAnnotation.data.created;
                            
                            (function(id, oldC, newC, cat, labels, applyFn) {
                                var findElement = function() {
                                    var arr = cat === 'overlays' ? 
                                        FrameTrail.module('HypervideoModel').overlays : 
                                        FrameTrail.module('HypervideoModel').annotations;
                                    for (var i = 0; i < arr.length; i++) {
                                        if (arr[i].data.created === id) {
                                            return arr[i];
                                        }
                                    }
                                    return null;
                                };
                                FrameTrail.module('UndoManager').register({
                                    category: cat,
                                    description: (cat === 'overlays' ? labels['SidebarOverlays'] : labels['SidebarMyAnnotations']) + ' Color',
                                    undo: function() {
                                        var el = findElement();
                                        if (!el) return;
                                        el.data.attributes.color = oldC;
                                        var shape = el.data.attributes.shape || 'circle';
                                        var bw = el.data.attributes.borderWidth || 5;
                                        var br = el.data.attributes.borderRadius || 10;
                                        applyFn(el, shape, br, bw, oldC);
                                        syncHotspotUI(el.data.attributes);
                                        FrameTrail.module('HypervideoModel').newUnsavedChange(cat);
                                    },
                                    redo: function() {
                                        var el = findElement();
                                        if (!el) return;
                                        el.data.attributes.color = newC;
                                        var shape = el.data.attributes.shape || 'circle';
                                        var bw = el.data.attributes.borderWidth || 5;
                                        var br = el.data.attributes.borderRadius || 10;
                                        applyFn(el, shape, br, bw, newC);
                                        syncHotspotUI(el.data.attributes);
                                        FrameTrail.module('HypervideoModel').newUnsavedChange(cat);
                                    }
                                });
                            })(elementId, colorBeforeChange, newColor, category, self.labels, applyShapeChanges);
                        }
                        colorBeforeChange = newColor;
                    });

                    colorColumn.appendChild(colorInput);

                    // Border Width and Border Radius columns
                    var borderWidthColumn = document.createElement('div');
                    borderWidthColumn.className = 'column-3';
                    var borderRadiusColumn = document.createElement('div');
                    borderRadiusColumn.className = 'column-3';

                    // Border width control column
                    borderWidthColumn.insertAdjacentHTML('beforeend', '<label>'+ this.labels['SettingsHotspotBorderWidth'] +'</label>');
                    var borderWidthInput = document.createElement('input');
                    borderWidthInput.type = 'number';
                    borderWidthInput.className = 'hotspotPropBorderWidth';
                    borderWidthInput.min = '0'; borderWidthInput.max = '50'; borderWidthInput.step = '0.5';
                    borderWidthInput.value = currentAttributes.borderWidth;
                    var borderWidthLabel = document.createElement('span');
                    borderWidthLabel.textContent = '%';
                    var borderWidthWrapper = document.createElement('div');
                    borderWidthWrapper.className = 'innerSizeWrapper';
                    borderWidthWrapper.append(borderWidthInput, borderWidthLabel);

                    var borderWidthBeforeChange = currentAttributes.borderWidth;
                    borderWidthInput.addEventListener('focus', function() {
                        borderWidthBeforeChange = overlayOrAnnotation.data.attributes.borderWidth;
                    });
                    
                    borderWidthInput.addEventListener('change', function() {
                        var newWidth = parseFloat(this.value);
                        if (isNaN(newWidth) || newWidth < 0) newWidth = 0;
                        if (newWidth > 50) newWidth = 50;
                        this.value = newWidth;
                        var oldWidth = borderWidthBeforeChange;
                        overlayOrAnnotation.data.attributes.borderWidth = newWidth;
                        
                        var shape = overlayOrAnnotation.data.attributes.shape || 'circle';
                        var borderRadius = overlayOrAnnotation.data.attributes.borderRadius || 10;
                        var color = overlayOrAnnotation.data.attributes.color || '#0096ff';
                        
                        // Apply changes
                        applyShapeChanges(overlayOrAnnotation, shape, borderRadius, newWidth, color);
                        FrameTrail.module('HypervideoModel').newUnsavedChange(overlayOrAnnotation.overlayElement ? 'overlays' : 'annotations');
                        
                        // Register undo for border width change
                        if (oldWidth !== newWidth) {
                            var isOverlay = !!overlayOrAnnotation.overlayElement;
                            var category = isOverlay ? 'overlays' : 'annotations';
                            var elementId = overlayOrAnnotation.data.created;
                            
                            (function(id, oldW, newW, cat, labels, applyFn) {
                                var findElement = function() {
                                    var arr = cat === 'overlays' ? 
                                        FrameTrail.module('HypervideoModel').overlays : 
                                        FrameTrail.module('HypervideoModel').annotations;
                                    for (var i = 0; i < arr.length; i++) {
                                        if (arr[i].data.created === id) {
                                            return arr[i];
                                        }
                                    }
                                    return null;
                                };
                                FrameTrail.module('UndoManager').register({
                                    category: cat,
                                    description: (cat === 'overlays' ? labels['SidebarOverlays'] : labels['SidebarMyAnnotations']) + ' Border',
                                    undo: function() {
                                        var el = findElement();
                                        if (!el) return;
                                        el.data.attributes.borderWidth = oldW;
                                        var shape = el.data.attributes.shape || 'circle';
                                        var br = el.data.attributes.borderRadius || 10;
                                        var c = el.data.attributes.color || '#0096ff';
                                        applyFn(el, shape, br, oldW, c);
                                        syncHotspotUI(el.data.attributes);
                                        FrameTrail.module('HypervideoModel').newUnsavedChange(cat);
                                    },
                                    redo: function() {
                                        var el = findElement();
                                        if (!el) return;
                                        el.data.attributes.borderWidth = newW;
                                        var shape = el.data.attributes.shape || 'circle';
                                        var br = el.data.attributes.borderRadius || 10;
                                        var c = el.data.attributes.color || '#0096ff';
                                        applyFn(el, shape, br, newW, c);
                                        syncHotspotUI(el.data.attributes);
                                        FrameTrail.module('HypervideoModel').newUnsavedChange(cat);
                                    }
                                });
                            })(elementId, oldWidth, newWidth, category, self.labels, applyShapeChanges);
                        }
                        borderWidthBeforeChange = newWidth;
                    });

                    borderWidthColumn.appendChild(borderWidthWrapper);

                    // Border radius input column (only visible for rounded rectangles)
                    borderRadiusColumn.insertAdjacentHTML('beforeend', '<label>'+ this.labels['SettingsHotspotBorderRadius'] +'</label>');
                    var borderRadiusInput = document.createElement('input');
                    borderRadiusInput.type = 'number';
                    borderRadiusInput.className = 'hotspotPropBorderRadius';
                    borderRadiusInput.min = '0'; borderRadiusInput.max = '100'; borderRadiusInput.step = '1';
                    borderRadiusInput.value = currentAttributes.borderRadius;
                    var borderRadiusLabel = document.createElement('span');
                    borderRadiusLabel.textContent = 'px';
                    var borderRadiusWrapper = document.createElement('div');
                    borderRadiusWrapper.className = 'innerSizeWrapper';
                    borderRadiusWrapper.append(borderRadiusInput, borderRadiusLabel);
                    
                    // Hide border radius if shape is not rounded
                    if (currentAttributes.shape !== 'rounded') {
                        borderRadiusColumn.style.display = 'none';
                    }
                    
                    var borderRadiusBeforeChange = currentAttributes.borderRadius || 10;
                    borderRadiusInput.addEventListener('focus', function() {
                        borderRadiusBeforeChange = overlayOrAnnotation.data.attributes.borderRadius || 10;
                    });
                    
                    borderRadiusInput.addEventListener('change', function() {
                        var newRadius = parseFloat(this.value);
                        if (isNaN(newRadius) || newRadius < 0) newRadius = 0;
                        if (newRadius > 100) newRadius = 100;
                        this.value = newRadius;
                        var oldRadius = borderRadiusBeforeChange;
                        overlayOrAnnotation.data.attributes.borderRadius = newRadius;
                        
                        // Apply shape changes
                        var borderWidth = overlayOrAnnotation.data.attributes.borderWidth || 5;
                        var color = overlayOrAnnotation.data.attributes.color || '#0096ff';
                        applyShapeChanges(overlayOrAnnotation, overlayOrAnnotation.data.attributes.shape, newRadius, borderWidth, color);
                        
                        // Register undo for border radius change
                        if (oldRadius !== newRadius) {
                            var isOverlay = !!overlayOrAnnotation.overlayElement;
                            var category = isOverlay ? 'overlays' : 'annotations';
                            var elementId = overlayOrAnnotation.data.created;
                            
                            (function(id, oldR, newR, cat, labels, applyFn) {
                                var findElement = function() {
                                    var arr = cat === 'overlays' ? 
                                        FrameTrail.module('HypervideoModel').overlays : 
                                        FrameTrail.module('HypervideoModel').annotations;
                                    for (var i = 0; i < arr.length; i++) {
                                        if (arr[i].data.created === id) {
                                            return arr[i];
                                        }
                                    }
                                    return null;
                                };
                                FrameTrail.module('UndoManager').register({
                                    category: cat,
                                    description: (cat === 'overlays' ? labels['SidebarOverlays'] : labels['SidebarMyAnnotations']) + ' Border Radius',
                                    undo: function() {
                                        var el = findElement();
                                        if (!el) return;
                                        el.data.attributes.borderRadius = oldR;
                                        var shape = el.data.attributes.shape || 'circle';
                                        var bw = el.data.attributes.borderWidth || 5;
                                        var c = el.data.attributes.color || '#0096ff';
                                        applyFn(el, shape, oldR, bw, c);
                                        syncHotspotUI(el.data.attributes);
                                        FrameTrail.module('HypervideoModel').newUnsavedChange(cat);
                                    },
                                    redo: function() {
                                        var el = findElement();
                                        if (!el) return;
                                        el.data.attributes.borderRadius = newR;
                                        var shape = el.data.attributes.shape || 'circle';
                                        var bw = el.data.attributes.borderWidth || 5;
                                        var c = el.data.attributes.color || '#0096ff';
                                        applyFn(el, shape, newR, bw, c);
                                        syncHotspotUI(el.data.attributes);
                                        FrameTrail.module('HypervideoModel').newUnsavedChange(cat);
                                    }
                                });
                            })(elementId, oldRadius, newRadius, category, self.labels, applyShapeChanges);
                        }
                        borderRadiusBeforeChange = newRadius;
                    });

                    borderRadiusColumn.appendChild(borderRadiusWrapper);

                    // Append all columns to layoutRow, then layoutRow to container
                    layoutRow.append(shapeColumn, colorColumn, borderWidthColumn, borderRadiusColumn);
                    hotspotEditorContainer.appendChild(layoutRow);

                    // --- Shape specific settings: arrow direction / curve, freeform drawing ---
                    var directions = ['right', 'downRight', 'down', 'downLeft', 'left', 'upLeft', 'up', 'upRight'],
                        directionLabels = {
                            right: 'SettingsHotspotDirectionRight', downRight: 'SettingsHotspotDirectionDownRight',
                            down: 'SettingsHotspotDirectionDown', downLeft: 'SettingsHotspotDirectionDownLeft',
                            left: 'SettingsHotspotDirectionLeft', upLeft: 'SettingsHotspotDirectionUpLeft',
                            up: 'SettingsHotspotDirectionUp', upRight: 'SettingsHotspotDirectionUpRight'
                        },
                        curves = { straight: 'SettingsHotspotCurveStraight', curved: 'SettingsHotspotCurveCurved', swoop: 'SettingsHotspotCurveSwoop' };

                    var _shw = document.createElement('div');
                    _shw.innerHTML = '<div class="hotspotShapeSettings">'
                        + '<div class="layoutRow hotspotArrowRow">'
                        + '    <div class="column-6">'
                        + '        <label>' + this.labels['SettingsHotspotDirection'] + '</label>'
                        + '        <div class="custom-select"><select class="hotspotPropDirection">'
                        +              directions.map(function(d) { return '<option value="' + d + '"' + ((currentAttributes.direction || 'right') === d ? ' selected' : '') + '>' + self.labels[directionLabels[d]] + '</option>'; }).join('')
                        + '        </select></div>'
                        + '    </div>'
                        + '    <div class="column-6">'
                        + '        <label>' + this.labels['SettingsHotspotCurve'] + '</label>'
                        + '        <div class="custom-select"><select class="hotspotPropCurve">'
                        +              Object.keys(curves).map(function(c) { return '<option value="' + c + '"' + ((currentAttributes.curve || 'straight') === c ? ' selected' : '') + '>' + self.labels[curves[c]] + '</option>'; }).join('')
                        + '        </select></div>'
                        + '    </div>'
                        + '</div>'
                        + '<div class="layoutRow hotspotFreeformRow">'
                        + '    <div class="column-12">'
                        + '        <button type="button" class="hotspotDrawShape"><span class="icon-pencil"></span> ' + this.labels['SettingsHotspotDrawShape'] + '</button>'
                        + '        <div class="fieldHint">' + this.labels['MessageHotspotFreeformEdit'] + '</div>'
                        + '    </div>'
                        + '</div>'
                        + '</div>';
                    var shapeSettings = _shw.firstElementChild;
                    hotspotEditorContainer.appendChild(shapeSettings);

                    // The outline is drawn and edited on the video (overlays only)
                    shapeSettings.querySelector('.hotspotDrawShape').addEventListener('click', function(evt) {
                        evt.preventDefault();
                        var FreeformShapeEditor = FrameTrail.module('FreeformShapeEditor');
                        if (FreeformShapeEditor && overlayOrAnnotation.overlayElement) {
                            FreeformShapeEditor.startDrawing(overlayOrAnnotation);
                        }
                    });

                    var syncShapeRows = function(shapeValue) {
                        shapeSettings.querySelector('.hotspotArrowRow').style.display    = (shapeValue === 'arrow') ? '' : 'none';
                        shapeSettings.querySelector('.hotspotFreeformRow').style.display = (shapeValue === 'freeform' && overlayOrAnnotation.overlayElement) ? '' : 'none';
                    };
                    syncShapeRows(currentAttributes.shape);

                    // Undo for the shape settings (attributes snapshot + re-render)
                    var shapeSettingUndo = function(key, oldValue, newValue) {
                        var cat = overlayOrAnnotation.overlayElement ? 'overlays' : 'annotations',
                            elementId = overlayOrAnnotation.data.created;
                        var findElement = function() {
                            var arr = cat === 'overlays' ? FrameTrail.module('HypervideoModel').overlays : FrameTrail.module('HypervideoModel').annotations;
                            for (var i = 0; i < arr.length; i++) {
                                if (arr[i].data.created === elementId) { return arr[i]; }
                            }
                            return null;
                        };
                        var applyValue = function(value) {
                            var target = findElement();
                            if (!target) { return; }
                            target.data.attributes[key] = value;
                            rerenderHotspot(target);
                            var select = document.querySelector('.hotspotEditorContainer .hotspotProp' + key.charAt(0).toUpperCase() + key.slice(1));
                            if (select) { select.value = value; }
                        };
                        FrameTrail.module('UndoManager').register({
                            category: cat,
                            description: (cat === 'overlays' ? self.labels['SidebarOverlays'] : self.labels['SidebarMyAnnotations']) + ' ' + self.labels['SettingsHotspotShape'],
                            undo: function() { applyValue(oldValue); },
                            redo: function() { applyValue(newValue); }
                        });
                    };

                    ['direction', 'curve'].forEach(function(key) {
                        var control = shapeSettings.querySelector('.hotspotProp' + key.charAt(0).toUpperCase() + key.slice(1)),
                            valueBefore = null;
                        control.addEventListener('focus', function() {
                            valueBefore = overlayOrAnnotation.data.attributes[key];
                        });
                        control.addEventListener('change', function() {
                            var value = this.value.trim();
                            var oldValue = (valueBefore !== null) ? valueBefore : overlayOrAnnotation.data.attributes[key];
                            overlayOrAnnotation.data.attributes[key] = value;
                            rerenderHotspot(overlayOrAnnotation);
                            if (oldValue !== value) {
                                shapeSettingUndo(key, oldValue, value);
                            }
                            valueBefore = value;
                        });
                    });

                    // --- Optional text / text color / background color ---
                    hotspotEditorContainer.insertAdjacentHTML('beforeend', '<hr>');

                    // Checkerboard fill used to signal a transparent background (both on the
                    // "make transparent" reset button and behind the faded color picker).
                    var checkerboard = 'background-image:'
                        + 'linear-gradient(45deg,#bbb 25%,transparent 25%),'
                        + 'linear-gradient(-45deg,#bbb 25%,transparent 25%),'
                        + 'linear-gradient(45deg,transparent 75%,#bbb 75%),'
                        + 'linear-gradient(-45deg,transparent 75%,#bbb 75%);'
                        + 'background-size:8px 8px;background-position:0 0,0 4px,4px -4px,-4px 0;background-color:#fff;';

                    var _txw = document.createElement('div');
                    _txw.innerHTML = '<div class="layoutRow">'
                        + '    <div class="column-6">'
                        + '        <label>'+ this.labels['SettingsHotspotText'] +'</label>'
                        + '        <input type="text" class="hotspotPropText">'
                        + '    </div>'
                        + '    <div class="column-3">'
                        + '        <label>'+ this.labels['SettingsHotspotTextColor'] +'</label>'
                        + '        <input type="color" class="hotspotPropTextColor" value="'+ (currentAttributes.textColor || '#ffffff') +'">'
                        + '    </div>'
                        + '    <div class="column-3">'
                        + '        <label>'+ this.labels['SettingsHotspotBackground'] +'</label>'
                        + '        <div class="innerSizeWrapper">'
                        + '            <span class="hotspotBgSwatchWrap" style="'+ checkerboard +' display:inline-flex; border-radius:3px; overflow:hidden; width: calc(100% - 50px);">'
                        + '                <input type="color" class="hotspotPropBackground" value="'+ (currentAttributes.backgroundColor || '#0096ff') +'">'
                        + '            </span>'
                        + '            <button type="button" class="hotspotBackgroundClear" title="'+ this.labels['GenericTransparent'] +'" style="'+ checkerboard +' width:26px; height:26px; padding:0; border:1px solid var(--primary-bg-color); border-radius:3px; cursor:pointer;"></button>'
                        + '        </div>'
                        + '    </div>'
                        + '</div>';
                    hotspotEditorContainer.appendChild(_txw.firstElementChild);

                    var textInput       = hotspotEditorContainer.querySelector('.hotspotPropText'),
                        textColorInput  = hotspotEditorContainer.querySelector('.hotspotPropTextColor'),
                        backgroundInput = hotspotEditorContainer.querySelector('.hotspotPropBackground'),
                        backgroundClear = hotspotEditorContainer.querySelector('.hotspotBackgroundClear');

                    // The color picker sits over a checkerboard; when no background is set we fade
                    // the picker so the checkerboard shows through (reads as "transparent").
                    var syncBackgroundSwatch = function() {
                        var bg = overlayOrAnnotation.data.attributes.backgroundColor;
                        backgroundInput.style.opacity = bg ? '1' : '0.25';
                        if (bg) { backgroundInput.value = bg; }
                    };

                    textInput.value = currentAttributes.text || '';
                    syncBackgroundSwatch();

                    // Apply the current text/textColor/backgroundColor to all rendered hotspot elements.
                    var applyTextStyles = function() {
                        var a = overlayOrAnnotation.data.attributes,
                            cat = overlayOrAnnotation.overlayElement ? 'overlays' : 'annotations',
                            els = overlayOrAnnotation.overlayElement
                                ? [overlayOrAnnotation.overlayElement]
                                : (overlayOrAnnotation.contentViewDetailElements || []);
                        els.forEach(function(el) {
                            var labelEl   = el.querySelector('.hotspot-label'),
                                hotspotEl = el.querySelector('.hotspot-element'),
                                pulseEl   = el.querySelector('.hotspot-pulse');
                            if (labelEl) {
                                labelEl.textContent = a.text || '';
                                labelEl.style.color = a.textColor || '#ffffff';
                            }
                            if (hotspotEl) {
                                hotspotEl.style.backgroundColor = a.backgroundColor || 'transparent';
                                // A solid fill overrides the marker hover behaviour.
                                if (a.backgroundColor) {
                                    if (hotspotEl._enterFn) { hotspotEl.removeEventListener('mouseenter', hotspotEl._enterFn); hotspotEl._enterFn = null; }
                                    if (hotspotEl._leaveFn) { hotspotEl.removeEventListener('mouseleave', hotspotEl._leaveFn); hotspotEl._leaveFn = null; }
                                }
                            }
                            if (pulseEl) {
                                pulseEl.style.display = a.backgroundColor ? 'none' : '';
                            }
                        });
                        FrameTrail.module('HypervideoModel').newUnsavedChange(cat);
                    };

                    // Snapshot/undo for the text controls.
                    var textSnapshot = function() {
                        var a = overlayOrAnnotation.data.attributes;
                        return { text: a.text, textColor: a.textColor, backgroundColor: a.backgroundColor };
                    };
                    var registerTextUndo = function(oldValues, newValues) {
                        var cat = overlayOrAnnotation.overlayElement ? 'overlays' : 'annotations',
                            elementId = overlayOrAnnotation.data.created;
                        (function(id, category, capturedOld, capturedNew, labels) {
                            var findElement = function() {
                                var arr = category === 'overlays'
                                    ? FrameTrail.module('HypervideoModel').overlays
                                    : FrameTrail.module('HypervideoModel').annotations;
                                for (var i = 0; i < arr.length; i++) {
                                    if (arr[i].data.created === id) return arr[i];
                                }
                                return null;
                            };
                            var applyValues = function(values) {
                                var el = findElement();
                                if (!el) return;
                                el.data.attributes.text = values.text;
                                el.data.attributes.textColor = values.textColor;
                                el.data.attributes.backgroundColor = values.backgroundColor;
                                applyTextStyles();
                                if (textInput.isConnected) {
                                    textInput.value = values.text || '';
                                    textColorInput.value = values.textColor || '#ffffff';
                                    if (values.backgroundColor) { backgroundInput.value = values.backgroundColor; }
                                    syncBackgroundSwatch();
                                }
                            };
                            FrameTrail.module('UndoManager').register({
                                category: category,
                                description: labels['SettingsHotspotText'],
                                undo: function() { applyValues(capturedOld); },
                                redo: function() { applyValues(capturedNew); }
                            });
                        })(elementId, cat, Object.assign({}, oldValues), Object.assign({}, newValues), self.labels);
                    };

                    var textBefore = null;
                    textInput.addEventListener('focus', function() { textBefore = textSnapshot(); });
                    textInput.addEventListener('input', function() {
                        overlayOrAnnotation.data.attributes.text = this.value;
                        applyTextStyles();
                    });
                    textInput.addEventListener('blur', function() {
                        if (textBefore && textBefore.text !== overlayOrAnnotation.data.attributes.text) {
                            registerTextUndo(textBefore, textSnapshot());
                        }
                        textBefore = null;
                    });

                    var textColorBefore = null;
                    textColorInput.addEventListener('focus', function() { textColorBefore = textSnapshot(); });
                    textColorInput.addEventListener('input', function() {
                        overlayOrAnnotation.data.attributes.textColor = this.value;
                        applyTextStyles();
                    });
                    textColorInput.addEventListener('change', function() {
                        if (textColorBefore && textColorBefore.textColor !== overlayOrAnnotation.data.attributes.textColor) {
                            registerTextUndo(textColorBefore, textSnapshot());
                        }
                        textColorBefore = textSnapshot();
                    });

                    var backgroundBefore = null;
                    backgroundInput.addEventListener('focus', function() { backgroundBefore = textSnapshot(); });
                    backgroundInput.addEventListener('input', function() {
                        overlayOrAnnotation.data.attributes.backgroundColor = this.value;
                        applyTextStyles();
                        syncBackgroundSwatch();
                    });
                    backgroundInput.addEventListener('change', function() {
                        if (backgroundBefore && backgroundBefore.backgroundColor !== overlayOrAnnotation.data.attributes.backgroundColor) {
                            registerTextUndo(backgroundBefore, textSnapshot());
                        }
                        backgroundBefore = textSnapshot();
                    });

                    backgroundClear.addEventListener('click', function(evt) {
                        evt.preventDefault();
                        evt.stopPropagation();
                        if (!overlayOrAnnotation.data.attributes.backgroundColor) { return; }
                        var before = textSnapshot();
                        overlayOrAnnotation.data.attributes.backgroundColor = '';
                        applyTextStyles();
                        syncBackgroundSwatch();
                        registerTextUndo(before, textSnapshot());
                    });

                    // --- Action (shared model: open URL / jump to time / jump to hypervideo) ---
                    hotspotEditorContainer.insertAdjacentHTML('beforeend', '<hr>');
                    hotspotEditorContainer.appendChild(this.renderActionControls(overlayOrAnnotation));

                    return hotspotEditorContainer;

                }



            }



        }
    }


);
