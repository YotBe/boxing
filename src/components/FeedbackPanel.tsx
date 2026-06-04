import { useMemo, useState } from 'react';
import type { Feedback, MovementDefinition } from '../engine/types';

interface WorkoutLog {
  id: string;
  movementId: string;
  movementName: string;
  timestamp: string;
  reps?: number;
  peakSpeed?: number;
  holdTime?: number;
}

interface FeedbackPanelProps {
  feedback: Feedback | null;
  movement: MovementDefinition;
  liveHoldTime: number;
  dynamicStats: any; // DynamicResult | null
  voiceEnabled: boolean;
  soundEnabled: boolean;
  setVoiceEnabled: (v: boolean) => void;
  setSoundEnabled: (s: boolean) => void;
  history: WorkoutLog[];
  onClearHistory: () => void;
  onResetReps: () => void;

  // Combo Coach Additions
  workoutMode: 'practice' | 'combos' | 'analytics';
  setWorkoutMode: (mode: 'practice' | 'combos' | 'analytics') => void;
  activeComboIndex: number;
  setActiveComboIndex: (idx: number) => void;
  comboStepIndex: number;
  combosCompletedCount: number;
  comboStatus: 'idle' | 'calling' | 'waiting' | 'success';
  comboFeedbackText: string;
  startNextCombo: (idx?: number) => void;
  COMBOS: { name: string; sequence: string[] }[];
  onAddCustomCombo: (name: string, sequence: string[]) => void;
  onDeleteCustomCombo: (idx: number) => void;
  voiceCommandsEnabled: boolean;
  setVoiceCommandsEnabled: (enabled: boolean) => void;
  voiceSpeechSupported: boolean;

  // Rounds Workout Additions
  roundModeActive: boolean;
  currentRound: number;
  roundPhase: 'work' | 'rest' | 'inactive';
  roundTimeLeft: number;
  roundCount: number;
  setRoundCount: (c: number) => void;
  roundDurationSec: number;
  setRoundDurationSec: (d: number) => void;
  restDurationSec: number;
  setRestDurationSec: (r: number) => void;
  onToggleRoundSession: () => void;

  // Camera settings
  cameraDevices: MediaDeviceInfo[];
  selectedCameraId: string;
  setSelectedCameraId: (id: string) => void;
}

interface AngleProgressBarProps {
  label: string;
  angle: number;
  min: number;
  max: number;
  inRange: boolean;
  available: boolean;
}

function AngleProgressBar({ label, angle, min, max, inRange, available }: AngleProgressBarProps) {
  const directionPrompt = useMemo(() => {
    if (inRange || !available || Number.isNaN(angle)) return null;
    if (angle < min) {
      return (
        <span className="text-[9px] font-extrabold uppercase px-1.5 py-0.5 rounded bg-amber-500/10 border border-amber-500/20 text-amber-400 flex items-center gap-0.5 animate-pulse">
          Extend ⬆
        </span>
      );
    }
    if (angle > max) {
      return (
        <span className="text-[9px] font-extrabold uppercase px-1.5 py-0.5 rounded bg-amber-500/10 border border-amber-500/20 text-amber-400 flex items-center gap-0.5 animate-pulse">
          Flex ⬇
        </span>
      );
    }
    return null;
  }, [angle, min, max, inRange, available]);

  if (!available || Number.isNaN(angle)) {
    return (
      <div className="flex flex-col gap-1 rounded-xl bg-zinc-900/30 p-3 border border-zinc-800/40">
        <div className="flex justify-between items-center text-xs">
          <span className="text-zinc-500 font-semibold">{label}</span>
          <span className="text-zinc-600 font-mono text-[10px] uppercase tracking-wider">Out of Frame</span>
        </div>
        <div className="h-1.5 bg-zinc-950/50 rounded-full w-full opacity-35" />
      </div>
    );
  }

  const leftPercent = Math.max(0, Math.min(100, (min / 180) * 100));
  const widthPercent = Math.max(0, Math.min(100 - leftPercent, ((max - min) / 180) * 100));
  const markerPercent = Math.max(0, Math.min(100, (angle / 180) * 100));

  return (
    <div className="flex flex-col gap-1.5 rounded-xl bg-zinc-900/50 p-3 border border-zinc-800/60 hover:border-zinc-700/80 transition-all duration-200">
      <div className="flex justify-between items-center text-xs">
        <div className="flex items-center gap-2">
          <span className="text-zinc-300 font-medium">{label}</span>
          {directionPrompt}
        </div>
        <span className={`font-mono text-xs font-semibold ${inRange ? 'text-emerald-400' : 'text-rose-400'}`}>
          {Math.round(angle)}° <span className="text-zinc-500 font-normal">({min}°-{max}°)</span>
        </span>
      </div>
      <div className="relative h-1.5 bg-zinc-950 rounded-full w-full border border-zinc-900/60 overflow-hidden">
        <div
          className={`absolute h-full rounded-full transition-all ${
            inRange ? 'bg-emerald-500/25' : 'bg-rose-500/15'
          }`}
          style={{ left: `${leftPercent}%`, width: `${widthPercent}%` }}
        />
        <div
          className={`absolute h-3 w-1.5 -top-[3px] rounded-full shadow-md transition-all duration-150 -translate-x-1/2 ${
            inRange ? 'bg-emerald-400' : 'bg-rose-500'
          }`}
          style={{ left: `${markerPercent}%` }}
        />
      </div>
    </div>
  );
}

interface ComboBuilderProps {
  onAddCustomCombo: (name: string, sequence: string[]) => void;
  getStrikeName: (id: string) => string;
}

