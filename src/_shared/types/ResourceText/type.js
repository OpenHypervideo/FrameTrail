/**
 * @module Shared
 */


/**
 * I am the type definition of a ResourceText.
 *
 * * Text Resources only appear in the 'Add Custom Overlay' tab
 *   and are not listed in the ResourceManager.
 *
 * * Text Resources can not be used as Annotation
 *
 * @class ResourceText
 * @category TypeDefinition
 * @extends Resource
 */



FrameTrail.defineType(

    'ResourceText',

    function (FrameTrail) {
        return {
            parent: 'Resource',
            constructor: function(resourceData){
                this.resourceData = resourceData;
            },
            prototype: {
                /**
                 * I hold the data object of a custom ResourceText, which is not stored in the Database and doesn't appear in the resource's _index.json.
                 * @attribute resourceData
                 * @type {}
                 */
                resourceData:   {},
                iconClass:      'icon-doc-text',

                /**
                 * The shapes text can be in (attributes.box.shape); the directions of a speech
                 * bubble's tail, of a cloud's trailing circles ("none": a plain cloud) and of a
                 * block arrow (the first is the default); the depth of the tail and of the
                 * circles' strip and the size of a cloud's bumps, in pixels of the 800 px stage.
                 * @attribute shapes
                 * @type Array
                 */
                shapes:           ['rectangle', 'rounded', 'circle', 'speechBubble', 'cloud', 'arrow'],
                bubbleDirections: ['downLeft', 'down', 'downRight', 'left', 'right', 'upLeft', 'up', 'upRight'],
                cloudDirections:  ['downLeft', 'down', 'downRight', 'left', 'right', 'upLeft', 'up', 'upRight', 'none'],
                arrowDirections:  ['right', 'left', 'up', 'down'],
                bubbleTail:       28,
                cloudTail:        40,
                cloudBump:        28,


                /**
                 * I render the content of myself, which is a &lt;div&gt; containing a custom text wrapped in a &lt;div class="resourceDetail" ...&gt;
                 *
                 * @method renderContent
                 * @return HTMLElement
                 */
                renderContent: function() {

                    var self = this;

                    var resourceDetail = document.createElement('div');
                    resourceDetail.className = 'resourceDetail';
                    resourceDetail.dataset.type = this.resourceData.type;

                    var resourceContent = document.createElement('div');
                    resourceContent.className = 'resourceContent';

                    var unescapeHelper = document.createElement('div');
                    // unescape string from json
                    unescapeHelper.innerHTML = self.resourceData.attributes.text;
                    var child = unescapeHelper.childNodes[0];
                    var unescapedString = child ? child.nodeValue : '';

                    // Optional title (plain text) above the rich text body
                    var title = self.resourceData.attributes.title;
                    if (title) {
                        var titleElement = document.createElement('div');
                        titleElement.className = 'textOverlayTitle';
                        titleElement.setAttribute('role', 'heading');
                        titleElement.setAttribute('aria-level', '3');
                        titleElement.textContent = title;
                        resourceContent.appendChild(titleElement);
                    }

                    var bodyElement = document.createElement('div');
                    bodyElement.className = 'textOverlayBody';
                    bodyElement.innerHTML = unescapedString;
                    resourceContent.appendChild(bodyElement);

                    this.applyShapeStyle(resourceContent, self.resourceData.attributes.box);

                    resourceDetail.appendChild(resourceContent);
                    resourceDetail._ftCleanup = function() {
                        if (resourceContent._ftShapeObserver) { resourceContent._ftShapeObserver.disconnect(); }
                    };

                    resourceDetail.appendChild(this.buildResourceOptions({
                        licenseType: this.resourceData.licenseType,
                        licenseAttribution: this.resourceData.licenseAttribution
                    }));

                    return resourceDetail;

                },

                /**
                 * I return the shape of a style (attributes.box): its shape, or, for cards made
                 * before shapes, rounded when it has a corner radius, else rectangle. Without a
                 * box (plain text) null.
                 *
                 * @method shapeOf
                 * @param {Object} box
                 * @return {String|null}
                 */
                shapeOf: function(box) {

                    if (!box || typeof box !== 'object') { return null; }
                    if (this.shapes.indexOf(box.shape) >= 0) { return box.shape; }
                    return (box.radius > 0) ? 'rounded' : 'rectangle';

                },

                /**
                 * I return where a speech bubble's tail, a cloud's circles or a block arrow
                 * point (null for the other shapes): box.direction, if the shape has it, else
                 * the shape's default.
                 *
                 * @method shapeDirection
                 * @param {Object} box
                 * @return {String|null}
                 */
                shapeDirection: function(box) {

                    var shape = this.shapeOf(box),
                        list  = { speechBubble: this.bubbleDirections, cloud: this.cloudDirections, arrow: this.arrowDirections }[shape];

                    if (!list) { return null; }
                    return (list.indexOf(box.direction) >= 0) ? box.direction : list[0];

                },

                /**
                 * I apply the style (attributes.box) to my content element: its shape, fill,
                 * outline, padding, shadow and colours (the title colour as
                 * --ft-text-title-color). Rectangle, rounded rectangle and circle are CSS; a
                 * speech bubble, a cloud and a block arrow are one SVG outline behind the text,
                 * laid out in pixels whenever the element's size changes. Without a box (plain text)
                 * nothing is drawn. I can be called again on the same element.
                 *
                 * @method applyShapeStyle
                 * @param {HTMLElement} contentElement
                 * @param {Object} box
                 */
                applyShapeStyle: function(contentElement, box) {

                    var self   = this,
                        style  = contentElement.style,
                        shape  = this.shapeOf(box),
                        oldSvg = contentElement.querySelector(':scope > .textShapeSvg');

                    contentElement.classList.remove('textOverlayCard');
                    delete contentElement.dataset.shape;
                    delete contentElement.dataset.direction;
                    ['background', 'padding', 'border-radius', 'border', 'box-shadow', 'color', '--ft-text-title-color'].forEach(function(prop) {
                        style.removeProperty(prop);
                    });
                    contentElement._ftShapeLayout = null;

                    if (!shape || shape === 'rectangle' || shape === 'rounded' || shape === 'circle') {
                        if (oldSvg) { oldSvg.remove(); }
                    }

                    if (!shape) { return; }

                    var padding   = (box.padding != null) ? box.padding : null,
                        fill      = (box.background && box.background !== 'transparent') ? box.background : '',
                        outline   = (box.borderWidth > 0) ? box.borderWidth : 0,
                        lineColor = box.borderColor || '#000000',
                        shadow    = '0 12px 32px rgba(0, 0, 0, 0.28)',
                        direction = this.shapeDirection(box);

                    contentElement.classList.add('textOverlayCard');
                    contentElement.dataset.shape = shape;
                    if (direction) { contentElement.dataset.direction = direction; }
                    if (box.textColor) { style.color = box.textColor; }
                    if (box.titleColor) { style.setProperty('--ft-text-title-color', box.titleColor); }

                    if (shape === 'rectangle' || shape === 'rounded' || shape === 'circle') {
                        style.background = fill || 'transparent';
                        style.border     = outline ? outline + 'px solid ' + lineColor : '';
                        style.boxShadow  = box.shadow ? shadow : '';
                        if (shape === 'circle') {
                            // The text is in the rectangle inscribed in the ellipse, 14.645 % in from each side
                            style.borderRadius = '50%';
                            style.padding = (padding || 0) + 'px calc(14.645% + ' + (padding || 0) + 'px)';
                        } else {
                            style.borderRadius = (shape === 'rounded') ? ((box.radius != null) ? box.radius : 12) + 'px' : '';
                            style.padding = (padding != null) ? padding + 'px' : '';
                        }
                        return;
                    }

                    var SVG_NS = 'http://www.w3.org/2000/svg',
                        svg    = oldSvg,
                        path;

                    if (!svg) {
                        svg = document.createElementNS(SVG_NS, 'svg');
                        svg.setAttribute('class', 'textShapeSvg');
                        svg.setAttribute('aria-hidden', 'true');
                        svg.appendChild(document.createElementNS(SVG_NS, 'path'));
                        contentElement.prepend(svg);
                    }
                    path = svg.firstChild;
                    path.setAttribute('fill', fill || 'none');
                    path.setAttribute('stroke', outline ? lineColor : 'none');
                    path.setAttribute('stroke-width', outline);
                    path.setAttribute('stroke-linejoin', 'round');
                    svg.style.filter = box.shadow ? 'drop-shadow(' + shadow + ')' : '';

                    style.padding = this.shapePadding(shape, direction, (padding || 0) + outline);

                    contentElement._ftShapeLayout = function() {
                        var w = contentElement.offsetWidth,
                            h = contentElement.offsetHeight;
                        if (!w || !h) { return; }
                        svg.setAttribute('viewBox', '0 0 ' + w + ' ' + h);
                        path.setAttribute('d', self.shapePath(shape, w, h, outline, box));
                    };
                    contentElement._ftShapeLayout();

                    if (!contentElement._ftShapeObserver && window.ResizeObserver) {
                        contentElement._ftShapeObserver = new ResizeObserver(function() {
                            if (contentElement._ftShapeLayout) { contentElement._ftShapeLayout(); }
                        });
                        contentElement._ftShapeObserver.observe(contentElement);
                    }

                },

                /**
                 * I return the CSS padding that keeps the text inside a speech bubble (off its
                 * tail), a cloud (in the rectangle inscribed in its ellipse, off the circles)
                 * or a block arrow (off its head and, pointing up or down, its wings). The
                 * percentages are of the box width, as in the paths.
                 *
                 * @method shapePadding
                 * @param {String} shape
                 * @param {String} direction
                 * @param {Number} inset the padding and the outline, in pixels
                 * @return {String}
                 */
                shapePadding: function(shape, direction, inset) {

                    var px    = inset + 'px',
                        plus  = function(percent, pixels) { return 'calc(' + percent + '% + ' + pixels + 'px)'; },
                        sides = { top: px, right: px, bottom: px, left: px },
                        side  = /^down/.test(direction) ? 'bottom' : /^up/.test(direction) ? 'top' : direction;

                    if (shape === 'speechBubble') {
                        sides[side] = (inset + this.bubbleTail) + 'px';
                    } else if (shape === 'cloud') {
                        // 10 px for the bumps' valleys inside the ellipse
                        sides.top = sides.bottom = (inset + 10) + 'px';
                        sides.left = sides.right = plus(14.645, inset + 10);
                        if (direction !== 'none') {
                            sides[side] = (side === 'top' || side === 'bottom')
                                ? (inset + 10 + this.cloudTail) + 'px'
                                : plus(14.645, inset + 10 + this.cloudTail);
                        }
                    } else if (shape === 'arrow') {
                        if (direction === 'right' || direction === 'left') {
                            sides[direction] = plus(18, inset);
                        } else {
                            sides[side] = plus(27, inset);
                            sides.left = sides.right = plus(20, inset);
                        }
                    }

                    return [sides.top, sides.right, sides.bottom, sides.left].join(' ');

                },

                /**
                 * I return the SVG path of a speech bubble, a cloud or a block arrow in
                 * pixels of a w×h box, the outline (width sw) inside it.
                 *
                 * @method shapePath
                 * @param {String} shape
                 * @param {Number} w
                 * @param {Number} h
                 * @param {Number} sw
                 * @param {Object} box
                 * @return {String}
                 */
                shapePath: function(shape, w, h, sw, box) {

                    var direction = this.shapeDirection(box);

                    if (shape === 'speechBubble') { return this.bubblePath(this.shapeFrame(direction, w, h), sw, box); }
                    if (shape === 'cloud')        { return this.cloudPath(this.shapeFrame(direction, w, h), sw, direction !== 'none'); }
                    if (shape === 'arrow')        { return this.arrowPath(direction, w, h, sw); }
                    return '';

                },

                /**
                 * I return the frame a speech bubble or a cloud is drawn in: its tail (or
                 * the cloud's circles) at the bottom, W wide and H high, and a path builder
                 * whose points are turned into place (M, L, C, A: a circular arc, which a
                 * mirrored frame turns the other way). side, pos (where on that side: 0
                 * start, 0.5 middle, 1 end) and lean (where the tip leans: -1, 0, 1) say
                 * where the tail is.
                 *
                 * @method shapeFrame
                 * @param {String} direction
                 * @param {Number} w
                 * @param {Number} h
                 * @return {Object}
                 */
                shapeFrame: function(direction, w, h) {

                    var place = {
                            downLeft: ['bottom', 0, -1], down: ['bottom', 0.5, 0], downRight: ['bottom', 1, 1],
                            upLeft: ['top', 0, -1], up: ['top', 0.5, 0], upRight: ['top', 1, 1],
                            left: ['left', 0.5, 0], right: ['right', 0.5, 0]
                        }[direction] || ['bottom', 0.5, 0],
                        side     = place[0],
                        across   = (side === 'left' || side === 'right'),
                        mirrored = (side === 'top' || side === 'right'),
                        map = {
                            bottom: function(x, y) { return [x, y]; },
                            top:    function(x, y) { return [x, h - y]; },
                            left:   function(x, y) { return [w - y, x]; },
                            right:  function(x, y) { return [y, x]; }
                        }[side],
                        d  = [],
                        r2 = function(v) { return Math.round(v * 100) / 100; },
                        at = function(x, y) { var p = map(x, y); return r2(p[0]) + ',' + r2(p[1]); };

                    return {
                        side: side, pos: place[1], lean: place[2],
                        W: across ? h : w,
                        H: across ? w : h,
                        M: function(x, y) { d.push('M' + at(x, y)); },
                        L: function(x, y) { d.push('L' + at(x, y)); },
                        C: function(x1, y1, x2, y2, x, y) { d.push('C' + at(x1, y1) + ' ' + at(x2, y2) + ' ' + at(x, y)); },
                        A: function(r, large, sweep, x, y) { d.push('A' + r2(r) + ',' + r2(r) + ' 0 ' + large + ' ' + (mirrored ? 1 - sweep : sweep) + ' ' + at(x, y)); },
                        Z: function() { d.push('Z'); },
                        path: function() { return d.join(' '); }
                    };

                },

                /**
                 * A speech bubble: a rounded body and a tail whose sides leave the body
                 * smoothly and curve to a sharp tip, which leans out at a corner.
                 *
                 * @method bubblePath
                 * @param {Object} f the frame (shapeFrame)
                 * @param {Number} sw
                 * @param {Object} box
                 * @return {String}
                 */
                bubblePath: function(f, sw, box) {

                    var m    = sw / 2,
                        T    = Math.min(this.bubbleTail, Math.max(0, (f.H - sw) * 0.45)),
                        x0   = m, x1 = f.W - m, y0 = m, y1 = f.H - T - m,
                        rad  = Math.max(0, Math.min((box.radius != null ? box.radius : 12), (x1 - x0) / 2, (y1 - y0) / 2)),
                        c    = rad * (1 - 0.5523),   // quarter circles as cubic curves
                        B    = Math.max(0, Math.min(T * 1.5, x1 - x0 - 2 * rad)),
                        rest = x1 - x0 - 2 * rad - B,
                        cx   = (f.pos === 0.5) ? (x0 + x1) / 2
                             : (f.pos === 0)   ? x0 + rad + B / 2 + rest * 0.12
                             :                   x1 - rad - B / 2 - rest * 0.12,
                        half = f.lean ? B / 2 : B * 0.4,   // a centred tail is narrower
                        tip  = Math.max(x0, Math.min(x1, cx + f.lean * B)),
                        join = Math.max(0, Math.min(T * (f.lean ? 0.4 : 0.25), x1 - rad - cx - half, cx - half - x0 - rad)),
                        pull = B * (f.lean ? 0.1 : 0.05),
                        a    = cx - half, b = cx + half;

                    f.M(x0 + rad, y0);
                    f.L(x1 - rad, y0);
                    f.C(x1 - c, y0, x1, y0 + c, x1, y0 + rad);
                    f.L(x1, y1 - rad);
                    f.C(x1, y1 - c, x1 - c, y1, x1 - rad, y1);
                    f.L(b + join, y1);
                    f.C(b, y1, b + (tip - b) * 0.2 - pull, y1 + T * 0.5, tip, f.H - m);
                    f.C(a + (tip - a) * 0.2 + pull, y1 + T * 0.5, a, y1, a - join, y1);
                    f.L(x0 + rad, y1);
                    f.C(x0 + c, y1, x0, y1 - c, x0, y1 - rad);
                    f.L(x0, y0 + rad);
                    f.C(x0, y0 + c, x0 + c, y0, x0 + rad, y0);
                    f.Z();
                    return f.path();

                },

                /**
                 * A cloud: round bumps evenly along an ellipse, every other one a little
                 * rounder; with dots, two circles getting smaller trail in the strip on the
                 * frame's tail side (a thought bubble).
                 *
                 * @method cloudPath
                 * @param {Object} f the frame (shapeFrame)
                 * @param {Number} sw
                 * @param {Boolean} dots
                 * @return {String}
                 */
                cloudPath: function(f, sw, dots) {

                    var m  = sw / 2,
                        T  = dots ? Math.min(this.cloudTail, Math.max(0, (f.H - sw) * 0.3)) : 0,
                        x0 = m, x1 = f.W - m, y0 = m, y1 = f.H - T - m,
                        cx = (x0 + x1) / 2, cy = (y0 + y1) / 2,
                        bw = x1 - x0, bh = y1 - y0,
                        br = Math.max(3, Math.min(this.cloudBump, Math.min(bw, bh) * 0.3)),
                        ax = Math.max(1, bw / 2 - br * 0.38),
                        ay = Math.max(1, bh / 2 - br * 0.38),
                        samples = [], total = 0, points = [], i, j = 0;

                    // The bumps end on the ellipse, evenly spaced by length along it
                    for (i = 0; i <= 720; i++) {
                        var angle = -Math.PI / 2 + i * Math.PI / 360,
                            point = [cx + ax * Math.cos(angle), cy + ay * Math.sin(angle)],
                            prev  = samples[i - 1];
                        if (prev) { total += Math.sqrt(Math.pow(point[0] - prev[0], 2) + Math.pow(point[1] - prev[1], 2)); }
                        samples.push([point[0], point[1], total]);
                    }
                    var n = Math.max(6, Math.round(total / (br * 1.5)));
                    for (i = 0; i < n; i++) {
                        while (samples[j + 1] && samples[j + 1][2] < total * i / n) { j++; }
                        points.push(samples[j]);
                    }

                    f.M(points[0][0], points[0][1]);
                    points.forEach(function(p0, k) {
                        var p1    = points[(k + 1) % n],
                            chord = Math.sqrt(Math.pow(p1[0] - p0[0], 2) + Math.pow(p1[1] - p0[1], 2));
                        f.A(chord * (k % 2 ? 0.66 : 0.58), 0, 1, p1[0], p1[1]);
                    });
                    f.Z();

                    if (dots) {
                        var anchor  = (f.pos === 0.5) ? cx : (f.pos === 0) ? x0 + bw * 0.3 : x1 - bw * 0.3,
                            circles = [
                                [anchor + f.lean * T * 0.3, y1 + T * 0.38, T * 0.33],
                                // straight out, the small circle goes aside
                                [anchor + (f.lean ? f.lean * T * 0.85 : T * 0.35), y1 + T * 0.8, T * 0.19]
                            ];
                        circles.forEach(function(circle) {
                            f.M(circle[0] - circle[2], circle[1]);
                            f.A(circle[2], 1, 0, circle[0] + circle[2], circle[1]);
                            f.A(circle[2], 1, 0, circle[0] - circle[2], circle[1]);
                            f.Z();
                        });
                    }

                    return f.path();

                },

                /**
                 * A block arrow: its head 0.3 of its length (pointing up or down: 0.45 of its
                 * width; never more than 0.6 of its length), its shaft the middle 0.6 of its
                 * thickness (see shapePadding, getContentFitHeight). Made pointing right, then
                 * turned into place.
                 *
                 * @method arrowPath
                 * @param {String} direction
                 * @param {Number} w
                 * @param {Number} h
                 * @param {Number} sw
                 * @return {String}
                 */
                arrowPath: function(direction, w, h, sw) {

                    var r2       = function(v) { return Math.round(v * 100) / 100; },
                        vertical = (direction === 'up' || direction === 'down'),
                        map = {
                            right: function(x, y) { return [x, y]; },
                            left:  function(x, y) { return [w - x, y]; },
                            down:  function(x, y) { return [y, x]; },
                            up:    function(x, y) { return [y, h - x]; }
                        }[direction],
                        W    = vertical ? h : w,
                        H    = vertical ? w : h,
                        m    = sw / 2,
                        head = Math.min((vertical ? 0.45 : 0.3) * w, 0.6 * W),
                        wing = Math.max(m, 0.2 * H),
                        neck = W - head;

                    return [[m, wing], [neck, wing], [neck, m], [W - m, H / 2], [neck, H - m], [neck, H - wing], [m, H - wing]].map(function(p, i) {
                        var q = map(p[0], p[1]);
                        return (i ? 'L' : 'M') + r2(q[0]) + ',' + r2(q[1]);
                    }).join(' ') + ' Z';

                },

                /**
                 * The element whose text is split for text reveals (title and body).
                 *
                 * @method getTextRevealRoot
                 * @param {HTMLElement} resourceDetail
                 * @return {HTMLElement}
                 */
                getTextRevealRoot: function(resourceDetail) {

                    return resourceDetail.querySelector('.resourceContent');

                },

                /**
                 * The element whose height is the height of my content (title, body and
                 * card), for overlays whose height follows their content (see
                 * Overlay.measureContentHeight).
                 *
                 * @method getContentFitRoot
                 * @param {HTMLElement} resourceDetail
                 * @return {HTMLElement}
                 */
                getContentFitRoot: function(resourceDetail) {

                    return resourceDetail.querySelector('.resourceContent');

                },

                /**
                 * The height my box needs for my content (see Overlay.measureContentHeight).
                 * Circle, speech bubble, cloud and block arrow fill the box and centre their
                 * text, so the text's own height is measured: a circle needs √2 of it and a
                 * cloud √2 of it without the circles' strip (the text is in the inscribed
                 * rectangle), an arrow pointing left or right 1 / 0.6 (the text is in the
                 * shaft, see arrowPath).
                 *
                 * @method getContentFitHeight
                 * @param {HTMLElement} root the element of getContentFitRoot
                 * @return {Number} pixels
                 */
                getContentFitHeight: function(root) {

                    var shape = root.dataset.shape;

                    if (['circle', 'speechBubble', 'cloud', 'arrow'].indexOf(shape) < 0) {
                        return root.offsetHeight;
                    }

                    var flex = root.style.flex;
                    root.style.flex = 'none';
                    var height = root.offsetHeight;
                    root.style.flex = flex;

                    var direction = root.dataset.direction,
                        strip     = (shape === 'cloud' && /^(up|down)/.test(direction)) ? this.cloudTail : 0;

                    if (shape === 'circle') { return height * Math.SQRT2; }
                    if (shape === 'cloud')  { return (height - strip) * Math.SQRT2 + strip; }
                    if (shape === 'arrow' && (direction === 'right' || direction === 'left')) { return height / 0.6; }
                    return height;

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

                    var self = this,
                        unescapeHelper = document.createElement('div'),
                        child,
                        unescapedString;

                    var thumbBackground = (this.resourceData.thumb ?
                            "--thumb-bg: url('"+ FrameTrail.module('RouteNavigation').getResourceURL(this.resourceData.thumb) +"'); background-image: var(--thumb-bg);" : "" );
                    
                    var thumbLabel = this.labels['ResourceCustomTextHTML'];
                    if (this.resourceData.name && this.resourceData.name.length > 0) {
                        thumbLabel = this.resourceData.name;
                    }

                    var tagList = (this.resourceData.tags ? this.resourceData.tags.join(' ') : '');

                    var _tw = document.createElement('div');
                    _tw.innerHTML = '<div class="resourceThumb '+ tagList +'" data-license-type="'+ this.resourceData.licenseType +'" data-type="'+ this.resourceData.type +'" style="'+ thumbBackground +'">'
                        + '    <div class="resourceOverlay">'
                        + '        <div class="resourceIcon"><span class="icon-doc-text"></span></div>'
                        + '    </div>'
                        + '    <div class="resourceTitle">'+ thumbLabel +'</div>'
                        + '</div>';
                    var thumbElement = _tw.firstElementChild;

                    var previewButton = document.createElement('div');
                    previewButton.className = 'resourcePreviewButton';
                    previewButton.innerHTML = '<span class="icon-eye"></span>';
                    previewButton.addEventListener('click', function(evt) {
                        // call the openPreview method (defined in abstract type: Resource)
                        self.openPreview(this.parentElement);
                        evt.stopPropagation();
                        evt.preventDefault();
                    });
                    thumbElement.appendChild(previewButton);

                    var _dh = document.createElement('div');
                    _dh.innerHTML = self.resourceData.attributes.text;
                    var decoded_string = _dh.textContent;
                    thumbElement.insertAdjacentHTML('beforeend', '<div class="resourceTextPreview">'+ decoded_string +'</div>');

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

                    var optionsPanel = basicControls.controlsContainer.querySelector('#OverlayOptions');
                    optionsPanel.prepend(this.renderTextEditors(overlay));
                    optionsPanel.prepend(this.renderShapeControls(overlay));

                    // While the height follows the text, the Height input only shows it
                    basicControls.controlsContainer.querySelector('.positionHeight').disabled = overlay.hasAutoHeight();


                    return basicControls;

                },


                /**
                 * I render the controls for the optional title and the shape of a text overlay
                 * (attributes.title, attributes.box): the shape and what it offers (corner
                 * radius, direction), fill and outline, padding, shadow and colours. Plain text
                 * is a rectangle without fill and outline: attributes.box is written once a
                 * style is set and removed when nothing of it is left.
                 *
                 * @method renderShapeControls
                 * @param {Overlay} overlay
                 * @return HTMLElement
                 */
                renderShapeControls: function(overlay) {

                    var self      = this,
                        labels    = this.labels,
                        attrs     = overlay.data.attributes,
                        box       = attrs.box || {},
                        shape     = this.shapeOf(attrs.box) || 'rectangle',
                        direction = this.shapeDirection(attrs.box),
                        hasFill   = !!(box.background && box.background !== 'transparent'),
                        lastWidth = (box.borderWidth > 0) ? box.borderWidth : 2,
                        pending   = null,
                        // The switches' texts are labels of their own, so they name their inputs to toggle them.
                        idPrefix  = 'textShape-' + Math.random().toString(36).slice(2, 10);

                    var colorValue = function(value, fallback) {
                        return (/^#[0-9a-fA-F]{6}$/.test(value || '')) ? value : fallback;
                    };

                    var shapeLabels = {
                            rectangle: 'SettingsHotspotShapeRectangle', rounded: 'SettingsHotspotShapeRounded', circle: 'SettingsHotspotShapeCircle',
                            speechBubble: 'SettingsShapeSpeechBubble', cloud: 'SettingsShapeCloud', arrow: 'SettingsShapeBlockArrow'
                        },
                        directionLabels = {
                            right: 'SettingsHotspotDirectionRight', downRight: 'SettingsHotspotDirectionDownRight',
                            down: 'SettingsHotspotDirectionDown', downLeft: 'SettingsHotspotDirectionDownLeft',
                            left: 'SettingsHotspotDirectionLeft', upLeft: 'SettingsHotspotDirectionUpLeft',
                            up: 'SettingsHotspotDirectionUp', upRight: 'SettingsHotspotDirectionUpRight',
                            none: 'GenericNone'
                        },
                        fieldLabels = {
                            borderWidth: 'SettingsShapeOutlineWidth', radius: 'SettingsShapeCornerRadius', direction: 'SettingsHotspotDirection',
                            padding: 'SettingsTextBoxPadding', textColor: 'SettingsShapeTextColor', titleColor: 'SettingsTextBoxTitleColor'
                        };

                    var options = function(values, labelKeys, selected) {
                        return values.map(function(value) {
                            return '<option value="' + value + '"' + (value === selected ? ' selected' : '') + '>' + labels[labelKeys[value]] + '</option>';
                        }).join('');
                    };

                    var wrapper = document.createElement('div');
                    wrapper.className = 'textShapeControls';
                    wrapper.innerHTML = '<div class="layoutRow">'
                        + '    <div class="column-12">'
                        + '        <label>' + labels['SettingsTextTitle'] + '</label>'
                        + '        <input type="text" class="textTitleInput">'
                        + '    </div>'
                        + '</div>'
                        + '<div class="layoutRow">'
                        + '    <div class="column-6">'
                        + '        <label>' + labels['SettingsHotspotShape'] + '</label>'
                        + '        <div class="custom-select"><select class="textShapeSelect">' + options(this.shapes, shapeLabels, shape) + '</select></div>'
                        + '    </div>'
                        + '    <div class="column-6">'
                        + '        <label>&nbsp;</label>'
                        + '        <div class="checkboxRow">'
                        + '            <label class="switch">'
                        + '                <input id="' + idPrefix + '-autoHeight" class="textAutoHeightCheckbox" type="checkbox" autocomplete="off"' + (attrs.autoSize === 'height' ? ' checked' : '') + '>'
                        + '                <span class="slider round"></span>'
                        + '            </label>'
                        + '            <label for="' + idPrefix + '-autoHeight">' + labels['SettingsTextAutoHeight'] + '</label>'
                        + '        </div>'
                        + '    </div>'
                        + '</div>'
                        + '<div class="layoutRow">'
                        + '    <div class="column-4 textFillColumn"></div>'
                        + '    <div class="column-4 textOutlineColumn"></div>'
                        + '    <div class="column-4">'
                        + '        <label>' + labels['SettingsShapeOutlineWidth'] + '</label>'
                        + '        <input type="number" class="textBoxField" data-key="borderWidth" min="0" max="40" step="1" value="' + (box.borderWidth > 0 ? box.borderWidth : 0) + '">'
                        + '    </div>'
                        + '</div>'
                        + '<div class="layoutRow">'
                        + ((shape === 'rounded' || shape === 'speechBubble')
                            ? '<div class="column-3">'
                            + '    <label>' + labels['SettingsShapeCornerRadius'] + '</label>'
                            + '    <input type="number" class="textBoxField" data-key="radius" min="0" max="200" step="1" value="' + (box.radius != null ? box.radius : 12) + '">'
                            + '</div>'
                            : '')
                        + (direction
                            ? '<div class="column-3">'
                            + '    <label>' + labels['SettingsHotspotDirection'] + '</label>'
                            + '    <div class="custom-select"><select class="textBoxField" data-key="direction">' + options({ speechBubble: this.bubbleDirections, cloud: this.cloudDirections, arrow: this.arrowDirections }[shape], directionLabels, direction) + '</select></div>'
                            + '</div>'
                            : '')
                        + '    <div class="column-3">'
                        + '        <label>' + labels['SettingsTextBoxPadding'] + '</label>'
                        + '        <input type="number" class="textBoxField" data-key="padding" min="0" max="200" step="1" value="' + (box.padding > 0 ? box.padding : 0) + '">'
                        + '    </div>'
                        + '    <div class="column-3">'
                        + '        <label>&nbsp;</label>'
                        + '        <div class="checkboxRow">'
                        + '            <label class="switch">'
                        + '                <input id="' + idPrefix + '-shadow" class="textBoxShadow" type="checkbox" autocomplete="off"' + (box.shadow ? ' checked' : '') + '>'
                        + '                <span class="slider round"></span>'
                        + '            </label>'
                        + '            <label for="' + idPrefix + '-shadow">' + labels['SettingsTextBoxShadow'] + '</label>'
                        + '        </div>'
                        + '    </div>'
                        + '</div>'
                        + '<div class="layoutRow">'
                        + '    <div class="column-3">'
                        + '        <label>' + labels['SettingsShapeTextColor'] + '</label>'
                        + '        <input type="color" class="textBoxField" data-key="textColor" value="' + colorValue(box.textColor, '#000000') + '">'
                        + '    </div>'
                        + '    <div class="column-3 textTitleColorColumn"' + (attrs.title ? '' : ' style="display: none;"') + '>'
                        + '        <label>' + labels['SettingsTextBoxTitleColor'] + '</label>'
                        + '        <input type="color" class="textBoxField" data-key="titleColor" value="' + colorValue(box.titleColor, colorValue(box.textColor, '#000000')) + '">'
                        + '    </div>'
                        + '</div>'
                        + '<hr>';

                    var getContent = function() {
                        return overlay.overlayElement.querySelector('.resourceDetail .resourceContent');
                    };

                    // A change of the content may change the box (auto height), so
                    // undo restores both.
                    var STATE_KEYS = ['attributes', 'position', 'keyframes'];

                    var registerUndo = function(before, description) {
                        FrameTrail.module('OverlaysController').registerStateUndo(
                            overlay,
                            labels['SidebarOverlays'] + ' ' + description,
                            before,
                            overlay.snapshotState(STATE_KEYS),
                            { rerender: true }
                        );
                    };

                    // A change starts with begin() (the state before it) and ends with commit()
                    var begin = function() {
                        if (!pending) { pending = overlay.snapshotState(STATE_KEYS); }
                    };
                    var commit = function(labelKey) {
                        var before = pending;
                        pending = null;
                        if (!before || JSON.stringify(before) === JSON.stringify(overlay.snapshotState(STATE_KEYS))) { return; }
                        FrameTrail.module('HypervideoModel').newUnsavedChange('overlays');
                        registerUndo(before, labels[labelKey]);
                    };

                    // The box follows the content while auto height is on
                    var fitBox = function() {
                        if (overlay.fitToContent()) {
                            FrameTrail.module('OverlaysController').refreshMotionControls(overlay);
                        }
                    };

                    // The style changed: show it on the video
                    var show = function() {
                        var content = getContent();
                        if (content) { self.applyShapeStyle(content, attrs.box); }
                        overlay.scaleOverlayElement();
                        fitBox();
                    };

                    // Fill, outline or a shape on plain text start with room around the text
                    var ensureBox = function(room) {
                        if (!attrs.box) { attrs.box = room ? { padding: 24 } : {}; }
                        return attrs.box;
                    };

                    // Plain text has no box
                    var tidy = function() {
                        var b = attrs.box;
                        if (!b) { return; }
                        var draws = (b.background && b.background !== 'transparent') || b.borderWidth > 0 || b.shadow
                                 || b.padding > 0 || b.textColor || b.titleColor || self.shapeOf(b) !== 'rectangle';
                        if (!draws) { delete attrs.box; }
                    };

                    // Auto height on / off; the Height input is not used while it is on
                    var heightInput = function() {
                        var controls = wrapper.closest('.controlsWrapper');
                        return controls ? controls.querySelector('.positionHeight') : null;
                    };
                    var syncHeightInput = function() {
                        var input = heightInput();
                        if (input) { input.disabled = (attrs.autoSize === 'height'); }
                    };
                    wrapper.querySelector('.textAutoHeightCheckbox').addEventListener('change', function() {
                        begin();
                        if (this.checked) {
                            attrs.autoSize = 'height';
                        } else {
                            delete attrs.autoSize;
                        }
                        overlay.updateOverlayElement();
                        overlay.scaleOverlayElement();
                        fitBox();
                        syncHeightInput();
                        commit('SettingsTextAutoHeight');
                    });

                    // Title
                    var titleInput = wrapper.querySelector('.textTitleInput');
                    titleInput.value = attrs.title || '';
                    overlay._titleInput = titleInput;   // see refreshTextControls
                    titleInput.addEventListener('input', function() {
                        var value = this.value,
                            content = getContent();
                        begin();
                        if (value) {
                            attrs.title = value;
                        } else {
                            delete attrs.title;
                        }
                        if (content) {
                            var titleElement = content.querySelector('.textOverlayTitle');
                            if (value && !titleElement) {
                                titleElement = document.createElement('div');
                                titleElement.className = 'textOverlayTitle';
                                titleElement.setAttribute('role', 'heading');
                                titleElement.setAttribute('aria-level', '3');
                                content.insertBefore(titleElement, content.querySelector('.textOverlayBody'));
                            }
                            if (titleElement) {
                                if (value) { titleElement.textContent = value; } else { titleElement.remove(); }
                            }
                        }
                        wrapper.querySelector('.textTitleColorColumn').style.display = value ? '' : 'none';
                        fitBox();
                        overlay.contentChanged();
                    });
                    titleInput.addEventListener('change', function() {
                        commit('SettingsTextTitle');
                    });

                    // Shape: the panel is rendered anew with what the shape offers
                    wrapper.querySelector('.textShapeSelect').addEventListener('change', function() {
                        begin();
                        var b = ensureBox(true),
                            drawsNothing = !(b.background && b.background !== 'transparent') && !(b.borderWidth > 0);
                        b.shape = this.value;
                        if (b.direction !== undefined && self.shapeDirection(b) !== b.direction) {
                            delete b.direction;
                        }
                        // A shape around text that draws nothing gets a fill, so the change shows
                        if (drawsNothing && b.shape !== 'rectangle') {
                            b.background = '#ffffff';
                        }
                        tidy();
                        overlay.rerenderContent();
                        fitBox();
                        commit('SettingsHotspotShape');
                        wrapper.replaceWith(self.renderShapeControls(overlay));
                    });

                    // Fill and outline
                    var widthInput = wrapper.querySelector('.textBoxField[data-key="borderWidth"]');

                    var setFill = function(color) {
                        if (color === null) {
                            if (attrs.box) { delete attrs.box.background; }
                        } else {
                            ensureBox(true).background = color;
                        }
                        tidy();
                    };
                    var fillControl = this.renderColorSwitch({
                        label:    labels['SettingsShapeFill'],
                        color:    colorValue(box.background, '#ffffff'),
                        on:       hasFill,
                        onInput:  function(color) { begin(); setFill(color); show(); },
                        onChange: function(color) { begin(); setFill(color); show(); commit('SettingsShapeFill'); }
                    });
                    wrapper.querySelector('.textFillColumn').appendChild(fillControl);

                    var setOutline = function(color) {
                        if (color === null) {
                            if (attrs.box) {
                                if (attrs.box.borderWidth > 0) { lastWidth = attrs.box.borderWidth; }
                                attrs.box.borderWidth = 0;
                            }
                        } else {
                            var b = ensureBox(true);
                            b.borderColor = color;
                            if (!(b.borderWidth > 0)) { b.borderWidth = lastWidth; }
                        }
                        widthInput.value = (attrs.box && attrs.box.borderWidth > 0) ? attrs.box.borderWidth : 0;
                        tidy();
                    };
                    var outlineControl = this.renderColorSwitch({
                        label:    labels['SettingsShapeOutline'],
                        color:    colorValue(box.borderColor, '#000000'),
                        on:       box.borderWidth > 0,
                        onInput:  function(color) { begin(); setOutline(color); show(); },
                        onChange: function(color) { begin(); setOutline(color); show(); commit('SettingsShapeOutline'); }
                    });
                    wrapper.querySelector('.textOutlineColumn').appendChild(outlineControl);

                    // Fields: outline width, corner radius, direction, padding, colours
                    wrapper.querySelectorAll('.textBoxField').forEach(function(field) {
                        var key = field.dataset.key;
                        var read = function() {
                            if (field.type !== 'number') { return field.value; }
                            var number = parseFloat(field.value);
                            if (isNaN(number)) { return undefined; }
                            return Math.min(parseFloat(field.max), Math.max(parseFloat(field.min), number));
                        };
                        var apply = function() {
                            var value = read();
                            if (value === undefined) { return false; }
                            begin();
                            var b = ensureBox();
                            b[key] = value;
                            if (key === 'borderWidth') {
                                if (value > 0) {
                                    lastWidth = value;
                                    if (!b.borderColor) { b.borderColor = '#000000'; }
                                }
                                outlineControl.setPaint(value > 0);
                            }
                            tidy();
                            show();
                            return true;
                        };
                        if (field.tagName !== 'SELECT') {
                            field.addEventListener('input', apply);
                        }
                        field.addEventListener('change', function() {
                            if (!apply()) { return; }
                            if (field.type === 'number') { field.value = read(); }
                            commit(fieldLabels[key]);
                        });
                    });

                    wrapper.querySelector('.textBoxShadow').addEventListener('change', function() {
                        begin();
                        if (this.checked) {
                            ensureBox().shadow = true;
                        } else if (attrs.box) {
                            delete attrs.box.shadow;
                        }
                        tidy();
                        show();
                        commit('SettingsTextBoxShadow');
                    });

                    return wrapper;

                },


                /**
                 * See {{#crossLink "Resource/renderBasicTimeControls:method"}}Resource/renderBasicTimeControls(){{/crossLink}}
                 * @method renderTimeControls
                 * @param {Annotation} annotation
                 * @return &#123; controlsContainer: HTMLElement, changeStart: Function, changeEnd: Function &#125;
                 */
                renderTimeControls: function(annotation) {

                    var timeControls = this.renderBasicTimeControls(annotation);

                    timeControls.controlsContainer.querySelector('#AnnotationOptions').append(this.renderTextEditors(annotation));

                    return timeControls;

                },


                /**
                 * The fonts and font sizes the text editors offer: Quill's font and
                 * size formats are limited to these (see registerQuillFormats).
                 * @attribute quillFonts
                 * @type Array
                 */
                quillFonts:     ['Arial', 'Arial Black', 'Courier', 'Courier New', 'Dosis', 'Lucida Console', 'Helvetica', 'Impact', 'Lucida Grande', 'Lucida Sans', 'Montserrat', 'Tahoma', 'Times', 'Times New Roman', 'TitilliumWeb', 'Verdana'],
                quillFontSizes: ['8px', '9px', '10px', '11px', '12px', '13px', '14px', '15px', '16px', '17px', '18px', '20px', '22px', '26px', '28px', '30px', '32px', '34px', '36px', '38px', '40px', '46px', '50px', '60px', '70px'],


                /**
                 * I register Quill's font, size and align formats as inline styles
                 * (not CSS classes), font and size limited to quillFonts and
                 * quillFontSizes. Once per page.
                 * @method registerQuillFormats
                 */
                registerQuillFormats: function() {

                    if (Quill._ftFormatsRegistered) { return; }

                    var FontAttributor = Quill.import('attributors/style/font');
                    if (FontAttributor) {
                        FontAttributor.whitelist = this.quillFonts;
                        Quill.register(FontAttributor, true);
                    }

                    var SizeAttributor = Quill.import('attributors/style/size');
                    if (SizeAttributor) {
                        SizeAttributor.whitelist = this.quillFontSizes;
                        Quill.register(SizeAttributor, true);
                    }

                    var AlignStyle = Quill.import('attributors/style/align');
                    if (AlignStyle) {
                        Quill.register(AlignStyle, true);
                    }

                    Quill._ftFormatsRegistered = true;

                },


                /**
                 * I add a colour input for any colour to a Quill toolbar: it colours
                 * the selection the editor had when the input was opened, and shows
                 * the colour of the selection.
                 * @method addHexColorInput
                 * @param {HTMLElement} toolbar
                 * @param {Quill} quill
                 * @return {HTMLElement} the input
                 */
                addHexColorInput: function(toolbar, quill) {

                    var hexSpan = document.createElement('span');
                    hexSpan.className = 'ql-formats';
                    var colorHexInput = document.createElement('input');
                    colorHexInput.type = 'color';
                    colorHexInput.title = 'Custom color (hex)';
                    colorHexInput.className = 'ql-color-hex';
                    colorHexInput.style.cssText = 'width:26px;height:26px;padding:0;border:none;cursor:pointer;background:none;';
                    hexSpan.appendChild(colorHexInput);
                    toolbar.appendChild(hexSpan);

                    var savedQuillRange = null;
                    colorHexInput.addEventListener('mousedown', function() {
                        savedQuillRange = quill.getSelection();
                    });
                    colorHexInput.addEventListener('input', function() {
                        if (savedQuillRange) {
                            quill.setSelection(savedQuillRange);
                        }
                        quill.format('color', colorHexInput.value, 'user');
                    });

                    quill.on('selection-change', function(range) {
                        if (!range) { return; }
                        var format = quill.getFormat(range);
                        if (typeof format.color === 'string') {
                            colorHexInput.value = format.color;
                        }
                    });

                    return colorHexInput;

                },


                /**
                 * After the text of a text overlay was edited on the video, I bring the
                 * panel's title field and HTML source up to date, in place: the panel
                 * is not rendered anew, so a click that ended the editing still reaches
                 * the control it was meant for.
                 * @method refreshTextControls
                 * @param {Overlay} overlay
                 */
                refreshTextControls: function(overlay) {

                    var editor = overlay._sourceEditor,
                        html   = this.getTextHTML();

                    if (editor && editor.dom.isConnected && editor.state.doc.toString() !== html) {
                        editor._ftSyncing = true;
                        editor.dispatch({
                            changes:     { from: 0, to: editor.state.doc.length, insert: html },
                            annotations: window.FrameTrailCM6.Transaction.addToHistory.of(false)
                        });
                        editor._ftSyncing = false;
                    }

                    var titleInput = overlay._titleInput;
                    if (titleInput && titleInput.isConnected) {
                        titleInput.value = overlay.data.attributes.title || '';
                    }

                    window.oldTextContent = overlay.data.attributes.text;

                },


                /**
                 * I render the text editors: for an annotation a visual editor (Quill)
                 * and its HTML source (CodeMirror); for an overlay, whose text is edited
                 * on the video (TextInlineEditor), only the HTML source, for markup the
                 * visual editor does not offer, in its Advanced Options.
                 * @method renderTextEditors
                 * @param {Object} overlayOrAnnotation
                 * @return &#123; textContentEditorContainer: HTMLElement;
                 */
                renderTextEditors: function(overlayOrAnnotation) {

                    var self = this,
                        isOverlay = !!overlayOrAnnotation.overlayElement;

                    delete window.quillEditor;
                    delete window.htmlCodeEditor;
                    delete window.oldTextContent;

                    window.oldTextContent = overlayOrAnnotation.data.attributes.text;

                    /* Add Panels and Text Areas */

                    var textContentEditorContainer = document.createElement('div');
                    textContentEditorContainer.className = 'textContentEditorContainer';

                    var visualEditorTab = document.createElement('div');
                    visualEditorTab.className = 'textEditorTab';
                    visualEditorTab.textContent = this.labels['SettingsVisualEditor'] + ' (beta)';

                    var htmlEditorTab = document.createElement('div');
                    htmlEditorTab.className = 'textEditorTab';
                    htmlEditorTab.textContent = this.labels['SettingsHTMLEditor'];

                    var visualEditorContent = document.createElement('div');
                    visualEditorContent.className = 'textEditorContent visualEditorContent';

                    var htmlEditorContent = document.createElement('div');
                    htmlEditorContent.className = 'textEditorContent htmlEditorContent';

                    if (isOverlay) {

                        // The text is edited on the video (TextInlineEditor); its HTML source
                        // is an advanced option, open as long as it was left open
                        textContentEditorContainer = document.createElement('details');
                        textContentEditorContainer.className = 'advanced textSourceDetails';
                        textContentEditorContainer.innerHTML = '<summary>' + this.labels['GenericAdvancedOptions'] + '</summary>'
                            + '<div>'
                            + '    <label>' + this.labels['SettingsHTMLEditor'] + ':</label>'
                            + '</div>';
                        textContentEditorContainer.querySelector('div').appendChild(htmlEditorContent);
                        textContentEditorContainer.open = !!overlayOrAnnotation._sourceOpen;
                        textContentEditorContainer.addEventListener('toggle', function() {
                            overlayOrAnnotation._sourceOpen = textContentEditorContainer.open;
                            // Laid out while closed: measure again when shown
                            if (textContentEditorContainer.open && htmlCm6Wrapper._cm6view) {
                                htmlCm6Wrapper._cm6view.requestMeasure();
                            }
                        });

                    } else {

                        visualEditorTab.addEventListener('click', function() {
                            htmlEditorTab.classList.remove('active');
                            htmlEditorContent.style.display = 'none';
                            visualEditorTab.classList.add('active');
                            visualEditorContent.style.display = '';
                            // Sync CodeMirror → Quill on switch to Visual tab
                            if (window.htmlCodeEditor && window.quillEditor) {
                                window.quillEditor.clipboard.dangerouslyPasteHTML(
                                    window.htmlCodeEditor.state.doc.toString()
                                );
                            }
                        });
                        visualEditorTab.click();

                        htmlEditorTab.addEventListener('click', function() {
                            visualEditorTab.classList.remove('active');
                            visualEditorContent.style.display = 'none';
                            htmlEditorTab.classList.add('active');
                            htmlEditorContent.style.display = '';
                            // Not filled from Quill: every edit there reaches the source as it
                            // is made (text-change below), and refilling it here wrote Quill's
                            // version of the markup into the text just for opening the tab
                            if (window.htmlCodeEditor) {
                                window.htmlCodeEditor.requestMeasure();
                            }
                        });

                        textContentEditorContainer.append(visualEditorTab, htmlEditorTab, visualEditorContent, htmlEditorContent);

                    }

                    var textarea = document.createElement('textarea');
                    textarea.textContent = this.getTextHTML();
                    htmlEditorContent.appendChild(textarea);

                    var visualEditorWrapper = document.createElement('div');
                    visualEditorWrapper.className = 'visualEditorWrapper';
                    visualEditorContent.appendChild(visualEditorWrapper);

                    /* Init CodeMirror 6 for Custom HTML */

                    var CM6 = window.FrameTrailCM6;
                    var htmlCm6Wrapper = document.createElement('div');
                    htmlCm6Wrapper.className = 'cm6-wrapper';
                    htmlCm6Wrapper.style.height = '100%';
                    textarea.insertAdjacentElement('afterend', htmlCm6Wrapper);
                    textarea.style.display = 'none';

                    var delayTimer;
                    var textBeforeEdit = overlayOrAnnotation.data.attributes.text || '';
                    var textChanged = false;
                    // An overlay's box may follow its text (auto height): undo restores both
                    var STATE_KEYS = ['attributes', 'position', 'keyframes'];
                    var stateBeforeEdit = isOverlay ? overlayOrAnnotation.snapshotState(STATE_KEYS) : null;

                    window.htmlCodeEditor = new CM6.EditorView({
                        state: CM6.EditorState.create({
                            doc: textarea.value,
                            extensions: [
                                CM6.oneDark,
                                CM6.lineNumbers(),
                                CM6.highlightActiveLine(),
                                CM6.highlightActiveLineGutter(),
                                CM6.drawSelection(),
                                CM6.history(),
                                CM6.keymap.of([].concat(CM6.defaultKeymap, CM6.historyKeymap)),
                                CM6.EditorView.lineWrapping,
                                CM6.StreamLanguage.define(CM6.legacyModes.html),
                                window.FrameTrailCM6Linters.html,
                                CM6.lintGutter(),
                                CM6.EditorView.domEventHandlers({
                                    focus: function() {
                                        textBeforeEdit = overlayOrAnnotation.data.attributes.text || '';
                                        textChanged = false;
                                        if (isOverlay) { stateBeforeEdit = overlayOrAnnotation.snapshotState(STATE_KEYS); }
                                    },
                                    blur: function(evt, view) {
                                        var newText = overlayOrAnnotation.data.attributes.text || '';
                                        if (textChanged && textBeforeEdit !== newText) {
                                            if (isOverlay) {
                                                FrameTrail.module('OverlaysController').registerStateUndo(
                                                    overlayOrAnnotation,
                                                    self.labels['SidebarOverlays'] + ' Text',
                                                    stateBeforeEdit,
                                                    overlayOrAnnotation.snapshotState(STATE_KEYS),
                                                    { rerender: true }
                                                );
                                            } else {
                                                (function(id, oldText, newTxt, labels) {
                                                    var findElement = function() {
                                                        var arr = FrameTrail.module('HypervideoModel').annotations;
                                                        for (var i = 0; i < arr.length; i++) {
                                                            if (arr[i].data.created === id) { return arr[i]; }
                                                        }
                                                        return null;
                                                    };
                                                    FrameTrail.module('UndoManager').register({
                                                        category: 'annotations',
                                                        description: labels['SidebarMyAnnotations'] + ' Text',
                                                        undo: function() {
                                                            var el = findElement();
                                                            if (!el) return;
                                                            el.data.attributes.text = oldText;
                                                            FrameTrail.module('HypervideoModel').newUnsavedChange('annotations');
                                                        },
                                                        redo: function() {
                                                            var el = findElement();
                                                            if (!el) return;
                                                            el.data.attributes.text = newTxt;
                                                            FrameTrail.module('HypervideoModel').newUnsavedChange('annotations');
                                                        }
                                                    });
                                                })(overlayOrAnnotation.data.created, textBeforeEdit, newText, self.labels);
                                            }
                                        }
                                        textBeforeEdit = null;
                                        textChanged = false;
                                    }
                                }),
                                CM6.EditorView.updateListener.of(function(update) {
                                    if (!update.docChanged || update.view._ftSyncing) { return; }

                                    var newHtml = update.state.doc.toString();
                                    textChanged = true;

                                    self.setTextHTML(newHtml);

                                    if (isOverlay) {

                                        // Only the body: title, card style and license block stay
                                        var textDetail = overlayOrAnnotation.overlayElement.querySelector('.resourceDetail');
                                        (textDetail.querySelector('.textOverlayBody') || textDetail.querySelector('.resourceContent') || textDetail).innerHTML = newHtml;
                                        if (overlayOrAnnotation.fitToContent()) {
                                            FrameTrail.module('OverlaysController').refreshMotionControls(overlayOrAnnotation);
                                        }
                                        overlayOrAnnotation.contentChanged();
                                        FrameTrail.module('HypervideoModel').newUnsavedChange('overlays');

                                        if (window.oldTextContent != overlayOrAnnotation.data.attributes.text) {
                                            clearTimeout(delayTimer);
                                            delayTimer = setTimeout(function() {
                                                FrameTrail.triggerEvent('userAction', {
                                                    action: 'OverlayChange',
                                                    overlay: overlayOrAnnotation.data,
                                                    changes: [{ property: 'attributes.text', oldValue: window.oldTextContent, newValue: overlayOrAnnotation.data.attributes.text }]
                                                });
                                                window.oldTextContent = overlayOrAnnotation.data.attributes.text;
                                            }, 3000);
                                        }

                                    } else {

                                        FrameTrail.module('HypervideoModel').newUnsavedChange('annotations');

                                        if (window.oldTextContent != overlayOrAnnotation.data.attributes.text) {
                                            clearTimeout(delayTimer);
                                            delayTimer = setTimeout(function() {
                                                (overlayOrAnnotation.contentViewDetailElements || []).forEach(function(el) {
                                                    (el.jquery ? el[0] : el).querySelector('.resourceDetail').innerHTML = newHtml;
                                                });
                                                (overlayOrAnnotation.contentViewElements || []).forEach(function(el) {
                                                    (el.jquery ? el[0] : el).querySelector('.resourceThumb .resourceTextPreview').innerHTML = newHtml;
                                                });
                                                overlayOrAnnotation.timelineElement.querySelector('.previewWrapper .resourceTextPreview').innerHTML = newHtml;
                                                document.querySelector(FrameTrail.getState('target')).querySelector('.editPropertiesContainer .resourceTextPreview').innerHTML = newHtml;
                                                FrameTrail.triggerEvent('userAction', {
                                                    action: 'AnnotationChange',
                                                    annotation: overlayOrAnnotation.data,
                                                    changes: [{ property: 'attributes.text', oldValue: window.oldTextContent, newValue: overlayOrAnnotation.data.attributes.text }]
                                                });
                                                window.oldTextContent = overlayOrAnnotation.data.attributes.text;
                                            }, 3000);
                                        }

                                    }
                                })
                            ]
                        }),
                        parent: htmlCm6Wrapper
                    });
                    htmlCm6Wrapper._cm6view = window.htmlCodeEditor;

                    if (isOverlay) {
                        overlayOrAnnotation._sourceEditor = window.htmlCodeEditor;
                        return textContentEditorContainer;
                    }

                    /* Init Quill Visual Editor */

                    this.registerQuillFormats();

                    var toolbarOptions = [
                        [{ 'font': this.quillFonts }],
                        [{ 'size': this.quillFontSizes }],
                        ['bold', 'italic', 'underline', 'link'],
                        [{ 'list': 'ordered' }, { 'list': 'bullet' }],
                        [{ 'indent': '-1' }, { 'indent': '+1' }],
                        [{ 'align': [] }]
                    ];

                    var quillContainer = document.createElement('div');
                    quillContainer.className = 'quillEditorContainer';
                    visualEditorWrapper.appendChild(quillContainer);

                    window.quillEditor = new Quill(quillContainer, {
                        modules: { toolbar: toolbarOptions },
                        theme: 'snow'
                    });

                    // Render each font picker item in its own typeface (font-family is inherited by ::before)
                    visualEditorWrapper.querySelectorAll('.ql-font .ql-picker-item').forEach(function(item) {
                        if (item.dataset.value) item.style.fontFamily = item.dataset.value;
                    });

                    // Add hex color input to the toolbar
                    var qlToolbar = visualEditorWrapper.querySelector('.ql-toolbar');
                    if (qlToolbar) {
                        this.addHexColorInput(qlToolbar, window.quillEditor);
                    }

                    // Set initial content — text is stored HTML-escaped, so decode first
                    window.quillEditor.clipboard.dangerouslyPasteHTML(this.getTextHTML());

                    // Quill → CodeMirror 6 sync
                    window.quillEditor.on('text-change', function(delta, oldDelta, source) {
                        if (source === 'user' && window.htmlCodeEditor) {
                            var doc = window.htmlCodeEditor.state.doc;
                            window.htmlCodeEditor.dispatch({
                                changes: { from: 0, to: doc.length, insert: window.quillEditor.root.innerHTML },
                                annotations: CM6.Transaction.userEvent.of('setValue')
                            });
                        }
                    });


                    return textContentEditorContainer;

                },

                getDisplayLabel: function() {
                    if (this.resourceData.attributes && this.resourceData.attributes.text) {
                        // attributes.text is HTML-escaped HTML; two-step decode:
                        // step 1: decode HTML entities → real HTML string
                        var _step1 = document.createElement('div');
                        _step1.innerHTML = this.resourceData.attributes.text;
                        // step 2: parse real HTML, extract plain text
                        var _step2 = document.createElement('div');
                        _step2.innerHTML = _step1.textContent;
                        var plainText = _step2.textContent.trim();
                        return plainText.substring(0, 50) || this.resourceData.name || 'Text';
                    }
                    return this.resourceData.name || 'Text';
                }



            }



        }
    }


);
