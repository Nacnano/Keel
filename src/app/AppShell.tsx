import { useEffect } from 'react';
import { NavLink, Outlet } from 'react-router';
import {
  AudioLines,
  BarChart3,
  FileAudio,
  GraduationCap,
  LibraryBig,
  Settings as SettingsIcon,
} from 'lucide-react';
import { isSyncConfigured } from '@/sync/client';
import { startAutoSync } from '@/sync/engine';
import { Toaster } from '@/ui/components/Toast';
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
  end?: boolean;
  tab: boolean;
}

const NAV: NavItem[] = [
  { to: '/', label: 'Jam', Icon: AudioLines, end: true, tab: true },
  { to: '/library', label: 'Library', Icon: LibraryBig, tab: true },
  { to: '/analyze', label: 'Analyze', Icon: FileAudio, tab: true },
  { to: '/train', label: 'Train', Icon: GraduationCap, tab: true },
  { to: '/stats', label: 'Stats', Icon: BarChart3, tab: false },
];

const SETTINGS = { to: '/settings', label: 'Settings', Icon: SettingsIcon } as const;

function SidebarLink({
  to,
  label,
  Icon,
  end,
}: {
  to: string;
  label: string;
  Icon: typeof AudioLines;
  end?: boolean;
}) {
  return (
    <NavLink
      to={to}
      end={end}
      className={({ isActive }) =>
        cx(
          'flex h-10 items-center gap-3 rounded-control px-3 text-subhead font-medium transition-colors duration-100',
          isActive ? 'bg-accent/15 text-accent' : 'text-label hover:bg-fill-4',
        )
      }
    >
      <Icon className="size-[18px] shrink-0" aria-hidden />
      <span className="truncate">{label}</span>
    </NavLink>
  );
}

function TabLink({
  to,
  label,
  Icon,
  end,
}: {
  to: string;
  label: string;
  Icon: typeof AudioLines;
  end?: boolean;
}) {
  return (
    <NavLink
      to={to}
      end={end}
      className={({ isActive }) =>
        cx(
          'flex min-w-0 flex-1 flex-col items-center justify-center gap-0.5 py-1.5 text-[10px] font-medium transition-colors',
          isActive ? 'text-accent' : 'text-label-2',
        )
      }
    >
      <Icon className="size-6" aria-hidden />
      <span className="truncate">{label}</span>
    </NavLink>
  );
}

/**
 * Sidebar on wide screens (macOS / iPadOS landscape), tab bar on narrow (iOS / iPad portrait).
 * Screens own their own scrolling inside <main>.
 */
export function AppShell() {
  useTheme();
  useAutoSync();
  return (
    <div className="flex h-full bg-bg text-label">
      <aside
        aria-label="Primary"
        className="hidden w-56 shrink-0 flex-col gap-1 border-r border-separator bg-bg-2/60 p-3 pt-5 lg:flex dark:bg-bg"
      >
        <div className="mb-3 flex items-center gap-2 px-2">
          <span className="flex size-7 items-center justify-center rounded-[8px] bg-accent text-accent-fg">
            <AudioLines className="size-4" aria-hidden />
          </span>
          <span className="text-headline font-semibold tracking-tight">JamKey</span>
        </div>
        <nav className="flex flex-col gap-0.5" aria-label="Sections">
          {NAV.map(({ to, label, Icon, end }) => (
            <SidebarLink key={to} to={to} label={label} Icon={Icon} end={end} />
          ))}
        </nav>
        <div className="mt-auto">
          <SidebarLink to={SETTINGS.to} label={SETTINGS.label} Icon={SETTINGS.Icon} />
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <main className="min-h-0 flex-1">
          <Outlet />
        </main>
        <nav
          aria-label="Sections"
          className="material hairline-t flex shrink-0 items-stretch px-2 pb-[max(env(safe-area-inset-bottom),4px)] lg:hidden"
        >
          {NAV.filter((n) => n.tab).map(({ to, label, Icon, end }) => (
            <TabLink key={to} to={to} label={label} Icon={Icon} end={end} />
          ))}
          <TabLink to={SETTINGS.to} label={SETTINGS.label} Icon={SETTINGS.Icon} />
        </nav>
      </div>
      <Toaster />
    </div>
  );
}
