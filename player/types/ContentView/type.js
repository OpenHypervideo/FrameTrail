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
        return {
            constructor: function (contentViewData, whichArea) {

                this.labels = FrameTrail.module('Localization').labels;

                contentViewData.type                   =  contentViewData.type || "TimedContent";
                contentViewData.name                   =  contentViewData.name || "";
                contentViewData.description            = contentViewData.description || "";
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


                updateContent: function() {

                    var self = this;

                    self.contentViewTab.attr('data-type', self.contentViewData.type);
                    self.contentViewTab.find('.contentViewTabName').html(self.contentViewData.name);

                    self.contentViewContainer.attr('data-type', self.contentViewData.type);
                    self.contentViewContainer.attr('data-size', self.contentViewData.contentSize);

                    if (self.contentViewData.initClosed) {
                        self.getLayoutAreaContainer().addClass('closed');
                    }

                    switch (this.contentViewData.type) {

                        case 'TimedContent':

                            self.contentViewContainer.find('.customhtmlContainer, .transcriptContainer').remove();

                            if (!self.contentViewData.collectionFilter) {
                                return;
                            }

                            var old_contentCollection = self.contentCollection;

                            self.contentCollection = FrameTrail.module('TagModel').getContentCollection(
                                self.contentViewData.collectionFilter.tags,
                                false,
                                true,
                                self.contentViewData.collectionFilter.users,
                                self.contentViewData.collectionFilter.text,
                                self.contentViewData.collectionFilter.types
                            );

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

                            self.contentCollection.forEach(function (contentItem) {
                                self.removeContentCollectionElements(contentItem);
                            });

                            var customhtmlContainer = $('<div class="customhtmlContainer">'+ self.contentViewData.html +'</div>');

                            self.contentViewContainer.find('.contentViewContents').empty().append(customhtmlContainer);

                            customhtmlContainer.click(function(evt) {
                                if ( $(evt.target).hasClass('timebased') ) {
                                    FrameTrail.module('HypervideoController').currentTime = parseFloat($(evt.target).attr('data-start')) + 0.05;
                                }
                            });

                            break;

                        case 'Transcript':

                            self.contentCollection.forEach(function (contentItem) {
                                self.removeContentCollectionElements(contentItem);
                            });

                            var transcriptContainer = $('<div class="transcriptContainer"></div>');

                            self.contentViewContainer.find('.contentViewContents').empty().append(transcriptContainer);

                            var subtitles = FrameTrail.module('Database').subtitles[self.contentViewData.transcriptSource];
                            if ( subtitles ) {
                                for (var i=0; i<subtitles.cues.length; i++) {
                                    var cueElement = $('<span data-start="'+ subtitles.cues[i].startTime +'" data-end="'+ subtitles.cues[i].endTime +'">'+ subtitles.cues[i].text +' </span>');
                                    transcriptContainer.append(cueElement);
                                }
                            }

        	                transcriptContainer.click(function(evt) {
                                FrameTrail.module('HypervideoController').currentTime = parseFloat($(evt.target).attr('data-start')) + 0.05;
                            });

                            transcriptContainer.perfectScrollbar({
                                wheelSpeed: 4,
                                suppressScrollX: true,
                                wheelPropagation: true
                            });

                            break;

                        case 'Timelines': 

                            self.contentCollection.forEach(function (contentItem) {
                                self.removeContentCollectionElements(contentItem);
                            });

                            self.contentCollection = FrameTrail.module('TagModel').getContentCollection(
                                self.contentViewData.collectionFilter.tags,
                                false,
                                true,
                                self.contentViewData.collectionFilter.users,
                                self.contentViewData.collectionFilter.text,
                                self.contentViewData.collectionFilter.types
                            );

                            var timelinesContainer = $('<div class="timelinesContainer"></div>');
                            var timelineList = $('<div class="timelineList" data-zoom-level="1"></div>');

                            //TODO: remove timeout (needed right now because video duration is not known)
                            //window.setTimeout(function() {
                                FrameTrail.module('AnnotationsController').renderAnnotationTimelines(self.contentCollection, timelineList, self.contentViewData.filterAspect, 'label', self.contentViewData.zoomControls);

                                timelinesContainer.append(timelineList);

                                self.contentViewContainer.find('.contentViewContents').empty().append(timelinesContainer);
                            //}, 2000);
                            

                            timelinesContainer.click(function(evt) {
                                if ( $(evt.target).hasClass('timebased') ) {
                                    FrameTrail.module('HypervideoController').currentTime = $(evt.target).attr('data-start') - 0.5;
                                }
                            });

                            break;

                    }

                    FrameTrail.module('ViewLayout').updateManagedContent();

                    window.setTimeout(function() {
                        self.resizeLayoutArea();
                    }, 50);

                },


                appendContentCollectionElements: function(contentItem, appendAtIndex) {
                    
                    var collectionElement = $('<div class="collectionElement"></div>'),
                        self = this;

                    if ( self.contentViewData.onClickContentItem.length != 0 ) {
                        collectionElement.click(function() {
                            try {
                                var thisFunction = new Function(self.contentViewData.onClickContentItem);
                                thisFunction.call(contentItem);
                            } catch (exception) {
                                // could not parse and compile JS code!
                                console.warn(self.labels['MessageEventHandlerContainsErrors']+ ': '+ exception.message);
                            }
                        });
                    }

                    if ( self.contentViewData.contentSize == 'large' ) {
                        collectionElement.append(contentItem.resourceItem.renderContent());
                    } else {
                        collectionElement.append(contentItem.resourceItem.renderThumb());
                    }

                    self.appendElementAtIndex(self.contentViewContainer.find('.contentViewContents'), collectionElement, appendAtIndex);
                    contentItem.contentViewElements.push(collectionElement);

                    // Append Detail Element if contentView size is not large
                    // (otherwise Details are already shown)
                    // ONLY APPLY TO TOP & BOTTOM DETAILS
                    if ( self.contentViewData.contentSize != 'large' && (self.whichArea == 'top' || self.whichArea == 'bottom') ) {

                        var detailElement = $('<div class="collectionElement"></div>');

                        detailElement.append(contentItem.resourceItem.renderContent());

                        self.appendElementAtIndex(self.contentViewDetailsContainer.find('.contentViewDetailsContents'), detailElement, appendAtIndex);
                        contentItem.contentViewDetailElements.push(detailElement);

                        collectionElement.click(function() {
                            if ( !$(this).hasClass('open') ) {
                                $(this).siblings('.collectionElement').removeClass('open');
                                self.contentViewDetailsContainer.find('.collectionElement').removeClass('open');

                                $(this).addClass('open');
                                self.contentViewDetailsContainer.find('.collectionElement').eq($(this).index()).addClass('open');

                                self.updateCollectionSlider(true);

                                FrameTrail.module('ViewVideo').shownDetails = self.whichArea;

                                var annoData = contentItem.data;
                                FrameTrail.triggerEvent('userAction', {
                                    action: 'AnnotationOpen',
                                    annotation: annoData
                                });

                            } else {
                                $(this).removeClass('open');
                                self.contentViewDetailsContainer.find('.collectionElement').removeClass('open');
                                FrameTrail.module('ViewVideo').shownDetails = null;
                            }
                        });
                    }

                    if ( self.whichArea == 'left' || self.whichArea == 'right' ) {
                        collectionElement.click(function() {
                            if ( self.contentViewData.contentSize == 'small' ) {
                                $(this).find('.resourcePreviewButton').click();

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
                        $(targetElement).children().eq(index-1).after(element);
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
                        if ( this.contentViewContainer.find(contentItem.contentViewElements[i]).length != 0 ) {
                            return this.contentViewContainer.find(contentItem.contentViewElements[i]);
                        }
                    }

                    return null;
                },


                getDetailElementFromContentItem: function(contentItem) {
                    for (var i=0; i<contentItem.contentViewDetailElements.length; i++) {
                        if ( this.contentViewDetailsContainer.find(contentItem.contentViewDetailElements[i]).length != 0 ) {
                            return this.contentViewDetailsContainer.find(contentItem.contentViewDetailElements[i]);
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
                    contentViewContainer.hover(function() {
                        self.isMouseOver = true;
                    }, function() {
                        self.isMouseOver = false;
                    });

                    this.contentViewTab = contentViewTab;
                    this.contentViewContainer = contentViewContainer;

                    areaContainer.find('.layoutAreaTabs').append( contentViewTab );
                    areaContainer.find('.layoutAreaContent').append( contentViewContainer );

                    // Append Details Containers
                    var contentViewDetailsContainer = this.renderContentViewDetailsContainer(),
                        areaDetailsContainer = this.getLayoutAreaDetailsContainer();

                    this.contentViewDetailsContainer = contentViewDetailsContainer;

                    areaDetailsContainer.append(contentViewDetailsContainer);

                    this.activateContentView();

                },


                removeDOMElement: function() {
                    // TODO
                    // remove contentView from layoutArea [this.whichArea]
                    //         this.myDetailView = $('<div>....</div>')
                    //         this.myContainerView = $('<div>....</div>')
                    this.contentViewContainer.remove();
                    this.contentViewTab.remove();
                    this.contentViewDetailsContainer.remove();

                    if (this.contentViewPreviewElement.length != 0) {
                        this.contentViewPreviewElement.remove();
                    }

                    if (this.contentViewPreviewTab.length != 0) {
                        this.contentViewPreviewTab.remove();
                    }
                },


                updateTimedStateOfContentViews: function(currentTime) {
                    // console.log('updateTimedStateOfContentViews', this, currentTime);

                    var self = this;

                    switch (self.contentViewData.type) {
                        case 'TimedContent':
                            // Annotations are already updated by ViewLayout module!

                            if (!self.isMouseOver) {
                                self.updateCollectionSlider();
                            }

                            break;
                        case 'CustomHTML':

                            var timebasedElements = self.contentViewContainer.find('.customhtmlContainer').find('.timebased');

                            if ( timebasedElements.length != 0 ) {
                                timebasedElements.each(function() {
                                    var startTime = parseFloat($(this).attr('data-start')),
                                        endTime = parseFloat($(this).attr('data-end'));
                                    if ( startTime-0.5 <= currentTime && endTime-0.5 >= currentTime ) {
                                        if ( !$(this).hasClass('active') ) {
                                            $(this).addClass('active');
                                            var timebasedTabParent = $(this).parents('.tab-pane.timebasedTab');
                                            if (timebasedTabParent.length != 0) {
                                                scrollTimebasedElements(timebasedTabParent);
                                            } else {
                                                scrollTimebasedElements();
                                            }
                                            
                                        }
                                    } else if ( $(this).hasClass('active') ) {
                                        $(this).removeClass('active');
                                    }
                                });
                            }

                            function scrollTimebasedElements(elementToScroll) {
                                
                                if (self.isMouseOver) {
                                    return;
                                }
                                var customhtmlContainer = (elementToScroll) ? elementToScroll : self.contentViewContainer.find('.customhtmlContainer'),
                                    firstActiveElement = customhtmlContainer.find('.timebased.active').eq(0);


                                if ( !self.contentViewContainer.hasClass('active') || firstActiveElement.length == 0 ) {
                                    return;
                                }

                                var activeElementPosition = firstActiveElement.position();

                                if ( activeElementPosition.top <
                                    customhtmlContainer.height()/2 + customhtmlContainer.scrollTop()
                                    || activeElementPosition.top > customhtmlContainer.height()/2 + customhtmlContainer.scrollTop() ) {

                                    var newPos = activeElementPosition.top + customhtmlContainer.scrollTop() - customhtmlContainer.height()/2;
                                    customhtmlContainer.stop().animate({scrollTop : newPos},400);
                                }

                            }

                            break;
                        case 'Transcript':

                            var transcriptElements = self.contentViewContainer.find('.transcriptContainer').find('span');

                            if ( transcriptElements.length != 0 ) {
                                transcriptElements.each(function() {
                                    var startTime = parseFloat($(this).attr('data-start')),
                                        endTime = parseFloat($(this).attr('data-end'));
                                    if ( startTime-0.5 <= currentTime && endTime-0.5 >= currentTime ) {
                                        if ( !$(this).hasClass('active') ) {
                                            $(this).addClass('active');
                                            scrollTranscript();
                                        }
                                    } else if ( $(this).hasClass('active') ) {
                                        $(this).removeClass('active');
                                    }
                                });
                            }

                            function scrollTranscript() {

                                if (self.isMouseOver) {
                                    return;
                                }
                                var transcriptContainer = self.contentViewContainer.find('.transcriptContainer'),
                                    firstActiveElement = transcriptContainer.find('span.active').eq(0);

                                if ( !self.contentViewContainer.hasClass('active') || firstActiveElement.length == 0 ) {
                                    return;
                                }

                                var activeElementPosition = firstActiveElement.position();

                                if ( activeElementPosition.top <
                                    transcriptContainer.height()/2 + transcriptContainer.scrollTop()
                                    || activeElementPosition.top > transcriptContainer.height()/2 + transcriptContainer.scrollTop() ) {

                                    var newPos = activeElementPosition.top + transcriptContainer.scrollTop() - transcriptContainer.height()/2;
                                    transcriptContainer.stop().animate({scrollTop : newPos},400);
                                }

                            }

                            break;

                        case 'Timelines':
                            
                            var HypervideoModel = FrameTrail.module('HypervideoModel'),
                                timeWithOffset = currentTime-HypervideoModel.offsetIn,
                                timePercent = 100 * (timeWithOffset / HypervideoModel.duration);
                                
                            self.contentViewContainer.find('.timelineProgressRange').css('width', timePercent + '%');

                            break;
                    }


                },


                updateLayout: function() {

                    var self = this;
                        HypervideoDuration = FrameTrail.module('HypervideoModel').duration;

                    //console.log(HypervideoDuration);

                    if (!self.contentViewContainer.hasClass('active')) {
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

                    if ( self.contentViewData.type == 'Transcript' ) {
                        self.contentViewContainer.find('.transcriptContainer').perfectScrollbar('update');
                    }

                    if ( self.contentViewData.type == 'Timelines' ) {
                        self.updateCompareTimelineItems();
                    }

                    self.scaleDetailElements();

                },


                updateCompareTimelineItems: function() {
                    var self = this;
                        HypervideoDuration = FrameTrail.module('HypervideoModel').duration,
                        timelineList = self.contentViewContainer.find('.timelineList');

                    if (HypervideoDuration && !timelineList.hasClass('initialized')) {
                        
                        var timelineItems = timelineList.find('.compareTimelineElement');

                        timelineItems.each(function() {
                            var originTimeStart = parseFloat($(this).data('start')),
                                originTimeEnd   = parseFloat($(this).data('end')),
                                timeStart       = originTimeStart - FrameTrail.module('HypervideoModel').offsetIn,
                                timeEnd         = originTimeEnd - FrameTrail.module('HypervideoModel').offsetOut;
                                positionLeft    = 100 * (timeStart / HypervideoDuration),
                                width           = 100 * ((originTimeEnd - originTimeStart) / HypervideoDuration);

                            $(this).css({
                                left:  positionLeft + '%',
                                width: width + '%'
                            });

                            $(this).removeClass('previewPositionLeft previewPositionRight');

                            if (positionLeft < 10 && width < 10) {
                                $(this).addClass('previewPositionLeft');
                            } else if (positionLeft > 90) {
                                $(this).addClass('previewPositionRight');
                            }
                        });

                        timelineList.addClass('initialized');
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

                    areaContainer.find('.layoutAreaTabs').append( contentViewPreviewTab );
                    areaContainer.find('.layoutAreaContent').append( contentViewPreviewElement );

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

                    self.contentViewPreviewTab.attr('data-type', self.contentViewData.type);
                    self.contentViewPreviewTab.find('.contentViewTabName').html(self.contentViewData.name);

                    self.contentViewPreviewElement.attr('data-type', self.contentViewData.type);
                    self.contentViewPreviewElement.attr('data-size', self.contentViewData.contentSize);
                    self.contentViewPreviewElement.find('.contentViewPreviewDescription').html(''+ ((self.contentViewData.type == 'TimedContent') ? self.labels['GenericAnnotationCollection'] : self.contentViewData.type) +'<br>'+ self.labels['SettingsContentViewSize'] +': '+ self.contentViewData.contentSize +'');

                    self.resizeLayoutAreaPreview();

                },


                /**
                 * I render a ContentView tab.
                 *
                 * @method renderContentViewTab
                 * @return {HTMLElement} tabElement
                 */
                renderContentViewTab: function() {

                    var self = this;
                        tabElement = $('<div class="contentViewTab" '
                                    +   'data-type="'+ self.contentViewData.type +'">'
                                    +   '    <div class="contentViewTabName">'+ self.contentViewData.name +'</div>'
                                    +   '</div>');

                    tabElement.click(function() {
                        self.activateContentView();
                    });

                    return tabElement;

                },


                /**
                 * I render a ContentView Preview tab.
                 *
                 * @method renderContentViewPreviewTab
                 * @return {HTMLElement} tabElement
                 */
                renderContentViewPreviewTab: function() {

                    var self = this;
                        tabElement = $('<div class="contentViewTab" '
                                    +   'data-type="'+ self.contentViewData.type +'">'
                                    +   '    <div class="contentViewTabName">'+ self.contentViewData.name +'</div>'
                                    +   '</div>');

                    tabElement.click(function() {
                        self.activateContentViewPreview();
                    });

                    return tabElement;

                },


                /**
                 * I render a ContentView Container Element.
                 *
                 * @method renderContentViewContainer
                 * @return {HTMLElement} containerElement
                 */
                renderContentViewContainer: function() {

                    var self = this,
                        containerElement = $('<div class="contentViewContainer" '
                                            +'data-size="'+ self.contentViewData.contentSize +'" '
                                            +'data-type="'+ self.contentViewData.type +'">'
                                            +'    <div class="contentViewContents"></div>'
                                            +'</div>');

                    if ( self.whichArea == 'top' || self.whichArea == 'bottom' ) {
                        var slideLeftButton  = $('<div class="slideButton slideLeft">'
                                                +'    <span class="icon-left-open-big"></span>'
                                                +'</div>');
                        var slideRightButton = $('<div class="slideButton slideRight">'
                                                +'    <span class="icon-right-open-big"></span>'
                                                +'</div>');

                        slideLeftButton.click(function() {
                            var container = self.contentViewContainer.find('.contentViewContents'),
                                slideAmount = container.parent().width() / 3,
                                leftValue = parseInt(container.css('left')) + slideAmount;

                            if ( leftValue >= 10 ) {
                                container.css('left', '');
                            } else {
                                container.css('left', leftValue + 'px');
                            }
                        });
                        slideRightButton.click(function() {
                            var container = self.contentViewContainer.find('.contentViewContents'),
                                slideAmount = container.parent().width() / 3,
                                leftValue = parseInt(container.css('left')) - slideAmount;

                            if ( leftValue <= - ( container.outerWidth() - container.parent().width() ) ) {
                                container.css('left', - ( container.outerWidth() - container.parent().width() ) );
                            } else {
                                container.css('left', leftValue + 'px');
                            }
                        });

                        containerElement.append(slideLeftButton, slideRightButton);

                    } else {
                        var slideTopButton    = $('<div class="slideButton slideTop">'
                                                + '    <span class="icon-up-open-big"></span>'
                                                + '</div>');
                        var slideBottomButton = $('<div class="slideButton slideBottom">'
                                                + '    <span class="icon-down-open-big"></span>'
                                                + '</div>');

                        slideTopButton.click(function() {
                            var container = self.contentViewContainer.find('.contentViewContents'),
                                slideAmount = container.parent().height() / 3,
                                topValue = parseInt(container.css('top')) + slideAmount;

                            if ( topValue >= 10 ) {
                                container.css('top', '');
                            } else {
                                container.css('top', topValue + 'px');
                            }
                        });
                        slideBottomButton.click(function() {
                            var container = self.contentViewContainer.find('.contentViewContents'),
                                slideAmount = container.parent().height() / 3,
                                topValue = parseInt(container.css('top')) - slideAmount;

                            if ( topValue <= - ( container.outerHeight() - container.parent().height() ) ) {
                                container.css('top', - ( container.outerHeight() - container.parent().height() ) );
                            } else {
                                container.css('top', topValue + 'px');
                            }
                        });

                        containerElement.append(slideTopButton, slideBottomButton);
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
                        detailsContainerElement = $('<div class="contentViewDetailsContainer">'
                                                +   '    <div class="contentViewDetailsContents"></div>'
                                                +   '    <div class="slideButton slideLeft" title="'+ self.labels['MessageHintTryUsingArrowKeys'] +'">'
                                                +   '        <span class="icon-left-open-big"></span>'
                                                +   '    </div>'
                                                +   '    <div class="slideButton slideRight" title="'+ self.labels['MessageHintTryUsingArrowKeys'] +'">'
                                                +   '        <span class="icon-right-open-big"></span>'
                                                +   '    </div>'
                                                +   '</div>');

                    detailsContainerElement.find('.slideButton.slideLeft').click(function() {
                        var activeElement = self.contentViewContainer.find('.collectionElement.open');
                        if ( activeElement ) {
                            activeElement.prev('.collectionElement').click();
                        }
                    });

                    detailsContainerElement.find('.slideButton.slideRight').click(function() {
                        var activeElement = self.contentViewContainer.find('.collectionElement.open');
                        if ( activeElement ) {
                            activeElement.next('.collectionElement').click();
                        }
                    });

                    return detailsContainerElement;

                },


                /**
                 * I render a ContentView Preview Element.
                 *
                 * @method renderContentViewPreviewElement
                 * @return {HTMLElement} previewElement
                 */
                renderContentViewPreviewElement: function() {

                    var self = this,
                        previewElement = $('<div class="contentViewPreview" '
                                    +   'data-size="'+ self.contentViewData.contentSize +'" '
                                    +   'data-type="'+ self.contentViewData.type +'">'
                                    +   '    <div class="contentViewOptions">'
                                    +   '        <button class="editContentView"><span class="icon-pencil"></span></button>'
                                    +   '        <button class="deleteContentView"><span class="icon-trash"></span></button>'
                                    +   '    </div>'
                                    +   '    <div class="contentViewPreviewDescription">'+ ((self.contentViewData.type == 'TimedContent') ? self.labels['GenericAnnotationCollection'] : self.contentViewData.type) +'<br>'+ self.labels['SettingsContentViewSize'] +': '+ self.contentViewData.contentSize +'</div>'
                                    +   '</div>');

                    previewElement.find('.editContentView').click(function() {
                        self.editContentView();
                    });

                    previewElement.find('.deleteContentView').click(function() {

                        // TODO: use closest()
                        var closestContentViewTab = (self.contentViewTab.prev('.contentViewTab').length != 0) ? self.contentViewTab.prev('.contentViewTab') : self.contentViewTab.next('.contentViewTab');
                        if ( closestContentViewTab.length != 0 ) {
                            closestContentViewTab.click();
                        } else {
                            self.resizeLayoutArea(true);
                        }

                        // TODO: use closest()
                        var closestContentViewPreviewTab = (self.contentViewPreviewTab.prev('.contentViewTab').length != 0) ? self.contentViewPreviewTab.prev('.contentViewTab') : self.contentViewPreviewTab.next('.contentViewTab');
                        if ( closestContentViewPreviewTab.length != 0 ) {
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

                    if (self.contentViewContainer.length == 0) {
                        self.resizeLayoutArea(true);
                        return;
                    }

                    self.contentViewTab.siblings('.contentViewTab').removeClass('active');
                    self.contentViewTab.addClass('active');

                    self.contentViewContainer.siblings('.contentViewContainer').removeClass('active');
                    self.contentViewContainer.addClass('active');

                    self.contentViewDetailsContainer.siblings('.contentViewDetailsContainer').removeClass('active');
                    self.contentViewDetailsContainer.addClass('active');

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

                    if (self.contentViewPreviewElement.length == 0) {
                        self.resizeLayoutAreaPreview(true);
                        return;
                    }

                    self.contentViewPreviewTab.siblings('.contentViewTab').removeClass('active');
                    self.contentViewPreviewTab.addClass('active');

                    self.contentViewPreviewElement.siblings('.contentViewPreview').removeClass('active');
                    self.contentViewPreviewElement.addClass('active');

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
                        areaContainer.removeAttr('data-size');
                    } else {
                        areaContainer.attr('data-size', self.contentViewData.contentSize);
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
                        areaContainer.removeAttr('data-size');
                    } else {
                        areaContainer.attr('data-size', self.contentViewData.contentSize);
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
                                rescale(domElement, domElement.width());
                            }

                            // TODO: RESCALE DETAIL ELEMENTS

                            //rescale( this.annotationElement, FrameTrail.module('ViewVideo').AreaBottomDetails.width() );
                        }

                        function rescale(element, referenceWidth) {

                            var elementToScale = element.find('.resourceDetail'),
                                wrapperElement = element,
                                scaleBase = 400;

                            if (referenceWidth >= scaleBase) {
                                elementToScale.css({
                                    top: 0,
                                    left: 0,
                                    height: '',
                                    width: '',
                                    transform: "none"
                                });
                                return;
                            }

                            var scale = referenceWidth / scaleBase,
                                negScale = 1/scale;

                            elementToScale.css({
                                top: 50 + '%',
                                left: 50 + '%',
                                width: scaleBase + 'px',
                                height: wrapperElement.height() * negScale + 'px',
                                transform: "translate(-50%, -50%) scale(" + scale + ")"
                            });

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
                        annotations         = self.contentCollection,
                        videoDuration       = FrameTrail.module('HypervideoModel').duration,
                        sliderParent        = self.contentViewContainer,
                        containerElement    = self.contentViewContainer.find('.contentViewContents'),
                        groupCnt            = 0,
                        gap                 = 4 + 4,
                        thisElement         = null,
                        previousElement,
                        previousElementRightPos,
                        startTime,
                        endTime,
                        middleTime,
                        desiredPosition,
                        finalPosition;

                    containerElement.children().removeAttr('data-group-id');
                    containerElement.children().css({
                        position: '',
                        left:     ''
                    });

                    function getTotalWidth(collection, addition){

                        var totalWidth = 0;
                        collection.each(function() {
                            totalWidth += $(this).outerWidth()+addition+1;
                        });
                        return totalWidth;

                    }

                    function getNegativeOffsetRightCorrection(leftPosition, collectionWidth) {

                        var offsetCorrection,
                            mostRightPos = leftPosition + collectionWidth + (gap*2);

                        if ( mostRightPos >= sliderParent.width() ) {
                            offsetCorrection = mostRightPos - sliderParent.width();

                            return offsetCorrection;

                        }

                        return 0;
                    }

                    // Cancel if total width > container width
                    if ( getTotalWidth(containerElement.children(), 4) > sliderParent.width() ) {
                        containerElement.width( getTotalWidth(containerElement.children(), 4) );
                        return;
                    } else {
                        containerElement.width('');
                    }

                    // Distribute Items
                    for (var i = 0; i < annotations.length; i++) {

                        thisElement = self.getContentViewElementFromContentItem(annotations[i]);
                        if (!thisElement) {
                            continue;
                        }
                        //console.log(thisElement);
                        if (i > 0) {
                            previousElement         = self.getContentViewElementFromContentItem(annotations[i-1]);
                            if (!previousElement) {
                                continue;
                            }
                            previousElementRightPos = previousElement.position().left + previousElement.width();
                        }

                        startTime   = annotations[i].data.start;
                        endTime     = annotations[i].data.end;
                        middleTime  = (startTime + ( (endTime-startTime)/2 )) - FrameTrail.module('HypervideoModel').offsetIn;

                        desiredPosition = ( (sliderParent.width() / videoDuration) * middleTime ) - ( thisElement.width()/2 );
                        //console.log(desiredPosition);

                        thisElement.attr({
                            'data-in':  startTime,
                            'data-out': endTime
                        });

                        if (desiredPosition <= 0) {
                            finalPosition = 0;
                            thisElement.removeAttr('data-group-id');
                            groupCnt++;

                        } else if (desiredPosition < previousElementRightPos + gap) {


                            finalPosition = previousElementRightPos + gap;

                            if (previousElement.attr('data-group-id')) {

                                containerElement.children('[data-group-id="'+ previousElement.attr('data-group-id') +'"]').attr('data-group-id', groupCnt);

                            } else {

                                previousElement.attr('data-group-id', groupCnt);

                            }

                            thisElement.attr('data-group-id', groupCnt);
                            groupCnt++;

                        } else {

                            finalPosition = desiredPosition;
                            thisElement.removeAttr('data-group-id');
                            groupCnt++;

                        }

                        thisElement.css({
                            position: "absolute",
                            left: finalPosition + "px"
                        });

                    }

                    // Re-Arrange Groups

                    var groupCollection,
                        p,
                        previousGroupCollection,
                        previousGroupCollectionRightPos,
                        totalWidth,
                        groupStartTime,
                        groupEndTime,
                        groupMiddleTime,
                        desiredGroupPosition,
                        correction,
                        negativeOffsetRightCorrection,
                        groupIDs;

                    function arrangeGroups() {

                        groupIDs = [];

                        containerElement.children('[data-group-id]').each(function() {
                            if ( groupIDs.indexOf( $(this).attr('data-group-id') ) == -1 ) {
                                groupIDs.push($(this).attr('data-group-id'));
                            }
                        });

                        for (var i=0; i < groupIDs.length; i++) {

                            var g = groupIDs[i];

                            groupCollection = containerElement.children('[data-group-id="'+ g +'"]');

                            if (groupCollection.length < 1) {
                                continue;
                            }

                            if ( groupIDs[i-1] ) {
                                p = groupIDs[i-1];
                                previousGroupCollection         = containerElement.children('[data-group-id="'+ p +'"]');
                                previousGroupCollectionRightPos = previousGroupCollection.eq(0).position().left + getTotalWidth( previousGroupCollection, 4 );
                            }

                            totalWidth      = getTotalWidth( groupCollection, 4 );

                            groupStartTime  = parseInt(groupCollection.eq(0).attr('data-in'));
                            groupEndTime    = parseInt(groupCollection.eq(groupCollection.length-1).attr('data-out'));
                            groupMiddleTime = (groupStartTime + ( (groupEndTime-groupStartTime)/2 )) - FrameTrail.module('HypervideoModel').offsetIn;

                            desiredGroupPosition = ( (sliderParent.width() / videoDuration) * groupMiddleTime ) - ( totalWidth/2 );

                            correction = groupCollection.eq(0).position().left - desiredGroupPosition;

                            if ( groupCollection.eq(0).position().left - correction >= 0 && desiredGroupPosition > previousGroupCollectionRightPos + gap ) {

                                groupCollection.each(function() {
                                    $(this).css('left', '-='+ correction +'');
                                });

                            } else if ( groupCollection.eq(0).position().left - correction >= 0 && desiredGroupPosition < previousGroupCollectionRightPos + gap ) {

                                var  attachCorrection = groupCollection.eq(0).position().left - previousGroupCollectionRightPos;
                                groupCollection.each(function() {

                                    $(this).css('left', '-='+ attachCorrection +'');

                                });

                                if ( groupCollection.eq(0).prev().length ) {

                                    var prevElem = groupCollection.eq(0).prev();

                                    if ( prevElem.attr('data-group-id') ) {

                                        previousGroupCollection.attr('data-group-id', g);

                                    } else {

                                        prevElem.attr('data-group-id', g);

                                    }

                                }

                            }

                        }

                    }

                    arrangeGroups();



                    // Deal with edge case > elements outside container on right side

                    var repeatIteration;

                    function solveRightEdgeOverlap() {

                        repeatIteration = false;

                        for (var i = 0; i < annotations.length; i++) {

                            thisElement = self.getContentViewElementFromContentItem(annotations[i]);
                            if (!thisElement) {
                                continue;
                            }

                            var g = undefined;

                            if ( thisElement.attr('data-group-id') ) {
                                g = thisElement.attr('data-group-id');
                                groupCollection = containerElement.children('[data-group-id="'+ g +'"]');
                            } else {
                                groupCollection = thisElement;
                            }

                            if (groupCollection.eq(0).prev().length) {

                                previousElement = groupCollection.eq(0).prev();

                                if ( previousElement.attr('data-group-id') ) {

                                    previousGroupCollection         = containerElement.children('[data-group-id="'+ previousElement.attr('data-group-id') +'"]');
                                    previousGroupCollectionRightPos = previousGroupCollection.eq(0).position().left + getTotalWidth( previousGroupCollection, 4 );

                                } else {

                                    previousGroupCollection         = previousElement;
                                    previousGroupCollectionRightPos = previousElement.position().left + previousElement.width() + gap;

                                }


                            } else {
                                previousGroupCollectionRightPos = 0;
                            }

                            totalWidth = getTotalWidth( groupCollection, 4 );

                            currentGroupCollectionLeft = groupCollection.eq(0).position().left;
                            currentGroupCollectionRightPos = groupCollection.eq(0).position().left + totalWidth;

                            negativeOffsetRightCorrection = getNegativeOffsetRightCorrection(currentGroupCollectionLeft, totalWidth);

                            if ( currentGroupCollectionLeft - negativeOffsetRightCorrection >= 0  && negativeOffsetRightCorrection > 1 ) {

                                if ( currentGroupCollectionLeft - negativeOffsetRightCorrection > previousGroupCollectionRightPos + gap ) {

                                    groupCollection.each(function() {
                                        $(this).css('left', '-='+ negativeOffsetRightCorrection +'');
                                    });

                                } else if ( currentGroupCollectionLeft - negativeOffsetRightCorrection < previousGroupCollectionRightPos + gap ) {

                                    var attachCorrection = currentGroupCollectionLeft - previousGroupCollectionRightPos;
                                    groupCollection.each(function() {
                                        $(this).css('left', '-='+ attachCorrection +'');
                                    });

                                    if ( !g && previousElement.length && previousElement.attr('data-group-id') ) {

                                        thisElement.attr('data-group-id', previousElement.attr('data-group-id'));

                                    }

                                    if ( previousElement.attr('data-group-id') ) {

                                        containerElement.children('[data-group-id="'+ previousElement.attr('data-group-id') +'"]').attr('data-group-id', g);

                                    } else {

                                        previousElement.attr('data-group-id', g);

                                    }


                                    repeatIteration = false;

                                }

                            }

                        }

                        if ( repeatIteration ) {
                            solveRightEdgeOverlap();
                        }

                    }

                    solveRightEdgeOverlap();

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
                        widthOfSlider           = 0,
                        heightOfSlider          = 0,
                        gap                     = (details || self.contentViewData.contentSize == 'large') ? 10 : 4,
                        slideAxis               = (self.whichArea == 'top' || self.whichArea == 'bottom') ? 'x' : 'y',
                        sliderParent            = (details) ? self.contentViewDetailsContainer : self.contentViewContainer,
                        sliderElement           = (details) ? self.contentViewDetailsContainer.find('.contentViewDetailsContents') : self.contentViewContainer.find('.contentViewContents');

                    if ( self.contentCollection.length == 0
                        || ( (self.whichArea == 'left' || self.whichArea == 'right') && self.contentViewData.contentSize == 'large')
                        || !sliderParent.hasClass('active') ) {

                        if (slideAxis == 'x') {
                            sliderElement.width('');
                            sliderElement.css('left', '');
                        } else {
                            sliderElement.height('');
                            sliderElement.css('top', '');
                        }

                        sliderParent.find('.slideButton').hide();

                        return;
                    }

                    // Set sliderElement Dimensions

                    if ( slideAxis == 'x' ) {

                        for (var idx in self.contentCollection) {
                            var element = (details) ? self.getDetailElementFromContentItem(self.contentCollection[idx]) : self.getContentViewElementFromContentItem(self.contentCollection[idx]);
                            // TODO: Check why element is null after changing collection
                            if (element) {
                                widthOfSlider += element.outerWidth() + gap;
                            }

                        }

                        if ( widthOfSlider > sliderParent.width() ) {
                            sliderElement.width(widthOfSlider);
                            sliderParent.find('.slideButton').show();
                        } else {
                            sliderElement.width('');
                            sliderElement.css('left', gap + 'px');
                            sliderParent.find('.slideButton').hide();
                            return;
                        }

                    } else {
                        for (var idx in self.contentCollection) {
                            var element = (details) ? self.getDetailElementFromContentItem(self.contentCollection[idx]) : self.getContentViewElementFromContentItem(self.contentCollection[idx]);
                            //. TODO: Check why element is null after changing collection
                            if (element) {
                                heightOfSlider += element.outerHeight() + gap;
                            }
                        }

                        if ( heightOfSlider > sliderParent.height() ) {
                            sliderElement.height(heightOfSlider);
                            sliderParent.find('.slideButton').show();
                        } else {
                            sliderElement.height('');
                            sliderElement.css('top', gap + 'px');
                            sliderParent.find('.slideButton').hide();
                            return;
                        }

                    }

                    // Slide to active Annotation Element

                    var activeAnnotations = [];

                    if (details) {

                        self.contentViewDetailsContainer.find('.collectionElement.open').each(function() {
                            activeAnnotations.push($(this));
                        });

                    } else {

                        for (var idx in self.contentCollection) {

                            // TODO: CHECK WHY ANNOTATIONS IN IDENTICAL CONTENT COLLECTIONS ARE NOT SET ACTIVE (only first one)!
                            // console.log(this.whichArea, this.contentCollection[idx].activeStateInContentView(this));

                            if ( self.contentCollection[idx].activeStateInContentView(self) ) {
                                activeAnnotations.push(self.contentCollection[idx]);
                            }
                        }

                    }

                    if (activeAnnotations.length == 0) {
                        return;
                    }

                    var activeAnnotationElement = (details) ? activeAnnotations[0] : self.getContentViewElementFromContentItem(activeAnnotations[0]),
                        activeElementPosition   = activeAnnotationElement.position();

                    if ( slideAxis == 'x' ) {

                        if ( widthOfSlider > sliderParent.width() ) {

                            var leftOffset = -1 * (     activeElementPosition.left
                                                      - 1
                                                      - sliderParent.innerWidth() / 2
                                                      + activeAnnotationElement.outerWidth() / 2
                                            );

                            if ( !details && leftOffset > 0 ) {
                                sliderElement.css('left', gap + 'px');
                            } else if ( !details && leftOffset < - (widthOfSlider - sliderParent.width()) ) {
                                sliderElement.css('left', - (widthOfSlider - sliderParent.width()));
                            } else {
                                sliderElement.css('left', leftOffset);
                            }

                        }


                    } else {

                        if ( heightOfSlider > sliderParent.height() ) {

                            var topOffset = -1 * (      activeElementPosition.top
                                                      - 1
                                                      - sliderParent.innerHeight() / 2
                                                      + activeAnnotationElement.outerHeight() / 2
                                            );

                            if ( !details && topOffset > 0 ) {
                                sliderElement.css('top', gap + 'px');
                            } else if ( !details && topOffset < - (heightOfSlider - sliderParent.height()) ) {
                                sliderElement.css('top', - (heightOfSlider - sliderParent.height()));
                            } else {
                                sliderElement.css('top', topOffset);
                            }

                        }

                    }


                },


                /**
                 * I create an edit dialog for a ContentView
                 *
                 * @method editContentView
                 * @param {Boolean} isNew
                 */
                editContentView: function(isNew) {

                    var elementOrigin = this.contentViewPreviewElement,
                        animationDiv = elementOrigin.clone(),
                        originOffset = elementOrigin.offset(),
                        finalTop = ($(window).height()/2) - 300,
                        finalLeft = ($(window).width()/2) - 407,
                        self = this;

                    animationDiv.addClass('contentViewAnimationDiv').css({
                        position: 'absolute',
                        top: originOffset.top + 'px',
                        left: originOffset.left + 'px',
                        width: elementOrigin.width(),
                        height: elementOrigin.height(),
                        zIndex: 99
                    }).appendTo('body');

                    animationDiv.animate({
                        top: finalTop + 'px',
                        left: finalLeft + 'px',
                        width: 814 + 'px',
                        height: 600 + 'px'
                    }, 300, function() {


                        var dialogTitle = (isNew) ? self.labels['SettingsContentViewNew'] : self.labels['SettingsContentViewEdit'],
                            editDialog = $('<div class="editContentViewDialog" title="'+ dialogTitle +'"></div>');

                        editDialog.append(self.renderContentViewPreviewEditingUI());

                        editDialog.dialog({
                            resizable: false,
                            draggable: false,
                            width: 814,
                            height: 600,
                            modal: true,
                            close: function() {
                                $(this).dialog('close');
                                $(this).remove();
                                animationDiv.animate({
                                    top: originOffset.top + 'px',
                                    left: originOffset.left + 'px',
                                    width: elementOrigin.width(),
                                    height: elementOrigin.height()
                                }, 300, function() {
                                    $('.contentViewAnimationDiv').remove();
                                });
                            },
                            closeOnEscape: true,
                            open: function( event, ui ) {
                                $('.ui-widget-overlay').click(function() {
                                    editDialog.dialog('close');
                                });
                                if (editDialog.find('.CodeMirror').length != 0) {
                                    editDialog.find('.CodeMirror').each(function() {
                                        $(this)[0].CodeMirror.refresh();
                                    });
                                }
                            },
                            buttons: [
                                { text: self.labels['GenericApply'],
                                    click: function() {

                                        var newContentViewData = self.getDataFromEditingUI($(this));

                                        self.contentViewData = newContentViewData;

                                        self.updateContentViewPreview();

                                        self.updateContent();

                                        FrameTrail.module('HypervideoModel').newUnsavedChange('layout');

                                        $(this).dialog( 'close' );

                                        var currentTime = FrameTrail.module('HypervideoController').currentTime;
                                        self.updateTimedStateOfContentViews(currentTime);
                                    }
                                },
                                { text: self.labels['GenericCancel'],
                                    click: function() {
                                        $(this).dialog( 'close' );
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
                        editingUI = $('<div class="contentViewEditingUI">'
                                    +'    <div class="layoutRow">'
                                    +'        <div class="contentViewData column-4 column-md-2" data-property="type" data-value="'+ contentViewData.type +'">'
                                    +'            <label>'+ self.labels['GenericType'] +':</label>'
                                    +'            <div '+ (contentViewData.type == 'TimedContent' ? 'class="active"' : '') +' data-value="TimedContent">'+ self.labels['GenericAnnotationCollection'] +'</div>'
                                    +'            <div '+ (contentViewData.type == 'CustomHTML' ? 'class="active"' : '') +' data-value="CustomHTML">'+ self.labels['GenericCustomHTML'] +'</div>'
                                    +'            <div '+ (contentViewData.type == 'Transcript' ? 'class="active"' : '') +' data-value="Transcript">'+ self.labels['GenericTextTranscript'] +'</div>'
                                    +'        </div>'
                                    +'        <div class="generic column-4 column-md-2">'
                                    +'            <div class="contentViewData" data-property="contentSize" data-value="'+ contentViewData.contentSize +'">'
                                    +'                <label>'+ self.labels['SettingsContentViewSize'] +':</label>'
                                    +'                <div '+ (contentViewData.contentSize == 'small' ? 'class="active"' : '') +' data-value="small">'+ self.labels['SettingsContentViewSmall'] +'</div>'
                                    +'                <div '+ (contentViewData.contentSize == 'medium' ? 'class="active"' : '') +' data-value="medium">'+ self.labels['SettingsContentViewMedium'] +'</div>'
                                    +'                <div '+ (contentViewData.contentSize == 'large' ? 'class="active"' : '') +' data-value="large">'+ self.labels['SettingsContentViewLarge'] +'</div>'
                                    +'            </div>'
                                    +'        </div>'
                                    +'    </div>'
                                    +'    <hr>'
                                    +'    <div class="layoutRow">'
                                    +'        <div class="generic column-4 column-md-1">'
                                    +'            <label>'+ self.labels['GenericName'] +':</label>'
                                    +'            <input type="text" class="contentViewData" data-property="name" data-value="'+ contentViewData.name +'" value="'+ contentViewData.name +'" placeholder="('+ self.labels['GenericRequired'] +')"/>'
                                    +'        </div>'
                                    +'        <div class="generic column-4 column-md-3">'
                                    +'            <label>'+ self.labels['GenericDescription'] +':</label>'
                                    +'            <textarea class="contentViewData" data-property="description" data-value="'+ contentViewData.description +'" placeholder="(optional)">'+ contentViewData.description +'</textarea>'
                                    +'        </div>'
                                    +'    </div>'
                                    +'    <div class="generic" style="display: none;">'
                                    +'        <label>CSS Class:</label>'
                                    +'        <input type="text" class="contentViewData" data-property="cssClass" data-value="'+ contentViewData.cssClass +'" value="'+ contentViewData.cssClass +'" placeholder="('+ self.labels['GenericOptional'] +')"/>'
                                    +'    </div>'
                                    +'    <hr>'
                                    +'    <div class="typeSpecific '+ (contentViewData.type == 'TimedContent' ? 'active' : '') +'" data-type="TimedContent">'
                                    +'        <label>'+ self.labels['SettingsSelectContents'] +':</label>'
                                    +'        <div class="message active">'+ self.labels['MessageHintContentViewFilters'] +'</div>'
                                    +'        <div class="layoutRow">'
                                    +'            <div class="column-4 column-md-1">'
                                    +'                <label>'+ self.labels['SettingsFilterByTags'] +'</label>'
                                    +'                <div class="existingTags"></div>'
                                    +'                <div class="button small contextSelectButton newTagButton">'
                                    +'                    <span class="icon-plus">'+ self.labels['GenericAdd'] +'</span>'
                                    +'                    <div class="contextSelectList"></div>'
                                    +'                </div>'
                                    +'                <input type="hidden" class="contentViewData" data-property="collectionFilter-tags" data-value="'+ contentViewData.collectionFilter.tags +'" value="'+ contentViewData.collectionFilter.tags +'" placeholder="('+ self.labels['GenericOptional'] +')"/>'
                                    +'            </div>'
                                    +'            <div class="column-4 column-md-1">'
                                    +'                <label>'+ self.labels['SettingsFilterByTypes'] +'</label>'
                                    +'                <div class="existingTypes"></div>'
                                    +'                <div class="button small contextSelectButton newTypeButton">'
                                    +'                    <span class="icon-plus">'+ self.labels['GenericAdd'] +'</span>'
                                    +'                    <div class="contextSelectList"></div>'
                                    +'                </div>'
                                    +'                <input type="hidden" class="contentViewData" data-property="collectionFilter-types" data-value="'+ contentViewData.collectionFilter.types +'" value="'+ contentViewData.collectionFilter.types +'" placeholder="('+ self.labels['GenericOptional'] +')"/>'
                                    +'            </div>'
                                    +'            <div class="column-4 column-md-1">'
                                    +'                <label>'+ self.labels['SettingsFilterByUsers'] +'</label>'
                                    +'                <div class="existingUsers"></div>'
                                    +'                <div class="button small contextSelectButton newUserButton">'
                                    +'                    <span class="icon-plus">'+ self.labels['GenericAdd'] +'</span>'
                                    +'                    <div class="contextSelectList"></div>'
                                    +'                </div>'
                                    +'                <input type="hidden" class="contentViewData" data-property="collectionFilter-users" data-value="'+ contentViewData.collectionFilter.users +'" value="'+ contentViewData.collectionFilter.users +'" placeholder="('+ self.labels['GenericOptional'] +')"/>'
                                    +'            </div>'
                                    +'            <div class="column-4 column-md-1">'
                                    +'                <label>'+ self.labels['SettingsFilterByName'] +'</label>'
                                    +'                <input type="text" class="contentViewData" data-property="collectionFilter-text" data-value="'+ contentViewData.collectionFilter.text +'" value="'+ contentViewData.collectionFilter.text +'" placeholder="('+ self.labels['GenericOptional'] +')"/>'
                                    +'            </div>'
                                    +'        </div>'
                                    +'        <div class="message active">'+ self.labels['SettingsItemsInCollection'] +': <span class="collectionCounter"></span></div>'
                                    +'        <hr>'
                                    +'    </div>'
                                    +'    <div class="typeSpecific advanced codeEditorSmall '+ (contentViewData.type == 'TimedContent' ? 'active' : '') +'" data-type="TimedContent">'
                                    +'        <h3>'+ self.labels['GenericAdvancedOptions'] +'</h3>'
                                    +'        <div>'
                                    +'            <label>onClickContentItem:</label>'
                                    +'            <div class="message active">'+ self.labels['MessageHintContentViewClickItem'] +'</div>'
                                    +'            <textarea class="contentViewData" data-property="onClickContentItem" data-value="'+ contentViewData.onClickContentItem +'" placeholder="('+ self.labels['GenericOptional'] +')">'+ contentViewData.onClickContentItem +'</textarea>'
                                    +'        </div>'
                                    +'    </div>'
                                    +'    <div class="typeSpecific codeEditorLarge '+ (contentViewData.type == 'CustomHTML' ? 'active' : '') +'" data-type="CustomHTML">'
                                    +'        <label>'+ self.labels['GenericCustomHTML'] +':</label>'
                                    +'        <textarea class="contentViewData" data-property="html" data-value="'+ contentViewData.html +'">'+ contentViewData.html +'</textarea>'
                                    +'    </div>'
                                    +'    <div class="typeSpecific '+ (contentViewData.type == 'Transcript' ? 'active' : '') +'" data-type="Transcript">'
                                    +'        <label>'+ self.labels['SettingsTranscriptSource'] +':</label>'
                                    +'        <div class="message active">'+ self.labels['MessageHintNewTranscriptsUpload'] +'</div>'
                                    +'        <div class="existingTranscripts"></div>'
                                    +'        <input type="hidden" class="contentViewData" data-property="transcriptSource" data-value="'+ contentViewData.transcriptSource +'" value="'+ contentViewData.transcriptSource +'" />'
                                    +'    </div>'
                                    +'</div>');

                    editingUI.find('.contentViewData').each(function() {

                        var datachoices = $(this).children('div[data-value]');

                        if (datachoices.length != 0) {
                            datachoices.click(function() {
                                $(this).siblings('div[data-value]').removeClass('active');
                                $(this).addClass('active');

                                var parent = $(this).parent('.contentViewData');

                                parent.attr('data-value', $(this).attr('data-value'));

                                if (parent.attr('data-property') == 'type') {
                                    editingUI.find('.typeSpecific').removeClass('active');
                                    editingUI.find('.typeSpecific[data-type="'+ parent.attr('data-value') +'"]').addClass('active');
                                }

                                if (editingUI.find('.CodeMirror').length != 0) {
                                    editingUI.find('.CodeMirror').each(function() {
                                        $(this)[0].CodeMirror.refresh();
                                    });
                                }
                            });
                        }

                    });

                    editingUI.find('.advanced').accordion({
                        collapsible: true,
                        active: false,
                        heightStyle: 'content'
                    });

                    // Transcripts

                    function updateExistingTranscripts() {
                        editingUI.find('.existingTranscripts').empty();

                        var database = FrameTrail.module('Database');

                        if ( database.hypervideo.subtitles ) {

                            var langMapping = database.subtitlesLangMapping;

                            for (var i=0; i < database.hypervideo.subtitles.length; i++) {
                                var currentSubtitles = database.hypervideo.subtitles[i],
                                    existingSubtitlesItem = $('<div class="existingSubtitlesItem" data-srclang="'+ currentSubtitles.srclang +'"><span>'+ langMapping[currentSubtitles.srclang] +'</span></div>');

                                if ( editingUI.find('.contentViewData[data-property="transcriptSource"]').val() == currentSubtitles.srclang ) {
                                    existingSubtitlesItem.addClass('active');
                                }
                                existingSubtitlesItem.click(function(evt) {
                                    var thisSourceLang = $(this).attr('data-srclang');
                                    editingUI.find('.contentViewData[data-property="transcriptSource"]').val(thisSourceLang);
                                    updateExistingTranscripts();
                                }).appendTo(existingSubtitlesItem);

                                editingUI.find('.existingTranscripts').append(existingSubtitlesItem);
                            }
                        }
                    }

                    updateExistingTranscripts();

                    // Content Collection Filters

                    var tagFilters = self.contentViewData.collectionFilter.tags;
                    var typeFilters = self.contentViewData.collectionFilter.types;
                    var userFilters = self.contentViewData.collectionFilter.users;

                    // Tag Filter UI

                    updateExistingTagFilters();

                    editingUI.find('.newTagButton').click(function() {
                        editingUI.find('.contextSelectButton').not($(this)).removeClass('active');

                        updateTagSelectContainer();
                        $(this).toggleClass('active');
                    });

                    function updateExistingTagFilters() {
                        updateCollectionFilterValues();
                        editingUI.find('.existingTags').empty();

                        for (var i=0; i<tagFilters.length; i++) {
                            var tagLabel = FrameTrail.module('TagModel').getTagLabelAndDescription(tagFilters[i], 'de').label,
                                tagItem = $('<div class="tagItem" data-tag="'+ tagFilters[i] +'">'+ tagLabel +'</div>');
                            var deleteButton = $('<div class="deleteItem"><span class="icon-cancel"></span></div>')
                            deleteButton.click(function() {
                                tagFilters.splice(tagFilters.indexOf($(this).parent().attr('data-tag')), 1);
                                updateExistingTagFilters();
                            });
                            tagItem.append(deleteButton);
                            editingUI.find('.existingTags').append(tagItem);
                        }
                    }

                    function updateTagSelectContainer() {
                        editingUI.find('.newTagButton .contextSelectList').empty();

                        var allTags = FrameTrail.module('TagModel').getAllTagLabelsAndDescriptions('de');
                        for (var tagID in allTags) {
                            if ( tagFilters.indexOf(tagID) != -1 ) {
                                continue;
                            }
                            var tagLabel = allTags[tagID].label,
                                tagItem = $('<div class="tagItem" data-tag="'+ tagID +'">'+ tagLabel +'</div>');
                            tagItem.click(function() {
                                tagFilters.push( $(this).attr('data-tag') );
                                updateExistingTagFilters();
                            });
                            editingUI.find('.newTagButton .contextSelectList').append(tagItem);
                        }
                    }

                    // Type Filter UI

                    updateExistingTypeFilters();

                    editingUI.find('.newTypeButton').click(function() {
                        editingUI.find('.contextSelectButton').not($(this)).removeClass('active');

                        updateTypeSelectContainer();
                        $(this).toggleClass('active');
                    });

                    function updateExistingTypeFilters() {
                        updateCollectionFilterValues();
                        editingUI.find('.existingTypes').empty();

                        for (var i=0; i<typeFilters.length; i++) {
                            var typeItem = $('<div class="typeItem" data-type="'+ typeFilters[i] +'">'+ typeFilters[i].charAt(0).toUpperCase() + typeFilters[i].substring(1) +'</div>');
                            var deleteButton = $('<div class="deleteItem"><span class="icon-cancel"></span></div>')
                            deleteButton.click(function() {
                                typeFilters.splice(typeFilters.indexOf($(this).parent().attr('data-type')), 1);
                                updateExistingTypeFilters();
                            });
                            typeItem.append(deleteButton);
                            editingUI.find('.existingTypes').append(typeItem);
                        }
                    }

                    function updateTypeSelectContainer() {
                        editingUI.find('.newTypeButton .contextSelectList').empty();

                        var allTypes = [];

                        for (var typeDef in FrameTrail.types) {
                            if ( typeDef.indexOf('Resource') != -1 && typeDef != 'Resource' && typeDef != 'ResourceText' ) {
                                allTypes.push( typeDef.split('Resource')[1].toLowerCase() );
                            }
                        };
                        for (var t=0; t<allTypes.length; t++) {
                            if ( typeFilters.indexOf(allTypes[t]) != -1 ) {
                                continue;
                            }
                            var typeItem = $('<div class="typeItem" data-type="'+ allTypes[t] +'">'+ allTypes[t].charAt(0).toUpperCase() + allTypes[t].substring(1) +'</div>');
                            typeItem.click(function() {
                                typeFilters.push( $(this).attr('data-type') );
                                updateExistingTypeFilters();
                            });
                            editingUI.find('.newTypeButton .contextSelectList').append(typeItem);
                        }
                    }

                    // User Filter UI

                    updateExistingUserFilters();

                    editingUI.find('.newUserButton').click(function() {
                        editingUI.find('.contextSelectButton').not($(this)).removeClass('active');

                        updateUserSelectContainer();
                        $(this).toggleClass('active');
                    });

                    function updateExistingUserFilters() {
                        updateCollectionFilterValues();
                        editingUI.find('.existingUsers').empty();

                        for (var u=0; u<userFilters.length; u++) {
                            var userLabel = FrameTrail.module('Database').users[userFilters[u]].name,
                                userItem = $('<div class="userItem" data-user="'+ userFilters[u] +'">'+ userLabel +'</div>');
                            var deleteButton = $('<div class="deleteItem"><span class="icon-cancel"></span></div>')
                            deleteButton.click(function() {
                                userFilters.splice(userFilters.indexOf($(this).parent().attr('data-user')), 1);
                                updateExistingUserFilters();
                            });
                            userItem.append(deleteButton);
                            editingUI.find('.existingUsers').append(userItem);
                        }
                    }

                    function updateUserSelectContainer() {
                        editingUI.find('.newUserButton .contextSelectList').empty();

                        var allUsers = FrameTrail.module('Database').users;
                        for (var user in allUsers) {
                            if ( userFilters.indexOf(user) != -1 ) {
                                continue;
                            }
                            var userItem = $('<div class="userItem" data-user="'+ user +'">'+ allUsers[user].name +'</div>');
                            userItem.click(function() {
                                userFilters.push( $(this).attr('data-user') );
                                updateExistingUserFilters();
                            });
                            editingUI.find('.newUserButton .contextSelectList').append(userItem);
                        }
                    }

                    // Update Collection Filter Values from UI Elements

                    editingUI.find('.contentViewData[data-property="collectionFilter-text"]').keyup(function() {
                        updateCollectionFilterValues();
                    });

                    function updateCollectionFilterValues() {
                        var numberOfAnnotations = FrameTrail.module('TagModel').getContentCollection(
                                tagFilters,
                                false,
                                true,
                                userFilters,
                                editingUI.find('.contentViewData[data-property="collectionFilter-text"]').val(),
                                typeFilters
                            ).length;
                        editingUI.find('.collectionCounter').text(numberOfAnnotations);
                        if ( numberOfAnnotations == 0 ) {
                            editingUI.find('.collectionCounter').parent('.message').removeClass('success').addClass('error');
                        } else {
                            editingUI.find('.collectionCounter').parent('.message').removeClass('error').addClass('success');
                        }

                        var tagFilterString = tagFilters.join(',');
                        editingUI.find('.contentViewData[data-property="collectionFilter-tags"]').val(tagFilterString);
                        var typeFilterString = typeFilters.join(',');
                        editingUI.find('.contentViewData[data-property="collectionFilter-types"]').val(typeFilterString);
                        var userFilterString = userFilters.join(',');
                        editingUI.find('.contentViewData[data-property="collectionFilter-users"]').val(userFilterString);
                    }

                    // Init CodeMirror for onClickContentItem

                    var textarea = editingUI.find('.contentViewData[data-property="onClickContentItem"]');

                    var codeEditor = CodeMirror.fromTextArea(textarea[0], {
                            value: textarea[0].value,
                            lineNumbers: true,
                            mode:  'javascript',
                            gutters: ['CodeMirror-lint-markers'],
                            lint: true,
                            lineWrapping: true,
                            tabSize: 2,
                            theme: 'hopscotch'
                        });
                    codeEditor.on('change', function(instance, changeObj) {

                        var thisTextarea = $(instance.getTextArea());

                        $(thisTextarea).attr('data-value', instance.getValue());

                        thisTextarea.val(instance.getValue());


                    });
                    codeEditor.setSize(null, '100%');

                    // Init CodeMirror for Custom HTML

                    var htmlTextarea = editingUI.find('.contentViewData[data-property="html"]');

                    var htmlCodeEditor = CodeMirror.fromTextArea(htmlTextarea[0], {
                            value: htmlTextarea[0].value,
                            lineNumbers: true,
                            mode:  'text/html',
                            htmlMode: true,
                            lint: true,
                            lineWrapping: true,
                            tabSize: 2,
                            theme: 'hopscotch'
                        });
                    htmlCodeEditor.on('change', function(instance, changeObj) {

                        var thisTextarea = $(instance.getTextArea());

                        $(thisTextarea).attr('data-value', instance.getValue());

                        thisTextarea.val(instance.getValue());


                    });
                    htmlCodeEditor.setSize(null, '100%');


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

                    editingUIContainer.find('.contentViewData').each(function() {

                        var newValue;
                        if ( $(this).is('input') || $(this).is('textarea') ) {
                            newValue = $(this).val();
                            if ( $(this).attr('data-property').indexOf('collectionFilter') != -1 && $(this).attr('data-property') != 'collectionFilter-text' ) {
                                if ( $(this).val().length != 0 ) {
                                    newValue = $(this).val().split(',');
                                } else {
                                    newValue = [];
                                }
                            }
                        } else {
                            newValue = $(this).attr('data-value');
                        }

                        if (newValue == 'true') {
                            newValue = true;
                        } else if (newValue == 'false') {
                            newValue = false;
                        }

                        if ( $(this).attr('data-property').indexOf('-') != -1 ) {
                            var splitProperty = $(this).attr('data-property').split('-'),
                                subObject = splitProperty[0],
                                subProperty = splitProperty[1];
                            if ( !newDataObject[subObject] ) {
                                newDataObject[subObject] = {};
                            }
                            newDataObject[subObject][subProperty] = newValue;
                        } else {
                            newDataObject[$(this).attr('data-property')] = newValue;
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

                    var ViewVideo = FrameTrail.module('ViewVideo'),
                        areaContainer;

                    switch (this.whichArea) {
                        case 'top':
                            areaContainer = ViewVideo.AreaTopContainer;
                            break;
                        case 'bottom':
                            areaContainer = ViewVideo.AreaBottomContainer;
                            break;
                        case 'left':
                            areaContainer = ViewVideo.AreaLeftContainer;
                            break;
                        case 'right':
                            areaContainer = ViewVideo.AreaRightContainer;
                            break;
                    }

                    return areaContainer;

                },


                /**
                 * I return the LayoutArea Details Container of the ContentView.
                 *
                 * @method getLayoutAreaDetailsContainer
                 * @return {HTMLElement} areaDetailsContainer
                 */
                getLayoutAreaDetailsContainer: function() {

                    var ViewVideo = FrameTrail.module('ViewVideo'),
                        areaDetailsContainer;

                    switch (this.whichArea) {
                        case 'top':
                            areaDetailsContainer = ViewVideo.AreaTopDetails;
                            break;
                        case 'bottom':
                            areaDetailsContainer = ViewVideo.AreaBottomDetails;
                            break;
                        case 'left':
                            areaDetailsContainer = ViewVideo.AreaLeftDetails;
                            break;
                        case 'right':
                            areaDetailsContainer = ViewVideo.AreaRightDetails;
                            break;
                    }

                    return areaDetailsContainer;

                },


                /**
                 * I return the LayoutArea Preview Container of the ContentView.
                 *
                 * @method getLayoutAreaPreviewContainer
                 * @return {HTMLElement} areaContainer
                 */
                getLayoutAreaPreviewContainer: function() {

                    var HypervideoLayoutContainer = FrameTrail.module('ViewVideo').HypervideoLayoutContainer,
                        areaContainer;

                    switch (this.whichArea) {
                        case 'top':
                            areaContainer = HypervideoLayoutContainer.find('.layoutArea[data-area="areaTop"]');
                            break;
                        case 'bottom':
                            areaContainer = HypervideoLayoutContainer.find('.layoutArea[data-area="areaBottom"]');
                            break;
                        case 'left':
                            areaContainer = HypervideoLayoutContainer.find('.layoutArea[data-area="areaLeft"]');
                            break;
                        case 'right':
                            areaContainer = HypervideoLayoutContainer.find('.layoutArea[data-area="areaRight"]');
                            break;
                    }

                    return areaContainer;

                }


            }


        }
    }


);
