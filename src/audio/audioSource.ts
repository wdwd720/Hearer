// Audio source layer.
//
// Three input paths:
//   1. Microphone (getUserMedia)
//   2. Display/tab audio (getDisplayMedia, audio track required)
//   3. Audio file upload (decodeAudioData)
//
// All produce a stream of analysed frames via a callback. Raw audio is not
// persisted; only short rolling windows live in memory while listening.

import {
  dbToLinearSpectrum,
  extractAudioFeatures,
} from "./audioFeatureExtractor";
import type {
  AudioFeatures,
  AudioFrame,
  AudioSourceKind,
} from "./audioTypes";

const FFT_SIZE = 2048;
const ANALYSIS_INTERVAL_MS = 220;

export interface AudioSourceHandle {
  kind: AudioSourceKind;
  stop(): void;
}

export interface OnFrame {
  (frame: AudioFrame, features: AudioFeatures): void;
}

export interface OnLevel {
  (level: number): void;
}

export interface SourceCallbacks {
  onFrame: OnFrame;
  onLevel?: OnLevel;
  onError?: (msg: string) => void;
  onStopped?: () => void;
}

interface LiveAnalysis {
  context: AudioContext;
  analyser: AnalyserNode;
  source: AudioNode;
  cleanup: () => void;
  sourceKind: AudioSourceKind;
  stream?: MediaStream;
}

function startAnalysisLoop(
  live: LiveAnalysis,
  callbacks: SourceCallbacks
): () => void {
  const { analyser, context, sourceKind } = live;
  const time = new Float32Array(analyser.fftSize);
  const freqDb = new Float32Array(analyser.frequencyBinCount);
  const binHz = context.sampleRate / analyser.fftSize;

  const interval = window.setInterval(() => {
    analyser.getFloatTimeDomainData(time);
    analyser.getFloatFrequencyData(freqDb);
    const spectrum = dbToLinearSpectrum(freqDb);
    const features = extractAudioFeatures({
      channelData: time,
      sampleRate: context.sampleRate,
      spectrum,
      spectrumBinHz: binHz,
    });
    const frame: AudioFrame = {
      id: `frm_${Date.now().toString(36)}_${Math.random()
        .toString(36)
        .slice(2, 6)}`,
      source: sourceKind,
      timestamp: new Date().toISOString(),
      sampleRate: context.sampleRate,
      channelData: time.slice(0),
      durationMs: (time.length / context.sampleRate) * 1000,
    };
    callbacks.onFrame(frame, features);
    callbacks.onLevel?.(features.rms);
  }, ANALYSIS_INTERVAL_MS);

  return () => window.clearInterval(interval);
}

async function attachStreamAnalyser(
  stream: MediaStream,
  sourceKind: AudioSourceKind
): Promise<LiveAnalysis> {
  const Ctx: typeof AudioContext =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext: typeof AudioContext })
      .webkitAudioContext;
  const ctx = new Ctx();
  const source = ctx.createMediaStreamSource(stream);
  const analyser = ctx.createAnalyser();
  analyser.fftSize = FFT_SIZE;
  analyser.smoothingTimeConstant = 0.55;
  source.connect(analyser);

  return {
    context: ctx,
    analyser,
    source,
    sourceKind,
    stream,
    cleanup: () => {
      try {
        source.disconnect();
      } catch {
        /* ignore */
      }
      try {
        analyser.disconnect();
      } catch {
        /* ignore */
      }
      try {
        ctx.close();
      } catch {
        /* ignore */
      }
      stream.getTracks().forEach((t) => t.stop());
    },
  };
}

export async function startMicrophoneCapture(
  callbacks: SourceCallbacks
): Promise<AudioSourceHandle> {
  if (!navigator?.mediaDevices?.getUserMedia) {
    callbacks.onError?.("Microphone capture is not supported in this browser.");
    return { kind: "microphone", stop: () => {} };
  }
  let stream: MediaStream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false,
      },
    });
  } catch (err) {
    const msg =
      err instanceof Error
        ? err.message
        : "Microphone permission was denied.";
    callbacks.onError?.(`Microphone unavailable: ${msg}`);
    return { kind: "microphone", stop: () => {} };
  }

  const live = await attachStreamAnalyser(stream, "microphone");
  const stopLoop = startAnalysisLoop(live, callbacks);
  return {
    kind: "microphone",
    stop: () => {
      stopLoop();
      live.cleanup();
      callbacks.onStopped?.();
    },
  };
}

