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
