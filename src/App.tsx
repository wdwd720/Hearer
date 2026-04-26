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
import { G2RuntimePanel } from "./components/glasses/G2RuntimePanel";
import { MemoryCommandBox } from "./components/memory/MemoryCommandBox";
import { SystemPipelineCard } from "./components/SystemPipelineCard";
import { DatasetModelCard } from "./components/DatasetModelCard";
import { decide } from "./engine/contextEngine";
import { getScenario, scenarios } from "./engine/scenarios";
import { AudioController } from "./audio/audioController";
import type { LiveContextOverride } from "./audio/audioTypes";
import { G2RuntimeController } from "./glasses/g2RuntimeController";
import type { Cue, DecisionResult, EventLogEntry } from "./engine/types";
import { createMemoryClient } from "./memory/createMemoryClient";
import type { MemoryClient, MemoryStatus } from "./memory/memoryClient";
import { LocalMemoryClient } from "./memory/localMemoryClient";
import { memorySummaryToDemoMemory } from "./memory/memoryToDemoMemory";
import type { CueFeedback, MemorySummary, Routine } from "../shared/types";

const DEFAULT_SCENARIO_ID = "kitchen_timer";

const DEFAULT_OVERRIDE: LiveContextOverride = {
  location: "kitchen",
  activity: "cooking",
  cookingRoutine: true,
  deliveryExpected: false,
  eventMode: false,
  direction: "unknown",
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
  // Memory client — initialised lazily; defaults to a local fallback so the
  // engine has data to work with before the API probe completes.
  const memoryClientRef = useRef<MemoryClient>(new LocalMemoryClient());
  const [memorySummary, setMemorySummary] = useState<MemorySummary>(
    () => memoryClientRef.current.current()
  );
  const [memoryStatus, setMemoryStatus] = useState<MemoryStatus>("local");
  const [memoryBaseUrl, setMemoryBaseUrl] = useState<string>("http://localhost:8788");

  // The brain expects a DemoMemory shape. We compute it from the persisted
  // summary so saved items / routines flow into the engine.
  const demoMemory = useMemo(
    () => memorySummaryToDemoMemory(memorySummary),
    [memorySummary]
  );
  const persistedRoutines: Routine[] = memorySummary.routines;

  const [decision, setDecision] = useState<DecisionResult | null>(null);
  const [log, setLog] = useState<EventLogEntry[]>([]);
  const [cueTick, setCueTick] = useState(0);
  const [override, setOverride] = useState<LiveContextOverride>(DEFAULT_OVERRIDE);

  // Refs so async controllers always see the latest dependencies.
  const memoryRef = useRef(demoMemory);
  const overrideRef = useRef(override);
  const routinesRef = useRef(persistedRoutines);
  useEffect(() => {
    memoryRef.current = demoMemory;
  }, [demoMemory]);
  useEffect(() => {
    overrideRef.current = override;
  }, [override]);
  useEffect(() => {
    routinesRef.current = persistedRoutines;
  }, [persistedRoutines]);

  // Audio Awareness controller — fallback dev path. Glasses-first runtime
  // is owned by g2RuntimeController below.
  const audioControllerRef = useRef<AudioController | null>(null);
  if (!audioControllerRef.current) {
    audioControllerRef.current = new AudioController({
      getMemory: () => memoryRef.current,
      getOverride: () => overrideRef.current,
      autoRoute: true,
    });
  }
  const audioController = audioControllerRef.current;

  // G2 runtime controller — primary product path.
  const g2ControllerRef = useRef<G2RuntimeController | null>(null);
  if (!g2ControllerRef.current) {
    g2ControllerRef.current = new G2RuntimeController({
      getMemory: () => memoryRef.current,
      getOverride: () => overrideRef.current,
      getPersistedRoutines: () => routinesRef.current,
    });
  }
  const g2Controller = g2ControllerRef.current;

  // Probe the Memory API on mount; switch to API client if reachable.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const handle = await createMemoryClient();
        if (cancelled) return;
        memoryClientRef.current = handle.client;
        setMemoryStatus(handle.status);
        setMemoryBaseUrl(handle.baseUrl);
        await handle.client.refresh();
        setMemorySummary(handle.client.current());
      } catch {
        // Stay on the local fallback.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Initialise G2 runtime probe (Even Hub bridge).
  useEffect(() => {
    g2Controller.init();
  }, [g2Controller]);

  // Run the default scenario once the demo memory is settled. We do this in
  // an effect so persisted routines/items are reflected the first time.
  const ranInitialRef = useRef(false);
  useEffect(() => {
    if (ranInitialRef.current) return;
    ranInitialRef.current = true;
    const sc = getScenario(DEFAULT_SCENARIO_ID);
    if (!sc) return;
    const result = decide({
      scenario: sc,
      memory: demoMemory,
      persistedRoutines,
    });
    setDecision(result);
    setLog((prev) => [decisionToEntry(result), ...prev].slice(0, 14));
    setCueTick((t) => t + 1);
    g2Controller.simulatorHud.sendCue(result.cue);
  }, [demoMemory, persistedRoutines, g2Controller]);

  // Subscribe to AudioController decisions (fallback path).
  useEffect(() => {
    return audioController.onDecision((d) => {
      setDecision(d);
      setLog((prev) => [decisionToEntry(d), ...prev].slice(0, 14));
      setCueTick((t) => t + 1);
      g2Controller.simulatorHud.sendCue(d.cue);
      // Persist the cue if memory client supports it.
      memoryClientRef.current
        .recordCue({
          cueText: d.cue.text,
          priority: d.cue.priority,
          actionType: d.cue.actionType,
        })
        .then(() => memoryClientRef.current.refresh())
        .then(setMemorySummary)
        .catch(() => {
          /* offline */
        });
    });
  }, [audioController, g2Controller]);

  // Subscribe to G2RuntimeController decisions (primary path).
  useEffect(() => {
    return g2Controller.onDecision((d) => {
      setDecision(d);
      setLog((prev) => [decisionToEntry(d), ...prev].slice(0, 14));
      setCueTick((t) => t + 1);
      memoryClientRef.current
        .recordCue({
          cueText: d.cue.text,
          priority: d.cue.priority,
          actionType: d.cue.actionType,
        })
        .then(() => memoryClientRef.current.refresh())
        .then(setMemorySummary)
        .catch(() => {
          /* offline */
        });
    });
  }, [g2Controller]);

  const runScenario = (id: string) => {
    const sc = getScenario(id);
    if (!sc) return;
    const next = decide({
      scenario: sc,
      memory: memoryRef.current,
      persistedRoutines: routinesRef.current,
    });
    setDecision(next);
    setLog((prev) => [decisionToEntry(next), ...prev].slice(0, 14));
    setCueTick((t) => t + 1);
    g2Controller.simulatorHud.sendCue(next.cue);
    // Persist the cue (best-effort).
    memoryClientRef.current
      .recordCue({
        cueText: next.cue.text,
        priority: next.cue.priority,
        actionType: next.cue.actionType,
      })
      .then(() => memoryClientRef.current.refresh())
      .then(setMemorySummary)
      .catch(() => {
        /* offline */
      });

    // For the Promise scenario, also persist a Commitment so the demo
    // demonstrates real durable memory.
    if (id === "promise_jason") {
      memoryClientRef.current
        .addCommitment({
          person: "Jason",
          task: "send the deck",
          deadlineText: "tonight",
          actionType: "digital",
          source: "demo",
        })
        .then(() => memoryClientRef.current.refresh())
        .then(setMemorySummary)
        .catch(() => {
          /* offline */
        });
    }
  };

  const handleReset = async () => {
    await audioController.stop();
    audioController.clearDetections();
    await g2Controller.stopListening();
    await memoryClientRef.current.reset();
    await memoryClientRef.current.refresh();
    setMemorySummary(memoryClientRef.current.current());
    setDecision(null);
    setLog([]);
    setCueTick((t) => t + 1);
    g2Controller.simulatorHud.clearCue();
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

  const handleMemoryCommand = async (text: string) => {
    const result = await memoryClientRef.current.extract(text);
    if (result.summary) setMemorySummary(result.summary);
    // Optional tiny HUD confirmation. Picks the first extracted item.
    const first = (result.extracted as Array<{ type: string; actionLabel?: string; task?: string }>)[0];
    if (first) {
      const text2 =
        first.type === "routine" && first.actionLabel
          ? `Memory saved:\n${first.actionLabel.slice(0, 24)}.`
          : first.type === "commitment" && first.task
          ? `Memory saved:\n${first.task.slice(0, 24)}.`
          : "Memory saved.\nRoutine added.";
      const cue: Cue = {
        id: `cue_mem_${Date.now()}`,
        text: text2,
        priority: "low",
        actionType: "digital",
        confidence: 1,
        timestamp: new Date().toISOString(),
        signalsUsed: ["memory"],
        reason: "Memory command saved.",
      };
      g2Controller.simulatorHud.sendCue(cue);
      setDecision({
        scenarioId: "memory_command",
        title: "Memory command saved",
        signals: [],
        context: {
          location: override.location,
          activity: override.activity,
          activeRoutines: [],
          knownPeople: [],
          openTasks: [],
          importantItems: [],
          signalsCombined: 0,
        },
        cue,
        actions: [],
        reasoningSteps: [
          { label: "Memory command", detail: text },
          ...((result.notes ?? []).map((n) => ({ label: "Note", detail: n }))),
          {
            label: `Extracted ${result.extracted.length} item(s)`,
            detail: result.extracted.map((e) => (e as { type: string }).type).join(", "),
          },
        ],
      });
      setLog((prev) =>
        [
          decisionToEntry({
            scenarioId: "memory_command",
            title: "Memory command",
            cue,
            signals: [],
            context: {
              location: override.location,
              activity: override.activity,
              activeRoutines: [],
              knownPeople: [],
              openTasks: [],
              importantItems: [],
              signalsCombined: 0,
            },
            actions: [],
            reasoningSteps: [
              { label: "Memory command", detail: text },
            ],
          }),
          ...prev,
        ].slice(0, 14)
      );
      setCueTick((t) => t + 1);
    }
  };

  const handleSendTestCue = async () => {
    const cue: Cue = {
      id: `cue_test_${Date.now()}`,
      text: "Hearer test:\nG2 HUD ready.",
      priority: "low",
      actionType: "awareness",
      confidence: 1,
      timestamp: new Date().toISOString(),
      signalsUsed: [],
      reason: "Manual test cue",
    };
    await g2Controller.sendTestCue(cue);
  };

  const handleCueFeedback = async (feedback: CueFeedback) => {
    if (!decision) return;
    // Cues come from many sources; the recorded cue id may differ from the
    // engine cue id when the API is connected. We update the latest recorded
    // cue we know about.
    const recent = memoryClientRef.current.current().recentCues[0];
    if (!recent) return;
    await memoryClientRef.current.setCueFeedback(recent.id, feedback);
    await memoryClientRef.current.refresh();
    setMemorySummary(memoryClientRef.current.current());
  };

  const explainer = useMemo(() => {
    if (!decision) {
      return "The classifier hears a likely event. The context engine decides whether it matters. The glasses show only the shortest useful action.";
    }
    return decision.cue.reason;
  }, [decision]);

  const lastFeedback = memorySummary.recentCues[0]?.userFeedback ?? null;

  return (
    <div className="hr-app">
      <Header memoryStatus={memoryStatus} />
      <main className="hr-main">
        <aside className="hr-col">
          <SystemPipelineCard />
          <G2RuntimePanel
            controller={g2Controller}
            onSendTestCue={handleSendTestCue}
          />
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
              Output: {g2Controller.snapshot().outputAdapter.kind === "even_g2_hud" ? "Even G2 HUD" : "Simulator HUD (dev fallback)"}
            </span>
          </div>
          <MemoryCommandBox
            onSubmit={handleMemoryCommand}
            status={memoryStatus}
            baseUrl={memoryBaseUrl}
          />
          <SignalTimeline signals={decision?.signals ?? []} />
          <AudioAwarenessPanel
            controller={audioController}
            override={override}
            onOverrideChange={setOverride}
          />
          <DatasetModelCard />
          <EventLog entries={log} />
        </section>

        <aside className="hr-col">
          <ContextPanel context={decision?.context ?? null} />
          <ActionPanel
            cue={decision?.cue ?? null}
            actions={decision?.actions ?? []}
            onFeedback={handleCueFeedback}
            feedbackGiven={lastFeedback}
          />
          <MemoryPanel memory={demoMemory} summary={memorySummary} />
        </aside>
      </main>
      <footer className="hr-footer">
        <div className="hr-privacy">
          <span className="hr-privacy-tag">Glasses-first runtime</span>
          <span className="hr-privacy-tag">Audio processed locally</span>
          <span className="hr-privacy-tag">Raw audio not stored</span>
          <span className="hr-privacy-tag">No medical claims</span>
          <span className="hr-privacy-tag">User controls memory</span>
          <span className="hr-privacy-tag">Trusted-contact escalation opt-in</span>
        </div>
        <div>
          Hearer · G2 mic → brain → G2 HUD. Browser mic and uploaded audio are
          development/test fallbacks. The simulator HUD mirrors what the
          glasses would show.
        </div>
      </footer>
    </div>
  );
}
