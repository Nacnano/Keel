import type { InputHTMLAttributes } from 'react';
import { cx } from '../lib/cx';

export interface SliderProps extends Omit<
  InputHTMLAttributes<HTMLInputElement>,
  'type' | 'onChange'
> {
  value: number;
  onChange(value: number): void;
  /** Captions under the ends. */
  minLabel?: string;
  maxLabel?: string;
}

/** Styled range input with the accent fill up to the thumb. */
export function Slider({
  value,
  onChange,
  min = 0,
  max = 1,
  step = 0.01,
  minLabel,
  maxLabel,
  className,
  ...rest
}: SliderProps) {
  const pct = ((Number(value) - Number(min)) / (Number(max) - Number(min))) * 100;
  return (
    <div className={cx('flex flex-col gap-1.5', className)}>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="jk-slider h-7 w-full pointer-coarse:h-11 cursor-pointer appearance-none bg-transparent"
        style={{ ['--pct' as string]: `${pct}%` }}
        {...rest}
      />
      {(minLabel || maxLabel) && (
        <div className="flex justify-between text-caption text-label-2">
          <span>{minLabel}</span>
          <span>{maxLabel}</span>
        </div>
      )}
    </div>
  );
}
