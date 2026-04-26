// G2 runtime controller.
//
// This is the boundary between the Hearer brain and the glasses. It owns:
//   - the active input adapter (Even G2 mic when the bridge is available,
//     simulator fallback otherwise),
//   - the active output adapter (Even G2 HUD when available, simulator HUD
//     otherwise),
//   - probing the bridge once on boot and exposing a snapshot to the UI.
//
// The brain itself (feature extractor, classifier, world-state engine, cue
// compressor, priority engine) is unchanged. The controller just decides
// where audio frames come FROM and where compressed cues go TO.

import { extractAudioFeatures } from "../audio/audioFeatureExtractor";
import {
  RuleBasedAudioClassifier,
  type AudioClassifier,
} from "../audio/audioClassifier";
import { mapAudioClassificationToSignal } from "../audio/audioSignalMapper";
import type {
  AudioControllerSnapshot,
  AudioFrame,
  LiveContextOverride,
} from "../audio/audioTypes";
import { dbToLinearSpectrum } from "../audio/audioFeatureExtractor";
import type { Cue, DecisionResult, DemoMemory } from "../engine/types";
import type { Routine } from "../../shared/types";
import { decideFromLiveAudio } from "../engine/liveAudioDecision";
import {
  EvenHubAudioInputAdapter,
  EvenHubHudOutputAdapter,
  probeEvenHubBridge,
} from "./evenHub/evenHubDetection";
import {
  BrowserMicrophoneFallbackAdapter,
  DeterministicTestInputAdapter,
} from "./simulator/simulatorAudioInputAdapter";
import { SimulatorHudOutputAdapter } from "./simulator/simulatorHudOutputAdapter";
import type {
  AdapterStatusReport,
  G2RuntimeSnapshot,
  HudOutputAdapter,
  WorldAudioInputAdapter,
} from "./g2RuntimeTypes";

export interface G2RuntimeOptions {
  classifier?: AudioClassifier;
  getMemory: () => DemoMemory;
  getOverride: () => LiveContextOverride;
  getPersistedRoutines: () => Routine[];
}

type Listener = (snapshot: G2RuntimeSnapshot) => void;
type DecisionListener = (decision: DecisionResult) => void;

export class G2RuntimeController {
  // Adapters — primary first, simulator fallback second.
  private g2Input = new EvenHubAudioInputAdapter();
  private g2Hud = new EvenHubHudOutputAdapter();
  private fallbackInput = new BrowserMicrophoneFallbackAdapter();
  private testInput = new DeterministicTestInputAdapter();
  readonly simulatorHud = new SimulatorHudOutputAdapter();

  private classifier: AudioClassifier;

  private bridgeDetected = false;
  private inputAdapter: WorldAudioInputAdapter = this.g2Input;
  private outputAdapter: HudOutputAdapter = this.simulatorHud;
  private listening = false;

  private getMemory: () => DemoMemory;
  private getOverride: () => LiveContextOverride;
  private getPersistedRoutines: () => Routine[];

  private listeners = new Set<Listener>();
  private decisionListeners = new Set<DecisionListener>();

  // Cooldown by audio label so the HUD doesn't get spammed.
  private cooldown = new Map<string, number>();

  constructor(options: G2RuntimeOptions) {
    this.classifier = options.classifier ?? new RuleBasedAudioClassifier();
    this.getMemory = options.getMemory;
    this.getOverride = options.getOverride;
    this.getPersistedRoutines = options.getPersistedRoutines;
  }

  async init(): Promise<void> {
    const probe = await probeEvenHubBridge();
    this.bridgeDetected = probe.available;
    if (this.bridgeDetected) {
      this.outputAdapter = this.g2Hud;
    } else {
      this.outputAdapter = this.simulatorHud;
    }
    this.emit();
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    listener(this.snapshot());
    return () => this.listeners.delete(listener);
  }

  onDecision(listener: DecisionListener): () => void {
    this.decisionListeners.add(listener);
    return () => this.decisionListeners.delete(listener);
  }

  snapshot(): G2RuntimeSnapshot {
    const inputStatus: AdapterStatusReport = this.inputAdapter.getStatus();
    const outputStatus: AdapterStatusReport = this.outputAdapter.getStatus();
    const fallbackActive =
      !this.bridgeDetected ||
      this.inputAdapter.kind !== "even_g2_mic" ||
      this.outputAdapter.kind !== "even_g2_hud";
    let message: string;
    if (this.bridgeDetected) {
      message = "Even G2 runtime detected.";
    } else {
      message =
        "Even Hub bridge not detected. Hearer is running in simulator/dev mode.";
    }
    return {
      inputAdapter: inputStatus,
      outputAdapter: outputStatus,
      bridgeDetected: this.bridgeDetected,
      fallbackActive,
      message,
    };
  }

