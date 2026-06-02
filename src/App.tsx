import { useEffect, useMemo, useRef, useState } from 'react';
import CameraView from './components/CameraView';
import FeedbackPanel from './components/FeedbackPanel';
import SkeletonOverlay, {
  type SkeletonOverlayHandle,
} from './components/SkeletonOverlay';
import {
  applyCalibration,
  clearCalibration,
  createCalibrator,
  loadCalibration,
  saveCalibration,
  type Calibrator,
  type CalibrationMap,
} from './engine/calibration';
import { evaluate } from './engine/evaluator';
import { createPoseDetector, type PoseDetector } from './engine/poseDetector';
import { createSmoother } from './engine/smoothing';
import type { Feedback } from './engine/types';
import { movements } from './movements';

// How often to push feedback into React state (the skeleton is drawn every
// frame on the canvas; the text panel doesn't need 60fps).
const PANEL_UPDATE_MS = 100;

const REPO_URL = 'https://github.com/YotBe/pose-coach';

// The one movement this app coaches. The engine stays data-driven — the guard
// is still defined as JSON in src/movements — we just ship a focused product.
const GUARD =
  movements.find((m) => m.id === 'muaythai-guard') ?? movements[0];

// Calibration capture timing.
const COUNTDOWN_MS = 3000;
const CAPTURE_MS = 2000;
const CALIB_MARGIN_DEG = 15; // padding added around your observed guard angles
const MIN_CALIB_SAMPLES = 10; // full-visibility frames needed for a valid capture

type CalibUi =
  | { phase: 'idle' }
  | { phase: 'countdown'; secondsLeft: number }
  | { phase: 'capturing' }
  | { phase: 'done' }
  | { phase: 'error'; message: string };

