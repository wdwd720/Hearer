import type { AudioDetectionEvent } from "../../audio/audioTypes";
import { formatTime, shortConfidence } from "../../utils/format";
import "./AudioDetectionLog.css";

interface AudioDetectionLogProps {
  detections: AudioDetectionEvent[];
}

export function AudioDetectionLog({ detections }: AudioDetectionLogProps) {
  if (detections.length === 0) {
    return (
      <div className="hr-detlog-empty">
        No detections yet — start a source or run a fixture.
      </div>
    );
  }
  return (
    <ul className="hr-detlog">
      {detections.map((d) => (
        <li
          key={d.id}
          className={`hr-detlog-item ${
            d.routed ? "hr-detlog-routed" : "hr-detlog-quiet"
          }`}
        >
          <div className="hr-detlog-row">
            <span className="hr-detlog-time">{formatTime(d.timestamp)}</span>
            <span className="hr-detlog-label">{d.classification.label}</span>
            <span className="hr-detlog-conf">
              {shortConfidence(d.classification.confidence)}
            </span>
            <span className="hr-detlog-src">{d.source}</span>
          </div>
          <div className="hr-detlog-explain">
            {d.classification.explanation}
          </div>
          {d.routeNote && (
            <div className="hr-detlog-route">{d.routeNote}</div>
          )}
        </li>
      ))}
    </ul>
  );
}
