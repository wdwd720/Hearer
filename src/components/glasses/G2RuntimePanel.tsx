import { useEffect, useState } from "react";
import type { G2RuntimeController } from "../../glasses/g2RuntimeController";
import type { G2RuntimeSnapshot } from "../../glasses/g2RuntimeTypes";
import "./G2RuntimePanel.css";

interface G2RuntimePanelProps {
  controller: G2RuntimeController;
  onSendTestCue: () => void;
}

const STATUS_LABEL: Record<string, string> = {
  idle: "Idle",
  initialising: "Initialising…",
  connected: "Connected",
  listening: "Listening",
  unavailable: "Unavailable",
  fallback_active: "Fallback active",
  error: "Error",
};

export function G2RuntimePanel({ controller, onSendTestCue }: G2RuntimePanelProps) {
  const [snapshot, setSnapshot] = useState<G2RuntimeSnapshot>(() =>
    controller.snapshot()
  );
  const [busy, setBusy] = useState(false);

  useEffect(() => controller.subscribe(setSnapshot), [controller]);

  const handleStart = async () => {
    setBusy(true);
    try {
      await controller.startG2Listening();
    } finally {
      setBusy(false);
    }
  };
  const handleStop = async () => {
    setBusy(true);
    try {
      await controller.stopListening();
    } finally {
      setBusy(false);
    }
  };
  const handleFallback = async () => {
    setBusy(true);
    try {
      await controller.useFallbackBrowserMic();
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="hr-panel hr-g2rp" aria-label="G2 runtime">
      <header className="hr-panel-header">
        <h2 className="hr-panel-title">G2 runtime</h2>
        <span
          className={`hr-g2rp-bridge ${
            snapshot.bridgeDetected ? "hr-g2rp-bridge-on" : "hr-g2rp-bridge-off"
          }`}
        >
          {snapshot.bridgeDetected ? "Even Hub bridge: detected" : "Even Hub bridge: not detected"}
        </span>
      </header>

      <div className="hr-g2rp-target">
        <span className="hr-g2rp-target-label">Target runtime</span>
        <span className="hr-g2rp-target-text">
          Even G2 microphone → Even Hub brain → Even G2 HUD
        </span>
      </div>

      <div className="hr-g2rp-message">{snapshot.message}</div>

      <div className="hr-g2rp-rows">
        <RuntimeRow
          title="Input target"
          primary="Even G2 microphone"
          fallbackLabel="Browser mic / file (fallback)"
          isPrimary={snapshot.inputAdapter.kind === "even_g2_mic"}
          status={STATUS_LABEL[snapshot.inputAdapter.status] ?? snapshot.inputAdapter.status}
          detail={snapshot.inputAdapter.detail}
        />
        <RuntimeRow
          title="Output target"
          primary="Even G2 HUD"
          fallbackLabel="Simulator HUD (dev fallback)"
          isPrimary={snapshot.outputAdapter.kind === "even_g2_hud"}
          status={STATUS_LABEL[snapshot.outputAdapter.status] ?? snapshot.outputAdapter.status}
          detail={snapshot.outputAdapter.detail}
        />
      </div>

      <div className="hr-g2rp-buttons">
        <button
          type="button"
          className="hr-btn hr-btn-primary"
          disabled={busy}
          onClick={handleStart}
        >
          Start G2 listening
        </button>
        <button
          type="button"
          className="hr-btn"
          disabled={busy}
          onClick={handleStop}
        >
          Stop G2 listening
        </button>
        <button
          type="button"
          className="hr-btn"
          disabled={busy}
          onClick={onSendTestCue}
          title="Send a tiny test cue through the active HUD adapter"
        >
          Send test cue to HUD
        </button>
        <button
          type="button"
          className="hr-btn hr-btn-soft"
          disabled={busy}
          onClick={handleFallback}
          title="Use browser microphone as a labeled dev fallback"
        >
          Use simulator fallback
        </button>
      </div>
    </section>
  );
}

function RuntimeRow({
  title,
  primary,
  fallbackLabel,
  isPrimary,
  status,
  detail,
}: {
  title: string;
  primary: string;
  fallbackLabel: string;
  isPrimary: boolean;
  status: string;
  detail?: string;
}) {
  return (
    <div className="hr-g2rp-row">
      <div className="hr-g2rp-row-head">
        <span className="hr-g2rp-row-title">{title}</span>
        <span
          className={`hr-g2rp-row-status ${
            isPrimary ? "hr-g2rp-status-primary" : "hr-g2rp-status-fallback"
          }`}
        >
          {status}
        </span>
      </div>
      <div className="hr-g2rp-row-body">
        <div className="hr-g2rp-row-primary">
          <span className="hr-g2rp-tag">PRIMARY</span>
          {primary}
        </div>
        <div className="hr-g2rp-row-fallback">
          <span className="hr-g2rp-tag-soft">FALLBACK</span>
          {fallbackLabel}
        </div>
        {detail && <div className="hr-g2rp-row-detail">{detail}</div>}
      </div>
    </div>
  );
}
