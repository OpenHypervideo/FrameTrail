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
                pauseByDefault: true,
                iconClass:      'icon-link',


                /**
                 * I say whether a hotspot has a click action: a declarative action
                 * (openUrl / jumpToTime / jumpToHypervideo), a legacy linkUrl, or a
                 * non-empty onClick event. onStart pause is not a click action.
                 *
                 * @method hasHotspotAction
                 * @param {Object} attrs
                 * @param {Object} [events]
                 * @return {Boolean}
                 */
                hasHotspotAction: function(attrs, events) {

                    attrs = attrs || {};
                    events = events || {};
                    var action = attrs.action;
                    if (action === 'openUrl' || action === 'jumpToTime' || action === 'jumpToHypervideo') {
                        return true;
                    }
                    if (attrs.linkUrl && String(attrs.linkUrl).trim()) {
                        return true;
                    }
                    if (events.onClick && String(events.onClick).trim()) {
                        return true;
                    }
                    return false;

                },


                /**
                 * I tell whether a shape is a line (arrow, underline): lines have no area, so
                 * no fill, no label and no pulse.
                 *
                 * @method isLineShape
                 * @param {String} shape
                 * @return {Boolean}
                 */
                isLineShape: function(shape) {

                    return shape === 'arrow' || shape === 'underline';

                },


                /**
                 * I tell whether a hotspot shows its pulse ring: attributes.pulse, or, where it is
                 * missing (hotspots made before the switch), unless the hotspot has a fill. Lines
                 * never pulse.
                 *
                 * @method hasPulse
                 * @param {Object} attrs
                 * @return {Boolean}
                 */
                hasPulse: function(attrs) {

                    attrs = attrs || {};
                    if (this.isLineShape(attrs.shape)) { return false; }
                    if (attrs.pulse !== undefined) { return !!attrs.pulse; }
                    return !attrs.backgroundColor;

                },


                /**
                 * I toggle .hasAction on the hotspot link and attach or remove the
                 * marker fill-on-hover listeners. Fill hover only applies when there
                 * is a click action, a visible outline, no solid fill, and the shape
                 * is not arrow/underline (lines have no area).
                 *
                 * @method syncHotspotHover
                 * @param {HTMLElement} hotspotElement
                 * @param {Object} attrs
                 * @param {Object} [events]
                 */
                syncHotspotHover: function(hotspotElement, attrs, events) {

                    if (!hotspotElement) { return; }
                    attrs = attrs || {};
                    events = events || {};

                    var hasAction = this.hasHotspotAction(attrs, events);
                    hotspotElement.classList.toggle('hasAction', hasAction);

                    if (hotspotElement._enterFn) {
                        hotspotElement.removeEventListener('mouseenter', hotspotElement._enterFn);
                        hotspotElement._enterFn = null;
                    }
                    if (hotspotElement._leaveFn) {
                        hotspotElement.removeEventListener('mouseleave', hotspotElement._leaveFn);
                        hotspotElement._leaveFn = null;
                    }

                    var shape = attrs.shape || 'circle',
                        lineShape = this.isLineShape(shape),
                        backgroundColor = attrs.backgroundColor || '',
                        outlineWidth = (attrs.borderWidth !== undefined) ? attrs.borderWidth : 5,
                        color = attrs.color || '#0096ff';

                    if (hasAction && outlineWidth > 0 && !backgroundColor && !lineShape) {
                        var r = parseInt(color.slice(1, 3), 16),
                            g = parseInt(color.slice(3, 5), 16),
                            b = parseInt(color.slice(5, 7), 16),
                            hoverColor = 'rgba(' + r + ', ' + g + ', ' + b + ', 0.3)';
                        hotspotElement._enterFn = function() { this.style.backgroundColor = hoverColor; };
                        hotspotElement._leaveFn = function() { this.style.backgroundColor = 'transparent'; };
                        hotspotElement.addEventListener('mouseenter', hotspotElement._enterFn);
                        hotspotElement.addEventListener('mouseleave', hotspotElement._leaveFn);
                    }

                },


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
                    // Lines (arrow, underline) have no area: no fill, no label
                    var lineShape = this.isLineShape(shape);
                    var text = (attrs.text && !lineShape) ? attrs.text : '';
                    var textColor = attrs.textColor ? attrs.textColor : '#ffffff';
                    var backgroundColor = (attrs.backgroundColor && !lineShape) ? attrs.backgroundColor : '';

                    // Calculate border-radius value based on shape (0% to 50%)
                    var borderRadiusValue;
                    if (shape === 'circle') {
                        borderRadiusValue = '50%';
                    } else if (shape === 'rectangle') {
                        borderRadiusValue = '0';
                    } else { // rounded
                        borderRadiusValue = borderRadius + 'px';
                    }

                    // Always use an <a> tag (even when empty, to avoid element replacement during editing)
                    var elementAttrs = ' href="' + (linkUrl || '#') + '"';
                    if (linkUrl && (linkUrl.startsWith('http://') || linkUrl.startsWith('https://'))) {
                        elementAttrs += ' target="_blank"';
                    }

                    // The pulse ring (hasPulse); freeform draws its own, following the outline
                    var pulseDisplay = (this.hasPulse(attrs) && shape !== 'freeform') ? '' : 'none';
                    var labelStyle = 'position:absolute; top:50%; left:50%; transform:translate(-50%,-50%); '
                                   + 'width:90%; text-align:center; pointer-events:none; overflow:hidden; '
                                   + 'text-overflow:ellipsis; color:' + textColor + ';';

                    // Arrow, underline and freeform shapes, and any shape whose outline
                    // draws itself (Draw entrance / exit), are rendered as an SVG stroke.
                    // All other hotspots keep the CSS border rendering.
                    var svgMode = this.usesSvg(attrs);

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

                    hotspotElement.style.borderWidth = (borderWidth > 0 ? borderWidth : 0) + 'px';
                    hotspotElement.style.backgroundColor = backgroundColor || 'transparent';
                    hotspotElement.style.borderStyle = 'solid';
                    hotspotElement.style.borderColor = color;
                    if (svgMode) {
                        hotspotElement.style.borderWidth = '0';
                        hotspotElement.style.boxShadow = 'none';
                    }

                    // Pointer + fill hover only when the hotspot has a click action
                    this.syncHotspotHover(hotspotElement, attrs, this.resourceData.events);
                    
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
                        strokeWidth = (attrs.borderWidth !== undefined) ? attrs.borderWidth : 5,
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
                                : (attrs.path || this.freeformPath(this.defaultFreeformPoints())),
                            // Expanding ripple that follows the outline (CSS .hotspot-pulse is a
                            // rectangle and stays hidden for freeform)
                            pulse = document.createElementNS(SVG_NS, 'path');

                        pulse.setAttribute('class', 'hotspot-svg-pulse');
                        pulse.setAttribute('fill', 'none');
                        pulse.setAttribute('stroke', color);
                        pulse.setAttribute('stroke-linecap', 'round');
                        pulse.setAttribute('stroke-linejoin', 'round');
                        if (!this.hasPulse(attrs)) {
                            pulse.style.display = 'none';
                        }
                        svg.insertBefore(pulse, stroke);

                        // The stroke is laid out in pixels (not a stretched 0–100 viewBox with a
                        // non-scaling stroke, where the dash of a Draw animation would not span
                        // the whole outline)
                        resourceDetail._ftFreeformPoints = this.freeformPoints(attrs);
                        resourceDetail._ftFreeformLegacyPath = this.validFreeformPoints(attrs.points) ? null : (attrs.path || null);
                        resourceDetail._ftFreeformLayout = function() {
                            var w = wrapper.offsetWidth, h = wrapper.offsetHeight;
                            if (!w || !h) { return; }
                            var legacy = resourceDetail._ftFreeformLegacyPath && hotspot.scalePathData(resourceDetail._ftFreeformLegacyPath, w / 100, h / 100),
                                sw = Math.max(0, strokeWidth),
                                d = legacy || hotspot.freeformPath(resourceDetail._ftFreeformPoints, w / 100, h / 100);
                            svg.setAttribute('viewBox', '0 0 ' + w + ' ' + h);
                            stroke.setAttribute('stroke-width', sw);
                            stroke.setAttribute('d', d);
                            pulse.setAttribute('stroke-width', sw);
                            pulse.setAttribute('d', d);
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
                        var sw = Math.max(0, strokeWidth);
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
                 * I render the editor of a hotspot: its shape and that shape's settings, its
                 * outline (a line for arrow and underline) and fill, the pulse, the label and the
                 * click action. Each change is one undo step, a snapshot of the attributes.
                 *
                 * @method renderHotspotEditor
                 * @param {Object} overlayOrAnnotation
                 * @return HTMLElement
                 */
                renderHotspotEditor: function(overlayOrAnnotation) {

                    var self      = this,
                        labels    = this.labels,
                        isOverlay = !!overlayOrAnnotation.overlayElement,
                        category  = isOverlay ? 'overlays' : 'annotations',
                        elementId = overlayOrAnnotation.data.created,
                        pulseId   = 'hotspotPulse-' + Math.random().toString(36).slice(2, 10),
                        pending   = null;

                    if (!overlayOrAnnotation.data.attributes) {
                        overlayOrAnnotation.data.attributes = {};
                    }

                    // Undo replaces the attributes object, so it is always read anew
                    var attrs = function() {
                        return overlayOrAnnotation.data.attributes;
                    };
                    var width = function() {
                        var value = attrs().borderWidth;
                        return (value !== undefined) ? value : 5;
                    };
                    var colorOf = function(value, fallback) {
                        return (/^#[0-9a-fA-F]{6}$/.test(value || '')) ? value : fallback;
                    };

                    var shapes = ['circle', 'rectangle', 'rounded', 'arrow', 'underline', 'freeform'],
                        shapeLabels = {
                            circle: 'SettingsHotspotShapeCircle', rectangle: 'SettingsHotspotShapeRectangle',
                            rounded: 'SettingsHotspotShapeRounded', arrow: 'SettingsHotspotShapeArrow',
                            underline: 'SettingsHotspotShapeUnderline', freeform: 'SettingsHotspotShapeFreeform'
                        },
                        directions = ['right', 'downRight', 'down', 'downLeft', 'left', 'upLeft', 'up', 'upRight'],
                        directionLabels = {
                            right: 'SettingsHotspotDirectionRight', downRight: 'SettingsHotspotDirectionDownRight',
                            down: 'SettingsHotspotDirectionDown', downLeft: 'SettingsHotspotDirectionDownLeft',
                            left: 'SettingsHotspotDirectionLeft', upLeft: 'SettingsHotspotDirectionUpLeft',
                            up: 'SettingsHotspotDirectionUp', upRight: 'SettingsHotspotDirectionUpRight'
                        },
                        curves = { straight: 'SettingsHotspotCurveStraight', curved: 'SettingsHotspotCurveCurved', swoop: 'SettingsHotspotCurveSwoop' };

                    var options = function(values, labelKeys) {
                        return values.map(function(value) {
                            return '<option value="' + value + '">' + labels[labelKeys[value]] + '</option>';
                        }).join('');
                    };

                    var container = document.createElement('div');
                    container.className = 'hotspotEditorContainer';
                    container.innerHTML = '<div class="layoutRow">'
                        + '    <div class="column-6">'
                        + '        <label>' + labels['SettingsHotspotShape'] + '</label>'
                        + '        <div class="custom-select"><select class="hotspotPropShape">' + options(shapes, shapeLabels) + '</select></div>'
                        + '    </div>'
                        + '    <div class="column-6 hotspotRadiusColumn">'
                        + '        <label>' + labels['SettingsShapeCornerRadius'] + '</label>'
                        + '        <input type="number" class="hotspotPropBorderRadius" min="0" max="100" step="1">'
                        + '    </div>'
                        + '</div>'
                        + '<div class="layoutRow hotspotArrowRow">'
                        + '    <div class="column-6">'
                        + '        <label>' + labels['SettingsHotspotDirection'] + '</label>'
                        + '        <div class="custom-select"><select class="hotspotPropDirection">' + options(directions, directionLabels) + '</select></div>'
                        + '    </div>'
                        + '    <div class="column-6">'
                        + '        <label>' + labels['SettingsHotspotCurve'] + '</label>'
                        + '        <div class="custom-select"><select class="hotspotPropCurve">' + options(Object.keys(curves), curves) + '</select></div>'
                        + '    </div>'
                        + '</div>'
                        + '<div class="layoutRow hotspotFreeformRow">'
                        + '    <div class="column-12">'
                        + '        <button type="button" class="hotspotDrawShape"><span class="icon-pencil"></span> ' + labels['SettingsHotspotDrawShape'] + '</button>'
                        + '        <div class="fieldHint">' + labels['MessageHotspotFreeformEdit'] + '</div>'
                        + '    </div>'
                        + '</div>'
                        + '<div class="layoutRow">'
                        + '    <div class="column-4 hotspotFillColumn"></div>'
                        + '    <div class="column-4 hotspotOutlineColumn"></div>'
                        + '    <div class="column-4">'
                        + '        <label>' + labels['SettingsShapeOutlineWidth'] + '</label>'
                        + '        <input type="number" class="hotspotPropBorderWidth" min="0" max="40" step="1">'
                        + '    </div>'
                        + '</div>'
                        + '<div class="layoutRow hotspotPulseRow">'
                        + '    <div class="column-12">'
                        + '        <div class="checkboxRow">'
                        + '            <label class="switch"><input id="' + pulseId + '" class="hotspotPropPulse" type="checkbox" autocomplete="off"><span class="slider round"></span></label>'
                        + '            <label for="' + pulseId + '">' + labels['SettingsHotspotPulse'] + '</label>'
                        + '        </div>'
                        + '    </div>'
                        + '</div>'
                        + '<div class="hotspotLabelSection">'
                        + '    <hr>'
                        + '    <div class="layoutRow">'
                        + '        <div class="column-8">'
                        + '            <label>' + labels['SettingsHotspotText'] + '</label>'
                        + '            <input type="text" class="hotspotPropText">'
                        + '        </div>'
                        + '        <div class="column-4">'
                        + '            <label>' + labels['SettingsShapeTextColor'] + '</label>'
                        + '            <input type="color" class="hotspotPropTextColor">'
                        + '        </div>'
                        + '    </div>'
                        + '</div>';

                    var q = function(selector) { return container.querySelector(selector); };

                    var shapeSelect     = q('.hotspotPropShape'),
                        radiusInput     = q('.hotspotPropBorderRadius'),
                        directionSelect = q('.hotspotPropDirection'),
                        curveSelect     = q('.hotspotPropCurve'),
                        widthInput      = q('.hotspotPropBorderWidth'),
                        pulseInput      = q('.hotspotPropPulse'),
                        textInput       = q('.hotspotPropText'),
                        textColorInput  = q('.hotspotPropTextColor'),
                        lastWidth       = (width() > 0) ? width() : 5;

                    // --- Undo: a change starts with begin() (the state before it) and ends with commit() ---

                    var snapshot = function() {
                        return JSON.parse(JSON.stringify(attrs()));
                    };

                    var begin = function() {
                        if (!pending) { pending = snapshot(); }
                    };

                    var findTarget = function() {
                        var items = FrameTrail.module('HypervideoModel')[category];
                        for (var i = 0; i < items.length; i++) {
                            if (items[i].data.created === elementId) { return items[i]; }
                        }
                        return null;
                    };

                    var commit = function(labelKey) {
                        var before = pending,
                            after  = snapshot(),
                            description = (isOverlay ? labels['SidebarOverlays'] : labels['SidebarMyAnnotations']) + ' ' + labels[labelKey];
                        pending = null;
                        if (!before || JSON.stringify(before) === JSON.stringify(after)) { return; }
                        FrameTrail.module('HypervideoModel').newUnsavedChange(category);
                        if (isOverlay) {
                            // Undo and redo render the panel anew
                            FrameTrail.module('OverlaysController').registerStateUndo(
                                overlayOrAnnotation, description, { attributes: before }, { attributes: after }, { rerender: true }
                            );
                            return;
                        }
                        var restore = function(values) {
                            var target = findTarget();
                            if (!target) { return; }
                            target.data.attributes = JSON.parse(JSON.stringify(values));
                            rerender(target);
                            if (target === overlayOrAnnotation && container.isConnected) { syncInputs(); }
                            FrameTrail.module('HypervideoModel').newUnsavedChange(category);
                        };
                        FrameTrail.module('UndoManager').register({
                            category: category,
                            description: description,
                            undo: function() { restore(before); },
                            redo: function() { restore(after); }
                        });
                    };

                    // --- Showing a change ---

                    // A change of the shape, its size or its parts renders the hotspot anew
                    var rerender = function(target) {
                        target = target || overlayOrAnnotation;
                        if (target.overlayElement) {
                            target.rerenderContent();
                            return;
                        }
                        (target.contentViewDetailElements || []).forEach(function(el) {
                            var oldDetail = el.querySelector('.resourceDetail');
                            if (oldDetail) {
                                if (oldDetail._ftCleanup) { oldDetail._ftCleanup(); }
                                oldDetail.replaceWith(target.resourceItem.renderContent());
                            }
                        });
                    };

                    // While a colour is chosen or the label typed, only colours and label change
                    var preview = function() {
                        var a     = attrs(),
                            line  = self.isLineShape(a.shape),
                            color = a.color || '#0096ff',
                            roots = isOverlay ? [overlayOrAnnotation.overlayElement] : (overlayOrAnnotation.contentViewDetailElements || []);
                        roots.forEach(function(root) {
                            var link  = root.querySelector('.hotspot-element'),
                                pulse = root.querySelector('.hotspot-pulse'),
                                label = root.querySelector('.hotspot-label');
                            if (link) {
                                link.style.borderColor = color;
                                link.style.backgroundColor = (!line && a.backgroundColor) || 'transparent';
                                self.syncHotspotHover(link, a, overlayOrAnnotation.data.events);
                            }
                            if (pulse) { pulse.style.borderColor = color; }
                            root.querySelectorAll('.hotspot-stroke, .hotspot-svg-pulse').forEach(function(path) {
                                path.setAttribute('stroke', color);
                            });
                            if (label) {
                                label.textContent = line ? '' : (a.text || '');
                                label.style.color = a.textColor || '#ffffff';
                            }
                        });
                    };

                    // Hotspots made before the pulse switch lose their pulse with a fill. Once the
                    // fill is changed here, the switch decides.
                    var keepPulse = function() {
                        var a = attrs();
                        if (a.pulse === undefined && !self.isLineShape(a.shape)) {
                            a.pulse = self.hasPulse(a);
                        }
                    };

                    // --- Outline (line) and fill ---

                    var outlineControl = this.renderColorSwitch({
                        label:   labels['SettingsShapeOutline'],
                        color:   colorOf(attrs().color, '#0096ff'),
                        on:      width() > 0,
                        onInput: function(color) {
                            begin();
                            attrs().color = color;
                            if (width() > 0) {
                                preview();
                            } else {
                                attrs().borderWidth = lastWidth;
                                widthInput.value = lastWidth;
                                rerender();
                            }
                        },
                        onChange: function(color) {
                            begin();
                            if (color === null) {
                                if (width() > 0) { lastWidth = width(); }
                                attrs().borderWidth = 0;
                            } else {
                                attrs().color = color;
                                if (!(width() > 0)) { attrs().borderWidth = lastWidth; }
                            }
                            widthInput.value = width();
                            rerender();
                            commit('SettingsShapeOutline');
                        }
                    });
                    q('.hotspotOutlineColumn').appendChild(outlineControl);

                    var fillControl = this.renderColorSwitch({
                        label:   labels['SettingsShapeFill'],
                        color:   colorOf(attrs().backgroundColor, colorOf(attrs().color, '#0096ff')),
                        on:      !!attrs().backgroundColor,
                        onInput: function(color) {
                            begin();
                            keepPulse();
                            attrs().backgroundColor = color;
                            preview();
                        },
                        onChange: function(color) {
                            begin();
                            keepPulse();
                            attrs().backgroundColor = color || '';
                            rerender();
                            commit('SettingsShapeFill');
                        }
                    });
                    q('.hotspotFillColumn').appendChild(fillControl);

                    widthInput.addEventListener('change', function() {
                        var value = parseFloat(this.value);
                        if (isNaN(value) || value < 0) { value = 0; }
                        if (value > 40) { value = 40; }
                        this.value = value;
                        begin();
                        attrs().borderWidth = value;
                        if (value > 0) { lastWidth = value; }
                        outlineControl.setPaint(value > 0);
                        rerender();
                        commit('SettingsShapeOutlineWidth');
                    });

                    // --- Shape and its settings ---

                    // What a shape offers: corner radius (rounded), direction and curve (arrow),
                    // drawing (freeform, on the video); lines have no fill, pulse or label.
                    var syncRows = function() {
                        var shape = attrs().shape || 'circle',
                            line  = self.isLineShape(shape);
                        q('.hotspotRadiusColumn').style.display = (shape === 'rounded') ? '' : 'none';
                        q('.hotspotArrowRow').style.display     = (shape === 'arrow') ? '' : 'none';
                        q('.hotspotFreeformRow').style.display  = (shape === 'freeform' && isOverlay) ? '' : 'none';
                        q('.hotspotFillColumn').style.display   = line ? 'none' : '';
                        q('.hotspotPulseRow').style.display     = line ? 'none' : '';
                        q('.hotspotLabelSection').style.display = line ? 'none' : '';
                        outlineControl.querySelector('label:not(.switch)').textContent = labels[line ? 'SettingsShapeLine' : 'SettingsShapeOutline'];
                    };

                    var syncInputs = function() {
                        var a = attrs();
                        shapeSelect.value     = a.shape || 'circle';
                        radiusInput.value     = (a.borderRadius !== undefined) ? a.borderRadius : 10;
                        directionSelect.value = a.direction || 'right';
                        curveSelect.value     = a.curve || 'straight';
                        widthInput.value      = width();
                        outlineControl.setPaint(width() > 0, colorOf(a.color, '#0096ff'));
                        fillControl.setPaint(!!a.backgroundColor, a.backgroundColor);
                        pulseInput.checked    = self.hasPulse(a);
                        textInput.value       = a.text || '';
                        textColorInput.value  = colorOf(a.textColor, '#ffffff');
                        syncRows();
                    };

                    shapeSelect.addEventListener('change', function() {
                        begin();
                        attrs().shape = this.value;
                        syncRows();
                        pulseInput.checked = self.hasPulse(attrs());
                        rerender();
                        commit('SettingsHotspotShape');
                    });

                    radiusInput.addEventListener('change', function() {
                        var value = parseFloat(this.value);
                        if (isNaN(value) || value < 0) { value = 0; }
                        if (value > 100) { value = 100; }
                        this.value = value;
                        begin();
                        attrs().borderRadius = value;
                        rerender();
                        commit('SettingsShapeCornerRadius');
                    });

                    [[directionSelect, 'direction', 'SettingsHotspotDirection'], [curveSelect, 'curve', 'SettingsHotspotCurve']].forEach(function(entry) {
                        entry[0].addEventListener('change', function() {
                            begin();
                            attrs()[entry[1]] = this.value;
                            rerender();
                            commit(entry[2]);
                        });
                    });

                    // The outline is drawn and edited on the video (overlays only)
                    q('.hotspotDrawShape').addEventListener('click', function(evt) {
                        evt.preventDefault();
                        var FreeformShapeEditor = FrameTrail.module('FreeformShapeEditor');
                        if (FreeformShapeEditor && isOverlay) {
                            FreeformShapeEditor.startDrawing(overlayOrAnnotation);
                        }
                    });

                    pulseInput.addEventListener('change', function() {
                        begin();
                        attrs().pulse = this.checked;
                        rerender();
                        commit('SettingsHotspotPulse');
                    });

                    // --- Label ---

                    textInput.addEventListener('input', function() {
                        begin();
                        attrs().text = this.value;
                        preview();
                    });
                    textInput.addEventListener('change', function() {
                        commit('SettingsHotspotText');
                    });

                    textColorInput.addEventListener('input', function() {
                        begin();
                        attrs().textColor = this.value;
                        preview();
                    });
                    textColorInput.addEventListener('change', function() {
                        commit('SettingsShapeTextColor');
                    });

                    syncInputs();

                    // --- Action (shared model: open URL / jump to time / jump to hypervideo) ---
                    container.insertAdjacentHTML('beforeend', '<hr>');
                    var actionControls = this.renderActionControls(overlayOrAnnotation);
                    container.appendChild(actionControls);

                    // Keep pointer / fill hover in sync when Action is set or cleared
                    var refreshActionHover = function() {
                        var roots = isOverlay
                            ? [overlayOrAnnotation.overlayElement]
                            : (overlayOrAnnotation.contentViewDetailElements || []);
                        roots.forEach(function(el) {
                            self.syncHotspotHover(el.querySelector('.hotspot-element'), attrs(), overlayOrAnnotation.data.events);
                        });
                    };
                    actionControls.addEventListener('change', refreshActionHover);
                    actionControls.addEventListener('input', refreshActionHover);

                    return container;

                }



            }



        }
    }


);
