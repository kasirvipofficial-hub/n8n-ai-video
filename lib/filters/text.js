/**
 * @module filters/text
 * @description Text overlay (drawtext) filter builder with font, highlight, and animation support.
 */

const fs = require('fs');
const path = require('path');
const { getFontFamilies } = require('../presets');
const { FONT_PATH } = require('../config');

/**
 * Escape a file path for FFmpeg (Windows backslash → forward slash, colon escaped).
 * @param {string} p - File path
 * @returns {string} Escaped path
 */
function escapeFfmpegPath(p) {
    return p.replace(/\\/g, '/').replace(/:/g, '\\:');
}

/**
 * Sanitize text for FFmpeg drawtext — strip emoji, escape special chars.
 * @param {string} text - Raw text
 * @returns {string} Cleaned text safe for FFmpeg
 */
function sanitizeText(text) {
    return text
        .replace(/[\u{1F000}-\u{1FFFF}]/gu, '')
        .replace(/[\u{2600}-\u{27BF}]/gu, '')
        .replace(/[\u{FE00}-\u{FEFF}]/gu, '')
        .replace(/[\u{1F900}-\u{1F9FF}]/gu, '')
        .replace(/[^\x20-\x7E\u00C0-\u024F]/g, '')
        .replace(/\\/g, '\\\\\\\\')
        .replace(/:/g, '\\:')
        .replace(/'/g, "\\'")
        .replace(/"/g, '')
        .replace(/;/g, '\\;')
        .replace(/%/g, '%%')
        .replace(/\[/g, '\\[')
        .replace(/\]/g, '\\]')
        .replace(/\n/g, ' ')
        .trim();
}

/**
 * Build the FFmpeg drawtext filter string.
 *
 * @param {string} textOverlay - Raw text content
 * @param {Object} [textStyle={}] - effects.text options
 * @param {string} tempDir - Directory for temp text file
 * @param {string} jobId - Job identifier (for temp file naming)
 * @returns {{ filter: string|null, textFilePath: string|null }}
 */
function buildTextFilter(textOverlay, textStyle = {}, tempDir, jobId) {
    if (!textOverlay || !textOverlay.trim()) return { filter: null, textFilePath: null };

    const cleanText = sanitizeText(textOverlay);
    if (cleanText.length === 0) return { filter: null, textFilePath: null };

    // Write text to temp file (avoids FFmpeg inline text escaping hell)
    const textFilePath = path.join(tempDir, `${jobId}_text.txt`);
    fs.writeFileSync(textFilePath, cleanText, 'utf8');

    const ts = textStyle;
    const fontFamilies = getFontFamilies();

    // ── Font resolution ────────────────────────────────────
    const fontFamily = ts.font_family || 'poppins_regular';
    const resolvedFont = fontFamilies[fontFamily] || fontFamilies.poppins_regular || fontFamilies.inter_regular || FONT_PATH;
    const ffmpegFont = escapeFfmpegPath(resolvedFont);
    const ffmpegTextFile = escapeFfmpegPath(textFilePath);

    const fontSize = Math.max(10, Math.min(120, ts.font_size || 28));
    const fontColor = ts.font_color || 'white';
    const strokeColor = ts.stroke_color || 'black';
    const strokeWidth = ts.stroke_width !== undefined ? Math.max(0, Math.min(10, ts.stroke_width)) : 2;

    // ── Position mapping ───────────────────────────────────
    const pad = 30;
    const positionMap = {
        bottom_center: `x=(w-text_w)/2:y=h-text_h-${pad}`,
        top_center: `x=(w-text_w)/2:y=${pad}`,
        center: `x=(w-text_w)/2:y=(h-text_h)/2`,
        bottom_left: `x=${pad}:y=h-text_h-${pad}`,
        bottom_right: `x=w-text_w-${pad}:y=h-text_h-${pad}`,
        top_left: `x=${pad}:y=${pad}`,
        top_right: `x=w-text_w-${pad}:y=${pad}`,
    };
    const posExpr = positionMap[ts.position || 'bottom_center'] || positionMap.bottom_center;

    // ── Build drawtext string ──────────────────────────────
    let dt = `drawtext=fontfile='${ffmpegFont}'`;
    dt += `:textfile='${ffmpegTextFile}'`;
    dt += `:fontsize=${fontSize}`;
    dt += `:fontcolor=${fontColor}`;
    dt += `:borderw=${strokeWidth}`;
    if (strokeWidth > 0) dt += `:bordercolor=${strokeColor}`;
    dt += `:${posExpr}`;

    // ── Highlight / background box ─────────────────────────
    if (ts.bg_color) {
        const bgOpacity = ts.bg_opacity !== undefined ? Math.max(0, Math.min(1, ts.bg_opacity)) : 0.6;
        const bgPadding = ts.bg_padding !== undefined ? Math.max(0, Math.min(30, ts.bg_padding)) : 10;
        dt += `:box=1:boxcolor=${ts.bg_color}@${bgOpacity}:boxborderw=${bgPadding}`;
    }

    // ── Shadow ─────────────────────────────────────────────
    if (ts.shadow_color) {
        dt += `:shadowcolor=${ts.shadow_color}:shadowx=${ts.shadow_x || 2}:shadowy=${ts.shadow_y || 2}`;
    }

    // ── Line spacing ───────────────────────────────────────
    if (ts.line_spacing) {
        dt += `:line_spacing=${ts.line_spacing}`;
    }

    // ── Animation ──────────────────────────────────────────
    if (ts.animation === 'fade_in') {
        dt += `:alpha='if(lt(t,1),t,1)'`;
    } else if (ts.animation === 'slide_up') {
        const finalY = ts.position === 'center' ? '(h-text_h)/2' : `h-text_h-${pad}`;
        dt = dt.replace(/y=[^:]+/, `y='if(lt(t,1),h-(h-${finalY})*t,${finalY})'`);
    }

    return { filter: dt, textFilePath };
}

module.exports = { buildTextFilter, sanitizeText, escapeFfmpegPath };
