/**
 * @module storage
 * @description R2/S3 storage operations — streaming download, streaming upload, cleanup.
 */

const AWS = require('aws-sdk');
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const { R2_BUCKET_NAME, R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_PUBLIC_URL_BASE, TEMP_DIR } = require('./config');
const { log } = require('./logger');

// ── S3-compatible client for Cloudflare R2 ──────────────────
const s3 = new AWS.S3({
    endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    accessKeyId: R2_ACCESS_KEY_ID,
    secretAccessKey: R2_SECRET_ACCESS_KEY,
    signatureVersion: 'v4',
    region: 'auto',
});

/**
 * Extract the R2 object key from a public URL.
 * @param {string} url - Full public R2 URL
 * @returns {string|null} Object key, or null if not an R2 URL
 */
function extractR2Key(url) {
    if (!R2_PUBLIC_URL_BASE || !url.startsWith(R2_PUBLIC_URL_BASE)) return null;
    return url.replace(R2_PUBLIC_URL_BASE + '/', '') || null;
}

/**
 * Download a file from R2 via the S3 API using streaming (low memory).
 * @param {string} key - R2 object key
 * @param {string} outputPath - Local file path to write to
 */
async function downloadFromR2(key, outputPath) {
    log(null, 'info', `Downloading via S3 API (stream): ${key}`);
    return new Promise((resolve, reject) => {
        const fileStream = fs.createWriteStream(outputPath);
        const s3Stream = s3.getObject({ Bucket: R2_BUCKET_NAME, Key: key }).createReadStream();

        s3Stream.on('error', (err) => {
            fileStream.close();
            try { fs.unlinkSync(outputPath); } catch { }
            reject(err);
        });

        fileStream.on('finish', () => {
            const size = fs.statSync(outputPath).size;
            log(null, 'info', `S3 download complete: ${(size / 1024 / 1024).toFixed(2)} MB`);
            resolve();
        });

        fileStream.on('error', (err) => {
            try { fs.unlinkSync(outputPath); } catch { }
            reject(err);
        });

        s3Stream.pipe(fileStream);
    });
}

/**
 * Download a file via HTTP(S) using streaming.
 * @param {string} url - Remote URL
 * @param {string} outputPath - Local file path to write to
 */
async function downloadFromHttp(url, outputPath) {
    log(null, 'info', `Downloading via HTTP: ${url}`);
    const writer = fs.createWriteStream(outputPath);
    const response = await axios({ url, method: 'GET', responseType: 'stream', timeout: 300000 });
    response.data.pipe(writer);
    return new Promise((resolve, reject) => {
        writer.on('finish', resolve);
        writer.on('error', (err) => {
            writer.close();
            try { fs.unlinkSync(outputPath); } catch { }
            reject(err);
        });
    });
}

/**
 * Smart download — uses S3 API for R2 URLs (streaming, bypasses CDN),
 * falls back to HTTP for non-R2 URLs or if S3 fails.
 * @param {string} url - Source URL
 * @param {string} outputPath - Local file path to write to
 */
async function downloadFile(url, outputPath) {
    const r2Key = extractR2Key(url);
    if (r2Key) {
        try {
            await downloadFromR2(r2Key, outputPath);
            return;
        } catch (e) {
            log(null, 'warn', `S3 failed (${e.message}), trying HTTP...`);
        }
        await downloadFromHttp(url, outputPath);
    } else {
        await downloadFromHttp(url, outputPath);
    }
}

/**
 * Upload a file to Cloudflare R2 using streaming (low memory).
 * @param {string} filePath - Local file to upload
 * @param {string} fileName - R2 object key (destination path)
 * @param {string} [contentType='video/mp4'] - MIME type
 * @returns {Promise} S3 upload result
 */
async function uploadToR2(filePath, fileName, contentType = 'video/mp4') {
    const fileStream = fs.createReadStream(filePath);
    const fileSize = fs.statSync(filePath).size;

    log(null, 'info', `Uploading ${(fileSize / 1024 / 1024).toFixed(2)} MB to R2: ${fileName}`);

    return s3.upload({
        Bucket: R2_BUCKET_NAME,
        Key: fileName,
        Body: fileStream,
        ContentType: contentType,
    }).promise();
}

/**
 * Safely delete temporary files (ignores missing files).
 * @param {...string} files - File paths to delete
 */
function cleanupFiles(...files) {
    for (const f of files) {
        try {
            if (f && fs.existsSync(f)) fs.unlinkSync(f);
        } catch (e) {
            log(null, 'warn', `Cleanup failed for ${f}: ${e.message}`);
        }
    }
}

/**
 * Clear all files in the temp directory (startup cleanup).
 */
function clearTempDirectory() {
    if (!fs.existsSync(TEMP_DIR)) return;
    try {
        const files = fs.readdirSync(TEMP_DIR);
        let count = 0;
        for (const file of files) {
            if (file === '.gitkeep') continue;
            const filePath = path.join(TEMP_DIR, file);
            try {
                fs.unlinkSync(filePath);
                count++;
            } catch (e) { /* ignore locked files */ }
        }
        if (count > 0) log(null, 'info', `Cleaned ${count} temp files.`);
    } catch (e) {
        log(null, 'warn', `Temp cleanup failed: ${e.message}`);
    }
}

/**
 * Get available disk space on the temp directory drive (Windows).
 * @param {string} dir - Directory path
 * @returns {Promise<number>} Available space in bytes, or Infinity if unknown
 */
async function getAvailableDiskSpace(dir) {
    try {
        const { execSync } = require('child_process');
        const drive = dir.charAt(0).toUpperCase();
        const output = execSync(
            `powershell -Command "(Get-PSDrive ${drive}).Free"`,
            { encoding: 'utf8', timeout: 5000 }
        ).trim();
        return parseInt(output, 10) || Infinity;
    } catch {
        return Infinity;
    }
}

module.exports = { downloadFile, uploadToR2, cleanupFiles, clearTempDirectory, getAvailableDiskSpace };
