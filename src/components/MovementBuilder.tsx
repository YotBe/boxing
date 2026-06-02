import { useState } from 'react';
import { LANDMARK_OPTIONS } from '../engine/landmarks';
import {
  addJoint,
  draftToDefinition,
  slugify,
  validateDraft,
  type MovementDraft,
} from '../movements/authoring';

export interface LiveAngle {
  angle: number;
  available: boolean;
}

interface MovementBuilderProps {
  draft: MovementDraft;
  onChange: (draft: MovementDraft) => void;
  /** Live measured angle per joint id, from the engine's per-frame feedback. */
  liveAngles: Map<string, LiveAngle>;
}

const inputCls = 'rounded-lg bg-black/50 px-2 py-1 text-sm';
const labelCls = 'text-xs uppercase tracking-wide text-zinc-500';

function num(value: string, fallback: number): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

/**
 * Guided builder for a MovementDefinition. It owns no movement-specific
 * knowledge: it edits a generic draft, shows the live angle the engine measures
 * for each joint (so ranges can be captured from a real pose), and exports the
 * same JSON the engine consumes. All draft logic lives in `movements/authoring`.
 */
export default function MovementBuilder({
  draft,
  onChange,
  liveAngles,
}: MovementBuilderProps) {
  const [copied, setCopied] = useState(false);
  const errors = validateDraft(draft);
  const valid = errors.length === 0;

  function setName(name: string) {
    // Keep id auto-synced to the name until the user edits id by hand.
    const wasAuto = draft.id === '' || draft.id === slugify(draft.name);
    onChange({ ...draft, name, id: wasAuto ? slugify(name) : draft.id });
  }

  function patchJoint(i: number, patch: Partial<MovementDraft['joints'][number]>) {
    const joints = draft.joints.map((j, k) => (k === i ? { ...j, ...patch } : j));
    onChange({ ...draft, joints });
  }

  function setPoint(i: number, slot: 0 | 1 | 2, index: number) {
    const points = [...draft.joints[i].points] as [number, number, number];
    points[slot] = index;
    patchJoint(i, { points });
  }

  function removeJoint(i: number) {
    onChange({ ...draft, joints: draft.joints.filter((_, k) => k !== i) });
  }

  function patchCue(i: number, patch: Partial<MovementDraft['cues'][number]>) {
    const cues = draft.cues.map((c, k) => (k === i ? { ...c, ...patch } : c));
    onChange({ ...draft, cues });
  }

  function addCue() {
    const jointId = draft.joints[0]?.id ?? '';
    onChange({ ...draft, cues: [...draft.cues, { jointId, when: 'above', cue: '' }] });
  }

  function patchDynamics(patch: Partial<MovementDraft['dynamics']>) {
    onChange({ ...draft, dynamics: { ...draft.dynamics, ...patch } });
  }

  function exportJson(): string {
    return JSON.stringify(draftToDefinition(draft), null, 2);
  }

  async function copyJson() {
    try {
      await navigator.clipboard.writeText(exportJson());
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setCopied(false);
    }
  }

  function downloadJson() {
    const blob = new Blob([exportJson()], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${draft.id || 'movement'}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-zinc-400">
        Build a movement with no JSON: pick joints, capture angle ranges from your
        live pose, then copy or download it. It previews live as you edit.
      </p>

      {/* Identity */}
      <div className="grid grid-cols-2 gap-2">
        <label className="flex flex-col gap-1">
          <span className={labelCls}>Name</span>
          <input
            className={inputCls}
            value={draft.name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Overhead Press"
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className={labelCls}>Id</span>
          <input
            className={`${inputCls} font-mono`}
            value={draft.id}
            onChange={(e) => onChange({ ...draft, id: e.target.value })}
            placeholder="overhead-press"
          />
        </label>
      </div>

      {/* Joints */}
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <span className={labelCls}>Joints to track</span>
          <button
            type="button"
            onClick={() => onChange(addJoint(draft))}
            className="rounded-lg bg-zinc-700 px-2 py-1 text-xs hover:bg-zinc-600"
          >
            + Add joint
          </button>
        </div>

        {draft.joints.length === 0 && (
          <p className="text-sm text-zinc-500">No joints yet — add one to begin.</p>
        )}

        {draft.joints.map((j, i) => {
          const live = liveAngles.get(j.id);
          const liveText =
            live && live.available ? `${Math.round(live.angle)}°` : '—';
          const canCapture = !!live && live.available;
          return (
            <div key={i} className="flex flex-col gap-2 rounded-lg bg-black/30 p-3">
              <div className="flex items-center gap-2">
                <input
                  className={`${inputCls} flex-1`}
                  value={j.label}
                  onChange={(e) => patchJoint(i, { label: e.target.value })}
                  placeholder="Joint label (e.g. Left knee)"
                />
                <span className="font-mono text-sm text-zinc-300">live {liveText}</span>
                <button
                  type="button"
                  onClick={() => removeJoint(i)}
                  className="rounded-lg bg-zinc-800 px-2 py-1 text-xs text-red-300 hover:bg-zinc-700"
                  aria-label="Remove joint"
                >
                  ✕
                </button>
              </div>

              <div className="grid grid-cols-3 gap-2">
                {(['Point A', 'Vertex (B)', 'Point C'] as const).map((lbl, slot) => (
                  <label key={slot} className="flex flex-col gap-1">
                    <span className={labelCls}>{lbl}</span>
                    <select
                      className={inputCls}
                      value={j.points[slot]}
                      onChange={(e) =>
                        setPoint(i, slot as 0 | 1 | 2, Number(e.target.value))
                      }
                    >
                      {LANDMARK_OPTIONS.map((o) => (
                        <option key={o.index} value={o.index}>
                          {o.label}
                        </option>
                      ))}
                    </select>
                  </label>
                ))}
              </div>

              <div className="flex flex-wrap items-end gap-2">
                <label className="flex flex-col gap-1">
                  <span className={labelCls}>Min °</span>
                  <input
                    type="number"
                    className={`${inputCls} w-20`}
                    value={j.targetMin}
                    onChange={(e) =>
                      patchJoint(i, { targetMin: num(e.target.value, j.targetMin) })
                    }
                  />
                </label>
                <button
                  type="button"
                  disabled={!canCapture}
                  onClick={() =>
                    live && patchJoint(i, { targetMin: Math.round(live.angle) })
                  }
                  className="rounded-lg bg-zinc-700 px-2 py-1 text-xs hover:bg-zinc-600 disabled:opacity-40"
                >
                  Set min
                </button>
                <label className="flex flex-col gap-1">
                  <span className={labelCls}>Max °</span>
                  <input
                    type="number"
                    className={`${inputCls} w-20`}
                    value={j.targetMax}
                    onChange={(e) =>
                      patchJoint(i, { targetMax: num(e.target.value, j.targetMax) })
                    }
                  />
                </label>
                <button
                  type="button"
                  disabled={!canCapture}
                  onClick={() =>
                    live && patchJoint(i, { targetMax: Math.round(live.angle) })
                  }
                  className="rounded-lg bg-zinc-700 px-2 py-1 text-xs hover:bg-zinc-600 disabled:opacity-40"
                >
                  Set max
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Cues */}
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <span className={labelCls}>Correction cues</span>
          <button
            type="button"
            onClick={addCue}
            disabled={draft.joints.length === 0}
            className="rounded-lg bg-zinc-700 px-2 py-1 text-xs hover:bg-zinc-600 disabled:opacity-40"
          >
            + Add cue
          </button>
        </div>
        {draft.cues.map((c, i) => (
          <div key={i} className="flex flex-wrap items-center gap-2">
            <select
              className={inputCls}
              value={c.jointId}
              onChange={(e) => patchCue(i, { jointId: e.target.value })}
            >
              {draft.joints.map((j) => (
                <option key={j.id} value={j.id}>
                  {j.label || j.id}
                </option>
              ))}
            </select>
            <select
              className={inputCls}
              value={c.when}
              onChange={(e) =>
                patchCue(i, { when: e.target.value as 'below' | 'above' })
              }
            >
              <option value="below">when below min</option>
              <option value="above">when above max</option>
            </select>
            <input
              className={`${inputCls} flex-1`}
              value={c.cue}
              onChange={(e) => patchCue(i, { cue: e.target.value })}
              placeholder="Cue text, e.g. Bend your knees more."
            />
            <button
              type="button"
              onClick={() =>
                onChange({ ...draft, cues: draft.cues.filter((_, k) => k !== i) })
              }
              className="rounded-lg bg-zinc-800 px-2 py-1 text-xs text-red-300 hover:bg-zinc-700"
              aria-label="Remove cue"
            >
              ✕
            </button>
          </div>
        ))}
      </div>

      {/* Advanced: rep counting */}
      <div className="flex flex-col gap-2 rounded-lg bg-black/30 p-3">
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={draft.dynamicsEnabled}
            onChange={(e) => onChange({ ...draft, dynamicsEnabled: e.target.checked })}
          />
          Count reps &amp; speed (dynamic movement)
        </label>
        {draft.dynamicsEnabled && (
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            <label className="flex flex-col gap-1">
              <span className={labelCls}>Track joint</span>
              <select
                className={inputCls}
                value={draft.dynamics.trackJointId}
                onChange={(e) => patchDynamics({ trackJointId: e.target.value })}
              >
                <option value="">— pick —</option>
                {draft.joints.map((j) => (
                  <option key={j.id} value={j.id}>
                    {j.label || j.id}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1">
              <span className={labelCls}>Down below °</span>
              <input
                type="number"
                className={inputCls}
                value={draft.dynamics.enterDownBelow}
                onChange={(e) =>
                  patchDynamics({
                    enterDownBelow: num(e.target.value, draft.dynamics.enterDownBelow),
                  })
                }
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className={labelCls}>Up above °</span>
              <input
                type="number"
                className={inputCls}
                value={draft.dynamics.enterUpAbove}
                onChange={(e) =>
                  patchDynamics({
                    enterUpAbove: num(e.target.value, draft.dynamics.enterUpAbove),
                  })
                }
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className={labelCls}>Count on</span>
              <select
                className={inputCls}
                value={draft.dynamics.countOn}
                onChange={(e) =>
                  patchDynamics({ countOn: e.target.value as 'up' | 'down' })
                }
              >
                <option value="up">entering up</option>
                <option value="down">entering down</option>
              </select>
            </label>
            <label className="flex flex-col gap-1">
              <span className={labelCls}>Label</span>
              <input
                className={inputCls}
                value={draft.dynamics.label ?? ''}
                onChange={(e) => patchDynamics({ label: e.target.value })}
                placeholder="Reps"
              />
            </label>
          </div>
        )}
      </div>

      {/* Export */}
      <div className="flex flex-col gap-2 border-t border-zinc-800 pt-3">
        {!valid && (
          <ul className="list-inside list-disc text-sm text-amber-400">
            {errors.map((e, i) => (
              <li key={i}>{e}</li>
            ))}
          </ul>
        )}
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={copyJson}
            disabled={!valid}
            className="rounded-lg bg-green-600 px-3 py-2 text-sm font-semibold hover:bg-green-500 disabled:opacity-40"
          >
            {copied ? 'Copied!' : 'Copy JSON'}
          </button>
          <button
            type="button"
            onClick={downloadJson}
            disabled={!valid}
            className="rounded-lg bg-zinc-700 px-3 py-2 text-sm hover:bg-zinc-600 disabled:opacity-40"
          >
            Download .json
          </button>
          {valid && (
            <span className="text-sm text-zinc-500">Previewing live above ↑</span>
          )}
        </div>
      </div>
    </div>
  );
}
