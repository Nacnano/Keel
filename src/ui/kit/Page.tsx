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

/** Shared window toolbar and inset content column. The toolbar stays available while scrolling. */
export function Page({ title, subtitle, back, leading, actions, children, className }: PageProps) {
  return (
    <div className="flex h-full flex-col overflow-y-auto">
      <header className="material hairline-b sticky top-0 z-10 shrink-0">
        <div
          data-testid="page-top-bar"
          className="flex min-h-16 flex-wrap items-center justify-between gap-x-4 gap-y-1 px-4 py-2 sm:px-6"
        >
          <div className="flex min-w-0 flex-1 items-center gap-2">
            {back ? (
              <Link
                to={back.to}
                aria-label={back.label}
                title={back.label}
                className="-ml-2 inline-flex size-11 shrink-0 items-center justify-center rounded-control text-accent transition-colors hover:bg-fill-4 active:bg-fill-3"
              >
                <ChevronLeft className="size-6" aria-hidden />
              </Link>
            ) : (
              leading
            )}
            <h1 className="min-w-0 text-title-3 font-semibold tracking-tight break-words text-label">
              {title}
            </h1>
          </div>
          {actions && (
            <div className="ml-auto flex shrink-0 flex-wrap items-center gap-1">{actions}</div>
          )}
        </div>
      </header>
      <div className={cx('mx-auto flex w-full max-w-3xl flex-1 flex-col pt-7 sm:pt-9', className)}>
        {subtitle && <div className="px-4 pb-6 text-subhead text-label-2">{subtitle}</div>}
        {children}
        <div aria-hidden className="h-[max(env(safe-area-inset-bottom),32px)] shrink-0" />
      </div>
    </div>
  );
}
