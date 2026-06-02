import type { Point } from './types';

/** A point that may carry a depth component (e.g. a MediaPipe world landmark). */
type Point3 = Point & { z?: number };

/**
 * Returns the angle in degrees at vertex `b`, formed by the rays `b->a` and
 * `b->c`. Uses z when present (missing z is treated as 0), so the same function
 * gives a true 3D joint angle for MediaPipe *world* landmarks and the plain 2D
 * angle for image-plane points. For a movement facing the camera, the 3D angle
 * is essential: forearms angled toward the lens are badly foreshortened in 2D.
 *
 * No MediaPipe / DOM dependency on purpose — this is the unit-tested core.
 */
export function angleBetween(a: Point3, b: Point3, c: Point3): number {
  const baX = a.x - b.x;
  const baY = a.y - b.y;
  const baZ = (a.z ?? 0) - (b.z ?? 0);
  const bcX = c.x - b.x;
  const bcY = c.y - b.y;
  const bcZ = (c.z ?? 0) - (b.z ?? 0);

  const dot = baX * bcX + baY * bcY + baZ * bcZ;
  const magBA = Math.hypot(baX, baY, baZ);
  const magBC = Math.hypot(bcX, bcY, bcZ);

  if (magBA === 0 || magBC === 0) return 0;

  // Clamp to guard against floating-point drift outside acos's domain.
  const cos = Math.max(-1, Math.min(1, dot / (magBA * magBC)));
  return (Math.acos(cos) * 180) / Math.PI;
}
