/**
 * @module schema
 * @description Effects API schema — self-documenting reference for /effects endpoint.
 */

const { COLOR_PRESETS } = require('./presets');
const { FONT_CATALOG, FONT_CATEGORIES } = require('./fonts');

/** Full schema for all supported effects with types, ranges, and defaults. */
const EFFECTS_SCHEMA = {
    color: {
        description: 'Color and visual adjustments',
        params: {
            brightness: { type: 'number', range: [-1.0, 1.0], default: 0, desc: 'Brightness adjustment' },
            contrast: { type: 'number', range: [0.0, 3.0], default: 1, desc: 'Contrast multiplier' },
            saturation: { type: 'number', range: [0.0, 3.0], default: 1, desc: 'Saturation multiplier' },
            gamma: { type: 'number', range: [0.1, 10.0], default: 1, desc: 'Gamma correction' },
            preset: { type: 'string', values: Object.keys(COLOR_PRESETS), desc: 'Color preset (overrides individual values)' },
        },
    },
    zoom: {
        description: 'Zoom & Pan (Ken Burns effect)',
        params: {
            type: { type: 'string', values: ['in', 'out', 'pan_left', 'pan_right'], default: 'in', desc: 'Zoom/pan direction' },
            intensity: { type: 'number', range: [0.05, 0.5], default: 0.2, desc: 'How much to zoom (0.2 = 20%)' },
        },
    },
    crop: {
        description: 'Crop and resize video',
        params: {
            aspect_ratio: { type: 'string', values: ['9:16', '16:9', '1:1', '4:5', '4:3'], desc: 'Target aspect ratio' },
            width: { type: 'number', desc: 'Target width in pixels (optional)' },
            height: { type: 'number', desc: 'Target height in pixels (optional)' },
            position: { type: 'string', values: ['center', 'top', 'bottom'], default: 'center', desc: 'Crop anchor position' },
        },
    },
    speed: {
        description: 'Playback speed control',
        type: 'number',
        range: [0.25, 4.0],
        default: 1.0,
        desc: '0.5 = half speed, 2.0 = double speed',
    },
    fade: {
        description: 'Fade in/out transitions (video + audio synced)',
        params: {
            in: { type: 'number', range: [0, 5], default: 0, desc: 'Fade-in duration (seconds)' },
            out: { type: 'number', range: [0, 5], default: 0, desc: 'Fade-out duration (seconds)' },
        },
    },
    watermark: {
        description: 'Image/logo overlay',
        params: {
            url: { type: 'string', desc: 'Image URL (PNG/JPG)' },
            position: { type: 'string', values: ['top_left', 'top_right', 'bottom_left', 'bottom_right', 'center'], default: 'bottom_right' },
            opacity: { type: 'number', range: [0.0, 1.0], default: 0.7, desc: 'Watermark opacity' },
            scale: { type: 'number', range: [0.05, 0.5], default: 0.15, desc: 'Scale relative to video width' },
        },
    },
    subtitles: {
        description: 'Animated subtitles from SRT (CapCut style)',
        params: {
            url: { type: 'string', desc: 'URL to SRT file' },
            content: { type: 'string', desc: 'Raw SRT content (utf-8 string)' },
            font_family: { type: 'string', values: Object.keys(FONT_CATALOG), default: 'poppins_bold', desc: 'Font family' },
            font_size: { type: 'number', range: [10, 100], default: 24, desc: 'Font size' },
            font_color: { type: 'string', default: 'white', desc: 'Font color (hex)' },
            stroke_color: { type: 'string', default: 'black', desc: 'Outline color (hex)' },
            animation: { type: 'string', values: ['none', 'pop', 'slide_up', 'karaoke', 'fade'], default: 'pop', desc: 'Animation style' },
        },
    },
    text: {
        description: 'Static text overlay (simple title/watermark)',
        params: {
            font_family: { type: 'string', values: Object.keys(FONT_CATALOG), default: 'poppins_regular', desc: 'Font family name' },
            font_size: { type: 'number', range: [10, 120], default: 28, desc: 'Font size in pixels' },
            font_color: { type: 'string', default: 'white', desc: 'Font color (name or hex)' },
            stroke_color: { type: 'string', default: 'black', desc: 'Text stroke/border color' },
            stroke_width: { type: 'number', range: [0, 10], default: 2, desc: 'Stroke width (0 = none)' },
            shadow_color: { type: 'string', default: null, desc: 'Shadow color (null = none)' },
            shadow_x: { type: 'number', range: [0, 20], default: 2, desc: 'Shadow X offset' },
            shadow_y: { type: 'number', range: [0, 20], default: 2, desc: 'Shadow Y offset' },
            bg_color: { type: 'string', default: null, desc: 'Highlight box color (null = none)' },
            bg_opacity: { type: 'number', range: [0.0, 1.0], default: 0.6, desc: 'Highlight box opacity' },
            bg_padding: { type: 'number', range: [0, 30], default: 10, desc: 'Highlight box padding (px)' },
            position: { type: 'string', values: ['bottom_center', 'top_center', 'center', 'bottom_left', 'bottom_right', 'top_left', 'top_right'], default: 'bottom_center', desc: 'Text position' },
            line_spacing: { type: 'number', range: [0, 30], default: 5, desc: 'Line spacing (px)' },
            animation: { type: 'string', values: ['none', 'fade_in', 'slide_up'], default: 'none', desc: 'Text entry animation' },
        },
    },
    audio: {
        description: 'Audio effects',
        params: {
            volume: { type: 'number', range: [0.0, 3.0], default: 1.0, desc: 'Audio volume multiplier' },
            fade_in: { type: 'number', range: [0, 5], default: 0, desc: 'Audio-only fade-in' },
            fade_out: { type: 'number', range: [0, 5], default: 0, desc: 'Audio-only fade-out' },
            normalize: { type: 'boolean', default: false, desc: 'Apply loudness normalization' },
        },
    },
    output: {
        description: 'Output encoding settings',
        params: {
            quality: { type: 'string', values: ['low', 'medium', 'high', 'ultra'], default: 'medium', desc: 'Encoding quality' },
            max_duration: { type: 'number', desc: 'Trim output to N seconds' },
        },
    },
};

module.exports = { EFFECTS_SCHEMA };
