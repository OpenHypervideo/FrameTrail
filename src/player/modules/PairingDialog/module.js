/**
 * @module Player
 */


/**
 * I am the PairingDialog: the QR code phones scan to pair with the player,
 * the link it holds, and the phones that are paired: which of them may
 * control playback, and a way to let one go (docs/PAIRING.md). The pairing
 * itself is the PairingHost's; it goes on when I am closed, and the pairing
 * button opens me again.
 *
 * @class PairingDialog
 * @static
 */

FrameTrail.defineModule('PairingDialog', function(FrameTrail){

    var labels = FrameTrail.module('Localization').labels;

    var dialogCtrl  = null,
        elements    = null,
        shownLink   = null,
        shownPhones = null;


    function escapeHTML(text) {
        return String(text == null ? '' : text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }

    /**
     * A QR code as SVG, dark on white whatever the theme, with the quiet
     * zone scanners need.
     *
     * @method qrCode
     * @param {String} text
     * @return {String} SVG markup
     */
    function qrCode(text) {
        var qr     = qrcodegen.QrCode.encodeText(text, qrcodegen.QrCode.Ecc.MEDIUM),
            border = 4,
            size   = qr.size + border * 2,
            path   = '';
        for (var y = 0; y < qr.size; y++) {
            for (var x = 0; x < qr.size; x++) {
                if (qr.getModule(x, y)) { path += 'M' + x + ' ' + y + 'h1v1h-1z'; }
            }
        }
        return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="' + (-border) + ' ' + (-border) + ' ' + size + ' ' + size + '" shape-rendering="crispEdges" role="img" aria-label="QR code">'
             + '<rect x="' + (-border) + '" y="' + (-border) + '" width="' + size + '" height="' + size + '" fill="#fff"/>'
             + '<path d="' + path + '" fill="#000"/></svg>';
    }


    /**
     * I open the dialog and, unless a room is open already, ask the
     * PairingHost to open one.
     *
     * @method open
     */
    function open() {

        var Host = FrameTrail.module('PairingHost');

        if (!Host) { return; }

        if (dialogCtrl) {
            render(Host.status);
            if (Host.status.status === 'off') { startHost(); }
            return;
        }

        var content = document.createElement('div');
        content.className = 'pairingDialog';
        content.innerHTML = '<div class="layoutRow">'
                          + '    <div class="column-5 pairingCode"></div>'
                          + '    <div class="column-7 pl-1 pairingSide">'
                          + '        <div class="pairingStatus"></div>'
                          + '        <div class="pairingInvitation">'
                          + '            <div class="fieldHint">'+ labels['PairingHint'] +'</div>'
                          + '            <label class="mt-1" for="pairingLink">'+ labels['PairingLink'] +'</label>'
                          + '            <input type="text" id="pairingLink" class="pairingLink" readonly>'
                          + '        </div>'
                          + '        <div class="userList pairingPhones mt-1"></div>'
                          + '    </div>'
                          + '</div>';

        elements = {
            code:       content.querySelector('.pairingCode'),
            side:       content.querySelector('.pairingSide'),
            status:     content.querySelector('.pairingStatus'),
            invitation: content.querySelector('.pairingInvitation'),
            link:       content.querySelector('.pairingLink'),
            phones:     content.querySelector('.pairingPhones')
        };

        elements.link.addEventListener('click', function() { this.select(); });

        dialogCtrl = Dialog({
            title:        labels['PairingTitle'],
            icon:         'icon-mobile-1',
            content:      content,
            inheritTheme: document.querySelector(FrameTrail.getState('target')),
            modal:        true,
            resizable:    false,
            width:        620,
            close: function() {
                dialogCtrl.destroy();
                dialogCtrl  = null;
                elements    = null;
                shownLink   = null;
                shownPhones = null;
            },
            buttons: [
                { text: labels['PairingStop'], class: 'pairingStopButton', click: function() {
                    FrameTrail.module('PairingHost').close();
                    dialogCtrl.close();
                } },
                { text: labels['GenericClose'], click: function() { dialogCtrl.close(); } }
            ]
        });

        var buttonPane = dialogCtrl.widget().querySelector('.ft-dialog-buttonpane');
        elements.message = document.createElement('div');
        elements.message.className = 'message';
        elements.message.style.flexBasis = '100%';
        buttonPane.prepend(elements.message);
        elements.stop = buttonPane.querySelector('.pairingStopButton');

        render(Host.status);

        if (Host.status.status === 'off') { startHost(); }

    }

    // A room for a phone; what is missing, if it cannot be opened.
    function startHost() {
        var Host = FrameTrail.module('PairingHost');
        Host.open().catch(function(error) {
            if (error.code === 'stopped') { return; }
            render(Host.status);
            showProblem(error.code, Host.status.status);
        });
    }

    // What went wrong, in words for whoever is at the player; the PairingHost tells the reason in the console.
    function showProblem(code, status) {
        if (!elements) { return; }
        var text = !code                  ? ''
                 : code === 'noHypervideo' ? labels['PairingErrorNoHypervideo']
                 : code === 'noWebRTC'     ? labels['PairingErrorNoWebRTC']
                 // While the room is open the paired phones go on, only new ones cannot join.
                 : status === 'open'       ? labels['PairingErrorInterrupted']
                 : labels['PairingErrorUnavailable'];
        elements.message.textContent = text;
        elements.message.className = 'message' + (text ? ' active error' : '');
    }

    /**
     * I show the PairingHost's status (the state "pairing").
     *
     * @method render
     * @param {Object} pairing
     */
    function render(pairing) {

        if (!elements || !pairing) { return; }

        var phones     = pairing.phones || [],
            open       = (pairing.status === 'open'),
            statusText = '';

        if (pairing.status === 'opening') {
            statusText = labels['PairingStatusOpening'];
        } else if (open) {
            statusText = (pairing.connected === 0) ? labels['PairingStatusWaiting']
                       : (pairing.connected === 1) ? labels['PairingStatusPairedOne']
                       : labels['PairingStatusPairedMany'].replace('%s', pairing.connected);
            var taking = phones.filter(function(phone) { return phone.status !== 'reconnecting'; }).length;
            if (taking >= pairing.max) { statusText += ' (' + labels['PairingStatusFull'] + ')'; }
        }

        elements.status.innerHTML = statusText ? '<div class="message active' + (pairing.connected ? ' success' : '') + '">' + escapeHTML(statusText) + '</div>' : '';

        if (pairing.link && open) {
            if (shownLink !== pairing.link) {
                elements.code.innerHTML = qrCode(pairing.link);
                elements.link.value = pairing.link;
                shownLink = pairing.link;
            }
            elements.code.style.display = '';
            elements.invitation.style.display = '';
        } else {
            elements.code.style.display = (pairing.status === 'opening') ? '' : 'none';
            if (pairing.status === 'opening') { elements.code.innerHTML = '<div class="pairingCodePlaceholder"></div>'; shownLink = null; }
            elements.invitation.style.display = 'none';
        }

        // Without the code beside it, the status takes the whole width.
        var codeShown = (elements.code.style.display !== 'none');
        elements.side.classList.toggle('column-7', codeShown);
        elements.side.classList.toggle('pl-1', codeShown);
        elements.side.classList.toggle('column-12', !codeShown);

        renderPhones(phones);

        elements.stop.style.display = (pairing.status === 'off') ? 'none' : '';

        showProblem(pairing.problem, pairing.status);

    }

    /**
     * I list the phones: number and device, whether each may control playback
     * (a switch) and a button that lets it go.
     *
     * @method renderPhones
     * @param {Array} phones the snapshot's phones
     */
    function renderPhones(phones) {

        var key = JSON.stringify(phones);

        if (key === shownPhones) { return; }
        shownPhones = key;

        var list = elements.phones,
            Host = FrameTrail.module('PairingHost');

        list.innerHTML = '';
        list.style.display = phones.length ? '' : 'none';

        phones.forEach(function(phone) {

            var _tw = document.createElement('div');
            _tw.innerHTML = '<div class="userListItem">'
                + '    <div class="userListInfo">'
                + '        <div class="userListName"></div>'
                + '        <div class="userListMeta"></div>'
                + '    </div>'
                + '    <div class="userListActions">'
                + '        <label class="switch" title="'+ labels['PairingAllowControl'] +'"><input type="checkbox" aria-label="'+ labels['PairingAllowControl'] +'"><span class="slider round"></span></label>'
                + '        <button type="button" class="pairingDisconnectButton" title="'+ labels['PairingDisconnect'] +'"><span class="icon-cancel"></span></button>'
                + '    </div>'
                + '</div>';
            var item    = _tw.firstElementChild,
                control = item.querySelector('.switch'),
                meta    = [];

            if (phone.status !== 'connected') { item.classList.add('inactive'); }

            if (phone.status === 'connecting') {
                meta.push(labels['PairingPhoneConnecting']);
            } else {
                if (phone.status === 'reconnecting') { meta.push(labels['PairingPhoneReconnecting']); }
                meta.push(phone.canControl ? labels['PairingPhoneControls'] : labels['PairingPhoneWatches']);
            }

            // textContent, not interpolation: the device label comes from the phone.
            item.querySelector('.userListName').textContent = (phone.number ? phone.number + ' · ' : '') + (phone.label || labels['PairingPhone']);
            item.querySelector('.userListMeta').textContent = meta.join('  ·  ');

            // Whether a phone may control is decided when it has paired.
            if (phone.status === 'connecting') {
                control.style.display = 'none';
            } else {
                control.querySelector('input').checked = !!phone.canControl;
                control.querySelector('input').addEventListener('change', function() {
                    Host.setCanControl(phone.id, this.checked);
                });
            }

            item.querySelector('.pairingDisconnectButton').addEventListener('click', function() {
                Host.disconnect(phone.id);
            });

            list.appendChild(item);

        });

    }

    return {

        onChange: {
            pairing: render
        },

        open: open,

        /**
         * Whether the dialog is open.
         * @attribute isOpen
         * @readOnly
         */
        get isOpen() { return !!dialogCtrl; }

    };

});
