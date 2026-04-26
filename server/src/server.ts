// Hearer Memory API server.
//
// Defaults to http://localhost:8788. Storage is SQLite when better-sqlite3 is
// installed, JSON file otherwise. Either way, route handlers are unchanged.

import { randomUUID } from "node:crypto";

import Fastify from "fastify";

import type {
  AudioDetectionRecord,
  ContextEventRecord,
  CueFeedback,
  CueRecord,
  ImportantItem,
  KnownPerson,
  LocationMemory,
  Routine,
} from "../../shared/types";
import { openStorage } from "./db";
import { MemoryService } from "./services/memoryService";

const PORT = Number(process.env.HEARER_API_PORT ?? 8788);
const HOST = process.env.HEARER_API_HOST ?? "0.0.0.0";
const PREFER_JSON = process.env.HEARER_API_STORAGE === "json";

async function start(): Promise<void> {
  const storage = await openStorage({ preferJson: PREFER_JSON });
  const memory = new MemoryService(storage);

  const app = Fastify({
    logger: {
      level: process.env.HEARER_API_LOG_LEVEL ?? "info",
      transport: undefined,
    },
  });

  // Permissive CORS for the local dev UI. We don't ship this on the public web.
  app.addHook("onSend", async (req, reply, payload) => {
    reply.header("access-control-allow-origin", req.headers.origin ?? "*");
    reply.header("access-control-allow-methods", "GET,POST,PUT,DELETE,OPTIONS");
    reply.header("access-control-allow-headers", "content-type");
    return payload;
  });
  app.options("*", async (_req, reply) => {
    reply.send();
  });

  app.get("/api/health", async () => ({
    ok: true,
    service: "hearer-memory-api" as const,
    storage: storage.kind,
    version: "0.2.0",
  }));

  app.get("/api/memory/summary", async () => memory.summary());

  app.post<{
    Body: { name: string; aliases?: string[]; importance?: KnownPerson["importance"]; relationship?: string };
  }>("/api/memory/person", async (req, reply) => {
    const body = req.body;
    if (!body?.name) {
      reply.code(400);
      return { error: "name required" };
    }
    return memory.addPerson(body);
  });

  app.post<{
    Body: {
      label: string;
      contexts?: ImportantItem["contexts"];
      priority?: ImportantItem["priority"];
    };
  }>("/api/memory/item", async (req, reply) => {
    const body = req.body;
    if (!body?.label) {
      reply.code(400);
      return { error: "label required" };
    }
    return memory.addItem(body);
  });

  app.post<{
    Body: {
      label: string;
      type: LocationMemory["type"];
      cuesOnArrival?: string[];
      cuesOnExit?: string[];
      relevantSounds?: string[];
    };
  }>("/api/memory/location", async (req, reply) => {
    const body = req.body;
    if (!body?.label || !body?.type) {
      reply.code(400);
      return { error: "label and type required" };
    }
    return memory.addLocation(body);
  });

  app.post<{
    Body: {
      name: string;
      triggerType: Routine["triggerType"];
      triggerDescription: string;
      actionType: Routine["actionType"];
      actionLabel: string;
      enabled?: boolean;
      confidence?: number;
    };
  }>("/api/routines", async (req, reply) => {
    const body = req.body;
    if (!body?.name || !body?.triggerType || !body?.actionLabel) {
      reply.code(400);
      return { error: "name, triggerType, actionLabel required" };
    }
    return memory.addRoutine(body);
  });

  app.post<{
    Body: {
      person?: string;
      task: string;
      deadlineText?: string;
      actionType?: "physical" | "digital";
      source?: "speech" | "typed" | "manual" | "demo";
    };
  }>("/api/commitments", async (req, reply) => {
    const body = req.body;
    if (!body?.task) {
      reply.code(400);
      return { error: "task required" };
    }
    return memory.addCommitment({ ...body, actionType: body.actionType ?? "digital" });
  });

  app.post<{
    Body: { source: ContextEventRecord["source"]; payload: unknown };
  }>("/api/events", async (req, reply) => {
    const body = req.body;
    if (!body?.source) {
      reply.code(400);
      return { error: "source required" };
    }
    const record: ContextEventRecord = {
      id: `evt_${randomUUID()}`,
      source: body.source,
      payload: body.payload ?? {},
      createdAt: new Date().toISOString(),
    };
    storage.insertEvent(record);
    return record;
  });

  app.get("/api/events", async () => storage.listEvents(50));

  app.post<{
    Body: {
      label: string;
      confidence: number;
      source: string;
      contextSnapshot?: unknown;
      routedCueId?: string;
    };
  }>("/api/audio-detections", async (req, reply) => {
    const body = req.body;
    if (!body?.label) {
      reply.code(400);
      return { error: "label required" };
    }
    const rec: AudioDetectionRecord = {
      id: `det_${randomUUID()}`,
      label: body.label,
      confidence: body.confidence ?? 0,
      source: body.source ?? "unknown",
      contextSnapshot: body.contextSnapshot,
      routedCueId: body.routedCueId,
      createdAt: new Date().toISOString(),
    };
    return storage.insertAudioDetection(rec);
  });

  app.get("/api/audio-detections", async () => storage.listAudioDetections(30));

  app.post<{
    Body: {
      cueText: string;
      priority: CueRecord["priority"];
      actionType: CueRecord["actionType"];
      sourceEventId?: string;
      wasShown?: boolean;
    };
  }>("/api/cues", async (req, reply) => {
    const body = req.body;
    if (!body?.cueText) {
      reply.code(400);
      return { error: "cueText required" };
    }
    const rec: CueRecord = {
      id: `cue_${randomUUID()}`,
      cueText: body.cueText,
      priority: body.priority,
      actionType: body.actionType,
      sourceEventId: body.sourceEventId,
      wasShown: body.wasShown ?? true,
      createdAt: new Date().toISOString(),
    };
    return storage.insertCue(rec);
  });

  app.get("/api/cues", async () => storage.listCues(30));

  app.post<{
    Body: { cueId: string; feedback: CueFeedback };
  }>("/api/cue-feedback", async (req, reply) => {
    const body = req.body;
    if (!body?.cueId || !body?.feedback) {
      reply.code(400);
      return { error: "cueId and feedback required" };
    }
    const updated = storage.setCueFeedback(body.cueId, body.feedback);
    if (!updated) {
      reply.code(404);
      return { error: "cue not found" };
    }
    return updated;
  });

  app.post<{
    Body: { text: string; source?: "typed" | "speech" | "manual" };
  }>("/api/memory/extract", async (req, reply) => {
    const body = req.body;
    if (!body?.text) {
      reply.code(400);
      return { error: "text required" };
    }
    return memory.extractAndPersist(body.text, body.source ?? "typed");
  });

  app.post("/api/memory/reset", async () => {
    storage.reset();
    return { ok: true };
  });

  await app.listen({ port: PORT, host: HOST });
  app.log.info(
    `Hearer Memory API listening on http://${HOST === "0.0.0.0" ? "localhost" : HOST}:${PORT} (storage=${storage.kind})`
  );

  const shutdown = async (signal: string) => {
    app.log.info(`Received ${signal}, shutting down…`);
    try {
      await app.close();
    } finally {
      process.exit(0);
    }
  };
  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));
}

start().catch((err) => {
  // eslint-disable-next-line no-console
  console.error("Hearer Memory API failed to start:", err);
  process.exit(1);
});
