"use strict";

const express = require("express");
const rateLimit = require("express-rate-limit");

const config = require("./config");
const logger = require("./config/logger");
const { validateEvent } = require("./models/eventSchema");
const { routeEvent } = require("./handlers/eventRouter");
const queue = require("./queue/eventQueue");

const app = express();

// ─── Middleware ───────────────────────────────────────────────────────────────

app.use(express.json({ limit: "1mb" }));

// Simple API key auth — all routes require X-API-Key header
app.use((req, res, next) => {
  if (req.path === "/health") return next();
  const key = req.headers["x-api-key"];
  if (!config.apiKey) return next();
  if (key !== config.apiKey) {
    return res.status(401).json({ success: false, error: "Unauthorized" });
  }
  next();
});

// Rate limiting
const limiter = rateLimit({
  windowMs: 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
});
app.use(limiter);

// ─── Routes ───────────────────────────────────────────────────────────────────

/**
 * GET /health
 * Liveness probe — includes queue depth and dead-letter count.
 */
app.get("/health", (_req, res) => {
  res.json({
    status: "ok",
    service: "pantrypal-email-worker",
    version: "1.0.0",
    queue: {
      depth: queue.depth,
      deadLetters: queue.deadLetterCount,
    },
  });
});

/**
 * POST /events
 */
app.post("/events", async (req, res) => {
  const body = req.body;

  logger.debug("Received event", { event_type: body?.event_type });

  // Validate envelope + payload against schema contract
  const { valid, error } = validateEvent(body);
  if (!valid) {
    logger.warn("Event validation failed", { error, body });
    return res.status(400).json({ success: false, error });
  }

  res.status(202).json({ success: true, message: "Event accepted" });

  // Route to handler asynchronously — errors are logged but don't affect the 202
  try {
    const { handled } = await routeEvent(body);
    if (!handled) {
      logger.warn("Event not handled", { event_type: body.event_type });
    }
  } catch (err) {
    logger.error("Event handler error", {
      event_type: body.event_type,
      error: err.message,
    });
  }
});

// ─── 404 ─────────────────────────────────────────────────────────────────────

app.use((_req, res) => {
  res.status(404).json({ success: false, error: "Not found" });
});

// ─── Start ────────────────────────────────────────────────────────────────────

if (require.main === module) {
  app.listen(config.port, () => {
    logger.info(`pantrypal-email-worker listening on port ${config.port}`);
  });
}

module.exports = app;
