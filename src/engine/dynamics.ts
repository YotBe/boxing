import type { DynamicResult, DynamicSpec, JointResult } from './types';

/**
 * Stateful rep-counter + speed tracker for a movement's `dynamics` spec.
 *
 * A rep is a two-threshold (hysteresis) cycle over one tracked joint's angle.
 * The angle must cross *fully* into the "down" phase and back into the "up"
 * phase (or vice-versa) to count; the dead-band between thresholds means jitter
 * near a single value can't double-count. This is the generic temporal engine —
 * what counts as a rep is entirely in the data (which joint, which thresholds).
 */
export interface DynamicTracker {
  update(
    joints: JointResult[],
    timestampMs: number,
    spec: DynamicSpec,
  ): DynamicResult;
  reset(): void;
}

type Phase = 'up' | 'down' | 'unknown';

function opposite(phase: 'up' | 'down'): 'up' | 'down' {
  return phase === 'up' ? 'down' : 'up';
}

export function createDynamicTracker(): DynamicTracker {
  let phase: Phase = 'unknown';
  let reps = 0;
  let peak = 0;
  let prevAngle: number | null = null;
  let prevTime: number | null = null;

  function classify(angle: number, spec: DynamicSpec): Phase {
    if (angle < spec.enterDownBelow) return 'down';
    if (angle > spec.enterUpAbove) return 'up';
    return phase; // inside the hysteresis band → hold the current phase
  }

  return {
    update(joints, timestampMs, spec) {
      const tracked = joints.find((j) => j.id === spec.trackJointId);
      const angle = tracked?.angle;

      let velocity = 0;
      if (angle !== undefined && !Number.isNaN(angle)) {
        if (prevAngle !== null && prevTime !== null) {
          const dtSec = (timestampMs - prevTime) / 1000;
          if (dtSec > 0) velocity = (angle - prevAngle) / dtSec;
        }
        prevAngle = angle;
        prevTime = timestampMs;

        peak = Math.max(peak, Math.abs(velocity));

        const next = classify(angle, spec);
        if (next !== phase) {
          if (next === spec.countOn && phase === opposite(spec.countOn)) {
            reps += 1;
            peak = Math.abs(velocity); // start measuring the next rep's speed
          }
          phase = next;
        }
      }

      return {
        label: spec.label ?? 'Reps',
        reps,
        phase,
        velocityDegPerSec: velocity,
        peakVelocityDegPerSec: peak,
      };
    },
    reset() {
      phase = 'unknown';
      reps = 0;
      peak = 0;
      prevAngle = null;
      prevTime = null;
    },
  };
}
