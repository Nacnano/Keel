import type { ButtonHTMLAttributes } from 'react';
import { cx } from '../lib/cx';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
export type ButtonSize = 'md' | 'lg' | 'icon';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Shows the pressed state for toggle buttons and sets aria-pressed. */
  pressed?: boolean;
}

const VARIANT: Record<ButtonVariant, string> = {
  primary: 'bg-violet-400 text-zinc-950 hover:bg-violet-300 font-semibold',
  secondary: 'bg-zinc-800/80 text-zinc-100 hover:bg-zinc-700/80',
  ghost: 'text-zinc-300 hover:bg-zinc-800/70 hover:text-white',
  danger: 'bg-rose-500/15 text-rose-200 hover:bg-rose-500/25',
};

const PRESSED = 'bg-violet-400/15 text-violet-200 hover:bg-violet-400/25';

const SIZE: Record<ButtonSize, string> = {
  md: 'min-h-11 px-4 text-sm gap-2',
  lg: 'min-h-14 px-6 text-base gap-2.5',
  icon: 'min-h-11 min-w-11 px-2.5',
};

export function Button({
  variant = 'secondary',
  size = 'md',
  pressed,
  className,
  type = 'button',
  ...rest
}: ButtonProps) {
  return (
    <button
      type={type}
      aria-pressed={pressed}
      className={cx(
        'inline-flex items-center justify-center rounded-xl transition-colors duration-150 select-none',
        'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-300',
        'disabled:pointer-events-none disabled:opacity-40',
        pressed && variant !== 'primary' ? PRESSED : VARIANT[variant],
        SIZE[size],
        className,
      )}
      {...rest}
    />
  );
}
