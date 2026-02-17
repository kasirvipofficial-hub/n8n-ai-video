/**
 * @module output
 * @description Output encoding options (quality presets, duration limits).
 */

/** Quality → FFmpeg encoding settings map */
const QUALITY_MAP = {
    low: { crf: 28, preset: 'faster' },
    medium: { crf: 23, preset: 'fast' },
    high: { crf: 18, preset: 'medium' },
    ultra: { crf: 15, preset: 'slow' },
};

/**
 * Build FFmpeg output options array from effects.output settings.
 * @param {Object} [effects={}] - Full effects object
 * @returns {string[]} Array of FFmpeg output option strings
 */
function getOutputOptions(effects = {}) {
    const output = effects.output || {};
    const q = QUALITY_MAP[output.quality] || QUALITY_MAP.medium;

    const opts = [
        `-c:v libx264`,
        `-preset ${q.preset}`,
        `-crf ${q.crf}`,
        '-c:a aac',
        '-b:a 128k',
        '-shortest',
        '-movflags +faststart',
        '-y',
    ];

    // Duration trim (applied before encoding)
    if (output.max_duration) {
        opts.unshift(`-t ${output.max_duration}`);
    }

    return opts;
}

module.exports = { getOutputOptions };
