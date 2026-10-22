import type { HTMLAttributes, ReactNode } from 'react';
import { cx } from '../lib/cx';

export interface ToolbarProps extends Omit<HTMLAttributes<HTMLDivElement>, 'title'> {
  /** Left slot (back button, status). */
  leading?: ReactNode;
  /** Centre title; use `large` on list screens via PageHeader instead. */
  title?: ReactNode;
  /** Right slot (actions). */
  trailing?: ReactNode;
  /** Translucent, sticks to the top of the scroll area. */
  sticky?: boolean;
}

/** Navigation-bar style toolbar: translucent material, hairline bottom, three slots. */
export function Toolbar({
  leading,
  title,
  trailing,
  sticky = true,
  className,
  ...rest
}: ToolbarProps) {
  return (
    <div
      className={cx(
        'z-20 grid min-h-13 grid-cols-[1fr_auto_1fr] items-center gap-2 px-4',
        sticky && 'material hairline-b sticky top-0',
        className,
      )}
      {...rest}
    >
      <div className="flex min-w-0 items-center gap-2 justify-self-start">{leading}</div>
      <div className="min-w-0 truncate text-center text-headline font-semibold text-label">
        {title}
      </div>
      <div className="flex min-w-0 items-center gap-1 justify-self-end">{trailing}</div>
    </div>
  );
}

export interface PageHeaderProps extends Omit<HTMLAttributes<HTMLDivElement>, 'title'> {
  title: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
}

/** Large-title header for list screens (Library, Stats, Settings). */
export function PageHeader({ title, subtitle, actions, className, ...rest }: PageHeaderProps) {
  return (
    <div
      className={cx('flex flex-wrap items-end justify-between gap-3 px-4 pt-6 pb-3', className)}
      {...rest}
    >
      <div className="min-w-0">
        <h1 className="text-large-title font-bold text-label">{title}</h1>
        {subtitle && <p className="mt-1 text-subhead text-label-2">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}
