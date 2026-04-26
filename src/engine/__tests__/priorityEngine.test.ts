import { describe, expect, it } from "vitest";
import { scorePriority } from "../priorityEngine";
import { getScenario } from "../scenarios";

describe("priorityEngine", () => {
  it("kitchen timer + cooking + kitchen yields urgent", () => {
    const sc = getScenario("kitchen_timer");
    expect(sc).toBeDefined();
    if (!sc) return;
    const result = scorePriority(sc, sc.signals, {
      location: "kitchen",
      activity: "cooking",
      activeRoutines: ["cooking_watch"],
      knownPeople: [],
      openTasks: [],
      importantItems: [],
      signalsCombined: sc.signals.length,
    });
    expect(result.priority).toBe("urgent");
  });

  it("road siren is urgent", () => {
    const sc = getScenario("road_siren");
    if (!sc) return;
    const result = scorePriority(sc, sc.signals, {
      location: "street",
      activity: "walking",
      activeRoutines: [],
      knownPeople: [],
      openTasks: [],
      importantItems: [],
      signalsCombined: sc.signals.length,
    });
    expect(result.priority).toBe("urgent");
  });

  it("promise commitment is medium, not urgent", () => {
    const sc = getScenario("promise_jason");
    if (!sc) return;
    const result = scorePriority(sc, sc.signals, {
      location: "unknown",
      activity: "unknown",
      activeRoutines: [],
      knownPeople: [],
      openTasks: [],
      importantItems: [],
      signalsCombined: sc.signals.length,
    });
    expect(result.priority).toBe("medium");
  });
});
