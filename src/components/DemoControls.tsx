import { useRef, useState } from 'react';
import {
  MODEL_VARIANTS,
  MODEL_VARIANT_IDS,
  type DelegateId,
  type ModelVariantId,
} from '../engine/poseDetector';
import type { MovementDefinition } from '../engine/types';
import type { FrameSource } from './CameraView';

interface DemoControlsProps {
  source: FrameSource;
  onSelectCamera: (facingMode: 'user' | 'environment') => void;
  onSelectFile: (file: File) => void;

  variant: ModelVariantId;
  onSelectVariant: (variant: ModelVariantId) => void;
  delegate: DelegateId;
  onSelectDelegate: (delegate: DelegateId) => void;
  swapping: boolean;

  movements: MovementDefinition[];
  selectedMovementId: string;
  onSelectMovement: (id: string) => void;
  activeMovement: MovementDefinition;

  visibilityThreshold: number;
  onVisibilityThreshold: (value: number) => void;
  detectionConfidence: number;
  onDetectionConfidence: (value: number) => void;

  offlineReady: boolean;
  wakeLockActive: boolean;
}

const segmentBase =
  'flex-1 rounded-lg px-2 py-2 text-[11px] font-bold uppercase tracking-wide transition-all active:scale-95 sm:text-xs';
const segmentOn = 'bg-red-600 text-white shadow-md shadow-red-500/20';
const segmentOff =
  'bg-zinc-900/60 text-zinc-400 border border-zinc-800 hover:text-zinc-200';

function Segment({
  active,
  onClick,
  children,
  disabled,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={active}
      className={`${segmentBase} ${active ? segmentOn : segmentOff} disabled:opacity-40`}
    >
      {children}
    </button>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2">
      <span className="w-14 shrink-0 font-mono text-[9px] font-bold uppercase tracking-wider text-zinc-500 sm:w-16 sm:text-[10px]">
        {label}
      </span>
      <div className="flex flex-1 gap-1.5">{children}</div>
    </div>
  );
}

/**
 * The demo control strip: everything that has to be reachable in one tap while
 * standing in front of somebody — frame source, model variant, compute
 * delegate, active movement config, and the two confidence floors that decide
 * whether the thing tracks at all in a given room.
 *
 * It sits directly under the live view rather than in a settings screen,
 * because a control you have to navigate to is a control you will not reach
 * when the demo is going sideways.
 */
