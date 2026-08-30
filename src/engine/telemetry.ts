/**
 * Rolling runtime telemetry for the inference loop.
 *
 * Domain-agnostic like the rest of `src/engine/`: it knows nothing about
 * movements, only about frames, timings and landmark confidence. The numbers it
 * produces (frame rate, model latency, mean keypoint confidence) are the
 * standard edge-inference vitals — the things you actually watch when deciding
 * whether a model fits a device's compute budget.
 *
 * Frame rate and latency are tracked separately on purpose. Frame rate is
 * whole-loop throughput (inference + smoothing + evaluation + canvas draw,
 * capped by the display's refresh rate and by the camera's own capture rate).
 * Latency is the model call alone. Conflating them hides which stage is the
 * bottleneck.
 */

/** Number of recent samples each rolling average is computed over. */
const WINDOW = 30;

export interface TelemetrySnapshot {
  /** Rolling average frames per second over the whole loop. */
  fps: number;
  /** Rolling average of the model call alone, in milliseconds. */
  inferenceMs: number;
  /** Worst model call in the current window, in milliseconds. */
  peakInferenceMs: number;
  /** Mean `visibility` across the latest frame's landmarks (0..1). */
  meanConfidence: number;
  /** Frames processed since the last reset. */
  frames: number;
}

export interface TelemetryMeter {
  /** Record one completed frame. `inferenceMs` is the model call only. */
  record(frameTimestampMs: number, inferenceMs: number, confidence: number): void;
  /** Record a frame the detector produced no pose for (confidence unknown). */
  recordEmpty(frameTimestampMs: number, inferenceMs: number): void;
  snapshot(): TelemetrySnapshot;
  reset(): void;
}

/** Mean `visibility` over a frame's landmarks; 0 when none carry a score. */
export function meanVisibility(
  landmarks: ReadonlyArray<{ visibility?: number }> | undefined,
): number {
  if (!landmarks || landmarks.length === 0) return 0;
  let sum = 0;
  let n = 0;
  for (const l of landmarks) {
    if (typeof l.visibility === 'number' && !Number.isNaN(l.visibility)) {
      sum += l.visibility;
      n += 1;
    }
  }
  return n > 0 ? sum / n : 0;
}

function mean(values: number[]): number {
  if (values.length === 0) return 0;
  let sum = 0;
  for (const v of values) sum += v;
  return sum / values.length;
}

function push(window: number[], value: number): void {
  window.push(value);
  if (window.length > WINDOW) window.shift();
}

export function createTelemetryMeter(): TelemetryMeter {
  // Inter-frame gaps rather than instantaneous 1/dt, so one slow frame doesn't
  // swing the displayed rate — an average over the window is what a human can
  // actually read off a phone screen.
  const gaps: number[] = [];
  const latencies: number[] = [];
  let lastFrameMs: number | null = null;
  let confidence = 0;
  let frames = 0;

  function tick(frameTimestampMs: number, inferenceMs: number): void {
    if (lastFrameMs !== null) {
      const gap = frameTimestampMs - lastFrameMs;
      // Guard against a paused tab or a seeked video producing absurd gaps.
      if (gap > 0 && gap < 2000) push(gaps, gap);
    }
    lastFrameMs = frameTimestampMs;
    push(latencies, inferenceMs);
    frames += 1;
  }

  return {
    record(frameTimestampMs, inferenceMs, frameConfidence) {
      tick(frameTimestampMs, inferenceMs);
      confidence = frameConfidence;
    },
    recordEmpty(frameTimestampMs, inferenceMs) {
      tick(frameTimestampMs, inferenceMs);
      confidence = 0;
    },
    snapshot() {
      const avgGap = mean(gaps);
      return {
        fps: avgGap > 0 ? 1000 / avgGap : 0,
        inferenceMs: mean(latencies),
        peakInferenceMs: latencies.length > 0 ? Math.max(...latencies) : 0,
        meanConfidence: confidence,
        frames,
      };
    },
    reset() {
      gaps.length = 0;
      latencies.length = 0;
      lastFrameMs = null;
      confidence = 0;
      frames = 0;
    },
  };
}
