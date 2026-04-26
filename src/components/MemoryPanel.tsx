import type { DemoMemory } from "../engine/types";
import { titleCase } from "../utils/format";
import "./MemoryPanel.css";

interface MemoryPanelProps {
  memory: DemoMemory;
}

export function MemoryPanel({ memory }: MemoryPanelProps) {
  return (
    <section className="hr-panel" aria-label="Memory and routines">
      <header className="hr-panel-header">
        <h2 className="hr-panel-title">Memory & routines</h2>
        <span className="hr-panel-sub">User-controlled · simulator</span>
      </header>

      <div className="hr-mem-block">
        <div className="hr-mem-label">Important items</div>
        <div className="hr-mem-tags">
          {memory.userProfile.importantItems.map((it) => (
            <span className="hr-tag" key={it}>{it}</span>
          ))}
        </div>
      </div>

      <div className="hr-mem-block">
        <div className="hr-mem-label">Known names</div>
        <div className="hr-mem-tags">
          {memory.userProfile.knownNames.map((n) => (
            <span className="hr-tag" key={n}>{n}</span>
          ))}
        </div>
      </div>

      <div className="hr-mem-block">
        <div className="hr-mem-label">Open tasks</div>
        <ul className="hr-mem-list">
          {memory.openTasks.map((t) => (
            <li key={t.id} className={`hr-mem-task hr-mem-task-${t.status}`}>
              <span className="hr-mem-task-dot" />
              <span className="hr-mem-task-label">{t.label}</span>
              <span className="hr-mem-task-type">{t.type}</span>
            </li>
          ))}
        </ul>
      </div>

      <div className="hr-mem-block">
        <div className="hr-mem-label">Routines</div>
        <ul className="hr-mem-routines">
          {Object.entries(memory.routines).map(([id, r]) => (
            <li key={id} className="hr-mem-routine">
              <span className="hr-mem-routine-name">{titleCase(id)}</span>
              <span className="hr-mem-routine-trigger">{r.trigger}</span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
