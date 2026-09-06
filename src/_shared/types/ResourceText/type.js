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

                    resourceContent.innerHTML = unescapedString;
                    resourceDetail.appendChild(resourceContent);

                    resourceDetail.appendChild(this.buildResourceOptions({
                        licenseType: this.resourceData.licenseType,
                        licenseAttribution: this.resourceData.licenseAttribution
                    }));

                    return resourceDetail;

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

                    basicControls.controlsContainer.querySelector('#OverlayOptions').prepend(this.renderTextEditors(overlay));


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

                    timeControls.controlsContainer.querySelector('#AnnotationOptions').append(this.renderTextEditors(annotation));

                    return timeControls;

                },


                /**
                 * I render visual and code editors for text content
                 * @method renderTextEditors
                 * @param {Object} overlayOrAnnotation
                 * @return &#123; textContentEditorContainer: HTMLElement;
                 */
                renderTextEditors: function(overlayOrAnnotation) {

                    var self = this;
                    
                    delete window.quillEditor;
                    delete window.htmlCodeEditor;
                    delete window.oldTextContent;

                    window.oldTextContent = overlayOrAnnotation.data.attributes.text;

                    var activeFonts =     ['Arial', 'Arial Black', 'Courier', 'Courier New', 'Dosis', 'Lucida Console', 'Helvetica', 'Impact', 'Lucida Grande', 'Lucida Sans', 'Montserrat', 'Tahoma', 'Times', 'Times New Roman', 'TitilliumWeb', 'Verdana'],
                        activeFontSizes = ['8px', '9px', '10px', '11px', '12px', '13px', '14px', '15px', '16px', '17px', '18px', '20px', '22px', '26px', '28px', '30px', '32px', '34px', '36px', '38px', '40px', '46px', '50px', '60px', '70px'];

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

                    var textarea = document.createElement('textarea');
                    textarea.textContent = overlayOrAnnotation.data.attributes.text;
                    htmlEditorContent.appendChild(textarea);

                    var visualEditorWrapper = document.createElement('div');
                    visualEditorWrapper.className = 'visualEditorWrapper';
                    visualEditorContent.appendChild(visualEditorWrapper);

                    //textEditor.style.display = 'none';

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
                                    },
                                    blur: function(evt, view) {
                                        var newText = overlayOrAnnotation.data.attributes.text || '';
                                        if (textChanged && textBeforeEdit !== newText) {
                                            var isOverlay = !!overlayOrAnnotation.overlayElement;
                                            var category = isOverlay ? 'overlays' : 'annotations';
                                            var elementId = overlayOrAnnotation.data.created;
                                            (function(id, oldText, newTxt, cat, labels) {
                                                var findElement = function() {
                                                    var arr = cat === 'overlays' ?
                                                        FrameTrail.module('HypervideoModel').overlays :
                                                        FrameTrail.module('HypervideoModel').annotations;
                                                    for (var i = 0; i < arr.length; i++) {
                                                        if (arr[i].data.created === id) { return arr[i]; }
                                                    }
                                                    return null;
                                                };
                                                FrameTrail.module('UndoManager').register({
                                                    category: cat,
                                                    description: (cat === 'overlays' ? labels['SidebarOverlays'] : labels['SidebarMyAnnotations']) + ' Text',
                                                    undo: function() {
                                                        var el = findElement();
                                                        if (!el) return;
                                                        el.data.attributes.text = oldText;
                                                        FrameTrail.module('HypervideoModel').newUnsavedChange(cat);
                                                    },
                                                    redo: function() {
                                                        var el = findElement();
                                                        if (!el) return;
                                                        el.data.attributes.text = newTxt;
                                                        FrameTrail.module('HypervideoModel').newUnsavedChange(cat);
                                                    }
                                                });
                                            })(elementId, textBeforeEdit, newText, category, self.labels);
                                        }
                                        textBeforeEdit = null;
                                        textChanged = false;
                                    }
                                }),
                                CM6.EditorView.updateListener.of(function(update) {
                                    if (!update.docChanged) { return; }

                                    var newHtml = update.state.doc.toString();
                                    textChanged = true;

                                    var escapeHelper = document.createElement('div');
                                    escapeHelper.appendChild(document.createTextNode(newHtml));
                                    var escapedHtml = escapeHelper.innerHTML;
                                    overlayOrAnnotation.data.attributes.text = escapedHtml;

                                    if (overlayOrAnnotation.overlayElement) {

                                        overlayOrAnnotation.overlayElement.querySelector('.resourceDetail').innerHTML = newHtml;
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

                    /* Init Quill Visual Editor */

                    // Register style-based attributors once (inline styles, not CSS classes)
                    if (!Quill._ftFormatsRegistered) {
                        var FontAttributor = Quill.import('attributors/style/font');
                        if (FontAttributor) {
                            FontAttributor.whitelist = activeFonts;
                            Quill.register(FontAttributor, true);
                        }

                        var SizeAttributor = Quill.import('attributors/style/size');
                        if (SizeAttributor) {
                            SizeAttributor.whitelist = activeFontSizes;
                            Quill.register(SizeAttributor, true);
                        }

                        var AlignStyle = Quill.import('attributors/style/align');
                        if (AlignStyle) {
                            Quill.register(AlignStyle, true);
                        }

                        Quill._ftFormatsRegistered = true;
                    }

                    var toolbarOptions = [
                        [{ 'font': activeFonts }],
                        [{ 'size': activeFontSizes }],
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
                        var hexSpan = document.createElement('span');
                        hexSpan.className = 'ql-formats';
                        var colorHexInput = document.createElement('input');
                        colorHexInput.type = 'color';
                        colorHexInput.title = 'Custom color (hex)';
                        colorHexInput.className = 'ql-color-hex';
                        colorHexInput.style.cssText = 'width:26px;height:26px;padding:0;border:none;cursor:pointer;background:none;';
                        hexSpan.appendChild(colorHexInput);
                        qlToolbar.appendChild(hexSpan);
                        var savedQuillRange = null;
                        colorHexInput.addEventListener('mousedown', function() {
                            savedQuillRange = window.quillEditor.getSelection();
                        });
                        colorHexInput.addEventListener('input', function() {
                            if (savedQuillRange) {
                                window.quillEditor.setSelection(savedQuillRange);
                            }
                            window.quillEditor.format('color', colorHexInput.value, 'user');
                        });
                    }

                    // Set initial content — text is stored HTML-escaped, so decode first
                    // (same unescape pattern as renderContent)
                    var quillInitHelper = document.createElement('div');
                    quillInitHelper.innerHTML = overlayOrAnnotation.data.attributes.text || '';
                    window.quillEditor.clipboard.dangerouslyPasteHTML(
                        quillInitHelper.textContent || ''
                    );

                    // Quill → CodeMirror 6 sync
                    // Sync color picker to current selection's color
                    window.quillEditor.on('selection-change', function(range) {
                        if (!range) { return; }
                        var format = window.quillEditor.getFormat(range);
                        if (typeof format.color === 'string') {
                            colorHexInput.value = format.color;
                        }
                    });

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
