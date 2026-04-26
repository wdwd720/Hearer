import { describe, expect, it } from "vitest";
import { decide } from "../contextEngine";
import { getScenario } from "../scenarios";
import { cloneDemoProfile } from "../demoProfile";

describe("actionRouter via decide()", () => {
  it("promise scenario produces digital actions including a draft", () => {
    const sc = getScenario("promise_jason");
    expect(sc).toBeDefined();
    if (!sc) return;
    const result = decide({ scenario: sc, memory: cloneDemoProfile() });
    expect(result.cue.actionType).toBe("digital");
    expect(result.actions.length).toBeGreaterThanOrEqual(2);
    expect(result.actions.some((a) => a.type === "draft_text")).toBe(true);
    expect(result.actions.some((a) => a.type === "save_memory")).toBe(true);
  });

  it("kitchen timer scenario produces physical cue with vibration", () => {
    const sc = getScenario("kitchen_timer");
    if (!sc) return;
    const result = decide({ scenario: sc, memory: cloneDemoProfile() });
    expect(result.cue.actionType).toBe("physical");
    expect(result.actions.some((a) => a.type === "simulate_vibration")).toBe(true);
  });

  it("leaving home produces physical cue with no fake automation", () => {
    const sc = getScenario("leaving_home");
    if (!sc) return;
    const result = decide({ scenario: sc, memory: cloneDemoProfile() });
    expect(result.cue.actionType).toBe("physical");
    expect(result.actions.length).toBe(0);
  });
});
