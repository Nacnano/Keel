import { useId } from 'react';
import { Select as KitSelect, type SelectProps as KitSelectProps } from '@/ui/kit';
import { cx } from '../lib/cx';

export interface SelectOption {
  value: string;
  label: string;
  disabled?: boolean;
}

export interface SelectProps extends Omit<KitSelectProps, 'options' | 'inline'> {
  label: string;
  options: ReadonlyArray<SelectOption>;
  hint?: string;
}

/**
 * Labelled select over the kit pop-up button (label above, optional hint below).
 * For a bare control in a row or toolbar, use `Select` from `@/ui/kit`.
 */
export function Select({ label, options, hint, className, id, ...rest }: SelectProps) {
  const autoId = useId();
  const selectId = id ?? autoId;
  const hintId = `${selectId}-hint`;
  return (
    <div className={cx('flex flex-col gap-1.5', className)}>
      <label htmlFor={selectId} className="text-subhead font-medium text-label">
        {label}
      </label>
      <KitSelect
        id={selectId}
        options={[...options]}
        aria-describedby={hint ? hintId : undefined}
        {...rest}
      />
      {hint && (
        <p id={hintId} className="text-footnote text-label-2">
          {hint}
        </p>
      )}
    </div>
  );
}
