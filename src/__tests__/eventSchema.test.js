"use strict";

const {
  validateEvent,
  validateEventBatch,
  SUPPORTED_SCHEMA_VERSION,
} = require("../models/eventSchema");

// ─── Valid fixtures — updated to schema 2.0.0 ─────────────────────────────────

const validAddedEnvelope = {
  schema_version: "2.0.0",
  event_type: "pantry.item.added",
  occurred_at: "2025-01-15T10:00:00+00:00",
  payload: {
    user_id: 1,
    username: "testuser",
    email: "test@example.com",
    pantry_id: 42,
    product_name: "Organic Milk",
    product_upc: "012345678901",
    quantity: 1,
    quantity_type: "units",
    expiration_date: "2025-01-22",
  },
};

const validRemovedEnvelope = {
  schema_version: "2.0.0",
  event_type: "pantry.item.removed",
  occurred_at: "2025-01-15T10:00:00+00:00",
  payload: {
    user_id: 1,
    username: "testuser",
    email: "test@example.com",
    pantry_id: 42,
    product_name: "Organic Milk",
  },
};

const validExpiringSoonEnvelope = {
  schema_version: "2.0.0",
  event_type: "pantry.item.expiring_soon",
  occurred_at: "2025-01-15T10:00:00+00:00",
  payload: {
    user_id: 1,
    email: "test@example.com",
    items: [
      {
        product_name: "Milk",
        expiration_date: "2025-01-17",
        days_remaining: 2,
      },
      {
        product_name: "Yogurt",
        expiration_date: "2025-01-18",
        days_remaining: 3,
      },
    ],
  },
};

// ─── Envelope tests ────────────────────────────────────────────────────────────

describe("validateEvent — envelope", () => {
  test("accepts a valid pantry.item.added envelope", () => {
    expect(validateEvent(validAddedEnvelope).valid).toBe(true);
  });

  test("accepts a valid pantry.item.removed envelope", () => {
    expect(validateEvent(validRemovedEnvelope).valid).toBe(true);
  });

  test("accepts a valid pantry.item.expiring_soon envelope", () => {
    expect(validateEvent(validExpiringSoonEnvelope).valid).toBe(true);
  });

  test("rejects null body", () => {
    expect(validateEvent(null).valid).toBe(false);
  });

  test("rejects non-object body", () => {
    expect(validateEvent("string").valid).toBe(false);
  });

  test("rejects when schema_version is missing", () => {
    const bad = { ...validAddedEnvelope, schema_version: undefined };
    const result = validateEvent(bad);
    expect(result.valid).toBe(false);
    expect(result.error).toMatch(/schema_version/);
  });

  test("rejects schema_version 1.0.0 (old producer)", () => {
    const bad = { ...validAddedEnvelope, schema_version: "1.0.0" };
    const result = validateEvent(bad);
    expect(result.valid).toBe(false);
    expect(result.error).toMatch(/Unsupported schema_version/);
  });

  test("rejects schema_version 3.0.0 (future)", () => {
    const bad = { ...validAddedEnvelope, schema_version: "3.0.0" };
    expect(validateEvent(bad).valid).toBe(false);
  });

  test("rejects unknown event_type", () => {
    const bad = { ...validAddedEnvelope, event_type: "pantry.item.teleported" };
    expect(validateEvent(bad).valid).toBe(false);
  });

  test("rejects when occurred_at is missing", () => {
    const bad = { ...validAddedEnvelope, occurred_at: undefined };
    expect(validateEvent(bad).valid).toBe(false);
  });

  test("rejects when payload is missing", () => {
    const bad = { ...validAddedEnvelope, payload: undefined };
    expect(validateEvent(bad).valid).toBe(false);
  });
});

// ─── Payload tests ─────────────────────────────────────────────────────────────

describe("validateEvent — pantry.item.added payload", () => {
  const requiredFields = [
    "user_id",
    "username",
    "email",
    "pantry_id",
    "product_name",
    "product_upc",
    "quantity",
    "quantity_type",
  ];

  requiredFields.forEach((field) => {
    test(`rejects when payload.${field} is missing`, () => {
      const bad = {
        ...validAddedEnvelope,
        payload: { ...validAddedEnvelope.payload, [field]: undefined },
      };
      const result = validateEvent(bad);
      expect(result.valid).toBe(false);
      expect(result.error).toMatch(new RegExp(field));
    });

    test(`rejects when payload.${field} is null`, () => {
      const bad = {
        ...validAddedEnvelope,
        payload: { ...validAddedEnvelope.payload, [field]: null },
      };
      expect(validateEvent(bad).valid).toBe(false);
    });
  });

  test("allows expiration_date to be null", () => {
    const envelope = {
      ...validAddedEnvelope,
      payload: { ...validAddedEnvelope.payload, expiration_date: null },
    };
    expect(validateEvent(envelope).valid).toBe(true);
  });
});

describe("validateEvent — pantry.item.removed payload", () => {
  ["user_id", "username", "email", "pantry_id", "product_name"].forEach(
    (field) => {
      test(`rejects when payload.${field} is missing`, () => {
        const bad = {
          ...validRemovedEnvelope,
          payload: { ...validRemovedEnvelope.payload, [field]: undefined },
        };
        expect(validateEvent(bad).valid).toBe(false);
      });
    },
  );
});

describe("validateEvent — pantry.item.expiring_soon payload", () => {
  test("rejects when items is missing", () => {
    const bad = {
      ...validExpiringSoonEnvelope,
      payload: { ...validExpiringSoonEnvelope.payload, items: undefined },
    };
    expect(validateEvent(bad).valid).toBe(false);
  });

  test("rejects when items is null", () => {
    const bad = {
      ...validExpiringSoonEnvelope,
      payload: { ...validExpiringSoonEnvelope.payload, items: null },
    };
    expect(validateEvent(bad).valid).toBe(false);
  });
});

// ─── Batch validation ──────────────────────────────────────────────────────────

describe("validateEventBatch", () => {
  test("validates an array of valid events", () => {
    const results = validateEventBatch([
      validAddedEnvelope,
      validRemovedEnvelope,
    ]);
    expect(results).toHaveLength(2);
    expect(results[0].valid).toBe(true);
    expect(results[1].valid).toBe(true);
  });

  test("returns per-item errors for mixed input", () => {
    const bad = { ...validAddedEnvelope, schema_version: "1.0.0" };
    const results = validateEventBatch([validAddedEnvelope, bad]);
    expect(results[0].valid).toBe(true);
    expect(results[1].valid).toBe(false);
    expect(results[1].index).toBe(1);
  });

  test("returns error when input is not an array", () => {
    const results = validateEventBatch("not-an-array");
    expect(results[0].valid).toBe(false);
  });
});

// ─── Export tests ──────────────────────────────────────────────────────────────

describe("SUPPORTED_SCHEMA_VERSION export", () => {
  test("exports a semver string", () => {
    expect(typeof SUPPORTED_SCHEMA_VERSION).toBe("string");
    expect(SUPPORTED_SCHEMA_VERSION).toMatch(/^\d+\.\d+\.\d+$/);
  });

  test("is 2.0.0", () => {
    expect(SUPPORTED_SCHEMA_VERSION).toBe("2.0.0");
  });
});
