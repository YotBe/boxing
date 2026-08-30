import type { DynamicResult, Feedback, MovementDefinition } from '../engine/types';
import {
  Card,
  PrimaryButton,
  QuietButton,
  Section,
  Stat,
  Toggle,
} from './ui';

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
  /** Every registered movement, so a combo step can be named from its config. */
  movements: MovementDefinition[];
  liveHoldTime: number;
  dynamicStats: DynamicResult | null;
  voiceEnabled: boolean;
  soundEnabled: boolean;
  setVoiceEnabled: (v: boolean) => void;
  setSoundEnabled: (s: boolean) => void;
  history: WorkoutLog[];
  onClearHistory: () => void;
  onResetReps: () => void;

  workoutMode: 'practice' | 'combos';
  setWorkoutMode: (mode: 'practice' | 'combos') => void;
  activeComboIndex: number;
  comboStepIndex: number;
  combosCompletedCount: number;
  startNextCombo: (idx?: number) => void;
  COMBOS: { name: string; sequence: string[] }[];

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
}

/** A joint's current angle against its accepted band. */
function JointRow({
  label,
  angle,
  min,
  max,
  inRange,
  available,
}: {
  label: string;
  angle: number;
  min: number;
  max: number;
  inRange: boolean;
  available: boolean;
}) {
  if (!available || Number.isNaN(angle)) {
    return (
      <div className="flex items-center justify-between py-1.5 text-sm">
        <span className="text-zinc-500">{label}</span>
        <span className="text-xs text-zinc-600">out of frame</span>
      </div>
    );
  }

  const left = Math.max(0, Math.min(100, (min / 180) * 100));
  const width = Math.max(0, Math.min(100 - left, ((max - min) / 180) * 100));
  const marker = Math.max(0, Math.min(100, (angle / 180) * 100));

  return (
    <div className="py-1.5">
      <div className="flex items-center justify-between text-sm">
        <span className="text-zinc-300">{label}</span>
        <span className={inRange ? 'text-emerald-400' : 'text-amber-400'}>
          {Math.round(angle)}°
          <span className="ml-1 text-xs text-zinc-500">
            target {min}–{max}°
          </span>
        </span>
      </div>
      <div className="relative mt-1.5 h-1 w-full rounded-full bg-zinc-950">
        <div
          className="absolute h-full rounded-full bg-zinc-700"
          style={{ left: `${left}%`, width: `${width}%` }}
        />
        <div
          className={`absolute -top-1 h-3 w-1 -translate-x-1/2 rounded-full ${
            inRange ? 'bg-emerald-400' : 'bg-amber-400'
          }`}
          style={{ left: `${marker}%` }}
        />
      </div>
    </div>
  );
}

function LabelledSelect({
  label,
  value,
  onChange,
  children,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  children: React.ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-xs text-zinc-500">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="rounded-lg border border-zinc-800 bg-zinc-950 px-2 py-2 text-sm text-zinc-200"
      >
        {children}
      </select>
    </label>
  );
}

/**
 * The panel beside (or below) the live view.
 *
 * The live verdict and the cue are deliberately *not* here — they are drawn on
 * the video itself, where you are already looking. Repeating them in a large
 * card underneath was the single biggest source of duplication in the old
 * layout. What is left is the thing you glance at between reps (one number),
 * the session controls, and two collapsed drawers for detail nobody needs
 * on screen continuously.
 */
