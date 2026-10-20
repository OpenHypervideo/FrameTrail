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
     * through me: the type palette of the Layout Editor (below), the preview
     * element of a placed ContentView, and the type/size option cards in the
     * ContentView settings dialog. The latter two live in the ContentView type
     * and reach me via FrameTrail.module('ViewLayout').generateSchematic().
     *
     * @method generateSchematic
     * @param {String} type - ContentView type ('TimedContent', 'Transcript', 'Chapters', 'Timelines', 'CustomHTML')
     * @param {String} size - 'small', 'medium' or 'large'
     * @param {String} axis - 'x' for the top/bottom areas, 'y' for left/right, 'ring' for the circular area
     * @param {Boolean} thumbnail - Draw a single representative item instead of a full set
     * @param {Number} maxCards - Optional upper bound on the number of items drawn
     * @return {HTMLElement}
     */
    function generateSchematic(type, size, axis, thumbnail, maxCards) {
        var isHorizontal = (axis === 'x'),
            schematic = document.createElement('div');
        schematic.className = 'schematicPreview';

        // The ring is the point of the circular area, so it is drawn whole even as a thumbnail: the cells of a
        // grid's outer row and column around a video.
        if (axis === 'ring' && type === 'TimedContent') {
            var ring = RING_SCHEMATIC[size] || RING_SCHEMATIC.medium;
            schematic.classList.add('schematicRing');
            schematic.setAttribute('data-size', size);
            schematic.style.gridTemplateColumns = 'repeat(' + ring.cols + ', 1fr)';
            schematic.style.gridTemplateRows = 'repeat(' + ring.rows + ', 1fr)';
            for (var r = 1; r <= ring.rows; r++) {
                for (var c = 1; c <= ring.cols; c++) {
                    if (r > 1 && r < ring.rows && c > 1 && c < ring.cols) { continue; }
                    var cell = document.createElement('div');
                    cell.className = 'schematicCard' + ((c === 1 && r === ring.rows - 1) ? ' active' : '');
                    cell.setAttribute('data-size', size);
                    cell.style.gridArea = r + ' / ' + c;
                    cell.innerHTML = '<div class="schematicThumb"></div>';
                    schematic.appendChild(cell);
                }
            }
            var ringVideo = document.createElement('div');
            ringVideo.className = 'schematicRingVideo';
            ringVideo.style.gridArea = '2 / 2 / ' + ring.rows + ' / ' + ring.cols;
            schematic.appendChild(ringVideo);
            return schematic;
        }

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
    // area's (ViewVideo.AreaCompanionContainer), so its views are laid out like the right area's. The circular
    // area shows one collection as a ring of thumbnails around the video (see circularGeometry); its container is
    // inside ViewVideo's .videoContainer, the space the video gets after the other areas. An optional area is
    // written only once it is stored or has a view (see getLayoutAreaData).
    var AREAS = [
        { name: 'top',       key: 'areaTop',       cap: 'Top'       },
        { name: 'bottom',    key: 'areaBottom',    cap: 'Bottom'    },
        { name: 'left',      key: 'areaLeft',      cap: 'Left'      },
        { name: 'right',     key: 'areaRight',     cap: 'Right'     },
        { name: 'companion', key: 'areaCompanion', cap: 'Companion', optional: true },
        { name: 'circular',  key: 'areaCircular',  cap: 'Circular',  optional: true }
    ];

    // The ring's schematic (generateSchematic): a grid of cols × rows cells per size. ViewLayout/style.css insets
    // the Layout Editor's video by one cell of the same grid (--ring-cols, --ring-rows).
    var RING_SCHEMATIC = {
        small:  { cols: 10, rows: 8 },
        medium: { cols: 6,  rows: 5 }
    };

    // The types of content view, in the order of the layout editor's palette: the icon and label they are shown
    // with (the palette, the Display tab of an annotation's properties) and the size the palette offers them in.
    var VIEW_TYPES = [
        { type: 'TimedContent', icon: 'icon-docs',        label: 'GenericAnnotationCollection', size: 'medium' },
        { type: 'Transcript',   icon: 'icon-doc-text',    label: 'GenericTextTranscript',       size: 'large'  },
        { type: 'Chapters',     icon: 'icon-list-bullet', label: 'SettingsChapters',            size: 'small'  },
        { type: 'Timelines',    icon: 'icon-tasks',       label: 'GenericTimelines',            size: 'large'  },
        { type: 'CustomHTML',   icon: 'icon-file-code',   label: 'GenericCustomHTML',           size: 'medium' }
    ];

    var configLayoutArea,

        // The content views of each area, by its name.
        contentViews        = { top: [], bottom: [], left: [], right: [], companion: [], circular: [] },

        managedAnnotations  = [],
        managedOverlays     = [],

        HypervideoLayoutContainer = FrameTrail.module('ViewVideo').HypervideoLayoutContainer,
        Hypervideo = FrameTrail.module('Database').hypervideo;


    function areaByName(whichArea) {
        for (var i = 0; i < AREAS.length; i++) {
            if (AREAS[i].name === whichArea) { return AREAS[i]; }
        }
        throw new Error('whichArea is string top/bottom/left/right/companion/circular');
    }

    function allContentViews() {
        return AREAS.reduce(function(list, area) { return list.concat(contentViews[area.name]); }, []);
    }

    function viewTypeOf(type) {
        for (var i = 0; i < VIEW_TYPES.length; i++) {
            if (VIEW_TYPES[i].type === type) { return VIEW_TYPES[i]; }
        }
        return null;
    }

    // The phone is there when pairing is set up, and wherever there are views for it already.
    function showsCompanionArea() {
        var config = FrameTrail.module('Database').config;
        return !!(config && config.pairingBrokerURL) || contentViews.companion.length > 0;
    }

    // The view the ring around the video shows: the circular area's first, if it is a collection (TimedContent).
    function circularView() {
        var view = contentViews.circular[0];
        return (view && view.contentViewData.type === 'TimedContent') ? view : null;
    }


    /**
     * I return the geometry of the ring around the video for a space of width × height and a video of the aspect
     * ratio (width / height): FrameTrailRingLayout's, laid out by the circular view (ContentView.computeRingGeometry),
     * with mode 'ring', or 'strip' where the player is narrow or the thumbnails do not fit around the video. Null
     * when there is no ring: no circular collection, its area closed (the layout areas panel, "Start collapsed"),
     * no thumbnails, or an editing mode that hides the layout areas (the Preview and the Layout Editor keep it).
     *
     * @method circularGeometry
     * @param {Number} width
     * @param {Number} height
     * @param {Number} aspect
     * @param {Boolean} narrow
     * @return {Object|null}
     */
    function circularGeometry(width, height, aspect, narrow) {

        var view      = circularView(),
            container = FrameTrail.module('ViewVideo').AreaCircularContainer,
            editMode  = FrameTrail.getState('editMode'),
            shown     = view && container && !container.classList.contains('closed') && view.contentGroups.length > 0
                        && (!editMode || editMode === 'preview' || editMode === 'layout');

        if (!shown) {
            if (view) { view.clearRingGeometry(); }
            return null;
        }

        return view.computeRingGeometry(width, height, aspect, narrow);

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
        // The ring shows the first view only (see circularView).
        if (contentViews.circular.length) {
            contentViews.circular[0].activateContentView();
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
        FrameTrail.changeState('hv_config_areaCircularVisible', !FrameTrail.getState('companion') && !!circularView());

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

            // Also update layout editor preview area
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
                description: labels['SidebarLayoutEditor'] + ' ' + labels['GenericDelete'],
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
     * @param {String} whichArea - top, bottom, left, right, companion or circular
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
            initLayoutEditor();
        } else if (editMode && editMode !== 'preview') {
            // The other editors hide the layout areas; a change of an area's visibility must not show it.
            var ViewVideo = FrameTrail.module('ViewVideo');
            [ViewVideo.AreaTopContainer, ViewVideo.AreaTopDetails, ViewVideo.AreaBottomContainer,
             ViewVideo.AreaBottomDetails, ViewVideo.AreaLeftContainer, ViewVideo.AreaRightContainer,
             ViewVideo.AreaCircularContainer].forEach(function(element) {
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

        // Reorder LayoutEditor preview DOM (Sortable handles it on drag; needed for undo/redo)
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

    function initLayoutEditor() {
        
        HypervideoLayoutContainer.innerHTML = '';

        var thisID = FrameTrail.module('RouteNavigation').hypervideoID;

        var showCompanion = showsCompanionArea();

        var _lmWrapper = document.createElement('div');
        _lmWrapper.innerHTML = '<div class="layoutEditorContainer">' +
            '    <div class="layoutEditorOptions">' +
            '        <div class="message active mb-0">'+ labels['MessageLayoutEditorDropContentViews'] +'</div>' +
            VIEW_TYPES.map(function(viewType) {
                return '        <div class="contentViewTemplate" data-type="'+ viewType.type +'" data-size="'+ viewType.size +'">' +
                       '            <div class="contentViewOptionThumb"></div>' +
                       '            <div class="contentViewTemplateLabel"><span class="'+ viewType.icon +'">'+ labels[viewType.label] +'</span></div>' +
                       '        </div>';
            }).join('') +
            '    </div>' +
            '    <div class="layoutEditorBody">' +
            '        <div class="layoutEditorMain">' +
            '            <div class="layoutEditor">' +
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
            '                        <div data-area="areaCircular" class="layoutArea circularLayoutArea">' +
            '                            <div class="layoutAreaTabs"></div>' +
            '                            <div class="layoutAreaContent" data-tooltip-top="'+ labels['MessageLayoutEditorCircular'] +'"></div>' +
            '                            <div class="schematicVideoArea">' +
            '                                <span class="icon-play-1"></span>' +
            '                            </div>' +
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
            '        <div class="layoutEditor companionLayoutEditor">' +
            '            <div class="companionLayoutLabel" data-tooltip-bottom="'+ labels['MessageLayoutEditorCompanion'] +'"><span class="icon-mobile-1">'+ labels['LayoutAreaCompanionTitle'] +'</span></div>' +
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
        LayoutEditor        = domElement.querySelector('.layoutEditor'),
        LayoutEditorOptions = domElement.querySelector('.layoutEditorOptions'),
        self = this;

        HypervideoLayoutContainer.append(domElement);

        // Populate template preview thumbnails
        LayoutEditorOptions.querySelectorAll('.contentViewTemplate').forEach(function(tmpl) {
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
                    // Copy theme CSS variables from the themed layoutEditor so the clone renders correctly
                    var lm = domElement.querySelector('.layoutEditor');
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
        LayoutEditorOptions.querySelectorAll('.contentViewTemplate').forEach(function(el) { interact(el).draggable(draggableListeners); });

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
                            description: labels['SidebarLayoutEditor'] + ' ' + labels['GenericAdd'],
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
        domElement.querySelectorAll('.layoutEditor .layoutArea:not(.circularLayoutArea) > .layoutAreaContent').forEach(function(el) { interact(el).dropzone(dropzoneOpts); });

        // The ring takes one collection (TimedContent), and nothing while it has one.
        var circularContent = domElement.querySelector('.circularLayoutArea > .layoutAreaContent');
        if (circularContent) {
            interact(circularContent).dropzone(Object.assign({}, dropzoneOpts, {
                accept: '.contentViewTemplate[data-type="TimedContent"]',
                checker: function(dragEvent, event, dropped) {
                    return dropped && !contentViews.circular.length;
                },
                ondropactivate: function(e) {
                    if (!contentViews.circular.length) { e.target.classList.add('droppableActive'); }
                },
                ondragenter: function(e) {
                    if (!contentViews.circular.length) { e.target.classList.add('droppableHover'); }
                }
            }));
        }
        }());

        AREAS.forEach(function(area) {
            initLayoutAreaPreview(contentViews[area.name]);
        });

        // The phone in the layout editor opens on its first view too, as the phone itself does (see create()).
        if (contentViews.companion.length) {
            contentViews.companion[0].activateContentViewPreview();
        }

        updateHiddenTabs();

        // Make preview tabs sortable within each layout area (the ring has one view, and no tabs)
        AREAS.forEach(function(area) {
            if (area.name === 'circular') { return; }
            var cfg = { area: area.name, key: area.key };
            var previewArea   = domElement.querySelector('.layoutEditor [data-area="' + cfg.key + '"]');
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
                            description: labels['SidebarLayoutEditor'] + ' ' + labels['GenericReorder'],
                            undo: function() { reorderContentView(area, toIdx, fromIdx, true); },
                            redo: function() { reorderContentView(area, fromIdx, toIdx, true); }
                        });
                    })(cfg.area, evt.oldIndex, evt.newIndex);
                }
            });
        });

    }


    /**
     * I make the button that opens the Layout Editor (edit mode "layout"), for the places that point to it. It is
     * disabled for those who may not use that mode (Sidebar.mayUseEditMode).
     *
     * @method renderOpenEditorButton
     * @return {HTMLElement}
     */
    function renderOpenEditorButton() {

        var Sidebar = FrameTrail.module('Sidebar'),
            button  = document.createElement('button');

        button.type = 'button';
        button.className = 'openLayoutEditorButton';
        button.innerHTML = '<span class="icon-website"></span> ' + labels['GenericOpenLayoutEditor'];
        button.disabled = !!(Sidebar && !Sidebar.mayUseEditMode('layout'));
        button.addEventListener('click', function() {
            FrameTrail.changeState('editMode', 'layout');
        });

        return button;

    }


    /**
     * I draw one area of the layout diagram (see renderLayoutDiagram): its views as chips, each an icon and a name,
     * the area as large as the player has it (the size of its active view, see ContentView.resizeLayoutArea), or a
     * thin strip (.empty) where it has no views. I call onView(contentView, viewElement, viewName, areaElement, area)
     * for every view, for the caller to mark it.
     *
     * @method renderDiagramArea
     * @param {String} name
     * @param {Function} onView
     * @return {HTMLElement}
     */
    function renderDiagramArea(name, onView) {

        var area   = areaByName(name),
            views  = contentViews[name],
            areaEl = document.createElement('div');

        areaEl.className = 'layoutDiagramArea' + (views.length ? '' : ' empty');
        areaEl.setAttribute('data-area', name);

        if (views.length) {
            var container = FrameTrail.module('ViewVideo')['Area' + area.cap + 'Container'];
            areaEl.setAttribute('data-size', (container && container.getAttribute('data-size')) || views[0].contentViewData.contentSize);
        }

        views.forEach(function(contentView) {
            var data     = contentView.contentViewData,
                viewType = viewTypeOf(data.type),
                viewName = data.name || (viewType ? labels[viewType.label] : data.type),
                viewEl   = document.createElement('div'),
                iconEl   = document.createElement('span'),
                nameEl   = document.createElement('span');

            viewEl.className = 'layoutDiagramView';
            viewEl.title = viewName;
            iconEl.className = viewType ? viewType.icon : '';
            nameEl.className = 'layoutDiagramViewName';
            nameEl.textContent = viewName;
            viewEl.append(iconEl, nameEl);
            areaEl.appendChild(viewEl);

            if (onView) { onView(contentView, viewEl, viewName, areaEl, area); }
        });

        return areaEl;

    }


    /**
     * I draw the layout areas around the video as a diagram in 16:9: the top area, the left one, the video and the
     * right one, the bottom one, each in proportion to its size in a player of about 1600 × 900px, with its views as
     * chips (see renderDiagramArea). Where the circular area has a view, that view is the ring: a band around the
     * video as thick as in the player, its name in the top band; with options.live, the strip below the video where
     * the player shows one instead (where it is narrow, or the thumbnails do not fit around the video).
     *
     * The Display tab of an annotation's properties draws the areas without views as thin strips (options.unused
     * 'strip'), as the Layout Editor does; the layout areas panel in the player's controls, which opens and closes
     * the areas, leaves them out ('hide') and draws the player as it is (options.live). options.onView is passed on
     * to every area.
     *
     * @method renderLayoutDiagram
     * @param {Object} options { unused: 'strip' | 'hide', live: Boolean, onView: Function }
     * @return {Object} { element, areas }: the diagram, and the elements of its areas by name
     */
    function renderLayoutDiagram(options) {

        options = options || {};

        var areas   = {},
            diagram = document.createElement('div'),
            middle  = document.createElement('div'),
            video   = document.createElement('div');

        ['top', 'left', 'right', 'bottom', 'circular'].forEach(function(name) {
            // No empty ring: it would only add a frame around the video.
            if (!contentViews[name].length && (name === 'circular' || options.unused === 'hide')) { return; }
            areas[name] = renderDiagramArea(name, options.onView);
        });

        diagram.className = 'layoutDiagram';
        middle.className  = 'layoutDiagramMiddle';
        video.className   = 'layoutDiagramVideo';
        video.innerHTML   = '<span class="icon-play-1"></span>';

        if (areas.circular) {
            var ring = circularView();
            areas.circular.title = labels['LayoutAreaCircularTitle'];
            if (options.live && ring && (ring.isStrip() || FrameTrail.getState('viewSize')[0] <= 768)) {
                areas.circular.classList.add('strip');
            }
            areas.circular.appendChild(video);
        }

        middle.append.apply(middle, [areas.left, areas.circular || video, areas.right].filter(Boolean));
        diagram.append.apply(diagram, [areas.top, middle, areas.bottom].filter(Boolean));

        return { element: diagram, areas: areas };

    }


    /**
     * I make the Display tab of an annotation's properties: the layout diagram (see renderLayoutDiagram) with the
     * views that show the annotation marked, the paired phone beside it where the Layout Editor shows it, then which
     * views these are, or why it is shown nowhere, and the button to the Layout Editor. Editing hides the areas, so
     * this is where an author sees where an annotation will appear. refresh() draws it again, after a change of the
     * annotation's tags or of the layout.
     *
     * @method renderAnnotationDisplay
     * @param {Annotation} annotation
     * @return {Object} { element, refresh }
     */
    function renderAnnotationDisplay(annotation) {

        var element = document.createElement('div');
        element.className = 'annotationDisplay';

        function refresh() {

            var shownIn = [],
                canShow = false;   // whether any view shows annotations at all

            function onView(contentView, viewEl, viewName, areaEl, area) {
                var type = contentView.contentViewData.type;
                if (type === 'TimedContent' || type === 'Timelines') { canShow = true; }
                if (contentView.showsAnnotation(annotation)) {
                    viewEl.classList.add('shows');
                    areaEl.classList.add('shows');
                    shownIn.push(viewName + ' (' + labels['LayoutArea' + area.cap] + ')');
                }
            }

            var layout = document.createElement('div');
            layout.className = 'annotationDisplayLayout';
            layout.appendChild(renderLayoutDiagram({ unused: 'strip', onView: onView }).element);

            if (showsCompanionArea()) {
                var phone = document.createElement('div');
                phone.className = 'annotationDisplayPhone';
                phone.title = labels['LayoutAreaCompanionTitle'];
                phone.appendChild(renderDiagramArea('companion', onView));
                layout.appendChild(phone);
            }

            var info = document.createElement('div'),
                text = document.createElement('div');

            info.className = 'annotationDisplayInfo';

            if (shownIn.length) {
                text.className = 'annotationDisplayShownIn';
                text.textContent = labels['AnnotationDisplayShownIn'].replace('%s', shownIn.join(', '));
            } else {
                text.className = 'message active';
                text.textContent = labels[canShow ? 'MessageAnnotationDisplayFiltered' : 'MessageAnnotationDisplayNoViews'];
            }

            info.append(text, renderOpenEditorButton());

            element.replaceChildren(layout, info);

        }

        refresh();

        return { element: element, refresh: refresh };

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
     * I return the data of all ContentViews in all LayoutAreas: what a save writes as config.layoutArea. An
     * optional area (the companion and the circular area) is there once it has been stored or has a view, so a
     * hypervideo that never had one is written as it was. Keys I do not know, such as the areas of a later
     * version, are carried over as they were stored.
     *
     * @method getLayoutAreaData
     * @return {Object} layoutAreaData
     */
    function getLayoutAreaData() {

        var stored = configLayoutArea || {},
            layoutAreaData = {};

        AREAS.forEach(function(area) {
            if (area.optional && !contentViews[area.name].length && !Array.isArray(stored[area.key])) {
                return;
            }
            layoutAreaData[area.key] = contentViews[area.name].map(function(contentView) {
                return contentView.contentViewData;
            });
        });

        Object.keys(stored).forEach(function(key) {
            var known = AREAS.some(function(area) { return area.key === key; });
            if (!known) { layoutAreaData[key] = stored[key]; }
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

        initLayoutEditor: initLayoutEditor,

        renderOpenEditorButton:  renderOpenEditorButton,
        renderLayoutDiagram:     renderLayoutDiagram,
        renderAnnotationDisplay: renderAnnotationDisplay,

        reorderContentView:  reorderContentView,

        updateHiddenTabs: updateHiddenTabs,

        getLayoutAreaData: getLayoutAreaData,

        circularGeometry: circularGeometry,

    };

});
