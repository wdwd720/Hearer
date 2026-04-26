// Even Hub HUD output adapter.
//
// Sends one tiny cue payload to the G2 display. Different SDK versions ship
// different rendering surfaces (`showText`, `updateText`, container/page
// APIs, etc.), so we probe and use the first available method. If none of
// them are present, we log the wire payload and stay honest about being
// adapter-ready rather than connected.

import type { Cue } from "../../engine/types";
import type {
  AdapterStatusReport,
  HudOutputAdapter,
} from "../g2RuntimeTypes";
import { cueToHudPayload } from "../g2RuntimeTypes";
import {
  probeEvenHubBridge,
  type EvenHubBridgeLike,
} from "./evenHubBridgeClient";

export class EvenHubHudOutputAdapter implements HudOutputAdapter {
  id = "even_g2_hud";
  label = "Even G2 HUD";
  kind = "even_g2_hud" as const;
  isPrimaryTarget = true;

  private bridge: EvenHubBridgeLike | null = null;
  private status: AdapterStatusReport["status"] = "idle";
  private detail = "Not connected.";

  async isAvailable(): Promise<boolean> {
    const probe = await probeEvenHubBridge();
    return probe.available;
  }

  async sendCue(cue: Cue): Promise<void> {
    const payload = cueToHudPayload(cue);
    const probe = await probeEvenHubBridge();
    if (!probe.available || !probe.bridge) {
      this.status = "unavailable";
      this.detail = probe.reason;
      // eslint-disable-next-line no-console
      console.info("[EvenHubHudOutputAdapter] would send to G2:", payload);
      return;
    }
    this.bridge = probe.bridge;

    // Try the most direct rendering paths first.
    try {
      if (typeof this.bridge.updateText === "function") {
        await this.bridge.updateText(payload.text, { ttlMs: payload.ttlMs });
      } else if (typeof this.bridge.showText === "function") {
        await this.bridge.showText(payload.text, { ttlMs: payload.ttlMs });
      } else if (
        typeof this.bridge.ensureCuePage === "function" &&
        typeof this.bridge.setCuePageText === "function"
      ) {
        await this.bridge.ensureCuePage();
        await this.bridge.setCuePageText(payload.text);
      } else {
        // Bridge exists but exposes no rendering surface we recognise.
        this.status = "fallback_active";
        this.detail =
          "Bridge connected, but no compatible HUD render API found in this SDK version.";
        // eslint-disable-next-line no-console
        console.info(
          "[EvenHubHudOutputAdapter] would send to G2:",
          payload,
          "(SDK render API missing)"
        );
        return;
      }
      this.status = "connected";
      this.detail = `Sent cue (${payload.text.replace(/\n/g, " · ")}) to G2 HUD.`;
    } catch (err) {
      this.status = "error";
      this.detail = `sendCue failed: ${
        err instanceof Error ? err.message : String(err)
      }`;
    }
  }

  async clearCue(): Promise<void> {
    const probe = await probeEvenHubBridge();
    if (!probe.available || !probe.bridge) {
      // eslint-disable-next-line no-console
      console.info("[EvenHubHudOutputAdapter] would clear G2 HUD.");
      return;
    }
    if (typeof probe.bridge.clearDisplay === "function") {
      try {
        await probe.bridge.clearDisplay();
      } catch {
        /* ignore */
      }
    }
  }

  getStatus(): AdapterStatusReport {
    return {
      kind: this.kind,
      status: this.status,
      isPrimaryTarget: this.isPrimaryTarget,
      detail: this.detail,
    };
  }
}
