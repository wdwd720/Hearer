import "./SystemPipelineCard.css";

export function SystemPipelineCard() {
  return (
    <section className="hr-panel hr-pipe" aria-label="System pipeline">
      <header className="hr-panel-header">
        <h2 className="hr-panel-title">System pipeline</h2>
        <span className="hr-panel-sub">Glasses-first runtime</span>
      </header>
      <ol className="hr-pipe-steps">
        <li className="hr-pipe-step">
          <span className="hr-pipe-num">1</span>
          <span className="hr-pipe-text">Even G2 mic / context / memory</span>
        </li>
        <li className="hr-pipe-step">
          <span className="hr-pipe-num">2</span>
          <span className="hr-pipe-text">Sound + world-state engine</span>
        </li>
        <li className="hr-pipe-step">
          <span className="hr-pipe-num">3</span>
          <span className="hr-pipe-text">Priority + cue compressor</span>
        </li>
        <li className="hr-pipe-step">
          <span className="hr-pipe-num">4</span>
          <span className="hr-pipe-text">Even G2 HUD cue</span>
        </li>
      </ol>
      <div className="hr-pipe-note">
        Target runtime: Even G2 mic + Even Hub brain + G2 HUD output. Browser
        mic / uploads / fixtures are dev fallbacks.
      </div>
    </section>
  );
}
