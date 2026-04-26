import type { MemorySummary } from "../../shared/types";
import type { DemoMemory } from "../engine/types";
import { titleCase } from "../utils/format";
import "./MemoryPanel.css";

interface MemoryPanelProps {
  memory: DemoMemory;
  summary?: MemorySummary;
}

export function MemoryPanel({ memory, summary }: MemoryPanelProps) {
  // Prefer persisted memory items when available; fall back to the in-engine
  // demo memory so the panel still has content during dev/offline mode.
  const persistedItems = summary?.importantItems.map((i) => i.label) ?? [];
  const itemLabels =
    persistedItems.length > 0 ? persistedItems : memory.userProfile.importantItems;
  const knownNames = [
    memory.userProfile.name,
    ...(summary?.knownPeople.map((p) => p.name) ?? []),
    ...memory.userProfile.knownNames.filter((n) => n !== memory.userProfile.name),
  ];
  const knownNamesUnique = Array.from(new Set(knownNames));

  const persistedRoutines = summary?.routines ?? [];
  const persistedCommitments = summary?.commitments ?? [];

  return (
    <section className="hr-panel" aria-label="Memory and routines">
      <header className="hr-panel-header">
        <h2 className="hr-panel-title">Memory & routines</h2>
        <span className="hr-panel-sub">
          User-controlled ·{" "}
          {summary ? "persisted" : "in-engine demo"}
        </span>
      </header>

      <div className="hr-mem-block">
        <div className="hr-mem-label">Important items</div>
        <div className="hr-mem-tags">
          {itemLabels.length === 0 && <span className="hr-mem-empty">—</span>}
          {itemLabels.map((it) => (
            <span className="hr-tag" key={it}>
              {it}
            </span>
          ))}
        </div>
      </div>

      <div className="hr-mem-block">
        <div className="hr-mem-label">Known names</div>
        <div className="hr-mem-tags">
          {knownNamesUnique.map((n) => (
            <span className="hr-tag" key={n}>
              {n}
            </span>
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
          {memory.openTasks.length === 0 && (
            <li className="hr-mem-empty">—</li>
          )}
        </ul>
      </div>

      <div className="hr-mem-block">
        <div className="hr-mem-label">Routines</div>
        <ul className="hr-mem-routines">
          {persistedRoutines.map((r) => (
            <li key={r.id} className="hr-mem-routine">
              <span className="hr-mem-routine-name">{r.name}</span>
              <span className="hr-mem-routine-trigger">
                {r.triggerDescription} → {r.actionLabel}
              </span>
            </li>
          ))}
          {persistedRoutines.length === 0 &&
            Object.entries(memory.routines).map(([id, r]) => (
              <li key={id} className="hr-mem-routine">
                <span className="hr-mem-routine-name">{titleCase(id)}</span>
                <span className="hr-mem-routine-trigger">{r.trigger}</span>
              </li>
            ))}
        </ul>
      </div>

      {persistedCommitments.length > 0 && (
        <div className="hr-mem-block">
          <div className="hr-mem-label">Commitments</div>
          <ul className="hr-mem-list">
            {persistedCommitments.map((c) => (
              <li
                key={c.id}
                className={`hr-mem-task hr-mem-task-${c.status}`}
              >
                <span className="hr-mem-task-dot" />
                <span className="hr-mem-task-label">
                  {c.task}
                  {c.person ? ` — ${c.person}` : ""}
                  {c.deadlineText ? ` (${c.deadlineText})` : ""}
                </span>
                <span className="hr-mem-task-type">{c.actionType}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
