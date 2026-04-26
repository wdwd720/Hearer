# Hearer

**Missed-cue prevention for the real world.**

Hearer turns sounds and context into one physical-world cue. The classifier
hears a likely event, the context engine decides whether it matters, and the
HUD only shows the shortest useful action.

This is a hackathon MVP for AGI House × Even Realities Proactive Agent Build
Day, Track 3 — Agents for Good. It is **not** a captioning app, **not** a
reminder app, and **not** a medical device. The phone is the brain. The Even
G2-style HUD is only the final compressed output.

## Quick start

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # tsc -b && vite build
npm test         # vitest run
```

## Architecture (simulator-first)

```
src/
  App.tsx
  main.tsx
  index.css

  components/
    Header, HudSimulator, ScenarioPanel,
    ContextPanel, MemoryPanel, ActionPanel,
    EventLog, SignalTimeline
    audio/
      AudioAwarenessPanel, AudioSourceControls (inline),
      AudioClassifierStatus, AudioDetectionLog,
      AudioLevelMeter, AudioFileDropzone

  engine/
    types.ts            // Signal, Cue, ContextState, DecisionResult, ...
    demoProfile.ts      // Mihir's profile, locations, routines, open tasks
    scenarios.ts        // Nine scripted demo scenarios
    contextEngine.ts    // Multi-signal fusion → cue + reasoning trail
    liveAudioDecision.ts// Same engine, but for one live audio signal +
                        //    a partial context override
    priorityEngine.ts   // urgent/high/medium/low + explanation
    cueCompressor.ts    // Tight two-line HUD cues (≤60 chars)
    actionRouter.ts     // Physical (HUD-only) vs digital (phone-handled)
    memoryStore.ts      // localStorage-backed user memory

  audio/                // Audio Awareness V1 — live audio pipeline
    audioTypes.ts       // AudioFrame, AudioFeatures, AudioClassification, ...
    audioSource.ts      // mic, display/tab audio, file upload (decodeAudioData)
    audioFeatureExtractor.ts  // RMS, ZCR, bands, dominant freq, tonality, ...
    audioClassifier.ts  // Pluggable classifier interface
                        //    + RuleBasedAudioClassifier (always available)
                        //    + PretrainedAudioClassifierStub (YAMNet hook)
    audioSignalMapper.ts// Classification → Hearer AudioSignal w/ thresholds
    audioController.ts  // Orchestrator: cooldown, debounce, route to brain
    audioFixtures.ts    // Synthetic beeps/sirens/knocks for deterministic demo

  glasses/              // HUD output adapter boundary
    hudOutputAdapter.ts // interface
    simulatorHudAdapter.ts  // active in this build
    evenG2AdapterStub.ts    // wire-format only, no SDK/BLE in this build

  utils/format.ts
```

The decision flow is identical for scripted scenarios and live audio:

```
signals + memory + (live override)
   → contextEngine.decide()  /  liveAudioDecision.decideFromLiveAudio()
        → cueCompressor.compressCandidateCue()
        → priorityEngine.scorePriority()
        → actionRouter.routeActions()
   → DecisionResult { cue, actions, context, reasoningSteps }
   → HudOutputAdapter.sendCue(cue)
