# Pose-Correction Engine

A **domain-agnostic, real-time pose-correction engine** that runs entirely in the browser.
Point your webcam at yourself, pick a movement, and get live form feedback. It is *not* a
Muay Thai app — it's an engine that happens to ship with a Muay Thai guard as one of its
configs.

## The one design decision that matters

The engine knows nothing about any specific movement. It only knows how to:

1. detect body pose (MediaPipe `PoseLandmarker`, 33 landmarks),
2. compute joint angles, and
3. evaluate those angles against a **`MovementDefinition`** — which is **pure data**.

Adding a new movement is a data change, not a code change. Every check reduces to: *"the angle
at this joint must fall within `[min, max]`; if it's outside, say this."* A Muay Thai guard
(upper body) and a squat hold (lower body) run through the exact same engine — only the JSON
differs.

```
src/
  engine/        # domain-agnostic: pose detection, angle math, evaluation
    poseDetector.ts   # MediaPipe wrapper
    angles.ts         # pure angle math (unit-tested)
    evaluator.ts      # landmarks + MovementDefinition -> Feedback
    types.ts          # the contracts
    landmarks.ts      # the 33 landmark indices
  movements/     # movements as data — adding one = adding a JSON file
    muaythai-guard.json
    squat-hold.json
  components/    # CameraView, SkeletonOverlay, FeedbackPanel
  App.tsx
```

There is no `if (movement === "guard")` anywhere in `src/engine/`. If there were, the whole
point would be lost.

## How to add a movement

Drop a `*.json` file in `src/movements/`. It's picked up automatically (Vite glob import) and
appears in the dropdown. The shape:

```jsonc
{
  "id": "squat-hold",
  "name": "Squat Hold",
  "joints": [
    // angle at vertex B (points[1]), between B->A and B->C, must be in [targetMin, targetMax]
    { "id": "left_knee", "label": "Left knee", "points": [23, 25, 27], "targetMin": 70, "targetMax": 110 }
  ],
  "cues": [
    { "jointId": "left_knee", "when": "above", "cue": "Go deeper — bend your knees more." }
  ]
}
```

The app also has a **"Load custom movement"** box: paste a `MovementDefinition` and it's
active live, with no rebuild.

> Joint target ranges in the shipped movements are sensible starting defaults. Tune them
> against real footage for your body/camera setup.

## Dynamic movements (v2)

Movements aren't limited to static holds. Add an optional `dynamics` block and the same engine
counts **reps** and reports **speed** — still pure data, still no engine changes. A rep is a
two-threshold *hysteresis* cycle over one tracked joint's angle: it must cross fully into the
"down" phase and back into "up" (or vice-versa) to count, so jitter near a single value can't
double-count.

```jsonc
"dynamics": {
  "trackJointId": "left_knee", // joint whose angle drives the cycle
  "enterDownBelow": 110,        // enter the flexed phase when angle < this
  "enterUpAbove": 160,          // enter the extended phase when angle > this
  "countOn": "up",              // count a rep on entering this phase
  "label": "Squats"
}
```

The shipped `squat-hold` counts squats off the knee; `boxing-jab` counts jabs off the lead
elbow and shows punch speed — same machinery, different joint, defined entirely in JSON. The
math (rep state machine, angular velocity) lives in `src/engine/dynamics.ts` and is unit-tested.

The engine is also **robustness-aware**: landmarks are temporally smoothed
(`src/engine/smoothing.ts`) to cut jitter, and joints whose landmarks drop below a visibility
threshold are marked unavailable — so stepping out of frame shows a neutral "step back" state
instead of a false "wrong".

## Calibration ("calibrate to me")

Default angle ranges are generic. Hit **Calibrate to me** and hold your own correct pose — a
3-2-1 countdown then a ~1s average reads your angles and sets the ranges for *your* body and
camera. For dynamic movements it captures two ends of the rep to set the thresholds too.

Crucially this changes **only the numbers**: calibration is pure math
(`src/engine/calibration.ts`) that emits the same `JointAngleSpec` / `DynamicSpec` shapes the
engine already consumes. A calibrated movement is just a `MovementDefinition` with your values —
the engine and schema don't change. **Reset to defaults** restores the shipped numbers.

## Run it

```bash
npm install
npm run dev        # open the printed URL, grant camera access
npm test           # engine unit tests (angles, evaluator, smoothing, dynamics)
npm run typecheck  # tsc --noEmit
npm run build      # production build
```

**Tech:** Vite + React + TypeScript, `@mediapipe/tasks-vision`, canvas overlay. 100%
client-side — no backend. The pose model is bundled in `public/models/` (with a CDN fallback).
