import { angleBetween } from './angles';
import type { Feedback, JointResult, MovementDefinition, Point } from './types';

/**
 * Evaluate a single frame's landmarks against a movement definition.
 *
 * This is the heart of the engine and it is deliberately dumb: it walks the
 * movement's `joints` to compute angles + range checks, then walks its `cues`
 * to surface corrections. There is no branching on which movement this is —
 * all movement-specific knowledge lives in the data.
 */
export function evaluate(
  landmarks: Point[],
  movement: MovementDefinition,
): Feedback {
  const joints: JointResult[] = movement.joints.map((spec) => {
    const [ai, bi, ci] = spec.points;
    const a = landmarks[ai];
    const b = landmarks[bi];
    const c = landmarks[ci];

    // If a required landmark is missing this frame, treat the joint as out of
    // range rather than crashing — the user is likely off-screen / occluded.
    if (!a || !b || !c) {
      return { id: spec.id, angle: NaN, inRange: false };
    }

    const angle = angleBetween(a, b, c);
    const inRange = angle >= spec.targetMin && angle <= spec.targetMax;
    return { id: spec.id, angle, inRange };
  });

  const byId = new Map(joints.map((j) => [j.id, j]));
  const specById = new Map(movement.joints.map((s) => [s.id, s]));

  const activeCues: string[] = [];
  for (const cue of movement.cues) {
    const joint = byId.get(cue.jointId);
    const spec = specById.get(cue.jointId);
    if (!joint || !spec || joint.inRange || Number.isNaN(joint.angle)) continue;

    const triggered =
      (cue.when === 'below' && joint.angle < spec.targetMin) ||
      (cue.when === 'above' && joint.angle > spec.targetMax);
    if (triggered) activeCues.push(cue.cue);
  }

  return {
    ok: joints.every((j) => j.inRange),
    joints,
    activeCues,
  };
}
