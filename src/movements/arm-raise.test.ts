import { describe, expect, it } from 'vitest';
import { evaluate } from '../engine/evaluator';
import { createDynamicTracker } from '../engine/dynamics';
import armRaise from './arm-raise.json';
import type { Landmark, MovementDefinition } from '../engine/types';

/**
 * Geometry check for the demo config.
 *
 * `arm-raise.json` exists to show that a movement is data — it is loaded and
 * switched to at runtime with no engine change. That argument only lands if the
 * thing actually works when someone raises their arm, so the thresholds are
 * pinned here the same way the guard's and the strikes' are.
 */

const mov = armRaise as MovementDefinition;

/** World landmarks: metres, origin near the hips, y increasing downward. */
function pose(elbow: [number, number, number]): Landmark[] {
  const ls: Landmark[] = Array.from({ length: 33 }, () => ({
    x: 0,
    y: 0,
    z: 0,
    visibility: 0.9,
  }));
  ls[11] = { x: 0.2, y: -0.5, z: 0, visibility: 0.9 }; // left shoulder
  ls[23] = { x: 0.1, y: 0.0, z: 0, visibility: 0.9 }; // left hip
  ls[13] = { x: elbow[0], y: elbow[1], z: elbow[2], visibility: 0.9 };
  return ls;
}

const ARM_DOWN = pose([0.25, -0.2, 0]); // ~21°, hanging at the side
const ARM_OUT = pose([0.55, -0.5, 0]); // ~101°, straight out to the side
const ARM_UP = pose([0.25, -0.85, 0]); // ~177°, overhead

describe('arm-raise demo config', () => {
  it('rejects a hanging arm and accepts an overhead one', () => {
    const down = evaluate(ARM_DOWN, mov);
    expect(down.ok).toBe(false);
    expect(down.activeCues).toHaveLength(1);

    expect(evaluate(ARM_UP, mov).ok).toBe(true);
  });

  it('leaves a half-raise inside the hysteresis band', () => {
    // Arm straight out is neither phase, so a partial rep cannot be counted in
    // either direction — the dead band is what stops a wavering arm scoring.
    const spec = mov.dynamics!;
    const angle = evaluate(ARM_OUT, mov).joints[0].angle;
    expect(angle).toBeGreaterThan(spec.enterDownBelow);
    expect(angle).toBeLessThan(spec.enterUpAbove);
  });

  it('counts a rep per full down-up cycle', () => {
    const tracker = createDynamicTracker();
    const spec = mov.dynamics!;

    expect(tracker.update(evaluate(ARM_DOWN, mov).joints, 0, spec).reps).toBe(0);
    expect(tracker.update(evaluate(ARM_UP, mov).joints, 500, spec).reps).toBe(1);
    tracker.update(evaluate(ARM_DOWN, mov).joints, 1000, spec);
    expect(tracker.update(evaluate(ARM_UP, mov).joints, 1500, spec).reps).toBe(2);
  });
});
