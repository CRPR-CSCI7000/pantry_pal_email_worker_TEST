'use strict';

const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { validateEvent } = require('../models/eventSchema');
const queue = require('../queue/eventQueue');
const logger = require('../config/logger');

const router = express.Router();

/**
 * POST /events
 *
 * Accepts an event envelope from the Django backend, validates it against
 * the schema contract, and enqueues it for async processing.
 *
 * Returns 202 immediately — processing happens in the background.
 * Returns 400 for schema violations.
 */
router.post('/', (req, res) => {
  const requestId = uuidv4();
  const body = req.body;

  logger.info('Received event', {
    requestId,
    event_type: body?.event_type,
    schema_version: body?.schema_version,
  });

  // Validate against the schema contract
  const { valid, error } = validateEvent(body);
  if (!valid) {
    logger.warn('Event rejected — schema validation failed', { requestId, error });
    return res.status(400).json({
      success: false,
      error,
      requestId,
    });
  }

  // Enqueue for async processing — respond immediately
  queue.enqueue(body, requestId);

  return res.status(202).json({
    success: true,
    message: 'Event accepted',
    requestId,
    event_type: body.event_type,
  });
});

module.exports = router;
