// Audio classifier interface and rule-based local classifier.
//
// The classifier is intentionally pluggable. The Hearer brain consumes
// AudioClassification objects, not raw audio — so we can later swap in
// YAMNet/TF.js without touching the engine layer.

import type {
  AudioClassification,
  AudioFeatures,
  AudioLabel,
} from "./audioTypes";

export interface AudioClassifier {
  id: string;
  label: string;
  isAvailable(): Promise<boolean> | boolean;
  classify(features: AudioFeatures): Promise<AudioClassification>;
}

interface FeatureContext {
  // Inter-frame state passed in by the controller.
  freqVariation?: number;
  burstCount?: number;
  prevDominant?: number;
  source?: "rule_based" | "fixture";
}

function bestLabel(features: AudioFeatures, ctx: FeatureContext): {
  label: AudioLabel;
  confidence: number;
  explanation: string;
  raw: Array<{ label: string; score: number }>;
} {
  const rms = features.rms;
  const dom = features.dominantFrequency ?? 0;
  const tonality = features.periodicityScore ?? 0;
  const beep = features.beepLikeScore ?? 0;
  const siren = features.sirenLikeScore ?? 0;
  const speech = features.speechLikeScore ?? 0;
  const transient = features.transientScore ?? 0;
  const bands = features.energyBands;
  const freqVariation = ctx.freqVariation ?? 0;
  const burstCount = ctx.burstCount ?? 0;

  // Silence guard.
  if (rms < 0.012) {
    return {
      label: "unknown",
      confidence: 0,
      explanation: "Below noise floor.",
      raw: [{ label: "silence", score: 1 }],
    };
  }

  // Score each label. Confidence stays in [0, 1].
  const scores: Record<AudioLabel, number> = {
    timer_beep: 0,
    alarm: 0,
    siren: 0,
    horn: 0,
    doorbell: 0,
    knock: 0,
    speech: 0,
    applause: 0,
    laughter: 0,
    unknown: 0.05,
  };

  // Timer beep: tonal, mid-high pitch, periodic bursts (or current burst).
  if (tonality > 0.18 && dom > 1500 && dom < 5500) {
    scores.timer_beep = clamp01(
      beep * 0.55 +
        tonality * 0.5 +
        Math.min(rms * 3, 0.3) +
        Math.min(burstCount, 4) * 0.08
    );
  }

  // Alarm: loud, sustained tonal in a lower pitch band than canonical timer
  // beeps. Distinct from timer_beep so the two do not swap.
  if (tonality > 0.2 && dom > 600 && dom < 1500 && rms > 0.07) {
    scores.alarm = clamp01(
      tonality * 0.45 + Math.min(rms * 4, 0.45) + 0.1
    );
  }

  // Siren: tonal, mid frequency, dominant frequency *changes* across frames.
  if (tonality > 0.15 && dom > 350 && dom < 1800) {
    scores.siren = clamp01(
      siren * 0.5 + Math.min(freqVariation, 0.5) * 1.4 + (rms > 0.07 ? 0.15 : 0)
    );
  }

  // Horn: low-mid sustained tone, less sweep.
  if (tonality > 0.15 && dom > 200 && dom < 700 && rms > 0.06) {
    scores.horn = clamp01(tonality * 0.5 + Math.min(rms * 4, 0.5));
  }

  // Doorbell: tonal chime burst, mid-high freq, short.
  if (tonality > 0.2 && dom > 600 && dom < 2200 && transient > 0.4) {
    scores.doorbell = clamp01(tonality * 0.55 + transient * 0.4);
  }

  // Knock: short broadband transient, low-mid energy, low tonality.
  if (transient > 0.55 && tonality < 0.18 && bands && bands.low + bands.mid > 0.6) {
    scores.knock = clamp01(transient * 0.7 + (bands.low + bands.mid) * 0.3);
  }

  // Speech: mid-band, non-tonal, decent zcr.
  if (speech > 0.25 && tonality < 0.25) {
    scores.speech = clamp01(speech);
  }

  // Applause: many transients, broadband, non-tonal.
  if (transient > 0.45 && tonality < 0.18 && bands && bands.high > 0.25) {
    scores.applause = clamp01(transient * 0.6 + bands.high * 0.6);
  }

  // Laughter: speech-like but with high transient bursts.
  if (speech > 0.25 && transient > 0.4) {
    scores.laughter = clamp01(speech * 0.5 + transient * 0.4);
  }

  // Pick winner.
  let winner: AudioLabel = "unknown";
  let winnerScore = scores.unknown;
  for (const k of Object.keys(scores) as AudioLabel[]) {
    if (scores[k] > winnerScore) {
      winnerScore = scores[k];
      winner = k;
    }
  }

  const explanation = explain(winner, features, ctx, winnerScore);
  const raw = (Object.keys(scores) as AudioLabel[])
    .map((label) => ({ label, score: round3(scores[label]) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 5);

  return { label: winner, confidence: winnerScore, explanation, raw };
}

function explain(
  label: AudioLabel,
  f: AudioFeatures,
  ctx: FeatureContext,
  conf: number
): string {
  const dom = f.dominantFrequency
    ? `${Math.round(f.dominantFrequency)} Hz`
    : "n/a";
  const t = (f.periodicityScore ?? 0).toFixed(2);
  const r = f.rms.toFixed(3);
  const fv = (ctx.freqVariation ?? 0).toFixed(2);

  switch (label) {
    case "timer_beep":
      return `Tonal mid-high beep (${dom}, tonality ${t}) — confidence ${conf.toFixed(
        2
      )}.`;
    case "alarm":
      return `Loud sustained tone (${dom}, rms ${r}).`;
    case "siren":
      return `Sweeping mid tone (${dom}, freq-variation ${fv}).`;
    case "horn":
      return `Sustained low tone (${dom}, rms ${r}).`;
    case "doorbell":
      return `Tonal chime burst (${dom}, transient ${(
        f.transientScore ?? 0
      ).toFixed(2)}).`;
    case "knock":
      return `Broadband transient burst (rms ${r}, transient ${(
        f.transientScore ?? 0
      ).toFixed(2)}).`;
    case "speech":
      return `Mid-band, non-tonal, ZCR ${(f.zeroCrossingRate ?? 0).toFixed(
        3
      )} — speech-like.`;
    case "applause":
      return `Repeated broadband transients.`;
    case "laughter":
      return `Speech-like with bursty transients.`;
    case "unknown":
    default:
      return `No confident match (rms ${r}, tonality ${t}).`;
  }
}

function round3(v: number): number {
  return Math.round(v * 1000) / 1000;
}

function clamp01(v: number): number {
  if (!Number.isFinite(v)) return 0;
  if (v < 0) return 0;
  if (v > 1) return 1;
  return v;
}

export class RuleBasedAudioClassifier implements AudioClassifier {
  id = "rule_based_v1";
  label = "Rule-based local classifier";

  private prevDominant: number | undefined;
  private freqVariation = 0;
  private burstCount = 0;
  private lastLoudAt = 0;
  private framesSeen = 0;

  isAvailable(): boolean {
    return true;
  }

  reset(): void {
    this.prevDominant = undefined;
    this.freqVariation = 0;
    this.burstCount = 0;
    this.lastLoudAt = 0;
    this.framesSeen = 0;
  }

  async classify(features: AudioFeatures): Promise<AudioClassification> {
    this.framesSeen += 1;

    // Track frequency variation across frames (helps siren detection).
    if (features.dominantFrequency && this.prevDominant) {
      const delta =
        Math.abs(features.dominantFrequency - this.prevDominant) /
        Math.max(this.prevDominant, 200);
      this.freqVariation = this.freqVariation * 0.7 + delta * 0.3;
    }
    if (features.dominantFrequency) this.prevDominant = features.dominantFrequency;

    // Track burst count across recent frames (helps timer beep detection).
    const isLoud = features.rms > 0.04;
    if (isLoud && this.framesSeen - this.lastLoudAt > 2) {
      this.burstCount = Math.min(this.burstCount + 1, 8);
      this.lastLoudAt = this.framesSeen;
    }
    if (this.framesSeen - this.lastLoudAt > 18) {
      this.burstCount = Math.max(this.burstCount - 1, 0);
    }

    const ctx: FeatureContext = {
      freqVariation: this.freqVariation,
      burstCount: this.burstCount,
      prevDominant: this.prevDominant,
      source: "rule_based",
    };

    const annotated: AudioFeatures = {
      ...features,
      freqVariation: this.freqVariation,
      burstCount: this.burstCount,
    };
    void annotated;

    const result = bestLabel(features, ctx);
    return {
      label: result.label,
      confidence: round3(result.confidence),
      source: "rule_based",
      explanation: result.explanation,
      rawLabels: result.raw,
    };
  }
}

// Stub for an optional pretrained classifier (e.g. YAMNet via TF.js).
// We intentionally do NOT pull TF.js here — the dependency is heavy and
// loading remote models inside this offline-first MVP would harm reliability.
// The boundary exists so the swap is a one-file change later.
export class PretrainedAudioClassifierStub implements AudioClassifier {
  id = "yamnet_stub";
  label = "Pretrained model (not loaded)";

  isAvailable(): boolean {
    return false;
  }

  async classify(): Promise<AudioClassification> {
    return {
      label: "unknown",
      confidence: 0,
      source: "yamnet",
      explanation:
        "Pretrained model is not loaded in this build. Using rule-based fallback.",
    };
  }
}

// Manual classifier — used by the test fixtures for deterministic demo.
export class ManualClassifier implements AudioClassifier {
  id = "manual";
  label = "Manual / fixture";

  isAvailable(): boolean {
    return true;
  }

  async classify(): Promise<AudioClassification> {
    return {
      label: "unknown",
      confidence: 0,
      source: "manual",
      explanation: "Manual classifier — used only by deterministic fixtures.",
    };
  }
}
