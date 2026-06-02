import { describe, expect, it } from 'vitest';
import { createSmoother } from './smoothing';
import type { Landmark } from './types';

function one(x: number, y: number, visibility = 1): Landmark[] {
  return [{ x, y, visibility }];
}

describe('createSmoother', () => {
  it('returns the first frame unchanged (seeds state)', () => {
    const s = createSmoother(0.5);
    const out = s.smooth(one(1, 2));
    expect(out[0].x).toBe(1);
    expect(out[0].y).toBe(2);
  });

  it('blends toward a constant input over successive frames', () => {
    const s = createSmoother(0.5);
    s.smooth(one(0, 0));
    let out = s.smooth(one(10, 10));
    expect(out[0].x).toBeCloseTo(5, 5); // 0.5*10 + 0.5*0
    out = s.smooth(one(10, 10));
    expect(out[0].x).toBeCloseTo(7.5, 5); // converging toward 10
    out = s.smooth(one(10, 10));
    expect(out[0].x).toBeCloseTo(8.75, 5);
  });

  it('passes raw visibility through (drop-outs are not lagged)', () => {
    const s = createSmoother(0.5);
    s.smooth(one(0, 0, 0.9));
    const out = s.smooth(one(10, 10, 0.1));
    expect(out[0].visibility).toBe(0.1);
  });

  it('reset() re-seeds from the next frame', () => {
    const s = createSmoother(0.5);
    s.smooth(one(0, 0));
    s.reset();
    const out = s.smooth(one(10, 10));
    expect(out[0].x).toBe(10);
  });

  it('re-seeds when the landmark count changes', () => {
    const s = createSmoother(0.5);
    s.smooth(one(0, 0));
    const out = s.smooth([
      { x: 4, y: 4, visibility: 1 },
      { x: 8, y: 8, visibility: 1 },
    ]);
    expect(out).toHaveLength(2);
    expect(out[0].x).toBe(4);
  });
});
