// Simulator HUD output adapter.
//
// Drives the in-app G2-style HUD preview. This is a development/judge
// fallback — the intended primary output is the Even G2 HUD via the Even Hub
// bridge. Keeping this adapter on the same interface guarantees that the
// payload reaching the simulator is exactly the payload that would reach the
// real glasses (just `text + priority + actionType + ttlMs`).

import type { Cue } from "../../engine/types";
import type {
  AdapterStatusReport,
  HudOutputAdapter,
  HudPayload,
} from "../g2RuntimeTypes";
import { cueToHudPayload } from "../g2RuntimeTypes";

export class SimulatorHudOutputAdapter implements HudOutputAdapter {
  id = "simulator_hud";
  label = "Simulator HUD (dev fallback)";
  kind = "simulator_hud" as const;
  isPrimaryTarget = false;

  private subscribers = new Set<(payload: HudPayload | null, cue: Cue | null) => void>();
  private currentCue: Cue | null = null;
  private currentPayload: HudPayload | null = null;
  private detail = "Simulator HUD active (dev fallback).";

  async isAvailable(): Promise<boolean> {
    return true;
  }

  async sendCue(cue: Cue): Promise<void> {
    const payload = cueToHudPayload(cue);
    this.currentCue = cue;
    this.currentPayload = payload;
    for (const sub of this.subscribers) sub(payload, cue);
  }

  async clearCue(): Promise<void> {
    this.currentCue = null;
    this.currentPayload = null;
    for (const sub of this.subscribers) sub(null, null);
  }

  subscribe(cb: (payload: HudPayload | null, cue: Cue | null) => void): () => void {
    this.subscribers.add(cb);
    cb(this.currentPayload, this.currentCue);
    return () => this.subscribers.delete(cb);
  }

  getCurrent(): { payload: HudPayload | null; cue: Cue | null } {
    return { payload: this.currentPayload, cue: this.currentCue };
  }

  getStatus(): AdapterStatusReport {
    return {
      kind: this.kind,
      status: "fallback_active",
      isPrimaryTarget: this.isPrimaryTarget,
      detail: this.detail,
    };
  }
}
