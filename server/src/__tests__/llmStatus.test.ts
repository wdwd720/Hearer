import { afterEach, describe, expect, it } from "vitest";
import { buildApp } from "../app";
import { openStorage } from "../db";
import { tmpdir } from "node:os";
import { mkdtempSync } from "node:fs";
import { join } from "node:path";
import { DisabledLlmProvider } from "../llm/llmProvider";

async function withApp(handler: (app: Awaited<ReturnType<typeof buildApp>>) => Promise<void>) {
  const dir = mkdtempSync(join(tmpdir(), "hearer-test-"));
  const storage = await openStorage({ dataDir: dir, preferJson: true });
  const app = buildApp({ storage, llmProvider: new DisabledLlmProvider(), logger: false });
  try {
    await handler(app);
  } finally {
    await app.close();
  }
}

describe("/api/llm/status", () => {
  afterEach(() => {
    delete process.env.OPENAI_API_KEY;
    delete process.env.HEARER_LLM_ENABLED;
  });

  it("returns disabled when no key is configured", async () => {
    await withApp(async (app) => {
      const res = await app.inject({ method: "GET", url: "/api/llm/status" });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.provider).toBe("disabled");
      expect(body.configured).toBe(false);
    });
  });

  it("returns mode=rule_based when LLM is disabled and the user calls /api/memory/extract", async () => {
    await withApp(async (app) => {
      const res = await app.inject({
        method: "POST",
        url: "/api/memory/extract",
        payload: {
          text: "When I leave home for school, remind me to bring my laptop.",
        },
      });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.mode).toBe("rule_based");
      expect(body.fallbackUsed).toBe(true);
      expect(body.persisted.routines.length).toBeGreaterThan(0);
    });
  });
});
