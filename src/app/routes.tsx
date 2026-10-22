import { createBrowserRouter } from 'react-router';
import { AppShell } from './AppShell';
import { JamScreen } from '../ui/screens/JamScreen';
import { ReviewScreen } from '../ui/screens/ReviewScreen';
import { LibraryScreen } from '../ui/screens/LibraryScreen';
import { SettingsScreen } from '../ui/screens/SettingsScreen';

export const routes = [
  {
    path: '/',
    Component: AppShell,
    children: [
      { index: true, Component: JamScreen },
      { path: 'review/:id', Component: ReviewScreen },
      { path: 'library', Component: LibraryScreen },
      { path: 'settings', Component: SettingsScreen },
    ],
  },
];

export function createAppRouter() {
  return createBrowserRouter(routes);
}
