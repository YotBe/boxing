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
import type { Feedback, DynamicResult } from './engine/types';
import { createDynamicTracker, type DynamicTracker } from './engine/dynamics';
import { movements } from './movements';

// How often to push feedback into React state (the skeleton is drawn every
// frame on the canvas; the text panel doesn't need 60fps).
const PANEL_UPDATE_MS = 100;

const REPO_URL = 'https://github.com/YotBe/pose-coach';

// Calibration capture timing.
const COUNTDOWN_MS = 3000;
const CAPTURE_MS = 2000;
const CALIB_MARGIN_DEG = 15; // padding added around your observed guard/movement angles
const MIN_CALIB_SAMPLES = 10; // full-visibility frames needed for a valid capture

type CalibUi =
  | { phase: 'idle' }
  | { phase: 'countdown'; secondsLeft: number }
  | { phase: 'capturing' }
  | { phase: 'done' }
  | { phase: 'error'; message: string };

interface WorkoutLog {
  id: string;
  movementId: string;
  movementName: string;
  timestamp: string;
  reps?: number;
  peakSpeed?: number;
  holdTime?: number;
}

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

  // Sound settings
  const [voiceEnabled, setVoiceEnabled] = useState(true);
  const [soundEnabled, setSoundEnabled] = useState(true);

  // Multi-movement support
  const [selectedMovementId, setSelectedMovementId] = useState(() => {
    return movements[0]?.id ?? 'muaythai-guard';
  });

  const GUARD = useMemo(() => {
    return movements.find((m) => m.id === selectedMovementId) ?? movements[0];
  }, [selectedMovementId]);

  // Saved per-body/per-camera calibration (persisted in localStorage).
  const [calibration, setCalibration] = useState<CalibrationMap | null>(null);
  const [calibUi, setCalibUi] = useState<CalibUi>({ phase: 'idle' });

  // Load calibration when selected movement changes.
  useEffect(() => {
    setCalibration(loadCalibration(selectedMovementId));
    setCalibUi({ phase: 'idle' });
  }, [selectedMovementId]);

  // The guard/movement with its angle ranges overridden by calibration, if any.
  const movement = useMemo(
    () => (calibration ? applyCalibration(GUARD, calibration) : GUARD),
    [calibration, GUARD],
  );

  // Make the current movement available to the rAF loop without restarting it.
  const movementRef = useRef(movement);
  movementRef.current = movement;

  // Calibration capture state, read inside the rAF tick.
  const calibratorRef = useRef<Calibrator | null>(null);
  const capturingRef = useRef(false);
  const timersRef = useRef<number[]>([]);

  // Rep counting + Hold timing state
  const dynamicTrackerRef = useRef<DynamicTracker | null>(null);
  const [dynamicStats, setDynamicStats] = useState<DynamicResult | null>(null);
  
  const lastRepsCountRef = useRef(0);
  const lastSpeechTimeRef = useRef(0);

  // Holds for static guard pose
  const holdStartRef = useRef<number | null>(null);
  const totalHoldTimeRef = useRef(0);
  const [liveHoldTime, setLiveHoldTime] = useState(0);

  // Local storage history
  const [history, setHistory] = useState<WorkoutLog[]>(() => {
    try {
      const raw = localStorage.getItem('pose-coach:history');
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  });

  // Track dynamic tracker state for the tick loop
  useEffect(() => {
    if (movement.dynamics) {
      dynamicTrackerRef.current = createDynamicTracker();
    } else {
      dynamicTrackerRef.current = null;
    }
    setDynamicStats(null);
    lastRepsCountRef.current = 0;
    totalHoldTimeRef.current = 0;
    holdStartRef.current = null;
    setLiveHoldTime(0);
  }, [selectedMovementId]);

  // Save current active metrics to history
  function commitSessionToHistory(movId: string, movName: string) {
    if (movement.dynamics && lastRepsCountRef.current > 0) {
      const reps = lastRepsCountRef.current;
      const peakSpeed = dynamicStats?.peakVelocityDegPerSec ?? 0;
      
      const newEntry: WorkoutLog = {
        id: Math.random().toString(36).substring(2, 9),
        movementId: movId,
        movementName: movName,
        timestamp: new Date().toISOString(),
        reps,
        peakSpeed,
      };
      
      setHistory((prev) => {
        const next = [newEntry, ...prev].slice(0, 50);
        try {
          localStorage.setItem('pose-coach:history', JSON.stringify(next));
        } catch {}
        return next;
      });
    } else if (!movement.dynamics && totalHoldTimeRef.current > 3) {
      const holdTime = totalHoldTimeRef.current;
      const newEntry: WorkoutLog = {
        id: Math.random().toString(36).substring(2, 9),
        movementId: movId,
        movementName: movName,
        timestamp: new Date().toISOString(),
        holdTime: Math.round(holdTime),
      };
      
      setHistory((prev) => {
        const next = [newEntry, ...prev].slice(0, 50);
        try {
          localStorage.setItem('pose-coach:history', JSON.stringify(next));
        } catch {}
        return next;
      });
    }
    
    // Clear run parameters
    totalHoldTimeRef.current = 0;
    holdStartRef.current = null;
    lastRepsCountRef.current = 0;
    setLiveHoldTime(0);
  }

  // Handle manual select
  function handleSelectMovement(id: string) {
    commitSessionToHistory(movement.id, movement.name);
    setSelectedMovementId(id);
  }

  // Commit history on page exit
  useEffect(() => {
    const handleUnload = () => {
      commitSessionToHistory(movement.id, movement.name);
    };
    window.addEventListener('beforeunload', handleUnload);
    return () => window.removeEventListener('beforeunload', handleUnload);
  }, [movement.id, movement.name, dynamicStats]);

  function clearTimers() {
    timersRef.current.forEach((id) => window.clearTimeout(id));
    timersRef.current.forEach((id) => window.clearInterval(id));
    timersRef.current = [];
  }

  // Play rep beep
  function playBeep() {
    if (!soundEnabled) return;
    try {
      const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      
      osc.type = 'sine';
      osc.frequency.setValueAtTime(660, ctx.currentTime); // E5 note, pleasant chime
      
      gain.gain.setValueAtTime(0, ctx.currentTime);
      gain.gain.linearRampToValueAtTime(0.15, ctx.currentTime + 0.03);
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.25);
      
      osc.connect(gain);
      gain.connect(ctx.destination);
      
      osc.start();
      osc.stop(ctx.currentTime + 0.25);
    } catch (err) {
      console.warn('AudioContext failed:', err);
    }
  }

  // Speak correctional cues
  function speakCue(cue: string) {
    if (!voiceEnabled) return;
    const now = performance.now();
    if (now - lastSpeechTimeRef.current < 4500) return; // 4.5s throttle
    
    lastSpeechTimeRef.current = now;
    try {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(cue);
      utterance.rate = 1.05;
      utterance.pitch = 1.0;
      window.speechSynthesis.speak(utterance);
    } catch (err) {
      console.warn('SpeechSynthesis failed:', err);
    }
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

      if (fb) {
        // Feed frames into a calibration capture in progress (full frame rate).
        if (capturingRef.current) calibratorRef.current?.add(fb.joints);

        const hasDynamics = !!current.dynamics;

        // Update dynamics tracker
        if (hasDynamics && dynamicTrackerRef.current) {
          const dynResult = dynamicTrackerRef.current.update(
            fb.joints,
            timestampMs,
            current.dynamics!
          );
          fb.dynamic = dynResult;
          
          if (dynResult.reps > lastRepsCountRef.current) {
            playBeep();
            lastRepsCountRef.current = dynResult.reps;
          }
        }

        // Update hold times for static exercise
        if (!hasDynamics) {
          if (fb.ok) {
            if (holdStartRef.current === null) {
              holdStartRef.current = timestampMs;
            }
          } else {
            if (holdStartRef.current !== null) {
              totalHoldTimeRef.current += (timestampMs - holdStartRef.current) / 1000;
              holdStartRef.current = null;
            }
          }
        }

        // Play vocal alerts if form is incorrect
        if (!fb.ok && fb.activeCues.length > 0) {
          speakCue(fb.activeCues[0]);
        }
      }

      overlayRef.current?.draw(img, fb, current);

      if (timestampMs - lastPanel >= PANEL_UPDATE_MS) {
        lastPanel = timestampMs;
        setFeedback(fb);
        
        if (fb?.dynamic) {
          setDynamicStats(fb.dynamic);
        } else {
          setDynamicStats(null);
        }

        if (current.dynamics) {
          setLiveHoldTime(0);
        } else {
          const currentElapsed = holdStartRef.current !== null ? (timestampMs - holdStartRef.current) / 1000 : 0;
          setLiveHoldTime(Math.round(totalHoldTimeRef.current + currentElapsed));
        }
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
          'Couldn’t see your form clearly. Position your body fully in frame, then try again.',
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
    commitSessionToHistory(movement.id, movement.name);
    clearTimers();
    capturingRef.current = false;
    clearCalibration(GUARD.id);
    setCalibration(null);
    setCalibUi({ phase: 'idle' });
  }

  function handleResetReps() {
    commitSessionToHistory(movement.id, movement.name);
    dynamicTrackerRef.current?.reset();
    setDynamicStats(null);
    lastRepsCountRef.current = 0;
    totalHoldTimeRef.current = 0;
    holdStartRef.current = null;
    setLiveHoldTime(0);
  }

  function handleClearHistory() {
    setHistory([]);
    try {
      localStorage.removeItem('pose-coach:history');
    } catch {}
  }

  const calibrating =
    calibUi.phase === 'countdown' || calibUi.phase === 'capturing';

  const overlayMessage =
    calibUi.phase === 'countdown'
      ? `${calibUi.secondsLeft}`
      : calibUi.phase === 'capturing'
        ? 'HOLDING STILL...'
        : null;

  return (
    <div className="mx-auto flex min-h-screen max-w-6xl flex-col gap-6 p-4 md:p-8">
      {/* Header section with Glass design */}
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-4 border border-zinc-800/80 bg-zinc-950/40 backdrop-blur-md p-6 rounded-3xl shadow-xl">
        <div>
          <div className="flex items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-full bg-emerald-500 animate-pulse" />
            <h1 className="text-2xl font-extrabold tracking-tight bg-gradient-to-r from-white via-zinc-200 to-zinc-500 bg-clip-text text-transparent">
              AI Pose Coach
            </h1>
          </div>
          <p className="text-sm text-zinc-400 mt-1">
            Real-time interactive physical form assessment and dynamic exercise counting.
          </p>
        </div>
        <a
          href={REPO_URL}
          target="_blank"
          rel="noreferrer"
          className="self-start md:self-center rounded-xl bg-zinc-900 border border-zinc-800 hover:border-zinc-700 px-4 py-2 text-xs font-semibold text-zinc-300 hover:text-white transition-all shadow-md"
        >
          View Documentation
        </a>
      </header>

      {/* Two-Column Responsive Dashboard Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Column: Camera View (Main screen) */}
        <div className="lg:col-span-7 flex flex-col gap-4">
          <div className="relative aspect-video w-full overflow-hidden rounded-3xl border border-zinc-800/80 bg-zinc-950/60 shadow-2xl group">
            <CameraView
              videoRef={videoRef}
              onReady={() => setCameraReady(true)}
              onError={setError}
            />
            <SkeletonOverlay ref={overlayRef} />
            
            {/* Loading/Setup overlay */}
            {(!cameraReady || !detectorReady) && !error && (
              <div className="absolute inset-0 flex flex-col items-center justify-center bg-[#020205]/90 text-zinc-400 gap-3 backdrop-blur-sm">
                <svg className="animate-spin h-10 w-10 text-emerald-500" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
                <span className="text-sm font-semibold tracking-wide">
                  {!detectorReady ? 'Loading Pose Landmarker AI model...' : 'Starting camera feed...'}
                </span>
              </div>
            )}

            {/* Calibration countdown layout overlay */}
            {overlayMessage && (
              <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/60 backdrop-blur-sm transition-all duration-300">
                <div className="flex flex-col items-center gap-2 text-center animate-bounce">
                  <span className="text-[10px] font-extrabold uppercase tracking-widest text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-3 py-1 rounded-full">
                    Calibration Stance
                  </span>
                  <span className="text-7xl font-black text-white tracking-tight drop-shadow-[0_4px_12px_rgba(255,255,255,0.2)]">
                    {overlayMessage}
                  </span>
                  <span className="text-xs text-zinc-300 font-semibold tracking-wide">
                    {calibUi.phase === 'countdown' ? 'Get ready and strike your stance...' : 'Observe stance. Hold still!'}
                  </span>
                </div>
              </div>
            )}

            {error && (
              <div className="absolute inset-0 flex items-center justify-center p-6 text-center text-rose-400 bg-black/80 backdrop-blur-sm font-semibold">
                {error}
              </div>
            )}
          </div>

          {/* Calibration Panel */}
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 rounded-2xl border border-zinc-800/80 bg-zinc-900/20 backdrop-blur-md p-4 shadow-lg">
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={startCalibration}
                disabled={!cameraReady || !detectorReady || calibrating}
                className="rounded-xl bg-emerald-600 px-4 py-2.5 text-xs font-bold text-white hover:bg-emerald-500 disabled:opacity-40 transition-all shadow-md active:scale-95 shrink-0"
              >
                {calibration ? 'Recalibrate Stance' : 'Calibrate Stance'}
              </button>
              {calibration && !calibrating && (
                <button
                  type="button"
                  onClick={resetCalibration}
                  className="rounded-xl bg-zinc-800/60 border border-zinc-700/40 px-3 py-2.5 text-xs font-bold text-zinc-300 hover:bg-zinc-700 hover:text-white transition-all shadow-md"
                >
                  Reset Defaults
                </button>
              )}
            </div>
            <div className="text-xs text-zinc-400 md:text-right font-medium">
              {calibUi.phase === 'capturing'
                ? 'Hold still while scanning...'
                : calibUi.phase === 'countdown'
                  ? `Get into posture... Countdown: ${calibUi.secondsLeft}`
                  : calibUi.phase === 'error'
                    ? <span className="text-amber-400 font-bold">{calibUi.message}</span>
                    : calibration
                      ? '✓ Personalized stance calibrated. Acceptable ranges adjusted.'
                      : 'Using default joint limits. Calibrate for highly accurate feedback.'}
            </div>
          </div>
        </div>

        {/* Right Column: Sidebar Dashboard (Movement select + Stats + history) */}
        <div className="lg:col-span-5 flex flex-col gap-6">
          {/* Movement Selection */}
          <div className="rounded-3xl border border-zinc-800/80 bg-zinc-900/20 backdrop-blur-md p-5 shadow-xl">
            <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">Exercise Registry</span>
            <h3 className="text-sm font-bold text-zinc-200 mt-1 mb-3">Select Active Coaching Movement</h3>
            <div className="flex flex-col gap-2">
              {movements.map((mov) => {
                const isActive = mov.id === selectedMovementId;
                return (
                  <button
                    key={mov.id}
                    type="button"
                    onClick={() => handleSelectMovement(mov.id)}
                    className={`group text-left rounded-xl p-3.5 border transition-all duration-200 flex items-center justify-between ${
                      isActive
                        ? 'bg-emerald-600/10 border-emerald-500/30 text-emerald-400 shadow-md'
                        : 'bg-zinc-900/30 border-zinc-800/50 text-zinc-400 hover:border-zinc-700 hover:bg-zinc-900/50 hover:text-zinc-300'
                    }`}
                  >
                    <div>
                      <div className="font-extrabold text-sm tracking-tight group-hover:text-white transition-colors">
                        {mov.name}
                      </div>
                      <div className="text-[10px] text-zinc-500 mt-0.5 font-medium">
                        {mov.dynamics ? 'Dynamic repetition exercise' : 'Static posture hold'}
                      </div>
                    </div>
                    {isActive && (
                      <span className="h-2 w-2 rounded-full bg-emerald-400" />
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Feedback details */}
          <FeedbackPanel
            feedback={feedback}
            movement={movement}
            liveHoldTime={liveHoldTime}
            dynamicStats={dynamicStats}
            voiceEnabled={voiceEnabled}
            soundEnabled={soundEnabled}
            setVoiceEnabled={setVoiceEnabled}
            setSoundEnabled={setSoundEnabled}
            history={history}
            onClearHistory={handleClearHistory}
            onResetReps={handleResetReps}
          />
        </div>
      </div>
    </div>
  );
}
