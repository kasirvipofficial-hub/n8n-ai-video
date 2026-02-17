/**
 * @module presets
 * @description Color grading presets. Font families are loaded dynamically from fonts.js.
 */

// ── Color Presets ───────────────────────────────────────────
const COLOR_PRESETS = {
    cinematic: { brightness: 0.02, contrast: 1.15, saturation: 0.85, gamma: 0.95 },
    warm: { brightness: 0.05, contrast: 1.05, saturation: 1.2, gamma: 1.0 },
    cool: { brightness: 0.0, contrast: 1.1, saturation: 0.9, gamma: 1.05 },
    vintage: { brightness: 0.08, contrast: 0.9, saturation: 0.6, gamma: 1.1 },
    dramatic: { brightness: -0.05, contrast: 1.4, saturation: 1.1, gamma: 0.85 },
    bw: { brightness: 0.0, contrast: 1.2, saturation: 0.0, gamma: 1.0 },
    vibrant: { brightness: 0.03, contrast: 1.1, saturation: 1.5, gamma: 1.0 },
    muted: { brightness: 0.02, contrast: 0.95, saturation: 0.5, gamma: 1.05 },
    noir: { brightness: -0.1, contrast: 1.5, saturation: 0.0, gamma: 0.8 },
};

/**
 * FONT_FAMILIES: populated at startup by initFonts() in fonts.js.
 * This is a mutable map that gets filled with downloaded Google Fonts paths.
 * Falls back to system fonts if Google Fonts aren't available.
 * @type {Object<string, string>}
 */
let FONT_FAMILIES = {};

/**
 * Update the FONT_FAMILIES map (called after font download).
 * @param {Object<string, string>} families - fontName → path map
 */
function setFontFamilies(families) {
    FONT_FAMILIES = families;
}

/**
 * Get a reference to the current FONT_FAMILIES.
 * @returns {Object<string, string>}
 */
function getFontFamilies() {
    return FONT_FAMILIES;
}

module.exports = { COLOR_PRESETS, FONT_FAMILIES, setFontFamilies, getFontFamilies };
