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
    <span
      className={cx(
        'relative inline-flex min-w-0',
        // Inline: the 32 px pill is drawn here; on touch the select inside overhangs it by
        // 6 px top and bottom so the tap target is 44 px without a taller pill.
        inline
          ? 'max-w-56 rounded-control bg-fill-3 transition-colors has-[select:disabled]:opacity-40 has-[select:hover]:bg-fill-2'
          : 'w-full',
        className,
      )}
    >
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={cx(
          'w-full cursor-pointer appearance-none truncate rounded-control pr-9 pl-3 text-subhead text-label',
          inline
            ? 'h-8 bg-transparent pointer-coarse:-my-1.5 pointer-coarse:h-11'
            : 'h-11 bg-fill-3 transition-colors hover:bg-fill-2 disabled:opacity-40',
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
