# Hearer

**Glasses-first proactive accessibility. Missed-cue prevention for the real world.**

Hearer turns glasses audio and context into one tiny physical-world cue.
The classifier hears a likely event. The world-state engine decides whether
it matters for *this* user in *this* context. The Even G2 HUD shows only the
shortest useful action.

> Hearer is **not** a captioning app. **Not** a normal reminder app. **Not**
> a medical device. **Not** a phone-microphone product. **Not** a web
> dashboard. The dashboard is a development / judging fallback. The
> product is glasses.

## Target runtime

```
Even G2 microphone hears the environment
       ↓
Even Hub / phone runtime receives glasses audio
       ↓
Hearer brain classifies and updates world state
       ↓
Hearer combines sound + time + routine + memory + context
       ↓
Hearer decides whether this matters right now
       ↓
Hearer sends one tiny cue to the G2 HUD
```

| Layer | Production | Development fallback |
| --- | --- | --- |
| **Audio input** | Even G2 microphone via Even Hub bridge | Browser mic / tab audio / file upload / generated fixtures |
| **Compute** | Even Hub / phone runtime | The same TypeScript code, in the dev browser |
| **Memory** | Hearer Memory API (SQLite) at `localhost:8788` | `localStorage` fallback |
| **Display** | Even G2 HUD | In-app simulator HUD (mirrors the same payload) |

The simulator HUD and the G2 HUD adapter receive **the same payload**:
`{ text, priority, actionType, ttlMs }`. The dashboard is for developers
and judges; the user-facing surface is the glasses.

## Repo layout

```
src/
  App.tsx
  main.tsx
  index.css

  components/
    Header / HudSimulator / ScenarioPanel
    ContextPanel / MemoryPanel / ActionPanel
    EventLog / SignalTimeline
    SystemPipelineCard / DatasetModelCard
    audio/   AudioAwarenessPanel + level meter / dropzone / detection log
    glasses/ G2RuntimePanel
    memory/  MemoryCommandBox

  engine/
    types.ts
    contextEngine.ts          # scripted scenario decision
    liveAudioDecision.ts      # live audio decision (uses worldStateEngine)
    worldStateEngine.ts       # glasses-first inference: matters-now or not
    cueCompressor.ts          # tight HUD cues (≤60 chars), no transcript dumps
    priorityEngine.ts
    actionRouter.ts
    scenarios.ts / demoProfile.ts

  audio/
    audioTypes.ts
    audioSource.ts            # mic / tab audio / decodeAudioData (fallback)
    audioFeatureExtractor.ts
    audioClassifier.ts        # rule-based today
    audioSignalMapper.ts
    audioController.ts        # fallback dev pipeline orchestrator
    audioFixtures.ts          # deterministic test inputs
    hearerLabelMap.generated.ts  # generated from ml/hearer_labels.yaml
    modelAdapters/
      audioModelAdapter.ts    # Rule-based / LocalTrained stub / Pretrained stub

  glasses/                    # GLASSES-FIRST RUNTIME
    g2RuntimeTypes.ts         # WorldAudioInputAdapter, HudOutputAdapter
    g2RuntimeController.ts    # picks G2 path; falls back to simulator
    evenHub/                  # Even G2 microphone + HUD via Even Hub SDK
      evenHubBridgeClient.ts
      evenHubAudioInputAdapter.ts
      evenHubHudOutputAdapter.ts
      evenHubPcm.ts
      evenHubDetection.ts
    simulator/                # Dev/judge fallback adapters
      simulatorAudioInputAdapter.ts
      simulatorHudOutputAdapter.ts

  memory/
    memoryClient.ts           # interface
    apiMemoryClient.ts        # talks to the Memory API
    localMemoryClient.ts      # localStorage fallback
    createMemoryClient.ts     # probes API; falls back if unreachable
    memoryToDemoMemory.ts     # bridges persisted summary into the engine

  api/
    hearerApi.ts              # frontend client for the Memory API

server/                       # Hearer Memory API (Fastify + better-sqlite3)
  src/server.ts / db.ts / services/...
  data/                       # SQLite/JSON store (gitignored)

shared/
  types.ts                    # types shared between server and frontend
  memoryExtractorCore.ts      # rule-based extractor (server + browser)

ml/                           # TRAINING/EVAL ONLY — never the runtime
  hearer_labels.yaml          # Hearer label taxonomy (V1)
  scripts/                    # prepare_esc50/urbansound8k/fsd50k, build, validate, summarize
  training/                   # baseline trainer + eval + export stub
  datasets/  manifests/  notebooks/   (gitignored runtime data)
```

