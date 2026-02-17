/**
 * @module metadata
 * @description Video metadata extraction via ffprobe.
 */

const ffmpeg = require('fluent-ffmpeg');

/**
 * Safely parse FFmpeg frame rate string (e.g. "30/1", "24000/1001", "29.97").
 * @param {string} fpsStr - Frame rate string from ffprobe
 * @returns {number} Parsed fps value
 */
function parseFps(fpsStr) {
    if (!fpsStr) return 30;
    if (fpsStr.includes('/')) {
        const [num, den] = fpsStr.split('/').map(Number);
        return den > 0 ? num / den : 30;
    }
    const parsed = parseFloat(fpsStr);
    return isNaN(parsed) || parsed <= 0 ? 30 : parsed;
}

/**
 * Extract video metadata using ffprobe.
 * @param {string} filePath - Path to video file
 * @returns {Promise<Object>} Metadata object with duration, resolution, fps, etc.
 */
function getVideoMetadata(filePath) {
    return new Promise((resolve, reject) => {
        ffmpeg.ffprobe(filePath, (err, metadata) => {
            if (err) return reject(err);

            const vs = metadata.streams.find(s => s.codec_type === 'video');
            const fps = vs ? parseFps(vs.r_frame_rate) : 30;

            resolve({
                duration_sec: Math.round(metadata.format.duration || 0),
                duration: parseFloat(metadata.format.duration || 0),
                resolution: vs ? `${vs.width}x${vs.height}` : 'unknown',
                width: vs ? vs.width : 0,
                height: vs ? vs.height : 0,
                fps,
                file_size: parseInt(metadata.format.size || 0, 10),
            });
        });
    });
}

module.exports = { getVideoMetadata };
