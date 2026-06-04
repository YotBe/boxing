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
];

const STRIKE_FX_MAP: Record<string, { index: number; color: string }> = {
  'jab': { index: 15, color: 'rgb(245, 158, 11)' }, // Left Wrist, Amber
  'cross': { index: 16, color: 'rgb(245, 158, 11)' }, // Right Wrist, Amber
  'knee': { index: 26, color: 'rgb(16, 185, 129)' }, // Right Knee, Emerald
  'teep': { index: 27, color: 'rgb(99, 102, 241)' }, // Left Ankle, Indigo
  'left-hook': { index: 15, color: 'rgb(168, 85, 247)' }, // Left Wrist, Purple
  'right-elbow': { index: 14, color: 'rgb(6, 182, 212)' }, // Right Elbow, Cyan
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
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<Feedback | null>(null);

  // Camera devices selection
  const [cameraDevices, setCameraDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedCameraId, setSelectedCameraId] = useState<string>('');

  // Sound settings
  const [voiceEnabled, setVoiceEnabled] = useState(true);
  const [soundEnabled, setSoundEnabled] = useState(true);

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

  // Selected movement (only relevant in practice mode)
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

  // Initialize trackers map
  useEffect(() => {
    trackersRef.current = {
      'muaythai-guard': createDynamicTracker(),
      'jab': createDynamicTracker(),
      'cross': createDynamicTracker(),
      'knee': createDynamicTracker(),
      'teep': createDynamicTracker(),
      'left-hook': createDynamicTracker(),
      'right-elbow': createDynamicTracker(),
    };
  }, []);

  // Save current active metrics to history
  function commitSessionToHistory(movId: string, movName: string) {
    if (workoutMode === 'practice') {
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
  }, [movement.id, movement.name, dynamicStats, workoutMode]);

  // Round session timer tick state machine
  useEffect(() => {
    if (!roundModeActive) return;
    const interval = setInterval(() => {
      setRoundTimeLeft((prev) => {
        if (prev <= 1) {
          // Phase finished transition
          if (roundPhase === 'work') {
            if (currentRound >= roundCount) {
              // Workout Session Complete
              playBoxingBell(3);
              setRoundModeActive(false);
              setRoundPhase('inactive');
              speakCue("Workout complete. Excellent job!");
              return 0;
            } else {
              // End of Round work -> Rest
              playBoxingBell(1);
              setRoundPhase('rest');
              speakCue("Round complete. Take a rest!");
              return restDurationSec;
            }
          } else if (roundPhase === 'rest') {
            // End of Rest -> Next Round work
            playBoxingBell(2);
            setCurrentRound((r) => r + 1);
            setRoundPhase('work');
            speakCue(`Round ${currentRound + 1}! Fight!`);
            return roundDurationSec;
          }
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [roundModeActive, roundPhase, currentRound, roundCount, roundDurationSec, restDurationSec]);

  // Start / stop round workouts
  function handleToggleRoundSession() {
    if (roundModeActive) {
      // Terminate workout
      playBoxingBell(3);
      setRoundModeActive(false);
      setRoundPhase('inactive');
      speakCue("Training session stopped.");
    } else {
      // Initialize workout
      playBoxingBell(2);
      setCurrentRound(1);
      setRoundPhase('work');
      setRoundTimeLeft(roundDurationSec);
      setRoundModeActive(true);
      speakCue("Workout started. Round 1! Fight!");
      
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
    if (!soundEnabled) return;
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
    if (!soundEnabled) return;
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
    if (!soundEnabled) return;
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

  // Speak correctional cues
  function speakCue(cue: string) {
    if (!voiceEnabled) return;
    const now = performance.now();
    if (now - lastSpeechTimeRef.current < 4500) return;
    
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
    if (!voiceEnabled) return;
    try {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(label);
      utterance.rate = 1.25;
      utterance.pitch = 1.0;
      window.speechSynthesis.speak(utterance);
    } catch (e) {}
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

  // Enumerate active camera devices when camera is ready
  useEffect(() => {
    async function updateDevices() {
      if (!navigator.mediaDevices || !navigator.mediaDevices.enumerateDevices) return;
      try {
        const devices = await navigator.mediaDevices.enumerateDevices();
        const videoDevices = devices.filter((d) => d.kind === 'videoinput');
        setCameraDevices(videoDevices);
        if (videoDevices.length > 0 && !selectedCameraId) {
          setSelectedCameraId(videoDevices[0].deviceId);
        }
      } catch (err) {
        console.warn('enumerateDevices failed:', err);
      }
    }

    updateDevices();

    if (navigator.mediaDevices && navigator.mediaDevices.addEventListener) {
      navigator.mediaDevices.addEventListener('devicechange', updateDevices);
      return () => {
        navigator.mediaDevices.removeEventListener('devicechange', updateDevices);
      };
    }
  }, [cameraReady, selectedCameraId]);

  // Compute camera view container ring/glow styles for round phases
  const containerRingClass = useMemo(() => {
    if (!roundModeActive) return 'border-zinc-800/80 ring-0';
    if (roundPhase === 'work') {
      return 'border-red-500/50 ring-4 ring-red-500/20 shadow-[0_0_24px_rgba(239,68,68,0.15)] animate-pulse';
    }
    if (roundPhase === 'rest') {
      return 'border-emerald-500/50 ring-4 ring-emerald-500/20 shadow-[0_0_24px_rgba(16,185,129,0.15)]';
    }
    return 'border-zinc-800/80 ring-0';
  }, [roundModeActive, roundPhase]);

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
        return;
      }

      const current = movementRef.current;
      const rawImg = result.landmarks[0];
      const rawWorld = result.worldLandmarks[0];
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
        fb = evaluate(forEval, current);
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

      overlayRef.current?.draw(img, fb, current);

      if (timestampMs - lastPanel >= PANEL_UPDATE_MS) {
        lastPanel = timestampMs;
        setFeedback(fb);
        
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
    const newEntry: WorkoutLog = {
      id: Math.random().toString(36).substring(2, 9),
      movementId: 'muaythai-combo',
      movementName: comboName,
      timestamp: new Date().toISOString(),
    };
    setHistory((prev) => {
      const next = [newEntry, ...prev].slice(0, 50);
      try {
        localStorage.setItem('pose-coach:history', JSON.stringify(next));
      } catch {}
      return next;
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

  // Format seconds to mm:ss
  const formatTime = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-6xl flex-col gap-6 p-4 md:p-8">
      {/* Header section with Glass design */}
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-4 border border-zinc-800/80 border-t-red-500/40 border-t-2 bg-zinc-950/40 backdrop-blur-md p-6 rounded-3xl shadow-xl shadow-red-500/5">
        <div>
          <div className="flex items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-full bg-red-500 animate-pulse shadow-[0_0_8px_#ef4444]" />
            <h1 className="text-2xl font-extrabold tracking-tight text-zinc-100 uppercase font-mono">
              Nak Muay Coach
            </h1>
          </div>
          <p className="text-sm text-zinc-400 mt-1">
            Interactive Muay Thai trainer. Practice stances or hit combinations called by the voice coach.
          </p>
        </div>
        <a
          href={REPO_URL}
          target="_blank"
          rel="noreferrer"
          className="self-start md:self-center rounded-xl bg-zinc-900 border border-zinc-800 hover:border-zinc-700 px-4 py-2 text-xs font-semibold text-zinc-300 hover:text-white transition-all shadow-md"
        >
          Documentation
        </a>
      </header>

      {/* Two-Column Responsive Dashboard Layout */}
      <main className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Column: Camera View (Main screen) */}
        <div className="lg:col-span-7 flex flex-col gap-4">
          <div className={`relative aspect-video w-full overflow-hidden rounded-3xl border bg-zinc-950/60 shadow-2xl group transition-all duration-500 ${containerRingClass}`}>
            <CameraView
              videoRef={videoRef}
              selectedCameraId={selectedCameraId}
              onReady={() => setCameraReady(true)}
              onError={setError}
            />
            <SkeletonOverlay ref={overlayRef} />

            {/* High-tech viewfinder HUD corners overlay */}
            <div className="absolute inset-4 border border-zinc-800/20 pointer-events-none rounded-2xl">
              {/* Top-Left */}
              <div className="absolute top-0 left-0 w-4 h-4 border-t-2 border-l-2 border-red-500/40 rounded-tl-sm" />
              {/* Top-Right */}
              <div className="absolute top-0 right-0 w-4 h-4 border-t-2 border-r-2 border-red-500/40 rounded-tr-sm" />
              {/* Bottom-Left */}
              <div className="absolute bottom-0 left-0 w-4 h-4 border-b-2 border-l-2 border-red-500/40 rounded-bl-sm" />
              {/* Bottom-Right */}
              <div className="absolute bottom-0 right-0 w-4 h-4 border-b-2 border-r-2 border-red-500/40 rounded-br-sm" />
            </div>
            
            {/* Rounds Rest Phase Overlay Screen */}
            {roundModeActive && roundPhase === 'rest' && (
              <div className="absolute inset-0 flex flex-col items-center justify-center bg-zinc-950/80 backdrop-blur-md transition-all duration-300 select-none">
                <div className="flex flex-col items-center gap-2 text-center">
                  <span className="text-[10px] font-extrabold uppercase tracking-widest text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-3.5 py-1 rounded-full">
                    REST & BREATHE
                  </span>
                  <span className="text-6xl font-black text-white tracking-tight tabular-nums font-mono animate-pulse">
                    {formatTime(roundTimeLeft)}
                  </span>
                  <span className="text-xs text-zinc-400 font-medium">
                    Next Round: {currentRound + 1} of {roundCount}
                  </span>
                </div>
              </div>
            )}

            {/* Combo Padwork Overlays inside Camera View */}
            {workoutMode === 'combos' && comboStatus === 'waiting' && (!roundModeActive || roundPhase === 'work') && (
              <div className="absolute inset-x-0 bottom-6 flex flex-col items-center gap-1 pointer-events-none select-none">
                <span className="text-[10px] font-black uppercase tracking-widest text-amber-400 bg-amber-500/10 border border-amber-500/20 px-3 py-1 rounded-full backdrop-blur-sm">
                  STRIKE TARGET
                </span>
                <span className="text-3xl md:text-5xl font-black text-amber-300 tracking-tight drop-shadow-[0_4px_12px_rgba(245,158,11,0.5)] uppercase animate-pulse">
                  {movements.find(m => m.id === COMBOS[activeComboIndex].sequence[comboStepIndex])?.name ?? COMBOS[activeComboIndex].sequence[comboStepIndex]}
                </span>
                <div className="flex gap-1.5 mt-2 bg-black/50 px-3.5 py-2 rounded-2xl border border-zinc-800/60 backdrop-blur-md">
                  {COMBOS[activeComboIndex].sequence.map((strikeId, i) => {
                    const strikeLabel = movements.find(m => m.id === strikeId)?.name ?? strikeId;
                    const isPassed = i < comboStepIndex;
                    const isCurrent = i === comboStepIndex;
                    return (
                      <span
                        key={i}
                        className={`text-[9px] font-bold px-2 py-1 rounded-lg uppercase transition-all duration-300 ${
                          isPassed
                            ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                            : isCurrent
                              ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40 animate-pulse scale-105 shadow shadow-amber-500/10'
                              : 'bg-zinc-800/30 text-zinc-500 border border-zinc-800/50'
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
                <div className="flex flex-col items-center gap-1 text-center animate-bounce">
                  <span className="text-[10px] font-extrabold uppercase tracking-widest text-emerald-400 bg-emerald-500/20 border border-emerald-500/35 px-4 py-1 rounded-full">
                    COMBO COMPLETE!
                  </span>
                  <span className="text-4xl md:text-5xl font-black text-white tracking-tight drop-shadow-[0_4px_16px_rgba(16,185,129,0.5)]">
                    {comboFeedbackText}
                  </span>
                </div>
              </div>
            )}

            {/* Loading/Setup overlay */}
            {(!cameraReady || !detectorReady) && !error && (
              <div className="absolute inset-0 flex flex-col items-center justify-center bg-[#020205]/95 text-zinc-400 gap-3 backdrop-blur-sm select-none">
                <svg className="animate-spin h-10 w-10 text-red-500" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
                <span className="text-xs font-bold tracking-widest font-mono uppercase text-zinc-400">
                  {!detectorReady ? 'Loading Pose Landmarker AI...' : 'Starting camera stream...'}
                </span>
              </div>
            )}

            {/* Calibration countdown layout overlay */}
            {overlayMessage && (
              <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/75 backdrop-blur-sm transition-all duration-300 select-none">
                <div className="flex flex-col items-center gap-2 text-center animate-pulse">
                  <span className="text-[10px] font-extrabold uppercase tracking-widest text-red-400 bg-red-500/10 border border-red-500/20 px-3 py-1 rounded-full">
                    CALIBRATION TRIGGERED
                  </span>
                  <span className="text-8xl font-black text-white tracking-tight drop-shadow-[0_4px_24px_rgba(255,255,255,0.25)] font-mono">
                    {overlayMessage}
                  </span>
                  <span className="text-xs text-zinc-300 font-semibold tracking-wide">
                    {calibUi.phase === 'countdown' ? 'Get ready and strike stance...' : 'Observing stance limits...'}
                  </span>
                </div>
              </div>
            )}

            {error && (
              <div className="absolute inset-0 flex items-center justify-center p-6 text-center text-rose-400 bg-black/80 backdrop-blur-sm font-semibold select-none">
                {error}
              </div>
            )}
          </div>

          {/* Calibration Panel */}
          {workoutMode === 'practice' && (
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 rounded-2xl border border-zinc-800/80 bg-zinc-900/20 backdrop-blur-md p-4 shadow-lg">
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={startCalibration}
                  disabled={!cameraReady || !detectorReady || calibrating}
                  className="rounded-xl bg-red-600 hover:bg-red-500 px-4 py-2.5 text-xs font-bold text-white disabled:opacity-40 transition-all shadow-md active:scale-95 shrink-0"
                >
                  {calibration ? 'Calibrate Posture' : 'Calibrate Posture'}
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
                  ? 'Analyzing and measuring posture...'
                  : calibUi.phase === 'countdown'
                    ? `Get into posture... ${calibUi.secondsLeft}`
                    : calibUi.phase === 'error'
                      ? <span className="text-amber-400 font-bold">{calibUi.message}</span>
                      : calibration
                        ? '✓ Stance calibrated. Ranges adjusted to body proportions.'
                        : 'Using system stance parameters. Calibrate for high accuracy.'}
              </div>
            </div>
          )}
        </div>

        {/* Right Column: Sidebar Dashboard (Movement select + Stats + history) */}
        <aside className="lg:col-span-5 flex flex-col gap-6">
          {/* Movement Selection (Only shown in single movement practice) */}
          {workoutMode === 'practice' && (
            <div className="rounded-3xl border border-zinc-800/80 bg-zinc-900/20 backdrop-blur-md p-5 shadow-xl">
              <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-500 font-mono">Striking Database</span>
              <h3 className="text-sm font-bold text-zinc-200 mt-1 mb-3">Select Active Striking Stance</h3>
              <div className="flex flex-col gap-2">
                {movements.map((mov) => {
                  const isActive = mov.id === selectedMovementId;
                  return (
                    <button
                      key={mov.id}
                      type="button"
                      onClick={() => handleSelectMovement(mov.id)}
                      className={`group text-left rounded-xl p-3 border transition-all duration-200 flex items-center justify-between active:scale-[0.98] ${
                        isActive
                          ? 'bg-red-600/10 border-red-500/30 border-l-4 border-l-red-500 text-red-400 shadow-md shadow-red-500/5 pl-2.5'
                          : 'bg-zinc-900/30 border-zinc-800/50 border-l-4 border-l-transparent text-zinc-400 hover:border-zinc-700 hover:bg-zinc-900/50 hover:text-zinc-300 pl-2.5'
                      }`}
                    >
                      <div>
                        <div className="font-extrabold text-sm tracking-tight group-hover:text-white transition-colors">
                          {mov.name}
                        </div>
                        <div className="text-[10px] text-zinc-500 mt-0.5 font-medium">
                          {mov.dynamics ? 'Repetition strike tracking' : 'Static posture guard'}
                        </div>
                      </div>
                      {isActive && (
                        <span className="h-1.5 w-1.5 rounded-full bg-red-500 shadow-[0_0_6px_#ef4444]" />
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

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
            workoutMode={workoutMode}
            setWorkoutMode={setWorkoutMode}
            activeComboIndex={activeComboIndex}
            setActiveComboIndex={setActiveComboIndex}
            comboStepIndex={comboStepIndex}
            combosCompletedCount={combosCompletedCount}
            comboStatus={comboStatus}
            comboFeedbackText={comboFeedbackText}
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

            // Camera settings
            cameraDevices={cameraDevices}
            selectedCameraId={selectedCameraId}
            setSelectedCameraId={setSelectedCameraId}
          />
        </aside>
      </main>
    </div>
  );
}
