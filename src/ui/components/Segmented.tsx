import type { ReactNode } from 'react';
import { cx } from '../lib/cx';

export interface SegmentedOption<T extends string | number> {
  value: T;
  label: ReactNode;
  /** Accessible name / tooltip when the label is terse. */
  title?: string;
}

export interface SegmentedProps<T extends string | number> {
  options: ReadonlyArray<SegmentedOption<T>>;
  value: T;
  onChange(value: T): void;
  'aria-label': string;
  className?: string;
  size?: 'sm' | 'md';
}

/** Single-choice segmented control (radiogroup semantics). */
export function Segmented<T extends string | number>({
  options,
  value,
  onChange,
  className,
  size = 'md',
  ...aria
}: SegmentedProps<T>) {
  return (
    <div
      role="radiogroup"
      aria-label={aria['aria-label']}
      className={cx('inline-flex rounded-xl bg-zinc-900 p-1 ring-1 ring-zinc-800', className)}
    >
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={String(o.value)}
            type="button"
            role="radio"
            aria-checked={active}
            aria-label={o.title}
            title={o.title}
            onClick={() => onChange(o.value)}
            className={cx(
              'rounded-lg px-3 font-medium transition-colors duration-150',
              'focus-visible:outline-2 focus-visible:outline-violet-300',
              size === 'md' ? 'min-h-11 min-w-11 text-sm' : 'min-h-9 min-w-9 text-xs',
              active ? 'bg-zinc-700 text-white shadow-sm' : 'text-zinc-400 hover:text-zinc-100',
            )}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
