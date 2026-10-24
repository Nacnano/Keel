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
        <div className="mb-2 flex size-16 items-center justify-center text-label-3 [&>svg]:size-12 [&>svg]:stroke-[1.25]">
          {icon}
        </div>
      )}
      <h2 className="text-title-3 font-semibold text-label">{title}</h2>
      {description && <p className="max-w-sm text-subhead text-label-2">{description}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}
