import type { Point } from './types';

/**
 * Returns the angle in degrees at vertex `b`, formed by the rays `b->a` and
 * `b->c`. Pure 2D math (x/y only): joint-angle estimates are more stable
 * without MediaPipe's noisy z, and feedback only needs the in-plane angle.
 *
 * No MediaPipe / DOM dependency on purpose — this is the unit-tested core.
 */
export function angleBetween(a: Point, b: Point, c: Point): number {
  const baX = a.x - b.x;
  const baY = a.y - b.y;
  const bcX = c.x - b.x;
  const bcY = c.y - b.y;

  const dot = baX * bcX + baY * bcY;
  const magBA = Math.hypot(baX, baY);
  const magBC = Math.hypot(bcX, bcY);

  if (magBA === 0 || magBC === 0) return 0;

  // Clamp to guard against floating-point drift outside acos's domain.
  const cos = Math.max(-1, Math.min(1, dot / (magBA * magBC)));
  return (Math.acos(cos) * 180) / Math.PI;
}
