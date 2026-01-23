/**
 * @module Player
 */

/**
 * I am the AdminSettingsDialog. I provide a dialog for editing admin/global settings.
 *
 * @class AdminSettingsDialog
 * @static
 */

FrameTrail.defineModule('AdminSettingsDialog', function(FrameTrail){

    var labels = FrameTrail.module('Localization').labels;

    /**
     * I open the admin settings dialog.
     * @method open
     */
    function open() {

        var database = FrameTrail.module('Database');

        // Check if user is admin
        if (FrameTrail.module('UserManagement').userRole !== 'admin') {
            console.error('Admin access required');
            return;
        }

        // Track if changes were made
        var configChanged = false;
        var globalCSSChanged = false;
        var initialConfig = JSON.parse(JSON.stringify(database.config));
        var initialCSS = ($('head > style.FrameTrailGlobalCustomCSS').length != 0) ? $('head > style.FrameTrailGlobalCustomCSS').html() : '';

        var adminDialog = $('<div class="adminSettingsDialog" title="'+ labels['GenericAdministration'] +'"></div>');

        var adminTabs = $('<div class="adminSettingsTabs">'
                        + '    <ul>'
                        + '        <li>'
                        + '            <a href="#Configuration">'+ labels['SettingsConfigurationOptions'] +'</a>'
                        + '        </li>'
                        + '        <li>'
                        + '            <a href="#TagDefinitions">'+ labels['SettingsManageTags'] +'</a>'
                        + '        </li>'
                        + '        <li>'
                        + '            <a href="#ChangeGlobalCSS">'+ labels['SettingsGlobalCSS'] +'</a>'
                        + '        </li>'
                        + '        <li>'
                        + '            <a href="#ChangeTheme">'+ labels['SettingsColorTheme'] +'</a>'
                        + '        </li>'
                        + '    </ul>'
                        + '    <div id="Configuration"></div>'
                        + '    <div id="ChangeTheme"></div>'
                        + '    <div id="ChangeGlobalCSS"></div>'
                        + '    <div id="TagDefinitions">'
                        + '        <div class="message active">'+ labels['MessageManageTags'] +'</div>'
                        + '    </div>'
                        + '</div>');

        adminDialog.append(adminTabs);

        adminTabs.tabs({
            activate: function(event, ui) {
                if (ui.newPanel.find('.CodeMirror').length != 0) {
                    ui.newPanel.find('.CodeMirror')[0].CodeMirror.refresh();
                }
            }
        });

        /* Configuration Editing UI */
        var configData = database.config,
            configurationUI = $('<div class="configEditingForm layoutRow">'
                            +   '    <div class="column-3">'
                            +   '        <input type="checkbox" name="userNeedsConfirmation" id="userNeedsConfirmation" value="userNeedsConfirmation" '+((configData.userNeedsConfirmation && configData.userNeedsConfirmation.toString() == "true") ? "checked" : "")+'>'
                            +   '        <label for="userNeedsConfirmation" data-tooltip-bottom-left="'+ labels['MessageUserRequireConfirmation'] +'">'+ labels['SettingsOnlyConfirmedUsers'] +'</label><br>'
                            +   '        <div style="margin-top: 5px; margin-bottom: 8px;" data-tooltip-left="'+ labels['MessageUserRequireRole'] +'">'+ labels['SettingsDefaultUserRole'] +': <br>'
                            +   '            <input type="radio" name="defaultUserRole" id="user_role_admin" value="admin" '+((configData.defaultUserRole == "admin") ? "checked" : "")+'>'
                            +   '            <label for="user_role_admin">'+ labels['UserRoleAdmin'] +'</label>'
                            +   '            <input type="radio" name="defaultUserRole" id="user_role_user" value="user" '+((configData.defaultUserRole == "user") ? "checked" : "")+'>'
                            +   '            <label for="user_role_user">'+ labels['UserRoleUser'] +'</label><br>'
                            +   '        </div>'
                            +   '        <input type="checkbox" name="allowCollaboration" id="allowCollaboration" value="allowCollaboration" '+((configData.allowCollaboration && configData.allowCollaboration.toString() == "true") ? "checked" : "")+'>'
                            +   '        <label for="allowCollaboration" data-tooltip-left="'+ labels['MessageUserCollaboration'] +'">'+ labels['SettingsAllowCollaboration'] +'</label><br>'
                            +   '    </div>'
                            +   '    <div class="column-3">'
                            +   '        <input type="checkbox" name="defaultHypervideoHidden" id="defaultHypervideoHidden" value="defaultHypervideoHidden" '+((configData.defaultHypervideoHidden && configData.defaultHypervideoHidden.toString() == "true") ? "checked" : "")+'>'
                            +   '        <label for="defaultHypervideoHidden" data-tooltip-bottom-left="'+ labels['MessageNewHypervideoHidden'] +'">'+ labels['SettingsNewHypervideoHidden'] +'</label><br>'
                            +   '        <input type="checkbox" name="allowUploads" id="allowUploads" value="allowUploads" '+((configData.allowUploads && configData.allowUploads.toString() == "true") ? "checked" : "")+'>'
                            +   '        <label for="allowUploads" data-tooltip-left="'+ labels['MessageAllowFileUploads'] +'">'+ labels['SettingsAllowUploads'] +'</label><br>'
                            +   '        <input type="checkbox" name="mediaOptimizationEnabled" id="mediaOptimizationEnabled" value="mediaOptimizationEnabled" '+((configData.mediaOptimization && configData.mediaOptimization.enabled) ? "checked" : "")+'>'
                            +   '        <label for="mediaOptimizationEnabled" data-tooltip-left="'+ labels['MessageMediaOptimization'] +'">'+ labels['SettingsMediaOptimization'] +'</label><br>'
                            +   '        <input type="checkbox" name="mediaOptimizationUseFFmpeg" id="mediaOptimizationUseFFmpeg" value="mediaOptimizationUseFFmpeg" '+((configData.mediaOptimization && configData.mediaOptimization.useFFmpeg) ? "checked" : "")+'>'
                            +   '        <label for="mediaOptimizationUseFFmpeg" data-tooltip-left="'+ labels['MessageUseFFmpeg'] +'">'+ labels['SettingsUseFFmpeg'] +'</label><br>'
                            +   '    </div>'
                            +   '    <div class="column-3">'
                            +   '        <input type="checkbox" name="captureUserTraces" id="captureUserTraces" value="captureUserTraces" '+((configData.captureUserTraces && configData.captureUserTraces.toString() == "true") ? "checked" : "")+'>'
                            +   '        <label for="captureUserTraces">'+ labels['SettingsCaptureUserActions'] +'</label><br>'
                            +   '        <div class="message active" style="width: calc(100% - 50px)">'+ labels['MessageUserTraces'] +' <i>localStorage.getItem( "frametrail-traces" )</i></div>'
                            +   '    </div>'
                            +   '    <div class="column-3">'
                            +   '        <label for="userTracesStartAction" data-tooltip-bottom-right="'+ labels['MessageUserTracesStartAction'] +'">'+ labels['SettingsUserTracesStartAction'] +'</label><br>'
                            +   '        <input type="text" style="margin-top: 0px; margin-bottom: 2px;" name="userTracesStartAction" id="userTracesStartAction" placeholder="'+ labels['SettingsUserTracesStartAction'] +'" value="'+ (configData.userTracesStartAction || '') +'"><br>'
                            +   '        <label for="userTracesEndAction" data-tooltip-right="'+ labels['MessageUserTracesStartAction'] +'">'+ labels['SettingsUserTracesEndAction'] +'</label><br>'
                            +   '        <input type="text" style="margin-top: 0px; margin-bottom: 2px;" name="userTracesEndAction" id="userTracesEndAction" placeholder="'+ labels['SettingsUserTracesEndAction'] +'" value="'+ (configData.userTracesEndAction || '') +'">'
                            +   '    </div>'
                            +   '</div>');

        adminTabs.find('#Configuration').append(configurationUI);

        // Track changes but don't apply them until save
        configurationUI.find('input[type="text"]').on('keydown', function(evt) {
            if (!evt.originalEvent.metaKey && evt.originalEvent.key != 'Meta') {
                configChanged = true;
            }
        });

        configurationUI.find('input[type="checkbox"]').on('change', function(evt) {
            configChanged = true;
        });

        configurationUI.find('input[type="radio"]').on('change', function(evt) {
            configChanged = true;
        });

        /* Change Theme UI */
        var ChangeThemeUI = $('<div class="themeContainer">'
                            + '    <div class="message active">'+ labels['SettingsSelectColorTheme'] +'</div>'
                            + '    <div class="themeItem" data-theme="default">'
                            + '        <div class="themeName">'+ labels['GenericDefault'] +'</div>'
                            + '        <div class="themeColorContainer">'
                            + '            <div class="primary-fg-color"></div>'
                            + '            <div class="secondary-bg-color"></div>'
                            + '            <div class="secondary-fg-color"></div>'
                            + '        </div>'
                            + '    </div>'
                            + '    <div class="themeItem" data-theme="dark">'
                            + '        <div class="themeName">Dark</div>'
                            + '        <div class="themeColorContainer">'
                            + '            <div class="primary-fg-color"></div>'
                            + '            <div class="secondary-bg-color"></div>'
                            + '            <div class="secondary-fg-color"></div>'
                            + '        </div>'
                            + '    </div>'
                            + '    <div class="themeItem" data-theme="bright">'
                            + '        <div class="themeName">Bright</div>'
                            + '        <div class="themeColorContainer">'
                            + '            <div class="primary-fg-color"></div>'
                            + '            <div class="secondary-bg-color"></div>'
                            + '            <div class="secondary-fg-color"></div>'
                            + '        </div>'
                            + '    </div>'
                            + '    <div class="themeItem" data-theme="blue">'
                            + '        <div class="themeName">Blue</div>'
                            + '        <div class="themeColorContainer">'
                            + '            <div class="primary-fg-color"></div>'
                            + '            <div class="secondary-bg-color"></div>'
                            + '            <div class="secondary-fg-color"></div>'
                            + '        </div>'
                            + '    </div>'
                            + '    <div class="themeItem" data-theme="green">'
                            + '        <div class="themeName">Green</div>'
                            + '        <div class="themeColorContainer">'
                            + '            <div class="primary-fg-color"></div>'
                            + '            <div class="secondary-bg-color"></div>'
                            + '            <div class="secondary-fg-color"></div>'
                            + '        </div>'
                            + '    </div>'
                            + '    <div class="themeItem" data-theme="orange">'
                            + '        <div class="themeName">Orange</div>'
                            + '        <div class="themeColorContainer">'
                            + '            <div class="primary-fg-color"></div>'
                            + '            <div class="secondary-bg-color"></div>'
                            + '            <div class="secondary-fg-color"></div>'
                            + '        </div>'
                            + '    </div>'
                            + '    <div class="themeItem" data-theme="grey">'
                            + '        <div class="themeName">Grey</div>'
                            + '        <div class="themeColorContainer">'
                            + '            <div class="primary-fg-color"></div>'
                            + '            <div class="secondary-bg-color"></div>'
                            + '            <div class="secondary-fg-color"></div>'
                            + '        </div>'
                            + '    </div>'
                            + '</div>');

        ChangeThemeUI.find('.themeItem').each(function() {
            if (database.config.theme == $(this).attr('data-theme')) {
                $(this).addClass('active');
            }
            if (!database.config.theme && $(this).attr('data-theme') == 'default') {
                $(this).addClass('active');
            }
        });

        adminTabs.find('#ChangeTheme').append(ChangeThemeUI);

        var selectedThemeValue = database.config.theme || 'default';
        ChangeThemeUI.find('.themeItem').click(function() {
            $(this).siblings('.themeItem').removeClass('active');
            $(this).addClass('active');

            selectedThemeValue = $(this).attr('data-theme');
            configChanged = true;
        });

        /* Global CSS Editing UI */
        var cssText = ($('head > style.FrameTrailGlobalCustomCSS').length != 0) ? $('head > style.FrameTrailGlobalCustomCSS').html() : '';

        var globalCSSEditingUI = $('<div class="globalCSSEditingUI" style="height: 400px;">'
                                 + '    <textarea class="globalCSS">'+ cssText +'</textarea>'
                                 + '</div>');

        adminTabs.find('#ChangeGlobalCSS').append(globalCSSEditingUI);

        // Init CodeMirror for CSS Variables
        var textarea = adminTabs.find('.globalCSS');

        var codeEditor = CodeMirror.fromTextArea(textarea[0], {
                value: textarea[0].value,
                lineNumbers: true,
                mode:  'css',
                gutters: ['CodeMirror-lint-markers'],
                lint: true,
                lineWrapping: true,
                tabSize: 2,
                theme: 'hopscotch'
            });
        var cssEditorValue = cssText;
        codeEditor.on('change', function(instance, changeObj) {
            var thisTextarea = $(instance.getTextArea());

            thisTextarea.val(instance.getValue());
            cssEditorValue = instance.getValue();

            // Track changes but don't apply CSS until save
            if (changeObj.origin != 'setValue') {
                globalCSSChanged = true;
            }
        });
        codeEditor.setSize(null, '100%');

        // this is necessary to be able to manipulate the css live
        if ( $('head > style.FrameTrailGlobalCustomCSS').length == 0 && $('head link[href$="custom.css"]').length != 0 ) {
            $.get($('head link[href$="custom.css"]').attr('href'))
                .done(function (cssString) {
                    codeEditor.setValue(cssString);
                    $('head').append('<style class="FrameTrailGlobalCustomCSS" type="text/css">'+ cssString +'</style>');
                    $('head link[href$="custom.css"]').remove();
                }).fail(function() {
                    console.log(labels['ErrorCouldNotRetrieveCustomCSS']);
                });
        }

        adminDialog.dialog({
            modal: true,
            resizable: false,
            width: 900,
            height: 600,
            close: function() {
                // If closing without applying (X button or ESC), just remove dialog
                // No changes are applied until "Apply" button is clicked
                $(this).remove();
            },
            buttons: [
                { text: labels['GenericApply'] || labels['GenericSaveChanges'] || 'Apply',
                    click: function() {
                        var dialog = $(this);
                        
                        // Apply and save changes if any were made
                        if (configChanged || globalCSSChanged) {
                            FrameTrail.module('InterfaceModal').showStatusMessage(labels['MessageStateSaving'] || 'Saving...');
                            
                            // Apply config changes from form
                            if (configChanged) {
                                // Apply text input changes
                                configurationUI.find('input[type="text"]').each(function() {
                                    var key = $(this).attr('name'),
                                        value = $(this).val();
                                    if (key) {
                                        database.config[key] = value;
                                    }
                                });
                                
                                // Apply checkbox changes
                                configurationUI.find('input[type="checkbox"]').each(function() {
                                    var key = $(this).attr('name'),
                                        value = $(this).is(':checked');
                                    
                                    if (key === 'mediaOptimizationEnabled') {
                                        if (!database.config.mediaOptimization) {
                                            database.config.mediaOptimization = {};
                                        }
                                        database.config.mediaOptimization.enabled = value;
                                    } else if (key === 'mediaOptimizationUseFFmpeg') {
                                        if (!database.config.mediaOptimization) {
                                            database.config.mediaOptimization = {};
                                        }
                                        database.config.mediaOptimization.useFFmpeg = value;
                                    } else if (key) {
                                        database.config[key] = value;
                                    }
                                });
                                
                                // Apply radio changes
                                configurationUI.find('input[type="radio"]:checked').each(function() {
                                    var key = $(this).attr('name'),
                                        value = $(this).val();
                                    if (key) {
                                        database.config[key] = value;
                                    }
                                });
                                
                                // Apply theme change
                                database.config.theme = selectedThemeValue;
                                $(FrameTrail.getState('target')).attr('data-frametrail-theme', selectedThemeValue);
                            }
                            
                            // Apply CSS changes
                            if (globalCSSChanged) {
                                $('head > style.FrameTrailGlobalCustomCSS').html(cssEditorValue);
                            }
                            
                            var saveCount = 0;
                            var saveTotal = (configChanged ? 1 : 0) + (globalCSSChanged ? 1 : 0);
                            var saveError = null;
                            
                            function checkSaveComplete() {
                                saveCount++;
                                if (saveCount >= saveTotal) {
                                    FrameTrail.module('InterfaceModal').hideMessage(500);
                                    if (saveError) {
                                        FrameTrail.module('InterfaceModal').showErrorMessage(labels['ErrorSavingSettings'] || 'Error saving settings');
                                        console.error('Error saving admin settings:', saveError);
                                        // Revert changes on error
                                        if (configChanged) {
                                            database.config = JSON.parse(JSON.stringify(initialConfig));
                                            $(FrameTrail.getState('target')).attr('data-frametrail-theme', initialConfig.theme || 'default');
                                        }
                                        if (globalCSSChanged) {
                                            $('head > style.FrameTrailGlobalCustomCSS').html(initialCSS);
                                        }
                                    } else {
                                        // Reload config to ensure consistency
                                        FrameTrail.module('Database').loadConfigData(function(){}, function(){});
                                    }
                                    dialog.dialog('close');
                                }
                            }
                            
                            if (configChanged) {
                                FrameTrail.module('Database').saveConfig(function(result) {
                                    if (!result.success) {
                                        saveError = result.error;
                                    }
                                    checkSaveComplete();
                                });
                            } else {
                                checkSaveComplete();
                            }
                            
                            if (globalCSSChanged) {
                                FrameTrail.module('Database').saveGlobalCSS(function(result) {
                                    if (!result.success) {
                                        saveError = result.error;
                                    }
                                    checkSaveComplete();
                                });
                            } else {
                                checkSaveComplete();
                            }
                        } else {
                            dialog.dialog('close');
                        }
                    }
                },
                { text: labels['GenericCancel'],
                    click: function() {
                        $(this).dialog('close');
                    }
                }
            ]
        });
    }

    return {
        open: open
    };

});
