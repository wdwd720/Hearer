import { useEffect, useMemo, useRef, useState } from "react";
import { Header } from "./components/Header";
import { HudSimulator } from "./components/HudSimulator";
import { ScenarioPanel } from "./components/ScenarioPanel";
import { ContextPanel } from "./components/ContextPanel";
import { MemoryPanel } from "./components/MemoryPanel";
import { ActionPanel } from "./components/ActionPanel";
import { EventLog } from "./components/EventLog";
import { SignalTimeline } from "./components/SignalTimeline";
import { AudioAwarenessPanel } from "./components/audio/AudioAwarenessPanel";
import { decide } from "./engine/contextEngine";
import { getScenario, scenarios } from "./engine/scenarios";
import {
  loadMemory,
  recordRecentCue,
  resetMemory,
} from "./engine/memoryStore";
import { AudioController } from "./audio/audioController";
import type {
  AudioControllerSnapshot,
  LiveContextOverride,
} from "./audio/audioTypes";
import { SimulatorHudAdapter } from "./glasses/simulatorHudAdapter";
import { EvenG2AdapterStub } from "./glasses/evenG2AdapterStub";
import type { DecisionResult, EventLogEntry } from "./engine/types";

const DEFAULT_SCENARIO_ID = "kitchen_timer";

const DEFAULT_OVERRIDE: LiveContextOverride = {
  location: "kitchen",
  activity: "cooking",
  cookingRoutine: true,
  deliveryExpected: false,
  eventMode: false,
};

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
  const [override, setOverride] = useState<LiveContextOverride>(DEFAULT_OVERRIDE);

  // Refs so the audio controller always sees the latest memory + override.
  const memoryRef = useRef(memory);
  const overrideRef = useRef(override);
  useEffect(() => {
    memoryRef.current = memory;
  }, [memory]);
  useEffect(() => {
    overrideRef.current = override;
  }, [override]);

  // HUD output adapters live for the lifetime of the app.
  const simulatorAdapterRef = useRef(new SimulatorHudAdapter());
  const g2StubRef = useRef(new EvenG2AdapterStub());

  const audioControllerRef = useRef<AudioController | null>(null);
  if (!audioControllerRef.current) {
    audioControllerRef.current = new AudioController({
      getMemory: () => memoryRef.current,
      getOverride: () => overrideRef.current,
      autoRoute: true,
    });
  }
  const audioController = audioControllerRef.current;

  const [audioSnapshot, setAudioSnapshot] = useState<AudioControllerSnapshot>(
    () => audioController.snapshot()
  );

  // Persist recent cues into memory whenever a new decision lands.
  useEffect(() => {
    if (!decision) return;
    setMemory((prev) => recordRecentCue(prev, decision.cue));
    // We want to react when the decision id changes, not memory.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [decision?.cue.id]);

  // Subscribe to audio controller decisions: update HUD, event log, fan out to adapters.
  useEffect(() => {
    const unsubSnap = audioController.subscribe(setAudioSnapshot);
    const unsubDecision = audioController.onDecision((d) => {
      setDecision(d);
      setLog((prev) => [decisionToEntry(d), ...prev].slice(0, 14));
      setCueTick((t) => t + 1);
      simulatorAdapterRef.current.sendCue(d.cue);
      g2StubRef.current.sendCue(d.cue);
    });
    return () => {
      unsubSnap();
      unsubDecision();
    };
  }, [audioController]);

  const runScenario = (id: string) => {
    const sc = getScenario(id);
    if (!sc) return;
    const next = decide({ scenario: sc, memory: memoryRef.current });
    setDecision(next);
    setLog((prev) => [decisionToEntry(next), ...prev].slice(0, 14));
    setCueTick((t) => t + 1);
    simulatorAdapterRef.current.sendCue(next.cue);
    g2StubRef.current.sendCue(next.cue);
  };

  const handleReset = async () => {
    await audioController.stop();
    audioController.clearDetections();
    const fresh = resetMemory();
    setMemory(fresh);
    setDecision(null);
    setLog([]);
    setCueTick((t) => t + 1);
    simulatorAdapterRef.current.clearCue();
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
      return "The classifier hears a likely event. The context engine decides whether it matters. The HUD only shows the shortest useful action.";
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
            <span className="hr-chip hr-chip-accent">
              Output: {simulatorAdapterRef.current.label}
            </span>
            <span className="hr-chip hr-chip-soft" title="Even G2 adapter is a stub — no BLE in this build.">
              {g2StubRef.current.label}
            </span>
          </div>
          <SignalTimeline signals={decision?.signals ?? []} />
          <AudioAwarenessPanel
            controller={audioController}
            override={override}
            onOverrideChange={setOverride}
          />
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
          <span className="hr-privacy-tag">Audio processed locally</span>
          <span className="hr-privacy-tag">Raw audio not stored</span>
          <span className="hr-privacy-tag">No medical claims</span>
          <span className="hr-privacy-tag">Trusted-contact escalation opt-in</span>
        </div>
        <div>
          Hearer · simulator-first MVP · audio classifier is local rule-based;
          glasses output goes through the simulator adapter today.
        </div>
      </footer>
      {/* Reference snapshot to avoid unused-var lint when extending later */}
      <span style={{ display: "none" }}>{audioSnapshot.classifierId}</span>
    </div>
  );
}
