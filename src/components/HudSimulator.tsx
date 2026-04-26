import { useEffect, useState } from "react";
import type { Cue, Priority, ActionType } from "../engine/types";
import "./HudSimulator.css";

interface HudSimulatorProps {
  cue: Cue | null;
  isNewCue: boolean;
}

const PRIORITY_LABEL: Record<Priority, string> = {
  low: "LOW",
  medium: "MED",
  high: "HIGH",
  urgent: "URGENT",
};

const ACTION_LABEL: Record<ActionType, string> = {
  physical: "PHYSICAL",
  digital: "DIGITAL",
  awareness: "AWARENESS",
};

export function HudSimulator({ cue, isNewCue }: HudSimulatorProps) {
  const [pulse, setPulse] = useState(false);

  useEffect(() => {
    if (!isNewCue) return;
    setPulse(true);
    const t = setTimeout(() => setPulse(false), 900);
    return () => clearTimeout(t);
  }, [cue?.id, isNewCue]);

  const lines = (cue?.text ?? "No cue needed").split("\n");
  const priorityClass = cue ? `hr-hud-priority-${cue.priority}` : "";

  return (
    <div className="hr-hud-wrap" aria-label="Even G2 HUD simulator">
      <div className="hr-hud-frame-label">EVEN G2 · HUD PREVIEW</div>
      <div className={`hr-hud-frame ${pulse ? "hr-hud-pulse" : ""}`}>
        <div className="hr-hud-glass">
          <div className="hr-hud-top-row">
            <span className="hr-hud-tag">HEARER</span>
            {cue ? (
              <span className="hr-hud-time">
                {new Date(cue.timestamp).toLocaleTimeString([], {
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </span>
            ) : (
              <span className="hr-hud-time">--:--</span>
            )}
          </div>
          <div className="hr-hud-cue">
            {lines.map((line, idx) => (
              <div key={idx} className="hr-hud-cue-line">
                {line}
              </div>
            ))}
          </div>
          <div className="hr-hud-bottom-row">
            {cue && (
              <>
                <span className={`hr-hud-chip ${priorityClass}`}>
                  {PRIORITY_LABEL[cue.priority]}
                </span>
                <span className="hr-hud-chip hr-hud-chip-action">
                  {ACTION_LABEL[cue.actionType]}
                </span>
              </>
            )}
            {!cue && (
              <span className="hr-hud-chip hr-hud-chip-idle">IDLE</span>
            )}
          </div>
        </div>
        <div className="hr-hud-temple-left" aria-hidden />
        <div className="hr-hud-temple-right" aria-hidden />
      </div>
      <div className="hr-hud-frame-caption">
        One cue at the moment it matters · simulated display
      </div>
    </div>
  );
}
