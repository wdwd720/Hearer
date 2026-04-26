import type { Signal } from "../engine/types";
import { formatTime, shortConfidence, titleCase } from "../utils/format";
import "./SignalTimeline.css";

interface SignalTimelineProps {
  signals: Signal[];
}

function summarize(signal: Signal): string {
  switch (signal.kind) {
    case "audio":
      return `${signal.event.replace("_", " ")}${
        signal.direction ? ` · ${signal.direction}` : ""
      }`;
    case "speech":
      return signal.intent
        ? `${signal.intent}: “${truncate(signal.transcript, 32)}”`
        : `“${truncate(signal.transcript, 40)}”`;
    case "location":
      return signal.transition
        ? `${signal.location} · ${signal.transition}`
        : signal.location;
    case "calendar":
      return signal.label;
    case "motion":
      return signal.activity;
    case "routine":
      return signal.label;
    case "memory":
      return signal.label;
  }
}

function truncate(s: string, max: number): string {
  return s.length > max ? s.slice(0, max - 1) + "…" : s;
}

export function SignalTimeline({ signals }: SignalTimelineProps) {
  return (
    <section className="hr-panel" aria-label="Signal timeline">
      <header className="hr-panel-header">
        <h2 className="hr-panel-title">Signal timeline</h2>
        <span className="hr-panel-sub">
          {signals.length > 0
            ? `${signals.length} signal${signals.length === 1 ? "" : "s"} in this decision`
            : "No signals yet"}
        </span>
      </header>
      <div className="hr-sigtl">
        {signals.map((s, idx) => (
          <div key={idx} className={`hr-sigtl-row hr-sigtl-${s.kind}`}>
            <span className="hr-sigtl-kind">{titleCase(s.kind)}</span>
            <span className="hr-sigtl-summary">{summarize(s)}</span>
            <span className="hr-sigtl-meta">
              {shortConfidence(s.confidence)} · {formatTime(s.timestamp)}
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}
