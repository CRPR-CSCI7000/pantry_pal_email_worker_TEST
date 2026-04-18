/**
 * Event schema definitions for pantrypal-email-worker.
 *
 * THIS FILE IS THE SOURCE OF TRUTH for the event contract between
 * the Django backend (producer) and this worker (consumer).
 *
 * Schema version: 1.0.0
 *
 * Any change here that is not backwards-compatible is a DATA SCHEMA BREAK
 * and must be coordinated with the backend's services/email_service.py.
 *
 * ─── Envelope ────────────────────────────────────────────────────────────────
 * Every inbound event must match the base envelope shape below.
 * Fields marked (*) are validated on receipt; missing fields cause a 400.
 *
 * {
 *   "schema_version": "1.0.0",   // (*) semver string
 *   "event_type":     string,    // (*) dot-namespaced type, see SUPPORTED_EVENTS
 *   "occurred_at":   string,    // (*) ISO-8601 UTC timestamp
 *   "payload":        object     // (*) event-specific — see per-event schemas below
 * }
 *
 * ─── pantry.item.added payload ───────────────────────────────────────────────
 * {
 *   "user_id":        number,    // (*)
 *   "username":       string,    // (*)
 *   "email":          string,    // (*) recipient address
 *   "pantry_id":      number,    // (*)
 *   "product_name":   string,    // (*)
 *   "product_upc":    string,    // (*)
 *   "quantity":       number,    // (*)
 *   "quantity_type":  string,    // (*)
 *   "expiration_date": string | null
 * }
 *
 * ─── pantry.item.removed payload ─────────────────────────────────────────────
 * {
 *   "user_id":       number,   // (*)
 *   "username":      string,   // (*)
 *   "email":         string,   // (*)
 *   "pantry_id":     number,   // (*)
 *   "product_name":  string    // (*)
 * }
 *
 * ─── pantry.item.expiring_soon payload ───────────────────────────────────────
 * {
 *   "user_id":        number,   // (*)
 *   "email":          string,   // (*)
 *   "items":          Array<{   // (*)
 *     "product_name":   string,
 *     "expiration_date": string,
 *     "days_remaining":  number
 *   }>
 * }
 */

'use strict';

const SUPPORTED_SCHEMA_VERSION = '1.0.0';

const SUPPORTED_EVENTS = new Set([
  'pantry.item.added',
  'pantry.item.expiring_soon',
]);

/**
 * Required top-level envelope fields.
 */
const ENVELOPE_REQUIRED = ['schema_version', 'event_type', 'occurred_at', 'payload'];

/**
 * Required payload fields per event type.
 */
const PAYLOAD_REQUIRED = {
  'pantry.item.added': [
    'user_id', 'username', 'email', 'pantry_id',
    'product_name', 'product_upc', 'quantity', 'quantity_type',
  ],
  'pantry.item.expiring_soon': ['user_id', 'email', 'items'],
};

/**
 * Validate an inbound event envelope.
 * @param {object} body - parsed request body
 * @returns {{ valid: boolean, error?: string }}
 */
function validateEvent(body) {
  // Check envelope fields
  for (const field of ENVELOPE_REQUIRED) {
    if (body[field] === undefined || body[field] === null) {
      return { valid: false, error: `Missing required envelope field: ${field}` };
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
    return { valid: false, error: `Unsupported event_type: ${body.event_type}` };
  }

  // Payload field check
  const required = PAYLOAD_REQUIRED[body.event_type] || [];
  for (const field of required) {
    if (body.payload[field] === undefined || body.payload[field] === null) {
      return { valid: false, error: `Missing required payload field: ${field}` };
    }
  }

  return { valid: true };
}

module.exports = { validateEvent, SUPPORTED_EVENTS, SUPPORTED_SCHEMA_VERSION };
