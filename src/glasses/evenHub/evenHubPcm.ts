// PCM helpers for Even Hub audio events.
//
// Even Hub delivers glasses microphone audio as PCM 16 kHz, signed 16-bit
// little-endian, mono. The exact event shape varies by SDK version, so the
// runtime adapter calls into these helpers with whatever the bridge gives it
// (ArrayBuffer / Uint8Array / Int16Array / number[] / { audio: ... }).

import type { AudioFrame } from "../../audio/audioTypes";

export const EVEN_HUB_SAMPLE_RATE = 16000;

/**
 * Convert signed 16-bit little-endian PCM into a Float32 array normalised
 * to [-1, 1]. Returns an empty array for empty/invalid inputs.
 */
export function pcm16leToFloat32(
  input: ArrayBuffer | Uint8Array | Int16Array | null | undefined
): Float32Array {
  if (!input) return new Float32Array(0);

  let bytes: Uint8Array;
  if (input instanceof Int16Array) {
    const out = new Float32Array(input.length);
    for (let i = 0; i < input.length; i++) {
      const v = input[i];
      out[i] = v >= 0 ? v / 0x7fff : v / 0x8000;
    }
    return out;
  }
  if (input instanceof ArrayBuffer) {
    bytes = new Uint8Array(input);
  } else if (input instanceof Uint8Array) {
    bytes = input;
  } else {
    return new Float32Array(0);
  }

  // Need an even number of bytes (2 per sample). Drop a trailing odd byte
  // rather than throwing — real-world PCM streams sometimes pack oddly.
  const usableLen = bytes.length - (bytes.length % 2);
  if (usableLen < 2) return new Float32Array(0);

  const numSamples = usableLen / 2;
  const out = new Float32Array(numSamples);
  // Use DataView for explicit little-endian semantics.
  const view = new DataView(
    bytes.buffer,
    bytes.byteOffset,
    bytes.byteLength
  );
  for (let i = 0; i < numSamples; i++) {
    const v = view.getInt16(i * 2, true);
    out[i] = v >= 0 ? v / 0x7fff : v / 0x8000;
  }
  return out;
}

export interface PcmFrameOptions {
  source?: AudioFrame["source"];
  sampleRate?: number;
  timestamp?: string;
  id?: string;
}

/**
 * Build a Hearer AudioFrame from a Float32 PCM buffer. The brain doesn't
 * care whether the audio came from G2, browser mic, or a fixture — once we
 * have a Float32Array the rest of the pipeline is identical.
 */
export function float32ToAudioFrame(
  channelData: Float32Array,
  options: PcmFrameOptions = {}
): AudioFrame {
  const sampleRate = options.sampleRate ?? EVEN_HUB_SAMPLE_RATE;
  const durationMs = (channelData.length / sampleRate) * 1000;
  return {
    id:
      options.id ??
      `g2_${Date.now().toString(36)}_${Math.random()
        .toString(36)
        .slice(2, 6)}`,
    source: options.source ?? "simulated",
    timestamp: options.timestamp ?? new Date().toISOString(),
    sampleRate,
    channelData,
    durationMs,
  };
}

/**
 * Convenience: PCM16 buffer → Hearer AudioFrame in one step.
 */
export function pcm16leToAudioFrame(
  pcm: ArrayBuffer | Uint8Array | Int16Array | null | undefined,
  options: PcmFrameOptions = {}
): AudioFrame {
  return float32ToAudioFrame(pcm16leToFloat32(pcm), options);
}

/**
 * Best-effort extraction of PCM bytes from an Even Hub event.
 *
 * The SDK ships several event envelope shapes across versions. Rather than
 * pin to one, we walk a list of common locations and pick the first non-empty
 * one. Returns null when nothing recognisable is found.
 */
export function extractPcmFromEvenHubEvent(
  event: unknown
): ArrayBuffer | Uint8Array | Int16Array | null {
  if (!event || typeof event !== "object") return null;
  const e = event as Record<string, unknown>;

  const candidates: unknown[] = [
    e.audioEvent,
    (e.sysEvent as Record<string, unknown> | undefined)?.audioEvent,
    e.audio,
    e.pcm,
    e.data,
    (e.payload as Record<string, unknown> | undefined)?.audio,
    (e.payload as Record<string, unknown> | undefined)?.pcm,
  ];

  for (const c of candidates) {
    if (!c) continue;
    if (c instanceof ArrayBuffer) return c;
    if (c instanceof Uint8Array) return c;
    if (c instanceof Int16Array) return c;
    if (typeof c === "object") {
      const obj = c as Record<string, unknown>;
      // Common fields inside an audioEvent envelope.
      if (obj.buffer instanceof ArrayBuffer) return obj.buffer;
      if (obj.bytes instanceof Uint8Array) return obj.bytes as Uint8Array;
      if (obj.pcm) {
        const inner = obj.pcm;
        if (inner instanceof ArrayBuffer) return inner;
        if (inner instanceof Uint8Array) return inner;
        if (inner instanceof Int16Array) return inner;
      }
      // Fallback: a number[] payload.
      if (Array.isArray(obj.samples) && obj.samples.length > 0) {
        const arr = obj.samples as number[];
        const out = new Int16Array(arr.length);
        for (let i = 0; i < arr.length; i++) out[i] = arr[i];
        return out;
      }
    }
    if (Array.isArray(c) && c.length > 0 && typeof c[0] === "number") {
      const out = new Int16Array(c.length);
      for (let i = 0; i < c.length; i++) out[i] = c[i] as number;
      return out;
    }
  }
  return null;
}
