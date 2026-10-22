import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { cx } from '../lib/cx';

/**
 * Apple-style button. `filled` is the one primary action on a screen; `tinted` is a
 * secondary emphasised action; `gray` is the default; `plain` is text-only (toolbars).
 */
export type ButtonVariant = 'filled' | 'tinted' | 'gray' | 'plain';
export type ButtonSize = 'sm' | 'md' | 'lg';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Red styling for destructive actions. */
  destructive?: boolean;
  /** Toggle state (sets aria-pressed and the selected look). */
  pressed?: boolean;
  /** Square icon-only button; pass an aria-label. */
  icon?: boolean;
  /** Fully round (pill). */
  round?: boolean;
  leading?: ReactNode;
  trailing?: ReactNode;
  loading?: boolean;
}

const VARIANT: Record<ButtonVariant, string> = {
  filled: 'bg-action text-accent-fg hover:brightness-110 active:brightness-95 font-semibold',
  tinted: 'bg-accent/15 text-accent hover:bg-accent/22 active:bg-accent/28 font-semibold',
  gray: 'bg-fill-3 text-label hover:bg-fill-2 active:bg-fill font-medium',
  plain: 'text-accent hover:bg-fill-4 active:bg-fill-3 font-medium',
};

const DESTRUCTIVE: Record<ButtonVariant, string> = {
  filled: 'bg-danger-action text-white hover:brightness-110 active:brightness-95 font-semibold',
  tinted: 'bg-live/15 text-live hover:bg-live/22 font-semibold',
  gray: 'bg-fill-3 text-live hover:bg-fill-2 font-medium',
  plain: 'text-live hover:bg-live/10 font-medium',
};

const SIZE: Record<ButtonSize, string> = {
  sm: 'h-8 px-3 text-footnote gap-1.5 rounded-[8px]',
  md: 'h-11 px-4 text-subhead gap-2 rounded-control',
  lg: 'h-13 px-6 text-body gap-2.5 rounded-cell',
};

const ICON_SIZE: Record<ButtonSize, string> = {
  sm: 'size-8 rounded-[8px]',
  md: 'size-11 rounded-control',
  lg: 'size-13 rounded-cell',
};

export function Button({
  variant = 'gray',
  size = 'md',
  destructive,
  pressed,
  icon,
  round,
  leading,
  trailing,
  loading,
  className,
  children,
  type = 'button',
  disabled,
  ...rest
}: ButtonProps) {
  const look = destructive ? DESTRUCTIVE[variant] : VARIANT[variant];
  return (
    <button
      type={type}
      aria-pressed={pressed}
      aria-busy={loading || undefined}
      disabled={disabled || loading}
      className={cx(
        'inline-flex shrink-0 items-center justify-center whitespace-nowrap select-none',
        'transition-[background-color,color,filter,transform] duration-150 ease-out active:scale-[0.98]',
        'disabled:pointer-events-none disabled:opacity-40',
        pressed && variant !== 'filled' ? 'bg-accent/15 text-accent font-semibold' : look,
        icon ? ICON_SIZE[size] : SIZE[size],
        round && 'rounded-full',
        className,
      )}
      {...rest}
    >
      {loading ? (
        <span
          aria-hidden
          className="size-4 animate-spin rounded-full border-2 border-current border-t-transparent"
        />
      ) : (
        leading
      )}
      {children}
      {trailing}
    </button>
  );
}
