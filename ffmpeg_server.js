/**
 * FFmpeg Render Server v3.1 — Modular Architecture
 *
 * Entry point: Express routes + startup.
 *
 * @see lib/config.js      — Environment vars & paths
 * @see lib/logger.js       — Structured logging
 * @see lib/storage.js      — R2 download/upload/cleanup
 * @see lib/presets.js       — Color presets
 * @see lib/fonts.js         — Font download system (NEW)
 * @see lib/schema.js        — Effects API schema
 * @see lib/metadata.js      — ffprobe metadata extraction
 * @see lib/output.js        — Encoding quality options
 * @see lib/filters/         — Filter chain builders
 * @see lib/render.js        — Main render pipeline
 */

const express = require('express');
const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const { PORT, TEMP_DIR, R2_ACCOUNT_ID } = require('./lib/config');
const { log } = require('./lib/logger');
const { EFFECTS_SCHEMA } = require('./lib/schema');
const { COLOR_PRESETS, getFontFamilies } = require('./lib/presets');
const { initFonts, buildFontFamilies, FONT_CATEGORIES } = require('./lib/fonts');
const { handleRender } = require('./lib/render');
const { setFontFamilies: updatePresetFonts } = require('./lib/presets');
const { clearTempDirectory, getAvailableDiskSpace } = require('./lib/storage');

// ============================================================
// EXPRESS APP
// ============================================================
const app = express();

// CORS Middleware
app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
    if (req.method === 'OPTIONS') return res.sendStatus(200);
    next();
});

app.use(express.json({ limit: '10mb' }));

// ============================================================
// JOB TRACKING & CONCURRENCY
// ============================================================
const jobs = new Map();
const MAX_CONCURRENT_JOBS = 5;
let activeJobs = 0;

/**
 * Job status updater with auto-cleanup for old jobs.
 * Jobs older than 1 hour are deleted to prevent memory leaks.
 */
function setJobStatus(jobId, status, extra = {}) {
    const now = new Date();
    jobs.set(jobId, { status, ...extra, updated_at: now.toISOString() });

    // Cleanup old jobs every update (simple strategy)
    if (jobs.size > 100) {
        const oneHourAgo = now.getTime() - 60 * 60 * 1000;
        for (const [id, job] of jobs) {
            if (new Date(job.updated_at).getTime() < oneHourAgo) {
                jobs.delete(id);
            }
        }
    }
}

// ============================================================
// ROUTES
// ============================================================

/** Landing page */
app.get('/', (req, res) => {
    res.json({
        service: 'FFmpeg Render Server',
        version: '3.1 (modular + safe)',
        endpoints: {
            'GET  /': 'This info page',
            'GET  /health': 'Health check',
            'GET  /effects': 'Effects API reference',
            'POST /render': 'Submit render job',
            'GET  /status/:jobId': 'Check job status',
        },
    });
});

/** Health check */
app.get('/health', async (req, res) => {
    const ffmpegAvailable = checkFFmpeg();
    const diskSpace = await getAvailableDiskSpace(TEMP_DIR);

    res.json({
        status: ffmpegAvailable ? 'ok' : 'degraded',
        ffmpeg: ffmpegAvailable,
        active_jobs: activeJobs,
        jobs_tracked: jobs.size,
        disk_free_mb: Math.round(diskSpace / 1024 / 1024),
        uptime: Math.round(process.uptime()),
    });
});

/** Effects API reference */
app.get('/effects', (req, res) => {
    res.json({
        description: 'Available video effects',
        effects: EFFECTS_SCHEMA,
        fonts: getFontFamilies(),
        font_categories: FONT_CATEGORIES,
        color_presets: Object.keys(COLOR_PRESETS),
    });
});

/** Job status */
app.get('/status/:jobId', (req, res) => {
    const job = jobs.get(req.params.jobId);
    if (!job) return res.status(404).json({ error: 'Job not found', job_id: req.params.jobId });
    res.json({ job_id: req.params.jobId, ...job });
});

/** Download result (Internal/Ephemeral) */
app.get('/download/:filename', (req, res) => {
    const safeName = path.basename(req.params.filename);
    const filePath = path.join(TEMP_DIR, safeName);
    if (!fs.existsSync(filePath)) return res.status(404).send('File not found or expired');
    res.download(filePath);
});


/**
 * POST /render — Submit a render job.
 */
app.post('/render', async (req, res) => {
    // V2 Payload: timeline (array), OR V1 Payload: video_url, audio_url
    const {
        job_id, project_id,
        timeline, // V2
        video_url, audio_url, text_overlay, subtitle_url, subtitle_content, effects, // V1
        callback_url
    } = req.body;

    if (!job_id) return res.status(400).json({ error: 'Missing job_id' });
    if (!timeline && (!video_url || !audio_url)) {
        return res.status(400).json({ error: 'Missing requirements: provide `timeline` (V2) or `video_url` + `audio_url` (V1)' });
    }

    // Concurrency check
    if (activeJobs >= MAX_CONCURRENT_JOBS) {
        return res.status(503).json({ error: 'Server busy', active_jobs: activeJobs, max: MAX_CONCURRENT_JOBS });
    }

    setJobStatus(job_id, 'processing', { project_id, progress: 0 });
    res.json({ message: 'Render job queued', job_id, status: 'processing' });

    activeJobs++;

    // Fire-and-forget async render
    handleRender({
        jobId: job_id,
        project_id,
        timeline, // V2
        video_url, audio_url, text_overlay, subtitle_url, subtitle_content, effects, // V1
        callback_url,
        setJobStatus,
        serverUrl: process.env.PUBLIC_URL || `${req.protocol}://${req.get('host')}` // Pass server URL for download link generation
    }).finally(() => {
        activeJobs--;
    });
});

// ============================================================
// HELPERS
// ============================================================
function checkFFmpeg() {
    try { execSync('ffmpeg -version', { stdio: 'pipe' }); return true; }
    catch { return false; }
}

// ============================================================
// STARTUP
// ============================================================
const server = app.listen(PORT, async () => {
    log(null, 'info', `====================================`);
    log(null, 'info', `🎬 FFmpeg Render Server v3.1`);
    log(null, 'info', `   Port: ${PORT}`);

    // 1. Cleanup Temp
    log(null, 'info', `   Cleaning temp dir...`);
    clearTempDirectory();

    // 2. Check FFmpeg
    const ffmpegOk = checkFFmpeg();
    log(null, 'info', `   FFmpeg: ${ffmpegOk ? '✅ Available' : '❌ NOT FOUND'}`);

    // 3. Init Fonts
    log(null, 'info', `   Initializing fonts...`);
    try {
        const stats = await initFonts();
        const families = buildFontFamilies();
        updatePresetFonts(families); // Update presets with real paths
        log(null, 'info', `   Fonts: ${Object.keys(families).length} available (${stats.downloaded} new, ${stats.cached} cached)`);
    } catch (e) {
        log(null, 'error', `   Font init failed: ${e.message}`);
    }

    if (!ffmpegOk) log(null, 'warn', '⚠️  FFmpeg not found in PATH.');
    if (!R2_ACCOUNT_ID) log(null, 'warn', '⚠️  R2 credentials not fully configured.');

    log(null, 'info', `====================================`);
});

// Graceful Shutdown
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

function shutdown() {
    log(null, 'info', 'Shutting down...');
    server.close(() => {
        log(null, 'info', 'Server closed.');
        process.exit(0);
    });
}