## How to run

```bash
npm install            # installs frontend, server, optional better-sqlite3
npm run dev            # frontend only — http://localhost:5173
npm run server         # Memory API     — http://localhost:8788
npm run dev:all        # both, in one terminal
npm run build
npm test
```

The frontend probes the Memory API on boot. If the server is up, you'll see
**Memory: API connected** in the header. If not, **Memory: local fallback**
(localStorage). Either path works end-to-end.

## How to test

### 1. Simulator / dev mode (no Even Hub bridge)

This is the default when you load `http://localhost:5173` in a normal
browser. The **G2 runtime** panel will say "Even Hub bridge not detected.
Hearer is running in simulator/dev mode." That's correct and honest.

- Click **Auto demo** under the HUD to walk through the five core scripted
  flows (Kitchen timer, Leaving home, Doorbell, Name called, Promise saved).
- Or click any scenario in the left panel.
- Open the **Audio fallback (dev)** panel and use the **Beep ×5** fixture or
  start the browser mic.

Expected HUD for **Beep ×5** with the default Kitchen + cooking + cooking
routine context:

```
Kitchen timer beeping.
Check stove.
```

(URGENT · PHYSICAL)

### 2. G2 runtime detection

When loaded inside the Even Hub runtime (or a browser environment that
exposes a global `window.evenAppBridge` matching the SDK shape), the **G2
runtime** panel switches to "Even G2 runtime detected." and:

- the **Input target** primary chip becomes Even G2 microphone,
- the **Output target** primary chip becomes Even G2 HUD,
- pressing **Start G2 listening** starts subscribing to bridge audio
  events and routing the resulting cues to the G2 HUD adapter.

Hearer never fakes hardware success — if `audioControl(true)` or the SDK
import fails, the controller stays in fallback and the panel surfaces the
reason.

### 3. Generated beep + cooking memory (the real proof)

This is the killer demo:

1. In **Teach Hearer**, click the example *"Usually after dinner I cook, so
   if you hear beeping remind me to check the stove."* (or type your own
   variant). Press **Save**.
2. Confirm the **Memory & routines** panel now shows a saved routine like
   *"Pick up at pharmacy"* / *"Bring … for school"* depending on which
   example you picked.
3. Open **Audio fallback (dev)** → run the **Beep ×5** fixture (or start the
   browser mic and play a beep).
4. The HUD should show:

   ```
   Kitchen timer beeping.
   Check stove.
   ```

   The world-state engine matched the saved cooking routine; that's why the
   priority is URGENT and the cue points at the stove.

5. Now reset the live context to **location: unknown / activity: unknown**
   in the same panel and re-run the fixture. The HUD softens to:

   ```
   Timer beeping.
   Check nearby.
   ```

   Same audio classifier output → different cue, because Hearer is honest
   about context.

### 4. Speech-like never hallucinates

Run the **Speech-like** fixture with **event mode** on. The HUD shows
`Speech nearby. / Stay aware.` — never a transcript, never a guessed
sentence.

### 5. ESC-50 / UrbanSound8K manifest scripts (offline only)

```bash
python -m venv .venv
source .venv/bin/activate
pip install -r ml/requirements.txt

# Place datasets locally first (NOT auto-downloaded):
#   ml/datasets/esc50          (clone https://github.com/karoldvl/ESC-50)
#   ml/datasets/urbansound8k   (download urbansounddataset.weebly.com)
#   ml/datasets/fsd50k         (download zenodo.org/record/4060432)

python ml/scripts/prepare_esc50.py --dataset-root ml/datasets/esc50
python ml/scripts/prepare_urbansound8k.py --dataset-root ml/datasets/urbansound8k
python ml/scripts/build_hearer_manifest.py --sources esc50 urbansound8k
python ml/scripts/summarize_manifest.py
python ml/scripts/validate_manifest.py
python ml/scripts/export_label_map.py   # regenerates src/audio/hearerLabelMap.generated.ts

# Optional baseline trainer (CPU-friendly):
python ml/training/train_audio_baseline.py
```

