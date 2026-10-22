import { lazy, Suspense } from 'react';
import type { ComponentType, LazyExoticComponent } from 'react';
import { createBrowserRouter } from 'react-router';
import { AppShell } from './AppShell';
import { JamScreen } from '../ui/screens/JamScreen';

const ReviewScreen = lazy(() =>
  import('../ui/screens/ReviewScreen').then((m) => ({ default: m.ReviewScreen })),
);
const LibraryScreen = lazy(() =>
  import('../ui/screens/LibraryScreen').then((m) => ({ default: m.LibraryScreen })),
);
const SettingsScreen = lazy(() =>
  import('../ui/screens/SettingsScreen').then((m) => ({ default: m.SettingsScreen })),
);

function RouteFallback() {
  return (
    <div role="status" className="p-6 text-sm text-zinc-500">
      Loading…
    </div>
  );
}

function suspended(Screen: LazyExoticComponent<ComponentType>): ComponentType {
  return function SuspendedRoute() {
    return (
      <Suspense fallback={<RouteFallback />}>
        <Screen />
      </Suspense>
    );
  };
}

export const routes = [
  {
    path: '/',
    Component: AppShell,
    children: [
      { index: true, Component: JamScreen },
      { path: 'review/:id', Component: suspended(ReviewScreen) },
      { path: 'library', Component: suspended(LibraryScreen) },
      { path: 'settings', Component: suspended(SettingsScreen) },
    ],
  },
];

export function createAppRouter() {
  return createBrowserRouter(routes);
}
