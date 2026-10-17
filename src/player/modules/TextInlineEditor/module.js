/**
 * @module Player
 */


/**
 * I am the TextInlineEditor. I let the text of a text overlay be edited where it
 * is shown, on the video, with a formatting toolbar next to it.
 *
 * Editing starts with a double-click on a text overlay in the overlay edit mode,
 * with the "Edit text" button in its properties, and right after a Text overlay
 * was dropped. While it lasts the video is paused, the overlay stands still (no
 * animations, see OverlayAnimator.holdStill) and is neither dragged nor resized;
 * a Quill editor takes the place of its text, its title (if it has one) can be
 * typed in, and its box follows the text while its height does (auto height).
 * The toolbar is a popover: the video's containers clip what leaves them, the
 * top layer is not clipped.
 *
 * Editing ends with Esc, a press anywhere outside the overlay and the toolbar,
 * playback, another selection, leaving the overlay edit mode, an automated edit
 * (editBusy) and a hypervideo switch. Each session is one undo step (text, title
 * and box); a Text overlay dropped and left empty is removed without a trace.
 *
 * @class TextInlineEditor
 * @static
 */

FrameTrail.defineModule('TextInlineEditor', function(FrameTrail){

    var labels = FrameTrail.module('Localization').labels;

    // What a session may change: the text and title, and the box that follows them
    var STATE_KEYS = ['attributes', 'position', 'keyframes'];

    var session = null;


    /**
     * I tell whether text is being edited (on the given overlay, when one is given).
     * @method isEditing
     * @param {Overlay} overlay (optional)
     * @return {Boolean}
     */
    function isEditing(overlay) {

        return !!session && (!overlay || session.overlay === overlay);

    }


    /**
     * I build the toolbar's controls in the markup Quill's toolbar module and the
     * snow theme turn into buttons and pickers: the same as the visual editor of
     * the properties panel.
     *
     * @method buildFormats
     * @param {ResourceText} resourceItem
     * @return {HTMLElement}
     * @private
     */
    function buildFormats(resourceItem) {

        var formats = document.createElement('div');
        formats.className = 'textInlineFormats';

        var options = function(values) {
            return values.map(function(value) { return '<option value="' + value + '"></option>'; }).join('');
        };

        formats.innerHTML = '<span class="ql-formats"><select class="ql-font">' + options(resourceItem.quillFonts) + '</select></span>'
            + '<span class="ql-formats"><select class="ql-size">' + options(resourceItem.quillFontSizes) + '</select></span>'
            + '<span class="ql-formats">'
            + '    <button type="button" class="ql-bold"></button>'
            + '    <button type="button" class="ql-italic"></button>'
            + '    <button type="button" class="ql-underline"></button>'
            + '    <button type="button" class="ql-link"></button>'
            + '</span>'
            + '<span class="ql-formats">'
            + '    <button type="button" class="ql-list" value="ordered"></button>'
            + '    <button type="button" class="ql-list" value="bullet"></button>'
            + '</span>'
            + '<span class="ql-formats">'
            + '    <button type="button" class="ql-indent" value="-1"></button>'
            + '    <button type="button" class="ql-indent" value="+1"></button>'
            + '</span>'
            + '<span class="ql-formats"><select class="ql-align"></select></span>';

        return formats;

    }


    /**
     * I build the toolbar popover: the formatting controls and the (hidden) field
     * for a link's address.
     *
     * @method buildToolbar
     * @param {ResourceText} resourceItem
     * @return {HTMLElement}
     * @private
     */
    function buildToolbar(resourceItem) {

        var toolbar = document.createElement('div');
        toolbar.className = 'textInlineToolbar';
        if (typeof toolbar.showPopover === 'function') {
            toolbar.setAttribute('popover', 'manual');
        }

        toolbar.appendChild(buildFormats(resourceItem));

        var linkRow = document.createElement('div');
        linkRow.className = 'textInlineLinkRow';
        linkRow.hidden = true;
        linkRow.innerHTML = '<input type="url" class="textInlineLinkInput" placeholder="https://">'
            + '<button type="button" class="textInlineLinkApply">' + labels['TextInlineLinkApply'] + '</button>';
        toolbar.appendChild(linkRow);

        return toolbar;

    }


    /**
     * I place the toolbar above the overlay's box (its bounding box on screen,
     * rotation and scale included), below it when there is no room above, and
     * keep it inside the window.
     *
     * @method positionToolbar
     * @private
     */
    function positionToolbar() {

        if (!session) { return; }

        var toolbar = session.toolbar,
            box     = session.overlay.overlayElement.getBoundingClientRect(),
            width   = toolbar.offsetWidth,
            height  = toolbar.offsetHeight,
            vw      = document.documentElement.clientWidth,
            vh      = document.documentElement.clientHeight,
            gap     = 8,
            margin  = 4;

        var top = box.top - height - gap;
        if (top < margin) {
            top = box.bottom + gap;
        }
        if (top + height > vh - margin) {
            top = Math.max(margin, vh - height - margin);
        }

        var left = Math.max(margin, Math.min(vw - width - margin, box.left + box.width / 2 - width / 2));

        toolbar.style.left = left + 'px';
        toolbar.style.top  = top + 'px';

    }


    /**
     * I return the editor's text as HTML to store: without the element Quill puts
     * at the caret while a format waits for the next letter (and the formatting
     * elements it leaves empty).
     *
     * @method editorHTML
     * @param {Quill} quill
     * @return {String} '' when there is no text
     * @private
     */
    function editorHTML(quill) {

        if (!quill.getText().trim()) { return ''; }

        var clone = quill.root.cloneNode(true),
            empty;

        clone.querySelectorAll('.ql-cursor').forEach(function(el) { el.remove(); });
        do {
            empty = Array.prototype.filter.call(clone.querySelectorAll('strong, em, u, s, span, a'), function(el) {
                return !el.textContent && !el.querySelector('br, img');
            });
            empty.forEach(function(el) { el.remove(); });
        } while (empty.length);

        return clone.innerHTML;

    }


    /**
     * The box follows the text (auto height), the toolbar follows the box: after
     * every change, and whenever the text takes another height without a change
     * (e.g. a font size chosen for the next letters).
     *
     * @method fitBox
     * @private
     */
    function fitBox() {

        if (!session) { return; }

        if (session.overlay.fitToContent()) {
            FrameTrail.module('OverlaysController').refreshMotionControls(session.overlay);
        }
        positionToolbar();

    }


    /**
     * After every change of the text or title: the box follows the text (auto
     * height), the hypervideo has unsaved changes, the toolbar follows the box.
     *
     * @method afterChange
     * @private
     */
    function afterChange() {

        if (!session) { return; }

        session.changed = true;

        fitBox();
        FrameTrail.module('HypervideoModel').newUnsavedChange('overlays');

    }


    /**
     * The link button: with a selection, the field for the address opens; in a
     * link, the link is removed. (Quill's own link tooltip would sit inside the
     * scaled overlay, where it is clipped.)
     *
     * @method onLink
     * @param {Boolean} value false when the selection is a link
     * @private
     */
    function onLink(value) {

        if (!session) { return; }

        var quill = session.quill;

        if (!value) {
            quill.format('link', false, 'user');
            return;
        }

        var range = quill.getSelection(true);
        if (!range || !range.length) { return; }

        session.linkRange = range;
        session.linkRow.hidden = false;
        session.linkInput.value = '';
        positionToolbar();
        session.linkInput.focus();

    }

    function closeLinkRow() {

        if (!session) { return; }

        session.linkRow.hidden = true;
        positionToolbar();
        session.quill.focus();
        if (session.linkRange) {
            session.quill.setSelection(session.linkRange.index + session.linkRange.length, 0, 'user');
        }
        session.linkRange = null;

    }

    function applyLink() {

        if (!session) { return; }

        var url   = session.linkInput.value.trim(),
            range = session.linkRange;

        if (url && range) {
            // Quill keeps http(s), mailto, tel and sms links; an address without one is a web address
            if (!/^[a-z][a-z0-9+.-]*:/i.test(url)) {
                url = 'https://' + url;
            }
            session.quill.formatText(range.index, range.length, 'link', url, 'user');
        }
        closeLinkRow();

    }


    /**
     * Esc closes the link field or an open picker first, then ends editing. (On
     * the window, in the capture phase: before the player's keys.)
     *
     * @method onKeyDown
     * @param {KeyboardEvent} evt
     * @private
     */
    function onKeyDown(evt) {

        if (!session || evt.key !== 'Escape') { return; }

        evt.preventDefault();
        evt.stopPropagation();

        if (!session.linkRow.hidden) {
            closeLinkRow();
            return;
        }

        var picker = session.toolbar.querySelector('.ql-picker.ql-expanded');
        if (picker) {
            picker.classList.remove('ql-expanded');
            return;
        }

        stop();

    }

    /**
     * A press outside the overlay and the toolbar ends editing.
     * @method onPointerDown
     * @param {PointerEvent} evt
     * @private
     */
    function onPointerDown(evt) {

        if (!session) { return; }
        if (session.overlay.overlayElement.contains(evt.target) || session.toolbar.contains(evt.target)) { return; }

        stop();

    }


    /**
     * I put the caret where the text was double-clicked, or at its end.
     * @method placeCaret
     * @param {Object} point { x, y } in client pixels (optional)
     * @private
     */
    function placeCaret(point) {

        var quill = session.quill,
            root  = quill.root;

        quill.focus();

        if (point) {
            var node = null, offset = 0;
            if (document.caretPositionFromPoint) {
                var position = document.caretPositionFromPoint(point.x, point.y);
                if (position) { node = position.offsetNode; offset = position.offset; }
            } else if (document.caretRangeFromPoint) {
                var range = document.caretRangeFromPoint(point.x, point.y);
                if (range) { node = range.startContainer; offset = range.startOffset; }
            }
            if (node && root.contains(node)) {
                window.getSelection().collapse(node, offset);
                quill.update('user');
                return;
            }
        }

        quill.setSelection(Math.max(0, quill.getLength() - 1), 0, 'user');

    }


    /**
     * I start editing the text of a text overlay on the video.
     *
     * @method start
     * @param {Overlay} overlay
     * @param {Object} options { isNew: just dropped (its add is registered when
     *                         editing ends, and nothing is left when it stays
     *                         empty), point: { x, y } where it was double-clicked }
     * @return {Boolean} whether editing started (or was already going on)
     */
    function start(overlay, options) {

        options = options || {};

        if (!overlay || overlay.data.type !== 'text'
            || FrameTrail.getState('editMode') !== 'overlays'
            || FrameTrail.getState('editBusy')
            || typeof Quill === 'undefined') {
            return false;
        }

        if (session) {
            if (session.overlay === overlay) { return true; }
            stop();
        }

        var HypervideoController = FrameTrail.module('HypervideoController'),
            OverlaysController   = FrameTrail.module('OverlaysController'),
            OverlayAnimator      = FrameTrail.module('OverlayAnimator'),
            resourceItem         = overlay.resourceItem,
            el                   = overlay.overlayElement;

        if (HypervideoController.isPlaying) {
            HypervideoController.pause();
        }

        // A ghost is edited where it is shown: inside its span
        var t = HypervideoController.currentTime;
        if (t < overlay.data.start || t > overlay.data.end) {
            HypervideoController.currentTime = overlay.data.start + Math.min(0.01, (overlay.data.end - overlay.data.start) / 2);
        }

        OverlaysController.selectOverlay(overlay);
        OverlaysController.updateStatesOfOverlays(HypervideoController.currentTime);

        var before = overlay.snapshotState(STATE_KEYS);

        // Standing still, with its text as stored (not split for a text reveal)
        OverlayAnimator.holdStill(overlay, true);
        overlay.rerenderContent();

        var detail = overlay.getContentHost().querySelector('.resourceDetail'),
            body   = detail && detail.querySelector('.textOverlayBody'),
            title  = detail && detail.querySelector('.textOverlayTitle');

        if (!body) {
            OverlayAnimator.holdStill(overlay, false);
            return false;
        }

        el.classList.add('inlineEditing');

        var toolbar = buildToolbar(resourceItem);
        document.querySelector(FrameTrail.getState('target')).appendChild(toolbar);

        resourceItem.registerQuillFormats();

        var quill = new Quill(body, {
            theme:       'snow',
            placeholder: labels['TextInlinePlaceholder'],
            modules: {
                toolbar: {
                    container: toolbar.querySelector('.textInlineFormats'),
                    handlers:  { link: onLink }
                }
            }
        });

        // Font picker items in their own typeface, and any colour (as in the panel)
        toolbar.querySelectorAll('.ql-font .ql-picker-item').forEach(function(item) {
            if (item.dataset.value) { item.style.fontFamily = item.dataset.value; }
        });
        resourceItem.addHexColorInput(toolbar.querySelector('.textInlineFormats'), quill);

        session = {
            overlay:     overlay,
            isNew:       !!options.isNew,
            before:      before,
            textBefore:  overlay.data.attributes.text || '',
            titleBefore: overlay.data.attributes.title,
            changed:     false,
            quill:       quill,
            title:       title,
            toolbar:     toolbar,
            linkRow:     toolbar.querySelector('.textInlineLinkRow'),
            linkInput:   toolbar.querySelector('.textInlineLinkInput'),
            linkRange:   null,
            observers:   []
        };

        quill.on('text-change', function(delta, oldDelta, source) {
            if (!session || source !== 'user') { return; }
            resourceItem.setTextHTML(editorHTML(quill));
            afterChange();
        });

        if (title) {
            try {
                title.contentEditable = 'plaintext-only';
            } catch (e) {
                title.contentEditable = 'true';
            }
            title.addEventListener('input', function() {
                if (!session) { return; }
                var value = title.textContent;
                if (value.trim()) {
                    overlay.data.attributes.title = value;
                } else {
                    delete overlay.data.attributes.title;
                }
                afterChange();
            });
            // Enter goes on to the text
            title.addEventListener('keydown', function(evt) {
                if (evt.key === 'Enter') {
                    evt.preventDefault();
                    quill.focus();
                    quill.setSelection(0, 0, 'user');
                }
            });
        }

        session.linkInput.addEventListener('keydown', function(evt) {
            if (evt.key === 'Enter') {
                evt.preventDefault();
                applyLink();
            }
        });
        toolbar.querySelector('.textInlineLinkApply').addEventListener('click', applyLink);

        window.addEventListener('keydown', onKeyDown, true);
        document.addEventListener('pointerdown', onPointerDown, true);
        window.addEventListener('resize', positionToolbar);
        window.addEventListener('scroll', positionToolbar, true);
        if (window.ResizeObserver) {
            var boxObserver     = new ResizeObserver(positionToolbar),
                contentObserver = new ResizeObserver(fitBox);
            boxObserver.observe(el);
            contentObserver.observe(resourceItem.getContentFitRoot(detail));
            session.observers.push(boxObserver, contentObserver);
        }

        if (typeof toolbar.showPopover === 'function') {
            toolbar.showPopover();
        }
        positionToolbar();
        placeCaret(options.point);

        return true;

    }


    /**
     * I end editing: the text is rendered anew from what was typed (Quill has no
     * destroy), the overlay moves again, the box fits the text, and the session
     * becomes one undo step (for a Text overlay just dropped: its add, or nothing
     * at all when it was left empty).
     *
     * @method stop
     * @param {Object} options { discard: the overlay is going away (hypervideo
     *                         switch, deletion): only clean up }
     */
    function stop(options) {

        if (!session) { return; }

        // First, so that whatever this sets off finds no session
        var s = session;
        session = null;

        var overlay            = s.overlay,
            el                 = overlay.overlayElement,
            OverlaysController = FrameTrail.module('OverlaysController'),
            OverlayAnimator    = FrameTrail.module('OverlayAnimator');

        window.removeEventListener('keydown', onKeyDown, true);
        document.removeEventListener('pointerdown', onPointerDown, true);
        window.removeEventListener('resize', positionToolbar);
        window.removeEventListener('scroll', positionToolbar, true);
        s.observers.forEach(function(observer) { observer.disconnect(); });

        if (typeof s.toolbar.hidePopover === 'function' && s.toolbar.matches(':popover-open')) {
            try { s.toolbar.hidePopover(); } catch (e) {}
        }
        s.toolbar.remove();

        el.classList.remove('inlineEditing');

        if ((options && options.discard) || !el.isConnected) {
            OverlayAnimator.holdStill(overlay, false);
            return;
        }

        overlay.rerenderContent();
        OverlayAnimator.holdStill(overlay, false);
        overlay.fitToContent();
        overlay.updateLabel();

        var attrs = overlay.data.attributes,
            after = overlay.snapshotState(STATE_KEYS),
            empty = !overlay.resourceItem.getTextHTML().replace(/<[^>]*>/g, '').trim() && !attrs.title;

        if (s.isNew) {
            if (empty) {
                OverlaysController.deleteOverlay(overlay, true);
                return;
            }
            OverlaysController.registerAddUndo(overlay);
        } else {
            OverlaysController.registerStateUndo(overlay, labels['SidebarOverlays'] + ' Text', s.before, after, { rerender: true });
        }

        if (s.changed || JSON.stringify(s.before) !== JSON.stringify(after)) {
            FrameTrail.module('HypervideoModel').newUnsavedChange('overlays');
        }

        var changes = [];
        if ((attrs.text || '') !== s.textBefore) {
            changes.push({ property: 'attributes.text', oldValue: s.textBefore, newValue: attrs.text });
        }
        if (attrs.title !== s.titleBefore) {
            changes.push({ property: 'attributes.title', oldValue: s.titleBefore, newValue: attrs.title });
        }
        if (changes.length) {
            FrameTrail.triggerEvent('userAction', { action: 'OverlayChange', overlay: overlay.data, changes: changes });
        }

        overlay.resourceItem.refreshTextControls(overlay);
        OverlaysController.refreshMotionControls(overlay);

    }


    /**
     * Esc from outside the editor (e.g. after a toolbar button took the focus)
     * ends editing; the InteractionController asks me first.
     * @method handleEscape
     * @return {Boolean} whether I used the key
     */
    function handleEscape() {

        if (!session) { return false; }
        stop();
        return true;

    }


    function onEditModeChange(editMode) {
        if (editMode !== 'overlays') { stop(); }
    }

    function onEditBusyChange(editBusy) {
        if (editBusy) { stop(); }
    }

    function onViewModeChange() {
        stop();
    }


    return {

        onChange: {
            editMode: onEditModeChange,
            editBusy: onEditBusyChange,
            viewMode: onViewModeChange
        },

        onUnload: function() {
            stop({ discard: true });
        },

        start:        start,
        stop:         stop,
        isEditing:    isEditing,
        handleEscape: handleEscape

    };

});