```

## How to test scripted scenarios

The default scenario **Kitchen timer beeping** is preloaded. Click any
scenario button on the left panel, or click **Auto demo** to walk through the
five core flows in sequence.

| Scenario             | HUD cue                                  | Priority | Action type |
| -------------------- | ---------------------------------------- | -------- | ----------- |
| Kitchen timer        | `Kitchen timer beeping. / Check stove.`  | urgent   | physical    |
| Leaving home         | `Leaving home: / keys + laptop.`         | high     | physical    |
| Doorbell / delivery  | `Doorbell. / Possible delivery.`         | high     | physical    |
| Name called          | `Question: / ready to demo?`             | high     | awareness   |
| Promise made         | `Promise saved: / send Jason deck.`      | medium   | digital     |
| Road siren / horn    | `Road alert: / horn nearby.`             | urgent   | physical    |
| Clinic call          | `Mihir called. / Go to Room 204.`        | high     | physical    |
| Pharmacy arrival     | `At pharmacy: / pick up prescription.`   | medium   | physical    |
| After-dinner meds    | `After dinner: / take blue pill.`        | medium   | physical    |

## How to test live audio (Audio Awareness V1)

The **Live audio awareness** panel sits below the HUD. It exposes:

- **Source controls** — Start microphone, Share tab/system audio, Stop, drag-drop or click to upload an audio file.
- **Test fixtures** — one-click synthetic beep/siren/horn/knock/doorbell/applause/speech-like sounds. These run through the same decode → feature → classifier path as a real upload.
- **Audio level meter** — animated bar driven by RMS while listening.
- **Active classifier chip** — currently `Rule-based local classifier` (the pretrained YAMNet path is stubbed).
- **Live context** — location and activity dropdowns plus toggles for cooking routine / delivery expected / event mode. Default is `kitchen + cooking + cooking routine on` so the timer fixture is the strongest first demo.
- **Auto-route confident detections** — toggle. When off, use the **Send detection through Hearer brain** button.
- **Last detection + detection log** — labels, confidence, explanation, route note.

### Expected HUD cues (live audio)

| What you do | Live context | HUD cue |
| --- | --- | --- |
| Click **Beep ×5** fixture | kitchen + cooking | `Kitchen timer beeping. / Check stove.` (urgent / physical) |
| Click **Beep ×5** fixture | unknown | `Timer beeping. / Check nearby.` (high / physical) |
| Click **Siren** fixture | street + walking | `Road alert: / siren nearby.` (urgent / physical) |
| Click **Siren** fixture | unknown | `Loud alert nearby. / Look around.` (high / physical) |
| Click **Doorbell** fixture | home | `Doorbell. / Possible delivery.` (high) |
| Click **Knock** fixture | home | `Knock detected. / Check door.` (high / physical) |
| Click **Speech-like** fixture | event / event mode on | `Speech nearby. / Stay aware.` (low / awareness) — **no transcript inferred** |

### Real microphone

1. Click **Start microphone**, accept the browser permission prompt.
2. Hold a phone next to the laptop and play a beep/timer sound on it. Or open YouTube tab → play a video on “smoke alarm beeping”.
3. Watch the level meter, the **Last detection** card, and the HUD update.

If the cue does not fire, open the **Detection log** — every analysis frame is logged with confidence and a route note. Routing thresholds: `timer_beep ≥ 0.55`, `siren/horn/alarm ≥ 0.55`, `doorbell/knock ≥ 0.60`, `speech/applause/laughter ≥ 0.65`. Cooldown per label is 1.2 s for urgent sounds and 3 s otherwise.

### Tab / system audio

1. Click **Share tab/system audio**. The browser shows a picker.
2. Pick the tab and **enable “Share tab audio”** in the dialog before clicking Share.
3. Hearer ignores the video track and analyses only the audio.

If the picker does not offer audio (some browsers / OSes do not), Hearer surfaces a clean message and falls back to mic / file / fixtures.

### Audio file upload

Drop a `.wav`, `.mp3`, `.m4a`, or `.ogg` into the dropzone. Hearer decodes via Web Audio, slices it into windows, runs the same classifier, and emits detections.

## Browser notes

- **Microphone**: works in any modern browser with permission. We disable echo cancellation, AGC, and noise suppression to give the classifier a less-mangled signal.
- **Display / tab audio**: Chrome and Edge support tab-audio sharing reliably. Firefox/Safari support is partial — when there is no audio track, Hearer says so explicitly.
- **File upload**: any format the browser’s `decodeAudioData` accepts.

## Privacy and safety

- Audio is processed entirely in-browser. **No server, no upload, no recording.** Raw audio is held only as a rolling Float32 window and is discarded as soon as features are extracted.
- Memory persists in `localStorage` only (`hearer.memory.v1`); the **Reset demo** button clears it and stops any active audio capture.
- Hearer does **not** make medical or emergency reliability claims. Trusted-contact escalation, if shipped, would be opt-in only.
- The classifier is a small rule-based heuristic. It is good enough for the simulator-first demo. It will sometimes mislabel; the UI surfaces confidence so judges can see it is honest about that.

## Glasses integration

The current output target is the **Simulator HUD**. The `glasses/` folder
exposes a clean `HudOutputAdapter` interface and an `EvenG2AdapterStub` whose
`sendCue()` only logs the wire-format payload it would send. There is no
BLE, no SDK, and no real device integration in this build. The boundary is
in place so that an Even Hub / Even G2 SDK integration is a one-file change
later.

The glasses payload is intentionally minimal:

```ts
{ text: cue.text, priority, actionType, ttlMs }
```

The glasses do not need scenario, memory, or reasoning trail.

## Known limitations

- The rule-based classifier handles timer beep / alarm / siren / horn / doorbell / knock / speech / applause / laughter at varying reliability. It will not recognise arbitrary YAMNet-style classes.
- The pretrained classifier hook (`PretrainedAudioClassifierStub`) is intentionally not wired to TF.js / a remote model — that would harm offline reliability and slow the demo. The boundary is ready for it.
- The Even G2 adapter is a stub. No BLE.
- Repetition suppression is per-label cooldown only; it does not yet learn user preferences.
