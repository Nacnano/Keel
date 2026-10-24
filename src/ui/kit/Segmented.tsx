import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { cx } from '../lib/cx';

export interface SegmentedOption<T extends string | number> {
  value: T;
  label: ReactNode;
  title?: string;
}

export interface SegmentedProps<T extends string | number> {
  options: ReadonlyArray<SegmentedOption<T>>;
  value: T;
  onChange(value: T): void;
  'aria-label': string;
  /** @deprecated One size everywhere; kept so older call sites still compile. */
  size?: 'sm' | 'md';
  /** Stretch to the container width with equal segments. */
  fill?: boolean;
  className?: string;
}

/** Apple segmented control: a sliding selection pill inside a recessed track. */
export function Segmented<T extends string | number>({
  options,
  value,
  onChange,
  size: _size,
  fill,
  className,
  ...aria
}: SegmentedProps<T>) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [pill, setPill] = useState<{ left: number; width: number } | null>(null);
  const index = options.findIndex((o) => o.value === value);

  useLayoutEffect(() => {
    const track = trackRef.current;
    if (!track || index < 0) return;
    const measure = () => {
      const el = track.children[index + 1] as HTMLElement | undefined; // +1: the pill is first
      if (!el) return;
      setPill({ left: el.offsetLeft, width: el.offsetWidth });
    };
    measure();
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(measure) : null;
    ro?.observe(track);
    return () => ro?.disconnect();
  }, [index, options.length]);

  return (
    <div
      ref={trackRef}
      role="radiogroup"
      aria-label={aria['aria-label']}
      className={cx(
        'relative isolate inline-flex rounded-[9px] bg-fill-3 p-0.5',
        fill && 'flex w-full',
        className,
      )}
    >
      <span
        aria-hidden
        className={cx(
          'absolute top-0.5 bottom-0.5 rounded-[7px] bg-surface-2 shadow-[0_1px_3px_rgba(0,0,0,0.25),0_0_0_0.5px_rgba(0,0,0,0.06)] transition-[left,width] duration-200 ease-out-expo',
          'dark:bg-[#636366]',
          pill ? 'opacity-100' : 'opacity-0',
        )}
        style={pill ? { left: pill.left, width: pill.width } : undefined}
      />
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
              'relative z-10 inline-flex items-center justify-center rounded-[7px] font-medium whitespace-nowrap transition-colors duration-150',
              // One size: a 32 px segment in a 36 px track with a mouse. On touch the segment
              // is 44 px and overlaps the track padding, so the track is 44 px too.
              'h-8 min-w-10 px-3 text-subhead',
              'pointer-coarse:-my-0.5 pointer-coarse:h-11 pointer-coarse:min-w-11',
              fill && 'flex-1',
              active ? 'text-label' : 'text-label-2 hover:text-label',
            )}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
