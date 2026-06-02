# Muay Thai Guard Coach

A **real-time Muay Thai guard coach** that runs entirely in the browser. Point your webcam at
yourself, hold your guard, and get live form feedback: it checks that **both hands stay up by
your face** and **both arms stay bent**, and tells you exactly what to fix.

It **calibrates to you** in one tap — because the "correct" joint angles depend on your body
proportions and your camera's height/angle, fixed thresholds mis-fire. Strike a good guard,
press **Calibrate**, and the accepted ranges are set from *your* stance.

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

## Run it

```bash
npm install
npm run dev        # open the printed URL, grant camera access
npm test           # unit tests (angles, evaluator, smoothing, calibration, guard geometry)
npm run typecheck  # tsc --noEmit
npm run build      # production build
```

**Tech:** Vite + React + TypeScript, `@mediapipe/tasks-vision`, canvas overlay. 100%
client-side — no backend. The pose model is bundled in `public/models/` (with a CDN fallback).
