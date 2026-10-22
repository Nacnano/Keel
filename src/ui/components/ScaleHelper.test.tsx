import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import type { Chord, Key } from '@/core';
import { Piano } from './Piano';
import { ScaleHelper } from './ScaleHelper';

afterEach(cleanup);

const C_MAJOR: Key = { tonic: 0, mode: 'major' };
const DM7: Chord = { root: 2, quality: 'min7' };
const EM7: Chord = { root: 4, quality: 'min7' };
const G7: Chord = { root: 7, quality: '7' };

const chips = () =>
  within(screen.getByRole('radiogroup', { name: 'Scales that fit' })).getAllByRole('radio');
const keyState = (c: HTMLElement, n: number) =>
  c.querySelector(`[data-note="${n}"]`)?.getAttribute('data-state');

describe('ScaleHelper', () => {
  it('shows an empty state without a chord', () => {
    render(<ScaleHelper chord={null} keyContext={C_MAJOR} />);
    expect(screen.getByText('Play a chord to see scales that fit.')).toBeInTheDocument();
    expect(screen.queryByRole('radiogroup')).toBeNull();
  });

  it('ranks scales for Dm7 in C with dorian first, top 4 then "more…"', () => {
    render(<ScaleHelper chord={DM7} keyContext={C_MAJOR} />);
    const c = chips();
    expect(c).toHaveLength(4);
    expect(c[0]).toHaveTextContent('D dorian');
    expect(c[0]).toHaveAttribute('aria-checked', 'true');
    expect(c[0]).toHaveAttribute('data-rank', '1');
    expect(c[0].getAttribute('title')).toContain('ii7 in C major');
    expect(screen.getByText('over')).toHaveTextContent('over Dm7');

    fireEvent.click(screen.getByRole('button', { name: /more…/ }));
    expect(chips().length).toBeGreaterThan(4);
    fireEvent.click(screen.getByRole('button', { name: 'less' }));
    expect(chips()).toHaveLength(4);
  });

  it('spells the selected scale for the key and marks chord tones', () => {
    render(<ScaleHelper chord={DM7} keyContext={C_MAJOR} />);
    const notes = within(screen.getByTestId('scale-notes')).getAllByRole('listitem');
    expect(notes.map((n) => n.textContent)).toEqual(['D', 'E', 'F', 'G', 'A', 'B', 'C']);
    const tones = notes.filter((n) => n.hasAttribute('data-chord-tone')).map((n) => n.textContent);
    expect(tones).toEqual(['D', 'F', 'A', 'C']);
  });

  it('lights scale tones and brighter chord tones on the keyboard', () => {
    const { container } = render(<ScaleHelper chord={DM7} keyContext={C_MAJOR} />);
    const piano = screen.getByRole('img', { name: /Scale keys: D dorian/ });
    expect(piano.querySelectorAll('[data-note]')).toHaveLength(25); // C3..C5
    for (const n of [50, 53, 57, 60, 62, 65, 69, 72]) expect(keyState(container, n)).toBe('chord');
    for (const n of [52, 55, 59, 64, 67, 71]) expect(keyState(container, n)).toBe('scale');
    for (const n of [49, 51, 54, 56, 58, 61]) expect(keyState(container, n)).toBe('off');
    expect(
      [...piano.querySelectorAll('[data-root]')].map((e) => e.getAttribute('data-root')),
    ).toEqual(['50', '62']);
  });

  it('remembers the choice per chord quality and re-ranks on chord change', () => {
    const { rerender } = render(<ScaleHelper chord={DM7} keyContext={C_MAJOR} />);
    fireEvent.click(screen.getByRole('radio', { name: 'D minor pentatonic' }));
    expect(screen.getByRole('radio', { name: 'D minor pentatonic' })).toHaveAttribute(
      'aria-checked',
      'true',
    );
    expect(screen.getByTestId('scale-notes')).toHaveTextContent('DFGAC');

    rerender(<ScaleHelper chord={G7} keyContext={C_MAJOR} />);
    expect(chips()[0]).toHaveTextContent('G mixolydian');
    expect(chips()[0]).toHaveAttribute('aria-checked', 'true');

    // another min7 chord picks up the remembered minor pentatonic
    rerender(<ScaleHelper chord={EM7} keyContext={C_MAJOR} />);
    expect(chips()[0]).toHaveTextContent('E phrygian');
    expect(screen.getByRole('radio', { name: 'E minor pentatonic' })).toHaveAttribute(
      'aria-checked',
      'true',
    );
  });

  it('keeps the last confident chord through low-confidence frames', () => {
    const { rerender } = render(<ScaleHelper chord={DM7} confidence={0.9} keyContext={C_MAJOR} />);
    rerender(<ScaleHelper chord={G7} confidence={0.1} keyContext={C_MAJOR} />);
    expect(chips()[0]).toHaveTextContent('D dorian');
    rerender(<ScaleHelper chord={null} confidence={0} keyContext={C_MAJOR} />);
    expect(screen.getByText('Play a chord to see scales that fit.')).toBeInTheDocument();
  });

  it('ranks without a key and follows spelling settings', () => {
    render(
      <ScaleHelper
        chord={{ root: 10, quality: 'maj7' }}
        keyContext={{ tonic: 5, mode: 'major' }}
        spellingFollowsKey={false}
      />,
    );
    expect(chips()[0]).toHaveTextContent('A♯ lydian');
    cleanup();
    render(<ScaleHelper chord={DM7} keyContext={null} />);
    expect(chips()[0]).toHaveTextContent('D dorian');
  });

  it('collapses to a toggle', () => {
    const onToggle = vi.fn();
    render(<ScaleHelper chord={DM7} keyContext={C_MAJOR} open={false} onToggle={onToggle} />);
    expect(screen.queryByRole('radiogroup')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Show' }));
    expect(onToggle).toHaveBeenCalledOnce();
  });
});

describe('Piano highlight props', () => {
  it('ranks detected notes over chord tones over scale tones', () => {
    const { container } = render(
      <Piano
        range={[60, 71]}
        highlightPitchClasses={[0, 2, 4, 5, 7, 9, 11]}
        accentPitchClasses={[0, 4, 7]}
        activePitchClasses={[4]}
        activeMidiNotes={[67]}
        rootPitchClass={0}
        ariaLabel="test keys"
      />,
    );
    expect(container.querySelectorAll('[data-note]')).toHaveLength(12);
    expect(keyState(container, 67)).toBe('exact');
    expect(keyState(container, 64)).toBe('pc');
    expect(keyState(container, 60)).toBe('chord');
    expect(keyState(container, 62)).toBe('scale');
    expect(keyState(container, 61)).toBe('off');
    expect(container.querySelectorAll('[data-root]')).toHaveLength(1);
    expect(screen.getByRole('img', { name: 'test keys' })).toBeInTheDocument();
  });
});
