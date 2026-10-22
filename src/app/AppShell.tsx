import { NavLink, Outlet } from 'react-router';
import { Toaster } from '@/ui/components/Toast';
import { useTheme } from './useTheme';

const link = ({ isActive }: { isActive: boolean }) =>
  `px-3 py-1.5 rounded-md text-sm ${isActive ? 'bg-zinc-800 text-white' : 'text-zinc-400 hover:text-white'}`;

export function AppShell() {
  useTheme();
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
          <NavLink to="/train" className={link}>
            Train
          </NavLink>
          <NavLink to="/analyze" className={link}>
            Analyze
          </NavLink>
          <NavLink to="/stats" className={link}>
            Stats
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
