import { angleBetween } from './angles';
import {
  VISIBILITY_THRESHOLD,
  type Feedback,
  type JointResult,
  type Landmark,
  type MovementDefinition,
} from './types';

/** A landmark is usable only if it exists and clears the visibility bar. */
function isVisible(landmark: Landmark | undefined): landmark is Landmark {
  return (
    !!landmark &&
    (landmark.visibility === undefined ||
      landmark.visibility >= VISIBILITY_THRESHOLD)
  );
}

/**
 * Evaluate a single frame's landmarks against a movement definition.
 *
 * This is the heart of the engine and it is deliberately dumb: it walks the
 * movement's `joints` to compute angles + range checks, then walks its `cues`
 * to surface corrections. There is no branching on which movement this is —
 * all movement-specific knowledge lives in the data.
 *
 * Joints whose landmarks are occluded / off-screen are marked `available:false`
 * and excluded from the verdict, so partial visibility shows a neutral state
 * rather than a false "wrong".
 */
export function evaluate(
  landmarks: Landmark[],
  movement: MovementDefinition,
): Feedback {
  const joints: JointResult[] = movement.joints.map((spec) => {
    const [ai, bi, ci] = spec.points;
    const a = landmarks[ai];
    const b = landmarks[bi];
    const c = landmarks[ci];

    if (!isVisible(a) || !isVisible(b) || !isVisible(c)) {
      return { id: spec.id, angle: NaN, inRange: false, available: false };
    }

    const angle = angleBetween(a, b, c);
    const inRange = angle >= spec.targetMin && angle <= spec.targetMax;
    return { id: spec.id, angle, inRange, available: true };
  });

  const byId = new Map(joints.map((j) => [j.id, j]));
  const specById = new Map(movement.joints.map((s) => [s.id, s]));

  const activeCues: string[] = [];
  for (const cue of movement.cues) {
    const joint = byId.get(cue.jointId);
    const spec = specById.get(cue.jointId);
    if (!joint || !spec || !joint.available || joint.inRange) continue;

    const triggered =
      (cue.when === 'below' && joint.angle < spec.targetMin) ||
      (cue.when === 'above' && joint.angle > spec.targetMax);
    if (triggered) activeCues.push(cue.cue);
  }

  const available = joints.filter((j) => j.available);
  return {
    tracked: available.length > 0,
    // "ok" requires that we can actually see joints and they're all in range.
    ok: available.length > 0 && available.every((j) => j.inRange),
    joints,
    activeCues,
  };
}
