import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import CameraView, {
  isSecureContextForCamera,
  type CameraError,
  type FrameSource,
} from './components/CameraView';
import DemoControls from './components/DemoControls';
import FeedbackPanel from './components/FeedbackPanel';
import SkeletonOverlay, {
  type SkeletonOverlayHandle,
} from './components/SkeletonOverlay';
import TelemetryOverlay from './components/TelemetryOverlay';
import { Card, PrimaryButton } from './components/ui';
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
import {
  createPoseDetector,
  DEFAULT_DETECTION_CONFIDENCE,
  type DelegateId,
  type ModelVariantId,
  type PoseDetector,
  type PoseDetectorInfo,
} from './engine/poseDetector';
import { createSmoother } from './engine/smoothing';
import {
  createTelemetryMeter,
  meanVisibility,
  type TelemetrySnapshot,
} from './engine/telemetry';
import {
  VISIBILITY_THRESHOLD,
  type Feedback,
  type DynamicResult,
} from './engine/types';
import { createDynamicTracker, type DynamicTracker } from './engine/dynamics';
import { movements } from './movements';
import { warmOfflineCache, type OfflineStatus } from './offline';
import { useWakeLock } from './useWakeLock';

// How often to push feedback into React state (the skeleton is drawn every
// frame on the canvas; the text panel doesn't need 60fps).
const PANEL_UPDATE_MS = 100;

// Consecutive failing frames before the detector is declared broken. About a
// second of animation frames — long enough to ride out a swap, short enough
// that nobody stands there wondering why it cannot see them.
const DETECT_FAILURE_LIMIT = 60;

/**
 * Remembers a compute delegate across reloads.
 *
 * MediaPipe shares one WASM module for the whole page, and a GPU graph that
 * fails to start leaves that module's GL bindings broken — so a landmarker
 * rebuilt on CPU in the same session reports itself as CPU and then still dies
 * inside `detectForVideo`, calling into bindings that are no longer there. The
 * in-session fallback is therefore best-effort only; the reliable recovery is a
 * fresh page with a clean module. Persisting the choice is what turns "this
 * device cannot run it" into "reload once".
 */
const DELEGATE_KEY = 'pose-coach:delegate';
const DEV_MODE_KEY = 'pose-coach:dev';

function loadStoredDelegate(): DelegateId | null {
  try {
    const raw = localStorage.getItem(DELEGATE_KEY);
    return raw === 'CPU' || raw === 'GPU' ? raw : null;
  } catch {
    return null;
  }
}

function storeDelegate(delegate: DelegateId): void {
  try {
    localStorage.setItem(DELEGATE_KEY, delegate);
  } catch {}
}

const REPO_URL = 'https://github.com/YotBe/pose-coach';

// Calibration capture timing.
const COUNTDOWN_MS = 3000;
const CAPTURE_MS = 2000;
const CALIB_MARGIN_DEG = 15; // padding added around your observed guard/movement angles
const MIN_CALIB_SAMPLES = 10; // full-visibility frames needed for a valid capture

const HISTORY_KEY = 'pose-coach:history';
const MAX_HISTORY_ENTRIES = 50;

function makeLogId(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : Math.random().toString(36).substring(2, 9);
}

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

type WorkoutMode = 'practice' | 'combos';

const COMBOS = [
  { name: '1-2 Punch (Jab-Cross)', sequence: ['jab', 'cross'] },
  { name: 'Double Jab', sequence: ['jab', 'jab'] },
  { name: 'Knee Strike', sequence: ['knee'] },
  { name: '1-2-Knee Combo', sequence: ['jab', 'cross', 'knee'] },
  { name: 'Teep & Cross', sequence: ['teep', 'cross'] },
  { name: 'Dutch Style (Jab-Cross-Teep-Knee)', sequence: ['jab', 'cross', 'teep', 'knee'] },
  { name: 'Classic 1-2-Hook', sequence: ['jab', 'cross', 'left-hook'] },
  { name: 'Muay Thai Destruction (Jab-Elbow-Knee)', sequence: ['jab', 'right-elbow', 'knee'] },
  { name: 'Elbow Havoc (Left-Right Elbow-Knee)', sequence: ['left-elbow', 'right-elbow', 'knee'] },
  { name: 'Hook & Cross (Right Hook-Left Hook-Cross)', sequence: ['right-hook', 'left-hook', 'cross'] },
  { name: 'Double Teep (Left-Right Teep)', sequence: ['teep', 'right-teep'] },
  { name: 'Golden Kick (Jab-Cross-Left Knee-Right Knee)', sequence: ['jab', 'cross', 'left-knee', 'knee'] },
  { name: 'Thai Kick Boxing (Jab-Cross-Right Kick)', sequence: ['jab', 'cross', 'right-kick'] },
  { name: 'Champion Flow (Jab-Left Kick-Right Hook-Left Knee)', sequence: ['jab', 'left-kick', 'right-hook', 'left-knee'] },
];

const STRIKE_FX_MAP: Record<string, { index: number; color: string }> = {
  'jab': { index: 15, color: 'rgb(245, 158, 11)' }, // Left Wrist, Amber
  'cross': { index: 16, color: 'rgb(245, 158, 11)' }, // Right Wrist, Amber
  'knee': { index: 26, color: 'rgb(16, 185, 129)' }, // Right Knee, Emerald
  'teep': { index: 27, color: 'rgb(99, 102, 241)' }, // Left Ankle, Indigo
  'left-hook': { index: 15, color: 'rgb(168, 85, 247)' }, // Left Wrist, Purple
  'right-elbow': { index: 14, color: 'rgb(6, 182, 212)' }, // Right Elbow, Cyan
  'left-elbow': { index: 13, color: 'rgb(6, 182, 212)' }, // Left Elbow, Cyan
  'right-hook': { index: 16, color: 'rgb(168, 85, 247)' }, // Right Wrist, Purple
  'left-knee': { index: 25, color: 'rgb(16, 185, 129)' }, // Left Knee, Emerald
  'right-teep': { index: 28, color: 'rgb(99, 102, 241)' }, // Right Ankle, Indigo
  'left-kick': { index: 27, color: 'rgb(239, 68, 68)' }, // Left Ankle, Red
  'right-kick': { index: 28, color: 'rgb(239, 68, 68)' }, // Right Ankle, Red
};

