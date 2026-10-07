/*
 * Hello — a minimal FrameTrail extension.
 *
 * It takes each of the places an extension can have in the interface — a side
 * panel, a button in the title bar and an edit mode — and follows the
 * lifecycle: the panel names the hypervideo that is open and the edit mode,
 * and counts how often a hypervideo has been loaded. See docs/EXTENDING.md,
 * "Writing an Extension".
 *
 * In server mode the panel can also ask Hello's server part (server/ in this
 * folder) for an answer: an action of its own, added to FrameTrail's backend
 * without changing it. See docs/EXTENDING.md, "Server Extensions".
 *
 * Installing it on a FrameTrail installation: copy this folder to
 * extensions/hello/ next to index.html (and server/ to _server/extensions/hello/
 * for the server part), and list it in _data/config.json:
 *
 *     "extensions": [
 *         {
 *             "name": "hello",
 *             "script": "extensions/hello/hello.js",
 *             "style": "extensions/hello/hello.css",
 *             "settings": { "greeting": "Hello there" }
 *         }
 *     ]
 *
 * Or include this script in a page of your own and name the extension in the
 * extensions init option, as index.html in this folder does.
 */

FrameTrail.registerExtension('hello', function(FrameTrail) {

    var Localization = FrameTrail.module('Localization'),
        labels       = Localization.labels;

    // An extension brings its own labels, prefixed with its name. Languages
    // it has no labels for show the English ones.
    Localization.addLabels({
        en: {
            HelloEditHint:      'This edit mode only reads the hypervideo.',
            HelloEditMode:      'Edit mode',
            HelloHypervideo:    'Hypervideo',
            HelloItemCounts:    'Overlays: %o · Chapters: %c',
            HelloLoads:         'Hypervideos loaded',
            HelloNone:          'none',
            HelloPing:          'Ask the server',
            HelloPingAnswer:    '%g, %u! Asked %n times.',
            HelloPingMissing:   'The server part is not installed.',
            HelloSayHello:      'Say hello',
            HelloStranger:      'stranger',
            HelloTitle:         'Hello'
        },
        de: {
            HelloEditHint:      'Dieser Bearbeitungsmodus liest das Hypervideo nur.',
            HelloEditMode:      'Bearbeitungsmodus',
            HelloHypervideo:    'Hypervideo',
            HelloItemCounts:    'Overlays: %o · Kapitel: %c',
            HelloLoads:         'Geladene Hypervideos',
            HelloNone:          'keiner',
            HelloPing:          'Den Server fragen',
            HelloPingAnswer:    '%g, %u! %n-mal gefragt.',
            HelloPingMissing:   'Der Serverteil ist nicht installiert.',
            HelloSayHello:      'Hallo sagen',
            HelloStranger:      'Gast',
            HelloTitle:         'Hallo'
        }
    });

    var greeting = 'Hello',
        loads    = 0,
        content  = null;    // the side panel's content element


    function row(label, value) {

        var element = document.createElement('p'),
            strong  = document.createElement('strong');

        strong.textContent = label + ': ';
        element.append(strong, document.createTextNode(value));

        return element;

    }


    // The server part's action, through the same helper FrameTrail's modules
    // use: it adds the dataPath, so the server finds this instance's data.
    function ping(answer) {

        FrameTrail.module('StorageManager').serverPost(new URLSearchParams({ a: 'helloPing' }))
            .then(function(response) {
                // Without the server part FrameTrail answers an unknown action
                // with a success that has no response.
                if (!response || !response.response) {
                    answer.textContent = labels['HelloPingMissing'];
                    return;
                }
                answer.textContent = labels['HelloPingAnswer']
                    .replace('%g', response.response.greeting)
                    .replace('%u', response.response.user || labels['HelloStranger'])
                    .replace('%n', response.response.pings);
            })
            .catch(function(error) {
                answer.textContent = String(error);
            });

    }


    function render() {

        if (!content) return;

        var HypervideoModel = FrameTrail.module('HypervideoModel'),
            inVideo         = FrameTrail.getState('viewMode') === 'video',
            editMode        = FrameTrail.getState('editMode');

        var title = document.createElement('p');
        title.className = 'helloGreeting';
        title.textContent = greeting;

        content.innerHTML = '';
        content.append(
            title,
            row(labels['HelloHypervideo'], (inVideo && HypervideoModel) ? HypervideoModel.hypervideoName : '—'),
            row(labels['HelloEditMode'], editMode ? editMode : labels['HelloNone']),
            row(labels['HelloLoads'], String(loads))
        );

        if (FrameTrail.getState('storageMode') === 'server') {
            var button = document.createElement('button'),
                answer = document.createElement('p');
            button.type = 'button';
            button.textContent = labels['HelloPing'];
            button.addEventListener('click', function() { ping(answer); });
            content.append(button, answer);
        }

    }


    return {

        // Once, after loading. settings is this extension's entry in the
        // config (or the init option), passed on untouched.
        init: function(settings) {
            if (settings && typeof settings.greeting === 'string') {
                greeting = settings.greeting;
            }
        },

        // Once, when the interface is up.
        onReady: function() {
            render();
        },

        // Whenever a hypervideo has been loaded: the first, one the user
        // switched to, and the same one reloaded.
        onHypervideoChange: function(hypervideoID) {
            loads++;
            render();
        },

        // State changes, like a module's onChange; called after FrameTrail's
        // own modules have handled them.
        onChange: {
            editMode: render,
            viewMode: render
        },

        // When the instance is destroyed. FrameTrail removes the slots.
        onUnload: function() {
            content = null;
        },

        slots: {

            // A panel docked beside the player, opened from the title bar.
            sidePanel: {
                label:  labels['HelloTitle'],
                icon:   'icon-comment',
                when:   'edit',
                width:  300,
                create: function(container, panel) {
                    content = container;
                    render();
                }
            },

            // A button in the title bar, shown while not editing.
            titlebarAction: {
                label:   labels['HelloSayHello'],
                icon:    'icon-chat',
                when:    'view',
                onClick: function() {
                    FrameTrail.module('InterfaceModal').showStatusMessage(greeting + '!');
                    FrameTrail.module('InterfaceModal').hideMessage(2000);
                }
            },

            // An edit mode of its own. It writes nothing, so it is open to
            // everyone editing and takes no collaboration lock.
            editPanel: {
                label:           labels['HelloTitle'],
                icon:            'icon-comment',
                editsHypervideo: false,
                enter: function(panel) {
                    var HypervideoModel = FrameTrail.module('HypervideoModel'),
                        hint            = document.createElement('div'),
                        counts          = document.createElement('p');

                    hint.className = 'message active';
                    hint.textContent = labels['HelloEditHint'];

                    counts.textContent = labels['HelloItemCounts']
                        .replace('%o', HypervideoModel.overlays.length)
                        .replace('%c', HypervideoModel.chapters.length);

                    panel.add.append(hint, counts);
                },
                leave: function() {
                    // Nothing to stop. FrameTrail empties the panel for the next mode.
                }
            }

        }

    };

});
