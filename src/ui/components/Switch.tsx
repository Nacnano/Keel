import { useId } from 'react';
import { Switch as KitSwitch } from '@/ui/kit';

export interface SwitchProps {
  label: string;
  description?: string;
  checked: boolean;
  onChange(checked: boolean): void;
  disabled?: boolean;
}

/**
 * Labelled switch row over the kit toggle: label and optional description on the left,
 * the switch on the right. For a bare toggle in a `Row` accessory, use `Switch` from `@/ui/kit`.
 */
export function Switch({ label, description, checked, onChange, disabled }: SwitchProps) {
  const id = useId();
  return (
    <div className="flex min-h-11 items-center justify-between gap-4">
      <div className="flex min-w-0 flex-col">
        <span id={`${id}-l`} className="text-body text-label">
          {label}
        </span>
        {description && <p className="mt-0.5 text-footnote text-label-2">{description}</p>}
      </div>
      <KitSwitch
        checked={checked}
        onChange={onChange}
        disabled={disabled}
        aria-labelledby={`${id}-l`}
      />
    </div>
  );
}
