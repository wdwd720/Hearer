import { useEffect, useMemo, useState } from "react";
import { Header } from "./components/Header";
import { HudSimulator } from "./components/HudSimulator";
import { ScenarioPanel } from "./components/ScenarioPanel";
import { ContextPanel } from "./components/ContextPanel";
import { MemoryPanel } from "./components/MemoryPanel";
import { ActionPanel } from "./components/ActionPanel";
import { EventLog } from "./components/EventLog";
import { SignalTimeline } from "./components/SignalTimeline";
import { decide } from "./engine/contextEngine";
import { getScenario, scenarios } from "./engine/scenarios";
import {
  loadMemory,
  recordRecentCue,
  resetMemory,
} from "./engine/memoryStore";
import type { DecisionResult, EventLogEntry } from "./engine/types";

const DEFAULT_SCENARIO_ID = "kitchen_timer";

function decisionToEntry(decision: DecisionResult): EventLogEntry {
  return {
    id: `${decision.cue.id}`,
    timestamp: decision.cue.timestamp,
    scenarioId: decision.scenarioId,
    scenarioTitle: decision.title,
    cueText: decision.cue.text,
    priority: decision.cue.priority,
    actionType: decision.cue.actionType,
    reasoningSteps: decision.reasoningSteps,
    signalKinds: Array.from(new Set(decision.signals.map((s) => s.kind))),
  };
}

export default function App() {
  const [memory, setMemory] = useState(() => loadMemory());
  const [decision, setDecision] = useState<DecisionResult | null>(() => {
    const sc = getScenario(DEFAULT_SCENARIO_ID);
    return sc ? decide({ scenario: sc, memory: loadMemory() }) : null;
  });
  const [log, setLog] = useState<EventLogEntry[]>(() => {
    const sc = getScenario(DEFAULT_SCENARIO_ID);
    if (!sc) return [];
    return [decisionToEntry(decide({ scenario: sc, memory: loadMemory() }))];
  });
  const [cueTick, setCueTick] = useState(0);

  // Persist recent cues into memory whenever a new decision lands.
  useEffect(() => {
    if (!decision) return;
    setMemory((prev) => recordRecentCue(prev, decision.cue));
    // We want to react when the decision id changes, not memory.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [decision?.cue.id]);

  const runScenario = (id: string) => {
    const sc = getScenario(id);
    if (!sc) return;
    const next = decide({ scenario: sc, memory });
    setDecision(next);
    setLog((prev) => [decisionToEntry(next), ...prev].slice(0, 12));
    setCueTick((t) => t + 1);
  };

  const handleReset = () => {
    const fresh = resetMemory();
    setMemory(fresh);
    setDecision(null);
    setLog([]);
    setCueTick((t) => t + 1);
  };

  const handleReplay = () => {
    if (!decision) return;
    setCueTick((t) => t + 1);
  };

  const handleAutoDemo = () => {
    const order = [
      "kitchen_timer",
      "leaving_home",
      "doorbell",
      "name_called",
      "promise_jason",
    ];
    order.forEach((id, idx) => {
      setTimeout(() => runScenario(id), idx * 1100);
    });
  };

  const explainer = useMemo(() => {
    if (!decision) {
      return "Hearer combines audio, context, and memory to decide what matters now, then shows one tiny HUD cue when the action is physical.";
    }
    return decision.cue.reason;
  }, [decision]);

  return (
    <div className="hr-app">
      <Header />
      <main className="hr-main">
        <aside className="hr-col">
          <ScenarioPanel
            selectedId={decision?.scenarioId ?? null}
            onSelect={runScenario}
          />
          <div className="hr-explainer">
            <strong>Why this cue?</strong>
            <div style={{ marginTop: 6 }}>{explainer}</div>
          </div>
        </aside>

        <section className="hr-center">
          <HudSimulator
            cue={decision?.cue ?? null}
            isNewCue={cueTick > 0}
            key={cueTick}
          />
          <div className="hr-controls">
            <button
              type="button"
              className="hr-btn hr-btn-primary"
              onClick={handleAutoDemo}
              title="Run the five core scenarios in sequence"
            >
              Auto demo
            </button>
            <button
              type="button"
              className="hr-btn"
              onClick={handleReplay}
              disabled={!decision}
            >
              Replay cue
            </button>
            <button type="button" className="hr-btn" onClick={handleReset}>
              Reset demo
            </button>
            <span className="hr-chip hr-chip-soft">
              {scenarios.length} scenarios loaded
            </span>
          </div>
          <SignalTimeline signals={decision?.signals ?? []} />
          <EventLog entries={log} />
        </section>

        <aside className="hr-col">
          <ContextPanel context={decision?.context ?? null} />
          <ActionPanel
            cue={decision?.cue ?? null}
            actions={decision?.actions ?? []}
          />
          <MemoryPanel memory={memory} />
        </aside>
      </main>
      <footer className="hr-footer">
        <div className="hr-privacy">
          <span className="hr-privacy-tag">Simulator only</span>
          <span className="hr-privacy-tag">User controls memory</span>
          <span className="hr-privacy-tag">No medical claims</span>
          <span className="hr-privacy-tag">Trusted-contact escalation opt-in</span>
          <span className="hr-privacy-tag">Audio history can be deleted</span>
        </div>
        <div>
          Hearer · simulator-first MVP · audio, location and glasses display are
          mocked for demo
        </div>
      </footer>
    </div>
  );
}
