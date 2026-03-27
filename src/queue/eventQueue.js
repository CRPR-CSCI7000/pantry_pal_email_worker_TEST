"use strict";

const logger = require("../config/logger");

/**
 * Simple in-process async queue with retry support.
 *
 * In production you would swap this for SQS, RabbitMQ, Redis streams, etc.
 * The interface here is kept intentionally simple so that swap is a 1-file change.
 */

const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 2000;

class EventQueue {
  constructor() {
    this._queue = [];
    this._processing = false;
  }

  /**
   * Push an event envelope onto the queue.
   * @param {object} envelope - validated event envelope
   * @param {string} [requestId] - optional tracing ID
   */
  enqueue(envelope, requestId) {
    this._queue.push({
      envelope,
      requestId,
      attempts: 0,
      enqueuedAt: Date.now(),
    });
    logger.debug("Event enqueued", {
      event_type: envelope.event_type,
      requestId,
      queueLength: this._queue.length,
    });
    this._drain();
  }

  /** Queue depth — useful for health checks. */
  get depth() {
    return this._queue.length;
  }

  async _drain() {
    if (this._processing) return;
    this._processing = true;

    while (this._queue.length > 0) {
      const job = this._queue.shift();
      await this._process(job);
    }

    this._processing = false;
  }

  async _process(job) {
    const { envelope, requestId } = job;
    job.attempts += 1;

    try {
      const { routeEvent } = require("../handlers/eventRouter");
      const result = await routeEvent(envelope);
      logger.info("Event processed", {
        event_type: envelope.event_type,
        requestId,
        attempts: job.attempts,
        handled: result.handled,
      });
    } catch (err) {
      logger.error("Event processing failed", {
        event_type: envelope.event_type,
        requestId,
        attempts: job.attempts,
        error: err.message,
      });

      if (job.attempts < MAX_RETRIES) {
        logger.info("Scheduling retry", {
          event_type: envelope.event_type,
          requestId,
          nextAttempt: job.attempts + 1,
          delayMs: RETRY_DELAY_MS * job.attempts,
        });
        await new Promise((r) => setTimeout(r, RETRY_DELAY_MS * job.attempts));
        this._queue.unshift(job); // re-queue at front for next drain cycle
      } else {
        logger.error("Event exhausted retries — dropping", {
          event_type: envelope.event_type,
          requestId,
        });
      }
    }
  }
}

// Singleton queue instance
const queue = new EventQueue();

module.exports = queue;
