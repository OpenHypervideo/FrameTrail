/**
 * @module Shared
 */

/**
 * I contain all business logic about the Localization module.
 *
 * I contain a reference to all labels in the currently specified locale.
 * All modules that capture `var labels = FrameTrail.module('Localization').labels`
 * receive a stable Proxy object — property lookups are always forwarded live to the
 * current locale, so calling setLanguage() after init is reflected immediately in
 * all existing module references without needing a page reload.
 *
 * A key the current locale lacks is looked up in English, one key at a time,
 * so a locale that is incomplete — or one that only an extension provides —
 * still shows every label.
 *
 * @class Localization
 * @static
 */

FrameTrail.defineModule('Localization', function(FrameTrail){

    var locale = 'en';

    /**
     * Labels are resolved on every lookup (see the labels Proxy), so there is
     * nothing to update. Kept because it is part of the public interface.
     *
     * @method updateLabels
     */
    function updateLabels() {

    }

    /**
     * I switch the active language and update all label lookups immediately.
     * Because labels is a Proxy, all existing module references pick up the
     * new locale without needing to re-initialize.
     *
     * @method setLanguage
     * @param {String} lang  Two-character locale code, e.g. 'en' or 'de'
     */
    function setLanguage(lang) {
        locale = lang;
    }

    /**
     * I add labels, e.g. an extension's own, to the label tables of all
     * instances: { en: { Key: 'Text', … }, de: { … } }. A key that exists
     * already is replaced, so extensions prefix theirs with their name.
     *
     * A language FrameTrail has no table for gets one; its missing keys are
     * shown in English.
     *
     * @method addLabels
     * @param {Object} tables  label tables keyed by locale code
     */
    function addLabels(tables) {

        if (typeof tables !== 'object' || tables === null) return;

        for (var lang in tables) {
            if (typeof tables[lang] !== 'object' || tables[lang] === null) continue;
            if (!window.FrameTrail_L10n[lang]) {
                window.FrameTrail_L10n[lang] = {};
            }
            for (var key in tables[lang]) {
                window.FrameTrail_L10n[lang][key] = tables[lang][key];
            }
        }

    }

    function lookup(prop) {

        var table = window.FrameTrail_L10n[locale],
            value = table ? table[prop] : undefined;

        if (value === undefined && locale !== 'en' && window.FrameTrail_L10n['en']) {
            value = window.FrameTrail_L10n['en'][prop];
        }

        return value;

    }

    /**
     * The ISO 639-1 language codes, which the language pickers suggest (any
     * other code a person types is taken as it is).
     */
    var LANGUAGE_CODES = ('aa ab ae af ak am an ar as av ay az ba be bg bi bm bn bo br bs ca ce ch co cr cs cu cv cy '
        + 'da de dv dz ee el en eo es et eu fa ff fi fj fo fr fy ga gd gl gn gu gv ha he hi ho hr ht hu hy hz '
        + 'ia id ie ig ii ik io is it iu ja jv ka kg ki kj kk kl km kn ko kr ks ku kv kw ky la lb lg li ln lo lt lu lv '
        + 'mg mh mi mk ml mn mr ms mt my na nb nd ne ng nl nn no nr nv ny oc oj om or os pa pi pl ps pt qu '
        + 'rm rn ro ru rw sa sc sd se sg si sk sl sm sn so sq sr ss st su sv sw ta te tg th ti tk tl tn to tr ts tt tw ty '
        + 'ug uk ur uz ve vi vo wa wo xh yi yo za zh zu').split(' ');

    var languageNames = {};

    /**
     * I name a language code (e.g. 'de', 'pt-BR') in the interface language:
     * 'German' in English, 'Deutsch' in German. The code itself when the
     * browser cannot name it.
     *
     * @method languageName
     * @param {String} code
     * @return {String}
     */
    function languageName(code) {

        code = String(code || '');

        if (!code) { return ''; }

        if (!languageNames[locale]) {
            try {
                languageNames[locale] = new Intl.DisplayNames([locale], { type: 'language' });
            } catch (e) {
                languageNames[locale] = null;
            }
        }

        var name = null;

        try {
            name = languageNames[locale] ? languageNames[locale].of(code) : null;
        } catch (e) {
            name = null;
        }

        return (name && name !== code) ? name.charAt(0).toLocaleUpperCase(locale) + name.slice(1) : code;

    }

    var labelsProxy = new Proxy({}, {
        get: function(target, prop) {
            return lookup(prop);
        },
        has: function(target, prop) {
            return lookup(prop) !== undefined;
        }
    });

    return {

        updateLabels: updateLabels,
        setLanguage:  setLanguage,
        addLabels:    addLabels,
        languageName: languageName,

        /**
         * The ISO 639-1 language codes, for language pickers.
         * @attribute LANGUAGE_CODES
         */
        LANGUAGE_CODES: LANGUAGE_CODES,

        /**
         * A stable Proxy object that always forwards property lookups to the
         * current locale's label data. Modules may safely cache this reference.
         * @attribute labels
         */
        get labels() { return labelsProxy },

        /**
         * The active two-character locale code. Content that carries its own
         * per-language data — tag definitions, above all — needs to know which
         * language to render, and asking for it here is what keeps that in step
         * with the interface instead of hard-coding a locale at the call site.
         * @attribute language
         */
        get language() { return locale }

    };


});
