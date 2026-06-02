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

## Run it

```bash
npm install
npm run dev        # open the printed URL, grant camera access
npm test           # angle-math unit tests
npm run typecheck  # tsc --noEmit
npm run build      # production build
```

**Tech:** Vite + React + TypeScript, `@mediapipe/tasks-vision`, canvas overlay. 100%
client-side — no backend. The pose model is bundled in `public/models/` (with a CDN fallback).
