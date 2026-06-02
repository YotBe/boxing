import { describe, expect, it } from 'vitest';
import {
  addJoint,
  draftToDefinition,
  emptyDraft,
  slugify,
  validateDraft,
  type MovementDraft,
} from './authoring';

function validDraft(): MovementDraft {
  return {
    id: 'left-jab',
    name: 'Left Jab',
    joints: [
      { id: 'elbow', label: 'Lead elbow', points: [11, 13, 15], targetMin: 150, targetMax: 180 },
    ],
    cues: [{ jointId: 'elbow', when: 'below', cue: 'Extend fully.' }],
    dynamicsEnabled: false,
    dynamics: {
      trackJointId: 'elbow',
      enterDownBelow: 90,
      enterUpAbove: 150,
      countOn: 'up',
      label: 'Jabs',
    },
  };
}

describe('slugify', () => {
  it('makes an id-friendly slug', () => {
    expect(slugify('Squat Hold')).toBe('squat-hold');
    expect(slugify('  Muay Thai!  ')).toBe('muay-thai');
  });
});

describe('addJoint', () => {
  it('appends a uniquely-named joint row', () => {
    const d = addJoint(addJoint(emptyDraft()));
    expect(d.joints).toHaveLength(2);
    expect(d.joints[0].id).toBe('joint_1');
    expect(d.joints[1].id).toBe('joint_2');
  });
});

describe('draftToDefinition', () => {
  it('serializes a static movement without a dynamics block', () => {
    const def = draftToDefinition(validDraft());
    expect(def).toEqual({
      id: 'left-jab',
      name: 'Left Jab',
      joints: [
        { id: 'elbow', label: 'Lead elbow', points: [11, 13, 15], targetMin: 150, targetMax: 180 },
      ],
      cues: [{ jointId: 'elbow', when: 'below', cue: 'Extend fully.' }],
    });
    expect(def.dynamics).toBeUndefined();
  });

  it('includes dynamics (and omits an empty label) when enabled', () => {
    const draft = { ...validDraft(), dynamicsEnabled: true };
    draft.dynamics = { ...draft.dynamics, label: '   ' };
    const def = draftToDefinition(draft);
    expect(def.dynamics).toEqual({
      trackJointId: 'elbow',
      enterDownBelow: 90,
      enterUpAbove: 150,
      countOn: 'up',
    });
  });

  it('trims id and name', () => {
    const def = draftToDefinition({ ...validDraft(), id: '  x ', name: '  X ' });
    expect(def.id).toBe('x');
    expect(def.name).toBe('X');
  });
});

describe('validateDraft', () => {
  it('passes a well-formed draft', () => {
    expect(validateDraft(validDraft())).toEqual([]);
  });

  it('requires a name and at least one joint', () => {
    const errors = validateDraft(emptyDraft());
    expect(errors.some((e) => /name/i.test(e))).toBe(true);
    expect(errors.some((e) => /at least one joint/i.test(e))).toBe(true);
  });

  it('rejects min >= max and out-of-bounds angles', () => {
    const d = validDraft();
    d.joints[0].targetMin = 120;
    d.joints[0].targetMax = 90;
    expect(validateDraft(d).some((e) => /less than max/i.test(e))).toBe(true);

    const d2 = validDraft();
    d2.joints[0].targetMax = 200;
    expect(validateDraft(d2).some((e) => /between/.test(e))).toBe(true);
  });

  it('flags a cue referencing an unknown joint', () => {
    const d = validDraft();
    d.cues[0].jointId = 'nope';
    expect(validateDraft(d).some((e) => /unknown joint/i.test(e))).toBe(true);
  });

  it('flags duplicate joint ids', () => {
    const d = validDraft();
    d.joints.push({ ...d.joints[0] });
    expect(validateDraft(d).some((e) => /duplicate/i.test(e))).toBe(true);
  });

  it('requires a tracked joint when rep counting is enabled', () => {
    const d = { ...validDraft(), dynamicsEnabled: true };
    d.dynamics = { ...d.dynamics, trackJointId: 'missing' };
    expect(validateDraft(d).some((e) => /pick a joint to track/i.test(e))).toBe(true);
  });
});
