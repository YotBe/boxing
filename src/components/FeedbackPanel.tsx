import type { Feedback, MovementDefinition } from '../engine/types';

interface FeedbackPanelProps {
  feedback: Feedback | null;
  movement: MovementDefinition;
}

/**
 * The verdict panel: a big green/red state plus the single most relevant
 * corrective cue. Knows nothing about any specific movement — it just renders
 * whatever the engine reports.
 */
export default function FeedbackPanel({
  feedback,
  movement,
}: FeedbackPanelProps) {
  if (!feedback) {
    return (
      <div className="rounded-2xl bg-zinc-900 p-5 text-zinc-400">
        Get into frame to start…
      </div>
    );
  }

  const cue = feedback.activeCues[0];

  return (
    <div
      className={`rounded-2xl p-5 transition-colors ${
        feedback.ok ? 'bg-green-600/20 ring-1 ring-green-500' : 'bg-red-600/20 ring-1 ring-red-500'
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
          return (
            <div
              key={j.id}
              className={`rounded-lg px-2 py-1 ${
                j.inRange ? 'bg-green-500/10 text-green-300' : 'bg-red-500/10 text-red-300'
              }`}
            >
              <div className="truncate text-zinc-400">{spec?.label ?? j.id}</div>
              <div className="font-mono">
                {Number.isNaN(j.angle) ? '—' : `${Math.round(j.angle)}°`}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
