/**
 * @module Shared
 */


/**
 * I am the RouteNavigation.
 *
 * I parse the query and the hash fragment of the current URL, and expose those parameters to the app.
 * Also, I listen to changes in the hash fragment, and can call callbacks for them.
 *
 * @class RouteNavigation
 * @static
 */



FrameTrail.defineModule('RouteNavigation', function(FrameTrail){


    var hypervideoID = (getHashVariable('hypervideo') || FrameTrail.getState('startID')),
        annotationID = '',
        hashTime     = '',

        oldAnnotationID = '',
        onAnnotationChange,

        oldHashTime     = '',
        onHashTimeChange,

        // Set while we are reacting to a history entry, so that the state
        // changes we make in response are not written straight back into the
        // URL we are reading.
        applyingRoute = false;


    // "#overview" is a request for the overview, and it outranks the startID
    // init option — otherwise a host that names a start hypervideo could never
    // link to its own overview.
    var overviewRequested = (getHashVariable('overview') !== undefined);

    if (overviewRequested) {
        hypervideoID = '';
    }


    /**
     * Return the base URL for the data directory.
     * Uses the `dataPath` init option when provided; falls back to `'_data/'`.
     * @method resolveDataURL
     * @param {String} relativePath  Path relative to the data root (e.g. 'config.json')
     * @return {String}
     */
    function resolveDataURL(relativePath) {
        var dataPath = FrameTrail.getState('dataPath') || '_data/';
        var url = dataPath + relativePath;
        // Resolve to absolute URL so CSS custom properties (--thumb-bg)
        // work correctly regardless of which stylesheet uses them
        try { return new URL(url, document.baseURI).href; }
        catch(e) { return url; }
    }

    /**
     * Return the full URL for a server-side endpoint.
     * Uses the `server` init option; returns null when no server is configured.
     * @method resolveServerURL
     * @param {String} relativePath  Path relative to the server root (e.g. 'ajaxServer.php')
     * @return {String|null}
     */
    function resolveServerURL(relativePath) {
        var server = FrameTrail.getState('server');
        if (!server) return null;
        return server + relativePath;
    }

    /**
     * Return true when a PHP server is configured and reachable.
     * @method hasServer
     * @return {Boolean}
     */
    function hasServer() {
        return !!FrameTrail.getState('server');
    }

    /**
     * I return a complete path (or URL) for a resource file based on the src attribute of a resource object.
     * @method getResourceURL
     * @param {String} src
     * @return String
     */
    function getResourceURL(src) {

        //if (/^https?:/.exec(src)) {
        if (/^https?:/.exec(src) || /^\/\//.exec(src) || /^file:/.exec(src) || /^blob:/.exec(src)) {

            // Normalize protocol-relative URLs to https (needed for file:// contexts)
            if (/^\/\//.exec(src)) {
                return 'https:' + src;
            }
            return src;

        } else {

            // In local mode, check the blob URL cache for local files
            if (FrameTrail.getState('storageMode') === 'local') {
                var adapter = FrameTrail.module('StorageManager').getAdapter();
                if (adapter) {
                    var blobURL = adapter.getBlobURL('resources/' + src);
                    if (blobURL) {
                        return blobURL;
                    }
                }
            }

            return resolveDataURL('resources/' + src);

        }

    };


    /**
     * I return the value of a query parameter.
     * @method getQueryVariable
     * @param {String} variable
     * @return String
     * @private
     */
    function getQueryVariable(variable) {

        var query = window.location.search.substring(1),
            vars = query.split("&"),
            pair;

        for (var i = 0; i < vars.length; i++) {
            pair = vars[i].split("=");
            if (pair[0] == variable) {
                return pair[1];
            }
        }

    }

    /**
     * I return the value of a hash parameter.
     * @method getHashVariable
     * @param {String} variable
     * @return String
     * @private
     */
    function getHashVariable(variable) {

        var hash = window.location.hash.substring(1),
            vars = hash.split("&"),
            pair;

        for (var i = 0; i < vars.length; i++) {
            pair = vars[i].split("=");
            if (pair[0] == variable) {
                return pair[1];
            }
        }

    }

    /**
     * I return an object with various info about the execution environment.
     * @method checkEnvironment
     * @return Object
     * @private
     */
    function checkEnvironment() {

        var environmentObj = {
            'server': (document.location.protocol == 'file:') ? false : true,
            'hostname': document.location.hostname,
            'iframe': (window.location != window.parent.location) ? true : false
        }

        return environmentObj;

    }

    /**
     * I set the hypervideo id
     * (in case it changes while the application is running).
     * @method setHypervideoID
     * @param {String} id
     * @private
     */
    function setHypervideoID(id) {

        hypervideoID = id;

    }

    /**
     * I write hash parameters into the URL, adding a history entry.
     *
     * Parameters are given as a map. A null or undefined value removes the key,
     * an empty string writes it as a bare flag ("#overview"), anything else
     * writes "key=value". Keys not mentioned are left alone.
     *
     * This replaces an older helper that could only overwrite keys that were
     * already present — so it could neither add "overview" nor drop
     * "hypervideo", which is why switching to the overview used to leave the
     * URL pointing at a hypervideo nobody was looking at.
     *
     * pushState is used rather than assigning location.hash, because assigning
     * fires hashchange and would re-enter routeHasChanged for a navigation we
     * are performing ourselves.
     *
     * @method setHashVariables
     * @param {Object} params
     * @param {Object} [options] { replace: true } to overwrite the current entry
     * @private
     */
    function setHashVariables(params, options) {

        // A second instance on the page does not own the address bar.
        if (window.FrameTrail.instances.length > 1) return;

        var hash = window.location.hash.substring(1),
            keys = [],
            values = {};

        hash.split('&').forEach(function(part) {
            if (!part) return;
            var eq  = part.indexOf('='),
                key = (eq === -1) ? part : part.substring(0, eq);
            if (values.hasOwnProperty(key)) return;
            keys.push(key);
            values[key] = (eq === -1) ? '' : part.substring(eq + 1);
        });

        Object.keys(params).forEach(function(key) {
            if (params[key] === null || params[key] === undefined) {
                var at = keys.indexOf(key);
                if (at !== -1) keys.splice(at, 1);
                delete values[key];
                return;
            }
            if (keys.indexOf(key) === -1) keys.push(key);
            values[key] = String(params[key]);
        });

        var newHash = keys.map(function(key) {
            return values[key] === '' ? key : key + '=' + values[key];
        }).join('&');

        var url = window.location.pathname + window.location.search + (newHash ? '#' + newHash : '#');

        if (options && options.replace) {
            history.replaceState({ editMode: FrameTrail.getState('editMode') }, '', url);
        } else {
            history.pushState({ editMode: FrameTrail.getState('editMode') }, '', url);
        }

    }


    /**
     * I switch the view and record it in the URL, so that what is on screen can
     * be linked to and walked back to.
     *
     * The overview and a hypervideo are alternative views of the same session:
     * going back to the overview leaves the hypervideo loaded (the titlebar
     * still switches straight back into it, at its playhead) but the address
     * bar now says "overview", so sharing the link shares what the sender is
     * actually looking at.
     *
     * @method navigateToView
     * @param {String} viewMode 'overview' or 'video'
     * @param {Object} [options] { replace: true } to overwrite the current entry
     */
    function navigateToView(viewMode, options) {

        if (viewMode === 'overview') {

            // The playhead belongs to the hypervideo, not to the overview.
            setHashVariables({ overview: '', hypervideo: null, t: null }, options);
            clearHashTime();

        } else {

            if (!hypervideoID) return;
            setHashVariables({ overview: null, hypervideo: hypervideoID }, options);

        }

        FrameTrail.changeState('viewMode', viewMode);

    }

    /**
     * I clear the internal hashTime variable without modifying the URL.
     * This is used when switching hypervideos to ensure old time values don't persist.
     * @method clearHashTime
     * @private
     */
    function clearHashTime() {
        hashTime = '';
        oldHashTime = '';
    }


    /**
     * I update the application state, when the hash fragment has changed.
     *
     * I handle three kinds of route: a different hypervideo (which loads it),
     * the hypervideo that is already loaded (which is a pure view switch), and
     * the overview. The last two used to be missing entirely — a hash without a
     * "hypervideo" key was ignored, so Back could never reach the overview and
     * the only way in was the titlebar.
     *
     * I also react to "annotations" and "t" (hashTime).
     *
     * @method routeHasChanged
     * @private
     */
    function routeHasChanged(){

        if (window.FrameTrail.instances.length > 1) { return; }

        /*
        * when accessed from the overview panel,
        * event.originalEvent.state.editMode
        * contains the previous editMode state
        */

        //console.log(FrameTrail.module('RouteNavigation').hypervideoID, getQueryVariable('hypervideo'));

        var RouteNavigation = FrameTrail.module('RouteNavigation'),
            hypervideoID = getHashVariable('hypervideo'),
            hypervideoChange = ( hypervideoID && RouteNavigation && RouteNavigation.hypervideoID != hypervideoID );

        // The very first call runs from inside my own factory, before the
        // module is registered — there is nothing to route yet, and the
        // fall-through below would fight the launcher for the initial view.
        applyingRoute = !!RouteNavigation;

        if ( hypervideoChange ) {

            if ( FrameTrail.getState('editMode') ) {
                FrameTrail.changeState('editMode', false);
                FrameTrail.module('HypervideoModel').updateHypervideo(hypervideoID, true);
            } else {
                //console.log('change');
                FrameTrail.module('HypervideoModel').updateHypervideo(hypervideoID);
            }

        } else if (RouteNavigation) {

            // No hypervideo named, or the one that is already open. Either way
            // nothing is loaded or unloaded — only which view is on screen
            // changes, and the hypervideo stays exactly where the user left it.
            var wantsOverview = (getHashVariable('overview') !== undefined) || !hypervideoID;

            if (wantsOverview) {
                if (FrameTrail.getState('viewMode') !== 'overview') {
                    FrameTrail.changeState('viewMode', 'overview');
                }
            } else if (FrameTrail.getState('viewMode') !== 'video') {
                FrameTrail.changeState('viewMode', 'video');
            }

        }

        applyingRoute = false;

        annotationID = getHashVariable('annotations');

        if ((annotationID !== oldAnnotationID) && !hypervideoChange) {
            oldAnnotationID = annotationID;
            onAnnotationChange && onAnnotationChange.call();
        }

        hashTime = getHashVariable('t') || '';

        if (hypervideoChange) {
            // When switching hypervideos, explicitly clear hashTime if not present in URL
            // and reset oldHashTime to ensure we don't use the old time from the previous hypervideo
            oldHashTime = hashTime;
        } else if (hashTime !== oldHashTime) {
            oldHashTime = hashTime;
            onHashTimeChange && onHashTimeChange.call();
        }

    }

    window.addEventListener('popstate', routeHasChanged);

    // popstate covers history traversal; hashchange covers a fragment written
    // by somebody else — the jumpToHypervideo action and the code-snippet
    // preset both assign location.hash, which fires only this one. My own
    // writes go through pushState, which fires neither, so there is no loop.
    window.addEventListener('hashchange', routeHasChanged);

    routeHasChanged();




    return {

        /**
         * The hypervideoID, as parsed from the query part of the URL.
         * @attribute hypervideoID
         * @type String
         * @readOnly
         */
        get hypervideoID() {  return hypervideoID },

        /**
         * Manually set the hypervideo id.
         *
         * @attribute id
         * @type String
         */
        set hypervideoID(id) { return setHypervideoID(id) },

        /**
         * NOT USED YET
         *
         * @attribute annotationID
         * @type String
         */
        get annotationID()   { return annotationID                        },
        set annotationID(id) { return setHashVariables({ annotations: id }) },

        /**
         * NOT USED YET
         *
         * Will be called, when the hash fragment's annotationID changes.
         *
         * @attribute onAnnotationChange
         * @type Function
         */
        set onAnnotationChange(handler) { return onAnnotationChange = handler },

        /**
         * I get or set the hashTime (#t=) fragment
         * @attribute hashTime
         * @type String
         */
        get hashTime()        { return hashTime                      },
        set hashTime(seconds) { return setHashVariables({ t: seconds }) },

        /**
         * I get the object containing various info about the execution environment
         * @type Object
         */
        get environment()        { return checkEnvironment() },

        /**
         * Will be called, when the hashTime (#t=) fragment changes.
         *
         * @attribute onHashTimeChange
         * @type Function
         */
        set onHashTimeChange(handler) { return onHashTimeChange = handler },

        /**
         * Clear the internal hashTime without modifying the URL.
         * Used when switching hypervideos to prevent old time values from persisting.
         * @method clearHashTime
         */
        clearHashTime: clearHashTime,

        /**
         * Switch between the overview and the open hypervideo, recording the
         * change in the URL so it can be shared and walked back to.
         * @method navigateToView
         */
        navigateToView:   navigateToView,

        /**
         * True when the page was opened on "#overview". Distinguishes "show me
         * the overview" from "no hypervideo was named", which the launcher
         * otherwise resolves by opening the only hypervideo there is.
         * @attribute overviewRequested
         * @type Boolean
         * @readOnly
         */
        get overviewRequested() { return overviewRequested },

        /**
         * Write hash parameters without changing the view. Used by the flows
         * that load a hypervideo themselves and only need the URL to follow.
         * @method setHashVariables
         */
        setHashVariables: setHashVariables,

        getResourceURL:   getResourceURL,
        resolveDataURL:   resolveDataURL,
        resolveServerURL: resolveServerURL,
        hasServer:        hasServer


    };

});
