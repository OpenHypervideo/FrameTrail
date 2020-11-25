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

	var configLayoutArea,

		/*
		areaTopContainer,
		areaTopDetails,

		areaBottomContainer,
		areaBottomDetails,

		areaLeftContainer,
		areaRightContainer,
		*/

		contentViewsTop     = [],
		contentViewsBottom  = [],
		contentViewsLeft    = [],
		contentViewsRight   = [],

		managedAnnotations  = [],
		managedOverlays     = [],

		HypervideoLayoutContainer = FrameTrail.module('ViewVideo').HypervideoLayoutContainer,
		Hypervideo = FrameTrail.module('Database').hypervideo;


	function create() {

		configLayoutArea = FrameTrail.module('Database').hypervideo.config.layoutArea;

		/*
		areaTopContainer    = FrameTrail.module('ViewVideo').AreaTopContainer;
		areaTopDetails      = FrameTrail.module('ViewVideo').AreaTopDetails;
		areaBottomContainer = FrameTrail.module('ViewVideo').AreaBottomContainer;
		areaBottomDetails   = FrameTrail.module('ViewVideo').AreaBottomDetails;
		areaLeftContainer   = FrameTrail.module('ViewVideo').AreaLeftContainer;
		areaRightContainer  = FrameTrail.module('ViewVideo').AreaRightContainer;
		*/

		for (var i in configLayoutArea.areaTop) {
			contentViewsTop.push(
				new FrameTrail.newObject('ContentView',
					configLayoutArea.areaTop[i],
					'top'));
		}

		for (var i in configLayoutArea.areaBottom) {
			contentViewsBottom.push(
				new FrameTrail.newObject('ContentView',
					configLayoutArea.areaBottom[i],
					'bottom'));
		}

		for (var i in configLayoutArea.areaLeft) {
			contentViewsLeft.push(
				new FrameTrail.newObject('ContentView',
					configLayoutArea.areaLeft[i],
					'left'));
		}

		for (var i in configLayoutArea.areaRight) {
			contentViewsRight.push(
				new FrameTrail.newObject('ContentView',
					configLayoutArea.areaRight[i],
					'right'));
		}

		updateLayoutAreaVisibility();

		updateManagedContent();

	}


	function updateLayoutAreaVisibility() {

		FrameTrail.changeState('hv_config_areaTopVisible', (contentViewsTop.length != 0));
        FrameTrail.changeState('hv_config_areaBottomVisible', (contentViewsBottom.length != 0));
        FrameTrail.changeState('hv_config_areaLeftVisible', (contentViewsLeft.length != 0));
        FrameTrail.changeState('hv_config_areaRightVisible', (contentViewsRight.length != 0));

	}


	function createContentView(whichArea, templateContentViewData, renderPreview) {

		var arrayOfContentViews = ({
			'top': contentViewsTop,
			'bottom': contentViewsBottom,
			'left': contentViewsLeft,
			'right': contentViewsRight
		})[whichArea];

		if (!Array.isArray(arrayOfContentViews)) {
			throw new Error('whichArea is string top/bottom/left/right');
		}

		var newContentView = new FrameTrail.newObject('ContentView', templateContentViewData, whichArea)

		arrayOfContentViews.push(newContentView);

		configLayoutArea[({
			'top': 'areaTop',
			'bottom': 'areaBottom',
			'left': 'areaLeft',
			'right': 'areaRight'
		})[whichArea]].push(newContentView.contentViewData);

		updateManagedContent();

		if (renderPreview) {
			newContentView.renderContentViewPreview(true);
		}

		updateLayoutAreaVisibility();

	}


	function removeContentView(contentViewToRemove) {

		var layoutAreaToRemovefrom = ({
			'top': contentViewsTop,
			'bottom': contentViewsBottom,
			'left': contentViewsLeft,
			'right': contentViewsRight
		})[contentViewToRemove.whichArea];

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

		FrameTrail.module('HypervideoModel').newUnsavedChange('layout');

	}


	function updateManagedContent() {

		managedAnnotations = [];
		managedOverlays    = [];

		var contentViewAreas = [
			contentViewsTop, contentViewsBottom, contentViewsLeft, contentViewsRight
		];

		for (var a in contentViewAreas) {
			for (var i in contentViewAreas[a]) {
				var contentView = contentViewAreas[a][i];
				//console.log(contentView.whichArea, contentView.contentCollection);
				for (var k in contentView.contentCollection) {
					var item = contentView.contentCollection[k];
					if (item.overlayElement) {
						managedOverlays.push([item, contentView]);
					} else {
						managedAnnotations.push([item, contentView]);
					}
				}
			}
		}

		//console.log(managedAnnotations);

	}


	function updateContentInContentViews() {
		var contentViewAreas = [
			contentViewsTop, contentViewsBottom, contentViewsLeft, contentViewsRight
		];

		for (var a in contentViewAreas) {
			for (var i in contentViewAreas[a]) {
				var contentView = contentViewAreas[a][i];
				contentView.updateContent();
			}
		}

		var currentTime = FrameTrail.module('HypervideoController').currentTime;
		updateTimedStateOfContentViews(currentTime);
	}


	function updateTimedStateOfContentViews(currentTime) {

		var self = this;

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

		for (var i in contentViewsTop) {
			contentViewsTop[i].updateTimedStateOfContentViews(currentTime);
		}
		for (var i in contentViewsBottom) {
			contentViewsBottom[i].updateTimedStateOfContentViews(currentTime);
		}
		for (var i in contentViewsLeft) {
			contentViewsLeft[i].updateTimedStateOfContentViews(currentTime);
		}
		for (var i in contentViewsRight) {
			contentViewsRight[i].updateTimedStateOfContentViews(currentTime);
		}

	}


	function initLayoutManager() {
		var domElement = $('<div class="layoutManagerContainer">'
						+  '    <div class="layoutManagerMain">'
						+  '        <div class="layoutManager">'
						+  '            <div data-area="areaTop" class="layoutArea">'
						+  '                <div class="layoutAreaTabs"></div>'
						+  '                <div class="layoutAreaContent"></div>'
						+  '            </div>'
						+  '            <div class="playerWrapper">'
						+  '                <div data-area="areaLeft" class="layoutArea">'
						+  '                    <div class="layoutAreaTabs"></div>'
						+  '                    <div class="layoutAreaContent"></div>'
						+  '                </div>'
						+  '                <div class="playerArea">'
						+  '                    <span class="icon-play-1"></span>'
						+  '                </div>'
						+  '                <div data-area="areaRight" class="layoutArea">'
						+  '                    <div class="layoutAreaTabs"></div>'
						+  '                    <div class="layoutAreaContent"></div>'
						+  '                </div>'
						+  '            </div>'
						+  '            <div data-area="areaBottom" class="layoutArea">'
						+  '                <div class="layoutAreaTabs"></div>'
						+  '                <div class="layoutAreaContent"></div>'
						+  '            </div>'
						+  '        </div>'
						+  '    </div>'
						+  '    <div class="layoutManagerOptions">'
						+  '        <div class="message active">'+ labels['MessageLayoutManagerDropContentViews'] +'</div>'
						+  '        <div class="contentViewTemplate" data-type="TimedContent" data-size="small">'
						+  '            <div class="contentViewTemplateType"><span class="icon-docs">'+ labels['GenericAnnotationCollection'] +'</span></div>'
						+  '            <div class="contentViewTemplateSize"><span class="icon-coverflow"></span></div>'
						+  '        </div>'
						+  '        <div class="contentViewTemplate" data-type="TimedContent" data-size="medium">'
						+  '            <div class="contentViewTemplateType"><span class="icon-docs">'+ labels['GenericAnnotationCollection'] +'</span></div>'
						+  '            <div class="contentViewTemplateSize"><span class="icon-coverflow"></span></div>'
						+  '        </div>'
						+  '        <div class="contentViewTemplate" data-type="TimedContent" data-size="large">'
						+  '            <div class="contentViewTemplateType"><span class="icon-docs">'+ labels['GenericAnnotationCollection'] +'</span></div>'
						+  '            <div class="contentViewTemplateSize"><span class="icon-coverflow"></span></div>'
						+  '        </div>'
						+  '        <div class="contentViewTemplate" data-type="CustomHTML" data-size="medium">'
						+  '            <div class="contentViewTemplateType"><span class="icon-file-code">'+ labels['GenericCustomHTML'] +'</span></div>'
						+  '        </div>'
						+  '        <div class="contentViewTemplate" data-type="Transcript" data-size="large">'
						+  '            <div class="contentViewTemplateType"><span class="icon-doc-text">'+ labels['GenericTextTranscript'] +'</span></div>'
						+  '        </div>'
						+  '        <div class="contentViewTemplate" data-type="Timelines" data-size="large">'
						+  '            <div class="contentViewTemplateType"><span class="icon-doc-text">'+ labels['GenericTimelines'] +'</span></div>'
						+  '        </div>'
						+  '    </div>'
						+  '</div>'),

		LayoutManager        = domElement.find('.layoutManager'),
		LayoutManagerOptions = domElement.find('.layoutManagerOptions'),
		self = this;

		HypervideoLayoutContainer.append(domElement);

		LayoutManagerOptions.find('.contentViewTemplate').draggable({
			containment: domElement,
			snapTolerance: 10,
			appendTo: 		'body',
			helper: 		'clone',
			revert: 		'invalid',
			revertDuration: 100,
			distance: 		10,
			zIndex: 		1000,
			start: function(event, ui) {
				ui.helper.width($(event.target).width());
			}
		});

		LayoutManager.find('.layoutAreaContent').droppable({
			accept: '.contentViewTemplate, .contentViewPreview',
			activeClass: 'droppableActive',
			hoverClass: 'droppableHover',
			tolerance: 'pointer',
			drop: function( event, ui ) {

				var layoutArea = $(event.target).parent().data('area'),
					contentAxis = (layoutArea == 'areaTop' || layoutArea == 'areaBottom') ? 'x' : 'y',
					templateContentViewData = {
						'type': ui.helper.data('type'),
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
						'transcriptSource': '',
						'mode': 'slide',
						'axis': contentAxis,
						'contentSize': ui.helper.data('size') || '',
						'autoSync': false,
						'onClickContentItem': ''
					};

				var whichArea = layoutArea.split('area')[1].toLowerCase(),
					renderPreview = true;

				createContentView(whichArea, templateContentViewData, renderPreview);

				FrameTrail.module('HypervideoModel').newUnsavedChange('layout');

			}

		});

		initLayoutAreaPreview(contentViewsTop);
		initLayoutAreaPreview(contentViewsBottom);
		initLayoutAreaPreview(contentViewsLeft);
		initLayoutAreaPreview(contentViewsRight);



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
	 * I return the data of all ContentViews in all LayoutAreas.
	 *
	 * @method getLayoutAreaData
	 * @return {Object} layoutAreaData
	 */
	function getLayoutAreaData() {

		var layoutAreaData = {
			'areaTop': (function() {
				var contentViewDataTop = [];
				for (var i=0; i<contentViewsTop.length; i++) {
					contentViewDataTop.push(contentViewsTop[i].contentViewData);
				}
				return contentViewDataTop;
			})(),
			'areaBottom': (function() {
				var contentViewDataBottom = [];
				for (var i=0; i<contentViewsBottom.length; i++) {
					contentViewDataBottom.push(contentViewsBottom[i].contentViewData);
				}
				return contentViewDataBottom;
			})(),
			'areaLeft': (function() {
				var contentViewDataLeft = [];
				for (var i=0; i<contentViewsLeft.length; i++) {
					contentViewDataLeft.push(contentViewsLeft[i].contentViewData);
				}
				return contentViewDataLeft;
			})(),
			'areaRight': (function() {
				var contentViewDataRight = [];
				for (var i=0; i<contentViewsRight.length; i++) {
					contentViewDataRight.push(contentViewsRight[i].contentViewData);
				}
				return contentViewDataRight;
			})()
		}

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

        for (var i in contentViewsTop) {
			contentViewsTop[i].updateLayout();
		}
		for (var i in contentViewsBottom) {
			contentViewsBottom[i].updateLayout();
		}
		for (var i in contentViewsLeft) {
			contentViewsLeft[i].updateLayout();
		}
		for (var i in contentViewsRight) {
			contentViewsRight[i].updateLayout();
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
			for (var i in contentViewsTop) {
				contentViewsTop[i].updateCollectionSlider(true);
			}
		} else if ( FrameTrail.module('ViewVideo').shownDetails == 'bottom' ) {
			for (var i in contentViewsBottom) {
				contentViewsBottom[i].updateCollectionSlider(true);
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

    	// TODO: find way to avoid jQuery selector
    	if ( newState == 'middle' ) {
    		$(FrameTrail.getState('target')).find('.viewVideo').find('.collectionElement.open').removeClass('open');
    	}

    }



	return {

		onChange: {
            viewSize:        changeViewSize,
            viewSizeChanged: onViewSizeChanged,
            sidebarOpen: 	 toggleSidebarOpen,
            viewMode: 		 toggleViewMode,
            slidePosition:   onChangeSlidePosition
        },

		create: create,

		createContentView: createContentView,
		removeContentView: removeContentView,

		updateManagedContent: updateManagedContent,

		updateContentInContentViews: updateContentInContentViews,
		adjustContentViewLayout: adjustContentViewLayout,

		updateTimedStateOfContentViews: updateTimedStateOfContentViews,

		initLayoutManager: initLayoutManager,

		getLayoutAreaData: getLayoutAreaData,

		/*
		get areaTopContainer()      { return areaTopContainer; },
		get areaTopDetails()        { return areaTopDetails; },
		get areaBottomContainer()   { return areaBottomContainer; },
		get areaBottomDetails()     { return areaBottomDetails; },
		get areaLeftContainer()     { return areaLeftContainer; },
		get areaRightContainer()    { return areaRightContainer; }
		*/
	};

});
