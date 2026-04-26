// Deterministic synthetic audio fixtures.
//
// These generate Float32 buffers we can feed through the same feature
// extractor + classifier as live audio. That gives the demo a one-button
// path that doesn't depend on microphone / system audio working.

const SAMPLE_RATE = 16000;

export interface SyntheticBuffer {
  sampleRate: number;
  channelData: Float32Array;
  label: string;
}

function envelope(t: number, attack = 0.005, release = 0.05): number {
  if (t < attack) return t / attack;
  if (t > 1 - release) return Math.max(0, (1 - t) / release);
  return 1;
}

function makeSilence(seconds: number, sr = SAMPLE_RATE): Float32Array {
  return new Float32Array(Math.round(seconds * sr));
}

function makeTone(
  seconds: number,
  freqHz: number,
  amp = 0.4,
  sr = SAMPLE_RATE,
  envOn = true
): Float32Array {
  const n = Math.round(seconds * sr);
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const t = i / n;
    const env = envOn ? envelope(t, 0.01, 0.05) : 1;
    out[i] = Math.sin((2 * Math.PI * freqHz * i) / sr) * amp * env;
  }
  return out;
}

function makeSweep(
  seconds: number,
  startHz: number,
  endHz: number,
  amp = 0.4,
  sr = SAMPLE_RATE
): Float32Array {
  const n = Math.round(seconds * sr);
  const out = new Float32Array(n);
  let phase = 0;
  for (let i = 0; i < n; i++) {
    const t = i / n;
    const f = startHz + (endHz - startHz) * t;
    phase += (2 * Math.PI * f) / sr;
    out[i] = Math.sin(phase) * amp;
  }
  return out;
}

function makeNoiseBurst(
  seconds: number,
  amp = 0.6,
  sr = SAMPLE_RATE
): Float32Array {
  const n = Math.round(seconds * sr);
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const t = i / n;
    const env = Math.exp(-t * 12);
    out[i] = (Math.random() * 2 - 1) * amp * env;
  }
  return out;
}

function concat(...parts: Float32Array[]): Float32Array {
  let total = 0;
  for (const p of parts) total += p.length;
  const out = new Float32Array(total);
  let offset = 0;
  for (const p of parts) {
    out.set(p, offset);
    offset += p.length;
  }
  return out;
}

export function generateBeepFixture(): SyntheticBuffer {
  // Five beeps at ~3 kHz with quiet gaps — classic kitchen timer pattern.
  const beep = makeTone(0.18, 3000, 0.45);
  const gap = makeSilence(0.12);
  const channelData = concat(
    beep,
    gap,
    beep,
    gap,
    beep,
    gap,
    beep,
    gap,
    beep
  );
  return { sampleRate: SAMPLE_RATE, channelData, label: "Synthetic beep × 5" };
}

export function generateSirenFixture(): SyntheticBuffer {
  // Up/down sweep between 600-1300 Hz.
  const up = makeSweep(0.6, 600, 1300, 0.5);
  const down = makeSweep(0.6, 1300, 600, 0.5);
  const channelData = concat(up, down, up, down);
  return {
    sampleRate: SAMPLE_RATE,
    channelData,
    label: "Synthetic siren sweep",
  };
}

export function generateHornFixture(): SyntheticBuffer {
  const tone = makeTone(1.6, 380, 0.5);
  return { sampleRate: SAMPLE_RATE, channelData: tone, label: "Synthetic horn tone" };
}

export function generateKnockFixture(): SyntheticBuffer {
  const knock = makeNoiseBurst(0.06, 0.7);
  const gap = makeSilence(0.18);
  const channelData = concat(knock, gap, knock, gap, knock);
  return {
    sampleRate: SAMPLE_RATE,
    channelData,
    label: "Synthetic knock × 3",
  };
}

export function generateDoorbellFixture(): SyntheticBuffer {
  const ding = makeTone(0.4, 1200, 0.45);
  const gap = makeSilence(0.06);
  const dong = makeTone(0.55, 900, 0.4);
  return {
    sampleRate: SAMPLE_RATE,
    channelData: concat(ding, gap, dong),
    label: "Synthetic doorbell chime",
  };
}

export function generateApplauseFixture(): SyntheticBuffer {
  // Many short broadband bursts.
  let parts: Float32Array[] = [];
  for (let i = 0; i < 24; i++) {
    parts.push(makeNoiseBurst(0.03, 0.45));
    parts.push(makeSilence(0.04));
  }
  return {
    sampleRate: SAMPLE_RATE,
    channelData: concat(...parts),
    label: "Synthetic applause",
  };
}

export function generateSpeechLikeFixture(): SyntheticBuffer {
  // Synthesise vaguely speech-like babble: low-pass filtered modulated noise
  // crossed with shifting low-mid tones.
  const sr = SAMPLE_RATE;
  const n = sr * 2;
  const out = new Float32Array(n);
  let prev = 0;
  for (let i = 0; i < n; i++) {
    const t = i / sr;
    const mod = 0.4 + 0.4 * Math.sin(2 * Math.PI * 3.5 * t);
    const noise = (Math.random() * 2 - 1) * 0.4 * mod;
    prev = prev * 0.85 + noise * 0.15; // crude low-pass
    const tone = Math.sin(2 * Math.PI * (220 + 80 * Math.sin(2 * Math.PI * 2 * t)) * t) * 0.05;
    out[i] = prev + tone;
  }
  return {
    sampleRate: SAMPLE_RATE,
    channelData: out,
    label: "Synthetic speech-like babble",
  };
}

// Encode a Float32 mono buffer into a 16-bit PCM WAV ArrayBuffer.
// We use this to feed the same `processAudioFile` pipeline as a real upload,
// so the fixture path exercises decode + spectral analysis end to end.
export function encodeWav(buf: SyntheticBuffer): ArrayBuffer {
  const { channelData, sampleRate } = buf;
  const numSamples = channelData.length;
  const bytesPerSample = 2;
  const dataSize = numSamples * bytesPerSample;
  const headerSize = 44;
  const total = headerSize + dataSize;
  const out = new ArrayBuffer(total);
  const view = new DataView(out);

  function writeStr(offset: number, s: string): void {
    for (let i = 0; i < s.length; i++) view.setUint8(offset + i, s.charCodeAt(i));
  }
  writeStr(0, "RIFF");
  view.setUint32(4, total - 8, true);
  writeStr(8, "WAVE");
  writeStr(12, "fmt ");
  view.setUint32(16, 16, true); // PCM chunk size
  view.setUint16(20, 1, true); // format = PCM
  view.setUint16(22, 1, true); // channels
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * bytesPerSample, true); // byte rate
  view.setUint16(32, bytesPerSample, true); // block align
  view.setUint16(34, 16, true); // bits per sample
  writeStr(36, "data");
  view.setUint32(40, dataSize, true);

  let offset = headerSize;
  for (let i = 0; i < numSamples; i++, offset += 2) {
    const s = Math.max(-1, Math.min(1, channelData[i]));
    view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }
  return out;
}
