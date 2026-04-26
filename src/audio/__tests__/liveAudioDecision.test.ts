import { describe, expect, it } from "vitest";
import { decideFromLiveAudio } from "../../engine/liveAudioDecision";
import { cloneDemoProfile } from "../../engine/demoProfile";
import type { LocationName, MotionActivity } from "../../engine/types";

const baseOverride = (
  loc: LocationName,
  act: MotionActivity,
  patch: Partial<{
    cookingRoutine: boolean;
    deliveryExpected: boolean;
    eventMode: boolean;
  }> = {}
) => ({
  location: loc,
  activity: act,
  cookingRoutine: false,
  deliveryExpected: false,
  eventMode: false,
  ...patch,
});

describe("decideFromLiveAudio", () => {
  it("timer_beep + kitchen/cooking produces the kitchen timer cue", () => {
    const decision = decideFromLiveAudio({
      audioSignal: {
        kind: "audio",
        event: "timer_beep",
        confidence: 0.9,
        timestamp: new Date().toISOString(),
      },
      override: baseOverride("kitchen", "cooking", { cookingRoutine: true }),
      memory: cloneDemoProfile(),
    });
    expect(decision.cue.text).toContain("Kitchen timer beeping");
    expect(decision.cue.text).toContain("Check stove");
    expect(decision.cue.actionType).toBe("physical");
    expect(decision.cue.priority).toBe("urgent");
    // Action router should keep this as a HUD cue with a vibration sim, not a fake digital task.
    expect(decision.actions.every((a) => a.type === "simulate_vibration")).toBe(true);
  });

  it("timer_beep with unknown context produces a softer generic cue", () => {
    const decision = decideFromLiveAudio({
      audioSignal: {
        kind: "audio",
        event: "timer_beep",
        confidence: 0.7,
        timestamp: new Date().toISOString(),
      },
      override: baseOverride("unknown", "unknown"),
      memory: cloneDemoProfile(),
    });
    expect(decision.cue.text).toContain("Timer beeping");
    expect(decision.cue.text).toContain("Check nearby");
    expect(decision.cue.actionType).toBe("physical");
    expect(decision.cue.priority).toBe("high");
    // No transcript hallucinated.
    expect(decision.cue.text.toLowerCase()).not.toContain("said");
  });

  it("siren on a street while walking is urgent and physical", () => {
    const decision = decideFromLiveAudio({
      audioSignal: {
        kind: "audio",
        event: "siren",
        confidence: 0.82,
        timestamp: new Date().toISOString(),
      },
      override: baseOverride("street", "walking"),
      memory: cloneDemoProfile(),
    });
    expect(decision.cue.text).toContain("Road alert");
    expect(decision.cue.priority).toBe("urgent");
    expect(decision.cue.actionType).toBe("physical");
  });

  it("speech_nearby never hallucinates a transcript", () => {
    const decision = decideFromLiveAudio({
      audioSignal: {
        kind: "audio",
        event: "speech_nearby",
        confidence: 0.8,
        timestamp: new Date().toISOString(),
      },
      override: baseOverride("event", "stationary", { eventMode: true }),
      memory: cloneDemoProfile(),
    });
    expect(decision.cue.text).toContain("Speech nearby");
    expect(decision.cue.actionType).toBe("awareness");
    expect(decision.cue.priority).toBe("low");
    expect(decision.actions).toHaveLength(0);
  });

  it("knock at home is physical and high priority", () => {
    const decision = decideFromLiveAudio({
      audioSignal: {
        kind: "audio",
        event: "knock",
        confidence: 0.75,
        timestamp: new Date().toISOString(),
      },
      override: baseOverride("home", "stationary"),
      memory: cloneDemoProfile(),
    });
    expect(decision.cue.text).toContain("Knock detected");
    expect(decision.cue.text).toContain("Check door");
    expect(decision.cue.actionType).toBe("physical");
    expect(decision.cue.priority).toBe("high");
  });
});
