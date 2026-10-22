import { useEffect } from 'react';
import { useSettings } from '@/state/settingsStore';

/** Applies the `dark` class on <html> from the theme setting (system follows the OS). */
export function useTheme(): void {
  const theme = useSettings((s) => s.theme);
  useEffect(() => {
    const root = document.documentElement;
    const mq = window.matchMedia?.('(prefers-color-scheme: dark)');
    const apply = () => {
      const dark = theme === 'dark' || (theme === 'system' && (mq?.matches ?? true));
      root.classList.toggle('dark', dark);
      root.style.colorScheme = dark ? 'dark' : 'light';
    };
    apply();
    mq?.addEventListener?.('change', apply);
    return () => mq?.removeEventListener?.('change', apply);
  }, [theme]);
}
