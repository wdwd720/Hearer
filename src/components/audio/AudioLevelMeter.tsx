import "./AudioLevelMeter.css";

interface AudioLevelMeterProps {
  level: number; // 0..1 (RMS)
  active: boolean;
}

export function AudioLevelMeter({ level, active }: AudioLevelMeterProps) {
  const percent = Math.min(1, level * 4) * 100;
  return (
    <div className={`hr-meter ${active ? "hr-meter-active" : ""}`} aria-label="Audio level">
      <div className="hr-meter-bar" style={{ width: `${percent}%` }} />
    </div>
  );
}
