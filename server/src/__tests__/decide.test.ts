import { describe, expect, it } from "vitest";
import { buildApp } from "../app";
import { openStorage } from "../db";
import { tmpdir } from "node:os";
import { mkdtempSync } from "node:fs";
import { join } from "node:path";
import { MockLlmProvider } from "../llm/mockLlmProvider";
import { DisabledLlmProvider } from "../llm/llmProvider";

async function makeApp(llmProvider: ReturnType<typeof newProvider>) {
  const dir = mkdtempSync(join(tmpdir(), "hearer-test-"));
  const storage = await openStorage({ dataDir: dir, preferJson: true });
  return { app: buildApp({ storage, llmProvider, logger: false }), storage };
}

function newProvider(kind: "mock" | "disabled") {
  return kind === "mock"
    ? new MockLlmProvider({ pretendEnabled: true })
    : new DisabledLlmProvider();
}

describe("POST /api/decide", () => {
  it("returns the deterministic-fallback flag when LLM is unavailable", async () => {
    const { app } = await makeApp(newProvider("disabled"));
    try {
      const res = await app.inject({
        method: "POST",
        url: "/api/decide",
        payload: {
          detection: {
            label: "timer_beep",
            confidence: 0.9,
            source: "simulator",
          },
          contextOverride: { location: "kitchen", activity: "cooking" },
        },
      });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.mode).toBe("rule_based");
      expect(body.cue).toBeNull();
      expect(body.fallbackUsed).toBe(true);
    } finally {
      await app.close();
    }
  });

  it("returns the LLM cue when the mock provider is enabled and a cooking routine is saved", async () => {
    const { app } = await makeApp(newProvider("mock"));
    try {
      // First, persist a cooking routine via /api/memory/extract.
      await app.inject({
        method: "POST",
        url: "/api/memory/extract",
        payload: {
          text: "Usually after dinner I cook, so if you hear beeping remind me to check the stove.",
        },
      });

      const res = await app.inject({
        method: "POST",
        url: "/api/decide",
        payload: {
          detection: {
            label: "timer_beep",
            confidence: 0.9,
            source: "simulator",
          },
          contextOverride: { location: "kitchen", activity: "cooking" },
        },
      });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.mode).toBe("llm");
      expect(body.cue).not.toBeNull();
      expect(body.cue.text).toBe("Kitchen timer beeping.\nCheck stove.");
      expect(body.cue.priority).toBe("urgent");
      expect(body.cue.actionType).toBe("physical");
      // Hearer must NOT make sensor-grade certainty claims.
      expect(body.cue.text.toLowerCase()).not.toContain("stove is on");
    } finally {
      await app.close();
    }
  });

  it("rejects an LLM cue that violates safety rules and reports the rejection reason", async () => {
    // Override the mock to return an unsafe payload.
    const provider = new MockLlmProvider({
      pretendEnabled: true,
      reasoningOverride: () => ({
        shouldInterrupt: true,
        cueText: "Stove is on.\nDanger.",
        priority: "urgent",
        actionType: "physical",
        confidence: 0.95,
        reason: "Mock unsafe override",
        memoryUsed: [],
        safetyLimits: [],
      }),
    });
    const dir = mkdtempSync(join(tmpdir(), "hearer-test-"));
    const storage = await openStorage({ dataDir: dir, preferJson: true });
    const app = buildApp({ storage, llmProvider: provider, logger: false });
    try {
      const res = await app.inject({
        method: "POST",
        url: "/api/decide",
        payload: {
          detection: {
            label: "timer_beep",
            confidence: 0.9,
            source: "simulator",
          },
          contextOverride: { location: "kitchen", activity: "cooking" },
        },
      });
      const body = res.json();
      expect(body.mode).toBe("llm_rejected_fallback");
      expect(body.cue).toBeNull();
      expect(body.rejected.reason).toMatch(/no_certainty_about_hazards/);
    } finally {
      await app.close();
    }
  });

  it("rejects a direction cue when no direction is supplied", async () => {
    const provider = new MockLlmProvider({
      pretendEnabled: true,
      reasoningOverride: () => ({
        shouldInterrupt: true,
        cueText: "Road alert:\nsiren on left.",
        priority: "urgent",
        actionType: "physical",
        confidence: 0.9,
        reason: "Mock direction override",
        memoryUsed: [],
        safetyLimits: [],
      }),
    });
    const dir = mkdtempSync(join(tmpdir(), "hearer-test-"));
    const storage = await openStorage({ dataDir: dir, preferJson: true });
    const app = buildApp({ storage, llmProvider: provider, logger: false });
    try {
      const res = await app.inject({
        method: "POST",
        url: "/api/decide",
        payload: {
          detection: {
            label: "siren",
            confidence: 0.85,
            source: "simulator",
            // direction intentionally omitted
          },
          contextOverride: { location: "street", activity: "walking" },
        },
      });
      const body = res.json();
      expect(body.mode).toBe("llm_rejected_fallback");
      expect(body.rejected.reason).toBe("direction_unknown");
    } finally {
      await app.close();
    }
  });
});
