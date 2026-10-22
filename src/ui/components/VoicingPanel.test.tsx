import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import type { Chord } from '@/core';
import { VOICING_STYLES, voicingLabel, voicings } from '@/theory';
import { VoicingPanel } from './VoicingPanel';

afterEach(cleanup);

const Cmaj7: Chord = { root: 0, quality: 'maj7' };

describe('VoicingPanel', () => {
  it('renders every style for Cmaj7 and plays the tapped voicing', () => {
    const onPlay = vi.fn();
    render(<VoicingPanel chord={Cmaj7} onPlay={onPlay} />);
    expect(screen.getByText('Cmaj7')).toBeInTheDocument();
    const tabs = screen.getByRole('radiogroup', { name: 'Voicing style' });
    for (const style of VOICING_STYLES) {
      const label = voicingLabel(style);
      fireEvent.click(within(tabs).getByRole('radio', { name: new RegExp(`^${label}:`) }));
      const expected = voicings(Cmaj7, { style }).slice(0, 3);
      const cards = screen.getAllByTestId('voicing-card');
      expect(cards, style).toHaveLength(expected.length);
      expect(cards[0]).toHaveAccessibleName(new RegExp(`^Play ${label} voicing 1`));
      fireEvent.click(cards[cards.length - 1]);
      expect(onPlay).toHaveBeenLastCalledWith(expected[expected.length - 1]);
    }
    expect(onPlay).toHaveBeenCalledTimes(VOICING_STYLES.length);
  });

  it('shows hands and note names on each card', () => {
    render(<VoicingPanel chord={Cmaj7} initialStyle="spread" />);
    const [first] = screen.getAllByTestId('voicing-card');
    expect(first).toHaveAccessibleName(
      'Play Spread voicing 1: left hand C2 G2, right hand E4 G4 B4',
    );
    expect(within(first).getByText('C2 G2')).toBeInTheDocument();
    expect(first.querySelector('[data-note="36"]')).toHaveAttribute('data-state', 'left');
    expect(first.querySelector('[data-note="64"]')).toHaveAttribute('data-state', 'right');
  });

  it('spells notes as chord tones in the key', () => {
    render(<VoicingPanel chord={{ root: 1, quality: '7' }} initialStyle="close" />);
    expect(screen.getAllByTestId('voicing-card')[0]).toHaveAccessibleName(
      /left hand C♯2, right hand C♯4 E♯4 G♯4 B4/,
    );
  });

  it('has empty states and no header toggle', () => {
    const onToggle = vi.fn();
    const { rerender } = render(<VoicingPanel chord={null} onToggle={onToggle} />);
    expect(screen.getByText(/appear once a chord is detected/)).toBeInTheDocument();
    rerender(
      <VoicingPanel key="power" chord={{ root: 0, quality: '5' }} initialStyle="rootlessA" />,
    );
    expect(screen.getByText(/No rootless a voicing/)).toBeInTheDocument();
    // legacy props are accepted but the panel always renders open
    rerender(<VoicingPanel chord={Cmaj7} open={false} onToggle={onToggle} />);
    expect(screen.getAllByTestId('voicing-card').length).toBeGreaterThan(0);
    expect(screen.queryByRole('button', { name: /^(Show|Hide) voicings$/ })).toBeNull();
    expect(onToggle).not.toHaveBeenCalled();
  });

  it('keeps one selected style across the two style rows', () => {
    render(<VoicingPanel chord={Cmaj7} />);
    const tabs = screen.getByRole('radiogroup', { name: 'Voicing style' });
    const checked = () =>
      within(tabs)
        .getAllByRole('radio')
        .filter((r) => r.getAttribute('aria-checked') === 'true');
    expect(checked()).toHaveLength(1);
    fireEvent.click(within(tabs).getByRole('radio', { name: /^Shell:/ }));
    expect(checked()).toHaveLength(1);
    expect(checked()[0]).toHaveAccessibleName(/^Shell:/);
    expect(screen.getByText(/Left-hand 1-3-7/)).toBeInTheDocument();
  });
});
