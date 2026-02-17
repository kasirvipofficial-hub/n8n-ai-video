/**
 * @module filters/video
 * @description Video filter builders — speed, crop, zoom, color, fade.
 * Each function pushes FFmpeg filter strings into the provided array.
 */

const { COLOR_PRESETS } = require('../presets');

/**
 * Add speed control filter (must be first — changes timing).
 * @param {number} speed - Playback speed (0.25–4.0)
 * @param {string[]} vf - Video filter accumulator
 * @param {string[]} af - Audio filter accumulator
 */
function applySpeed(speed, vf, af) {
    if (!speed || speed === 1.0) return;
    speed = Math.max(0.25, Math.min(4.0, speed));
    vf.push(`setpts=PTS/${speed}`);

    // atempo only supports 0.5–2.0, chain multiple for extremes
    if (speed > 0.5 && speed <= 2.0) {
        af.push(`atempo=${speed}`);
    } else if (speed > 2.0) {
        af.push(`atempo=2.0`);
        if (speed > 2.0) af.push(`atempo=${speed / 2.0}`);
    } else {
        af.push(`atempo=${Math.max(0.5, speed)}`);
    }
}

/**
 * Add crop and resize filters.
 * @param {Object} crop - { aspect_ratio, width, height, position }
 * @param {number} srcW - Source video width
 * @param {number} srcH - Source video height
 * @param {string[]} vf - Video filter accumulator
 */
function applyCrop(crop, srcW, srcH, vf) {
    if (!crop) return;
    const pos = crop.position || 'center';

    if (crop.aspect_ratio) {
        const [aw, ah] = crop.aspect_ratio.split(':').map(Number);
        const targetRatio = aw / ah;
        const sourceRatio = srcW / srcH;

        if (sourceRatio > targetRatio) {
            const cropW = `ih*${aw}/${ah}`;
            const xExpr = pos === 'center' ? `(iw-${cropW})/2` : '0';
            vf.push(`crop=${cropW}:ih:${xExpr}:0`);
        } else {
            const cropH = `iw*${ah}/${aw}`;
            let yExpr = `(ih-${cropH})/2`;
            if (pos === 'top') yExpr = '0';
            if (pos === 'bottom') yExpr = `ih-${cropH}`;
            vf.push(`crop=iw:${cropH}:0:${yExpr}`);
        }
    }

    if (crop.width && crop.height) {
        vf.push(`scale=${crop.width}:${crop.height}:force_original_aspect_ratio=decrease`);
        vf.push(`pad=${crop.width}:${crop.height}:(ow-iw)/2:(oh-ih)/2:black`);
    } else if (crop.width) {
        vf.push(`scale=${crop.width}:-2`);
    } else if (crop.height) {
        vf.push(`scale=-2:${crop.height}`);
    }
}

/**
 * Add Ken Burns zoom/pan effect.
 * @param {Object} zoom - { type: 'in'|'out'|'pan_left'|'pan_right', intensity }
 * @param {Object} meta - { width, height, duration, fps }
 * @param {string[]} vf - Video filter accumulator
 */
function applyZoom(zoom, meta, vf) {
    if (!zoom) return;
    const intensity = Math.max(0.05, Math.min(0.5, zoom.intensity || 0.2));
    const maxZoom = 1 + intensity;
    const fps = meta.fps || 30;
    const frames = Math.round((meta.duration || 10) * fps);
    const step = intensity / frames;
    const size = `${meta.width || 1080}x${meta.height || 1920}`;

    switch (zoom.type || 'in') {
        case 'in':
            vf.push(`zoompan=z='min(zoom+${step.toFixed(6)},${maxZoom})':d=${frames}:x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':s=${size}:fps=${fps}`);
            break;
        case 'out':
            vf.push(`zoompan=z='if(eq(on,1),${maxZoom},max(zoom-${step.toFixed(6)},1))':d=${frames}:x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':s=${size}:fps=${fps}`);
            break;
        case 'pan_left':
            vf.push(`zoompan=z='${maxZoom}':d=${frames}:x='iw/${maxZoom}-iw/${maxZoom}/zoom*on/${frames}':y='ih/2-(ih/zoom/2)':s=${size}:fps=${fps}`);
            break;
        case 'pan_right':
            vf.push(`zoompan=z='${maxZoom}':d=${frames}:x='iw/${maxZoom}/zoom*on/${frames}':y='ih/2-(ih/zoom/2)':s=${size}:fps=${fps}`);
            break;
    }
}

/**
 * Add color grading / EQ filter.
 * @param {Object} color - { brightness, contrast, saturation, gamma, preset }
 * @param {string[]} vf - Video filter accumulator
 */
function applyColor(color, vf) {
    if (!color) return;
    let c = { ...color };

    if (c.preset && COLOR_PRESETS[c.preset]) {
        c = { ...COLOR_PRESETS[c.preset], ...c };
        delete c.preset;
    }

    const parts = [];
    if (c.brightness !== undefined && c.brightness !== 0) parts.push(`brightness=${c.brightness}`);
    if (c.contrast !== undefined && c.contrast !== 1) parts.push(`contrast=${c.contrast}`);
    if (c.saturation !== undefined && c.saturation !== 1) parts.push(`saturation=${c.saturation}`);
    if (c.gamma !== undefined && c.gamma !== 1) parts.push(`gamma=${c.gamma}`);

    if (parts.length > 0) vf.push(`eq=${parts.join(':')}`);
}

/**
 * Add fade in/out transitions (video + audio).
 * @param {Object} fade - { in, out } in seconds
 * @param {number} duration - Video duration in seconds
 * @param {number} [speed=1] - Speed multiplier (adjusts fade timing)
 * @param {string[]} vf - Video filter accumulator
 * @param {string[]} af - Audio filter accumulator
 */
function applyFade(fade, duration, speed, vf, af) {
    if (!fade) return;
    const effectiveDuration = speed ? duration / speed : duration;

    if (fade.in && fade.in > 0) {
        vf.push(`fade=t=in:st=0:d=${fade.in}`);
        af.push(`afade=t=in:st=0:d=${fade.in}`);
    }
    if (fade.out && fade.out > 0) {
        const start = Math.max(0, effectiveDuration - fade.out);
        vf.push(`fade=t=out:st=${start.toFixed(2)}:d=${fade.out}`);
        af.push(`afade=t=out:st=${start.toFixed(2)}:d=${fade.out}`);
    }
}

module.exports = { applySpeed, applyCrop, applyZoom, applyColor, applyFade };
