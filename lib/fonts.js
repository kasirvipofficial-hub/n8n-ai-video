/**
 * @module fonts
 * @description Auto-download Google Fonts on startup.
 *
 * Downloads fonts covering multiple styles:
 *   - Sans-serif: Inter, Roboto, Open Sans, Montserrat, Poppins
 *   - Serif: Playfair Display, Lora, Merriweather
 *   - Display/Title: Bebas Neue, Oswald, Anton, Permanent Marker
 *   - Handwriting: Dancing Script, Pacifico, Caveat
 *   - Monospace: Fira Code, JetBrains Mono
 *
 * Fonts are cached in <project>/fonts/ and only downloaded once.
 */

const fs = require('fs');
const path = require('path');
const axios = require('axios');
const { log } = require('./logger');

/** Font directory (project root/fonts) */
const FONTS_DIR = path.join(__dirname, '..', 'fonts');

/**
 * Font catalog: name → GitHub raw URL for the TTF file.
 * Organized by style category.
 */
const FONT_CATALOG = {
    // ── Sans-serif ──────────────────────────────────
    inter_regular: 'https://github.com/google/fonts/raw/main/ofl/inter/Inter%5Bopsz%2Cwght%5D.ttf',
    inter_bold: 'https://github.com/google/fonts/raw/main/ofl/inter/Inter%5Bopsz%2Cwght%5D.ttf',
    roboto_regular: 'https://github.com/google/fonts/raw/main/ofl/roboto/Roboto%5Bwdth%2Cwght%5D.ttf',
    roboto_bold: 'https://github.com/google/fonts/raw/main/ofl/roboto/Roboto%5Bwdth%2Cwght%5D.ttf',
    opensans_regular: 'https://github.com/google/fonts/raw/main/ofl/opensans/OpenSans%5Bwdth%2Cwght%5D.ttf',
    montserrat_regular: 'https://github.com/google/fonts/raw/main/ofl/montserrat/Montserrat%5Bwght%5D.ttf',
    montserrat_bold: 'https://github.com/google/fonts/raw/main/ofl/montserrat/Montserrat%5Bwght%5D.ttf',
    poppins_regular: 'https://github.com/google/fonts/raw/main/ofl/poppins/Poppins-Regular.ttf',
    poppins_bold: 'https://github.com/google/fonts/raw/main/ofl/poppins/Poppins-Bold.ttf',
    poppins_semibold: 'https://github.com/google/fonts/raw/main/ofl/poppins/Poppins-SemiBold.ttf',

    // ── Serif ───────────────────────────────────────
    playfair_regular: 'https://github.com/google/fonts/raw/main/ofl/playfairdisplay/PlayfairDisplay%5Bwght%5D.ttf',
    playfair_bold: 'https://github.com/google/fonts/raw/main/ofl/playfairdisplay/PlayfairDisplay%5Bwght%5D.ttf',
    playfair_italic: 'https://github.com/google/fonts/raw/main/ofl/playfairdisplay/PlayfairDisplay-Italic%5Bwght%5D.ttf',
    lora_regular: 'https://github.com/google/fonts/raw/main/ofl/lora/Lora%5Bwght%5D.ttf',
    lora_italic: 'https://github.com/google/fonts/raw/main/ofl/lora/Lora-Italic%5Bwght%5D.ttf',
    merriweather_regular: 'https://github.com/google/fonts/raw/main/ofl/merriweather/Merriweather%5Bwght%5D.ttf',

    // ── Display / Title ─────────────────────────────
    bebasneuue: 'https://github.com/google/fonts/raw/main/ofl/bebasneue/BebasNeue-Regular.ttf',
    oswald_regular: 'https://github.com/google/fonts/raw/main/ofl/oswald/Oswald%5Bwght%5D.ttf',
    anton: 'https://github.com/google/fonts/raw/main/ofl/anton/Anton-Regular.ttf',
    permanent_marker: 'https://github.com/google/fonts/raw/main/ofl/permanentmarker/PermanentMarker-Regular.ttf',
    bangers: 'https://github.com/google/fonts/raw/main/ofl/bangers/Bangers-Regular.ttf',
    righteous: 'https://github.com/google/fonts/raw/main/ofl/righteous/Righteous-Regular.ttf',

    // ── Handwriting / Script ────────────────────────
    dancing_script: 'https://github.com/google/fonts/raw/main/ofl/dancingscript/DancingScript%5Bwght%5D.ttf',
    pacifico: 'https://github.com/google/fonts/raw/main/ofl/pacifico/Pacifico-Regular.ttf',
    caveat: 'https://github.com/google/fonts/raw/main/ofl/caveat/Caveat%5Bwght%5D.ttf',
    satisfy: 'https://github.com/google/fonts/raw/main/ofl/satisfy/Satisfy-Regular.ttf',

    // ── Monospace ───────────────────────────────────
    firacode: 'https://github.com/google/fonts/raw/main/ofl/firacode/FiraCode%5Bwght%5D.ttf',
    jetbrains_mono: 'https://github.com/google/fonts/raw/main/ofl/jetbrainsmono/JetBrainsMono%5Bwght%5D.ttf',

    // ── Emoji ───────────────────────────────────────
    noto_emoji: 'https://github.com/google/fonts/raw/main/ofl/notocoloremoji/NotoColorEmoji-Regular.ttf'
};

