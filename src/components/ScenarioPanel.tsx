import { scenarios } from "../engine/scenarios";
import type { ScenarioCategory } from "../engine/types";
import "./ScenarioPanel.css";

interface ScenarioPanelProps {
  selectedId: string | null;
  onSelect: (id: string) => void;
}

const CATEGORY_ORDER: ScenarioCategory[] = [
  "Safety",
  "Memory",
  "Hearing",
  "Speech",
  "Digital",
  "Clinic",
];

export function ScenarioPanel({ selectedId, onSelect }: ScenarioPanelProps) {
  const grouped = CATEGORY_ORDER.map((cat) => ({
    category: cat,
    items: scenarios.filter((s) => s.category === cat),
  })).filter((g) => g.items.length > 0);

  return (
    <section className="hr-panel hr-scenario-panel" aria-label="Scenarios">
      <header className="hr-panel-header">
        <h2 className="hr-panel-title">Scenarios</h2>
        <span className="hr-panel-sub">Tap to simulate a real-world signal</span>
      </header>
      <div className="hr-scenario-groups">
        {grouped.map((group) => (
          <div className="hr-scenario-group" key={group.category}>
            <div className="hr-scenario-cat">{group.category}</div>
            <div className="hr-scenario-buttons">
              {group.items.map((s) => (
                <button
                  type="button"
                  key={s.id}
                  className={`hr-scenario-btn ${
                    selectedId === s.id ? "hr-scenario-btn-active" : ""
                  }`}
                  onClick={() => onSelect(s.id)}
                  title={s.description}
                >
                  <span className="hr-scenario-btn-title">{s.title}</span>
                  <span className="hr-scenario-btn-meta">
                    {s.expectedActionType} · {s.expectedPriority}
                  </span>
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
