'use strict';

const config = require('../config');
const logger = require('../config/logger');

/**
 * API key middleware.
 * Expects `X-API-Key: <key>` header on every request.
 * Returns 401 if missing or invalid.
 */
function apiKeyAuth(req, res, next) {
  // Skip auth if no key is configured (dev convenience only)
  if (!config.apiKey) {
    logger.warn('API_KEY not set — auth is disabled. Do not use this in production.');
    return next();
  }

  const provided = req.headers['x-api-key'];
  if (!provided || provided !== config.apiKey) {
    logger.warn('Rejected request — invalid or missing API key', {
      ip: req.ip,
      path: req.path,
    });
    return res.status(401).json({ success: false, error: 'Unauthorized' });
  }

  next();
}

module.exports = { apiKeyAuth };