export async function startDisplayAudioCapture(
  callbacks: SourceCallbacks
): Promise<AudioSourceHandle> {
  const dm = navigator?.mediaDevices?.getDisplayMedia;
  if (!dm) {
    callbacks.onError?.(
      "Display audio capture is not supported in this browser."
    );
    return { kind: "display_audio", stop: () => {} };
  }
  let stream: MediaStream;
  try {
    stream = await navigator.mediaDevices.getDisplayMedia({
      audio: true,
      // Browsers require a video track to be requested even if we ignore it.
      video: true,
    });
  } catch (err) {
    const msg =
      err instanceof Error
        ? err.message
        : "Display capture was cancelled.";
    callbacks.onError?.(`Display capture unavailable: ${msg}`);
    return { kind: "display_audio", stop: () => {} };
  }

  if (stream.getAudioTracks().length === 0) {
    stream.getTracks().forEach((t) => t.stop());
    callbacks.onError?.(
      "No tab/system audio track available. Try Chrome tab sharing with audio, or use file upload."
    );
    return { kind: "display_audio", stop: () => {} };
  }

  // Drop any video track right away — we only need the audio.
  stream.getVideoTracks().forEach((t) => t.stop());
  const audioOnly = new MediaStream(stream.getAudioTracks());

  const live = await attachStreamAnalyser(audioOnly, "display_audio");
  const stopLoop = startAnalysisLoop(live, callbacks);
  return {
    kind: "display_audio",
    stop: () => {
      stopLoop();
      live.cleanup();
      // Stop the original stream's tracks too just in case.
      stream.getTracks().forEach((t) => t.stop());
      callbacks.onStopped?.();
    },
  };
}

export interface ProcessFileResult {
  durationMs: number;
  framesAnalysed: number;
}

export async function processAudioFile(
  file: File | ArrayBuffer,
  callbacks: SourceCallbacks
): Promise<ProcessFileResult> {
  const Ctx: typeof AudioContext =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext: typeof AudioContext })
      .webkitAudioContext;
  const ctx = new Ctx();

  let buf: ArrayBuffer;
  if (file instanceof ArrayBuffer) {
    buf = file;
  } else {
    buf = await file.arrayBuffer();
  }

  let decoded: AudioBuffer;
  try {
    decoded = await ctx.decodeAudioData(buf.slice(0));
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Decode failed";
    callbacks.onError?.(`Could not decode audio file: ${msg}`);
    try {
      ctx.close();
    } catch {
      /* ignore */
    }
    return { durationMs: 0, framesAnalysed: 0 };
  }

  // Run an OfflineAudioContext through an AnalyserNode-style FFT manually.
  // Simpler: slice the decoded buffer into windows, run our own DFT-free
  // pipeline using the time-domain features and a coarse magnitude spectrum
  // computed via a rolling FFT. To stay dependency-free, we approximate the
  // spectrum from the waveform via a Hann-windowed Goertzel sweep over
  // coarse bins (cheap and good enough for our heuristics).
  const sampleRate = decoded.sampleRate;
  const channel = decoded.getChannelData(0);
  const windowSize = 2048;
  const hopSize = Math.round(sampleRate * (ANALYSIS_INTERVAL_MS / 1000));
  let framesAnalysed = 0;

  for (let start = 0; start + windowSize <= channel.length; start += hopSize) {
    const slice = channel.subarray(start, start + windowSize);
    const spectrum = approxSpectrum(slice, sampleRate);
    const features = extractAudioFeatures({
      channelData: slice,
      sampleRate,
      spectrum,
      spectrumBinHz: spectrum.binHz,
    });
    const frame: AudioFrame = {
      id: `file_${start}`,
      source: "file",
      timestamp: new Date().toISOString(),
      sampleRate,
      channelData: slice.slice(0) as Float32Array,
      durationMs: (windowSize / sampleRate) * 1000,
    };
    callbacks.onFrame(frame, features);
    callbacks.onLevel?.(features.rms);
    framesAnalysed += 1;
  }

  try {
    ctx.close();
  } catch {
    /* ignore */
  }
  callbacks.onStopped?.();
  return {
    durationMs: (decoded.length / sampleRate) * 1000,
    framesAnalysed,
  };
}

interface ApproxSpectrum extends Float32Array {
  binHz: number;
}

// Cheap coarse magnitude spectrum using a Goertzel-style scan over fixed bins.
// We deliberately keep the bin count low — we only need band energy, dominant
// frequency, and tonality, all of which are robust to coarse spectra.
function approxSpectrum(slice: Float32Array, sampleRate: number): ApproxSpectrum {
  const bins = 96; // covers up to nyquist with ~bin resolution depending on sr
  const maxFreq = Math.min(8000, sampleRate / 2);
  const binHz = maxFreq / bins;
  const out = new Float32Array(bins) as ApproxSpectrum;
  out.binHz = binHz;

  // Apply a simple Hann window to the slice once.
  const N = slice.length;
  const windowed = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    const w = 0.5 * (1 - Math.cos((2 * Math.PI * i) / (N - 1)));
    windowed[i] = slice[i] * w;
  }

  for (let k = 1; k < bins; k++) {
    const f = k * binHz;
    const omega = (2 * Math.PI * f) / sampleRate;
    const cosOmega = Math.cos(omega);
    const coeff = 2 * cosOmega;
    let q1 = 0;
    let q2 = 0;
    for (let i = 0; i < N; i++) {
      const q0 = coeff * q1 - q2 + windowed[i];
      q2 = q1;
      q1 = q0;
    }
    const mag = Math.sqrt(Math.max(0, q1 * q1 + q2 * q2 - q1 * q2 * coeff));
    out[k] = mag / N;
  }

  return out;
}
