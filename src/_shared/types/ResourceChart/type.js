/**
 * @module Shared
 */


/**
 * I am the type definition of a ResourceChart: an animated bar chart, line
 * chart, donut chart or progress ring, built as SVG from "Label: value" lines.
 *
 * * Chart Resources only appear in the 'Custom Overlay' gallery
 *   and are not listed in the ResourceManager.
 *
 * * The chart draws itself inside the overlay's span, starting at its start
 *   time, driven by the OverlayAnimator (see animateContent).
 *
 * Adapted from the chart-story and conic-progress-ring components of
 * HyperFrames (https://github.com/heygen-com/hyperframes), Copyright 2026
 * HeyGen, Inc., Apache License 2.0, modified for FrameTrail (no GSAP; SVG built
 * here, motion in CSS on the video-synced clock).
 *
 * @class ResourceChart
 * @category TypeDefinition
 * @extends Resource
 */



FrameTrail.defineType(

    'ResourceChart',

    function (FrameTrail) {

        var SVG_NS = 'http://www.w3.org/2000/svg';

        function svgElement(name, attributes) {
            var element = document.createElementNS(SVG_NS, name);
            for (var key in attributes) {
                if (attributes[key] !== undefined && attributes[key] !== null) {
                    element.setAttribute(key, attributes[key]);
                }
            }
            return element;
        }

        function round(value) {
            return Math.round(value * 100) / 100;
        }

        return {
            parent: 'Resource',
            constructor: function(resourceData){
                this.resourceData = resourceData;
            },
            prototype: {

                resourceData:   {},
                iconClass:      'icon-chart-bar',


                /**
                 * I parse a single number, accepting "1,250", "1.250,5" style
                 * grouping and a decimal comma.
                 * @method parseNumber
                 * @param {String} text
                 * @return {Number}
                 */
                parseNumber: function(text) {

                    var t = String(text).replace(/\s/g, '');
                    if (/^-?\d{1,3}(,\d{3})+(\.\d+)?$/.test(t)) { t = t.replace(/,/g, ''); }
                    else if (/^-?\d{1,3}(\.\d{3})+(,\d+)?$/.test(t)) { t = t.replace(/\./g, '').replace(',', '.'); }
                    else if (/^-?\d+,\d+$/.test(t)) { t = t.replace(',', '.'); }
                    return parseFloat(t);

                },

                /**
                 * I parse the data text: one "Label: value" per line (a line with only
                 * a number has an empty label).
                 * @method parseData
                 * @param {String} text
                 * @return {Array} [{ label, value }]
                 */
                parseData: function(text) {

                    var self = this,
                        items = [];

                    String(text || '').split(/\r?\n/).forEach(function(line) {
                        line = line.trim();
                        if (!line) { return; }
                        var match = /^(.*?)\s*[:=]\s*([-\d.,\s]+)$/.exec(line),
                            label = match ? match[1].trim() : '',
                            value = self.parseNumber(match ? match[2] : line);
                        if (isFinite(value)) {
                            items.push({ label: label, value: value });
                        }
                    });

                    return items;

                },

                /**
                 * I return my attributes with defaults applied.
                 * @method getSettings
                 * @return {Object}
                 */
                getSettings: function() {

                    var a = this.resourceData.attributes || {},
                        highlight = parseInt(a.highlight, 10);

                    return {
                        chartType:  (['bars', 'line', 'donut', 'ring'].indexOf(a.chartType) >= 0) ? a.chartType : 'bars',
                        items:      this.parseData(a.data),
                        unit:       a.unit || '',
                        color:      a.color || '#4cc3ff',
                        textColor:  a.textColor || '#ffffff',
                        highlight:  isNaN(highlight) ? -1 : highlight,
                        showValues: a.showValues !== false,
                        duration:   Math.max(0, parseFloat(a.duration) || 1500)
                    };

                },

                formatValue: function(value, unit) {

                    var Localization = FrameTrail.module('Localization'),
                        text;
                    try {
                        text = new Intl.NumberFormat(Localization ? Localization.language : undefined, { maximumFractionDigits: 2 }).format(value);
                    } catch (e) {
                        text = String(value);
                    }
                    return text + (unit || '');

                },


                /**
                 * I render the chart in its final state; animateContent() makes it
                 * draw itself while playing.
                 *
                 * @method renderContent
                 * @return HTMLElement
                 */
                renderContent: function() {

                    var settings = this.getSettings();

                    var resourceDetail = document.createElement('div');
                    resourceDetail.className = 'resourceDetail';
                    resourceDetail.dataset.type = 'chart';
                    resourceDetail.dataset.chartType = settings.chartType;

                    var resourceContent = document.createElement('div');
                    resourceContent.className = 'resourceContent';
                    resourceContent.style.color = settings.textColor;

                    var svg;
                    switch (settings.chartType) {
                        case 'line':  svg = this.renderLine(settings);  break;
                        case 'donut': svg = this.renderDonut(settings); break;
                        case 'ring':  svg = this.renderRing(settings);  break;
                        default:      svg = this.renderBars(settings);
                    }

                    resourceContent.appendChild(svg);
                    resourceDetail.appendChild(resourceContent);

                    return resourceDetail;

                },

                itemOpacity: function(settings, index) {

                    return (settings.highlight < 0 || settings.highlight === index) ? 1 : 0.45;

                },

                renderBars: function(settings) {

                    var self = this,
                        items = settings.items,
                        width = 400, height = 300,
                        top = 34, bottom = 40, side = 12,
                        innerHeight = height - top - bottom,
                        slot = (width - 2 * side) / Math.max(1, items.length),
                        barWidth = slot * 0.62,
                        max = Math.max.apply(null, items.map(function(item) { return item.value; }).concat([0])) || 1,
                        svg = svgElement('svg', { viewBox: '0 0 ' + width + ' ' + height, preserveAspectRatio: 'xMidYMid meet', 'class': 'chartSvg', role: 'img' });

                    items.forEach(function(item, idx) {
                        var h = Math.max(0, item.value) / max * innerHeight,
                            x = side + slot * idx + (slot - barWidth) / 2,
                            y = top + innerHeight - h;
                        svg.appendChild(svgElement('rect', {
                            'class': 'chartBar', x: round(x), y: round(y), width: round(barWidth), height: round(Math.max(0.5, h)),
                            rx: 4, fill: settings.color, 'fill-opacity': self.itemOpacity(settings, idx)
                        }));
                        if (settings.showValues) {
                            var value = svgElement('text', { 'class': 'chartValue', x: round(x + barWidth / 2), y: round(y - 8), 'text-anchor': 'middle' });
                            value.textContent = self.formatValue(item.value, settings.unit);
                            svg.appendChild(value);
                        }
                        var label = svgElement('text', { 'class': 'chartLabel', x: round(x + barWidth / 2), y: height - bottom + 24, 'text-anchor': 'middle' });
                        label.textContent = item.label;
                        svg.appendChild(label);
                    });

                    return svg;

                },

                renderLine: function(settings) {

                    var self = this,
                        items = settings.items,
                        width = 400, height = 300,
                        top = 34, bottom = 40, side = 24,
                        innerHeight = height - top - bottom,
                        values = items.map(function(item) { return item.value; }),
                        max = Math.max.apply(null, values.concat([0])),
                        min = Math.min.apply(null, values.concat([0])),
                        range = (max - min) || 1,
                        step = (items.length > 1) ? (width - 2 * side) / (items.length - 1) : 0,
                        points = items.map(function(item, idx) {
                            return [side + step * idx + (items.length > 1 ? 0 : (width - 2 * side) / 2), top + innerHeight - (item.value - min) / range * innerHeight];
                        }),
                        svg = svgElement('svg', { viewBox: '0 0 ' + width + ' ' + height, preserveAspectRatio: 'xMidYMid meet', 'class': 'chartSvg', role: 'img' });

                    if (points.length) {
                        var line = points.map(function(p, idx) { return (idx ? 'L' : 'M') + round(p[0]) + ',' + round(p[1]); }).join(' '),
                            baseline = top + innerHeight,
                            area = line + ' L' + round(points[points.length - 1][0]) + ',' + baseline + ' L' + round(points[0][0]) + ',' + baseline + ' Z';
                        svg.appendChild(svgElement('path', { 'class': 'chartArea', d: area, fill: settings.color, 'fill-opacity': 0.15 }));
                        svg.appendChild(svgElement('path', {
                            'class': 'chartLine', d: line, fill: 'none', stroke: settings.color, 'stroke-width': 4,
                            'stroke-linecap': 'round', 'stroke-linejoin': 'round', pathLength: 1
                        }));
                    }

                    points.forEach(function(p, idx) {
                        var highlighted = (settings.highlight === idx);
                        svg.appendChild(svgElement('circle', {
                            'class': 'chartDot', cx: round(p[0]), cy: round(p[1]), r: highlighted ? 8 : 5,
                            fill: highlighted ? settings.textColor : settings.color, stroke: settings.color, 'stroke-width': 3
                        }));
                        if (settings.showValues) {
                            var value = svgElement('text', { 'class': 'chartValue', x: round(p[0]), y: round(p[1] - 14), 'text-anchor': 'middle' });
                            value.textContent = self.formatValue(items[idx].value, settings.unit);
                            svg.appendChild(value);
                        }
                        var label = svgElement('text', { 'class': 'chartLabel', x: round(p[0]), y: height - bottom + 24, 'text-anchor': 'middle' });
                        label.textContent = items[idx].label;
                        svg.appendChild(label);
                    });

                    return svg;

                },

                renderDonut: function(settings) {

                    var self = this,
                        items = settings.items.filter(function(item) { return item.value > 0; }),
                        total = items.reduce(function(sum, item) { return sum + item.value; }, 0) || 1,
                        svg = svgElement('svg', { viewBox: '0 0 200 240', preserveAspectRatio: 'xMidYMid meet', 'class': 'chartSvg', role: 'img' }),
                        group = svgElement('g', { transform: 'rotate(-90 100 100)' }),
                        start = 0;

                    svg.appendChild(svgElement('circle', { cx: 100, cy: 100, r: 70, fill: 'none', stroke: settings.color, 'stroke-opacity': 0.12, 'stroke-width': 28 }));

                    items.forEach(function(item, idx) {
                        var length = item.value / total * 100,
                            visible = Math.max(0, length - (items.length > 1 ? 0.6 : 0)),
                            segment = svgElement('circle', {
                                'class': 'chartArc', cx: 100, cy: 100, r: 70, fill: 'none', pathLength: 100,
                                stroke: settings.color, 'stroke-opacity': Math.max(0.35, 1 - idx * 0.2) * (settings.highlight < 0 || settings.highlight === idx ? 1 : 0.6),
                                'stroke-width': 28, 'stroke-dasharray': round(visible) + ' 100', 'stroke-dashoffset': round(-start)
                            });
                        segment.style.setProperty('--arc-len', round(visible));
                        segment.dataset.start = start;
                        segment.dataset.length = length;
                        group.appendChild(segment);
                        start += length;
                    });
                    svg.appendChild(group);

                    var focus = items[settings.highlight] || items[0];
                    if (focus && settings.showValues) {
                        var value = svgElement('text', { 'class': 'chartCenterValue', x: 100, y: 108, 'text-anchor': 'middle' });
                        value.textContent = self.formatValue(Math.round(focus.value / total * 1000) / 10, '%');
                        svg.appendChild(value);
                        var label = svgElement('text', { 'class': 'chartCenterLabel', x: 100, y: 128, 'text-anchor': 'middle' });
                        label.textContent = focus.label;
                        svg.appendChild(label);
                    }

                    var legendY = 222, legendX = 100 - (items.length * 60) / 2 + 30;
                    items.slice(0, 4).forEach(function(item, idx) {
                        var legend = svgElement('text', { 'class': 'chartLabel', x: round(legendX + idx * 60), y: legendY, 'text-anchor': 'middle' });
                        legend.textContent = item.label;
                        svg.appendChild(legend);
                    });

                    return svg;

                },

                renderRing: function(settings) {

                    var item  = settings.items[0] || { label: '', value: 0 },
                        value = Math.max(0, Math.min(100, item.value)),
                        svg   = svgElement('svg', { viewBox: '0 0 200 200', preserveAspectRatio: 'xMidYMid meet', 'class': 'chartSvg', role: 'img' }),
                        group = svgElement('g', { transform: 'rotate(-90 100 100)' });

                    svg.appendChild(svgElement('circle', { cx: 100, cy: 100, r: 78, fill: 'none', stroke: settings.color, 'stroke-opacity': 0.18, 'stroke-width': 18 }));

                    var arc = svgElement('circle', {
                        'class': 'chartArc', cx: 100, cy: 100, r: 78, fill: 'none', pathLength: 100, stroke: settings.color,
                        'stroke-width': 18, 'stroke-linecap': 'round', 'stroke-dasharray': round(value) + ' 100'
                    });
                    arc.style.setProperty('--arc-len', round(value));
                    group.appendChild(arc);
                    svg.appendChild(group);

                    var number = svgElement('text', { 'class': 'chartCenterValue chartRingValue', x: 100, y: (item.label ? 104 : 114), 'text-anchor': 'middle' });
                    number.textContent = this.formatValue(item.value, settings.unit);
                    svg.appendChild(number);

                    if (item.label) {
                        var label = svgElement('text', { 'class': 'chartCenterLabel', x: 100, y: 132, 'text-anchor': 'middle' });
                        label.textContent = item.label;
                        svg.appendChild(label);
                    }

                    return svg;

                },


                /**
                 * OverlayAnimator hook: the chart draws itself within `duration`,
                 * starting at the overlay's start time.
                 *
                 * @method animateContent
                 * @param {HTMLElement} resourceDetail
                 * @param {Object} ctx
                 * @return {Object|null}
                 */
                animateContent: function(resourceDetail, ctx) {

                    if (ctx.reducedMotion) { return null; }

                    var self     = this,
                        settings = this.getSettings(),
                        duration = settings.duration,
                        start    = ctx.leadInMs,
                        animate  = function(element, name, ms, ease, delay) {
                            element.style.animation = ctx.entry(name, ms, ease, delay, 1, 'both');
                        };

                    if (settings.chartType === 'bars') {
                        var bars = resourceDetail.querySelectorAll('.chartBar'),
                            count = Math.max(1, bars.length),
                            barMs = duration * 0.5,
                            stagger = (count > 1) ? (duration - barMs) / (count - 1) : 0;
                        Array.prototype.forEach.call(bars, function(bar, idx) {
                            animate(bar, 'ftChartGrow', barMs, 'power3Out', start + idx * stagger);
                        });
                        Array.prototype.forEach.call(resourceDetail.querySelectorAll('.chartValue'), function(value, idx) {
                            animate(value, 'ftChartFade', 250, 'easeOut', start + idx * stagger + barMs * 0.7);
                        });
                        return null;
                    }

                    if (settings.chartType === 'line') {
                        var drawMs = duration * 0.8,
                            dots = resourceDetail.querySelectorAll('.chartDot'),
                            lastIndex = Math.max(1, dots.length - 1);
                        var line = resourceDetail.querySelector('.chartLine'),
                            area = resourceDetail.querySelector('.chartArea');
                        if (line) { animate(line, 'ftChartDraw', drawMs, 'easeInOut', start); }
                        if (area) { animate(area, 'ftChartFade', duration * 0.4, 'easeOut', start + duration * 0.6); }
                        Array.prototype.forEach.call(dots, function(dot, idx) {
                            animate(dot, 'ftChartPop', 300, 'backOut', start + drawMs * (idx / lastIndex));
                        });
                        Array.prototype.forEach.call(resourceDetail.querySelectorAll('.chartValue'), function(value, idx) {
                            animate(value, 'ftChartFade', 250, 'easeOut', start + drawMs * (idx / lastIndex) + 150);
                        });
                        return null;
                    }

                    var arcs = resourceDetail.querySelectorAll('.chartArc');
                    Array.prototype.forEach.call(arcs, function(arc) {
                        var arcStart  = parseFloat(arc.dataset.start || 0),
                            arcLength = parseFloat(arc.dataset.length || 100);
                        if (settings.chartType === 'ring') {
                            animate(arc, 'ftChartArc', duration, 'power2Out', start);
                        } else {
                            animate(arc, 'ftChartArc', Math.max(1, duration * arcLength / 100), 'linear', start + duration * arcStart / 100);
                        }
                    });
                    Array.prototype.forEach.call(resourceDetail.querySelectorAll('.chartCenterValue, .chartCenterLabel'), function(text) {
                        if (!text.classList.contains('chartRingValue')) {
                            animate(text, 'ftChartFade', 300, 'easeOut', start + duration * 0.8);
                        }
                    });

                    var ringValue = resourceDetail.querySelector('.chartRingValue');
                    if (settings.chartType !== 'ring' || !ringValue) { return null; }

                    var item = settings.items[0] || { value: 0 },
                        ease = ctx.easeFn('power2Out'),
                        last = null;

                    return {
                        update: function(localMs) {
                            var p = (duration > 0) ? Math.max(0, Math.min(1, localMs / duration)) : 1,
                                text = self.formatValue(Math.round(item.value * ease(p)), settings.unit);
                            if (text !== last) {
                                ringValue.textContent = text;
                                last = text;
                            }
                        },
                        destroy: function() {
                            ringValue.textContent = self.formatValue(item.value, settings.unit);
                        }
                    };

                },


                /**
                 * @method renderThumb
                 * @return thumbElement
                 */
                renderThumb: function() {

                    var thumb = document.createElement('div');
                    thumb.className = 'resourceThumb';
                    thumb.dataset.type = 'chart';
                    thumb.innerHTML = '<div class="resourceOverlay"><div class="resourceIcon"><span class="icon-chart-bar"></span></div></div>'
                                    + '<div class="resourceTitle"></div>';
                    thumb.querySelector('.resourceTitle').textContent = this.labels['ResourceTypeChart'];
                    return thumb;

                },

                getDisplayLabel: function() {

                    return this.resourceData.name || this.labels['ResourceTypeChart'];

                },


                /**
                 * See {{#crossLink "Resource/renderBasicPropertiesControls:method"}}Resource/renderBasicPropertiesControls(){{/crossLink}}
                 * @method renderPropertiesControls
                 * @param {Overlay} overlay
                 */
                renderPropertiesControls: function(overlay) {

                    var labels = this.labels,
                        basicControls = this.renderBasicPropertiesControls(overlay),
                        items = this.getSettings().items;

                    var highlightOptions = [{ value: -1, label: labels['SettingsChartHighlightNone'] }].concat(items.map(function(item, idx) {
                        return { value: idx, label: item.label || String(idx + 1) };
                    }));

                    var form = this.renderAttributeForm(overlay, [
                        [
                            { key: 'chartType', type: 'select', labelKey: 'SettingsChartType', column: 6, options: [
                                { value: 'bars',  label: labels['CustomOverlayBarChart'] },
                                { value: 'line',  label: labels['CustomOverlayLineChart'] },
                                { value: 'donut', label: labels['CustomOverlayDonutChart'] },
                                { value: 'ring',  label: labels['CustomOverlayProgressRing'] }
                            ] },
                            { key: 'unit', type: 'text', labelKey: 'SettingsChartUnit', column: 6 }
                        ],
                        [
                            { key: 'data', type: 'textarea', labelKey: 'SettingsChartData', column: 12, rows: 5, hintKey: 'MessageChartData' }
                        ],
                        [
                            { key: 'color',     type: 'color',  labelKey: 'SettingsChartColor',     column: 4 },
                            { key: 'textColor', type: 'color',  labelKey: 'SettingsChartTextColor', column: 4 },
                            { key: 'highlight', type: 'select', labelKey: 'SettingsChartHighlight', column: 4, numeric: true, options: highlightOptions }
                        ],
                        [
                            { key: 'showValues', type: 'switch', labelKey: 'SettingsChartShowValues', column: 6 },
                            { key: 'duration',   type: 'number', labelKey: 'SettingsAnimationDurationMs', column: 6, min: 0, max: 60000, step: 100 }
                        ]
                    ]);

                    basicControls.controlsContainer.querySelector('#OverlayOptions').prepend(form);

                    return basicControls;

                }

            }

        }
    }

);
