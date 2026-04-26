// Lightweight audio feature extractor for Hearer.
//
// Operates on a Float32Array window of mono audio. Computes time-domain
// features always, and band/centroid/dominant frequency from a magnitude
// spectrum if one is supplied (cheap to compute via AnalyserNode).

import type { AudioFeatures } from "./audioTypes";

export interface FeatureExtractInput {
  channelData: Float32Array;
  sampleRate: number;
  spectrum?: Float32Array; // magnitude per FFT bin (0..(N/2))
  spectrumBinHz?: number; // Hz per bin; required if spectrum is given
}

export function extractAudioFeatures(input: FeatureExtractInput): AudioFeatures {
  const { channelData, spectrum, spectrumBinHz } = input;
  void input.sampleRate;

  const rms = computeRms(channelData);
  const peak = computePeak(channelData);
  const zeroCrossingRate = computeZcr(channelData);

  let energyBands: AudioFeatures["energyBands"] | undefined;
  let dominantFrequency: number | undefined;
  let spectralCentroid: number | undefined;
  let beepLikeScore = 0;
  let sirenLikeScore = 0;
  let speechLikeScore = 0;
  let transientScore = 0;
  let periodicityScore = 0;

  if (spectrum && spectrumBinHz && spectrum.length > 8) {
    const total = sumArray(spectrum) || 1e-9;

    let lowE = 0;
    let midE = 0;
    let highE = 0;
    let centroidNum = 0;
    let domBin = 0;
    let domVal = 0;

    for (let i = 1; i < spectrum.length; i++) {
      const f = i * spectrumBinHz;
      const v = spectrum[i];
      if (f < 300) lowE += v;
      else if (f < 2000) midE += v;
      else highE += v;
      centroidNum += f * v;
      if (v > domVal) {
        domVal = v;
        domBin = i;
      }
    }

    energyBands = {
      low: lowE / total,
      mid: midE / total,
      high: highE / total,
    };
    dominantFrequency = domBin * spectrumBinHz;
    spectralCentroid = centroidNum / total;

    // Tonality heuristic: how concentrated the spectrum is around the
    // dominant frequency. Sum the energy in a narrow band around the peak,
    // divide by total. Pure tones approach 1.
    const narrowHalfWidthBins = Math.max(2, Math.round(80 / spectrumBinHz));
    let narrowSum = 0;
    for (
      let i = Math.max(1, domBin - narrowHalfWidthBins);
      i <= Math.min(spectrum.length - 1, domBin + narrowHalfWidthBins);
      i++
    ) {
      narrowSum += spectrum[i];
    }
    const tonality = narrowSum / total;

    // Beep-like: tonal mid-band, dominant 1.5-4.5 kHz, decent volume.
    const beepFreqGood =
      dominantFrequency > 1200 && dominantFrequency < 5500 ? 1 : 0;
    beepLikeScore = clamp01(
      tonality * (0.4 + 0.6 * beepFreqGood) * (0.5 + Math.min(rms * 6, 0.5))
    );

    // Siren-like: tonal but in the 400-1800 Hz range, high RMS. We can't
    // measure pitch sweep within one window — the controller layer adds a
    // freqVariation bonus across frames.
    const sirenFreqGood =
      dominantFrequency > 350 && dominantFrequency < 1800 ? 1 : 0;
    sirenLikeScore = clamp01(
      tonality * (0.35 + 0.65 * sirenFreqGood) * (0.4 + Math.min(rms * 8, 0.6))
    );

    // Speech-like: mid-band dominant, lots of zero crossings, NOT tonal.
    const midDominant = midE / total;
    const notTonal = 1 - tonality;
    speechLikeScore = clamp01(
      midDominant * 1.4 * notTonal * (0.3 + Math.min(zeroCrossingRate * 4, 0.7))
    );

    periodicityScore = clamp01(tonality);
  } else {
    // Spectrum unavailable — fall back to time-domain heuristics.
    speechLikeScore = clamp01(zeroCrossingRate * 4 + rms * 0.5);
    beepLikeScore = clamp01(rms * 1.5);
  }

  // Transient score: how much louder this window is than its quiet portion.
  transientScore = clamp01((peak - rms) * 2);

  return {
    rms,
    peak,
    zeroCrossingRate,
    spectralCentroid,
    dominantFrequency,
    energyBands,
    periodicityScore,
    speechLikeScore,
    beepLikeScore,
    sirenLikeScore,
    transientScore,
  };
}

export function computeRms(buffer: Float32Array): number {
  if (buffer.length === 0) return 0;
  let sum = 0;
  for (let i = 0; i < buffer.length; i++) {
    const v = buffer[i];
    sum += v * v;
  }
  return Math.sqrt(sum / buffer.length);
}

export function computePeak(buffer: Float32Array): number {
  let peak = 0;
  for (let i = 0; i < buffer.length; i++) {
    const v = Math.abs(buffer[i]);
    if (v > peak) peak = v;
  }
  return peak;
}

export function computeZcr(buffer: Float32Array): number {
  if (buffer.length < 2) return 0;
  let crossings = 0;
  for (let i = 1; i < buffer.length; i++) {
    const a = buffer[i - 1];
    const b = buffer[i];
    if ((a >= 0 && b < 0) || (a < 0 && b >= 0)) {
      crossings += 1;
    }
  }
  return crossings / buffer.length;
}

function sumArray(arr: Float32Array): number {
  let total = 0;
  for (let i = 0; i < arr.length; i++) total += arr[i];
  return total;
}

function clamp01(v: number): number {
  if (!Number.isFinite(v)) return 0;
  if (v < 0) return 0;
  if (v > 1) return 1;
  return v;
}

// dB-FFT magnitudes from AnalyserNode.getFloatFrequencyData are in dBFS.
// Convert to linear magnitudes for our band-summing math.
export function dbToLinearSpectrum(db: Float32Array): Float32Array {
  const out = new Float32Array(db.length);
  for (let i = 0; i < db.length; i++) {
    out[i] = Math.pow(10, db[i] / 20);
  }
  return out;
}
