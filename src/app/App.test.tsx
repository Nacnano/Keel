// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { routes } from './routes';

describe('App routes', () => {
  it('renders the jam screen at /', () => {
    const r = createMemoryRouter(routes, { initialEntries: ['/'] });
    render(<RouterProvider router={r} />);
    expect(screen.getByTestId('chord-symbol')).toBeInTheDocument();
  });
  it('renders the library at /library', async () => {
    const r = createMemoryRouter(routes, { initialEntries: ['/library'] });
    render(<RouterProvider router={r} />);
    expect(await screen.findByRole('heading', { level: 1, name: 'Library' })).toBeInTheDocument();
  });
  it('renders the settings screen at /settings', async () => {
    const r = createMemoryRouter(routes, { initialEntries: ['/settings'] });
    render(<RouterProvider router={r} />);
    expect(await screen.findByRole('heading', { level: 1, name: 'Settings' })).toBeInTheDocument();
  });
  it('renders the public share page at /s/:code without the app nav', async () => {
    cleanup();
    const r = createMemoryRouter(routes, { initialEntries: ['/s/abcdefghij'] });
    render(<RouterProvider router={r} />);
    // No env vars in tests: the page explains sharing is unavailable.
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Sharing is not available' }),
    ).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Library' })).toBeNull();
  });
});
