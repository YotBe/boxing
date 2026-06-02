import type {
  DynamicSpec,
  JointAngleSpec,
  JointResult,
  MovementDefinition,
} from './types';

/** Tolerance (degrees) added either side of a captured mean angle. */
export const CALIBRATION_MARGIN_DEG = 12;

function clampAngle(deg: number): number {
  return Math.max(0, Math.min(180, deg));
}

/**
 * Average the captured angle for each joint across frames, ignoring frames
 * where the joint was unavailable (occluded / off-screen) or NaN — so a few
 * bad frames during capture don't poison the result.
 */
export function meanAngles(samples: JointResult[][]): Map<string, number> {
  const sums = new Map<string, { total: number; count: number }>();

  for (const frame of samples) {
    for (const joint of frame) {
      if (!joint.available || Number.isNaN(joint.angle)) continue;
      const acc = sums.get(joint.id) ?? { total: 0, count: 0 };
      acc.total += joint.angle;
      acc.count += 1;
      sums.set(joint.id, acc);
    }
  }

  const means = new Map<string, number>();
  for (const [id, { total, count }] of sums) {
    if (count > 0) means.set(id, total / count);
  }
  return means;
}

/**
 * Produce calibrated joint specs: for every joint we have a captured mean for,
 * centre its target range on that mean ± margin. Joints with no usable samples
 * are left exactly as authored.
 */
export function calibrateJoints(
  movement: MovementDefinition,
  means: Map<string, number>,
  margin = CALIBRATION_MARGIN_DEG,
): JointAngleSpec[] {
  return movement.joints.map((spec) => {
    const mean = means.get(spec.id);
    if (mean === undefined) return { ...spec };
    return {
      ...spec,
      targetMin: clampAngle(mean - margin),
      targetMax: clampAngle(mean + margin),
    };
  });
}

/**
 * Derive dynamic rep thresholds from two captured extremes of the tracked
 * joint. "Up" is always the larger angle in our model, so we don't need to know
 * which capture was which: sort into high/low and place the two hysteresis
 * thresholds inside that span with a dead-band between them.
 */
export function calibrateDynamics(
  dynamics: DynamicSpec,
  angleA: number,
  angleB: number,
): DynamicSpec {
  const high = Math.max(angleA, angleB);
  const low = Math.min(angleA, angleB);
  const band = Math.max(8, 0.25 * (high - low));

  let enterUpAbove = clampAngle(high - band);
  let enterDownBelow = clampAngle(low + band);

  // Guarantee a non-empty dead-band even when the two captures are very close.
  if (enterDownBelow >= enterUpAbove) {
    const mid = (high + low) / 2;
    enterDownBelow = clampAngle(mid - 4);
    enterUpAbove = clampAngle(mid + 4);
  }

  return { ...dynamics, enterUpAbove, enterDownBelow };
}
