// Fastify factory. Tests instantiate this directly with a custom storage +
// optional mock LLM provider; production calls it from server.ts.

import { randomUUID } from "node:crypto";

import Fastify, { type FastifyInstance } from "fastify";

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
import { type Storage } from "./db";
import { MemoryService } from "./services/memoryService";
import { LlmMemoryExtractorService } from "./services/llmMemoryExtractor";
import { LlmCueReasoner } from "./services/llmCueReasoner";
import {
  buildLlmProvider,
  type LlmProvider,
} from "./llm/llmProvider";

export interface BuildAppOptions {
  storage: Storage;
  llmProvider?: LlmProvider | null;
  // When true, attaches the Fastify logger; tests usually pass false to keep
  // output quiet.
  logger?: boolean;
}

export function buildApp(opts: BuildAppOptions): FastifyInstance {
  const { storage } = opts;
  const memory = new MemoryService(storage);
  const llmProvider: LlmProvider | null =
    opts.llmProvider === undefined
      ? buildLlmProvider()
      : opts.llmProvider ?? null;
  const llmExtractor = new LlmMemoryExtractorService(memory, llmProvider);
  const llmReasoner = new LlmCueReasoner(llmProvider);

  const app = Fastify({
    logger: opts.logger
      ? {
          level: process.env.HEARER_API_LOG_LEVEL ?? "info",
          transport: undefined,
        }
      : false,
  });

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
    version: "0.3.0",
  }));

  app.get("/api/llm/status", async () => {
    if (!llmProvider) {
      return {
        enabled: false,
        configured: false,
        provider: "disabled",
        reason: "No provider wired.",
      };
    }
    return llmProvider.status();
  });

  app.get("/api/memory/summary", async () => memory.summary());

  app.post<{
    Body: {
      name: string;
      aliases?: string[];
      importance?: KnownPerson["importance"];
      relationship?: string;
    };
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
    return memory.addCommitment({
      ...body,
      actionType: body.actionType ?? "digital",
    });
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
    const result = await llmExtractor.extract(body.text, body.source ?? "typed");
    return result;
  });

  app.post<{
    Body: {
      detection: {
        label: string;
        confidence: number;
        source: string;
        direction?: "front" | "left" | "right" | "behind" | "unknown";
      };
      contextOverride?: {
        location?: string;
        activity?: string;
        timeOfDay?: string;
        activeRoutines?: string[];
      };
      transcriptSnippet?: string;
      source?: "g2" | "simulator" | "browser_fallback";
      direction?: "front" | "left" | "right" | "behind" | "unknown";
    };
  }>("/api/decide", async (req, reply) => {
    const body = req.body;
    if (!body?.detection?.label) {
      reply.code(400);
      return { error: "detection.label required" };
    }

    const summary = memory.summary();

    // Persist the audio detection now so the dev/judge view can see it.
    const detectionRec = storage.insertAudioDetection({
      id: `det_${randomUUID()}`,
      label: body.detection.label,
      confidence: body.detection.confidence ?? 0,
      source: body.source ?? body.detection.source ?? "simulator",
      contextSnapshot: body.contextOverride ?? {},
      createdAt: new Date().toISOString(),
    });

    // Try the LLM reasoner first when available.
    if (llmReasoner.isAvailable()) {
      const result = await llmReasoner.reason({
        audioDetection: {
          label: body.detection.label,
          confidence: body.detection.confidence ?? 0,
          source: body.source ?? body.detection.source ?? "simulator",
          direction: body.direction ?? body.detection.direction,
        },
        contextState: {
          likelyLocation: body.contextOverride?.location ?? "unknown",
          likelyActivity: body.contextOverride?.activity ?? "unknown",
          timeOfDay: body.contextOverride?.timeOfDay ?? hourBucket(),
          activeRoutines:
            body.contextOverride?.activeRoutines ??
            summary.routines.filter((r) => r.enabled).map((r) => r.name),
          recentEvents: storage
            .listEvents(5)
            .map((e) => `${e.source}:${shortJson(e.payload)}`),
        },
        memorySummary: summary,
        recentCueFeedback: summary.recentCues
          .filter((c) => c.userFeedback)
          .map((c) => ({
            cueText: c.cueText,
            feedback: c.userFeedback as CueFeedback,
          })),
        transcriptSnippet: body.transcriptSnippet,
      });

      if (result.cue) {
        const cueRec = storage.insertCue({
          id: result.cue.id,
          cueText: result.cue.text,
          priority: result.cue.priority,
          actionType: result.cue.actionType,
          sourceEventId: detectionRec.id,
          wasShown: true,
          createdAt: result.cue.timestamp,
        });
        return {
          mode: "llm",
          cue: result.cue,
          rawReasoning: result.raw,
          detectionId: detectionRec.id,
          cueId: cueRec.id,
          fallbackUsed: false,
        };
      }
      return {
        mode: "llm_rejected_fallback",
        rejected: result.rejected
          ? { reason: result.rejected.reason, raw: result.rejected.raw }
          : undefined,
        fallbackReason: result.fallbackReason,
        // Caller's deterministic engine should produce the cue; we only flag
        // the LLM didn't have an acceptable answer.
        cue: null,
        detectionId: detectionRec.id,
        fallbackUsed: true,
      };
    }

    return {
      mode: "rule_based",
      cue: null,
      detectionId: detectionRec.id,
      fallbackUsed: true,
      fallbackReason: "LLM provider not available.",
    };
  });

  app.post("/api/memory/reset", async () => {
    storage.reset();
    return { ok: true };
  });

  return app;
}

function hourBucket(): string {
  const h = new Date().getHours();
  if (h < 5) return "late_night";
  if (h < 11) return "morning";
  if (h < 14) return "midday";
  if (h < 17) return "afternoon";
  if (h < 21) return "evening";
  return "night";
}

function shortJson(v: unknown): string {
  try {
    const s = JSON.stringify(v);
    return s.length > 80 ? s.slice(0, 80) + "…" : s;
  } catch {
    return "[unserialisable]";
  }
}
