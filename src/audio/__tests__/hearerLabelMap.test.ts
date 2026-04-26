import { describe, expect, it } from "vitest";
import { HEARER_LABEL_MAP } from "../hearerLabelMap.generated";

describe("HEARER_LABEL_MAP (generated from hearer_labels.yaml)", () => {
  it("contains the core safety/home/speech labels", () => {
    for (const id of [
      "timer_beep",
      "alarm",
      "siren",
      "horn",
      "doorbell",
      "knock",
      "speech_nearby",
      "applause",
    ]) {
      expect(HEARER_LABEL_MAP[id]).toBeDefined();
    }
  });

  it("timer_beep maps from ESC-50 clock_alarm", () => {
    expect(
      HEARER_LABEL_MAP.timer_beep.sourceMappings.esc50
    ).toContain("clock_alarm");
  });

  it("siren maps from UrbanSound8K siren", () => {
    expect(HEARER_LABEL_MAP.siren.sourceMappings.urbansound8k).toContain(
      "siren"
    );
  });

  it("never marks unknown as auto-routable", () => {
    expect(HEARER_LABEL_MAP.unknown.minConfidenceForInterrupt).toBeGreaterThan(
      1
    );
  });
});
