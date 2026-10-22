// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { render, screen, within } from '@testing-library/react';
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
  it('renders the analyze screen at /analyze', async () => {
    const r = createMemoryRouter(routes, { initialEntries: ['/analyze'] });
    const { container } = render(<RouterProvider router={r} />);
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Analyze a file' }),
    ).toBeInTheDocument();
    const view = within(container);
    expect(view.getByLabelText('Choose an audio file')).toBeInTheDocument();
    expect(view.getByRole('link', { name: 'Analyze' })).toHaveAttribute('aria-current', 'page');
  });
});
