import { describe, expect, it } from "vitest";
import { buildApp } from "../app";
import { openStorage } from "../db";
import { tmpdir } from "node:os";
import { mkdtempSync } from "node:fs";
import { join } from "node:path";
import { MockLlmProvider } from "../llm/mockLlmProvider";

async function withApp(
  llmProvider: ReturnType<typeof makeMock> | null,
  handler: (app: Awaited<ReturnType<typeof buildApp>>) => Promise<void>
) {
  const dir = mkdtempSync(join(tmpdir(), "hearer-test-"));
  const storage = await openStorage({ dataDir: dir, preferJson: true });
  const app = buildApp({ storage, llmProvider, logger: false });
  try {
    await handler(app);
  } finally {
    await app.close();
  }
}

function makeMock() {
  return new MockLlmProvider({ pretendEnabled: true });
}

describe("/api/memory/extract via mock LLM", () => {
  it("LLM extractor saves a cooking routine for the killer demo sentence", async () => {
    await withApp(makeMock(), async (app) => {
      const res = await app.inject({
        method: "POST",
        url: "/api/memory/extract",
        payload: {
          text: "Usually after dinner I cook, so if you hear beeping remind me to check the stove.",
        },
      });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.mode).toBe("llm");
      expect(body.fallbackUsed).toBe(false);
      const routines = body.persisted.routines as Array<{
        name: string;
        triggerDescription: string;
        actionLabel: string;
        actionType: string;
      }>;
      expect(routines.length).toBeGreaterThan(0);
      const first = routines[0];
      expect(first.name.toLowerCase()).toContain("cooking");
      expect(first.actionLabel.toLowerCase()).toContain("stove");
      expect(first.actionType).toBe("physical");
    });
  });

  it("LLM extractor for a commitment populates person + deadline", async () => {
    await withApp(makeMock(), async (app) => {
      const res = await app.inject({
        method: "POST",
        url: "/api/memory/extract",
        payload: { text: "I'll send Jason the deck tonight." },
      });
      const body = res.json();
      expect(body.mode).toBe("llm");
      const commitments = body.persisted.commitments as Array<{
        person?: string;
        task: string;
        deadlineText?: string;
      }>;
      expect(commitments[0].person).toBe("Jason");
      expect(commitments[0].deadlineText?.toLowerCase()).toBe("tonight");
      expect(commitments[0].task.toLowerCase()).toMatch(/deck/);
    });
  });
});
