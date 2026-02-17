/**
 * Test FFmpeg Server — Text Font & Highlight Effects
 * Tests: impact bold font, yellow text, black highlight box, cinematic color
 */

const https = require('https');
const http = require('http');

const SUPABASE_PROJECT_ID = 'eyzrcazuehzfsrlnasun';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImV5enJjYXp1ZWh6ZnNybG5hc3VuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzExNTI5NjcsImV4cCI6MjA4NjcyODk2N30.MvZrMlOWVYsdfb6S7LJvMzliICLFazD9AddsfA0dlLU';
const FFMPEG_SERVER = 'http://localhost:3000';

function supabaseGet(path) {
    return new Promise((resolve, reject) => {
        const req = https.request({
            hostname: `${SUPABASE_PROJECT_ID}.supabase.co`, path: `/rest/v1/${path}`, method: 'GET',
            headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}`, 'Content-Type': 'application/json' }
        }, (res) => {
            let data = ''; res.on('data', c => data += c);
            res.on('end', () => res.statusCode < 300 ? resolve(JSON.parse(data)) : reject(new Error(`${res.statusCode}`)));
        });
        req.on('error', reject); req.end();
    });
}

function httpPost(url, body) {
    return new Promise((resolve, reject) => {
        const u = new URL(url), d = JSON.stringify(body);
        const req = http.request({
            hostname: u.hostname, port: u.port, path: u.pathname, method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(d) }
        }, (res) => { let data = ''; res.on('data', c => data += c); res.on('end', () => resolve({ status: res.statusCode, data: JSON.parse(data) })); });
        req.on('error', reject); req.write(d); req.end();
    });
}

function httpGet(url) {
    return new Promise((resolve, reject) => {
        const u = new URL(url);
        const req = http.request({ hostname: u.hostname, port: u.port, path: u.pathname, method: 'GET' }, (res) => {
            let data = ''; res.on('data', c => data += c); res.on('end', () => resolve(JSON.parse(data)));
        });
        req.on('error', reject); req.end();
    });
}

async function main() {
    console.log('=== FFmpeg Text Font & Highlight Test ===\n');

    // Find project
    const projects = await supabaseGet('projects?select=*&order=created_at.desc&limit=10');
    const assets = await supabaseGet('assets?select=*&order=created_at.desc&limit=50');
    const byProj = {};
    for (const a of assets) { if (!byProj[a.project_id]) byProj[a.project_id] = []; byProj[a.project_id].push(a); }

    let target, video, audio;
    for (const p of projects) {
        const pa = byProj[p.id] || [];
        const v = pa.find(a => a.type === 'raw_video' && a.r2_url);
        const a = pa.find(a => a.type === 'voice_over' && a.r2_url);
        if (v && a) { target = p; video = v; audio = a; break; }
    }
    if (!target) { console.log('No project found.'); return; }
    console.log(`Project: ${target.id}\n`);

    const jobId = `text-fx-${Date.now()}`;
    const payload = {
        job_id: jobId,
        project_id: target.id,
        video_url: video.r2_url,
        audio_url: audio.r2_url,
        text_overlay: 'Testing Poppins Bold font system!',
        effects: {
            color: { preset: 'cinematic' },
            text: {
                font_family: 'poppins_bold',
                font_size: 48,
                font_color: 'white',
                stroke_color: 'black',
                stroke_width: 3,
                bg_color: 'black',
                bg_opacity: 0.6,
                bg_padding: 20,
                position: 'center',
                shadow_color: 'black',
                shadow_x: 4,
                shadow_y: 4,
                animation: 'slide_up'
            },
            fade: { in: 0.5, out: 0.5 },
            output: { quality: 'medium' }
        }
    };

    console.log('Text Effects:');
    console.log('  Font: Poppins Bold 48px');
    console.log('  Highlight: Black box @ 60%');
    console.log('  Animation: slide_up\n');

    const r = await httpPost(`${FFMPEG_SERVER}/render`, payload);
    console.log(`Render queued: ${r.data.status}\n`);

    // Poll
    for (let t = 0; t < 600; t += 2) {
        await new Promise(r => setTimeout(r, 2000));
        const s = await httpGet(`${FFMPEG_SERVER}/status/${jobId}`);
        process.stdout.write(`\r[${t + 2}s] Status: ${s.status} ${s.progress ? `(${s.progress}%)` : ''}   `);
        if (s.status === 'done') {
            console.log(`\n\n✅ DONE!`);
            console.log(`Video: ${s.video_url}`);
            console.log(`Resolution: ${s.metadata?.resolution}`);
            console.log(`Size: ${(s.metadata?.file_size / 1024 / 1024).toFixed(2)} MB`);
            return;
        }
        if (s.status === 'error') { console.log(`\n❌ Error: ${s.error}`); return; }
    }
}

main().catch(e => { console.error('Fatal:', e); process.exit(1); });
