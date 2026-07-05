/**
 * @module Shared
 */


/**
 * I am the type definition of a ResourceButton. A button is a lightweight
 * call-to-action overlay: a label plus an action from the shared overlay
 * action model (see {{#crossLink "Resource/executeOverlayAction:method"}}Resource/executeOverlayAction{{/crossLink}}).
 *
 * Buttons are not stored in the resource database — they are configured inline
 * as overlay (or annotation) attributes.
 *
 * @class ResourceButton
 * @category TypeDefinition
 * @extends Resource
 */



FrameTrail.defineType(

    'ResourceButton',

    function (FrameTrail) {
        return {
            parent: 'Resource',
            constructor: function(resourceData){
                this.resourceData = resourceData;
            },
            prototype: {
                /**
                 * I hold the data object of a custom ResourceButton, which is not stored in the Database and doesn't appear in the resource's _index.json.
                 * @attribute resourceData
                 * @type {}
                 */
                resourceData:   {},
                iconClass:      'icon-mouse-pointer',

                /**
                 * I render the content of myself: a styled &lt;button&gt; wrapped in a &lt;div class="resourceDetail" ...&gt;
                 *
                 * @method renderContent
                 * @return HTMLElement
                 */
                renderContent: function() {

                    var self = this,
                        attributes = this.resourceData.attributes || {};

                    var _rdw = document.createElement('div');
                    _rdw.innerHTML = '<div class="resourceDetail" data-type="button">'
                                   + '    <div class="resourceContent">'
                                   + '        <button type="button" class="overlayActionButton"></button>'
                                   + '    </div>'
                                   + '</div>';
                    var resourceDetail = _rdw.firstElementChild;

                    var buttonElement = resourceDetail.querySelector('.overlayActionButton');
                    this.applyButtonStyle(buttonElement, attributes);

                    buttonElement.addEventListener('click', function(evt) {
                        evt.preventDefault();
                        if (FrameTrail.getState('editMode')) { return; }
                        self.executeOverlayAction(self.resourceData.attributes || {});
                    });

                    return resourceDetail;

                },

                /**
                 * I apply label and style attributes to a rendered button element.
                 *
                 * @method applyButtonStyle
                 * @param {HTMLElement} buttonElement
                 * @param {Object} attributes
                 */
                applyButtonStyle: function(buttonElement, attributes) {

                    buttonElement.textContent = attributes.label || this.labels['ResourceTypeButton'];
                    buttonElement.style.backgroundColor = attributes.buttonColor || '#0096ff';
                    buttonElement.style.color = attributes.textColor || '#ffffff';
                    buttonElement.style.borderRadius = ((attributes.borderRadius !== undefined) ? attributes.borderRadius : 4) + 'px';

                },

                /**
                 * I update all rendered button elements of the given overlay or annotation
                 * after attribute changes in the editor.
                 *
                 * @method updateButtonElements
                 * @param {Object} overlayOrAnnotation
                 */
                updateButtonElements: function(overlayOrAnnotation) {

                    var self = this,
                        elements = [];

                    if (overlayOrAnnotation.overlayElement) {
                        elements.push(overlayOrAnnotation.overlayElement);
                    } else if (overlayOrAnnotation.contentViewDetailElements) {
                        elements = overlayOrAnnotation.contentViewDetailElements;
                    }

                    elements.forEach(function(el) {
                        var buttonElement = el.querySelector('.overlayActionButton');
                        if (buttonElement) {
                            self.applyButtonStyle(buttonElement, overlayOrAnnotation.data.attributes || {});
                        }
                    });

                },

                /**
                 * Several modules need me to render a thumb of myself.
                 *
                 * @method renderThumb
                 * @return thumbElement
                 */
                renderThumb: function() {

                    var self = this;

                    var _tew = document.createElement('div');
                    _tew.innerHTML = '<div class="resourceThumb" data-type="button">'
                        + '                  <div class="resourceOverlay">'
                        + '                      <div class="resourceIcon"><span class="icon-mouse-pointer"></span></div>'
                        + '                  </div>'
                        + '                  <div class="resourceTitle">'+ this.labels['ResourceTypeButton'] +'</div>'
                        + '              </div>';
                    var thumbElement = _tew.firstElementChild;

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

                    basicControls.controlsContainer.querySelector('#OverlayOptions').prepend(this.renderButtonEditor(overlay));

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

                    timeControls.controlsContainer.querySelector('#AnnotationOptions').append(this.renderButtonEditor(annotation));

                    return timeControls;

                },

                /**
                 * I render an editor for button properties (label, action, style).
                 *
                 * @method renderButtonEditor
                 * @param {Object} overlayOrAnnotation
                 * @return HTMLElement
                 */
                renderButtonEditor: function(overlayOrAnnotation) {

                    var self = this,
                        attributes = overlayOrAnnotation.data.attributes,
                        category = overlayOrAnnotation.overlayElement ? 'overlays' : 'annotations';

                    var editorContainer = document.createElement('div');
                    editorContainer.className = 'buttonEditorContainer';

                    var _bew = document.createElement('div');
                    _bew.innerHTML = '<div class="layoutRow">'
                        + '    <div class="column-6">'
                        + '        <label>'+ this.labels['SettingsButtonLabel'] +'</label>'
                        + '        <input type="text" class="buttonLabelInput">'
                        + '    </div>'
                        + '    <div class="column-2">'
                        + '        <label>'+ this.labels['SettingsButtonColor'] +'</label>'
                        + '        <input type="color" class="buttonColorInput" value="'+ (attributes.buttonColor || '#0096ff') +'">'
                        + '    </div>'
                        + '    <div class="column-2">'
                        + '        <label>'+ this.labels['SettingsButtonTextColor'] +'</label>'
                        + '        <input type="color" class="buttonTextColorInput" value="'+ (attributes.textColor || '#ffffff') +'">'
                        + '    </div>'
                        + '    <div class="column-2">'
                        + '        <label>'+ this.labels['SettingsHotspotBorderRadius'] +'</label>'
                        + '        <input type="range" class="buttonBorderRadiusRange" min="0" max="40" step="1" value="'+ ((attributes.borderRadius !== undefined) ? attributes.borderRadius : 4) +'">'
                        + '    </div>'
                        + '</div>';
                    while (_bew.firstElementChild) {
                        editorContainer.appendChild(_bew.firstElementChild);
                    }

                    var labelInput = editorContainer.querySelector('.buttonLabelInput');
                    labelInput.value = attributes.label || '';

                    editorContainer.appendChild(this.renderActionControls(overlayOrAnnotation));

                    var registerButtonUndo = function(oldAttributes, newAttributes) {
                        (function(elementId, cat, capturedOld, capturedNew, labels) {
                            var findElement = function() {
                                var arr = (cat === 'overlays')
                                    ? FrameTrail.module('HypervideoModel').overlays
                                    : FrameTrail.module('HypervideoModel').annotations;
                                for (var i = 0; i < arr.length; i++) {
                                    if (arr[i].data.created === elementId) return arr[i];
                                }
                                return null;
                            };
                            var applyAttributes = function(attrs) {
                                var el = findElement();
                                if (!el) return;
                                el.data.attributes.label = attrs.label;
                                el.data.attributes.buttonColor = attrs.buttonColor;
                                el.data.attributes.textColor = attrs.textColor;
                                el.data.attributes.borderRadius = attrs.borderRadius;
                                if (el.resourceItem && el.resourceItem.updateButtonElements) {
                                    el.resourceItem.updateButtonElements(el);
                                }
                                FrameTrail.module('HypervideoModel').newUnsavedChange(cat);
                            };
                            FrameTrail.module('UndoManager').register({
                                category: cat,
                                description: labels['ResourceTypeButton'],
                                undo: function() { applyAttributes(capturedOld); },
                                redo: function() { applyAttributes(capturedNew); }
                            });
                        })(overlayOrAnnotation.data.created, category,
                           Object.assign({}, oldAttributes), Object.assign({}, newAttributes), self.labels);
                    };

                    var snapshotStyleAttributes = function() {
                        return {
                            label: attributes.label,
                            buttonColor: attributes.buttonColor,
                            textColor: attributes.textColor,
                            borderRadius: attributes.borderRadius
                        };
                    };

                    var bindStyleControl = function(input, attributeName, parseValue) {
                        var beforeEdit = null;
                        input.addEventListener('focus', function() {
                            beforeEdit = snapshotStyleAttributes();
                        });
                        input.addEventListener('input', function() {
                            attributes[attributeName] = parseValue(this.value);
                            self.updateButtonElements(overlayOrAnnotation);
                            FrameTrail.module('HypervideoModel').newUnsavedChange(category);
                        });
                        input.addEventListener('change', function() {
                            attributes[attributeName] = parseValue(this.value);
                            self.updateButtonElements(overlayOrAnnotation);
                            FrameTrail.module('HypervideoModel').newUnsavedChange(category);
                            if (beforeEdit) {
                                registerButtonUndo(beforeEdit, snapshotStyleAttributes());
                                beforeEdit = snapshotStyleAttributes();
                            }
                        });
                    };

                    bindStyleControl(labelInput, 'label', String);
                    bindStyleControl(editorContainer.querySelector('.buttonColorInput'), 'buttonColor', String);
                    bindStyleControl(editorContainer.querySelector('.buttonTextColorInput'), 'textColor', String);
                    bindStyleControl(editorContainer.querySelector('.buttonBorderRadiusRange'), 'borderRadius', function(v) { return parseInt(v, 10); });

                    return editorContainer;

                }

            }

        }
    }

);
