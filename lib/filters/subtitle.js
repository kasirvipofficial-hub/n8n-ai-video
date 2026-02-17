/**
 * @module filters/subtitle
 * @description Subtitle filter builder using generated ASS files.
 */

const fs = require('fs');
const path = require('path');
const { parseSrt, generateAss } = require('../subtitles');
const { escapeFfmpegPath } = require('./text');
const { FONTS_DIR } = require('../fonts');

/**
 * Build filter string for subtitles.
 * 
 * @param {string} srtContent - Raw SRT string
 * @param {Object} options - Style options
 * @param {string} tempDir - Folder for temp files
 * @param {string} jobId - Job ID
 * @param {Object} [videoMeta={width:1080, height:1920}] - Source video metadata
 * @param {number} [speed=1.0] - Playback speed multiplier
 * @returns {{ filter: string|null, assFilePath: string|null }}
 */
function buildSubtitleFilter(srtContent, options = {}, tempDir, jobId, videoMeta = {}, speed = 1.0) {
    if (!srtContent) return { filter: null, assFilePath: null };

    // 1. Parse SRT
    const subs = parseSrt(srtContent);
    if (!subs.length) return { filter: null, assFilePath: null };

    // 2. Generate ASS with dynamic parameters
    const width = videoMeta.width || 1080;
    const height = videoMeta.height || 1920;

    const assContent = generateAss(subs, options, width, height, speed);
    const assFilePath = path.join(tempDir, `${jobId}_subs.ass`);
    fs.writeFileSync(assFilePath, assContent, 'utf8');

    // 3. Build Filter
    const escapedAss = escapeFfmpegPath(assFilePath);
    const escapedFontsDir = escapeFfmpegPath(FONTS_DIR);

    const filter = `subtitles='${escapedAss}':fontsdir='${escapedFontsDir}'`;

    return { filter, assFilePath };
}

module.exports = { buildSubtitleFilter };
