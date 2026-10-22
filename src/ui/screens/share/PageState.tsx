import type { ReactNode } from 'react';

/*
  Local kit addition: the kit `EmptyState`, but with the title as the page's <h1>. The public
  share page has no other heading in these states, so its title must be the top-level one
  (kit EmptyState always renders an <h2>). Same look as EmptyState.
*/

export interface PageStateProps {
  icon?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  /** Announce politely (loading). */
  status?: boolean;
}

export function PageState({ icon, title, description, action, status }: PageStateProps) {
  return (
    <div
      role={status ? 'status' : undefined}
      className="flex flex-col items-center justify-center gap-3 px-6 py-16 text-center"
    >
      {icon && (
        <div className="flex size-14 items-center justify-center rounded-full bg-fill-3 text-label-2 [&>svg]:size-7">
          {icon}
        </div>
      )}
      <h1 className="text-title-3 font-semibold text-label">{title}</h1>
      {description && <p className="max-w-sm text-subhead text-label-2">{description}</p>}
      {action && <div className="mt-2 flex flex-wrap justify-center gap-2">{action}</div>}
    </div>
  );
}
