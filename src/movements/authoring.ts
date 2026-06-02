import type {
  CueRule,
  DynamicSpec,
  JointAngleSpec,
  MovementDefinition,
} from '../engine/types';

/**
 * Editable, in-progress shapes for the Movement Builder. These mirror the
 * engine's `MovementDefinition` but keep fields loose (e.g. partial points,
 * optional dynamics) while the user is still filling them in. The pure helpers
 * below turn a draft into a real `MovementDefinition` and validate it.
 *
 * No React / DOM here on purpose — this is the unit-tested core of authoring,
 * mirroring how the engine keeps its math testable and dependency-free.
 */
export interface JointDraft extends JointAngleSpec {}

export interface DynamicsDraft extends DynamicSpec {}

export interface MovementDraft {
  id: string;
  name: string;
  joints: JointDraft[];
  cues: CueRule[];
  dynamicsEnabled: boolean;
  dynamics: DynamicsDraft;
}

/** Min/max bounds an angle constraint must fall within (degrees). */
export const ANGLE_MIN = 0;
export const ANGLE_MAX = 180;

/** Turn a display name into a URL/id-friendly slug ("Squat Hold" -> "squat-hold"). */
export function slugify(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function defaultJoint(): JointDraft {
  return { id: '', label: '', points: [11, 13, 15], targetMin: 0, targetMax: 180 };
}

export function emptyDraft(): MovementDraft {
  return {
    id: '',
    name: '',
    joints: [],
    cues: [],
    dynamicsEnabled: false,
    dynamics: {
      trackJointId: '',
      enterDownBelow: 90,
      enterUpAbove: 150,
      countOn: 'up',
      label: '',
    },
  };
}

/** Append a blank joint row, auto-naming its id/label so refs stay stable. */
export function addJoint(draft: MovementDraft): MovementDraft {
  const n = draft.joints.length + 1;
  const joint = defaultJoint();
  joint.id = `joint_${n}`;
  joint.label = `Joint ${n}`;
  return { ...draft, joints: [...draft.joints, joint] };
}

/**
 * Serialize a draft into the engine's `MovementDefinition`. Drops the
 * authoring-only `dynamicsEnabled` flag and omits `dynamics` entirely when
 * disabled, so static movements serialize exactly as the hand-written JSON does.
 */
export function draftToDefinition(draft: MovementDraft): MovementDefinition {
  const def: MovementDefinition = {
    id: draft.id.trim(),
    name: draft.name.trim(),
    joints: draft.joints.map((j) => ({
      id: j.id,
      label: j.label,
      points: [j.points[0], j.points[1], j.points[2]],
      targetMin: j.targetMin,
      targetMax: j.targetMax,
    })),
    cues: draft.cues.map((c) => ({ ...c })),
  };
  if (draft.dynamicsEnabled) {
    const d = draft.dynamics;
    def.dynamics = {
      trackJointId: d.trackJointId,
      enterDownBelow: d.enterDownBelow,
      enterUpAbove: d.enterUpAbove,
      countOn: d.countOn,
      ...(d.label?.trim() ? { label: d.label.trim() } : {}),
    };
  }
  return def;
}

/**
 * Human-readable validation errors for a draft. Empty array == valid enough to
 * evaluate and export. Complements `isMovementDefinition` (shape check) in the
 * app with semantic checks the builder needs (ranges, dangling references).
 */
export function validateDraft(draft: MovementDraft): string[] {
  const errors: string[] = [];

  if (!draft.id.trim()) errors.push('Give the movement a name (used to generate its id).');
  if (!draft.name.trim()) errors.push('Give the movement a name.');
  if (draft.joints.length === 0) errors.push('Add at least one joint to track.');

  const jointIds = new Set<string>();
  draft.joints.forEach((j, i) => {
    const where = j.label.trim() || `Joint ${i + 1}`;
    if (jointIds.has(j.id)) errors.push(`Duplicate joint id "${j.id}".`);
    jointIds.add(j.id);
    if (j.targetMin < ANGLE_MIN || j.targetMax > ANGLE_MAX) {
      errors.push(`${where}: angles must be between ${ANGLE_MIN}° and ${ANGLE_MAX}°.`);
    }
    if (j.targetMin >= j.targetMax) {
      errors.push(`${where}: min angle must be less than max angle.`);
    }
  });

  draft.cues.forEach((c, i) => {
    if (!jointIds.has(c.jointId)) {
      errors.push(`Cue ${i + 1} references an unknown joint.`);
    }
    if (!c.cue.trim()) errors.push(`Cue ${i + 1} has no text.`);
  });

  if (draft.dynamicsEnabled && !jointIds.has(draft.dynamics.trackJointId)) {
    errors.push('Rep counting: pick a joint to track.');
  }

  return errors;
}