export default function App() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const overlayRef = useRef<SkeletonOverlayHandle>(null);
  const detectorRef = useRef<PoseDetector | null>(null);
  // Separate smoothers: image landmarks drive the on-screen skeleton; world
  // (3D) landmarks drive the angle evaluation.
  const imgSmootherRef = useRef(createSmoother(0.5));
  const worldSmootherRef = useRef(createSmoother(0.5));
  const audioCtxRef = useRef<AudioContext | null>(null);

  const [detectorReady, setDetectorReady] = useState(false);
  const [cameraReady, setCameraReady] = useState(false);
  const [cameraError, setCameraError] = useState<CameraError | null>(null);
  const [modelError, setModelError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<Feedback | null>(null);

  // --- Frame source: live camera (either lens) or a recorded clip ---------
  // The recorded clip is the insurance policy: if the room's lighting, the
  // permission prompt or the hardware lets us down, the same engine runs
  // against a file and the demo continues.
  const [source, setSource] = useState<FrameSource>({
    kind: 'camera',
    facingMode: 'user',
  });
  const fileUrlRef = useRef<string | null>(null);
  const [sourceSize, setSourceSize] = useState({ width: 0, height: 0 });
  const sourceSizeRef = useRef(sourceSize);

  // Only a selfie view should be mirrored. Mirroring a rear-camera or recorded
  // frame would put the skeleton's left arm on the subject's right.
  const mirrored = source.kind === 'camera' && source.facingMode === 'user';

  // --- Inference configuration, all switchable while running -------------
  const [modelVariant, setModelVariant] = useState<ModelVariantId>('lite');
  const [delegate, setDelegate] = useState<DelegateId>(
    () => loadStoredDelegate() ?? 'GPU',
  );
  // Readable from inside the long-lived render loop, which does not restart on
  // every change to this value.
  const delegateRef = useRef(delegate);
  delegateRef.current = delegate;
  const [detectorInfo, setDetectorInfo] = useState<PoseDetectorInfo | null>(null);
  const [swappingModel, setSwappingModel] = useState(false);

  // The visibility floor is applied per frame, so it takes effect on the very
  // next one. The detection floor is baked into the landmarker at construction,
  // so it is debounced — otherwise dragging the slider would rebuild the model
  // on every step.
  const [visibilityThreshold, setVisibilityThreshold] = useState(
    VISIBILITY_THRESHOLD,
  );
  const visibilityThresholdRef = useRef(visibilityThreshold);
  visibilityThresholdRef.current = visibilityThreshold;

  const [detectionConfidence, setDetectionConfidence] = useState(
    DEFAULT_DETECTION_CONFIDENCE,
  );
  const [appliedDetectionConfidence, setAppliedDetectionConfidence] = useState(
    DEFAULT_DETECTION_CONFIDENCE,
  );

  /**
   * The engineering surface is off by default.
   *
   * Telemetry, the model and compute switches, the tuning sliders and the
   * pre-flight check are all one tap away rather than permanently on screen —
   * someone training does not need a compute-delegate control in their
   * eyeline. It persists, so it can be switched on once before a demo and
   * stay on across reloads.
   */
  const [devMode, setDevMode] = useState(() => {
    try {
      return localStorage.getItem(DEV_MODE_KEY) === '1';
    } catch {
      return false;
    }
  });

  function toggleDevMode() {
    setDevMode((on) => {
      const next = !on;
      try {
        localStorage.setItem(DEV_MODE_KEY, next ? '1' : '0');
      } catch {}
      return next;
    });
  }

  // --- Runtime telemetry --------------------------------------------------
  const telemetryRef = useRef(createTelemetryMeter());
  const [telemetry, setTelemetry] = useState<TelemetrySnapshot | null>(null);
  const [offlineStatus, setOfflineStatus] = useState<OfflineStatus>('registering');

  // Keep the screen alive for as long as there is something to look at.
  const wakeLockActive = useWakeLock(true);

  // Sound settings. The refs mirror the state so the long-lived rAF loop (whose
  // effect doesn't restart on toggle) always sees the current value.
  const [voiceEnabled, setVoiceEnabled] = useState(true);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const voiceEnabledRef = useRef(voiceEnabled);
  voiceEnabledRef.current = voiceEnabled;
  const soundEnabledRef = useRef(soundEnabled);
  soundEnabledRef.current = soundEnabled;

  // Shared lazy AudioContext generator to prevent leak/crash
  const getAudioContext = (): AudioContext | null => {
    if (typeof window === 'undefined') return null;
    try {
      if (!audioCtxRef.current) {
        audioCtxRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
      }
      if (audioCtxRef.current.state === 'suspended') {
        audioCtxRef.current.resume();
      }
      return audioCtxRef.current;
    } catch (err) {
      console.warn('Failed to initialize AudioContext:', err);
      return null;
    }
  };

  // Mode Selection
  const [workoutMode, setWorkoutMode] = useState<WorkoutMode>('practice');

  // Combo Coach states
  const [activeComboIndex, setActiveComboIndex] = useState(0);
  const [comboStepIndex, setComboStepIndex] = useState(0);
  const [combosCompletedCount, setCombosCompletedCount] = useState(0);
  const [comboStatus, setComboStatus] = useState<'idle' | 'calling' | 'waiting' | 'success'>('idle');
  const [comboFeedbackText, setComboFeedbackText] = useState('');

  // Round Session states
  const [roundModeActive, setRoundModeActive] = useState(false);
  const [currentRound, setCurrentRound] = useState(1);
  const [roundPhase, setRoundPhase] = useState<'work' | 'rest' | 'inactive'>('inactive');
  const [roundTimeLeft, setRoundTimeLeft] = useState(0);

  // Round Configurations
  const [roundCount, setRoundCount] = useState(3);
  const [roundDurationSec, setRoundDurationSec] = useState(120);
  const [restDurationSec, setRestDurationSec] = useState(45);

  // Selected movement (only relevant in practice mode). Default to the guard
  // — the natural starting point — rather than whatever sorts first.
  const [selectedMovementId, setSelectedMovementId] = useState(() => {
    const guard = movements.find((m) => m.id === 'muaythai-guard');
    return guard?.id ?? movements[0]?.id ?? 'muaythai-guard';
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
  
  // Trackers map for Combo mode strikes to avoid re-creation lag
  const trackersRef = useRef<Record<string, DynamicTracker>>({});
  
  const lastRepsCountRef = useRef(0);
  const lastSpeechTimeRef = useRef(0);

  // Holds for static guard pose
  const holdStartRef = useRef<number | null>(null);
  const totalHoldTimeRef = useRef(0);
  const [liveHoldTime, setLiveHoldTime] = useState(0);

  // Local storage history
  const [history, setHistory] = useState<WorkoutLog[]>(() => {
    try {
      const raw = localStorage.getItem(HISTORY_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  });
  // Mirror of `history` readable synchronously (e.g. inside the pagehide
  // handler, where a setState updater would never get flushed).
  const historyRef = useRef(history);
  historyRef.current = history;

  function pushHistoryEntry(entry: WorkoutLog) {
    const next = [entry, ...historyRef.current].slice(0, MAX_HISTORY_ENTRIES);
    historyRef.current = next;
    try {
      localStorage.setItem(HISTORY_KEY, JSON.stringify(next));
    } catch {}
    setHistory(next);
  }

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

  // Initialize one tracker per registered movement, so newly added movement
  // JSON files are covered without touching this list.
  useEffect(() => {
    const map: Record<string, DynamicTracker> = {};
    for (const m of movements) map[m.id] = createDynamicTracker();
    trackersRef.current = map;
  }, []);

  // Save current active metrics to history
  function commitSessionToHistory(movId: string, movName: string) {
    if (workoutMode === 'practice') {
      if (movement.dynamics && lastRepsCountRef.current > 0) {
        pushHistoryEntry({
          id: makeLogId(),
          movementId: movId,
          movementName: movName,
          timestamp: new Date().toISOString(),
          reps: lastRepsCountRef.current,
          peakSpeed: dynamicStats?.peakVelocityDegPerSec ?? 0,
        });
      } else if (!movement.dynamics && totalHoldTimeRef.current > 3) {
        pushHistoryEntry({
          id: makeLogId(),
          movementId: movId,
          movementName: movName,
          timestamp: new Date().toISOString(),
          holdTime: Math.round(totalHoldTimeRef.current),
        });
      }
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

  // Commit any in-progress practice metrics before switching workout modes,
  // so reps/hold time aren't silently dropped.
  function handleSetWorkoutMode(mode: WorkoutMode) {
    if (mode === workoutMode) return;
    commitSessionToHistory(movement.id, movement.name);
    setWorkoutMode(mode);
  }

  // Commit history on page exit. `pagehide` also covers mobile Safari and
  // bfcache navigations where `beforeunload` never fires.
  useEffect(() => {
    const handleUnload = () => {
      commitSessionToHistory(movement.id, movement.name);
    };
    window.addEventListener('pagehide', handleUnload);
    window.addEventListener('beforeunload', handleUnload);
    return () => {
      window.removeEventListener('pagehide', handleUnload);
      window.removeEventListener('beforeunload', handleUnload);
    };
  }, [movement.id, movement.name, dynamicStats, workoutMode]);

  // Round session countdown. The updater only decrements — phase transitions
  // (bells, speech, state changes) live in the effect below, because state
  // updaters must be pure: React may invoke them more than once per tick,
  // which used to double-ring bells and skip rounds.
  useEffect(() => {
    if (!roundModeActive) return;
    const interval = setInterval(() => {
      setRoundTimeLeft((prev) => Math.max(0, prev - 1));
    }, 1000);
    return () => clearInterval(interval);
  }, [roundModeActive]);

  // Phase transitions when the clock hits zero.
  useEffect(() => {
    if (!roundModeActive || roundTimeLeft > 0) return;
    if (roundPhase === 'work') {
      if (currentRound >= roundCount) {
        // Workout Session Complete
        playBoxingBell(3);
        setRoundModeActive(false);
        setRoundPhase('inactive');
        speakCue('Workout complete. Excellent job!', true);
      } else {
        // End of Round work -> Rest
        playBoxingBell(1);
        setRoundPhase('rest');
        setRoundTimeLeft(restDurationSec);
        speakCue('Round complete. Take a rest!', true);
      }
    } else if (roundPhase === 'rest') {
      // End of Rest -> Next Round work
      playBoxingBell(2);
      setCurrentRound((r) => r + 1);
      setRoundPhase('work');
      setRoundTimeLeft(roundDurationSec);
      speakCue(`Round ${currentRound + 1}! Fight!`, true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roundTimeLeft, roundModeActive, roundPhase]);

  // Start / stop round workouts
  function handleToggleRoundSession() {
    if (roundModeActive) {
      // Terminate workout
      playBoxingBell(3);
      setRoundModeActive(false);
      setRoundPhase('inactive');
      speakCue('Training session stopped.', true);
    } else {
      // Initialize workout
      playBoxingBell(2);
      setCurrentRound(1);
      setRoundPhase('work');
      setRoundTimeLeft(roundDurationSec);
      setRoundModeActive(true);
      speakCue('Workout started. Round 1! Fight!', true);
      
      // If in combo mode, trigger first combo
      if (workoutMode === 'combos') {
        startNextCombo(0);
      }
    }
  }

  function clearTimers() {
    timersRef.current.forEach((id) => window.clearTimeout(id));
    timersRef.current.forEach((id) => window.clearInterval(id));
    timersRef.current = [];
  }

  // Play boxing ring bell
  function playBoxingBell(times = 1) {
    if (!soundEnabledRef.current) return;
    try {
      const ctx = getAudioContext();
      if (!ctx) return;
      
      const triggerBell = (delay: number) => {
        const osc1 = ctx.createOscillator();
        const osc2 = ctx.createOscillator();
        const gain = ctx.createGain();
        
        osc1.type = 'sine';
        osc1.frequency.setValueAtTime(450, ctx.currentTime + delay);
        
        osc2.type = 'sine';
        osc2.frequency.setValueAtTime(680, ctx.currentTime + delay);
        
        gain.gain.setValueAtTime(0, ctx.currentTime + delay);
        gain.gain.linearRampToValueAtTime(0.2, ctx.currentTime + delay + 0.01);
        gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + delay + 0.85);
        
        osc1.connect(gain);
        osc2.connect(gain);
        gain.connect(ctx.destination);
        
        osc1.start(ctx.currentTime + delay);
        osc2.start(ctx.currentTime + delay);
        osc1.stop(ctx.currentTime + delay + 0.85);
        osc2.stop(ctx.currentTime + delay + 0.85);
      };

      for (let i = 0; i < times; i++) {
        triggerBell(i * 0.35); // repeat bell delays
      }
    } catch (e) {}
  }

  // Programmatic Leather Pad Hit Synthesizer (White noise slap + Triangle low sweep thump)
  function playLeatherPadHit() {
    if (!soundEnabledRef.current) return;
    try {
      const ctx = getAudioContext();
      if (!ctx) return;
      
      // 1. Low Thump (Triangle sweep)
      const thumpOsc = ctx.createOscillator();
      const thumpGain = ctx.createGain();
      thumpOsc.type = 'triangle';
      thumpOsc.frequency.setValueAtTime(160, ctx.currentTime);
      thumpOsc.frequency.exponentialRampToValueAtTime(45, ctx.currentTime + 0.1);
      
      thumpGain.gain.setValueAtTime(0.4, ctx.currentTime);
      thumpGain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.1);
      thumpOsc.connect(thumpGain);
      thumpGain.connect(ctx.destination);
      
      // 2. High Slap (White Noise)
      const bufferSize = ctx.sampleRate * 0.05; // 50ms slap
      const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
        data[i] = Math.random() * 2 - 1;
      }
      
      const noiseSource = ctx.createBufferSource();
      noiseSource.buffer = buffer;
      
      // Filter for tight leather hit timbre
      const filter = ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.setValueAtTime(1100, ctx.currentTime);
      filter.Q.setValueAtTime(1.5, ctx.currentTime);
      
      const noiseGain = ctx.createGain();
      noiseGain.gain.setValueAtTime(0.28, ctx.currentTime);
      noiseGain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.05);
      
      noiseSource.connect(filter);
      filter.connect(noiseGain);
      noiseGain.connect(ctx.destination);
      
      thumpOsc.start();
      noiseSource.start();
      
      thumpOsc.stop(ctx.currentTime + 0.1);
      noiseSource.stop(ctx.currentTime + 0.05);
    } catch (e) {}
  }

  // Play double chime for completed combo
  function playComboSuccessSound() {
    if (!soundEnabledRef.current) return;
    try {
      const ctx = getAudioContext();
      if (!ctx) return;
      
      const osc1 = ctx.createOscillator();
      const osc2 = ctx.createOscillator();
      const gain = ctx.createGain();
      
      osc1.type = 'sine';
      osc1.frequency.setValueAtTime(523.25, ctx.currentTime); // C5
      osc1.frequency.setValueAtTime(659.25, ctx.currentTime + 0.08); // E5
      
      osc2.type = 'sine';
      osc2.frequency.setValueAtTime(659.25, ctx.currentTime); // E5
      osc2.frequency.setValueAtTime(783.99, ctx.currentTime + 0.08); // G5
      
      gain.gain.setValueAtTime(0.15, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.25);
      
      osc1.connect(gain);
      osc2.connect(gain);
      gain.connect(ctx.destination);
      
      osc1.start();
      osc2.start();
      osc1.stop(ctx.currentTime + 0.25);
      osc2.stop(ctx.currentTime + 0.25);
    } catch (e) {}
  }

  // Speak correctional cues. Priority cues (round bells, session start/end)
  // bypass the throttle so they are never swallowed by a recent form cue.
  function speakCue(cue: string, priority = false) {
    if (!voiceEnabledRef.current) return;
    const now = performance.now();
    if (!priority && now - lastSpeechTimeRef.current < 4500) return;

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

  // Speak fast pad strike callouts
  function speakComboStrike(label: string) {
    if (!voiceEnabledRef.current) return;
    try {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(label);
      utterance.rate = 1.25;
      utterance.pitch = 1.0;
      window.speechSynthesis.speak(utterance);
    } catch (e) {}
  }

  // Build (and rebuild) the detector. Every dependency here is a knob exposed
  // in the UI: switching model variant, compute delegate or detection floor
  // tears the landmarker down and stands a new one up, which is what makes the
  // latency-versus-accuracy trade-off something you can watch happen rather
  // than something you have to be told about.
  useEffect(() => {
    let cancelled = false;
    setSwappingModel(true);
    setModelError(null);

    createPoseDetector({
      variant: modelVariant,
      delegate,
      minPoseDetectionConfidence: appliedDetectionConfidence,
      minTrackingConfidence: appliedDetectionConfidence,
    })
      .then((detector) => {
        if (cancelled) {
          detector.close();
          return;
        }
        detectorRef.current = detector;
        setDetectorInfo(detector.info());
        telemetryRef.current.reset();
        setTelemetry(null);
        setDetectorReady(true);
        setSwappingModel(false);
      })
      .catch((err) => {
        if (cancelled) return;
        setSwappingModel(false);
        setModelError(
          err instanceof Error
            ? `Failed to load the ${modelVariant} model: ${err.message}`
            : `Failed to load the ${modelVariant} model.`,
        );
      });

    return () => {
      cancelled = true;
      const detector = detectorRef.current;
      detectorRef.current = null;
      setDetectorReady(false);
      detector?.close();
    };
  }, [modelVariant, delegate, appliedDetectionConfidence]);

  // Commit the detection floor a beat after the slider settles.
  useEffect(() => {
    const id = window.setTimeout(
      () => setAppliedDetectionConfidence(detectionConfidence),
      400,
    );
    return () => window.clearTimeout(id);
  }, [detectionConfidence]);

  // Teardown that belongs to the whole app rather than to one detector.
  useEffect(() => {
    return () => {
      clearTimers();
      audioCtxRef.current?.close().catch(() => {});
      audioCtxRef.current = null;
      if (fileUrlRef.current) URL.revokeObjectURL(fileUrlRef.current);
      try {
        window.speechSynthesis?.cancel();
      } catch {}
    };
  }, []);

  // Once the app is actually running, ask the service worker to fill in
  // anything still missing from the offline set — notably the model variant
  // that has not been selected yet. Doing it here rather than at install time
  // keeps ~9MB of background download off the critical path of a cold start.
  useEffect(() => {
    if (!cameraReady || !detectorReady) return;
    let cancelled = false;
    setOfflineStatus('caching');
    warmOfflineCache().then((status) => {
      if (!cancelled) setOfflineStatus(status);
    });
    return () => {
      cancelled = true;
    };
  }, [cameraReady, detectorReady]);

  // Switching frame source restarts the pipeline: a new stream means new
  // intrinsic dimensions, so the overlay canvas and the telemetry both need to
  // re-derive rather than carry the previous source's numbers forward.
  const beginSourceSwitch = useCallback(() => {
    setCameraReady(false);
    setCameraError(null);
    setFeedback(null);
    setSourceSize({ width: 0, height: 0 });
    sourceSizeRef.current = { width: 0, height: 0 };
    telemetryRef.current.reset();
    setTelemetry(null);
  }, []);

  const handleSelectCamera = useCallback(
    (facingMode: 'user' | 'environment') => {
      beginSourceSwitch();
      setSource({ kind: 'camera', facingMode });
    },
    [beginSourceSwitch],
  );

  const handleSelectFile = useCallback(
    (file: File) => {
      beginSourceSwitch();
      if (fileUrlRef.current) URL.revokeObjectURL(fileUrlRef.current);
      const url = URL.createObjectURL(file);
      fileUrlRef.current = url;
      setSource({ kind: 'file', url, name: file.name });
    },
    [beginSourceSwitch],
  );

  const handleCameraReady = useCallback(() => {
    setCameraError(null);
    setCameraReady(true);
  }, []);

  const handleCameraError = useCallback((err: CameraError) => {
    setCameraReady(false);
    setCameraError(err);
  }, []);

  // An explicit choice is remembered, so it survives the reload that a failed
  // delegate asks for — and picking GPU again clears a stored CPU fallback.
  const handleSelectDelegate = useCallback((next: DelegateId) => {
    storeDelegate(next);
    setDelegate(next);
  }, []);

  // Compute camera view container ring/glow styles for round phases
  // A single quiet border tint marks the round phase. It used to be a 4px ring
  // plus a coloured glow plus animate-pulse on the whole camera frame, which
  // made the thing you are actually trying to watch throb.
  const containerRingClass = useMemo(() => {
    if (!roundModeActive) return 'border-zinc-800/70';
    if (roundPhase === 'work') return 'border-red-500/50';
    if (roundPhase === 'rest') return 'border-emerald-500/50';
    return 'border-zinc-800/70';
  }, [roundModeActive, roundPhase]);

  // Drive the realtime loop once camera + detector are both ready.
  useEffect(() => {
    if (!cameraReady || !detectorReady) return;
    const video = videoRef.current;
    if (!video || !detectorRef.current) return;

    let raf = 0;
    let lastPanel = 0;
    let lastVideoTime = -1;
    let consecutiveDetectFailures = 0;

    // The overlay canvas must match the frame source's intrinsic size, which is
    // not known until metadata arrives and changes outright when the source is
    // swapped for a recorded clip.
    const syncSourceSize = () => {
      const width = video.videoWidth;
      const height = video.videoHeight;
      if (!width || !height) return;
      const previous = sourceSizeRef.current;
      if (previous.width === width && previous.height === height) return;
      sourceSizeRef.current = { width, height };
      overlayRef.current?.syncSize(width, height);
      setSourceSize({ width, height });
    };
    syncSourceSize();

    const tick = (timestampMs: number) => {
      raf = requestAnimationFrame(tick);

      // Re-read the detector every frame rather than capturing it once. A model
      // swap nulls this ref before closing the old landmarker, so this check is
      // what guarantees no frame is ever handed to a detector that is being
      // torn down — calling into a closed MediaPipe graph aborts its WASM
      // module and spits an error into the console mid-demo.
      const detector = detectorRef.current;
      if (!detector) return;

      if (video.readyState < 2 || video.currentTime === lastVideoTime) return;
      lastVideoTime = video.currentTime;
      syncSourceSize();

      const threshold = visibilityThresholdRef.current;

      // Time the model call and nothing else. Smoothing, evaluation and the
      // canvas draw all happen below and belong to render cost, not to
      // inference cost — reporting them together would make a fast model on a
      // busy main thread look like a slow model.
      let result;
      const inferenceStart = performance.now();
      try {
        result = detector.detect(video, timestampMs);
        consecutiveDetectFailures = 0;
      } catch (err) {
        // A single throw is normal around a source or model swap and is not
        // worth reacting to. A detector that throws on every frame, though, is
        // dead — and swallowing that silently leaves the app sitting on
        // "Looking for you", which reads as an empty room rather than a broken
        // pipeline. Surface it instead of hanging.
        consecutiveDetectFailures += 1;
        if (consecutiveDetectFailures === DETECT_FAILURE_LIMIT) {
          console.error('Pose inference is failing on every frame:', err);
          // Arrange for the next load to come up on CPU with a clean module,
          // so the remedy offered on screen is one the reload actually honours.
          // This tests what was *requested*, not what the detector reports: an
          // in-session fallback already claims CPU while being broken, so
          // reading the effective value would decide there is nothing to store.
          if (delegateRef.current !== 'CPU') storeDelegate('CPU');
          setModelError('Inference is failing on every frame.');
        }
        return;
      }
      const inferenceMs = performance.now() - inferenceStart;

      const current = movementRef.current;
      const rawImg = result.landmarks[0];
      const rawWorld = result.worldLandmarks[0];

      // Confidence is read off the raw landmarks, before smoothing, so the
      // number reflects what the model actually reported this frame.
      if (rawImg) {
        telemetryRef.current.record(timestampMs, inferenceMs, meanVisibility(rawImg));
      } else {
        telemetryRef.current.recordEmpty(timestampMs, inferenceMs);
      }
      const img = rawImg ? imgSmootherRef.current.smooth(rawImg) : undefined;
      const world = rawWorld ? worldSmootherRef.current.smooth(rawWorld) : undefined;

      let fb: Feedback | null = null;
      if (world) {
        const forEval = img
          ? world.map((w, i) => ({
              ...w,
              visibility: img[i]?.visibility ?? w.visibility,
            }))
          : world;
        fb = evaluate(forEval, current, threshold);
      }

      const inRestPhase = roundModeActive && roundPhase === 'rest';

      if (fb && !inRestPhase) {
        if (capturingRef.current) calibratorRef.current?.add(fb.joints);

        // --- PRACTICE MODE ---
        if (workoutMode === 'practice') {
          const hasDynamics = !!current.dynamics;

          if (hasDynamics && dynamicTrackerRef.current) {
            const dynResult = dynamicTrackerRef.current.update(
              fb.joints,
              timestampMs,
              current.dynamics!
            );
            fb.dynamic = dynResult;
            
            if (dynResult.reps > lastRepsCountRef.current) {
              // Play authentic leather clap sound
              playLeatherPadHit();
              lastRepsCountRef.current = dynResult.reps;
              
              // Trigger visual splash on skeleton canvas
              const fx = STRIKE_FX_MAP[current.id];
              if (fx) {
                overlayRef.current?.triggerSplash(fx.index, fx.color);
              }
            }
          }

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

          if (!fb.ok && fb.activeCues.length > 0) {
            speakCue(fb.activeCues[0]);
          }
        }
        
        // --- COMBO COACH (PAD WORK) ---
        else if (workoutMode === 'combos' && comboStatus === 'waiting') {
          const combo = COMBOS[activeComboIndex];
          const expectedStrikeId = combo.sequence[comboStepIndex];
          const strikeMov = movements.find((m) => m.id === expectedStrikeId);
          
          if (strikeMov && strikeMov.dynamics) {
            let tracker = trackersRef.current[expectedStrikeId];
            if (!tracker) {
              tracker = createDynamicTracker();
              trackersRef.current[expectedStrikeId] = tracker;
            }
            
            const dynResult = tracker.update(
              fb.joints,
              timestampMs,
              strikeMov.dynamics
            );
            
            fb.dynamic = dynResult;

            if (dynResult.reps > lastRepsCountRef.current) {
              // Target strike landed successfully!
              playLeatherPadHit();
              lastRepsCountRef.current = dynResult.reps;
              
              // Draw visual glowing concentric shockwave on striking limb
              const fx = STRIKE_FX_MAP[expectedStrikeId];
              if (fx) {
                overlayRef.current?.triggerSplash(fx.index, fx.color);
              }
              
              const nextStep = comboStepIndex + 1;
              if (nextStep < combo.sequence.length) {
                setComboStepIndex(nextStep);
                const nextStrikeId = combo.sequence[nextStep];
                trackersRef.current[nextStrikeId]?.reset();
                lastRepsCountRef.current = 0;
                
                // Prompt next strike in combination
                const strikeLabel = movements.find(m => m.id === nextStrikeId)?.name ?? nextStrikeId;
                speakComboStrike(strikeLabel);
              } else {
                // Combination fully completed
                playComboSuccessSound();
                setComboStatus('success');
                setCombosCompletedCount((prev) => prev + 1);
                
                const encouragements = ['Oowee!', 'Beautiful combo!', 'Power!', 'Nice speed!', 'Perfect form!'];
                const randomEncouragement = encouragements[Math.floor(Math.random() * encouragements.length)];
                setComboFeedbackText(randomEncouragement);
                
                // Write combo to workout logs
                logComboToHistory(combo.name);
                
                const nextComboTimeout = window.setTimeout(() => {
                  startNextCombo();
                }, 2200);
                timersRef.current.push(nextComboTimeout);
              }
            }
          }
        }
      }

      overlayRef.current?.draw(img, fb, current, threshold);

      if (timestampMs - lastPanel >= PANEL_UPDATE_MS) {
        lastPanel = timestampMs;
        setFeedback(fb);
        setTelemetry(telemetryRef.current.snapshot());

        if (fb?.dynamic) {
          setDynamicStats(fb.dynamic);
        } else {
          setDynamicStats(null);
        }

        if (workoutMode === 'practice' && !current.dynamics) {
          const currentElapsed = holdStartRef.current !== null ? (timestampMs - holdStartRef.current) / 1000 : 0;
          setLiveHoldTime(Math.round(totalHoldTimeRef.current + currentElapsed));
        } else {
          setLiveHoldTime(0);
        }
      }
    };

    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [cameraReady, detectorReady, workoutMode, comboStatus, activeComboIndex, comboStepIndex, roundModeActive, roundPhase]);

  // Set up next pad combo strike sequence
  function startNextCombo(forceIndex?: number) {
    clearTimers();
    let nextIndex = activeComboIndex;
    if (forceIndex !== undefined) {
      nextIndex = forceIndex;
    } else {
      nextIndex = (activeComboIndex + 1) % COMBOS.length;
    }
    
    setActiveComboIndex(nextIndex);
    setComboStepIndex(0);
    setComboStatus('waiting');
    setComboFeedbackText('');
    lastRepsCountRef.current = 0;
    
    const nextCombo = COMBOS[nextIndex];
    // Reset expected trackers
    nextCombo.sequence.forEach(strikeId => {
      trackersRef.current[strikeId]?.reset();
    });
    
    // Call out first strike in combo
    const firstStrikeId = nextCombo.sequence[0];
    const strikeLabel = movements.find(m => m.id === firstStrikeId)?.name ?? firstStrikeId;
    speakComboStrike(nextCombo.name + ". " + strikeLabel);
  }

  // Log completed combo to history
  function logComboToHistory(comboName: string) {
    pushHistoryEntry({
      id: makeLogId(),
      movementId: 'muaythai-combo',
      movementName: comboName,
      timestamp: new Date().toISOString(),
    });
  }

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
    historyRef.current = [];
    setHistory([]);
    try {
      localStorage.removeItem(HISTORY_KEY);
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

  const sourceLabel =
    source.kind === 'file'
      ? `file · ${source.name}`
      : source.facingMode === 'user'
        ? 'front camera'
        : 'rear camera';

  // A camera failure is recoverable — the recorded-clip source keeps the whole
  // pipeline demonstrable — so it is shown as a blocking panel only while the
  // live camera is the selected source.
  const blockingError =
    modelError ??
    (source.kind === 'camera' && cameraError ? cameraError.message : null);
  const blockingRemedy =
    modelError !== null
      ? 'Reload the page — it will restart on the CPU delegate, which needs a fresh session to take effect. If it still fails, switch the model variant to Lite after reloading.'
      : (cameraError?.remedy ?? null);

  // Format seconds to mm:ss
  const formatTime = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-6xl flex-col gap-4 p-3 sm:p-4 sm:gap-6 md:p-8">
      {/* A title and one control. The old header was a bordered, blurred,
          shadowed card with a pulsing dot and a paragraph of positioning copy
          above the fold — a lot of furniture before you reach the camera. */}
      <header className="flex items-center justify-between gap-3">
        <h1 className="text-lg font-semibold tracking-tight text-zinc-100">
          Nak Muay Coach
        </h1>
        <button
          type="button"
          onClick={toggleDevMode}
          aria-pressed={devMode}
          className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
            devMode
              ? 'bg-red-600 text-white'
              : 'border border-zinc-800 text-zinc-400 hover:text-zinc-200'
          }`}
        >
          Dev
        </button>
      </header>

      {/* The one failure that looks like a bug but is a deployment mistake. */}
      {!isSecureContextForCamera() && (
        <div className="rounded-2xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-xs text-amber-200">
          <span className="font-bold">Insecure origin.</span> Browsers only grant
          camera access over HTTPS or on localhost, so the live camera cannot
          start here. Open the deployed https:// URL — or use the{' '}
          <span className="font-bold">Video file</span> source below, which works
          anywhere.
        </div>
      )}

      {/* Two-Column Responsive Dashboard Layout */}
      <main className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Column: Camera View (Main screen) */}
        <div className="lg:col-span-7 flex flex-col gap-4">
          {/* Portrait-first on a phone, landscape from tablet up. A standing
              person fills a 3:4 frame far better than a 16:9 one. */}
          <div className={`relative aspect-[3/4] w-full overflow-hidden rounded-2xl border bg-zinc-950/60 transition-colors sm:aspect-video ${containerRingClass}`}>
            <CameraView
              videoRef={videoRef}
              source={source}
              mirrored={mirrored}
              onReady={handleCameraReady}
              onError={handleCameraError}
            />
            <SkeletonOverlay ref={overlayRef} mirrored={mirrored} />

            {devMode && (
              <TelemetryOverlay
                stats={telemetry}
                detector={detectorInfo}
                sourceWidth={sourceSize.width}
                sourceHeight={sourceSize.height}
                sourceLabel={sourceLabel}
                swapping={swappingModel}
              />
            )}

            {/* Flipping the camera is an everyday action, so it stays on the
                frame rather than moving into the dev panel with the rest of the
                source controls. */}
            {source.kind === 'camera' && cameraReady && (
              <button
                type="button"
                onClick={() =>
                  handleSelectCamera(
                    source.facingMode === 'user' ? 'environment' : 'user',
                  )
                }
                aria-label="Switch camera"
                className="absolute right-2 top-2 rounded-full bg-black/60 p-2.5 text-white backdrop-blur-sm transition-colors hover:bg-black/80 sm:right-3 sm:top-3"
              >
                <svg
                  className="h-5 w-5"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={2}
                  aria-hidden="true"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M4 9V7a2 2 0 012-2h2m8 0h2a2 2 0 012 2v2m0 6v2a2 2 0 01-2 2h-2m-8 0H6a2 2 0 01-2-2v-2"
                  />
                  <circle cx="12" cy="12" r="3" />
                </svg>
              </button>
            )}

            {/* Rounds Rest Phase Overlay Screen */}
            {roundModeActive && roundPhase === 'rest' && (
              <div className="absolute inset-0 flex flex-col items-center justify-center bg-zinc-950/80 backdrop-blur-md transition-all duration-300 select-none">
                <div className="flex flex-col items-center gap-1 text-center">
                  <span className="text-sm font-medium text-emerald-400">Rest</span>
                  <span className="text-6xl font-bold tabular-nums tracking-tight text-white">
                    {formatTime(roundTimeLeft)}
                  </span>
                  <span className="text-sm text-zinc-400">
                    Next: round {currentRound + 1} of {roundCount}
                  </span>
                </div>
              </div>
            )}

            {/* Combo Padwork Overlays inside Camera View */}
            {workoutMode === 'combos' && comboStatus === 'waiting' && (!roundModeActive || roundPhase === 'work') && (
              <div className="pointer-events-none absolute inset-x-0 bottom-3 flex select-none flex-col items-center gap-2">
                <span className="rounded-xl bg-black/70 px-4 py-2 text-2xl font-bold tracking-tight text-white backdrop-blur-sm md:text-3xl">
                  {movements.find(m => m.id === COMBOS[activeComboIndex].sequence[comboStepIndex])?.name ?? COMBOS[activeComboIndex].sequence[comboStepIndex]}
                </span>
                <div className="flex gap-1 rounded-xl bg-black/60 px-2 py-1.5 backdrop-blur-sm">
                  {COMBOS[activeComboIndex].sequence.map((strikeId, i) => {
                    const strikeLabel = movements.find(m => m.id === strikeId)?.name ?? strikeId;
                    const isPassed = i < comboStepIndex;
                    const isCurrent = i === comboStepIndex;
                    return (
                      <span
                        key={i}
                        className={`rounded-lg px-2 py-1 text-[11px] font-medium transition-colors ${
                          isPassed
                            ? 'bg-emerald-500/20 text-emerald-300'
                            : isCurrent
                              ? 'bg-red-600 text-white'
                              : 'text-zinc-500'
                        }`}
                      >
                        {strikeLabel}
                      </span>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Combo hit flash success */}
            {workoutMode === 'combos' && comboStatus === 'success' && (!roundModeActive || roundPhase === 'work') && (
              <div className="absolute inset-0 flex flex-col items-center justify-center bg-emerald-950/30 backdrop-blur-sm pointer-events-none select-none transition-all duration-300">
                <div className="flex flex-col items-center gap-1 text-center">
                  <span className="text-sm font-medium text-emerald-400">
                    Combo complete
                  </span>
                  <span className="text-4xl font-bold tracking-tight text-white md:text-5xl">
                    {comboFeedbackText}
                  </span>
                </div>
              </div>
            )}

            {/* Live coaching readout, pinned to the frame.
                On a phone the full feedback panel is a long scroll below the
                video, which is no use when the whole point is to watch the
                skeleton and the verdict at the same time. This is the one line
                that has to be readable from across a desk. */}
            {workoutMode === 'practice' &&
              cameraReady &&
              detectorReady &&
              !blockingError &&
              // Not during the rest phase. The tick already stops evaluating
              // then, so the banner would sit there on top of the rest screen
              // telling you to step into frame during the one part of the
              // session you are meant to be out of it.
              !(roundModeActive && roundPhase === 'rest') && (
              <div className="pointer-events-none absolute inset-x-2 bottom-2 select-none sm:inset-x-3 sm:bottom-3">
                <div
                  className={`flex items-center gap-2 rounded-xl border px-3 py-2 shadow-lg backdrop-blur-md ${
                    !feedback?.tracked
                      ? 'border-white/15 bg-black/70'
                      : feedback.ok
                        ? 'border-emerald-400/40 bg-emerald-950/70'
                        : 'border-amber-400/40 bg-amber-950/70'
                  }`}
                >
                  <span
                    className={`h-2.5 w-2.5 shrink-0 rounded-full ${
                      !feedback?.tracked
                        ? 'bg-zinc-500'
                        : feedback.ok
                          ? 'bg-emerald-400 shadow-[0_0_8px_#34d399]'
                          : 'bg-amber-400 shadow-[0_0_8px_#fbbf24]'
                    }`}
                  />
                  <span
                    className={`min-w-0 flex-1 text-sm font-bold leading-snug sm:text-base ${
                      !feedback?.tracked
                        ? 'text-zinc-300'
                        : feedback.ok
                          ? 'text-emerald-200'
                          : 'text-amber-100'
                    }`}
                  >
                    {!feedback?.tracked
                      ? 'Looking for you — step into frame'
                      : feedback.ok
                        ? 'Form OK'
                        : (feedback.activeCues[0] ?? 'Adjust your position')}
                  </span>
                  {dynamicStats ? (
                    <span className="shrink-0 text-right font-mono text-xs font-black tabular-nums text-white sm:text-sm">
                      {dynamicStats.reps}
                      <span className="ml-1 text-[9px] font-bold uppercase text-white/60">
                        reps
                      </span>
                    </span>
                  ) : (
                    liveHoldTime > 0 && (
                      <span className="shrink-0 text-right font-mono text-xs font-black tabular-nums text-white sm:text-sm">
                        {liveHoldTime}s
                        <span className="ml-1 text-[9px] font-bold uppercase text-white/60">
                          held
                        </span>
                      </span>
                    )
                  )}
                </div>
              </div>
            )}

            {/* Loading/Setup overlay */}
            {(!cameraReady || !detectorReady) && !blockingError && (
              <div className="absolute inset-0 flex flex-col items-center justify-center bg-[#020205]/95 text-zinc-400 gap-3 backdrop-blur-sm select-none">
                <svg className="animate-spin h-10 w-10 text-red-500" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
                <span className="text-xs font-bold tracking-widest font-mono uppercase text-zinc-400">
                  {!detectorReady
                    ? `Loading ${modelVariant} landmarker (${delegate})…`
                    : source.kind === 'file'
                      ? 'Opening video file…'
                      : 'Starting camera stream…'}
                </span>
              </div>
            )}

            {/* Calibration countdown layout overlay */}
            {overlayMessage && (
              <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/75 backdrop-blur-sm transition-all duration-300 select-none">
                <div className="flex flex-col items-center gap-1 text-center">
                  <span className="text-7xl font-bold tabular-nums tracking-tight text-white">
                    {overlayMessage}
                  </span>
                  <span className="text-sm text-zinc-300">
                    {calibUi.phase === 'countdown'
                      ? 'Get into your stance'
                      : 'Hold still — measuring'}
                  </span>
                </div>
              </div>
            )}

            {/* A failure never leaves a blank frame: it says what broke, what to
                do about it, and offers the recorded-clip route out. */}
            {blockingError && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 overflow-auto p-5 text-center bg-black/90 backdrop-blur-sm">
                <span className="text-2xl" aria-hidden="true">
                  ⚠️
                </span>
                <span className="font-bold text-rose-400">{blockingError}</span>
                {blockingRemedy && (
                  <span className="max-w-sm text-xs leading-relaxed text-zinc-300">
                    {blockingRemedy}
                  </span>
                )}
                <div className="flex flex-wrap items-center justify-center gap-2">
                  <button
                    type="button"
                    onClick={() =>
                      // A model failure is only cleared by a fresh page: the
                      // WASM module is shared and cannot be rebuilt in place.
                      modelError !== null || source.kind === 'file'
                        ? window.location.reload()
                        : handleSelectCamera(source.facingMode)
                    }
                    className="rounded-xl bg-red-600 hover:bg-red-500 px-4 py-2 text-xs font-bold text-white transition-all shadow-md active:scale-95"
                  >
                    Retry
                  </button>
                  {source.kind === 'camera' && (
                    <button
                      type="button"
                      onClick={() =>
                        handleSelectCamera(
                          source.facingMode === 'user' ? 'environment' : 'user',
                        )
                      }
                      className="rounded-xl border border-zinc-700 bg-zinc-900 px-4 py-2 text-xs font-bold text-zinc-200 transition-all hover:bg-zinc-800 active:scale-95"
                    >
                      Try other camera
                    </button>
                  )}
                </div>
                <span className="max-w-sm text-[11px] leading-relaxed text-zinc-500">
                  Or pick <span className="font-bold text-zinc-400">Video file</span>{' '}
                  in the controls below — the engine runs identically on a
                  recorded clip, telemetry included.
                </span>
              </div>
            )}
          </div>

          {/* The everyday controls: which movement, and calibrate it to you.
              The old layout had a movement dropdown here AND a 16-item list in
              the sidebar — two ways to do the same thing, both always on. */}
          {workoutMode === 'practice' && (
            <Card className="flex flex-col gap-3 px-4 py-3.5">
              <div className="flex items-center gap-2">
                <select
                  value={selectedMovementId}
                  onChange={(e) => handleSelectMovement(e.target.value)}
                  aria-label="Movement"
                  className="min-w-0 flex-1 rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2.5 text-sm font-medium text-zinc-100"
                >
                  {movements.map((mov) => (
                    <option key={mov.id} value={mov.id}>
                      {mov.name}
                    </option>
                  ))}
                </select>
                <PrimaryButton
                  onClick={startCalibration}
                  disabled={!cameraReady || !detectorReady || calibrating}
                >
                  Calibrate
                </PrimaryButton>
              </div>

              <p className="text-xs text-zinc-500">
                {calibUi.phase === 'capturing'
                  ? 'Measuring your stance…'
                  : calibUi.phase === 'countdown'
                    ? `Get into position… ${calibUi.secondsLeft}`
                    : calibUi.phase === 'error'
                      ? <span className="text-amber-400">{calibUi.message}</span>
                      : calibration ? (
                          <>
                            Calibrated to you.{' '}
                            <button
                              type="button"
                              onClick={resetCalibration}
                              className="text-zinc-400 underline underline-offset-2 hover:text-zinc-200"
                            >
                              Reset to defaults
                            </button>
                          </>
                        ) : (
                          'Using default angle ranges. Calibrate to match your proportions and camera angle.'
                        )}
              </p>
            </Card>
          )}

          {devMode && (
            <DemoControls
              source={source}
              onSelectCamera={handleSelectCamera}
              onSelectFile={handleSelectFile}
              variant={modelVariant}
              onSelectVariant={setModelVariant}
              delegate={delegate}
              onSelectDelegate={handleSelectDelegate}
              swapping={swappingModel}
              activeMovement={movement}
              visibilityThreshold={visibilityThreshold}
              onVisibilityThreshold={setVisibilityThreshold}
              detectionConfidence={detectionConfidence}
              onDetectionConfidence={setDetectionConfidence}
              offlineStatus={offlineStatus}
              wakeLockActive={wakeLockActive}
              detector={detectorInfo}
            />
          )}
        </div>

        <aside className="flex flex-col gap-3 lg:col-span-5">
          {/* Feedback details */}
          <FeedbackPanel
            feedback={feedback}
            movement={movement}
            movements={movements}
            liveHoldTime={liveHoldTime}
            dynamicStats={dynamicStats}
            voiceEnabled={voiceEnabled}
            soundEnabled={soundEnabled}
            setVoiceEnabled={setVoiceEnabled}
            setSoundEnabled={setSoundEnabled}
            history={history}
            onClearHistory={handleClearHistory}
            onResetReps={handleResetReps}
            workoutMode={workoutMode}
            setWorkoutMode={handleSetWorkoutMode}
            activeComboIndex={activeComboIndex}
            comboStepIndex={comboStepIndex}
            combosCompletedCount={combosCompletedCount}
            startNextCombo={startNextCombo}
            COMBOS={COMBOS}


            // Round structures
            roundModeActive={roundModeActive}
            currentRound={currentRound}
            roundPhase={roundPhase}
            roundTimeLeft={roundTimeLeft}
            roundCount={roundCount}
            setRoundCount={setRoundCount}
            roundDurationSec={roundDurationSec}
            setRoundDurationSec={setRoundDurationSec}
            restDurationSec={restDurationSec}
            setRestDurationSec={setRestDurationSec}
            onToggleRoundSession={handleToggleRoundSession}
          />
        </aside>
      </main>

      <footer className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 border-t border-zinc-900 pt-4 text-xs text-zinc-600">
        <span>
          Runs entirely on your device — the camera feed never leaves the
          browser. Not coaching or medical advice.
        </span>
        <a
          href={REPO_URL}
          target="_blank"
          rel="noreferrer"
          className="hover:text-zinc-400"
        >
          Source
        </a>
      </footer>
    </div>
  );
}
