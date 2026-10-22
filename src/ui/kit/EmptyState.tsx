import type { ReactNode } from 'react';
import { cx } from '../lib/cx';

export interface EmptyStateProps {
  icon?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
}

/** Centered empty state that teaches the screen. */
export function EmptyState({ icon, title, description, action, className }: EmptyStateProps) {
  return (
    <div
      className={cx(
        'flex flex-col items-center justify-center gap-3 px-6 py-16 text-center',
        className,
      )}
    >
      {icon && (
        <div className="flex size-14 items-center justify-center rounded-full bg-fill-3 text-label-2 [&>svg]:size-7">
          {icon}
        </div>
      )}
      <h2 className="text-title-3 font-semibold text-label">{title}</h2>
      {description && <p className="max-w-sm text-subhead text-label-2">{description}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}
