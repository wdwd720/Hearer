// Audio Awareness V1 — types.
//
// These describe the live-audio side of the Hearer pipeline:
// audio source -> features -> classification -> Hearer AudioSignal.
//
// Raw audio is processed locally and never stored by the app.

import type { AudioSignal, DecisionResult } from "../engine/types";

export type AudioSourceKind =
  | "microphone"
  | "display_audio"
  | "file"
  | "simulated";

export type AudioCaptureStatus =
  | "idle"
  | "requesting_permission"
  | "listening"
  | "processing_file"
  | "error"
  | "stopped";

export interface AudioFrame {
  id: string;
  source: AudioSourceKind;
  timestamp: string;
  sampleRate: number;
  channelData: Float32Array;
  durationMs: number;
}

export interface AudioFeatures {
  rms: number;
  peak: number;
  zeroCrossingRate: number;
  spectralCentroid?: number;
  dominantFrequency?: number;
  energyBands?: {
    low: number;
    mid: number;
    high: number;
  };
  // Heuristic scores in [0, 1].
  periodicityScore?: number;
  speechLikeScore?: number;
  beepLikeScore?: number;
  sirenLikeScore?: number;
  transientScore?: number;
  // Inter-frame derivatives (filled by the classifier when it has history).
  freqVariation?: number;
  burstCount?: number;
}

export type AudioLabel =
  | "timer_beep"
  | "alarm"
  | "siren"
  | "horn"
  | "doorbell"
  | "knock"
  | "speech"
  | "applause"
  | "laughter"
  | "unknown";

export type ClassifierSource =
  | "rule_based"
  | "yamnet"
  | "manual"
  | "fixture";

export interface AudioClassification {
  label: AudioLabel;
  confidence: number;
  source: ClassifierSource;
  explanation: string;
  rawLabels?: Array<{ label: string; score: number }>;
}

export interface AudioDetectionEvent {
  id: string;
  timestamp: string;
  source: AudioSourceKind;
  features: AudioFeatures;
  classification: AudioClassification;
  mappedSignal: AudioSignal | null;
  decisionResult?: DecisionResult;
  routed: boolean;
  routeNote?: string;
}

export interface LiveContextOverride {
  location: import("../engine/types").LocationName;
  activity: import("../engine/types").MotionActivity;
  cookingRoutine: boolean;
  deliveryExpected: boolean;
  eventMode: boolean;
}

export interface AudioControllerSnapshot {
  status: AudioCaptureStatus;
  source: AudioSourceKind | null;
  level: number; // 0..1, smoothed RMS
  classifierId: string;
  classifierLabel: string;
  lastError?: string;
  detections: AudioDetectionEvent[];
  autoRoute: boolean;
}