function ComboBuilder({ onAddCustomCombo, getStrikeName }: ComboBuilderProps) {
  const [name, setName] = useState('');
  const [sequence, setSequence] = useState<string[]>([]);
  const [isOpen, setIsOpen] = useState(false);

  const strikesList = [
    'jab', 'cross', 'left-hook', 'right-hook',
    'left-elbow', 'right-elbow', 'left-knee', 'knee',
    'teep', 'right-teep', 'left-kick', 'right-kick'
  ];

  const handleAddStrike = (strike: string) => {
    if (sequence.length >= 8) return;
    setSequence((prev) => [...prev, strike]);
  };

  const handleRemoveStrike = (idx: number) => {
    setSequence((prev) => prev.filter((_, i) => i !== idx));
  };

  const handleSave = () => {
    if (!name.trim()) return;
    if (sequence.length === 0) return;
    onAddCustomCombo(name.trim(), sequence);
    setName('');
    setSequence([]);
    setIsOpen(false);
  };

  if (!isOpen) {
    return (
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        className="w-full rounded-2xl border border-dashed border-zinc-800 hover:border-zinc-700 bg-zinc-950/20 hover:bg-zinc-950/40 p-4 text-xs font-bold text-zinc-400 hover:text-zinc-200 transition-all flex items-center justify-center gap-1.5 active:scale-[0.98] py-3.5"
      >
        <span className="text-red-500 font-bold">+</span> Create Custom Pad Combo
      </button>
    );
  }

  return (
    <div className="rounded-2xl border border-zinc-800/80 bg-zinc-900/30 backdrop-blur-md p-5 shadow-lg flex flex-col gap-4">
      <div className="flex justify-between items-center border-b border-zinc-800/60 pb-2">
        <h4 className="text-xs font-bold text-zinc-200 uppercase tracking-wider font-mono">Custom Combo Builder</h4>
        <button
          type="button"
          onClick={() => setIsOpen(false)}
          className="text-zinc-500 hover:text-zinc-300 text-xs font-bold"
        >
          Cancel
        </button>
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="custom-combo-name" className="text-[9px] font-semibold text-zinc-500 uppercase tracking-wider">Combo Name</label>
        <input
          id="custom-combo-name"
          type="text"
          placeholder="e.g. Boxing Focus"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="rounded-xl bg-zinc-950 border border-zinc-800 text-xs text-zinc-200 p-2.5 outline-none focus:border-zinc-700 transition-all placeholder:text-zinc-700"
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <span className="text-[9px] font-semibold text-zinc-500 uppercase tracking-wider">Strike Sequence</span>
        <div className="min-h-[48px] rounded-xl bg-zinc-950/80 border border-zinc-850 p-2.5 flex flex-wrap gap-1.5 items-center">
          {sequence.length === 0 ? (
            <span className="text-[10px] text-zinc-700 italic select-none">Click weapons below to construct sequence...</span>
          ) : (
            sequence.map((strike, idx) => (
              <button
                key={idx}
                type="button"
                onClick={() => handleRemoveStrike(idx)}
                className="text-[9px] font-bold px-2 py-1 rounded bg-red-500/10 border border-red-500/30 text-red-400 hover:bg-rose-500/20 hover:border-rose-500/35 hover:text-rose-300 transition-all flex items-center gap-1 group"
                title="Click to remove strike"
              >
                <span>{getStrikeName(strike)}</span>
                <span className="text-[8px] text-red-500/50 group-hover:text-rose-500/80">×</span>
              </button>
            ))
          )}
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <span className="text-[9px] font-semibold text-zinc-500 uppercase tracking-wider">Add Strike Weapon</span>
        <div className="grid grid-cols-3 sm:grid-cols-4 gap-1">
          {strikesList.map((strike) => (
            <button
              key={strike}
              type="button"
              onClick={() => handleAddStrike(strike)}
              className="rounded-lg bg-zinc-950 border border-zinc-900 hover:border-zinc-800 text-[10px] font-medium text-zinc-400 py-1.5 hover:text-white transition-all text-center hover:bg-zinc-900/50 truncate"
            >
              {getStrikeName(strike)}
            </button>
          ))}
        </div>
      </div>

      <button
        type="button"
        onClick={handleSave}
        disabled={!name.trim() || sequence.length === 0}
        className="w-full rounded-xl bg-gradient-to-r from-red-650 to-red-750 py-2.5 text-xs font-bold text-white hover:from-red-550 hover:to-red-650 transition-all disabled:opacity-40 shadow-md active:scale-95 mt-1"
      >
        Save Combo to Schedule
      </button>
    </div>
  );
}

