// Audio controller — owns the live-audio pipeline:
//
//   audio source -> features -> classifier -> cooldown -> signal mapper ->
//   live-audio decision -> HUD output adapter
//
// The controller is a small stateful event emitter so React can subscribe
// to status changes and detection events.

import type { DemoMemory, AudioSignal, DecisionResult } from "../engine/types";
import { decideFromLiveAudio } from "../engine/liveAudioDecision";
import {
  getRoutingThreshold,
  mapAudioClassificationToSignal,
} from "./audioSignalMapper";
import {
  RuleBasedAudioClassifier,
  type AudioClassifier,
} from "./audioClassifier";
import {
  processAudioFile,
  startDisplayAudioCapture,
  startMicrophoneCapture,
  type AudioSourceHandle,
  type SourceCallbacks,
} from "./audioSource";
import type {
  AudioCaptureStatus,
  AudioClassification,
  AudioControllerSnapshot,
  AudioDetectionEvent,
  AudioFeatures,
  AudioFrame,
  AudioSourceKind,
  LiveContextOverride,
} from "./audioTypes";

const COOLDOWN_MS_DEFAULT = 3000;
const COOLDOWN_MS_URGENT = 1200;

type Listener = (snapshot: AudioControllerSnapshot) => void;
type DetectionListener = (event: AudioDetectionEvent) => void;
type DecisionListener = (decision: DecisionResult) => void;

export interface AudioControllerOptions {
  classifier?: AudioClassifier;
  getMemory: () => DemoMemory;
  getOverride: () => LiveContextOverride;
  autoRoute?: boolean;
}

export class AudioController {
  private classifier: AudioClassifier;
  private classifierForReset: RuleBasedAudioClassifier | null;
  private getMemory: () => DemoMemory;
  private getOverride: () => LiveContextOverride;

  private status: AudioCaptureStatus = "idle";
  private currentSource: AudioSourceKind | null = null;
  private sourceHandle: AudioSourceHandle | null = null;
  private smoothedLevel = 0;
  private lastError: string | undefined;
  private detections: AudioDetectionEvent[] = [];
  private autoRoute: boolean;

  private listeners = new Set<Listener>();
  private detectionListeners = new Set<DetectionListener>();
  private decisionListeners = new Set<DecisionListener>();

  private cooldown = new Map<string, number>();

  constructor(options: AudioControllerOptions) {
    this.classifier = options.classifier ?? new RuleBasedAudioClassifier();
    this.classifierForReset =
      this.classifier instanceof RuleBasedAudioClassifier
        ? this.classifier
        : null;
    this.getMemory = options.getMemory;
    this.getOverride = options.getOverride;
    this.autoRoute = options.autoRoute ?? true;
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    listener(this.snapshot());
    return () => this.listeners.delete(listener);
  }

  onDetection(listener: DetectionListener): () => void {
    this.detectionListeners.add(listener);
    return () => this.detectionListeners.delete(listener);
  }

  onDecision(listener: DecisionListener): () => void {
    this.decisionListeners.add(listener);
    return () => this.decisionListeners.delete(listener);
  }

  setAutoRoute(value: boolean): void {
    this.autoRoute = value;
    this.emit();
  }

  snapshot(): AudioControllerSnapshot {
    return {
      status: this.status,
      source: this.currentSource,
      level: this.smoothedLevel,
      classifierId: this.classifier.id,
      classifierLabel: this.classifier.label,
      lastError: this.lastError,
      detections: this.detections,
      autoRoute: this.autoRoute,
    };
  }

  private emit(): void {
    const snap = this.snapshot();
    for (const l of this.listeners) l(snap);
  }

  async startMicrophone(): Promise<void> {
    await this.stop();
    this.lastError = undefined;
    this.status = "requesting_permission";
    this.currentSource = "microphone";
    this.classifierForReset?.reset();
    this.emit();
    const handle = await startMicrophoneCapture(this.buildCallbacks("microphone"));
    if (this.lastError) {
      this.status = "error";
      this.emit();
      return;
    }
    this.sourceHandle = handle;
    this.status = "listening";
    this.emit();
  }

  async startDisplayAudio(): Promise<void> {
    await this.stop();
    this.lastError = undefined;
    this.status = "requesting_permission";
    this.currentSource = "display_audio";
    this.classifierForReset?.reset();
    this.emit();
    const handle = await startDisplayAudioCapture(
      this.buildCallbacks("display_audio")
    );
    if (this.lastError) {
      this.status = "error";
      this.emit();
      return;
    }
    this.sourceHandle = handle;
    this.status = "listening";
    this.emit();
  }

  async processFile(input: File | ArrayBuffer): Promise<void> {
    await this.stop();
    this.lastError = undefined;
    this.status = "processing_file";
    this.currentSource = "file";
    this.classifierForReset?.reset();
    this.emit();
    await processAudioFile(input, this.buildCallbacks("file"));
    // The callbacks above can flip status to "error"; widen the check accordingly.
    if ((this.status as AudioCaptureStatus) !== "error") {
      this.status = "idle";
      this.currentSource = null;
    }
    this.emit();
  }

