// Audio model adapter boundary.
//
// The runtime classifier is rule-based today. This boundary lets us swap in
// a locally-trained model (PKL/ONNX/TFLite) or a pretrained YAMNet-style
// model (TF.js) later without touching the world-state engine. We keep the
// rule-based adapter wrapped so the existing classifier flows through the
// same interface as future swaps.

import type { AudioClassification, AudioFeatures } from "../audioTypes";
import { RuleBasedAudioClassifier } from "../audioClassifier";

export type AudioModelKind =
  | "rule_based"
  | "local_trained"
  | "pretrained"
  | "remote";

export interface AudioModelInput {
  features?: AudioFeatures;
  channelData?: Float32Array;
  sampleRate?: number;
}

export interface AudioModelAdapter {
  id: string;
  label: string;
  kind: AudioModelKind;
  isAvailable(): Promise<boolean> | boolean;
  classify(input: AudioModelInput): Promise<AudioClassification>;
}

export class RuleBasedModelAdapter implements AudioModelAdapter {
  id = "rule_based_v1";
  label = "Rule-based local classifier";
  kind: AudioModelKind = "rule_based";

  private inner = new RuleBasedAudioClassifier();

  isAvailable(): boolean {
    return true;
  }

  async classify(input: AudioModelInput): Promise<AudioClassification> {
    if (!input.features) {
      return {
        label: "unknown",
        confidence: 0,
        source: "rule_based",
        explanation: "No features supplied to rule-based adapter.",
      };
    }
    return this.inner.classify(input.features);
  }
}

export class LocalTrainedModelAdapterStub implements AudioModelAdapter {
  id = "local_trained_stub";
  label = "Local trained model (not loaded)";
  kind: AudioModelKind = "local_trained";

  isAvailable(): boolean {
    return false;
  }

  async classify(): Promise<AudioClassification> {
    return {
      label: "unknown",
      confidence: 0,
      source: "rule_based",
      explanation:
        "Local trained model is not loaded in this build. Train via ml/training/train_audio_baseline.py and follow ml/training/README.md.",
    };
  }
}

export class PretrainedModelAdapterStub implements AudioModelAdapter {
  id = "pretrained_stub";
  label = "Pretrained model (YAMNet/TF.js — not loaded)";
  kind: AudioModelKind = "pretrained";

  isAvailable(): boolean {
    return false;
  }

  async classify(): Promise<AudioClassification> {
    return {
      label: "unknown",
      confidence: 0,
      source: "yamnet",
      explanation:
        "No pretrained model bundled in this build. Boundary is ready for a TF.js / ONNX swap.",
    };
  }
}
