import '@/data/testing/setup';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { useJamStore } from '@/state/jamStore';
import { routes } from './routes';
import { reloadApp } from './reloadApp';

vi.mock('./reloadApp', () => ({ reloadApp: vi.fn() }));

function brokenPage(): never {
  throw new TypeError('Failed to fetch dynamically imported module: /assets/missing.js');
}

function renderError() {
  const app = routes[0];
  const group = app.children![0];
  const router = createMemoryRouter(
    [
      {
        ...app,
        children: [
          {
            ...group,
            children: [
              { index: true, Component: () => <h1>Listen</h1> },
              { path: 'broken', Component: brokenPage },
            ],
          },
        ],
      },
    ],
    { initialEntries: ['/broken'] },
  );
  render(<RouterProvider router={router} />);
  return router;
}

describe('route load recovery', () => {
  afterEach(() => {
    cleanup();
    useJamStore.getState().reset();
    vi.restoreAllMocks();
  });

  it('keeps navigation available and reloads only after an explicit click', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    renderError();
    expect(screen.getByText('This page couldn’t load')).toBeInTheDocument();
    expect(screen.getAllByRole('link', { name: 'Library' }).length).toBeGreaterThan(0);
    expect(screen.queryByText(/Hey developer/)).not.toBeInTheDocument();
    expect(reloadApp).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Reload Keel' }));
    expect(reloadApp).toHaveBeenCalledOnce();
  });

  it.each(['starting', 'listening'] as const)('protects a %s jam from reload', async (status) => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    useJamStore.getState().setStatus(status);
    renderError();
    expect(screen.queryByRole('button', { name: 'Reload Keel' })).not.toBeInTheDocument();
    expect(screen.getByText(/Your jam is still running/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Return to Listen' }));
    expect(await screen.findByRole('heading', { name: 'Listen' })).toBeInTheDocument();
    expect(useJamStore.getState().status).toBe(status);
  });

  it('explains offline failure and enables retry after reconnection', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    useJamStore.getState().setStatus('idle');
    const online = vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    renderError();
    expect(screen.getByText('You’re offline')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Reload Keel' })).toBeDisabled();
    online.mockReturnValue(true);
    act(() => window.dispatchEvent(new Event('online')));
    expect(screen.getByRole('button', { name: 'Reload Keel' })).toBeEnabled();
  });
});
