/**
 * @module Shared
 */

/**
 * I am the TagPicker: the tags of something as chips, and a field to add
 * more. Typing filters the defined tags; "Create tag …" adds a new one for
 * whoever may (TagModel.canCreate), and admins find "Manage tags…" at the
 * bottom of the list. A tag that is no longer defined shows as its id,
 * marked, so it can be seen and removed.
 *
 * I change nothing myself: onAdd and onRemove do, and I draw the list I was
 * given again afterwards.
 *
 * The list is a popover in the top layer, so neither the edit panel nor a
 * dialog clips it.
 *
 * @class TagPicker
 * @static
 */

FrameTrail.defineModule('TagPicker', function(FrameTrail){

    var labels  = FrameTrail.module('Localization').labels,
        counter = 0;


    /**
     * @method create
     * @param {Object} options
     * @param {Array|Function} options.selected  the tag ids shown as chips, or a function returning them; read on every redraw
     * @param {Function} options.onAdd     (id) when a tag is chosen or created
     * @param {Function} options.onRemove  (id) when a chip's × is clicked
     * @return {Object} { element, refresh }
     */
    function create(options) {

        var TagModel = FrameTrail.module('TagModel'),
            uid      = 'tagPicker' + (++counter),
            element  = document.createElement('div'),
            input    = document.createElement('input'),
            list     = document.createElement('div'),
            choices  = [],
            focused  = -1,
            busy     = false,
            problem  = '',
            seenConnected = false;

        element.className = 'tagPicker';

        input.type = 'text';
        input.className = 'tagPickerInput';
        input.placeholder = labels['TagPickerPlaceholder'];
        input.setAttribute('role', 'combobox');
        input.setAttribute('aria-autocomplete', 'list');
        input.setAttribute('aria-expanded', 'false');
        input.setAttribute('aria-controls', uid + '-list');
        input.setAttribute('aria-label', labels['TagPickerPlaceholder']);
        input.autocomplete = 'off';

        list.id = uid + '-list';
        list.className = 'contextSelectList tagPickerList';
        list.setAttribute('popover', 'manual');
        list.setAttribute('role', 'listbox');

        element.appendChild(input);
        element.appendChild(list);


        function selected() {
            var list = (typeof options.selected === 'function') ? options.selected() : options.selected;
            return Array.isArray(list) ? list : [];
        }

        function isOpen() {
            return list.matches(':popover-open');
        }

        function renderChips() {

            element.querySelectorAll(':scope > .tagItem').forEach(function(chip) { chip.remove(); });

            selected().forEach(function(id) {

                var tag    = TagModel.getTag(id),
                    chip   = document.createElement('div'),
                    remove = document.createElement('div');

                chip.className = 'tagItem' + (tag.known ? '' : ' unknown');
                chip.dataset.tag = tag.id;
                chip.textContent = tag.label;
                chip.title = tag.known ? (tag.description || tag.label) : labels['TagUnknown'];

                remove.className = 'deleteItem';
                remove.setAttribute('role', 'button');
                remove.setAttribute('aria-label', labels['TagRemove'] + ': ' + tag.label);
                remove.innerHTML = '<span class="icon-cancel"></span>';
                remove.addEventListener('click', function() {
                    options.onRemove(tag.id);
                    refresh();
                });

                chip.appendChild(remove);
                element.insertBefore(chip, input);

            });

        }

        function option(className, text, choose) {
            var row = document.createElement('div');
            row.className = className;
            row.id = uid + '-option-' + choices.length;
            row.setAttribute('role', 'option');
            row.textContent = text;
            // Keep the focus in the field: a click on the list must not end it.
            row.addEventListener('mousedown', function(evt) { evt.preventDefault(); });
            row.addEventListener('click', function() { choose(); });
            choices.push({ element: row, choose: choose });
            list.appendChild(row);
            return row;
        }

        function hint(text) {
            var row = document.createElement('div');
            row.className = 'tagPickerHint';
            row.textContent = text;
            row.addEventListener('mousedown', function(evt) { evt.preventDefault(); });
            list.appendChild(row);
        }

        function renderList() {

            var query   = input.value.trim(),
                have    = selected(),
                exact   = query ? TagModel.findByLabel(query) : null,
                matches = TagModel.listTags().filter(function(tag) {
                    return have.indexOf(tag.id) === -1 && TagModel.matches(tag, query);
                });

            list.innerHTML = '';
            choices = [];

            matches.forEach(function(tag) {
                var row = option('tagPickerOption', tag.label, function() { choose(tag.id); });
                if (tag.description) row.title = tag.description;
            });

            if (query && !exact && TagModel.canCreate()) {
                option('tagPickerOption tagPickerCreate', labels['TagPickerCreate'].replace('{label}', query), function() { createTag(query); });
            }

            if (problem) {
                hint(problem);
            } else if (!choices.length) {
                if (exact) {
                    hint(labels['TagPickerAlreadyAdded']);
                } else if (query) {
                    hint(labels['TagPickerNoMatch']);
                } else if (!TagModel.listTags().length) {
                    hint(TagModel.canCreate() ? labels['TagPickerNoTagsCreate'] : labels['TagNoTagsDefined']);
                }
            }

            var ManageTagsDialog = FrameTrail.module('ManageTagsDialog');
            if (ManageTagsDialog && TagModel.canManage()) {
                option('tagPickerOption tagPickerManage', labels['TagPickerManage'], function() {
                    close();
                    ManageTagsDialog.open();
                });
            }

            // What Enter takes: the first match while typing, nothing before.
            setFocused(query && choices.length ? 0 : -1);

        }

        function setFocused(index) {
            focused = index;
            choices.forEach(function(choice, i) { choice.element.classList.toggle('focused', i === index); });
            if (index >= 0 && choices[index]) {
                input.setAttribute('aria-activedescendant', choices[index].element.id);
                choices[index].element.scrollIntoView({ block: 'nearest' });
            } else {
                input.removeAttribute('aria-activedescendant');
            }
        }

        function place() {

            if (!isOpen()) return;

            var rect   = input.getBoundingClientRect(),
                height = list.offsetHeight,
                top    = rect.bottom + 2;

            list.style.minWidth = Math.max(170, rect.width) + 'px';
            if (top + height > window.innerHeight - 4 && rect.top - height - 2 > 4) {
                top = rect.top - height - 2;
            }
            list.style.left = Math.max(4, Math.min(window.innerWidth - list.offsetWidth - 4, rect.left)) + 'px';
            list.style.top  = Math.max(4, top) + 'px';

        }

        function open() {
            if (!element.isConnected || busy) return;
            renderList();
            // Nothing to offer (every tag added, and no way to make or manage more).
            if (!list.children.length) { close(); return; }
            if (!isOpen()) {
                list.showPopover();
                input.setAttribute('aria-expanded', 'true');
                window.addEventListener('scroll', place, true);
                window.addEventListener('resize', place);
            }
            place();
        }

        function close() {
            if (isOpen()) list.hidePopover();
            input.setAttribute('aria-expanded', 'false');
            input.removeAttribute('aria-activedescendant');
            window.removeEventListener('scroll', place, true);
            window.removeEventListener('resize', place);
            problem = '';
        }

        function choose(id) {
            input.value = '';
            problem = '';
            if (selected().indexOf(id) === -1) options.onAdd(id);
            refresh();
            if (document.activeElement === input) open();
        }

        function createTag(label) {
            busy = true;
            input.disabled = true;
            close();
            TagModel.addTag(label).then(function(id) {
                busy = false;
                input.disabled = false;
                input.focus();
                choose(id);
            }, function(error) {
                busy = false;
                input.disabled = false;
                input.focus();
                console.warn('FrameTrail: the tag could not be created:', error && error.message);
                problem = labels['TagErrorCreateFailed'];
                open();
            });
        }

        function refresh() {
            renderChips();
            if (isOpen()) {
                renderList();
                if (list.children.length) { place(); } else { close(); }
            }
        }


        input.addEventListener('focus', open);
        input.addEventListener('click', open);
        input.addEventListener('input', function() { problem = ''; open(); });
        input.addEventListener('blur', function() {
            // After a click on the list, which keeps the focus here.
            setTimeout(function() { if (document.activeElement !== input) close(); }, 0);
        });

        input.addEventListener('keydown', function(evt) {

            switch (evt.key) {
                case 'ArrowDown':
                case 'ArrowUp':
                    evt.preventDefault();
                    if (!isOpen()) { open(); return; }
                    if (!choices.length) return;
                    var step = (evt.key === 'ArrowDown') ? 1 : -1;
                    setFocused(focused < 0 ? (step > 0 ? 0 : choices.length - 1) : (focused + step + choices.length) % choices.length);
                    break;
                case 'Enter':
                    evt.preventDefault();
                    if (isOpen() && focused >= 0 && choices[focused]) choices[focused].choose();
                    break;
                case 'Escape':
                    // Closes the list, not the dialog around it.
                    if (isOpen() || input.value) {
                        evt.preventDefault();
                        evt.stopPropagation();
                        input.value = '';
                        close();
                    }
                    break;
                case 'Backspace':
                    if (!input.value && selected().length) {
                        evt.preventDefault();
                        options.onRemove(selected()[selected().length - 1]);
                        refresh();
                    }
                    break;
                case 'Tab':
                    close();
                    break;
            }

        });

        // Labels change when the definitions do, here or in another picker.
        var unsubscribe = TagModel.subscribe(function() {
            if (!element.isConnected) {
                if (seenConnected) { close(); unsubscribe(); }
                return;
            }
            seenConnected = true;
            refresh();
        });

        renderChips();

        return { element: element, refresh: refresh };

    }


    return {
        create: create
    };

});
