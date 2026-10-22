import { cx } from '../lib/cx';

export interface MeterProps {
  /** 0..1 */
  level: number;
  /** Highlight as the live source. */
  active?: boolean;
  bars?: number;
  className?: string;
  'aria-label'?: string;
}

/** Input level meter: discrete bars, the top ones turn amber then red. */
export function Meter({ level, active = true, bars = 8, className, ...aria }: MeterProps) {
  const lit = Math.round(Math.max(0, Math.min(1, level)) * bars);
  return (
    <span
      role="meter"
      aria-valuemin={0}
      aria-valuemax={1}
      aria-valuenow={Math.round(level * 100) / 100}
      aria-label={aria['aria-label'] ?? 'Input level'}
      className={cx('inline-flex h-4 items-end gap-[2px]', className)}
    >
      {Array.from({ length: bars }, (_, i) => {
        const on = active && i < lit;
        const tone = i >= bars - 1 ? 'bg-live' : i >= bars - 3 ? 'bg-warn' : 'bg-ok';
        return (
          <span
            key={i}
            aria-hidden
            style={{ height: `${35 + (i / (bars - 1)) * 65}%` }}
            className={cx(
              'w-[3px] rounded-[1px] transition-colors duration-75',
              on ? tone : 'bg-fill',
            )}
          />
        );
      })}
    </span>
  );
}
