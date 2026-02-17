/**
 * @module filters/audio
 * @description Audio filter builders — volume, normalization.
 *
 * NOTE: Audio fade is handled ONLY by applyFade() in video.js (synced with video fade).
 * This module handles volume and normalization only, to avoid duplicate fade application.
 * If the user needs audio-only fade (separate from video), use effects.audio.fade_in/fade_out.
 * If the user uses effects.fade, that already applies both video AND audio fade.
 */

/**
 * Add audio-only effects filters (volume, normalization, and audio-only fades).
 *
 * IMPORTANT: effects.fade handles synced video+audio fade. This module provides
 * independent audio fade controls for cases where audio fade differs from video.
 *
 * @param {Object} audio - { volume, fade_in, fade_out, normalize }
 * @param {number} duration - Video duration in seconds
 * @param {number} [speed=1] - Speed multiplier
 * @param {string[]} af - Audio filter accumulator
 * @param {boolean} [hasSyncedFade=false] - Whether effects.fade is also active
 */
function applyAudioEffects(audio, duration, speed, af, hasSyncedFade = false) {
    if (!audio) return;
    const effectiveDuration = speed ? duration / speed : duration;

    if (audio.volume !== undefined && audio.volume !== 1.0) {
        af.push(`volume=${Math.max(0, Math.min(3.0, audio.volume))}`);
    }

    // Only apply audio fade if synced fade (effects.fade) is NOT active,
    // to prevent duplicate audio fade application
    if (!hasSyncedFade) {
        if (audio.fade_in && audio.fade_in > 0) {
            af.push(`afade=t=in:st=0:d=${audio.fade_in}`);
        }

        if (audio.fade_out && audio.fade_out > 0) {
            const start = Math.max(0, effectiveDuration - audio.fade_out);
            af.push(`afade=t=out:st=${start.toFixed(2)}:d=${audio.fade_out}`);
        }
    }

    if (audio.normalize) {
        af.push('loudnorm=I=-14:TP=-1:LRA=11');
    }
}

module.exports = { applyAudioEffects };
