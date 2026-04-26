import type { EventLogEntry } from "../engine/types";
import { formatTime } from "../utils/format";
import "./EventLog.css";

interface EventLogProps {
  entries: EventLogEntry[];
}

export function EventLog({ entries }: EventLogProps) {
  return (
    <section className="hr-panel" aria-label="Event log and reasoning">
      <header className="hr-panel-header">
        <h2 className="hr-panel-title">Event log</h2>
        <span className="hr-panel-sub">
          Why each cue appeared · for judges/devs
        </span>
      </header>
      {entries.length === 0 && (
        <div className="hr-evlog-empty">
          No events yet — pick a scenario to start.
        </div>
      )}
      <ul className="hr-evlog-list">
        {entries.map((entry) => (
          <li key={entry.id} className="hr-evlog-item">
            <div className="hr-evlog-head">
              <span className="hr-evlog-time">
                {formatTime(entry.timestamp)}
              </span>
              <span className="hr-evlog-title">{entry.scenarioTitle}</span>
              <span
                className={`hr-evlog-pill hr-evlog-pri-${entry.priority}`}
              >
                {entry.priority}
              </span>
              <span className="hr-evlog-pill hr-evlog-act">
                {entry.actionType}
              </span>
            </div>
            <div className="hr-evlog-cue">
              {entry.cueText.split("\n").map((line, i) => (
                <span key={i} className="hr-evlog-cue-line">
                  {line}
                </span>
              ))}
            </div>
            <ol className="hr-evlog-steps">
              {entry.reasoningSteps.map((step, idx) => (
                <li key={idx} className="hr-evlog-step">
                  <span className="hr-evlog-step-label">{step.label}</span>
                  {step.detail && (
                    <span className="hr-evlog-step-detail">{step.detail}</span>
                  )}
                </li>
              ))}
            </ol>
          </li>
        ))}
      </ul>
    </section>
  );
}
