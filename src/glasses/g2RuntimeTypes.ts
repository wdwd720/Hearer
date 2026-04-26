// Glasses-first runtime types for Hearer.
//
// Hearer is designed for the loop:
//
//   Even G2 microphone → Even Hub / phone runtime → Hearer brain
//     → world-state engine → priority engine → cue compressor
//     → Even G2 HUD
//
// The browser/laptop simulator is a development and judging fallback.
// Phone/laptop microphones are FALLBACK inputs only — the intended primary
// sensor is the G2 mic exposed through the Even Hub bridge.
//
// These adapter interfaces let us plug a real Even Hub SDK in later without
// touching the brain. The brain only ever sees AudioFrames and emits Cues.

import type { AudioFrame } from "../audio/audioTypes";
import type { Cue } from "../engine/types";

export type WorldAudioInputKind =
  | "even_g2_mic"
  | "browser_mic_fallback"
  | "uploaded_file"
  | "generated_fixture"
  | "simulated";

export type HudOutputKind = "even_g2_hud" | "simulator_hud";

export type AdapterStatus =
  | "idle"
  | "initialising"
  | "connected"
  | "listening"
  | "unavailable"
  | "fallback_active"
  | "error";

export interface AdapterStatusReport {
  kind: WorldAudioInputKind | HudOutputKind;
  status: AdapterStatus;
  isPrimaryTarget: boolean;
  detail?: string;
}

export interface WorldAudioFrameCallback {
  (frame: AudioFrame): void;
}

export interface WorldAudioInputAdapter {
  id: string;
  label: string;
  kind: WorldAudioInputKind;
  isPrimaryTarget: boolean;
  isAvailable(): Promise<boolean>;
  start(onFrame: WorldAudioFrameCallback): Promise<void>;
  stop(): Promise<void>;
  getStatus(): AdapterStatusReport;
}

export interface HudPayload {
  text: string;
  priority: Cue["priority"];
  actionType: Cue["actionType"];
  ttlMs?: number;
}

export interface HudOutputAdapter {
  id: string;
  label: string;
  kind: HudOutputKind;
  isPrimaryTarget: boolean;
  isAvailable(): Promise<boolean>;
  sendCue(cue: Cue): Promise<void>;
  clearCue(): Promise<void>;
  getStatus(): AdapterStatusReport;
}

export interface G2RuntimeSnapshot {
  inputAdapter: AdapterStatusReport;
  outputAdapter: AdapterStatusReport;
  bridgeDetected: boolean;
  fallbackActive: boolean;
  message: string;
}

// The minimum cue payload that should ever leave the Hearer brain for the
// user-facing display, whether it's the simulator or the real glasses.
export function cueToHudPayload(cue: Cue): HudPayload {
  return {
    text: cue.text,
    priority: cue.priority,
    actionType: cue.actionType,
    ttlMs: cue.priority === "urgent" ? 6000 : 4000,
  };
}
