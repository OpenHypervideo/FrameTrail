/**
 * @module Shared
 */


/**
 * I am the type definition of a ResourceHtml.
 *
 * * HTML Resources only appear in the 'Add Custom Overlay' tab
 *   and are not listed in the ResourceManager.
 *
 * * HTML Resources can not be used as Annotation
 *
 * * Unlike ResourceText, HTML content is never sanitised or
 *   processed by a WYSIWYG editor — only the CodeMirror HTML
 *   editor is offered.
 *
 * @class ResourceHtml
 * @category TypeDefinition
 * @extends Resource
 */



FrameTrail.defineType(

    'ResourceHtml',

    function (FrameTrail) {
        return {
            parent: 'Resource',
            constructor: function(resourceData){
                this.resourceData = resourceData;
            },
            prototype: {
                /**
                 * I hold the data object of a custom ResourceHtml, which is not stored in the Database and doesn't appear in the resource's _index.json.
                 * @attribute resourceData
                 * @type {}
                 */
                resourceData:   {},
                iconClass:      'icon-file-code',


                /**
                 * I render the content of myself, which is a &lt;div&gt; containing custom HTML wrapped in a &lt;div class="resourceDetail" ...&gt;
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

                    var thumbLabel = this.labels['ResourceCustomHTML'];
                    if (this.resourceData.name && this.resourceData.name.length > 0) {
                        thumbLabel = this.resourceData.name;
                    }

                    var tagList = (this.resourceData.tags ? this.resourceData.tags.join(' ') : '');

                    var _tw = document.createElement('div');
                    _tw.innerHTML = '<div class="resourceThumb '+ tagList +'" data-license-type="'+ this.resourceData.licenseType +'" data-type="'+ this.resourceData.type +'" style="'+ thumbBackground +'">'
                        + '    <div class="resourceOverlay">'
                        + '        <div class="resourceIcon"><span class="icon-file-code"></span></div>'
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

                    basicControls.controlsContainer.querySelector('#OverlayOptions').prepend(this.renderHtmlEditor(overlay));


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

                    timeControls.controlsContainer.querySelector('#AnnotationOptions').append(this.renderHtmlEditor(annotation));

                    return timeControls;

                },


                /**
                 * I render the CodeMirror HTML editor for editing raw HTML content.
                 * Unlike ResourceText, no Quill visual editor is offered.
                 * @method renderHtmlEditor
                 * @param {Object} overlayOrAnnotation
                 * @return HTMLElement
                 */
                renderHtmlEditor: function(overlayOrAnnotation) {

                    var self = this;

                    delete window.htmlCodeEditor;
                    delete window.oldTextContent;

                    window.oldTextContent = overlayOrAnnotation.data.attributes.text;

                    var htmlEditorContainer = document.createElement('div');
                    htmlEditorContainer.className = 'textContentEditorContainer htmlOnlyEditorContainer';

                    var htmlEditorLabel = document.createElement('div');
                    htmlEditorLabel.className = 'textEditorTab active';
                    htmlEditorLabel.textContent = this.labels['SettingsHTMLEditor'];

                    var htmlEditorContent = document.createElement('div');
                    htmlEditorContent.className = 'textEditorContent htmlEditorContent';
                    htmlEditorContent.style.display = '';

                    htmlEditorContainer.append(htmlEditorLabel, htmlEditorContent);

                    var textarea = document.createElement('textarea');
                    textarea.textContent = overlayOrAnnotation.data.attributes.text;
                    htmlEditorContent.appendChild(textarea);

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
                                                    description: (cat === 'overlays' ? labels['SidebarOverlays'] : labels['SidebarMyAnnotations']) + ' HTML',
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

                                        // Write into the content wrapper so the license block survives
                                        var htmlDetail = overlayOrAnnotation.overlayElement.querySelector('.resourceDetail');
                                        (htmlDetail.querySelector('.resourceContent') || htmlDetail).innerHTML = newHtml;
                                        if (overlayOrAnnotation.contentChanged) { overlayOrAnnotation.contentChanged(); }
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


                    return htmlEditorContainer;

                },

                getDisplayLabel: function() {
                    if (this.resourceData.attributes && this.resourceData.attributes.text) {
                        // attributes.text is HTML-escaped HTML; two-step decode:
                        // step 1: decode HTML entities -> real HTML string
                        var _step1 = document.createElement('div');
                        _step1.innerHTML = this.resourceData.attributes.text;
                        // step 2: parse real HTML, extract plain text
                        var _step2 = document.createElement('div');
                        _step2.innerHTML = _step1.textContent;
                        var plainText = _step2.textContent.trim();
                        return plainText.substring(0, 50) || this.resourceData.name || 'HTML';
                    }
                    return this.resourceData.name || 'HTML';
                }



            }



        }
    }


);
