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

/** A movement, defined entirely as data. No engine code is movement-specific. */
export interface MovementDefinition {
  id: string;
  name: string;
  joints: JointAngleSpec[];
  cues: CueRule[];
}

/** Per-joint evaluation result for a single frame. */
export interface JointResult {
  id: string;
  angle: number; // degrees
  inRange: boolean;
}

/** The engine's verdict for a single frame against one movement. */
export interface Feedback {
  ok: boolean;
  joints: JointResult[];
  activeCues: string[];
}
