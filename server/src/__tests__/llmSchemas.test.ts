import { describe, expect, it } from "vitest";
import {
  validateCueReasoning,
  validateMemoryExtraction,
} from "../llm/llmSchemas";

describe("validateMemoryExtraction", () => {
  it("accepts a well-formed payload", () => {
    const r = validateMemoryExtraction({
      items: [
        {
          kind: "routine",
          label: "Cooking timer safety cue",
          triggerDescription: "after dinner",
          actionType: "physical",
          actionLabel: "check stove",
          person: null,
          deadlineText: null,
          locationLabel: null,
          priority: "urgent",
          confidence: 0.9,
          save: true,
          privacyNote: null,
        },
      ],
      confidence: 0.9,
      reason: "ok",
    });
    expect(r.ok).toBe(true);
    expect(r.value?.items.length).toBe(1);
    expect(r.value?.items[0].kind).toBe("routine");
  });

  it("rejects unknown kind", () => {
    const r = validateMemoryExtraction({
      items: [
        {
          kind: "totally_made_up",
          label: "x",
          actionType: "none",
          confidence: 0.9,
          save: false,
        },
      ],
      confidence: 0.9,
      reason: "ok",
    });
    expect(r.ok).toBe(false);
  });
});

describe("validateCueReasoning", () => {
  it("accepts a well-formed cue", () => {
    const r = validateCueReasoning({
      shouldInterrupt: true,
      cueText: "Kitchen timer beeping.\nCheck stove.",
      priority: "urgent",
      actionType: "physical",
      confidence: 0.9,
      reason: "demo",
      memoryUsed: ["rout_cooking"],
      safetyLimits: ["no_certainty_about_hazards"],
    });
    expect(r.ok).toBe(true);
    expect(r.value?.cueText.includes("Kitchen")).toBe(true);
  });

  it("rejects invalid priority", () => {
    const r = validateCueReasoning({
      shouldInterrupt: true,
      cueText: "x",
      priority: "extreme",
      actionType: "physical",
      confidence: 1,
      reason: "x",
      memoryUsed: [],
      safetyLimits: [],
    });
    expect(r.ok).toBe(false);
  });
});
