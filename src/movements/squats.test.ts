import { describe, expect, it } from 'vitest';
import { evaluate } from '../engine/evaluator';
import type { Landmark, MovementDefinition } from '../engine/types';
import squatsJson from './squats.json';

const squats = squatsJson as unknown as MovementDefinition;

function frame(parts: Record<number, [number, number]>): Landmark[] {
  const ls: Landmark[] = Array.from({ length: 33 }, () => ({ x: 0.5, y: 0.5, visibility: 0 }));
  for (const [i, [x, y]] of Object.entries(parts)) {
    ls[Number(i)] = { x, y, visibility: 1 };
  }
  return ls;
}

// Hip, knee, ankle
const LEFTS = {
  23: [0.4, 0.4] as [number, number], // left hip
  25: [0.4, 0.6] as [number, number], // left knee
  27: [0.4, 0.8] as [number, number], // left ankle
};

describe('squats definition', () => {
  it('detects a normal standing posture in range (straight knee = ~180°)', () => {
    const fb = evaluate(
      frame({
        ...LEFTS,
        25: [0.4, 0.6], // perfectly aligned straight line hip-knee-ankle
      }),
      squats,
    );
    expect(fb.tracked).toBe(true);
    expect(fb.ok).toBe(true);
  });
});
