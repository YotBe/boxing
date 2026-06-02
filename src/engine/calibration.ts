import type { JointResult, MovementDefinition } from './types';

/**
 * Per-body / per-camera calibration for a movement.
 *
 * Joint-angle thresholds that are "correct" vary a lot with body proportions and
 * camera height/angle, so fixed defaults inevitably mis-fire. Instead we let the
 * user hold a correct pose and *observe* the angle each tracked joint actually
 * produces, then build each joint's accepted range around that observation.
 *
 * This module is pure (the accumulator + range math are unit-tested); only the
 * load/save helpers touch `localStorage`, guarded for non-browser envs.
 */

export interface JointRange {
  min: number;
  max: number;
}

/** jointId -> calibrated accepted angle range. */
export type CalibrationMap = Record<string, JointRange>;

const ANGLE_MIN = 0;
const ANGLE_MAX = 180;

function clampAngle(deg: number): number {
  return Math.max(ANGLE_MIN, Math.min(ANGLE_MAX, deg));
}

export interface Calibrator {
  /** Fold one frame's joint results into the running observation. */
  add(joints: JointResult[]): void;
  /** Frames in which *every* tracked joint was available. */
  samples(): number;
  /**
   * Build calibrated ranges from the observed angle envelope, padded by
   * `marginDeg` on each side and clamped to [0, 180]. Joints never observed
   * (always occluded) are omitted so their definition default is kept.
   */
  finish(marginDeg?: number): CalibrationMap;
  reset(): void;
}

/**
 * Accumulate the min/max angle observed for each tracked joint across a capture
 * window. Holding a pose with natural micro-movement yields a small envelope
 * that, once padded, becomes a forgiving-but-honest accepted range.
 */
export function createCalibrator(trackedJointIds: string[]): Calibrator {
  const ids = [...trackedJointIds];
  let observed: Record<string, { min: number; max: number }> = {};
  let fullFrames = 0;

  return {
    add(joints) {
      const byId = new Map(joints.map((j) => [j.id, j]));
      let allAvailable = ids.length > 0;
      for (const id of ids) {
        const j = byId.get(id);
        if (!j || !j.available || Number.isNaN(j.angle)) {
          allAvailable = false;
          continue;
        }
        const prev = observed[id];
        observed[id] = prev
          ? { min: Math.min(prev.min, j.angle), max: Math.max(prev.max, j.angle) }
          : { min: j.angle, max: j.angle };
      }
      if (allAvailable) fullFrames += 1;
    },
    samples() {
      return fullFrames;
    },
    finish(marginDeg = 15) {
      const cal: CalibrationMap = {};
      for (const id of ids) {
        const o = observed[id];
        if (!o) continue;
        const min = clampAngle(o.min - marginDeg);
        const max = clampAngle(o.max + marginDeg);
        // Guarantee a non-degenerate range even if min/max collapse at a bound.
        cal[id] = min < max ? { min, max } : { min: clampAngle(min - 1), max: clampAngle(max + 1) };
      }
      return cal;
    },
    reset() {
      observed = {};
      fullFrames = 0;
    },
  };
}

/**
 * Return a copy of `movement` with each joint's target range replaced by its
 * calibrated range, where one exists. Movement-agnostic: it only rewrites the
 * numbers, never the joint/cue semantics.
 */
export function applyCalibration(
  movement: MovementDefinition,
  cal: CalibrationMap,
): MovementDefinition {
  return {
    ...movement,
    joints: movement.joints.map((j) => {
      const r = cal[j.id];
      return r ? { ...j, targetMin: r.min, targetMax: r.max } : j;
    }),
  };
}

// Versioned: angles are now computed in 3D, so any v1 (2D) calibration is on a
// different scale and must be ignored rather than loaded.
const STORAGE_PREFIX = 'pose-coach:calibration:v2:';

function storage(): Storage | null {
  try {
    return typeof localStorage !== 'undefined' ? localStorage : null;
  } catch {
    return null; // e.g. blocked by privacy settings
  }
}

export function loadCalibration(movementId: string): CalibrationMap | null {
  const s = storage();
  if (!s) return null;
  try {
    const raw = s.getItem(STORAGE_PREFIX + movementId);
    return raw ? (JSON.parse(raw) as CalibrationMap) : null;
  } catch {
    return null;
  }
}

export function saveCalibration(movementId: string, cal: CalibrationMap): void {
  const s = storage();
  if (!s) return;
  try {
    s.setItem(STORAGE_PREFIX + movementId, JSON.stringify(cal));
  } catch {
    /* quota / disabled — non-fatal */
  }
}

export function clearCalibration(movementId: string): void {
  const s = storage();
  if (!s) return;
  try {
    s.removeItem(STORAGE_PREFIX + movementId);
  } catch {
    /* non-fatal */
  }
}
