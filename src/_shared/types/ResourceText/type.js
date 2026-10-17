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

                    this.applyCardStyle(resourceContent, self.resourceData.attributes.box);

                    resourceDetail.appendChild(resourceContent);

                    resourceDetail.appendChild(this.buildResourceOptions({
                        licenseType: this.resourceData.licenseType,
                        licenseAttribution: this.resourceData.licenseAttribution
                    }));

                    return resourceDetail;

                },

                /**
                 * I apply the optional card style (attributes.box) to my content element:
                 * background, padding, corner radius, border and shadow; the title colour
                 * is passed on as --ft-text-title-color. Without a box nothing changes.
                 *
                 * @method applyCardStyle
                 * @param {HTMLElement} contentElement
                 * @param {Object} box
                 */
                applyCardStyle: function(contentElement, box) {

                    var style = contentElement.style;

                    if (!box || typeof box !== 'object') {
                        contentElement.classList.remove('textOverlayCard');
                        ['background', 'padding', 'border-radius', 'border', 'box-shadow', '--ft-text-title-color'].forEach(function(prop) {
                            style.removeProperty(prop);
                        });
                        return;
                    }

                    contentElement.classList.add('textOverlayCard');
                    style.background   = box.background || 'transparent';
                    style.padding      = (box.padding != null) ? box.padding + 'px' : '';
                    style.borderRadius = (box.radius != null) ? box.radius + 'px' : '';
                    style.border       = (box.borderWidth > 0) ? box.borderWidth + 'px solid ' + (box.borderColor || '#000000') : '';
                    style.boxShadow    = box.shadow ? '0 12px 32px rgba(0, 0, 0, 0.28)' : '';
                    if (box.titleColor) {
                        style.setProperty('--ft-text-title-color', box.titleColor);
                    } else {
                        style.removeProperty('--ft-text-title-color');
                    }

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
                    optionsPanel.prepend(this.renderCardControls(overlay));

                    // While the height follows the text, the Height input only shows it
                    basicControls.controlsContainer.querySelector('.positionHeight').disabled = overlay.hasAutoHeight();


                    return basicControls;

                },


                /**
                 * I render the controls for the optional title and card style of a text
                 * overlay (attributes.title, attributes.box).
                 *
                 * @method renderCardControls
                 * @param {Overlay} overlay
                 * @return HTMLElement
                 */
                renderCardControls: function(overlay) {

                    var self   = this,
                        labels = this.labels,
                        attrs  = overlay.data.attributes,
                        box    = attrs.box;

                    var colorValue = function(value, fallback) {
                        return (/^#[0-9a-fA-F]{6}$/.test(value || '')) ? value : fallback;
                    };

                    var wrapper = document.createElement('div');
                    wrapper.className = 'textCardControls';
                    wrapper.innerHTML = '<div class="layoutRow">'
                        + '    <div class="column-12">'
                        + '        <label>' + labels['SettingsTextTitle'] + '</label>'
                        + '        <input type="text" class="textTitleInput">'
                        + '    </div>'
                        + '</div>'
                        + '<div class="layoutRow">'
                        + '    <div class="column-6">'
                        + '        <div class="checkboxRow">'
                        + '            <label class="switch">'
                        + '                <input class="textBoxCheckbox" type="checkbox" autocomplete="off"' + (box ? ' checked' : '') + '>'
                        + '                <span class="slider round"></span>'
                        + '            </label>'
                        + '            <label>' + labels['SettingsTextBox'] + '</label>'
                        + '        </div>'
                        + '    </div>'
                        + '    <div class="column-6">'
                        + '        <div class="checkboxRow">'
                        + '            <label class="switch">'
                        + '                <input class="textAutoHeightCheckbox" type="checkbox" autocomplete="off"' + (attrs.autoSize === 'height' ? ' checked' : '') + '>'
                        + '                <span class="slider round"></span>'
                        + '            </label>'
                        + '            <label>' + labels['SettingsTextAutoHeight'] + '</label>'
                        + '        </div>'
                        + '    </div>'
                        + '</div>'
                        + (box
                            ? '<div class="layoutRow">'
                            + '    <div class="column-3">'
                            + '        <label>' + labels['SettingsTextBoxBackground'] + '</label>'
                            + '        <input type="color" class="textBoxField" data-key="background" value="' + colorValue(box.background, '#ffffff') + '">'
                            + '    </div>'
                            + '    <div class="column-3">'
                            + '        <label>' + labels['SettingsTextBoxTitleColor'] + '</label>'
                            + '        <input type="color" class="textBoxField" data-key="titleColor" value="' + colorValue(box.titleColor, '#14161a') + '">'
                            + '    </div>'
                            + '    <div class="column-3">'
                            + '        <label>' + labels['SettingsTextBoxPadding'] + '</label>'
                            + '        <input type="number" class="textBoxField" data-key="padding" data-number="1" min="0" max="200" step="1" value="' + (box.padding != null ? box.padding : 0) + '">'
                            + '    </div>'
                            + '    <div class="column-3">'
                            + '        <label>' + labels['SettingsTextBoxRadius'] + '</label>'
                            + '        <input type="number" class="textBoxField" data-key="radius" data-number="1" min="0" max="200" step="1" value="' + (box.radius != null ? box.radius : 0) + '">'
                            + '    </div>'
                            + '</div>'
                            + '<div class="layoutRow">'
                            + '    <div class="column-3">'
                            + '        <label>' + labels['SettingsTextBoxBorderWidth'] + '</label>'
                            + '        <input type="number" class="textBoxField" data-key="borderWidth" data-number="1" min="0" max="40" step="1" value="' + (box.borderWidth != null ? box.borderWidth : 0) + '">'
                            + '    </div>'
                            + '    <div class="column-3">'
                            + '        <label>' + labels['SettingsTextBoxBorderColor'] + '</label>'
                            + '        <input type="color" class="textBoxField" data-key="borderColor" value="' + colorValue(box.borderColor, '#000000') + '">'
                            + '    </div>'
                            + '    <div class="column-6">'
                            + '        <label>&nbsp;</label>'
                            + '        <div class="checkboxRow">'
                            + '            <label class="switch">'
                            + '                <input class="textBoxShadow" type="checkbox" autocomplete="off"' + (box.shadow ? ' checked' : '') + '>'
                            + '                <span class="slider round"></span>'
                            + '            </label>'
                            + '            <label>' + labels['SettingsTextBoxShadow'] + '</label>'
                            + '        </div>'
                            + '    </div>'
                            + '</div>'
                            : '')
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
                            labels['SidebarOverlays'] + ' ' + (description || labels['SettingsTextBox']),
                            before,
                            overlay.snapshotState(STATE_KEYS),
                            { rerender: true }
                        );
                    };

                    // The box follows the content while auto height is on
                    var fitBox = function() {
                        if (overlay.fitToContent()) {
                            FrameTrail.module('OverlaysController').refreshMotionControls(overlay);
                        }
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
                        var before = overlay.snapshotState(STATE_KEYS);
                        if (this.checked) {
                            attrs.autoSize = 'height';
                        } else {
                            delete attrs.autoSize;
                        }
                        overlay.updateOverlayElement();
                        overlay.scaleOverlayElement();
                        fitBox();
                        syncHeightInput();
                        FrameTrail.module('HypervideoModel').newUnsavedChange('overlays');
                        registerUndo(before, labels['SettingsTextAutoHeight']);
                    });

                    // Title
                    var titleInput  = wrapper.querySelector('.textTitleInput'),
                        titleBefore = null;
                    titleInput.value = attrs.title || '';
                    overlay._titleInput = titleInput;   // see refreshTextControls
                    titleInput.addEventListener('focus', function() {
                        titleBefore = overlay.snapshotState(STATE_KEYS);
                    });
                    titleInput.addEventListener('input', function() {
                        var value = this.value,
                            content = getContent();
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
                                content.prepend(titleElement);
                            }
                            if (titleElement) {
                                if (value) { titleElement.textContent = value; } else { titleElement.remove(); }
                            }
                        }
                        fitBox();
                        overlay.contentChanged();
                        FrameTrail.module('HypervideoModel').newUnsavedChange('overlays');
                    });
                    titleInput.addEventListener('change', function() {
                        if (titleBefore) { registerUndo(titleBefore); }
                        titleBefore = overlay.snapshotState(STATE_KEYS);
                    });

                    // Card style on / off
                    wrapper.querySelector('.textBoxCheckbox').addEventListener('change', function() {
                        var before = overlay.snapshotState(STATE_KEYS);
                        if (this.checked) {
                            attrs.box = { background: '#ffffff', titleColor: '#14161a', padding: 24, radius: 12, shadow: true };
                        } else {
                            delete attrs.box;
                        }
                        overlay.rerenderContent();
                        fitBox();
                        FrameTrail.module('HypervideoModel').newUnsavedChange('overlays');
                        registerUndo(before);
                        wrapper.replaceWith(self.renderCardControls(overlay));
                    });

                    // Card style fields
                    var fieldBefore = null;
                    wrapper.querySelectorAll('.textBoxField, .textBoxShadow').forEach(function(field) {
                        field.addEventListener('focus', function() {
                            fieldBefore = overlay.snapshotState(STATE_KEYS);
                        });
                        var apply = function() {
                            if (!attrs.box) { return; }
                            if (field.classList.contains('textBoxShadow')) {
                                attrs.box.shadow = field.checked;
                            } else if (field.dataset.number) {
                                var number = parseFloat(field.value);
                                if (isNaN(number)) { return; }
                                attrs.box[field.dataset.key] = number;
                            } else {
                                attrs.box[field.dataset.key] = field.value;
                            }
                            var content = getContent();
                            if (content) { self.applyCardStyle(content, attrs.box); }
                            overlay.scaleOverlayElement();
                            fitBox();
                            FrameTrail.module('HypervideoModel').newUnsavedChange('overlays');
                        };
                        field.addEventListener('input', apply);
                        field.addEventListener('change', function() {
                            var before = fieldBefore || overlay.snapshotState(STATE_KEYS);
                            apply();
                            registerUndo(before);
                            fieldBefore = overlay.snapshotState(STATE_KEYS);
                        });
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
                 * I return my text as HTML (attributes.text is stored HTML-escaped).
                 * @method getTextHTML
                 * @return {String}
                 */
                getTextHTML: function() {

                    var unescapeHelper = document.createElement('div');
                    unescapeHelper.innerHTML = this.resourceData.attributes.text || '';
                    return unescapeHelper.textContent || '';

                },


                /**
                 * I store HTML as my text (HTML-escaped, see getTextHTML).
                 * @method setTextHTML
                 * @param {String} html
                 */
                setTextHTML: function(html) {

                    var escapeHelper = document.createElement('div');
                    escapeHelper.appendChild(document.createTextNode(html));
                    this.resourceData.attributes.text = escapeHelper.innerHTML;

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
                            // Sync Quill → CodeMirror on switch to HTML tab
                            if (window.quillEditor && window.htmlCodeEditor) {
                                var quillHtml = window.quillEditor.root.innerHTML;
                                var doc = window.htmlCodeEditor.state.doc;
                                window.htmlCodeEditor.dispatch({
                                    changes: { from: 0, to: doc.length, insert: quillHtml },
                                    annotations: CM6.Transaction.userEvent.of('setValue')
                                });
                            }
                            if (window.htmlCodeEditor) {
                                window.htmlCodeEditor.requestMeasure();

                            }
                        });

                        textContentEditorContainer.append(visualEditorTab, htmlEditorTab, visualEditorContent, htmlEditorContent);

                    }

                    var textarea = document.createElement('textarea');
                    // An overlay shows its source at once, so it starts unescaped
                    textarea.textContent = isOverlay ? this.getTextHTML() : overlayOrAnnotation.data.attributes.text;
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

                                    var escapeHelper = document.createElement('div');
                                    escapeHelper.appendChild(document.createTextNode(newHtml));
                                    var escapedHtml = escapeHelper.innerHTML;
                                    overlayOrAnnotation.data.attributes.text = escapedHtml;

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
