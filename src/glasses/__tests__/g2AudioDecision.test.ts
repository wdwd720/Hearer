import { describe, expect, it } from "vitest";
import { decideFromLiveAudio } from "../../engine/liveAudioDecision";
import { cloneDemoProfile } from "../../engine/demoProfile";
import type { Routine } from "../../../shared/types";

const COOKING_ROUTINE: Routine = {
  id: "rout_cooking_demo",
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

describe("G2 audio path → cooking memory → kitchen-timer cue", () => {
  it("G2 mic audio with cooking memory produces 'Kitchen timer beeping. / Check stove.'", () => {
    const decision = decideFromLiveAudio({
      audioSignal: {
        kind: "audio",
        event: "timer_beep",
        confidence: 0.9,
        timestamp: new Date().toISOString(),
        // direction is intentionally unknown — the cue should still be
        // strong because of the cooking routine match.
      },
      override: {
        location: "kitchen",
        activity: "cooking",
        cookingRoutine: true,
        deliveryExpected: false,
        eventMode: false,
      },
      memory: cloneDemoProfile(),
      persistedRoutines: [COOKING_ROUTINE],
    });
    expect(decision.cue.text).toBe("Kitchen timer beeping.\nCheck stove.");
    expect(decision.cue.priority).toBe("urgent");
    expect(decision.cue.actionType).toBe("physical");

    // Hearer must NOT make hard sensor claims it can't back up.
    expect(decision.cue.text.toLowerCase()).not.toContain("stove is on");
    expect(decision.cue.text.toLowerCase()).not.toContain("danger");
    expect(decision.cue.text.toLowerCase()).not.toContain("emergency");
  });

  it("same beep with unknown context yields a softer generic cue", () => {
    const decision = decideFromLiveAudio({
      audioSignal: {
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
      memory: cloneDemoProfile(),
      persistedRoutines: [],
    });
    expect(decision.cue.text).toBe("Timer beeping.\nCheck nearby.");
    expect(decision.cue.priority).toBe("high");
    expect(decision.cue.actionType).toBe("physical");
  });

  it("speech-like audio never hallucinates a transcript", () => {
    const decision = decideFromLiveAudio({
      audioSignal: {
        kind: "audio",
        event: "speech_nearby",
        confidence: 0.9,
        timestamp: new Date().toISOString(),
      },
      override: {
        location: "event",
        activity: "stationary",
        cookingRoutine: false,
        deliveryExpected: false,
        eventMode: true,
      },
      memory: cloneDemoProfile(),
      persistedRoutines: [],
    });
    expect(decision.cue.text).toContain("Speech nearby");
    expect(decision.cue.actionType).toBe("awareness");
    expect(decision.cue.priority).toBe("low");
    // Must not invent words.
    expect(decision.cue.text.toLowerCase()).not.toContain("said");
    expect(decision.cue.text.toLowerCase()).not.toContain("question");
  });
});
