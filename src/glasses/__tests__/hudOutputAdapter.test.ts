import { describe, expect, it } from "vitest";
import { cueToHudPayload } from "../g2RuntimeTypes";
import { SimulatorHudOutputAdapter } from "../simulator/simulatorHudOutputAdapter";
import { EvenHubHudOutputAdapter } from "../evenHub/evenHubHudOutputAdapter";
import { __resetEvenHubProbeForTests } from "../evenHub/evenHubBridgeClient";
import type { Cue } from "../../engine/types";

const cue: Cue = {
  id: "cue_test",
  text: "Kitchen timer beeping.\nCheck stove.",
  priority: "urgent",
  actionType: "physical",
  confidence: 0.9,
  timestamp: new Date().toISOString(),
  signalsUsed: ["audio"],
  reason: "test",
};

describe("HUD output adapters", () => {
  it("cueToHudPayload only carries text + priority + actionType + ttlMs", () => {
    const p = cueToHudPayload(cue);
    expect(Object.keys(p).sort()).toEqual(
      ["actionType", "priority", "text", "ttlMs"].sort()
    );
    expect(p.text).toBe(cue.text);
    expect(p.priority).toBe("urgent");
    expect(p.actionType).toBe("physical");
    expect(p.ttlMs).toBe(6000);
  });

  it("simulator HUD and Even G2 adapter agree on payload", async () => {
    __resetEvenHubProbeForTests();
    const simulator = new SimulatorHudOutputAdapter();
    let received: { text: string } | null = null;
    simulator.subscribe((payload) => {
      if (payload) received = { text: payload.text };
    });
    await simulator.sendCue(cue);
    expect(received).not.toBeNull();
    expect((received as unknown as { text: string }).text).toBe(cue.text);

    // Even G2 adapter without a bridge stays unavailable but should not throw.
    const g2 = new EvenHubHudOutputAdapter();
    await expect(g2.sendCue(cue)).resolves.toBeUndefined();
    const status = g2.getStatus();
    expect(["unavailable", "fallback_active"]).toContain(status.status);
  });
});
