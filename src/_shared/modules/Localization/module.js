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
 * @class Localization
 * @static
 */

FrameTrail.defineModule('Localization', function(FrameTrail){

    var locale = 'en',
        currentLabels = null;

    /**
     * I update currentLabels to match the active locale, falling back to 'en'.
     *
     * @method updateLabels
     */
    function updateLabels() {

        if (window.FrameTrail_L10n[locale]) {
            currentLabels = window.FrameTrail_L10n[locale];
        } else {
            currentLabels = window.FrameTrail_L10n['en'];
        }

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
        updateLabels();
    }

    updateLabels();

    var labelsProxy = new Proxy({}, {
        get: function(target, prop) {
            return currentLabels[prop];
        },
        has: function(target, prop) {
            return prop in currentLabels;
        }
    });

    return {

        updateLabels: updateLabels,
        setLanguage:  setLanguage,

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
