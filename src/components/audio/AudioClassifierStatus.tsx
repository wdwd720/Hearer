import type { AudioControllerSnapshot } from "../../audio/audioTypes";
import "./AudioClassifierStatus.css";

interface AudioClassifierStatusProps {
  snapshot: AudioControllerSnapshot;
  pretrainedAvailable: boolean;
}

export function AudioClassifierStatus({
  snapshot,
  pretrainedAvailable,
}: AudioClassifierStatusProps) {
  return (
    <div className="hr-clf">
      <div className="hr-clf-row">
        <span className="hr-clf-dot" />
        <span className="hr-clf-name">{snapshot.classifierLabel}</span>
        <span className="hr-clf-id">{snapshot.classifierId}</span>
      </div>
      <div className="hr-clf-sub">
        {pretrainedAvailable
          ? "Pretrained classifier active."
          : "Pretrained model unavailable; rule-based fallback active."}
      </div>
    </div>
  );
}