export default function FeedbackPanel({
  feedback,
  movement,
  liveHoldTime,
  dynamicStats,
  voiceEnabled,
  soundEnabled,
  setVoiceEnabled,
  setSoundEnabled,
  history,
  onClearHistory,
  onResetReps,

  workoutMode,
  setWorkoutMode,
  activeComboIndex,
  setActiveComboIndex: _setActiveComboIndex,
  comboStepIndex,
  combosCompletedCount,
  comboStatus: _comboStatus,
  comboFeedbackText: _comboFeedbackText,
  startNextCombo,
  COMBOS,
  onAddCustomCombo,
  onDeleteCustomCombo,
  voiceCommandsEnabled,
  setVoiceCommandsEnabled,
  voiceSpeechSupported,

  roundModeActive,
  currentRound,
  roundPhase,
  roundTimeLeft,
  roundCount,
  setRoundCount,
  roundDurationSec,
  setRoundDurationSec,
  restDurationSec,
  setRestDurationSec,
  onToggleRoundSession,

  cameraDevices,
  selectedCameraId,
  setSelectedCameraId,
}: FeedbackPanelProps) {
  const getStrikeName = (id: string) => {
    if (id === 'jab') return 'Left Jab';
    if (id === 'cross') return 'Right Cross';
    if (id === 'knee') return 'Right Knee';
    if (id === 'teep') return 'Left Teep';
    if (id === 'left-hook') return 'Left Hook';
    if (id === 'right-elbow') return 'Right Elbow Strike';
    if (id === 'left-elbow') return 'Left Elbow Strike';
    if (id === 'right-hook') return 'Right Hook';
    if (id === 'left-knee') return 'Left Knee Strike';
    if (id === 'right-teep') return 'Right Teep (Front Kick)';
    if (id === 'left-kick') return 'Left Roundhouse Kick';
    if (id === 'right-kick') return 'Right Roundhouse Kick';
    return id;
  };

  const formatTime = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  const cue = feedback?.activeCues?.[0];

  // Stats aggregation for analytics charts
  const stats = useMemo(() => {
    let punches = 0;
    let elbows = 0;
    let knees = 0;
    let kicks = 0;
    let totalReps = 0;
    let avgSpeedSum = 0;
    let avgSpeedCount = 0;
    let totalHold = 0;
    let combosCompleted = 0;

    history.forEach((log) => {
      if (log.movementId === 'muaythai-combo') {
        combosCompleted += 1;
        return;
      }
      if (log.reps !== undefined) {
        totalReps += log.reps;
        const id = log.movementId;
        if (['jab', 'cross', 'left-hook', 'right-hook'].includes(id)) {
          punches += log.reps;
        } else if (['left-elbow', 'right-elbow'].includes(id)) {
          elbows += log.reps;
        } else if (['left-knee', 'knee'].includes(id)) {
          knees += log.reps;
        } else if (['teep', 'right-teep', 'left-kick', 'right-kick'].includes(id)) {
          kicks += log.reps;
        }
      }
      if (log.peakSpeed !== undefined && log.peakSpeed > 0) {
        avgSpeedSum += log.peakSpeed;
        avgSpeedCount += 1;
      }
      if (log.holdTime !== undefined) {
        totalHold += log.holdTime;
      }
    });

    const avgSpeed = avgSpeedCount > 0 ? Math.round(avgSpeedSum / avgSpeedCount) : 0;

    return {
      punches,
      elbows,
      knees,
      kicks,
      totalReps,
      avgSpeed,
      totalHold,
      combosCompleted,
    };
  }, [history]);

  const donutSegments = useMemo(() => {
    const total = stats.punches + stats.elbows + stats.knees + stats.kicks;
    if (total === 0) return [];

    const data = [
      { name: 'Punches', value: stats.punches, color: '#f59e0b' },
      { name: 'Elbows', value: stats.elbows, color: '#06b6d4' },
      { name: 'Knees', value: stats.knees, color: '#10b981' },
      { name: 'Kicks', value: stats.kicks, color: '#6366f1' },
    ].filter((d) => d.value > 0);

    const circumference = 314.16; // 2 * PI * 50
    let accumulatedPercent = 0;

    return data.map((d) => {
      const percent = d.value / total;
      const strokeLength = circumference * percent;
      const strokeOffset = circumference - strokeLength + circumference * accumulatedPercent;
      accumulatedPercent += percent;
      return {
        ...d,
        percent: Math.round(percent * 100),
        strokeLength,
        strokeOffset,
      };
    });
  }, [stats]);

  const velocityTrend = useMemo(() => {
    const speedLogs = history
      .filter((log) => log.peakSpeed !== undefined && log.peakSpeed > 0)
      .slice(0, 10)
      .reverse();

    if (speedLogs.length < 2) return null;

    const speeds = speedLogs.map((log) => log.peakSpeed as number);
    const minSpeed = Math.min(...speeds) * 0.9;
    const maxSpeed = Math.max(...speeds) * 1.1;
    const speedRange = maxSpeed - minSpeed;

    const width = 240;
    const height = 80;
    const padding = 10;

    const points = speedLogs.map((log, idx) => {
      const x = padding + (idx / (speedLogs.length - 1)) * (width - 2 * padding);
      const val = log.peakSpeed as number;
      const y = height - padding - ((val - minSpeed) / (speedRange || 1)) * (height - 2 * padding);
      return { x, y, speed: val };
    });

    const pathData = points.reduce((acc, p, idx) => {
      return idx === 0 ? `M ${p.x} ${p.y}` : `${acc} L ${p.x} ${p.y}`;
    }, '');

    return {
      points,
      pathData,
      width,
      height,
    };
  }, [history]);

  return (
    <div className="flex flex-col gap-5">
      {/* Mode Selector Tabs */}
      <div className="flex rounded-2xl bg-zinc-950/60 border border-zinc-800/80 p-1.5 shadow-md gap-1">
        <button
          type="button"
          onClick={() => setWorkoutMode('practice')}
          className={`flex-1 rounded-xl py-2.5 text-xs font-bold transition-all ${
            workoutMode === 'practice'
              ? 'bg-zinc-900 text-white shadow'
              : 'text-zinc-400 hover:text-zinc-200'
          }`}
        >
          Single Practice
        </button>
        <button
          type="button"
          onClick={() => {
            setWorkoutMode('combos');
            startNextCombo(0);
          }}
          className={`flex-1 rounded-xl py-2.5 text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${
            workoutMode === 'combos'
              ? 'bg-gradient-to-r from-red-600 to-red-700 text-white shadow shadow-red-600/10'
              : 'text-zinc-400 hover:text-zinc-200'
          }`}
        >
          <span className="h-1.5 w-1.5 rounded-full bg-red-400 animate-ping" />
          Combo Coach
        </button>
        <button
          type="button"
          onClick={() => setWorkoutMode('analytics')}
          className={`flex-1 rounded-xl py-2.5 text-xs font-bold transition-all ${
            workoutMode === 'analytics'
              ? 'bg-zinc-900 text-white shadow'
              : 'text-zinc-400 hover:text-zinc-200'
          }`}
        >
          Analytics
        </button>
      </div>

      {/* Camera Input Device Selector */}
      {cameraDevices.length > 0 && (
        <div className="rounded-2xl border border-zinc-800/80 bg-zinc-900/30 backdrop-blur-md p-4 shadow-lg flex flex-col gap-2">
          <div className="flex justify-between items-center">
            <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-500 font-mono">Active Device</span>
            <span className="text-[9px] font-extrabold px-2 py-0.5 rounded bg-zinc-800/55 text-zinc-400 border border-zinc-850 uppercase">Webcam</span>
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="camera-select" className="sr-only">Select Video Input Device</label>
            <select
              id="camera-select"
              value={selectedCameraId}
              onChange={(e) => setSelectedCameraId(e.target.value)}
              className="w-full rounded-xl bg-zinc-950 border border-zinc-800 hover:border-zinc-700 text-xs text-zinc-300 p-2.5 outline-none focus:border-zinc-600 transition-all font-medium cursor-pointer"
            >
              {cameraDevices.map((device) => (
                <option key={device.deviceId} value={device.deviceId}>
                  {device.label || `Camera ${device.deviceId.slice(0, 5)}`}
                </option>
              ))}
            </select>
          </div>
        </div>
      )}

      {/* --- ROUNDS WORKOUT TIMER CARD --- */}
      <div className="rounded-2xl border border-zinc-800/80 bg-zinc-900/30 backdrop-blur-md p-5 shadow-lg relative overflow-hidden">
        <div className="absolute right-0 top-0 w-32 h-32 bg-red-600/5 rounded-full filter blur-2xl pointer-events-none" />
        
        <div className="flex justify-between items-start mb-3">
          <div>
            <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-500 font-mono">Workout Flow</span>
            <h3 className="text-sm font-bold text-zinc-200 mt-0.5">Muay Thai Round Timer</h3>
          </div>
          {roundModeActive && (
            <span className={`text-[9px] font-extrabold px-2 py-0.5 rounded-md ${
              roundPhase === 'work'
                ? 'bg-red-500/20 text-red-400 border border-red-500/30 animate-pulse'
                : 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
            }`}>
              {roundPhase === 'work' ? 'FIGHTING' : 'REST PHASE'}
            </span>
          )}
        </div>

        {!roundModeActive ? (
          /* Timer Settings Configuration Panel */
          <div className="flex flex-col gap-3.5">
            <div className="grid grid-cols-3 gap-2.5">
              {/* Rounds config */}
              <div className="flex flex-col gap-1">
                <label htmlFor="round-count-select" className="text-[9px] font-semibold text-zinc-500 uppercase cursor-pointer">Rounds</label>
                <select
                  id="round-count-select"
                  value={roundCount}
                  onChange={(e) => setRoundCount(Number(e.target.value))}
                  className="rounded-lg bg-zinc-950 border border-zinc-800 text-xs text-zinc-300 p-1.5 focus:border-zinc-700 outline-none cursor-pointer"
                >
                  {[1, 2, 3, 4, 5].map((r) => (
                    <option key={r} value={r}>{r} Rnd</option>
                  ))}
                </select>
              </div>

              {/* Work duration config */}
              <div className="flex flex-col gap-1">
                <label htmlFor="work-time-select" className="text-[9px] font-semibold text-zinc-500 uppercase cursor-pointer">Work Time</label>
                <select
                  id="work-time-select"
                  value={roundDurationSec}
                  onChange={(e) => setRoundDurationSec(Number(e.target.value))}
                  className="rounded-lg bg-zinc-950 border border-zinc-800 text-xs text-zinc-300 p-1.5 focus:border-zinc-700 outline-none cursor-pointer"
                >
                  <option value={30}>30s</option>
                  <option value={60}>1:00</option>
                  <option value={90}>1:30</option>
                  <option value={120}>2:00</option>
                  <option value={180}>3:00</option>
                </select>
              </div>

              {/* Rest duration config */}
              <div className="flex flex-col gap-1">
                <label htmlFor="rest-time-select" className="text-[9px] font-semibold text-zinc-500 uppercase cursor-pointer">Rest Time</label>
                <select
                  id="rest-time-select"
                  value={restDurationSec}
                  onChange={(e) => setRestDurationSec(Number(e.target.value))}
                  className="rounded-lg bg-zinc-950 border border-zinc-800 text-xs text-zinc-300 p-1.5 focus:border-zinc-700 outline-none cursor-pointer"
                >
                  <option value={15}>15s</option>
                  <option value={30}>30s</option>
                  <option value={45}>45s</option>
                  <option value={60}>1:00</option>
                </select>
              </div>
            </div>

            <button
              type="button"
              onClick={onToggleRoundSession}
              className="w-full rounded-xl bg-gradient-to-r from-red-600 to-red-700 py-2.5 text-xs font-bold text-white hover:from-red-500 hover:to-red-600 transition-all shadow-md flex items-center justify-center gap-1.5 active:scale-[0.98]"
            >
              <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z" clipRule="evenodd" />
              </svg>
              Start Muay Thai Session
            </button>
          </div>
        ) : (
          /* Live Active Timer Display Panel */
          <div className="flex items-center justify-between bg-zinc-950/40 border border-zinc-800/80 rounded-xl p-3.5 shadow-inner">
            <div className="flex flex-col">
              <span className="text-[9px] font-bold uppercase text-zinc-500 tracking-wider font-mono">
                Round {currentRound} of {roundCount}
              </span>
              <span className="text-3xl font-black text-white tabular-nums font-mono mt-0.5">
                {formatTime(roundTimeLeft)}
              </span>
            </div>
            <button
              type="button"
              onClick={onToggleRoundSession}
              className="rounded-xl bg-red-600/10 border border-red-500/30 hover:bg-red-600/25 px-4.5 py-2.5 text-xs font-bold text-red-400 transition-all active:scale-[0.96]"
            >
              Stop Workout
            </button>
          </div>
        )}
      </div>

      {/* --- COMBO COACH (PAD WORK) VIEW PANEL --- */}
      {workoutMode === 'combos' && (
        <>
          {/* Active Combo Progress */}
          <div className="rounded-2xl border border-zinc-800/80 bg-zinc-900/30 backdrop-blur-md p-5 shadow-lg relative overflow-hidden">
            <div className="absolute right-0 top-0 w-32 h-32 bg-amber-600/10 rounded-full filter blur-2xl pointer-events-none" />
            
            <span className="text-[10px] font-bold uppercase tracking-wider text-amber-500">Active Combo Target</span>
            <h3 className="text-lg font-extrabold text-zinc-100 tracking-tight mt-1">
              {COMBOS[activeComboIndex]?.name}
            </h3>

            {/* Strike list sequence */}
            <div className="mt-4 flex flex-col gap-2">
              {COMBOS[activeComboIndex]?.sequence.map((strikeId, i) => {
                const isPassed = i < comboStepIndex;
                const isCurrent = i === comboStepIndex;
                return (
                  <div
                    key={i}
                    className={`flex items-center justify-between rounded-xl p-3 border transition-all ${
                      isPassed
                        ? 'bg-emerald-950/20 border-emerald-500/30 text-emerald-400'
                        : isCurrent
                          ? 'bg-amber-500/10 border-amber-500/40 text-amber-300 font-bold scale-[1.01]'
                          : 'bg-zinc-950/30 border-zinc-900/60 text-zinc-500'
                    }`}
                  >
                    <div className="flex items-center gap-2 text-xs">
                      <span className="font-mono text-[10px] font-bold h-5 w-5 rounded-full border flex items-center justify-center border-current">
                        {i + 1}
                      </span>
                      <span>{getStrikeName(strikeId)}</span>
                    </div>
                    <span className="text-[10px] font-bold uppercase tracking-wider">
                      {isPassed ? '✓ HIT' : isCurrent ? 'PENDING' : 'LOCKED'}
                    </span>
                  </div>
                );
              })}
            </div>

            {/* Callout Info */}
            <div className="mt-4 border-t border-zinc-800/60 pt-3.5 flex justify-between items-center">
              <div>
                <span className="text-[10px] text-zinc-500 font-medium">Combos Hit</span>
                <div className="text-2xl font-black text-white">{combosCompletedCount}</div>
              </div>
              <button
                type="button"
                onClick={() => startNextCombo()}
                className="rounded-xl bg-amber-600/20 hover:bg-amber-600/30 border border-amber-500/30 px-4 py-2 text-xs font-bold text-amber-300 transition-all active:scale-[0.97]"
              >
                Skip Combo
              </button>
            </div>
          </div>

          {/* Audio controls */}
          <div className="rounded-2xl border border-zinc-800/80 bg-zinc-900/30 backdrop-blur-md p-5 shadow-lg">
            <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">Audio Assistant</span>
            <div className="grid grid-cols-2 gap-3 mt-3">
              <label htmlFor="trainer-voice-combos" className="flex items-center justify-between cursor-pointer rounded-xl bg-zinc-950/30 p-2.5 border border-zinc-800/50 hover:border-zinc-700/60 transition-all">
                <span className="text-xs font-semibold text-zinc-300">Trainer Voice</span>
                <input
                  id="trainer-voice-combos"
                  type="checkbox"
                  checked={voiceEnabled}
                  onChange={(e) => setVoiceEnabled(e.target.checked)}
                  className="rounded text-amber-500 bg-zinc-800 border-zinc-700 h-4 w-4 cursor-pointer"
                />
              </label>

              <label htmlFor="target-chimes-combos" className="flex items-center justify-between cursor-pointer rounded-xl bg-zinc-950/30 p-2.5 border border-zinc-800/50 hover:border-zinc-700/60 transition-all">
                <span className="text-xs font-semibold text-zinc-300">Target Chimes</span>
                <input
                  id="target-chimes-combos"
                  type="checkbox"
                  checked={soundEnabled}
                  onChange={(e) => setSoundEnabled(e.target.checked)}
                  className="rounded text-amber-500 bg-zinc-800 border-zinc-700 h-4 w-4 cursor-pointer"
                />
              </label>
            </div>

            {voiceSpeechSupported && (
              <label htmlFor="voice-commands-combos" className="flex items-center justify-between cursor-pointer rounded-xl bg-zinc-950/30 p-2.5 border border-zinc-800/50 hover:border-zinc-700/60 transition-all mt-3">
                <div className="flex flex-col">
                  <span className="text-xs font-semibold text-zinc-300 flex items-center gap-1.5">
                    <span className="h-1.5 w-1.5 rounded-full bg-amber-400 animate-ping" />
                    Hands-Free Voice Controls
                  </span>
                  <span className="text-[10px] text-zinc-500 font-medium mt-0.5">Say: "Coach, next", "Coach, start", or "Coach, stop"</span>
                </div>
                <input
                  id="voice-commands-combos"
                  type="checkbox"
                  checked={voiceCommandsEnabled}
                  onChange={(e) => setVoiceCommandsEnabled(e.target.checked)}
                  className="rounded text-amber-500 bg-zinc-800 border-zinc-700 h-4 w-4 cursor-pointer"
                />
              </label>
            )}
          </div>

          {/* Combo Builder Panel */}
          <ComboBuilder onAddCustomCombo={onAddCustomCombo} getStrikeName={getStrikeName} />

          {/* Pad Combos Selection Grid */}
          <div className="rounded-2xl border border-zinc-800/80 bg-zinc-900/30 backdrop-blur-md p-5 shadow-lg">
            <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">Pad Training Schedule</span>
            <h3 className="text-sm font-bold text-zinc-200 mt-1 mb-3">Available Combos</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {COMBOS.map((combo, idx) => {
                const isActive = idx === activeComboIndex;
                const isCustom = idx >= 14; // Default count is 14
                return (
                  <div key={idx} className="relative group/item">
                    <button
                      type="button"
                      onClick={() => startNextCombo(idx)}
                      className={`w-full text-left rounded-xl p-3 border transition-all text-xs flex flex-col justify-between ${
                        isActive
                          ? 'bg-amber-600/10 border-amber-500/40 text-amber-300 shadow-md shadow-amber-500/5'
                          : 'bg-zinc-950/30 border-zinc-900/60 text-zinc-400 hover:border-zinc-800 hover:bg-zinc-900/40 hover:text-zinc-200'
                      }`}
                    >
                      <span className="font-extrabold pr-6">{combo.name}</span>
                      <span className="text-[10px] text-zinc-500 mt-1 uppercase tracking-wide truncate">
                        {combo.sequence.join(' - ')}
                      </span>
                    </button>
                    {isCustom && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onDeleteCustomCombo(idx);
                        }}
                        className="absolute right-2.5 top-2.5 p-1 text-zinc-600 hover:text-rose-400 rounded-lg hover:bg-rose-500/10 border border-transparent hover:border-rose-500/20 transition-all opacity-0 group-hover/item:opacity-100"
                        title="Delete Custom Combo"
                      >
                        <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </>
      )}

      {/* --- SINGLE PRACTICE MODE PANEL --- */}
      {workoutMode === 'practice' && (
        <>
          {/* Stance Feedback Verdict */}
          {feedback && (
            <div
              className={`rounded-2xl p-5 border transition-all duration-300 shadow-lg ${
                feedback.ok
                  ? 'bg-emerald-950/20 border-emerald-500/30 ring-1 ring-emerald-500/10'
                  : 'bg-rose-950/20 border-rose-500/30 ring-1 ring-rose-500/10'
              }`}
            >
              <div className="flex items-center gap-2.5">
                {feedback.ok ? (
                  <div className="flex h-8 w-8 items-center justify-center rounded-full bg-emerald-500/20 text-emerald-400">
                    <svg className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                    </svg>
                  </div>
                ) : (
                  <div className="flex h-8 w-8 items-center justify-center rounded-full bg-rose-500/20 text-rose-400 animate-pulse">
                    <svg className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                    </svg>
                  </div>
                )}
                <div>
                  <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">Practice Form</span>
                  <h2 className={`text-xl font-extrabold tracking-tight ${feedback.ok ? 'text-emerald-400' : 'text-rose-400'}`}>
                    {feedback.ok ? `Good ${movement.name}` : 'Form Adjustment'}
                  </h2>
                </div>
              </div>

              {!feedback.ok && cue && (
                <div className="mt-3 flex items-start gap-2 rounded-xl bg-rose-500/10 p-3.5 border border-rose-500/20 text-sm font-semibold text-rose-200 animate-pulse">
                  <svg className="h-5 w-5 text-rose-400 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                  </svg>
                  <span>{cue}</span>
                </div>
              )}
            </div>
          )}

          {/* Practice stats & audio */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="rounded-2xl border border-zinc-800/80 bg-zinc-900/30 backdrop-blur-md p-5 flex flex-col justify-between shadow-lg relative overflow-hidden">
              <div className="absolute right-0 top-0 w-32 h-32 bg-violet-600/10 rounded-full filter blur-2xl pointer-events-none" />
              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">Activity Stats</span>
                {movement.dynamics ? (
                  <div className="mt-2 flex items-baseline gap-4">
                    <span className="text-5xl font-black text-white tracking-tight tabular-nums">
                      {dynamicStats?.reps ?? 0}
                    </span>
                    <span className="text-zinc-400 text-sm font-medium">strikes thrown</span>
                  </div>
                ) : (
                  <div className="mt-2 flex items-baseline gap-3">
                    <span className="text-4xl font-black text-white tracking-tight tabular-nums">
                      {liveHoldTime}s
                    </span>
                    <span className="text-zinc-400 text-sm font-medium">guard held</span>
                  </div>
                )}
              </div>

              <div className="mt-4 flex flex-col gap-1.5 border-t border-zinc-800/60 pt-3.5">
                {movement.dynamics ? (
                  <>
                    <div className="flex justify-between text-xs">
                      <span className="text-zinc-400">Phase:</span>
                      <span className="font-semibold text-zinc-200 uppercase tracking-wide">
                        {dynamicStats?.phase ?? 'unknown'}
                      </span>
                    </div>
                    <div className="flex justify-between text-xs">
                      <span className="text-zinc-400">Top Speed:</span>
                      <span className="font-semibold font-mono text-zinc-200">
                        {dynamicStats?.peakVelocityDegPerSec ? `${Math.round(dynamicStats.peakVelocityDegPerSec)}°/s` : '0°/s'}
                      </span>
                    </div>
                  </>
                ) : (
                  <div className="flex justify-between text-xs">
                    <span className="text-zinc-400">Guard Status:</span>
                    <span className={`font-semibold ${feedback?.ok ? 'text-emerald-400' : 'text-zinc-500'}`}>
                      {feedback?.ok ? 'Active Guard' : 'Inactive'}
                    </span>
                  </div>
                )}
              </div>

              <button
                type="button"
                onClick={onResetReps}
                className="mt-4 w-full rounded-xl bg-zinc-800/80 border border-zinc-700/50 py-2.5 text-xs font-bold text-zinc-300 hover:bg-zinc-700 hover:text-white transition-all shadow-md active:scale-[0.98]"
              >
                Reset Reps
              </button>
            </div>

            {/* Audio Assistant */}
            <div className="rounded-2xl border border-zinc-800/80 bg-zinc-900/30 backdrop-blur-md p-5 flex flex-col justify-between shadow-lg relative overflow-hidden">
              <div className="absolute right-0 top-0 w-32 h-32 bg-emerald-600/10 rounded-full filter blur-2xl pointer-events-none" />
              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">Audio Assistant</span>
                <h3 className="text-sm font-bold text-zinc-200 mt-1">Live Coaching Audio</h3>
                <p className="text-zinc-400 text-xs mt-1">Setup voice and hit chiming tones during practice.</p>
              </div>

              <div className="mt-4 flex flex-col gap-3">
                <label htmlFor="trainer-voice-practice" className="flex items-center justify-between cursor-pointer rounded-xl bg-zinc-950/30 p-2.5 border border-zinc-800/50 hover:border-zinc-700/60 transition-all">
                  <div className="flex flex-col">
                    <span className="text-xs font-semibold text-zinc-300">Voice Coach</span>
                    <span className="text-[10px] text-zinc-500">Speak form corrections</span>
                  </div>
                  <input
                    id="trainer-voice-practice"
                    type="checkbox"
                    checked={voiceEnabled}
                    onChange={(e) => setVoiceEnabled(e.target.checked)}
                    className="rounded text-emerald-500 bg-zinc-800 border-zinc-700 h-4 w-4 cursor-pointer"
                  />
                </label>

                <label htmlFor="target-chimes-practice" className="flex items-center justify-between cursor-pointer rounded-xl bg-zinc-950/30 p-2.5 border border-zinc-800/50 hover:border-zinc-700/60 transition-all">
                  <div className="flex flex-col">
                    <span className="text-xs font-semibold text-zinc-300">Hit Chimes</span>
                    <span className="text-[10px] text-zinc-500">Sound on clean strikes</span>
                  </div>
                  <input
                    id="target-chimes-practice"
                    type="checkbox"
                    checked={soundEnabled}
                    onChange={(e) => setSoundEnabled(e.target.checked)}
                    className="rounded text-emerald-500 bg-zinc-800 border-zinc-700 h-4 w-4 cursor-pointer"
                  />
                </label>
              </div>
            </div>
          </div>

          {/* Joint Analysis */}
          {feedback && (
            <div className="rounded-2xl border border-zinc-800/80 bg-zinc-900/30 backdrop-blur-md p-5 shadow-lg">
              <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">Live Joint Analysis</span>
              <h3 className="text-sm font-bold text-zinc-200 mt-1 mb-3">Form Details</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                {feedback.joints.map((j) => {
                  const spec = movement.joints.find((s) => s.id === j.id);
                  return (
                    <AngleProgressBar
                      key={j.id}
                      label={spec?.label ?? j.id}
                      angle={j.angle}
                      min={spec?.targetMin ?? 0}
                      max={spec?.targetMax ?? 180}
                      inRange={j.inRange}
                      available={j.available}
                    />
                  );
                })}
              </div>
            </div>
          )}
        </>
      )}

      {/* --- DETAILED ANALYTICS VIEW --- */}
      {workoutMode === 'analytics' && (
        <div className="flex flex-col gap-5">
          {/* Summary Cards */}
          <div className="grid grid-cols-2 gap-3.5">
            <div className="rounded-2xl border border-zinc-800/80 bg-zinc-900/30 backdrop-blur-md p-4 shadow-lg flex flex-col justify-between">
              <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-500 font-mono">Total Reps</span>
              <div className="mt-1 flex items-baseline gap-2">
                <span className="text-3xl font-black text-white tracking-tight tabular-nums">
                  {stats.totalReps}
                </span>
                <span className="text-[10px] text-zinc-500 font-medium">Strikes</span>
              </div>
            </div>
            
            <div className="rounded-2xl border border-zinc-800/80 bg-zinc-900/30 backdrop-blur-md p-4 shadow-lg flex flex-col justify-between">
              <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-500 font-mono">Avg Strike Speed</span>
              <div className="mt-1 flex items-baseline gap-2">
                <span className="text-3xl font-black text-white tracking-tight tabular-nums">
                  {stats.avgSpeed}
                </span>
                <span className="text-[10px] text-zinc-500 font-mono">°/s</span>
              </div>
            </div>

            <div className="rounded-2xl border border-zinc-800/80 bg-zinc-900/30 backdrop-blur-md p-4 shadow-lg flex flex-col justify-between">
              <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-500 font-mono">Guard Held</span>
              <div className="mt-1 flex items-baseline gap-2">
                <span className="text-3xl font-black text-white tracking-tight tabular-nums">
                  {stats.totalHold}
                </span>
                <span className="text-[10px] text-zinc-500 font-medium">sec</span>
              </div>
            </div>

            <div className="rounded-2xl border border-zinc-800/80 bg-zinc-900/30 backdrop-blur-md p-4 shadow-lg flex flex-col justify-between">
              <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-500 font-mono">Pad Combos Hit</span>
              <div className="mt-1 flex items-baseline gap-2">
                <span className="text-3xl font-black text-white tracking-tight tabular-nums">
                  {stats.combosCompleted}
                </span>
                <span className="text-[10px] text-zinc-500 font-medium">Done</span>
              </div>
            </div>
          </div>

          {/* Donut Chart: Strike Split */}
          <div className="rounded-2xl border border-zinc-800/80 bg-zinc-900/30 backdrop-blur-md p-5 shadow-lg flex flex-col sm:flex-row items-center gap-5 justify-between relative overflow-hidden">
            <div className="absolute right-0 top-0 w-32 h-32 bg-emerald-600/5 rounded-full filter blur-2xl pointer-events-none" />
            <div className="flex-1 w-full">
              <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">Distribution analysis</span>
              <h3 className="text-sm font-bold text-zinc-200 mt-1 mb-3">Strike Type Proportions</h3>
              {donutSegments.length === 0 ? (
                <p className="text-zinc-500 text-xs">No strike data recorded yet. Switch to Single Practice or Combos and start training!</p>
              ) : (
                <div className="flex flex-col gap-2.5">
                  {donutSegments.map((seg, i) => (
                    <div key={i} className="flex items-center gap-2 text-xs">
                      <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ backgroundColor: seg.color }} />
                      <span className="text-zinc-400 font-semibold">{seg.name}:</span>
                      <span className="font-bold text-zinc-250 font-mono">{seg.percent}%</span>
                      <span className="text-[10px] text-zinc-650 font-normal">({seg.value} hits)</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {donutSegments.length > 0 && (
              <div className="relative flex items-center justify-center shrink-0">
                <svg width="120" height="120" viewBox="0 0 120 120" className="transform -rotate-90">
                  <circle cx="60" cy="60" r="50" fill="transparent" stroke="#18181b" strokeWidth="12" />
                  {donutSegments.map((seg, i) => (
                    <circle
                      key={i}
                      cx="60"
                      cy="60"
                      r="50"
                      fill="transparent"
                      stroke={seg.color}
                      strokeWidth="12"
                      strokeDasharray="314.16"
                      strokeDashoffset={seg.strokeOffset}
                      strokeLinecap="butt"
                      className="transition-all duration-500 ease-out"
                    />
                  ))}
                </svg>
                <div className="absolute flex flex-col items-center justify-center">
                  <span className="text-[9px] font-bold uppercase text-zinc-500 font-mono">Total</span>
                  <span className="text-lg font-black text-white">{stats.totalReps}</span>
                </div>
              </div>
            )}
          </div>

          {/* Line Chart: Velocity Progress */}
          <div className="rounded-2xl border border-zinc-800/80 bg-zinc-900/30 backdrop-blur-md p-5 shadow-lg relative overflow-hidden">
            <div className="absolute right-0 top-0 w-32 h-32 bg-amber-600/5 rounded-full filter blur-2xl pointer-events-none" />
            <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">Speed Progression</span>
            <h3 className="text-sm font-bold text-zinc-200 mt-1 mb-4">Peak Velocity Trend (Last 10 sets)</h3>
            
            {!velocityTrend ? (
              <div className="text-zinc-550 text-xs py-4 text-center italic">
                Need at least 2 recorded speed-tracked sets to trace speed progression.
              </div>
            ) : (
              <div className="w-full h-[95px] flex items-center justify-center pr-3">
                <svg width="100%" height="80" viewBox="0 0 240 80" className="overflow-visible">
                  {/* Grid lines */}
                  <line x1="0" y1="10" x2="240" y2="10" stroke="#27272a" strokeWidth="0.5" strokeDasharray="2,2" />
                  <line x1="0" y1="40" x2="240" y2="40" stroke="#27272a" strokeWidth="0.5" strokeDasharray="2,2" />
                  <line x1="0" y1="70" x2="240" y2="70" stroke="#27272a" strokeWidth="0.5" strokeDasharray="2,2" />

                  {/* The Line */}
                  <path
                    d={velocityTrend.pathData}
                    fill="none"
                    stroke="#f59e0b"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />

                  {/* Points */}
                  {velocityTrend.points.map((p, idx) => (
                    <g key={idx} className="group/dot cursor-pointer">
                      <circle
                        cx={p.x}
                        cy={p.y}
                        r="3.5"
                        fill="#09090b"
                        stroke="#f59e0b"
                        strokeWidth="1.5"
                      />
                      <circle
                        cx={p.x}
                        cy={p.y}
                        r="6"
                        fill="transparent"
                        className="hover:fill-amber-500/10 transition-colors"
                      />
                      <text
                        x={p.x}
                        y={p.y - 8}
                        textAnchor="middle"
                        fill="#f4f4f5"
                        fontSize="7"
                        fontWeight="extrabold"
                        className="opacity-0 group-hover/dot:opacity-100 transition-opacity duration-200 pointer-events-none fill-zinc-100 font-mono filter drop-shadow"
                      >
                        {Math.round(p.speed)}°/s
                      </text>
                    </g>
                  ))}
                </svg>
              </div>
            )}
          </div>
        </div>
      )}

      {/* --- WORKOUT LOG HISTORY (SHARED) --- */}
      <div className="rounded-2xl border border-zinc-800/80 bg-zinc-900/30 backdrop-blur-md p-5 shadow-lg flex flex-col gap-3">
        <div className="flex justify-between items-center">
          <div>
            <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">Session History</span>
            <h3 className="text-sm font-bold text-zinc-200 mt-1">Completed Sets</h3>
          </div>
          {history.length > 0 && (
            <button
              type="button"
              onClick={onClearHistory}
              className="text-xs font-semibold text-rose-400 hover:text-rose-300 transition-colors flex items-center gap-1"
            >
              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
              Clear Logs
            </button>
          )}
        </div>

        {history.length === 0 ? (
          <div className="rounded-xl border border-zinc-800/40 bg-zinc-950/40 p-4 text-center text-xs text-zinc-500 font-medium">
            No completed exercises in this session yet. Start training!
          </div>
        ) : (
          <div className="flex flex-col gap-2 max-h-[220px] overflow-y-auto pr-1">
            {history.map((log) => (
              <div
                key={log.id}
                className="flex items-center justify-between rounded-xl bg-zinc-950/30 border border-zinc-900/60 p-3 hover:bg-zinc-950/50 hover:border-zinc-800/80 transition-all"
              >
                <div className="flex flex-col">
                  <span className="text-xs font-bold text-zinc-200">{log.movementName}</span>
                  <span className="text-[10px] text-zinc-500 font-mono">
                    {new Date(log.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
                <div className="text-right">
                  {log.movementId === 'muaythai-combo' ? (
                    <span className="text-xs font-extrabold text-amber-400">Combo Done ✓</span>
                  ) : log.reps !== undefined ? (
                    <div className="flex flex-col items-end">
                      <span className="text-xs font-extrabold text-emerald-400">{log.reps} Strikes</span>
                      {log.peakSpeed !== undefined && log.peakSpeed > 0 && (
                        <span className="text-[10px] text-zinc-500 font-mono">Top: {Math.round(log.peakSpeed)}°/s</span>
                      )}
                    </div>
                  ) : (
                    <span className="text-xs font-extrabold text-violet-400">{log.holdTime}s Held</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
