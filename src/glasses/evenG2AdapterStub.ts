// Even G2 / Even Hub adapter — STUB ONLY.
//
// This adapter exists to make the boundary honest. There is no BLE, no SDK
// integration, and no firmware contract here. The final glasses payload
// must remain only the compressed cue text plus priority/action metadata.
//
// FUTURE INTEGRATION POINTS:
//   - Even Hub / Even Realities SDK once available.
//   - Native bridge over Bluetooth LE (e.g. via Capacitor / Tauri).
//   - WebHID / WebSerial if the device exposes a compatible interface.
//
// For now sendCue() is a no-op that logs what would be sent.

import type { Cue } from "../engine/types";
import type { HudOutputAdapter } from "./hudOutputAdapter";

export interface EvenG2Payload {
  text: string;
  priority: Cue["priority"];
  actionType: Cue["actionType"];
  // Keep the wire format minimal — the glasses do not need scenario or memory.
  ttlMs?: number;
}

export class EvenG2AdapterStub implements HudOutputAdapter {
  id = "even_g2_stub";
  label = "Even G2 adapter (stub)";

  private connected = false;

  isConnected(): boolean {
    return this.connected;
  }

  // Hooks the stub up to a future bridge. Not called in this MVP.
  async connect(): Promise<boolean> {
    this.connected = false;
    // eslint-disable-next-line no-console
    console.info(
      "[EvenG2AdapterStub] connect() called — no SDK in this build, staying disconnected."
    );
    return false;
  }

  sendCue(cue: Cue): void {
    const payload: EvenG2Payload = {
      text: cue.text,
      priority: cue.priority,
      actionType: cue.actionType,
      ttlMs: cue.priority === "urgent" ? 6000 : 4000,
    };
    // eslint-disable-next-line no-console
    console.info("[EvenG2AdapterStub] would send to glasses:", payload);
  }

  clearCue(): void {
    // eslint-disable-next-line no-console
    console.info("[EvenG2AdapterStub] would clear HUD on glasses.");
  }
}
