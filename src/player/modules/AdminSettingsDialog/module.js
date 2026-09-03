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
     * I push freshly saved overview-map settings into a live map view.
     *
     * No-op when this instance shows the grid.
     *
     * @method refreshOverviewMap
     */
    function refreshOverviewMap() {

        var ViewOverview = FrameTrail.module('ViewOverview');
        if (!ViewOverview || !ViewOverview.getMap) return;

        var map = ViewOverview.getMap();
        if (map && map.reloadFromConfig) map.reloadFromConfig();

    }


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
        var initialCSS = document.head.querySelector('style.FrameTrailGlobalCustomCSS') ? document.head.querySelector('style.FrameTrailGlobalCustomCSS').innerHTML : '';

        var adminDialog = document.createElement('div');
        adminDialog.className = 'adminSettingsDialog';
        adminDialog.title = labels['GenericAdministration'];

        var _atw = document.createElement('div');
        _atw.innerHTML = '<div class="adminSettingsTabs">'
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
                        + '        <li>'
                        + '            <a href="#OverviewMap">'+ labels['SettingsOverviewMap'] +'</a>'
                        + '        </li>'
                        + '    </ul>'
                        + '    <div id="Configuration"></div>'
                        + '    <div id="ChangeTheme"></div>'
                        + '    <div id="ChangeGlobalCSS"></div>'
                        + '    <div id="TagDefinitions"></div>'
                        + '    <div id="OverviewMap"></div>'
                        + '</div>';
        var adminTabs = _atw.firstElementChild;

        adminDialog.appendChild(adminTabs);

        FTTabs(adminTabs, {
            activate: function(event, ui) {
                var cm6Wrapper = ui.newPanel.querySelector('.cm6-wrapper');
                if (cm6Wrapper && cm6Wrapper._cm6view) { cm6Wrapper._cm6view.requestMeasure(); }
            }
        });

        /* Configuration Editing UI */
        var configData = database.config;
        var _cuw = document.createElement('div');
        _cuw.innerHTML = '<div class="configEditingForm layoutRow">'
                            +   '    <div class="column-3">'
                            +   '        <div class="message active">'+ labels['MessageUserRequireConfirmation'] +'</div>'
                            +   '        <div class="checkboxRow"><label class="switch"><input type="checkbox" name="userNeedsConfirmation" id="userNeedsConfirmation" '+((configData.userNeedsConfirmation && configData.userNeedsConfirmation.toString() == "true") ? "checked" : "")+'><span class="slider round"></span></label><label for="userNeedsConfirmation">'+ labels['SettingsOnlyConfirmedUsers'] +'</label></div>'
                            +   '        <div class="message active">'+ labels['MessageUserRequireRole'] +'</div>'
                            +   '        <div style="margin-top: 5px; margin-bottom: 8px;">'+ labels['SettingsDefaultUserRole'] +': <br>'
                            +   '            <input type="radio" name="defaultUserRole" id="user_role_admin" value="admin" '+((configData.defaultUserRole == "admin") ? "checked" : "")+'>'
                            +   '            <label for="user_role_admin">'+ labels['UserRoleAdmin'] +'</label>'
                            +   '            <input type="radio" name="defaultUserRole" id="user_role_user" value="user" '+((configData.defaultUserRole == "user") ? "checked" : "")+'>'
                            +   '            <label for="user_role_user">'+ labels['UserRoleUser'] +'</label><br>'
                            +   '        </div>'
                            +   '        <div class="message active">'+ labels['MessageUserCollaboration'] +'</div>'
                            +   '        <div class="checkboxRow"><label class="switch"><input type="checkbox" name="allowCollaboration" id="allowCollaboration" '+((configData.allowCollaboration && configData.allowCollaboration.toString() == "true") ? "checked" : "")+'><span class="slider round"></span></label><label for="allowCollaboration">'+ labels['SettingsAllowCollaboration'] +'</label></div>'
                            +   '    </div>'
                            +   '    <div class="column-3">'
                            +   '        <div class="message active">'+ labels['MessageAllowFileUploads'] +'</div>'
                            +   '        <div class="checkboxRow"><label class="switch"><input type="checkbox" name="allowUploads" id="allowUploads" '+((configData.allowUploads && configData.allowUploads.toString() == "true") ? "checked" : "")+'><span class="slider round"></span></label><label for="allowUploads">'+ labels['SettingsAllowUploads'] +'</label></div>'
                            +   '    </div>'
                            +   '    <div class="column-3">'
                            +   '        <div class="checkboxRow"><label class="switch"><input type="checkbox" name="captureUserTraces" id="captureUserTraces" '+((configData.captureUserTraces && configData.captureUserTraces.toString() == "true") ? "checked" : "")+'><span class="slider round"></span></label><label for="captureUserTraces">'+ labels['SettingsCaptureUserActions'] +'</label></div>'
                            +   '        <div class="message active">'+ labels['MessageUserTraces'] +' <i>localStorage.getItem( "frametrail-traces" )</i></div>'
                            +   '    </div>'
                            +   '    <div class="column-3">'
                            +   '        <div class="message active">'+ labels['MessageUserTracesStartAction'] +'</div>'
                            +   '        <label for="userTracesStartAction">'+ labels['SettingsUserTracesStartAction'] +'</label>'
                            +   '        <input type="text" style="margin-top: 0px; margin-bottom: 2px;" name="userTracesStartAction" id="userTracesStartAction" placeholder="'+ labels['SettingsUserTracesStartAction'] +'" value="'+ (configData.userTracesStartAction || '') +'">'
                            +   '        <div class="message active">'+ labels['MessageUserTracesEndAction'] +'</div>'
                            +   '        <label for="userTracesEndAction">'+ labels['SettingsUserTracesEndAction'] +'</label>'
                            +   '        <input type="text" style="margin-top: 0px; margin-bottom: 2px;" name="userTracesEndAction" id="userTracesEndAction" placeholder="'+ labels['SettingsUserTracesEndAction'] +'" value="'+ (configData.userTracesEndAction || '') +'">'
                            +   '    </div>'
                            +   '    <div class="column-3">'
                            +   '        <div class="message active">'+ labels['MessageOverviewMode'] +'</div>'
                            +   '        <label for="overviewMode">'+ labels['SettingsOverviewMode'] +'</label>'
                            +   '        <div class="custom-select">'
                            +   '            <select name="overviewMode" id="overviewMode">'
                            +   '                <option value="grid"'+ (configData.overviewMode !== 'map' ? ' selected' : '') +'>'+ labels['SettingsOverviewModeGrid'] +'</option>'
                            +   '                <option value="map"'+ (configData.overviewMode === 'map' ? ' selected' : '') +'>'+ labels['SettingsOverviewModeMap'] +'</option>'
                            +   '            </select>'
                            +   '        </div>'
                            +   '    </div>'
                            +   '    <div class="column-3">'
                            +   '        <label for="defaultLanguage">'+ labels['GenericLanguage'] +'</label>'
                            +   '        <div class="custom-select">'
                            +   '            <select name="defaultLanguage" id="defaultLanguage">'
                            +   '                <option value="en"'+ (configData.defaultLanguage === 'en' || !configData.defaultLanguage ? ' selected' : '') +'>English</option>'
                            +   '                <option value="de"'+ (configData.defaultLanguage === 'de' ? ' selected' : '') +'>Deutsch</option>'
                            +   '                <option value="fr"'+ (configData.defaultLanguage === 'fr' ? ' selected' : '') +'>Français</option>'
                            +   '            </select>'
                            +   '        </div>'
                            +   '    </div>'
                            +   '</div>';
        var configurationUI = _cuw.firstElementChild;

        adminTabs.querySelector('#Configuration').appendChild(configurationUI);

        // Track changes but don't apply them until save
        configurationUI.querySelectorAll('input[type="text"]').forEach(function(el) { el.addEventListener('keydown', function(evt) {
            if (!evt.metaKey && evt.key != 'Meta') {
                configChanged = true;
            }
        }); });

        configurationUI.querySelectorAll('input[type="checkbox"]').forEach(function(el) { el.addEventListener('change', function(evt) {
            configChanged = true;
        }); });

        configurationUI.querySelectorAll('input[type="radio"]').forEach(function(el) { el.addEventListener('change', function(evt) {
            configChanged = true;
        }); });

        configurationUI.querySelectorAll('select').forEach(function(el) { el.addEventListener('change', function(evt) {
            configChanged = true;
        }); });

        /* Change Theme UI */
        var _ctw = document.createElement('div');
        _ctw.innerHTML = '<div class="themeContainer">'
                            + '    <div class="message active">'+ labels['SettingsSelectColorTheme'] +'</div>'
                            + '    <div class="themeItem" data-theme="classic">'
                            + '        <div class="themeName">Classic</div>'
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
                            + '    <div class="themeItem" data-theme="dark">'
                            + '        <div class="themeName">Dark</div>'
                            + '        <div class="themeColorContainer">'
                            + '            <div class="primary-fg-color"></div>'
                            + '            <div class="secondary-bg-color"></div>'
                            + '            <div class="secondary-fg-color"></div>'
                            + '        </div>'
                            + '    </div>'
                            + '    <div class="themeItem" data-theme="midnight">'
                            + '        <div class="themeName">Midnight</div>'
                            + '        <div class="themeColorContainer">'
                            + '            <div class="primary-fg-color"></div>'
                            + '            <div class="secondary-bg-color"></div>'
                            + '            <div class="secondary-fg-color"></div>'
                            + '        </div>'
                            + '    </div>'
                            + '    <div class="themeItem" data-theme="slate">'
                            + '        <div class="themeName">Slate</div>'
                            + '        <div class="themeColorContainer">'
                            + '            <div class="primary-fg-color"></div>'
                            + '            <div class="secondary-bg-color"></div>'
                            + '            <div class="secondary-fg-color"></div>'
                            + '        </div>'
                            + '    </div>'
                            + '    <div class="themeItem" data-theme="studio">'
                            + '        <div class="themeName">Studio</div>'
                            + '        <div class="themeColorContainer">'
                            + '            <div class="primary-fg-color"></div>'
                            + '            <div class="secondary-bg-color"></div>'
                            + '            <div class="secondary-fg-color"></div>'
                            + '        </div>'
                            + '    </div>'
                            + '    <div class="themeItem" data-theme="lagoon">'
                            + '        <div class="themeName">Lagoon</div>'
                            + '        <div class="themeColorContainer">'
                            + '            <div class="primary-fg-color"></div>'
                            + '            <div class="secondary-bg-color"></div>'
                            + '            <div class="secondary-fg-color"></div>'
                            + '        </div>'
                            + '    </div>'
                            + '    <div class="themeItem" data-theme="dusk">'
                            + '        <div class="themeName">Dusk</div>'
                            + '        <div class="themeColorContainer">'
                            + '            <div class="primary-fg-color"></div>'
                            + '            <div class="secondary-bg-color"></div>'
                            + '            <div class="secondary-fg-color"></div>'
                            + '        </div>'
                            + '    </div>'
                            + '    <div class="themeItem" data-theme="nordic">'
                            + '        <div class="themeName">Nordic</div>'
                            + '        <div class="themeColorContainer">'
                            + '            <div class="primary-fg-color"></div>'
                            + '            <div class="secondary-bg-color"></div>'
                            + '            <div class="secondary-fg-color"></div>'
                            + '        </div>'
                            + '    </div>'
                            + '    <div class="themeItem" data-theme="obsidian">'
                            + '        <div class="themeName">Obsidian</div>'
                            + '        <div class="themeColorContainer">'
                            + '            <div class="primary-fg-color"></div>'
                            + '            <div class="secondary-bg-color"></div>'
                            + '            <div class="secondary-fg-color"></div>'
                            + '        </div>'
                            + '    </div>'
                            + '    <div class="themeItem" data-theme="jungle">'
                            + '        <div class="themeName">Jungle</div>'
                            + '        <div class="themeColorContainer">'
                            + '            <div class="primary-fg-color"></div>'
                            + '            <div class="secondary-bg-color"></div>'
                            + '            <div class="secondary-fg-color"></div>'
                            + '        </div>'
                            + '    </div>'
                            + '    <div class="themeItem" data-theme="carbon">'
                            + '        <div class="themeName">Carbon</div>'
                            + '        <div class="themeColorContainer">'
                            + '            <div class="primary-fg-color"></div>'
                            + '            <div class="secondary-bg-color"></div>'
                            + '            <div class="secondary-fg-color"></div>'
                            + '        </div>'
                            + '    </div>'
                            + '    <div class="themeItem" data-theme="aurora">'
                            + '        <div class="themeName">Aurora</div>'
                            + '        <div class="themeColorContainer">'
                            + '            <div class="primary-fg-color"></div>'
                            + '            <div class="secondary-bg-color"></div>'
                            + '            <div class="secondary-fg-color"></div>'
                            + '        </div>'
                            + '    </div>'
                            + '    <div class="themeItem" data-theme="terra">'
                            + '        <div class="themeName">Terra</div>'
                            + '        <div class="themeColorContainer">'
                            + '            <div class="primary-fg-color"></div>'
                            + '            <div class="secondary-bg-color"></div>'
                            + '            <div class="secondary-fg-color"></div>'
                            + '        </div>'
                            + '    </div>'
                            + '    <div class="themeItem" data-theme="eclipse">'
                            + '        <div class="themeName">Eclipse</div>'
                            + '        <div class="themeColorContainer">'
                            + '            <div class="primary-fg-color"></div>'
                            + '            <div class="secondary-bg-color"></div>'
                            + '            <div class="secondary-fg-color"></div>'
                            + '        </div>'
                            + '    </div>'
                            + '    <div class="themeItem" data-theme="parchment">'
                            + '        <div class="themeName">Parchment</div>'
                            + '        <div class="themeColorContainer">'
                            + '            <div class="primary-fg-color"></div>'
                            + '            <div class="secondary-bg-color"></div>'
                            + '            <div class="secondary-fg-color"></div>'
                            + '        </div>'
                            + '    </div>'
                            + '    <div class="themeItem" data-theme="neon">'
                            + '        <div class="themeName">Neon</div>'
                            + '        <div class="themeColorContainer">'
                            + '            <div class="primary-fg-color"></div>'
                            + '            <div class="secondary-bg-color"></div>'
                            + '            <div class="secondary-fg-color"></div>'
                            + '        </div>'
                            + '    </div>'
                            + '    <div class="themeItem" data-theme="navy">'
                            + '        <div class="themeName">Navy</div>'
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
                            + '    <div class="themeItem" data-theme="grey">'
                            + '        <div class="themeName">Grey</div>'
                            + '        <div class="themeColorContainer">'
                            + '            <div class="primary-fg-color"></div>'
                            + '            <div class="secondary-bg-color"></div>'
                            + '            <div class="secondary-fg-color"></div>'
                            + '        </div>'
                            + '    </div>'
                            + '    <div class="themeItem" data-theme="plum">'
                            + '        <div class="themeName">Plum</div>'
                            + '        <div class="themeColorContainer">'
                            + '            <div class="primary-fg-color"></div>'
                            + '            <div class="secondary-bg-color"></div>'
                            + '            <div class="secondary-fg-color"></div>'
                            + '        </div>'
                            + '    </div>'
                            + '    <div class="themeItem" data-theme="crimson">'
                            + '        <div class="themeName">Crimson</div>'
                            + '        <div class="themeColorContainer">'
                            + '            <div class="primary-fg-color"></div>'
                            + '            <div class="secondary-bg-color"></div>'
                            + '            <div class="secondary-fg-color"></div>'
                            + '        </div>'
                            + '    </div>'
                            + '    <div class="themeItem" data-theme="ocean">'
                            + '        <div class="themeName">Ocean</div>'
                            + '        <div class="themeColorContainer">'
                            + '            <div class="primary-fg-color"></div>'
                            + '            <div class="secondary-bg-color"></div>'
                            + '            <div class="secondary-fg-color"></div>'
                            + '        </div>'
                            + '    </div>'
                            + '    <div class="themeItem" data-theme="forest">'
                            + '        <div class="themeName">Forest</div>'
                            + '        <div class="themeColorContainer">'
                            + '            <div class="primary-fg-color"></div>'
                            + '            <div class="secondary-bg-color"></div>'
                            + '            <div class="secondary-fg-color"></div>'
                            + '        </div>'
                            + '    </div>'
                            + '    <div class="themeItem" data-theme="emerald">'
                            + '        <div class="themeName">Emerald</div>'
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
                            + '    <div class="themeItem" data-theme="coral">'
                            + '        <div class="themeName">Coral</div>'
                            + '        <div class="themeColorContainer">'
                            + '            <div class="primary-fg-color"></div>'
                            + '            <div class="secondary-bg-color"></div>'
                            + '            <div class="secondary-fg-color"></div>'
                            + '        </div>'
                            + '    </div>'
                            + '    <div class="themeItem" data-theme="violet">'
                            + '        <div class="themeName">Violet</div>'
                            + '        <div class="themeColorContainer">'
                            + '            <div class="primary-fg-color"></div>'
                            + '            <div class="secondary-bg-color"></div>'
                            + '            <div class="secondary-fg-color"></div>'
                            + '        </div>'
                            + '    </div>'
                            + '    <div class="themeItem" data-theme="sunset">'
                            + '        <div class="themeName">Sunset</div>'
                            + '        <div class="themeColorContainer">'
                            + '            <div class="primary-fg-color"></div>'
                            + '            <div class="secondary-bg-color"></div>'
                            + '            <div class="secondary-fg-color"></div>'
                            + '        </div>'
                            + '    </div>'
                            + '    <div class="themeItem" data-theme="coffee">'
                            + '        <div class="themeName">Coffee</div>'
                            + '        <div class="themeColorContainer">'
                            + '            <div class="primary-fg-color"></div>'
                            + '            <div class="secondary-bg-color"></div>'
                            + '            <div class="secondary-fg-color"></div>'
                            + '        </div>'
                            + '    </div>'
                            + '    <div class="themeItem" data-theme="mocha">'
                            + '        <div class="themeName">Mocha</div>'
                            + '        <div class="themeColorContainer">'
                            + '            <div class="primary-fg-color"></div>'
                            + '            <div class="secondary-bg-color"></div>'
                            + '            <div class="secondary-fg-color"></div>'
                            + '        </div>'
                            + '    </div>'
                            + '    <div class="themeItem" data-theme="sand">'
                            + '        <div class="themeName">Sand</div>'
                            + '        <div class="themeColorContainer">'
                            + '            <div class="primary-fg-color"></div>'
                            + '            <div class="secondary-bg-color"></div>'
                            + '            <div class="secondary-fg-color"></div>'
                            + '        </div>'
                            + '    </div>'
                            + '    <div class="themeItem" data-theme="rose">'
                            + '        <div class="themeName">Rose</div>'
                            + '        <div class="themeColorContainer">'
                            + '            <div class="primary-fg-color"></div>'
                            + '            <div class="secondary-bg-color"></div>'
                            + '            <div class="secondary-fg-color"></div>'
                            + '        </div>'
                            + '    </div>'
                            + '    <div class="themeItem" data-theme="arctic">'
                            + '        <div class="themeName">Arctic</div>'
                            + '        <div class="themeColorContainer">'
                            + '            <div class="primary-fg-color"></div>'
                            + '            <div class="secondary-bg-color"></div>'
                            + '            <div class="secondary-fg-color"></div>'
                            + '        </div>'
                            + '    </div>'
                            + '    <div class="themeItem" data-theme="sage">'
                            + '        <div class="themeName">Sage</div>'
                            + '        <div class="themeColorContainer">'
                            + '            <div class="primary-fg-color"></div>'
                            + '            <div class="secondary-bg-color"></div>'
                            + '            <div class="secondary-fg-color"></div>'
                            + '        </div>'
                            + '    </div>'
                            + '    <div class="themeItem" data-theme="mint">'
                            + '        <div class="themeName">Mint</div>'
                            + '        <div class="themeColorContainer">'
                            + '            <div class="primary-fg-color"></div>'
                            + '            <div class="secondary-bg-color"></div>'
                            + '            <div class="secondary-fg-color"></div>'
                            + '        </div>'
                            + '    </div>'
                            + '    <div class="themeItem" data-theme="sky">'
                            + '        <div class="themeName">Sky</div>'
                            + '        <div class="themeColorContainer">'
                            + '            <div class="primary-fg-color"></div>'
                            + '            <div class="secondary-bg-color"></div>'
                            + '            <div class="secondary-fg-color"></div>'
                            + '        </div>'
                            + '    </div>'
                            + '    <div class="themeItem" data-theme="steel">'
                            + '        <div class="themeName">Steel</div>'
                            + '        <div class="themeColorContainer">'
                            + '            <div class="primary-fg-color"></div>'
                            + '            <div class="secondary-bg-color"></div>'
                            + '            <div class="secondary-fg-color"></div>'
                            + '        </div>'
                            + '    </div>'
                            + '    <div class="themeItem" data-theme="lavender">'
                            + '        <div class="themeName">Lavender</div>'
                            + '        <div class="themeColorContainer">'
                            + '            <div class="primary-fg-color"></div>'
                            + '            <div class="secondary-bg-color"></div>'
                            + '            <div class="secondary-fg-color"></div>'
                            + '        </div>'
                            + '    </div>'
                            + '    <div class="themeItem" data-theme="peach">'
                            + '        <div class="themeName">Peach</div>'
                            + '        <div class="themeColorContainer">'
                            + '            <div class="primary-fg-color"></div>'
                            + '            <div class="secondary-bg-color"></div>'
                            + '            <div class="secondary-fg-color"></div>'
                            + '        </div>'
                            + '    </div>'
                            + '    <div class="themeItem" data-theme="blush">'
                            + '        <div class="themeName">Blush</div>'
                            + '        <div class="themeColorContainer">'
                            + '            <div class="primary-fg-color"></div>'
                            + '            <div class="secondary-bg-color"></div>'
                            + '            <div class="secondary-fg-color"></div>'
                            + '        </div>'
                            + '    </div>'
                            + '    <div class="themeItem" data-theme="lemon">'
                            + '        <div class="themeName">Lemon</div>'
                            + '        <div class="themeColorContainer">'
                            + '            <div class="primary-fg-color"></div>'
                            + '            <div class="secondary-bg-color"></div>'
                            + '            <div class="secondary-fg-color"></div>'
                            + '        </div>'
                            + '    </div>'
                            + '    <div class="themeItem" data-theme="turquoise">'
                            + '        <div class="themeName">Turquoise</div>'
                            + '        <div class="themeColorContainer">'
                            + '            <div class="primary-fg-color"></div>'
                            + '            <div class="secondary-bg-color"></div>'
                            + '            <div class="secondary-fg-color"></div>'
                            + '        </div>'
                            + '    </div>'
                            + '    <div class="themeItem" data-theme="grape">'
                            + '        <div class="themeName">Grape</div>'
                            + '        <div class="themeColorContainer">'
                            + '            <div class="primary-fg-color"></div>'
                            + '            <div class="secondary-bg-color"></div>'
                            + '            <div class="secondary-fg-color"></div>'
                            + '        </div>'
                            + '    </div>'
                            + '    <div class="themeItem" data-theme="tangerine">'
                            + '        <div class="themeName">Tangerine</div>'
                            + '        <div class="themeColorContainer">'
                            + '            <div class="primary-fg-color"></div>'
                            + '            <div class="secondary-bg-color"></div>'
                            + '            <div class="secondary-fg-color"></div>'
                            + '        </div>'
                            + '    </div>'
                            + '    <div class="themeItem" data-theme="tomato">'
                            + '        <div class="themeName">Tomato</div>'
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
                            + '</div>';
        var ChangeThemeUI = _ctw.firstElementChild;

        ChangeThemeUI.querySelectorAll('.themeItem').forEach(function(item) {
            if (database.config.defaultTheme == item.getAttribute('data-theme')) {
                item.classList.add('active');
            }
            if (!database.config.defaultTheme && item.getAttribute('data-theme') == 'classic') {
                item.classList.add('active');
            }
        });

        adminTabs.querySelector('#ChangeTheme').appendChild(ChangeThemeUI);

        var selectedThemeValue = database.config.defaultTheme || 'classic';
        ChangeThemeUI.querySelectorAll('.themeItem').forEach(function(item) {
            item.addEventListener('click', function() {
                ChangeThemeUI.querySelectorAll('.themeItem').forEach(function(t) { t.classList.remove('active'); });
                this.classList.add('active');

                selectedThemeValue = this.dataset.theme;
                configChanged = true;
            });
        });

        /* Overview Map UI */
        var overviewMapData = database.config.overviewMap || {},
            selectedMapBackground = overviewMapData.background || '',
            selectedMapBackgroundColor = overviewMapData.backgroundColor || '',
            selectedMapFit = (overviewMapData.fit === 'cover') ? 'cover' : 'contain';

        var _omw = document.createElement('div');
        _omw.innerHTML = '<div class="overviewMapSettings layoutRow">'
                        + '    <div class="column-6">'
                        + '        <label>'+ labels['SettingsOverviewMapBackground'] +'</label>'
                        + '        <div class="message active">'+ labels['MessageOverviewMapNoBackground'] +'</div>'
                        + '        <div class="posterFrameList overviewMapBackgroundList"></div>'
                        + '    </div>'
                        + '    <div class="column-6">'
                        + '        <label for="overviewMapFit">'+ labels['SettingsOverviewMapFit'] +'</label>'
                        + '        <div class="custom-select">'
                        + '            <select id="overviewMapFit" class="overviewMapFitSelect">'
                        + '                <option value="contain"'+ (selectedMapFit === 'contain' ? ' selected' : '') +'>'+ labels['SettingsOverviewMapFitContain'] +'</option>'
                        + '                <option value="cover"'+ (selectedMapFit === 'cover' ? ' selected' : '') +'>'+ labels['SettingsOverviewMapFitCover'] +'</option>'
                        + '            </select>'
                        + '        </div>'
                        + '        <div class="message active">'+ labels['MessageOverviewMapCrop'] +'</div>'
                        + '        <label for="overviewMapBackgroundColor">'+ labels['SettingsOverviewMapBackgroundColor'] +'</label>'
                        + '        <input type="color" id="overviewMapBackgroundColor" class="overviewMapBackgroundColor" value="'+ (selectedMapBackgroundColor || '#000000') +'">'
                        + '        <div class="message active">'+ labels['MessageOverviewMap'] +'</div>'
                        + '    </div>'
                        + '</div>';
        var overviewMapUI = _omw.firstElementChild;

        adminTabs.querySelector('#OverviewMap').appendChild(overviewMapUI);

        (function() {

            var backgroundList = overviewMapUI.querySelector('.overviewMapBackgroundList');

            FrameTrail.module('ResourceManager').renderList(backgroundList, true, 'type', 'contains', ['image']);

            // The list renders asynchronously and fades in, so the current
            // selection can only be marked once the loading screen is gone.
            if (selectedMapBackground) {
                var checkBackgroundLoaded = setInterval(function() {
                    if (!backgroundList.querySelector('.loadingScreen')) {
                        clearInterval(checkBackgroundLoaded);
                        backgroundList.querySelectorAll('.resourceThumb').forEach(function(thumb) {
                            var res = database.resources[thumb.dataset.resourceid];
                            if (res && res.src === selectedMapBackground) {
                                thumb.classList.add('selected');
                            }
                        });
                    }
                }, 100);
            }

            // Click a selected image again to clear the background.
            overviewMapUI.addEventListener('click', function(evt) {
                if (evt.target.closest('.resourceEditButton')) return;
                var _thumb = evt.target.closest('.overviewMapBackgroundList .resourceThumb');
                if (!_thumb) return;

                var wasSelected = _thumb.classList.contains('selected');

                backgroundList.querySelectorAll('.resourceThumb').forEach(function(el) { el.classList.remove('selected'); });

                if (wasSelected) {
                    selectedMapBackground = '';
                } else {
                    var resource = database.resources[_thumb.dataset.resourceid];
                    _thumb.classList.add('selected');
                    selectedMapBackground = resource ? resource.src : '';
                }

                configChanged = true;
            });

            // These are nested under config.overviewMap, and a color input is
            // not one of the types the generic apply loop reads, so both are
            // tracked by hand.
            overviewMapUI.querySelector('.overviewMapFitSelect').addEventListener('change', function() {
                selectedMapFit = this.value;
                configChanged = true;
            });

            overviewMapUI.querySelector('.overviewMapBackgroundColor').addEventListener('change', function() {
                selectedMapBackgroundColor = this.value;
                configChanged = true;
            });

        })();

        /* Global CSS Editing UI */
        var cssText = document.head.querySelector('style.FrameTrailGlobalCustomCSS') ? document.head.querySelector('style.FrameTrailGlobalCustomCSS').innerHTML : '';

        var _gcw = document.createElement('div');
        _gcw.innerHTML = '<div class="globalCSSEditingUI" style="height: 400px;">'
                        + '    <textarea class="globalCSS">'+ cssText +'</textarea>'
                        + '</div>';
        var globalCSSEditingUI = _gcw.firstElementChild;

        adminTabs.querySelector('#ChangeGlobalCSS').appendChild(globalCSSEditingUI);

        // Init CodeMirror 6 editor for CSS Variables
        var textarea = adminTabs.querySelector('.globalCSS');
        var CM6 = window.FrameTrailCM6;

        var cm6Wrapper = document.createElement('div');
        cm6Wrapper.className = 'cm6-wrapper';
        cm6Wrapper.style.height = '100%';
        textarea.after(cm6Wrapper);
        textarea.style.display = 'none';

        var cssEditorValue = cssText;

        var codeEditor = new CM6.EditorView({
            state: CM6.EditorState.create({
                doc: cssText,
                extensions: [
                    CM6.oneDark,
                    CM6.lineNumbers(),
                    CM6.highlightActiveLine(),
                    CM6.highlightActiveLineGutter(),
                    CM6.drawSelection(),
                    CM6.history(),
                    CM6.keymap.of([].concat(CM6.defaultKeymap, CM6.historyKeymap)),
                    CM6.EditorView.lineWrapping,
                    CM6.StreamLanguage.define(CM6.legacyModes.css),
                    window.FrameTrailCM6Linters.css,
                    CM6.lintGutter(),
                    CM6.EditorView.updateListener.of(function(update) {
                        if (!update.docChanged) { return; }
                        var isSetter = update.transactions.some(function(tr) {
                            return tr.annotation(CM6.Transaction.userEvent) === 'setValue';
                        });
                        cssEditorValue = update.state.doc.toString();
                        if (!isSetter) {
                            globalCSSChanged = true;
                        }
                    })
                ]
            }),
            parent: cm6Wrapper
        });
        cm6Wrapper._cm6view = codeEditor;

        // this is necessary to be able to manipulate the css live
        if ( !document.head.querySelector('style.FrameTrailGlobalCustomCSS') ) {
            if (FrameTrail.getState('storageMode') === 'local') {
                var adapter = FrameTrail.module('StorageManager').getAdapter();
                adapter.readText('custom.css').then(function(cssString) {
                    codeEditor.dispatch({ changes: { from: 0, to: codeEditor.state.doc.length, insert: cssString }, annotations: CM6.Transaction.userEvent.of('setValue') });
                    document.head.insertAdjacentHTML('beforeend', '<style class="FrameTrailGlobalCustomCSS" type="text/css">'+ cssString +'</style>');
                    var _lnk = document.head.querySelector('link[href$="custom.css"]'); if (_lnk) { _lnk.remove(); }
                }).catch(function() {
                    // No custom.css yet — create empty style tag so edits can be applied
                    document.head.insertAdjacentHTML('beforeend', '<style class="FrameTrailGlobalCustomCSS" type="text/css"></style>');
                    var _lnk = document.head.querySelector('link[href$="custom.css"]'); if (_lnk) { _lnk.remove(); }
                });
            } else if ( document.head.querySelector('link[href$="custom.css"]') ) {
                fetch(document.head.querySelector('link[href$="custom.css"]').getAttribute('href'))
                    .then(function(r) { return r.text(); })
                    .then(function(cssString) {
                        codeEditor.dispatch({ changes: { from: 0, to: codeEditor.state.doc.length, insert: cssString }, annotations: CM6.Transaction.userEvent.of('setValue') });
                        document.head.insertAdjacentHTML('beforeend', '<style class="FrameTrailGlobalCustomCSS" type="text/css">'+ cssString +'</style>');
                        var _lnk = document.head.querySelector('link[href$="custom.css"]'); if (_lnk) { _lnk.remove(); }
                    })
                    .catch(function() {
                        console.log(labels['ErrorCouldNotRetrieveCustomCSS']);
                    });
            }
        }

        /* Tag Definitions UI */
        var _tdw = document.createElement('div');
        _tdw.innerHTML = '<div class="tagDefinitionsContainer">'
            + '    <div class="tagListHeader">'
            + '        <button class="addTagButton"><span class="icon-plus"></span> '+ labels['TagAdd'] +'</button>'
            + '        <input type="text" class="tagFilterInput" placeholder="'+ labels['SettingsFilterByName'] +'">'
            + '    </div>'
            + '    <div class="tagList"></div>'
            + '</div>';
        var tagDefinitionsUI = _tdw.firstElementChild;

        adminTabs.querySelector('#TagDefinitions').appendChild(tagDefinitionsUI);

        function renderTagList(filterText) {
            var tagList = tagDefinitionsUI.querySelector('.tagList');
            tagList.innerHTML = '';
            var allTags = FrameTrail.module('TagModel').getAllTags();

            for (var tagId in allTags) {
                if (filterText && tagId.toLowerCase().indexOf(filterText.toLowerCase()) === -1) {
                    continue;
                }

                var tagData = allTags[tagId];
                var _tiw = document.createElement('div');
                _tiw.innerHTML = '<div class="tagListItem" data-tag-id="'+ tagId +'">'
                    + '    <div class="tagId">'+ tagId +'</div>'
                    + '    <div class="tagLanguages"></div>'
                    + '    <div class="tagActions">'
                    + '        <button class="editTagButton" title="'+ labels['GenericEditStart'] +'"><span class="icon-pencil"></span></button>'
                    + '        <button class="deleteTagButton" title="'+ labels['GenericDelete'] +'"><span class="icon-trash"></span></button>'
                    + '    </div>'
                    + '</div>';
                var tagItem = _tiw.firstElementChild;

                var langContainer = tagItem.querySelector('.tagLanguages');
                for (var lang in tagData) {
                    langContainer.insertAdjacentHTML('beforeend',
                        '<div class="tagLang">'
                        + '    <span class="langCode">'+ lang.toUpperCase() +':</span> '
                        + '    <span class="langLabel">'+ tagData[lang].label +'</span>'
                        + '    <span class="langDesc">&mdash; '+ tagData[lang].description +'</span>'
                        + '</div>'
                    );
                }

                tagList.appendChild(tagItem);
            }

            if (tagList.children.length === 0) {
                tagList.insertAdjacentHTML('beforeend', '<div class="message active">'+ labels['TagNoTagsDefined'] +'</div>');
            }
        }

        FrameTrail.module('TagModel').updateTagModel(function() {
            renderTagList('');
        }, function() {
            renderTagList('');
        });

        tagDefinitionsUI.querySelector('.tagFilterInput').addEventListener('input', function() {
            renderTagList(this.value);
        });

        tagDefinitionsUI.querySelector('.addTagButton').addEventListener('click', function() {
            openTagEditDialog(null);
        });

        tagDefinitionsUI.addEventListener('click', function(evt) {
            var _editBtn = evt.target.closest('.editTagButton');
            if (_editBtn) {
                openTagEditDialog(_editBtn.closest('.tagListItem').dataset.tagId);
                return;
            }
            var _delBtn = evt.target.closest('.deleteTagButton');
            if (_delBtn) {
                confirmDeleteTag(_delBtn.closest('.tagListItem').dataset.tagId);
            }
        });

        function openTagEditDialog(tagId) {
            var isNew = (tagId === null);
            var allTags = FrameTrail.module('TagModel').getAllTags();
            var existingData = isNew ? {} : (allTags[tagId] || {});
            var errorDiv = document.createElement('div');
            errorDiv.className = 'message dialogError';

            var _dcw = document.createElement('div');
            _dcw.innerHTML = '<div class="tagEditDialog">'
                + '    <div class="formRow">'
                + '        <label>'+ labels['TagID'] +'</label>'
                + '        <input type="text" class="tagIdInput" value="'+ (tagId || '') +'" '+ (isNew ? '' : 'readonly') +'>'
                + '        <div class="fieldHint">'+ labels['TagIDHint'] +'</div>'
                + '    </div>'
                + '    <div class="languagesContainer">'
                + '        <label>'+ labels['TagLanguages'] +'</label>'
                + '        <div class="languagesList"></div>'
                + '        <button class="addLanguageButton"><span class="icon-plus"></span> '+ labels['TagAddLanguage'] +'</button>'
                + '    </div>'
                + '</div>';
            var dialogContent = _dcw.firstElementChild;

            var languagesList = dialogContent.querySelector('.languagesList');

            function addLanguageRow(lang, label, description, isExisting) {
                var _rw = document.createElement('div');
                _rw.innerHTML = '<div class="languageRow" data-lang="'+ (lang || '') +'">'
                    + '    <div class="langHeader">'
                    + '        <input type="text" class="langCodeInput" value="'+ (lang || '') +'" placeholder="en" maxlength="2" '+ (isExisting ? 'readonly' : '') +'>'
                    + (isExisting ? '' : '        <button class="removeLangButton"><span class="icon-cancel"></span></button>')
                    + '    </div>'
                    + '    <div class="langFields">'
                    + '        <input type="text" class="langLabelInput" value="'+ (label || '') +'" placeholder="'+ labels['TagLabel'] +'">'
                    + '        <input type="text" class="langDescInput" value="'+ (description || '') +'" placeholder="'+ labels['TagDescription'] +'">'
                    + '    </div>'
                    + '</div>';
                var row = _rw.firstElementChild;

                var _removeBtn = row.querySelector('.removeLangButton');
                if (_removeBtn) {
                    _removeBtn.addEventListener('click', function() {
                        row.remove();
                    });
                }

                languagesList.appendChild(row);
            }

            for (var lang in existingData) {
                addLanguageRow(lang, existingData[lang].label, existingData[lang].description, true);
            }

            if (isNew) {
                addLanguageRow('', '', '', false);
            }

            dialogContent.querySelector('.addLanguageButton').addEventListener('click', function() {
                addLanguageRow('', '', '', false);
            });

            var tagDialogCtrl = Dialog({
                title:   isNew ? labels['TagAddNew'] : labels['TagEdit'] + ': ' + tagId,
                content: dialogContent,
                modal:   true,
                width:   500,
                buttons: [
                    {
                        text: labels['GenericSave'],
                        click: function() {
                            saveTag(dialogContent, errorDiv, function() {
                                tagDialogCtrl.close();
                                renderTagList(tagDefinitionsUI.querySelector('.tagFilterInput').value);
                            });
                        }
                    },
                    {
                        text: labels['GenericCancel'],
                        click: function() { tagDialogCtrl.close(); }
                    }
                ],
                close: function() { tagDialogCtrl.destroy(); }
            });
            tagDialogCtrl.widget().querySelector('.ft-dialog-buttonpane').prepend(errorDiv);
        }

        function saveTag(dialogContent, errorDiv, onSuccess) {
            var tagId = dialogContent.querySelector('.tagIdInput').value.trim();
            var languageRows = dialogContent.querySelectorAll('.languageRow');

            function showDialogError(msg) {
                errorDiv.textContent = msg;
                errorDiv.classList.add('active', 'error');
            }

            if (tagId.length < 2) {
                showDialogError(labels['TagErrorIDTooShort']);
                return;
            }

            if (languageRows.length === 0) {
                showDialogError(labels['TagErrorNoLanguages']);
                return;
            }

            var saveQueue = [];
            languageRows.forEach(function(row) {
                var lang = row.querySelector('.langCodeInput').value.trim().toLowerCase();
                var label = row.querySelector('.langLabelInput').value.trim();
                var desc = row.querySelector('.langDescInput').value.trim();

                if (lang.length === 2 && label.length >= 4) {
                    saveQueue.push({ lang: lang, label: label, description: desc });
                }
            });

            if (saveQueue.length === 0) {
                showDialogError(labels['TagErrorInvalidLanguages']);
                return;
            }

            var savedCount = 0;

            function saveNext(idx) {
                if (idx >= saveQueue.length) {
                    onSuccess();
                    return;
                }
                var item = saveQueue[idx];
                FrameTrail.module('TagModel').setTag(
                    tagId,
                    item.lang,
                    item.label,
                    item.description,
                    function() {
                        savedCount++;
                        saveNext(idx + 1);
                    },
                    function() {
                        showDialogError(labels['TagErrorSaveFailed']);
                    }
                );
            }

            saveNext(0);
        }

        function confirmDeleteTag(tagId) {
            FrameTrail.module('TagModel').deleteTag(tagId,
                function(response) {
                    renderTagList(tagDefinitionsUI.querySelector('.tagFilterInput').value);
                    FrameTrail.module('InterfaceModal').showStatusMessage(labels['TagDeleted']);
                    setTimeout(function() {
                        FrameTrail.module('InterfaceModal').hideMessage(500);
                    }, 1500);
                },
                function(response) {
                    if (response && response.code === 5 && response.response) {
                        showTagUsageWarning(tagId, response.response);
                    } else {
                        FrameTrail.module('InterfaceModal').showErrorMessage(labels['TagErrorDeleteFailed']);
                    }
                }
            );
        }

        function showTagUsageWarning(tagId, usageData) {
            var _tuw = document.createElement('div');
            _tuw.innerHTML = '<div class="tagUsageWarning">'
                + '    <p><strong>'+ labels['TagCannotDelete'].replace('{tagId}', tagId) +'</strong></p>'
                + '    <p>'+ labels['TagInUseCount'].replace('{count}', usageData.count) +'</p>'
                + '    <ul class="usageList"></ul>'
                + '    <p>'+ labels['TagRemoveBeforeDelete'] +'</p>'
                + '</div>';
            var content = _tuw.firstElementChild;

            var usageList = content.querySelector('.usageList');

            if (usageData.matches) {
                for (var i = 0; i < usageData.matches.length; i++) {
                    var match = usageData.matches[i];
                    usageList.insertAdjacentHTML('beforeend',
                        '<li>Hypervideo "'+ match.hypervideo +'" &mdash; '
                        + match.where + ' ('+ match.type +') by '+ match.owner
                        + '</li>'
                    );
                }
            }

            var tagUsageDialogCtrl = Dialog({
                title:   labels['TagCannotDeleteTitle'],
                content: content,
                modal:   true,
                width:   450,
                buttons: [
                    { text: labels['GenericOK'], click: function() { tagUsageDialogCtrl.close(); } }
                ],
                close: function() { tagUsageDialogCtrl.destroy(); }
            });
        }

        var adminDialogCtrl = Dialog({
            title:   labels['GenericAdministration'],
            content: adminDialog,
            modal: true,
            resizable: false,
            width: 900,
            height: 600,
            close: function() {
                // If closing without applying (X button or ESC), just remove dialog
                // No changes are applied until "Apply" button is clicked
                adminDialogCtrl.destroy();
            },
            buttons: [
                { text: labels['GenericApply'] || labels['GenericSaveChanges'] || 'Apply',
                    click: function() {
                        // Apply and save changes if any were made
                        if (configChanged || globalCSSChanged) {
                            FrameTrail.module('InterfaceModal').showStatusMessage(labels['MessageStateSaving'] || 'Saving...');
                            
                            // Apply config changes from form
                            if (configChanged) {
                                // Apply text input changes
                                configurationUI.querySelectorAll('input[type="text"]').forEach(function(el) {
                                    var key = el.getAttribute('name'),
                                        value = el.value;
                                    if (key) {
                                        database.config[key] = value;
                                    }
                                });
                                
                                // Apply checkbox changes
                                configurationUI.querySelectorAll('input[type="checkbox"]').forEach(function(el) {
                                    var key = el.getAttribute('name'),
                                        value = el.checked;
                                    
                                    if (key) {
                                        database.config[key] = value;
                                    }
                                });
                                
                                // Apply radio changes
                                configurationUI.querySelectorAll('input[type="radio"]:checked').forEach(function(el) {
                                    var key = el.getAttribute('name'),
                                        value = el.value;
                                    if (key) {
                                        database.config[key] = value;
                                    }
                                });

                                // Apply select changes
                                configurationUI.querySelectorAll('select').forEach(function(el) {
                                    var key = el.getAttribute('name'),
                                        value = el.value;
                                    if (key) {
                                        database.config[key] = value;
                                    }
                                });

                                // Apply overview map settings. These live nested
                                // under config.overviewMap, and the color input is
                                // not a type the generic loop above reads, so they
                                // are written explicitly. The markers array is left
                                // untouched — it is owned by ViewOverviewMap.
                                var _mapData = database.config.overviewMap;
                                if (!_mapData || typeof _mapData !== 'object') {
                                    _mapData = database.config.overviewMap = {};
                                }
                                if (!Array.isArray(_mapData.markers)) {
                                    _mapData.markers = [];
                                }
                                _mapData.background      = selectedMapBackground;
                                _mapData.backgroundColor = selectedMapBackgroundColor;
                                _mapData.fit             = selectedMapFit;

                                // Apply global default theme
                                database.config.defaultTheme = selectedThemeValue;
                                // Only apply to current view if the hypervideo has no per-hypervideo theme
                                var hvConfig = database.hypervideo && database.hypervideo.config;
                                if (!hvConfig || !hvConfig.theme) {
                                    document.querySelector(FrameTrail.getState('target')).setAttribute('data-frametrail-theme', selectedThemeValue);
                                }
                            }
                            
                            // Apply CSS changes
                            if (globalCSSChanged) {
                                document.head.querySelector('style.FrameTrailGlobalCustomCSS').innerHTML = cssEditorValue;
                            }
                            
                            var saveCount = 0;
                            var saveTotal = (configChanged ? 1 : 0) + (globalCSSChanged ? 1 : 0);
                            var saveError = null;
                            
                            var saveClosed = false;
                            function checkSaveComplete() {
                                saveCount++;
                                if (saveCount >= saveTotal && !saveClosed) {
                                    saveClosed = true;
                                    FrameTrail.module('InterfaceModal').hideMessage(500);
                                    if (saveError) {
                                        FrameTrail.module('InterfaceModal').showErrorMessage(labels['ErrorSavingSettings'] || 'Error saving settings');
                                        console.error('Error saving admin settings:', saveError);
                                        // Revert changes on error
                                        if (configChanged) {
                                            database.config = JSON.parse(JSON.stringify(initialConfig));
                                            // Only revert theme on current view if hypervideo has no per-hypervideo theme
                                            var hvCfg = database.hypervideo && database.hypervideo.config;
                                            if (!hvCfg || !hvCfg.theme) {
                                                document.querySelector(FrameTrail.getState('target')).setAttribute('data-frametrail-theme', initialConfig.defaultTheme || 'classic');
                                            }
                                        }
                                        if (globalCSSChanged) {
                                            document.head.querySelector('style.FrameTrailGlobalCustomCSS').innerHTML = initialCSS;
                                        }
                                        // Repaint the map with the reverted values
                                        refreshOverviewMap();
                                    } else {
                                        // Reload config to ensure consistency
                                        FrameTrail.module('Database').loadConfigData(function(){
                                            // Background, colour and fit live in
                                            // config.overviewMap, and nothing observes
                                            // the config, so the map is told explicitly
                                            // rather than waiting for a page reload.
                                            refreshOverviewMap();
                                        }, function(){});
                                    }
                                    adminDialogCtrl.close();
                                }
                            }

                            var languageChanged = configChanged &&
                                (database.config.defaultLanguage || 'en') !== (initialConfig.defaultLanguage || 'en');

                            // ViewOverview decides grid-vs-map once, in create().
                            // There is no onChange handler for the config, so the
                            // page has to be reloaded for the switch to take effect.
                            var overviewModeChanged = configChanged &&
                                (database.config.overviewMode || 'grid') !== (initialConfig.overviewMode || 'grid');

                            if (configChanged) {
                                FrameTrail.module('Database').saveConfig(function(result) {
                                    if (!result.success) {
                                        saveError = result.error;
                                        checkSaveComplete();
                                        return;
                                    }
                                    // If language changed, reload after the save is confirmed complete on disk
                                    if (languageChanged) {
                                        FrameTrail.module('Localization').setLanguage(database.config.defaultLanguage);
                                        FrameTrail.module('InterfaceModal').hideMessage();
                                        adminDialogCtrl.close();
                                        window.location.reload();
                                        return;
                                    }
                                    // Same for a grid/map switch
                                    if (overviewModeChanged) {
                                        FrameTrail.module('InterfaceModal').hideMessage();
                                        adminDialogCtrl.close();
                                        window.location.reload();
                                        return;
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
                            adminDialogCtrl.close();
                        }
                    }
                },
                { text: labels['GenericCancel'],
                    click: function() {
                        adminDialogCtrl.close();
                    }
                }
            ]
        });
    }

    return {
        open: open
    };

});
