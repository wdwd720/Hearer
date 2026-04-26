import { describe, expect, it } from "vitest";
import { validateAndRejectUnsafeCue } from "../services/safetyGuard";

const baseReasoning = {
  shouldInterrupt: true,
  cueText: "Kitchen timer beeping.\nCheck stove.",
  priority: "urgent" as const,
  actionType: "physical" as const,
  confidence: 0.9,
  reason: "test",
  memoryUsed: [],
  safetyLimits: [],
};

describe("safetyGuard.validateAndRejectUnsafeCue", () => {
  it("accepts a safe cue and returns a Cue object", () => {
    const result = validateAndRejectUnsafeCue({ reasoning: baseReasoning });
    expect(result.ok).toBe(true);
    expect(result.cue?.text).toBe("Kitchen timer beeping.\nCheck stove.");
    expect(result.cue?.priority).toBe("urgent");
  });

  it("rejects 'stove is on' (no certainty about hazards)", () => {
    const result = validateAndRejectUnsafeCue({
      reasoning: {
        ...baseReasoning,
        cueText: "Stove is on.\nDanger.",
      },
    });
    expect(result.ok).toBe(false);
    expect(result.reasonRejected).toBe("no_certainty_about_hazards");
  });

  it("rejects emergency / medical claims", () => {
    expect(
      validateAndRejectUnsafeCue({
        reasoning: { ...baseReasoning, cueText: "Emergency.\nLeave now." },
      }).reasonRejected
    ).toBe("no_unverified_emergency");
    expect(
      validateAndRejectUnsafeCue({
        reasoning: { ...baseReasoning, cueText: "Diagnosis: stroke.\n" },
      }).reasonRejected
    ).toBe("no_medical_claims");
  });

  it("rejects a direction cue when direction is unknown", () => {
    const result = validateAndRejectUnsafeCue({
      reasoning: {
        ...baseReasoning,
        cueText: "Road alert:\nsiren on left.",
      },
      detectionDirection: "unknown",
    });
    expect(result.ok).toBe(false);
    expect(result.reasonRejected).toBe("direction_unknown");
  });

  it("accepts a direction cue when direction is provided", () => {
    const result = validateAndRejectUnsafeCue({
      reasoning: {
        ...baseReasoning,
        cueText: "Road alert:\nsiren on left.",
      },
      detectionDirection: "left",
    });
    expect(result.ok).toBe(true);
    expect(result.cue?.text).toContain("left");
  });

  it("rejects too-long cue text", () => {
    const long = "a".repeat(120);
    const result = validateAndRejectUnsafeCue({
      reasoning: { ...baseReasoning, cueText: long },
    });
    expect(result.ok).toBe(false);
    expect(result.reasonRejected).toMatch(/too_long/);
  });

  it("rejects more than two lines", () => {
    const result = validateAndRejectUnsafeCue({
      reasoning: { ...baseReasoning, cueText: "a\nb\nc" },
    });
    expect(result.ok).toBe(false);
    expect(result.reasonRejected).toMatch(/too_many_lines/);
  });
});
