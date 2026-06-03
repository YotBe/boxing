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
      <div className="flex flex-col gap-1 rounded-xl bg-zinc-900/30 p-3 border border-zinc-800/40">
        <div className="flex justify-between items-center text-xs">
          <span className="text-zinc-500 font-semibold">{label}</span>
          <span className="text-zinc-600 font-mono text-[10px] uppercase tracking-wider">Out of Frame</span>
        </div>
        <div className="h-1.5 bg-zinc-950/50 rounded-full w-full opacity-35" />
      </div>
    );
  }

  // Clamped percentages
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
        {/* Target range highlight zone */}
        <div
          className={`absolute h-full rounded-full transition-all ${
            inRange ? 'bg-emerald-500/25' : 'bg-rose-500/15'
          }`}
          style={{ left: `${leftPercent}%`, width: `${widthPercent}%` }}
        />
        {/* Current position indicator */}
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
}: FeedbackPanelProps) {
  if (!feedback) {
    return (
      <div className="rounded-2xl border border-zinc-800/80 bg-zinc-900/40 backdrop-blur-md p-6 text-center text-zinc-400 shadow-xl">
        <svg className="mx-auto h-8 w-8 text-zinc-600 mb-2 animate-pulse" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
        </svg>
        <span className="font-medium text-sm">Please stand in front of the camera to begin coaching...</span>
      </div>
    );
  }

  // Can't see enough of the body to judge — neutral, not "wrong".
  if (!feedback.tracked) {
    return (
      <div className="rounded-2xl border border-zinc-800/80 bg-zinc-900/40 backdrop-blur-md p-6 shadow-xl text-center">
        <div className="text-xl font-bold text-zinc-300 flex items-center justify-center gap-2">
          <svg className="h-6 w-6 text-zinc-500 animate-spin" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
          </svg>
          Looking for you...
        </div>
        <p className="mt-2 text-zinc-400 text-sm">
          Step back so your joints are fully visible inside the camera frame.
        </p>
      </div>
    );
  }

  const cue = feedback.activeCues[0];
  const isDynamic = !!movement.dynamics;

  return (
    <div className="flex flex-col gap-5">
      {/* 1. Form Status Card */}
      <div
        className={`rounded-2xl p-5 border transition-all duration-300 shadow-lg ${
          feedback.ok
            ? 'bg-emerald-950/20 border-emerald-500/30 ring-1 ring-emerald-500/10'
            : 'bg-rose-950/20 border-rose-500/30 ring-1 ring-rose-500/10'
        }`}
      >
        <div className="flex items-center justify-between">
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
              <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">Form Verdict</span>
              <h2 className={`text-xl font-extrabold tracking-tight ${feedback.ok ? 'text-emerald-400' : 'text-rose-400'}`}>
                {feedback.ok ? `Excellent ${movement.name}` : 'Form Adjustments Needed'}
              </h2>
            </div>
          </div>
        </div>

        {!feedback.ok && cue && (
          <div className="mt-3 flex items-start gap-2 rounded-xl bg-rose-500/10 p-3.5 border border-rose-500/20 text-sm font-semibold text-rose-200">
            <svg className="h-5 w-5 text-rose-400 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            <span>{cue}</span>
          </div>
        )}
      </div>

      {/* 2. Interactive Counter & Audio Dashboard */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Dynamic / Hold Readout Panel */}
        <div className="rounded-2xl border border-zinc-800/80 bg-zinc-900/30 backdrop-blur-md p-5 flex flex-col justify-between shadow-lg relative overflow-hidden">
          {/* Decorative faint background gradient */}
          <div className="absolute right-0 top-0 w-32 h-32 bg-violet-600/10 rounded-full filter blur-2xl pointer-events-none" />
          
          <div>
            <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">Activity Stats</span>
            {isDynamic ? (
              <div className="mt-2 flex items-baseline gap-4">
                <span className="text-5xl font-black text-white tracking-tight tabular-nums">
                  {dynamicStats?.reps ?? 0}
                </span>
                <span className="text-zinc-400 text-sm font-medium">reps completed</span>
              </div>
            ) : (
              <div className="mt-2 flex items-baseline gap-3">
                <span className="text-4xl font-black text-white tracking-tight tabular-nums">
                  {liveHoldTime}s
                </span>
                <span className="text-zinc-400 text-sm font-medium">total time held</span>
              </div>
            )}
          </div>

          <div className="mt-4 flex flex-col gap-1.5 border-t border-zinc-800/60 pt-3.5">
            {isDynamic ? (
              <>
                <div className="flex justify-between text-xs">
                  <span className="text-zinc-400">Phase:</span>
                  <span className="font-semibold text-zinc-200 uppercase tracking-wide">
                    {dynamicStats?.phase ?? 'unknown'}
                  </span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-zinc-400">Peak Velocity:</span>
                  <span className="font-semibold font-mono text-zinc-200">
                    {dynamicStats?.peakVelocityDegPerSec ? `${Math.round(dynamicStats.peakVelocityDegPerSec)}°/s` : '0°/s'}
                  </span>
                </div>
              </>
            ) : (
              <div className="flex justify-between text-xs">
                <span className="text-zinc-400">Stance Status:</span>
                <span className={`font-semibold ${feedback.ok ? 'text-emerald-400' : 'text-zinc-500'}`}>
                  {feedback.ok ? 'Actively Holding' : 'Inactive'}
                </span>
              </div>
            )}
          </div>

          <button
            type="button"
            onClick={onResetReps}
            className="mt-4 w-full rounded-xl bg-zinc-800/80 border border-zinc-700/50 py-2.5 text-xs font-bold text-zinc-300 hover:bg-zinc-700 hover:text-white transition-all shadow-md active:scale-[0.98]"
          >
            Reset Count
          </button>
        </div>

        {/* Audio Coach Settings */}
        <div className="rounded-2xl border border-zinc-800/80 bg-zinc-900/30 backdrop-blur-md p-5 flex flex-col justify-between shadow-lg relative overflow-hidden">
          <div className="absolute right-0 top-0 w-32 h-32 bg-emerald-600/10 rounded-full filter blur-2xl pointer-events-none" />
          
          <div>
            <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">Audio Assistant</span>
            <h3 className="text-sm font-bold text-zinc-200 mt-1">Live Audio Coaching</h3>
            <p className="text-zinc-400 text-xs mt-1">Configure real-time voice and sound corrections during exercises.</p>
          </div>

          <div className="mt-4 flex flex-col gap-3">
            {/* Voice toggle */}
            <label className="flex items-center justify-between cursor-pointer rounded-xl bg-zinc-950/30 p-2.5 border border-zinc-800/50 hover:border-zinc-700/60 transition-all">
              <div className="flex items-center gap-2">
                <svg className={`h-4 w-4 ${voiceEnabled ? 'text-emerald-400' : 'text-zinc-500'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                </svg>
                <div className="flex flex-col">
                  <span className="text-xs font-semibold text-zinc-300">Voice Coach</span>
                  <span className="text-[10px] text-zinc-500">Speak correctional cues</span>
                </div>
              </div>
              <input
                type="checkbox"
                checked={voiceEnabled}
                onChange={(e) => setVoiceEnabled(e.target.checked)}
                className="rounded text-emerald-500 bg-zinc-800 border-zinc-700 h-4 w-4"
              />
            </label>

            {/* Beep toggle */}
            <label className="flex items-center justify-between cursor-pointer rounded-xl bg-zinc-950/30 p-2.5 border border-zinc-800/50 hover:border-zinc-700/60 transition-all">
              <div className="flex items-center gap-2">
                <svg className={`h-4 w-4 ${soundEnabled ? 'text-emerald-400' : 'text-zinc-500'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
                </svg>
                <div className="flex flex-col">
                  <span className="text-xs font-semibold text-zinc-300">Rep Chimes</span>
                  <span className="text-[10px] text-zinc-500">Play tone on successful reps</span>
                </div>
              </div>
              <input
                type="checkbox"
                checked={soundEnabled}
                onChange={(e) => setSoundEnabled(e.target.checked)}
                className="rounded text-emerald-500 bg-zinc-800 border-zinc-700 h-4 w-4"
              />
            </label>
          </div>
        </div>
      </div>

      {/* 3. Joint Angles Dashboard */}
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

      {/* 4. Workout Log / History */}
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
            No exercises completed yet. Finish a set and reset or switch movements to log it.
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
                  {log.reps !== undefined ? (
                    <div className="flex flex-col items-end">
                      <span className="text-xs font-extrabold text-emerald-400">{log.reps} Reps</span>
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
