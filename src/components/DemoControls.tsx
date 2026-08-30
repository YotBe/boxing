import { useRef, useState } from 'react';
import {
  MODEL_VARIANTS,
  MODEL_VARIANT_IDS,
  type DelegateId,
  type ModelVariantId,
  type PoseDetectorInfo,
} from '../engine/poseDetector';
import type { OfflineStatus } from '../offline';
import type { MovementDefinition } from '../engine/types';
import type { FrameSource } from './CameraView';
import { Card, Section, Segmented } from './ui';

interface DemoControlsProps {
  source: FrameSource;
  onSelectCamera: (facingMode: 'user' | 'environment') => void;
  onSelectFile: (file: File) => void;

  variant: ModelVariantId;
  onSelectVariant: (variant: ModelVariantId) => void;
  delegate: DelegateId;
  onSelectDelegate: (delegate: DelegateId) => void;
  swapping: boolean;

  activeMovement: MovementDefinition;

  visibilityThreshold: number;
  onVisibilityThreshold: (value: number) => void;
  detectionConfidence: number;
  onDetectionConfidence: (value: number) => void;

  offlineStatus: OfflineStatus;
  wakeLockActive: boolean;
  detector: PoseDetectorInfo | null;
}

interface PreflightRow {
  ok: boolean;
  pending?: boolean;
  label: string;
  detail: string;
}

const OFFLINE_LABEL: Record<OfflineStatus, string> = {
  unsupported: 'No service worker',
  registering: 'Starting…',
  caching: 'Caching…',
  ready: 'Offline ready',
  failed: 'Offline FAILED',
};

const OFFLINE_DETAIL: Record<OfflineStatus, string> = {
  unsupported:
    'This browser exposes no service worker — Private Browsing on iOS does this. Open the page in a normal window; airplane mode will not work otherwise.',
  registering: 'Registering the worker.',
  caching:
    'Downloading the runtime and both models (~26MB). Wait for this to finish before testing airplane mode.',
  ready: 'Runtime and both model variants are stored. Safe to pull the network.',
  failed:
    'The cache could not be filled. Reload on a working connection and watch this go green before relying on offline.',
};

function ControlRow({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-3">
      <span className="w-16 shrink-0 text-xs text-zinc-500">{label}</span>
      {children}
    </div>
  );
}

function Slider({
  label,
  hint,
  value,
  min,
  max,
  step,
  disabled,
  onChange,
}: {
  label: string;
  hint: string;
  value: number;
  min: number;
  max: number;
  step: number;
  disabled?: boolean;
  onChange: (v: number) => void;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="flex items-center justify-between text-sm text-zinc-300">
        {label}
        <span className="tabular-nums text-zinc-400">{value.toFixed(2)}</span>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(Number(e.target.value))}
        className="accent-red-500 disabled:opacity-40"
      />
      <span className="text-xs leading-snug text-zinc-500">{hint}</span>
    </label>
  );
}

