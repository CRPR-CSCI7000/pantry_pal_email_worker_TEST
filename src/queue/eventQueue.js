"use strict";

const logger = require("../config/logger");

/**
 * In-process async queue with retry, dead-letter logging, and stale-job eviction.
 *
 * Swap this for SQS / RabbitMQ / Redis streams in production —
 * the enqueue/depth interface is intentionally stable.
 */

const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 2000;
const MAX_JOB_AGE_MS = 5 * 60 * 1000; // 5 minutes — stale jobs are evicted

class EventQueue {
  constructor() {
    this._queue = [];
    this._processing = false;
    this._deadLetters = [];
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

  /** Current queue depth — exposed on /health. */
  get depth() {
    return this._queue.length;
  }

  /** Dead-letter count — jobs that exhausted all retries. */
  get deadLetterCount() {
    return this._deadLetters.length;
  }

  /** Evict jobs older than MAX_JOB_AGE_MS that haven't started processing. */
  _evictStale() {
    const now = Date.now();
    const before = this._queue.length;
    this._queue = this._queue.filter((job) => {
      const age = now - job.enqueuedAt;
      if (age > MAX_JOB_AGE_MS) {
        logger.warn("Evicting stale job", {
          event_type: job.envelope.event_type,
          requestId: job.requestId,
          ageMs: age,
        });
        this._deadLetters.push({ ...job, evictedAt: now, reason: "stale" });
        return false;
      }
      return true;
    });
    if (this._queue.length < before) {
      logger.info(`Evicted ${before - this._queue.length} stale job(s)`);
    }
  }

  async _drain() {
    if (this._processing) return;
    this._processing = true;
    this._evictStale();

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
        const delayMs = RETRY_DELAY_MS * job.attempts;
        logger.info("Scheduling retry", {
          event_type: envelope.event_type,
          requestId,
          nextAttempt: job.attempts + 1,
          delayMs,
        });
        await new Promise((r) => setTimeout(r, delayMs));
        this._queue.unshift(job);
      } else {
        logger.error("Event exhausted retries — sending to dead-letter store", {
          event_type: envelope.event_type,
          requestId,
        });
        this._deadLetters.push({
          ...job,
          failedAt: Date.now(),
          reason: "max_retries",
          lastError: err.message,
        });
      }
    }
  }
}

// Singleton queue instance
const queue = new EventQueue();

module.exports = queue;
