import { useId } from 'react';
import { cx } from '../lib/cx';

export interface SwitchProps {
  label: string;
  description?: string;
  checked: boolean;
  onChange(checked: boolean): void;
  disabled?: boolean;
}

/** Labelled on/off switch row (role="switch"), full row is the touch target. */
export function Switch({ label, description, checked, onChange, disabled }: SwitchProps) {
  const id = useId();
  return (
    <div className="flex min-h-11 items-center justify-between gap-4">
      <div className="flex flex-col">
        <label htmlFor={id} className="text-sm font-medium text-zinc-200">
          {label}
        </label>
        {description && (
          <p id={`${id}-d`} className="text-xs text-zinc-500">
            {description}
          </p>
        )}
      </div>
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        aria-describedby={description ? `${id}-d` : undefined}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={cx(
          'relative inline-flex h-7 w-12 shrink-0 items-center rounded-full transition-colors duration-150',
          'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-300',
          'disabled:opacity-40',
          checked ? 'bg-violet-400' : 'bg-zinc-700',
        )}
      >
        <span
          aria-hidden
          className={cx(
            'inline-block size-5 rounded-full bg-white shadow transition-transform duration-150',
            checked ? 'translate-x-6' : 'translate-x-1',
          )}
        />
      </button>
    </div>
  );
}
