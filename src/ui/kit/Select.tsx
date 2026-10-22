import type { SelectHTMLAttributes } from 'react';
import { ChevronsUpDown } from 'lucide-react';
import { cx } from '../lib/cx';

export interface SelectOption {
  value: string;
  label: string;
  disabled?: boolean;
}

export interface SelectProps extends Omit<
  SelectHTMLAttributes<HTMLSelectElement>,
  'onChange' | 'value'
> {
  value: string;
  options: SelectOption[];
  onChange(value: string): void;
  /** Compact look for toolbar / row accessories. */
  inline?: boolean;
}

/** Native select styled as a macOS pop-up button (keeps keyboard + touch behaviour). */
export function Select({ value, options, onChange, inline, className, ...rest }: SelectProps) {
  return (
    <span className={cx('relative inline-flex min-w-0', inline ? 'max-w-56' : 'w-full', className)}>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={cx(
          'w-full cursor-pointer appearance-none truncate rounded-control bg-fill-3 pr-9 pl-3 text-subhead text-label',
          'transition-colors hover:bg-fill-2 disabled:opacity-40',
          inline ? 'h-8' : 'h-11',
        )}
        {...rest}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value} disabled={o.disabled}>
            {o.label}
          </option>
        ))}
      </select>
      <ChevronsUpDown
        aria-hidden
        className="pointer-events-none absolute top-1/2 right-2.5 size-4 -translate-y-1/2 text-label-2"
      />
    </span>
  );
}
