import { cx } from '../lib/cx';

export interface SwitchProps {
  checked: boolean;
  onChange(checked: boolean): void;
  'aria-label'?: string;
  'aria-labelledby'?: string;
  disabled?: boolean;
  className?: string;
}

/** iOS toggle. */
export function Switch({ checked, onChange, disabled, className, ...aria }: SwitchProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={aria['aria-label']}
      aria-labelledby={aria['aria-labelledby']}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cx(
        'relative h-[31px] w-[51px] shrink-0 rounded-full transition-colors duration-200 ease-out',
        'disabled:opacity-40',
        checked ? 'bg-ok' : 'bg-fill',
        className,
      )}
    >
      <span
        aria-hidden
        className={cx(
          'absolute top-[2px] left-[2px] size-[27px] rounded-full bg-white shadow-[0_3px_8px_rgba(0,0,0,0.15),0_1px_1px_rgba(0,0,0,0.16)] transition-transform duration-200 ease-out-expo',
          checked && 'translate-x-5',
        )}
      />
    </button>
  );
}
