# Hearer

**Missed-cue prevention for the real world.**

Hearer is a simulator-first proactive accessibility agent. It combines audio,
context, and memory to decide what matters now, then shows one tiny HUD cue
when the action is physical. Built as a hackathon MVP for AGI House × Even
Realities Proactive Agent Build Day, Track 3 — Agents for Good.

This is **not** a captioning app, **not** a reminder app, and **not** a
medical device. The phone is the brain. The Even G2-style HUD is only the
final compressed output.

## Quick start

```bash
npm install
npm run dev
```

Then open <http://localhost:5173>.

To produce a production build:

```bash
npm run build
```

To run the engine tests:

```bash
npm test
```

## What to click first

1. The default scenario **Kitchen timer beeping** is already loaded — the HUD
   should read “Kitchen timer beeping. / Check stove.” with an `URGENT
   PHYSICAL` priority chip.
2. Try the **Auto demo** button under the HUD to walk through the five core
   flows in sequence.
3. Click any scenario in the left panel to fire a single decision and watch
   the right-side context, action router, and bottom event log update.

## Core demo flows

| Scenario             | Expected HUD cue                          | Priority | Action type |
| -------------------- | ----------------------------------------- | -------- | ----------- |
| Kitchen timer        | `Kitchen timer beeping. / Check stove.`   | urgent   | physical    |
| Leaving home         | `Leaving home: / keys + laptop.`          | high     | physical    |
| Doorbell / delivery  | `Doorbell. / Possible delivery.`          | high     | awareness*  |
| Name called          | `Question: / ready to demo?`              | high     | awareness   |
| Promise made         | `Promise saved: / send Jason deck.`       | medium   | digital     |
| Road siren / horn    | `Road alert: / horn nearby.`              | urgent   | physical    |
| Clinic call          | `Mihir called. / Go to Room 204.`         | high     | physical    |
| Pharmacy arrival     | `At pharmacy: / pick up prescription.`    | medium   | physical    |
| After-dinner meds    | `After dinner: / take blue pill.`         | medium   | physical    |

\* Doorbell is routed as **physical** when a delivery is expected, awareness
otherwise.

## Architecture

```
src/
  App.tsx
  main.tsx
  index.css
  components/
    Header, HudSimulator, ScenarioPanel,
    ContextPanel, MemoryPanel, ActionPanel,
    EventLog, SignalTimeline
  engine/
    types.ts          // Signal, Cue, ContextState, DecisionResult, ...
    demoProfile.ts    // Mihir's profile, locations, routines, open tasks
    scenarios.ts      // The 9 scripted demo scenarios
    contextEngine.ts  // Multi-signal fusion → cue + reasoning trail
    priorityEngine.ts // urgent | high | medium | low + explanation
    cueCompressor.ts  // Tight, two-line HUD cues (≤60 chars)
    actionRouter.ts   // Physical (HUD-only) vs digital (phone-handled)
    memoryStore.ts    // localStorage-backed user memory
  utils/
    format.ts
```

The decision flow is:

```
scenario.signals + memory
       → contextEngine.decide()
            → cueCompressor.compressCandidateCue()
            → priorityEngine.scorePriority()
            → actionRouter.routeActions()
       → DecisionResult { cue, actions, context, reasoningSteps }
```

## Known limitations

- Audio, location, motion, and the Even G2 HUD are **all simulated**. There
  is no live microphone, no device integration, and no backend.
- Memory is stored in `localStorage` only (under the key `hearer.memory.v1`).
  The “Reset demo” button clears it.
- Priority cooldown / repetition suppression is intentionally minimal for the
  MVP — each scenario click produces a fresh decision.
- Hearer makes **no medical or emergency reliability claims**. Trusted-contact
  escalation, if shipped, would be opt-in only.
