import type { Feedback, MovementDefinition } from '../engine/types';

interface FeedbackPanelProps {
  feedback: Feedback | null;
  movement: MovementDefinition;
  onResetReps: () => void;
}

/**
 * The verdict panel: a big state line, the single most relevant cue, a live
 * per-joint angle readout, and — for movements with `dynamics` — a rep counter
 * and speed readout. Knows nothing about any specific movement; it just renders
 * whatever the engine reports.
 */
export default function FeedbackPanel({
  feedback,
  movement,
  onResetReps,
}: FeedbackPanelProps) {
  if (!feedback) {
    return (
      <div className="rounded-2xl bg-zinc-900 p-5 text-zinc-400">
        Get into frame to start…
      </div>
    );
  }

  // Can't see enough of the body to judge — neutral, not "wrong".
  if (!feedback.tracked) {
    return (
      <div className="rounded-2xl bg-zinc-900 p-5">
        <div className="text-2xl font-bold text-zinc-300">Looking for you…</div>
        <div className="mt-2 text-zinc-400">
          Step back so your whole body is in the frame.
        </div>
      </div>
    );
  }

  const cue = feedback.activeCues[0];
  const dyn = feedback.dynamic;

  return (
    <div className="flex flex-col gap-4">
      <div
        className={`rounded-2xl p-5 transition-colors ${
          feedback.ok
            ? 'bg-green-600/20 ring-1 ring-green-500'
            : 'bg-red-600/20 ring-1 ring-red-500'
        }`}
      >
        <div
          className={`text-2xl font-bold ${
            feedback.ok ? 'text-green-400' : 'text-red-400'
          }`}
        >
          {feedback.ok ? `✓ Good ${movement.name}` : '✗ Adjust'}
        </div>
        {!feedback.ok && cue && (
          <div className="mt-2 text-lg text-zinc-100">{cue}</div>
        )}

        <div className="mt-4 grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
          {feedback.joints.map((j) => {
            const spec = movement.joints.find((s) => s.id === j.id);
            const tone = !j.available
              ? 'bg-zinc-700/30 text-zinc-500'
              : j.inRange
                ? 'bg-green-500/10 text-green-300'
                : 'bg-red-500/10 text-red-300';
            return (
              <div key={j.id} className={`rounded-lg px-2 py-1 ${tone}`}>
                <div className="truncate text-zinc-400">
                  {spec?.label ?? j.id}
                </div>
                <div className="font-mono">
                  {j.available ? `${Math.round(j.angle)}°` : '—'}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {dyn && (
        <div className="flex items-center justify-between rounded-2xl bg-zinc-900 p-5">
          <div>
            <div className="text-sm uppercase tracking-wide text-zinc-400">
              {dyn.label}
            </div>
            <div className="text-4xl font-bold tabular-nums">{dyn.reps}</div>
            <div className="mt-1 text-sm text-zinc-400">
              Phase: <span className="text-zinc-200">{dyn.phase}</span> · Top
              speed:{' '}
              <span className="text-zinc-200">
                {Math.round(dyn.peakVelocityDegPerSec)}°/s
              </span>
            </div>
          </div>
          <button
            type="button"
            onClick={onResetReps}
            className="rounded-lg bg-zinc-800 px-3 py-2 text-sm text-zinc-300 hover:bg-zinc-700"
          >
            Reset
          </button>
        </div>
      )}
    </div>
  );
}
