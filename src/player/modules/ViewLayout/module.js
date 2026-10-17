/**
 * @module Player
 */


/**
 * I am the ViewLayout. I manage the layout areas wich contain ContentViews.
 *
 * @class ViewLayout
 * @static
 */



FrameTrail.defineModule('ViewLayout', function(FrameTrail){

    var labels = FrameTrail.module('Localization').labels;

    /**
     * I build the schematic preview markup for a ContentView type.
     *
     * I am the single source of truth for these previews. Three callers render
     * through me: the type palette of the Layout Manager (below), the preview
     * element of a placed ContentView, and the type/size option cards in the
     * ContentView settings dialog. The latter two live in the ContentView type
     * and reach me via FrameTrail.module('ViewLayout').generateSchematic().
     *
     * @method generateSchematic
     * @param {String} type - ContentView type ('TimedContent', 'CustomHTML', 'Transcript', 'Timelines', 'Chapters')
     * @param {String} size - 'small', 'medium' or 'large'
     * @param {String} axis - 'x' for the top/bottom areas, 'y' for left/right
     * @param {Boolean} thumbnail - Draw a single representative item instead of a full set
     * @param {Number} maxCards - Optional upper bound on the number of items drawn
     * @return {HTMLElement}
     */
    function generateSchematic(type, size, axis, thumbnail, maxCards) {
        var isHorizontal = (axis === 'x'),
            schematic = document.createElement('div');
        schematic.className = 'schematicPreview';

        switch (type) {

            case 'TimedContent':
                var cardClass = (thumbnail || !isHorizontal) ? 'schematicCard vertical' : 'schematicCard';
                var cardCount = thumbnail ? 1 : (isHorizontal
                    ? ((size == 'small') ? 5 : (size == 'medium') ? 4 : 3)
                    : ((size == 'small') ? 5 : (size == 'medium') ? 3 : 1));
                if (maxCards) cardCount = Math.min(cardCount, maxCards);
                for (var i = 0; i < cardCount; i++) {
                    var card = document.createElement('div');
                    card.className = cardClass;
                    card.setAttribute('data-size', size);
                    card.insertAdjacentHTML('beforeend', '<div class="schematicThumb"></div>');
                    if (size == 'medium' || size == 'large') {
                        card.insertAdjacentHTML('beforeend', '<div class="schematicTitle"></div>');
                    }
                    if (size == 'large') {
                        card.insertAdjacentHTML('beforeend', '<div class="schematicBody"><div class="schematicLine"></div><div class="schematicLine short"></div></div>');
                    }
                    if (thumbnail || i === (isHorizontal ? 1 : 0)) card.classList.add('active');
                    schematic.appendChild(card);
                }
                break;

            case 'CustomHTML':
                var container = document.createElement('div');
                container.className = 'schematicCustomHTML';
                container.innerHTML = '<p>Custom HTML content area</p>'
                    + '<p><span class="schematicHighlight">time-based element</span> with interactive text</p>'
                    + '<p>Additional content goes here...</p>';
                schematic.appendChild(container);
                break;

            case 'Transcript':
                var container = document.createElement('div');
                container.className = 'schematicTranscript';
                container.innerHTML = '<span>Welcome</span> '
                    + '<span>to</span> '
                    + '<span>this</span> '
                    + '<span class="active">video.</span> '
                    + '<span class="active">Here</span> '
                    + '<span class="active">we</span> '
                    + '<span>explore</span> '
                    + '<span>the</span> '
                    + '<span>topic</span> '
                    + '<span>in</span> '
                    + '<span>detail.</span> '
                    + '<span>Each</span> '
                    + '<span>word</span> '
                    + '<span>syncs</span> '
                    + '<span>with</span> '
                    + '<span>the</span> '
                    + '<span>video</span> '
                    + '<span>timeline.</span>';
                schematic.appendChild(container);
                break;

            case 'Timelines':
                var container = document.createElement('div');
                container.className = 'schematicTimelines';
                var rows = [
                    { label: 'User 1', offset: '10%', width: '35%' },
                    { label: 'User 1', offset: '55%', width: '20%' },
                    { label: 'User 2', offset: '5%',  width: '25%' },
                    { label: 'User 2', offset: '40%', width: '40%' },
                    { label: 'User 3', offset: '20%', width: '50%' }
                ];
                var currentLabel = '';
                var row;
                for (var i = 0; i < rows.length; i++) {
                    if (rows[i].label !== currentLabel) {
                        currentLabel = rows[i].label;
                        row = document.createElement('div');
                        row.className = 'schematicTimelineRow';
                        row.insertAdjacentHTML('beforeend', '<span class="schematicTimelineLabel">'+ rows[i].label +'</span>');
                        row.insertAdjacentHTML('beforeend', '<div class="schematicTimelineTrack"></div>');
                        container.appendChild(row);
                    }
                    row.querySelector('.schematicTimelineTrack').insertAdjacentHTML('beforeend',
                        '<div class="schematicTimelineBar" style="left:'+ rows[i].offset +';width:'+ rows[i].width +'"></div>'
                    );
                }
                schematic.appendChild(container);
                break;

            case 'Chapters':
                // Two shapes, matching the real cards: a poster card (thumb above the
                // text) in the horizontal areas, a list row (thumb beside it) in the
                // vertical ones. "vertical" is the card's own box in the schematic
                // (full width rather than floated); "rowLayout" is its inner direction.
                var chapterClass = 'schematicChapterCard'
                    + ((thumbnail || !isHorizontal) ? ' vertical' : '')
                    + (isHorizontal ? '' : ' rowLayout');
                var chapterCount = thumbnail ? 1 : (isHorizontal
                    ? ((size == 'small') ? 4 : (size == 'medium') ? 3 : 2)
                    : ((size == 'small') ? 6 : (size == 'medium') ? 4 : 3));
                if (maxCards) chapterCount = Math.min(chapterCount, maxCards);
                for (var i = 0; i < chapterCount; i++) {
                    var chapterCard = document.createElement('div');
                    chapterCard.className = chapterClass;
                    chapterCard.setAttribute('data-size', size);
                    if (size == 'medium' || size == 'large') {
                        chapterCard.insertAdjacentHTML('beforeend', '<div class="schematicChapterThumb"></div>');
                    }
                    chapterCard.insertAdjacentHTML('beforeend',
                        '<div class="schematicChapterText">'
                      + '    <div class="schematicChapterTime"></div>'
                      + '    <div class="schematicChapterTitle"></div>'
                      + '</div>');
                    if (thumbnail || i === (isHorizontal ? 1 : 0)) chapterCard.classList.add('active');
                    schematic.appendChild(chapterCard);
                }
                break;
        }

        return schematic;
    }

    // The layout areas: my name of each (a content view's whichArea), its key in config.layoutArea and its part of
    // ViewVideo's element names (Area<cap>Container). The companion area holds the views shown on a phone paired
    // with the player (see PairingHost); in the player its container stays hidden, the layout editor shows it as
    // a phone. On the phone (the companion state) it is the only area with views, and its container is the right
    // area's (ViewVideo.AreaCompanionContainer), so its views are laid out like the right area's.
    var AREAS = [
        { name: 'top',       key: 'areaTop',       cap: 'Top'       },
        { name: 'bottom',    key: 'areaBottom',    cap: 'Bottom'    },
        { name: 'left',      key: 'areaLeft',      cap: 'Left'      },
        { name: 'right',     key: 'areaRight',     cap: 'Right'     },
        { name: 'companion', key: 'areaCompanion', cap: 'Companion' }
    ];

    var configLayoutArea,

        // The content views of each area, by its name.
        contentViews        = { top: [], bottom: [], left: [], right: [], companion: [] },

        managedAnnotations  = [],
        managedOverlays     = [],

        HypervideoLayoutContainer = FrameTrail.module('ViewVideo').HypervideoLayoutContainer,
        Hypervideo = FrameTrail.module('Database').hypervideo;


    function areaByName(whichArea) {
        for (var i = 0; i < AREAS.length; i++) {
            if (AREAS[i].name === whichArea) { return AREAS[i]; }
        }
        throw new Error('whichArea is string top/bottom/left/right/companion');
    }

    function allContentViews() {
        return AREAS.reduce(function(list, area) { return list.concat(contentViews[area.name]); }, []);
    }

    function create() {

        configLayoutArea = FrameTrail.module('Database').hypervideo.config.layoutArea;

        var companion = !!FrameTrail.getState('companion');

        // A phone shows the companion area's views and nothing else; with none, nothing (what a phone shows is set on purpose).
        AREAS.forEach(function(area) {
            var views = (companion && area.name !== 'companion') ? [] : (configLayoutArea[area.key] || []);
            for (var i = 0; i < views.length; i++) {
                contentViews[area.name].push(new FrameTrail.newObject('ContentView', views[i], area.name));
            }
        });

        // A phone opens on its first view. Each view activates itself as it is appended, which leaves the last one shown.
        if (contentViews.companion.length) {
            contentViews.companion[0].activateContentView();
        }

        updateLayoutAreaVisibility();

        updateHiddenTabs();

        updateManagedContent();

    }


    function updateLayoutAreaVisibility() {

        FrameTrail.changeState('hv_config_areaTopVisible', (contentViews.top.length != 0));
        FrameTrail.changeState('hv_config_areaBottomVisible', (contentViews.bottom.length != 0));
        FrameTrail.changeState('hv_config_areaLeftVisible', (contentViews.left.length != 0));
        // On the phone the right area's container holds the companion area's views.
        FrameTrail.changeState('hv_config_areaRightVisible', (contentViews.right.length != 0)
            || (!!FrameTrail.getState('companion') && contentViews.companion.length != 0));

    }


    function updateHiddenTabs() {

        var ViewVideo = FrameTrail.module('ViewVideo');

        AREAS.forEach(function(area) {
            var views = contentViews[area.name],
                container = ViewVideo['Area' + area.cap + 'Container'];
            var shouldHide = (views.length === 1
                && !views[0].contentViewData.name
                && !views[0].contentViewData.icon);

            if (container) {
                container.classList.toggle('hiddenTabs', shouldHide);
            }

            // Also update layout manager preview area
            var previewArea = HypervideoLayoutContainer.querySelector('.layoutArea[data-area="' + area.key + '"]');
            if (previewArea) {
                previewArea.classList.toggle('hiddenTabs', shouldHide);
            }
        });

    }


    function createContentView(whichArea, templateContentViewData, renderPreview, skipUndo) {

        var area = areaByName(whichArea),
            arrayOfContentViews = contentViews[area.name];

        var newContentView = new FrameTrail.newObject('ContentView', templateContentViewData, whichArea)

        arrayOfContentViews.push(newContentView);

        // The companion area is often not stored yet: its first view makes it.
        if (!Array.isArray(configLayoutArea[area.key])) {
            configLayoutArea[area.key] = [];
        }
        configLayoutArea[area.key].push(newContentView.contentViewData);

        updateManagedContent();

        if (renderPreview) {
            newContentView.renderContentViewPreview(true);
        }

        updateLayoutAreaVisibility();
        updateHiddenTabs();

        return newContentView;

    }


    function removeContentView(contentViewToRemove, skipUndo) {

        // Capture data before removal for undo
        var contentViewData = JSON.parse(JSON.stringify(contentViewToRemove.contentViewData)),
            whichArea = contentViewToRemove.whichArea,
            area = areaByName(whichArea);

        var layoutAreaToRemovefrom = contentViews[area.name];

        // Also remove from config
        var configIndex = (configLayoutArea[area.key] || []).indexOf(contentViewToRemove.contentViewData);
        if (configIndex > -1) {
            configLayoutArea[area.key].splice(configIndex, 1);
        }

        contentViewToRemove.contentCollection.forEach(function(contentItem) {
            contentViewToRemove.removeContentCollectionElements(contentItem);
        });
        contentViewToRemove.removeDOMElement();

        layoutAreaToRemovefrom.splice(
            layoutAreaToRemovefrom.indexOf(contentViewToRemove),
            1
        );

        updateManagedContent();

        updateLayoutAreaVisibility();
        updateHiddenTabs();

        FrameTrail.module('HypervideoModel').newUnsavedChange('layout');

        // Register undo command
        if (!skipUndo) {
            var labels = FrameTrail.module('Localization').labels;
            FrameTrail.module('UndoManager').register({
                category: 'layout',
                description: labels['SidebarLayout'] + ' ' + labels['GenericDelete'],
                undo: function() {
                    var restoredContentView = createContentView(whichArea, contentViewData, true, true);
                    FrameTrail.module('HypervideoModel').newUnsavedChange('layout');
                },
                redo: function() {
                    // Find the content view by matching data
                    var contentViewsArray = contentViews[whichArea];
                    for (var i = 0; i < contentViewsArray.length; i++) {
                        if (JSON.stringify(contentViewsArray[i].contentViewData) === JSON.stringify(contentViewData)) {
                            removeContentView(contentViewsArray[i], true);
                            break;
                        }
                    }
                }
            });
        }

    }


    /**
     * I replace the content views of a layout area with new ones made from their data, and return the data of the ones I removed. In the layout editor the preview follows.
     *
     * @method setContentViews
     * @param {String} whichArea - top, bottom, left, right or companion
     * @param {Array} contentViewsData
     * @return {Array}
     */
    function setContentViews(whichArea, contentViewsData) {

        var arrayOfContentViews = contentViews[areaByName(whichArea).name];

        var previous = arrayOfContentViews.map(function(contentView) {
            return JSON.parse(JSON.stringify(contentView.contentViewData));
        });

        arrayOfContentViews.slice().forEach(function(contentView) {
            removeContentView(contentView, true);
        });

        contentViewsData.forEach(function(contentViewData) {
            createContentView(whichArea, JSON.parse(JSON.stringify(contentViewData)), false, true);
        });

        var editMode = FrameTrail.getState('editMode');

        if (editMode === 'layout') {
            initLayoutManager();
        } else if (editMode && editMode !== 'preview') {
            // The other editors hide the layout areas; a change of an area's visibility must not show it.
            var ViewVideo = FrameTrail.module('ViewVideo');
            [ViewVideo.AreaTopContainer, ViewVideo.AreaTopDetails, ViewVideo.AreaBottomContainer,
             ViewVideo.AreaBottomDetails, ViewVideo.AreaLeftContainer, ViewVideo.AreaRightContainer].forEach(function(element) {
                if (element) { element.style.display = 'none'; }
            });
        }

        updateTimedStateOfContentViews(FrameTrail.module('HypervideoController').currentTime);

        FrameTrail.module('HypervideoModel').newUnsavedChange('layout');

        return previous;

    }


    function reorderContentView(whichArea, oldIndex, newIndex, updatePreviewDOM) {

        if (oldIndex === newIndex) { return; }

        var area    = areaByName(whichArea),
            areaKey = area.key,
            areaCap = area.cap;

        var contentViewsArray = contentViews[area.name];

        // Update JS arrays
        var movedCV = contentViewsArray.splice(oldIndex, 1)[0];
        contentViewsArray.splice(newIndex, 0, movedCV);
        var movedData = configLayoutArea[areaKey].splice(oldIndex, 1)[0];
        configLayoutArea[areaKey].splice(newIndex, 0, movedData);

        // Reorder real ViewVideo DOM elements (appendChild moves existing nodes)
        var ViewVideo       = FrameTrail.module('ViewVideo');
        var areaContainer   = ViewVideo['Area' + areaCap + 'Container'];
        var realTabsCont    = areaContainer.querySelector('.layoutAreaTabs');
        var realContentCont = areaContainer.querySelector('.layoutAreaContent');
        var realDetailsCont = ViewVideo['Area' + areaCap + 'Details'];

        contentViewsArray.forEach(function(cv) {
            realTabsCont.appendChild(cv.contentViewTab);
            realContentCont.appendChild(cv.contentViewContainer);
            if (cv.contentViewDetailsContainer && realDetailsCont) {
                realDetailsCont.appendChild(cv.contentViewDetailsContainer);
            }
        });

        // Reorder LayoutManager preview DOM (Sortable handles it on drag; needed for undo/redo)
        if (updatePreviewDOM) {
            var previewArea = ViewVideo.HypervideoLayoutContainer
                .querySelector('.layoutArea[data-area="' + areaKey + '"]');
            if (previewArea) {
                var pTabsCont    = previewArea.querySelector('.layoutAreaTabs');
                var pContentCont = previewArea.querySelector('.layoutAreaContent');
                contentViewsArray.forEach(function(cv) {
                    if (cv.contentViewPreviewTab)     { pTabsCont.appendChild(cv.contentViewPreviewTab); }
                    if (cv.contentViewPreviewElement) { pContentCont.appendChild(cv.contentViewPreviewElement); }
                });
            }
        }

        FrameTrail.module('HypervideoModel').newUnsavedChange('layout');

    }


    function updateManagedContent() {

        managedAnnotations = [];
        managedOverlays    = [];

        allContentViews().forEach(function(contentView) {
            for (var k in contentView.contentCollection) {
                var item = contentView.contentCollection[k];
                if (item.overlayElement) {
                    managedOverlays.push([item, contentView]);
                } else {
                    managedAnnotations.push([item, contentView]);
                }
            }
        });

    }


    function updateContentInContentViews() {

        allContentViews().forEach(function(contentView) {
            contentView.updateContent(true);
        });

        var currentTime = FrameTrail.module('HypervideoController').currentTime;
        updateTimedStateOfContentViews(currentTime);
    }


    /**
     * I re-render only the ContentViews of type "Chapters".
     *
     * Chapter edits funnel through HypervideoController.updateChapterDisplay(),
     * which fires on every add, delete, start change and drag end. Re-rendering
     * every ContentView there would rebuild all annotation collections on each
     * of those, so I narrow the refresh to the views that actually show chapters.
     *
     * @method updateChaptersContentViews
     */
    function updateChaptersContentViews() {

        var found = false;

        allContentViews().forEach(function(contentView) {
            if (contentView.contentViewData.type === 'Chapters') {
                contentView.updateContent(true);
                found = true;
            }
        });

        if (!found) { return; }

        updateTimedStateOfContentViews(FrameTrail.module('HypervideoController').currentTime);
    }


    /**
     * I re-render only the ContentViews of type "Transcript", after the subtitles of a language changed
     * (HypervideoModel.setSubtitles()). A view that names no transcript shows the first one, so a change of
     * any language can change what it shows.
     *
     * @method updateTranscriptContentViews
     */
    function updateTranscriptContentViews() {

        var found = false;

        allContentViews().forEach(function(contentView) {
            if (contentView.contentViewData.type === 'Transcript') {
                contentView.updateContent(true);
                found = true;
            }
        });

        if (!found) { return; }

        updateTimedStateOfContentViews(FrameTrail.module('HypervideoController').currentTime);
    }


    function updateTimedStateOfContentViews(currentTime) {

        for (var idx in managedAnnotations) {
            var annotation  = managedAnnotations[idx][0],
                contentView = managedAnnotations[idx][1];

            if (    annotation.data.start <= currentTime
                 && annotation.data.end   >= currentTime) {

                if (!annotation.activeStateInContentView(contentView)) {
                    annotation.setActiveInContentView(contentView);
                }

            } else {

                if (annotation.activeStateInContentView(contentView)) {
                    annotation.setInactiveInContentView(contentView);
                }

            }

        }

        for (var idx in managedOverlays) {
            var overlay     = managedOverlays[idx][0],
                contentView = managedOverlays[idx][1];

            if (    overlay.data.start <= currentTime
                 && overlay.data.end   >= currentTime) {

                if (!overlay.activeStateInContentView(contentView)) {
                    overlay.setActiveInContentView(contentView);
                }

            } else {

                if (overlay.activeStateInContentView(contentView)) {
                    overlay.setInactiveInContentView(contentView);
                }

            }

        }

        allContentViews().forEach(function(contentView) {
            contentView.updateTimedStateOfContentViews(currentTime);
        });

    }

    function initLayoutManager() {
        
        HypervideoLayoutContainer.innerHTML = '';

        var database   = FrameTrail.module('Database'),
            thisID     = FrameTrail.module('RouteNavigation').hypervideoID;

        // The phone is there when pairing is set up, and wherever there are views for it already.
        var showCompanion = !!(database.config && database.config.pairingBrokerURL) || contentViews.companion.length > 0;

        var _lmWrapper = document.createElement('div');
        _lmWrapper.innerHTML = '<div class="layoutManagerContainer">' +
            '    <div class="layoutManagerOptions">' +
            '        <div class="message active mb-0">'+ labels['MessageLayoutManagerDropContentViews'] +'</div>' +
            '        <div class="contentViewTemplate" data-type="TimedContent" data-size="medium">' +
            '            <div class="contentViewOptionThumb"></div>' +
            '            <div class="contentViewTemplateLabel"><span class="icon-docs">'+ labels['GenericAnnotationCollection'] +'</span></div>' +
            '        </div>' +
            '        <div class="contentViewTemplate" data-type="CustomHTML" data-size="medium">' +
            '            <div class="contentViewOptionThumb"></div>' +
            '            <div class="contentViewTemplateLabel"><span class="icon-file-code">'+ labels['GenericCustomHTML'] +'</span></div>' +
            '        </div>' +
            '        <div class="contentViewTemplate" data-type="Transcript" data-size="large">' +
            '            <div class="contentViewOptionThumb"></div>' +
            '            <div class="contentViewTemplateLabel"><span class="icon-doc-text">'+ labels['GenericTextTranscript'] +'</span></div>' +
            '        </div>' +
            '        <div class="contentViewTemplate" data-type="Timelines" data-size="large">' +
            '            <div class="contentViewOptionThumb"></div>' +
            '            <div class="contentViewTemplateLabel"><span class="icon-tasks">'+ labels['GenericTimelines'] +'</span></div>' +
            '        </div>' +
            '        <div class="contentViewTemplate" data-type="Chapters" data-size="small">' +
            '            <div class="contentViewOptionThumb"></div>' +
            '            <div class="contentViewTemplateLabel"><span class="icon-list-bullet">'+ labels['SettingsChapters'] +'</span></div>' +
            '        </div>' +
            '    </div>' +
            '    <div class="layoutManagerBody">' +
            '        <div class="layoutManagerMain">' +
            '            <div class="layoutManager">' +
            '                <div data-area="areaTop" class="layoutArea">' +
            '                    <div class="layoutAreaTabs"></div>' +
            '                    <div class="layoutAreaContent"></div>' +
            '                </div>' +
            '                <div class="playerWrapper">' +
            '                    <div data-area="areaLeft" class="layoutArea">' +
            '                        <div class="layoutAreaTabs"></div>' +
            '                        <div class="layoutAreaContent"></div>' +
            '                    </div>' +
            '                    <div class="playerArea">' +
            '                        <div class="schematicVideoArea">' +
            '                            <span class="icon-play-1"></span>' +
            '                        </div>' +
            '                        <div class="schematicPlayerProgress">' +
            '                            <div class="schematicPlayerProgressFill"></div>' +
            '                        </div>' +
            '                        <div class="schematicControls">' +
            '                            <div class="schematicControlsLeft">' +
            '                                <span class="icon-play-1"></span>' +
            '                                <div class="schematicTimeBar"></div>' +
            '                            </div>' +
            '                            <div class="schematicControlsRight">' +
            '                                <div class="schematicControlDot"></div>' +
            '                                <div class="schematicControlDot"></div>' +
            '                                <div class="schematicControlDot"></div>' +
            '                            </div>' +
            '                        </div>' +
            '                    </div>' +
            '                    <div data-area="areaRight" class="layoutArea">' +
            '                        <div class="layoutAreaTabs"></div>' +
            '                        <div class="layoutAreaContent"></div>' +
            '                    </div>' +
            '                </div>' +
            '                <div data-area="areaBottom" class="layoutArea">' +
            '                    <div class="layoutAreaTabs"></div>' +
            '                    <div class="layoutAreaContent"></div>' +
            '                </div>' +
            '            </div>' +
            '        </div>' +
            (showCompanion ?
            '        <div class="layoutManager companionLayoutManager">' +
            '            <div class="companionLayoutLabel" data-tooltip-bottom="'+ labels['MessageLayoutManagerCompanion'] +'"><span class="icon-mobile-1">'+ labels['LayoutAreaCompanionTitle'] +'</span></div>' +
            '            <div data-area="areaCompanion" class="layoutArea">' +
            '                <div class="layoutAreaTabs"></div>' +
            '                <div class="layoutAreaContent"></div>' +
            '            </div>' +
            '            <div class="schematicPlayerProgress">' +
            '                <div class="schematicPlayerProgressFill"></div>' +
            '            </div>' +
            '            <div class="schematicControls">' +
            '                <div class="schematicControlsLeft">' +
            '                    <span class="icon-play-1"></span>' +
            '                    <div class="schematicTimeBar"></div>' +
            '                </div>' +
            '                <div class="schematicControlsRight">' +
            '                    <div class="schematicControlDot"></div>' +
            '                </div>' +
            '            </div>' +
            '        </div>' : '') +
            '    </div>' +
            '</div>';
        var domElement = _lmWrapper.firstElementChild,
        LayoutManager        = domElement.querySelector('.layoutManager'),
        LayoutManagerOptions = domElement.querySelector('.layoutManagerOptions'),
        self = this;

        HypervideoLayoutContainer.append(domElement);

        // Populate template preview thumbnails
        LayoutManagerOptions.querySelectorAll('.contentViewTemplate').forEach(function(tmpl) {
            var thumb = tmpl.querySelector('.contentViewOptionThumb');
            if (thumb) {
                // maxCards 3 keeps the palette thumbnails as compact as they have always been
                thumb.appendChild(generateSchematic(tmpl.dataset.type, tmpl.dataset.size, 'x', false, 3));
            }
        });

        // Layout template drag-and-drop via interact.js (clone helper pattern)
        (function() {
            var dragClone = null;

            var draggableListeners = {
            listeners: {
                start: function(e) {
                    var el = e.target;
                    var rect = el.getBoundingClientRect();
                    dragClone = el.cloneNode(true);
                    dragClone.style.cssText = 'position:fixed;z-index:1000;pointer-events:none;width:' + rect.width + 'px;left:' + rect.left + 'px;top:' + rect.top + 'px;';
                    // Copy theme CSS variables from the themed layoutManager so the clone renders correctly
                    var lm = domElement.querySelector('.layoutManager');
                    if (lm) {
                        var cs = getComputedStyle(lm);
                        ['--primary-bg-color','--primary-fg-color','--secondary-bg-color','--secondary-fg-color',
                         '--video-background-color','--semi-transparent-fg-color','--semi-transparent-fg-highlight-color'].forEach(function(v) {
                            var val = cs.getPropertyValue(v).trim();
                            if (val) { dragClone.style.setProperty(v, val); }
                        });
                    }
                    document.body.appendChild(dragClone);
                },
                move: function(e) {
                    // Only move the floating clone — original stays in place as visual placeholder
                    if (dragClone) {
                        dragClone.style.left = (parseFloat(dragClone.style.left) + e.dx) + 'px';
                        dragClone.style.top  = (parseFloat(dragClone.style.top)  + e.dy) + 'px';
                    }
                },
                end: function() {
                    if (dragClone) { dragClone.remove(); dragClone = null; }
                }
            }
        };
        LayoutManagerOptions.querySelectorAll('.contentViewTemplate').forEach(function(el) { interact(el).draggable(draggableListeners); });

        var dropzoneOpts = {
                accept: '.contentViewTemplate, .contentViewPreview',
                overlap: 'pointer',
                ondropactivate:   function(e) { e.target.classList.add('droppableActive'); },
                ondropdeactivate: function(e) { e.target.classList.remove('droppableActive', 'droppableHover'); },
                ondragenter:      function(e) { e.target.classList.add('droppableHover'); },
                ondragleave:      function(e) { e.target.classList.remove('droppableHover'); },
                ondrop: function(e) {
                    var orig = e.relatedTarget;
                    var layoutArea = e.target.parentElement.dataset.area,
                        contentAxis = (layoutArea == 'areaTop' || layoutArea == 'areaBottom') ? 'x' : 'y',
                        templateContentViewData = {
                            'type': orig.dataset.type,
                            'name': '',
                            'description': '',
                            'cssClass': '',
                            'html': '',
                            'collectionFilter': {
                                'tags': [],
                                'types': [],
                                'text': '',
                                'users': []
                            },
                            // A new Transcript view shows the first transcript (none yet: the first one made).
                            'transcriptSource': (orig.dataset.type === 'Transcript') ? FrameTrail.module('HypervideoModel').transcriptLanguage('') : '',
                            'mode': 'slide',
                            'axis': contentAxis,
                            'contentSize': orig.dataset.size || '',
                            'autoSync': false,
                            'onClickContentItem': ''
                        };

                    var whichArea = layoutArea.split('area')[1].toLowerCase(),
                        renderPreview = true;

                    var newContentView = createContentView(whichArea, templateContentViewData, renderPreview);

                    FrameTrail.module('HypervideoModel').newUnsavedChange('layout');

                    // Register undo command for adding content view
                    (function(areaName, viewData) {
                        var findContentView = function() {
                            var contentViewsArray = contentViews[areaName];
                            for (var i = 0; i < contentViewsArray.length; i++) {
                                if (JSON.stringify(contentViewsArray[i].contentViewData) === JSON.stringify(viewData)) {
                                    return contentViewsArray[i];
                                }
                            }
                            return null;
                        };
                        FrameTrail.module('UndoManager').register({
                            category: 'layout',
                            description: labels['SidebarLayout'] + ' ' + labels['GenericAdd'],
                            undo: function() {
                                var contentView = findContentView();
                                if (contentView) {
                                    removeContentView(contentView, true);
                                }
                            },
                            redo: function() {
                                createContentView(areaName, viewData, true, true);
                                FrameTrail.module('HypervideoModel').newUnsavedChange('layout');
                            }
                        });
                    })(whichArea, JSON.parse(JSON.stringify(templateContentViewData)));
                }
        };
        domElement.querySelectorAll('.layoutManager .layoutAreaContent').forEach(function(el) { interact(el).dropzone(dropzoneOpts); });
        }());

        AREAS.forEach(function(area) {
            initLayoutAreaPreview(contentViews[area.name]);
        });

        // The phone in the layout editor opens on its first view too, as the phone itself does (see create()).
        if (contentViews.companion.length) {
            contentViews.companion[0].activateContentViewPreview();
        }

        updateHiddenTabs();

        // Make preview tabs sortable within each layout area
        AREAS.forEach(function(area) {
            var cfg = { area: area.name, key: area.key };
            var previewArea   = domElement.querySelector('.layoutManager [data-area="' + cfg.key + '"]');
            var tabsContainer = previewArea ? previewArea.querySelector('.layoutAreaTabs') : null;
            if (!tabsContainer) { return; }

            Sortable.create(tabsContainer, {
                draggable:  '.contentViewTab',
                animation:  150,
                delay:      150,
                ghostClass: 'sortable-ghost',
                dragClass:  'sortable-drag',
                onEnd: function(evt) {
                    if (evt.oldIndex === evt.newIndex) { return; }
                    reorderContentView(cfg.area, evt.oldIndex, evt.newIndex, false);
                    (function(area, fromIdx, toIdx) {
                        FrameTrail.module('UndoManager').register({
                            category: 'layout',
                            description: labels['SidebarLayout'] + ' ' + labels['GenericReorder'],
                            undo: function() { reorderContentView(area, toIdx, fromIdx, true); },
                            redo: function() { reorderContentView(area, fromIdx, toIdx, true); }
                        });
                    })(cfg.area, evt.oldIndex, evt.newIndex);
                }
            });
        });

    }


    /**
     * I initialize a LayoutArea Preview and trigger initialization of its ContentViews.
     *
     * @method initLayoutAreaPreview
     * @param {Array} contentViews
     */
    function initLayoutAreaPreview(contentViews) {

        for (var i=0; i < contentViews.length; i++) {
            contentViews[i].renderContentViewPreview();
        }

    }


    /**
     * I return the data of all ContentViews in all LayoutAreas: what a save writes as config.layoutArea. The
     * companion area is there once it has been stored or has a view, so a hypervideo that never had one is
     * written as it was.
     *
     * @method getLayoutAreaData
     * @return {Object} layoutAreaData
     */
    function getLayoutAreaData() {

        var layoutAreaData = {};

        AREAS.forEach(function(area) {
            if (area.name === 'companion' && !contentViews.companion.length && !Array.isArray((configLayoutArea || {}).areaCompanion)) {
                return;
            }
            layoutAreaData[area.key] = contentViews[area.name].map(function(contentView) {
                return contentView.contentViewData;
            });
        });

        return layoutAreaData;

    }


    /**
     * I am called when the global state "viewSize" changes (which it does after a window resize,
     * and one time during app start, after all create methods of interface modules have been called).
     * @method changeViewSize
     * @param {Array} arrayWidthAndHeight
     */
    function changeViewSize(arrayWidthAndHeight) {

        adjustContentViewLayout();

    }


    /**
     * I adjust the layout (sizes, positioning etc.) of all contentViews.
     * @method adjustContentViewLayout
     */
    function adjustContentViewLayout() {

        if ( FrameTrail.getState('viewMode') != 'video' ) {
            return;
        }

        var allAreas = AREAS.map(function(area) { return contentViews[area.name]; });

        for (var a = 0; a < allAreas.length; a++) {
            for (var i in allAreas[a]) {
                allAreas[a][i].updateLayout();
            }
            // Sync the area container data-size with the active content view
            for (var i in allAreas[a]) {
                if (allAreas[a][i].contentViewContainer.classList.contains('active')) {
                    allAreas[a][i].resizeLayoutArea(false, true);
                    break;
                }
            }
        }

    }


    /**
     * I react to changes in the global state viewSizeChanged.
     * The state changes after a window resize event
     * and is meant to be used for performance-heavy operations.
     *
     * @method onViewSizeChanged
     * @private
     */
    function onViewSizeChanged() {

        if ( FrameTrail.getState('viewMode') != 'video' ) {
            return;
        }

        //TODO: CHECK WHY THIS THROWS ERROR RIGHT AFTER DELETING A CONTENT VIEW
        var currentTime = FrameTrail.module('HypervideoController').currentTime;
        updateTimedStateOfContentViews(currentTime);

        if ( FrameTrail.module('ViewVideo').shownDetails == 'top' ) {
            for (var i in contentViews.top) {
                contentViews.top[i].updateCollectionSlider(true);
            }
        } else if ( FrameTrail.module('ViewVideo').shownDetails == 'bottom' ) {
            for (var i in contentViews.bottom) {
                contentViews.bottom[i].updateCollectionSlider(true);
            }
        }

    }


    /**
     * When the state of the sidebar changes, I have to re-arrange
     * the tileElements and the annotationElements, to fit the new
     * width of the #mainContainer.
     * @method toggleSidebarOpen
     * @private
     */
    function toggleSidebarOpen() {


        var maxSlideDuration = 280,
            interval;

        interval = window.setInterval(function(){
            changeViewSize(FrameTrail.getState('viewSize'));
        }, 40);

        window.setTimeout(function(){

            window.clearInterval(interval);

        }, maxSlideDuration);


    }


    /**
     * When we enter the viewMode 'video', we have to update the
     * distribution of tiles accoring to the current browser width.
     * @method toggleViewMode
     * @param {String} viewMode
     * @param {String} oldViewMode
     * @return
     */
    function toggleViewMode(viewMode, oldViewMode){

        if (viewMode === 'video' && oldViewMode !== 'video') {
            window.setTimeout(function() {
                changeViewSize(FrameTrail.getState('viewSize'));
            }, 300);
        }

    }



    /**
     * I am called when the global state "slidePosition" changes.
     *
     * This state is either "top", "middle" or "bottom", and indicates, which area has the most visual weight.
     * The Hypervideocontainer is always displayed in the middle (in different sizes).
     *
     * @method changeSlidePosition
     * @param {String} newState
     * @param {String} oldState
     */
    function onChangeSlidePosition(newState, oldState) {

            if ( newState == 'middle' ) {
            var _targetEl = document.querySelector(FrameTrail.getState('target'));
            _targetEl.querySelectorAll('.viewVideo .collectionElement.open').forEach(function(el) {
                el.classList.remove('open');
            });
        };

    }



    return {

        onChange: {
            viewSize:        changeViewSize,
            viewSizeChanged: onViewSizeChanged,
            sidebarOpen:     toggleSidebarOpen,
            viewMode:        toggleViewMode,
            slidePosition:   onChangeSlidePosition
        },

        create: create,

        createContentView: createContentView,
        removeContentView: removeContentView,
        setContentViews:   setContentViews,

        updateManagedContent: updateManagedContent,

        updateContentInContentViews: updateContentInContentViews,
        updateChaptersContentViews: updateChaptersContentViews,
        updateTranscriptContentViews: updateTranscriptContentViews,
        adjustContentViewLayout: adjustContentViewLayout,

        generateSchematic: generateSchematic,

        updateTimedStateOfContentViews: updateTimedStateOfContentViews,

        initLayoutManager: initLayoutManager,

        reorderContentView:  reorderContentView,

        updateHiddenTabs: updateHiddenTabs,

        getLayoutAreaData: getLayoutAreaData,

    };

});
