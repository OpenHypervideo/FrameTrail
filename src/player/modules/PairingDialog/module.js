/**
 * @module Player
 */


/**
 * I am the PairingDialog: the QR code a phone scans to pair with the player,
 * the link it holds, who is paired and whether that phone may control
 * playback (docs/PAIRING.md). The pairing itself is the PairingHost's; it
 * goes on when I am closed, and the pairing button opens me again.
 *
 * @class PairingDialog
 * @static
 */

FrameTrail.defineModule('PairingDialog', function(FrameTrail){

    var labels = FrameTrail.module('Localization').labels;

    var dialogCtrl = null,
        elements   = null,
        shownLink  = null;


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
                          + '        <div class="pairingGuest">'
                          + '            <div class="checkboxRow mt-1"><label class="switch"><input type="checkbox" id="pairingAllowControl" class="pairingAllowControl"><span class="slider round"></span></label><label for="pairingAllowControl">'+ labels['PairingAllowControl'] +'</label></div>'
                          + '        </div>'
                          + '    </div>'
                          + '</div>';

        elements = {
            code:       content.querySelector('.pairingCode'),
            side:       content.querySelector('.pairingSide'),
            status:     content.querySelector('.pairingStatus'),
            invitation: content.querySelector('.pairingInvitation'),
            link:       content.querySelector('.pairingLink'),
            guest:      content.querySelector('.pairingGuest'),
            control:    content.querySelector('.pairingAllowControl')
        };

        elements.link.addEventListener('click', function() { this.select(); });

        elements.control.addEventListener('change', function() {
            FrameTrail.module('PairingHost').setCanControl(this.checked);
        });

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
                dialogCtrl = null;
                elements   = null;
                shownLink  = null;
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
            showProblem(error.code);
        });
    }

    function showProblem(code) {
        if (!elements) { return; }
        var text = code ? labels['PairingError' + code.charAt(0).toUpperCase() + code.slice(1)] : '';
        elements.message.textContent = text || '';
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

        var name      = (pairing.guest && pairing.guest.label) || labels['PairingPhone'],
            inviting  = (pairing.status === 'waiting' || pairing.status === 'reconnecting' || pairing.status === 'connecting'),
            statusText = {
                off:          '',
                opening:      labels['PairingStatusOpening'],
                waiting:      labels['PairingStatusWaiting'],
                connecting:   labels['PairingStatusConnecting'].replace('%s', escapeHTML(name)),
                connected:    labels['PairingStatusConnected'].replace('%s', escapeHTML(name)),
                reconnecting: labels['PairingStatusReconnecting'].replace('%s', escapeHTML(name))
            }[pairing.status] || '';

        if (pairing.status === 'connected' && pairing.guest && pairing.guest.path) {
            statusText += ' <span class="pairingPath">(' + labels['PairingPath' + pairing.guest.path.charAt(0).toUpperCase() + pairing.guest.path.slice(1)] + ')</span>';
        }

        elements.status.innerHTML = statusText ? '<div class="message active' + (pairing.status === 'connected' ? ' success' : '') + '">' + statusText + '</div>' : '';

        if (pairing.link && inviting) {
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

        elements.guest.style.display = (pairing.status === 'connected' && pairing.guest) ? '' : 'none';
        elements.control.checked = !!(pairing.guest && pairing.guest.canControl);

        elements.stop.style.display = (pairing.status === 'off') ? 'none' : '';

        showProblem(pairing.problem);

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
