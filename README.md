# Nak Muay Coach

A **real-time AI Muay Thai trainer** that runs entirely in the browser. Point your webcam at
yourself and train:

- **Practice mode** — hold the guard or drill a single strike (jabs, crosses, hooks, elbows,
  knees, teeps, roundhouse kicks) with live form feedback, rep counting, and strike-speed
  tracking.
- **Combo Coach (pad work)** — the voice coach calls combinations ("Jab! Cross! Knee!") and
  detects each strike as you land it, with pad-hit sounds and on-screen shockwaves.
- **Round timer** — configurable rounds/rest with boxing bells and spoken round announcements.
- **Session history** — completed sets (reps, top speed, hold time, combos) are logged to
  `localStorage` on your device.

It **calibrates to you** in one tap — because the "correct" joint angles depend on your body
proportions and your camera's height/angle, fixed thresholds mis-fire. Strike a good guard,
press **Calibrate**, and the accepted ranges are set from *your* stance.

**Private by design:** all pose estimation runs on-device. The camera feed never leaves the
browser — there is no backend and nothing is uploaded.

## How it works

Under the hood is a small, domain-agnostic engine:

1. detect body pose (MediaPipe `PoseLandmarker`, 33 landmarks),
2. compute joint angles **in 3D** from MediaPipe's metric *world* landmarks, and
3. evaluate those angles against a **`MovementDefinition`** — which is **pure data**.

> Angles are measured in 3D on purpose. Facing the camera, your forearms angle toward the lens,
> so a 2D image-plane angle is foreshortened and jumpy — exactly the kind of noise that makes
> feedback feel wrong. The depth-aware world landmarks give the true anatomical angle; the 2D
> image landmarks are still used to draw the skeleton and to judge visibility.

The guard is defined as data, not code (`src/movements/muaythai-guard.json`). Each check is
just *"the angle at this joint must fall within `[min, max]`; if it's outside, say this cue."*

```
src/
  engine/
    poseDetector.ts   # MediaPipe wrapper
    angles.ts         # pure angle math (unit-tested)
    evaluator.ts      # landmarks + MovementDefinition -> Feedback
    smoothing.ts      # temporal landmark smoothing (cuts jitter)
    calibration.ts    # observe your pose -> personal angle ranges (unit-tested)
    types.ts          # the contracts
    landmarks.ts      # the 33 landmark indices
  movements/
    muaythai-guard.json   # the guard, as data
  components/         # CameraView, SkeletonOverlay, FeedbackPanel
  App.tsx
```

### The guard, modelled honestly

A guard is fundamentally about **where your hands are**, so the checks use the wrist, not just
the elbow:

| Check | Angle (vertex) | In range means |
| --- | --- | --- |
| Hand height (L/R) | hip → **shoulder** → wrist | the hand is up near your face |
| Arm bent (L/R)    | shoulder → **elbow** → wrist | the arm is folded, glove tight |

The hand-height angle grows as you raise your glove; the elbow angle grows as you straighten
your arm. So "hands down" and "arm extended" each trigger the *correct* cue — fixing an earlier
version whose "arm height" check looked at the elbow (not the hand) and told you to raise a hand
that was already up.

### Calibration

`createCalibrator` watches the angle each tracked joint actually produces while you hold a
correct guard for ~2 seconds, then sets each joint's accepted range to your observed envelope
padded by a margin (`src/engine/calibration.ts`, unit-tested). It's saved to `localStorage`, so
it persists across sessions; **Reset to defaults** clears it. The engine stays movement-agnostic
— calibration only rewrites the numbers, never the semantics.

The landmarks are also temporally **smoothed** to cut jitter, and joints whose landmarks drop
below a visibility threshold are marked unavailable — so stepping out of frame shows a neutral
"looking for you" state instead of a false "wrong".

## Running it on a device

The app is built to come up and stay up on hardware you do not control and a
network you cannot trust.

**Nothing is fetched at runtime.** The pose models and MediaPipe's WASM runtime
are served from the app's own origin, and a service worker (`public/sw.js`)
keeps them, plus the app bundle, in the Cache API. After one successful load the
page cold-starts and runs with the network switched off entirely. There are no
webfonts and no CDN preconnects, for the same reason. The **Offline ready**
badge under the live view turns green once every byte needed to run is stored.

**Inference telemetry is always on screen** — rolling frame rate, per-frame model
latency (the `detectForVideo` call alone, measured separately from smoothing,
evaluation and canvas drawing), the model variant and its input tensor, the
source resolution, and mean keypoint confidence for the current frame.

**The trade-offs are switchable while it runs.** Model variant (Lite ↔ Full),
compute delegate (GPU ↔ CPU), the keypoint visibility floor and the model's own
detection floor are all live controls, so the cost of accuracy is something you
watch on the readout rather than something you take on faith.

**The frame source is swappable too.** Front camera, rear camera, or a recorded
video file — the engine sits behind an `HTMLVideoElement` and cannot tell the
difference, which makes a clip a complete stand-in when a room's lighting or a
permission prompt lets the camera down. Camera failures name the specific cause
and the way out rather than leaving a blank frame.

## Run it

```bash
npm install
npm run dev        # open the printed URL, grant camera access
npm test           # unit tests (angles, evaluator, smoothing, calibration, guard geometry)
npm run typecheck  # tsc --noEmit
npm run build      # production build
```

**Tech:** Vite + React + TypeScript, `@mediapipe/tasks-vision`, canvas overlay. 100%
client-side — no backend. The pose model is bundled in `public/models/`, and the MediaPipe
WASM runtime is copied from `node_modules` into the build (see `vite.config.ts`), so the
deployed app has no runtime CDN dependency — both fall back to hosted copies if missing.
