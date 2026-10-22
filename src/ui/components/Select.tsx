import { useId } from 'react';
import type { SelectHTMLAttributes } from 'react';
import { cx } from '../lib/cx';

export interface SelectOption {
  value: string;
  label: string;
}

export interface SelectProps extends Omit<SelectHTMLAttributes<HTMLSelectElement>, 'onChange'> {
  label: string;
  options: ReadonlyArray<SelectOption>;
  value: string;
  onChange(value: string): void;
  hint?: string;
}

/** Native select (best on iPad) with a label and an optional hint line. */
export function Select({ label, options, value, onChange, hint, className, ...rest }: SelectProps) {
  const id = useId();
  return (
    <div className={cx('flex flex-col gap-1.5', className)}>
      <label htmlFor={id} className="text-sm font-medium text-zinc-300">
        {label}
      </label>
      <select
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-describedby={hint ? `${id}-hint` : undefined}
        className={cx(
          'min-h-11 rounded-xl bg-zinc-900 px-3 text-sm text-zinc-100 ring-1 ring-zinc-800',
          'focus-visible:outline-2 focus-visible:outline-violet-300 disabled:opacity-50',
        )}
        {...rest}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      {hint && (
        <p id={`${id}-hint`} className="text-xs text-zinc-500">
          {hint}
        </p>
      )}
    </div>
  );
}
