"use strict";

/**
 * Event schema definitions for pantrypal-email-worker.
 *
 * THIS FILE IS THE SOURCE OF TRUTH for the event contract between
 * the Django backend (producer) and this worker (consumer).
 *
 * Schema version: 2.0.0
 *
 * Any change here that is not backwards-compatible is a DATA SCHEMA BREAK
 * and must be coordinated with the backend's services/email_service.py.
 */

const SUPPORTED_SCHEMA_VERSION = "2.0.0";

const SUPPORTED_EVENTS = new Set([
  "pantry.item.added",
  "pantry.item.removed",
  "pantry.item.expiring_soon",
]);

const ENVELOPE_REQUIRED = [
  "schema_version",
  "event_type",
  "occurred_at",
  "payload",
];

const PAYLOAD_REQUIRED = {
  "pantry.item.added": [
    "user_id",
    "username",
    "email",
    "pantry_id",
    "product_name",
    "product_upc",
    "quantity",
    "quantity_type",
  ],
  "pantry.item.removed": [
    "user_id",
    "username",
    "email",
    "pantry_id",
    "product_name",
  ],
  "pantry.item.expiring_soon": ["user_id", "email", "items"],
};

/**
 * Validate a single inbound event envelope.
 * @param {object} body - parsed request body
 * @returns {{ valid: boolean, error?: string }}
 */
function validateEvent(body) {
  if (!body || typeof body !== "object") {
    return { valid: false, error: "Request body must be a JSON object" };
  }

  for (const field of ENVELOPE_REQUIRED) {
    if (body[field] === undefined || body[field] === null) {
      return {
        valid: false,
        error: `Missing required envelope field: ${field}`,
      };
    }
  }

  // Schema version check
  if (body.schema_version !== SUPPORTED_SCHEMA_VERSION) {
    return {
      valid: false,
      error: `Unsupported schema_version: ${body.schema_version}. Expected ${SUPPORTED_SCHEMA_VERSION}`,
    };
  }

  // Event type check
  if (!SUPPORTED_EVENTS.has(body.event_type)) {
    return {
      valid: false,
      error: `Unsupported event_type: ${body.event_type}`,
    };
  }

  // Payload field check
  const required = PAYLOAD_REQUIRED[body.event_type] || [];
  for (const field of required) {
    if (body.payload[field] === undefined || body.payload[field] === null) {
      return {
        valid: false,
        error: `Missing required payload field: ${field}`,
      };
    }
  }

  return { valid: true };
}

/**
 * Validate an array of event envelopes, returning per-item results.
 * Useful for batch ingest endpoints (future).
 * @param {object[]} events
 * @returns {{ index: number, valid: boolean, error?: string }[]}
 */
function validateEventBatch(events) {
  if (!Array.isArray(events)) {
    return [{ index: 0, valid: false, error: "Expected an array of events" }];
  }
  return events.map((event, index) => ({ index, ...validateEvent(event) }));
}

module.exports = {
  validateEvent,
  validateEventBatch,
  SUPPORTED_EVENTS,
  SUPPORTED_SCHEMA_VERSION,
};
