import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  Camera,
  CheckCircle2,
  ChevronRight,
  Flame,
  Home as HomeIcon,
  Loader2,
  RefreshCw,
  Shield,
  Sparkles,
  Target,
  Trophy,
  Zap,
} from 'lucide-react';

/* ------------------------------------------------------------------ */
/* Constants                                                          */
/* ------------------------------------------------------------------ */

const TFJS_SRC = 'https://cdn.jsdelivr.net/npm/@tensorflow/tfjs@3.21.0/dist/tf.min.js';
const POSE_SRC =
  'https://cdn.jsdelivr.net/npm/@tensorflow-models/pose-detection@2.1.3/dist/pose-detection.min.js';

const ROUND_SECONDS = 30;
const WARNING_THROTTLE_FRAMES = 15;
const KEYPOINT_CONFIDENCE = 0.3;

const SKELETON_PAIRS = [
  ['left_shoulder', 'right_shoulder'],
  ['left_shoulder', 'left_elbow'],
  ['left_elbow', 'left_wrist'],
  ['right_shoulder', 'right_elbow'],
  ['right_elbow', 'right_wrist'],
  ['left_shoulder', 'left_hip'],
  ['right_shoulder', 'right_hip'],
  ['left_hip', 'right_hip'],
  ['left_hip', 'left_knee'],
  ['left_knee', 'left_ankle'],
  ['right_hip', 'right_knee'],
  ['right_knee', 'right_ankle'],
];

/* ------------------------------------------------------------------ */
/* Dynamic script loader                                              */
/* ------------------------------------------------------------------ */

const loadedScripts = new Set();

function loadScript(src) {
  if (typeof window === 'undefined') return Promise.resolve();
  if (loadedScripts.has(src)) return Promise.resolve();
  const existing = document.querySelector(`script[src="${src}"]`);
  if (existing) {
    loadedScripts.add(src);
    return new Promise((resolve, reject) => {
      if (existing.dataset.loaded === 'true') return resolve();
      existing.addEventListener('load', () => resolve());
      existing.addEventListener('error', () => reject(new Error(`Failed: ${src}`)));
    });
  }
  return new Promise((resolve, reject) => {
    const tag = document.createElement('script');
    tag.src = src;
    tag.async = true;
    tag.crossOrigin = 'anonymous';
    tag.onload = () => {
      tag.dataset.loaded = 'true';
      loadedScripts.add(src);
      resolve();
    };
    tag.onerror = () => reject(new Error(`Failed to load ${src}`));
    document.head.appendChild(tag);
  });
}

async function loadPoseLibraries() {
  await loadScript(TFJS_SRC);
  await loadScript(POSE_SRC);
  if (!window.tf || !window.poseDetection) {
    throw new Error('TensorFlow.js libraries did not register globals.');
  }
  await window.tf.ready();
  try {
    await window.tf.setBackend('webgl');
  } catch (_e) {
    await window.tf.setBackend('cpu');
  }
  return window.poseDetection;
}

/* ------------------------------------------------------------------ */
/* Helpers                                                            */
/* ------------------------------------------------------------------ */

function getKp(keypoints, name) {
  return keypoints.find((k) => k.name === name);
}

