// @vitest-environment jsdom
import '@/data/testing/setup';
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { routes } from './routes';

describe('App routes', () => {
  afterEach(cleanup);
  it('renders the jam screen at /', () => {
    const r = createMemoryRouter(routes, { initialEntries: ['/'] });
    render(<RouterProvider router={r} />);
    expect(screen.getByRole('button', { name: 'Start listening' })).toBeInTheDocument();
    expect(screen.queryByTestId('chord-symbol')).not.toBeInTheDocument();
  });
  it('renders the library at /library', async () => {
    const r = createMemoryRouter(routes, { initialEntries: ['/library'] });
    render(<RouterProvider router={r} />);
    expect(await screen.findByRole('heading', { level: 1, name: 'Library' })).toBeInTheDocument();
  });
  it('lists each music tool and Settings on the Tools page', async () => {
    const r = createMemoryRouter(routes, { initialEntries: ['/tools'] });
    render(<RouterProvider router={r} />);
    expect(await screen.findByRole('heading', { level: 1, name: 'Tools' })).toBeInTheDocument();
    for (const [name, href] of [
      ['Analyze a song', '/analyze'],
      ['Ear training', '/train'],
      ['Stats', '/stats'],
      ['Settings', '/settings'],
    ]) {
      const links = screen.getAllByRole('link', { name: new RegExp(`^${name}`) });
      expect(links.some((link) => link.getAttribute('href') === href)).toBe(true);
    }
  });
  it('opens a tool and returns to the Tools list', async () => {
    const r = createMemoryRouter(routes, { initialEntries: ['/tools'] });
    render(<RouterProvider router={r} />);
    fireEvent.click(await screen.findByRole('link', { name: /^Analyze a song/ }));
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Analyze a song' }),
    ).toBeInTheDocument();
    fireEvent.click(
      screen.getAllByRole('link', { name: 'Tools' }).find((link) => link.closest('main'))!,
    );
    expect(await screen.findByRole('heading', { level: 1, name: 'Tools' })).toBeInTheDocument();
  });
  it('renders the stats screen at /stats', async () => {
    const r = createMemoryRouter(routes, { initialEntries: ['/stats'] });
    render(<RouterProvider router={r} />);
    expect(await screen.findByRole('heading', { level: 1, name: 'Stats' })).toBeInTheDocument();
    expect(
      screen
        .getAllByRole('link', { name: 'Tools' })
        .some((a) => a.getAttribute('aria-current') === 'page'),
    ).toBe(true);
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
  it('renders the ear-training screen at /train', async () => {
    const r = createMemoryRouter(routes, { initialEntries: ['/train'] });
    render(<RouterProvider router={r} />);
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Ear training' }),
    ).toBeInTheDocument();
    const links = screen.getAllByRole('link', { name: 'Tools' });
    expect(links.some((a) => a.getAttribute('aria-current') === 'page')).toBe(true);
  });
  it('renders the analyze screen at /analyze', async () => {
    const r = createMemoryRouter(routes, { initialEntries: ['/analyze'] });
    const { container } = render(<RouterProvider router={r} />);
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Analyze a song' }),
    ).toBeInTheDocument();
    const view = within(container);
    expect(view.getByLabelText('Choose an audio file')).toBeInTheDocument();
    expect(
      view
        .getAllByRole('link', { name: 'Tools' })
        .some((a) => a.getAttribute('aria-current') === 'page'),
    ).toBe(true);
  });
});
