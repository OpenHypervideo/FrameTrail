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

        // On a touch device there is no pointer "over" a view: after a touch or a scroll, a view stops following
        // the playback for this long, so somebody who swiped can look at what they swiped to.
        var TOUCH_FOLLOW_PAUSE = 6000;

        /**
         * I delegate to the single schematic generator owned by the ViewLayout
         * module, so the Layout Editor palette and these previews can never
         * drift apart. Every call path runs inside or after the Layout Editor,
         * so the module is initialized by then; the guard is for safety only.
         */
        function _generateSchematic(type, size, axis, thumbnail, maxCards, variant) {
            var ViewLayout = FrameTrail.module('ViewLayout');

            if (!ViewLayout || !ViewLayout.generateSchematic) {
                var fallback = document.createElement('div');
                fallback.className = 'schematicPreview';
                return fallback;
            }

            return ViewLayout.generateSchematic(type, size, axis, thumbnail, maxCards, variant);
        }

        // The rows a Timelines view shows per size in the top and bottom areas before it scrolls (see fitExtent)
        var FIT_TIMELINE_ROWS = { small: 2, medium: 4, large: 8 };

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
                contentViewData.showTranscriptSearch   = contentViewData.showTranscriptSearch || false;
                // A view has the sizes its type has where it is (see offersSize); one that is not offered there is
                // shown, and saved, as medium.
                this.whichArea = whichArea;
                contentViewData.contentSize            = contentViewData.contentSize || ((whichArea == 'companion' || whichArea == 'circular') ? "medium" : "small");
                this.normalizeSize(contentViewData);
                contentViewData.onClickContentItem     = contentViewData.onClickContentItem || "";
                contentViewData.initClosed             = contentViewData.initClosed || false;
                contentViewData.filterAspect           = contentViewData.filterAspect || "creatorId";
                contentViewData.zoomControls           = contentViewData.zoomControls || false;

                this.contentViewData = contentViewData;

                this.previousContentSize = this.contentViewData.contentSize;

                this.isMouseOver = false;

                this.whichArea = whichArea;

                this.contentCollection = [];

                this.contentGroups = [];

                this.appendDOMElement();

                this.updateContent();

            },
            prototype: {
                whichArea: null,
                contentViewData:    null,
                contentCollection: null,
                contentGroups: null,
                _AREA_KEYS: { top: 'Top', bottom: 'Bottom', left: 'Left', right: 'Right', companion: 'Companion', circular: 'Circular' },


                /**
                 * Whether my area is a vertical strip: left, right, or the companion area (the phone's views, laid out like the right area), except a phone's large collection, which runs horizontally (see isSlideshow).
                 *
                 * @method isVerticalArea
                 * @return {Boolean}
                 */
                isVerticalArea: function() {
                    return (this.whichArea == 'left' || this.whichArea == 'right' || this.whichArea == 'companion') && !this.isSlideshow();
                },


                /**
                 * Whether a view has a size where I am. A phone has no room for the narrow strip that "small" is,
                 * the ring around the video holds thumbnails only (small or medium), and in the left and right
                 * areas a transcript, timelines and chapter cards cannot be read in the narrow column that small
                 * is there (chapters as steps and quiz results can: their dots alone). The type and, for
                 * Chapters, the style can be asked about instead of mine.
                 *
                 * @method offersSize
                 * @param {String} size
                 * @param {String} [type]
                 * @param {String} [chapterStyle]
                 * @return {Boolean}
                 */
                offersSize: function(size, type, chapterStyle) {

                    var own = this.contentViewData || {};

                    type = type || own.type;
                    if (chapterStyle === undefined) { chapterStyle = own.chapterStyle; }

                    if (this.whichArea == 'companion') { return size != 'small'; }
                    if (this.whichArea == 'circular')  { return size != 'large'; }

                    if (size == 'small' && (this.whichArea == 'left' || this.whichArea == 'right')) {
                        return !(type == 'Transcript' || type == 'Timelines' || (type == 'Chapters' && chapterStyle !== 'steps'));
                    }

                    return true;

                },


                /**
                 * I give a view's data a size it has where I am: one that is not offered (see offersSize) becomes medium.
                 *
                 * @method normalizeSize
                 * @param {Object} contentViewData
                 * @return {Object} contentViewData
                 */
                normalizeSize: function(contentViewData) {
                    if (!this.offersSize(contentViewData.contentSize, contentViewData.type, contentViewData.chapterStyle || 'cards')) {
                        contentViewData.contentSize = 'medium';
                    }
                    return contentViewData;
                },


                /**
                 * Whether I am a phone's large collection: the companion area's annotations at full size, one after another in a row that follows the playback and can be swiped through, like the bottom area's large view. A size and a type can be asked about instead of mine.
                 *
                 * @method isSlideshow
                 * @param {String} [size]
                 * @param {String} [type]
                 * @return {Boolean}
                 */
                isSlideshow: function(size, type) {
                    return this.whichArea == 'companion'
                        && (size || this.contentViewData.contentSize) == 'large'
                        && (type || this.contentViewData.type) == 'TimedContent';
                },


                /**
                 * Whether my collection runs horizontally: in the top and bottom areas, as a phone's large collection, and as the circular area's strip.
                 *
                 * @method isHorizontalArea
                 * @param {String} [size]
                 * @param {String} [type]
                 * @return {Boolean}
                 */
                isHorizontalArea: function(size, type) {
                    return this.whichArea == 'top' || this.whichArea == 'bottom' || this.isSlideshow(size, type) || this.isStrip();
                },


                /**
                 * Whether I am in the circular area: a ring of thumbnails around the video (see layoutRing).
                 *
                 * @method isCircularArea
                 * @return {Boolean}
                 */
                isCircularArea: function() {
                    return this.whichArea == 'circular';
                },


                /**
                 * Whether I am the circular area's strip: its thumbnails in a row below the video, where the player is narrow or they do not fit around it (see computeRingGeometry). The strip is laid out like the bottom area.
                 *
                 * @method isStrip
                 * @return {Boolean}
                 */
                isStrip: function() {
                    return this.isCircularArea() && !!this.ringGeometry && this.ringGeometry.mode == 'strip';
                },


                /**
                 * The pixels between the thumbnails of the circular area, between them and the video, and around them (contentViewData.ringGap, 0 to 100, default 6).
                 *
                 * @method ringGap
                 * @return {Number}
                 */
                ringGap: function() {
                    var gap = this.contentViewData.ringGap;
                    return (typeof gap === 'number' && isFinite(gap)) ? Math.max(0, Math.min(100, gap)) : 6;
                },


                /**
                 * Whether my layout area is open only while one of my annotations is active (contentViewData.openWhenActive): a collection's choice, in the areas around the video and in the ring. A phone has no area to open. ViewLayout.updateAreaOpening() opens and closes the area.
                 *
                 * @method opensWhenActive
                 * @return {Boolean}
                 */
                opensWhenActive: function() {
                    return this.contentViewData.type == 'TimedContent'
                        && this.contentViewData.openWhenActive === true
                        && this.whichArea != 'companion';
                },


                /**
                 * I move a phone's large collection by one annotation (step 1: the next, -1: the previous).
                 *
                 * @method slideBy
                 * @param {Number} step
                 */
                slideBy: function(step) {
                    var slides = this._slides(),
                        index  = this._shownSlideIndex();
                    if (index < 0) { return; }
                    this.slideTo(slides[Math.max(0, Math.min(slides.length - 1, index + step))]);
                },


                /**
                 * I move a phone's large collection to one of its annotations (its element), so that it is in the middle.
                 *
                 * @method slideTo
                 * @param {HTMLElement} element
                 */
                slideTo: function(element) {
                    var scrollContainer = this.contentViewContainer && this.contentViewContainer.querySelector('.contentViewScroll');
                    if (!scrollContainer || !element) { return; }
                    scrollContainer.scrollTo({
                        left: element.offsetLeft + element.offsetWidth / 2 - scrollContainer.clientWidth / 2,
                        behavior: 'smooth'
                    });
                },


                // The elements of my collection, in the order of contentGroups.
                _slides: function() {
                    var contents = this.contentViewContainer && this.contentViewContainer.querySelector('.contentViewContents');
                    return contents ? Array.from(contents.children).filter(function(el) {
                        return el.classList.contains('collectionElement');
                    }) : [];
                },

                // The index of the element nearest to the middle of a phone's large collection (the one on screen), or -1.
                _shownSlideIndex: function() {
                    var scrollContainer = this.contentViewContainer && this.contentViewContainer.querySelector('.contentViewScroll'),
                        slides = this._slides();
                    if (!scrollContainer || !scrollContainer.clientWidth || !slides.length) { return -1; }
                    var middle = scrollContainer.scrollLeft + scrollContainer.clientWidth / 2,
                        shown = 0,
                        nearest = Infinity;
                    slides.forEach(function(el, i) {
                        var distance = Math.abs(el.offsetLeft + el.offsetWidth / 2 - middle);
                        if (distance < nearest) { nearest = distance; shown = i; }
                    });
                    return shown;
                },


                _getFilteredCollection: function() {
                    var f = this.contentViewData.collectionFilter;
                    return FrameTrail.module('TagModel').getContentCollection(
                        f.tags, false, true, f.users, f.text, f.types
                    );
                },


                /**
                 * Whether I show an annotation: Collections (TimedContent) and Timelines show the annotations
                 * their filter lets through. Asked of the filter, not of my collection, so it is right before I
                 * am updated too.
                 *
                 * @method showsAnnotation
                 * @param {Annotation} annotation
                 * @return {Boolean}
                 */
                showsAnnotation: function(annotation) {
                    var type = this.contentViewData.type;
                    return (type == 'TimedContent' || type == 'Timelines')
                        && this._getFilteredCollection().indexOf(annotation) !== -1;
                },

                _isSameResource: function(itemA, itemB) {
                    var a = itemA.data,
                        b = itemB.data;
                    if (a.type !== b.type) { return false; }
                    var aRes = (a.resourceId == null || a.resourceId === '') ? null : a.resourceId,
                        bRes = (b.resourceId == null || b.resourceId === '') ? null : b.resourceId;
                    if (aRes != null || bRes != null) {
                        return aRes === bRes;
                    }
                    var aSrc = (a.src == null) ? '' : a.src,
                        bSrc = (b.src == null) ? '' : b.src,
                        aUri = (a.uri == null) ? '' : a.uri,
                        bUri = (b.uri == null) ? '' : b.uri;
                    if (aSrc === '' && aUri === '') { return false; }
                    return aSrc === bSrc && aUri === bUri;
                },

                // Consecutive annotations referencing the same resource collapse into
                // one group, rendered as a single collection element. The collection
                // is start-sorted, so a single pass suffices; any different annotation
                // in between starts a new group.
                _computeContentGroups: function() {
                    var groups = [];
                    for (var i = 0; i < this.contentCollection.length; i++) {
                        var item = this.contentCollection[i],
                            lastGroup = groups[groups.length - 1];
                        if (lastGroup && this._isSameResource(lastGroup.items[lastGroup.items.length - 1], item)) {
                            lastGroup.items.push(item);
                        } else {
                            groups.push({
                                items: [item],
                                representative: item,
                                activeItems: []
                            });
                        }
                    }
                    return groups;
                },

                _groupsEqual: function(groupsA, groupsB) {
                    if (groupsA.length !== groupsB.length) { return false; }
                    for (var i = 0; i < groupsA.length; i++) {
                        if (groupsA[i].items.length !== groupsB[i].items.length) { return false; }
                        for (var j = 0; j < groupsA[i].items.length; j++) {
                            if (groupsA[i].items[j] !== groupsB[i].items[j]) { return false; }
                        }
                    }
                    return true;
                },

                getGroupOfContentItem: function(contentItem) {
                    var groups = this.contentGroups || [];
                    for (var i = 0; i < groups.length; i++) {
                        if (groups[i].items.indexOf(contentItem) !== -1) {
                            return groups[i];
                        }
                    }
                    return null;
                },

                // Re-derive each group's active set from the constituents' state and
                // sync the element class. Needed after (re)building elements, because
                // ViewLayout only notifies on active/inactive transitions.
                _refreshGroupActiveStates: function() {
                    var self = this;
                    (self.contentGroups || []).forEach(function(group) {
                        group.activeItems = group.items.filter(function(item) {
                            return item.activeStateInContentView(self);
                        });
                        var element = self.getContentViewElementFromContentItem(group.representative);
                        if (element) {
                            element.classList.toggle('active', group.activeItems.length > 0);
                        }
                        if (group.stripElement) {
                            group.stripElement.classList.toggle('active', group.activeItems.length > 0);
                        }
                    });
                },

                setContentItemActive: function(contentItem) {
                    var group = this.getGroupOfContentItem(contentItem);
                    if (!group) { return; }
                    if (group.activeItems.indexOf(contentItem) === -1) {
                        group.activeItems.push(contentItem);
                    }
                    if (group.stripElement) {
                        group.stripElement.classList.add('active');
                    }
                    var element = this.getContentViewElementFromContentItem(group.representative);
                    if (!element) { return; }
                    element.classList.add('active');

                    if ( contentItem.data.type == 'location'
                        && this.contentViewData.contentSize == 'large'
                        && this.isVerticalArea() ) {
                        var _resourceDetail = element.querySelector('.resourceDetail');
                        if (_resourceDetail && _resourceDetail._leafletMap) {
                            _resourceDetail._leafletMap.invalidateSize();
                        }
                    }
                },

                setContentItemInactive: function(contentItem) {
                    var group = this.getGroupOfContentItem(contentItem);
                    if (!group) { return; }
                    var indexOfItem = group.activeItems.indexOf(contentItem);
                    if (indexOfItem !== -1) {
                        group.activeItems.splice(indexOfItem, 1);
                    }
                    // The element stays active as long as any constituent is active
                    // (seamless handover between consecutive same-resource annotations)
                    if (group.activeItems.length === 0) {
                        var element = this.getContentViewElementFromContentItem(group.representative);
                        if (element) {
                            element.classList.remove('active');
                        }
                        if (group.stripElement) {
                            group.stripElement.classList.remove('active');
                        }
                    }
                },

                _clearContentCollection: function() {
                    var self = this;
                    self.contentCollection.forEach(function(contentItem) {
                        self.removeContentCollectionElements(contentItem);
                    });
                    self.contentCollection = [];
                    self.contentGroups = [];
                },

                updateContent: function(suppressViewSizeChange) {

                    var self = this;

                    self.contentViewTab.setAttribute('data-type', self.contentViewData.type);
                    self.contentViewTab.querySelector('.contentViewTabName').innerHTML =
                        self.contentViewData.icon ? '<span class="'+ self.contentViewData.icon +'">'+ self.contentViewData.name +'</span>' : self.contentViewData.name;

                    self.contentViewContainer.setAttribute('data-type', self.contentViewData.type);
                    self.contentViewContainer.setAttribute('data-size', self.contentViewData.contentSize);

                    // The summary of a Quiz Results view lies beside its contents (renderQuizResults): it goes with the type
                    if (self.contentViewData.type !== 'QuizResults') {
                        var quizSummary = self.contentViewContainer.querySelector(':scope > .quizResultsSummary');
                        if (quizSummary) { quizSummary.remove(); }
                    }

                    // Sync cssClass on container
                    if (self._prevCssClass && self._prevCssClass !== self.contentViewData.cssClass) {
                        self.contentViewContainer.classList.remove(self._prevCssClass);
                    }
                    if (self.contentViewData.cssClass) {
                        self.contentViewContainer.classList.add(self.contentViewData.cssClass);
                    }
                    self._prevCssClass = self.contentViewData.cssClass;

                    // "Start collapsed" says how the area starts, not how it stays: it is applied when the view is
                    // made and when the setting changes, never by a later rendering. (A Chapters view renders again
                    // once the scrub sprite has loaded, seconds into playback; by then the viewer or an action
                    // may have opened the area.) A view that opens its area with its annotations has no say here
                    // (the setting is not offered then): when it is the active tab its annotations decide, and
                    // when another tab is active, that area starts as its other views say.
                    var initClosed = !!self.contentViewData.initClosed && !self.opensWhenActive();
                    if (self._initClosed === undefined) {
                        if (initClosed) { self.getLayoutAreaContainer().classList.add('closed'); }
                    } else if (self._initClosed !== initClosed) {
                        self.getLayoutAreaContainer().classList.toggle('closed', initClosed);
                    }
                    self._initClosed = initClosed;

                    switch (this.contentViewData.type) {

                        case 'TimedContent':

                            // What another type left behind (the type can be changed in the settings)
                            self.contentViewContainer.querySelectorAll('.customhtmlContainer, .transcriptContainer, .chaptersContainer, .timelinesContainer, .quizResultsSummary').forEach(function(el) { el.remove(); });

                            if (!self.contentViewData.collectionFilter) {
                                return;
                            }

                            var old_contentGroups = self.contentGroups || [];

                            self.contentCollection = self._getFilteredCollection();

                            var new_contentGroups = self._computeContentGroups();

                            var crossedLargeBoundary =
                                (this.previousContentSize == 'large') != (this.contentViewData.contentSize == 'large');

                            // The ring's slots depend on the number of thumbnails, their size and the gap, and so does the room the video has.
                            if ( self.isCircularArea()
                                && (this.previousContentSize != this.contentViewData.contentSize || !self._groupsEqual(old_contentGroups, new_contentGroups)
                                    || (self.ringGeometry && self.ringGeometry.gap != self.ringGap())) ) {
                                self._scheduleRingLayout();
                            }

                            if ( crossedLargeBoundary || !self._groupsEqual(old_contentGroups, new_contentGroups) ) {

                                // Remember the annotations of the currently open group,
                                // so an open details view survives the rebuild
                                var openElement = self.contentViewContainer.querySelector('.contentViewContents > .collectionElement.open'),
                                    openItems = [];
                                if (openElement) {
                                    for (var g = 0; g < old_contentGroups.length; g++) {
                                        if (self.getContentViewElementFromContentItem(old_contentGroups[g].representative) === openElement) {
                                            openItems = old_contentGroups[g].items;
                                            break;
                                        }
                                    }
                                }

                                old_contentGroups.forEach(function(group) {
                                    self.removeContentCollectionElements(group.representative);
                                });

                                self.contentGroups = new_contentGroups;

                                self.contentGroups.forEach(function(group, indexOfGroup) {
                                    self.appendContentCollectionElements(group.representative, indexOfGroup);
                                });

                                if (self.collectionStrip) {
                                    self.renderCollectionStrip();
                                }

                                // Restore the open state on the re-rendered group
                                var openGroup = null;
                                for (var o = 0; o < openItems.length && !openGroup; o++) {
                                    openGroup = self.getGroupOfContentItem(openItems[o]);
                                }
                                if (openGroup) {
                                    var newOpenElement = self.getContentViewElementFromContentItem(openGroup.representative);
                                    if (newOpenElement) {
                                        newOpenElement.classList.add('open');
                                        if (self.contentViewDetailsContainer) {
                                            var _openIdx = Array.from(newOpenElement.parentElement.children).indexOf(newOpenElement),
                                                _detailEls = self.contentViewDetailsContainer.querySelectorAll('.collectionElement');
                                            if (_detailEls[_openIdx]) { _detailEls[_openIdx].classList.add('open'); }
                                        }
                                    }
                                } else if (openElement && FrameTrail.module('ViewVideo')
                                    && FrameTrail.module('ViewVideo').shownDetails == self.whichArea) {
                                    FrameTrail.module('ViewVideo').shownDetails = null;
                                }

                            }
                            // else: groups unchanged, keep existing group objects and DOM

                            this.previousContentSize = this.contentViewData.contentSize;

                            self._refreshGroupActiveStates();

                            self._syncTagLabels();

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

                            if (self.contentViewData.showTranscriptSearch) {
                                var transcriptSearchInput = document.createElement('input');
                                transcriptSearchInput.type = 'text';
                                transcriptSearchInput.className = 'transcriptSearchInput';
                                transcriptSearchInput.placeholder = self.labels['TranscriptSearchPlaceholder'];
                                _cvContents2.insertBefore(transcriptSearchInput, transcriptContainer);

                                transcriptSearchInput.addEventListener('input', function() {
                                    var query = this.value.trim().toLowerCase(),
                                        firstMatch = null;
                                    transcriptContainer.classList.toggle('searching', query.length > 0);
                                    transcriptContainer.querySelectorAll('span').forEach(function(el) {
                                        if (!query) {
                                            el.classList.remove('searchMatch');
                                            return;
                                        }
                                        var isMatch = el.textContent.toLowerCase().indexOf(query) >= 0;
                                        el.classList.toggle('searchMatch', isMatch);
                                        if (isMatch && !firstMatch) { firstMatch = el; }
                                    });
                                    if (firstMatch) {
                                        firstMatch.scrollIntoView({ block: 'nearest' });
                                    }
                                });
                            }

                            // A view that names no transcript (or one that is gone) shows the first one.
                            var subtitles = FrameTrail.module('Database').subtitles[FrameTrail.module('HypervideoModel').transcriptLanguage(self.contentViewData.transcriptSource)];
                            if ( subtitles ) {
                                // Cue text without its markup; a new speaker (a voice tag) starts a new paragraph, named.
                                var lastSpeaker = '';
                                for (var i=0; i<subtitles.cues.length; i++) {
                                    var voice = window.FrameTrailWebVTT.speakerOf(subtitles.cues[i].text);
                                    if (voice.speaker && voice.speaker !== lastSpeaker) {
                                        var speakerElement = document.createElement('strong');
                                        speakerElement.className = 'transcriptSpeaker';
                                        speakerElement.textContent = voice.speaker;
                                        transcriptContainer.appendChild(speakerElement);
                                    }
                                    lastSpeaker = voice.speaker || lastSpeaker;
                                    var cueElement = document.createElement('span');
                                    cueElement.setAttribute('data-start', subtitles.cues[i].startTime);
                                    cueElement.setAttribute('data-end', subtitles.cues[i].endTime);
                                    cueElement.textContent = window.FrameTrailWebVTT.toPlain(voice.text).replace(/\s+/g, ' ') + ' ';
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

                        case 'Chapters':

                            self._clearContentCollection();

                            self.renderChapterCards();

                            break;

                        case 'QuizResults':

                            self._clearContentCollection();

                            self.renderQuizResults();

                            break;

                    }

                    FrameTrail.module('ViewLayout').updateManagedContent();
                    FrameTrail.module('ViewLayout').updateHiddenTabs();

                    // The area is what its active view is, at once (a size, type or style changed in the settings);
                    // what follows from the room the video has left comes a moment later, when all views are made.
                    if (self.syncLayoutArea()) {
                        self.fitLayoutArea();
                    }

                    if (!suppressViewSizeChange) {
                        window.setTimeout(function() {
                            FrameTrail.changeState('viewSize', FrameTrail.getState('viewSize'));
                        }, 50);
                    }

                },


                /**
                 * I mark a thumbnail that has no picture (.noPicture): the stylesheet then shows the type's icon in the
                 * middle of a quiet pane, instead of in the corner of an empty one. Not the types that show their text
                 * in the thumbnail (text, html, entity). A picture that cannot be loaded (a page's picture on another
                 * site that is gone, or may not be shown from here) is no picture either, once the browser says so.
                 *
                 * @method _markThumb
                 * @param {HTMLElement} thumbElement what a resource's renderThumb() returned
                 * @return {HTMLElement} thumbElement
                 */
                _markThumb: function(thumbElement) {

                    if (!thumbElement || !thumbElement.classList || thumbElement.querySelector('.resourceTextPreview')) {
                        return thumbElement;
                    }

                    var picture = thumbElement.style.getPropertyValue('--thumb-bg'),
                        url     = /url\(\s*(['"]?)(.*?)\1\s*\)/.exec(picture || '');

                    if (!picture) {
                        thumbElement.classList.add('noPicture');
                    } else if (url && url[2]) {
                        var probe = new Image();
                        probe.onerror = function() { thumbElement.classList.add('noPicture'); };
                        probe.src = url[2];
                    }

                    return thumbElement;

                },


                /**
                 * I show the labels of an item's tags above its title, when my view says so (contentViewData.showTags):
                 * one line (.resourceTags) with a .resourceTag per tag that is defined, which also has the tag's id as
                 * a class, so that custom CSS can give a tag its colour. Without the setting, or without a defined
                 * tag, there is no line. Safe to call again: the line is made anew.
                 *
                 * @method _syncTagLabel
                 * @param {HTMLElement} thumbElement
                 * @param {Object} contentItem
                 */
                _syncTagLabel: function(thumbElement, contentItem) {

                    if (!thumbElement) { return; }

                    Array.from(thumbElement.children).forEach(function(child) {
                        if (child.classList.contains('resourceTags')) { child.remove(); }
                    });

                    var TagModel = FrameTrail.module('TagModel'),
                        ids      = (contentItem && contentItem.data && contentItem.data.tags) || [];

                    if (this.contentViewData.showTags !== true || !TagModel || !ids.length) { return; }

                    var line = document.createElement('div');
                    line.className = 'resourceTags';

                    ids.forEach(function(id) {
                        var tag = TagModel.getTag(id);
                        if (!tag.known) { return; }
                        var label = document.createElement('span');
                        label.className = 'resourceTag';
                        try { label.classList.add(tag.id); } catch (e) { /* an id that is no class name */ }
                        label.setAttribute('data-tag', tag.id);
                        label.textContent = tag.label;
                        line.appendChild(label);
                    });

                    if (!line.firstChild) { return; }

                    var title = null;
                    Array.from(thumbElement.children).forEach(function(child) {
                        if (!title && child.classList.contains('resourceTitle')) { title = child; }
                    });
                    thumbElement.insertBefore(line, title || thumbElement.firstChild);

                },


                /**
                 * The same for every element of my collection: after a rendering (the setting may have changed) and
                 * when the tag definitions change.
                 *
                 * @method _syncTagLabels
                 */
                _syncTagLabels: function() {

                    var self = this;

                    if (!self._tagsSubscribed && self.contentViewData.showTags === true && FrameTrail.module('TagModel')) {
                        self._tagsSubscribed = FrameTrail.module('TagModel').subscribe(function() {
                            if (self.contentViewData.type == 'TimedContent') { self._syncTagLabels(); }
                        });
                    }

                    (self.contentGroups || []).forEach(function(group) {
                        var element = self.getContentViewElementFromContentItem(group.representative);
                        if (!element) { return; }
                        Array.from(element.children).forEach(function(child) {
                            if (child.classList.contains('resourceThumb')) { self._syncTagLabel(child, group.representative); }
                        });
                    });

                },


                /**
                 * Whether a thumbnail of mine is a text card: a text in a medium view of the left and right areas
                 * (and of a phone), which the stylesheet shows with its whole text (ResourceText/style.css).
                 *
                 * @method _isTextCard
                 * @param {HTMLElement} thumbElement
                 * @return {Boolean}
                 */
                _isTextCard: function(thumbElement) {
                    return this.contentViewData.contentSize == 'medium'
                        && this.isVerticalArea()
                        && thumbElement.getAttribute('data-type') == 'text';
                },


                /**
                 * I keep the class .cut on a text's thumbnail: its content is higher than the thumbnail, which is the
                 * case only for a text card longer than its limit. A cut card fades out and opens the preview on a
                 * click, a whole one has nothing to open. Measured whenever the thumbnail changes its size (the
                 * first layout, the area's width, the view's size, the text); the class changes no size.
                 *
                 * @method _watchTextCard
                 * @param {HTMLElement} thumbElement
                 */
                _watchTextCard: function(thumbElement) {

                    if (!window.ResizeObserver || !thumbElement || thumbElement.getAttribute('data-type') != 'text'
                        || !this.isVerticalArea()) {
                        return;
                    }

                    if (!this._textCardObserver) {
                        this._textCardObserver = new ResizeObserver(function(entries) {
                            entries.forEach(function(entry) {
                                var thumb = entry.target;
                                thumb.classList.toggle('cut', thumb.scrollHeight > thumb.clientHeight + 1);
                            });
                        });
                    }

                    this._textCardObserver.observe(thumbElement);

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
                        var thumbElement = contentItem.resourceItem.renderThumb();
                        self._markThumb(thumbElement);

                        // In the small horizontal top/bottom strips the inline .resourceTitle is
                        // hidden and would be clipped by .contentViewScroll's overflow if revealed
                        // on hover. Show the name as a top-layer tooltip instead (handled by the
                        // Tooltip module), which escapes clipping. (Medium/large show the title inline.)
                        if ( self.contentViewData.contentSize == 'small' && (self.whichArea == 'top' || self.whichArea == 'bottom') ) {
                            var titleEl = thumbElement.querySelector('.resourceTitle');
                            var tooltipText = (titleEl && titleEl.textContent)
                                            || (contentItem.resourceItem.resourceData && contentItem.resourceItem.resourceData.name)
                                            || '';
                            if (tooltipText) {
                                thumbElement.setAttribute('data-tooltip-top', tooltipText);
                                thumbElement.setAttribute('data-tooltip-variant', 'resourceTitle');
                            }
                        }

                        collectionElement.appendChild(thumbElement);
                        self._watchTextCard(thumbElement);
                        self._syncTagLabel(thumbElement, contentItem);
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

                    if ( self.isVerticalArea() || self.isCircularArea() ) {
                        collectionElement.addEventListener('click', function(evt) {
                            if ( self.contentViewData.contentSize == 'small' || self.contentViewData.contentSize == 'medium' ) {
                                // A preview opened from here belongs to the video: it pauses it and is shown on it (where there is room: ViewVideo.previewBox()). Types without a preview have no button.
                                var _thumb = this.querySelector('.resourceThumb');
                                // A text card (see _watchTextCard) shows its whole text: there is nothing to open, unless it is cut. A click on a link in it is the link's.
                                if (_thumb && self._isTextCard(_thumb)
                                    && (!_thumb.classList.contains('cut') || (evt.target.closest && evt.target.closest('a')))) {
                                    return;
                                }
                                if (_thumb && _thumb.querySelector('.resourcePreviewButton')) {
                                    contentItem.resourceItem.openPreview(_thumb, { onVideo: true });
                                }

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

                            var watchedThumb = contentViewElement.querySelector('.resourceThumb');
                            if (this._textCardObserver && watchedThumb) { this._textCardObserver.unobserve(watchedThumb); }

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

                    var self            = this,
                        touchFirst      = FrameTrail.isTouchPrimary(),
                        scrollContainer = contentViewContainer.querySelector('.contentViewScroll'),
                        followTimeout;

                    // While somebody looks around in me, I do not follow the playback (isMouseOver): with a
                    // mouse, while it is over me and for 2 s after a scroll; on a touch device, where a tap
                    // leaves the browser thinking the pointer is still there, for a while after every touch.
                    function pauseFollowing(ms, whileHovered) {
                        self.isMouseOver = true;
                        clearTimeout(followTimeout);
                        followTimeout = setTimeout(function() {
                            if (!whileHovered || !scrollContainer || !scrollContainer.matches(':hover')) {
                                self.isMouseOver = false;
                            }
                        }, ms);
                    }

                    if (touchFirst) {
                        contentViewContainer.addEventListener('touchstart', function() {
                            pauseFollowing(TOUCH_FOLLOW_PAUSE);
                        }, { capture: true, passive: true });
                    } else {
                        contentViewContainer.addEventListener('mouseenter', function() {
                            self.isMouseOver = true;
                        });
                        contentViewContainer.addEventListener('mouseleave', function() {
                            self.isMouseOver = false;
                        });
                    }

                    // Suppress programmatic scrolling during user-initiated scroll/touch
                    if (scrollContainer) {

                        // Keep the custom scrollbar and --scrollbar-size in sync: the observer
                        // fires when the scroll container's content box changes and when the
                        // contents grow or shrink, i.e. whenever the scroll state can change.
                        this.scrollbarObserver = new ResizeObserver(function() {
                            self.updateScrollbarCompensation();
                            self.updateScrollbar();
                        });
                        this.scrollbarObserver.observe(scrollContainer);
                        this.scrollbarObserver.observe(contentViewContainer.querySelector('.contentViewContents'));

                        this.initScrollbar(contentViewContainer);

                        scrollContainer.addEventListener('scroll', function() {
                            if (self._isProgrammaticScroll) return;
                            if (touchFirst) {
                                pauseFollowing(TOUCH_FOLLOW_PAUSE);
                            } else {
                                pauseFollowing(2000, true);
                            }
                        }, { passive: true });
                    }

                    // A phone's large collection is swiped through as the bottom area's details are: an overlay
                    // over embedded players and maps turns a horizontal swipe into the next or previous
                    // annotation and lets taps through to the content. Beneath it, a strip shows all its annotations.
                    if (FrameTrail.getState('companion') && this.isSlideshow()) {
                        var slideshowOverlay = document.createElement('div');
                        slideshowOverlay.className = 'swipeOverlay';
                        contentViewContainer.appendChild(slideshowOverlay);
                        this.initSwipeOverlay(contentViewContainer, function(step) {
                            self.slideBy(step);
                        });
                        this.initCollectionStrip(contentViewContainer);
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
                    if (this.scrollbarObserver) {
                        this.scrollbarObserver.disconnect();
                        this.scrollbarObserver = null;
                    }

                    if (this._fitObserver) {
                        this._fitObserver.disconnect();
                        this._fitObserver = null;
                        this._fitObserved = null;
                    }

                    if (this._textCardObserver) {
                        this._textCardObserver.disconnect();
                        this._textCardObserver = null;
                    }

                    if (this._tagsSubscribed) {
                        this._tagsSubscribed();
                        this._tagsSubscribed = null;
                    }

                    if (this.collectionStripObserver) {
                        this.collectionStripObserver.disconnect();
                        this.collectionStripObserver = null;
                    }
                    clearTimeout(this._stripCentreTimeout);

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
                        // A transcript in a strip is columns that scroll sideways
                        if (self.contentViewData.type == 'Transcript' && self.isHorizontalArea()) {
                            self._showTranscriptColumn(firstActiveElement);
                            return;
                        }
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
                                            var _tcContainer = self.contentViewContainer.querySelector('.transcriptContainer');
                                            if ( !_tcContainer.classList.contains('searching') ) {
                                                scrollActiveElement(_tcContainer, 'span.active');
                                            }
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

                        case 'Chapters':

                            var chapters = FrameTrail.module('HypervideoModel').chapters || [],
                                chapterIndex = FrameTrail.module('HypervideoController').getChapterIndexAtTime(currentTime),
                                activeStart = (chapterIndex >= 0) ? chapters[chapterIndex].data.start : null;

                            self.contentViewContainer.querySelectorAll('.chapterElement').forEach(function(card) {

                                // getChapterIndexAtTime indexes the model array, which is
                                // not necessarily sorted, while the cards are rendered in
                                // time order — so match on the start time, not the index.
                                var cardStart = parseFloat(card.getAttribute('data-start')),
                                    isActive  = (activeStart !== null) && (cardStart === activeStart);

                                // The chapters before the one that plays (the steps display fills its line with them)
                                card.classList.toggle('done', activeStart !== null && cardStart < activeStart);

                                if (isActive) {
                                    if ( !card.classList.contains('active') ) {
                                        card.classList.add('active');
                                        if (!self.isMouseOver) {
                                            self._scrollRangeIntoCenter(card, card);
                                        }
                                    }
                                } else if ( card.classList.contains('active') ) {
                                    card.classList.remove('active');
                                }

                            });

                            break;

                        case 'QuizResults':

                            // The row the playhead is in: a chapter, or the question asked last
                            self.contentViewContainer.querySelectorAll('.quizResultRow').forEach(function(row) {

                                var isActive = parseFloat(row.getAttribute('data-start')) <= currentTime
                                            && currentTime < parseFloat(row.getAttribute('data-end'));

                                if (isActive) {
                                    if ( !row.classList.contains('active') ) {
                                        row.classList.add('active');
                                        if (!self.isMouseOver) {
                                            self._scrollRangeIntoCenter(row, row);
                                        }
                                    }
                                } else if ( row.classList.contains('active') ) {
                                    row.classList.remove('active');
                                }

                            });

                            break;
                    }


                },


                /**
                 * A native scrollbar takes its space from the content box of the
                 * .contentViewScroll element, which would shrink and shift all collection
                 * elements the moment it appears. Ours is an overlay (see style.css), but for
                 * browsers that draw a native one anyway I publish how much space it takes as
                 * the CSS property --scrollbar-size, which the .contentViewContents compensate
                 * for.
                 *
                 * @method updateScrollbarCompensation
                 */
                updateScrollbarCompensation: function() {

                    var scrollContainer = this.contentViewContainer
                                        && this.contentViewContainer.querySelector('.contentViewScroll');

                    if (!scrollContainer) {
                        return;
                    }

                    var scrollbarSize = this.isHorizontalArea()
                                        ? scrollContainer.offsetHeight - scrollContainer.clientHeight
                                        : scrollContainer.offsetWidth - scrollContainer.clientWidth;

                    if (scrollbarSize === this.scrollbarSize) {
                        return;
                    }

                    this.scrollbarSize = scrollbarSize;
                    scrollContainer.style.setProperty('--scrollbar-size', scrollbarSize + 'px');

                },


                /**
                 * I keep the custom scrollbar (see style.css) in sync with the scroll state of
                 * the .contentViewScroll element: I show it only when there is something to
                 * scroll and size and position its thumb accordingly.
                 *
                 * @method updateScrollbar
                 */
                updateScrollbar: function() {

                    var scrollContainer = this.contentViewContainer
                                        && this.contentViewContainer.querySelector('.contentViewScroll'),
                        scrollbar       = this.contentViewContainer
                                        && this.contentViewContainer.querySelector('.contentViewScrollbar');

                    if (!scrollContainer || !scrollbar) {
                        return;
                    }

                    var thumb      = scrollbar.querySelector('.contentViewScrollbarThumb'),
                        horizontal = this.isHorizontalArea(),
                        viewport   = horizontal ? scrollContainer.clientWidth : scrollContainer.clientHeight,
                        total      = horizontal ? scrollContainer.scrollWidth : scrollContainer.scrollHeight;

                    if ( total <= viewport + 1 ) {
                        scrollbar.classList.remove('scrollable');
                        return;
                    }

                    scrollbar.classList.add('scrollable');

                    var thumbSize  = Math.min(viewport, Math.max(20, Math.round(viewport * viewport / total))),
                        position   = horizontal ? scrollContainer.scrollLeft : scrollContainer.scrollTop,
                        thumbStart = Math.round((viewport - thumbSize) * (position / (total - viewport)));

                    thumb.style[ horizontal ? 'width' : 'height' ] = thumbSize + 'px';
                    thumb.style[ horizontal ? 'left' : 'top' ] = thumbStart + 'px';

                },


                /**
                 * I make the custom scrollbar work: it follows the scroll position, fades in
                 * while scrolling, its thumb can be dragged and a click on the track jumps one
                 * viewport in that direction.
                 *
                 * @method initScrollbar
                 * @param {HTMLElement} contentViewContainer
                 */
                initScrollbar: function(contentViewContainer) {

                    var self            = this,
                        scrollContainer = contentViewContainer.querySelector('.contentViewScroll'),
                        scrollbar       = contentViewContainer.querySelector('.contentViewScrollbar'),
                        thumb           = scrollbar.querySelector('.contentViewScrollbarThumb'),
                        dragStart       = null,
                        fadeTimeout,
                        horizontal,
                        scrollProperty;

                    // The direction is read when it is used: a view can change its size, and with it its direction.
                    function readDirection() {
                        horizontal     = self.isHorizontalArea();
                        scrollProperty = horizontal ? 'scrollLeft' : 'scrollTop';
                    }

                    scrollContainer.addEventListener('scroll', function() {

                        self.updateScrollbar();

                        scrollbar.classList.add('scrolling');
                        clearTimeout(fadeTimeout);
                        fadeTimeout = setTimeout(function() {
                            scrollbar.classList.remove('scrolling');
                        }, 1000);

                    }, { passive: true });

                    thumb.addEventListener('pointerdown', function(evt) {

                        readDirection();

                        var viewport  = horizontal ? scrollContainer.clientWidth : scrollContainer.clientHeight,
                            total     = horizontal ? scrollContainer.scrollWidth : scrollContainer.scrollHeight,
                            thumbSize = horizontal ? thumb.offsetWidth : thumb.offsetHeight;

                        dragStart = {
                            pointer:  horizontal ? evt.clientX : evt.clientY,
                            position: scrollContainer[scrollProperty],
                            // scrollable pixels one pixel of thumb movement stands for
                            factor:   (total - viewport) / Math.max(1, viewport - thumbSize)
                        };

                        thumb.setPointerCapture(evt.pointerId);
                        evt.preventDefault();

                    });

                    thumb.addEventListener('pointermove', function(evt) {

                        if (!dragStart) {
                            return;
                        }

                        var delta = (horizontal ? evt.clientX : evt.clientY) - dragStart.pointer;
                        scrollContainer[scrollProperty] = dragStart.position + delta * dragStart.factor;

                    });

                    thumb.addEventListener('pointerup', function() {
                        dragStart = null;
                    });

                    thumb.addEventListener('pointercancel', function() {
                        dragStart = null;
                    });

                    scrollbar.addEventListener('pointerdown', function(evt) {

                        if (evt.target == thumb) {
                            return;
                        }

                        readDirection();

                        var scrollbarRect = scrollbar.getBoundingClientRect(),
                            viewport      = horizontal ? scrollContainer.clientWidth : scrollContainer.clientHeight,
                            clickPosition = horizontal ? evt.clientX - scrollbarRect.left
                                                       : evt.clientY - scrollbarRect.top,
                            thumbPosition = horizontal ? thumb.offsetLeft : thumb.offsetTop;

                        scrollContainer[scrollProperty] += (clickPosition < thumbPosition) ? -viewport : viewport;

                    });

                },


                updateLayout: function() {

                    var self = this;
                        HypervideoDuration = FrameTrail.module('HypervideoModel').duration;

                    //console.log(HypervideoDuration);

                    if (!self.contentViewContainer.classList.contains('active')) {
                        return;
                    }

                    // The ring places its thumbnails itself; its strip is laid out like the bottom area.
                    if (self.isCircularArea() && !self.isStrip()) {
                        self.layoutRing();
                        return;
                    }

                    // Time-proportional packing is TimedContent's alone — it reads
                    // contentGroups, which no other type fills, and it would strip
                    // the inline positions off whatever else is in the container.
                    if ( HypervideoDuration != 0 && self.contentViewData.type == 'TimedContent' ) {
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

                    self.updateScrollbarCompensation();

                    self.updateScrollbar();

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
                            FrameTrail.module('ViewVideo').setLayoutAreaOpen(self.whichArea);
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
                    return this._renderTab(function() {
                        this.activateContentView();
                        // An area that opens with its annotations follows the tab the viewer picks (ViewLayout.updateAreaOpening): at once, also while the video is paused
                        var ViewLayout = FrameTrail.module('ViewLayout'),
                            controller = FrameTrail.module('HypervideoController');
                        if (this.whichArea != 'companion' && ViewLayout && controller) {
                            ViewLayout.updateTimedStateOfContentViews(controller.currentTime);
                        }
                    }, true);
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
                                 + '    <div class="contentViewScrollbar">'
                                 + '        <div class="contentViewScrollbarThumb"></div>'
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

                    // Swiping through the details on touch devices (see initSwipeOverlay).
                    var swipe = self.initSwipeOverlay(detailsContainerElement, function(step) {
                        var activeElement = self.contentViewContainer.querySelector('.collectionElement.open');
                        if (!activeElement) { return; }
                        var sibling = (step > 0) ? activeElement.nextElementSibling : activeElement.previousElementSibling;
                        while (sibling && !sibling.classList.contains('collectionElement')) {
                            sibling = (step > 0) ? sibling.nextElementSibling : sibling.previousElementSibling;
                        }
                        if (sibling) { sibling.click(); }
                    });

                    // Re-activate overlay on any navigation (transition of
                    // the detail contents slider signals a new element opened).
                    if (swipe) {
                        detailsContainerElement.querySelector('.contentViewDetailsContents')
                            .addEventListener('transitionend', swipe.reactivate);
                    }

                    return detailsContainerElement;

                },


                /**
                 * I make the swipe overlay (.swipeOverlay, a child of the container) work: the bottom and top
                 * areas' details use it, and so does a phone's large collection.
                 *
                 * A swipe overlay: a transparent element on top of the content
                 * that intercepts touch/pointer events for horizontal swipe
                 * navigation. Cross-origin iframes and <video controls> don't
                 * propagate events to ancestors, so we need an overlay that
                 * sits above them in the parent document.
                 *
                 * Behavior:
                 *   Horizontal swipe → navigate to prev/next collection element
                 *   Tap / click       → dismiss overlay + forward click to content
                 *   Vertical gesture  → dismiss overlay so user can scroll content
                 *
                 * The overlay reactivates when navigation occurs (swipe,
                 * slideButton, keyboard) or after 8 s of inactivity.
                 *
                 * @method initSwipeOverlay
                 * @param {HTMLElement} container  holds the overlay and the content under it
                 * @param {Function} step          called with 1 (the next element) or -1 (the previous one)
                 * @return {Object|null} { reactivate } on touch-primary devices, else null (the overlay lets everything through)
                 */
                initSwipeOverlay: function(container, step) {

                    var swipeOverlay = container.querySelector(':scope > .swipeOverlay');

                    // The overlay only makes sense on touch-primary devices,
                    // where it catches horizontal swipes over cross-origin
                    // iframes / <video controls>. On devices with a mouse it
                    // would just sit on top of the content and block
                    // hover/mouseover and scrolling (desktop users navigate
                    // via the visible slideButtons or the arrow keys instead).
                    // So on non-touch-primary devices we make it transparent
                    // to input and skip wiring up any handlers.
                    var isTouchPrimary = FrameTrail.isTouchPrimary();
                    if (!isTouchPrimary) {
                        swipeOverlay.style.pointerEvents = 'none';
                        return null;
                    }

                    var startX = 0, startY = 0, startTime = 0;
                    var swiping = false, decided = false;
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
                        step(dx < 0 ? 1 : -1);
                        reactivateOverlay();
                    }

                    // While overlay is dismissed, extend the timer on new
                    // touches so it doesn't reactivate mid-interaction.
                    container.addEventListener('touchstart', function() {
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
                        if (e.cancelable) { e.preventDefault(); }
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

                    return { reactivate: reactivateOverlay };

                },


                /**
                 * I add the strip beneath a phone's large collection: every annotation as a small thumbnail in a row,
                 * like the bottom area's small view (renderCollectionStrip fills it). The playing ones are highlighted,
                 * the one on screen is marked and kept in view, a tap slides there, and the edges show when there are
                 * more to the left or the right (a tap on one scrolls the strip that way).
                 *
                 * @method initCollectionStrip
                 * @param {HTMLElement} contentViewContainer
                 */
                initCollectionStrip: function(contentViewContainer) {

                    var self = this,
                        _ws  = document.createElement('div');
                    _ws.innerHTML = '<div class="collectionStrip">'
                                  + '    <div class="collectionStripScroll">'
                                  + '        <div class="collectionStripContents"></div>'
                                  + '    </div>'
                                  + '    <div class="collectionStripMore left"><span class="icon-left-open-big"></span></div>'
                                  + '    <div class="collectionStripMore right"><span class="icon-right-open-big"></span></div>'
                                  + '</div>';
                    var strip           = _ws.firstElementChild,
                        stripScroll     = strip.querySelector('.collectionStripScroll'),
                        scrollContainer = contentViewContainer.querySelector('.contentViewScroll'),
                        frame           = null;

                    // Beyond the strip's padding (10px, see CompanionLauncher/style.css) a thumbnail is cut off.
                    function updateEdges() {
                        strip.classList.toggle('moreLeft', stripScroll.scrollLeft > 10);
                        strip.classList.toggle('moreRight', stripScroll.scrollLeft + stripScroll.clientWidth < stripScroll.scrollWidth - 10);
                    }

                    stripScroll.addEventListener('scroll', updateEdges, { passive: true });

                    // A new size (a view shown, a turned phone, new thumbnails) puts the one on screen back in the middle.
                    this.collectionStripObserver = new ResizeObserver(function() {
                        self._stripNeedsCentre = true;
                        self.updateCollectionStrip(true);
                        updateEdges();
                    });
                    this.collectionStripObserver.observe(stripScroll);
                    this.collectionStripObserver.observe(strip.querySelector('.collectionStripContents'));

                    scrollContainer.addEventListener('scroll', function() {
                        if (frame) { return; }
                        frame = requestAnimationFrame(function() {
                            frame = null;
                            self.updateCollectionStrip();
                        });
                    }, { passive: true });

                    strip.querySelectorAll('.collectionStripMore').forEach(function(button) {
                        button.addEventListener('click', function() {
                            var direction = button.classList.contains('left') ? -1 : 1;
                            stripScroll.scrollBy({ left: direction * stripScroll.clientWidth * 0.8, behavior: 'smooth' });
                        });
                    });

                    contentViewContainer.appendChild(strip);
                    this.collectionStrip = strip;

                },


                /**
                 * I fill the strip of a phone's large collection with one thumbnail per element (group), in the same
                 * order, and keep each as the group's stripElement, which follows the group's active state.
                 *
                 * @method renderCollectionStrip
                 */
                renderCollectionStrip: function() {

                    var self     = this,
                        contents = self.collectionStrip.querySelector('.collectionStripContents');

                    contents.innerHTML = '';

                    self.contentGroups.forEach(function(group) {
                        var item = document.createElement('div');
                        item.className = 'collectionStripItem';
                        item.appendChild(self._markThumb(group.representative.resourceItem.renderThumb()));
                        item.addEventListener('click', function() {
                            self.slideTo(self.getContentViewElementFromContentItem(group.representative));
                        });
                        contents.appendChild(item);
                        group.stripElement = item;
                    });

                    self.contentViewContainer.classList.toggle('withStrip', self.contentGroups.length > 0);

                    self._shownStripIndex = -1;
                    self._stripNeedsCentre = true;
                    self.updateCollectionStrip(true);

                },


                /**
                 * I mark the annotation a phone's large collection shows (.shown, on its element and its thumbnail), and
                 * bring its thumbnail to the middle of the strip once the collection stops moving (at once if instant).
                 * Only when that annotation changed (or the size did): scrolling the strip by hand is not undone.
                 *
                 * @method updateCollectionStrip
                 * @param {Boolean} instant
                 */
                updateCollectionStrip: function(instant) {

                    var self  = this,
                        index = self.collectionStrip ? self._shownSlideIndex() : -1;

                    if (index < 0) { return; }

                    if (index !== self._shownStripIndex) {
                        self.contentViewContainer.querySelectorAll('.collectionElement.shown, .collectionStripItem.shown').forEach(function(el) {
                            el.classList.remove('shown');
                        });
                        var group = self.contentGroups[index],
                            slide = self._slides()[index];
                        if (slide) {
                            slide.classList.add('shown');
                        }
                        if (group && group.stripElement) {
                            group.stripElement.classList.add('shown');
                        }
                        self._shownStripIndex = index;
                        self._stripNeedsCentre = true;
                    }

                    if (!self._stripNeedsCentre) { return; }

                    function centre() {
                        var stripScroll = self.collectionStrip.querySelector('.collectionStripScroll'),
                            group       = self.contentGroups[self._shownStripIndex],
                            item        = group && group.stripElement;
                        if (!item || !stripScroll.clientWidth) { return; }
                        var left = item.offsetLeft + item.offsetWidth / 2 - stripScroll.clientWidth / 2;
                        if (instant) {
                            stripScroll.scrollLeft = left;
                        } else {
                            stripScroll.scrollTo({ left: left, behavior: 'smooth' });
                        }
                        self._stripNeedsCentre = false;
                    }

                    clearTimeout(self._stripCentreTimeout);
                    if (instant) {
                        centre();
                    } else {
                        self._stripCentreTimeout = setTimeout(centre, 150);
                    }

                },


                /**
                 * I render a ContentView Preview Element.
                 *
                 * @method renderContentViewPreviewElement
                 * @return {HTMLElement} previewElement
                 */
                generateSchematicPreview: function() {
                    var axis = this.isCircularArea() ? 'ring' : (this.isHorizontalArea() ? 'x' : 'y');
                    return _generateSchematic(this.contentViewData.type, this.contentViewData.contentSize, axis, false, undefined, this.contentViewData.chapterStyle);
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
                        self._describeLayoutArea(areaContainer, null);
                        areaContainer.style.removeProperty('--view-fit');
                    } else if (self.syncLayoutArea()) {
                        self.fitLayoutArea();
                    }

                    if (!preventViewSizeChange) {
                        FrameTrail.changeState('viewSize', FrameTrail.getState('viewSize'));
                    }

                },


                /**
                 * What my content needs along my area's axis, where my type is as large as its content: in the top
                 * and bottom areas chapters as steps, quiz results, timelines (up to the rows my size shows) and a
                 * transcript (up to the lines my size shows, which the stylesheet limits). I answer the element whose
                 * size says so and the pixels it takes; its size never depends on the area's (ContentView/style.css
                 * sees to that), so an area that changes its size does not change what I answer. Null for a type or
                 * an area that has a size of its own; an extent of 0 while nothing is laid out (hidden, not in the
                 * page yet), and of 1 for a view that is laid out and has nothing to show.
                 *
                 * @method fitExtent
                 * @return {Object|null} { element, extent }
                 */
                fitExtent: function() {

                    var data      = this.contentViewData,
                        container = this.contentViewContainer;

                    if (!container || (this.whichArea != 'top' && this.whichArea != 'bottom')) { return null; }

                    var contents = container.querySelector('.contentViewContents'),
                        element  = null,
                        extent   = 0;

                    switch (data.type) {

                        case 'Chapters':
                            if (data.chapterStyle === 'steps') {
                                element = container.querySelector('.chaptersContainer.chapterSteps');
                            } else if (data.contentSize == 'large' && this._chapterThumbs) {
                                // Large cards with thumbnails end below their last line (the thumbnail's
                                // height is fixed, so the row's height does not wait for the pictures)
                                element = container.querySelector('.chaptersContainer:not(.noThumbs)');
                            } else {
                                return null;
                            }
                            extent = element ? element.offsetHeight : 0;
                            break;

                        case 'QuizResults':
                        case 'Transcript':
                            element = contents;
                            extent  = (contents && contents.firstElementChild) ? contents.offsetHeight : 0;
                            break;

                        case 'Timelines':
                            element = container.querySelector('.timelineZoomScroller');
                            if (element) {
                                // As many rows as my size shows (FIT_TIMELINE_ROWS); more are scrolled to
                                var rows     = element.querySelectorAll(':scope > .userTimelineWrapper'),
                                    limit    = FIT_TIMELINE_ROWS[data.contentSize] || FIT_TIMELINE_ROWS.medium,
                                    controls = container.querySelector('.zoomControlsWrapper');
                                extent = (rows.length > limit) ? rows[limit].offsetTop : (rows.length ? element.offsetHeight : 0);
                                if (extent && controls) { extent += controls.offsetHeight; }
                            }
                            break;

                        default:
                            return null;

                    }

                    // Laid out, and nothing to show (no questions, no rows, no text): the least the size allows,
                    // not the room that content would take
                    if (!extent && container.getClientRects().length) { extent = 1; }

                    return { element: element, extent: extent };

                },


                /**
                 * I make my layout area as large as my content, if I am its active view and of a type that is (see
                 * fitExtent): the area gets my content's extent as --view-fit, which the stylesheet's sizes by type
                 * of view take (ViewVideo/style.css); a type with a size of its own takes it away. Nothing is written
                 * while the extent is what it was, or while nothing is laid out (what was measured last stands: a
                 * closed top or bottom area is laid out, so it opens at the size it will have).
                 *
                 * The area moves to its new size as to any other (its transition; the video follows by itself, see
                 * ViewVideo.followVideoContainer). With instant, and while the views of a hypervideo are being made
                 * (ViewLayout.withoutAreaTransitions), it takes the size at once: nobody has seen another one.
                 *
                 * I am called when I was rendered, when I become the active tab, and by an observer of the measured
                 * element for what comes later (a webfont, the window's width, a result, an edited subtitle). Never
                 * while the layout is adjusted: that happens in every frame of an area's transition.
                 *
                 * @method fitLayoutArea
                 * @param {Boolean} instant
                 * @return {Boolean} whether the area's size changed
                 */
                fitLayoutArea: function(instant) {

                    var self = this;

                    if (!self.isActiveView() || FrameTrail.getState('companion')) { return false; }

                    var areaContainer = self.getLayoutAreaContainer(),
                        fit           = self.fitExtent(),
                        current       = areaContainer.style.getPropertyValue('--view-fit'),
                        next          = current;

                    self._observeFit(fit ? fit.element : null);

                    if (!fit) {
                        next = '';
                    } else if (fit.extent > 0 && (!current || Math.abs(parseFloat(current) - fit.extent) >= 1)) {
                        next = Math.ceil(fit.extent) + 'px';
                    }

                    if (next === current) { return false; }

                    var ViewLayout = FrameTrail.module('ViewLayout');

                    function write() {
                        if (next) {
                            areaContainer.style.setProperty('--view-fit', next);
                        } else {
                            areaContainer.style.removeProperty('--view-fit');
                        }
                    }

                    if (instant && ViewLayout && ViewLayout.withoutAreaTransitions) {
                        ViewLayout.withoutAreaTransitions(write);
                    } else {
                        write();
                    }

                    if (!instant && !(ViewLayout && ViewLayout.areasFrozen && ViewLayout.areasFrozen())) {
                        // As after a tab change: what needs the final sizes is done when the area has arrived
                        if (window.contentViewFitTimeout) { window.clearTimeout(window.contentViewFitTimeout); }
                        window.contentViewFitTimeout = window.setTimeout(function() {
                            FrameTrail.changeState('viewSizeChanged');
                        }, 600);
                    }

                    return true;

                },


                /**
                 * I watch the element my layout area's size is measured from (see fitExtent), and fit the area again
                 * when its size changes. One element at a time: a rendering makes a new one.
                 *
                 * @method _observeFit
                 * @private
                 * @param {HTMLElement} element null to stop watching
                 */
                _observeFit: function(element) {

                    var self = this;

                    if (self._fitObserved === (element || null)) { return; }

                    if (!self._fitObserver && element && window.ResizeObserver) {
                        self._fitObserver = new ResizeObserver(function() {
                            // Not while a row of a Timelines view is dragged to another place (its placeholder has another height)
                            if (self.contentViewContainer && self.contentViewContainer.querySelector('.sortable-chosen, .sortable-ghost')) { return; }
                            self.fitLayoutArea();
                        });
                    }

                    if (!self._fitObserver) { return; }

                    if (self._fitObserved) { self._fitObserver.unobserve(self._fitObserved); }
                    self._fitObserved = element || null;
                    if (element) { self._fitObserver.observe(element); }

                },


                /**
                 * Whether I am the view my layout area shows: its active tab. Only that view decides the area's size.
                 *
                 * @method isActiveView
                 * @return {Boolean}
                 */
                isActiveView: function() {
                    return !!this.contentViewContainer && this.contentViewContainer.classList.contains('active');
                },


                /**
                 * I tell my layout area what it shows, if I am its active view: my size (data-size), my type
                 * (data-view-type) and, where a type has more than one design, which (data-view-style). The area's
                 * size and much of what is laid out in it go by these (ViewVideo/style.css, ContentView/style.css).
                 * A view in another tab changes nothing.
                 *
                 * @method syncLayoutArea
                 * @return {Boolean} whether I am the active view
                 */
                syncLayoutArea: function() {

                    if (!this.isActiveView()) { return false; }

                    this._describeLayoutArea(this.getLayoutAreaContainer(), this);

                    return true;

                },


                /**
                 * The design of my type that I show, where the type has more than one: a Chapters view's steps, or
                 * its cards without thumbnails ('text').
                 *
                 * @method viewStyle
                 * @return {String} '' for none
                 */
                viewStyle: function() {
                    var data = this.contentViewData;
                    if (data.type != 'Chapters') { return ''; }
                    if (data.chapterStyle === 'steps') { return 'steps'; }
                    // Cards without thumbnails (see renderChapterCards): their text alone
                    return (data.contentSize != 'small' && this._chapterThumbs === false) ? 'text' : '';
                },


                /**
                 * I write what a view is (its size, type and style) onto the container of a layout area, or of its
                 * preview in the Layout Editor; nothing of it for an area without a view.
                 *
                 * @method _describeLayoutArea
                 * @private
                 * @param {HTMLElement} areaContainer
                 * @param {ContentView} contentView null for an empty area
                 */
                _describeLayoutArea: function(areaContainer, contentView) {

                    function set(name, value) {
                        if (!value) {
                            if (areaContainer.hasAttribute(name)) { areaContainer.removeAttribute(name); }
                        } else if (areaContainer.getAttribute(name) !== value) {
                            areaContainer.setAttribute(name, value);
                        }
                    }

                    set('data-size',       contentView ? contentView.contentViewData.contentSize : null);
                    set('data-view-type',  contentView ? contentView.contentViewData.type : null);
                    set('data-view-style', contentView ? contentView.viewStyle() : null);

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

                    // Only the tab that is shown says what the preview area is; a view not drawn there yet says nothing
                    if (isEmpty) {
                        self._describeLayoutArea(areaContainer, null);
                    } else if (!self.contentViewPreviewElement || self.contentViewPreviewElement.classList.contains('active')) {
                        self._describeLayoutArea(areaContainer, self);
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

                            // A card (the summary of a Wikipedia article, a page that cannot be embedded) lays
                            // itself out for the width it has; only an embedded page needs its 400px
                            if (referenceWidth >= scaleBase || elementToScale.querySelector('.resourceCard')) {
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
                 * I render one card per chapter into my contents container.
                 *
                 * Chapters are display-only here: a click seeks, and the card of the
                 * chapter currently playing is marked .active (see
                 * updateTimedStateOfContentViews). Authoring stays in the chapter
                 * editor and on the chapter timeline.
                 *
                 * The cards are plain .collectionElement nodes, so they inherit the
                 * active/hover states, the area-driven flex/scroll container and the
                 * custom scrollbar from the generic ContentView styles; .chapterElement
                 * is what the Chapters-specific size rules hook onto.
                 *
                 * As steps (contentViewData.chapterStyle "steps") the chapters are dots on a
                 * line, spread evenly over the area, with the title (and the chapter's
                 * description) beside or below each: a progress indicator. The elements are
                 * still .chapterElement, so the active state and the click are the same, but
                 * not .collectionElement: a step is no card and takes none of its sizes.
                 * The line is drawn by the steps themselves (::before and ::after, up to
                 * and from their dot), filled as far as the chapter that plays (.done on
                 * the chapters before it, see updateTimedStateOfContentViews).
                 *
                 * @method renderChapterCards
                 */
                renderChapterCards: function() {

                    var self            = this,
                        HypervideoModel = FrameTrail.module('HypervideoModel'),
                        Controller      = FrameTrail.module('HypervideoController'),
                        offsetIn        = HypervideoModel.offsetIn,
                        videoEnd        = offsetIn + HypervideoModel.duration,
                        size            = self.contentViewData.contentSize,
                        contents        = self.contentViewContainer.querySelector('.contentViewContents');

                    contents.innerHTML = '';

                    var steps    = self.contentViewData.chapterStyle === 'steps',
                        showTime = self.contentViewData.showChapterTime !== false;

                    // Cards have thumbnails at medium and large where the video has a scrub sprite, or may still
                    // get one (it is probed for); where it cannot have one, they are their text alone (.noThumbs),
                    // and their area is as large as that (viewStyle).
                    self._chapterThumbs = !steps && (size == 'medium' || size == 'large')
                                          && !!(Controller && Controller.expectsScrubSprite && Controller.expectsScrubSprite());

                    var container = document.createElement('div');
                    container.className = 'chaptersContainer' + (steps ? ' chapterSteps' : '')
                                        + ((!steps && size != 'small' && !self._chapterThumbs) ? ' noThumbs' : '');
                    contents.appendChild(container);

                    // The model array is only kept sorted while the chapter editor is
                    // open, so a hand-edited hypervideo.json can arrive out of order.
                    var chapters = FrameTrail.module('ChaptersController').getSortedChapters();

                    // A hypervideo without chapters simply shows an empty area — this is
                    // the viewer-facing side, where a hint about the chapter editor would
                    // be noise. The edit dialog is where authors are told about it.
                    if ( chapters.length == 0 ) {
                        return;
                    }

                    var sprite = (!steps && (size == 'medium' || size == 'large')) ? Controller.getScrubSprite() : null,
                        isVertical = self.isVerticalArea(),
                        duration   = HypervideoModel.duration;

                    // In a narrow vertical strip the card is only ~44px wide, which is
                    // not enough for a timecode and a title side by side. There the
                    // title wins (it is what identifies a chapter) and the time moves
                    // into the tooltip. The tooltip points away from the video edge.
                    var tooltipAttribute = (isVertical && size == 'small')
                        ? ((self.whichArea == 'left') ? 'data-tooltip-left-left' : 'data-tooltip-right-right')
                        : null;

                    // In a horizontal strip the compact sizes map each card's width to
                    // its chapter's share of the running time, so the row reads like the
                    // chapter timeline.
                    //
                    // The share is a percentage width, not a flex-grow factor: the cards
                    // are border-box, so a percentage puts their padding and border
                    // *inside* the share, whereas flex-grow distributes only the space
                    // left over after every card's padding and border are subtracted —
                    // which hands each card ~18px more than its due and pushes the rest
                    // off their marks. The CSS supplies the per-size minimum width, so a
                    // very short chapter still stays legible and the strip scrolls once
                    // those minimums no longer fit.
                    //
                    // Not at large: a 260px floor plus a 160px thumbnail would swallow
                    // the proportions on all but very long videos. Not in the vertical
                    // areas either, where this would fight the row heights.
                    // Nor for steps, which are spread evenly whatever their chapters' lengths.
                    var proportional = !isVertical
                                    && !steps
                                    && (size == 'small' || size == 'medium')
                                    && duration > 0;

                    // Chapters need not start at the clip's in-point. The timeline leaves
                    // that lead-in empty, so an inert spacer reproduces it here.
                    if (proportional && chapters[0].data.start > offsetIn) {
                        var spacer = document.createElement('div');
                        spacer.className = 'chapterCardSpacer';
                        spacer.style.width = (100 * (chapters[0].data.start - offsetIn) / duration) + '%';
                        container.appendChild(spacer);
                    }

                    chapters.forEach(function(chapter, index) {

                        var start = chapter.data.start,
                            end   = (index + 1 < chapters.length) ? chapters[index + 1].data.start : videoEnd,
                            // Chapter starts are absolute; the player clock is relative
                            // to the clip's in-point, so this has to be too.
                            timeLabel  = Controller.formatTime(start - offsetIn),
                            titleLabel = chapter.data.title || self.labels['ChapterUntitled'];

                        var card = document.createElement('div');
                        card.className = steps ? 'chapterElement chapterStep' : 'collectionElement chapterElement';
                        card.setAttribute('data-start', start);
                        card.setAttribute('data-end', end);

                        if (steps) {
                            var dot = document.createElement('div');
                            dot.className = 'chapterStepDot';
                            card.appendChild(dot);
                        }

                        if (proportional) {
                            card.style.width = 'calc(' + (100 * Math.max(0, end - start) / duration)
                                             + '% - var(--chapter-gap))';
                        }

                        // The thumbnail's box is there as soon as a sprite is expected (its picture comes with
                        // the sprite): a card has its final height from the start, which a large card of the
                        // top and bottom areas gives its area (fitExtent).
                        if (sprite || self._chapterThumbs) {
                            var thumb = document.createElement('div');
                            thumb.className = 'chapterCardThumb';
                            if (sprite) { self._applyScrubSpriteTile(thumb, sprite, start); }
                            card.appendChild(thumb);
                        }

                        // The time and title share one wrapper so that the thumb and the
                        // text are a single pair of flex children — that is what lets the
                        // same markup lay out as a poster card (thumb above) in the
                        // horizontal areas and as a list row (thumb beside) in the vertical ones.
                        var textElement = document.createElement('div');
                        textElement.className = 'chapterCardText';

                        if (showTime) {
                            var timeElement = document.createElement('div');
                            timeElement.className = 'chapterCardTime';
                            timeElement.textContent = timeLabel;
                            textElement.appendChild(timeElement);
                        }

                        var titleElement = document.createElement('div');
                        titleElement.className = 'chapterCardTitle';
                        // textContent, not innerHTML — titles are user input
                        titleElement.textContent = titleLabel;
                        if (!chapter.data.title) { titleElement.classList.add('placeholder'); }
                        textElement.appendChild(titleElement);

                        // The optional second line (shown where the size leaves room, see the stylesheet)
                        if (typeof chapter.data.description === 'string' && chapter.data.description) {
                            var descriptionElement = document.createElement('div');
                            descriptionElement.className = 'chapterCardDescription';
                            descriptionElement.textContent = chapter.data.description;
                            textElement.appendChild(descriptionElement);
                        }

                        card.appendChild(textElement);

                        if (tooltipAttribute) {
                            card.setAttribute(tooltipAttribute, (showTime ? timeLabel + '  ' : '') + titleLabel);
                            card.setAttribute('data-tooltip-variant', 'resourceTitle');
                        }

                        card.addEventListener('click', function() {
                            FrameTrail.module('HypervideoController').currentTime = start;
                        });

                        container.appendChild(card);

                    });

                },


                /**
                 * I render the hypervideo's questions and what was answered: a Quiz Results view.
                 *
                 * The questions are the QuizController's (quiz overlays, and the quiz annotations a
                 * collection view shows; on a phone the list its player sent). They are shown as dots,
                 * one per question, in rows: one row per chapter with the dots of the questions in it
                 * (quizRows "chapters", and there are chapters), or one row per question. Below (in the
                 * top and bottom areas: at the end) a summary: the score, a legend, "Start again".
                 *
                 * The rows are the Chapters view's cards (.chapterElement in .chaptersContainer), so
                 * every size in every area is laid out by the same rules; a row's click seeks to its
                 * chapter or question. What changes with an answer is only written by
                 * updateQuizResultStates(), so that a result never rebuilds (and scrolls) the list.
                 *
                 * @method renderQuizResults
                 */
                renderQuizResults: function() {

                    var self = this;

                    if (self.contentViewData.type !== 'QuizResults' || !self.contentViewContainer) { return; }

                    var HypervideoModel = FrameTrail.module('HypervideoModel'),
                        Controller      = FrameTrail.module('HypervideoController'),
                        QuizController  = FrameTrail.module('QuizController'),
                        offsetIn        = HypervideoModel.offsetIn,
                        duration        = HypervideoModel.duration,
                        videoEnd        = offsetIn + duration,
                        size            = self.contentViewData.contentSize,
                        isVertical      = self.isVerticalArea(),
                        contents        = self.contentViewContainer.querySelector('.contentViewContents'),
                        questions       = QuizController ? QuizController.questions() : [],
                        chapters        = FrameTrail.module('ChaptersController').getSortedChapters(),
                        byChapters      = self.contentViewData.quizRows !== 'questions' && chapters.length > 0;

                    contents.innerHTML = '';

                    // The summary of the last rendering (it is the view's, beside its contents)
                    var lastSummary = self.contentViewContainer.querySelector(':scope > .quizResultsSummary');
                    if (lastSummary) { lastSummary.remove(); }

                    var container = document.createElement('div');
                    container.className = 'chaptersContainer quizResultsContainer';
                    container.setAttribute('data-rows', byChapters ? 'chapters' : 'questions');
                    contents.appendChild(container);

                    // Without a question there is nothing to show: an empty area, as a Chapters view
                    // without chapters. The settings say why.
                    if (!questions.length) { return; }

                    var rows = [];

                    if (byChapters) {

                        chapters.forEach(function(chapter, index) {
                            rows.push({
                                start:       chapter.data.start,
                                end:         (index + 1 < chapters.length) ? chapters[index + 1].data.start : videoEnd,
                                title:       chapter.data.title || self.labels['ChapterUntitled'],
                                placeholder: !chapter.data.title,
                                questions:   []
                            });
                        });

                        // A question belongs to the chapter it is asked in; one before the first chapter to the first
                        questions.forEach(function(question) {
                            var row = rows[0];
                            for (var r = 0; r < rows.length; r++) {
                                if (rows[r].start <= question.start) { row = rows[r]; }
                            }
                            row.questions.push(question);
                        });

                    } else {

                        questions.forEach(function(question, index) {
                            rows.push({
                                start:       question.start,
                                end:         (index + 1 < questions.length) ? questions[index + 1].start : videoEnd,
                                title:       question.question || self.labels['QuizResultsQuestion'].replace('%s', index + 1),
                                placeholder: !question.question,
                                questions:   [question],
                                key:         question.key
                            });
                        });

                    }

                    // As in the Chapters view: in a narrow vertical strip the text moves into a tooltip that points
                    // away from the video, and in a compact horizontal strip a chapter's width is its share of the time.
                    var tooltipAttribute = (isVertical && size == 'small')
                            ? ((self.whichArea == 'left') ? 'data-tooltip-left-left' : 'data-tooltip-right-right')
                            : null,
                        proportional = byChapters && !isVertical && (size == 'small' || size == 'medium') && duration > 0;

                    if (proportional && rows[0].start > offsetIn) {
                        var spacer = document.createElement('div');
                        spacer.className = 'chapterCardSpacer';
                        spacer.style.width = (100 * (rows[0].start - offsetIn) / duration) + '%';
                        container.appendChild(spacer);
                    }

                    rows.forEach(function(row) {

                        var timeLabel = Controller.formatTime(row.start - offsetIn),
                            card      = document.createElement('div');

                        card.className = 'collectionElement chapterElement quizResultRow';
                        card.setAttribute('data-start', row.start);
                        card.setAttribute('data-end', row.end);
                        if (row.key) { card.setAttribute('data-key', row.key); }

                        if (proportional) {
                            card.style.width = 'calc(' + (100 * Math.max(0, row.end - row.start) / duration) + '% - var(--chapter-gap))';
                        }

                        var textElement = document.createElement('div');
                        textElement.className = 'chapterCardText';

                        var timeElement = document.createElement('div');
                        timeElement.className = 'chapterCardTime';
                        timeElement.textContent = timeLabel;
                        textElement.appendChild(timeElement);

                        var titleElement = document.createElement('div');
                        titleElement.className = 'chapterCardTitle';
                        // textContent, not innerHTML: titles and questions are user input
                        titleElement.textContent = row.title;
                        if (row.placeholder) { titleElement.classList.add('placeholder'); }
                        textElement.appendChild(titleElement);

                        // A question's state in words, where there is room for it (CSS: large)
                        if (row.key) {
                            var stateElement = document.createElement('div');
                            stateElement.className = 'quizResultStateText';
                            textElement.appendChild(stateElement);
                        }

                        card.appendChild(textElement);

                        var dots = document.createElement('div');
                        dots.className = 'quizDots';

                        row.questions.forEach(function(question) {

                            var item = document.createElement('span'),
                                dot  = document.createElement('span');

                            item.className = 'quizDotItem';
                            dot.setAttribute('data-key', question.key);
                            self._setQuizDotState(dot, 'open');
                            item.appendChild(dot);

                            if (byChapters) {
                                // Among a chapter's questions, each dot is its own question: it jumps there, says which
                                // one it is (a tooltip), and where there is room (CSS: large) has its text beside it.
                                dot._ftQuestion = question.question;
                                var label = document.createElement('span');
                                label.className = 'quizDotLabel';
                                label.textContent = question.question;
                                item.appendChild(label);
                                item.addEventListener('click', function(evt) {
                                    evt.stopPropagation();
                                    FrameTrail.module('HypervideoController').currentTime = question.start;
                                });
                            }

                            dots.appendChild(item);

                        });

                        card.appendChild(dots);

                        if (tooltipAttribute) {
                            card.setAttribute(tooltipAttribute, timeLabel + '  ' + row.title);
                            card.setAttribute('data-tooltip-variant', 'resourceTitle');
                        }

                        card.addEventListener('click', function() {
                            FrameTrail.module('HypervideoController').currentTime = row.start;
                        });

                        container.appendChild(card);

                    });

                    // The summary: beside the rows (or below them) in the view, outside the part that scrolls,
                    // so that in a horizontal strip the rows' shares are shares of what the summary leaves, it
                    // stays in view, and rows never pass under it (the view is a grid, ContentView/style.css).
                    var summary = document.createElement('div');
                    summary.className = 'quizResultsSummary';

                    if (self.contentViewData.showQuizScore !== false) {
                        var score = document.createElement('div');
                        score.className = 'quizResultsScore';
                        score.innerHTML = '<span class="quizResultsScoreValue"></span> <span class="quizResultsScoreText"></span>';
                        summary.appendChild(score);
                    }

                    if (self.contentViewData.showQuizLegend !== false) {
                        var legend = document.createElement('div');
                        legend.className = 'quizResultsLegend';
                        var legendStates = ['right', 'retried', 'wrong'];
                        // "answered" only where a question has no right answer to tell
                        if (questions.some(function(question) { return !question.gradable; })) { legendStates.push('answered'); }
                        legendStates.forEach(function(state) {
                            var entry = document.createElement('span');
                            entry.className = 'quizResultsLegendEntry';
                            var dot = document.createElement('span');
                            self._setQuizDotState(dot, state);
                            entry.appendChild(dot);
                            entry.appendChild(document.createTextNode(' ' + self.labels['QuizResultsLegend' + state.charAt(0).toUpperCase() + state.slice(1)]));
                            legend.appendChild(entry);
                        });
                        summary.appendChild(legend);
                    }

                    // Starting again is the player's to do: a phone only shows the results
                    if (self.contentViewData.showQuizRestart === true && !FrameTrail.getState('companion')) {
                        var restart = document.createElement('button');
                        restart.type = 'button';
                        restart.className = 'quizResultsRestart';
                        restart.innerHTML = '<span class="icon-ccw"></span><span class="quizResultsRestartLabel"></span>';
                        restart.querySelector('.quizResultsRestartLabel').textContent = self.labels['QuizResultsRestart'];
                        restart.setAttribute('data-tooltip-top', self.labels['QuizResultsRestart']);
                        restart.addEventListener('click', function(evt) {
                            evt.stopPropagation();
                            var controller = FrameTrail.module('QuizController');
                            if (controller) { controller.restart(); }
                        });
                        summary.appendChild(restart);
                    }

                    if (summary.firstChild) {
                        self.contentViewContainer.appendChild(summary);
                    }

                    self.updateQuizResultStates();

                    // The row the playhead is in (a view made before the video is there has none yet)
                    var now;
                    try { now = Controller.currentTime; } catch (e) { now = undefined; }
                    if (typeof now === 'number' && isFinite(now)) {
                        self.updateTimedStateOfContentViews(now);
                    }

                    self.fitLayoutArea();

                },


                /**
                 * I give a dot of a Quiz Results view the look of a question's state: an icon of the icon
                 * font, whose circle is part of the glyph (so the mark sits in its middle at every size).
                 * A full circle with a check is right at the first try, an outlined one right after a
                 * replay, an outlined cross not right yet, an empty circle open, a circle with a dot
                 * answered where there is no right answer to tell. The colours are the stylesheet's.
                 *
                 * @method _setQuizDotState
                 * @private
                 * @param {HTMLElement} dot
                 * @param {String} state one of FrameTrailQuiz.RESULT_STATES
                 */
                _setQuizDotState: function(dot, state) {
                    var icons = {
                        open:     'icon-circle-empty',
                        right:    'icon-ok-circled',
                        retried:  'icon-ok-circled2',
                        wrong:    'icon-cancel-circled2',
                        answered: 'icon-dot-circled'
                    };
                    dot.className = 'quizDot ' + (icons[state] || icons.open);
                    dot.setAttribute('data-state', state);
                },


                /**
                 * I write what was answered into a rendered Quiz Results view: the state of every dot
                 * and question row, and the score. Called for every result (ViewLayout.updateQuizResultViews).
                 *
                 * @method updateQuizResultStates
                 */
                updateQuizResultStates: function() {

                    var self = this;

                    if (self.contentViewData.type !== 'QuizResults' || !self.contentViewContainer) { return; }

                    var QuizController = FrameTrail.module('QuizController'),
                        Quiz           = window.FrameTrailQuiz,
                        container      = self.contentViewContainer.querySelector('.quizResultsContainer');

                    if (!container || !QuizController) { return; }

                    var states    = QuizController.results(),
                        questions = QuizController.questions();

                    function stateOf(key) {
                        var state = Object.prototype.hasOwnProperty.call(states, key) ? states[key] : 'open';
                        return (Quiz.RESULT_STATES.indexOf(state) >= 0) ? state : 'open';
                    }

                    function stateLabel(state) {
                        return self.labels['QuizResultsState' + state.charAt(0).toUpperCase() + state.slice(1)];
                    }

                    container.querySelectorAll('.quizDot[data-key]').forEach(function(dot) {
                        var state = stateOf(dot.getAttribute('data-key'));
                        self._setQuizDotState(dot, state);
                        // Among a chapter's dots, each says which question it is
                        if (dot._ftQuestion !== undefined) {
                            dot.setAttribute('data-tooltip-top', (dot._ftQuestion ? dot._ftQuestion + ' · ' : '') + stateLabel(state));
                        }
                    });

                    container.querySelectorAll('.quizResultRow[data-key]').forEach(function(row) {
                        var state     = stateOf(row.getAttribute('data-key')),
                            stateText = row.querySelector('.quizResultStateText');
                        row.setAttribute('data-state', state);
                        if (stateText) { stateText.textContent = stateLabel(state); }
                    });

                    // The score counts the questions that have a right answer; without any, the questions answered.
                    var value = self.contentViewContainer.querySelector('.quizResultsScoreValue'),
                        text  = self.contentViewContainer.querySelector('.quizResultsScoreText');

                    if (value && text) {
                        var score  = Quiz.score(questions, states),
                            graded = score.gradable > 0,
                            count  = graded ? score.right : score.done,
                            total  = graded ? score.gradable : score.total,
                            words  = self.labels[graded ? 'QuizResultsRightFirstTry' : 'QuizResultsAnswered'];
                        value.textContent = self.labels['QuizResultsScoreOf'].replace('%s', count).replace('%s', total);
                        text.textContent  = words;
                        // Where only the number fits, the sentence is its tooltip
                        value.parentElement.setAttribute('data-tooltip-top', value.textContent + ' ' + words);
                    }

                },


                /**
                 * I point an element's background at one tile of the scrub sprite —
                 * the frame closest to the given absolute time.
                 *
                 * The sprite holds `count` frames in a `columns` x `rows` grid, spread
                 * evenly across the whole video. I position by percentage rather than
                 * by pixel (as the scrub preview does, which is a fixed 160x90 box), so
                 * one rule works at every card size.
                 *
                 * @method _applyScrubSpriteTile
                 * @private
                 * @param {HTMLElement} element
                 * @param {Object} sprite - { url, columns, rows, count } from HypervideoController.getScrubSprite()
                 * @param {Number} absoluteTime
                 */
                _applyScrubSpriteTile: function(element, sprite, absoluteTime) {

                    var HypervideoModel = FrameTrail.module('HypervideoModel'),
                        duration        = HypervideoModel.duration,
                        ratio           = (duration > 0)
                                            ? (absoluteTime - HypervideoModel.offsetIn) / duration
                                            : 0;

                    ratio = Math.max(0, Math.min(1, ratio));

                    var tileIndex = Math.min(sprite.count - 1, Math.floor(ratio * sprite.count)),
                        column    = tileIndex % sprite.columns,
                        row       = Math.floor(tileIndex / sprite.columns);

                    element.style.backgroundImage    = 'url("' + sprite.url + '")';
                    element.style.backgroundSize     = (sprite.columns * 100) + '% ' + (sprite.rows * 100) + '%';
                    element.style.backgroundPosition = (column * 100 / (sprite.columns - 1)) + '% '
                                                     + (row * 100 / (sprite.rows - 1)) + '%';

                },


                /**
                 * I distribute the Collection Elements in the contentViewContainer, so that they
                 * match closely to the position of their related timelineElements.
                 * When they would start to overlap, I arrange them in groups.
                 *
                 * @method distributeElements
                 */
                distributeElements: function() {

                    if ( this.isVerticalArea() ) {
                        return;
                    }

                    var self = this,
                        contentGroups    = self.contentGroups || [],
                        videoDuration    = FrameTrail.module('HypervideoModel').duration,
                        offsetIn         = FrameTrail.module('HypervideoModel').offsetIn,
                        scrollContainer  = self.contentViewContainer.querySelector('.contentViewScroll'),
                        containerElement = self.contentViewContainer.querySelector('.contentViewContents'),
                        containerWidth   = scrollContainer.offsetWidth,
                        strip            = self.isStrip(),
                        gap              = strip ? self.ringGap() : 4,
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
                    for (var i = 0; i < contentGroups.length; i++) {
                        var contentGroup = contentGroups[i];
                        var el = self.getContentViewElementFromContentItem(contentGroup.representative);
                        if (!el) { continue; }
                        // A merged element spans from the first constituent's start to the
                        // latest end (constituents may overlap/nest, so take the max)
                        var groupEndTime = contentGroup.items[0].data.end;
                        for (var j = 1; j < contentGroup.items.length; j++) {
                            if (contentGroup.items[j].data.end > groupEndTime) {
                                groupEndTime = contentGroup.items[j].data.end;
                            }
                        }
                        items.push({
                            el:        el,
                            width:     el.offsetWidth,
                            startTime: contentGroup.items[0].data.start,
                            endTime:   groupEndTime
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

                    // The circular area's strip is inset by its gap already (FrameTrailRingLayout.strip).
                    var rightBoundary = containerWidth - (strip ? 0 : 2 * gap);

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
                 * I lay out the ring around the video for a space of width × height and a video of the aspect ratio
                 * (width / height): FrameTrailRingLayout's slots for my thumbnails (contentGroups) with my gap (ringGap),
                 * or the strip below the video where the player is narrow or they do not fit around it. I keep the
                 * result (layoutRing places the thumbnails by it), mark my area .ring or .strip, give it the cell width
                 * and the gap as --circular-cell-width and --circular-gap, and return it, with mode 'ring' or 'strip';
                 * null when there is no room.
                 *
                 * @method computeRingGeometry
                 * @param {Number} width
                 * @param {Number} height
                 * @param {Number} aspect
                 * @param {Boolean} narrow
                 * @return {Object|null}
                 */
                computeRingGeometry: function(width, height, aspect, narrow) {

                    var Ring     = window.FrameTrailRingLayout,
                        count    = this.contentGroups.length,
                        size     = (this.contentViewData.contentSize == 'small') ? 'small' : 'medium',
                        options  = { width: width, height: height, aspect: aspect, count: count, size: size, gap: this.ringGap() },
                        geometry = (narrow || !(width > 0) || !(height > 0)) ? null : Ring.layout(options),
                        mode     = geometry ? 'ring' : 'strip';

                    if (!geometry && width > 0 && height > 0) {
                        geometry = Ring.strip(options);
                    }
                    if (!geometry || !(geometry.video.h > 0)) {
                        this.clearRingGeometry();
                        return null;
                    }

                    if (!this.ringGeometry || this.ringGeometry.mode != mode) {
                        this._resetRingPositions();
                    }

                    geometry.mode  = mode;
                    geometry.count = count;
                    geometry.size  = size;
                    this.ringGeometry = geometry;

                    var container = this.getLayoutAreaContainer();
                    container.classList.toggle('ring', mode == 'ring');
                    container.classList.toggle('strip', mode == 'strip');
                    container.style.setProperty('--circular-cell-width', geometry.cell.w + 'px');
                    container.style.setProperty('--circular-gap', geometry.gap + 'px');

                    this._updateRingTitles(size == 'small' || geometry.cell.w < 120);

                    return geometry;

                },


                /**
                 * I forget the ring's layout (computeRingGeometry), when it is not shown: its thumbnails go back
                 * into the flow, and my area is neither ring nor strip.
                 *
                 * @method clearRingGeometry
                 */
                clearRingGeometry: function() {

                    if (!this.ringGeometry) { return; }

                    this.ringGeometry = null;
                    this._resetRingPositions();
                    this.getLayoutAreaContainer().classList.remove('ring', 'strip');

                },


                /**
                 * I place my thumbnails into the slots of the ring around the video (computeRingGeometry), which start
                 * left of the video's bottom row and run clockwise. With one ring, each sits closest to its time (the
                 * mid time of its group, as in distributeElements), a crowd centred on its time and, in doubt, earlier
                 * (FrameTrailRingLayout.placeByTime); with several, they fill the spiral in order, so the inner ring is
                 * always full. When the slots were laid out for another number, size or gap of thumbnails, I have the
                 * video adjusted first, which lays out the ring again and comes back here.
                 *
                 * @method layoutRing
                 */
                layoutRing: function() {

                    var self     = this,
                        geometry = self.ringGeometry,
                        groups   = self.contentGroups || [],
                        size     = (self.contentViewData.contentSize == 'small') ? 'small' : 'medium';

                    if (!geometry || geometry.mode != 'ring') { return; }

                    if (geometry.count != groups.length || geometry.size != size || geometry.gap != self.ringGap()) {
                        if (!self._ringRelayout) {
                            self._ringRelayout = true;
                            FrameTrail.module('ViewVideo').adjustHypervideo();
                            self._ringRelayout = false;
                        }
                        return;
                    }

                    var HypervideoModel = FrameTrail.module('HypervideoModel'),
                        offsetIn        = HypervideoModel.offsetIn || 0,
                        elements        = [],
                        times           = [];

                    groups.forEach(function(group) {
                        var element = self.getContentViewElementFromContentItem(group.representative);
                        if (!element) { return; }
                        var end = group.items[0].data.end;
                        group.items.forEach(function(item) {
                            if (item.data.end > end) { end = item.data.end; }
                        });
                        elements.push(element);
                        times.push((group.items[0].data.start + end) / 2 - offsetIn);
                    });

                    var slots = (geometry.rings > 1)
                        ? elements.map(function(element, i) { return i; })
                        : window.FrameTrailRingLayout.placeByTime(times, HypervideoModel.duration || 0, geometry.slots.length);
                    if (!slots) { return; }

                    elements.forEach(function(element, i) {
                        var slot = geometry.slots[slots[i]];
                        element.style.position = 'absolute';
                        element.style.left     = slot.x + 'px';
                        element.style.top      = slot.y + 'px';
                        element.style.width    = slot.w + 'px';
                        element.style.height   = slot.h + 'px';
                        element.setAttribute('data-slot', slots[i]);
                    });

                },


                // The ring (layoutRing) and the strip (distributeElements) each position the thumbnails inline: when
                // the one gives way to the other, they start from the flow again.
                _resetRingPositions: function() {
                    var contents = this.contentViewContainer.querySelector('.contentViewContents');
                    if (contents) { contents.style.width = ''; }
                    this._slides().forEach(function(element) {
                        ['position', 'left', 'top', 'width', 'height'].forEach(function(property) {
                            element.style[property] = '';
                        });
                        element.removeAttribute('data-slot');
                    });
                },


                // Thumbnails too small for their titles (.compact hides them) name themselves in a tooltip instead,
                // as in the small top and bottom areas.
                _updateRingTitles: function(compact) {
                    var self = this;
                    self.getLayoutAreaContainer().classList.toggle('compact', compact);
                    (self.contentGroups || []).forEach(function(group) {
                        var element = self.getContentViewElementFromContentItem(group.representative),
                            thumb   = element && element.querySelector('.resourceThumb');
                        if (!thumb) { return; }
                        var titleElement = thumb.querySelector('.resourceTitle'),
                            title = (titleElement && titleElement.textContent)
                                 || (group.representative.resourceItem.resourceData && group.representative.resourceItem.resourceData.name)
                                 || '';
                        if (compact && title) {
                            thumb.setAttribute('data-tooltip-top', title);
                            thumb.setAttribute('data-tooltip-variant', 'resourceTitle');
                        } else {
                            thumb.removeAttribute('data-tooltip-top');
                            thumb.removeAttribute('data-tooltip-variant');
                        }
                    });
                },


                // A change of my thumbnails can add or take away a ring, and with it change the room the video has:
                // the video is adjusted once in the next frame, which lays out the ring again.
                _scheduleRingLayout: function() {
                    var self = this;
                    if (self._ringFrame) { return; }
                    self._ringFrame = window.requestAnimationFrame(function() {
                        self._ringFrame = null;
                        var ViewVideo = FrameTrail.module('ViewVideo');
                        if (ViewVideo && FrameTrail.getState('viewMode') == 'video') {
                            ViewVideo.adjustHypervideo();
                        }
                    });
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
                        slideAxis    = self.isHorizontalArea() ? 'x' : 'y',
                        sliderParent = (details) ? self.contentViewDetailsContainer : self.contentViewContainer;

                    // The ring shows all its thumbnails at once: there is nothing to scroll.
                    if ( self.isCircularArea() && !self.isStrip() ) {
                        return;
                    }

                    if ( self.contentCollection.length == 0
                        || ( self.isVerticalArea() && self.contentViewData.contentSize == 'large')
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

                    // Find active groups (a group is active while any constituent is)
                    var activeGroups = [];
                    var activeGroupIndices = [];

                    var _groups = self.contentGroups || [];
                    for (var idx = 0; idx < _groups.length; idx++) {
                        if ( _groups[idx].activeItems.length > 0 ) {
                            activeGroups.push(_groups[idx]);
                            activeGroupIndices.push(idx);
                        }
                    }

                    if (activeGroups.length == 0) {
                        self._lastActiveGroupIndices = [];
                        return;
                    }

                    // Detect whether the active set changed at all
                    var prevActiveIndices = self._lastActiveGroupIndices || [];
                    var activeSetChanged = activeGroupIndices.length !== prevActiveIndices.length
                        || activeGroupIndices.some(function(idx, i) { return idx !== prevActiveIndices[i]; });
                    self._lastActiveGroupIndices = activeGroupIndices;

                    // Only scroll when the active set changes
                    if (!activeSetChanged) return;

                    // Compute scroll target from active elements
                    var firstEl = self.getContentViewElementFromContentItem(activeGroups[0].representative);
                    var lastEl = self.getContentViewElementFromContentItem(activeGroups[activeGroups.length - 1].representative);
                    if (!firstEl || !lastEl) return;

                    // On a narrow viewport only the first active element is centred,
                    // otherwise the whole active span is.
                    if (slideAxis == 'x' && FrameTrail.getState('viewSize')[0] < 768) {
                        lastEl = firstEl;
                    }

                    self._scrollRangeIntoCenter(firstEl, lastEl);

                },


                /**
                 * I smoothly centre the span between two elements inside my scroll
                 * container, along whichever axis my layout area scrolls in.
                 *
                 * Pass the same element twice to centre a single one.
                 *
                 * While the smooth scroll runs I set _isProgrammaticScroll, so the
                 * scroll listener in appendDOMElement does not mistake it for the
                 * user scrolling and suppress the next auto-scroll.
                 *
                 * @method _scrollRangeIntoCenter
                 * @private
                 * @param {HTMLElement} firstEl
                 * @param {HTMLElement} lastEl
                 */
                _scrollRangeIntoCenter: function(firstEl, lastEl) {

                    var self = this,
                        slideAxis = self.isHorizontalArea() ? 'x' : 'y',
                        scrollContainer = self.contentViewContainer.querySelector('.contentViewScroll');

                    if (!scrollContainer || !firstEl || !lastEl) { return; }

                    self._isProgrammaticScroll = true;

                    if (slideAxis == 'x') {
                        var rangeStart = firstEl.offsetLeft,
                            rangeEnd   = lastEl.offsetLeft + lastEl.offsetWidth,
                            target     = (rangeStart + rangeEnd) / 2 - scrollContainer.clientWidth / 2;
                        scrollContainer.scrollTo({ left: Math.max(0, target), behavior: 'smooth' });
                    } else {
                        var rangeTop    = firstEl.offsetTop,
                            rangeBottom = lastEl.offsetTop + lastEl.offsetHeight,
                            target      = (rangeTop + rangeBottom) / 2 - scrollContainer.clientHeight / 2;
                        scrollContainer.scrollTo({ top: Math.max(0, target), behavior: 'smooth' });
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
                 * I bring a cue of a transcript in a top or bottom area into view. The text is laid out in
                 * columns there, and what does not fit goes on in columns to the right: when the cue is not
                 * wholly in view, the strip scrolls so that the cue's column is the first one shown, which
                 * turns the pages as the playback goes on (and not at every cue).
                 *
                 * @method _showTranscriptColumn
                 * @private
                 * @param {HTMLElement} cueElement
                 */
                _showTranscriptColumn: function(cueElement) {

                    var self            = this,
                        scrollContainer = self.contentViewContainer.querySelector('.contentViewScroll'),
                        rects           = cueElement.getClientRects();

                    if (!scrollContainer || !rects.length) { return; }

                    var view  = scrollContainer.getBoundingClientRect(),
                        first = rects[0],
                        last  = rects[rects.length - 1];

                    if (first.left >= view.left && last.right <= view.right) { return; }

                    // Where the cue's column starts: the columns are equally wide, a gap apart, from the text's left edge
                    var textContainer = cueElement.parentElement,
                        style         = window.getComputedStyle(textContainer),
                        gap           = parseFloat(style.columnGap) || 0,
                        padding       = parseFloat(style.paddingLeft) || 0,
                        textLeft      = textContainer.getBoundingClientRect().left + padding,
                        textWidth     = textContainer.clientWidth - padding - (parseFloat(style.paddingRight) || 0),
                        count         = Math.max(1, Math.floor((textWidth + gap) / ((parseFloat(style.columnWidth) || textWidth) + gap))),
                        step          = (textWidth - (count - 1) * gap) / count + gap,
                        columnLeft    = textLeft + Math.floor((first.left - textLeft + 1) / step) * step;

                    self._isProgrammaticScroll = true;

                    scrollContainer.scrollTo({ left: Math.max(0, columnLeft - view.left + scrollContainer.scrollLeft - padding - 4), behavior: 'smooth' });

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
                            icon:      isNew ? 'icon-plus' : 'icon-pencil',
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
                                                description: labels['SidebarLayoutEditor'] + ' ' + labels['GenericType'],
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
                        editingUI = document.createElement('div'),
                        // The switches' texts are labels of their own, so they name their inputs to toggle them.
                        idPrefix = 'contentView-' + Math.random().toString(36).slice(2, 10),
                        // The ring around the video holds one collection of thumbnails: small or medium.
                        circular = self.isCircularArea();
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
                                    +'            <label for="'+ idPrefix +'-initClosed">'+ self.labels['SettingsStartCollapsed'] +':</label>'
                                    +'            <div class="checkboxRow"><label class="switch"><input type="checkbox" id="'+ idPrefix +'-initClosed" class="contentViewData" data-property="initClosed" '+ (contentViewData.initClosed ? 'checked' : '') +'><span class="slider round"></span></label></div>'
                                    +'        </div>'
                                    +'    </div>'
                                    +'    <hr>'
                                    +'    <div class="layoutRow">'
                                    +'        <div class="contentViewData optionCards column-6" data-property="type" data-value="'+ contentViewData.type +'">'
                                    +'            <label>'+ self.labels['GenericType'] +':</label>'
                                    +'            <div '+ (contentViewData.type == 'TimedContent' ? 'class="active"' : '') +' data-value="TimedContent">'+ self.labels['GenericAnnotationCollection'] +'</div>'
                                    + (circular ? '' :
                                     '            <div '+ (contentViewData.type == 'Transcript' ? 'class="active"' : '') +' data-value="Transcript">'+ self.labels['GenericTextTranscript'] +'</div>'
                                    +'            <div '+ (contentViewData.type == 'Chapters' ? 'class="active"' : '') +' data-value="Chapters">'+ self.labels['SettingsChapters'] +'</div>'
                                    +'            <div '+ (contentViewData.type == 'QuizResults' ? 'class="active"' : '') +' data-value="QuizResults">'+ self.labels['GenericQuizResults'] +'</div>'
                                    +'            <div '+ (contentViewData.type == 'Timelines' ? 'class="active"' : '') +' data-value="Timelines">'+ self.labels['GenericTimelines'] +'</div>'
                                    +'            <div '+ (contentViewData.type == 'CustomHTML' ? 'class="active"' : '') +' data-value="CustomHTML">'+ self.labels['GenericCustomHTML'] +'</div>')
                                    +'        </div>'
                                    +'        <div class="generic column-6">'
                                    +'            <div class="contentViewData optionCards" data-property="contentSize" data-value="'+ contentViewData.contentSize +'">'
                                    +'                <label>'+ self.labels['SettingsContentViewSize'] +':</label>'
                                    // A phone has no "small" (see the constructor).
                                    + ((self.whichArea == 'companion') ? '' : '                <div '+ (contentViewData.contentSize == 'small' ? 'class="active"' : '') +' data-value="small">'+ self.labels['SettingsContentViewSmall'] +'</div>')
                                    +'                <div '+ (contentViewData.contentSize == 'medium' ? 'class="active"' : '') +' data-value="medium">'+ self.labels['SettingsContentViewMedium'] +'</div>'
                                    + (circular ? '' : '                <div '+ (contentViewData.contentSize == 'large' ? 'class="active"' : '') +' data-value="large">'+ self.labels['SettingsContentViewLarge'] +'</div>')
                                    +'            </div>'
                                    + (circular ?
                                     '            <div class="layoutRow">'
                                    +'                <div class="column-4">'
                                    +'                    <label for="'+ idPrefix +'-ringGap">'+ self.labels['SettingsRingGap'] +':</label>'
                                    +'                    <input type="number" id="'+ idPrefix +'-ringGap" class="contentViewData" data-property="ringGap" min="0" max="100" step="1" value="'+ self.ringGap() +'">'
                                    +'                </div>'
                                    +'            </div>' : '')
                                    +'        </div>'
                                    +'    </div>'
                                    +'    <hr>'
                                    +'    <div class="typeSpecific '+ (contentViewData.type == 'TimedContent' ? 'active' : '') +'" data-type="TimedContent">'
                                    +'        <label>'+ self.labels['SettingsSelectContents'] +':</label>'
                                    +'        <div class="message active">'+ self.labels['MessageHintContentViewFilters'] +'</div>'
                                    +'        <div class="layoutRow">'
                                    +'            <div class="column-3">'
                                    +'                <label>'+ self.labels['SettingsFilterByTags'] +'</label>'
                                    +'                <div class="collectionFilterTags"></div>'
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
                                    +'                <label>'+ self.labels['SettingsFilterByTitle'] +'</label>'
                                    +'                <input type="text" class="contentViewData" data-property="collectionFilter-text" data-value="'+ contentViewData.collectionFilter.text +'" value="'+ contentViewData.collectionFilter.text +'" placeholder="('+ self.labels['GenericOptional'] +')">'
                                    +'            </div>'
                                    +'        </div>'
                                    +'        <div class="message active">'+ self.labels['SettingsItemsInCollection'] +': <span class="collectionCounter"></span></div>'
                                    +'        <hr>'
                                    // The labels of the items' tags above their titles: missing in the stored view while it is off (see getDataFromEditingUI)
                                    +'        <div class="layoutRow">'
                                    +'            <div class="column-12">'
                                    +'                <div class="checkboxRow">'
                                    +'                    <label class="switch" style="display: inline-block;"><input type="checkbox" id="'+ idPrefix +'-showTags" class="contentViewData" data-property="showTags" autocomplete="off" '+ (contentViewData.showTags === true ? 'checked' : '') +'><span class="slider round"></span></label>'
                                    +'                    <label for="'+ idPrefix +'-showTags">'+ self.labels['SettingsShowTags'] +'</label>'
                                    +'                </div>'
                                    +'            </div>'
                                    +'        </div>'
                                    +'        <hr>'
                                    // Open only while an annotation is active: missing in the stored view while it is off, as its gap is while it has its default (see getDataFromEditingUI). Not for a phone, which has no area to open.
                                    + ((self.whichArea == 'companion') ? '' :
                                     '        <div class="layoutRow">'
                                    +'            <div class="column-6">'
                                    +'                <div class="checkboxRow">'
                                    +'                    <label class="switch" style="display: inline-block;"><input type="checkbox" id="'+ idPrefix +'-openWhenActive" class="contentViewData" data-property="openWhenActive" autocomplete="off" '+ (contentViewData.openWhenActive === true ? 'checked' : '') +'><span class="slider round"></span></label>'
                                    +'                    <label for="'+ idPrefix +'-openWhenActive">'+ self.labels['SettingsOpenWhenActive'] +'</label>'
                                    +'                </div>'
                                    +'            </div>'
                                    +'            <div class="column-6">'
                                    +'                <label for="'+ idPrefix +'-openGap">'+ self.labels['SettingsOpenGap'] +':</label>'
                                    +'                <input type="number" id="'+ idPrefix +'-openGap" class="contentViewData" data-property="openGap" min="0" max="'+ window.FrameTrailAreaOpening.MAX_GAP +'" step="0.5" value="'+ window.FrameTrailAreaOpening.gapOf(contentViewData.openGap) +'">'
                                    +'            </div>'
                                    +'        </div>'
                                    +'        <div class="message active">'+ self.labels['MessageHintOpenWhenActive'] +'</div>'
                                    +'        <hr>')
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
                                    +'        <div class="message active transcriptsHintMessage"><span class="transcriptsHintText"></span> <button type="button" class="transcriptsEditButton"><span class="icon-doc-text"></span> '+ self.labels['TranscriptsEdit'] +'</button></div>'
                                    +'        <div class="custom-select"><select class="contentViewData" data-property="transcriptSource" aria-label="'+ self.labels['SettingsTranscriptSource'] +'"></select></div>'
                                    +'        <div class="checkboxRow">'
                                    +'            <label class="switch" style="display: inline-block;">'
                                    +'                <input type="checkbox" id="'+ idPrefix +'-showTranscriptSearch" class="contentViewData" data-property="showTranscriptSearch" autocomplete="off" '+ (contentViewData.showTranscriptSearch ? 'checked' : '') +'>'
                                    +'                <span class="slider round"></span>'
                                    +'            </label>'
                                    +'            <label for="'+ idPrefix +'-showTranscriptSearch">'+ self.labels['SettingsTranscriptSearch'] +'</label>'
                                    +'        </div>'
                                    +'    </div>'
                                    +'    <div class="typeSpecific '+ (contentViewData.type == 'Timelines' ? 'active' : '') +'" data-type="Timelines">'
                                    +'    </div>'
                                    +'    <div class="typeSpecific '+ (contentViewData.type == 'Chapters' ? 'active' : '') +'" data-type="Chapters">'
                                    +'        <div class="message active chaptersHintMessage"></div>'
                                    // Its settings are missing in the stored view while they have their default (cards, time shown),
                                    // see getDataFromEditingUI.
                                    +'        <div class="layoutRow">'
                                    +'            <div class="column-4">'
                                    +'                <label for="'+ idPrefix +'-chapterStyle">'+ self.labels['SettingsChapterStyle'] +':</label>'
                                    +'                <div class="custom-select"><select id="'+ idPrefix +'-chapterStyle" class="contentViewData" data-property="chapterStyle">'
                                    +'                    <option value="cards" '+ (contentViewData.chapterStyle !== 'steps' ? 'selected' : '') +'>'+ self.labels['SettingsChapterStyleCards'] +'</option>'
                                    +'                    <option value="steps" '+ (contentViewData.chapterStyle === 'steps' ? 'selected' : '') +'>'+ self.labels['SettingsChapterStyleSteps'] +'</option>'
                                    +'                </select></div>'
                                    +'            </div>'
                                    +'            <div class="column-4">'
                                    +'                <div class="checkboxRow">'
                                    +'                    <label class="switch" style="display: inline-block;"><input type="checkbox" id="'+ idPrefix +'-showChapterTime" class="contentViewData" data-property="showChapterTime" autocomplete="off" '+ (contentViewData.showChapterTime !== false ? 'checked' : '') +'><span class="slider round"></span></label>'
                                    +'                    <label for="'+ idPrefix +'-showChapterTime">'+ self.labels['SettingsChapterShowTime'] +'</label>'
                                    +'                </div>'
                                    +'            </div>'
                                    +'        </div>'
                                    +'    </div>'
                                    // Quiz Results: its settings are missing in the stored view while they have their default
                                    // (rows by chapters, score and legend shown, the others off), see getDataFromEditingUI.
                                    +'    <div class="typeSpecific '+ (contentViewData.type == 'QuizResults' ? 'active' : '') +'" data-type="QuizResults">'
                                    +'        <div class="message active quizResultsHintMessage"></div>'
                                    +'        <div class="layoutRow">'
                                    +'            <div class="column-4">'
                                    +'                <label for="'+ idPrefix +'-quizRows">'+ self.labels['SettingsQuizRows'] +':</label>'
                                    +'                <div class="custom-select"><select id="'+ idPrefix +'-quizRows" class="contentViewData" data-property="quizRows">'
                                    +'                    <option value="chapters" '+ (contentViewData.quizRows !== 'questions' ? 'selected' : '') +'>'+ self.labels['SettingsQuizRowsChapters'] +'</option>'
                                    +'                    <option value="questions" '+ (contentViewData.quizRows === 'questions' ? 'selected' : '') +'>'+ self.labels['SettingsQuizRowsQuestions'] +'</option>'
                                    +'                </select></div>'
                                    +'            </div>'
                                    +'            <div class="column-4">'
                                    +'                <div class="checkboxRow">'
                                    +'                    <label class="switch" style="display: inline-block;"><input type="checkbox" id="'+ idPrefix +'-showQuizScore" class="contentViewData" data-property="showQuizScore" autocomplete="off" '+ (contentViewData.showQuizScore !== false ? 'checked' : '') +'><span class="slider round"></span></label>'
                                    +'                    <label for="'+ idPrefix +'-showQuizScore">'+ self.labels['SettingsQuizShowScore'] +'</label>'
                                    +'                </div>'
                                    +'                <div class="checkboxRow">'
                                    +'                    <label class="switch" style="display: inline-block;"><input type="checkbox" id="'+ idPrefix +'-showQuizLegend" class="contentViewData" data-property="showQuizLegend" autocomplete="off" '+ (contentViewData.showQuizLegend !== false ? 'checked' : '') +'><span class="slider round"></span></label>'
                                    +'                    <label for="'+ idPrefix +'-showQuizLegend">'+ self.labels['SettingsQuizShowLegend'] +'</label>'
                                    +'                </div>'
                                    +'            </div>'
                                    +'            <div class="column-4">'
                                    +'                <div class="checkboxRow">'
                                    +'                    <label class="switch" style="display: inline-block;"><input type="checkbox" id="'+ idPrefix +'-showQuizRestart" class="contentViewData" data-property="showQuizRestart" autocomplete="off" '+ (contentViewData.showQuizRestart === true ? 'checked' : '') +'><span class="slider round"></span></label>'
                                    +'                    <label for="'+ idPrefix +'-showQuizRestart">'+ self.labels['SettingsQuizShowRestart'] +'</label>'
                                    +'                </div>'
                                    +'                <div class="checkboxRow">'
                                    +'                    <label class="switch" style="display: inline-block;"><input type="checkbox" id="'+ idPrefix +'-rememberQuizResults" class="contentViewData" data-property="rememberQuizResults" autocomplete="off" '+ (contentViewData.rememberQuizResults === true ? 'checked' : '') +'><span class="slider round"></span></label>'
                                    +'                    <label for="'+ idPrefix +'-rememberQuizResults">'+ self.labels['SettingsQuizRemember'] +'</label>'
                                    +'                </div>'
                                    +'            </div>'
                                    +'        </div>'
                                    +'        <div class="message active">'+ self.labels['MessageHintQuizRemember'] +'</div>'
                                    +'    </div>';

                    // An area that is open only while an annotation is active starts as its annotations say, so "Start collapsed" has no say then and is not offered (it keeps its value); the gap only counts with the option.
                    (function() {
                        var openSwitch = editingUI.querySelector('.contentViewData[data-property="openWhenActive"]'),
                            gapField   = editingUI.querySelector('.contentViewData[data-property="openGap"]'),
                            initClosed = editingUI.querySelector('.contentViewData[data-property="initClosed"]'),
                            typeCards  = editingUI.querySelector('.contentViewData[data-property="type"]');
                        if (!openSwitch) { return; }
                        function syncOpenWhenActive() {
                            var opens = openSwitch.checked && typeCards.getAttribute('data-value') == 'TimedContent';
                            gapField.disabled = !openSwitch.checked;
                            initClosed.closest('.generic').style.visibility = opens ? 'hidden' : '';
                        }
                        openSwitch.addEventListener('change', syncOpenWhenActive);
                        // After the type's own handler, which is on the cards
                        typeCards.addEventListener('click', syncOpenWhenActive);
                        syncOpenWhenActive();
                    })();

                    // What a Quiz Results view lists, and the one thing that leaves it blank: no question.
                    (function() {
                        var quizHint = editingUI.querySelector('.quizResultsHintMessage');
                        if (!quizHint) { return; }
                        var controller = FrameTrail.module('QuizController'),
                            count      = controller ? controller.questions().length : 0;
                        quizHint.textContent = (count === 0)
                            ? self.labels['MessageHintNoQuizzes']
                            : self.labels['MessageHintQuizResults'];
                    })();

                    // Chapters have no settings of their own — the panel only says where
                    // chapters are actually edited, and points out an empty chapter list,
                    // which is the one thing that would make this ContentView render blank.
                    (function() {
                        var chaptersHint = editingUI.querySelector('.chaptersHintMessage');
                        if (!chaptersHint) { return; }
                        var numberOfChapters = (FrameTrail.module('HypervideoModel').chapters || []).length;
                        chaptersHint.textContent = (numberOfChapters === 0)
                            ? self.labels['MessageHintNoChapters']
                            : self.labels['MessageHintChaptersEditor'];
                    })();

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
                        thumbWrapper.className = 'contentViewOptionThumb optionCardThumb';
                        thumbWrapper.appendChild(_generateSchematic(thatType, 'medium', circular ? 'ring' : 'x', false, 3));
                        var labelSpan = document.createElement('span');
                        labelSpan.textContent = optionEl.textContent;
                        optionEl.innerHTML = '';
                        optionEl.appendChild(thumbWrapper);
                        optionEl.appendChild(labelSpan);
                    });

                    function refreshSizeThumbs(type) {
                        // A Chapters view's sizes are drawn as it is displayed: cards or steps
                        var variant   = editingUI.querySelector('.contentViewData[data-property="chapterStyle"]').value,
                            sizeCards = editingUI.querySelector('.contentViewData[data-property="contentSize"]');
                        sizeCards.querySelectorAll(':scope > div[data-value]').forEach(function(optionEl) {
                            var thatSize = optionEl.getAttribute('data-value'),
                                axis = circular ? 'ring' : (self.isHorizontalArea(thatSize, type) ? 'x' : 'y'),
                                offered = self.offersSize(thatSize, type, variant);
                            // A size the type does not have here is not offered; was it chosen, medium is
                            optionEl.style.display = offered ? '' : 'none';
                            if (!offered && optionEl.classList.contains('active')) {
                                optionEl.classList.remove('active');
                                sizeCards.querySelector(':scope > div[data-value="medium"]').classList.add('active');
                                sizeCards.setAttribute('data-value', 'medium');
                            }
                            var existingThumb = optionEl.querySelector('.contentViewOptionThumb');
                            if (existingThumb) {
                                existingThumb.innerHTML = '';
                                existingThumb.appendChild(_generateSchematic(type, thatSize, axis, true, undefined, variant));
                            } else {
                                var thumbWrapper = document.createElement('div');
                                thumbWrapper.className = 'contentViewOptionThumb optionCardThumb';
                                thumbWrapper.appendChild(_generateSchematic(type, thatSize, axis, true, undefined, variant));
                                var labelSpan = document.createElement('span');
                                labelSpan.textContent = optionEl.textContent;
                                optionEl.innerHTML = '';
                                optionEl.appendChild(thumbWrapper);
                                optionEl.appendChild(labelSpan);
                            }
                        });
                    }
                    refreshSizeThumbs(contentViewData.type);

                    editingUI.querySelector('.contentViewData[data-property="chapterStyle"]').addEventListener('change', function() {
                        refreshSizeThumbs(editingUI.querySelector('.contentViewData[data-property="type"]').getAttribute('data-value'));
                    });

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

                    // Transcripts are made in the transcripts edit mode; this view only chooses one.
                    (function() {
                        var subtitleFiles = FrameTrail.module('Database').hypervideo.subtitles || [];
                        editingUI.querySelector('.transcriptsHintText').textContent = subtitleFiles.length
                            ? self.labels['MessageHintTranscriptsEditor']
                            : self.labels['MessageHintNoTranscripts'];
                        editingUI.querySelector('.transcriptsEditButton').addEventListener('click', function() {
                            var dialog      = editingUI.closest('dialog'),
                                closeButton = dialog && dialog.querySelector('.ft-dialog-titlebar-close');
                            if (closeButton) { closeButton.click(); }
                            FrameTrail.changeState('editMode', 'transcripts');
                        });
                    })();

                    // One of the hypervideo's transcripts is always chosen: the view's own, else the first one.
                    // Without any there is nothing to choose; the view then shows the first one that is made.
                    (function() {
                        var select       = editingUI.querySelector('.contentViewData[data-property="transcriptSource"]'),
                            Localization = FrameTrail.module('Localization'),
                            shown        = FrameTrail.module('HypervideoModel').transcriptLanguage(contentViewData.transcriptSource),
                            languages    = (FrameTrail.module('Database').hypervideo.subtitles || []).map(function(file) { return file.srclang; });

                        if (!languages.length) {
                            var none = document.createElement('option');
                            none.value = '';
                            none.textContent = self.labels['SettingsTranscriptSourceNone'];
                            select.appendChild(none);
                            select.disabled = true;
                            return;
                        }

                        languages.forEach(function(code) {
                            var option  = document.createElement('option'),
                                name    = Localization.languageName(code);
                            option.value       = code;
                            option.textContent = (name === code) ? code : name + ' (' + code + ')';
                            option.selected    = (code === shown);
                            select.appendChild(option);
                        });
                    })();

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

                        // So a caller that changes the underlying definitions —
                        // the Manage Tags dialog — can redraw this section.
                        return { refresh: updateExisting };
                    }

                    // Tag Filter UI: the shared picker, which can also make a new tag.
                    if (FrameTrail.module('TagPicker')) {
                        var tagFilterPicker = FrameTrail.module('TagPicker').create({
                            selected: tagFilters,
                            onAdd: function(id) {
                                if (tagFilters.indexOf(id) === -1) { tagFilters.push(id); }
                                updateCollectionFilterValues();
                            },
                            onRemove: function(id) {
                                var at = tagFilters.indexOf(id);
                                if (at !== -1) { tagFilters.splice(at, 1); }
                                updateCollectionFilterValues();
                            }
                        });
                        editingUI.querySelector('.collectionFilterTags').appendChild(tagFilterPicker.element);
                    }

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
                        } else if ( el.tagName === 'INPUT' && el.type === 'number' ) {
                            var number = Number(el.value);
                            newValue = (el.value === '' || isNaN(number)) ? undefined
                                     : Math.min(Number(el.max || Infinity), Math.max(Number(el.min || -Infinity), number));
                        } else if ( el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' ) {
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

                    // The transcript chooser always has a language selected; only a Transcript view takes it.
                    if ( newDataObject.type !== 'Transcript' ) {
                        newDataObject.transcriptSource = this.contentViewData.transcriptSource || '';
                    }

                    // The Quiz Results panel always has its fields; only a Quiz Results view takes them, and of
                    // those only what differs from the default (a stored view names a setting once it was changed;
                    // one that was written before stays written). Other views keep what they had, untouched.
                    // The same goes for the Chapters panel's fields and a Chapters view, and for a collection's "show tags".
                    var typeDefaults = {
                            QuizResults:  { quizRows: 'chapters', showQuizScore: true, showQuizLegend: true, showQuizRestart: false, rememberQuizResults: false },
                            Chapters:     { chapterStyle: 'cards', showChapterTime: true },
                            TimedContent: { showTags: false }
                        },
                        oldData      = this.contentViewData;

                    Object.keys(typeDefaults).forEach(function(type) {
                        var defaults = typeDefaults[type];
                        Object.keys(defaults).forEach(function(key) {
                            var had = Object.prototype.hasOwnProperty.call(oldData, key);
                            if ( newDataObject.type !== type ) {
                                if (had) { newDataObject[key] = oldData[key]; } else { delete newDataObject[key]; }
                            } else if ( newDataObject[key] === defaults[key] && !had ) {
                                delete newDataObject[key];
                            }
                        });
                    });

                    // The same goes for a collection's "open only while an annotation is active" and its gap: written once the option is on (or was stored before), the gap once it differs from the default. A phone's view is not offered them and keeps what it had.
                    var openOffered = !!editingUIContainer.querySelector('.contentViewData[data-property="openWhenActive"]'),
                        hadOpen     = Object.prototype.hasOwnProperty.call(oldData, 'openWhenActive'),
                        hadGap      = Object.prototype.hasOwnProperty.call(oldData, 'openGap');

                    if ( newDataObject.type !== 'TimedContent' || !openOffered ) {
                        if (hadOpen) { newDataObject.openWhenActive = oldData.openWhenActive; } else { delete newDataObject.openWhenActive; }
                        if (hadGap)  { newDataObject.openGap = oldData.openGap; } else { delete newDataObject.openGap; }
                    } else {
                        if ( newDataObject.openWhenActive !== true && !hadOpen ) {
                            delete newDataObject.openWhenActive;
                        }
                        if ( newDataObject.openGap === undefined
                             || (!hadGap && (newDataObject.openWhenActive !== true || newDataObject.openGap === window.FrameTrailAreaOpening.DEFAULT_GAP)) ) {
                            delete newDataObject.openGap;
                        }
                    }

                    // A size the type does not have in my area (see offersSize)
                    this.normalizeSize(newDataObject);

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
