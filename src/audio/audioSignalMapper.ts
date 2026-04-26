// Map audio classifications into Hearer AudioSignals.
// Confidence thresholds keep low-confidence detections from interrupting the HUD.

import type { AudioSignal, AudioEvent } from "../engine/types";
import type { AudioClassification, AudioLabel } from "./audioTypes";

export interface MapResult {
  signal: AudioSignal | null;
  reason: string;
}

const LABEL_TO_EVENT: Record<AudioLabel, AudioEvent | null> = {
  timer_beep: "timer_beep",
  alarm: "alarm",
  siren: "siren",
  horn: "horn",
  doorbell: "doorbell",
  knock: "knock",
  speech: "speech_nearby",
  applause: "applause",
  laughter: "laughter",
  unknown: null,
};

const ROUTING_THRESHOLDS: Record<AudioLabel, number> = {
  timer_beep: 0.55,
  alarm: 0.55,
  siren: 0.55,
  horn: 0.55,
  doorbell: 0.6,
  knock: 0.6,
  speech: 0.65,
  applause: 0.65,
  laughter: 0.65,
  unknown: 1.01, // never routes
};

export function getRoutingThreshold(label: AudioLabel): number {
  return ROUTING_THRESHOLDS[label];
}

export function shouldRoute(classification: AudioClassification): boolean {
  return classification.confidence >= ROUTING_THRESHOLDS[classification.label];
}

export function mapAudioClassificationToSignal(
  classification: AudioClassification
): MapResult {
  const event = LABEL_TO_EVENT[classification.label];
  if (!event) {
    return {
      signal: null,
      reason: "Unknown audio — not mapped to a Hearer signal.",
    };
  }

  const signal: AudioSignal = {
    kind: "audio",
    event,
    confidence: classification.confidence,
    timestamp: new Date().toISOString(),
    direction: "unknown",
  };

  return {
    signal,
    reason: `Mapped ${classification.label} (conf ${classification.confidence.toFixed(
      2
    )}) → AudioSignal "${event}".`,
  };
}
