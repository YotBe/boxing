import { describe, expect, it } from 'vitest';
import { evaluate } from '../engine/evaluator';
import type { Landmark, MovementDefinition } from '../engine/types';
import jabJson from './jab.json';
import kneeJson from './knee.json';
import leftHookJson from './left-hook.json';
import rightElbowJson from './right-elbow.json';
import leftElbowJson from './left-elbow.json';
import rightHookJson from './right-hook.json';

const jab = jabJson as unknown as MovementDefinition;
const knee = kneeJson as unknown as MovementDefinition;
const leftHook = leftHookJson as unknown as MovementDefinition;
const rightElbow = rightElbowJson as unknown as MovementDefinition;
const leftElbow = leftElbowJson as unknown as MovementDefinition;
const rightHook = rightHookJson as unknown as MovementDefinition;

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

  it('evaluates left hook shoulder angle', () => {
    const fb = evaluate(
      frame({
        11: [0.4, 0.3], // left shoulder
        23: [0.4, 0.6], // left hip
        13: [0.25, 0.3], // left elbow (perpendicular = 90 deg)
      }),
      leftHook
    );
    expect(fb.tracked).toBe(true);
    expect(fb.ok).toBe(true);
  });

  it('evaluates right elbow strike flexion', () => {
    const fb = evaluate(
      frame({
        12: [0.6, 0.3], // right shoulder
        14: [0.6, 0.45], // right elbow
        16: [0.675, 0.32], // right wrist (approx 30 deg flexion)
      }),
      rightElbow
    );
    expect(fb.tracked).toBe(true);
    expect(fb.ok).toBe(true);
  });

  it('evaluates left elbow strike flexion', () => {
    const fb = evaluate(
      frame({
        11: [0.4, 0.3], // left shoulder
        13: [0.4, 0.45], // left elbow
        15: [0.325, 0.32], // left wrist (approx 30 deg flexion)
      }),
      leftElbow
    );
    expect(fb.tracked).toBe(true);
    expect(fb.ok).toBe(true);
  });

  it('evaluates right hook shoulder angle', () => {
    const fb = evaluate(
      frame({
        12: [0.6, 0.3], // right shoulder
        24: [0.6, 0.6], // right hip
        14: [0.75, 0.3], // right elbow (perpendicular = 90 deg)
      }),
      rightHook
    );
    expect(fb.tracked).toBe(true);
    expect(fb.ok).toBe(true);
  });
});