If a dataset is missing, the prepare scripts say so and exit cleanly.

### 6. Future Even Hub simulator / hardware

The boundary is in place. Plug in:

- An Even Hub SDK build that exposes `window.evenAppBridge` with
  `audioControl()` + `onEvenHubEvent()` → the G2 input adapter starts
  subscribing immediately.
- An SDK that exposes `showText` / `updateText` / `ensureCuePage+setCuePageText`
  → the G2 HUD adapter renders the cue verbatim.
- A native bridge / Capacitor integration → swap a single adapter file
  without touching the brain.

## Demo flows

| Scenario | HUD cue | Priority | Action |
| --- | --- | --- | --- |
| Kitchen timer | `Kitchen timer beeping. / Check stove.` | urgent | physical |
| Leaving home | `Leaving home: / keys + laptop.` (`bring laptop` if a routine is saved) | high | physical |
| Doorbell / delivery | `Doorbell. / Possible delivery.` | high | physical |
| Name called | `Question: / ready to demo?` | high | awareness |
| Promise made | `Promise saved: / send Jason deck.` | medium | digital |
| Road siren / horn | `Road alert: / siren on left.` (direction shown when supplied) | urgent | physical |
| Clinic call | `Mihir called. / Go to Room 204.` | high | physical |
| Pharmacy arrival | `At pharmacy: / pick up prescription.` | medium | physical |
| After-dinner meds | `After dinner: / take blue pill.` | medium | physical |

Live audio adds:

- `Timer beeping. / Check nearby.` (unknown context)
- `Loud alert nearby. / Look around.` (siren without street)
- `Knock detected. / Check door.` (knock at home)
- `Speech nearby. / Stay aware.` — **no transcript inferred**

## Memory API

`server/src/server.ts` ships a Fastify-based Memory API on port 8788.
Storage is **SQLite** (`server/data/hearer.sqlite`) when `better-sqlite3`
is installed; otherwise a **JSON file** (`server/data/hearer.memory.json`).

Endpoints:

- `GET  /api/health` — `{ ok, service, storage }`
- `GET  /api/memory/summary`
- `POST /api/memory/extract` `{ text }` — rule-based extraction + persist
- `POST /api/memory/person|item|location`
- `POST /api/routines`
- `POST /api/commitments`
- `POST /api/events`
- `POST /api/audio-detections`
- `POST /api/cues` + `POST /api/cue-feedback` `{ cueId, feedback }`
- `POST /api/memory/reset`

The frontend client falls back to localStorage automatically when the API
is unreachable. Same shape on both paths.

## Safety, privacy, ethics

- **Hearer suggests checks. It does not claim certainty about physical
  hazards without sensors.** "Check stove" — never "Stove is on."
- Audio is processed in-browser. Raw audio is held only as a rolling
  Float32 window and discarded after features are extracted. **Nothing is
  uploaded.**
- Memory is user-controlled. The Memory API stores it locally; the
  frontend can clear it at any time via **Reset demo**.
- No medical or emergency reliability claims. Trusted-contact escalation,
  if shipped, would be opt-in only.
- Direction-aware cues ("horn on left") are only shown when a direction is
  explicitly supplied. True 360 awareness needs a mic array or
  device-specific spatial data — not a single mono mic.

## Even G2 / Even Hub status

- **Adapter-ready.** The Even G2 mic + HUD adapters are written against a
  small, version-tolerant probe of `@evenrealities/even_hub_sdk` and a
  global bridge fallback. They use `audioControl()` + `onEvenHubEvent()` for
  audio, and the first available render API (`updateText` / `showText` /
  `ensureCuePage+setCuePageText`) for the HUD.
- **No real BLE / firmware code in this build.** When the SDK isn't
  present, the adapters honestly report `unavailable` and the controller
  switches to the simulator.
- The HUD payload that would be sent to the glasses is exactly:
  `{ text, priority, actionType, ttlMs }`. Nothing else.
