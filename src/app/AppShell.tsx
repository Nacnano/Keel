import { useEffect } from 'react';
import { Link, Outlet, useLocation } from 'react-router';
import { AudioLines, Compass, LibraryBig, Settings as SettingsIcon } from 'lucide-react';
import { isSyncConfigured } from '@/sync/client';
import { startAutoSync } from '@/sync/engine';
import { Toaster } from '@/ui/components/Toast';
import { useJamStore } from '@/state/jamStore';
import { cx } from '@/ui/lib/cx';
import { useTheme } from './useTheme';

/** Start background sync once per app load when Supabase is configured. */
function useAutoSync() {
  useEffect(() => (isSyncConfigured() ? startAutoSync() : undefined), []);
}

interface NavItem {
  to: string;
  label: string;
  Icon: typeof AudioLines;
  active?: boolean;
}

const NAV: NavItem[] = [
  { to: '/', label: 'Listen', Icon: AudioLines },
  { to: '/library', label: 'Library', Icon: LibraryBig },
  { to: '/tools', label: 'Tools', Icon: Compass },
];

const SETTINGS = { to: '/settings', label: 'Settings', Icon: SettingsIcon } as const;

function SidebarLink({
  to,
  label,
  Icon,
  active,
}: {
  to: string;
  label: string;
  Icon: typeof AudioLines;
  active?: boolean;
}) {
  return (
    <Link
      to={to}
      aria-current={active ? 'page' : undefined}
      className={cx(
        'flex min-h-11 items-center gap-3 rounded-control px-3 text-subhead font-medium transition-colors duration-100',
        active ? 'bg-accent/10 text-accent' : 'text-label-2 hover:bg-fill-4 hover:text-label',
      )}
    >
      <Icon className="size-[18px] shrink-0" aria-hidden />
      <span className="truncate">{label}</span>
    </Link>
  );
}

function TabLink({
  to,
  label,
  Icon,
  active,
}: {
  to: string;
  label: string;
  Icon: typeof AudioLines;
  active?: boolean;
}) {
  return (
    <Link
      to={to}
      aria-current={active ? 'page' : undefined}
      className={cx(
        'flex min-h-14 min-w-0 flex-1 flex-col items-center justify-center gap-1 py-2 text-caption font-medium transition-colors',
        active ? 'text-accent' : 'text-label-2',
      )}
    >
      <Icon className="size-6" aria-hidden />
      <span className="truncate">{label}</span>
    </Link>
  );
}

/**
 * Sidebar on wide screens (macOS / iPadOS landscape), tab bar on narrow (iOS / iPad portrait).
 * Screens own their own scrolling inside <main>.
 */
export function AppShell() {
  useTheme();
  useAutoSync();
  const { pathname } = useLocation();
  const listening = useJamStore((state) => state.status === 'listening');
  const items = NAV.map((item) => ({
    ...item,
    active:
      item.to === '/tools'
        ? ['/tools', '/analyze', '/train', '/stats', '/settings'].includes(pathname)
        : pathname === item.to || (item.to === '/library' && pathname.startsWith('/review/')),
  }));
  return (
    <div className="flex h-full bg-bg text-label">
      <aside
        aria-label="Primary"
        className="hidden w-56 shrink-0 flex-col gap-1 border-r border-separator/40 bg-bg-3 p-4 pt-8 lg:flex"
      >
        <div className="mb-8 flex items-center gap-2.5 px-3">
          <span className="flex size-8 items-center justify-center rounded-control bg-action text-accent-fg">
            <AudioLines className="size-5" aria-hidden />
          </span>
          <span className="text-headline font-semibold tracking-tight">Keel</span>
        </div>
        <nav className="flex flex-col gap-0.5" aria-label="Sections">
          {items.map(({ to, label, Icon, active }) => (
            <SidebarLink
              key={to}
              to={to}
              label={label}
              Icon={Icon}
              active={active && pathname !== '/settings'}
            />
          ))}
        </nav>
        <div className="mt-auto">
          <SidebarLink
            to={SETTINGS.to}
            label={SETTINGS.label}
            Icon={SETTINGS.Icon}
            active={pathname === '/settings'}
          />
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        {listening && pathname !== '/' && (
          <Link
            to="/"
            className="flex min-h-11 shrink-0 items-center justify-center gap-2 bg-accent/10 px-4 text-subhead font-medium text-accent"
          >
            <span className="size-2 rounded-full bg-live" aria-hidden />
            Listening in progress · Return to your jam
          </Link>
        )}
        <main className="min-h-0 flex-1">
          <Outlet />
        </main>
        <nav
          aria-label="Sections"
          className="material hairline-t flex shrink-0 items-stretch px-2 pb-[max(env(safe-area-inset-bottom),4px)] lg:hidden"
        >
          {items.map(({ to, label, Icon, active }) => (
            <TabLink key={to} to={to} label={label} Icon={Icon} active={active} />
          ))}
        </nav>
      </div>
      <Toaster />
    </div>
  );
}
