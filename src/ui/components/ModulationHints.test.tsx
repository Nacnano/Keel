import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { C_MAJOR_KEY } from '@/core/mocks';
import { ModulationHints } from './ModulationHints';

afterEach(cleanup);

describe('ModulationHints', () => {
  it('renders one chip per destination key and auditions the pivot on tap', () => {
    const onAudition = vi.fn();
    render(<ModulationHints keyContext={C_MAJOR_KEY} level={2} onAudition={onAudition} />);
    expect(screen.getByRole('region', { name: 'Modulation hints' })).toBeInTheDocument();
    const chips = screen.getAllByTestId('modulation-hint');
    expect(chips).toHaveLength(5);
    const g = screen.getByRole('button', { name: /^G major: hear pivot C, I → IV/ });
    expect(g).toHaveAccessibleDescription(/C is I here and IV in G major/);
    fireEvent.click(g);
    expect(onAudition).toHaveBeenCalledWith({ root: 0, quality: 'maj' });
    expect(screen.getByRole('button', { name: /^A minor: hear pivot Dm, ii → iv/ })).toBeVisible();
  });

  it('shows four hints at level 1 and pretty accidentals', () => {
    render(<ModulationHints keyContext={{ tonic: 3, mode: 'major' }} level={1} />);
    expect(screen.getAllByTestId('modulation-hint')).toHaveLength(4);
    expect(screen.getByRole('button', { name: /^B♭ major: hear pivot E♭/ })).toBeInTheDocument();
  });

  it('is hidden without a key', () => {
    const { container } = render(<ModulationHints keyContext={null} level={2} />);
    expect(container).toBeEmptyDOMElement();
  });
});
