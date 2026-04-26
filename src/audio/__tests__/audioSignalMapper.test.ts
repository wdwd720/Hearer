import { describe, expect, it } from "vitest";
import {
  getRoutingThreshold,
  mapAudioClassificationToSignal,
  shouldRoute,
} from "../audioSignalMapper";
import type { AudioClassification } from "../audioTypes";

const baseClassification = (
  partial: Partial<AudioClassification>
): AudioClassification => ({
  label: "unknown",
  confidence: 0,
  source: "rule_based",
  explanation: "test",
  ...partial,
});

describe("audioSignalMapper", () => {
  it("maps a confident timer_beep to a Hearer AudioSignal", () => {
    const result = mapAudioClassificationToSignal(
      baseClassification({ label: "timer_beep", confidence: 0.85 })
    );
    expect(result.signal).not.toBeNull();
    expect(result.signal?.kind).toBe("audio");
    expect(result.signal?.event).toBe("timer_beep");
    expect(result.signal?.confidence).toBe(0.85);
  });

  it("does not map unknown classifications", () => {
    const result = mapAudioClassificationToSignal(
      baseClassification({ label: "unknown", confidence: 0.2 })
    );
    expect(result.signal).toBeNull();
  });

  it("does not auto-route low confidence detections", () => {
    expect(
      shouldRoute(
        baseClassification({ label: "timer_beep", confidence: 0.3 })
      )
    ).toBe(false);
  });

  it("auto-routes at or above the per-label threshold", () => {
    const cls = baseClassification({ label: "timer_beep", confidence: 0.6 });
    expect(cls.confidence).toBeGreaterThanOrEqual(
      getRoutingThreshold("timer_beep")
    );
    expect(shouldRoute(cls)).toBe(true);
  });

  it("never routes unknown regardless of confidence", () => {
    expect(
      shouldRoute(baseClassification({ label: "unknown", confidence: 1 }))
    ).toBe(false);
  });
});
