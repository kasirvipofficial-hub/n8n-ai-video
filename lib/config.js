/**
 * @module config
 * @description Central configuration — environment variables, paths, constants.
 */

require('dotenv').config();
const path = require('path');
const fs = require('fs');

/** Server port */
const PORT = process.env.PORT || 3000;

/** Cloudflare R2 configuration */
const R2_BUCKET_NAME = process.env.R2_BUCKET_NAME || 'telegramvideoai';
const R2_ACCOUNT_ID = process.env.R2_ACCOUNT_ID;
const R2_ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID;
const R2_SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY;
const R2_PUBLIC_URL_BASE = process.env.R2_PUBLIC_URL_BASE || '';

/** Default font path for text overlays */
const FONT_PATH = process.env.FONT_PATH || 'C:/Windows/Fonts/arial.ttf';

/** Temporary directory for render files */
const TEMP_DIR = path.join(__dirname, '..', 'temp');
if (!fs.existsSync(TEMP_DIR)) fs.mkdirSync(TEMP_DIR, { recursive: true });

module.exports = {
    PORT,
    R2_BUCKET_NAME,
    R2_ACCOUNT_ID,
    R2_ACCESS_KEY_ID,
    R2_SECRET_ACCESS_KEY,
    R2_PUBLIC_URL_BASE,
    FONT_PATH,
    TEMP_DIR,
};
