import type { ContextState } from "../engine/types";
import { titleCase } from "../utils/format";
import "./ContextPanel.css";

interface ContextPanelProps {
  context: ContextState | null;
}

export function ContextPanel({ context }: ContextPanelProps) {
  return (
    <section className="hr-panel" aria-label="Current context">
      <header className="hr-panel-header">
        <h2 className="hr-panel-title">Current context</h2>
        <span className="hr-panel-sub">
          {context ? `Signals combined: ${context.signalsCombined}` : "Idle"}
        </span>
      </header>
      <div className="hr-ctx-grid">
        <ContextRow label="Location" value={context ? titleCase(context.location) : "—"} />
        <ContextRow label="Activity" value={context ? titleCase(context.activity) : "—"} />
        <ContextRow
          label="Calendar"
          value={context?.calendarContext ?? "—"}
        />
        <ContextRow
          label="Active routines"
          value={
            context && context.activeRoutines.length > 0
              ? context.activeRoutines.map(titleCase).join(", ")
              : "—"
          }
        />
        <ContextRow
          label="Known people"
          value={
            context && context.knownPeople.length > 0
              ? context.knownPeople.slice(0, 4).join(", ")
              : "—"
          }
        />
      </div>
    </section>
  );
}

function ContextRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="hr-ctx-row">
      <span className="hr-ctx-label">{label}</span>
      <span className="hr-ctx-value">{value}</span>
    </div>
  );
}
