import "./DatasetModelCard.css";

export function DatasetModelCard() {
  return (
    <section className="hr-panel hr-dmc" aria-label="Dataset and model status">
      <header className="hr-panel-header">
        <h2 className="hr-panel-title">Dataset & model</h2>
        <span className="hr-panel-sub">Training/eval — not the runtime</span>
      </header>
      <ul className="hr-dmc-list">
        <li className="hr-dmc-row">
          <span className="hr-dmc-name">Runtime classifier</span>
          <span className="hr-dmc-state hr-dmc-state-on">
            Rule-based local
          </span>
        </li>
        <li className="hr-dmc-row">
          <span className="hr-dmc-name">Trained model</span>
          <span className="hr-dmc-state hr-dmc-state-off">Not loaded</span>
        </li>
        <li className="hr-dmc-row">
          <span className="hr-dmc-name">Pretrained (YAMNet/TF.js)</span>
          <span className="hr-dmc-state hr-dmc-state-off">Not loaded</span>
        </li>
        <li className="hr-dmc-row">
          <span className="hr-dmc-name">ESC-50 dataset</span>
          <span className="hr-dmc-state hr-dmc-state-soft">
            Place at ml/datasets/esc50
          </span>
        </li>
        <li className="hr-dmc-row">
          <span className="hr-dmc-name">UrbanSound8K</span>
          <span className="hr-dmc-state hr-dmc-state-soft">
            Place at ml/datasets/urbansound8k
          </span>
        </li>
        <li className="hr-dmc-row">
          <span className="hr-dmc-name">FSD50K</span>
          <span className="hr-dmc-state hr-dmc-state-soft">
            Place at ml/datasets/fsd50k
          </span>
        </li>
      </ul>
      <div className="hr-dmc-note">
        Datasets are used for offline training and evaluation. The runtime
        does not depend on any dataset.
      </div>
    </section>
  );
}
