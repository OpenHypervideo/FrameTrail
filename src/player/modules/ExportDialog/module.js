/**
 * @module Player
 */


/**
 * I am the ExportDialog: Export, the place where work leaves this tab.
 *
 * On top, what is exported, as option cards: the hypervideo the dialog was
 * opened in (offered only from within one), previewed by its thumbnail and
 * name, or the whole project, by its title, the number of its hypervideos and
 * their thumbnails. Beside them, the switches that apply: whether the project
 * takes its resource library, and, when annotations were made with accounts,
 * whether they are rewritten to their authors' names, so they can be edited
 * without a server. Below, where it goes: into a local folder (a _data folder
 * with its media files) or as a download (an HTML file, which is also a
 * project file, JSON data, or the _data folder as a ZIP archive).
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
        // The text is a label of its own, so it names the input to toggle it.
        var id = name + '-' + Math.random().toString(36).slice(2, 10);
        return '<div class="checkboxRow" style="display: flex; gap: 8px; align-items: flex-start;">'
             + '<label class="switch" style="flex: none;"><input type="checkbox" name="' + name + '" id="' + id + '"' + (checked ? ' checked' : '') + '><span class="slider round"></span></label>'
             + '<label for="' + id + '">' + label + (hint ? '<br><small class="' + name + 'Hint">' + hint + '</small>' : '') + '</label>'
             + '</div>';
    }

    // A hypervideo on a scope card: its thumbnail, as the overview shows it,
    // or its icon when it has none.
    function previewTile(id) {
        var thumb = (FrameTrail.module('Database').hypervideos[id] || {}).thumb,
            tile  = document.createElement('div');
        tile.className = 'exportPreviewTile';
        if (thumb) {
            tile.style.backgroundImage = 'url("' + FrameTrail.module('RouteNavigation').getResourceURL(thumb).replace(/"/g, '%22') + '")';
        } else {
            tile.innerHTML = '<span class="icon-hypervideo"></span>';
        }
        return tile;
    }

    // An option card for a scope: the tiles of its hypervideos (one fills the
    // preview, more make a mosaic whose last tile fills its row), a title and
    // a detail line beneath them.
    function scopeCard(scope, label, ids, title, detail) {
        var card = document.createElement('div');
        card.setAttribute('data-value', scope);
        card.setAttribute('role', 'radio');
        card.tabIndex = 0;
        card.innerHTML = '<div class="optionCardThumb exportPreview">'
                       + '<div class="exportPreviewTiles' + (ids.length > 1 ? ' mosaic' : '') + '"></div>'
                       + '<div class="exportPreviewTitle">'
                       + (title ? '<strong>' + escapeHTML(title) + '</strong>' : '')
                       + (detail ? '<small>' + escapeHTML(detail) + '</small>' : '')
                       + '</div>'
                       + '</div>'
                       + '<span>' + label + '</span>';
        var tiles   = card.querySelector('.exportPreviewTiles'),
            columns = Math.ceil(Math.sqrt(ids.length)),
            rows    = Math.ceil(ids.length / columns);
        tiles.style.gridTemplateColumns = 'repeat(' + columns + ', 1fr)';
        tiles.style.gridTemplateRows    = 'repeat(' + rows + ', 1fr)';
        ids.forEach(function(id) { tiles.appendChild(previewTile(id)); });
        if (tiles.lastElementChild) {
            tiles.lastElementChild.style.gridColumn = 'span ' + (columns * rows - ids.length + 1);
        }
        return card;
    }

    // A button of the download format row.
    function formatButton(format, icon, label) {
        return '<button type="button" role="radio" data-format="' + format + '"><span class="' + icon + '"></span>' + label + '</button>';
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
            scope          = (!currentID || (options && options.scope === 'project')) ? 'project' : 'hypervideo',
            busy           = false,
            controller     = null,
            format         = 'html',
            dialogCtrl, buttonPane, messageEl, continueButton;

        var wrapper = document.createElement('div');
        wrapper.innerHTML = '<div class="exportDialog">'

            // What: a column per card, the switches in the next one
            + '<div class="layoutRow">'
            + '<div class="' + (currentID ? 'column-12 column-md-8' : 'column-6 column-md-4') + '"><div class="optionCards exportScopeCards" role="radiogroup"></div></div>'
            + '<div class="column-12 column-md-4 exportSwitches">'
            + '<div class="exportLibraryRow">' + switchRow('exportLibrary', labels['ExportIncludeLibrary'], labels['ExportIncludeLibraryHint'], true) + '</div>'
            + '<div class="exportAuthorsRow">' + switchRow('exportAuthors', labels['ExportLocalAuthors'], labels['ExportLocalAuthorsHint'], true) + '</div>'
            + '</div>'
            + '</div>'
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
            + '<div class="downloadFormats" role="radiogroup">'
            + formatButton('html', 'icon-file-code', labels['DownloadFormatHTML'])
            + formatButton('json', 'icon-data-structured', labels['DownloadFormatJSON'])
            + formatButton('zip', 'icon-file-archive', labels['DownloadFormatZIP'])
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
            scopeCards     = content.querySelector('.exportScopeCards'),
            libraryRow     = content.querySelector('.exportLibraryRow'),
            libraryInput   = content.querySelector('[name="exportLibrary"]'),
            authorsRow     = content.querySelector('.exportAuthorsRow'),
            authorsInput   = content.querySelector('[name="exportAuthors"]'),
            folderButton   = content.querySelector('.exportFolderButton'),
            downloadButton = content.querySelector('.downloadButton'),
            mediaInput     = content.querySelector('[name="downloadMedia"]'),
            formatButtons  = content.querySelectorAll('.downloadFormats > button');

        // The project by its title, when one is set, and its size.
        var projectTitle = ((Database.config || {}).overviewTitle || '').trim(),
            projectSize  = (allIDs.length === 1) ? labels['ExportHypervideoCountOne'] : labels['ExportHypervideoCountMany'].replace('%s', allIDs.length);

        if (currentID) {
            scopeCards.appendChild(scopeCard('hypervideo', labels['ExportThisHypervideo'], [currentID], Database.hypervideos[currentID].name || currentID, ''));
        }
        scopeCards.appendChild(scopeCard('project', labels['ExportWholeProject'], allIDs.slice(0, 6), projectTitle, projectSize));

        scopeCards.querySelectorAll('[data-value]').forEach(function(card) {
            card.addEventListener('click', function() {
                if (busy || scope === card.getAttribute('data-value')) { return; }
                scope = card.getAttribute('data-value');
                hideMessage();
                update();
            });
            card.addEventListener('keydown', function(evt) {
                if (evt.key === 'Enter' || evt.key === ' ') {
                    evt.preventDefault();
                    card.click();
                }
            });
        });

        formatButtons.forEach(function(button) {
            button.addEventListener('click', function() {
                if (format === button.getAttribute('data-format')) { return; }
                format = button.getAttribute('data-format');
                hideMessage();
                update();
            });
        });

        // What is chosen, as BundleExport's options.
        function selection() {
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

            var chosen = selection();

            scopeCards.querySelectorAll('[data-value]').forEach(function(card) {
                var active = card.getAttribute('data-value') === scope;
                card.classList.toggle('active', active);
                card.setAttribute('aria-checked', String(active));
            });
            scopeCards.setAttribute('aria-disabled', String(busy));

            formatButtons.forEach(function(button) {
                var active = button.getAttribute('data-format') === format;
                button.classList.toggle('active', active);
                button.setAttribute('aria-checked', String(active));
                button.disabled = busy;
            });

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

            var chosen = selection();

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
