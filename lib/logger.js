/**
 * @module logger
 * @description Structured logging with timestamps and job context.
 */

/**
 * Log a message with timestamp, level, and optional job ID.
 * @param {string|null} jobId - Job identifier (null for system logs)
 * @param {'info'|'warn'|'error'|'debug'} level - Log level
 * @param {string} message - Log message
 */
function log(jobId, level, message) {
    const ts = new Date().toISOString();
    const prefix = jobId
        ? `[${ts}] [${level.toUpperCase()}] [${jobId}]`
        : `[${ts}] [${level.toUpperCase()}]`;
    console.log(`${prefix} ${message}`);
}

module.exports = { log };
