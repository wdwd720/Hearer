// Even Hub audio input adapter.
//
// Subscribes to the bridge's `onEvenHubEvent`, extracts the PCM payload from
// whichever envelope the SDK ships, and forwards a Hearer AudioFrame to the
// brain. The brain then runs the same feature extractor / classifier /
// world-state / cue compressor pipeline as for any other input source.
//
// We never decode audio for playback. We never persist raw audio.

import type {
  AdapterStatusReport,
  WorldAudioFrameCallback,
  WorldAudioInputAdapter,
} from "../g2RuntimeTypes";
import {
  probeEvenHubBridge,
  type EvenHubBridgeLike,
} from "./evenHubBridgeClient";
import {
  EVEN_HUB_SAMPLE_RATE,
  extractPcmFromEvenHubEvent,
  pcm16leToAudioFrame,
} from "./evenHubPcm";

export class EvenHubAudioInputAdapter implements WorldAudioInputAdapter {
  id = "even_g2_mic";
  label = "Even G2 microphone";
  kind = "even_g2_mic" as const;
  isPrimaryTarget = true;

  private bridge: EvenHubBridgeLike | null = null;
  private unsubscribe: (() => void) | null = null;
  private status: AdapterStatusReport["status"] = "idle";
  private detail = "Not started.";
  private detectedShapeWarned = false;

  async isAvailable(): Promise<boolean> {
    const probe = await probeEvenHubBridge();
    return probe.available;
  }

  async start(onFrame: WorldAudioFrameCallback): Promise<void> {
    this.status = "initialising";
    this.detail = "Probing Even Hub bridge…";
    const probe = await probeEvenHubBridge();
    if (!probe.available || !probe.bridge) {
      this.status = "unavailable";
      this.detail = probe.reason;
      return;
    }
    this.bridge = probe.bridge;

    try {
      await this.bridge.audioControl(true);
    } catch (err) {
      this.status = "error";
      this.detail = `audioControl(true) failed: ${
        err instanceof Error ? err.message : String(err)
      }`;
      return;
    }

    const handler = (event: unknown) => {
      const pcm = extractPcmFromEvenHubEvent(event);
      if (!pcm) {
        if (!this.detectedShapeWarned) {
          this.detectedShapeWarned = true;
          // eslint-disable-next-line no-console
          console.info(
            "[EvenHubAudioInputAdapter] Ignoring non-audio event from bridge."
          );
        }
        return;
      }
      const frame = pcm16leToAudioFrame(pcm, {
        source: "simulated", // Frame.source is the audio source kind; we tag
        // glasses audio in g2RuntimeController instead so the existing
        // detection-event log shows it as `even_g2_mic`.
        sampleRate: EVEN_HUB_SAMPLE_RATE,
      });
      onFrame(frame);
    };

    this.unsubscribe = this.bridge.onEvenHubEvent(handler);
    this.status = "listening";
    this.detail = "Listening to Even G2 microphone.";
  }

  async stop(): Promise<void> {
    if (this.unsubscribe) {
      try {
        this.unsubscribe();
      } catch {
        /* ignore */
      }
      this.unsubscribe = null;
    }
    if (this.bridge) {
      try {
        await this.bridge.audioControl(false);
      } catch {
        /* ignore */
      }
    }
    this.status = "idle";
    this.detail = "Stopped.";
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
