/**
 * @module filters/watermark
 * @description Watermark overlay filter builder.
 */

/**
 * Build watermark overlay filter components.
 * @param {Object} watermark - { url, position, opacity, scale }
 * @param {number} videoWidth - Source video width
 * @returns {{ scaleFilter: string, overlayFilter: string, opacity: number }}
 */
function buildWatermarkFilter(watermark, videoWidth) {
    const wm = watermark || {};
    const scale = Math.max(0.05, Math.min(0.5, wm.scale || 0.15));
    const opacity = Math.max(0, Math.min(1, wm.opacity || 0.7));
    const wmW = Math.round(videoWidth * scale);

    const scaleFilter = `scale=${wmW}:-1`;

    // Position → FFmpeg overlay expression
    const pad = 20;
    const posMap = {
        top_left: `overlay=${pad}:${pad}`,
        top_right: `overlay=W-w-${pad}:${pad}`,
        bottom_left: `overlay=${pad}:H-h-${pad}`,
        bottom_right: `overlay=W-w-${pad}:H-h-${pad}`,
        center: `overlay=(W-w)/2:(H-h)/2`,
    };

    const overlayFilter = posMap[wm.position || 'bottom_right'] || posMap.bottom_right;

    return { scaleFilter, overlayFilter, opacity };
}

module.exports = { buildWatermarkFilter };
