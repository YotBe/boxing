import { describe, expect, it } from 'vitest';
import { angleBetween } from './angles';

describe('angleBetween', () => {
  it('returns ~90 degrees for a right angle', () => {
    // b at origin, a along +x, c along +y
    const angle = angleBetween({ x: 1, y: 0 }, { x: 0, y: 0 }, { x: 0, y: 1 });
    expect(angle).toBeCloseTo(90, 5);
  });

  it('returns ~180 degrees for a straight line', () => {
    // a and c on opposite sides of vertex b
    const angle = angleBetween({ x: -1, y: 0 }, { x: 0, y: 0 }, { x: 1, y: 0 });
    expect(angle).toBeCloseTo(180, 5);
  });

  it('returns ~0 degrees when the rays point the same way', () => {
    const angle = angleBetween({ x: 1, y: 0 }, { x: 0, y: 0 }, { x: 2, y: 0 });
    expect(angle).toBeCloseTo(0, 5);
  });

  it('returns ~45 degrees for a known triangle', () => {
    const angle = angleBetween({ x: 1, y: 0 }, { x: 0, y: 0 }, { x: 1, y: 1 });
    expect(angle).toBeCloseTo(45, 5);
  });

  it('is independent of vector length', () => {
    const short = angleBetween({ x: 2, y: 0 }, { x: 0, y: 0 }, { x: 0, y: 2 });
    const long = angleBetween({ x: 100, y: 0 }, { x: 0, y: 0 }, { x: 0, y: 50 });
    expect(short).toBeCloseTo(long, 5);
  });

  it('returns 0 for a degenerate (zero-length) ray', () => {
    expect(angleBetween({ x: 0, y: 0 }, { x: 0, y: 0 }, { x: 1, y: 1 })).toBe(0);
  });
});
