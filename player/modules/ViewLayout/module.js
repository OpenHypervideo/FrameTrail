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
		
		HypervideoLayoutContainer.empty();

		var database   = FrameTrail.module('Database'),
			hypervideo = database.hypervideo,
			thisID     = FrameTrail.module('RouteNavigation').hypervideoID;

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
						+  '        <div class="settingsContainer">'
						+  '            <div class="settingsEditingTabs">'
						+  '                <ul>'
						+  '                    <li>'
						+  '                        <a href="#ChangeSettings">'+ labels['SettingsHypervideoSettings'] +'</a>'
						+  '                    </li>'
						+  '                    <li class="ui-tabs-right">'
						+  '                        <a href="#Configuration">'+ labels['SettingsConfigurationOptions'] +'</a>'
						+  '                    </li>'
						+  '                    <li class="ui-tabs-right">'
						+  '                        <a href="#TagDefinitions">'+ labels['SettingsManageTags'] +'</a>'
						+  '                    </li>'
						+  '                    <li class="ui-tabs-right">'
						+  '                        <a href="#ChangeGlobalCSS">'+ labels['SettingsGlobalCSS'] +'</a>'
						+  '                    </li>'
						+  '                    <li class="ui-tabs-right">'
						+  '                        <a href="#ChangeTheme">'+ labels['SettingsColorTheme'] +'</a>'
						+  '                    </li>'
						+  '                    <li class="ui-tabs-right tab-label">'+ labels['GenericAdministration'] +': </li>'
						+  '                </ul>'
						+  '                <div id="ChangeSettings"></div>'
						+  '                <div id="Configuration"></div>'
						+  '                <div id="ChangeTheme"></div>'
						+  '                <div id="ChangeGlobalCSS"></div>'
						+  '                <div id="TagDefinitions">'
						+  '                    <div class="message active">'+ labels['MessageManageTags'] +'</div>'
						+  '                </div>'
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
		SettingsEditingTabs  = domElement.find('.settingsEditingTabs'),
		LayoutManagerOptions = domElement.find('.layoutManagerOptions'),
		self = this;

		SettingsEditingTabs.tabs({
			activate: function(event, ui) {
				if (ui.newPanel.find('.CodeMirror').length != 0) {
					ui.newPanel.find('.CodeMirror')[0].CodeMirror.refresh();
				}
			}
		});

		HypervideoLayoutContainer.append(domElement);

		if (FrameTrail.module('UserManagement').userRole != 'admin') {
			SettingsEditingTabs.find('.ui-tabs-right').not('.tab-label').addClass('admin-only');
		}



		/* Edit Hypervideo Form */


		var EditHypervideoForm = $('<form method="POST" class="editHypervideoForm">'
								  +'    <div class="message saveReminder">'+ labels['MessageSubtitlesSaveReminder'] +'</div>'
								  +'    <div class="formColumn column1">'
								  +'        <label for="name">'+ labels['SettingsHypervideoName'] +'</label>'
								  +'        <input type="text" name="name" placeholder="'+ labels['SettingsHypervideoName'] +'" value="'+ hypervideo.name +'"><br>'
								  +'        <input type="checkbox" name="hidden" id="hypervideo_hidden" value="hidden" '+((hypervideo.hidden.toString() == "true") ? "checked" : "")+'>'
								  +'        <label for="hypervideo_hidden">'+ labels['SettingsHiddenFromOtherUsers'] +'</label>'
								  +'    </div>'
								  +'    <div class="formColumn column1">'
								  +'        <label for="description">'+ labels['GenericDescription'] +'</label>'
								  +'        <textarea name="description" placeholder="'+ labels['GenericDescription'] +'">'+ hypervideo.description +'</textarea><br>'
								  +'    </div>'
								  +'    <div class="formColumn column2">'
								  +'        <div class="subtitlesSettingsWrapper">'
								  +'            <div>'+ labels['GenericSubtitles'] +' ('+ labels['MessageSubtitlesAlsoUsedForInteractiveTranscripts'] +')</div>'
								  +'            <button class="subtitlesPlus" type="button">'+ labels['GenericAdd'] +' <span class="icon-plus"></span></button>'
								  +'            <input type="checkbox" name="config[captionsVisible]" id="captionsVisible" value="true" '+((hypervideo.config.captionsVisible && hypervideo.config.captionsVisible.toString() == 'true') ? "checked" : "")+'>'
								  +'            <label for="captionsVisible">'+ labels['SettingsSubtitlesShowByDefault'] +'</label>'
								  +'            <div class="existingSubtitlesContainer"></div>'
								  +'            <div class="newSubtitlesContainer"></div>'
								  +'        </div>'
								  +'    </div>'
								  +'    <div style="clear: both;"></div>'
								  +'    <div class="message error"></div>'
								  +'</form>');

		SettingsEditingTabs.find('#ChangeSettings').append(EditHypervideoForm);

		if ( hypervideo.subtitles ) {

			var langMapping = database.subtitlesLangMapping;

			for (var i=0; i < hypervideo.subtitles.length; i++) {
				var currentSubtitles = hypervideo.subtitles[i],
					existingSubtitlesItem = $('<div class="existingSubtitlesItem"><span>'+ langMapping[hypervideo.subtitles[i].srclang] +'</span></div>'),
					existingSubtitlesDelete = $('<button class="subtitlesDelete" type="button" data-lang="'+ hypervideo.subtitles[i].srclang +'"><span class="icon-cancel"></span></button>');

				existingSubtitlesDelete.click(function(evt) {
					$(this).parent().remove();
					EditHypervideoForm.find('.subtitlesSettingsWrapper').append('<input type="hidden" name="SubtitlesToDelete[]" value="'+ $(this).attr('data-lang') +'">');

					updateDatabaseFromForm();
				}).appendTo(existingSubtitlesItem);

				EditHypervideoForm.find('.existingSubtitlesContainer').append(existingSubtitlesItem);
			}
		}

		EditHypervideoForm.find('.hypervideoLayout [data-config]').each(function() {

			var tmpVal = '';

			if ( $(this).hasClass('active') ) {
					tmpVal = 'true';
			} else {
					tmpVal = 'false';
			}

			if ( !EditHypervideoForm.find('.hypervideoLayout input[name="config['+$(this).attr('data-config')+']"]').length ) {
				EditHypervideoForm.find('.hypervideoLayout').append('<input type="hidden" name="config['+$(this).attr('data-config')+']" data-configkey="'+ $(this).attr('data-config') +'" value="'+tmpVal+'">');
			}

		}).click(function(evt) {


			var config      = $(evt.target).attr('data-config'),
				configState = $(evt.target).hasClass('active'),
				configValue = (configState ? 'false': 'true');

			EditHypervideoForm.find('[name="config['+config+']"]').val(configValue);
			$(evt.target).toggleClass('active');

			updateDatabaseFromForm();

			evt.preventDefault();
			evt.stopPropagation();
		});

		// Manage Subtitles
		EditHypervideoForm.find('.subtitlesPlus').on('click', function() {
			var langOptions, languageSelect;

			for (var lang in FrameTrail.module('Database').subtitlesLangMapping) {
				langOptions += '<option value="'+ lang +'">'+ FrameTrail.module('Database').subtitlesLangMapping[lang] +'</option>';
			}

			languageSelect =  '<select class="subtitlesTmpKeySetter">'
							+ '    <option value="" disabled selected style="display:none;">'+ labels['GenericLanguage'] +'</option>'
							+ langOptions
							+ '</select>';

			EditHypervideoForm.find('.newSubtitlesContainer').append('<span class="subtitlesItem">'+ languageSelect +'<input type="file" name="subtitles[]"><button class="subtitlesRemove" type="button">x</button><br></span>');

			updateDatabaseFromForm();
		});

		EditHypervideoForm.find('.newSubtitlesContainer').on('click', '.subtitlesRemove', function(evt) {
			$(this).parent().remove();
			updateDatabaseFromForm();
		});

		EditHypervideoForm.find('.newSubtitlesContainer').on('change', '.subtitlesTmpKeySetter', function() {
			$(this).parent().find('input[type="file"]').attr('name', 'subtitles['+$(this).val()+']');
			updateDatabaseFromForm();
		});

		EditHypervideoForm.find('input, textarea').on('keydown', function() {
			updateDatabaseFromForm();
		});

		EditHypervideoForm.find('input[type="checkbox"]').on('change', function() {
			updateDatabaseFromForm();
		});

		function updateDatabaseFromForm() {
			var DatabaseEntry = FrameTrail.module('Database').hypervideos[thisID];

			DatabaseEntry.name = EditHypervideoForm.find('input[name="name"]').val();
			DatabaseEntry.description = EditHypervideoForm.find('textarea[name="description"]').val();
			DatabaseEntry.hidden = EditHypervideoForm.find('input[name="hidden"]').is(':checked');
			for (var configKey in DatabaseEntry.config) {
				if (configKey === 'layoutArea' || configKey === 'theme') { continue; }
				var newConfigVal = EditHypervideoForm.find('input[data-configkey=' + configKey + ']').val();
				newConfigVal = (newConfigVal === 'true')
								? true
								: (newConfigVal === 'false')
									? false
									: (newConfigVal === undefined)
										? DatabaseEntry.config[configKey]
										: newConfigVal;
				DatabaseEntry.config[configKey] = newConfigVal;
			}


			FrameTrail.module('Database').hypervideos[thisID].subtitles.splice(0, FrameTrail.module('Database').hypervideos[thisID].subtitles.length);

			EditHypervideoForm.find('.existingSubtitlesItem').each(function () {
				var lang = $(this).find('.subtitlesDelete').attr('data-lang');
				FrameTrail.module('Database').hypervideos[thisID].subtitles.push({
					"src": lang +".vtt",
					"srclang": lang
				});
			});

			EditHypervideoForm.find('.newSubtitlesContainer').find('input[type=file]').each(function () {
				var match = /subtitles\[(.+)\]/g.exec($(this).attr('name'));
				//console.log(match);
				if (match) {
					FrameTrail.module('Database').hypervideos[thisID].subtitles.push({
						"src": match[1] +".vtt",
						"srclang": match[1]
					});
				}
			});

			EditHypervideoForm.find('.message.saveReminder').addClass('active');
			FrameTrail.module('HypervideoModel').newUnsavedChange('settings');
		}

		EditHypervideoForm.ajaxForm({
			method:     'POST',
			url:        '_server/ajaxServer.php',
			beforeSubmit: function (array, form, options) {

				updateDatabaseFromForm();
				array.push({ name: 'src', value:  JSON.stringify(FrameTrail.module("Database").convertToDatabaseFormat(thisID), null, 4) });

			},
			beforeSerialize: function(form, options) {

				// Subtitles Validation

				EditHypervideoForm.find('.message.error').removeClass('active').html('');

				var err = 0;
				EditHypervideoForm.find('.subtitlesItem').each(function() {
					$(this).css({'outline': ''});

					if (($(this).find('input[type="file"]:first').attr('name') == 'subtitles[]') || ($(this).find('.subtitlesTmpKeySetter').first().val() == '')
							|| ($(this).find('input[type="file"]:first').val().length == 0)) {
						$(this).css({'outline': '1px solid #cd0a0a'});
						EditHypervideoForm.find('.message.error').addClass('active').html(labels['ErrorSubtitlesEmptyFields']);
						err++;
					} else if ( !(new RegExp('(' + ['.vtt'].join('|').replace(/\./g, '\\.') + ')$')).test($(this).find('input[type="file"]:first').val()) ) {
						$(this).css({'outline': '1px solid #cd0a0a'});
						EditHypervideoForm.find('.message.error').addClass('active').html(labels['ErrorSubtitlesWrongFormat']);
						err++;
					}

					if (EditHypervideoForm.find('.subtitlesItem input[type="file"][name="subtitles['+ $(this).find('.subtitlesTmpKeySetter:first').val() +']"]').length > 1
							|| (EditHypervideoForm.find('.existingSubtitlesItem .subtitlesDelete[data-lang="'+ $(this).find('.subtitlesTmpKeySetter:first').val() +'"]').length > 0 ) ) {
						EditHypervideoForm.find('.message.error').addClass('active').html(labels['ErrorSubtitlesLanguageDuplicate']);
						return false;
					}
				});
				if (err > 0) {
					return false;
				}


			},
			dataType: 'json',
			thisID: thisID,
			data: {
				'a': 'hypervideoChange',
				'hypervideoID': thisID
			},
			success: function(response) {


				switch(response['code']) {
					case 0:

						//TODO: Put in separate method
						FrameTrail.module('Database').loadHypervideoData(
							function(){

								if ( thisID == FrameTrail.module('RouteNavigation').hypervideoID ) {

									FrameTrail.module('Database').hypervideo = FrameTrail.module('Database').hypervideos[thisID];

									// if current hypervideo is edited, adjust states
									EditHypervideoForm.find('.hypervideoLayout input').each(function() {

										var state = 'hv_config_'+ $(this).attr('data-configkey'),
											val   = $(this).val();

										if ( val == 'true' ) {
											val = true;
										} else if ( val == 'false' ) {
											val = false;
										}

										FrameTrail.changeState(state, val);

									});

									var name = EditHypervideoForm.find('input[name="name"]').val(),
										description = EditHypervideoForm.find('textarea[name="description"]').val();

									FrameTrail.module('HypervideoModel').hypervideoName = name;
									FrameTrail.module('HypervideoModel').description = description;

									FrameTrail.module('HypervideoController').updateDescriptions();

									// re-init subtitles
									FrameTrail.module('Database').loadSubtitleData(
										function() {

											FrameTrail.module('ViewOverview').refreshList();

											FrameTrail.module('HypervideoModel').subtitleFiles = FrameTrail.module('Database').hypervideo.subtitles;
											FrameTrail.module('HypervideoModel').initModelOfSubtitles(FrameTrail.module('Database'));
											FrameTrail.module('SubtitlesController').initController();
											FrameTrail.changeState('hv_config_captionsVisible', false);

											EditHypervideoForm.find('.message.saveReminder').removeClass('active');
											//EditHypervideoForm.dialog('close');


										},
										function() {}
									);

									FrameTrail.module('ViewVideo').EditingOptions.empty();
									FrameTrail.module('ViewLayout').initLayoutManager();

									FrameTrail.changeState('viewSize', FrameTrail.getState('viewSize'));

								} else {
									initList();

									FrameTrail.module('ViewVideo').EditingOptions.empty();
									FrameTrail.module('ViewLayout').initLayoutManager();

									FrameTrail.changeState('viewSize', FrameTrail.getState('viewSize'));
									//EditHypervideoForm.dialog('close');
								}

							},
							function(){
								EditHypervideoForm.find('.message.error').addClass('active').html(labels['ErrorUpdatingHypervideoData']);
							}
						);

						break;
					default:
						EditHypervideoForm.find('.message.error').addClass('active').html('Error: '+ response['string']);
						break;
				}
			}
		});


		/* Change Theme UI */

		var ChangeThemeUI = $('<div class="themeContainer">'
							+ '    <div class="message active">'+ labels['SettingsSelectColorTheme'] +'</div>'
							+ '    <div class="themeItem" data-theme="default">'
							+ '        <div class="themeName">'+ labels['GenericDefault'] +'</div>'
							+ '        <div class="themeColorContainer">'
							+ '            <div class="primary-fg-color"></div>'
							+ '            <div class="secondary-bg-color"></div>'
							+ '            <div class="secondary-fg-color"></div>'
							+ '        </div>'
							+ '    </div>'
							+ '    <div class="themeItem" data-theme="dark">'
							+ '        <div class="themeName">Dark</div>'
							+ '        <div class="themeColorContainer">'
							+ '            <div class="primary-fg-color"></div>'
							+ '            <div class="secondary-bg-color"></div>'
							+ '            <div class="secondary-fg-color"></div>'
							+ '        </div>'
							+ '    </div>'
							+ '    <div class="themeItem" data-theme="bright">'
							+ '        <div class="themeName">Bright</div>'
							+ '        <div class="themeColorContainer">'
							+ '            <div class="primary-fg-color"></div>'
							+ '            <div class="secondary-bg-color"></div>'
							+ '            <div class="secondary-fg-color"></div>'
							+ '        </div>'
							+ '    </div>'
							+ '    <div class="themeItem" data-theme="blue">'
							+ '        <div class="themeName">Blue</div>'
							+ '        <div class="themeColorContainer">'
							+ '            <div class="primary-fg-color"></div>'
							+ '            <div class="secondary-bg-color"></div>'
							+ '            <div class="secondary-fg-color"></div>'
							+ '        </div>'
							+ '    </div>'
							+ '    <div class="themeItem" data-theme="green">'
							+ '        <div class="themeName">Green</div>'
							+ '        <div class="themeColorContainer">'
							+ '            <div class="primary-fg-color"></div>'
							+ '            <div class="secondary-bg-color"></div>'
							+ '            <div class="secondary-fg-color"></div>'
							+ '        </div>'
							+ '    </div>'
							+ '    <div class="themeItem" data-theme="orange">'
							+ '        <div class="themeName">Orange</div>'
							+ '        <div class="themeColorContainer">'
							+ '            <div class="primary-fg-color"></div>'
							+ '            <div class="secondary-bg-color"></div>'
							+ '            <div class="secondary-fg-color"></div>'
							+ '        </div>'
							+ '    </div>'
							+ '    <div class="themeItem" data-theme="grey">'
							+ '        <div class="themeName">Grey</div>'
							+ '        <div class="themeColorContainer">'
							+ '            <div class="primary-fg-color"></div>'
							+ '            <div class="secondary-bg-color"></div>'
							+ '            <div class="secondary-fg-color"></div>'
							+ '        </div>'
							+ '    </div>'
							+ '</div>');

		ChangeThemeUI.find('.themeItem').each(function() {
			if ( FrameTrail.module('Database').config.theme == $(this).attr('data-theme') ) {
				$(this).addClass('active');
			}
			if ( !FrameTrail.module('Database').config.theme && $(this).attr('data-theme') == 'default' ) {
				$(this).addClass('active');
			}
		});

		SettingsEditingTabs.find('#ChangeTheme').append(ChangeThemeUI);

		ChangeThemeUI.find('.themeItem').click(function() {

			$(this).siblings('.themeItem').removeClass('active');
			$(this).addClass('active');

			var selectedTheme = $(this).attr('data-theme');

			if (selectedTheme != FrameTrail.module('Database').config.theme) {
				$(FrameTrail.getState('target')).attr('data-frametrail-theme', selectedTheme);

				FrameTrail.module('Database').config.theme = selectedTheme;
				FrameTrail.module('HypervideoModel').newUnsavedChange('config');
			}

		});


		/* Global CSS Editing UI */

		var cssText = ($('head > style.FrameTrailGlobalCustomCSS').length != 0) ? $('head > style.FrameTrailGlobalCustomCSS').html() : '';

		var globalCSSEditingUI = $('<div class="globalCSSEditingUI" style="height: 110px;">'
								 + '    <textarea class="globalCSS">'+ cssText +'</textarea>'
								 + '</div>');

		SettingsEditingTabs.find('#ChangeGlobalCSS').append(globalCSSEditingUI);

		// Init CodeMirror for CSS Variables

		var textarea = SettingsEditingTabs.find('.globalCSS');

		var codeEditor = CodeMirror.fromTextArea(textarea[0], {
				value: textarea[0].value,
				lineNumbers: true,
				mode:  'css',
				gutters: ['CodeMirror-lint-markers'],
				lint: true,
				lineWrapping: true,
				tabSize: 2,
				theme: 'hopscotch'
			});
		codeEditor.on('change', function(instance, changeObj) {

			// console.log('TEST 2');
			var thisTextarea = $(instance.getTextArea());

			thisTextarea.val(instance.getValue());

			$('head > style.FrameTrailGlobalCustomCSS').html(instance.getValue());

			if (changeObj.origin != 'setValue') {
				FrameTrail.module('HypervideoModel').newUnsavedChange('globalCSS');
			}

		});
		codeEditor.setSize(null, '100%');

		// this is necessary to be able to manipulate the css live

		if ( $('head > style.FrameTrailGlobalCustomCSS').length == 0 && $('head link[href$="custom.css"]').length != 0 ) {

			$.get($('head link[href$="custom.css"]').attr('href'))
				.done(function (cssString) {
					codeEditor.setValue(cssString);
					$('head').append('<style class="FrameTrailGlobalCustomCSS" type="text/css">'+ cssString +'</style>');
					$('head link[href$="custom.css"]').remove();
				}).fail(function() {
					console.log(labels['ErrorCouldNotRetrieveCustomCSS']);
				});
		}


		/* Configuration Editing UI */

		var configData = FrameTrail.module('Database').config,
			configurationUI = $('<div class="configEditingForm">'
							+   '    <div class="formColumn column1">'
							+   '        <input type="checkbox" name="userNeedsConfirmation" id="userNeedsConfirmation" value="userNeedsConfirmation" '+((configData.userNeedsConfirmation.toString() == "true") ? "checked" : "")+'>'
							+   '        <label for="userNeedsConfirmation" data-tooltip-bottom-left="'+ labels['MessageUserRequireConfirmation'] +'">'+ labels['SettingsOnlyConfirmedUsers'] +'</label><br>'
							+   '        <div style="margin-top: 5px; margin-bottom: 8px;" data-tooltip-left="'+ labels['MessageUserRequireRole'] +'">'+ labels['SettingsDefaultUserRole'] +': <br>'
							+   '            <input type="radio" name="defaultUserRole" id="user_role_admin" value="admin" '+((configData.defaultUserRole == "admin") ? "checked" : "")+'>'
							+   '            <label for="user_role_admin">'+ labels['UserRoleAdmin'] +'</label>'
							+   '            <input type="radio" name="defaultUserRole" id="user_role_user" value="user" '+((configData.defaultUserRole == "user") ? "checked" : "")+'>'
							+   '            <label for="user_role_user">'+ labels['UserRoleUser'] +'</label><br>'
							+   '        </div>'
							+   '        <input type="checkbox" name="allowCollaboration" id="allowCollaboration" value="allowCollaboration" '+((configData.allowCollaboration.toString() == "true") ? "checked" : "")+'>'
							+   '        <label for="allowCollaboration" data-tooltip-left="'+ labels['MessageUserCollaboration'] +'">'+ labels['SettingsAllowCollaboration'] +'</label><br>'
							+   '    </div>'
							+   '    <div class="formColumn column1">'
							+   '        <input type="checkbox" name="defaultHypervideoHidden" id="defaultHypervideoHidden" value="defaultHypervideoHidden" '+((configData.defaultHypervideoHidden.toString() == "true") ? "checked" : "")+'>'
							+   '        <label for="defaultHypervideoHidden" data-tooltip-bottom-left="'+ labels['MessageNewHypervideoHidden'] +'">'+ labels['SettingsNewHypervideoHidden'] +'</label><br>'
							+   '        <div class="message active" style="width: calc(100% - 50px)">'+ labels['MessageHiddenHypervideoStillAccessible'] +'.</div>'
							+   '        <input type="checkbox" name="allowUploads" id="allowUploads" value="allowUploads" '+((configData.allowUploads.toString() == "true") ? "checked" : "")+'>'
							+   '        <label for="allowUploads" data-tooltip-left="'+ labels['MessageAllowFileUploads'] +'">'+ labels['SettingsAllowUploads'] +'</label><br>'
							+   '    </div>'
							+   '    <div class="formColumn column1">'
							+   '        <input type="checkbox" name="captureUserTraces" id="captureUserTraces" value="captureUserTraces" '+((configData.captureUserTraces.toString() == "true") ? "checked" : "")+'>'
							+   '        <label for="captureUserTraces">'+ labels['SettingsCaptureUserActions'] +'</label><br>'
							+   '        <div class="message active" style="width: calc(100% - 50px)">'+ labels['MessageUserTraces'] +' <i>localStorage.getItem( "frametrail-traces" )</i></div>'
							+   '    </div>'
							+   '    <div class="formColumn column1">'
							+   '        <label for="userTracesStartAction" data-tooltip-bottom-right="'+ labels['MessageUserTracesStartAction'] +'">'+ labels['SettingsUserTracesStartAction'] +'</label><br>'
							+   '        <input type="text" style="margin-top: 0px; margin-bottom: 2px;" name="userTracesStartAction" id="userTracesStartAction" placeholder="'+ labels['SettingsUserTracesStartAction'] +'" value="'+ configData.userTracesStartAction +'"><br>'
							+   '        <label for="userTracesEndAction" data-tooltip-right="'+ labels['MessageUserTracesStartAction'] +'">'+ labels['SettingsUserTracesEndAction'] +'</label><br>'
							+   '        <input type="text" style="margin-top: 0px; margin-bottom: 2px;" name="userTracesEndAction" id="userTracesEndAction" placeholder="'+ labels['SettingsUserTracesEndAction'] +'" value="'+ configData.userTracesEndAction +'">'
							+   '    </div>'
							+   '</div>');

		SettingsEditingTabs.find('#Configuration').append(configurationUI);

		configurationUI.find('input[type="text"]').on('keydown', function(evt) {
			if (!evt.originalEvent.metaKey && evt.originalEvent.key != 'Meta') {
				window.setTimeout(function() {
					var key = $(document.activeElement).attr('name'),
						value = $(document.activeElement).val();

					FrameTrail.module('Database').config[key] = value;
					FrameTrail.module('HypervideoModel').newUnsavedChange('config');
				}, 5)
			}
		});

		configurationUI.find('input[type="checkbox"]').on('change', function(evt) {
			var key = $(evt.currentTarget).attr('name'),
				value = evt.currentTarget.checked;

			FrameTrail.module('Database').config[key] = value;
			FrameTrail.module('HypervideoModel').newUnsavedChange('config');
		});

		configurationUI.find('input[type="radio"]').on('change', function(evt) {
			var key = $(evt.currentTarget).attr('name'),
				value = $(evt.currentTarget).val();

			FrameTrail.module('Database').config[key] = value;
			FrameTrail.module('HypervideoModel').newUnsavedChange('config');
		});

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
