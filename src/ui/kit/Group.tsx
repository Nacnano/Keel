import type { HTMLAttributes, ReactNode } from 'react';
import { ChevronRight } from 'lucide-react';
import { cx } from '../lib/cx';

/** Inset grouped list (iOS Settings style): optional title above, footer below, rows inside. */
export interface GroupProps extends Omit<HTMLAttributes<HTMLElement>, 'title'> {
  title?: ReactNode;
  footer?: ReactNode;
  /** Remove the inner padding for custom content such as a chart. */
  flush?: boolean;
}

export function Group({ title, footer, flush, className, children, ...rest }: GroupProps) {
  return (
    <section className={cx('flex flex-col gap-2', className)} {...rest}>
      {title && <h2 className="px-4 text-footnote font-medium text-label-2">{title}</h2>}
      <div
        className={cx(
          'overflow-hidden rounded-cell bg-surface',
          'dark:bg-surface',
          !flush && '[&>*+*]:hairline-t',
        )}
      >
        {children}
      </div>
      {footer && <p className="px-4 text-footnote text-label-2">{footer}</p>}
    </section>
  );
}

export interface RowProps extends Omit<HTMLAttributes<HTMLDivElement>, 'title'> {
  label: ReactNode;
  /** Secondary line under the label. */
  detail?: ReactNode;
  /** Right-aligned value or control. */
  accessory?: ReactNode;
  /** Leading icon slot. */
  leading?: ReactNode;
  /** Navigation chevron. */
  chevron?: boolean;
  /** Render as a button or link-like interactive row. */
  onClick?: () => void;
  /** Stack the accessory under the label (for wide controls like sliders). */
  stacked?: boolean;
  disabled?: boolean;
}

export function Row({
  label,
  detail,
  accessory,
  leading,
  chevron,
  onClick,
  stacked,
  disabled,
  className,
  ...rest
}: RowProps) {
  const interactive = Boolean(onClick);
  const Tag = interactive ? 'button' : 'div';
  return (
    <Tag
      {...(interactive ? { type: 'button', onClick, disabled } : {})}
      className={cx(
        'flex w-full min-h-11 items-center gap-3 px-4 py-2.5 text-left text-body text-label',
        stacked && 'flex-col items-stretch gap-2',
        interactive && 'transition-colors duration-100 hover:bg-fill-4 active:bg-fill-3',
        disabled && 'opacity-40',
        className,
      )}
      {...(rest as object)}
    >
      <div className={cx('flex min-w-0 flex-1 items-center gap-3', stacked && 'w-full')}>
        {leading && (
          <span className="flex size-7 shrink-0 items-center justify-center text-label-2">
            {leading}
          </span>
        )}
        <div className="min-w-0 flex-1">
          <div className="truncate">{label}</div>
          {detail && <div className="mt-0.5 text-footnote text-label-2">{detail}</div>}
        </div>
        {!stacked && accessory && (
          <div className="flex shrink-0 items-center gap-2 text-body text-label-2">{accessory}</div>
        )}
        {chevron && <ChevronRight className="size-4 shrink-0 text-label-3" aria-hidden />}
      </div>
      {stacked && accessory && <div className="w-full">{accessory}</div>}
    </Tag>
  );
}
