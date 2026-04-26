import "./Header.css";

export function Header() {
  return (
    <header className="hr-header">
      <div className="hr-header-left">
        <div className="hr-brand">
          <span className="hr-brand-dot" aria-hidden />
          <span className="hr-brand-name">Hearer</span>
        </div>
        <div className="hr-tagline">Missed-cue prevention for the real world</div>
      </div>
      <div className="hr-header-chips">
        <span className="hr-chip hr-chip-soft">Track 3 · Agents for Good</span>
        <span className="hr-chip hr-chip-warn">Simulator Mode</span>
        <span className="hr-chip hr-chip-accent">Even G2 HUD Preview</span>
      </div>
    </header>
  );
}
