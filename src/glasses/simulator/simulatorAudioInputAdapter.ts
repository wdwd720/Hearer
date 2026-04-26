// Simulator audio input adapters.
//
// These are FALLBACK paths only. The intended primary sensor is the Even G2
// microphone via the Even Hub bridge. The browser mic exists so the simulator
// can be exercised without hardware. Uploaded files and generated fixtures
// are deterministic test inputs — they are not "real user audio".

import {
  processAudioFile,
  startDisplayAudioCapture,
  startMicrophoneCapture,
  type AudioSourceHandle,
} from "../../audio/audioSource";
import type { AudioFrame } from "../../audio/audioTypes";
import type {
  AdapterStatusReport,
  WorldAudioFrameCallback,
  WorldAudioInputAdapter,
} from "../g2RuntimeTypes";

abstract class SimulatorInputBase implements WorldAudioInputAdapter {
  abstract id: string;
  abstract label: string;
  abstract kind: WorldAudioInputAdapter["kind"];
  isPrimaryTarget = false;

  protected status: AdapterStatusReport["status"] = "idle";
  protected detail = "Fallback input — Even G2 mic is the intended primary sensor.";

  abstract isAvailable(): Promise<boolean>;
  abstract start(onFrame: WorldAudioFrameCallback): Promise<void>;
  abstract stop(): Promise<void>;

  getStatus(): AdapterStatusReport {
    return {
      kind: this.kind,
      status: this.status,
      isPrimaryTarget: this.isPrimaryTarget,
      detail: this.detail,
    };
  }
}

/**
 * Browser microphone fallback.
 *
 * Used so we can exercise the entire pipeline (features → classifier →
 * world-state → cue → HUD) without G2 hardware. The output is FALLBACK and
 * the UI is required to label it so the demo doesn't mislead judges.
 */
export class BrowserMicrophoneFallbackAdapter extends SimulatorInputBase {
  id = "browser_mic_fallback";
  label = "Browser microphone (fallback)";
  kind = "browser_mic_fallback" as const;

  private handle: AudioSourceHandle | null = null;

  async isAvailable(): Promise<boolean> {
    if (typeof navigator === "undefined" || !navigator.mediaDevices) return false;
    return typeof navigator.mediaDevices.getUserMedia === "function";
  }

  async start(onFrame: WorldAudioFrameCallback): Promise<void> {
    this.status = "initialising";
    this.detail = "Requesting microphone permission…";
    this.handle = await startMicrophoneCapture({
      onFrame: (frame: AudioFrame) => onFrame(frame),
      onError: (msg) => {
        this.status = "error";
        this.detail = msg;
      },
      onStopped: () => {
        if ((this.status as AdapterStatusReport["status"]) === "listening") {
          this.status = "idle";
          this.detail = "Stopped.";
        }
      },
    });
    if ((this.status as AdapterStatusReport["status"]) !== "error") {
      this.status = "listening";
      this.detail = "Browser mic active (fallback only).";
    }
  }

  async stop(): Promise<void> {
    this.handle?.stop();
    this.handle = null;
    this.status = "idle";
    this.detail = "Stopped.";
  }
}

/**
 * Browser display/tab audio fallback. Same caveats as the mic fallback —
 * used to drive the simulator from a YouTube tab during demos.
 */
export class BrowserDisplayAudioFallbackAdapter extends SimulatorInputBase {
  id = "browser_display_fallback";
  label = "Tab/system audio (fallback)";
  kind = "browser_mic_fallback" as const;

  private handle: AudioSourceHandle | null = null;

  async isAvailable(): Promise<boolean> {
    if (typeof navigator === "undefined" || !navigator.mediaDevices) return false;
    const dm = (navigator.mediaDevices as { getDisplayMedia?: unknown })
      .getDisplayMedia;
    return typeof dm === "function";
  }

  async start(onFrame: WorldAudioFrameCallback): Promise<void> {
    this.status = "initialising";
    this.detail = "Requesting tab/system audio…";
    this.handle = await startDisplayAudioCapture({
      onFrame: (frame: AudioFrame) => onFrame(frame),
      onError: (msg) => {
        this.status = "error";
        this.detail = msg;
      },
      onStopped: () => {
        if ((this.status as AdapterStatusReport["status"]) === "listening") {
          this.status = "idle";
          this.detail = "Stopped.";
        }
      },
    });
    if ((this.status as AdapterStatusReport["status"]) !== "error") {
      this.status = "listening";
      this.detail = "Tab/system audio active (fallback only).";
    }
  }

  async stop(): Promise<void> {
    this.handle?.stop();
    this.handle = null;
    this.status = "idle";
    this.detail = "Stopped.";
  }
}

/**
 * Deterministic test input — uploaded file or generated fixture. Used only
 * for repeatable demos and for unit tests; never the real user surface.
 */
export class DeterministicTestInputAdapter extends SimulatorInputBase {
  id = "deterministic_test_input";
  label = "Deterministic test input";
  kind = "uploaded_file" as const;

  async isAvailable(): Promise<boolean> {
    return typeof window !== "undefined";
  }

  async start(): Promise<void> {
    // Driven externally by feedFile() — the controller calls processAudioFile
    // directly with an ArrayBuffer or File and the frames flow into the same
    // pipeline.
    this.status = "idle";
    this.detail = "Awaiting file/fixture.";
  }

  async stop(): Promise<void> {
    this.status = "idle";
    this.detail = "Stopped.";
  }

  async feed(
    input: File | ArrayBuffer,
    onFrame: WorldAudioFrameCallback
  ): Promise<void> {
    this.status = "listening";
    this.detail = "Processing deterministic test input…";
    await processAudioFile(input, {
      onFrame: (frame: AudioFrame) => onFrame(frame),
      onError: (msg) => {
        this.status = "error";
        this.detail = msg;
      },
      onStopped: () => {
        this.status = "idle";
        this.detail = "Done.";
      },
    });
  }
}
