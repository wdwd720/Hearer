import { useEffect, useMemo, useRef, useState } from "react";
import type { AudioController } from "../../audio/audioController";
import type {
  AudioControllerSnapshot,
  LiveContextOverride,
} from "../../audio/audioTypes";
import {
  encodeWav,
  generateApplauseFixture,
  generateBeepFixture,
  generateDoorbellFixture,
  generateHornFixture,
  generateKnockFixture,
  generateSirenFixture,
  generateSpeechLikeFixture,
} from "../../audio/audioFixtures";
import type { LocationName, MotionActivity } from "../../engine/types";
import { AudioLevelMeter } from "./AudioLevelMeter";
import { AudioClassifierStatus } from "./AudioClassifierStatus";
import { AudioDetectionLog } from "./AudioDetectionLog";
import { AudioFileDropzone } from "./AudioFileDropzone";
import "./AudioAwarenessPanel.css";

interface AudioAwarenessPanelProps {
  controller: AudioController;
  override: LiveContextOverride;
  onOverrideChange: (next: LiveContextOverride) => void;
}

const LOCATION_OPTIONS: LocationName[] = [
  "unknown",
  "home",
  "kitchen",
  "street",
  "clinic",
  "school",
  "pharmacy",
  "event",
];

const ACTIVITY_OPTIONS: MotionActivity[] = [
  "unknown",
  "stationary",
  "cooking",
  "walking",
  "leaving",
  "arriving",
  "meeting",
];

const STATUS_LABEL: Record<AudioControllerSnapshot["status"], string> = {
  idle: "Idle",
  requesting_permission: "Requesting permission…",
  listening: "Listening",
  processing_file: "Processing file…",
  error: "Error",
  stopped: "Stopped",
};

