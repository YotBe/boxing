import { describe, expect, it } from 'vitest';
import { applyCalibration, createCalibrator } from './calibration';
import type { JointResult, MovementDefinition } from './types';

function jr(id: string, angle: number, available = true): JointResult {
  return { id, angle, inRange: true, available };
}

describe('createCalibrator', () => {
  it('builds a padded range around the observed angle envelope', () => {
    const cal = createCalibrator(['elbow']);
    cal.add([jr('elbow', 40)]);
    cal.add([jr('elbow', 50)]);
    cal.add([jr('elbow', 45)]);
    const out = cal.finish(15);
    expect(out.elbow).toEqual({ min: 25, max: 65 }); // [40-15, 50+15]
    expect(cal.samples()).toBe(3);
  });

  it('clamps padded ranges to [0, 180]', () => {
    const cal = createCalibrator(['hand']);
    cal.add([jr('hand', 5)]);
    cal.add([jr('hand', 178)]);
    expect(cal.finish(15)).toEqual({ hand: { min: 0, max: 180 } });
  });

  it('ignores unavailable / NaN frames and omits never-seen joints', () => {
    const cal = createCalibrator(['a', 'b']);
    cal.add([jr('a', 30), jr('b', 90, false)]); // b unavailable
    cal.add([jr('a', 32), { id: 'b', angle: NaN, inRange: false, available: true }]);
    const out = cal.finish(10);
    expect(out.a).toEqual({ min: 20, max: 42 });
    expect(out.b).toBeUndefined(); // never observed -> keep definition default
    expect(cal.samples()).toBe(0); // never a frame with all joints available
  });

  it('counts only frames where every tracked joint is available', () => {
    const cal = createCalibrator(['a', 'b']);
    cal.add([jr('a', 10), jr('b', 20)]); // full
    cal.add([jr('a', 12), jr('b', 22, false)]); // partial
    expect(cal.samples()).toBe(1);
  });

  it('reset clears observations', () => {
    const cal = createCalibrator(['a']);
    cal.add([jr('a', 30)]);
    cal.reset();
    expect(cal.samples()).toBe(0);
    expect(cal.finish()).toEqual({});
  });
});

describe('applyCalibration', () => {
  const movement: MovementDefinition = {
    id: 'guard',
    name: 'Guard',
    joints: [
      { id: 'elbow', label: 'Elbow', points: [11, 13, 15], targetMin: 10, targetMax: 100 },
      { id: 'hand', label: 'Hand', points: [23, 11, 15], targetMin: 80, targetMax: 180 },
    ],
    cues: [],
  };

  it('overrides target ranges only for calibrated joints', () => {
    const out = applyCalibration(movement, { elbow: { min: 25, max: 65 } });
    expect(out.joints[0]).toMatchObject({ targetMin: 25, targetMax: 65 });
    expect(out.joints[1]).toMatchObject({ targetMin: 80, targetMax: 180 }); // untouched
  });

  it('does not mutate the input movement', () => {
    applyCalibration(movement, { elbow: { min: 1, max: 2 } });
    expect(movement.joints[0].targetMin).toBe(10);
  });
});
