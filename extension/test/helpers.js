// Load content-script IIFEs outside the browser.
//
// The extension has no build step and no module system: each content script is an
// IIFE that attaches itself to window.CGPT_NAV. Pointing `window` at globalThis
// lets those exact files run under bun with no source changes.
globalThis.window = globalThis;

require('../content/constants.js');

/**
 * Load a content script by filename (relative to content/).
 * @param {string} name
 * @returns {object} window.CGPT_NAV
 */
function loadModule(name) {
    require(`../content/${name}`);
    return globalThis.CGPT_NAV;
}

module.exports = {loadModule};
