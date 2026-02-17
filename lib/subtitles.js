/**
 * @module subtitles
 * @description SUBTITLES (SRT) → ASS converter with CapCut-style animations.
 */

const fs = require('fs');
const path = require('path');
const { getFontFamilies } = require('./presets');
const { FONT_PATH } = require('./config');

/**
 * Parse SRT content into structured array.
 * @param {string} srtContent 
 * @returns {Array<{start: number, end: number, text: string}>}
 */
function parseSrt(srtContent) {
    const subs = [];
    const content = srtContent.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    const blocks = content.split('\n\n');

    for (const block of blocks) {
        const lines = block.trim().split('\n');
        if (lines.length < 2) continue;

        let timeLine = lines[0];
        let textLines = lines.slice(1);

        if (/^\d+$/.test(lines[0]) && lines[1] && lines[1].includes('-->')) {
            timeLine = lines[1];
            textLines = lines.slice(2);
        }

        const timeMatch = timeLine.match(/(\d{2}):(\d{2}):(\d{2})[,.](\d{3}) --> (\d{2}):(\d{2}):(\d{2})[,.](\d{3})/);
        if (!timeMatch) continue;

        const parseTime = (h, m, s, ms) =>
            parseInt(h) * 3600 + parseInt(m) * 60 + parseInt(s) + parseInt(ms) / 1000;

        const start = parseTime(timeMatch[1], timeMatch[2], timeMatch[3], timeMatch[4]);
        const end = parseTime(timeMatch[5], timeMatch[6], timeMatch[7], timeMatch[8]);

        // Remove existing newlines to handle wrapping ourselves?
        // Or keep them? Usually SRT might have short lines.
        // Let's join with space and re-wrap if we want total control, or keep manual breaks.
        // User requested "pastikan text tidak keluar frame", implies auto-wrap.
        const text = textLines.join(' ');

        subs.push({ start, end, text });
    }
    return subs;
}

/**
 * Normalize time format for ASS.
 */
function formatAssTime(t) {
    const h = Math.floor(t / 3600);
    const m = Math.floor((t % 3600) / 60);
    const s = Math.floor(t % 60);
    const cs = Math.floor((t % 1) * 100);
    return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}.${cs.toString().padStart(2, '0')}`;
}

/**
 * Hex to ASS color.
 */
function hexToAss(hex) {
    if (!hex) return '&H00FFFFFF';
    const clean = hex.replace('#', '');
    if (clean.length === 6) {
        const r = clean.substring(0, 2);
        const g = clean.substring(2, 4);
        const b = clean.substring(4, 6);
        return `&H00${b}${g}${r}`;
    }
    return '&H00FFFFFF';
}

/**
 * Wrap text to max characters per line.
 * @param {string} text 
 * @param {number} maxChars 
 * @returns {string} Text with \N for newlines
 */
function wrapText(text, maxChars) {
    if (text.length <= maxChars) return text;

    const words = text.split(' ');
    let lines = [];
    let currentLine = words[0];

    for (let i = 1; i < words.length; i++) {
        if (currentLine.length + 1 + words[i].length <= maxChars) {
            currentLine += ' ' + words[i];
        } else {
            lines.push(currentLine);
            currentLine = words[i];
        }
    }
    lines.push(currentLine);
    return lines.join('\\N');
}

/**
 * Generate ASS content.
 * @param {Array} subtitles 
 * @param {Object} [options={}] 
 * @param {number} [videoWidth=1080]
 * @param {number} [videoHeight=1920]
 * @param {number} [speed=1.0]
 * @returns {string} ASS content
 */
function generateAss(subtitles, options = {}, videoWidth = 1080, videoHeight = 1920, speed = 1.0) {
    const fontSize = options.font_size || 24;
    const fontPrimary = hexToAss(options.font_color || '#FFFFFF');
    const fontOutline = hexToAss(options.stroke_color || '#000000');
    // Default wrap to ~20 chars for vertical (1080px) with large text, or 40 for smaller text.
    // Rough heuristic: Width / (FontSize * 0.6)
    const charCapacity = Math.floor(videoWidth / (fontSize * 0.6));
    const maxChars = Math.min(charCapacity, 50); // Hard cap safety

    const fontName = 'Arial'; // Using generic name, assuming fontconfig handles mapping or system font.
    // Ideally we would inspect the TTF name but that's complex.

    // Scale timestamps by speed
    // If speed = 2.0 (faster), duration is halved. Timestamps * 0.5.
    // If speed = 0.5 (slower), duration is doubled. Timestamps * 2.0.
    const timeScale = 1.0 / speed;

    // Header
    let ass = `[Script Info]
ScriptType: v4.00+
PlayResX: ${videoWidth}
PlayResY: ${videoHeight}
WrapStyle: 1

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Default,${fontName},${fontSize},${fontPrimary},&H000000FF,${fontOutline},&H60000000,1,0,0,0,100,100,0,0,1,2,0,2,10,10,50,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
`;

    for (const sub of subtitles) {
        // Apply wrap
        let text = wrapText(sub.text, maxChars);

        // Apply Time Scale
        const start = sub.start * timeScale;
        const end = sub.end * timeScale;

        // Animation Logic (adjusted positions based on videoHeight)
        const centerX = Math.floor(videoWidth / 2);
        const bottomY = Math.floor(videoHeight - 50); // MarginV=50
        const startY = Math.floor(videoHeight + 50); // Start below screen

        if (options.animation === 'pop') {
            text = `{\\fad(50,50)}{\\fscx0\\fscy0}{\\t(0,150,\\fscx100\\fscy100)}${text}`;
        } else if (options.animation === 'slide_up') {
            // Move from bottom off-screen to final position
            text = `{\\fad(100,0)}{\\move(${centerX},${startY},${centerX},${bottomY},0,300)}${text}`;
        } else if (options.animation === 'karaoke') {
            text = `{\\1c&HFFFF00&}{\\t(0,200,\\1c${fontPrimary.replace('&H00', '&H')})}${text}`;
        } else if (options.animation === 'fade') {
            text = `{\\fad(200,200)}${text}`;
        }

        ass += `Dialogue: 0,${formatAssTime(start)},${formatAssTime(end)},Default,,0,0,0,,${text}\n`;
    }

    return ass;
}

module.exports = { parseSrt, generateAss };