/**
 * The engineering surface: frame source, model variant, compute delegate, the
 * two confidence floors, the pre-flight check and the active movement's raw
 * config.
 *
 * None of this is on screen by default any more. It is one tap away behind the
 * dev toggle, which is the right trade: a person training does not need a
 * compute-delegate switch in their eyeline, and the demo only needs these
 * reachable, not permanent.
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
  activeMovement,
  visibilityThreshold,
  onVisibilityThreshold,
  detectionConfidence,
  onDetectionConfidence,
  offlineStatus,
  wakeLockActive,
  detector,
}: DemoControlsProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [showJson, setShowJson] = useState(false);

  const sourceValue: 'user' | 'environment' | 'file' =
    source.kind === 'file' ? 'file' : source.facingMode;

  const preflight: PreflightRow[] = [
    {
      ok: offlineStatus === 'ready',
      pending: offlineStatus === 'registering' || offlineStatus === 'caching',
      label: OFFLINE_LABEL[offlineStatus],
      detail: OFFLINE_DETAIL[offlineStatus],
    },
    {
      ok: !!detector?.bundled,
      pending: !detector,
      label: detector
        ? detector.bundled
          ? 'Assets served locally'
          : 'Assets served from CDN'
        : 'Assets…',
      detail: detector?.bundled
        ? 'The model and runtime came from this origin, so they work with no network.'
        : 'The bundled copies could not be loaded and hosted ones were used instead. This run will NOT survive airplane mode — hard-reload and re-check.',
    },
    {
      ok: !!detector && detector.delegate === detector.requestedDelegate,
      pending: !detector,
      label: detector
        ? detector.delegate === detector.requestedDelegate
          ? `Running on ${detector.delegate}`
          : `Fell back to ${detector.delegate}`
        : 'Compute…',
      detail:
        detector && detector.delegate !== detector.requestedDelegate
          ? 'The requested delegate was refused and a fallback was used. Reload before demoing — MediaPipe shares one WASM module per page, so an in-session fallback often cannot recover.'
          : 'The requested compute delegate initialised normally.',
    },
    {
      ok: wakeLockActive,
      label: wakeLockActive ? 'Screen stays awake' : 'Screen will sleep',
      detail: wakeLockActive
        ? 'A wake lock is held; the screen will not dim mid-demo.'
        : 'No wake lock — this browser may not support the API (Safari before 16.4). Set auto-lock to Never before the demo.',
    },
  ];

  const passing = preflight.filter((r) => r.ok).length;
  const pending = preflight.some((r) => r.pending);
  const allClear = passing === preflight.length;
  const firstProblem = preflight.find((r) => !r.ok && !r.pending);

  return (
    <div className="flex flex-col gap-3">
      <Card className="flex flex-col gap-3 px-4 py-3.5">
        <ControlRow label="Source">
          <Segmented
            ariaLabel="Frame source"
            value={sourceValue}
            onChange={(next) => {
              if (next === 'file') fileInputRef.current?.click();
              else onSelectCamera(next);
            }}
            options={[
              { value: 'user', label: 'Front' },
              { value: 'environment', label: 'Rear' },
              { value: 'file', label: source.kind === 'file' ? 'File ✓' : 'Video file' },
            ]}
          />
          <input
            ref={fileInputRef}
            type="file"
            accept="video/*"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) onSelectFile(file);
              e.target.value = '';
            }}
          />
        </ControlRow>

        <ControlRow label="Model">
          <Segmented
            ariaLabel="Model variant"
            value={variant}
            disabled={swapping}
            onChange={onSelectVariant}
            options={MODEL_VARIANT_IDS.map((id) => ({
              value: id,
              label: MODEL_VARIANTS[id].label,
              note: `${MODEL_VARIANTS[id].sizeMb}MB`,
            }))}
          />
        </ControlRow>

        <ControlRow label="Compute">
          <Segmented
            ariaLabel="Compute delegate"
            value={delegate}
            disabled={swapping}
            onChange={onSelectDelegate}
            options={[
              { value: 'GPU', label: 'GPU' },
              { value: 'CPU', label: 'CPU' },
            ]}
          />
        </ControlRow>
      </Card>

      <Section
        title="Pre-flight"
        defaultOpen={!allClear && !pending}
        meta={
          <span
            className={
              allClear
                ? 'text-emerald-400'
                : pending
                  ? 'text-zinc-500'
                  : 'text-amber-400'
            }
          >
            {allClear
              ? 'all clear'
              : firstProblem
                ? `${passing}/${preflight.length} · ${firstProblem.label}`
                : `${passing}/${preflight.length}`}
          </span>
        }
      >
        <ul className="flex flex-col gap-2.5">
          {preflight.map((row) => (
            <li key={row.label} className="flex gap-2.5">
              <span
                aria-hidden="true"
                className={`mt-0.5 shrink-0 text-sm ${
                  row.ok
                    ? 'text-emerald-400'
                    : row.pending
                      ? 'text-zinc-600'
                      : 'text-amber-400'
                }`}
              >
                {row.ok ? '✓' : row.pending ? '…' : '✗'}
              </span>
              <div className="min-w-0">
                <p
                  className={`text-sm ${
                    row.ok
                      ? 'text-emerald-300'
                      : row.pending
                        ? 'text-zinc-400'
                        : 'text-amber-300'
                  }`}
                >
                  {row.label}
                </p>
                <p className="text-xs leading-snug text-zinc-500">{row.detail}</p>
              </div>
            </li>
          ))}
        </ul>
      </Section>

      <Section title="Tuning">
        <div className="flex flex-col gap-4">
          <Slider
            label="Keypoint visibility floor"
            hint="How confident a keypoint must be before a joint counts as visible. Lower it in a cluttered room or at distance. Applies to the next frame."
            value={visibilityThreshold}
            min={0.1}
            max={0.9}
            step={0.05}
            onChange={onVisibilityThreshold}
          />
          <Slider
            label="Detection / tracking floor"
            hint="The model's own floor for finding and holding a person. Changing this rebuilds the landmarker, so it takes a moment."
            value={detectionConfidence}
            min={0.1}
            max={0.9}
            step={0.05}
            disabled={swapping}
            onChange={onDetectionConfidence}
          />
        </div>
      </Section>

      <Section
        title="Movement config"
        meta={`${activeMovement.id}.json`}
        defaultOpen={showJson}
      >
        <p className="mb-2 text-xs text-zinc-500">
          All the movement knowledge in the system. The engine reads this and
          nothing else — switching movements changes no code.
        </p>
        <pre
          onClick={() => setShowJson(true)}
          className="max-h-56 overflow-auto whitespace-pre rounded-lg bg-black/60 p-2.5 text-xs leading-snug text-zinc-300"
        >
          {JSON.stringify(activeMovement, null, 2)}
        </pre>
      </Section>
    </div>
  );
}