  async stop(): Promise<void> {
    if (this.sourceHandle) {
      this.sourceHandle.stop();
      this.sourceHandle = null;
    }
    if (this.status === "listening" || this.status === "processing_file") {
      this.status = "stopped";
    }
    this.currentSource = null;
    this.smoothedLevel = 0;
    this.emit();
  }

  clearDetections(): void {
    this.detections = [];
    this.emit();
  }

  private buildCallbacks(kind: AudioSourceKind): SourceCallbacks {
    return {
      onFrame: (frame, features) => {
        this.handleFrame(frame, features, kind).catch((err) => {
          // eslint-disable-next-line no-console
          console.warn("AudioController frame error", err);
        });
      },
      onLevel: (lvl) => {
        // Smoothing for the UI meter.
        this.smoothedLevel = this.smoothedLevel * 0.6 + lvl * 0.4;
        this.emit();
      },
      onError: (msg) => {
        this.lastError = msg;
        this.status = "error";
        this.emit();
      },
      onStopped: () => {
        if (this.status === "listening") {
          this.status = "stopped";
          this.emit();
        }
      },
    };
  }

  private async handleFrame(
    frame: AudioFrame,
    features: AudioFeatures,
    sourceKind: AudioSourceKind
  ): Promise<void> {
    const classification = await this.classifier.classify(features);

    // Skip true silence — never log or interrupt.
    if (classification.label === "unknown" && classification.confidence === 0) {
      return;
    }

    // Cooldown by label.
    const now = Date.now();
    const label = classification.label;
    const lastAt = this.cooldown.get(label) ?? 0;
    const cooldown =
      classification.confidence >= 0.8 &&
      ["timer_beep", "siren", "horn", "alarm"].includes(label)
        ? COOLDOWN_MS_URGENT
        : COOLDOWN_MS_DEFAULT;
    const inCooldown = now - lastAt < cooldown;

    const mapped = mapAudioClassificationToSignal(classification);
    const threshold = getRoutingThreshold(label);
    const meetsThreshold = classification.confidence >= threshold;

    let decision: DecisionResult | undefined;
    let routed = false;
    let routeNote: string | undefined;

    if (this.autoRoute && meetsThreshold && !inCooldown && mapped.signal) {
      decision = this.routeSignal(mapped.signal, classification);
      routed = true;
      this.cooldown.set(label, now);
      routeNote = `Routed (auto). Cooldown set: ${cooldown}ms.`;
    } else if (!meetsThreshold) {
      routeNote = `Below routing threshold (${threshold.toFixed(2)}).`;
    } else if (inCooldown) {
      routeNote = `Cooldown active (${Math.round(
        (cooldown - (now - lastAt)) / 100
      ) / 10}s remaining).`;
    } else if (!this.autoRoute) {
      routeNote = "Auto-route disabled — use manual route.";
    }

    const detection: AudioDetectionEvent = {
      id: `det_${frame.id}`,
      timestamp: frame.timestamp,
      source: sourceKind,
      features,
      classification,
      mappedSignal: mapped.signal,
      decisionResult: decision,
      routed,
      routeNote,
    };

    this.detections = [detection, ...this.detections].slice(0, 24);
    for (const l of this.detectionListeners) l(detection);
    this.emit();
  }

  // Force-route the most recent detection (used by the "Send through Hearer brain" button).
  routeMostRecent(): DecisionResult | null {
    const det = this.detections.find(
      (d) => d.mappedSignal && !d.routed
    );
    if (!det || !det.mappedSignal) return null;
    const decision = this.routeSignal(det.mappedSignal, det.classification);
    det.routed = true;
    det.decisionResult = decision;
    det.routeNote = "Routed manually.";
    this.cooldown.set(det.classification.label, Date.now());
    this.emit();
    return decision;
  }

  // Direct fixture path: classify a synthetic feature object and route.
  async injectClassification(
    classification: AudioClassification,
    sourceKind: AudioSourceKind = "simulated"
  ): Promise<DecisionResult | null> {
    const mapped = mapAudioClassificationToSignal(classification);
    let decision: DecisionResult | undefined;
    if (mapped.signal) {
      decision = this.routeSignal(mapped.signal, classification);
    }
    const detection: AudioDetectionEvent = {
      id: `det_inj_${Date.now().toString(36)}`,
      timestamp: new Date().toISOString(),
      source: sourceKind,
      features: { rms: 0, peak: 0, zeroCrossingRate: 0 },
      classification,
      mappedSignal: mapped.signal,
      decisionResult: decision,
      routed: !!decision,
      routeNote: decision ? "Injected fixture routed." : "Injected fixture, unmapped.",
    };
    this.detections = [detection, ...this.detections].slice(0, 24);
    for (const l of this.detectionListeners) l(detection);
    this.emit();
    return decision ?? null;
  }

  private routeSignal(
    signal: AudioSignal,
    classification: AudioClassification
  ): DecisionResult {
    const decision = decideFromLiveAudio({
      audioSignal: signal,
      override: this.getOverride(),
      memory: this.getMemory(),
      classifierExplanation: classification.explanation,
    });
    for (const l of this.decisionListeners) l(decision);
    return decision;
  }
}