export default function DemoControls({
  source,
  onSelectCamera,
  onSelectFile,
  variant,
  onSelectVariant,
  delegate,
  onSelectDelegate,
  swapping,
  movements,
  selectedMovementId,
  onSelectMovement,
  activeMovement,
  visibilityThreshold,
  onVisibilityThreshold,
  detectionConfidence,
  onDetectionConfidence,
  offlineReady,
  wakeLockActive,
}: DemoControlsProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [showJson, setShowJson] = useState(false);
  const [showTuning, setShowTuning] = useState(false);

  const isCamera = source.kind === 'camera';

  return (
    <div className="flex flex-col gap-2.5 rounded-2xl border border-zinc-800/80 bg-zinc-950/60 p-3 shadow-lg backdrop-blur-md">
      <Row label="Source">
        <Segment
          active={isCamera && source.facingMode === 'user'}
          onClick={() => onSelectCamera('user')}
        >
          Front
        </Segment>
        <Segment
          active={isCamera && source.facingMode === 'environment'}
          onClick={() => onSelectCamera('environment')}
        >
          Rear
        </Segment>
        <Segment
          active={source.kind === 'file'}
          onClick={() => fileInputRef.current?.click()}
        >
          {source.kind === 'file' ? 'File ✓' : 'Video file'}
        </Segment>
        <input
          ref={fileInputRef}
          type="file"
          accept="video/*"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) onSelectFile(file);
            // Clear it so picking the same file twice still fires a change.
            e.target.value = '';
          }}
        />
      </Row>

      <Row label="Model">
        {MODEL_VARIANT_IDS.map((id) => (
          <Segment
            key={id}
            active={variant === id}
            disabled={swapping}
            onClick={() => onSelectVariant(id)}
          >
            {MODEL_VARIANTS[id].label}
            <span className="ml-1 font-normal normal-case text-white/50">
              {MODEL_VARIANTS[id].sizeMb}MB
            </span>
          </Segment>
        ))}
      </Row>

      <Row label="Compute">
        {(['GPU', 'CPU'] as DelegateId[]).map((d) => (
          <Segment
            key={d}
            active={delegate === d}
            disabled={swapping}
            onClick={() => onSelectDelegate(d)}
          >
            {d}
          </Segment>
        ))}
      </Row>

      <Row label="Movement">
        <select
          value={selectedMovementId}
          onChange={(e) => onSelectMovement(e.target.value)}
          className="min-w-0 flex-1 rounded-lg border border-zinc-800 bg-zinc-900/60 px-2 py-2 text-[11px] font-bold text-zinc-200 sm:text-xs"
        >
          {movements.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={() => setShowJson((v) => !v)}
          aria-expanded={showJson}
          className={`shrink-0 rounded-lg px-2.5 py-2 text-[11px] font-bold uppercase tracking-wide transition-all active:scale-95 sm:text-xs ${
            showJson ? segmentOn : segmentOff
          }`}
        >
          JSON
        </button>
      </Row>

      {showJson && (
        <div className="rounded-xl border border-zinc-800 bg-black/70 p-2.5">
          <p className="mb-1.5 font-mono text-[9px] font-bold uppercase tracking-wider text-emerald-400">
            {activeMovement.id}.json — all the movement knowledge in the system
          </p>
          <pre className="max-h-56 overflow-auto whitespace-pre text-[10px] leading-snug text-zinc-300 sm:text-[11px]">
            {JSON.stringify(activeMovement, null, 2)}
          </pre>
        </div>
      )}

      <div className="flex items-center justify-between gap-2 border-t border-zinc-800/70 pt-2">
        <div className="flex flex-wrap items-center gap-1.5">
          <span
            className={`rounded-md px-1.5 py-0.5 font-mono text-[9px] font-bold uppercase tracking-wide ${
              offlineReady
                ? 'bg-emerald-500/15 text-emerald-400'
                : 'bg-zinc-800/60 text-zinc-500'
            }`}
          >
            {offlineReady ? 'Offline ready' : 'Caching…'}
          </span>
          <span
            className={`rounded-md px-1.5 py-0.5 font-mono text-[9px] font-bold uppercase tracking-wide ${
              wakeLockActive
                ? 'bg-sky-500/15 text-sky-400'
                : 'bg-zinc-800/60 text-zinc-500'
            }`}
          >
            {wakeLockActive ? 'Screen awake' : 'Screen lock on'}
          </span>
        </div>
        <button
          type="button"
          onClick={() => setShowTuning((v) => !v)}
          aria-expanded={showTuning}
          className="shrink-0 font-mono text-[10px] font-bold uppercase tracking-wider text-zinc-500 hover:text-zinc-300"
        >
          {showTuning ? 'Hide tuning' : 'Tuning'}
        </button>
      </div>

      {showTuning && (
        <div className="flex flex-col gap-3 rounded-xl border border-zinc-800 bg-zinc-900/40 p-3">
          <label className="flex flex-col gap-1">
            <span className="flex items-center justify-between font-mono text-[10px] font-bold uppercase tracking-wider text-zinc-400">
              Keypoint visibility floor
              <span className="tabular-nums text-red-400">
                {visibilityThreshold.toFixed(2)}
              </span>
            </span>
            <input
              type="range"
              min={0.1}
              max={0.9}
              step={0.05}
              value={visibilityThreshold}
              onChange={(e) => onVisibilityThreshold(Number(e.target.value))}
              className="accent-red-500"
            />
            <span className="text-[10px] leading-snug text-zinc-500">
              How confident a keypoint must be before a joint counts as visible.
              Lower it when the room is cluttered or you are far from the lens.
              Applies immediately — no reload.
            </span>
          </label>

          <label className="flex flex-col gap-1">
            <span className="flex items-center justify-between font-mono text-[10px] font-bold uppercase tracking-wider text-zinc-400">
              Detection / tracking floor
              <span className="tabular-nums text-red-400">
                {detectionConfidence.toFixed(2)}
              </span>
            </span>
            <input
              type="range"
              min={0.1}
              max={0.9}
              step={0.05}
              value={detectionConfidence}
              onChange={(e) => onDetectionConfidence(Number(e.target.value))}
              disabled={swapping}
              className="accent-red-500 disabled:opacity-40"
            />
            <span className="text-[10px] leading-snug text-zinc-500">
              The model&apos;s own floor for finding and holding onto a person.
              Changing this rebuilds the landmarker, so it takes a moment.
            </span>
          </label>
        </div>
      )}
    </div>
  );
}
