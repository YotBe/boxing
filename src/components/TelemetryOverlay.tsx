import type { TelemetrySnapshot } from '../engine/telemetry';
import type { PoseDetectorInfo } from '../engine/poseDetector';

interface TelemetryOverlayProps {
  stats: TelemetrySnapshot | null;
  detector: PoseDetectorInfo | null;
  /** Intrinsic size of the incoming frames, before the model downsamples. */
  sourceWidth: number;
  sourceHeight: number;
  /** Label for where frames are coming from, e.g. "Front camera". */
  sourceLabel: string;
  /** True while a model variant is being swapped in. */
  swapping: boolean;
}

/**
 * Always-on inference telemetry, pinned over the live view.
 *
 * Deliberately high-contrast and monospaced: this has to be legible on a phone
 * held at arm's length in a bright room, which rules out the thin low-opacity
 * text the rest of the UI uses. Values are tabular-nums so the digits stop
 * jittering as they update.
 */
export default function TelemetryOverlay({
  stats,
  detector,
  sourceWidth,
  sourceHeight,
  sourceLabel,
  swapping,
}: TelemetryOverlayProps) {
  const fps = stats?.fps ?? 0;
  const latency = stats?.inferenceMs ?? 0;
  const peak = stats?.peakInferenceMs ?? 0;
  const confidence = stats?.meanConfidence ?? 0;

  // Colour the two numbers that carry a judgement. Anything at or above 24 fps
  // reads as smooth to a person; below 15 it visibly stutters.
  const fpsTone =
    fps >= 24 ? 'text-emerald-300' : fps >= 15 ? 'text-amber-300' : 'text-rose-300';
  const confTone =
    confidence >= 0.6
      ? 'text-emerald-300'
      : confidence >= 0.35
        ? 'text-amber-300'
        : 'text-rose-300';

  return (
    <div
      className="pointer-events-none absolute left-2 top-2 select-none rounded-xl border border-white/20 bg-black/75 px-2.5 py-2 font-mono shadow-lg backdrop-blur-md sm:left-3 sm:top-3 sm:px-3"
      aria-live="off"
    >
      <div className="flex items-baseline gap-3">
        <div className="flex items-baseline gap-1">
          {/* A decimal below 10fps: rounding 0.4 to "0" reads as broken rather
              than slow, and on a struggling device that is the difference
              between a diagnosis and a mystery. */}
          <span className={`text-xl font-black tabular-nums leading-none sm:text-2xl ${fpsTone}`}>
            {fps >= 10 ? fps.toFixed(0) : fps.toFixed(1)}
          </span>
          <span className="text-[9px] font-bold uppercase tracking-wider text-white/70">
            fps
          </span>
        </div>
        <div className="flex items-baseline gap-1">
          <span className="text-xl font-black tabular-nums leading-none text-sky-300 sm:text-2xl">
            {latency.toFixed(1)}
          </span>
          <span className="text-[9px] font-bold uppercase tracking-wider text-white/70">
            ms infer
          </span>
        </div>
      </div>

      <div className="mt-1.5 space-y-0.5 text-[10px] font-semibold leading-tight text-white/85 sm:text-[11px]">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-white/50">model</span>
          <span className="text-white">
            {detector ? detector.variant.label : '—'}
          </span>
          <span className="text-white/50">
            {detector ? `· ${detector.variant.inputResolution}` : ''}
          </span>
          {/* Amber when this is a fallback rather than a choice — a GPU that
              was refused otherwise just looks like a slow phone. */}
          <span
            className={`rounded px-1 text-[9px] uppercase tracking-wide ${
              detector && detector.delegate !== detector.requestedDelegate
                ? 'bg-amber-400/25 text-amber-200'
                : 'bg-white/10 text-white/70'
            }`}
          >
            {detector?.delegate ?? '—'}
          </span>
          {/* Where the model and runtime actually came from. Serving from a CDN
              works fine right up until the network goes, which is exactly when
              this demo needs it not to. */}
          {detector && (
            <span
              className={`rounded px-1 text-[9px] uppercase tracking-wide ${
                detector.bundled
                  ? 'bg-white/10 text-white/70'
                  : 'bg-amber-400/25 text-amber-200'
              }`}
            >
              {detector.bundled ? 'local' : 'CDN'}
            </span>
          )}
          {swapping && (
            <span className="animate-pulse text-amber-300">swapping…</span>
          )}
        </div>
        <div>
          <span className="text-white/50">source </span>
          <span className="text-white">
            {sourceWidth > 0 ? `${sourceWidth}×${sourceHeight}` : '—'}
          </span>
          <span className="text-white/50"> · {sourceLabel}</span>
        </div>
        <div>
          <span className="text-white/50">keypoint conf </span>
          <span className={`tabular-nums font-bold ${confTone}`}>
            {confidence.toFixed(2)}
          </span>
          <span className="text-white/50"> · peak </span>
          <span className="tabular-nums text-white/85">{peak.toFixed(0)}ms</span>
        </div>
      </div>
    </div>
  );
}
