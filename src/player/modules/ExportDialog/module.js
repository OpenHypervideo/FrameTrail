/**
 * @module Player
 */


/**
 * I am the ExportDialog: Export, the place where work leaves this tab.
 *
 * On top, what is exported: the hypervideo the dialog was opened in (offered
 * only from within one), or the whole project — with or without its
 * resource library — and, when annotations were made with accounts, whether
 * they are rewritten to their authors' names, so they can be edited without
 * a server. Below, where it goes: into a local folder (a _data folder with
 * its media files) or as a download (an HTML file, which is also a project
 * file, JSON data, or the _data folder as a ZIP archive).
 *
 * An export never moves the tab: the work stays where it is. Only a page
 * that runs in memory, whose changes are lost on reload, is offered to go on
 * in the folder it was exported to. BundleExport does the work.
 *
 * @class ExportDialog
 * @static
 */

FrameTrail.defineModule('ExportDialog', function(FrameTrail){

    var labels = FrameTrail.module('Localization').labels;

    var YOUTUBE = [/youtube\.com\/watch\?v=/, /youtube\.com\/embed\//, /youtube\.com\/v\//, /youtu\.be\//];


    function escapeHTML(text) {
        return String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }

    function switchRow(name, label, hint, checked) {
        return '<div class="checkboxRow" style="display: flex; gap: 8px; align-items: flex-start;">'
             + '<label class="switch" style="flex: none;"><input type="checkbox" name="' + name + '"' + (checked ? ' checked' : '') + '><span class="slider round"></span></label>'
             + '<label>' + label + (hint ? '<br><small class="' + name + 'Hint">' + hint + '</small>' : '') + '</label>'
             + '</div>';
    }

    // The hypervideo the dialog is opened in: the video view, with one loaded.
    function openHypervideoID() {
        if (FrameTrail.getState('viewMode') !== 'video' || !FrameTrail.module('Database').hypervideo) { return null; }
        var id = FrameTrail.module('RouteNavigation').hypervideoID;
        return (id != null && FrameTrail.module('Database').hypervideos[id]) ? String(id) : null;
    }

    function playsYouTube(id) {
        var clips = (FrameTrail.module('Database').hypervideos[id] || {}).clips,
            src   = (Array.isArray(clips) && clips[0] && clips[0].src) || '';
        return YOUTUBE.some(function(pattern) { return pattern.test(src); });
    }

    // The data shown again, from the folder this tab now works in. The open
    // hypervideo only in the video view: reloading it opens it.
    function reloadFromFolder() {
        var Database = FrameTrail.module('Database');
        return new Promise(function(resolve) {
            Database.loadResourceData(function() {
                Database.loadHypervideoData(function() {
                    FrameTrail.module('TagModel').updateTagModel(function() {}, function() {});
                    var ViewOverview = FrameTrail.module('ViewOverview'),
                        map          = (ViewOverview && ViewOverview.getMap) ? ViewOverview.getMap() : null;
                    if (map && map.reload) { map.reload(); }
                    if (ViewOverview) { ViewOverview.refreshList(); }
                    if (openHypervideoID()) { FrameTrail.module('HypervideoModel').refreshFromServer(); }
                    resolve();
                }, resolve);
            }, resolve);
        });
    }


    /**
     * I open the Export dialog.
     *
     * @method open
     * @param {Object} [options] { scope: 'project' } to start with the whole project
     */
    function open(options) {

        var Database       = FrameTrail.module('Database'),
            StorageManager = FrameTrail.module('StorageManager'),
            BundleExport   = FrameTrail.module('BundleExport'),
            currentID      = openHypervideoID(),
            allIDs         = Object.keys(Database.hypervideos || {}),
            inMemory       = ['download', 'static'].indexOf(FrameTrail.getState('storageMode')) >= 0,
            onServer       = FrameTrail.getState('storageMode') === 'server',
            folderOK       = typeof StorageAdapterLocal !== 'undefined' && StorageAdapterLocal.isSupported(),
            startProject   = !currentID || (options && options.scope === 'project'),
            busy           = false,
            controller     = null,
            dialogCtrl, buttonPane, messageEl, continueButton;

        var wrapper = document.createElement('div');
        wrapper.innerHTML = '<div class="exportDialog">'

            // What
            + (currentID
                ? '<div><label><input type="radio" name="exportScope" value="hypervideo"' + (startProject ? '' : ' checked') + '> '
                  + labels['ExportThisHypervideo'] + ' <strong>' + escapeHTML(Database.hypervideos[currentID].name || currentID) + '</strong></label></div>'
                  + '<div><label><input type="radio" name="exportScope" value="project"' + (startProject ? ' checked' : '') + '> ' + labels['ExportWholeProject'] + '</label></div>'
                : '<div><input type="radio" name="exportScope" value="project" checked hidden><strong>' + labels['ExportWholeProject'] + '</strong></div>')
            + '<div class="exportLibraryRow" style="margin-top: 8px;">' + switchRow('exportLibrary', labels['ExportIncludeLibrary'], labels['ExportIncludeLibraryHint'], true) + '</div>'
            + '<div class="exportAuthorsRow" style="margin-top: 8px;">' + switchRow('exportAuthors', labels['ExportLocalAuthors'], labels['ExportLocalAuthorsHint'], true) + '</div>'
            + '<hr>'

            // Where
            + '<div class="layoutRow">'

            + '<div class="column-12 column-md-6 exportFolderColumn">'
            + '<label><strong>' + labels['ExportToLocalFolder'] + '</strong></label>'
            + '<p>' + labels['ExportToLocalFolderDescription'] + '</p>'
            + (folderOK ? '' : '<div class="message active">' + labels['ExportFolderUnsupported'] + '</div>')
            + '<button type="button" class="exportFolderButton"' + (folderOK ? '' : ' disabled') + '><span class="icon-folder"></span> ' + labels['ExportChooseFolder'] + '</button>'
            + '</div>'

            + '<div class="column-12 column-md-6 downloadColumn">'
            + '<label><strong>' + labels['DownloadFiles'] + '</strong></label>'
            + '<div style="display: flex; gap: 12px; margin-bottom: 6px;">'
            + '<label><input type="radio" name="downloadFormat" value="html" checked> ' + labels['DownloadFormatHTML'] + '</label>'
            + '<label><input type="radio" name="downloadFormat" value="json"> ' + labels['DownloadFormatJSON'] + '</label>'
            + '<label><input type="radio" name="downloadFormat" value="zip"> ' + labels['DownloadFormatZIP'] + '</label>'
            + '</div>'
            + '<div class="downloadHTMLOptions">'
            + StorageManager.embedSwitchHTML('downloadEmbed')
            + '<div class="message active youtubeExportWarning">' + labels['WarningYouTubeExport'] + '</div>'
            + '</div>'
            + '<div class="downloadZIPOptions">'
            + switchRow('downloadMedia', labels['DownloadIncludeMediaFiles'], onServer ? '' : labels['DownloadIncludeMediaUnavailable'], false)
            + '</div>'
            + '<button type="button" class="downloadButton"><span class="icon-download"></span> ' + labels['GenericDownload'] + '</button>'
            + '</div>'

            + '</div>'
            + '</div>';

        var content        = wrapper.firstElementChild,
            libraryRow     = content.querySelector('.exportLibraryRow'),
            libraryInput   = content.querySelector('[name="exportLibrary"]'),
            authorsRow     = content.querySelector('.exportAuthorsRow'),
            authorsInput   = content.querySelector('[name="exportAuthors"]'),
            folderButton   = content.querySelector('.exportFolderButton'),
            downloadButton = content.querySelector('.downloadButton'),
            mediaInput     = content.querySelector('[name="downloadMedia"]');

        function checked(name) {
            var input = content.querySelector('[name="' + name + '"]:checked');
            return input ? input.value : null;
        }

        // What is chosen, as BundleExport's options.
        function selection() {
            var scope = checked('exportScope');
            return {
                scope:        scope,
                hypervideoID: currentID,
                ids:          (scope === 'hypervideo') ? [currentID] : allIDs,
                library:      scope === 'project' && libraryInput.checked,
                localAuthors: authorsRow.style.display !== 'none' && authorsInput.checked
            };
        }

        function showMessage(html, kind) {
            messageEl.className = 'message active' + (kind ? ' ' + kind : '');
            messageEl.innerHTML = html;
        }

        function hideMessage() {
            messageEl.className = 'message';
            messageEl.innerHTML = '';
            if (continueButton) { continueButton.remove(); continueButton = null; }
        }

        // What applies to the choice.
        function update() {

            var chosen = selection(),
                format = checked('downloadFormat');

            libraryRow.style.display = (chosen.scope === 'project') ? '' : 'none';
            authorsRow.style.display = BundleExport.hasAccountAuthors(chosen.ids) ? '' : 'none';

            content.querySelector('.downloadHTMLOptions').style.display  = (format === 'html') ? '' : 'none';
            content.querySelector('.downloadZIPOptions').style.display   = (format === 'zip') ? '' : 'none';
            content.querySelector('.youtubeExportWarning').style.display = chosen.ids.some(playsYouTube) ? '' : 'none';

            mediaInput.disabled     = busy || !onServer;
            folderButton.disabled   = busy || !folderOK || !chosen.ids.length;
            downloadButton.disabled = busy || !chosen.ids.length;

        }

        content.addEventListener('change', function() {
            if (!busy) { hideMessage(); }
            update();
        });

        function setBusy(on) {
            busy = on;
            content.querySelectorAll('input').forEach(function(input) { input.disabled = on; });
            update();
        }

        downloadButton.addEventListener('click', function() {

            var chosen = selection(),
                format = checked('downloadFormat');

            hideMessage();
            setBusy(true);
            showMessage(labels['MessageStateSaving']);

            BundleExport.exportData({
                format:       format,
                scope:        chosen.scope,
                hypervideoID: chosen.hypervideoID,
                library:      chosen.library,
                localAuthors: chosen.localAuthors,
                scripts:      content.querySelector('[name="downloadEmbed"]').checked ? 'inline' : 'cdn',
                includeMedia: format === 'zip' && mediaInput.checked
            }).then(function(result) {
                setBusy(false);
                if (result && result.missing && result.missing.length) {
                    showMessage(labels['ExportFolderMissing'].replace('%s', result.missing.map(escapeHTML).join(', ')));
                } else {
                    hideMessage();
                }
            }, function(error) {
                setBusy(false);
                showMessage(escapeHTML(error.message), 'error');
            });

        });

        folderButton.addEventListener('click', function() {

            var chosen = selection();

            hideMessage();
            controller = new AbortController();

            // The folder picker must be the first thing this click does.
            var running = BundleExport.exportToFolder({
                scope:        chosen.scope,
                hypervideoID: chosen.hypervideoID,
                library:      chosen.library,
                localAuthors: chosen.localAuthors,
                signal:       controller.signal,
                onProgress:   function(progress) {
                    showMessage(labels['ExportFolderCopying'].replace('%s', progress.done).replace('%s', progress.total));
                }
            });

            setBusy(true);

            running.then(function(result) {

                setBusy(false);
                controller = null;

                var lines = [labels['ExportFolderDone'].replace('%s', escapeHTML(result.folderName))];
                if (result.missing.length) {
                    lines.push(labels['ExportFolderMissing'].replace('%s', result.missing.map(escapeHTML).join(', ')));
                }
                if (inMemory) { lines.push(labels['ExportContinueInFolderNote']); }
                showMessage(lines.join('<br>'), result.missing.length ? '' : 'success');

                if (inMemory) {
                    continueButton = document.createElement('button');
                    continueButton.type = 'button';
                    continueButton.textContent = labels['ExportContinueInFolder'].replace('%s', result.folderName);
                    continueButton.addEventListener('click', function() {
                        continueButton.disabled = true;
                        StorageManager.adoptFolder(result.adapter).then(reloadFromFolder).then(function() {
                            dialogCtrl.close();
                        }, function(error) {
                            showMessage(escapeHTML(error.message), 'error');
                        });
                    });
                    buttonPane.insertBefore(continueButton, buttonPane.querySelector('button'));
                }

            }, function(error) {

                setBusy(false);
                controller = null;
                if (error && error.name === 'AbortError') { hideMessage(); return; }   // the picker cancelled, or the dialog closed
                showMessage(escapeHTML(error.message), 'error');

            });

        });

        dialogCtrl = Dialog({
            title:   labels['GenericExport'],
            icon:    'icon-export',
            content: content,
            modal:   true,
            width:   800,
            close:   function() {
                if (controller) { controller.abort(); }
                dialogCtrl.destroy();
            },
            buttons: [
                { text: labels['GenericClose'], click: function() { dialogCtrl.close(); } }
            ]
        });

        buttonPane = dialogCtrl.widget().querySelector('.ft-dialog-buttonpane');
        messageEl = document.createElement('div');
        messageEl.className = 'message';
        messageEl.style.flexBasis = '100%';
        buttonPane.prepend(messageEl);

        update();

    }


    return {
        open: open
    };

});
