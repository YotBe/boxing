import { useState, type ReactNode } from 'react';

/**
 * Shared surface primitives.
 *
 * The UI had drifted into ten near-identical hand-rolled cards, each with its
 * own border, blur, shadow, decorative colour blob and a two-line heading — so
 * everything shouted at the same volume and nothing receded. These are the only
 * containers now, which is what makes a calm default possible: hierarchy comes
 * from what is open and what is nested, not from how loudly each block is
 * painted.
 *
 * Colour discipline: red is the brand accent and marks the one active choice in
 * a group. Emerald, amber and rose are reserved for *state* — good form, a
 * warning, an error. Nothing else is coloured.
 */

/** A plain surface. No shadow, no blur, no glow. */
export function Card({
  children,
  className = '',
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`rounded-2xl border border-zinc-800/70 bg-zinc-900/40 ${className}`}
    >
      {children}
    </div>
  );
}

/**
 * A collapsible block. Secondary information lives inside one of these rather
 * than being permanently on screen — the whole point of the redesign is that
 * you choose when to look at joint angles or session history, instead of
 * scrolling past them to reach what you actually came for.
 */
export function Section({
  title,
  meta,
  defaultOpen = false,
  children,
}: {
  title: string;
  meta?: ReactNode;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <Card>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left"
      >
        <span className="text-sm font-semibold text-zinc-200">{title}</span>
        <span className="flex items-center gap-2 text-xs text-zinc-500">
          {meta}
          <span
            aria-hidden="true"
            className={`transition-transform ${open ? 'rotate-90' : ''}`}
          >
            ›
          </span>
        </span>
      </button>
      {open && (
        <div className="border-t border-zinc-800/70 px-4 py-3.5">{children}</div>
      )}
    </Card>
  );
}

export interface SegmentOption<T extends string> {
  value: T;
  label: string;
  /** Small trailing note, e.g. a file size. */
  note?: string;
  disabled?: boolean;
}

/** One choice from a small set. The active one carries the accent. */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
  disabled,
  ariaLabel,
}: {
  options: SegmentOption<T>[];
  value: T;
  onChange: (value: T) => void;
  disabled?: boolean;
  ariaLabel?: string;
}) {
  return (
    <div
      role="group"
      aria-label={ariaLabel}
      className="flex flex-1 gap-1 rounded-xl bg-zinc-950/60 p-1"
    >
      {options.map((option) => {
        const active = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            aria-pressed={active}
            disabled={disabled || option.disabled}
            onClick={() => onChange(option.value)}
            // A selected segment is a raised neutral surface, not the brand
            // accent. Red marks the one action worth taking on a screen; three
            // stacked red bars for source, model and compute made three
            // *selections* look like three things to press.
            className={`flex-1 rounded-lg px-2 py-2 text-xs font-semibold transition-colors disabled:opacity-40 ${
              active
                ? 'bg-zinc-700 text-white'
                : 'text-zinc-400 hover:bg-zinc-800/60 hover:text-zinc-200'
            }`}
          >
            {option.label}
            {option.note && (
              <span className="ml-1 font-normal text-white/50">{option.note}</span>
            )}
          </button>
        );
      })}
    </div>
  );
}

/** A labelled switch. Replaces four separately-styled checkbox rows. */
export function Toggle({
  label,
  description,
  checked,
  onChange,
}: {
  label: string;
  description?: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="flex cursor-pointer items-center justify-between gap-3 py-1.5">
      <span className="min-w-0">
        <span className="block text-sm text-zinc-200">{label}</span>
        {description && (
          <span className="block text-xs text-zinc-500">{description}</span>
        )}
      </span>
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="h-4 w-4 shrink-0 cursor-pointer rounded border-zinc-700 bg-zinc-800 text-red-500"
      />
    </label>
  );
}

/** The primary action in a view. There should only ever be one on screen. */
export function PrimaryButton({
  children,
  onClick,
  disabled,
  className = '',
}: {
  children: ReactNode;
  onClick: () => void;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`rounded-xl bg-red-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-red-500 disabled:opacity-40 ${className}`}
    >
      {children}
    </button>
  );
}

export function QuietButton({
  children,
  onClick,
  className = '',
}: {
  children: ReactNode;
  onClick: () => void;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-xl border border-zinc-800 px-3 py-2.5 text-sm font-medium text-zinc-300 transition-colors hover:bg-zinc-800/60 hover:text-white ${className}`}
    >
      {children}
    </button>
  );
}

/** A single headline number with its unit. */
export function Stat({ value, unit }: { value: ReactNode; unit: string }) {
  return (
    <div className="flex items-baseline gap-2">
      <span className="text-4xl font-bold tabular-nums tracking-tight text-white">
        {value}
      </span>
      <span className="text-sm text-zinc-400">{unit}</span>
    </div>
  );
}