export default function FeedbackPanel({
  feedback,
  movement,
  movements,
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
  comboStepIndex,
  combosCompletedCount,
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
}: FeedbackPanelProps) {
  // Names come from the movement registry rather than a hardcoded lookup. The
  // old copy of this list sat in this component and had to be edited every time
  // a movement JSON was added — precisely the coupling the engine is designed
  // to avoid.
  const strikeName = (id: string) =>
    movements.find((m) => m.id === id)?.name ?? id;

  const formatTime = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  const activeCombo = COMBOS[activeComboIndex];

  return (
    <div className="flex flex-col gap-3">
      {/* Mode. Two words each; the old labels were "Single Stance (Practice)"
          and "Combo Coach (Pad Work)", which is a lot of chrome for a toggle. */}
      <div className="flex gap-1 rounded-xl bg-zinc-950/60 p-1">
        {(
          [
            ['practice', 'Practice'],
            ['combos', 'Combos'],
          ] as const
        ).map(([mode, label]) => (
          <button
            key={mode}
            type="button"
            aria-pressed={workoutMode === mode}
            onClick={() => {
              setWorkoutMode(mode);
              if (mode === 'combos') startNextCombo(0);
            }}
            className={`flex-1 rounded-lg py-2 text-sm font-semibold transition-colors ${
              workoutMode === mode
                ? 'bg-red-600 text-white'
                : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* The one number worth a glance mid-set. */}
      {workoutMode === 'practice' ? (
        <Card className="flex items-end justify-between px-4 py-4">
          {movement.dynamics ? (
            <Stat value={dynamicStats?.reps ?? 0} unit="reps" />
          ) : (
            <Stat value={`${liveHoldTime}s`} unit="held" />
          )}
          <QuietButton onClick={onResetReps}>Reset</QuietButton>
        </Card>
      ) : (
        <Card className="px-4 py-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-xs text-zinc-500">Current combo</p>
              <p className="truncate text-base font-semibold text-zinc-100">
                {activeCombo?.name}
              </p>
            </div>
            <QuietButton onClick={() => startNextCombo()}>Skip</QuietButton>
          </div>

          <ol className="mt-3 flex flex-wrap gap-1.5">
            {activeCombo?.sequence.map((strikeId, i) => {
              const done = i < comboStepIndex;
              const current = i === comboStepIndex;
              return (
                <li
                  key={i}
                  className={`rounded-lg px-2 py-1 text-xs font-medium ${
                    done
                      ? 'bg-emerald-500/15 text-emerald-300'
                      : current
                        ? 'bg-red-600 text-white'
                        : 'bg-zinc-800/60 text-zinc-500'
                  }`}
                >
                  {strikeName(strikeId)}
                </li>
              );
            })}
          </ol>

          <p className="mt-3 border-t border-zinc-800/70 pt-3 text-sm text-zinc-400">
            <span className="font-semibold text-zinc-100">
              {combosCompletedCount}
            </span>{' '}
            completed this session
          </p>
        </Card>
      )}

      {/* Rounds. Collapsed to a single button until you want the settings, and
          replaced by the live clock once a session is running. */}
      {roundModeActive ? (
        <Card className="flex items-center justify-between px-4 py-3.5">
          <div>
            <p className="text-xs text-zinc-500">
              Round {currentRound} of {roundCount} ·{' '}
              {roundPhase === 'work' ? 'work' : 'rest'}
            </p>
            <p className="text-2xl font-bold tabular-nums text-white">
              {formatTime(roundTimeLeft)}
            </p>
          </div>
          <QuietButton onClick={onToggleRoundSession}>Stop</QuietButton>
        </Card>
      ) : (
        <Section
          title="Round timer"
          meta={`${roundCount} × ${formatTime(roundDurationSec)}`}
        >
          <div className="grid grid-cols-3 gap-2">
            <LabelledSelect label="Rounds" value={roundCount} onChange={setRoundCount}>
              {[1, 2, 3, 4, 5].map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </LabelledSelect>
            <LabelledSelect
              label="Work"
              value={roundDurationSec}
              onChange={setRoundDurationSec}
            >
              {[30, 60, 90, 120, 180].map((s) => (
                <option key={s} value={s}>
                  {formatTime(s)}
                </option>
              ))}
            </LabelledSelect>
            <LabelledSelect
              label="Rest"
              value={restDurationSec}
              onChange={setRestDurationSec}
            >
              {[15, 30, 45, 60].map((s) => (
                <option key={s} value={s}>
                  {formatTime(s)}
                </option>
              ))}
            </LabelledSelect>
          </div>
          <PrimaryButton onClick={onToggleRoundSession} className="mt-3 w-full">
            Start session
          </PrimaryButton>
        </Section>
      )}

      {/* Everything below is a drawer: available, not present. */}
      {workoutMode === 'practice' && feedback && (
        <Section title="Joint angles" meta={movement.name}>
          {feedback.joints.map((j) => {
            const spec = movement.joints.find((s) => s.id === j.id);
            return (
              <JointRow
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
        </Section>
      )}

      {workoutMode === 'combos' && (
        <Section title="Choose a combo" meta={`${COMBOS.length}`}>
          <div className="flex flex-col gap-1">
            {COMBOS.map((combo, idx) => (
              <button
                key={idx}
                type="button"
                onClick={() => startNextCombo(idx)}
                className={`rounded-lg px-3 py-2 text-left text-sm transition-colors ${
                  idx === activeComboIndex
                    ? 'bg-red-600/15 text-red-300'
                    : 'text-zinc-400 hover:bg-zinc-800/60 hover:text-zinc-200'
                }`}
              >
                {combo.name}
              </button>
            ))}
          </div>
        </Section>
      )}

      {/* One set of audio toggles, not one per mode. */}
      <Section
        title="Sound"
        meta={voiceEnabled || soundEnabled ? 'on' : 'off'}
      >
        <Toggle
          label="Voice coach"
          description="Speaks form corrections and round calls"
          checked={voiceEnabled}
          onChange={setVoiceEnabled}
        />
        <Toggle
          label="Hit sounds"
          description="Pad impact and bells"
          checked={soundEnabled}
          onChange={setSoundEnabled}
        />
      </Section>

      <Section title="History" meta={history.length ? `${history.length}` : 'empty'}>
        {history.length === 0 ? (
          <p className="text-sm text-zinc-500">
            Completed sets are logged here, on this device only.
          </p>
        ) : (
          <>
            <div className="flex max-h-56 flex-col divide-y divide-zinc-800/70 overflow-y-auto">
              {history.map((log) => (
                <div
                  key={log.id}
                  className="flex items-center justify-between py-2 text-sm"
                >
                  <div className="min-w-0">
                    <p className="truncate text-zinc-200">{log.movementName}</p>
                    <p className="text-xs text-zinc-500">
                      {new Date(log.timestamp).toLocaleTimeString([], {
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </p>
                  </div>
                  <span className="shrink-0 text-zinc-400">
                    {log.reps !== undefined
                      ? `${log.reps} reps`
                      : log.holdTime !== undefined
                        ? `${log.holdTime}s`
                        : 'combo'}
                  </span>
                </div>
              ))}
            </div>
            <button
              type="button"
              onClick={onClearHistory}
              className="mt-3 text-sm text-zinc-500 hover:text-zinc-300"
            >
              Clear history
            </button>
          </>
        )}
      </Section>
    </div>
  );
}
