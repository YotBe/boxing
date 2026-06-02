import { describe, expect, it } from 'vitest';
import { evaluate } from '../engine/evaluator';
import type { Landmark, MovementDefinition } from '../engine/types';
import guardJson from './muaythai-guard.json';

const guard = guardJson as unknown as MovementDefinition;

/**
 * Build a 33-landmark frame (only the indices the guard references matter).
 * Coordinates are normalized image space: x right, y DOWN, person facing camera.
 */
function frame(parts: Record<number, [number, number]>): Landmark[] {
  const ls: Landmark[] = Array.from({ length: 33 }, () => ({ x: 0.5, y: 0.5 }));
  for (const [i, [x, y]] of Object.entries(parts)) {
    ls[Number(i)] = { x, y };
  }
  return ls;
}

// Shoulders, hips, elbows shared by both poses; only the wrists move.
const TORSO = {
  11: [0.4, 0.3] as [number, number], // left shoulder
  12: [0.6, 0.3] as [number, number], // right shoulder
  23: [0.43, 0.6] as [number, number], // left hip
  24: [0.57, 0.6] as [number, number], // right hip
  13: [0.42, 0.45] as [number, number], // left elbow (tucked, below shoulder)
  14: [0.58, 0.45] as [number, number], // right elbow
};

describe('muaythai-guard definition', () => {
  it('passes a correct guard: hands up by the face, arms bent', () => {
    const fb = evaluate(
      frame({
        ...TORSO,
        15: [0.45, 0.25], // left wrist up by cheek (above shoulder)
        16: [0.55, 0.25], // right wrist up by cheek
      }),
      guard,
    );
    expect(fb.tracked).toBe(true);
    expect(fb.ok).toBe(true);
    expect(fb.activeCues).toEqual([]);
  });

  it('flags dropped hands with the "hand up" cue, not a backwards one', () => {
    const fb = evaluate(
      frame({
        ...TORSO,
        15: [0.4, 0.55], // left wrist dropped to the waist
        16: [0.6, 0.55], // right wrist dropped
      }),
      guard,
    );
    expect(fb.ok).toBe(false);
    // The first (highest-priority) cue is about raising the hands.
    expect(fb.activeCues[0]).toMatch(/hand up to your cheek/i);
    expect(fb.activeCues.join(' ')).not.toMatch(/tuck/i); // the old inverted cue is gone
  });
});