function dist(a, b) {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.sqrt(dx * dx + dy * dy);
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function scoreColor(score) {
  if (score >= 80) return 'text-emerald-400';
  if (score >= 60) return 'text-amber-400';
  return 'text-red-400';
}

function scoreRingColor(score) {
  if (score >= 80) return 'stroke-emerald-500';
  if (score >= 60) return 'stroke-amber-500';
  return 'stroke-red-500';
}

/* ------------------------------------------------------------------ */
/* Main App                                                           */
/* ------------------------------------------------------------------ */

export default function App() {
  const [currentScreen, setCurrentScreen] = useState('home');
  const [results, setResults] = useState(null);

  const goHome = useCallback(() => {
    setResults(null);
    setCurrentScreen('home');
  }, []);

  return (
    <div className="min-h-screen w-full bg-black text-zinc-100 flex justify-center">
      <div className="w-full max-w-md min-h-screen bg-zinc-950 relative overflow-hidden flex flex-col">
        {currentScreen === 'home' && (
          <HomeScreen onStart={() => setCurrentScreen('setup')} />
        )}
        {currentScreen === 'setup' && (
          <SetupScreen
            onReady={() => setCurrentScreen('recording')}
            onBack={goHome}
          />
        )}
        {currentScreen === 'recording' && (
          <RecordingScreen
            onFinish={(data) => {
              setResults(data);
              setCurrentScreen('processing');
            }}
            onCancel={goHome}
          />
        )}
        {currentScreen === 'processing' && (
          <ProcessingScreen
            results={results}
            onDone={() => setCurrentScreen('feedback')}
          />
        )}
        {currentScreen === 'feedback' && (
          <FeedbackScreen
            results={results}
            onHome={goHome}
            onAgain={() => setCurrentScreen('setup')}
          />
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Screen: HOME                                                       */
/* ------------------------------------------------------------------ */

function HomeScreen({ onStart }) {
  return (
    <div className="flex flex-col h-full min-h-screen px-6 pt-12 pb-8">
      <div className="flex items-center justify-between mb-8">
        <div>
          <p className="text-xs uppercase tracking-[0.18em] text-zinc-500 font-medium">
            Tuesday
          </p>
          <h1 className="text-2xl font-semibold text-white mt-1">Good Morning</h1>
        </div>
        <div className="h-10 w-10 rounded-full bg-zinc-900 border border-zinc-800 flex items-center justify-center">
          <Flame className="w-5 h-5 text-emerald-500" />
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3 mb-8">
        <StatTile label="Streak" value="4d" icon={<Flame className="w-4 h-4" />} />
        <StatTile label="Rounds" value="12" icon={<Activity className="w-4 h-4" />} />
        <StatTile label="Avg" value="78" icon={<Trophy className="w-4 h-4" />} />
      </div>

      <p className="text-xs uppercase tracking-[0.18em] text-zinc-500 font-medium mb-3">
        Today's Plan
      </p>

      <div className="rounded-3xl bg-gradient-to-br from-emerald-500/10 via-zinc-900 to-zinc-900 border border-zinc-800 p-5 mb-4 relative overflow-hidden">
        <div className="absolute -right-8 -top-8 h-32 w-32 rounded-full bg-emerald-500/10 blur-2xl" />
        <div className="flex items-start justify-between relative">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <span className="px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 text-[10px] font-semibold tracking-wider uppercase">
                Live
              </span>
              <span className="text-[10px] text-zinc-500 uppercase tracking-wider">
                30s round
              </span>
            </div>
            <h2 className="text-lg font-semibold text-white leading-snug">
              AI Live Shadow Round
            </h2>
            <p className="text-sm text-zinc-400 mt-1">
              Boxing · Guard & Stance focus
            </p>
          </div>
          <Sparkles className="w-5 h-5 text-emerald-400" />
        </div>

        <div className="mt-5 grid grid-cols-3 gap-2">
          <MiniMetric icon={<Shield className="w-3.5 h-3.5" />} label="Guard" />
          <MiniMetric icon={<Target className="w-3.5 h-3.5" />} label="Stance" />
          <MiniMetric icon={<Zap className="w-3.5 h-3.5" />} label="Punches" />
        </div>
      </div>

      <div className="rounded-2xl bg-zinc-900/60 border border-zinc-800 p-4 mb-6 flex items-center gap-3">
        <div className="h-9 w-9 rounded-full bg-zinc-800 flex items-center justify-center">
          <Camera className="w-4 h-4 text-zinc-300" />
        </div>
        <div className="flex-1">
          <p className="text-sm font-medium text-white">Camera-based coach</p>
          <p className="text-xs text-zinc-500">
            Runs on-device. Nothing leaves your phone.
          </p>
        </div>
      </div>

      <div className="mt-auto">
        <button
          onClick={onStart}
          className="w-full h-14 rounded-2xl bg-emerald-500 hover:bg-emerald-400 active:bg-emerald-600 transition-colors text-black font-semibold text-base flex items-center justify-center gap-2 shadow-[0_8px_30px_-8px_rgba(16,185,129,0.6)]"
        >
          Setup Camera
          <ArrowRight className="w-5 h-5" />
        </button>
        <p className="text-center text-[11px] text-zinc-600 mt-3">
          MoveNet · TensorFlow.js · 100% on-device
        </p>
      </div>
    </div>
  );
}

function StatTile({ label, value, icon }) {
  return (
    <div className="rounded-2xl bg-zinc-900/60 border border-zinc-800 px-3 py-3">
      <div className="flex items-center justify-between text-zinc-500 mb-1">
        {icon}
      </div>
      <p className="text-lg font-semibold text-white leading-none">{value}</p>
      <p className="text-[11px] text-zinc-500 mt-1">{label}</p>
    </div>
  );
}

function MiniMetric({ icon, label }) {
  return (
    <div className="rounded-xl bg-black/40 border border-zinc-800 px-2 py-2 flex items-center gap-1.5">
      <span className="text-emerald-400">{icon}</span>
      <span className="text-[11px] text-zinc-300">{label}</span>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Screen: SETUP                                                      */
/* ------------------------------------------------------------------ */

function SetupScreen({ onReady, onBack }) {
  const [status, setStatus] = useState('loading'); // loading | ready | error
  const [error, setError] = useState(null);
  const cancelledRef = useRef(false);

  useEffect(() => {
    cancelledRef.current = false;
    setStatus('loading');
    setError(null);

    (async () => {
      try {
        await loadPoseLibraries();
        if (!cancelledRef.current) setStatus('ready');
      } catch (e) {
        if (!cancelledRef.current) {
          setStatus('error');
          setError(e.message || 'Failed to load model.');
        }
      }
    })();

    return () => {
      cancelledRef.current = true;
    };
  }, []);

  return (
    <div className="flex flex-col h-full min-h-screen px-6 pt-12 pb-8">
      <button
        onClick={onBack}
        className="text-zinc-500 text-sm self-start mb-6 hover:text-zinc-300"
      >
        ← Back
      </button>

      <div className="flex-1 flex flex-col items-center justify-center text-center">
        <div className="relative h-32 w-32 mb-6">
          <div
            className={`absolute inset-0 rounded-full ${
              status === 'ready'
                ? 'bg-emerald-500/15'
                : status === 'error'
                ? 'bg-red-500/15'
                : 'bg-zinc-800/50 animate-pulse'
            }`}
          />
          <div className="absolute inset-0 flex items-center justify-center">
            {status === 'loading' && (
              <Loader2 className="w-12 h-12 text-emerald-500 animate-spin" />
            )}
            {status === 'ready' && (
              <CheckCircle2 className="w-14 h-14 text-emerald-500" />
            )}
            {status === 'error' && (
              <AlertTriangle className="w-12 h-12 text-red-500" />
            )}
          </div>
        </div>

        <h2 className="text-xl font-semibold text-white mb-2">
          {status === 'loading' && 'Loading AI Coach…'}
          {status === 'ready' && 'Coach is ready'}
          {status === 'error' && 'Something went wrong'}
        </h2>
        <p className="text-sm text-zinc-400 max-w-xs leading-relaxed">
          {status === 'loading' &&
            'Downloading MoveNet pose model. This only happens once per session.'}
          {status === 'ready' &&
            'Stand 2–3 meters from the camera so your full body is visible.'}
          {status === 'error' &&
            (error ||
              'Could not load the AI model. Check your connection and try again.')}
        </p>

        {status === 'ready' && (
          <div className="mt-8 w-full grid grid-cols-1 gap-2 text-left">
            <SetupTip n="1" text="Place phone vertically, chest height" />
            <SetupTip n="2" text="Clear space behind you (no other people)" />
            <SetupTip n="3" text="Good lighting on you, not behind you" />
          </div>
        )}
      </div>

      <div className="mt-6">
        {status === 'ready' && (
          <button
            onClick={onReady}
            className="w-full h-14 rounded-2xl bg-emerald-500 hover:bg-emerald-400 active:bg-emerald-600 transition-colors text-black font-semibold text-base flex items-center justify-center gap-2 shadow-[0_8px_30px_-8px_rgba(16,185,129,0.6)]"
          >
            Start Camera & Track
            <Camera className="w-5 h-5" />
          </button>
        )}
        {status === 'error' && (
          <button
            onClick={() => window.location.reload()}
            className="w-full h-14 rounded-2xl bg-zinc-800 hover:bg-zinc-700 transition-colors text-white font-semibold text-base flex items-center justify-center gap-2"
          >
            <RefreshCw className="w-5 h-5" />
            Retry
          </button>
        )}
        {status === 'loading' && (
          <div className="w-full h-14 rounded-2xl bg-zinc-900 border border-zinc-800 text-zinc-500 font-medium text-base flex items-center justify-center">
            Preparing model…
          </div>
        )}
      </div>
    </div>
  );
}

function SetupTip({ n, text }) {
  return (
    <div className="flex items-center gap-3 rounded-xl bg-zinc-900/60 border border-zinc-800 px-3 py-2.5">
      <span className="h-6 w-6 rounded-full bg-emerald-500/15 text-emerald-400 text-xs font-semibold flex items-center justify-center">
        {n}
      </span>
      <span className="text-sm text-zinc-300">{text}</span>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Screen: RECORDING                                                  */
/* ------------------------------------------------------------------ */

function RecordingScreen({ onFinish, onCancel }) {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);
  const detectorRef = useRef(null);
  const rafRef = useRef(null);
  const timerRef = useRef(null);

  // Telemetry refs (mutated inside RAF loop, avoid re-renders)
  const frameCountRef = useRef(0);
  const handsDroppedFramesRef = useRef(0);
  const narrowStanceFramesRef = useRef(0);
  const punchCountRef = useRef(0);
  const leftPunchActiveRef = useRef(false);
  const rightPunchActiveRef = useRef(false);
  const lastWarningUpdateRef = useRef(0);
  const finishedRef = useRef(false);

  const [secondsLeft, setSecondsLeft] = useState(ROUND_SECONDS);
  const [warning, setWarning] = useState(null); // 'guard' | 'stance' | null
  const [livePunches, setLivePunches] = useState(0);
  const [cameraError, setCameraError] = useState(null);
  const [tracking, setTracking] = useState(false);

  const finishRound = useCallback(() => {
    if (finishedRef.current) return;
    finishedRef.current = true;

    const totalFrames = Math.max(1, frameCountRef.current);
    const guardScore = Math.max(
      0,
      100 - (handsDroppedFramesRef.current / totalFrames) * 100,
    );
    const stanceScore = Math.max(
      0,
      100 - (narrowStanceFramesRef.current / totalFrames) * 100,
    );
    const overallScore = (guardScore + stanceScore) / 2;

    onFinish({
      overallScore,
      guardScore,
      stanceScore,
      punches: punchCountRef.current,
      totalFrames,
      handsDroppedFrames: handsDroppedFramesRef.current,
      narrowStanceFrames: narrowStanceFramesRef.current,
      durationSeconds: ROUND_SECONDS,
    });
  }, [onFinish]);

  /* -------- Camera + detector init + RAF loop -------- */
  useEffect(() => {
    let active = true;

    async function init() {
      try {
        if (!window.poseDetection) {
          await loadPoseLibraries();
        }
        const poseDetection = window.poseDetection;

        // Detector
        const detector = await poseDetection.createDetector(
          poseDetection.SupportedModels.MoveNet,
          {
            modelType: poseDetection.movenet.modelType.SINGLEPOSE_LIGHTNING,
          },
        );
        if (!active) {
          detector.dispose?.();
          return;
        }
        detectorRef.current = detector;

        // Camera
        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: 'user',
            width: { ideal: 640 },
            height: { ideal: 480 },
          },
          audio: false,
        });
        if (!active) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;

        const video = videoRef.current;
        if (!video) return;
        video.srcObject = stream;
        await new Promise((resolve) => {
          if (video.readyState >= 2) return resolve();
          video.onloadedmetadata = () => resolve();
        });
        await video.play();
        if (!active) return;

        setTracking(true);
        startTimer();
        runLoop();
      } catch (e) {
        console.error(e);
        if (active) {
          setCameraError(
            e?.name === 'NotAllowedError'
              ? 'Camera permission denied. Please allow camera access.'
              : e?.message || 'Failed to start camera.',
          );
        }
      }
    }

    function startTimer() {
      const startedAt = Date.now();
      timerRef.current = setInterval(() => {
        const elapsed = Math.floor((Date.now() - startedAt) / 1000);
        const remaining = ROUND_SECONDS - elapsed;
        if (remaining <= 0) {
          setSecondsLeft(0);
          clearInterval(timerRef.current);
          timerRef.current = null;
          finishRound();
        } else {
          setSecondsLeft(remaining);
        }
      }, 250);
    }

    async function runLoop() {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      const detector = detectorRef.current;
      if (!video || !canvas || !detector) return;

      const ctx = canvas.getContext('2d');

      const step = async () => {
        if (!active || finishedRef.current) return;

        // Keep canvas synced with intrinsic video size
        if (
          video.videoWidth &&
          (canvas.width !== video.videoWidth ||
            canvas.height !== video.videoHeight)
        ) {
          canvas.width = video.videoWidth;
          canvas.height = video.videoHeight;
        }

        let poses = [];
        try {
          poses = await detector.estimatePoses(video, {
            maxPoses: 1,
            flipHorizontal: false,
          });
        } catch (_e) {
          // swallow transient detection errors
        }

        ctx.clearRect(0, 0, canvas.width, canvas.height);

        if (poses && poses[0]) {
          const keypoints = poses[0].keypoints;
          drawSkeleton(ctx, keypoints);
          analyzePose(keypoints);
        }

        frameCountRef.current += 1;
        rafRef.current = requestAnimationFrame(step);
      };
      rafRef.current = requestAnimationFrame(step);
    }

    function analyzePose(keypoints) {
      const ls = getKp(keypoints, 'left_shoulder');
      const rs = getKp(keypoints, 'right_shoulder');
      const lw = getKp(keypoints, 'left_wrist');
      const rw = getKp(keypoints, 'right_wrist');
      const la = getKp(keypoints, 'left_ankle');
      const ra = getKp(keypoints, 'right_ankle');

      const ok = (k) => k && k.score > KEYPOINT_CONFIDENCE;

      let guardBad = false;
      let stanceBad = false;

      // Guard check
      if (ok(ls) && ok(rs) && ok(lw) && ok(rw)) {
        if (lw.y > ls.y || rw.y > rs.y) {
          guardBad = true;
          handsDroppedFramesRef.current += 1;
        }
      }

      // Stance check
      if (ok(ls) && ok(rs) && ok(la) && ok(ra)) {
        const ankleSpread = Math.abs(la.x - ra.x);
        const shoulderSpread = Math.abs(ls.x - rs.x);
        if (ankleSpread < shoulderSpread * 0.8) {
          stanceBad = true;
          narrowStanceFramesRef.current += 1;
        }
      }

      // Punch detection
      if (ok(ls) && ok(rs)) {
        const shoulderWidth = Math.abs(ls.x - rs.x);
        const threshold = shoulderWidth * 1.5;

        if (ok(lw)) {
          const d = dist(lw, ls);
          if (d > threshold && !leftPunchActiveRef.current) {
            leftPunchActiveRef.current = true;
            punchCountRef.current += 1;
          } else if (d < threshold * 0.7 && leftPunchActiveRef.current) {
            leftPunchActiveRef.current = false;
          }
        }
        if (ok(rw)) {
          const d = dist(rw, rs);
          if (d > threshold && !rightPunchActiveRef.current) {
            rightPunchActiveRef.current = true;
            punchCountRef.current += 1;
          } else if (d < threshold * 0.7 && rightPunchActiveRef.current) {
            rightPunchActiveRef.current = false;
          }
        }
      }

      // Throttled warning UI update
      if (
        frameCountRef.current - lastWarningUpdateRef.current >=
        WARNING_THROTTLE_FRAMES
      ) {
        lastWarningUpdateRef.current = frameCountRef.current;
        setLivePunches(punchCountRef.current);
        if (guardBad) setWarning('guard');
        else if (stanceBad) setWarning('stance');
        else setWarning(null);
      }
    }

    init();

    return () => {
      active = false;
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
      }
      if (detectorRef.current) {
        try {
          detectorRef.current.dispose?.();
        } catch (_e) {
          /* noop */
        }
        detectorRef.current = null;
      }
      if (videoRef.current) {
        try {
          videoRef.current.pause();
          videoRef.current.srcObject = null;
        } catch (_e) {
          /* noop */
        }
      }
    };
  }, [finishRound]);

  const progress = ((ROUND_SECONDS - secondsLeft) / ROUND_SECONDS) * 100;

  return (
    <div className="relative h-full min-h-screen w-full bg-black overflow-hidden">
      {/* Video feed (mirrored) */}
      <video
        ref={videoRef}
        playsInline
        muted
        autoPlay
        className="absolute inset-0 w-full h-full object-cover"
        style={{ transform: 'scaleX(-1)' }}
      />
      {/* Skeleton overlay (mirrored to match video) */}
      <canvas
        ref={canvasRef}
        className="absolute inset-0 w-full h-full object-cover pointer-events-none"
        style={{ transform: 'scaleX(-1)' }}
      />

      {/* Top vignette */}
      <div className="absolute inset-x-0 top-0 h-40 bg-gradient-to-b from-black/80 to-transparent pointer-events-none" />
      {/* Bottom vignette */}
      <div className="absolute inset-x-0 bottom-0 h-48 bg-gradient-to-t from-black/85 to-transparent pointer-events-none" />

      {/* Top HUD */}
      <div className="absolute top-0 inset-x-0 px-5 pt-12">
        <div className="flex items-center justify-between">
          <button
            onClick={onCancel}
            className="px-3 py-1.5 rounded-full bg-black/50 backdrop-blur border border-white/10 text-white text-xs font-medium"
          >
            Cancel
          </button>
          <div className="px-3 py-1.5 rounded-full bg-black/50 backdrop-blur border border-white/10 flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-red-500 animate-pulse" />
            <span className="text-white text-xs font-semibold tracking-wider uppercase">
              {tracking ? 'Tracking' : 'Starting…'}
            </span>
          </div>
          <div className="px-3 py-1.5 rounded-full bg-black/50 backdrop-blur border border-white/10 text-white text-xs font-semibold tabular-nums">
            {String(Math.floor(secondsLeft / 60)).padStart(2, '0')}:
            {String(secondsLeft % 60).padStart(2, '0')}
          </div>
        </div>

        {/* Progress bar */}
        <div className="mt-3 h-1 w-full bg-white/10 rounded-full overflow-hidden">
          <div
            className="h-full bg-emerald-500 transition-[width] duration-200 ease-linear"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>

      {/* Center warning */}
      {warning && (
        <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 flex justify-center pointer-events-none">
          <div
            className={`px-5 py-3 rounded-2xl backdrop-blur-md border flex items-center gap-2 shadow-2xl ${
              warning === 'guard'
                ? 'bg-red-500/20 border-red-500/40 text-red-100'
                : 'bg-amber-500/20 border-amber-500/40 text-amber-100'
            }`}
          >
            <AlertTriangle className="w-5 h-5" />
            <span className="font-semibold text-sm">
              {warning === 'guard' ? 'Keep your hands up!' : 'Widen your stance!'}
            </span>
          </div>
        </div>
      )}

      {/* Bottom HUD */}
      <div className="absolute bottom-0 inset-x-0 px-5 pb-8">
        <div className="grid grid-cols-3 gap-2 mb-4">
          <HudStat label="Punches" value={livePunches} icon={<Zap className="w-3.5 h-3.5" />} />
          <HudStat
            label="Round"
            value={`${ROUND_SECONDS - secondsLeft}s`}
            icon={<Activity className="w-3.5 h-3.5" />}
          />
          <HudStat
            label="Status"
            value={warning ? 'Fix' : 'Good'}
            tone={warning ? 'red' : 'emerald'}
            icon={<Shield className="w-3.5 h-3.5" />}
          />
        </div>

        <button
          onClick={finishRound}
          className="w-full h-12 rounded-2xl bg-white/10 hover:bg-white/15 backdrop-blur border border-white/15 text-white font-semibold text-sm flex items-center justify-center gap-2"
        >
          End Round Early
        </button>
      </div>

      {/* Camera error overlay */}
      {cameraError && (
        <div className="absolute inset-0 bg-black/90 flex flex-col items-center justify-center px-8 text-center">
          <AlertTriangle className="w-12 h-12 text-red-500 mb-4" />
          <h3 className="text-white font-semibold text-lg mb-2">
            Camera unavailable
          </h3>
          <p className="text-zinc-400 text-sm mb-6">{cameraError}</p>
          <button
            onClick={onCancel}
            className="px-6 py-3 rounded-2xl bg-emerald-500 text-black font-semibold"
          >
            Back to Home
          </button>
        </div>
      )}
    </div>
  );
}

function HudStat({ label, value, icon, tone = 'emerald' }) {
  const toneCls =
    tone === 'red'
      ? 'text-red-400'
      : tone === 'amber'
      ? 'text-amber-400'
      : 'text-emerald-400';
  return (
    <div className="rounded-2xl bg-black/50 backdrop-blur border border-white/10 px-3 py-2">
      <div className={`flex items-center gap-1 text-[10px] uppercase tracking-wider ${toneCls}`}>
        {icon}
        <span>{label}</span>
      </div>
      <p className="text-white font-semibold text-base mt-0.5 tabular-nums">
        {value}
      </p>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Skeleton drawing                                                   */
/* ------------------------------------------------------------------ */

function drawSkeleton(ctx, keypoints) {
  ctx.lineWidth = 4;
  ctx.strokeStyle = '#10b981';

  // Bones
  for (const [a, b] of SKELETON_PAIRS) {
    const ka = getKp(keypoints, a);
    const kb = getKp(keypoints, b);
    if (
      ka &&
      kb &&
      ka.score > KEYPOINT_CONFIDENCE &&
      kb.score > KEYPOINT_CONFIDENCE
    ) {
      ctx.beginPath();
      ctx.moveTo(ka.x, ka.y);
      ctx.lineTo(kb.x, kb.y);
      ctx.stroke();
    }
  }

  // Joints
  ctx.fillStyle = '#ffffff';
  for (const k of keypoints) {
    if (k.score > KEYPOINT_CONFIDENCE) {
      ctx.beginPath();
      ctx.arc(k.x, k.y, 4, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

/* ------------------------------------------------------------------ */
/* Screen: PROCESSING                                                 */
/* ------------------------------------------------------------------ */

function ProcessingScreen({ results, onDone }) {
  useEffect(() => {
    const t = setTimeout(onDone, 2000);
    return () => clearTimeout(t);
  }, [onDone]);

  const lines = useMemo(() => {
    if (!results) return [];
    return [
      `Analyzed ${results.totalFrames} frames`,
      `Detected ${results.punches} punches`,
      'Scoring guard discipline…',
      'Scoring stance width…',
    ];
  }, [results]);

  return (
    <div className="flex flex-col h-full min-h-screen px-6 pt-12 pb-8 items-center justify-center text-center">
      <div className="relative h-32 w-32 mb-8">
        <div className="absolute inset-0 rounded-full bg-emerald-500/15 animate-pulse" />
        <div className="absolute inset-0 flex items-center justify-center">
          <Loader2 className="w-14 h-14 text-emerald-500 animate-spin" />
        </div>
      </div>
      <h2 className="text-xl font-semibold text-white mb-2">Analyzing your round</h2>
      <p className="text-sm text-zinc-400 mb-8 max-w-xs">
        Crunching telemetry from MoveNet keypoints to build your scorecard.
      </p>
      <div className="w-full max-w-xs space-y-2 text-left">
        {lines.map((line, i) => (
          <div
            key={i}
            className="flex items-center gap-2 text-sm text-zinc-300 rounded-xl bg-zinc-900/60 border border-zinc-800 px-3 py-2"
          >
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            <span>{line}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Screen: FEEDBACK                                                   */
/* ------------------------------------------------------------------ */

function FeedbackScreen({ results, onHome, onAgain }) {
  if (!results) {
    return (
      <div className="flex flex-col h-full min-h-screen px-6 pt-12 pb-8 items-center justify-center">
        <p className="text-zinc-400">No round data.</p>
        <button
          onClick={onHome}
          className="mt-4 px-5 py-3 rounded-2xl bg-emerald-500 text-black font-semibold"
        >
          Home
        </button>
      </div>
    );
  }

  const overall = Math.round(results.overallScore);
  const guard = Math.round(results.guardScore);
  const stance = Math.round(results.stanceScore);

  const tip = buildTip(results);

  return (
    <div className="flex flex-col h-full min-h-screen px-6 pt-12 pb-8">
      <div className="flex items-center justify-between mb-6">
        <button
          onClick={onHome}
          className="text-zinc-500 text-sm hover:text-zinc-300"
        >
          ← Home
        </button>
        <p className="text-xs text-zinc-500 uppercase tracking-wider">
          Round Summary
        </p>
        <div className="w-12" />
      </div>

      {/* Score ring */}
      <div className="flex flex-col items-center mb-6">
        <ScoreRing score={overall} />
        <p className="mt-3 text-xs uppercase tracking-[0.18em] text-zinc-500 font-medium">
          Overall Score
        </p>
        <p className={`mt-1 text-sm font-medium ${scoreColor(overall)}`}>
          {overall >= 80 ? 'Excellent work' : overall >= 60 ? 'Solid round' : 'Keep grinding'}
        </p>
      </div>

      {/* Subscores */}
      <div className="grid grid-cols-2 gap-3 mb-4">
        <SubScoreCard
          icon={<Shield className="w-4 h-4" />}
          label="Guard"
          score={guard}
        />
        <SubScoreCard
          icon={<Target className="w-4 h-4" />}
          label="Stance"
          score={stance}
        />
      </div>

      {/* Punches & telemetry */}
      <div className="rounded-2xl bg-zinc-900/60 border border-zinc-800 p-4 mb-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-full bg-emerald-500/15 flex items-center justify-center">
              <Zap className="w-5 h-5 text-emerald-400" />
            </div>
            <div>
              <p className="text-sm text-zinc-400">Total punches thrown</p>
              <p className="text-xl font-semibold text-white">{results.punches}</p>
            </div>
          </div>
          <div className="text-right">
            <p className="text-xs text-zinc-500">Per minute</p>
            <p className="text-lg font-semibold text-white tabular-nums">
              {Math.round((results.punches / results.durationSeconds) * 60)}
            </p>
          </div>
        </div>
      </div>

      {/* Coach tip */}
      <div className="rounded-2xl bg-gradient-to-br from-emerald-500/10 to-zinc-900 border border-emerald-500/20 p-4 mb-6">
        <div className="flex items-center gap-2 mb-2">
          <Sparkles className="w-4 h-4 text-emerald-400" />
          <p className="text-xs uppercase tracking-wider text-emerald-400 font-semibold">
            Coach Tip
          </p>
        </div>
        <p className="text-sm text-zinc-200 leading-relaxed">{tip}</p>
      </div>

      <div className="mt-auto space-y-3">
        <button
          onClick={onAgain}
          className="w-full h-14 rounded-2xl bg-emerald-500 hover:bg-emerald-400 transition-colors text-black font-semibold text-base flex items-center justify-center gap-2 shadow-[0_8px_30px_-8px_rgba(16,185,129,0.6)]"
        >
          Train Another Round
          <ChevronRight className="w-5 h-5" />
        </button>
        <button
          onClick={onHome}
          className="w-full h-12 rounded-2xl bg-zinc-900 border border-zinc-800 hover:bg-zinc-800 transition-colors text-zinc-200 font-medium text-sm flex items-center justify-center gap-2"
        >
          <HomeIcon className="w-4 h-4" />
          Back to Home
        </button>
      </div>
    </div>
  );
}

function buildTip(results) {
  const guard = results.guardScore;
  const stance = results.stanceScore;
  const punches = results.punches;

  if (guard < 60 && guard <= stance) {
    return 'Your hands dropped a lot. After every punch, snap your gloves back to your chin — think “shoot, then return.”';
  }
  if (stance < 60 && stance < guard) {
    return 'Your stance went narrow. Keep your feet roughly shoulder-width apart with the lead foot forward, ready to pivot.';
  }
  if (punches < 8) {
    return 'Low work rate this round. Try a steady jab–jab–cross rhythm to build volume without sacrificing form.';
  }
  if (guard >= 85 && stance >= 85) {
    return 'Strong structure throughout the round. Next time, add head movement after each combination to level up.';
  }
  return 'Good balance of guard and stance. Next round, focus on full hip rotation on the rear hand for more power.';
}

function SubScoreCard({ icon, label, score }) {
  return (
    <div className="rounded-2xl bg-zinc-900/60 border border-zinc-800 p-4">
      <div className="flex items-center gap-2 text-zinc-400 mb-2">
        <span className={scoreColor(score)}>{icon}</span>
        <span className="text-xs uppercase tracking-wider">{label}</span>
      </div>
      <p className={`text-2xl font-semibold tabular-nums ${scoreColor(score)}`}>
        {score}
      </p>
      <div className="mt-2 h-1.5 w-full bg-zinc-800 rounded-full overflow-hidden">
        <div
          className={`h-full ${
            score >= 80
              ? 'bg-emerald-500'
              : score >= 60
              ? 'bg-amber-500'
              : 'bg-red-500'
          }`}
          style={{ width: `${clamp(score, 0, 100)}%` }}
        />
      </div>
    </div>
  );
}

function ScoreRing({ score }) {
  const size = 160;
  const stroke = 12;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (clamp(score, 0, 100) / 100) * circumference;

  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke="rgb(39 39 42)"
          strokeWidth={stroke}
          fill="none"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          className={scoreRingColor(score)}
          strokeWidth={stroke}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          style={{ transition: 'stroke-dashoffset 800ms ease-out' }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <p className={`text-5xl font-semibold tabular-nums ${scoreColor(score)}`}>
          {score}
        </p>
        <p className="text-[10px] uppercase tracking-[0.2em] text-zinc-500 mt-1">
          /100
        </p>
      </div>
    </div>
  );
}
