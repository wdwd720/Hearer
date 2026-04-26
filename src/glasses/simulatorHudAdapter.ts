import type { Cue } from "../engine/types";
import type { HudOutputAdapter } from "./hudOutputAdapter";

// Default adapter — drives the in-app Even G2-style HUD simulator.
// React subscribes to the cue stream; this adapter just hands it the cue.
export class SimulatorHudAdapter implements HudOutputAdapter {
  id = "simulator";
  label = "Simulator HUD";

  private subscribers = new Set<(cue: Cue | null) => void>();
  private current: Cue | null = null;

  isConnected(): boolean {
    return true;
  }

  sendCue(cue: Cue): void {
    this.current = cue;
    for (const sub of this.subscribers) sub(cue);
  }

  clearCue(): void {
    this.current = null;
    for (const sub of this.subscribers) sub(null);
  }

  subscribe(cb: (cue: Cue | null) => void): () => void {
    this.subscribers.add(cb);
    cb(this.current);
    return () => this.subscribers.delete(cb);
  }

  getCurrent(): Cue | null {
    return this.current;
  }
}
