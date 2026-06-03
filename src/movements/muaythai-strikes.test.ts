import { describe, expect, it } from 'vitest';
import { evaluate } from '../engine/evaluator';
import type { Landmark, MovementDefinition } from '../engine/types';
import jabJson from './jab.json';
import kneeJson from './knee.json';

const jab = jabJson as unknown as MovementDefinition;
const knee = kneeJson as unknown as MovementDefinition;

function frame(parts: Record<number, [number, number]>): Landmark[] {
  const ls: Landmark[] = Array.from({ length: 33 }, () => ({ x: 0.5, y: 0.5, visibility: 0 }));
  for (const [i, [x, y]] of Object.entries(parts)) {
    ls[Number(i)] = { x, y, visibility: 1 };
  }
  return ls;
}

describe('Muay Thai Strike Evaluations', () => {
  it('passes a fully extended jab elbow angle', () => {
    const fb = evaluate(
      frame({
        11: [0.4, 0.3], // left shoulder
        13: [0.4, 0.45], // left elbow
        15: [0.4, 0.6], // left wrist (straight line downward = 180 deg)
      }),
      jab
    );
    expect(fb.tracked).toBe(true);
    expect(fb.ok).toBe(true);
  });

  it('evaluates knee strike hip angle', () => {
    const fb = evaluate(
      frame({
        12: [0.6, 0.3], // right shoulder
        24: [0.6, 0.6], // right hip
        26: [0.6, 0.75], // right knee
      }),
      knee
    );
    expect(fb.tracked).toBe(true);
    expect(fb.ok).toBe(true);
  });
});
