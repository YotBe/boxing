import type { Landmark } from './types';

/**
 * A stateful exponential-moving-average smoother for pose landmarks.
 *
 * MediaPipe's per-frame landmarks jitter noticeably; blending each frame with
 * the previous smoothed value steadies both the drawn skeleton and the angle
 * readings. `alpha` is the weight of the newest frame (higher = more
 * responsive, lower = smoother). Kept domain-agnostic and dependency-free.
 *
 * (Upgrade path: a One-Euro filter adapts smoothing to motion speed, trading
 * less lag during fast moves; EMA is the simple, predictable baseline.)
 */
export interface Smoother {
  smooth(landmarks: Landmark[]): Landmark[];
  reset(): void;
}

export function createSmoother(alpha = 0.5): Smoother {
  let prev: Landmark[] | null = null;

  return {
    smooth(landmarks) {
      if (!prev || prev.length !== landmarks.length) {
        prev = landmarks.map((l) => ({ ...l }));
        return prev;
      }

      const next = landmarks.map((l, i) => {
        const p = prev![i];
        return {
          x: alpha * l.x + (1 - alpha) * p.x,
          y: alpha * l.y + (1 - alpha) * p.y,
          z:
            l.z !== undefined && p.z !== undefined
              ? alpha * l.z + (1 - alpha) * p.z
              : l.z,
          // Visibility tracks the raw signal so a landmark that drops out is
          // reflected promptly rather than lingering as "visible".
          visibility: l.visibility,
        } satisfies Landmark;
      });

      prev = next;
      return next;
    },
    reset() {
      prev = null;
    },
  };
}
