import { describe, expect, it } from 'vitest';
import { createDynamicTracker } from './dynamics';
import type { DynamicSpec, JointResult } from './types';

const SPEC: DynamicSpec = {
  trackJointId: 'knee',
  enterDownBelow: 110,
  enterUpAbove: 160,
  countOn: 'up',
  label: 'Squats',
};

function joints(angle: number): JointResult[] {
  return [{ id: 'knee', angle, inRange: true, available: true }];
}

/** Feed a sequence of angles at 100ms intervals; return the final result. */
function run(tracker: ReturnType<typeof createDynamicTracker>, angles: number[]) {
  let t = 0;
  let result = tracker.update(joints(angles[0]), t, SPEC);
  for (let i = 1; i < angles.length; i++) {
    t += 100;
    result = tracker.update(joints(angles[i]), t, SPEC);
  }
  return result;
}

describe('createDynamicTracker', () => {
  it('counts one rep per full down→up cycle', () => {
    const tracker = createDynamicTracker();
    // up, down, up, down, up  => two completed up-transitions from down
    const result = run(tracker, [170, 90, 170, 90, 170]);
    expect(result.reps).toBe(2);
  });

  it('does not count the initial settle into the counted phase', () => {
    const tracker = createDynamicTracker();
    // starts in unknown, goes straight up — no prior "down", so no rep
    const result = run(tracker, [170, 175, 170]);
    expect(result.reps).toBe(0);
  });

  it('does not double-count jitter inside the hysteresis band', () => {
    const tracker = createDynamicTracker();
    // one real cycle, but with noise that never re-enters "down"
    const result = run(tracker, [170, 90, 170, 155, 165, 155, 170]);
    expect(result.reps).toBe(1);
  });

  it('does not count jitter around a single threshold', () => {
    const tracker = createDynamicTracker();
    // crosses enterUpAbove repeatedly but never reaches "down" — no reps
    const result = run(tracker, [170, 150, 165, 150, 165]);
    expect(result.reps).toBe(0);
  });

  it('reports positive velocity while extending', () => {
    const tracker = createDynamicTracker();
    tracker.update(joints(90), 0, SPEC);
    const result = tracker.update(joints(120), 100, SPEC); // +30° over 0.1s
    expect(result.velocityDegPerSec).toBeCloseTo(300, 5);
  });

  it('reset() clears reps and phase', () => {
    const tracker = createDynamicTracker();
    run(tracker, [170, 90, 170]);
    tracker.reset();
    const result = tracker.update(joints(170), 0, SPEC);
    expect(result.reps).toBe(0);
    expect(result.phase).toBe('up');
  });

  it('ignores frames where the tracked joint is unavailable (NaN)', () => {
    const tracker = createDynamicTracker();
    // a NaN frame mid-cycle must not break counting
    const result = run(tracker, [170, 90, NaN, 170, 90, 170]);
    expect(result.reps).toBe(2);
  });
});
