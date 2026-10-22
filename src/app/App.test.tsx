// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { routes } from './routes';

describe('App routes', () => {
  it('renders the jam screen at /', () => {
    const r = createMemoryRouter(routes, { initialEntries: ['/'] });
    render(<RouterProvider router={r} />);
    expect(screen.getByTestId('chord-symbol')).toBeInTheDocument();
  });
  it('renders the library at /library', () => {
    const r = createMemoryRouter(routes, { initialEntries: ['/library'] });
    render(<RouterProvider router={r} />);
    expect(screen.getByText(/Library screen placeholder/)).toBeInTheDocument();
  });
});
