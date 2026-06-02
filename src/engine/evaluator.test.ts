import { describe, expect, it } from 'vitest';
import { evaluate } from './evaluator';
import type { Landmark, MovementDefinition } from './types';

const MOVEMENT: MovementDefinition = {
  id: 'test',
  name: 'Test',
  joints: [
    { id: 'elbow', label: 'Elbow', points: [0, 1, 2], targetMin: 20, targetMax: 90 },
  ],
  cues: [{ jointId: 'elbow', when: 'above', cue: 'Bend more.' }],
};

// vertex at index 1; a/c chosen to make a known angle.
function frame(angleShape: 'right' | 'straight', visibility = 1): Landmark[] {
  const v = visibility;
  if (angleShape === 'right') {
    return [
      { x: 1, y: 0, visibility: v },
      { x: 0, y: 0, visibility: v }, // vertex
      { x: 0, y: 1, visibility: v },
    ];
  }
  return [
    { x: -1, y: 0, visibility: v },
    { x: 0, y: 0, visibility: v }, // vertex
    { x: 1, y: 0, visibility: v },
  ];
}

describe('evaluate', () => {
  it('marks an in-range, visible joint ok with no cues', () => {
    const fb = evaluate(frame('right'), MOVEMENT); // 90° == targetMax
    expect(fb.joints[0]).toMatchObject({ inRange: true, available: true });
    expect(fb.ok).toBe(true);
    expect(fb.tracked).toBe(true);
    expect(fb.activeCues).toEqual([]);
  });

  it('fires the matching cue when an available joint is out of range', () => {
    const fb = evaluate(frame('straight'), MOVEMENT); // 180° > targetMax
    expect(fb.ok).toBe(false);
    expect(fb.activeCues).toEqual(['Bend more.']);
  });

  it('treats low-visibility joints as unavailable: no cue, not "wrong"', () => {
    const fb = evaluate(frame('straight', 0.1), MOVEMENT);
    expect(fb.joints[0].available).toBe(false);
    expect(fb.tracked).toBe(false);
    expect(fb.ok).toBe(false); // can't claim "good" when we can't see
    expect(fb.activeCues).toEqual([]); // but no false correction either
  });
});
