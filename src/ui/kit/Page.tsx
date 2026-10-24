import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { ChevronLeft } from 'lucide-react';
import { cx } from '../lib/cx';

export interface PageProps {
  /** Large title. A string, or an element such as an editable name field. */
  title: ReactNode;
  subtitle?: ReactNode;
  /** Back link in the top bar ("‹ Tools"). */
  back?: { to: string; label: string };
  /** Top bar leading content when there is no back link (a wordmark). */
  leading?: ReactNode;
  /** Top bar actions, right-aligned. */
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
}

/**
 * The one page shell: a scroll area with a centred column, a top bar row that holds the back
 * link and the actions, and the large title under it. The top bar row is always there, so the
 * title sits at the same place on every page.
 */
export function Page({ title, subtitle, back, leading, actions, children, className }: PageProps) {
  return (
    <div className="h-full overflow-y-auto">
      <div className={cx('mx-auto flex w-full max-w-3xl flex-col', className)}>
        <div
          data-testid="page-top-bar"
          className="flex h-13 items-center justify-between gap-2 px-2"
        >
          <div className="flex min-w-0 items-center">
            {back ? (
              <Link
                to={back.to}
                className="inline-flex h-11 shrink-0 items-center gap-0.5 rounded-control px-2 text-body text-accent transition-colors duration-150 hover:bg-fill-4 active:bg-fill-3"
              >
                <ChevronLeft className="size-6" aria-hidden />
                {back.label}
              </Link>
            ) : (
              leading
            )}
          </div>
          {actions && <div className="flex shrink-0 items-center gap-1">{actions}</div>}
        </div>
        <header className="px-4 pb-4">
          <h1 className="text-large-title font-bold break-words text-label">{title}</h1>
          {subtitle && <div className="mt-1 text-subhead text-label-2">{subtitle}</div>}
        </header>
        {children}
        <div aria-hidden className="h-[max(env(safe-area-inset-bottom),32px)] shrink-0" />
      </div>
    </div>
  );
}
