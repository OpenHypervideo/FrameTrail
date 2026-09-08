/**
 * @module Player
 */

/**
 * I am the AdminSettingsDialog. I edit the instance-wide presentation and
 * behaviour settings: colour theme, overview presentation, global CSS and the
 * advanced options.
 *
 * Every one of my tabs writes config.json or custom.css, both of which are
 * single shared files written whole — so I batch everything behind Apply and
 * hold the 'settings' soft lock for as long as I am open. That is only honest
 * because managing users and tags moved out into dialogs of their own: those
 * write different files, field by field, and take effect immediately, so
 * holding them behind my lock disabled them for no reason. I keep buttons to
 * both, since this is still where an admin comes looking.
 *
 * @class AdminSettingsDialog
 * @static
 */

FrameTrail.defineModule('AdminSettingsDialog', function(FrameTrail){

    var labels = FrameTrail.module('Localization').labels;

    // Live references into the currently open dialog, so the collabState
    // listener can update presence without rebuilding anything. Null when the
    // dialog is closed.
    var presenceContainer = null,
        lockMessageEl     = null,
        applyButton       = null,
        reloadButton      = null;

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
                        + '            <a href="#ChangeTheme">'+ labels['SettingsColorTheme'] +'</a>'
                        + '        </li>'
                        + '        <li>'
                        + '            <a href="#OverviewPresentation">'+ labels['SettingsOverviewMode'] +'</a>'
                        + '        </li>'
                        + '        <li>'
                        + '            <a href="#ChangeGlobalCSS">'+ labels['SettingsGlobalCSS'] +'</a>'
                        + '        </li>'
                        + '        <li>'
                        + '            <a href="#Configuration">'+ labels['SettingsConfigurationOptions'] +'</a>'
                        + '        </li>'
                        + '    </ul>'
                        + '    <div id="ChangeTheme"></div>'
                        + '    <div id="OverviewPresentation"></div>'
                        + '    <div id="ChangeGlobalCSS"></div>'
                        + '    <div id="Configuration"></div>'
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
                            +   '        <div class="message active">'+ labels['MessageAllowFileUploads'] +'</div>'
                            +   '        <div class="checkboxRow"><label class="switch"><input type="checkbox" name="allowUploads" id="allowUploads" '+((configData.allowUploads && configData.allowUploads.toString() == "true") ? "checked" : "")+'><span class="slider round"></span></label><label for="allowUploads">'+ labels['SettingsAllowUploads'] +'</label></div>'
                            // Registration policy. It used to sit in the user
                            // administration tab, but it is a config.json value
                            // like the rest of this form, and Manage Users is a
                            // dialog of its own now with no Apply to catch it.
                            +   '        <div class="message active">'+ labels['MessageUserRequireConfirmation'] +'</div>'
                            +   '        <div class="checkboxRow"><label class="switch"><input type="checkbox" name="userNeedsConfirmation" id="userNeedsConfirmation" '+((configData.userNeedsConfirmation && configData.userNeedsConfirmation.toString() == "true") ? "checked" : "")+'><span class="slider round"></span></label><label for="userNeedsConfirmation">'+ labels['SettingsOnlyConfirmedUsers'] +'</label></div>'
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

        /**
         * Mark the dialog dirty when any config control changes. Defined here
         * but called after every tab's content exists — config controls live in
         * more than one tab now, and binding before they are appended would
         * silently miss them.
         */
        function bindConfigDirtyTracking() {

            adminTabs.querySelectorAll('.configEditingForm input[type="text"]').forEach(function(el) { el.addEventListener('keydown', function(evt) {
                if (!evt.metaKey && evt.key != 'Meta') {
                    configChanged = true;
                }
            }); });

            adminTabs.querySelectorAll('.configEditingForm input[type="checkbox"]').forEach(function(el) { el.addEventListener('change', function(evt) {
                configChanged = true;
            }); });

            adminTabs.querySelectorAll('.configEditingForm input[type="radio"]').forEach(function(el) { el.addEventListener('change', function(evt) {
                configChanged = true;
            }); });

            adminTabs.querySelectorAll('.configEditingForm select').forEach(function(el) { el.addEventListener('change', function(evt) {
                configChanged = true;
            }); });

        }

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

        /* Overview Presentation UI */
        // Same checkerboard the hotspot editor uses behind its colour swatch,
        // so "no colour set" reads as transparent rather than as black.
        var mapCheckerboard = 'background-image:'
                            + 'linear-gradient(45deg,#bbb 25%,transparent 25%),'
                            + 'linear-gradient(-45deg,#bbb 25%,transparent 25%),'
                            + 'linear-gradient(45deg,transparent 75%,#bbb 75%),'
                            + 'linear-gradient(-45deg,transparent 75%,#bbb 75%);'
                            + 'background-size:8px 8px;background-position:0 0,0 4px,4px -4px,-4px 0;background-color:#fff;';

        var overviewMapData = database.config.overviewMap || {},
            selectedOverviewMode = (database.config.overviewMode === 'map') ? 'map' : 'grid',
            selectedMapBackground = overviewMapData.background || '',
            selectedMapBackgroundColor = overviewMapData.backgroundColor || '',
            selectedMapFit = (overviewMapData.fit === 'cover') ? 'cover' : 'contain';

        // Schematics for the two mode cards. Each mirrors the shape of the real
        // thing: the grid shows rectangular thumbs with the title inside (see
        // .hypervideoTitle), the map shows round markers with the title below
        // (see .overviewMapMarkerLabel). The grid's last row is deliberately
        // incomplete, so the list reads as continuing past the frame.
        var gridSchematic = '<div class="schematicOverview schematicOverviewGrid">'
                          + '    <div class="schematicOverviewTile"><span class="schematicOverviewTitle"></span></div>'.repeat(5)
                          + '</div>';

        var mapMarkers = [
                { left: 20, top: 26, size: 17 },
                { left: 52, top: 18, size: 13 },
                { left: 74, top: 45, size: 15 },
                { left: 38, top: 60, size: 11 }
            ],
            mapSchematic = '<div class="schematicOverview schematicOverviewMap">'
                         + mapMarkers.map(function(marker) {
                               return '<div class="schematicOverviewMarker" style="left:'+ marker.left +'%; top:'+ marker.top +'%; width:'+ marker.size +'px;">'
                                    + '<span class="schematicOverviewTitle"></span>'
                                    + '</div>';
                           }).join('')
                         + '</div>';

        var _omw = document.createElement('div');
        _omw.innerHTML = '<div class="overviewPresentationSettings">'
                        + '    <div class="layoutRow">'
                        + '        <div class="column-12">'
                        + '            <div class="message active">'+ labels['MessageOverviewMode'] +'</div>'
                        + '            <div class="overviewModeSelect optionCards" data-property="overviewMode" data-value="'+ selectedOverviewMode +'">'
                        + '                <div '+ (selectedOverviewMode === 'grid' ? 'class="active"' : '') +' data-value="grid">'
                        + '                    <div class="optionCardThumb">'+ gridSchematic +'</div>'
                        + '                    <span>'+ labels['SettingsOverviewModeGrid'] +'</span>'
                        + '                </div>'
                        + '                <div '+ (selectedOverviewMode === 'map' ? 'class="active"' : '') +' data-value="map">'
                        + '                    <div class="optionCardThumb">'+ mapSchematic +'</div>'
                        + '                    <span>'+ labels['SettingsOverviewModeMap'] +'</span>'
                        + '                </div>'
                        + '            </div>'
                        + '        </div>'
                        + '    </div>'
                        + '    <div class="overviewMapSettings layoutRow">'
                        + '        <div class="column-6">'
                        + '            <label>'+ labels['SettingsOverviewMapBackground'] +'</label>'
                        + '            <div class="message active">'+ labels['MessageOverviewMapNoBackground'] +'</div>'
                        + '            <div class="posterFrameList overviewMapBackgroundList"></div>'
                        + '        </div>'
                        + '        <div class="column-6">'
                        + '            <label for="overviewMapFit">'+ labels['SettingsOverviewMapFit'] +'</label>'
                        + '            <div class="custom-select">'
                        + '                <select id="overviewMapFit" class="overviewMapFitSelect">'
                        + '                    <option value="contain"'+ (selectedMapFit === 'contain' ? ' selected' : '') +'>'+ labels['SettingsOverviewMapFitContain'] +'</option>'
                        + '                    <option value="cover"'+ (selectedMapFit === 'cover' ? ' selected' : '') +'>'+ labels['SettingsOverviewMapFitCover'] +'</option>'
                        + '                </select>'
                        + '            </div>'
                        + '            <div class="message active">'+ labels['MessageOverviewMapCrop'] +'</div>'
                        + '            <label for="overviewMapBackgroundColor">'+ labels['SettingsOverviewMapBackgroundColor'] +'</label>'
                        + '            <div style="display:flex; align-items:center; gap:5px;">'
                        + '                <span class="overviewMapBgSwatchWrap" style="'+ mapCheckerboard +' display:inline-flex; border-radius:3px; overflow:hidden; width: calc(100% - 50px);">'
                        + '                    <input type="color" id="overviewMapBackgroundColor" class="overviewMapBackgroundColor" value="'+ (selectedMapBackgroundColor || '#000000') +'">'
                        + '                </span>'
                        + '                <button type="button" class="overviewMapBackgroundClear" title="'+ labels['GenericTransparent'] +'" style="'+ mapCheckerboard +' width:26px; height:26px; padding:0; border:1px solid var(--primary-bg-color); border-radius:3px; cursor:pointer;"></button>'
                        + '            </div>'
                        + '            <div class="message active">'+ labels['MessageOverviewMap'] +'</div>'
                        + '        </div>'
                        + '    </div>'
                        + '</div>';
        var overviewPresentationUI = _omw.firstElementChild;

        adminTabs.querySelector('#OverviewPresentation').appendChild(overviewPresentationUI);

        // The map options only mean anything when the overview is a map, so
        // they are hidden for the grid. .layoutRow is a CSS grid, hence the
        // inline display toggle rather than a display:block class.
        var mapSettingsRow = overviewPresentationUI.querySelector('.overviewMapSettings');

        function syncOverviewModeVisibility() {
            mapSettingsRow.style.display = (selectedOverviewMode === 'map') ? '' : 'none';
        }

        syncOverviewModeVisibility();

        var overviewModeSelect = overviewPresentationUI.querySelector('.overviewModeSelect');

        overviewModeSelect.querySelectorAll(':scope > div[data-value]').forEach(function(card) {
            card.addEventListener('click', function() {
                overviewModeSelect.querySelectorAll(':scope > div[data-value]').forEach(function(sibling) {
                    sibling.classList.remove('active');
                });
                this.classList.add('active');

                selectedOverviewMode = this.getAttribute('data-value');
                overviewModeSelect.setAttribute('data-value', selectedOverviewMode);

                syncOverviewModeVisibility();
                configChanged = true;
            });
        });

        (function() {

            var backgroundList = overviewPresentationUI.querySelector('.overviewMapBackgroundList');

            FrameTrail.module('ResourceManager').renderList(backgroundList, true, 'type', 'contains', ['image']);

            // The list renders asynchronously and fades in, so the current
            // selection can only be marked once the loading screen is gone.
            // The attempt count keeps the poll from running forever when the
            // list never loads, or when the dialog is closed before it does.
            if (selectedMapBackground) {
                var backgroundAttemptsLeft = 100,
                    checkBackgroundLoaded = setInterval(function() {
                        if (backgroundList.querySelector('.loadingScreen')) {
                            if (--backgroundAttemptsLeft > 0) return;
                            clearInterval(checkBackgroundLoaded);
                            return;
                        }
                        clearInterval(checkBackgroundLoaded);
                        backgroundList.querySelectorAll('.resourceThumb').forEach(function(thumb) {
                            var res = database.resources[thumb.dataset.resourceid];
                            if (res && res.src === selectedMapBackground) {
                                thumb.classList.add('selected');
                            }
                        });
                    }, 100);
            }

            // Click a selected image again to clear the background.
            overviewPresentationUI.addEventListener('click', function(evt) {
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
            overviewPresentationUI.querySelector('.overviewMapFitSelect').addEventListener('change', function() {
                selectedMapFit = this.value;
                configChanged = true;
            });

            var mapColorInput = overviewPresentationUI.querySelector('.overviewMapBackgroundColor'),
                mapColorClear  = overviewPresentationUI.querySelector('.overviewMapBackgroundClear');

            // The picker sits over a checkerboard; fading it when nothing is set
            // lets the checkerboard show through, which reads as "no colour".
            var syncMapColorSwatch = function() {
                mapColorInput.style.opacity = selectedMapBackgroundColor ? '1' : '0.25';
                if (selectedMapBackgroundColor) { mapColorInput.value = selectedMapBackgroundColor; }
            };

            syncMapColorSwatch();

            mapColorInput.addEventListener('change', function() {
                selectedMapBackgroundColor = this.value;
                syncMapColorSwatch();
                configChanged = true;
            });

            mapColorClear.addEventListener('click', function(evt) {
                evt.preventDefault();
                evt.stopPropagation();
                if (!selectedMapBackgroundColor) return;
                selectedMapBackgroundColor = '';
                syncMapColorSwatch();
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

        /**
         * I write CSS into the live <style> element, creating it if this is the
         * first time. Database.saveGlobalCSS reads that element, so it has to
         * exist before anything can be saved — which used not to be guaranteed
         * in download mode, where nothing ever created it.
         *
         * @method setLiveGlobalCSS
         * @param {String} cssString
         */
        function setLiveGlobalCSS(cssString) {

            var styleEl = document.head.querySelector('style.FrameTrailGlobalCustomCSS');

            if (!styleEl) {
                styleEl = document.createElement('style');
                styleEl.className = 'FrameTrailGlobalCustomCSS';
                styleEl.type = 'text/css';
                document.head.appendChild(styleEl);
            }

            styleEl.textContent = cssString;

        }


        /**
         * I seed the CSS editor from the file on disk, and mirror it into the
         * live <style> element so edits can be previewed.
         *
         * Always from the file — never from the <style> element. That element
         * is created on the first open of this dialog and then just sits in the
         * head, so seeding from it showed the second open whatever the first
         * one had loaded. Another admin saving in between was invisible, and
         * Apply then wrote the stale text straight over their work.
         *
         * The read is asynchronous, so initialCSS and cssEditorValue — captured
         * before it — are reassigned here too. Otherwise the revert-on-error
         * path restores text that was never on the server either.
         */
        function seedGlobalCSS() {

            function apply(cssString) {

                codeEditor.dispatch({
                    changes: { from: 0, to: codeEditor.state.doc.length, insert: cssString },
                    annotations: CM6.Transaction.userEvent.of('setValue')
                });

                cssEditorValue = cssString;
                initialCSS     = cssString;

                setLiveGlobalCSS(cssString);

                // The stylesheet is served by the <style> from here on; leaving
                // the <link> would let the file win the cascade after an edit.
                var _lnk = document.head.querySelector('link[href$="custom.css"]');
                if (_lnk) { _lnk.remove(); }

            }

            if (FrameTrail.getState('storageMode') === 'local') {
                FrameTrail.module('StorageManager').getAdapter()
                    .readText('custom.css')
                    .then(apply)
                    .catch(function() { apply(''); });   // no custom.css yet
                return;
            }

            if (FrameTrail.getState('storageMode') === 'download') {
                // Nothing to read from — keep whatever is already inlined, but
                // make sure the element exists so an edit has somewhere to go.
                setLiveGlobalCSS(cssText);
                return;
            }

            fetch(FrameTrail.module('RouteNavigation').resolveDataURL('custom.css'), { cache: 'no-cache' })
                .then(function(r) { return r.ok ? r.text() : Promise.reject(new Error('HTTP ' + r.status)); })
                .then(apply)
                .catch(function() {
                    console.log(labels['ErrorCouldNotRetrieveCustomCSS']);
                });

        }

        seedGlobalCSS();

        // Seed the compare-and-swap token for custom.css. Without it the first
        // save of a session goes out unguarded and can clobber another admin.
        database.loadConfigVersions();

        // Must run here, not earlier: config controls live in more than one tab,
        // and every panel's markup has to be in the DOM before the listeners that
        // set configChanged can be attached to it. Without this, Apply sweeps the
        // form but configChanged is never true, so nothing is written at all.
        bindConfigDirtyTracking();

        var adminDialogCtrl = Dialog({
            title:   labels['GenericAdministration'],
            content: adminDialog,
            modal: true,
            resizable: false,
            width: 900,
            height: 600,
            close: function() {
                // If closing without applying (X button or ESC), just remove dialog
                // No changes are applied until "Apply" button is clicked.
                // Demote rather than stop: the scope stays watched for the rest
                // of the session, so the overview still learns when somebody
                // else changes the settings. Demoting releases our lock.
                if (FrameTrail.module('Collaboration')) {
                    FrameTrail.module('Collaboration').setObserving(true, 'settings', 'global');
                }
                presenceContainer = null;
                lockMessageEl     = null;
                applyButton       = null;
                reloadButton      = null;
                adminDialogCtrl.destroy();
            },
            buttons: [
                // Users and tags live in their own dialogs now, but this is
                // still where an admin comes looking for them. They open on top
                // as ordinary modals, and they are never disabled by the
                // settings lock — nothing they write goes through Apply.
                { text: labels['UserAdministration'],
                    class: 'manageUsersButton',
                    click: function() { FrameTrail.module('ManageUsersDialog').open(); }
                },
                { text: labels['SettingsManageTags'],
                    class: 'manageTagsButton',
                    click: function() { FrameTrail.module('ManageTagsDialog').open(); }
                },
                { text: labels['GenericApply'] || labels['GenericSaveChanges'] || 'Apply',
                    class: 'applySettingsButton',
                    click: function() {
                        // Apply and save changes if any were made
                        if (configChanged || globalCSSChanged) {
                            FrameTrail.module('InterfaceModal').showStatusMessage(labels['MessageStateSaving'] || 'Saving...');
                            
                            // Apply config changes from form
                            if (configChanged) {
                                // Apply text input changes
                                adminTabs.querySelectorAll('.configEditingForm input[type="text"]').forEach(function(el) {
                                    var key = el.getAttribute('name'),
                                        value = el.value;
                                    if (key) {
                                        database.config[key] = value;
                                    }
                                });
                                
                                // Apply checkbox changes
                                adminTabs.querySelectorAll('.configEditingForm input[type="checkbox"]').forEach(function(el) {
                                    var key = el.getAttribute('name'),
                                        value = el.checked;
                                    
                                    if (key) {
                                        database.config[key] = value;
                                    }
                                });
                                
                                // Apply radio changes
                                adminTabs.querySelectorAll('.configEditingForm input[type="radio"]:checked').forEach(function(el) {
                                    var key = el.getAttribute('name'),
                                        value = el.value;
                                    if (key) {
                                        database.config[key] = value;
                                    }
                                });

                                // Apply select changes
                                adminTabs.querySelectorAll('.configEditingForm select').forEach(function(el) {
                                    var key = el.getAttribute('name'),
                                        value = el.value;
                                    if (key) {
                                        database.config[key] = value;
                                    }
                                });

                                // Apply overview presentation settings. The mode is
                                // picked with option cards rather than a form field,
                                // and the map settings live nested under
                                // config.overviewMap with a color input the generic
                                // loops above do not read, so all of them are written
                                // explicitly. The markers array is left untouched —
                                // it is owned by ViewOverviewMap.
                                database.config.overviewMode = selectedOverviewMode;

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
                                setLiveGlobalCSS(cssEditorValue);
                            }
                            
                            var saveCount = 0;
                            var saveTotal = (configChanged ? 1 : 0) + (globalCSSChanged ? 1 : 0);
                            var saveError = null;
                            // Highest post-write mtime across both files — the
                            // 'settings' version spans them, so whichever we
                            // wrote last is the one the poll will report.
                            var savedVersion = null;

                            function noteSavedVersion(result) {
                                if (result && result.version && (savedVersion === null || result.version > savedVersion)) {
                                    savedVersion = result.version;
                                }
                            }

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
                                            database.replaceConfigContents(initialConfig);
                                            // Only revert theme on current view if hypervideo has no per-hypervideo theme
                                            var hvCfg = database.hypervideo && database.hypervideo.config;
                                            if (!hvCfg || !hvCfg.theme) {
                                                document.querySelector(FrameTrail.getState('target')).setAttribute('data-frametrail-theme', initialConfig.defaultTheme || 'classic');
                                            }
                                        }
                                        if (globalCSSChanged) {
                                            setLiveGlobalCSS(initialCSS);
                                        }
                                        // Repaint the map with the reverted values
                                        refreshOverviewMap();
                                    } else if (configChanged) {
                                        // Re-read only when we actually wrote config.json.
                                        // A CSS-only Apply left it untouched, and reloading
                                        // it then replaces overviewMap wholesale — silently
                                        // discarding marker drags that were never saved,
                                        // and clearing the dirty flag so nobody is asked.
                                        FrameTrail.module('Database').loadConfigData(function(){
                                            // Background, colour and fit live in
                                            // config.overviewMap, and nothing observes
                                            // the config, so the map is told explicitly
                                            // rather than waiting for a page reload.
                                            refreshOverviewMap();
                                        }, function(){});
                                    }

                                    // Adopt what we just wrote, so the next poll
                                    // does not report our own change back to us.
                                    if (!saveError && FrameTrail.module('Collaboration')) {
                                        FrameTrail.module('Collaboration').acknowledgeVersion(savedVersion, 'settings', 'global');
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
                                    noteSavedVersion(result);
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
                                    } else {
                                        noteSavedVersion(result);
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

        // config.json and custom.css are single shared files written whole, so
        // two admins in here would silently erase each other. Claim the
        // 'settings' scope for as long as the dialog is open. This runs
        // alongside the hypervideo scope, not instead of it.
        claimSettingsLock(adminDialogCtrl);
    }


    /**
     * I take the soft lock on the shared instance settings. If somebody else
     * has it, the dialog stays readable but Apply is disabled — the compare-
     * and-swap on save would reject the write anyway, and refusing up front is
     * kinder than failing after the user has retyped everything.
     *
     * @method claimSettingsLock
     * @param {Object} dialogCtrl
     */
    function claimSettingsLock(dialogCtrl) {

        var Collaboration = FrameTrail.module('Collaboration');
        if (!Collaboration || !Collaboration.isActive()) return;

        var buttonPane = dialogCtrl.widget().querySelector('.ft-dialog-buttonpane');
        if (!buttonPane) return;

        // By class, not by position: the Manage Users and Manage Tags shortcuts
        // sit ahead of Apply in the pane, and they must stay usable while the
        // lock is held — they write neither of the files it guards.
        applyButton = buttonPane.querySelector('.applySettingsButton');

        var mounted = Collaboration.mountDialogPresence(dialogCtrl);
        if (!mounted) return;

        presenceContainer = mounted.presence;
        lockMessageEl     = mounted.message;

        // Offered only once the settings actually moved underneath us. It is
        // deliberately blunt — close and reopen — because four tabs of
        // interdependent form state cannot be merged, and reopening is provably
        // right where a partial refresh would not be.
        reloadButton = document.createElement('button');
        reloadButton.className = 'collabReloadButton';
        reloadButton.textContent = labels['GenericReloadDiscard'];
        reloadButton.style.display = 'none';
        reloadButton.addEventListener('click', function() {
            dialogCtrl.close();
            FrameTrail.module('Database').loadConfigData(function() { open(); }, function() {});
        });
        buttonPane.prepend(reloadButton);

        // Promote the ambient watch on this scope to a participating session:
        // being in here is exactly what the avatars are meant to show.
        Collaboration.start('settings', 'global', { observe: false });
        Collaboration.claim(function() { updateSettingsPresence(); }, 'settings', 'global');

    }


    /**
     * Reflect the current state of the 'settings' scope into the open dialog:
     * avatars for everyone else in here, Apply disabled behind a named message
     * while somebody else holds the lock, and a way out when the files moved.
     *
     * Lock and staleness share one message element and one line, because they
     * cannot usefully be shown at once — while somebody holds the lock, Apply
     * is disabled and what the file says is beside the point.
     *
     * @method updateSettingsPresence
     */
    function updateSettingsPresence() {

        var Collaboration = FrameTrail.module('Collaboration');
        if (!Collaboration || !presenceContainer) return;

        Collaboration.renderAvatars(presenceContainer, 'settings', 'global');

        var blocked = Collaboration.isLockedByOther('settings', 'global'),
            stale   = Collaboration.isStale('settings', 'global'),
            holder  = Collaboration.lockHolder('settings', 'global'),
            writer  = Collaboration.lastWriter('settings', 'global');

        if (lockMessageEl) {
            if (blocked) {
                lockMessageEl.className = 'dialogCollabMessage message error active';
                lockMessageEl.textContent = labels['MessageCollabSettingsLockedBy'].replace('%s', (holder && holder.name) ? holder.name : '');
            } else if (stale) {
                // Not an error: nobody is blocking us, the file underneath just
                // moved. What is on screen is simply no longer what is on disk.
                lockMessageEl.className = 'dialogCollabMessage message active';
                lockMessageEl.textContent = (writer && writer.name)
                    ? labels['MessageCollabSettingsChangesBy'].replace('%s', writer.name)
                    : labels['MessageCollabSettingsChanged'];
            } else {
                lockMessageEl.className = 'dialogCollabMessage message';
                lockMessageEl.textContent = '';
            }
        }

        if (applyButton)  applyButton.disabled  = blocked;
        if (reloadButton) reloadButton.style.display = (!blocked && stale) ? '' : 'none';

        // Grey out the form itself. The title bar sits outside .ft-dialog-content,
        // so the avatars and the "X is editing…" message stay fully legible, and
        // the button pane keeps the Manage Users / Manage Tags shortcuts live.
        var widget = presenceContainer.closest('.ft-dialog');
        if (widget) widget.classList.toggle('collabLocked', blocked);

    }

    return {
        open: open,

        onChange: {
            collabState: updateSettingsPresence
        }
    };

});
