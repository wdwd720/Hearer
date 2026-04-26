import { describe, expect, it } from "vitest";
import { RuleBasedAudioClassifier } from "../audioClassifier";
import type { AudioFeatures } from "../audioTypes";

function beepLike(): AudioFeatures {
  return {
    rms: 0.18,
    peak: 0.45,
    zeroCrossingRate: 0.12,
    spectralCentroid: 3000,
    dominantFrequency: 3000,
    energyBands: { low: 0.05, mid: 0.15, high: 0.8 },
    periodicityScore: 0.55,
    speechLikeScore: 0.1,
    beepLikeScore: 0.7,
    sirenLikeScore: 0.2,
    transientScore: 0.4,
  };
}

function silenceLike(): AudioFeatures {
  return {
    rms: 0.001,
    peak: 0.002,
    zeroCrossingRate: 0,
    energyBands: { low: 0.33, mid: 0.33, high: 0.33 },
    periodicityScore: 0,
    speechLikeScore: 0,
    beepLikeScore: 0,
    sirenLikeScore: 0,
    transientScore: 0,
  };
}

describe("RuleBasedAudioClassifier", () => {
  it("classifies a beep-like feature object as timer_beep with non-trivial confidence", async () => {
    const clf = new RuleBasedAudioClassifier();
    const result = await clf.classify(beepLike());
    expect(result.label).toBe("timer_beep");
    expect(result.confidence).toBeGreaterThan(0.4);
    expect(result.source).toBe("rule_based");
  });

  it("treats silence as unknown with zero confidence", async () => {
    const clf = new RuleBasedAudioClassifier();
    const result = await clf.classify(silenceLike());
    expect(result.label).toBe("unknown");
    expect(result.confidence).toBe(0);
  });
});
