/**
 * @module render
 * @description Main render pipeline — download assets → build filters → FFmpeg → upload → callback.
 * This is the core async job handler for POST /render.
 */

const ffmpeg = require('fluent-ffmpeg');
const axios = require('axios');
const fs = require('fs');
const path = require('path');

const { TEMP_DIR, R2_PUBLIC_URL_BASE } = require('./config');
const { log } = require('./logger');
const { downloadFile, uploadToR2, cleanupFiles, getAvailableDiskSpace } = require('./storage');
const { generateAss } = require('./subtitles');
const { escapeFfmpegPath } = require('./filters/text');
const { FONTS_DIR } = require('./fonts');

/**
 * Execute a render job asynchronously.
 * Downloads assets, applies effects, renders with FFmpeg, uploads to R2, and fires callback.
 */
async function handleRender({
    jobId, project_id,
    timeline, // V2
    video_url, audio_url, text_overlay, subtitle_url, subtitle_content, effects, // V1
    callback_url, setJobStatus, serverUrl
}) {
    // File paths
    const outputPath = path.join(TEMP_DIR, `${jobId}_output.mp4`);
    const finalFileName = `final/${project_id}/final_${jobId}.mp4`;
    let tempFiles = []; // Track files for cleanup

    log(jobId, 'info', `=== RENDER JOB STARTED (${timeline ? 'V2' : 'V1'}) ===`);
    log(jobId, 'info', `Project: ${project_id}`);

    try {
        // ── Pre-flight checks ──────────────────────────────────
        let freeSpace = 0;
        try {
            freeSpace = await getAvailableDiskSpace(TEMP_DIR);
        } catch (e) {
            console.warn("Disk check failed, proceeding anyway", e);
            freeSpace = 1024 * 1024 * 1024; // Assume 1GB free
        }

        if (freeSpace < 200 * 1024 * 1024) throw new Error(`Insufficient disk space: ${(freeSpace / 1024 / 1024).toFixed(0)} MB free`);

        // ── V2: TIMELINE RENDER ────────────────────────────────
        if (timeline) {
            log(jobId, 'info', 'Step 1/3: Processing V2 Timeline...');
            setJobStatus(jobId, 'downloading', { project_id, progress: 10 });

            // 1. Validate & Download Assets
            const assetMap = new Map(); // url -> localPath
            const downloads = [];

            for (const item of timeline) {
                if (item.source_url && !assetMap.has(item.source_url)) {
                    // Detect extension or default
                    let ext = '.mp4';
                    try { ext = path.extname(new URL(item.source_url).pathname); } catch (e) { }
                    if (!ext && item.type === 'audio') ext = '.mp3';

                    const localPath = path.join(TEMP_DIR, `${jobId}_asset_${assetMap.size}${ext}`);
                    assetMap.set(item.source_url, localPath);
                    tempFiles.push(localPath);
                    downloads.push(downloadFile(item.source_url, localPath));
                }
            }
            await Promise.all(downloads);
            log(jobId, 'info', `Downloaded ${downloads.length} assets.`);

            // 2. Prepare Subtitles (if any)
            let subtitleFilter = null;
            const subItems = timeline.filter(t => t.type === 'subtitle');
            if (subItems.length > 0) {
                const subs = subItems.map(s => ({
                    start: s.start,
                    end: s.end,
                    text: s.text
                }));
                // Use style from first item or default
                const subOptions = {
                    animation: subItems[0].style || 'pop',
                    font_size: 24,
                    font_color: '#FFFFFF',
                    stroke_color: '#000000'
                };

                const assContent = generateAss(subs, subOptions, 1080, 1920, 1.0);
                const assPath = path.join(TEMP_DIR, `${jobId}_subs.ass`);
                fs.writeFileSync(assPath, assContent);
                tempFiles.push(assPath);

                subtitleFilter = `subtitles='${escapeFfmpegPath(assPath)}':fontsdir='${escapeFfmpegPath(FONTS_DIR)}'`;
            }

            // 3. Build Complex Filter & Render
            log(jobId, 'info', 'Step 2/3: Rendering V2 Timeline...');
            setJobStatus(jobId, 'rendering', { project_id, progress: 30 });

            await new Promise((resolve, reject) => {
                const cmd = ffmpeg();
                let filterComplex = [];
                let inputCount = 0;

                // Segments
                const videoSegments = timeline.filter(t => t.type === 'video');
                const audioSegments = timeline.filter(t => t.type === 'audio');

                // Inputs & Trimming
                const vStreams = [];
                videoSegments.forEach((seg, idx) => {
                    const inputPath = assetMap.get(seg.source_url);
                    cmd.input(inputPath);

                    const duration = seg.end - seg.start;
                    // Trim video
                    filterComplex.push(`[${inputCount}:v]trim=${seg.start}:${seg.end},setpts=PTS-STARTPTS[v${idx}]`);
                    vStreams.push(`[v${idx}]`);
                    inputCount++;
                });

                // Concatenate Video
                let lastVideoStream = '[outv]';
                if (vStreams.length > 0) {
                    filterComplex.push(`${vStreams.join('')}concat=n=${vStreams.length}:v=1:a=0[vconcat]`);
                    lastVideoStream = '[vconcat]';

                    // Apply Subtitles if present
                    if (subtitleFilter) {
                        filterComplex.push(`${lastVideoStream}${subtitleFilter}[vsubs]`);
                        lastVideoStream = '[vsubs]';
                    } else {
                        // Rename for consistency if no subs
                        filterComplex.push(`${lastVideoStream}null[vfinal]`);
                        lastVideoStream = '[vfinal]';
                    }
                    cmd.outputOptions(['-map', lastVideoStream]);
                }

                // Audio Mixing
                const aStreams = [];
                audioSegments.forEach((seg, idx) => {
                    const inputPath = assetMap.get(seg.source_url);
                    cmd.input(inputPath);

                    // Delay audio: [1:a]adelay=5000|5000[a0]
                    const delayMs = Math.round((seg.start || 0) * 1000);
                    filterComplex.push(`[${inputCount}:a]adelay=${delayMs}|${delayMs}[a${idx}]`);
                    aStreams.push(`[a${idx}]`);
                    inputCount++;
                });

                if (aStreams.length > 0) {
                    if (aStreams.length === 1) {
                        // No mix needed for single audio
                        cmd.outputOptions(['-map', aStreams[0]]);
                    } else {
                        filterComplex.push(`${aStreams.join('')}amix=inputs=${aStreams.length}:duration=longest[outa]`);
                        cmd.outputOptions(['-map', '[outa]']);
                    }
                }

                if (filterComplex.length > 0) {
                    cmd.complexFilter(filterComplex);
                }

                cmd.outputOptions(getOutputOptions({}));

                cmd.save(outputPath)
                    .on('end', resolve)
                    .on('error', (err, stdout, stderr) => {
                        log(jobId, 'error', `FFmpeg Error: ${err.message}`);
                        log(jobId, 'error', `Stderr: ${stderr}`);
                        reject(err);
                    })
                    .run();
            });

        }
        // ── V1: LEGACY RENDER (Restored) ───────────────────────
        else {
            log(jobId, 'info', 'Step 1/4: Downloading assets (V1)...');
            const videoPath = path.join(TEMP_DIR, `${jobId}_video.mp4`);
            const audioPath = path.join(TEMP_DIR, `${jobId}_audio.mp3`);
            tempFiles.push(videoPath, audioPath);

            await Promise.all([
                downloadFile(video_url, videoPath),
                downloadFile(audio_url, audioPath)
            ]);

            // Handle Subtitles (V1)
            let srtPath = null;
            if (subtitle_url) {
                srtPath = path.join(TEMP_DIR, `${jobId}.srt`);
                tempFiles.push(srtPath);
                await downloadFile(subtitle_url, srtPath);
            } else if (subtitle_content) {
                srtPath = path.join(TEMP_DIR, `${jobId}.srt`);
                tempFiles.push(srtPath);
                fs.writeFileSync(srtPath, subtitle_content);
            }

            // Get Metadata
            const videoMeta = await getVideoMetadata(videoPath);

            // Build Filter Chain (V1)
            const { videoFilters, audioFilters, needsWatermarkInput } = buildFilterChain(effects, videoMeta);

            // Subtitle Filter (V1)
            if (srtPath) {
                const srtContent = fs.readFileSync(srtPath, 'utf8');
                const { filter: subFilter, assFilePath } = buildSubtitleFilter(srtContent, effects?.subtitles || {}, TEMP_DIR, jobId, videoMeta, effects?.speed || 1.0);
                if (subFilter) {
                    videoFilters.push(subFilter);
                    if (assFilePath) tempFiles.push(assFilePath);
                }
            }

            // Text Overlay (V1)
            if (text_overlay) {
                const txtFilter = buildTextFilter(text_overlay, { ...videoMeta, ...effects?.text });
                if (txtFilter) videoFilters.push(txtFilter);
            }

            // Render
            log(jobId, 'info', 'Step 2/4: Rendering (V1)...');
            setJobStatus(jobId, 'rendering', { project_id, progress: 30 });

            await new Promise((resolve, reject) => {
                const cmd = ffmpeg()
                    .input(videoPath)
                    .input(audioPath);

                // Construct complex filter string
                let complexFilter = [];
                let vL = '[0:v]';
                let aL = '[1:a]';

                if (videoFilters.length > 0) {
                    complexFilter.push(`${vL}${videoFilters.join(',')}[vOut]`);
                    cmd.outputOptions(['-map', '[vOut]']);
                } else {
                    cmd.outputOptions(['-map', '0:v']);
                }

                if (audioFilters.length > 0) {
                    complexFilter.push(`${aL}${audioFilters.join(',')}[aOut]`);
                    cmd.outputOptions(['-map', '[aOut]']);
                } else {
                    cmd.outputOptions(['-map', '1:a']);
                }

                if (complexFilter.length > 0) cmd.complexFilter(complexFilter);

                cmd.outputOptions(getOutputOptions(effects || {}));

                cmd.save(outputPath)
                    .on('end', resolve)
                    .on('error', reject)
                    .run();
            });

            // V1 uploads to R2
            log(jobId, 'info', 'Step 3/4: Uploading V1 result to R2...');
            setJobStatus(jobId, 'uploading', { project_id, progress: 80 });

            await uploadToR2(outputPath, finalFileName);
            const publicUrl = `${R2_PUBLIC_URL_BASE}/${finalFileName}`;

            log(jobId, 'info', `Job Done. URL: ${publicUrl}`);
            setJobStatus(jobId, 'done', { project_id, video_url: publicUrl, progress: 100 });

            if (callback_url) {
                await sendCallbackWithBackoff(jobId, callback_url, { job_id: jobId, project_id, status: 'success', video_url: publicUrl });
            }

            cleanupFiles(outputPath, ...tempFiles);
            return;
        }

        // ── Step 3: V2 Finalization (No R2 Upload) ─────────────
        log(jobId, 'info', 'Step 3/3: Finalizing V2 (Local Download)...');

        let metadata = { duration_sec: 0, file_size: 0 };
        try {
            const m = await getVideoMetadata(outputPath);
            metadata = { duration_sec: m.duration_sec, file_size: m.file_size };
        } catch (e) { console.warn(e); }

        const downloadUrl = `${serverUrl}/download/${path.basename(outputPath)}`;
        log(jobId, 'info', `Render success. Download: ${downloadUrl}`);

        setJobStatus(jobId, 'done', { project_id, download_url: downloadUrl, metadata, progress: 100 });

        if (callback_url) {
            await sendCallbackWithBackoff(jobId, callback_url, {
                job_id: jobId, project_id, status: 'success', download_url: downloadUrl, metadata
            });
        }

        // V2 cleanup (keep output for a while)
        cleanupFiles(...tempFiles);

    } catch (error) {
        log(jobId, 'error', `RENDER FAILED: ${error.message}`);
        setJobStatus(jobId, 'error', { project_id, error: error.message });
        cleanupFiles(outputPath, ...tempFiles);
        if (callback_url) axios.post(callback_url, { job_id: jobId, project_id, status: 'error', error: error.message }).catch(() => { });
    }
}

/**
 * Send callback with exponential backoff retry.
 * Retries: 0s, 5s, 15s (3 attempts total)
 */
async function sendCallbackWithBackoff(jobId, url, payload) {
    const maxRetries = 3;
    let attempt = 0;

    while (attempt < maxRetries) {
        try {
            log(jobId, 'info', `Sending callback to ${url} (attempt ${attempt + 1})`);
            await axios.post(url, payload, { timeout: 30000 });
            log(jobId, 'info', 'Callback sent successfully.');
            return;
        } catch (err) {
            attempt++;
            log(jobId, 'warn', `Callback failed: ${err.message}`);
            if (attempt >= maxRetries) {
                log(jobId, 'error', 'Callback gave up after max retries.');
                return;
            }
            const delay = attempt * 5000;
            await sleep(delay);
        }
    }
}

module.exports = { handleRender };