export default function App() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const overlayRef = useRef<SkeletonOverlayHandle>(null);
  const detectorRef = useRef<PoseDetector | null>(null);
  // Separate smoothers: image landmarks drive the on-screen skeleton; world
  // (3D) landmarks drive the angle evaluation.
  const imgSmootherRef = useRef(createSmoother(0.5));
  const worldSmootherRef = useRef(createSmoother(0.5));

  const [detectorReady, setDetectorReady] = useState(false);
  const [cameraReady, setCameraReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<Feedback | null>(null);

  // Saved per-body/per-camera calibration (persisted in localStorage).
  const [calibration, setCalibration] = useState<CalibrationMap | null>(() =>
    loadCalibration(GUARD.id),
  );
  const [calibUi, setCalibUi] = useState<CalibUi>({ phase: 'idle' });

  // The guard with its angle ranges overridden by calibration, if any.
  const movement = useMemo(
    () => (calibration ? applyCalibration(GUARD, calibration) : GUARD),
    [calibration],
  );

  // Make the current movement available to the rAF loop without restarting it.
  const movementRef = useRef(movement);
  movementRef.current = movement;

  // Calibration capture state, read inside the rAF tick.
  const calibratorRef = useRef<Calibrator | null>(null);
  const capturingRef = useRef(false);
  const timersRef = useRef<number[]>([]);

  function clearTimers() {
    timersRef.current.forEach((id) => window.clearTimeout(id));
    timersRef.current.forEach((id) => window.clearInterval(id));
    timersRef.current = [];
  }

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
      clearTimers();
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

      const current = movementRef.current;
      const rawImg = result.landmarks[0];
      const rawWorld = result.worldLandmarks[0];
      const img = rawImg ? imgSmootherRef.current.smooth(rawImg) : undefined;
      const world = rawWorld ? worldSmootherRef.current.smooth(rawWorld) : undefined;

      // Evaluate on the depth-aware world landmarks (correct angles for a
      // camera-facing guard), but take visibility from the image landmarks,
      // whose visibility scores are the reliable in/out-of-frame signal.
      let fb: Feedback | null = null;
      if (world) {
        const forEval = img
          ? world.map((w, i) => ({
              ...w,
              visibility: img[i]?.visibility ?? w.visibility,
            }))
          : world;
        fb = evaluate(forEval, current);
      }

      // Feed frames into a calibration capture in progress (full frame rate).
      if (capturingRef.current && fb) calibratorRef.current?.add(fb.joints);

      overlayRef.current?.draw(img, fb, current);

      if (timestampMs - lastPanel >= PANEL_UPDATE_MS) {
        lastPanel = timestampMs;
        setFeedback(fb);
      }
    };

    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [cameraReady, detectorReady]);

  function finishCalibration() {
    capturingRef.current = false;
    const c = calibratorRef.current;
    if (!c) {
      setCalibUi({ phase: 'idle' });
      return;
    }
    const cal = c.finish(CALIB_MARGIN_DEG);
    const sawEveryJoint = Object.keys(cal).length === GUARD.joints.length;
    if (c.samples() < MIN_CALIB_SAMPLES || !sawEveryJoint) {
      setCalibUi({
        phase: 'error',
        message:
          'Couldn’t see your guard clearly. Get your head, shoulders, and both hands in frame, then try again.',
      });
      return;
    }
    saveCalibration(GUARD.id, cal);
    setCalibration(cal);
    setCalibUi({ phase: 'done' });
  }

  function startCalibration() {
    clearTimers();
    calibratorRef.current = createCalibrator(GUARD.joints.map((j) => j.id));
    capturingRef.current = false;
    setCalibUi({ phase: 'countdown', secondsLeft: 3 });

    let secondsLeft = 3;
    const iv = window.setInterval(() => {
      secondsLeft -= 1;
      if (secondsLeft > 0) setCalibUi({ phase: 'countdown', secondsLeft });
    }, 1000);
    timersRef.current.push(iv);

    const toCapture = window.setTimeout(() => {
      window.clearInterval(iv);
      calibratorRef.current?.reset();
      capturingRef.current = true;
      setCalibUi({ phase: 'capturing' });
      const toFinish = window.setTimeout(finishCalibration, CAPTURE_MS);
      timersRef.current.push(toFinish);
    }, COUNTDOWN_MS);
    timersRef.current.push(toCapture);
  }

  function resetCalibration() {
    clearTimers();
    capturingRef.current = false;
    clearCalibration(GUARD.id);
    setCalibration(null);
    setCalibUi({ phase: 'idle' });
  }

  const calibrating =
    calibUi.phase === 'countdown' || calibUi.phase === 'capturing';

  const overlayMessage =
    calibUi.phase === 'countdown'
      ? `Hold your best guard… ${calibUi.secondsLeft}`
      : calibUi.phase === 'capturing'
        ? 'Capturing your guard — hold still…'
        : null;

  return (
    <div className="mx-auto flex min-h-full max-w-3xl flex-col gap-4 p-4">
      <header className="flex flex-col gap-1">
        <h1 className="text-xl font-bold">Muay Thai Guard Coach</h1>
        <p className="text-sm text-zinc-400">
          Real-time feedback on your guard: it checks that both hands stay up by
          your face and your arms stay bent. Tunes to your body and camera in one
          tap.{' '}
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

      {/* Calibration */}
      <div className="flex flex-wrap items-center gap-3 rounded-2xl bg-zinc-900 p-4">
        <button
          type="button"
          onClick={startCalibration}
          disabled={!cameraReady || !detectorReady || calibrating}
          className="rounded-lg bg-green-600 px-3 py-2 text-sm font-semibold hover:bg-green-500 disabled:opacity-40"
        >
          {calibration ? 'Re-calibrate to my guard' : 'Calibrate to my guard'}
        </button>
        {calibration && !calibrating && (
          <button
            type="button"
            onClick={resetCalibration}
            className="rounded-lg bg-zinc-800 px-3 py-2 text-sm text-zinc-300 hover:bg-zinc-700"
          >
            Reset to defaults
          </button>
        )}
        <span className="text-sm text-zinc-400">
          {calibUi.phase === 'capturing'
            ? 'Hold still…'
            : calibUi.phase === 'countdown'
              ? `Get into your guard… ${calibUi.secondsLeft}`
              : calibUi.phase === 'error'
                ? <span className="text-amber-400">{calibUi.message}</span>
                : calibration
                  ? 'Calibrated to you ✓ — thresholds set from your stance.'
                  : 'Using default thresholds. Calibrate for accurate, personal feedback.'}
        </span>
      </div>

      <div className="relative aspect-video w-full overflow-hidden rounded-2xl bg-zinc-900">
        <CameraView
          videoRef={videoRef}
          onReady={() => setCameraReady(true)}
          onError={setError}
        />
        <SkeletonOverlay ref={overlayRef} />
        {(!cameraReady || !detectorReady) && !error && (
          <div className="absolute inset-0 flex items-center justify-center text-zinc-400">
            {!detectorReady ? 'Loading pose model…' : 'Starting camera…'}
          </div>
        )}
        {overlayMessage && (
          <div className="absolute inset-x-0 top-4 flex justify-center">
            <span className="rounded-full bg-black/70 px-4 py-2 text-lg font-semibold text-white">
              {overlayMessage}
            </span>
          </div>
        )}
        {error && (
          <div className="absolute inset-0 flex items-center justify-center p-6 text-center text-red-400">
            {error}
          </div>
        )}
      </div>

      <FeedbackPanel feedback={feedback} movement={movement} onResetReps={() => {}} />
    </div>
  );
}
