/**
 * @module Player
 */


/**
 * I am the OverlayAnimationEditor. I render the "Animation" tab of an overlay's
 * properties panel (see Resource.renderBasicPropertiesControls): entrance,
 * while-shown loop and exit presets with duration and easing, preset parameters,
 * and (for text overlays) a text reveal. Everything is written to
 * attributes.animation; the first edit migrates the legacy fields animationIn /
 * animationOut / animationDuration away.
 *
 * I also own the menu of a box-motion keyframe diamond on the timeline (easing
 * of the segment to the next keyframe, delete). Keyframes themselves are set
 * with the keyframe toggle next to the selected overlay (see Overlay).
 *
 * @class OverlayAnimationEditor
 * @static
 */

FrameTrail.defineModule('OverlayAnimationEditor', function(FrameTrail){

    var labels = FrameTrail.module('Localization').labels,
        Lib    = FrameTrail.module('AnimationLibrary') || FrameTrail.initModule('AnimationLibrary');


    /* ------------------------------------------------------------------ */
    /*  Helpers                                                           */
    /* ------------------------------------------------------------------ */

    function el(html) {
        var wrapper = document.createElement('div');
        wrapper.innerHTML = html.trim();
        return wrapper.firstElementChild;
    }

    function escapeAttr(value) {
        return String(value).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
    }

    function controller() {
        return FrameTrail.module('OverlaysController');
    }

    function presetOptions(phase, overlayType, selected, noneLabel) {
        var html = '<option value="">' + noneLabel + '</option>';
        Lib.listPresets(phase, overlayType).forEach(function(preset) {
            html += '<option value="' + preset.id + '"' + (preset.id === selected ? ' selected' : '') + '>'
                  + labels[preset.labelKey] + '</option>';
        });
        return html;
    }

    function easeOptions(selected) {
        var html = '', group = null;
        Lib.EASE_DEFINITIONS.forEach(function(def) {
            if (def.group !== group) {
                if (group !== null) { html += '</optgroup>'; }
                group = def.group;
                html += '<optgroup label="' + escapeAttr(labels[Lib.EASE_GROUP_LABELS[group]]) + '">';
            }
            html += '<option value="' + def.id + '"' + (def.id === selected ? ' selected' : '') + '>'
                  + labels[def.labelKey] + '</option>';
        });
        return html + '</optgroup>';
    }

    /**
     * The overlay's animation in storage format (plain object, phases only when set).
     */
    function storedAnimation(overlay) {
        var spec = Lib.normalizeAnimation(overlay.data.attributes),
            stored = {};
        ['in', 'emphasis', 'out', 'text'].forEach(function(phase) {
            var s = spec[phase];
            if (!s) { return; }
            var copy = { preset: s.preset, duration: s.duration, ease: s.ease };
            if (s.params && Object.keys(s.params).length) { copy.params = JSON.parse(JSON.stringify(s.params)); }
            if (phase === 'emphasis') { copy.iterations = s.iterations; }
            if (phase === 'text') { copy.mode = s.mode; copy.stagger = s.stagger; }
            stored[phase] = copy;
        });
        return stored;
    }

    /**
     * I apply a change to the overlay's animation (undoable) and refresh it.
     */
    function writeAnimation(overlay, mutate) {

        var before    = overlay.snapshotState(['attributes']),
            attrs     = overlay.data.attributes,
            animation = storedAnimation(overlay);

        mutate(animation);

        delete attrs.animationIn;
        delete attrs.animationOut;
        delete attrs.animationDuration;

        if (Object.keys(animation).length) {
            attrs.animation = animation;
        } else {
            delete attrs.animation;
        }

        // A hotspot draws its outline as SVG only while a Draw preset is set
        var rerender = (overlay.data.type === 'hotspot');
        if (rerender) {
            overlay.rerenderContent();
        } else {
            var OverlayAnimator = FrameTrail.module('OverlayAnimator');
            if (OverlayAnimator) { OverlayAnimator.invalidate(overlay); }
        }
        overlay.updateTimelineTails();

        FrameTrail.module('HypervideoModel').newUnsavedChange('overlays');

        controller().registerStateUndo(
            overlay,
            labels['SidebarOverlays'] + ' ' + labels['SettingsAnimation'],
            before,
            overlay.snapshotState(['attributes']),
            { rerender: rerender }
        );

    }


    /* ------------------------------------------------------------------ */
    /*  Animation tab                                                     */
    /* ------------------------------------------------------------------ */

    function phaseRow(phase, title, overlay, spec) {

        var s = spec[phase],
            none = (phase === 'in' || phase === 'out') ? labels['AnimationNone'] : labels['AnimationOff'];

        var row = el(
            '<div class="layoutRow animationPhaseRow" data-phase="' + phase + '">'
          + '    <div class="column-5">'
          + '        <label>' + title + '</label>'
          + '        <div class="custom-select"><select class="animationPresetSelect">' + presetOptions(phase, overlay.data.type, s ? s.preset : '', none) + '</select></div>'
          + '    </div>'
          + '    <div class="column-3">'
          + '        <label>' + labels['SettingsAnimationDurationMs'] + '</label>'
          + '        <input type="number" class="animationDurationInput" min="0" max="20000" step="50" value="' + (s ? s.duration : '') + '"' + (s ? '' : ' disabled') + '>'
          + '    </div>'
          + '    <div class="column-4">'
          + (phase === 'emphasis'
              ? '        <label>' + labels['SettingsAnimationRepeat'] + '</label>'
              + '        <input type="number" class="animationRepeatInput" min="0" max="999" step="1" value="' + (s ? s.iterations : 0) + '"' + (s ? '' : ' disabled') + '>'
              : '        <label>' + labels['SettingsAnimationEase'] + '</label>'
              + '        <div class="custom-select"><select class="animationEaseSelect"' + (s ? '' : ' disabled') + '>' + easeOptions(s ? s.ease : 'easeOut') + '</select></div>')
          + '    </div>'
          + '</div>'
        );

        row.querySelector('.animationPresetSelect').addEventListener('change', function() {
            var presetId = this.value;
            writeAnimation(overlay, function(animation) {
                if (!presetId) {
                    delete animation[phase];
                    return;
                }
                var preset = Lib.getPreset(phase, presetId),
                    previous = animation[phase] || {};
                animation[phase] = {
                    preset:   presetId,
                    duration: preset.duration,
                    ease:     preset.ease,
                    params:   previous.params
                };
                if (phase === 'emphasis') { animation[phase].iterations = previous.iterations || 0; }
                if (!animation[phase].params) { delete animation[phase].params; }
            });
            renderAnimationPanel(overlay, row.parentElement);
        });

        row.querySelector('.animationDurationInput').addEventListener('change', function() {
            var value = parseFloat(this.value);
            if (isNaN(value) || value < 0) { return; }
            writeAnimation(overlay, function(animation) {
                if (animation[phase]) { animation[phase].duration = value; }
            });
        });

        var easeSelect = row.querySelector('.animationEaseSelect');
        if (easeSelect) {
            easeSelect.addEventListener('change', function() {
                var value = this.value;
                writeAnimation(overlay, function(animation) {
                    if (animation[phase]) { animation[phase].ease = value; }
                });
            });
        }

        var repeatInput = row.querySelector('.animationRepeatInput');
        if (repeatInput) {
            repeatInput.addEventListener('change', function() {
                var value = Math.max(0, parseInt(this.value, 10) || 0);
                writeAnimation(overlay, function(animation) {
                    if (animation[phase]) { animation[phase].iterations = value; }
                });
            });
        }

        return row;

    }

    function paramsRow(overlay, spec) {

        var uses = {};
        ['in', 'emphasis', 'out', 'text'].forEach(function(phase) {
            if (!spec[phase]) { return; }
            var preset = Lib.getPreset(phase, spec[phase].preset);
            (preset.uses || []).forEach(function(use) { uses[use] = true; });
        });

        if (!uses.distance && !uses.color) { return null; }

        var params = {};
        ['in', 'emphasis', 'out', 'text'].forEach(function(phase) {
            var s = spec[phase];
            if (s && s.params) {
                if (s.params.distance != null && params.distance == null) { params.distance = s.params.distance; }
                if (s.params.color && !params.color) { params.color = s.params.color; }
            }
        });

        var row = el(
            '<div class="layoutRow">'
          + (uses.distance
              ? '    <div class="column-4">'
              + '        <label>' + labels['SettingsAnimationDistance'] + '</label>'
              + '        <input type="number" class="animationDistanceInput" min="0" max="100" step="1" value="' + (params.distance != null ? params.distance : 5) + '">'
              + '    </div>'
              : '')
          + (uses.color
              ? '    <div class="column-4">'
              + '        <label>' + labels['SettingsAnimationColor'] + '</label>'
              + '        <input type="color" class="animationColorInput" value="' + escapeAttr(params.color || '#ffe14d') + '">'
              + '    </div>'
              : '')
          + '</div>'
        );

        var setParam = function(name, value) {
            writeAnimation(overlay, function(animation) {
                ['in', 'emphasis', 'out', 'text'].forEach(function(phase) {
                    if (!animation[phase]) { return; }
                    var preset = Lib.getPreset(phase, animation[phase].preset);
                    if ((preset.uses || []).indexOf(name) < 0) { return; }
                    animation[phase].params = animation[phase].params || {};
                    animation[phase].params[name] = value;
                });
            });
        };

        var distanceInput = row.querySelector('.animationDistanceInput');
        if (distanceInput) {
            distanceInput.addEventListener('change', function() {
                var value = parseFloat(this.value);
                if (!isNaN(value)) { setParam('distance', value); }
            });
        }
        var colorInput = row.querySelector('.animationColorInput');
        if (colorInput) {
            colorInput.addEventListener('change', function() {
                setParam('color', this.value);
            });
        }

        return row;

    }

    function textRows(overlay, spec) {

        var s = spec.text,
            preset = s ? Lib.getPreset('text', s.preset) : null,
            fixedMode = !!(preset && preset.mode),
            wrapper = document.createElement('div');

        wrapper.appendChild(el(
            '<div class="layoutRow animationTextRow">'
          + '    <div class="column-6">'
          + '        <label>' + labels['SettingsAnimationText'] + '</label>'
          + '        <div class="custom-select"><select class="animationTextPreset">' + presetOptions('text', overlay.data.type, s ? s.preset : '', labels['AnimationOff']) + '</select></div>'
          + '    </div>'
          + '    <div class="column-6">'
          + '        <label>' + labels['SettingsAnimationTextMode'] + '</label>'
          + '        <div class="custom-select"><select class="animationTextMode"' + (s && !fixedMode ? '' : ' disabled') + '>'
          + '            <option value="word"' + (s && s.mode === 'word' ? ' selected' : '') + '>' + labels['SettingsAnimationTextWords'] + '</option>'
          + '            <option value="letter"' + (s && s.mode === 'letter' ? ' selected' : '') + '>' + labels['SettingsAnimationTextLetters'] + '</option>'
          + '        </select></div>'
          + '    </div>'
          + '</div>'
        ));

        if (s) {
            wrapper.appendChild(el(
                '<div class="layoutRow">'
              + '    <div class="column-6">'
              + '        <label>' + labels['SettingsAnimationDurationMs'] + '</label>'
              + '        <input type="number" class="animationTextDuration" min="0" max="10000" step="10" value="' + s.duration + '">'
              + '    </div>'
              + '    <div class="column-6">'
              + '        <label>' + labels['SettingsAnimationStagger'] + '</label>'
              + '        <input type="number" class="animationTextStagger" min="0" max="5000" step="10" value="' + s.stagger + '">'
              + '    </div>'
              + '</div>'
            ));
        }

        wrapper.querySelector('.animationTextPreset').addEventListener('change', function() {
            var presetId = this.value;
            writeAnimation(overlay, function(animation) {
                if (!presetId) {
                    delete animation.text;
                    return;
                }
                var p = Lib.getPreset('text', presetId),
                    previous = animation.text || {};
                animation.text = {
                    preset:   presetId,
                    duration: p.duration,
                    ease:     p.ease,
                    stagger:  p.stagger,
                    mode:     p.mode || previous.mode || 'word',
                    params:   previous.params
                };
                if (!animation.text.params) { delete animation.text.params; }
            });
            renderAnimationPanel(overlay, wrapper.parentElement);
        });

        wrapper.querySelector('.animationTextMode').addEventListener('change', function() {
            var value = this.value;
            writeAnimation(overlay, function(animation) {
                if (animation.text) { animation.text.mode = value; }
            });
        });

        var durationInput = wrapper.querySelector('.animationTextDuration');
        if (durationInput) {
            durationInput.addEventListener('change', function() {
                var value = parseFloat(this.value);
                if (isNaN(value) || value < 0) { return; }
                writeAnimation(overlay, function(animation) {
                    if (animation.text) { animation.text.duration = value; }
                });
            });
        }

        var staggerInput = wrapper.querySelector('.animationTextStagger');
        if (staggerInput) {
            staggerInput.addEventListener('change', function() {
                var value = parseFloat(this.value);
                if (isNaN(value) || value < 0) { return; }
                writeAnimation(overlay, function(animation) {
                    if (animation.text) { animation.text.stagger = value; }
                });
            });
        }

        return wrapper;

    }

    /**
     * I play the overlay's whole animation window once (lead-in to trail-out).
     */
    function preview(overlay) {

        var HypervideoController = FrameTrail.module('HypervideoController'),
            OverlayAnimator      = FrameTrail.module('OverlayAnimator'),
            win  = OverlayAnimator ? OverlayAnimator.getWindow(overlay) : null,
            from = win ? win.windowStart : overlay.data.start,
            to   = win ? win.windowEnd   : overlay.data.end;

        var stopAt = function() {
            if (HypervideoController.currentTime >= to) {
                FrameTrail.removeEventListener('timeupdate', stopAt);
                HypervideoController.pause();
            }
        };

        HypervideoController.currentTime = Math.max(0, from - 0.3);
        FrameTrail.addEventListener('timeupdate', stopAt);
        HypervideoController.play();

    }

    /**
     * I render the "Animation" tab into a panel.
     * @method renderAnimationPanel
     * @param {Overlay} overlay
     * @param {HTMLElement} panel
     */
    function renderAnimationPanel(overlay, panel) {

        if (!panel) { return; }
        panel.innerHTML = '';

        var spec = Lib.normalizeAnimation(overlay.data.attributes);

        panel.appendChild(phaseRow('in',       labels['SettingsAnimationIn'],       overlay, spec));
        panel.appendChild(phaseRow('emphasis', labels['SettingsAnimationEmphasis'], overlay, spec));
        panel.appendChild(phaseRow('out',      labels['SettingsAnimationOut'],      overlay, spec));

        var params = paramsRow(overlay, spec);
        if (params) {
            panel.appendChild(params);
        }

        if (overlay.resourceItem && typeof overlay.resourceItem.getTextRevealRoot === 'function') {
            panel.appendChild(document.createElement('hr'));
            panel.appendChild(textRows(overlay, spec));
        }

        panel.appendChild(el('<div class="fieldHint">' + labels['MessageAnimationTiming'] + '</div>'));

        var previewButton = el('<button type="button"><span class="icon-play"></span> ' + labels['SettingsAnimationPreview'] + '</button>');
        previewButton.addEventListener('click', function() {
            preview(overlay);
        });
        panel.appendChild(previewButton);

    }


    /* ------------------------------------------------------------------ */
    /*  Keyframe easing menu                                              */
    /* ------------------------------------------------------------------ */

    var KEYFRAME_EASES = ['linear', 'easeIn', 'easeOut', 'easeInOut', 'hold'];

    var keyframeMenu = null;

    function easeLabel(id) {
        for (var i = 0; i < Lib.EASE_DEFINITIONS.length; i++) {
            if (Lib.EASE_DEFINITIONS[i].id === id) {
                return labels[Lib.EASE_DEFINITIONS[i].labelKey];
            }
        }
        return id;
    }

    function placeKeyframeMenu(anchor) {

        var rect   = anchor.getBoundingClientRect(),
            width  = keyframeMenu.offsetWidth,
            height = keyframeMenu.offsetHeight,
            left   = rect.left + rect.width / 2 - width / 2,
            top    = rect.bottom + 6;

        left = Math.max(4, Math.min(window.innerWidth - width - 4, left));
        if (top + height > window.innerHeight - 4) {
            top = rect.top - height - 6;
        }

        keyframeMenu.style.left = left + 'px';
        keyframeMenu.style.top  = Math.max(4, top) + 'px';

    }

    /**
     * I open the menu of a keyframe diamond: the easing of the segment to the
     * next keyframe, and deleting the keyframe.
     * @method openKeyframeMenu
     * @param {Overlay} overlay
     * @param {Number} idx       keyframe index
     * @param {HTMLElement} anchor  the diamond
     */
    function openKeyframeMenu(overlay, idx, anchor) {

        if (!keyframeMenu) {
            keyframeMenu = document.createElement('div');
            keyframeMenu.className = 'contextSelectList keyframeMenu';
            keyframeMenu.setAttribute('popover', 'auto');
            (document.querySelector(FrameTrail.getState('target')) || document.body).appendChild(keyframeMenu);
        }

        closeKeyframeMenu();

        var kfs = overlay.data.keyframes || [],
            kf  = kfs[idx];

        if (!kf) { return; }

        keyframeMenu.innerHTML = '';

        // The last keyframe has no segment after it, so nothing to ease
        if (idx < kfs.length - 1) {

            var current = kf.ease || 'linear',
                eases   = KEYFRAME_EASES.slice();

            if (eases.indexOf(current) === -1) {
                eases.push(current);
            }

            keyframeMenu.appendChild(el('<label>' + labels['SettingsMotionEase'] + '</label>'));

            eases.forEach(function(id) {
                var row = el('<div data-ease="' + escapeAttr(id) + '"><span class="' + (id === current ? 'icon-check' : 'icon-blank') + '"></span> ' + easeLabel(id) + '</div>');
                row.addEventListener('click', function() {
                    closeKeyframeMenu();
                    if (id === current) { return; }
                    overlay.editKeyframes(labels['SettingsMotionEase'], function(list) {
                        if (id === 'linear') {
                            delete list[idx].ease;
                        } else {
                            list[idx].ease = id;
                        }
                        return list;
                    });
                });
                keyframeMenu.appendChild(row);
            });

        }

        var deleteRow = el('<div class="keyframeMenuDelete"><span class="icon-trash"></span> ' + labels['SettingsMotionDeleteKeyframe'] + '</div>');
        deleteRow.addEventListener('click', function() {
            closeKeyframeMenu();
            overlay.editKeyframes(labels['SettingsMotionDeleteKeyframe'], function(list) {
                list.splice(idx, 1);
                return list;
            });
        });
        keyframeMenu.appendChild(deleteRow);

        keyframeMenu.showPopover();
        placeKeyframeMenu(anchor);

    }

    /**
     * @method closeKeyframeMenu
     */
    function closeKeyframeMenu() {
        if (isKeyframeMenuOpen()) {
            keyframeMenu.hidePopover();
        }
    }

    /**
     * @method isKeyframeMenuOpen
     * @return {Boolean}
     */
    function isKeyframeMenuOpen() {
        return !!(keyframeMenu && keyframeMenu.matches(':popover-open'));
    }


    return {

        renderAnimationPanel: renderAnimationPanel,
        openKeyframeMenu:     openKeyframeMenu,
        closeKeyframeMenu:    closeKeyframeMenu,
        isKeyframeMenuOpen:   isKeyframeMenuOpen

    };

});
