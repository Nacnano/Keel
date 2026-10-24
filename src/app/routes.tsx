import { Suspense } from 'react';
import type { ComponentType, LazyExoticComponent } from 'react';
import { createBrowserRouter } from 'react-router';
import { AppShell } from './AppShell';
import { RouteError } from './RouteError';
import {
  AnalyzeScreen,
  LibraryScreen,
  ReviewScreen,
  RouteFallback,
  SettingsScreen,
  ShareScreen,
  TrainScreen,
  StatsScreen,
  ToolsScreen,
} from './lazyRoutes';
import { JamScreen } from '../ui/screens/JamScreen';

const suspended = (Screen: LazyExoticComponent<ComponentType>) => (
  <Suspense fallback={<RouteFallback />}>
    <Screen />
  </Suspense>
);

export const routes = [
  {
    path: '/',
    Component: AppShell,
    ErrorBoundary: RouteError,
    children: [
      {
        ErrorBoundary: RouteError,
        children: [
          { index: true, Component: JamScreen },
          { path: 'review/:id', element: suspended(ReviewScreen) },
          { path: 'library', element: suspended(LibraryScreen) },
          { path: 'tools', element: suspended(ToolsScreen) },
          { path: 'train', element: suspended(TrainScreen) },
          { path: 'analyze', element: suspended(AnalyzeScreen) },
          { path: 'stats', element: suspended(StatsScreen) },
          { path: 'settings', element: suspended(SettingsScreen) },
        ],
      },
    ],
  },
  // Public share page: standalone (no nav chrome), works logged out.
  { path: '/s/:code', element: suspended(ShareScreen), ErrorBoundary: RouteError },
];

export function createAppRouter() {
  return createBrowserRouter(routes);
}
