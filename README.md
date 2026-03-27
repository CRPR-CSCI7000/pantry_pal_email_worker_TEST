# pantrypal-email-worker

Event-driven email notification worker for PantryPal.  
Receives webhook events from `pantrypal-django` and sends transactional emails via SMTP.

## Architecture

```
pantrypal-django  ──POST /events──►  pantrypal-email-worker  ──SMTP──►  User inbox
  (producer)            HTTP              (consumer)
```

Events are validated against the **schema contract** in `src/models/eventSchema.js` before processing. Any mismatch returns `400`.

## Setup

```bash
npm install
cp .env.example .env   # fill in SMTP credentials and API key
npm start              # production
npm run dev            # nodemon watch mode
```

## API

### `GET /health`

Liveness probe. No auth required.

```json
{ "status": "ok", "service": "pantrypal-email-worker", "version": "1.0.0" }
```

### `POST /events`

Requires `X-API-Key` header.

**Request body — Event Envelope (schema v1.0.0):**

```json
{
  "schema_version": "1.0.0",
  "event_type": "pantry.item.added",
  "occurred_at": "2025-01-01T00:00:00.000Z",
  "payload": { ... }
}
```

**Supported event types:**

| Event                       | Trigger                       | Email sent                        |
| --------------------------- | ----------------------------- | --------------------------------- |
| `pantry.item.added`         | User adds item to pantry      | Confirmation with product details |
| `pantry.item.removed`       | User removes item from pantry | Removal confirmation              |
| `pantry.item.expiring_soon` | Scheduled job (future)        | Expiry digest                     |

**Responses:**

- `202 Accepted` — event validated and queued
- `400 Bad Request` — schema validation failure (see `error` field)
- `401 Unauthorized` — missing or invalid `X-API-Key`

## Event Schema Contract

The schema contract between this worker (consumer) and the Django backend (producer) is defined in **`src/models/eventSchema.js`**.

**This file is the source of truth.** Any breaking change here must be coordinated with `pantrypal-django/pantrypal/services/email_service.py`.

## Testing

```bash
npm test             # run all tests
npm test -- --coverage
```

Tests in `src/__tests__/` cover:

- Schema validation (all event types, all required fields)
- HTTP endpoint behaviour (202/400/401/404)
- Email service is mocked — no real SMTP needed for tests
