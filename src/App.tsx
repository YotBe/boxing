import { useEffect, useMemo, useRef, useState } from 'react';
import CalibrationOverlay from './components/CalibrationOverlay';
import CameraView from './components/CameraView';
import FeedbackPanel from './components/FeedbackPanel';
import SkeletonOverlay, {
  type SkeletonOverlayHandle,
} from './components/SkeletonOverlay';
import {
  calibrateDynamics,
  calibrateJoints,
  meanAngles,
} from './engine/calibration';
import { createDynamicTracker } from './engine/dynamics';
import { evaluate } from './engine/evaluator';
import { createPoseDetector, type PoseDetector } from './engine/poseDetector';
import { createSmoother } from './engine/smoothing';
import type {
  DynamicSpec,
  Feedback,
  JointAngleSpec,
  JointResult,
  MovementDefinition,
} from './engine/types';
import { movements as builtInMovements } from './movements';

// How often to push feedback into React state (the skeleton is drawn every
// frame on the canvas; the text panel doesn't need 60fps).
const PANEL_UPDATE_MS = 100;

const REPO_URL = 'https://github.com/YotBe/boxing';

/** A per-movement set of calibrated overrides (applied over the base data). */
type Calibration = { joints?: JointAngleSpec[]; dynamics?: DynamicSpec };

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function isMovementDefinition(value: unknown): value is MovementDefinition {
  if (typeof value !== 'object' || value === null) return false;
  const m = value as Record<string, unknown>;
  return (
    typeof m.id === 'string' &&
    typeof m.name === 'string' &&
    Array.isArray(m.joints) &&
    Array.isArray(m.cues)
  );
}

