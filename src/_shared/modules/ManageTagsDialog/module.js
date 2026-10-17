/**
 * @module Shared
 */

/**
 * I am the ManageTagsDialog: the instance's tags in one list, for admins to
 * rename, describe, delete and add. A tag's label and description are fields
 * edited in place and written when the field is left (or on Enter; Esc puts
 * back what was there). There is nothing to save or cancel.
 *
 * Every row shows the tag's id and how often items use it. Deleting asks
 * first and removes only the definition: items keep the id, and the list
 * shows such ids at the end, as "not defined", with Define to make them tags
 * again. An id never changes.
 *
 * I used to be a tab in the admin settings dialog. I write
 * tagdefinitions.json rather than config.json and I write it at once, so the
 * soft lock guarding that dialog's Apply has nothing to do with me. My writes
 * are per tag and taken under an exclusive file lock on the server, so two
 * admins in here cannot clobber each other and I take no lock. When the
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
        messageTimer      = null,
        changed           = false,
        onChanged         = null,
        // { id: { count, hypervideos } }; null while counting, false when it could not be counted
        usageMap          = null,
        // A row for a new tag is open at the top.
        newRow            = false,
        // The id of a tag no longer defined that is being defined again.
        defining          = null,
        // The list is being drawn again: its fields' blur is not an edit.
        rendering         = false;


    function TagModel() {
        return FrameTrail.module('TagModel');
    }


    /**
     * I open the tag administration dialog.
     *
     * @method open
     * @param {Object} [options] options.onChanged runs once on close, and only
     *                           if something was actually written — so a caller
     *                           can re-render without being redrawn under the
     *                           user's cursor mid-edit
     */
    function open(options) {

        if (!TagModel().canManage()) {
            console.error('Admin access required');
            return;
        }

        if (dialogCtrl) return;   // modal — only ever one of me

        changed   = false;
        onChanged = (options && options.onChanged) || null;
        usageMap  = null;
        newRow    = false;
        defining  = null;

        var _tdw = document.createElement('div');
        _tdw.innerHTML = '<div class="tagDefinitionsContainer">'
            + '    <div class="tagListHeader">'
            + '        <input type="text" class="tagFilterInput">'
            + '        <button type="button" class="addTagButton"><span class="icon-plus"></span> '+ labels['TagAdd'] +'</button>'
            + '    </div>'
            + '    <div class="tagList"></div>'
            + '</div>';
        containerElement = _tdw.firstElementChild;

        var filterInput = containerElement.querySelector('.tagFilterInput');
        filterInput.placeholder = labels['TagSearchPlaceholder'];
        filterInput.setAttribute('aria-label', labels['TagSearchPlaceholder']);

        dialogCtrl = Dialog({
            title:     labels['SettingsManageTags'],
            icon:      'icon-tags-1',
            content:   containerElement,
            modal:     true,
            resizable: false,
            width:     640,
            height:    540,
            close:     function() {

                if (FrameTrail.module('Collaboration')) {
                    FrameTrail.module('Collaboration').stop('tags', 'global');
                }

                var notify = changed ? onChanged : null;

                clearTimeout(messageTimer);
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

        filterInput.addEventListener('input', function() { renderTagList(); });

        containerElement.querySelector('.addTagButton').addEventListener('click', function() {
            newRow = true;
            renderTagList({ focus: { key: 'new', field: 'label' } });
        });

        startPresence();

        TagModel().updateTagModel(function() {
            renderTagList();
        });

        loadUsage();

    }


    function loadUsage() {

        TagModel().usage().then(function(map) {
            usageMap = map || {};
        }, function(error) {
            console.warn('FrameTrail: where tags are used could not be counted:', error && error.message);
            usageMap = false;
        }).then(function() {
            renderTagList();
        });

    }


    /**
     * @method showMessage
     * @param {String} text      empty to clear
     * @param {Boolean} [isError]
     */
    function showMessage(text, isError) {

        if (!messageElement) return;

        clearTimeout(messageTimer);
        messageElement.textContent = text || '';
        messageElement.classList.toggle('active', !!text);
        messageElement.classList.toggle('error', !!isError);
        messageElement.classList.toggle('success', !!text && !isError);

        if (text && !isError) {
            messageTimer = setTimeout(function() { showMessage(''); }, 2000);
        }

    }

    function showFailure(error) {
        var text = {
            labelEmpty:   labels['TagErrorLabelEmpty'],
            labelTooLong: labels['TagErrorLabelTooLong'],
            labelTaken:   labels['TagErrorLabelTaken']
        }[error && error.code];
        if (!text) console.warn('FrameTrail: the tag could not be saved:', error && error.message);
        showMessage(text || labels['TagErrorSaveFailed'], true);
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
     * The list is a view of what is stored, with nothing unsaved in it but the
     * field being typed in, so a write by somebody else is answered by
     * re-reading, keeping that field as it is.
     *
     * @method updatePresence
     */
    function updatePresence() {

        var Collaboration = FrameTrail.module('Collaboration');
        if (!Collaboration || !presenceContainer) return;

        Collaboration.renderAvatars(presenceContainer, 'tags', 'global');

        if (Collaboration.isStale('tags', 'global')) {
            Collaboration.acknowledgeVersion(null, 'tags', 'global');
            TagModel().updateTagModel(function() {
                renderTagList();
            });
        }

    }


    function usesText(use) {
        if (!use || !use.count) return labels['TagUnused'];
        return (use.count === 1) ? labels['TagUsesOne'] : labels['TagUsesMany'].replace('%s', use.count);
    }

    function hypervideosText(use) {
        var n = (use && use.hypervideos) ? use.hypervideos.length : 0;
        return (n === 1) ? labels['ExportHypervideoCountOne'] : labels['ExportHypervideoCountMany'].replace('%s', n);
    }

    function metaText(id) {
        if (usageMap === null) return id + ' · ' + labels['TagCounting'];
        if (usageMap === false) return id;
        return id + ' · ' + usesText(usageMap[id]);
    }

    // Ids items name that no tag has, sorted.
    function undefinedIds() {
        if (!usageMap) return [];
        return Object.keys(usageMap).filter(function(id) { return !TagModel().getTag(id).known; }).sort();
    }


    // Which field has the focus, so a redraw can give it back as it was.
    function focusState() {
        var active = document.activeElement;
        if (!containerElement || !active || !containerElement.contains(active) || !active.dataset.field) return null;
        var row = active.closest('.tagListItem');
        return {
            key:   row.dataset.key,
            field: active.dataset.field,
            value: active.value,
            start: active.selectionStart,
            end:   active.selectionEnd
        };
    }

    function restoreFocus(state, keepValue) {
        if (!state || !containerElement) return;
        var row   = containerElement.querySelector('.tagListItem[data-key="' + CSS.escape(state.key) + '"]'),
            input = row && row.querySelector('[data-field="' + state.field + '"]');
        if (!input) return;
        if (keepValue && state.value !== undefined) input.value = state.value;
        input.focus();
        if (state.select) {
            input.select();
        } else if (state.start !== undefined && state.start !== null) {
            try { input.setSelectionRange(state.start, state.end); } catch (e) {}
        }
    }

    /**
     * I draw the list again: a new tag's row, the tags, the ids no longer
     * defined, all filtered by the search field.
     *
     * @method renderTagList
     * @param {Object} [options] focus: { key, field, select } to put the
     *                           focus there; remap: { from, to }, a row that
     *                           has become another (a new tag, written)
     */
    function renderTagList(options) {

        if (!containerElement) return;

        options = options || {};

        var focus = focusState(),
            list  = containerElement.querySelector('.tagList'),
            query = containerElement.querySelector('.tagFilterInput').value;

        if (focus && options.remap && focus.key === options.remap.from) focus.key = options.remap.to;

        rendering = true;
        list.innerHTML = '';

        if (newRow) {
            list.appendChild(editableRow({ key: 'new', label: '', description: '', meta: '' }));
        }

        TagModel().listTags().filter(function(tag) {
            return TagModel().matches(tag, query);
        }).forEach(function(tag) {
            list.appendChild(editableRow({ key: 'tag:' + tag.id, id: tag.id, label: tag.label, description: tag.description, meta: metaText(tag.id) }));
        });

        undefinedIds().filter(function(id) {
            return TagModel().matches({ id: id, label: id, description: '' }, query);
        }).forEach(function(id) {
            list.appendChild(defining === id
                ? editableRow({ key: 'define:' + id, id: id, label: id, description: '', meta: id })
                : undefinedRow(id));
        });

        if (!list.children.length) {
            var empty = document.createElement('div');
            empty.className = 'message active';
            empty.textContent = query ? labels['TagListNoMatch'] : labels['TagListEmpty'];
            list.appendChild(empty);
        }

        rendering = false;

        if (options.focus) {
            restoreFocus(options.focus, false);
        } else {
            restoreFocus(focus, true);
        }

    }


    function button(className, icon, title, text) {
        var el = document.createElement('button');
        el.type = 'button';
        el.className = className;
        el.title = title;
        el.setAttribute('aria-label', title);
        el.innerHTML = '<span class="' + icon + '"></span>';
        if (text) el.appendChild(document.createTextNode(' ' + text));
        return el;
    }

    function field(className, name, value, placeholder, ariaLabel) {
        var input = document.createElement('input');
        input.type = 'text';
        input.className = className;
        input.dataset.field = name;
        input.dataset.saved = value;
        input.value = value;
        input.placeholder = placeholder;
        input.setAttribute('aria-label', ariaLabel);
        return input;
    }

    // A row whose label and description are edited in place.
    function editableRow(spec) {

        var row     = document.createElement('div'),
            info    = document.createElement('div'),
            actions = document.createElement('div'),
            label   = field('tagLabelInput', 'label', spec.label, labels['TagLabel'], labels['TagLabel']),
            desc    = field('tagDescriptionInput', 'description', spec.description, labels['TagDescriptionPlaceholder'], labels['TagDescription']),
            meta    = document.createElement('div');

        row.className = 'tagListItem' + (spec.key === 'new' || spec.key.indexOf('define:') === 0 ? ' pendingTag' : '');
        row.dataset.key = spec.key;
        info.className = 'tagListInfo';
        actions.className = 'tagListActions';
        label.maxLength = 80;
        desc.maxLength = 1000;
        meta.className = 'tagListMeta';
        meta.textContent = spec.meta;
        if (spec.id) meta.title = labels['TagIdTitle'];

        info.appendChild(label);
        info.appendChild(desc);
        info.appendChild(meta);

        if (spec.key.indexOf('tag:') === 0) {
            var del = button('deleteTagButton', 'icon-trash', labels['GenericDelete']);
            del.addEventListener('click', function() { confirmDelete(spec.id); });
            actions.appendChild(del);
        } else {
            var cancel = button('cancelTagButton', 'icon-cancel', labels['GenericCancel']);
            cancel.addEventListener('mousedown', function(evt) { evt.preventDefault(); });
            cancel.addEventListener('click', function() { dropPending(spec.key); });
            actions.appendChild(cancel);
        }

        [label, desc].forEach(function(input) {

            input.addEventListener('keydown', function(evt) {
                if (evt.key === 'Enter') {
                    evt.preventDefault();
                    commit(row, input.dataset.field === 'label' ? 'description' : null);
                    if (input.dataset.field !== 'label') input.blur();
                } else if (evt.key === 'Escape') {
                    // Puts the field back, and does not close the dialog.
                    evt.preventDefault();
                    evt.stopPropagation();
                    if (row.dataset.key.indexOf('tag:') !== 0) {
                        if (!row._writing) dropPending(row.dataset.key);
                        return;
                    }
                    input.value = input.dataset.saved;
                    input.blur();
                }
            });

            input.addEventListener('blur', function() {
                if (!rendering) commit(row);
            });

        });

        // A new tag's row left empty goes away.
        row.addEventListener('focusout', function(evt) {
            if (rendering || row.dataset.key !== 'new' || row.contains(evt.relatedTarget)) return;
            if (!label.value.trim() && !desc.value.trim() && !row._writing) dropPending('new');
        });

        row.appendChild(info);
        row.appendChild(actions);

        return row;

    }

    // A row for an id that items name and no tag has.
    function undefinedRow(id) {

        var row     = document.createElement('div'),
            info    = document.createElement('div'),
            name    = document.createElement('div'),
            meta    = document.createElement('div'),
            actions = document.createElement('div'),
            define  = button('defineTagButton', 'icon-tag', labels['TagDefineTitle'], labels['TagDefine']);

        row.className = 'tagListItem undefinedTag';
        row.dataset.key = 'undefined:' + id;
        info.className = 'tagListInfo';
        name.className = 'tagListName';
        name.textContent = id;
        meta.className = 'tagListMeta';
        meta.textContent = labels['TagNotDefined'] + ' · ' + usesText(usageMap && usageMap[id]);
        actions.className = 'tagListActions';

        define.addEventListener('click', function() {
            defining = id;
            renderTagList({ focus: { key: 'define:' + id, field: 'label', select: true } });
        });

        info.appendChild(name);
        info.appendChild(meta);
        actions.appendChild(define);
        row.appendChild(info);
        row.appendChild(actions);

        return row;

    }

    function dropPending(key) {
        if (key === 'new') newRow = false;
        if (key.indexOf('define:') === 0) defining = null;
        renderTagList();
    }


    /**
     * I write a row whose fields differ from what is stored. Values are taken
     * as saved at once, so the blur after an Enter does not write again; a
     * failed write puts them back.
     *
     * @method commit
     * @param {HTMLElement} row
     * @param {String} [then] the field of the row to focus afterwards
     */
    function commit(row, then) {

        var key         = row.dataset.key,
            labelInput  = row.querySelector('.tagLabelInput'),
            descInput   = row.querySelector('.tagDescriptionInput'),
            label       = labelInput.value.trim(),
            description = descInput.value.trim(),
            focusNext   = function(newKey) {
                if (then) restoreFocus({ key: newKey || key, field: then }, false);
            };

        if (row._writing) return;

        if (key === 'new' || key.indexOf('define:') === 0) {

            if (!label) {
                if (then) showMessage(labels['TagErrorLabelEmpty'], true);
                return;
            }

            var id = (key === 'new') ? null : key.slice('define:'.length);

            if (TagModel().findByLabel(label)) {
                showMessage(labels['TagErrorLabelTaken'], true);
                return;
            }

            row._writing = true;
            row.classList.add('saving');

            var write = id ? TagModel().setTag(id, label, description).then(function() { return id; })
                           : TagModel().addTag(label, description);

            write.then(function(written) {
                if (key === 'new') newRow = false; else defining = null;
                noteChange();
                showMessage(labels['TagSaved']);
                renderTagList({ remap: { from: key, to: 'tag:' + written } });
                focusNext('tag:' + written);
            }, function(error) {
                row._writing = false;
                row.classList.remove('saving');
                showFailure(error);
            });

            return;

        }

        var tagId      = key.slice('tag:'.length),
            savedLabel = labelInput.dataset.saved,
            savedDesc  = descInput.dataset.saved;

        if (!label) {
            showMessage(labels['TagErrorLabelEmpty'], true);
            labelInput.value = savedLabel;
            return;
        }

        if (label === savedLabel && description === savedDesc) {
            labelInput.value = savedLabel;
            descInput.value = savedDesc;
            focusNext();
            return;
        }

        labelInput.dataset.saved = labelInput.value = label;
        descInput.dataset.saved = descInput.value = description;
        row._writing = true;
        row.classList.add('saving');

        TagModel().setTag(tagId, label, description).then(function() {
            row._writing = false;
            row.classList.remove('saving');
            noteChange();
            showMessage(labels['TagSaved']);
        }, function(error) {
            row._writing = false;
            row.classList.remove('saving');
            labelInput.dataset.saved = savedLabel;
            descInput.dataset.saved = savedDesc;
            if (document.activeElement !== labelInput) labelInput.value = savedLabel;
            if (document.activeElement !== descInput) descInput.value = savedDesc;
            showFailure(error);
        });

        focusNext();

    }


    function confirmDelete(id) {

        var tag = TagModel().getTag(id),
            use = usageMap ? usageMap[id] : undefined,
            message;

        if (usageMap === false || usageMap === null) {
            message = labels['TagDeleteConfirmUnknown'];
        } else if (use && use.count) {
            message = labels['TagDeleteConfirmUsed'].replace('{uses}', usesText(use)).replace('{hypervideos}', hypervideosText(use));
        } else {
            message = labels['TagDeleteConfirmUnused'];
        }

        ConfirmDialog({
            title:        labels['TagDeleteTitle'],
            icon:         'icon-trash',
            message:      message.replace('{label}', tag.label),
            confirmLabel: labels['GenericDelete'],
            cancelLabel:  labels['GenericCancel'],
            width:        440,
            onConfirm:    function() {
                TagModel().deleteTag(id, true).then(function() {
                    noteChange();
                    renderTagList();
                    showMessage(labels['TagDeleted']);
                }, function(error) {
                    console.warn('FrameTrail: the tag could not be deleted:', error && error.message);
                    showMessage(labels['TagErrorDeleteFailed'], true);
                });
            }
        });

    }


    /**
     * Record that the definitions moved. TagModel has already taken them in —
     * every write ends there — so there is nothing to reload here beyond
     * telling the collaboration poll that this change was ours.
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
