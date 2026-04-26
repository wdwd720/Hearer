import { describe, expect, it } from "vitest";
import { G2RuntimeController } from "../g2RuntimeController";
import { __resetEvenHubProbeForTests } from "../evenHub/evenHubBridgeClient";
import { cloneDemoProfile } from "../../engine/demoProfile";
import { memorySummaryToDemoMemory } from "../../memory/memoryToDemoMemory";

describe("G2RuntimeController", () => {
  it("falls back to simulator HUD when no Even Hub bridge is detected", async () => {
    __resetEvenHubProbeForTests();
    const controller = new G2RuntimeController({
      getMemory: () => cloneDemoProfile(),
      getOverride: () => ({
        location: "kitchen",
        activity: "cooking",
        cookingRoutine: true,
        deliveryExpected: false,
        eventMode: false,
        direction: "unknown",
      }),
      getPersistedRoutines: () => [],
    });
    await controller.init();
    const snap = controller.snapshot();
    expect(snap.bridgeDetected).toBe(false);
    expect(snap.fallbackActive).toBe(true);
    expect(snap.message).toMatch(/simulator\/dev mode/i);
    expect(snap.outputAdapter.kind).toBe("simulator_hud");
  });

  it("does not crash in a non-bridge environment", async () => {
    __resetEvenHubProbeForTests();
    const summary = memorySummaryToDemoMemory({
      userProfile: {
        id: "default",
        displayName: "Mihir",
        alertStyle: "minimal",
        interruptionMode: "normal",
        createdAt: new Date(0).toISOString(),
        updatedAt: new Date(0).toISOString(),
      },
      knownPeople: [],
      importantItems: [],
      routines: [],
      commitments: [],
      locations: [],
      recentCues: [],
    });
    const controller = new G2RuntimeController({
      getMemory: () => summary,
      getOverride: () => ({
        location: "unknown",
        activity: "unknown",
        cookingRoutine: false,
        deliveryExpected: false,
        eventMode: false,
        direction: "unknown",
      }),
      getPersistedRoutines: () => [],
    });
    await controller.init();
    // Even if "Start G2 listening" is invoked, it should resolve without
    // throwing — the EvenHub adapter just reports `unavailable`.
    await expect(controller.startG2Listening()).resolves.not.toThrow();
    await controller.stopListening();
  });
});
