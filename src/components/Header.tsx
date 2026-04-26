import "./Header.css";

interface HeaderProps {
  memoryStatus?: "api" | "local" | "offline";
  llmStatus?: {
    enabled: boolean;
    configured: boolean;
    provider: "openai_compatible" | "mock" | "disabled";
    model?: string;
    reason?: string;
  } | null;
}

function describeLlm(llm: HeaderProps["llmStatus"]): {
  label: string;
  variant: "accent" | "warn" | "soft";
} {
  if (!llm) return { label: "LLM: unknown", variant: "soft" };
  if (llm.provider === "openai_compatible" && llm.configured && llm.enabled) {
    return { label: `LLM: connected · ${llm.model ?? ""}`, variant: "accent" };
  }
  if (llm.provider === "mock") {
    return { label: `LLM: mock${llm.model ? ` · ${llm.model}` : ""}`, variant: "accent" };
  }
  if (llm.enabled && !llm.configured) {
    return { label: "LLM: key missing", variant: "warn" };
  }
  return { label: "LLM: disabled fallback", variant: "soft" };
}

export function Header({ memoryStatus, llmStatus }: HeaderProps) {
  const llm = describeLlm(llmStatus ?? null);
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
        <span
          className={`hr-chip hr-chip-${llm.variant}`}
          title={llmStatus?.reason ?? "LLM provider status"}
        >
          {llm.label}
        </span>
      </div>
    </header>
  );
}
