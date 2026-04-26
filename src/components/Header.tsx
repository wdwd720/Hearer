import "./Header.css";

interface HeaderProps {
  memoryStatus?: "api" | "local" | "offline";
}

export function Header({ memoryStatus }: HeaderProps) {
  return (
    <header className="hr-header">
      <div className="hr-header-left">
        <div className="hr-brand">
          <span className="hr-brand-dot" aria-hidden />
          <span className="hr-brand-name">Hearer</span>
        </div>
        <div className="hr-tagline">
          Glasses-first proactive accessibility · G2 mic → Hearer brain → G2
          HUD
        </div>
      </div>
      <div className="hr-header-chips">
        <span className="hr-chip hr-chip-soft">Track 3 · Agents for Good</span>
        <span className="hr-chip hr-chip-warn" title="The dashboard is a dev/judge view. The product is the glasses.">
          Dev / simulator view
        </span>
        <span className="hr-chip hr-chip-accent">G2 HUD preview</span>
        {memoryStatus && (
          <span
            className={`hr-chip ${
              memoryStatus === "api"
                ? "hr-chip-accent"
                : memoryStatus === "local"
                ? "hr-chip-warn"
                : "hr-chip-soft"
            }`}
            title="Hearer Memory API status"
          >
            Memory:{" "}
            {memoryStatus === "api"
              ? "API connected"
              : memoryStatus === "local"
              ? "local fallback"
              : "offline"}
          </span>
        )}
      </div>
    </header>
  );
}
