import { useEffect } from 'react';
import { NavLink, Outlet } from 'react-router';
import { isSyncConfigured } from '@/sync/client';
import { startAutoSync } from '@/sync/engine';
import { Toaster } from '@/ui/components/Toast';
import { useTheme } from './useTheme';

const link = ({ isActive }: { isActive: boolean }) =>
  `px-3 py-1.5 rounded-md text-sm ${isActive ? 'bg-zinc-800 text-white' : 'text-zinc-400 hover:text-white'}`;

/** Start background sync once per app load when Supabase is configured. */
function useAutoSync() {
  useEffect(() => (isSyncConfigured() ? startAutoSync() : undefined), []);
}

export function AppShell() {
  useTheme();
  useAutoSync();
  return (
    <div className="flex h-full flex-col">
      <header className="flex items-center gap-2 border-b border-zinc-800 px-4 py-2">
        <span className="mr-4 font-semibold tracking-tight text-violet-300">JamKey</span>
        <nav className="flex gap-1">
          <NavLink to="/" end className={link}>
            Jam
          </NavLink>
          <NavLink to="/library" className={link}>
            Library
          </NavLink>
          <NavLink to="/settings" className={link}>
            Settings
          </NavLink>
        </nav>
      </header>
      <main className="min-h-0 flex-1">
        <Outlet />
      </main>
      <Toaster />
    </div>
  );
}
