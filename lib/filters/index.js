/**
 * @module filters/index
 * @description Orchestrates all filter builders into a single filter chain.
 */

const { applySpeed, applyCrop, applyZoom, applyColor, applyFade } = require('./video');
const { applyAudioEffects } = require('./audio');

/**
 * Build the complete video + audio filter chain from an effects object.
 *
 * @param {Object} [effects={}] - Effects payload from request
 * @param {Object} [videoMeta={}] - { width, height, duration, fps }
 * @returns {{ videoFilters: string[], audioFilters: string[], needsWatermarkInput: boolean }}
 */
function buildFilterChain(effects = {}, videoMeta = {}) {
    const vf = [];
    const af = [];
    let needsWatermarkInput = false;

    const duration = videoMeta.duration || 10;
    const width = videoMeta.width || 1080;
    const height = videoMeta.height || 1920;

    // Order matters: speed → crop → zoom → color → fade
    applySpeed(effects.speed, vf, af);
    applyCrop(effects.crop, width, height, vf);
    applyZoom(effects.zoom, videoMeta, vf);
    applyColor(effects.color, vf);
    applyFade(effects.fade, duration, effects.speed, vf, af);

    // Watermark flag (actual overlay filter built in render.js)
    if (effects.watermark && effects.watermark.url) {
        needsWatermarkInput = true;
    }

    // Audio effects — pass hasSyncedFade flag to avoid duplicate fade
    const hasSyncedFade = !!(effects.fade && (effects.fade.in || effects.fade.out));
    applyAudioEffects(effects.audio, duration, effects.speed, af, hasSyncedFade);

    return { videoFilters: vf, audioFilters: af, needsWatermarkInput };
}

module.exports = { buildFilterChain };
