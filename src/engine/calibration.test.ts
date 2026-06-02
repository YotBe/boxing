import { describe, expect, it } from 'vitest';
import {
  CALIBRATION_MARGIN_DEG,
  calibrateDynamics,
  calibrateJoints,
  meanAngles,
} from './calibration';
import type { DynamicSpec, JointResult, MovementDefinition } from './types';

function jr(id: string, angle: number, available = true): JointResult {
  return { id, angle, inRange: true, available };
}

const MOVEMENT: MovementDefinition = {
  id: 'm',
  name: 'M',
  joints: [
    { id: 'a', label: 'A', points: [0, 1, 2], targetMin: 0, targetMax: 10 },
    { id: 'b', label: 'B', points: [3, 4, 5], targetMin: 0, targetMax: 10 },
  ],
  cues: [],
};

describe('meanAngles', () => {
  it('averages available, finite angles per joint', () => {
    const means = meanAngles([
      [jr('a', 90), jr('b', 40)],
      [jr('a', 100), jr('b', 60)],
    ]);
    expect(means.get('a')).toBeCloseTo(95, 5);
    expect(means.get('b')).toBeCloseTo(50, 5);
  });

  it('ignores unavailable and NaN samples', () => {
    const means = meanAngles([
      [jr('a', 90), jr('a', NaN), jr('a', 200, false)],
      [jr('a', 110)],
    ]);
    expect(means.get('a')).toBeCloseTo(100, 5);
  });

  it('omits joints with no usable samples', () => {
    const means = meanAngles([[jr('a', NaN), jr('b', 30, false)]]);
    expect(means.has('a')).toBe(false);
    expect(means.has('b')).toBe(false);
  });
});

describe('calibrateJoints', () => {
  it('centres each target range on the captured mean ± margin', () => {
    const means = new Map([['a', 95]]);
    const joints = calibrateJoints(MOVEMENT, means);
    const a = joints.find((j) => j.id === 'a')!;
    expect(a.targetMin).toBeCloseTo(95 - CALIBRATION_MARGIN_DEG, 5);
    expect(a.targetMax).toBeCloseTo(95 + CALIBRATION_MARGIN_DEG, 5);
  });

  it('leaves joints without a mean untouched', () => {
    const joints = calibrateJoints(MOVEMENT, new Map([['a', 95]]));
    const b = joints.find((j) => j.id === 'b')!;
    expect(b.targetMin).toBe(0);
    expect(b.targetMax).toBe(10);
  });

  it('clamps to [0,180]', () => {
    const joints = calibrateJoints(MOVEMENT, new Map([['a', 175]]), 20);
    const a = joints.find((j) => j.id === 'a')!;
    expect(a.targetMin).toBe(155);
    expect(a.targetMax).toBe(180);
  });
});

describe('calibrateDynamics', () => {
  const base: DynamicSpec = {
    trackJointId: 'knee',
    enterDownBelow: 0,
    enterUpAbove: 0,
    countOn: 'up',
    label: 'Squats',
  };

  it('places both thresholds strictly between the extremes', () => {
    const out = calibrateDynamics(base, 170, 90);
    expect(out.enterDownBelow).toBeGreaterThan(90);
    expect(out.enterUpAbove).toBeLessThan(170);
    expect(out.enterDownBelow).toBeLessThan(out.enterUpAbove);
  });

  it('is independent of capture order', () => {
    const a = calibrateDynamics(base, 170, 90);
    const b = calibrateDynamics(base, 90, 170);
    expect(b).toEqual(a);
  });

  it('preserves a dead-band even when extremes are nearly equal', () => {
    const out = calibrateDynamics(base, 100, 101);
    expect(out.enterDownBelow).toBeLessThan(out.enterUpAbove);
  });

  it('keeps countOn and trackJointId from the original spec', () => {
    const out = calibrateDynamics(base, 170, 90);
    expect(out.countOn).toBe('up');
    expect(out.trackJointId).toBe('knee');
  });
});
