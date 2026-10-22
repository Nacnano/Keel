import { lazy } from 'react';

// The jam screen is the landing route; these load on first visit to keep the main chunk small.
export const ReviewScreen = lazy(() =>
  import('../ui/screens/ReviewScreen').then((m) => ({ default: m.ReviewScreen })),
);
export const LibraryScreen = lazy(() =>
  import('../ui/screens/LibraryScreen').then((m) => ({ default: m.LibraryScreen })),
);
export const StatsScreen = lazy(() =>
  import('../ui/screens/StatsScreen').then((m) => ({ default: m.StatsScreen })),
);
export const SettingsScreen = lazy(() =>
  import('../ui/screens/SettingsScreen').then((m) => ({ default: m.SettingsScreen })),
);
export const ShareScreen = lazy(() =>
  import('../ui/screens/ShareScreen').then((m) => ({ default: m.ShareScreen })),
);
export const TrainScreen = lazy(() =>
  import('../ui/screens/TrainScreen').then((m) => ({ default: m.TrainScreen })),
);
export const AnalyzeScreen = lazy(() =>
  import('../ui/screens/AnalyzeScreen').then((m) => ({ default: m.AnalyzeScreen })),
);

/** Shown while a lazily loaded route chunk downloads. */
export function RouteFallback() {
  return (
    <div role="status" className="p-6 text-sm text-zinc-500">
      Loading…
    </div>
  );
}
