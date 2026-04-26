import { describe, expect, it } from "vitest";
import {
  compressCandidateCue,
  compressKitchenTimerCue,
  compressLeavingHomeCue,
  compressPromiseCue,
  compressQuestionCue,
} from "../cueCompressor";
import type { ContextState, Signal } from "../types";

const baseCtx: ContextState = {
  location: "unknown",
  activity: "unknown",
  activeRoutines: [],
  knownPeople: [],
  openTasks: [],
  importantItems: ["keys", "laptop"],
  signalsCombined: 0,
};

describe("cueCompressor", () => {
  it("kitchen timer cue is short and direct", () => {
    const cue = compressKitchenTimerCue();
    expect(cue.text).toContain("Kitchen timer");
    expect(cue.text).toContain("Check stove");
    const longest = cue.text.split("\n").reduce((a, l) => Math.max(a, l.length), 0);
    expect(longest).toBeLessThanOrEqual(28);
    expect(cue.actionType).toBe("physical");
  });

  it("leaving home cue surfaces top items", () => {
    const cue = compressLeavingHomeCue(["keys", "laptop", "wallet"]);
    expect(cue.text).toContain("Leaving home");
    expect(cue.text).toContain("keys + laptop");
  });

  it("question cue strips the addressed name and never dumps full transcript", () => {
    const cue = compressQuestionCue("Mihir, are you ready to demo?");
    expect(cue.text.toLowerCase()).not.toContain("mihir");
    expect(cue.text.toLowerCase()).toContain("ready to demo");
  });

  it("promise cue mentions person and is digital", () => {
    const cue = compressPromiseCue("Jason", "deck");
    expect(cue.text).toContain("Promise saved");
    expect(cue.text).toContain("Jason");
    expect(cue.actionType).toBe("digital");
  });

  it("unknown scenario returns idle cue", () => {
    const cue = compressCandidateCue({
      scenarioId: "nonexistent",
      signals: [] as Signal[],
      context: baseCtx,
    });
    expect(cue.text).toBe("No cue needed");
  });
});
