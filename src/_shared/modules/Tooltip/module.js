/**
 * @module Shared
 */

/**
 * I am the Tooltip module.
 *
 * I provide a single, top-layer tooltip for any element carrying a `data-tooltip-*`
 * attribute. Because the tooltip element uses the HTML Popover API, it renders in the
 * browser top layer and is therefore never clipped by an ancestor's `overflow` and needs
 * no `z-index` management — which the previous pure-CSS (`::before`/`::after`) tooltip
 * could not achieve (it was clipped inside scroll containers such as the ContentView strip).
 *
 * The legacy attribute names are preserved, so existing call sites do not change:
 *   data-tooltip-left, data-tooltip-right,
 *   data-tooltip-bottom-left, data-tooltip-bottom-right,
 *   data-tooltip-left-left, data-tooltip-right-right
 * plus a new centered `data-tooltip-top` (used by the ContentView resource strip).
 *
 * I attach delegated hover/focus listeners to this FrameTrail instance's target container,
 * so multiple FrameTrail instances on one page stay isolated.
 *
 * @class Tooltip
 * @static
 */

FrameTrail.defineModule('Tooltip', function(FrameTrail){


    // Elements carrying one of these attributes get a tooltip.
    var SELECTOR = '[data-tooltip-left], [data-tooltip-right], '
                 + '[data-tooltip-bottom-right], [data-tooltip-bottom-left], '
                 + '[data-tooltip-left-left], [data-tooltip-right-right], '
                 + '[data-tooltip-top]';

    // Maps each attribute name to a placement keyword (drives positioning + arrow direction).
    // Checked in this order; the first attribute present on the element wins.
    var PLACEMENTS = [
        ['data-tooltip-top',          'top'],          // centered above
        ['data-tooltip-left',         'above-left'],   // above, left edge aligned to host left
        ['data-tooltip-right',        'above-right'],  // above, right edge aligned to host right
        ['data-tooltip-bottom-left',  'below-left'],   // below, left aligned
        ['data-tooltip-bottom-right', 'below-right'],  // below, right aligned
        ['data-tooltip-left-left',    'right'],        // to the right of the host
        ['data-tooltip-right-right',  'left']          // to the left of the host
    ];

    var GAP = 7,      // px between host and tooltip bubble
        MARGIN = 4;   // px minimum distance from the viewport edge


    var rootElement,        // this instance's target container (delegation root)
        tooltipElement,     // the single reused popover element
        currentHost = null; // element whose tooltip is currently shown


    function getTooltipData(el) {
        for (var i = 0; i < PLACEMENTS.length; i++) {
            var attr = PLACEMENTS[i][0];
            if (el.hasAttribute(attr)) {
                var text = el.getAttribute(attr);
                return text ? { text: text, placement: PLACEMENTS[i][1] } : null;
            }
        }
        return null;
    }


    function position(hostRect, placement) {

        var t = tooltipElement.getBoundingClientRect(),
            top, left;

        switch (placement) {
            case 'top':
                top  = hostRect.top - t.height - GAP;
                left = hostRect.left + (hostRect.width / 2) - (t.width / 2);
                break;
            case 'above-left':
                top  = hostRect.top - t.height - GAP;
                left = hostRect.left;
                break;
            case 'above-right':
                top  = hostRect.top - t.height - GAP;
                left = hostRect.right - t.width;
                break;
            case 'below-left':
                top  = hostRect.bottom + GAP;
                left = hostRect.left;
                break;
            case 'below-right':
                top  = hostRect.bottom + GAP;
                left = hostRect.right - t.width;
                break;
            case 'right':
                top  = hostRect.top;
                left = hostRect.right + GAP;
                break;
            case 'left':
                top  = hostRect.top;
                left = hostRect.left - t.width - GAP;
                break;
        }

        // Keep the bubble inside the viewport.
        if (left < MARGIN) left = MARGIN;
        if (left + t.width > window.innerWidth - MARGIN) left = window.innerWidth - MARGIN - t.width;
        if (top < MARGIN) top = hostRect.bottom + GAP; // no room above → flip below
        if (top + t.height > window.innerHeight - MARGIN) top = window.innerHeight - MARGIN - t.height;

        tooltipElement.style.top  = top + 'px';
        tooltipElement.style.left = left + 'px';
    }


    function show(host) {

        var data = getTooltipData(host);
        if (!data) return;

        currentHost = host;
        tooltipElement.textContent = data.text;
        tooltipElement.setAttribute('data-placement', data.placement);

        // Optional appearance variant (e.g. "resourceTitle" for the ContentView strip),
        // so those tooltips keep their former look instead of the app UI-hint style.
        var variant = host.getAttribute('data-tooltip-variant');
        if (variant) {
            tooltipElement.setAttribute('data-variant', variant);
        } else {
            tooltipElement.removeAttribute('data-variant');
        }

        try {
            if (!tooltipElement.matches(':popover-open')) {
                tooltipElement.showPopover();
            }
        } catch (e) {
            // Popover unsupported or already open — ignore.
        }

        position(host.getBoundingClientRect(), data.placement);
    }


    function hide() {
        currentHost = null;
        try {
            if (tooltipElement.matches(':popover-open')) {
                tooltipElement.hidePopover();
            }
        } catch (e) {}
    }


    // mouseover, filtered to behave like mouseenter (ignore moves within the same host).
    function onOver(e) {
        var host = e.target.closest(SELECTOR);
        if (!host || !rootElement.contains(host)) return;
        if (e.relatedTarget && host.contains(e.relatedTarget)) return;
        show(host);
    }

    // mouseout, filtered to behave like mouseleave.
    function onOut(e) {
        var host = e.target.closest(SELECTOR);
        if (!host || host !== currentHost) return;
        if (e.relatedTarget && host.contains(e.relatedTarget)) return;
        hide();
    }

    // Keyboard accessibility: show on focus (an improvement over the old hover-only CSS).
    function onFocusIn(e) {
        var host = e.target.closest(SELECTOR);
        if (!host || !rootElement.contains(host)) return;
        show(host);
    }

    function onFocusOut(e) {
        var host = e.target.closest(SELECTOR);
        if (!host || host !== currentHost) return;
        hide();
    }

    // The bubble is positioned from viewport coordinates, which drift on scroll/resize.
    // Simplest correct behaviour for a transient hover label: dismiss it.
    function onScrollOrResize() {
        if (currentHost) hide();
    }


    function init() {

        rootElement = document.querySelector(FrameTrail.getState('target')) || document.body;

        tooltipElement = document.createElement('div');
        tooltipElement.className = 'ftTooltip';
        tooltipElement.setAttribute('popover', 'manual');
        rootElement.appendChild(tooltipElement);

        rootElement.addEventListener('mouseover', onOver);
        rootElement.addEventListener('mouseout', onOut);
        rootElement.addEventListener('focusin', onFocusIn);
        rootElement.addEventListener('focusout', onFocusOut);
        window.addEventListener('scroll', onScrollOrResize, true);
        window.addEventListener('resize', onScrollOrResize);
    }


    function onUnload() {
        if (!rootElement) return;
        rootElement.removeEventListener('mouseover', onOver);
        rootElement.removeEventListener('mouseout', onOut);
        rootElement.removeEventListener('focusin', onFocusIn);
        rootElement.removeEventListener('focusout', onFocusOut);
        window.removeEventListener('scroll', onScrollOrResize, true);
        window.removeEventListener('resize', onScrollOrResize);
        hide();
        if (tooltipElement && tooltipElement.parentNode) {
            tooltipElement.parentNode.removeChild(tooltipElement);
        }
        tooltipElement = null;
        currentHost = null;
    }


    init();


    return {
        hide:     hide,
        onUnload: onUnload
    };


});
