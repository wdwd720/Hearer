import { describe, expect, it } from "vitest";
import {
  EVEN_HUB_SAMPLE_RATE,
  extractPcmFromEvenHubEvent,
  pcm16leToAudioFrame,
  pcm16leToFloat32,
} from "../evenHub/evenHubPcm";

describe("evenHubPcm", () => {
  it("converts signed 16-bit little-endian PCM to Float32 in [-1, 1]", () => {
    // Build a 4-sample buffer: 0, +max, -max, half.
    const buf = new ArrayBuffer(8);
    const view = new DataView(buf);
    view.setInt16(0, 0, true);
    view.setInt16(2, 32767, true);
    view.setInt16(4, -32768, true);
    view.setInt16(6, 16384, true);

    const out = pcm16leToFloat32(buf);
    expect(out.length).toBe(4);
    expect(out[0]).toBe(0);
    expect(out[1]).toBeCloseTo(1, 5);
    expect(out[2]).toBeCloseTo(-1, 5);
    expect(out[3]).toBeCloseTo(16384 / 32767, 4);
    for (const v of out) {
      expect(v).toBeGreaterThanOrEqual(-1);
      expect(v).toBeLessThanOrEqual(1);
    }
  });

  it("handles Int16Array input directly", () => {
    const inp = new Int16Array([0, 32767, -32768, 16384]);
    const out = pcm16leToFloat32(inp);
    expect(out.length).toBe(4);
    expect(out[1]).toBeCloseTo(1, 5);
    expect(out[2]).toBeCloseTo(-1, 5);
  });

  it("returns an empty Float32Array for empty/invalid input", () => {
    expect(pcm16leToFloat32(null).length).toBe(0);
    expect(pcm16leToFloat32(undefined).length).toBe(0);
    expect(pcm16leToFloat32(new ArrayBuffer(0)).length).toBe(0);
    // Single odd byte — drop it, return empty.
    expect(pcm16leToFloat32(new Uint8Array([0x10])).length).toBe(0);
  });

  it("builds an AudioFrame at 16 kHz with the right duration", () => {
    const pcm = new Int16Array(1600); // 100 ms at 16 kHz
    for (let i = 0; i < pcm.length; i++) pcm[i] = 1000;
    const frame = pcm16leToAudioFrame(pcm);
    expect(frame.sampleRate).toBe(EVEN_HUB_SAMPLE_RATE);
    expect(frame.channelData.length).toBe(1600);
    expect(frame.durationMs).toBeCloseTo(100, 0);
  });

  it("extracts PCM from a few common bridge event shapes without crashing", () => {
    const ab = new ArrayBuffer(4);
    new DataView(ab).setInt16(0, 100, true);
    new DataView(ab).setInt16(2, -100, true);

    expect(extractPcmFromEvenHubEvent({ audioEvent: ab })).toBe(ab);
    expect(extractPcmFromEvenHubEvent({ audio: ab })).toBe(ab);
    expect(
      extractPcmFromEvenHubEvent({ sysEvent: { audioEvent: ab } })
    ).toBe(ab);

    const i16 = new Int16Array([1, 2, 3]);
    expect(extractPcmFromEvenHubEvent({ pcm: i16 })).toBe(i16);

    expect(extractPcmFromEvenHubEvent({})).toBeNull();
    expect(extractPcmFromEvenHubEvent(null)).toBeNull();
    expect(extractPcmFromEvenHubEvent({ audioEvent: { samples: [1, 2, 3] } })).toBeInstanceOf(
      Int16Array
    );
  });
});
