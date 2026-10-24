import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import type { Chord } from '@/core';
import { voicings } from '@/theory';
import { VoicingPanel } from './VoicingPanel';

afterEach(cleanup);

const Cmaj7: Chord = { root: 0, quality: 'maj7' };

describe('VoicingPanel', () => {
  it('shows Shell, Rootless A and Rootless B rows with 7ths and plays the tapped one', () => {
    const onPlay = vi.fn();
    render(<VoicingPanel chord={Cmaj7} level={2} onPlay={onPlay} />);
    expect(screen.getByText('Cmaj7')).toBeInTheDocument();
    expect(screen.queryByRole('radiogroup')).toBeNull();
    const cards = screen.getAllByTestId('voicing-card');
    expect(cards).toHaveLength(3);
    expect(cards[0]).toHaveAccessibleName(/^Play Shell voicing/);
    expect(cards[1]).toHaveAccessibleName(/^Play Rootless A voicing/);
    expect(cards[2]).toHaveAccessibleName(/^Play Rootless B voicing/);
    fireEvent.click(cards[2]);
    expect(onPlay).toHaveBeenLastCalledWith(voicings(Cmaj7, { style: 'rootlessB' })[0]);
  });

  it('shows Close, Spread and Pop at the Simple level', () => {
    render(<VoicingPanel chord={{ root: 0, quality: 'maj' }} level={1} />);
    const names = screen.getAllByTestId('voicing-card').map((c) => c.getAttribute('aria-label'));
    expect(names.map((n) => n?.split(' voicing')[0])).toEqual([
      'Play Close',
      'Play Spread',
      'Play Pop',
    ]);
  });

  it('shows hands and note names on each row', () => {
    render(<VoicingPanel chord={Cmaj7} level={1} />);
    const spread = screen.getAllByTestId('voicing-card')[1];
    expect(spread).toHaveAccessibleName(
      'Play Spread voicing: left hand C2 G2, right hand E4 G4 B4',
    );
    expect(within(spread).getByText('C2 G2')).toBeInTheDocument();
    expect(spread.querySelector('[data-note="36"]')).toHaveAttribute('data-state', 'left');
    expect(spread.querySelector('[data-note="64"]')).toHaveAttribute('data-state', 'right');
  });

  it('spells notes as chord tones in the key', () => {
    render(<VoicingPanel chord={{ root: 1, quality: '7' }} level={1} />);
    expect(screen.getAllByTestId('voicing-card')[0]).toHaveAccessibleName(
      /left hand C♯2, right hand C♯4 E♯4 G♯4 B4/,
    );
  });

  it('has an empty state and falls back to simple shapes when no jazz shape fits', () => {
    const { rerender } = render(<VoicingPanel chord={null} />);
    expect(screen.getByText(/appear once a chord holds/)).toBeInTheDocument();
    rerender(<VoicingPanel chord={{ root: 0, quality: '5' }} level={2} />);
    expect(screen.getAllByTestId('voicing-card').length).toBeGreaterThan(0);
  });
});