export function AudioAwarenessPanel({
  controller,
  override,
  onOverrideChange,
}: AudioAwarenessPanelProps) {
  const [snapshot, setSnapshot] = useState<AudioControllerSnapshot>(() =>
    controller.snapshot()
  );
  const [busy, setBusy] = useState(false);
  const mountedRef = useRef(true);

  useEffect(() => {
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    return controller.subscribe((s) => {
      if (mountedRef.current) setSnapshot(s);
    });
  }, [controller]);

  const lastDetection = snapshot.detections[0];

  const isListening =
    snapshot.status === "listening" ||
    snapshot.status === "processing_file" ||
    snapshot.status === "requesting_permission";

  const handleStartMic = async () => {
    setBusy(true);
    try {
      await controller.startMicrophone();
    } finally {
      setBusy(false);
    }
  };

  const handleStartDisplay = async () => {
    setBusy(true);
    try {
      await controller.startDisplayAudio();
    } finally {
      setBusy(false);
    }
  };

  const handleStop = async () => {
    setBusy(true);
    try {
      await controller.stop();
    } finally {
      setBusy(false);
    }
  };

  const handleFile = async (file: File) => {
    setBusy(true);
    try {
      await controller.processFile(file);
    } finally {
      setBusy(false);
    }
  };

  const runFixture = async (
    gen: () => ReturnType<typeof generateBeepFixture>
  ) => {
    setBusy(true);
    try {
      const wav = encodeWav(gen());
      await controller.processFile(wav);
    } finally {
      setBusy(false);
    }
  };

  const update = (patch: Partial<LiveContextOverride>) => {
    onOverrideChange({ ...override, ...patch });
  };

  const statusClass = useMemo(() => {
    if (snapshot.status === "listening") return "hr-aap-status-on";
    if (snapshot.status === "error") return "hr-aap-status-err";
    if (snapshot.status === "processing_file") return "hr-aap-status-busy";
    return "hr-aap-status-idle";
  }, [snapshot.status]);

  return (
    <section className="hr-panel hr-aap" aria-label="Live audio awareness">
      <header className="hr-panel-header">
        <h2 className="hr-panel-title">Live audio awareness</h2>
        <span className={`hr-aap-status ${statusClass}`}>
          {STATUS_LABEL[snapshot.status]}
          {snapshot.source ? ` · ${snapshot.source.replace("_", " ")}` : ""}
        </span>
      </header>

      <div className="hr-aap-meta">
        Hearer turns sounds and context into one physical-world cue. Audio
        stays local in this demo. Raw audio is not stored.
      </div>

      <div className="hr-aap-meter-row">
        <AudioLevelMeter level={snapshot.level} active={isListening} />
        <span className="hr-aap-rms">
          rms {snapshot.level.toFixed(3)}
        </span>
      </div>

      <div className="hr-aap-controls">
        <button
          type="button"
          className="hr-btn hr-btn-primary"
          onClick={handleStartMic}
          disabled={busy || isListening}
        >
          Start microphone
        </button>
        <button
          type="button"
          className="hr-btn"
          onClick={handleStartDisplay}
          disabled={busy || isListening}
        >
          Share tab/system audio
        </button>
        <button
          type="button"
          className="hr-btn"
          onClick={handleStop}
          disabled={busy || !isListening}
        >
          Stop
        </button>
      </div>

      <AudioFileDropzone onFile={handleFile} disabled={busy} />

      <div className="hr-aap-fixtures">
        <div className="hr-aap-fixtures-label">Test fixtures</div>
        <div className="hr-aap-fixtures-row">
          <button className="hr-btn hr-btn-mini" onClick={() => runFixture(generateBeepFixture)} disabled={busy}>
            Beep ×5
          </button>
          <button className="hr-btn hr-btn-mini" onClick={() => runFixture(generateSirenFixture)} disabled={busy}>
            Siren
          </button>
          <button className="hr-btn hr-btn-mini" onClick={() => runFixture(generateHornFixture)} disabled={busy}>
            Horn
          </button>
          <button className="hr-btn hr-btn-mini" onClick={() => runFixture(generateKnockFixture)} disabled={busy}>
            Knock
          </button>
          <button className="hr-btn hr-btn-mini" onClick={() => runFixture(generateDoorbellFixture)} disabled={busy}>
            Doorbell
          </button>
          <button className="hr-btn hr-btn-mini" onClick={() => runFixture(generateApplauseFixture)} disabled={busy}>
            Applause
          </button>
          <button className="hr-btn hr-btn-mini" onClick={() => runFixture(generateSpeechLikeFixture)} disabled={busy}>
            Speech-like
          </button>
        </div>
      </div>

      <AudioClassifierStatus
        snapshot={snapshot}
        pretrainedAvailable={false}
      />

      <div className="hr-aap-context">
        <div className="hr-aap-context-label">Live context</div>
        <div className="hr-aap-context-row">
          <label className="hr-aap-field">
            <span>Location</span>
            <select
              value={override.location}
              onChange={(e) =>
                update({ location: e.target.value as LocationName })
              }
            >
              {LOCATION_OPTIONS.map((o) => (
                <option key={o} value={o}>
                  {o}
                </option>
              ))}
            </select>
          </label>
          <label className="hr-aap-field">
            <span>Activity</span>
            <select
              value={override.activity}
              onChange={(e) =>
                update({ activity: e.target.value as MotionActivity })
              }
            >
              {ACTIVITY_OPTIONS.map((o) => (
                <option key={o} value={o}>
                  {o}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="hr-aap-toggles">
          <label className="hr-aap-toggle">
            <input
              type="checkbox"
              checked={override.cookingRoutine}
              onChange={(e) => update({ cookingRoutine: e.target.checked })}
            />
            <span>Cooking routine</span>
          </label>
          <label className="hr-aap-toggle">
            <input
              type="checkbox"
              checked={override.deliveryExpected}
              onChange={(e) => update({ deliveryExpected: e.target.checked })}
            />
            <span>Delivery expected</span>
          </label>
          <label className="hr-aap-toggle">
            <input
              type="checkbox"
              checked={override.eventMode}
              onChange={(e) => update({ eventMode: e.target.checked })}
            />
            <span>Event mode</span>
          </label>
        </div>
      </div>

      <div className="hr-aap-route">
        <label className="hr-aap-toggle">
          <input
            type="checkbox"
            checked={snapshot.autoRoute}
            onChange={(e) => controller.setAutoRoute(e.target.checked)}
          />
          <span>Auto-route confident detections</span>
        </label>
        <button
          type="button"
          className="hr-btn"
          disabled={!lastDetection?.mappedSignal || lastDetection?.routed}
          onClick={() => controller.routeMostRecent()}
        >
          Send detection through Hearer brain
        </button>
      </div>

      <div className="hr-aap-last">
        <div className="hr-aap-last-label">Last detection</div>
        {lastDetection ? (
          <div className="hr-aap-last-body">
            <div className="hr-aap-last-row">
              <span className="hr-aap-last-name">
                {lastDetection.classification.label}
              </span>
              <span className="hr-aap-last-conf">
                {(lastDetection.classification.confidence * 100).toFixed(0)}%
              </span>
              <span
                className={`hr-aap-last-routed ${
                  lastDetection.routed ? "is-routed" : ""
                }`}
              >
                {lastDetection.routed ? "routed" : "not routed"}
              </span>
            </div>
            <div className="hr-aap-last-explain">
              {lastDetection.classification.explanation}
            </div>
          </div>
        ) : (
          <div className="hr-aap-last-empty">No detections yet.</div>
        )}
      </div>

      {snapshot.lastError && (
        <div className="hr-aap-error" role="alert">
          {snapshot.lastError}
        </div>
      )}

      <AudioDetectionLog detections={snapshot.detections} />
    </section>
  );
}
