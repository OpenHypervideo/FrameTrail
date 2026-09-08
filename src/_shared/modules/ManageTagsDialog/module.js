/**
 * @module Shared
 */

/**
 * I am the ManageTagsDialog. I list the instance's tag definitions and let an
 * admin add, edit and remove them, in every language they are defined in.
 *
 * I used to be a tab in the admin settings dialog. Two things were wrong with
 * that. I write tagdefinitions.json rather than config.json and I write it
 * immediately, so the soft lock guarding that dialog's Apply was disabling me
 * for no reason — one admin with the settings dialog open blocked everyone else
 * from touching tags at all. And tags are chosen in the annotation editor and
 * the content-view filter, which is exactly where someone discovers that the
 * tag they want has not been defined yet; making them close their work, find
 * the cog and hunt for a tab was the long way round.
 *
 * My writes are per-tag and taken under an exclusive file lock on the server,
 * so two admins in here cannot clobber each other and I take no lock. When the
 * definitions move underneath me I quietly re-read them.
 *
 * I live under _shared because my triggers do: the tag picker is part of the
 * Resource type, which the standalone resource manager loads too.
 *
 * @class ManageTagsDialog
 * @static
 */

FrameTrail.defineModule('ManageTagsDialog', function(FrameTrail){

    var labels = FrameTrail.module('Localization').labels;

    // Live references into the currently open dialog. Null when closed.
    var dialogCtrl        = null,
        containerElement  = null,
        presenceContainer = null,
        messageElement    = null,
        changed           = false,
        onChanged         = null;


    /**
     * I open the tag administration dialog.
     *
     * @method open
     * @param {Object} [options] options.onChanged runs once on close, and only
     *                           if something was actually written — so a caller
     *                           can re-render its tag picker without being
     *                           redrawn under the user's cursor mid-edit
     */
    function open(options) {

        if (FrameTrail.module('UserManagement').userRole !== 'admin') {
            console.error('Admin access required');
            return;
        }

        if (dialogCtrl) return;   // modal — only ever one of me

        changed   = false;
        onChanged = (options && options.onChanged) || null;

        var _tdw = document.createElement('div');
        _tdw.innerHTML = '<div class="tagDefinitionsContainer">'
            + '    <div class="tagListHeader">'
            + '        <button class="addTagButton"><span class="icon-plus"></span> '+ labels['TagAdd'] +'</button>'
            + '        <input type="text" class="tagFilterInput" placeholder="'+ labels['SettingsFilterByName'] +'">'
            + '    </div>'
            + '    <div class="tagList"></div>'
            + '</div>';
        containerElement = _tdw.firstElementChild;

        dialogCtrl = Dialog({
            title:     labels['SettingsManageTags'],
            content:   containerElement,
            modal:     true,
            resizable: false,
            width:     600,
            height:    520,
            close:     function() {

                if (FrameTrail.module('Collaboration')) {
                    FrameTrail.module('Collaboration').stop('tags', 'global');
                }

                var notify = changed ? onChanged : null;

                dialogCtrl.destroy();
                dialogCtrl        = null;
                containerElement  = null;
                presenceContainer = null;
                messageElement    = null;
                onChanged         = null;

                // After the teardown, so a callback that reopens me can.
                if (notify) notify();

            }
            // No button pane of its own: every change here is written the
            // moment it is made, so there is nothing to confirm or cancel.
        });

        // Status and errors go here rather than through InterfaceModal, which
        // the standalone resource manager never initialises.
        messageElement = document.createElement('div');
        messageElement.className = 'message dialogError';
        messageElement.style.flexBasis = '100%';
        dialogCtrl.widget().querySelector('.ft-dialog-buttonpane').prepend(messageElement);

        containerElement.querySelector('.tagFilterInput').addEventListener('input', function() {
            renderTagList(this.value);
        });

        containerElement.querySelector('.addTagButton').addEventListener('click', function() {
            openTagEditDialog(null);
        });

        containerElement.addEventListener('click', function(evt) {
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

        startPresence();

        FrameTrail.module('TagModel').updateTagModel(function() {
            renderTagList('');
        }, function() {
            renderTagList('');
        });

    }


    /**
     * @method showMessage
     * @param {String} text      empty to clear
     * @param {Boolean} [isError]
     */
    function showMessage(text, isError) {

        if (!messageElement) return;

        messageElement.textContent = text || '';
        messageElement.classList.toggle('active', !!text);
        messageElement.classList.toggle('error', !!isError);

    }


    /**
     * I show who else has this dialog open. No lock: the server writes one tag
     * at a time under an exclusive file lock, so concurrent edits are safe, and
     * the avatars are the only sign that somebody else is in here.
     *
     * @method startPresence
     */
    function startPresence() {

        var Collaboration = FrameTrail.module('Collaboration');
        if (!Collaboration || !Collaboration.isActive()) return;

        var mounted = Collaboration.mountDialogPresence(dialogCtrl);
        if (!mounted) return;

        presenceContainer = mounted.presence;

        Collaboration.start('tags', 'global', { observe: false });

    }


    /**
     * I react to the collaboration state changing.
     *
     * The list is a view of server state with nothing unsaved in it, so a write
     * by somebody else is answered by re-reading rather than by a notice. An
     * open tag edit form is a separate dialog holding its own copy.
     *
     * @method updatePresence
     */
    function updatePresence() {

        var Collaboration = FrameTrail.module('Collaboration');
        if (!Collaboration || !presenceContainer) return;

        Collaboration.renderAvatars(presenceContainer, 'tags', 'global');

        if (Collaboration.isStale('tags', 'global')) {
            Collaboration.acknowledgeVersion(null, 'tags', 'global');
            FrameTrail.module('TagModel').updateTagModel(function() {
                if (containerElement) {
                    renderTagList(containerElement.querySelector('.tagFilterInput').value);
                }
            }, function() {});
        }

    }


    function renderTagList(filterText) {

        if (!containerElement) return;

        var tagList = containerElement.querySelector('.tagList');
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


    function currentFilter() {
        return containerElement ? containerElement.querySelector('.tagFilterInput').value : '';
    }


    function openTagEditDialog(tagId) {

        var isNew = (tagId === null);
        var allTags = FrameTrail.module('TagModel').getAllTags();
        var existingData = isNew ? {} : (allTags[tagId] || {});
        var errorDiv = document.createElement('div');
        errorDiv.className = 'message dialogError';
        // The button pane wraps, so a full-width message takes the row above.
        errorDiv.style.flexBasis = '100%';

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
                + '        <button class="removeLangButton" title="'+ labels['TagDeleteLanguage'] +'"><span class="icon-cancel"></span></button>'
                + '    </div>'
                + '    <div class="langFields">'
                + '        <input type="text" class="langLabelInput" value="'+ (label || '') +'" placeholder="'+ labels['TagLabel'] +'">'
                + '        <input type="text" class="langDescInput" value="'+ (description || '') +'" placeholder="'+ labels['TagDescription'] +'">'
                + '    </div>'
                + '</div>';
            var row = _rw.firstElementChild;

            row.querySelector('.removeLangButton').addEventListener('click', function() {

                // A row that was never saved is only in the DOM.
                if (!isExisting) {
                    row.remove();
                    return;
                }

                // A stored language has to be removed on the server, or Save
                // would simply write it back — every language present is set,
                // and none is ever unset.
                FrameTrail.module('TagModel').deleteLang(tagId, lang,
                    function() {
                        row.remove();
                        noteChange();
                        renderTagList(currentFilter());
                        // Removing the last language removes the tag itself, so
                        // there may be nothing left here to edit.
                        if (!languagesList.children.length) tagDialogCtrl.close();
                    },
                    function() {
                        errorDiv.textContent = labels['TagErrorDeleteLanguageFailed'];
                        errorDiv.classList.add('active', 'error');
                    }
                );

            });

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
                            noteChange();
                            renderTagList(currentFilter());
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
                noteChange();
                renderTagList(currentFilter());
                showMessage(labels['TagDeleted'], false);
                setTimeout(function() { showMessage(''); }, 3000);
            },
            function(response) {
                if (response && response.code === 5 && response.response) {
                    showTagUsageWarning(tagId, response.response);
                } else {
                    showMessage(labels['TagErrorDeleteFailed'], true);
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


    /**
     * Record that the definitions moved. TagModel has already re-read them —
     * every write path ends in updateTagModel — so there is nothing to reload
     * here beyond telling the collaboration poll that this change was ours.
     *
     * @method noteChange
     */
    function noteChange() {

        changed = true;

        var Collaboration = FrameTrail.module('Collaboration');
        if (Collaboration) Collaboration.acknowledgeVersion(null, 'tags', 'global');

    }


    return {

        open: open,

        onChange: {
            collabState: updatePresence
        }

    };

});
