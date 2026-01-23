/**
 * @module Player
 */

/**
 * I am the HypervideoSettingsDialog. I provide a dialog for editing hypervideo-specific settings.
 *
 * @class HypervideoSettingsDialog
 * @static
 */

FrameTrail.defineModule('HypervideoSettingsDialog', function(FrameTrail){

    var labels = FrameTrail.module('Localization').labels;

    /**
     * I open the hypervideo settings dialog for a specific hypervideo.
     * @method open
     * @param {String} hypervideoID
     */
    function open(hypervideoID) {

        var database = FrameTrail.module('Database'),
            hypervideo = database.hypervideos[hypervideoID],
            thisID = hypervideoID;

        if (!hypervideo) {
            console.error('Hypervideo not found:', hypervideoID);
            return;
        }

        var EditHypervideoForm = $('<form method="POST" class="editHypervideoForm">'
                                  +'    <div class="message error"></div>'
                                  +'    <div class="layoutRow">'
                                  +'        <div class="column-3">'
                                  +'            <label for="name">'+ labels['SettingsHypervideoName'] +'</label>'
                                  +'            <input type="text" name="name" placeholder="'+ labels['SettingsHypervideoName'] +'" value="'+ (hypervideo.name || '') +'"><br>'
                                  +'            <input type="checkbox" name="hidden" id="hypervideo_hidden" value="hidden" '+((hypervideo.hidden && hypervideo.hidden.toString() == "true") ? "checked" : "")+'>'
                                  +'            <label for="hypervideo_hidden">'+ labels['SettingsHiddenFromOtherUsers'] +'</label>'
                                  +'        </div>'
                                  +'        <div class="column-3">'
                                  +'            <label for="description">'+ labels['GenericDescription'] +'</label>'
                                  +'            <textarea name="description" placeholder="'+ labels['GenericDescription'] +'">'+ (hypervideo.description || '') +'</textarea><br>'
                                  +'        </div>'
                                  +'        <div class="column-6">'
                                  +'            <div class="subtitlesSettingsWrapper">'
                                  +'                <div>'+ labels['GenericSubtitles'] +' ('+ labels['MessageSubtitlesAlsoUsedForInteractiveTranscripts'] +')</div>'
                                  +'                <button class="subtitlesPlus" type="button">'+ labels['GenericAdd'] +' <span class="icon-plus"></span></button>'
                                  +'                <input type="checkbox" name="config[captionsVisible]" id="captionsVisible" value="true" '+((hypervideo.config && hypervideo.config.captionsVisible && hypervideo.config.captionsVisible.toString() == 'true') ? "checked" : "")+'>'
                                  +'                <label for="captionsVisible">'+ labels['SettingsSubtitlesShowByDefault'] +'</label>'
                                  +'                <div class="existingSubtitlesContainer"></div>'
                                  +'                <div class="newSubtitlesContainer"></div>'
                                  +'            </div>'
                                  +'        </div>'
                                  +'    </div>'
                                  +'    <div class="message error"></div>'
                                  +'</form>');

        if (hypervideo.subtitles && hypervideo.subtitles.length > 0) {
            var langMapping = database.subtitlesLangMapping;

            for (var i=0; i < hypervideo.subtitles.length; i++) {
                var currentSubtitles = hypervideo.subtitles[i],
                    existingSubtitlesItem = $('<div class="existingSubtitlesItem"><span>'+ langMapping[hypervideo.subtitles[i].srclang] +'</span></div>'),
                    existingSubtitlesDelete = $('<button class="subtitlesDelete" type="button" data-lang="'+ hypervideo.subtitles[i].srclang +'"><span class="icon-cancel"></span></button>');

                existingSubtitlesDelete.click(function(evt) {
                    $(this).parent().remove();
                    EditHypervideoForm.find('.subtitlesSettingsWrapper').append('<input type="hidden" name="SubtitlesToDelete[]" value="'+ $(this).attr('data-lang') +'">');
                }).appendTo(existingSubtitlesItem);

                EditHypervideoForm.find('.existingSubtitlesContainer').append(existingSubtitlesItem);
            }
        }

        // Manage Subtitles
        EditHypervideoForm.find('.subtitlesPlus').on('click', function() {
            var langOptions = '';
            for (var lang in FrameTrail.module('Database').subtitlesLangMapping) {
                langOptions += '<option value="'+ lang +'">'+ FrameTrail.module('Database').subtitlesLangMapping[lang] +'</option>';
            }

            var languageSelect =  '<select class="subtitlesTmpKeySetter">'
                            + '    <option value="" disabled selected style="display:none;">'+ labels['GenericLanguage'] +'</option>'
                            + langOptions
                            + '</select>';

            EditHypervideoForm.find('.newSubtitlesContainer').append('<span class="subtitlesItem">'+ languageSelect +'<input type="file" name="subtitles[]"><button class="subtitlesRemove" type="button">x</button><br></span>');
        });

        EditHypervideoForm.find('.newSubtitlesContainer').on('click', '.subtitlesRemove', function(evt) {
            $(this).parent().remove();
        });

        EditHypervideoForm.find('.newSubtitlesContainer').on('change', '.subtitlesTmpKeySetter', function() {
            $(this).parent().find('input[type="file"]').attr('name', 'subtitles['+$(this).val()+']');
        });

        function updateDatabaseFromForm() {
            // Only called when saving - apply changes to database
            var DatabaseEntry = FrameTrail.module('Database').hypervideos[thisID];

            DatabaseEntry.name = EditHypervideoForm.find('input[name="name"]').val();
            DatabaseEntry.description = EditHypervideoForm.find('textarea[name="description"]').val();
            DatabaseEntry.hidden = EditHypervideoForm.find('input[name="hidden"]').is(':checked');
            
            if (DatabaseEntry.config) {
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
            }

            if (!DatabaseEntry.subtitles) {
                DatabaseEntry.subtitles = [];
            }
            DatabaseEntry.subtitles.splice(0, DatabaseEntry.subtitles.length);

            EditHypervideoForm.find('.existingSubtitlesItem').each(function () {
                var lang = $(this).find('.subtitlesDelete').attr('data-lang');
                if (lang) {
                    DatabaseEntry.subtitles.push({
                        "src": lang +".vtt",
                        "srclang": lang
                    });
                }
            });

            EditHypervideoForm.find('.newSubtitlesContainer').find('input[type=file]').each(function () {
                var match = /subtitles\[(.+)\]/g.exec($(this).attr('name'));
                if (match) {
                    DatabaseEntry.subtitles.push({
                        "src": match[1] +".vtt",
                        "srclang": match[1]
                    });
                }
            });
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
            data: {
                'a': 'hypervideoChange',
                'hypervideoID': thisID
            },
            success: function(response) {
                switch(response['code']) {
                    case 0:
                        FrameTrail.module('Database').loadHypervideoData(
                            function(){
                                if (thisID == FrameTrail.module('RouteNavigation').hypervideoID) {
                                    FrameTrail.module('Database').hypervideo = FrameTrail.module('Database').hypervideos[thisID];

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

                                            hypervideoDialog.dialog('close');
                                        },
                                        function() {}
                                    );

                                    FrameTrail.changeState('viewSize', FrameTrail.getState('viewSize'));
                                } else {
                                    FrameTrail.module('ViewOverview').refreshList();
                                    hypervideoDialog.dialog('close');
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

        var hypervideoDialog = $('<div class="hypervideoSettingsDialog" title="'+ labels['SettingsHypervideoSettings'] +'"></div>');
        hypervideoDialog.append(EditHypervideoForm);

        hypervideoDialog.dialog({
            modal: true,
            resizable: false,
            width: 800,
            height: 500,
            close: function() {
                // If dialog was closed without saving (X button or ESC), nothing happens
                // No changes were applied, so no revert needed
                $(this).remove();
            },
            buttons: [
                { text: labels['GenericSaveChanges'] || labels['GenericApply'] || 'Save',
                    click: function() {
                        EditHypervideoForm.submit();
                    }
                },
                { text: labels['GenericCancel'],
                    click: function() {
                        // Close without applying changes (nothing was applied, so no revert needed)
                        hypervideoDialog.dialog('close');
                    }
                }
            ]
        });
    }

    return {
        open: open
    };

});
