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


                /**
                 * I render the content of myself, which is a &lt;div&gt; containing a custom text wrapped in a &lt;div class="resourceDetail" ...&gt;
                 *
                 * @method renderContent
                 * @return HTMLElement
                 */
                renderContent: function() {

                    var self = this;

                    var licenseType = (this.resourceData.licenseType && this.resourceData.licenseType == 'CC-BY-SA-3.0') ? '<a href="https://creativecommons.org/licenses/by-sa/3.0/" title="License: '+ this.resourceData.licenseType +'" target="_blank"><span class="cc-by-sa-bg-image"></span></a>' : this.resourceData.licenseType;
                    var licenseString = (licenseType) ? licenseType +' - '+ this.resourceData.licenseAttribution : '';

                    var resourceDetail = $('<div class="resourceDetail" data-type="'+ this.resourceData.type +'" style="width: 100%; height: 100%;"></div>'),
                        unescapeHelper = document.createElement('div'),
                        child,
                        unescapedString;

                    // unescape string from json
                    unescapeHelper.innerHTML = self.resourceData.attributes.text;
                    child = unescapeHelper.childNodes[0];
                    unescapedString = child ? child.nodeValue : '';

                    resourceDetail.html(unescapedString);

                    resourceDetail.append('<div class="resourceOptions"><div class="licenseInformation">'+ licenseString +'</div><div class="resourceButtons"></div>');

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
                            "background-image: url('"+ FrameTrail.module('RouteNavigation').getResourceURL(this.resourceData.thumb) +"');" : "" );
                    
                    var thumbLabel = this.labels['ResourceCustomTextHTML'];
                    if (this.resourceData.name && this.resourceData.name.length > 0) {
                        thumbLabel = this.resourceData.name;
                    }

                    var tagList = (this.resourceData.tags ? this.resourceData.tags.join(' ') : '');

                    var thumbElement = $('<div class="resourceThumb '+ tagList +'" data-license-type="'+ this.resourceData.licenseType +'" data-type="'+ this.resourceData.type +'" style="'+ thumbBackground +'">'
                        + '                  <div class="resourceOverlay">'
                        + '                      <div class="resourceIcon"><span class="icon-doc-text"></span></div>'
                        + '                  </div>'
                        + '                  <div class="resourceTitle">'+ thumbLabel +'</div>'
                        + '              </div>');

                    var previewButton = $('<div class="resourcePreviewButton"><span class="icon-eye"></span></div>').click(function(evt) {
                        // call the openPreview method (defined in abstract type: Resource)
                        self.openPreview( $(this).parent() );
                        evt.stopPropagation();
                        evt.preventDefault();
                    });
                    thumbElement.append(previewButton);

                    //var decoded_string = $("<div/>").html(self.resourceData.attributes.text).text();
                    //var textOnly = $("<div/>").html(decoded_string).text();
                    //thumbElement.append('<div class="resourceTextPreview">'+ textOnly +'</div>');

                    var decoded_string = $("<div/>").html(self.resourceData.attributes.text).text();
                    thumbElement.append('<div class="resourceTextPreview">'+ decoded_string +'</div>');

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

                    basicControls.controlsContainer.find('#OverlayOptions').append(this.renderTextEditors(overlay));


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

                    timeControls.controlsContainer.find('#AnnotationOptions').append(this.renderTextEditors(annotation));

                    return timeControls;

                },


                /**
                 * I render visual and code editors for text content
                 * @method renderTextEditors
                 * @param {Object} overlayOrAnnotation
                 * @return &#123; textContentEditorContainer: HTMLElement;
                 */
                renderTextEditors: function(overlayOrAnnotation) {

                    delete window.editor;
                    delete window.htmlCodeEditor;
                    delete window.oldTextContent;

                    window.oldTextContent = overlayOrAnnotation.data.attributes.text;

                    /* Define HTML Type  Controls */

                    var editGroups = {
                        editGroupFontFamily: '<a class="btn dropdown-toggle fontFamily" title="'+ this.labels['SettingsFontFamily'] +'"><i class="icon-font"></i><b class="caret"></b></a><ul class="dropdown-menu"></ul>',
                        editGroupFontSize:   '<a class="btn dropdown-toggle fontSize" title="'+ this.labels['SettingsFontSize'] +'"><i class="icon-text-height"></i>&nbsp;<b class="caret"></b></a><ul class="dropdown-menu small"></ul>',
                        editGroupFontStyle:  '<a class="btn" data-wysihtml5-command="bold" title="'+ this.labels['SettingsFontBold'] +'"><i class="icon-bold"></i></a><a class="btn" data-wysihtml5-command="italic" title="'+ this.labels['SettingsFontItalic'] +'"><i class="icon-italic"></i></a><a class="btn" data-wysihtml5-command="underline" title="'+ this.labels['SettingsFontUnderline'] +'"><i class="icon-underline"></i></a>',
                        editGroupFontColor:  '<a class="btn dropdown-toggle right" title="'+ this.labels['SettingsFontColor'] +'"><i class="icon-dot-circled">&nbsp;<b class="caret"></b></a><div class="colorpicker-container-text"><div class="colorpicker-container"></div></div>',
                        editGroupLists:      '<a class="btn" data-wysihtml5-command="insertUnorderedList" title="'+ this.labels['SettingsFontUL'] +'"><i class="icon-list-bullet"></i></a><a class="btn" data-wysihtml5-command="insertOrderedList" title="'+ this.labels['SettingsFontOL'] +'"><i class="icon-list-numbered"></i></a>',
                        editGroupIndention:  '<a class="btn" data-wysihtml5-command="outdent" title="'+ this.labels['SettingsFontIndentMinus'] +'"><i class="icon-indent-left"></i></a><a class="btn" data-wysihtml5-command="indent" title="'+ this.labels['SettingsFontIndentPlus'] +'"><i class="icon-indent-right"></i></a>',
                        editGroupAlignment:  '<a class="btn" data-wysihtml5-command="alignLeftStyle" title="'+ this.labels['SettingsFontAlignLeft'] +'"><i class="icon-align-left"></i></a><a class="btn" data-wysihtml5-command="alignCenterStyle" title="'+ this.labels['SettingsFontAlignCenter'] +'"><i class="icon-align-center"></i></a><a class="btn" data-wysihtml5-command="alignRightStyle" title="'+ this.labels['SettingsFontAlignRight'] +'"><i class="icon-align-right"></i></a><a class="btn" data-wysihtml5-command="alignJustifyStyle" title="'+ this.labels['SettingsFontAlignJustify'] +'"><i class="icon-align-justify"></i></a>'
                        //editGroupHyperlink:  '<a class="btn hyperlink" title="Hyperlink" data-wysihtml5-command="createLink"><i class="icon-link"></i></a><div class="hyperlink-dropdown input-append" data-wysihtml5-dialog="createLink" style="display: none;"><input data-wysihtml5-dialog-field="href" value="http://" class="text"><a data-wysihtml5-dialog-action="save"></a><a data-wysihtml5-command="removeLink"></a><a data-wysihtml5-dialog-action="cancel"></a></div>'
                    }
                    
                    var activeFonts =         ['Arial', 'Arial Black', 'Courier', 'Courier New', 'Dosis', 'Lucida Console', 'Helvetica', 'Impact', 'Lucida Grande', 'Lucida Sans', 'Montserrat', 'Tahoma', 'Times', 'Times New Roman', 'TitilliumWeb', 'Verdana'],
                        activeFontSizes =     ['8px', '9px', '10px', '11px', '12px', '13px', '14px', '15px', '16px', '17px', '18px', '20px', '22px', '26px', '28px', '30px', '32px', '34px', '36px', '38px', '40px', '46px', '50px', '60px', '70px'];

                    /* Add Panels and Text Areas */
                    
                    var textContentEditorContainer = $('<div class="textContentEditorContainer"></div>'),
                        visualEditorTab = $('<div class="textEditorTab">'+ this.labels['SettingsVisualEditor'] +' (beta)</div>'),
                        htmlEditorTab = $('<div class="textEditorTab">'+ this.labels['SettingsHTMLEditor'] +'</div>'),
                        visualEditorContent = $('<div class="textEditorContent visualEditorContent"></div>'),
                        htmlEditorContent = $('<div class="textEditorContent htmlEditorContent"></div>');

                    visualEditorTab.click(function() {
                        htmlEditorTab.removeClass('active');
                        htmlEditorContent.hide();
                        $(this).addClass('active');
                        visualEditorContent.show();
                    });
                    visualEditorTab.click();

                    htmlEditorTab.click(function() {
                        visualEditorTab.removeClass('active');
                        visualEditorContent.hide();
                        $(this).addClass('active');
                        htmlEditorContent.show();
                        if (window.htmlCodeEditor) {
                            window.htmlCodeEditor.refresh();

                            try {
                                if (TogetherJS && TogetherJS.running) {
                                    TogetherJS.reinitialize();
                                }
                            } catch (e) {}

                        }
                    });

                    textContentEditorContainer.append(visualEditorTab, htmlEditorTab, visualEditorContent, htmlEditorContent);
                    
                    var textarea = $('<textarea>' + overlayOrAnnotation.data.attributes.text + '</textarea>');
                    htmlEditorContent.append(textarea);

                    /* Add Text Editor Toolbar */

                    var textEditorToolbar = $('<div id="textEditorToolbar" data-role="editor-toolbar" data-target="#currentEditor"></div>');
                        
                    for (var editGroup in editGroups ) {
                        var htmlString = editGroups[editGroup];
                        var currentGroup = $('<div class="btn-group">'+ htmlString +'</div>');
                        
                        textEditorToolbar.append(currentGroup);
                    }

                    textEditorToolbar.on('mousedown', function(evt) {
                        evt.stopPropagation();
                    });
                    textEditorToolbar.on('mouseup', function(evt) {
                        evt.stopPropagation();
                    });

                    visualEditorContent.append(textEditorToolbar);

                    //this.set({ textEditorToolbar: textEditorToolbar });

                    initToolbarBindings();

                    var visualEditorWrapper = $('<div class="visualEditorWrapper"></div>'),
                        visualTextarea = $('<textarea>' + overlayOrAnnotation.data.attributes.text + '</textarea>');
                    
                    visualEditorWrapper.append(visualTextarea);
                    visualEditorContent.append(visualEditorWrapper);

                    //textEditor.style.display = 'none';

                    /* Init CodeMirror for Custom HTML */

                    window.htmlCodeEditor = CodeMirror.fromTextArea(textarea[0], {
                            value: textarea[0].value,
                            lineNumbers: true,
                            mode:  'text/html',
                            htmlMode: true,
                            lint: true,
                            lineWrapping: true,
                            tabSize: 2,
                            theme: 'hopscotch'
                        });

                    var delayTimer;

                    window.htmlCodeEditor.on('change', function(instance, changeObj) {

                        var thisTextarea = $(instance.getTextArea());

                        thisTextarea.val(instance.getValue());

                        if (window.editor && changeObj.origin != 'setValue') {
                            window.editor.setValue(instance.getValue());
                        } else if (changeObj.origin == 'setValue') {
                            
                            // auto-indent
                            /*
                            var totalLines = instance.lineCount();
                            instance.autoFormatRange({line:0, ch:0}, {line:totalLines});
                            instance.autoIndentRange({line:0, ch:0}, {line:totalLines});
                            */
                        }

                        var escapeHelper = document.createElement('div'),
                            escapedHtml;

                        // save escaped html string
                        escapeHelper.appendChild(document.createTextNode(instance.getValue()));
                        escapedHtml = escapeHelper.innerHTML;
                        overlayOrAnnotation.data.attributes.text = escapedHtml;

                        if (overlayOrAnnotation.overlayElement) {
                            
                            overlayOrAnnotation.overlayElement.children('.resourceDetail').html(instance.getValue());

                            FrameTrail.module('HypervideoModel').newUnsavedChange('overlays');

                            if (window.oldTextContent != overlayOrAnnotation.data.attributes.text) {
                                clearTimeout(delayTimer);
                                delayTimer = setTimeout(function() {
                                    FrameTrail.triggerEvent('userAction', {
                                        action: 'OverlayChange',
                                        overlay: overlayOrAnnotation.data,
                                        changes: [
                                            {
                                                property: 'attributes.text',
                                                oldValue: window.oldTextContent,
                                                newValue: overlayOrAnnotation.data.attributes.text
                                            }
                                        ]
                                    });
                                    window.oldTextContent = overlayOrAnnotation.data.attributes.text;
                                }, 3000);
                            }

                        } else {
                            
                            // Update annotation elements in dom

                            FrameTrail.module('HypervideoModel').newUnsavedChange('annotations');

                            if (window.oldTextContent != overlayOrAnnotation.data.attributes.text) {
                                clearTimeout(delayTimer);
                                delayTimer = setTimeout(function() {
                                    
                                    $(overlayOrAnnotation.contentViewDetailElements).each(function() {
                                        $(this).find('.resourceDetail').html(instance.getValue());
                                    });

                                    //var decoded_string = $("<div/>").html(instance.getValue()).text();
                                    //var textOnly = $("<div/>").html(decoded_string).text();

                                    $(overlayOrAnnotation.contentViewElements).each(function() {
                                        $(this).find('.resourceThumb .resourceTextPreview').html(instance.getValue());
                                    });
                                    
                                    overlayOrAnnotation.timelineElement.find('.previewWrapper .resourceTextPreview').html(instance.getValue());
                                    
                                    $(FrameTrail.getState('target')).find('.editPropertiesContainer .resourceTextPreview').html(instance.getValue());

                                    FrameTrail.triggerEvent('userAction', {
                                        action: 'AnnotationChange',
                                        annotation: overlayOrAnnotation.data,
                                        changes: [
                                            {
                                                property: 'attributes.text',
                                                oldValue: window.oldTextContent,
                                                newValue: overlayOrAnnotation.data.attributes.text
                                            }
                                        ]
                                    });
                                    window.oldTextContent = overlayOrAnnotation.data.attributes.text;
                                }, 3000);
                                
                            }

                        }
                        


                    });
                    window.htmlCodeEditor.setSize(null, '100%');

                    /* Init WYSIHTML5 Visual Editor */

                    window.editor = new wysihtml5.Editor(visualTextarea[0], { // id of textarea element
                      toolbar:      'textEditorToolbar', // id of toolbar element
                      style:        false, 
                      useLineBreaks: false,
                      parserRules:  wysihtml5ParserRules, // defined in parser rules set
                      cleanUp:      true, 
                      stylesheets:  ['_shared/styles/generic.css']
                    }).on('load', function() {
                        
                        visualEditorContent.find('.wysihtml5-sandbox').on('mouseenter', function() {
                            // Hide open dropdown menus
                            $('.dropdown-menu').removeClass('active');
                            $('.dropdown-toggle').removeClass('open');
                            $('.colorpicker-container-text').removeClass('active');
                        });

                        visualTextarea.click();
                        //editor.focus();

                        initColorpicker({
                            initialColor: undefined,
                            setCallback: function(colorCode){
                                
                                if ( editor.composer.commands.stateValue("fontColorStyle") !== colorCode ) {
                                    editor.composer.commands.exec('fontColorStyle', colorCode );
                                }

                            }
                        });

                        visualEditorContent.find('.wysihtml5-sandbox')[0].contentWindow.document.body.addEventListener('selectstart', function () {
                        
                            var fired = false;

                            visualEditorContent.find('.wysihtml5-sandbox')[0].contentWindow.addEventListener('mouseup', function(evt) {
                                if (!fired) {
                                    if (this.getSelection().type == 'Range') {
                                                                        
                                        var currentFontColor = undefined;

                                        if ( editor.composer.commands.stateValue("fontColorStyle") ) {
                                            currentFontColor = editor.composer.commands.stateValue("fontColorStyle");
                                        }
                                        
                                        initColorpicker({
                                            initialColor: currentFontColor,
                                            setCallback: function(colorCode){
                                                
                                                if ( editor.composer.commands.stateValue("fontColorStyle") !== colorCode ) {
                                                    editor.composer.commands.exec('fontColorStyle', colorCode );
                                                }

                                            }
                                        });
                                    }

                                    fired = true;
                                }
                                
                            });
                            
                        });

                        visualEditorContent.find('.wysihtml5-sandbox').contents().find('body').on('keyup',function() {
                            window.htmlCodeEditor.getDoc().setValue(window.editor.getValue());
                        });

                        window.setTimeout(function() {
                            window.editor.on('aftercommand:composer', function(evt) {
                                window.htmlCodeEditor.getDoc().setValue(window.editor.getValue());
                            });
                        }, 3000);

                        
                    }).on('change', function() {
                        window.htmlCodeEditor.getDoc().setValue(window.editor.getValue());
                    }).on('blur', function() {
                        
                        //window.htmlCodeEditor.getDoc().setValue(window.editor.getValue());
                        
                        visualEditorContent.find('.wysihtml5-sandbox').show();
                        visualTextarea.hide();

                    }).on('focus', function() {
                        
                        visualTextarea.hide();
                        var sandbox = visualEditorContent.find('.wysihtml5-sandbox');

                        sandbox[0].contentWindow.document.body.style.overflow = 'hidden';
                        
                        /*
                        sandbox.style.borderWidth = self.get('textEditor').style.borderWidth;
                        sandbox.style.borderColor = self.get('textEditor').style.borderColor;
                        sandbox.style.borderRadius = self.get('textEditor').style.borderRadius;
                        sandbox.style.backgroundColor = self.get('textEditor').style.backgroundColor;
                        sandbox.style.backgroundRepeat = self.get('textEditor').style.backgroundRepeat;
                        sandbox.style.backgroundImage = self.get('textEditor').style.backgroundImage;
                        sandbox.style.padding = self.get('textEditor').style.padding;
                        sandbox.style.boxSizing = self.get('textEditor').style.boxSizing;
                        sandbox.style.outline = self.get('textEditor').style.outline;
                        sandbox.style.borderStyle = self.get('textEditor').style.borderStyle;
                        */

                        sandbox.css({
                            position: 'absolute',
                            top: visualTextarea[0].style.top,
                            left: visualTextarea[0].style.left,
                            width: 100 + '%',
                            height: 100 + '%'
                        }).show();
                        
                    });
                                  
                    visualTextarea.on('click', function(evt){

                        if (editor) {
                            window.editor.focus(); 
                        }
                        
                        evt.stopPropagation();
                        return;
                    });
                    
                    function initToolbarBindings() {

                        var fontTarget = textEditorToolbar.find('.fontFamily').eq(0).parent().find('.dropdown-menu');
                        
                        for (var i=0; i<activeFonts.length; i++) {
                            var fontName = activeFonts[i];
                            var fontBtn = $('<li><a data-wysihtml5-command="fontFamilyStyle" data-wysihtml5-command-value="' + fontName +'" style="font-family: '+ fontName +'">'+ fontName + '</a></li>');
                            fontTarget.append(fontBtn);
                        }

                        var fontSizeTarget = textEditorToolbar.find('.fontSize').eq(0).parent().find('.dropdown-menu');

                        for (var s=0; s<activeFontSizes.length; s++) {
                            var fontSize = activeFontSizes[s];
                            var fontSizeBtn = $('<li><a data-wysihtml5-command="fontSizeStyle" data-wysihtml5-command-value="' + fontSize +'">'+ fontSize + '</a></li>');
                            fontSizeTarget.append(fontSizeBtn);
                        }
                           
                        textEditorToolbar.find('.hyperlink-dropdown input.text').on('keyup', function (evt) {
                            evt.stopPropagation();
                            evt.preventDefault();
                        });
                        

                        textEditorToolbar.find('.hyperlink').on('click', function() {

                            textEditorToolbar.find('.dropdown-toggle').removeClass('active');
                            textEditorToolbar.find('.dropdown-menu').removeClass('active');
                            $('.colorpicker-container-text').removeClass('active');
                            dropdownMenus.removeClass('open');

                            if ( $(this).hasClass('wysihtml5-command-dialog-opened') ) {
                                $(this).next().find('[data-wysihtml5-dialog-action="cancel"]').click();
                            }

                        });

                        var dropdownMenus = textEditorToolbar.find('.btn');
                        
                        for (var d=0; d<dropdownMenus.length; d++) {
                            
                            if ( $(dropdownMenus[d]).hasClass('dropdown-menu') ) {
                                $(dropdownMenus[d]).on('click', function() {
                                
                                    var dropdownClass = 'dropdown-menu';

                                    if ( $(this).hasClass('open') ) {
                                        $(this).next().removeClass('active');
                                        $(this).removeClass('open');
                                    } else {
                                        textEditorToolbar.find('.dropdown-menu').removeClass('active')
                                        $('.colorpicker-container-text').removeClass('active');
                                        
                                        $(this).next().addClass('active');
                                        
                                        dropdownMenus.removeClass('open');
                                        $(this).addClass('open');
                                    }

                                });
                            }

                            
                            $(dropdownMenus[d]).click(function() {
                                
                                textEditorToolbar.find('.dropdown-menu').removeClass('active');

                                $('.colorpicker-container-text').removeClass('active');
                                
                                for (var d=0; d<dropdownMenus.length; d++) {
                                    $(dropdownMenus[d]).removeClass('open');
                                    
                                    if ( $(dropdownMenus[d]).hasClass('wysihtml5-command-dialog-opened') ) {
                                        $(dropdownMenus[d]).next().find('[data-wysihtml5-dialog-action="cancel"]').click();
                                    }

                                }

                                if ( $(this).hasClass('dropdown-toggle') ) {
                                    $(this).next().addClass('active');
                                    $(this).addClass('open');
                                }
                                
                            });
                            

                        }

                        var buttons = textEditorToolbar.find('.dropdown-menu li, .dropdown-menu button, .dropdown-menu.input-append a');

                        for (var b=0; b<buttons.length; b++) {
                            $(buttons[b]).on('click', function() {
                                $(this).parent().removeClass('active');
                                dropdownMenus.removeClass('open');
                            });
                        }

                    } // END initToolbarBindings()

                    var colorpicker;

                    function initColorpicker(colorPickerConfig) {

                        var colorpickerContainer = textEditorToolbar.find('.colorpicker-container');
                        colorpicker;

                        // Inputs

                        var colorpickerInputR,
                            colorpickerInputB,
                            colorpickerInputB,
                            colorpickerInputHex;

                        var start = function() {
                            
                            var colorpickerElement = $('<div class="colorpicker"></div>');
                            colorpickerContainer.append(colorpickerElement);

                            var colorpickerInputContainer = $('<div class="colorpicker-input-container"></div>');

                            var colorPickerInputRContainer = $('<div data-label="R:"></div>');
                            colorpickerInputR = $('<input type="number"/>');
                            colorpickerInputR.on('change', function() {
                                updatePicker(ColorPicker.rgb2hex({ r: this.value, g: colorpickerInputG[0].value, b: colorpickerInputB[0].value }));
                            });
                            colorPickerInputRContainer.append(colorpickerInputR);
                            colorpickerInputContainer.append(colorPickerInputRContainer);

                            var colorPickerInputGContainer = $('<div data-label="G:"></div>');
                            colorpickerInputG = $('<input type="number"/>');
                            colorpickerInputG.on('change', function() {
                                updatePicker(ColorPicker.rgb2hex({ r: colorpickerInputR[0].value, g: this.value, b: colorpickerInputB[0].value }));
                            });
                            colorPickerInputGContainer.append(colorpickerInputG);
                            colorpickerInputContainer.append(colorPickerInputGContainer);

                            var colorPickerInputBContainer = $('<div data-label="B:"></div>');
                            colorpickerInputB = $('<input type="number"/>');
                            colorpickerInputB.on('change', function() {
                                updatePicker(ColorPicker.rgb2hex({ r: colorpickerInputR[0].value, g: colorpickerInputG[0].value, b: this.value }));
                            });
                            colorPickerInputBContainer.append(colorpickerInputB);
                            colorpickerInputContainer.append(colorPickerInputBContainer);

                            colorpickerInputHex = $('<input type="text"/>');
                            colorpickerInputHex.on('change', function() {
                                updatePicker(this.value);
                            });
                            colorpickerInputContainer.append(colorpickerInputHex);

                            colorpickerContainer.append(colorpickerInputContainer);


                            colorpicker = ColorPicker(colorpickerElement[0], updateColor);
                            
                            //self.set({ colorpicker: colorpicker });

                            //updatePicker(initialColor);

                            var topColors = getMostUsedColors();
                            var topColorsContainer = $('<div class="colorpicker-top-colors"></div>');

                            for (var i=0; i<topColors.length; i++) {
                                var topColorElement = $('<span style="background-color: '+ topColors[i].color +'"></span>');
                                    topColorElement.on('mousedown', function() {
                                        updatePicker(rgbString2Hex(this.style.backgroundColor));
                                    });
                                topColorsContainer.append(topColorElement);
                            }

                            colorpickerContainer.append(topColorsContainer);

                            var transparentElement = $('<div class="colorpicker-transparent"></div>');
                                transparentElement.on('mousedown', function() {
                                    colorPickerConfig.setCallback.call(this, '');
                                });
                            colorpickerContainer.append(transparentElement);
                            
                        }


                        var updateColor = function(hex) {
                            
                            if ( hex ) {
                                var rgb = ColorPicker.hex2rgb(hex);

                                colorpickerInputHex.value = hex;
                                
                                colorpickerInputR.value = rgb.r;
                                colorpickerInputG.value = rgb.g;
                                colorpickerInputB.value = rgb.b;
                                
                                
                                colorPickerConfig.setCallback.call(this, 'rgb('+rgb.r+','+rgb.g+','+rgb.b+')');
                            }

                        }
                        

                        var updatePicker = function(hex) {
                            colorpicker.setHex(hex);
                        }

                        var rgbString2Hex = function(rgbString) {
                             if(rgbString === ''){
                                return '';
                             }
                             if (  rgbString.search("rgb") == -1 ) {
                                  return rgbString;
                             } else {
                                  rgbString = rgbString.match(/^rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*(\d+))?\)$/);
                                  function hex(x) {
                                       return ("0" + parseInt(x).toString(16)).slice(-2);
                                  }
                                  return "#" + hex(rgbString[1]) + hex(rgbString[2]) + hex(rgbString[3]); 
                             }
                        };

                        var getMostUsedColors = function() {
                            
                            var elements = $('.overlayContainer .overlayElement .resourceDetail[data-type="text"] span');
                            var colorArray = [];

                            elements.each(function() {
                                var element = $(this)[0];
                                if ( element.style.color.length ) {
                                    colorArray.push(element.style.color);
                                }
                            });

                            var frequencyObject = {};
                            for( var v in colorArray ) {
                                frequencyObject[colorArray[v]]=(frequencyObject[colorArray[v]] || 0)+1;
                            }

                            var frequencyArray = [];
                            for ( var f in frequencyObject ) {
                                var newObj = {};
                                newObj["color"] = f;
                                newObj["count"] = frequencyObject[f]
                                frequencyArray.push(newObj);
                            }

                            function compare(a,b) {
                                if (a.count < b.count)
                                    return 1;
                                if (a.count > b.count)
                                    return -1;
                                return 0;
                            }

                            frequencyArray.sort(compare);

                            if ( frequencyArray.length > 5 ) {
                                frequencyArray.slice(0, 5);
                            }

                            return frequencyArray;

                        }
                        
                        if ( colorpickerContainer.find('.colorpicker').length == 0 ) {
                            var initialColor = undefined;
                            start();
                        } else if ( colorPickerConfig.initialColor ) {
                            var initialColor = rgbString2Hex(colorPickerConfig.initialColor);
                            updatePicker(initialColor);
                        }

                    } // END initColorpicker

                    return textContentEditorContainer;

                }



            }



        }
    }


);
