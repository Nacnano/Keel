import { Suspense } from 'react';
import type { ComponentType, LazyExoticComponent } from 'react';
import { createBrowserRouter } from 'react-router';
import { AppShell } from './AppShell';
import {
  LibraryScreen,
  ReviewScreen,
  RouteFallback,
  SettingsScreen,
  StatsScreen,
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
    children: [
      { index: true, Component: JamScreen },
      { path: 'review/:id', element: suspended(ReviewScreen) },
      { path: 'library', element: suspended(LibraryScreen) },
      { path: 'stats', element: suspended(StatsScreen) },
      { path: 'settings', element: suspended(SettingsScreen) },
    ],
  },
];

export function createAppRouter() {
  return createBrowserRouter(routes);
}
