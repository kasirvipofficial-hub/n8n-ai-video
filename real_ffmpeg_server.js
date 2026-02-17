require('dotenv').config();
const express = require('express');
const ffmpeg = require('fluent-ffmpeg');
const axios = require('axios');
const AWS = require('aws-sdk'); // Using v2 as installed, functionally equivalent for this scope
const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

const app = express();
app.use(express.json());

// --- Configuration ---
const PORT = process.env.PORT || 3000;
const R2_BUCKET_NAME = process.env.R2_BUCKET_NAME || 'telegramvideoai';
const R2_ACCOUNT_ID = process.env.R2_ACCOUNT_ID;
const R2_ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID;
const R2_SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY;
const R2_PUBLIC_URL_BASE = process.env.R2_PUBLIC_URL_BASE;

// Font path for text overlay (Windows default)
const FONT_PATH = 'C:/Windows/Fonts/arial.ttf';

// Configure S3 Client for R2
const s3 = new AWS.S3({
    endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    accessKeyId: R2_ACCESS_KEY_ID,
    secretAccessKey: R2_SECRET_ACCESS_KEY,
    signatureVersion: 'v4',
    region: 'auto'
});

// Helper: Download File
async function downloadFile(url, outputPath) {
    const writer = fs.createWriteStream(outputPath);
    const response = await axios({
        url,
        method: 'GET',
        responseType: 'stream'
    });
    response.data.pipe(writer);
    return new Promise((resolve, reject) => {
        writer.on('finish', resolve);
        writer.on('error', reject);
    });
}

// Helper: Upload File to R2
async function uploadToR2(filePath, fileName, contentType = 'video/mp4') {
    const fileContent = fs.readFileSync(filePath);
    const params = {
        Bucket: R2_BUCKET_NAME,
        Key: fileName,
        Body: fileContent,
        ContentType: contentType
    };
    return s3.upload(params).promise();
}

// --- Routes ---

app.get('/', (req, res) => {
    res.send('<h1>FFmpeg Server Berjalan ✅</h1><p>Status: Ready to process videos.</p>');
});

app.post('/render', async (req, res) => {
    // Strict payload structure check
    const { job_id, project_id, video_url, audio_url, text_overlay, callback_url } = req.body;

    if (!job_id || !video_url || !audio_url) {
        return res.status(400).json({ error: 'Missing required fields: job_id, video_url, audio_url' });
    }

    // Generate unique ID for this job if not provided or just use job_id
    const jobId = job_id || uuidv4();

    // Paths
    const tempDir = path.join(__dirname, 'temp');
    if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir);

    const videoPath = path.join(tempDir, `${jobId}_video.mp4`);
    const audioPath = path.join(tempDir, `${jobId}_audio.mp3`);
    const outputPath = path.join(tempDir, `${jobId}_output.mp4`); // Final output
    const finalFileName = `final/${project_id}/final_${jobId}.mp4`;

    // Respond immediately (Async Worker Pattern)
    res.json({
        message: 'Render job queued',
        job_id: jobId,
        status: 'processing'
    });

    console.log(`[${jobId}] Processing Project: ${project_id}`);

    try {
        // 1. Download Assets
        console.log(`[${jobId}] Downloading assets...`);
        await Promise.all([
            downloadFile(video_url, videoPath),
            downloadFile(audio_url, audioPath)
        ]);

        // 2. Process with FFmpeg
        console.log(`[${jobId}] Rendering with overlay: "${text_overlay || 'None'}"...`);

        await new Promise((resolve, reject) => {
            let command = ffmpeg()
                .input(videoPath)
                .input(audioPath);

            // Complex Filter Logic
            const filters = [];

            // A. Text Overlay (if provided)
            if (text_overlay) {
                // Sanitize text for FFmpeg
                const sanitizedText = text_overlay.replace(/:/g, '\\:').replace(/'/g, '');
                // Draw text: Bottom center, white with black border
                filters.push({
                    filter: 'drawtext',
                    options: {
                        fontfile: FONT_PATH,
                        text: sanitizedText,
                        fontsize: 34,
                        fontcolor: 'white',
                        borderw: 2,
                        bordercolor: 'black',
                        x: '(w-text_w)/2',
                        y: 'h-(text_h*2)' // Near bottom
                    },
                    outputs: 'video_out'
                });
            }

            if (filters.length > 0) {
                command.complexFilter(filters, text_overlay ? 'video_out' : undefined);
            }

            command
                .outputOptions([
                    '-c:v libx264',    // Re-encode video (required for burn-in text)
                    '-preset fast',
                    '-c:a aac',        // Encode audio
                    '-map 0:v:0',      // Map original video (or filtered one automatically if filter used)
                    '-map 1:a:0',      // Map new audio
                    '-shortest',       // Cut to shortest stream
                    '-movflags +faststart' // Optimize for web streaming
                ])
                .save(outputPath)
                .on('end', resolve)
                .on('error', reject);
        });

        // 3. Upload Result to R2
        console.log(`[${jobId}] Uploading result to R2...`);
        await uploadToR2(outputPath, finalFileName);
        const publicUrl = `${R2_PUBLIC_URL_BASE}/${finalFileName}`;
        console.log(`[${jobId}] Upload success: ${publicUrl}`);

        // 4. Cleanup Temp Files
        try {
            if (fs.existsSync(videoPath)) fs.unlinkSync(videoPath);
            if (fs.existsSync(audioPath)) fs.unlinkSync(audioPath);
            if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath);
        } catch (e) {
            console.warn(`[${jobId}] Cleanup warning: ${e.message}`);
        }

        // 5. Send Webhook Callback
        if (callback_url) {
            console.log(`[${jobId}] Sending callback to n8n...`);
            await axios.post(callback_url, {
                job_id,
                project_id,
                status: 'success',
                video_url: publicUrl,
                metadata: {
                    resolution: '1080x1920', // Example metadata
                    duration_sec: 0 // Ideally calculate this
                }
            });
        }

    } catch (error) {
        console.error(`[${jobId}] Error:`, error);

        // Cleanup on error
        if (fs.existsSync(videoPath)) fs.unlinkSync(videoPath);
        if (fs.existsSync(audioPath)) fs.unlinkSync(audioPath);
        if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath);

        // Error Callback
        if (callback_url) {
            try {
                await axios.post(callback_url, {
                    job_id,
                    project_id,
                    status: 'error',
                    error_message: error.message
                });
            } catch (e) {
                console.error(`[${jobId}] Failed to send error callback.`);
            }
        }
    }
});

app.listen(PORT, () => {
    console.log(`Advanced FFmpeg Worker running on http://localhost:${PORT}`);
    console.log(`R2 Bucket: ${R2_BUCKET_NAME}`);
});