/**
 * Get the local file path for a font.
 * @param {string} fontName - Font key name
 * @returns {string} Absolute path to the font file
 */
function getFontPath(fontName) {
    return path.join(FONTS_DIR, `${fontName}.ttf`);
}

/**
 * Check if a font is already downloaded.
 * @param {string} fontName - Font key name
 * @returns {boolean}
 */
function isFontCached(fontName) {
    const fontPath = getFontPath(fontName);
    return fs.existsSync(fontPath) && fs.statSync(fontPath).size > 1000;
}

/**
 * Download a single font from Google Fonts GitHub repo.
 * @param {string} fontName - Font key name
 * @param {string} url - Download URL
 * @returns {Promise<boolean>} true if downloaded, false if already cached
 */
async function downloadFont(fontName, url) {
    if (isFontCached(fontName)) return false;

    const fontPath = getFontPath(fontName);
    try {
        const response = await axios({
            url,
            method: 'GET',
            responseType: 'arraybuffer',
            timeout: 30000,
            headers: { 'User-Agent': 'FFmpeg-Render-Server/3.0' },
        });

        fs.writeFileSync(fontPath, response.data);
        return true;
    } catch (err) {
        log(null, 'warn', `Font download failed: ${fontName} — ${err.message}`);
        return false;
    }
}

/**
 * Initialize font system — download all missing fonts.
 * Safe to call multiple times; only downloads missing fonts.
 * @returns {Promise<{downloaded: number, cached: number, failed: number}>}
 */
async function initFonts() {
    // Create fonts directory
    if (!fs.existsSync(FONTS_DIR)) {
        fs.mkdirSync(FONTS_DIR, { recursive: true });
    }

    const fontNames = Object.keys(FONT_CATALOG);
    let downloaded = 0, cached = 0, failed = 0;

    // Check which fonts need downloading
    const missing = fontNames.filter(name => !isFontCached(name));
    cached = fontNames.length - missing.length;

    if (missing.length === 0) {
        log(null, 'info', `Fonts: All ${fontNames.length} fonts cached ✅`);
        return { downloaded: 0, cached, failed: 0 };
    }

    log(null, 'info', `Fonts: Downloading ${missing.length} missing fonts...`);

    // Download in small batches to avoid overwhelming GitHub
    const BATCH_SIZE = 5;
    for (let i = 0; i < missing.length; i += BATCH_SIZE) {
        const batch = missing.slice(i, i + BATCH_SIZE);
        const results = await Promise.allSettled(
            batch.map(name => downloadFont(name, FONT_CATALOG[name]))
        );

        for (let j = 0; j < results.length; j++) {
            if (results[j].status === 'fulfilled' && results[j].value) {
                downloaded++;
            } else if (results[j].status === 'rejected') {
                failed++;
            }
        }
    }

    log(null, 'info', `Fonts: ${downloaded} downloaded, ${cached} cached, ${failed} failed`);
    return { downloaded, cached, failed };
}

/**
 * Build FONT_FAMILIES map from downloaded fonts.
 * Uses forward slashes for FFmpeg compatibility.
 * @returns {Object<string, string>} fontName → path map
 */
function buildFontFamilies() {
    const families = {};
    for (const name of Object.keys(FONT_CATALOG)) {
        const fontPath = getFontPath(name);
        if (fs.existsSync(fontPath)) {
            // Use forward slashes for FFmpeg
            families[name] = fontPath.replace(/\\/g, '/');
        }
    }
    return families;
}

/**
 * Font categories for API documentation.
 */
const FONT_CATEGORIES = {
    'sans-serif': ['inter_regular', 'inter_bold', 'roboto_regular', 'roboto_bold', 'opensans_regular', 'montserrat_regular', 'montserrat_bold', 'poppins_regular', 'poppins_bold', 'poppins_semibold'],
    'serif': ['playfair_regular', 'playfair_bold', 'playfair_italic', 'lora_regular', 'lora_italic', 'merriweather_regular'],
    'display': ['bebasneuue', 'oswald_regular', 'anton', 'permanent_marker', 'bangers', 'righteous'],
    'handwriting': ['dancing_script', 'pacifico', 'caveat', 'satisfy'],
    'monospace': ['firacode', 'jetbrains_mono'],
    'emoji': ['noto_emoji'],
};

module.exports = {
    FONTS_DIR,
    FONT_CATALOG,
    FONT_CATEGORIES,
    initFonts,
    buildFontFamilies,
    getFontPath,
    isFontCached,
};
