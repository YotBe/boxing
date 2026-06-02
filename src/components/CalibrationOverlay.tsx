interface CalibrationOverlayProps {
  active: boolean;
  instruction: string;
  countdown: number | null;
  capturing: boolean;
  onCancel: () => void;
}

/**
 * Full-bleed guidance shown over the video during a calibration session: the
 * current instruction, a big 3-2-1 countdown, a "capturing" state, and a
 * cancel affordance. Purely presentational — all logic lives in App.
 */
export default function CalibrationOverlay({
  active,
  instruction,
  countdown,
  capturing,
  onCancel,
}: CalibrationOverlayProps) {
  if (!active) return null;

  return (
    <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 bg-black/55 p-6 text-center backdrop-blur-sm">
      <div className="text-lg font-medium text-zinc-100">{instruction}</div>

      {countdown !== null && (
        <div className="text-7xl font-bold tabular-nums text-green-400">
          {countdown}
        </div>
      )}

      {capturing && (
        <div className="text-2xl font-semibold text-green-400 animate-pulse">
          Capturing…
        </div>
      )}

      <button
        type="button"
        onClick={onCancel}
        className="mt-2 rounded-lg bg-zinc-800/90 px-3 py-2 text-sm text-zinc-200 hover:bg-zinc-700"
      >
        Cancel
      </button>
    </div>
  );
}