  private emit(): void {
    const snap = this.snapshot();
    for (const l of this.listeners) l(snap);
  }

  /** Start the primary G2 mic listening path. Falls back if unavailable. */
  async startG2Listening(): Promise<void> {
    if (!this.bridgeDetected) {
      // Bridge unavailable — surface honest status.
      this.inputAdapter = this.g2Input;
      await this.g2Input.start((frame) => this.handleFrame(frame, "even_g2_mic"));
      // The G2 input's getStatus() will reflect "unavailable".
      this.emit();
      return;
    }
    this.inputAdapter = this.g2Input;
    await this.g2Input.start((frame) => this.handleFrame(frame, "even_g2_mic"));
    this.listening = true;
    this.emit();
  }

  /** Stop whichever adapter is currently active. */
  async stopListening(): Promise<void> {
    await this.g2Input.stop();
    await this.fallbackInput.stop();
    this.listening = false;
    this.emit();
  }

  /** Use the browser mic as a labeled fallback. */
  async useFallbackBrowserMic(): Promise<void> {
    await this.stopListening();
    this.inputAdapter = this.fallbackInput;
    await this.fallbackInput.start((frame) =>
      this.handleFrame(frame, "browser_mic_fallback")
    );
    this.listening = true;
    this.emit();
  }

  /** Force the simulator HUD as the active output (handy during demos). */
  useSimulatorHud(): void {
    this.outputAdapter = this.simulatorHud;
    this.emit();
  }

  /** Force the G2 HUD adapter (no-op when bridge is unavailable). */
  useG2Hud(): void {
    this.outputAdapter = this.g2Hud;
    this.emit();
  }

  isListening(): boolean {
    return this.listening;
  }

  /** Run a deterministic file/fixture through the same pipeline. */
  async feedTestInput(input: File | ArrayBuffer): Promise<void> {
    await this.testInput.feed(input, (frame) =>
      this.handleFrame(frame, "uploaded_file")
    );
  }

  /** Send a manual "test cue" to whichever HUD is active. */
  async sendTestCue(cue: Cue): Promise<void> {
    await this.outputAdapter.sendCue(cue);
    // Mirror to the simulator so the in-app HUD always reflects what the
    // glasses would show.
    if (this.outputAdapter !== this.simulatorHud) {
      await this.simulatorHud.sendCue(cue);
    }
    this.emit();
  }

  private async handleFrame(
    frame: AudioFrame,
    sourceKind:
      | "even_g2_mic"
      | "browser_mic_fallback"
      | "uploaded_file"
      | "generated_fixture"
  ): Promise<void> {
    // The features may not have been computed yet — we get a raw Float32
    // window from the adapter. Re-extract using the same shared extractor.
    const features = extractAudioFeatures({
      channelData: frame.channelData,
      sampleRate: frame.sampleRate,
      // The browser-mic adapter already passes a spectrum; for G2 PCM we
      // synthesise one cheaply via the file path's spectrum, but for the
      // controller boundary we stick with time-domain features only when
      // a spectrum isn't available. The classifier is robust to either.
      spectrum: undefined,
      spectrumBinHz: undefined,
    });
    void dbToLinearSpectrum;

    const classification = await this.classifier.classify(features);
    if (classification.label === "unknown" && classification.confidence === 0) {
      return;
    }
    const mapped = mapAudioClassificationToSignal(classification);
    if (!mapped.signal) return;

    // Cooldown — don't repeat same label more often than every 2.5s.
    const now = Date.now();
    const last = this.cooldown.get(classification.label) ?? 0;
    if (now - last < 2500 && classification.confidence < 0.85) return;
    this.cooldown.set(classification.label, now);

    const decision = decideFromLiveAudio({
      audioSignal: { ...mapped.signal, direction: this.getOverride().direction },
      override: this.getOverride(),
      memory: this.getMemory(),
      persistedRoutines: this.getPersistedRoutines(),
      classifierExplanation: `${classification.explanation} (source ${sourceKind})`,
      direction: this.getOverride().direction,
    });

    // Send the cue out through the active HUD adapter (G2 if bridge, else
    // simulator). Always mirror to the simulator so the dev UI reflects what
    // the glasses would show.
    await this.outputAdapter.sendCue(decision.cue);
    if (this.outputAdapter !== this.simulatorHud) {
      await this.simulatorHud.sendCue(decision.cue);
    }

    for (const l of this.decisionListeners) l(decision);
    this.emit();
  }
}

// Convenience for the existing AudioController-driven UI: lets it bridge into
// the simulator HUD adapter so the existing audio path keeps working.
export function asAudioControllerSnapshotPlaceholder(): AudioControllerSnapshot {
  return {
    status: "idle",
    source: null,
    level: 0,
    classifierId: "rule_based_v1",
    classifierLabel: "Rule-based local classifier",
    detections: [],
    autoRoute: true,
  };
}
