/**
 * @module Player
 */


/**
 * I am the ContentView, i display a filtered collection of annotations or overlays.
 *
 * @class ContentView
 * @category TypeDefinition
 */


FrameTrail.defineType(

    'ContentView',

    function (FrameTrail) {

        function _generateSchematic(type, size, axis, thumbnail, maxCards) {
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
            }

            return schematic;
        }

        return {
            constructor: function (contentViewData, whichArea) {

                this.labels = FrameTrail.module('Localization').labels;

                contentViewData.type                   =  contentViewData.type || "TimedContent";
                contentViewData.name                   =  contentViewData.name || "";
                contentViewData.icon                   =  contentViewData.icon || "";
                contentViewData.cssClass               = contentViewData.cssClass || "";
                contentViewData.html                   = contentViewData.html || "";
                    contentViewData.collectionFilter   = contentViewData.collectionFilter || {};
                    contentViewData.collectionFilter.tags  = contentViewData.collectionFilter.tags  || [];
                    contentViewData.collectionFilter.types = contentViewData.collectionFilter.types || [];
                    contentViewData.collectionFilter.text  = contentViewData.collectionFilter.text  || "";
                    contentViewData.collectionFilter.users = contentViewData.collectionFilter.users || [];
                contentViewData.transcriptSource       = contentViewData.transcriptSource || "";
                contentViewData.contentSize            = contentViewData.contentSize || "small";
                contentViewData.onClickContentItem     = contentViewData.onClickContentItem || "";
                contentViewData.initClosed             = contentViewData.initClosed || false;
                contentViewData.filterAspect           = contentViewData.filterAspect || "creatorId";
                contentViewData.zoomControls           = contentViewData.zoomControls || false;

                this.contentViewData = contentViewData;

                this.previousContentSize = this.contentViewData.contentSize;

                this.isMouseOver = false;

                this.whichArea = whichArea;

                this.contentCollection = [];

                this.appendDOMElement();

                this.updateContent();

            },
            prototype: {
                whichArea: null,
                contentViewData:    null,
                contentCollection: null,
                _AREA_KEYS: { top: 'Top', bottom: 'Bottom', left: 'Left', right: 'Right' },


                _getFilteredCollection: function() {
                    var f = this.contentViewData.collectionFilter;
                    return FrameTrail.module('TagModel').getContentCollection(
                        f.tags, false, true, f.users, f.text, f.types
                    );
                },

                _clearContentCollection: function() {
                    var self = this;
                    self.contentCollection.forEach(function(contentItem) {
                        self.removeContentCollectionElements(contentItem);
                    });
                    self.contentCollection = [];
                },

                updateContent: function(suppressViewSizeChange) {

                    var self = this;

                    self.contentViewTab.setAttribute('data-type', self.contentViewData.type);
                    self.contentViewTab.querySelector('.contentViewTabName').innerHTML =
                        self.contentViewData.icon ? '<span class="'+ self.contentViewData.icon +'">'+ self.contentViewData.name +'</span>' : self.contentViewData.name;

                    self.contentViewContainer.setAttribute('data-type', self.contentViewData.type);
                    self.contentViewContainer.setAttribute('data-size', self.contentViewData.contentSize);

                    // Sync cssClass on container
                    if (self._prevCssClass && self._prevCssClass !== self.contentViewData.cssClass) {
                        self.contentViewContainer.classList.remove(self._prevCssClass);
                    }
                    if (self.contentViewData.cssClass) {
                        self.contentViewContainer.classList.add(self.contentViewData.cssClass);
                    }
                    self._prevCssClass = self.contentViewData.cssClass;

                    if (self.contentViewData.initClosed) {
                        self.getLayoutAreaContainer().classList.add('closed');
                    }

                    switch (this.contentViewData.type) {

                        case 'TimedContent':

                            self.contentViewContainer.querySelectorAll('.customhtmlContainer, .transcriptContainer').forEach(function(el) { el.remove(); });

                            if (!self.contentViewData.collectionFilter) {
                                return;
                            }

                            var old_contentCollection = self.contentCollection;

                            self.contentCollection = self._getFilteredCollection();

                            if ( (this.previousContentSize == 'large' && this.contentViewData.contentSize != 'large') ||
                                 (this.previousContentSize != 'large' && this.contentViewData.contentSize == 'large') ) {

                                old_contentCollection.forEach(function (contentItem) {
                                    self.removeContentCollectionElements(contentItem);
                                });

                                self.contentCollection.forEach(function (contentItem) {
                                    var indexOfItem = self.contentCollection.indexOf(contentItem);
                                    self.appendContentCollectionElements(contentItem, indexOfItem);
                                });

                                this.previousContentSize = this.contentViewData.contentSize;

                            } else {

                                old_contentCollection.filter(function(contentItem) {
                                    return 0 > self.contentCollection.indexOf(contentItem)
                                }).forEach(function(contentItem) {
                                    self.removeContentCollectionElements(contentItem);
                                });

                                self.contentCollection.filter(function(contentItem) {
                                    return 0 > old_contentCollection.indexOf(contentItem)
                                }).forEach(function (contentItem) {
                                    var indexOfItem = self.contentCollection.indexOf(contentItem);
                                    self.appendContentCollectionElements(contentItem, indexOfItem);
                                });

                            }

                            break;

                        case 'CustomHTML':

                            self._clearContentCollection();

                            var _cvContents = self.contentViewContainer.querySelector('.contentViewContents');
                            var existingContainer = _cvContents.querySelector('.customhtmlContainer');

                            // Skip rebuild if the source HTML hasn't changed since last render.
                            // This preserves DOM elements dynamically created by onReady/custom scripts.
                            if (existingContainer && self._lastCustomHTML === self.contentViewData.html) {
                                break;
                            }

                            var htmlChanged = (self._lastCustomHTML !== undefined && self._lastCustomHTML !== self.contentViewData.html);
                            self._lastCustomHTML = self.contentViewData.html;

                            var customhtmlContainer = document.createElement('div');
                            customhtmlContainer.className = 'customhtmlContainer';
                            customhtmlContainer.innerHTML = self.contentViewData.html;

                            _cvContents.innerHTML = '';
                            _cvContents.appendChild(customhtmlContainer);

                            customhtmlContainer.addEventListener('click', function(evt) {
                                if ( evt.target.classList.contains('timebased') ) {
                                    // Don't seek when the click concludes a text selection,
                                    // so users can select transcript text without the video jumping.
                                    var selection = window.getSelection();
                                    if (selection && !selection.isCollapsed && selection.toString().length > 0) {
                                        return;
                                    }
                                    FrameTrail.module('HypervideoController').currentTime = parseFloat(evt.target.getAttribute('data-start')) + 0.05;
                                }
                            });

                            // Re-fire onReady when HTML source changed so dynamic content is recreated
                            if (htmlChanged) {
                                var HypervideoModel = FrameTrail.module('HypervideoModel');
                                if (HypervideoModel.events.onReady) {
                                    try {
                                        var readyEvent = new Function('FrameTrail', 'hypervideo', HypervideoModel.events.onReady);
                                        readyEvent(FrameTrail, FrameTrail.module('HypervideoController'));
                                    } catch (e) {
                                        console.warn('onReady handler error after CustomHTML update: ' + e.message);
                                    }
                                }
                            }

                            break;

                        case 'Transcript':

                            self._clearContentCollection();

                            var transcriptContainer = document.createElement('div');
                            transcriptContainer.className = 'transcriptContainer';

                            var _cvContents2 = self.contentViewContainer.querySelector('.contentViewContents');
                            _cvContents2.innerHTML = '';
                            _cvContents2.appendChild(transcriptContainer);

                            var subtitles = FrameTrail.module('Database').subtitles[self.contentViewData.transcriptSource];
                            if ( subtitles ) {
                                for (var i=0; i<subtitles.cues.length; i++) {
                                    var cueElement = document.createElement('span');
                                    cueElement.setAttribute('data-start', subtitles.cues[i].startTime);
                                    cueElement.setAttribute('data-end', subtitles.cues[i].endTime);
                                    cueElement.textContent = subtitles.cues[i].text + ' ';
                                    transcriptContainer.appendChild(cueElement);
                                }
                            }

                            transcriptContainer.addEventListener('click', function(evt) {
                                // Don't seek when the click concludes a text selection,
                                // so users can select transcript text without the video jumping.
                                var selection = window.getSelection();
                                if (selection && !selection.isCollapsed && selection.toString().length > 0) {
                                    return;
                                }
                                var start = evt.target.getAttribute('data-start');
                                if (start === null) return;
                                FrameTrail.module('HypervideoController').currentTime = parseFloat(start) + 0.05;
                            });


                            break;

                        case 'Timelines':

                            self._clearContentCollection();

                            self.contentCollection = self._getFilteredCollection();

                            var timelinesContainer = document.createElement('div');
                            timelinesContainer.className = 'timelinesContainer';
                            var timelineList = document.createElement('div');
                            timelineList.className = 'timelineList';
                            timelineList.setAttribute('data-zoom-level', '1');

                            //TODO: remove timeout (needed right now because video duration is not known)
                            //window.setTimeout(function() {
                                FrameTrail.module('AnnotationsController').renderAnnotationTimelines(self.contentCollection, timelineList, self.contentViewData.filterAspect, 'label', self.contentViewData.zoomControls);

                                timelinesContainer.append(timelineList);

                                var _cvContents3 = self.contentViewContainer.querySelector('.contentViewContents');
                                _cvContents3.innerHTML = '';
                                _cvContents3.appendChild(timelinesContainer);
                            //}, 2000);
                            

                            timelinesContainer.addEventListener('click', function(evt) {
                                if ( evt.target.classList.contains('timebased') ) {
                                    FrameTrail.module('HypervideoController').currentTime = evt.target.getAttribute('data-start') - 0.5;
                                }
                            });

                            break;

                    }

                    FrameTrail.module('ViewLayout').updateManagedContent();
                    FrameTrail.module('ViewLayout').updateHiddenTabs();

                    window.setTimeout(function() {
                        self.resizeLayoutArea(false, suppressViewSizeChange);
                    }, 50);

                },


                appendContentCollectionElements: function(contentItem, appendAtIndex) {
                    
                    var collectionElement = document.createElement('div');
                    collectionElement.className = 'collectionElement';
                    var self = this;

                    if ( self.contentViewData.onClickContentItem.length != 0 ) {
                        collectionElement.addEventListener('click', function() {
                            try {
                                var thisFunction = new Function('FrameTrail', 'hypervideo', self.contentViewData.onClickContentItem);
                                thisFunction.call(contentItem, FrameTrail, FrameTrail.module('HypervideoController'));
                            } catch (exception) {
                                // could not parse and compile JS code!
                                console.warn(self.labels['MessageEventHandlerContainsErrors']+ ': '+ exception.message);
                            }
                        });
                    }

                    if ( self.contentViewData.contentSize == 'large' ) {
                        collectionElement.appendChild(contentItem.resourceItem.renderContent());
                    } else {
                        collectionElement.appendChild(contentItem.resourceItem.renderThumb());
                    }

                    self.appendElementAtIndex(self.contentViewContainer.querySelector('.contentViewContents'), collectionElement, appendAtIndex);
                    contentItem.contentViewElements.push(collectionElement);

                    // Append Detail Element if contentView size is not large
                    // (otherwise Details are already shown)
                    // ONLY APPLY TO TOP & BOTTOM DETAILS
                    if ( self.contentViewData.contentSize != 'large' && (self.whichArea == 'top' || self.whichArea == 'bottom') ) {

                        var detailElement = document.createElement('div');
                        detailElement.className = 'collectionElement';

                        detailElement.appendChild(contentItem.resourceItem.renderContent());

                        self.appendElementAtIndex(self.contentViewDetailsContainer.querySelector('.contentViewDetailsContents'), detailElement, appendAtIndex);
                        contentItem.contentViewDetailElements.push(detailElement);

                        collectionElement.addEventListener('click', function() {
                            if ( !this.classList.contains('open') ) {
                                Array.from(this.parentElement.children).forEach(function(s) { if (s.classList.contains('collectionElement')) s.classList.remove('open'); });
                                self.contentViewDetailsContainer.querySelectorAll('.collectionElement').forEach(function(el) { el.classList.remove('open'); });

                                this.classList.add('open');
                                var _idx = Array.from(this.parentElement.children).indexOf(this);
                                var _detailEls = self.contentViewDetailsContainer.querySelectorAll('.collectionElement');
                                if (_detailEls[_idx]) _detailEls[_idx].classList.add('open');

                                FrameTrail.module('ViewVideo').shownDetails = self.whichArea;

                                requestAnimationFrame(function() {
                                    self.updateCollectionSlider(true);
                                });

                                var annoData = contentItem.data;
                                FrameTrail.triggerEvent('userAction', {
                                    action: 'AnnotationOpen',
                                    annotation: annoData
                                });

                            } else {
                                this.classList.remove('open');
                                self.contentViewDetailsContainer.querySelectorAll('.collectionElement').forEach(function(el) { el.classList.remove('open'); });
                                FrameTrail.module('ViewVideo').shownDetails = null;
                            }
                        });
                    }

                    if ( self.whichArea == 'left' || self.whichArea == 'right' ) {
                        collectionElement.addEventListener('click', function() {
                            if ( self.contentViewData.contentSize == 'small' || self.contentViewData.contentSize == 'medium' ) {
                                var _btn = this.querySelector('.resourcePreviewButton');
                                if (_btn) _btn.click();

                                var annoData = contentItem.data;
                                FrameTrail.triggerEvent('userAction', {
                                    action: 'AnnotationOpen',
                                    annotation: annoData
                                });
                            }
                        });
                    }

                },

                appendElementAtIndex: function(targetElement, element, index) {
                    if(index === 0) {
                        targetElement.prepend(element);
                    } else {
                        var _ref = Array.from(targetElement.children)[index-1];
                        if (_ref) _ref.after(element);
                        else targetElement.appendChild(element);
                    }
                },

                removeContentCollectionElements: function(contentItem) {
                    // TODO
                    // single item (like an annotation)
                    // console.log(contentItem);

                    // TODO: CHECK WHY contentItem is sometimes undefined !!!

                    if (contentItem) {

                        var contentViewElement = this.getContentViewElementFromContentItem(contentItem);

                        if ( contentViewElement ) {

                            contentItem.contentViewElements.splice(
                                contentItem.contentViewElements.indexOf(contentViewElement),
                                1
                            );

                            contentViewElement.remove();

                        }

                        var detailElement = this.getDetailElementFromContentItem(contentItem);

                        if ( detailElement ) {

                            contentItem.contentViewDetailElements.splice(
                                contentItem.contentViewDetailElements.indexOf(detailElement),
                                1
                            );

                            detailElement.remove();

                        }

                    }

                },


                getContentViewElementFromContentItem: function(contentItem) {
                    for (var i=0; i<contentItem.contentViewElements.length; i++) {
                        if ( this.contentViewContainer.contains(contentItem.contentViewElements[i]) ) {
                            return contentItem.contentViewElements[i];
                        }
                    }

                    return null;
                },


                getDetailElementFromContentItem: function(contentItem) {
                    if (!this.contentViewDetailsContainer) return null;
                    for (var i=0; i<contentItem.contentViewDetailElements.length; i++) {
                        if ( this.contentViewDetailsContainer.contains(contentItem.contentViewDetailElements[i]) ) {
                            return contentItem.contentViewDetailElements[i];
                        }
                    }

                    return null;
                },


                appendDOMElement: function() {
                    // TODO
                    // append contentView to layoutArea
                    //
                    // switch (this.whichArea) {
                    //     case 'top':
                    //
                    //         // store in this object
                    //         this.myDetailView = $('<div>....</div>')
                    //         this.myContainerView = $('<div>....</div>')
                    //
                    //         FrameTrail.module('ViewLayout').areaTopContainer.append(this.myContainerView);
                    //         FrameTrail.module('ViewLayout').areaTopDetails.append(this.myDetailView);
                    //
                    //
                    //         break;
                    //     case 'bottom':
                    //         FrameTrail.module('ViewLayout').areaBottomContainer.......
                    //         FrameTrail.module('ViewLayout').areaBottomDetails........
                    //
                    //         break;
                    //     case 'left':
                    //         FrameTrail.module('ViewLayout').areaLeftContainer........
                    //
                    //         break;
                    //     case 'right':
                    //         FrameTrail.module('ViewLayout').areaRightContainer........
                    //
                    //         break;
                    // }

                    // Append ContentView Containers
                    var contentViewTab = this.renderContentViewTab(),
                        contentViewContainer = this.renderContentViewContainer(),
                        areaContainer = this.getLayoutAreaContainer();

                    var self = this;
                    contentViewContainer.addEventListener('mouseenter', function() {
                        self.isMouseOver = true;
                    });
                    contentViewContainer.addEventListener('mouseleave', function() {
                        self.isMouseOver = false;
                    });

                    // Suppress programmatic scrolling during user-initiated scroll/touch
                    var scrollContainer = contentViewContainer.querySelector('.contentViewScroll');
                    if (scrollContainer) {
                        var userScrollTimeout;
                        scrollContainer.addEventListener('scroll', function() {
                            if (self._isProgrammaticScroll) return;
                            self.isMouseOver = true;
                            clearTimeout(userScrollTimeout);
                            userScrollTimeout = setTimeout(function() {
                                if (!scrollContainer.matches(':hover')) {
                                    self.isMouseOver = false;
                                }
                            }, 2000);
                        }, { passive: true });
                    }

                    this.contentViewTab = contentViewTab;
                    this.contentViewContainer = contentViewContainer;

                    areaContainer.querySelector('.layoutAreaTabs').appendChild(contentViewTab);
                    areaContainer.querySelector('.layoutAreaContent').appendChild(contentViewContainer);

                    // Append Details Containers (only for top/bottom areas)
                    if (this.whichArea == 'top' || this.whichArea == 'bottom') {
                        var contentViewDetailsContainer = this.renderContentViewDetailsContainer(),
                            areaDetailsContainer = this.getLayoutAreaDetailsContainer();

                        this.contentViewDetailsContainer = contentViewDetailsContainer;

                        areaDetailsContainer.appendChild(contentViewDetailsContainer);
                    }

                    this.activateContentView();

                },


                removeDOMElement: function() {
                    // TODO
                    // remove contentView from layoutArea [this.whichArea]
                    //         this.myDetailView = $('<div>....</div>')
                    //         this.myContainerView = $('<div>....</div>')
                    this.contentViewContainer.remove();
                    this.contentViewTab.remove();
                    if (this.contentViewDetailsContainer) {
                        this.contentViewDetailsContainer.remove();
                    }

                    if (this.contentViewPreviewElement) {
                        this.contentViewPreviewElement.remove();
                    }

                    if (this.contentViewPreviewTab) {
                        this.contentViewPreviewTab.remove();
                    }
                },


                updateTimedStateOfContentViews: function(currentTime) {
                    // console.log('updateTimedStateOfContentViews', this, currentTime);

                    var self = this;

                    function scrollActiveElement(container, activeSelector) {
                        if (!container || self.isMouseOver) { return; }
                        if (!self.contentViewContainer.classList.contains('active')) { return; }
                        var firstActiveElement = container.querySelector(activeSelector);
                        if (!firstActiveElement) { return; }
                        var containerRect = container.getBoundingClientRect();
                        var elementRect = firstActiveElement.getBoundingClientRect();
                        var elementCenter = (elementRect.top + elementRect.bottom) / 2 - containerRect.top + container.scrollTop - 10;
                        var scrollTarget = elementCenter - container.clientHeight / 2;
                        container.scrollTo({ top: Math.max(0, scrollTarget), behavior: 'smooth' });
                    }

                    switch (self.contentViewData.type) {
                        case 'TimedContent':
                            // Annotations are already updated by ViewLayout module!

                            if (!self.isMouseOver) {
                                self.updateCollectionSlider();
                            }

                            break;
                        case 'CustomHTML':

                            var timebasedElements = self.contentViewContainer.querySelectorAll('.customhtmlContainer .timebased');

                            if ( timebasedElements.length != 0 ) {
                                timebasedElements.forEach(function(el) {
                                    var startTime = parseFloat(el.getAttribute('data-start')),
                                        endTime = parseFloat(el.getAttribute('data-end'));
                                    if ( startTime-0.5 <= currentTime && endTime-0.5 >= currentTime ) {
                                        if ( !el.classList.contains('active') ) {
                                            el.classList.add('active');
                                            var timebasedTabParent = el.closest('.tab-pane.timebasedTab');
                                            scrollActiveElement(
                                                timebasedTabParent || self.contentViewContainer.querySelector('.customhtmlContainer'),
                                                '.timebased.active'
                                            );
                                        }
                                    } else if ( el.classList.contains('active') ) {
                                        el.classList.remove('active');
                                    }
                                });
                            }

                            break;
                        case 'Transcript':

                            var transcriptElements = self.contentViewContainer.querySelectorAll('.transcriptContainer span');

                            if ( transcriptElements.length != 0 ) {
                                transcriptElements.forEach(function(el) {
                                    var startTime = parseFloat(el.getAttribute('data-start')),
                                        endTime = parseFloat(el.getAttribute('data-end'));
                                    if ( startTime-0.5 <= currentTime && endTime-0.5 >= currentTime ) {
                                        if ( !el.classList.contains('active') ) {
                                            el.classList.add('active');
                                            scrollActiveElement(
                                                self.contentViewContainer.querySelector('.transcriptContainer'),
                                                'span.active'
                                            );
                                        }
                                    } else if ( el.classList.contains('active') ) {
                                        el.classList.remove('active');
                                    }
                                });
                            }

                            break;

                        case 'Timelines':
                            
                            var HypervideoModel = FrameTrail.module('HypervideoModel'),
                                timeWithOffset = currentTime-HypervideoModel.offsetIn,
                                timePercent = 100 * (timeWithOffset / HypervideoModel.duration);
                                
                            var _tlRange = self.contentViewContainer.querySelector('.timelineProgressRange');
                            if (_tlRange) _tlRange.style.width = timePercent + '%';

                            break;
                    }


                },


                updateLayout: function() {

                    var self = this;
                        HypervideoDuration = FrameTrail.module('HypervideoModel').duration;

                    //console.log(HypervideoDuration);

                    if (!self.contentViewContainer.classList.contains('active')) {
                        return;
                    }

                    if ( HypervideoDuration != 0  ) {
                        switch (self.contentViewData.contentSize) {
                            case 'small':
                                self.distributeElements();
                                break;
                            case 'medium':
                                self.distributeElements();
                                break;
                            case 'large':
                                // full view update
                                break;
                        }
                    }



                    if ( self.contentViewData.type == 'Timelines' ) {
                        self.updateCompareTimelineItems();
                    }

                    self.scaleDetailElements();

                    self.updateCollectionSlider();

                },


                updateCompareTimelineItems: function() {
                    var self = this;
                        HypervideoDuration = FrameTrail.module('HypervideoModel').duration,
                        timelineList = self.contentViewContainer.querySelector('.timelineList');

                    if (HypervideoDuration && timelineList && !timelineList.classList.contains('initialized')) {
                        
                        var timelineItems = timelineList.querySelectorAll('.compareTimelineElement');

                        timelineItems.forEach(function(el) {
                            var originTimeStart = parseFloat(el.dataset.start),
                                originTimeEnd   = parseFloat(el.dataset.end),
                                timeStart       = originTimeStart - FrameTrail.module('HypervideoModel').offsetIn,
                                timeEnd         = originTimeEnd - FrameTrail.module('HypervideoModel').offsetOut;
                                positionLeft    = 100 * (timeStart / HypervideoDuration),
                                width           = 100 * ((originTimeEnd - originTimeStart) / HypervideoDuration);

                            el.style.left  = positionLeft + '%';
                            el.style.width = width + '%';

                            el.classList.remove('previewPositionLeft', 'previewPositionRight');

                            if (positionLeft < 10 && width < 10) {
                                el.classList.add('previewPositionLeft');
                            } else if (positionLeft > 90) {
                                el.classList.add('previewPositionRight');
                            }
                        });

                        timelineList.classList.add('initialized');
                    }
                    

                },


                /**
                 * I render a ContentView Preview.
                 * If startEditing is set to true, editContentView is called
                 * right after rendering.
                 *
                 * @method renderContentViewPreview
                 * @param {Boolean} startEditing
                 */
                renderContentViewPreview: function(startEditing) {
                    var self = this;
                        contentViewPreviewTab = self.renderContentViewPreviewTab(),
                        contentViewPreviewElement = self.renderContentViewPreviewElement(),
                        areaContainer = self.getLayoutAreaPreviewContainer();

                    self.contentViewPreviewTab = contentViewPreviewTab;
                    self.contentViewPreviewElement = contentViewPreviewElement;

                    areaContainer.querySelector('.layoutAreaTabs').appendChild(contentViewPreviewTab);
                    areaContainer.querySelector('.layoutAreaContent').appendChild(contentViewPreviewElement);

                    self.activateContentViewPreview();

                    if (startEditing) {
                        window.setTimeout(function() {
                            self.editContentView(startEditing);
                        }, 200);
                    }

                },


                /**
                 * I update the contents of a preview element.
                 *
                 * @method updateContentViewPreview
                 */
                updateContentViewPreview: function() {

                    var self = this;

                    self.contentViewPreviewTab.setAttribute('data-type', self.contentViewData.type);
                    self.contentViewPreviewTab.querySelector('.contentViewTabName').innerHTML =
                        self.contentViewData.icon ? '<span class="'+ self.contentViewData.icon +'">'+ self.contentViewData.name +'</span>' : self.contentViewData.name;

                    self.contentViewPreviewElement.setAttribute('data-type', self.contentViewData.type);
                    self.contentViewPreviewElement.setAttribute('data-size', self.contentViewData.contentSize);
                    var oldSchematic = self.contentViewPreviewElement.querySelector('.schematicPreview');
                    if (oldSchematic) { oldSchematic.replaceWith(self.generateSchematicPreview()); }

                    self.resizeLayoutAreaPreview();

                },


                _renderTab: function(onActivate, withCloseButton) {
                    var self = this,
                        tabElement = document.createElement('div');
                    tabElement.className = 'contentViewTab';
                    tabElement.setAttribute('data-type', self.contentViewData.type);
                    tabElement.innerHTML = '    <div class="contentViewTabName">'
                                         + (self.contentViewData.icon ? '<span class="'+ self.contentViewData.icon +'">'+ self.contentViewData.name +'</span>' : self.contentViewData.name)
                                         + '</div>'
                                         + (withCloseButton ? '    <div class="layoutAreaToggleCloseButton"></div>' : '');
                    tabElement.addEventListener('click', function() { onActivate.call(self); });
                    if (withCloseButton) {
                        tabElement.querySelector('.layoutAreaToggleCloseButton').addEventListener('click', function(evt) {
                            evt.stopPropagation();
                            evt.currentTarget.closest('.layoutArea').classList.toggle('closed');
                            FrameTrail.changeState('slidePosition', 'middle');
                            window.setTimeout(function() {
                                FrameTrail.module('ViewVideo').adjustHypervideo();
                            }, 250);
                        });
                    }
                    return tabElement;
                },


                /**
                 * I render a ContentView tab.
                 *
                 * @method renderContentViewTab
                 * @return {HTMLElement} tabElement
                 */
                renderContentViewTab: function() {
                    return this._renderTab(this.activateContentView, true);
                },


                /**
                 * I render a ContentView Preview tab.
                 *
                 * @method renderContentViewPreviewTab
                 * @return {HTMLElement} tabElement
                 */
                renderContentViewPreviewTab: function() {
                    return this._renderTab(this.activateContentViewPreview);
                },


                /**
                 * I render a ContentView Container Element.
                 *
                 * @method renderContentViewContainer
                 * @return {HTMLElement} containerElement
                 */
                renderContentViewContainer: function() {

                    var self = this,
                        _w = document.createElement('div');
                    _w.innerHTML = '<div class="contentViewContainer"'
                                 + ' data-size="'+ self.contentViewData.contentSize +'"'
                                 + ' data-type="'+ self.contentViewData.type +'">'
                                 + '    <div class="contentViewScroll">'
                                 + '        <div class="contentViewContents"></div>'
                                 + '    </div>'
                                 + '</div>';
                    var containerElement = _w.firstElementChild;

                    if (self.contentViewData.cssClass) {
                        containerElement.classList.add(self.contentViewData.cssClass);
                    }

                    return containerElement;

                },



                /**
                 * I render a ContentView Details Container Element.
                 *
                 * @method renderContentViewDetailsContainer
                 * @return {HTMLElement} detailsContainerElement
                 */
                renderContentViewDetailsContainer: function() {

                    var self = this,
                        _wd = document.createElement('div');
                    _wd.innerHTML = '<div class="contentViewDetailsContainer">'
                                  + '    <div class="contentViewDetailsContents"></div>'
                                  + '    <div class="swipeOverlay"></div>'
                                  + '    <div class="slideButton slideLeft" title="'+ self.labels['MessageHintTryUsingArrowKeys'] +'">'
                                  + '        <span class="icon-left-open-big"></span>'
                                  + '    </div>'
                                  + '    <div class="slideButton slideRight" title="'+ self.labels['MessageHintTryUsingArrowKeys'] +'">'
                                  + '        <span class="icon-right-open-big"></span>'
                                  + '    </div>'
                                  + '</div>';
                    var detailsContainerElement = _wd.firstElementChild;

                    detailsContainerElement.querySelector('.slideButton.slideLeft').addEventListener('click', function() {
                        var activeElement = self.contentViewContainer.querySelector('.collectionElement.open');
                        if ( activeElement ) {
                            var prev = activeElement.previousElementSibling;
                            while (prev && !prev.classList.contains('collectionElement')) { prev = prev.previousElementSibling; }
                            if (prev) { prev.click(); }
                        }
                    });

                    detailsContainerElement.querySelector('.slideButton.slideRight').addEventListener('click', function() {
                        var activeElement = self.contentViewContainer.querySelector('.collectionElement.open');
                        if ( activeElement ) {
                            var next = activeElement.nextElementSibling;
                            while (next && !next.classList.contains('collectionElement')) { next = next.nextElementSibling; }
                            if (next) { next.click(); }
                        }
                    });

                    // Swipe overlay: a transparent element on top of the content
                    // that intercepts touch/pointer events for horizontal swipe
                    // navigation. Cross-origin iframes and <video controls> don't
                    // propagate events to ancestors, so we need an overlay that
                    // sits above them in the parent document.
                    //
                    // Behavior:
                    //   Horizontal swipe → navigate to prev/next collection element
                    //   Tap / click       → dismiss overlay + forward click to content
                    //   Vertical gesture  → dismiss overlay so user can scroll content
                    //
                    // The overlay reactivates when navigation occurs (swipe,
                    // slideButton, keyboard) or after 8 s of inactivity.
                    (function() {
                        var swipeOverlay = detailsContainerElement.querySelector('.swipeOverlay');
                        var startX = 0, startY = 0, startTime = 0;
                        var swiping = false, decided = false, didSwipe = false;
                        var THRESHOLD = 40;
                        var ANGLE_LIMIT = 30;
                        var TAP_THRESHOLD = 10;
                        var TAP_TIMEOUT = 300;
                        var REACTIVATE_DELAY = 8000;
                        var reactivateTimer = null;

                        function reactivateOverlay() {
                            clearTimeout(reactivateTimer);
                            swipeOverlay.style.pointerEvents = '';
                        }

                        function dismissOverlay() {
                            swipeOverlay.style.pointerEvents = 'none';
                            clearTimeout(reactivateTimer);
                            reactivateTimer = setTimeout(reactivateOverlay, REACTIVATE_DELAY);
                        }

                        function navigate(dx) {
                            var activeElement = self.contentViewContainer.querySelector('.collectionElement.open');
                            if (!activeElement) return;
                            if (dx < 0) {
                                var next = activeElement.nextElementSibling;
                                while (next && !next.classList.contains('collectionElement')) { next = next.nextElementSibling; }
                                if (next) next.click();
                            } else {
                                var prev = activeElement.previousElementSibling;
                                while (prev && !prev.classList.contains('collectionElement')) { prev = prev.previousElementSibling; }
                                if (prev) prev.click();
                            }
                            reactivateOverlay();
                        }

                        // Re-activate overlay on any navigation (transition of
                        // the detail contents slider signals a new element opened).
                        detailsContainerElement.querySelector('.contentViewDetailsContents')
                            .addEventListener('transitionend', reactivateOverlay);

                        // While overlay is dismissed, extend the timer on new
                        // touches so it doesn't reactivate mid-interaction.
                        detailsContainerElement.addEventListener('touchstart', function() {
                            if (swipeOverlay.style.pointerEvents === 'none') {
                                clearTimeout(reactivateTimer);
                                reactivateTimer = setTimeout(reactivateOverlay, REACTIVATE_DELAY);
                            }
                        }, true);
                        detailsContainerElement.addEventListener('pointerdown', function(e) {
                            if (e.pointerType === 'touch') return;
                            if (swipeOverlay.style.pointerEvents === 'none') {
                                clearTimeout(reactivateTimer);
                                reactivateTimer = setTimeout(reactivateOverlay, REACTIVATE_DELAY);
                            }
                        }, true);

                        // --- Touch events (mobile / touch screens) ---

                        swipeOverlay.addEventListener('touchstart', function(e) {
                            if (e.touches.length !== 1) return;
                            startX = e.touches[0].clientX;
                            startY = e.touches[0].clientY;
                            startTime = Date.now();
                            swiping = true;
                            decided = false;
                        });

                        swipeOverlay.addEventListener('touchmove', function(e) {
                            if (!swiping || decided) return;
                            var dx = e.touches[0].clientX - startX;
                            var dy = e.touches[0].clientY - startY;
                            var dist = Math.sqrt(dx * dx + dy * dy);
                            if (dist < THRESHOLD) return;

                            decided = true;
                            var angle = Math.abs(Math.atan2(dy, dx) * 180 / Math.PI);
                            if (angle > ANGLE_LIMIT && angle < (180 - ANGLE_LIMIT)) {
                                // Vertical gesture — dismiss overlay for content interaction
                                swiping = false;
                                dismissOverlay();
                                return;
                            }

                            // Horizontal swipe — navigate
                            swiping = false;
                            e.preventDefault();
                            navigate(dx);
                        }, { passive: false });

                        swipeOverlay.addEventListener('touchend', function(e) {
                            if (swiping && !decided) {
                                // Minimal movement — treat as tap
                                var touch = e.changedTouches[0];
                                var dx = touch.clientX - startX;
                                var dy = touch.clientY - startY;
                                if (Math.sqrt(dx * dx + dy * dy) < TAP_THRESHOLD
                                    && (Date.now() - startTime) < TAP_TIMEOUT) {
                                    // Dismiss overlay and forward the click
                                    var cx = touch.clientX, cy = touch.clientY;
                                    dismissOverlay();
                                    var target = document.elementFromPoint(cx, cy);
                                    if (target) target.click();
                                }
                            }
                            swiping = false;
                            decided = false;
                        });

                        swipeOverlay.addEventListener('touchcancel', function() {
                            swiping = false;
                            decided = false;
                        });

                        // --- Pointer events (mouse / pen, not touch) ---

                        swipeOverlay.addEventListener('pointerdown', function(e) {
                            if (e.pointerType === 'touch') return;
                            if (e.button !== 0) return;
                            startX = e.clientX;
                            startY = e.clientY;
                            swiping = true;
                            decided = false;
                            didSwipe = false;
                        });

                        swipeOverlay.addEventListener('pointermove', function(e) {
                            if (e.pointerType === 'touch') return;
                            if (!swiping || decided) return;
                            var dx = e.clientX - startX;
                            var dy = e.clientY - startY;
                            var dist = Math.sqrt(dx * dx + dy * dy);
                            if (dist < THRESHOLD) return;

                            decided = true;
                            var angle = Math.abs(Math.atan2(dy, dx) * 180 / Math.PI);
                            if (angle > ANGLE_LIMIT && angle < (180 - ANGLE_LIMIT)) {
                                swiping = false;
                                return;
                            }

                            swiping = false;
                            didSwipe = true;
                            navigate(dx);
                        });

                        swipeOverlay.addEventListener('pointerup', function(e) {
                            if (e.pointerType !== 'touch') { swiping = false; decided = false; }
                        });
                        swipeOverlay.addEventListener('pointercancel', function(e) {
                            if (e.pointerType !== 'touch') { swiping = false; decided = false; }
                        });

                        // Mouse click: dismiss overlay + forward click to content
                        swipeOverlay.addEventListener('click', function(e) {
                            if (didSwipe) { didSwipe = false; return; }
                            var cx = e.clientX, cy = e.clientY;
                            dismissOverlay();
                            var target = document.elementFromPoint(cx, cy);
                            if (target && target !== swipeOverlay) target.click();
                        });
                    })();

                    return detailsContainerElement;

                },


                /**
                 * I render a ContentView Preview Element.
                 *
                 * @method renderContentViewPreviewElement
                 * @return {HTMLElement} previewElement
                 */
                generateSchematicPreview: function() {
                    var axis = (this.whichArea === 'top' || this.whichArea === 'bottom') ? 'x' : 'y';
                    return _generateSchematic(this.contentViewData.type, this.contentViewData.contentSize, axis);
                },

                generateSchematicPreviewFor: function(type, size, axis, thumbnail) {
                    return _generateSchematic(type, size, axis, thumbnail);
                },


                renderContentViewPreviewElement: function() {

                    var self = this,
                        _wp = document.createElement('div');
                    _wp.innerHTML = '<div class="contentViewPreview"'
                                  + ' data-size="'+ self.contentViewData.contentSize +'"'
                                  + ' data-type="'+ self.contentViewData.type +'">'
                                  + '    <div class="contentViewOptions">'
                                  + '        <button class="editContentView"><span class="icon-pencil"></span></button>'
                                  + '        <button class="deleteContentView"><span class="icon-trash"></span></button>'
                                  + '    </div>'
                                  + '</div>';
                    var previewElement = _wp.firstElementChild;

                    previewElement.appendChild(self.generateSchematicPreview());

                    previewElement.querySelector('.editContentView').addEventListener('click', function() {
                        self.editContentView();
                    });

                    previewElement.querySelector('.deleteContentView').addEventListener('click', function() {

                        var prevTab = self.contentViewTab.previousElementSibling;
                        while (prevTab && !prevTab.classList.contains('contentViewTab')) { prevTab = prevTab.previousElementSibling; }
                        var nextTab = self.contentViewTab.nextElementSibling;
                        while (nextTab && !nextTab.classList.contains('contentViewTab')) { nextTab = nextTab.nextElementSibling; }
                        var closestContentViewTab = prevTab || nextTab;
                        if ( closestContentViewTab ) {
                            closestContentViewTab.click();
                        } else {
                            self.resizeLayoutArea(true);
                        }

                        var prevPTab = self.contentViewPreviewTab.previousElementSibling;
                        while (prevPTab && !prevPTab.classList.contains('contentViewTab')) { prevPTab = prevPTab.previousElementSibling; }
                        var nextPTab = self.contentViewPreviewTab.nextElementSibling;
                        while (nextPTab && !nextPTab.classList.contains('contentViewTab')) { nextPTab = nextPTab.nextElementSibling; }
                        var closestContentViewPreviewTab = prevPTab || nextPTab;
                        if ( closestContentViewPreviewTab ) {
                            closestContentViewPreviewTab.click();
                        } else {
                            self.resizeLayoutAreaPreview(true);
                        }

                        FrameTrail.module('ViewLayout').removeContentView(self);

                    });

                    return previewElement;

                },


                /**
                 * I activate a ContentView (tab and container element)
                 *
                 * @method activateContentView
                 */
                activateContentView: function() {

                    var self = this;

                    if (!self.contentViewContainer) {
                        self.resizeLayoutArea(true);
                        return;
                    }

                    Array.from(self.contentViewTab.parentElement.querySelectorAll('.contentViewTab')).forEach(function(el) {
                        if (el !== self.contentViewTab) { el.classList.remove('active'); }
                    });
                    self.contentViewTab.classList.add('active');

                    Array.from(self.contentViewContainer.parentElement.querySelectorAll('.contentViewContainer')).forEach(function(el) {
                        if (el !== self.contentViewContainer) { el.classList.remove('active'); }
                    });
                    self.contentViewContainer.classList.add('active');

                    if (self.contentViewDetailsContainer) {
                        Array.from(self.contentViewDetailsContainer.parentElement.querySelectorAll('.contentViewDetailsContainer')).forEach(function(el) {
                            if (el !== self.contentViewDetailsContainer) { el.classList.remove('active'); }
                        });
                        self.contentViewDetailsContainer.classList.add('active');
                    }

                    if (FrameTrail.module('ViewVideo').shownDetails) {
                        FrameTrail.module('ViewVideo').shownDetails = null;
                    }

                    self.resizeLayoutArea(false, true);

                    if (window.contentViewResizeTimeout) {
                        window.clearTimeout(window.contentViewResizeTimeout);
                    }

                    window.contentViewResizeTimeout = window.setTimeout(function() {
                        FrameTrail.changeState('viewSizeChanged');
                        self.updateCollectionSlider();
                    }, 600);

                },


                /**
                 * I activate a ContentView Preview (tab and preview element)
                 *
                 * @method activateContentViewPreview
                 */
                activateContentViewPreview: function() {

                    var self = this;

                    if (!self.contentViewPreviewElement) {
                        self.resizeLayoutAreaPreview(true);
                        return;
                    }

                    Array.from(self.contentViewPreviewTab.parentElement.querySelectorAll('.contentViewTab')).forEach(function(el) {
                        if (el !== self.contentViewPreviewTab) { el.classList.remove('active'); }
                    });
                    self.contentViewPreviewTab.classList.add('active');

                    Array.from(self.contentViewPreviewElement.parentElement.querySelectorAll('.contentViewPreview')).forEach(function(el) {
                        if (el !== self.contentViewPreviewElement) { el.classList.remove('active'); }
                    });
                    self.contentViewPreviewElement.classList.add('active');

                    self.resizeLayoutAreaPreview();

                },


                /**
                 * I resize a LayoutArea based on a ContentView size.
                 *
                 * @method resizeLayoutArea
                 * @param {Boolean} isEmpty
                 * @param {Boolean} preventViewSizeChange
                 */
                resizeLayoutArea: function(isEmpty, preventViewSizeChange) {
                    var self = this,
                        areaContainer = self.getLayoutAreaContainer();

                    if (isEmpty) {
                        areaContainer.removeAttribute('data-size');
                    } else {
                        areaContainer.setAttribute('data-size', self.contentViewData.contentSize);
                    }

                    if (!preventViewSizeChange) {
                        FrameTrail.changeState('viewSize', FrameTrail.getState('viewSize'));
                    }

                },


                /**
                 * I resize a LayoutArea preview based on a ContentView size.
                 *
                 * @method resizeLayoutAreaPreview
                 * @param {Boolean} isEmpty
                 */
                resizeLayoutAreaPreview: function(isEmpty) {
                    var self = this,
                        areaContainer = self.getLayoutAreaPreviewContainer();

                    if (isEmpty) {
                        areaContainer.removeAttribute('data-size');
                    } else {
                        areaContainer.setAttribute('data-size', self.contentViewData.contentSize);
                    }

                },


                /**
                * I scale the detail elements in case the space is too small
                * @method scaleDetailElements
                */
                scaleDetailElements: function() {

                    var contentItems = this.contentCollection;

                    for (var i = 0; i < contentItems.length; i++) {

                        var currentContentItem = contentItems[i];

                        if (currentContentItem.data.type == 'wikipedia' || currentContentItem.data.type == 'webpage') {

                            // Rescale elements in type "large" contentViews
                            var domElement = this.getContentViewElementFromContentItem(currentContentItem);
                            if  (domElement) {
                                rescale(domElement, domElement.offsetWidth);
                            }

                            // TODO: RESCALE DETAIL ELEMENTS

                            //rescale( this.annotationElement, FrameTrail.module('ViewVideo').AreaBottomDetails.width() );
                        }

                        function rescale(element, referenceWidth) {

                            var elementToScale = element.querySelector('.resourceDetail'),
                                wrapperElement = element,
                                scaleBase = 400;

                            if (!elementToScale) { return; }

                            if (referenceWidth === 0) { return; }

                            if (referenceWidth >= scaleBase) {
                                elementToScale.style.top = '0';
                                elementToScale.style.left = '0';
                                elementToScale.style.height = '';
                                elementToScale.style.width = '';
                                elementToScale.style.transform = 'none';
                                return;
                            }

                            var scale = referenceWidth / scaleBase,
                                negScale = 1/scale;

                            elementToScale.style.top = '50%';
                            elementToScale.style.left = '50%';
                            elementToScale.style.width = scaleBase + 'px';
                            elementToScale.style.height = wrapperElement.offsetHeight * negScale + 'px';
                            elementToScale.style.transform = 'translate(-50%, -50%) scale(' + scale + ')';

                        }
                    }

                },


                /**
                 * I distribute the Collection Elements in the contentViewContainer, so that they
                 * match closely to the position of their related timelineElements.
                 * When they would start to overlap, I arrange them in groups.
                 *
                 * @method distributeElements
                 */
                distributeElements: function() {

                    if ( this.whichArea == 'left' || this.whichArea == 'right' ) {
                        return;
                    }

                    var self = this,
                        annotations      = self.contentCollection,
                        videoDuration    = FrameTrail.module('HypervideoModel').duration,
                        offsetIn         = FrameTrail.module('HypervideoModel').offsetIn,
                        scrollContainer  = self.contentViewContainer.querySelector('.contentViewScroll'),
                        containerElement = self.contentViewContainer.querySelector('.contentViewContents'),
                        containerWidth   = scrollContainer.offsetWidth,
                        gap              = 4,
                        scale            = containerWidth / videoDuration;

                    // Helper: total pixel width of a group (items + gaps between them)
                    function groupTotalWidth(group) {
                        var w = 0;
                        for (var j = 0; j < group.items.length; j++) { w += group.items[j].width; }
                        w += (group.items.length - 1) * gap;
                        return w;
                    }

                    // --- Pre-read pass: collect element widths from DOM (single reflow) ---

                    var items = [];
                    for (var i = 0; i < annotations.length; i++) {
                        var el = self.getContentViewElementFromContentItem(annotations[i]);
                        if (!el) { continue; }
                        items.push({
                            el:        el,
                            width:     el.offsetWidth,
                            startTime: annotations[i].data.start,
                            endTime:   annotations[i].data.end
                        });
                    }

                    // --- Pre-check: if total width exceeds container, expand and hand off to slider ---

                    var totalWidth = 0;
                    for (var i = 0; i < items.length; i++) { totalWidth += items[i].width + gap; }

                    if (totalWidth > containerWidth) {
                        // Reset to normal flow in case items were absolutely positioned from a previous run
                        Array.from(containerElement.children).forEach(function(el) {
                            el.style.position = '';
                            el.style.left = '';
                        });
                        containerElement.style.width = totalWidth + 'px';
                        return;
                    } else {
                        containerElement.style.width = '';
                    }

                    // --- Phase 1: Build groups — items that naturally overlap are grouped ---

                    var groups = [];
                    var prevDesiredRight = 0;

                    for (var i = 0; i < items.length; i++) {
                        var item = items[i];
                        var midTime = (item.startTime + item.endTime) / 2 - offsetIn;
                        var desired = scale * midTime - item.width / 2;

                        if (groups.length === 0 || desired >= prevDesiredRight) {
                            groups.push({ items: [item], left: Math.max(0, desired) });
                        } else {
                            groups[groups.length - 1].items.push(item);
                        }

                        prevDesiredRight = desired + item.width;
                    }

                    // --- Phase 2: Centre each group over its combined time span ---

                    prevGroupRight = -gap;

                    for (var i = 0; i < groups.length; i++) {
                        var group = groups[i];
                        var firstItem = group.items[0];
                        var lastItem  = group.items[group.items.length - 1];
                        var groupMidTime = (firstItem.startTime + lastItem.endTime) / 2 - offsetIn;
                        var gw = groupTotalWidth(group);
                        var desiredLeft = scale * groupMidTime - gw / 2;

                        group.left = Math.max(prevGroupRight + gap, desiredLeft);
                        prevGroupRight = group.left + gw;
                    }

                    // --- Phase 3: Right-to-left sweep — clamp groups within container ---

                    var rightBoundary = containerWidth - 2 * gap;

                    for (var i = groups.length - 1; i >= 0; i--) {
                        var group = groups[i];
                        var gw = groupTotalWidth(group);
                        group.left = Math.min(group.left, rightBoundary - gw);
                        rightBoundary = group.left - gap;
                    }

                    // --- Phase 4: Write positions to DOM ---

                    Array.from(containerElement.children).forEach(function(el) {
                        el.style.position = '';
                        el.style.left = '';
                    });

                    for (var i = 0; i < groups.length; i++) {
                        var group = groups[i];
                        var x = group.left;
                        for (var j = 0; j < group.items.length; j++) {
                            var item = group.items[j];
                            item.el.style.position = 'absolute';
                            item.el.style.left = x + 'px';
                            item.el.setAttribute('data-in',  item.startTime);
                            item.el.setAttribute('data-out', item.endTime);
                            x += item.width + gap;
                        }
                    }

                },


                /**
                 * I update the slider for the current contentCollection
                 *
                 * If param details is set to true, I update the details' slider
                 *
                 * @method updateCollectionSlider
                 * @param {Boolean} details
                 */
                updateCollectionSlider: function(details) {

                    var self = this,
                        slideAxis    = (self.whichArea == 'top' || self.whichArea == 'bottom') ? 'x' : 'y',
                        sliderParent = (details) ? self.contentViewDetailsContainer : self.contentViewContainer;

                    if ( self.contentCollection.length == 0
                        || ( (self.whichArea == 'left' || self.whichArea == 'right') && self.contentViewData.contentSize == 'large')
                        || !sliderParent.classList.contains('active') ) {
                        return;
                    }

                    // Details container still uses the old positioned approach
                    if (details) {
                        this._updateCollectionSliderDetails();
                        return;
                    }

                    // Main container uses native scroll
                    var scrollContainer = self.contentViewContainer.querySelector('.contentViewScroll');
                    if (!scrollContainer) return;

                    // Check if content overflows
                    var overflows = (slideAxis == 'x')
                        ? scrollContainer.scrollWidth > scrollContainer.clientWidth + 1
                        : scrollContainer.scrollHeight > scrollContainer.clientHeight + 1;

                    if (!overflows) return;

                    // Find active annotations
                    var activeAnnotations = [];
                    var activeAnnotationIndices = [];

                    for (var idx in self.contentCollection) {
                        if ( self.contentCollection[idx].activeStateInContentView(self) ) {
                            activeAnnotations.push(self.contentCollection[idx]);
                            activeAnnotationIndices.push(idx);
                        }
                    }

                    if (activeAnnotations.length == 0) {
                        self._lastActiveAnnotationIndices = [];
                        return;
                    }

                    // Detect whether the active set changed at all
                    var prevActiveIndices = self._lastActiveAnnotationIndices || [];
                    var activeSetChanged = activeAnnotationIndices.length !== prevActiveIndices.length
                        || activeAnnotationIndices.some(function(idx, i) { return idx !== prevActiveIndices[i]; });
                    self._lastActiveAnnotationIndices = activeAnnotationIndices;

                    // Only scroll when the active set changes
                    if (!activeSetChanged) return;

                    // Compute scroll target from active elements
                    var firstEl = self.getContentViewElementFromContentItem(activeAnnotations[0]);
                    var lastEl = self.getContentViewElementFromContentItem(activeAnnotations[activeAnnotations.length - 1]);
                    if (!firstEl || !lastEl) return;

                    self._isProgrammaticScroll = true;
                    if (slideAxis == 'x') {
                        var containerWidth = FrameTrail.getState('viewSize')[0];
                        if (containerWidth < 768 || activeAnnotations.length === 1) {
                            // Small container: center only the first active element
                            var elCenter = firstEl.offsetLeft + firstEl.offsetWidth / 2;
                            var scrollTarget = elCenter - scrollContainer.clientWidth / 2;
                        } else {
                            // Large container: center the midpoint of all active elements
                            var groupLeft = firstEl.offsetLeft;
                            var groupRight = lastEl.offsetLeft + lastEl.offsetWidth;
                            var groupCenter = (groupLeft + groupRight) / 2;
                            var scrollTarget = groupCenter - scrollContainer.clientWidth / 2;
                        }
                        scrollContainer.scrollTo({ left: Math.max(0, scrollTarget), behavior: 'smooth' });
                    } else {
                        var groupTop = firstEl.offsetTop;
                        var groupBottom = lastEl.offsetTop + lastEl.offsetHeight;
                        var groupCenter = (groupTop + groupBottom) / 2;
                        var scrollTarget = groupCenter - scrollContainer.clientHeight / 2;
                        scrollContainer.scrollTo({ top: Math.max(0, scrollTarget), behavior: 'smooth' });
                    }
                    // Clear flag when smooth scroll finishes
                    if (self._scrollEndHandler) {
                        scrollContainer.removeEventListener('scrollend', self._scrollEndHandler);
                    }
                    self._scrollEndHandler = function() {
                        self._isProgrammaticScroll = false;
                        scrollContainer.removeEventListener('scrollend', self._scrollEndHandler);
                        self._scrollEndHandler = null;
                    };
                    scrollContainer.addEventListener('scrollend', self._scrollEndHandler);

                },


                /**
                 * I update the details slider using the old positioned approach
                 * (details container is not converted to native scroll).
                 *
                 * @method _updateCollectionSliderDetails
                 * @private
                 */
                _updateCollectionSliderDetails: function() {

                    var self = this,
                        widthOfSlider  = 0,
                        gap            = 10,
                        sliderParent   = self.contentViewDetailsContainer,
                        sliderElement  = sliderParent.querySelector('.contentViewDetailsContents');

                    // Sum element widths (details is always horizontal / top-bottom)
                    for (var idx in self.contentCollection) {
                        var element = self.getDetailElementFromContentItem(self.contentCollection[idx]);
                        if (element) {
                            widthOfSlider += element.offsetWidth + gap;
                        }
                    }

                    if ( widthOfSlider > sliderParent.offsetWidth ) {
                        sliderElement.style.width = widthOfSlider + 'px';
                        sliderParent.querySelectorAll('.slideButton').forEach(function(el) { el.style.display = 'flex'; });
                    } else {
                        sliderElement.style.width = '';
                        sliderElement.style.left = gap + 'px';
                        sliderParent.querySelectorAll('.slideButton').forEach(function(el) { el.style.display = 'none'; });
                        return;
                    }

                    // Find opened detail element
                    var activeAnnotations = [];
                    sliderParent.querySelectorAll('.collectionElement.open').forEach(function(el) {
                        activeAnnotations.push(el);
                    });

                    if (activeAnnotations.length == 0) return;

                    var activeEl = activeAnnotations[0];
                    var leftOffset = -1 * ( activeEl.offsetLeft
                                          - 1
                                          - sliderParent.clientWidth / 2
                                          + activeEl.offsetWidth / 2
                                    );
                    sliderElement.style.left = Math.max(-(widthOfSlider - sliderParent.offsetWidth),
                                                   Math.min(gap, leftOffset)) + 'px';

                },


                /**
                 * I create an edit dialog for a ContentView
                 *
                 * @method editContentView
                 * @param {Boolean} isNew
                 */
                editContentView: function(isNew) {

                    var elementOrigin = this.contentViewPreviewElement,
                        animationDiv = elementOrigin.cloneNode(true),
                        dialogAncestor = elementOrigin.closest('dialog'),
                        originRect = elementOrigin.getBoundingClientRect(),
                        originTop = originRect.top,
                        originLeft = originRect.left,
                        originWidth = elementOrigin.offsetWidth,
                        originHeight = elementOrigin.offsetHeight,
                        finalTop = (window.innerHeight/2) - 300,
                        finalLeft = (window.innerWidth/2) - 430,
                        self = this;

                    animationDiv.classList.add('contentViewAnimationDiv');
                    animationDiv.style.position = 'fixed';
                    animationDiv.style.top = originTop + 'px';
                    animationDiv.style.left = originLeft + 'px';
                    animationDiv.style.width = originWidth + 'px';
                    animationDiv.style.height = originHeight + 'px';
                    animationDiv.style.zIndex = '99';
                    (dialogAncestor || document.body).appendChild(animationDiv);

                    var anim = animationDiv.animate([
                        { top: originTop + 'px', left: originLeft + 'px', width: originWidth + 'px', height: originHeight + 'px' },
                        { top: finalTop + 'px', left: finalLeft + 'px', width: '860px', height: '600px' }
                    ], { duration: 300, easing: 'ease', fill: 'forwards' });

                    anim.finished.then(function() {
                        animationDiv.style.top = finalTop + 'px';
                        animationDiv.style.left = finalLeft + 'px';
                        animationDiv.style.width = '860px';
                        animationDiv.style.height = '600px';
                        anim.cancel();

                        var dialogTitle = (isNew) ? self.labels['SettingsContentViewNew'] : self.labels['SettingsContentViewEdit'],
                            editDialog = document.createElement('div');
                        editDialog.className = 'editContentViewDialog';

                        editDialog.appendChild(self.renderContentViewPreviewEditingUI());

                        var editDialogCtrl = Dialog({
                            title:     dialogTitle,
                            content:   editDialog,
                            resizable: false,
                            width:     860,
                            height:    600,
                            modal:     true,
                            close: function() {
                                editDialogCtrl.destroy();
                                var closeAnim = animationDiv.animate([
                                    { top: finalTop + 'px', left: finalLeft + 'px', width: '860px', height: '600px' },
                                    { top: originTop + 'px', left: originLeft + 'px', width: originWidth + 'px', height: originHeight + 'px' }
                                ], { duration: 300, easing: 'ease', fill: 'forwards' });
                                closeAnim.finished.then(function() {
                                    document.querySelectorAll('.contentViewAnimationDiv').forEach(function(el) { el.remove(); });
                                });
                            },
                            open: function() {
                                editDialog.querySelectorAll('.cm6-wrapper').forEach(function(el) {
                                    if (el._cm6view) { el._cm6view.requestMeasure(); }
                                });
                            },
                            buttons: [
                                { text: self.labels['GenericApply'],
                                    click: function() {
                                        // Capture old data before changes
                                        var oldContentViewData = JSON.parse(JSON.stringify(self.contentViewData));

                                        var newContentViewData = self.getDataFromEditingUI(editDialog);

                                        self.contentViewData = newContentViewData;

                                        self.updateContentViewPreview();

                                        self.updateContent();

                                        FrameTrail.module('HypervideoModel').newUnsavedChange('layout');

                                        // Register undo for content view settings change
                                        (function(contentViewRef, oldData, newData, labels) {
                                            FrameTrail.module('UndoManager').register({
                                                category: 'layout',
                                                description: labels['SidebarLayout'] + ' ' + labels['GenericType'],
                                                undo: function() {
                                                    contentViewRef.contentViewData = JSON.parse(JSON.stringify(oldData));
                                                    contentViewRef.updateContentViewPreview();
                                                    contentViewRef.updateContent();
                                                    var currentTime = FrameTrail.module('HypervideoController').currentTime;
                                                    contentViewRef.updateTimedStateOfContentViews(currentTime);
                                                    FrameTrail.module('HypervideoModel').newUnsavedChange('layout');
                                                },
                                                redo: function() {
                                                    contentViewRef.contentViewData = JSON.parse(JSON.stringify(newData));
                                                    contentViewRef.updateContentViewPreview();
                                                    contentViewRef.updateContent();
                                                    var currentTime = FrameTrail.module('HypervideoController').currentTime;
                                                    contentViewRef.updateTimedStateOfContentViews(currentTime);
                                                    FrameTrail.module('HypervideoModel').newUnsavedChange('layout');
                                                }
                                            });
                                        })(self, oldContentViewData, JSON.parse(JSON.stringify(newContentViewData)), self.labels);

                                        editDialogCtrl.close();

                                        var currentTime = FrameTrail.module('HypervideoController').currentTime;
                                        self.updateTimedStateOfContentViews(currentTime);
                                    }
                                },
                                { text: self.labels['GenericCancel'],
                                    click: function() {
                                        editDialogCtrl.close();
                                    }
                                }
                            ]
                        });

                    });

                },


                /**
                 * I render the Editing UI for a ContentView
                 *
                 * @method renderContentViewPreviewEditingUI
                 * @return {HTMLElement} editingUI
                 */
                renderContentViewPreviewEditingUI: function() {

                    var self = this,
                        contentViewData = this.contentViewData,
                        editingUI = document.createElement('div');
                    editingUI.className = 'contentViewEditingUI';
                    editingUI.innerHTML = '    <div class="layoutRow">'
                                    +'        <div class="generic column-4">'
                                    +'            <label>'+ self.labels['GenericName'] +':</label>'
                                    +'            <input type="text" class="contentViewData" data-property="name" value="'+ contentViewData.name +'" placeholder="('+ self.labels['GenericOptional'] +')">'
                                    +'        </div>'
                                    +'        <div class="generic column-4">'
                                    +'            <label>Icon:</label>'
                                    +'            <div class="iconInputRow">'
                                    +'                <span class="iconPreview '+ contentViewData.icon +'"></span>'
                                    +'                <input type="text" class="contentViewData" data-property="icon" value="'+ contentViewData.icon +'" placeholder="('+ self.labels['GenericOptional'] +')">'
                                    +'            </div>'
                                    +'        </div>'
                                    +'        <div class="generic column-2">'
                                    +'            <label>CSS Class:</label>'
                                    +'            <input type="text" class="contentViewData" data-property="cssClass" value="'+ contentViewData.cssClass +'" placeholder="('+ self.labels['GenericOptional'] +')">'
                                    +'        </div>'
                                    +'        <div class="generic column-2">'
                                    +'            <label>'+ self.labels['SettingsStartCollapsed'] +':</label>'
                                    +'            <div class="checkboxRow"><label class="switch"><input type="checkbox" class="contentViewData" data-property="initClosed" '+ (contentViewData.initClosed ? 'checked' : '') +'><span class="slider round"></span></label></div>'
                                    +'        </div>'
                                    +'    </div>'
                                    +'    <hr>'
                                    +'    <div class="layoutRow">'
                                    +'        <div class="contentViewData column-6" data-property="type" data-value="'+ contentViewData.type +'">'
                                    +'            <label>'+ self.labels['GenericType'] +':</label>'
                                    +'            <div '+ (contentViewData.type == 'TimedContent' ? 'class="active"' : '') +' data-value="TimedContent">'+ self.labels['GenericAnnotationCollection'] +'</div>'
                                    +'            <div '+ (contentViewData.type == 'CustomHTML' ? 'class="active"' : '') +' data-value="CustomHTML">'+ self.labels['GenericCustomHTML'] +'</div>'
                                    +'            <div '+ (contentViewData.type == 'Transcript' ? 'class="active"' : '') +' data-value="Transcript">'+ self.labels['GenericTextTranscript'] +'</div>'
                                    +'            <div '+ (contentViewData.type == 'Timelines' ? 'class="active"' : '') +' data-value="Timelines">'+ self.labels['GenericTimelines'] +'</div>'
                                    +'        </div>'
                                    +'        <div class="generic column-6">'
                                    +'            <div class="contentViewData" data-property="contentSize" data-value="'+ contentViewData.contentSize +'">'
                                    +'                <label>'+ self.labels['SettingsContentViewSize'] +':</label>'
                                    +'                <div '+ (contentViewData.contentSize == 'small' ? 'class="active"' : '') +' data-value="small">'+ self.labels['SettingsContentViewSmall'] +'</div>'
                                    +'                <div '+ (contentViewData.contentSize == 'medium' ? 'class="active"' : '') +' data-value="medium">'+ self.labels['SettingsContentViewMedium'] +'</div>'
                                    +'                <div '+ (contentViewData.contentSize == 'large' ? 'class="active"' : '') +' data-value="large">'+ self.labels['SettingsContentViewLarge'] +'</div>'
                                    +'            </div>'
                                    +'        </div>'
                                    +'    </div>'
                                    +'    <hr>'
                                    +'    <div class="typeSpecific '+ (contentViewData.type == 'TimedContent' ? 'active' : '') +'" data-type="TimedContent">'
                                    +'        <label>'+ self.labels['SettingsSelectContents'] +':</label>'
                                    +'        <div class="message active">'+ self.labels['MessageHintContentViewFilters'] +'</div>'
                                    +'        <div class="layoutRow">'
                                    +'            <div class="column-3">'
                                    +'                <label>'+ self.labels['SettingsFilterByTags'] +'</label>'
                                    +'                <div class="existingTags"></div>'
                                    +'                <div class="button small contextSelectButton newTagButton">'
                                    +'                    <span class="icon-plus">'+ self.labels['GenericAdd'] +'</span>'
                                    +'                    <div class="contextSelectList"></div>'
                                    +'                </div>'
                                    +'                <input type="hidden" class="contentViewData" data-property="collectionFilter-tags" data-value="'+ contentViewData.collectionFilter.tags +'" value="'+ contentViewData.collectionFilter.tags +'" placeholder="('+ self.labels['GenericOptional'] +')">'
                                    +'            </div>'
                                    +'            <div class="column-3">'
                                    +'                <label>'+ self.labels['SettingsFilterByTypes'] +'</label>'
                                    +'                <div class="existingTypes"></div>'
                                    +'                <div class="button small contextSelectButton newTypeButton">'
                                    +'                    <span class="icon-plus">'+ self.labels['GenericAdd'] +'</span>'
                                    +'                    <div class="contextSelectList"></div>'
                                    +'                </div>'
                                    +'                <input type="hidden" class="contentViewData" data-property="collectionFilter-types" data-value="'+ contentViewData.collectionFilter.types +'" value="'+ contentViewData.collectionFilter.types +'" placeholder="('+ self.labels['GenericOptional'] +')">'
                                    +'            </div>'
                                    +'            <div class="column-3">'
                                    +'                <label>'+ self.labels['SettingsFilterByUsers'] +'</label>'
                                    +'                <div class="existingUsers"></div>'
                                    +'                <div class="button small contextSelectButton newUserButton">'
                                    +'                    <span class="icon-plus">'+ self.labels['GenericAdd'] +'</span>'
                                    +'                    <div class="contextSelectList"></div>'
                                    +'                </div>'
                                    +'                <input type="hidden" class="contentViewData" data-property="collectionFilter-users" data-value="'+ contentViewData.collectionFilter.users +'" value="'+ contentViewData.collectionFilter.users +'" placeholder="('+ self.labels['GenericOptional'] +')">'
                                    +'            </div>'
                                    +'            <div class="column-3">'
                                    +'                <label>'+ self.labels['SettingsFilterByName'] +'</label>'
                                    +'                <input type="text" class="contentViewData" data-property="collectionFilter-text" data-value="'+ contentViewData.collectionFilter.text +'" value="'+ contentViewData.collectionFilter.text +'" placeholder="('+ self.labels['GenericOptional'] +')">'
                                    +'            </div>'
                                    +'        </div>'
                                    +'        <div class="message active">'+ self.labels['SettingsItemsInCollection'] +': <span class="collectionCounter"></span></div>'
                                    +'        <hr>'
                                    +'    </div>'
                                    +'    <details class="typeSpecific advanced codeEditorSmall '+ (contentViewData.type == 'TimedContent' ? 'active' : '') +'" data-type="TimedContent">'
                                    +'        <summary>'+ self.labels['GenericAdvancedOptions'] +'</summary>'
                                    +'        <div>'
                                    +'            <label>onClickContentItem:</label>'
                                    +'            <div class="message active">'+ self.labels['MessageHintContentViewClickItem'] +'</div>'
                                    +'            <textarea class="contentViewData" data-property="onClickContentItem" placeholder="('+ self.labels['GenericOptional'] +')"></textarea>'
                                    +'        </div>'
                                    +'    </details>'
                                    +'    <div class="typeSpecific codeEditorLarge '+ (contentViewData.type == 'CustomHTML' ? 'active' : '') +'" data-type="CustomHTML">'
                                    +'        <label>'+ self.labels['GenericCustomHTML'] +':</label>'
                                    +'        <textarea class="contentViewData" data-property="html"></textarea>'
                                    +'    </div>'
                                    +'    <div class="typeSpecific '+ (contentViewData.type == 'Transcript' ? 'active' : '') +'" data-type="Transcript">'
                                    +'        <label>'+ self.labels['SettingsTranscriptSource'] +':</label>'
                                    +'        <div class="message active">'+ self.labels['MessageHintNewTranscriptsUpload'] +'</div>'
                                    +'        <div class="existingTranscripts"></div>'
                                    +'        <input type="hidden" class="contentViewData" data-property="transcriptSource" data-value="'+ contentViewData.transcriptSource +'" value="'+ contentViewData.transcriptSource +'">'
                                    +'    </div>'
                                    +'    <div class="typeSpecific '+ (contentViewData.type == 'Timelines' ? 'active' : '') +'" data-type="Timelines">'
                                    +'    </div>';

                    // Set textarea values programmatically to avoid HTML parsing issues
                    var htmlTextarea = editingUI.querySelector('.contentViewData[data-property="html"]');
                    if (htmlTextarea) { htmlTextarea.value = contentViewData.html || ''; }
                    var onClickTextarea = editingUI.querySelector('.contentViewData[data-property="onClickContentItem"]');
                    if (onClickTextarea) { onClickTextarea.value = contentViewData.onClickContentItem || ''; }

                    // Live icon preview
                    var iconInput = editingUI.querySelector('[data-property="icon"]'),
                        iconPreview = editingUI.querySelector('.iconPreview');
                    iconInput.addEventListener('input', function() {
                        iconPreview.className = 'iconPreview ' + this.value.trim();
                    });

                    // Inject schematic thumbnails into type and size option divs
                    var thumbAxis = (self.whichArea === 'top' || self.whichArea === 'bottom') ? 'x' : 'y';
                    editingUI.querySelector('.contentViewData[data-property="type"]').querySelectorAll(':scope > div[data-value]').forEach(function(optionEl) {
                        var thatType = optionEl.getAttribute('data-value');
                        var thumbWrapper = document.createElement('div');
                        thumbWrapper.className = 'contentViewOptionThumb';
                        thumbWrapper.appendChild(_generateSchematic(thatType, 'medium', 'x', false, 3));
                        var labelSpan = document.createElement('span');
                        labelSpan.textContent = optionEl.textContent;
                        optionEl.innerHTML = '';
                        optionEl.appendChild(thumbWrapper);
                        optionEl.appendChild(labelSpan);
                    });

                    function refreshSizeThumbs(type) {
                        editingUI.querySelector('.contentViewData[data-property="contentSize"]').querySelectorAll(':scope > div[data-value]').forEach(function(optionEl) {
                            var thatSize = optionEl.getAttribute('data-value');
                            var existingThumb = optionEl.querySelector('.contentViewOptionThumb');
                            if (existingThumb) {
                                existingThumb.innerHTML = '';
                                existingThumb.appendChild(_generateSchematic(type, thatSize, thumbAxis, true));
                            } else {
                                var thumbWrapper = document.createElement('div');
                                thumbWrapper.className = 'contentViewOptionThumb';
                                thumbWrapper.appendChild(_generateSchematic(type, thatSize, thumbAxis, true));
                                var labelSpan = document.createElement('span');
                                labelSpan.textContent = optionEl.textContent;
                                optionEl.innerHTML = '';
                                optionEl.appendChild(thumbWrapper);
                                optionEl.appendChild(labelSpan);
                            }
                        });
                    }
                    refreshSizeThumbs(contentViewData.type);

                    editingUI.querySelectorAll('.contentViewData').forEach(function(el) {

                        var datachoices = Array.from(el.querySelectorAll(':scope > div[data-value]'));

                        if (datachoices.length != 0) {
                            datachoices.forEach(function(choice) {
                                choice.addEventListener('click', function() {
                                    Array.from(this.parentElement.querySelectorAll('div[data-value]')).forEach(function(sib) {
                                        sib.classList.remove('active');
                                    });
                                    this.classList.add('active');

                                    var parent = this.closest('.contentViewData');

                                    parent.setAttribute('data-value', this.getAttribute('data-value'));

                                    if (parent.getAttribute('data-property') == 'type') {
                                        editingUI.querySelectorAll('.typeSpecific').forEach(function(el) { el.classList.remove('active'); });
                                        var typeSpecific = editingUI.querySelector('.typeSpecific[data-type="'+ parent.getAttribute('data-value') +'"]');
                                        if (typeSpecific) { typeSpecific.classList.add('active'); }
                                        refreshSizeThumbs(parent.getAttribute('data-value'));
                                    }

                                    editingUI.querySelectorAll('.cm6-wrapper').forEach(function(el) {
                                        if (el._cm6view) { el._cm6view.requestMeasure(); }
                                    });
                                });
                            });
                        }

                    });

                    // Transcripts

                    function updateExistingTranscripts() {
                        editingUI.querySelector('.existingTranscripts').innerHTML = '';

                        var database = FrameTrail.module('Database');

                        if ( database.hypervideo.subtitles ) {

                            var langMapping = database.subtitlesLangMapping;

                            for (var i=0; i < database.hypervideo.subtitles.length; i++) {
                                var currentSubtitles = database.hypervideo.subtitles[i],
                                    existingSubtitlesItem = document.createElement('div');
                                existingSubtitlesItem.className = 'existingSubtitlesItem';
                                existingSubtitlesItem.setAttribute('data-srclang', currentSubtitles.srclang);
                                existingSubtitlesItem.innerHTML = '<span>'+ langMapping[currentSubtitles.srclang] +'</span>';

                                if ( editingUI.querySelector('.contentViewData[data-property="transcriptSource"]').value == currentSubtitles.srclang ) {
                                    existingSubtitlesItem.classList.add('active');
                                }
                                existingSubtitlesItem.addEventListener('click', function(evt) {
                                    var thisSourceLang = this.getAttribute('data-srclang');
                                    editingUI.querySelector('.contentViewData[data-property="transcriptSource"]').value = thisSourceLang;
                                    updateExistingTranscripts();
                                });

                                editingUI.querySelector('.existingTranscripts').appendChild(existingSubtitlesItem);
                            }
                        }
                    }

                    updateExistingTranscripts();

                    // Content Collection Filters

                    var tagFilters = self.contentViewData.collectionFilter.tags;
                    var typeFilters = self.contentViewData.collectionFilter.types;
                    var userFilters = self.contentViewData.collectionFilter.users;

                    function createFilterSection(config) {
                        // config: { filters, attrName, itemClass, containerSel, buttonSel, getLabel, getAllItems }

                        function updateExisting() {
                            updateCollectionFilterValues();
                            var containerEl = editingUI.querySelector(config.containerSel);
                            containerEl.innerHTML = '';
                            config.filters.forEach(function(id) {
                                var item = document.createElement('div');
                                item.className = config.itemClass;
                                item.setAttribute('data-' + config.attrName, id);
                                item.textContent = config.getLabel(id);
                                var deleteButton = document.createElement('div');
                                deleteButton.className = 'deleteItem';
                                deleteButton.innerHTML = '<span class="icon-cancel"></span>';
                                deleteButton.addEventListener('click', function() {
                                    config.filters.splice(config.filters.indexOf(this.parentElement.getAttribute('data-' + config.attrName)), 1);
                                    updateExisting();
                                });
                                item.appendChild(deleteButton);
                                containerEl.appendChild(item);
                            });
                        }

                        function updateSelectList() {
                            var listEl = editingUI.querySelector(config.buttonSel + ' .contextSelectList');
                            listEl.innerHTML = '';
                            config.getAllItems().forEach(function(entry) {
                                if (config.filters.indexOf(entry.id) !== -1) { return; }
                                var item = document.createElement('div');
                                item.className = config.itemClass;
                                item.setAttribute('data-' + config.attrName, entry.id);
                                item.textContent = entry.label;
                                item.addEventListener('click', function() {
                                    config.filters.push(this.getAttribute('data-' + config.attrName));
                                    updateExisting();
                                });
                                listEl.appendChild(item);
                            });
                        }

                        editingUI.querySelector(config.buttonSel).addEventListener('click', function() {
                            var _this = this;
                            editingUI.querySelectorAll('.contextSelectButton').forEach(function(btn) {
                                if (btn !== _this) { btn.classList.remove('active'); }
                            });
                            updateSelectList();
                            _this.classList.toggle('active');
                        });

                        updateExisting();
                    }

                    // Tag Filter UI
                    createFilterSection({
                        filters:    tagFilters,
                        attrName:   'tag',
                        itemClass:  'tagItem',
                        containerSel: '.existingTags',
                        buttonSel:  '.newTagButton',
                        getLabel: function(id) {
                            return FrameTrail.module('TagModel').getTagLabelAndDescription(id, 'de').label;
                        },
                        getAllItems: function() {
                            var allTags = FrameTrail.module('TagModel').getAllTagLabelsAndDescriptions('de'),
                                result = [];
                            for (var tagID in allTags) { result.push({ id: tagID, label: allTags[tagID].label }); }
                            return result;
                        }
                    });

                    // Type Filter UI
                    createFilterSection({
                        filters:    typeFilters,
                        attrName:   'type',
                        itemClass:  'typeItem',
                        containerSel: '.existingTypes',
                        buttonSel:  '.newTypeButton',
                        getLabel: function(id) {
                            return id.charAt(0).toUpperCase() + id.substring(1);
                        },
                        getAllItems: function() {
                            var result = [];
                            for (var typeDef in FrameTrail.types) {
                                if (typeDef.indexOf('Resource') !== -1 && typeDef !== 'Resource' && typeDef !== 'ResourceText') {
                                    result.push({ id: typeDef.split('Resource')[1].toLowerCase(), label: '' });
                                }
                            }
                            result.forEach(function(e) { e.label = e.id.charAt(0).toUpperCase() + e.id.substring(1); });
                            return result;
                        }
                    });

                    // User Filter UI
                    createFilterSection({
                        filters:    userFilters,
                        attrName:   'user',
                        itemClass:  'userItem',
                        containerSel: '.existingUsers',
                        buttonSel:  '.newUserButton',
                        getLabel: function(id) {
                            return FrameTrail.module('Database').users[id].name;
                        },
                        getAllItems: function() {
                            var allUsers = FrameTrail.module('Database').users,
                                result = [];
                            for (var user in allUsers) { result.push({ id: user, label: allUsers[user].name }); }
                            return result;
                        }
                    });

                    // Update Collection Filter Values from UI Elements

                    editingUI.querySelector('.contentViewData[data-property="collectionFilter-text"]').addEventListener('keyup', function() {
                        updateCollectionFilterValues();
                    });

                    function updateCollectionFilterValues() {
                        var numberOfAnnotations = FrameTrail.module('TagModel').getContentCollection(
                                tagFilters,
                                false,
                                true,
                                userFilters,
                                editingUI.querySelector('.contentViewData[data-property="collectionFilter-text"]').value,
                                typeFilters
                            ).length;
                        var counterEl = editingUI.querySelector('.collectionCounter');
                        counterEl.textContent = numberOfAnnotations;
                        var counterMsg = counterEl.closest('.message');
                        counterMsg.classList.toggle('error', numberOfAnnotations === 0);
                        counterMsg.classList.toggle('success', numberOfAnnotations > 0);

                        [['tags', tagFilters], ['types', typeFilters], ['users', userFilters]].forEach(function(pair) {
                            editingUI.querySelector('.contentViewData[data-property="collectionFilter-' + pair[0] + '"]').value = pair[1].join(',');
                        });
                    }

                    // Init CodeMirror 6 editors

                    function createCM6Editor(targetTextarea, langMode, linter) {
                        var CM6 = window.FrameTrailCM6,
                            wrapper = document.createElement('div');
                        wrapper.className = 'cm6-wrapper';
                        wrapper.style.height = '100%';
                        targetTextarea.insertAdjacentElement('afterend', wrapper);
                        targetTextarea.style.display = 'none';
                        var editor = new CM6.EditorView({
                            state: CM6.EditorState.create({
                                doc: targetTextarea.value,
                                extensions: [
                                    CM6.oneDark,
                                    CM6.lineNumbers(),
                                    CM6.highlightActiveLine(),
                                    CM6.highlightActiveLineGutter(),
                                    CM6.drawSelection(),
                                    CM6.history(),
                                    CM6.keymap.of([].concat(CM6.defaultKeymap, CM6.historyKeymap)),
                                    CM6.EditorView.lineWrapping,
                                    CM6.StreamLanguage.define(langMode),
                                    linter,
                                    CM6.lintGutter(),
                                    CM6.EditorView.updateListener.of(function(update) {
                                        if (!update.docChanged) { return; }
                                        var val = update.state.doc.toString();
                                        targetTextarea.setAttribute('data-value', val);
                                        targetTextarea.value = val;
                                    })
                                ]
                            }),
                            parent: wrapper
                        });
                        wrapper._cm6view = editor;
                        return editor;
                    }

                    var CM6 = window.FrameTrailCM6;

                    createCM6Editor(
                        editingUI.querySelector('.contentViewData[data-property="onClickContentItem"]'),
                        CM6.legacyModes.javascript,
                        window.FrameTrailCM6Linters.js
                    );

                    createCM6Editor(
                        editingUI.querySelector('.contentViewData[data-property="html"]'),
                        CM6.legacyModes.html,
                        window.FrameTrailCM6Linters.html
                    );


                    return editingUI;

                },


                /**
                 * I collect all data values from Editing UI elements
                 * and return them in a data object.
                 *
                 * @method getDataFromEditingUI
                 * @param {HTMLElement} editingUIContainer
                 * @return {Object} newDataObject
                 */
                getDataFromEditingUI: function( editingUIContainer ) {

                    var newDataObject = {};

                    editingUIContainer.querySelectorAll('.contentViewData').forEach(function(el) {

                        var newValue;
                        if ( el.tagName === 'INPUT' && el.type === 'checkbox' ) {
                            newValue = el.checked;
                        } else if ( el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' ) {
                            newValue = el.value;
                            if ( el.getAttribute('data-property').indexOf('collectionFilter') != -1 && el.getAttribute('data-property') != 'collectionFilter-text' ) {
                                if ( el.value.length != 0 ) {
                                    newValue = el.value.split(',');
                                } else {
                                    newValue = [];
                                }
                            }
                        } else {
                            newValue = el.getAttribute('data-value');
                        }

                        if (newValue == 'true') {
                            newValue = true;
                        } else if (newValue == 'false') {
                            newValue = false;
                        }

                        if ( el.getAttribute('data-property').indexOf('-') != -1 ) {
                            var splitProperty = el.getAttribute('data-property').split('-'),
                                subObject = splitProperty[0],
                                subProperty = splitProperty[1];
                            if ( !newDataObject[subObject] ) {
                                newDataObject[subObject] = {};
                            }
                            newDataObject[subObject][subProperty] = newValue;
                        } else {
                            newDataObject[el.getAttribute('data-property')] = newValue;
                        }
                    });

                    return newDataObject;

                },


                /**
                 * I return the LayoutArea Container of the ContentView.
                 *
                 * @method getLayoutAreaContainer
                 * @return {HTMLElement} areaContainer
                 */
                getLayoutAreaContainer: function() {
                    var ViewVideo = FrameTrail.module('ViewVideo');
                    return ViewVideo['Area' + this._AREA_KEYS[this.whichArea] + 'Container'];
                },


                /**
                 * I return the LayoutArea Details Container of the ContentView.
                 *
                 * @method getLayoutAreaDetailsContainer
                 * @return {HTMLElement} areaDetailsContainer
                 */
                getLayoutAreaDetailsContainer: function() {
                    var ViewVideo = FrameTrail.module('ViewVideo');
                    return ViewVideo['Area' + this._AREA_KEYS[this.whichArea] + 'Details'];
                },


                /**
                 * I return the LayoutArea Preview Container of the ContentView.
                 *
                 * @method getLayoutAreaPreviewContainer
                 * @return {HTMLElement} areaContainer
                 */
                getLayoutAreaPreviewContainer: function() {
                    return FrameTrail.module('ViewVideo').HypervideoLayoutContainer
                        .querySelector('.layoutArea[data-area="area' + this._AREA_KEYS[this.whichArea] + '"]');
                }


            }


        }
    }


);
