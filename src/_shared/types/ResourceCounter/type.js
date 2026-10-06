/**
 * @module Shared
 */


/**
 * I am the type definition of a ResourceCounter: an animated number
 * (e.g. "0 → 1,250 participants").
 *
 * * Counter Resources only appear in the 'Custom Overlay' gallery
 *   and are not listed in the ResourceManager.
 *
 * * Two styles: 'count' (the number counts up, formatted in the UI language) and
 *   'roll' (slot-machine digits rolling into place, pure CSS).
 *
 * The counting happens inside the overlay's span, starting at its start time,
 * driven by the OverlayAnimator (see animateContent).
 *
 * Adapted from the count-up and number-wheel components of HyperFrames
 * (https://github.com/heygen-com/hyperframes), Copyright 2026 HeyGen, Inc.,
 * Apache License 2.0, modified for FrameTrail (no GSAP; CSS + video-synced clock).
 *
 * @class ResourceCounter
 * @category TypeDefinition
 * @extends Resource
 */



FrameTrail.defineType(

    'ResourceCounter',

    function (FrameTrail) {
        return {
            parent: 'Resource',
            constructor: function(resourceData){
                this.resourceData = resourceData;
            },
            prototype: {

                resourceData:   {},
                iconClass:      'icon-hashtag',


                /**
                 * I return my attributes with defaults applied.
                 * @method getSettings
                 * @return {Object}
                 */
                getSettings: function() {

                    var a = this.resourceData.attributes || {},
                        num = function(v, d) { var n = parseFloat(v); return isFinite(n) ? n : d; };

                    return {
                        from:     num(a.from, 0),
                        to:       num(a.to, 100),
                        decimals: Math.max(0, Math.min(4, Math.round(num(a.decimals, 0)))),
                        prefix:   a.prefix || '',
                        suffix:   a.suffix || '',
                        duration: Math.max(0, num(a.duration, 1500)),
                        ease:     a.ease || 'power2Out',
                        style:    (a.style === 'roll') ? 'roll' : 'count',
                        color:    a.color || '#ffffff',
                        weight:   num(a.weight, 700),
                        align:    (['left', 'center', 'right'].indexOf(a.align) >= 0) ? a.align : 'center'
                    };

                },

                /**
                 * I format a number in the UI language.
                 * @method formatNumber
                 * @param {Number} value
                 * @param {Number} decimals
                 * @return {String}
                 */
                formatNumber: function(value, decimals) {

                    var Localization = FrameTrail.module('Localization'),
                        locale = Localization ? Localization.language : undefined;

                    try {
                        return new Intl.NumberFormat(locale || undefined, {
                            minimumFractionDigits: decimals,
                            maximumFractionDigits: decimals
                        }).format(value);
                    } catch (e) {
                        return value.toFixed(decimals);
                    }

                },


                /**
                 * I render my content: the final value (the rest pose), which the
                 * OverlayAnimator animates from the start value while playing.
                 *
                 * @method renderContent
                 * @return HTMLElement
                 */
                renderContent: function() {

                    var settings = this.getSettings();

                    var resourceDetail = document.createElement('div');
                    resourceDetail.className = 'resourceDetail';
                    resourceDetail.dataset.type = 'counter';

                    var resourceContent = document.createElement('div');
                    resourceContent.className = 'resourceContent';
                    resourceContent.style.justifyContent = { left: 'flex-start', center: 'center', right: 'flex-end' }[settings.align];

                    var valueElement = document.createElement('div');
                    valueElement.className = 'counterValue';
                    valueElement.style.color = settings.color;
                    valueElement.style.fontWeight = settings.weight;

                    var finalText = settings.prefix + this.formatNumber(settings.to, settings.decimals) + settings.suffix;
                    valueElement.style.setProperty('--counter-chars', Math.max(1, finalText.length));

                    var prefix = document.createElement('span');
                    prefix.className = 'counterPrefix';
                    prefix.textContent = settings.prefix;

                    var number = document.createElement('span');
                    number.className = 'counterNumber';

                    var suffix = document.createElement('span');
                    suffix.className = 'counterSuffix';
                    suffix.textContent = settings.suffix;

                    if (settings.style === 'roll') {
                        this.buildRoll(number, settings);
                    } else {
                        number.textContent = this.formatNumber(settings.to, settings.decimals);
                    }

                    valueElement.append(prefix, number, suffix);
                    resourceContent.appendChild(valueElement);
                    resourceDetail.appendChild(resourceContent);

                    return resourceDetail;

                },

                /**
                 * I build rolling digit columns for the final value. Each digit strip
                 * holds 0–9 three times; it rolls from the start value's digit through
                 * two full turns to the final digit (CSS custom properties per column).
                 *
                 * @method buildRoll
                 * @param {HTMLElement} number
                 * @param {Object} settings
                 */
                buildRoll: function(number, settings) {

                    var finalText = this.formatNumber(settings.to, settings.decimals),
                        fromText  = this.formatNumber(settings.from, settings.decimals),
                        finalDigits = finalText.replace(/\D/g, ''),
                        fromDigits  = fromText.replace(/\D/g, ''),
                        digitIndex  = 0,
                        strip = '';

                    for (var n = 0; n < 30; n++) {
                        strip += '<span>' + (n % 10) + '</span>';
                    }

                    // Align the start value's digits to the right of the final digits
                    while (fromDigits.length < finalDigits.length) { fromDigits = '0' + fromDigits; }
                    fromDigits = fromDigits.slice(-finalDigits.length);

                    Array.prototype.forEach.call(finalText, function(character) {
                        if (/\d/.test(character)) {
                            var column = document.createElement('span');
                            column.className = 'counterRollColumn';
                            column.innerHTML = '<span class="counterRollStrip">' + strip + '</span>';
                            var target = 20 + parseInt(character, 10),
                                start  = parseInt(fromDigits.charAt(digitIndex), 10) || 0;
                            column.style.setProperty('--roll-from', (-start) + 'em');
                            column.style.setProperty('--roll-to', (-target) + 'em');
                            column.querySelector('.counterRollStrip').style.translate = '0 ' + (-target) + 'em';
                            number.appendChild(column);
                            digitIndex++;
                        } else {
                            var separator = document.createElement('span');
                            separator.className = 'counterRollSeparator';
                            separator.textContent = character;
                            number.appendChild(separator);
                        }
                    });

                },

                /**
                 * OverlayAnimator hook: I count (or roll) from the start value to the
                 * final value within `duration`, starting at the overlay's start time.
                 *
                 * @method animateContent
                 * @param {HTMLElement} resourceDetail
                 * @param {Object} ctx
                 * @return {Object|null}
                 */
                animateContent: function(resourceDetail, ctx) {

                    var self     = this,
                        settings = this.getSettings(),
                        number   = resourceDetail.querySelector('.counterNumber');

                    if (!number || ctx.reducedMotion) { return null; }

                    if (settings.style === 'roll') {
                        var columns = number.querySelectorAll('.counterRollColumn'),
                            count = columns.length;
                        Array.prototype.forEach.call(columns, function(column, idx) {
                            // Rightmost digit first, like a mechanical counter
                            var delay = ctx.leadInMs + (count - 1 - idx) * 70;
                            column.querySelector('.counterRollStrip').style.animation =
                                ctx.entry('ftCounterRoll', settings.duration, settings.ease, delay, 1, 'both');
                        });
                        return null;
                    }

                    var ease = ctx.easeFn(settings.ease),
                        last = null;

                    return {
                        update: function(localMs) {
                            var p = (settings.duration > 0) ? Math.max(0, Math.min(1, localMs / settings.duration)) : 1,
                                value = settings.from + (settings.to - settings.from) * ease(p),
                                text = self.formatNumber(value, settings.decimals);
                            if (text !== last) {
                                number.textContent = text;
                                last = text;
                            }
                        },
                        destroy: function() {
                            number.textContent = self.formatNumber(settings.to, settings.decimals);
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
                    thumb.dataset.type = 'counter';
                    thumb.innerHTML = '<div class="resourceOverlay"><div class="resourceIcon"><span class="icon-hashtag"></span></div></div>'
                                    + '<div class="resourceTitle"></div>';
                    thumb.querySelector('.resourceTitle').textContent = this.labels['ResourceTypeCounter'];
                    return thumb;

                },

                getDisplayLabel: function() {

                    var settings = this.getSettings();
                    return settings.prefix + this.formatNumber(settings.to, settings.decimals) + settings.suffix;

                },


                /**
                 * See {{#crossLink "Resource/renderBasicPropertiesControls:method"}}Resource/renderBasicPropertiesControls(){{/crossLink}}
                 * @method renderPropertiesControls
                 * @param {Overlay} overlay
                 */
                renderPropertiesControls: function(overlay) {

                    var labels = this.labels,
                        basicControls = this.renderBasicPropertiesControls(overlay),
                        Lib = FrameTrail.module('AnimationLibrary');

                    var easeOptions = Lib.EASE_DEFINITIONS.filter(function(def) {
                        return def.group === 'Basic' || def.group === 'Power2' || def.group === 'Expo' || def.group === 'Spring';
                    }).map(function(def) {
                        return { value: def.id, label: labels[Lib.EASE_GROUP_LABELS[def.group]] + ' · ' + labels[def.labelKey] };
                    });

                    var form = this.renderAttributeForm(overlay, [
                        [
                            { key: 'from',     type: 'number', labelKey: 'SettingsCounterFrom',     column: 4, step: 'any' },
                            { key: 'to',       type: 'number', labelKey: 'SettingsCounterTo',       column: 4, step: 'any' },
                            { key: 'decimals', type: 'number', labelKey: 'SettingsCounterDecimals', column: 4, min: 0, max: 4, step: 1 }
                        ],
                        [
                            { key: 'prefix',   type: 'text',   labelKey: 'SettingsCounterPrefix',   column: 6 },
                            { key: 'suffix',   type: 'text',   labelKey: 'SettingsCounterSuffix',   column: 6 }
                        ],
                        [
                            { key: 'style', type: 'select', labelKey: 'SettingsCounterStyle', column: 4, options: [
                                { value: 'count', label: labels['SettingsCounterStyleCount'] },
                                { value: 'roll',  label: labels['SettingsCounterStyleRoll'] }
                            ] },
                            { key: 'duration', type: 'number', labelKey: 'SettingsAnimationDurationMs', column: 4, min: 0, max: 60000, step: 100 },
                            { key: 'ease',     type: 'select', labelKey: 'SettingsAnimationEase', column: 4, options: easeOptions }
                        ],
                        [
                            { key: 'color',  type: 'color',  labelKey: 'SettingsCounterColor', column: 4 },
                            { key: 'weight', type: 'select', labelKey: 'SettingsCounterWeight', column: 4, numeric: true, options: [
                                { value: 400, label: '400' }, { value: 600, label: '600' }, { value: 700, label: '700' }, { value: 800, label: '800' }
                            ] },
                            { key: 'align', type: 'select', labelKey: 'SettingsCounterAlign', column: 4, options: [
                                { value: 'left',   label: labels['AlignLeft'] },
                                { value: 'center', label: labels['AlignCenter'] },
                                { value: 'right',  label: labels['AlignRight'] }
                            ] }
                        ]
                    ]);

                    basicControls.controlsContainer.querySelector('#OverlayOptions').prepend(form);

                    return basicControls;

                }

            }

        }
    }

);
