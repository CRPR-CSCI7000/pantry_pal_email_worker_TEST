'use strict';

const express = require('express');
const rateLimit = require('express-rate-limit');

const config = require('./config');
const logger = require('./config/logger');
const { validateEvent } = require('./models/eventSchema');
const { routeEvent } = require('./handlers/eventRouter');

const app = express();

// ─── Middleware ───────────────────────────────────────────────────────────────

app.use(express.json({ limit: '1mb' }));

// Simple API key auth — all routes require X-API-Key header
app.use((req, res, next) => {
  // Health check is public
  if (req.path === '/health') return next();

  const key = req.headers['x-api-key'];
  if (!config.apiKey) {
    // No key configured — open in dev mode
    return next();
  }
  if (key !== config.apiKey) {
    return res.status(401).json({ success: false, error: 'Unauthorized' });
  }
  next();
});

// Rate limiting
const limiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
});
app.use(limiter);

// ─── Routes ───────────────────────────────────────────────────────────────────

/**
 * GET /health
 * Liveness probe — no auth required.
 */
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', service: 'pantrypal-email-worker', version: '1.0.0' });
});

/**
 * POST /events
 *
 * Main ingest endpoint. Receives event envelopes from the Django backend.
 *
 * Request body must match the envelope schema defined in models/eventSchema.js.
 * Schema contract v1.0.0 — see eventSchema.js for full documentation.
 *
 * Responses:
 *   202 Accepted  — event received, validated, and queued for processing
 *   400 Bad Request — validation failure (schema mismatch, missing fields, bad version)
 *   401 Unauthorized — missing or invalid API key
 *   500 Internal Server Error — unexpected handler error
 */
app.post('/events', async (req, res) => {
  const body = req.body;

  logger.debug('Received event', { event_type: body?.event_type });

  // Validate envelope + payload against schema contract
  const { valid, error } = validateEvent(body);
  if (!valid) {
    logger.warn('Event validation failed', { error, body });
    return res.status(400).json({ success: false, error });
  }

  // Respond immediately with 202 — process async (fire-and-forget from caller's perspective)
  res.status(202).json({ success: true, message: 'Event accepted' });

  // Route to handler asynchronously — errors are logged but don't affect the 202
  try {
    const { handled } = await routeEvent(body);
    if (!handled) {
      logger.warn('Event not handled', { event_type: body.event_type });
    }
  } catch (err) {
    logger.error('Event handler error', { event_type: body.event_type, error: err.message });
  }
});

// ─── 404 catch-all ───────────────────────────────────────────────────────────

app.use((_req, res) => {
  res.status(404).json({ success: false, error: 'Not found' });
});

// ─── Start ────────────────────────────────────────────────────────────────────

if (require.main === module) {
  app.listen(config.port, () => {
    logger.info(`pantrypal-email-worker listening on port ${config.port}`);
  });
}

module.exports = app; // exported for testing
