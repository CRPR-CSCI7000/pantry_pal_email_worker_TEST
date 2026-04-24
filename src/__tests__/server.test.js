"use strict";

const request = require("supertest");
const app = require("../server");

jest.mock("../services/emailService", () => ({
  sendItemAddedEmail: jest.fn().mockResolvedValue(true),
  sendItemRemovedEmail: jest.fn().mockResolvedValue(true),
  sendExpiringSoonEmail: jest.fn().mockResolvedValue(true),
}));

const VALID_ADDED = {
  schema_version: "2.0.0",
  event_type: "pantry.item.added",
  occurred_at: "2025-01-01T00:00:00.000Z",
  payload: {
    user_id: 1,
    username: "alice",
    email: "alice@example.com",
    pantry_id: 10,
    product_name: "Greek Yogurt",
    product_upc: "012345678901",
    quantity: 3,
    quantity_type: "units",
    expiration_date: "2025-02-01",
  },
};

const VALID_REMOVED = {
  schema_version: "2.0.0",
  event_type: "pantry.item.removed",
  occurred_at: "2025-01-01T00:00:00.000Z",
  payload: {
    user_id: 1,
    username: "alice",
    email: "alice@example.com",
    pantry_id: 10,
    product_name: "Greek Yogurt",
  },
};

describe("GET /health", () => {
  test("returns 200 with status ok", async () => {
    const res = await request(app).get("/health");
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("ok");
    expect(res.body.service).toBe("pantrypal-email-worker");
  });
});

describe("POST /events", () => {
  test("accepts valid pantry.item.added event → 202", async () => {
    const res = await request(app).post("/events").send(VALID_ADDED);
    expect(res.status).toBe(202);
    expect(res.body.success).toBe(true);
    expect(res.body.event_type).toBe("pantry.item.added");
  });

  test("accepts valid pantry.item.removed event → 202", async () => {
    const res = await request(app).post("/events").send(VALID_REMOVED);
    expect(res.status).toBe(202);
    expect(res.body.success).toBe(true);
  });

  test("rejects schema_version 1.0.0 → 400", async () => {
    const res = await request(app)
      .post("/events")
      .send({ ...VALID_ADDED, schema_version: "1.0.0" });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/schema_version/);
  });

  test("rejects wrong schema_version → 400", async () => {
    const res = await request(app)
      .post("/events")
      .send({ ...VALID_ADDED, schema_version: "9.9.9" });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/schema_version/);
  });

  test("rejects unsupported event_type → 400", async () => {
    const res = await request(app)
      .post("/events")
      .send({ ...VALID_ADDED, event_type: "order.placed" });
    expect(res.status).toBe(400);
  });

  test("rejects missing envelope fields → 400", async () => {
    const { occurred_at, ...body } = VALID_ADDED;
    const res = await request(app).post("/events").send(body);
    expect(res.status).toBe(400);
  });

  test("rejects missing payload field (email) → 400", async () => {
    const body = {
      ...VALID_ADDED,
      payload: { ...VALID_ADDED.payload, email: undefined },
    };
    const res = await request(app).post("/events").send(body);
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/email/);
  });

  test("returns 404 for unknown routes", async () => {
    const res = await request(app).get("/unknown-route");
    expect(res.status).toBe(404);
  });
});
