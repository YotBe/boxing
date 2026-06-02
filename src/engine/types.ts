/**
 * Core contracts for the pose-correction engine.
 *
 * Everything the engine knows about a movement lives in a `MovementDefinition`,
 * which is pure data (authored as JSON in `src/movements/`). The engine code
 * never references a specific movement — adding one means adding a data file.
 */

/** A 2D point in normalized image coordinates (0..1), as MediaPipe emits. */
export interface Point {
  x: number;
  y: number;
}

/**
 * A pose landmark: a point plus MediaPipe's optional visibility score (0..1).
 * Low visibility means the landmark is occluded or off-screen and shouldn't be
 * trusted. `NormalizedLandmark` from @mediapipe/tasks-vision is structurally
 * compatible, so detector output can be passed straight in.
 */
export interface Landmark extends Point {
  z?: number;
  visibility?: number;
}

/** A landmark is trusted when its visibility is at least this. */
export const VISIBILITY_THRESHOLD = 0.5;

/**
 * A joint angle constraint. The angle is measured at vertex `B`, between rays
 * `B->A` and `B->C`. `points` holds the three landmark indices `[A, B, C]`.
 */
export interface JointAngleSpec {
  id: string; // e.g. "left_elbow"
  label: string; // e.g. "Left elbow"
  points: [number, number, number]; // [A, B (vertex), C] landmark indices
  targetMin: number; // degrees
  targetMax: number; // degrees
}

/** A corrective cue tied to a joint going out of its target range. */
export interface CueRule {
  jointId: string;
  when: 'below' | 'above'; // angle below targetMin / above targetMax
  cue: string; // e.g. "Raise your hands higher"
}

/**
 * Optional dynamic (rep-counting / speed) layer. A rep is a two-threshold
 * hysteresis cycle over one tracked joint's angle: it must cross fully into the
 * "down" phase and back into the "up" phase to count, which prevents jitter
 * near a single threshold from double-counting. This is pure data — the engine
 * stays movement-agnostic.
 */
export interface DynamicSpec {
  trackJointId: string; // joint whose angle drives the cycle, e.g. "left_knee"
  enterDownBelow: number; // enter the flexed "down" phase when angle < this
  enterUpAbove: number; // enter the extended "up" phase when angle > this
  countOn: 'up' | 'down'; // count a rep when entering this phase
  label?: string; // e.g. "Squats", "Jabs"
}

/** A movement, defined entirely as data. No engine code is movement-specific. */
export interface MovementDefinition {
  id: string;
  name: string;
  joints: JointAngleSpec[];
  cues: CueRule[];
  dynamics?: DynamicSpec; // optional → static movements are unaffected
}

/** Per-joint evaluation result for a single frame. */
export interface JointResult {
  id: string;
  angle: number; // degrees (NaN when not available)
  inRange: boolean;
  available: boolean; // false when the joint's landmarks are low-visibility
}

/** Live rep-counting / speed readout for a movement with `dynamics`. */
export interface DynamicResult {
  label: string;
  reps: number;
  phase: 'up' | 'down' | 'unknown';
  velocityDegPerSec: number; // signed angular velocity of the tracked joint
  peakVelocityDegPerSec: number; // best |velocity| in the current rep ("speed")
}

/** The engine's verdict for a single frame against one movement. */
export interface Feedback {
  ok: boolean;
  tracked: boolean; // at least one joint is currently visible/available
  joints: JointResult[];
  activeCues: string[];
  dynamic?: DynamicResult; // present only for movements with `dynamics`
}