export default function App() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const overlayRef = useRef<SkeletonOverlayHandle>(null);
  const detectorRef = useRef<PoseDetector | null>(null);

  // Stateful per-session engine helpers (created once).
  const smootherRef = useRef(createSmoother(0.5));
  const trackerRef = useRef(createDynamicTracker());

  const [detectorReady, setDetectorReady] = useState(false);
  const [cameraReady, setCameraReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [customMovement, setCustomMovement] = useState<MovementDefinition | null>(
    null,
  );
  const allMovements = useMemo(
    () => (customMovement ? [...builtInMovements, customMovement] : builtInMovements),
    [customMovement],
  );

  const [activeId, setActiveId] = useState(builtInMovements[0]?.id ?? '');
  const baseMovement =
    allMovements.find((m) => m.id === activeId) ?? allMovements[0];

  // Calibrated overrides, keyed by movement id, applied over the base data so
  // the engine evaluates against the user's own angles/thresholds.
  const [calibrations, setCalibrations] = useState<Record<string, Calibration>>(
    {},
  );
  const calibration = baseMovement ? calibrations[baseMovement.id] : undefined;
  const activeMovement = useMemo<MovementDefinition | undefined>(
    () => (calibration ? { ...baseMovement, ...calibration } : baseMovement),
    [baseMovement, calibration],
  );

  const [feedback, setFeedback] = useState<Feedback | null>(null);

  const [customJson, setCustomJson] = useState('');
  const [customError, setCustomError] = useState<string | null>(null);
  const [showCustom, setShowCustom] = useState(false);

  // Calibration session UI state + capture plumbing.
  const [calibrating, setCalibrating] = useState(false);
  const [calInstruction, setCalInstruction] = useState('');
  const [calCountdown, setCalCountdown] = useState<number | null>(null);
  const [calCapturing, setCalCapturing] = useState(false);
  const capturingRef = useRef(false);
  const sampleBufferRef = useRef<JointResult[][]>([]);
  const cancelCalRef = useRef(false);

  // Keep the active movement available to the rAF loop without restarting it.
  const activeMovementRef = useRef(activeMovement);
  activeMovementRef.current = activeMovement;

  // Reset smoothing + rep state whenever the movement changes, so reps and the
  // smoothed history don't bleed across movements.
  useEffect(() => {
    smootherRef.current.reset();
    trackerRef.current.reset();
    setFeedback(null);
  }, [activeMovement?.id]);

  // Initialize the detector once.
  useEffect(() => {
    let cancelled = false;
    createPoseDetector()
      .then((detector) => {
        if (cancelled) {
          detector.close();
          return;
        }
        detectorRef.current = detector;
        setDetectorReady(true);
      })
      .catch((err) => {
        setError(
          err instanceof Error
            ? `Failed to load the pose model: ${err.message}`
            : 'Failed to load the pose model.',
        );
      });
    return () => {
      cancelled = true;
      detectorRef.current?.close();
      detectorRef.current = null;
    };
  }, []);

  // Drive the realtime loop once camera + detector are both ready.
  useEffect(() => {
    if (!cameraReady || !detectorReady) return;
    const video = videoRef.current;
    const detector = detectorRef.current;
    if (!video || !detector) return;

    overlayRef.current?.syncSize(video.videoWidth, video.videoHeight);

    let raf = 0;
    let lastPanel = 0;
    let lastVideoTime = -1;

    const tick = (timestampMs: number) => {
      raf = requestAnimationFrame(tick);
      if (video.readyState < 2 || video.currentTime === lastVideoTime) return;
      lastVideoTime = video.currentTime;

      let result;
      try {
        result = detector.detect(video, timestampMs);
      } catch {
        // detectForVideo requires monotonically increasing timestamps; skip
        // any frame that violates that rather than tearing down the loop.
        return;
      }

      const movement = activeMovementRef.current;
      if (!movement) return;
      const raw = result.landmarks[0];
      const smoothed = raw ? smootherRef.current.smooth(raw) : undefined;

      let fb: Feedback | null = null;
      if (smoothed) {
        fb = evaluate(smoothed, movement);
        if (movement.dynamics) {
          fb.dynamic = trackerRef.current.update(
            fb.joints,
            timestampMs,
            movement.dynamics,
          );
        }
        // Feed the calibration capture buffer when a capture window is open.
        if (capturingRef.current) sampleBufferRef.current.push(fb.joints);
      }

      overlayRef.current?.draw(smoothed, fb, movement);

      if (timestampMs - lastPanel >= PANEL_UPDATE_MS) {
        lastPanel = timestampMs;
        setFeedback(fb);
      }
    };

    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [cameraReady, detectorReady]);

  function loadCustomMovement() {
    try {
      const parsed: unknown = JSON.parse(customJson);
      if (!isMovementDefinition(parsed)) {
        setCustomError(
          'JSON parsed, but it is missing required fields (id, name, joints[], cues[]).',
        );
        return;
      }
      setCustomMovement(parsed);
      setActiveId(parsed.id);
      setCustomError(null);
    } catch (err) {
      setCustomError(
        err instanceof Error ? `Invalid JSON: ${err.message}` : 'Invalid JSON.',
      );
    }
  }

  async function runCountdown(seconds: number) {
    for (let n = seconds; n >= 1; n--) {
      if (cancelCalRef.current) return;
      setCalCountdown(n);
      await sleep(1000);
    }
    setCalCountdown(null);
  }

  // Open a capture window, average the visible joint angles collected by the
  // rAF loop, and return the per-joint means.
  async function runCapture(ms: number): Promise<Map<string, number>> {
    setCalCountdown(null);
    setCalCapturing(true);
    sampleBufferRef.current = [];
    capturingRef.current = true;
    await sleep(ms);
    capturingRef.current = false;
    setCalCapturing(false);
    return meanAngles(sampleBufferRef.current);
  }

  function finishCalibration() {
    capturingRef.current = false;
    smootherRef.current.reset();
    trackerRef.current.reset();
    setFeedback(null);
    setCalibrating(false);
    setCalCapturing(false);
    setCalCountdown(null);
    setCalInstruction('');
  }

  async function startCalibration() {
    const movement = baseMovement;
    if (!movement) return;
    cancelCalRef.current = false;
    setCalibrating(true);
    try {
      if (!movement.dynamics) {
        setCalInstruction(`Hold a correct ${movement.name}`);
        await runCountdown(3);
        if (cancelCalRef.current) return;
        const means = await runCapture(1000);
        setCalibrations((prev) => ({
          ...prev,
          [movement.id]: { joints: calibrateJoints(movement, means) },
        }));
      } else {
        const dynamics = movement.dynamics;
        setCalInstruction(`Hold the position to check — your best ${movement.name}`);
        await runCountdown(3);
        if (cancelCalRef.current) return;
        const means1 = await runCapture(1000);
        const angleA = means1.get(dynamics.trackJointId);

        setCalInstruction('Now hold the opposite end of the movement');
        await runCountdown(3);
        if (cancelCalRef.current) return;
        const means2 = await runCapture(1000);
        const angleB = means2.get(dynamics.trackJointId);

        const override: Calibration = { joints: calibrateJoints(movement, means1) };
        if (angleA !== undefined && angleB !== undefined) {
          override.dynamics = calibrateDynamics(dynamics, angleA, angleB);
        }
        setCalibrations((prev) => ({ ...prev, [movement.id]: override }));
      }
    } finally {
      finishCalibration();
    }
  }

  function cancelCalibration() {
    cancelCalRef.current = true;
  }

  function resetCalibration() {
    if (!baseMovement) return;
    setCalibrations((prev) => {
      const next = { ...prev };
      delete next[baseMovement.id];
      return next;
    });
    smootherRef.current.reset();
    trackerRef.current.reset();
    setFeedback(null);
  }

  const ready = cameraReady && detectorReady;

  return (
    <div className="mx-auto flex min-h-full max-w-3xl flex-col gap-4 p-4">
      <header className="flex flex-col gap-1">
        <h1 className="text-xl font-bold">Pose-Correction Engine</h1>
        <p className="text-sm text-zinc-400">
          A real-time form coach where every movement — its joints, cues, and rep
          rules — is <span className="text-zinc-200">pure data</span>. Adding one
          is a JSON file, not a code change.{' '}
          <a
            href={REPO_URL}
            target="_blank"
            rel="noreferrer"
            className="text-green-400 underline-offset-2 hover:underline"
          >
            How it works →
          </a>
        </p>
      </header>

      <div className="flex flex-wrap items-center gap-3">
        <label className="text-sm text-zinc-400" htmlFor="movement">
          Movement
        </label>
        <select
          id="movement"
          value={activeMovement?.id ?? ''}
          onChange={(e) => setActiveId(e.target.value)}
          className="rounded-lg bg-zinc-800 px-3 py-2 text-sm"
        >
          {allMovements.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={() => setShowCustom((s) => !s)}
          className="rounded-lg bg-zinc-800 px-3 py-2 text-sm text-zinc-300 hover:bg-zinc-700"
        >
          {showCustom ? 'Hide custom JSON' : 'Load custom movement'}
        </button>
        <button
          type="button"
          onClick={startCalibration}
          disabled={!ready || calibrating}
          className="rounded-lg bg-green-600 px-3 py-2 text-sm font-semibold hover:bg-green-500 disabled:opacity-40"
        >
          Calibrate to me
        </button>
        {calibration && !calibrating && (
          <span className="flex items-center gap-2 text-sm text-green-400">
            Calibrated ✓
            <button
              type="button"
              onClick={resetCalibration}
              className="rounded-lg bg-zinc-800 px-2 py-1 text-xs text-zinc-300 hover:bg-zinc-700"
            >
              Reset to defaults
            </button>
          </span>
        )}
      </div>

      {showCustom && (
        <div className="flex flex-col gap-2 rounded-2xl bg-zinc-900 p-4">
          <p className="text-sm text-zinc-400">
            Paste a MovementDefinition to add a brand-new movement live — no code,
            no reload.
          </p>
          <textarea
            value={customJson}
            onChange={(e) => setCustomJson(e.target.value)}
            placeholder='{ "id": "...", "name": "...", "joints": [...], "cues": [...] }'
            rows={8}
            className="w-full rounded-lg bg-black/50 p-3 font-mono text-xs"
          />
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={loadCustomMovement}
              className="rounded-lg bg-green-600 px-3 py-2 text-sm font-semibold hover:bg-green-500"
            >
              Load &amp; activate
            </button>
            {customError && (
              <span className="text-sm text-red-400">{customError}</span>
            )}
          </div>
        </div>
      )}

      <div className="relative aspect-video w-full overflow-hidden rounded-2xl bg-zinc-900">
        <CameraView
          videoRef={videoRef}
          onReady={() => setCameraReady(true)}
          onError={setError}
        />
        <SkeletonOverlay ref={overlayRef} />
        <CalibrationOverlay
          active={calibrating}
          instruction={calInstruction}
          countdown={calCountdown}
          capturing={calCapturing}
          onCancel={cancelCalibration}
        />
        {(!cameraReady || !detectorReady) && !error && (
          <div className="absolute inset-0 flex items-center justify-center text-zinc-400">
            {!detectorReady ? 'Loading pose model…' : 'Starting camera…'}
          </div>
        )}
        {error && (
          <div className="absolute inset-0 flex items-center justify-center p-6 text-center text-red-400">
            {error}
          </div>
        )}
      </div>

      {activeMovement && (
        <FeedbackPanel
          feedback={feedback}
          movement={activeMovement}
          onResetReps={() => {
            trackerRef.current.reset();
            setFeedback(null);
          }}
        />
      )}
    </div>
  );
}
