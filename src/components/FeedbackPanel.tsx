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
  voiceEnabled: boolean;
  soundEnabled: boolean;
  setVoiceEnabled: (v: boolean) => void;
  setSoundEnabled: (s: boolean) => void;
  history: WorkoutLog[];
  onClearHistory: () => void;
  onResetReps: () => void;

  // Combo Coach Additions
  workoutMode: 'practice' | 'combos';
  setWorkoutMode: (mode: 'practice' | 'combos') => void;
  activeComboIndex: number;
  setActiveComboIndex: (idx: number) => void;
  comboStepIndex: number;
  combosCompletedCount: number;
  comboStatus: 'idle' | 'calling' | 'waiting' | 'success';
  comboFeedbackText: string;
  startNextCombo: (idx?: number) => void;
  COMBOS: { name: string; sequence: string[] }[];

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
  roundTimerPaused: boolean;
  onTogglePauseRoundSession: () => void;
}

interface FormVerdictPanelProps {
  feedback: Feedback | null;
  movement: MovementDefinition;
  liveHoldTime: number;
  dynamicStats: any; // DynamicResult | null
  workoutMode: 'practice' | 'combos';
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
  if (!available || Number.isNaN(angle)) {
    return (
      <div className="flex flex-col gap-1 rounded-xl bg-zinc-900/35 p-3 border border-zinc-800/40">
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
        <span className="text-zinc-300 font-medium">{label}</span>
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

/**
 * FormVerdictPanel: Displays live visual pose evaluation (form checks, cues, 
 * joint angle sliders, activity reps/holds). Placed directly under the Camera View.
 */
export function FormVerdictPanel({
  feedback,
  movement,
  liveHoldTime,
  dynamicStats,
  workoutMode,
}: FormVerdictPanelProps) {
  if (!feedback) {
    return (
      <div className="rounded-2xl border border-zinc-800/80 bg-zinc-900/40 backdrop-blur-md p-6 text-center text-zinc-400 shadow-xl select-none">
        <svg className="mx-auto h-7 w-7 text-zinc-600 mb-2 animate-pulse" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
        </svg>
        <span className="font-semibold text-xs text-zinc-500 tracking-wide">Camera stream ready. Position your body in the view box to start coach analysis.</span>
      </div>
    );
  }

  if (!feedback.tracked) {
    return (
      <div className="rounded-2xl border border-zinc-800/80 bg-zinc-900/40 backdrop-blur-md p-5 shadow-xl text-center select-none">
        <div className="text-sm font-bold text-zinc-300 flex items-center justify-center gap-2">
          <svg className="h-4 w-4 text-zinc-500 animate-spin" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
          </svg>
          Searching for user joints...
        </div>
        <p className="mt-1.5 text-zinc-500 text-xs font-medium">
          Step backward. Make sure shoulders, elbows, hips and knees are visible.
        </p>
      </div>
    );
  }

  const cue = feedback.activeCues[0];
  const isPractice = workoutMode === 'practice';

  return (
    <div className="flex flex-col gap-4">
      {/* Form Status Card */}
      <div
        className={`rounded-2xl p-5 border transition-all duration-300 shadow-md ${
          feedback.ok
            ? 'bg-emerald-950/20 border-emerald-500/30 ring-1 ring-emerald-500/10'
            : 'bg-rose-950/20 border-rose-500/30 ring-1 ring-rose-500/10'
        }`}
      >
        <div className="flex items-center gap-2.5">
          {feedback.ok ? (
            <div className="flex h-7 w-7 items-center justify-center rounded-full bg-emerald-500/20 text-emerald-400 shrink-0">
              <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
              </svg>
            </div>
          ) : (
            <div className="flex h-7 w-7 items-center justify-center rounded-full bg-rose-500/20 text-rose-400 animate-pulse shrink-0">
              <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
              </svg>
            </div>
          )}
          <div>
            <span className="text-[9px] font-bold uppercase tracking-wider text-zinc-500 font-mono">Real-Time Form Assessor</span>
            <h2 className={`text-lg font-extrabold tracking-tight ${feedback.ok ? 'text-emerald-400' : 'text-rose-400'}`}>
              {feedback.ok ? `Good ${movement.name} Stance` : 'Posture Adjustment Required'}
            </h2>
          </div>
        </div>

        {!feedback.ok && cue && isPractice && (
          <div className="mt-3 flex items-start gap-2 rounded-xl bg-rose-500/10 p-3 border border-rose-500/20 text-xs font-semibold text-rose-200 animate-pulse">
            <svg className="h-4 w-4 text-rose-400 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            <span>{cue}</span>
          </div>
        )}
      </div>

      {/* Activity Stats for Practice Mode */}
      {isPractice && (
        <div className="rounded-2xl border border-zinc-800/80 bg-zinc-900/30 backdrop-blur-md p-4 flex items-center justify-between shadow-md">
          <div>
            <span className="text-[9px] font-bold uppercase tracking-wider text-zinc-500 font-mono">Activity Stats</span>
            {movement.dynamics ? (
              <div className="mt-1 flex items-baseline gap-2">
                <span className="text-3xl font-black text-white tracking-tight tabular-nums">
                  {dynamicStats?.reps ?? 0}
                </span>
                <span className="text-zinc-400 text-xs font-medium">strikes thrown</span>
              </div>
            ) : (
              <div className="mt-1 flex items-baseline gap-2">
                <span className="text-3xl font-black text-white tracking-tight tabular-nums">
                  {liveHoldTime}s
                </span>
                <span className="text-zinc-400 text-xs font-medium">guard hold duration</span>
              </div>
            )}
          </div>

          <div className="flex flex-col gap-1 text-right text-xs border-l border-zinc-800/60 pl-4">
            {movement.dynamics ? (
              <>
                <div className="flex justify-between gap-4">
                  <span className="text-zinc-500">Phase:</span>
                  <span className="font-semibold text-zinc-200 uppercase">{dynamicStats?.phase ?? 'unknown'}</span>
                </div>
                <div className="flex justify-between gap-4">
                  <span className="text-zinc-500">Top Speed:</span>
                  <span className="font-semibold font-mono text-zinc-200">{dynamicStats?.peakVelocityDegPerSec ? `${Math.round(dynamicStats.peakVelocityDegPerSec)}°/s` : '0°/s'}</span>
                </div>
              </>
            ) : (
              <div className="flex justify-between gap-4">
                <span className="text-zinc-500">Status:</span>
                <span className={`font-semibold ${feedback.ok ? 'text-emerald-400' : 'text-zinc-500'}`}>
                  {feedback.ok ? 'Holding' : 'Relaxed'}
                </span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Joint Sliders List */}
      <div className="rounded-2xl border border-zinc-800/80 bg-zinc-900/30 backdrop-blur-md p-5 shadow-lg">
        <span className="text-[9px] font-bold uppercase tracking-wider text-zinc-500 font-mono">Joint Assessment Angles</span>
        <h3 className="text-xs font-bold text-zinc-300 mt-0.5 mb-3">Live Posture Angles</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
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
    </div>
  );
}

/**
 * FeedbackPanel: Contains configuration, tab controls, rounds trainer controls, 
 * audio toggles, pad combos database, and historical workout stats. Placed in the right column.
 */
export default function FeedbackPanel({
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
  roundTimerPaused,
  onTogglePauseRoundSession,
}: FeedbackPanelProps) {
  const getStrikeName = (id: string) => {
    if (id === 'jab') return 'Left Jab';
    if (id === 'cross') return 'Right Cross';
    if (id === 'knee') return 'Right Knee';
    if (id === 'teep') return 'Left Teep';
    return id;
  };

  const formatTime = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  return (
    <div className="flex flex-col gap-5 text-zinc-300">
      {/* Mode Selector Tabs */}
      <div className="flex rounded-2xl bg-zinc-950/60 border border-zinc-800/80 p-1.5 shadow-md">
        <button
          type="button"
          onClick={() => setWorkoutMode('practice')}
          className={`flex-1 rounded-xl py-2 text-xs font-bold transition-all ${
            workoutMode === 'practice'
              ? 'bg-zinc-900 text-white shadow'
              : 'text-zinc-400 hover:text-zinc-200'
          }`}
        >
          Single Stance (Practice)
        </button>
        <button
          type="button"
          onClick={() => {
            setWorkoutMode('combos');
            startNextCombo(0);
          }}
          className={`flex-1 rounded-xl py-2 text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${
            workoutMode === 'combos'
              ? 'bg-gradient-to-r from-red-600 to-red-700 text-white shadow shadow-red-600/10'
              : 'text-zinc-400 hover:text-zinc-200'
          }`}
        >
          <span className="h-1.5 w-1.5 rounded-full bg-red-400 animate-ping" />
          Combo Coach (Pad Work)
        </button>
      </div>

      {/* --- BOXING ROUNDS TIMER CARD --- */}
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
              <div className="flex flex-col gap-1">
                <span className="text-[9px] font-semibold text-zinc-500 uppercase">Rounds</span>
                <select
                  value={roundCount}
                  onChange={(e) => setRoundCount(Number(e.target.value))}
                  className="rounded-lg bg-zinc-950 border border-zinc-800 text-xs text-zinc-300 p-1.5 focus:border-zinc-700 outline-none"
                >
                  {[1, 2, 3, 4, 5].map((r) => (
                    <option key={r} value={r}>{r} Rnds</option>
                  ))}
                </select>
              </div>

              <div className="flex flex-col gap-1">
                <span className="text-[9px] font-semibold text-zinc-500 uppercase">Work Time</span>
                <select
                  value={roundDurationSec}
                  onChange={(e) => setRoundDurationSec(Number(e.target.value))}
                  className="rounded-lg bg-zinc-950 border border-zinc-800 text-xs text-zinc-300 p-1.5 focus:border-zinc-700 outline-none"
                >
                  <option value={30}>30s</option>
                  <option value={60}>1:00</option>
                  <option value={90}>1:30</option>
                  <option value={120}>2:00</option>
                  <option value={180}>3:00</option>
                </select>
              </div>

              <div className="flex flex-col gap-1">
                <span className="text-[9px] font-semibold text-zinc-500 uppercase">Rest Time</span>
                <select
                  value={restDurationSec}
                  onChange={(e) => setRestDurationSec(Number(e.target.value))}
                  className="rounded-lg bg-zinc-950 border border-zinc-800 text-xs text-zinc-300 p-1.5 focus:border-zinc-700 outline-none"
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
          /* Live Active Timer Display Panel with Pause Button */
          <div className="flex flex-col gap-3 bg-zinc-950/40 border border-zinc-800/80 rounded-xl p-3.5 shadow-inner">
            <div className="flex items-center justify-between">
              <div className="flex flex-col">
                <span className="text-[9px] font-bold uppercase text-zinc-500 tracking-wider font-mono">
                  Round {currentRound} of {roundCount} {roundTimerPaused && '(Paused)'}
                </span>
                <span className={`text-3xl font-black font-mono mt-0.5 tabular-nums ${roundTimerPaused ? 'text-zinc-500 animate-pulse' : 'text-white'}`}>
                  {formatTime(roundTimeLeft)}
                </span>
              </div>
              <button
                type="button"
                onClick={onToggleRoundSession}
                className="rounded-xl bg-red-600/10 border border-red-500/30 hover:bg-red-600/25 px-4.5 py-2 text-xs font-bold text-red-400 transition-all active:scale-[0.96]"
              >
                Stop Session
              </button>
            </div>
            
            {/* Pause / Resume button */}
            <button
              type="button"
              onClick={onTogglePauseRoundSession}
              className={`w-full rounded-lg border py-1.5 text-xs font-bold transition-all active:scale-[0.98] ${
                roundTimerPaused
                  ? 'bg-emerald-600/10 border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/20'
                  : 'bg-zinc-850 border-zinc-700 text-zinc-300 hover:bg-zinc-800'
              }`}
            >
              {roundTimerPaused ? 'Resume Round' : 'Pause Round'}
            </button>
          </div>
        )}
      </div>

      {/* --- COMBO TARGET DETAILS --- */}
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

          {/* Combos selection list */}
          <div className="rounded-2xl border border-zinc-800/80 bg-zinc-900/30 backdrop-blur-md p-5 shadow-lg">
            <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">Pad Training Schedule</span>
            <h3 className="text-sm font-bold text-zinc-200 mt-1 mb-3">Available Combos</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {COMBOS.map((combo, idx) => {
                const isActive = idx === activeComboIndex;
                return (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => startNextCombo(idx)}
                    className={`text-left rounded-xl p-3 border transition-all text-xs flex flex-col justify-between ${
                      isActive
                        ? 'bg-amber-600/10 border-amber-500/40 text-amber-300 shadow-md shadow-amber-500/5'
                        : 'bg-zinc-950/30 border-zinc-900/60 text-zinc-400 hover:border-zinc-800 hover:bg-zinc-900/40 hover:text-zinc-200'
                    }`}
                  >
                    <span className="font-extrabold">{combo.name}</span>
                    <span className="text-[10px] text-zinc-500 mt-1 uppercase tracking-wide truncate">
                      {combo.sequence.join(' - ')}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </>
      )}

      {/* Audio controls */}
      <div className="rounded-2xl border border-zinc-800/80 bg-zinc-900/30 backdrop-blur-md p-5 shadow-lg">
        <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">Audio Assistant</span>
        <div className="grid grid-cols-2 gap-3 mt-3">
          <label className="flex items-center justify-between cursor-pointer rounded-xl bg-zinc-950/30 p-2.5 border border-zinc-800/50 hover:border-zinc-700/60 transition-all">
            <span className="text-xs font-semibold text-zinc-300">Voice Coach</span>
            <input
              type="checkbox"
              checked={voiceEnabled}
              onChange={(e) => setVoiceEnabled(e.target.checked)}
              className="rounded text-red-500 bg-zinc-800 border-zinc-700 h-4 w-4"
            />
          </label>

          <label className="flex items-center justify-between cursor-pointer rounded-xl bg-zinc-950/30 p-2.5 border border-zinc-800/50 hover:border-zinc-700/60 transition-all">
            <span className="text-xs font-semibold text-zinc-300">Tone Beeps</span>
            <input
              type="checkbox"
              checked={soundEnabled}
              onChange={(e) => setSoundEnabled(e.target.checked)}
              className="rounded text-red-500 bg-zinc-800 border-zinc-700 h-4 w-4"
            />
          </label>
        </div>
      </div>

      {/* --- RESET HANDLER FOR PRACTICE MODE --- */}
      {workoutMode === 'practice' && (
        <button
          type="button"
          onClick={onResetReps}
          className="w-full rounded-2xl bg-zinc-900 border border-zinc-850 py-3 text-sm font-semibold text-zinc-300 hover:bg-zinc-850 transition-all"
        >
          Reset Workout Stance Stats
        </button>
      )}

      {/* --- WORKOUT SESSION LOGS (SHARED BY BOTH MODES) --- */}
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
