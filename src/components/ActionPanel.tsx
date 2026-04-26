import type { Cue, DigitalAction } from "../engine/types";
import type { CueFeedback } from "../../shared/types";
import { titleCase } from "../utils/format";
import "./ActionPanel.css";

interface ActionPanelProps {
  cue: Cue | null;
  actions: DigitalAction[];
  onFeedback?: (feedback: CueFeedback) => void;
  feedbackGiven?: CueFeedback | null;
}

export function ActionPanel({ cue, actions, onFeedback, feedbackGiven }: ActionPanelProps) {
  return (
    <section className="hr-panel" aria-label="Action router">
      <header className="hr-panel-header">
        <h2 className="hr-panel-title">Action router</h2>
        <span className="hr-panel-sub">
          {cue ? `Routed as ${cue.actionType}` : "Awaiting signal"}
        </span>
      </header>

      <div className="hr-action-route">
        <RouteRow
          active={cue?.actionType === "physical"}
          label="Physical"
          desc="Surface as one cue on the HUD"
        />
        <RouteRow
          active={cue?.actionType === "digital"}
          label="Digital"
          desc="Phone prepares or executes the task"
        />
        <RouteRow
          active={cue?.actionType === "awareness"}
          label="Awareness"
          desc="Tell the user something happened"
        />
      </div>

      {cue && onFeedback && (
        <div className="hr-action-feedback">
          <span className="hr-action-feedback-label">Was this cue useful?</span>
          <div className="hr-action-feedback-row">
            {(["helpful", "too_much", "wrong", "missed"] as CueFeedback[]).map(
              (f) => (
                <button
                  key={f}
                  type="button"
                  className={`hr-btn hr-btn-mini ${
                    feedbackGiven === f ? "hr-btn-primary" : ""
                  }`}
                  onClick={() => onFeedback(f)}
                  disabled={feedbackGiven === f}
                >
                  {f.replace("_", " ")}
                </button>
              )
            )}
          </div>
        </div>
      )}

      <div className="hr-action-list">
        {actions.length === 0 && (
          <div className="hr-action-empty">
            {cue?.actionType === "physical"
              ? "Physical action surfaced on HUD only — phone does not automate."
              : cue?.actionType === "awareness"
              ? "Awareness cue surfaced on HUD — user decides how to respond."
              : "No phone-side actions yet."}
          </div>
        )}
        {actions.map((a) => (
          <div className={`hr-action hr-action-${a.status}`} key={a.id}>
            <div className="hr-action-top">
              <span className="hr-action-type">{titleCase(a.type)}</span>
              <span className="hr-action-status">{a.status}</span>
            </div>
            <div className="hr-action-label">{a.label}</div>
            {a.payload && Object.keys(a.payload).length > 0 && (
              <div className="hr-action-payload">
                {Object.entries(a.payload).map(([k, v]) => (
                  <span className="hr-action-payload-row" key={k}>
                    <span className="hr-action-payload-k">{k}</span>
                    <span className="hr-action-payload-v">
                      {typeof v === "string" ? v : JSON.stringify(v)}
                    </span>
                  </span>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}

function RouteRow({
  active,
  label,
  desc,
}: {
  active: boolean;
  label: string;
  desc: string;
}) {
  return (
    <div className={`hr-route-row ${active ? "hr-route-row-active" : ""}`}>
      <span className="hr-route-dot" />
      <div className="hr-route-text">
        <span className="hr-route-label">{label}</span>
        <span className="hr-route-desc">{desc}</span>
      </div>
    </div>
  );
}
