import { describe, expect, it } from "vitest";
import { inferWorldState } from "../worldStateEngine";
import type { Routine } from "../../../shared/types";

const COOKING_ROUTINE: Routine = {
  id: "rout_cooking",
  name: "Cooking timer safety cue",
  triggerType: "combined",
  triggerDescription: "evening + home/kitchen + timer/beep",
  actionType: "physical",
  actionLabel: "check stove",
  enabled: true,
  confidence: 0.9,
  source: "typed",
  createdAt: new Date(0).toISOString(),
  updatedAt: new Date(0).toISOString(),
};

describe("worldStateEngine.inferWorldState", () => {
  it("beep + cooking routine + kitchen context → urgent check-stove cue", () => {
    const result = inferWorldState({
      audio: {
        kind: "audio",
        event: "timer_beep",
        confidence: 0.9,
        timestamp: new Date().toISOString(),
      },
      override: {
        location: "kitchen",
        activity: "cooking",
        cookingRoutine: true,
        deliveryExpected: false,
        eventMode: false,
      },
      persistedRoutines: [COOKING_ROUTINE],
      hourOfDay: 19,
    });
    expect(result.riskKind).toBe("possible_unattended_cooking");
    expect(result.physicalAction).toBe("check stove");
    expect(result.suggestedPriority).toBe("urgent");
    expect(result.matchedRoutineIds).toContain(COOKING_ROUTINE.id);
    // Must remain honest about certainty.
    expect(result.certainty).toBe("medium");
    expect(result.reason.toLowerCase()).not.toContain("stove is on");
  });

  it("beep + unknown context → softer 'check nearby' cue", () => {
    const result = inferWorldState({
      audio: {
        kind: "audio",
        event: "timer_beep",
        confidence: 0.7,
        timestamp: new Date().toISOString(),
      },
      override: {
        location: "unknown",
        activity: "unknown",
        cookingRoutine: false,
        deliveryExpected: false,
        eventMode: false,
      },
      persistedRoutines: [],
      hourOfDay: 14,
    });
    expect(result.riskKind).toBe("possible_appliance_alert");
    expect(result.physicalAction).toBe("check nearby");
    expect(result.suggestedPriority).toBe("high");
    expect(result.matchedRoutineIds).toEqual([]);
  });

  it("never claims certainty about hazards without a sensor", () => {
    const result = inferWorldState({
      audio: {
        kind: "audio",
        event: "alarm",
        confidence: 0.95,
        timestamp: new Date().toISOString(),
      },
      override: {
        location: "kitchen",
        activity: "cooking",
        cookingRoutine: true,
        deliveryExpected: false,
        eventMode: false,
      },
      persistedRoutines: [COOKING_ROUTINE],
      hourOfDay: 19,
    });
    expect(["low", "medium"]).toContain(result.certainty);
    expect(result.reason.toLowerCase()).not.toContain("stove is on");
    expect(result.reason.toLowerCase()).not.toContain("emergency");
    expect(result.reason.toLowerCase()).not.toContain("danger");
  });
});
