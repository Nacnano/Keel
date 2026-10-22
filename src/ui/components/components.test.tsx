import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { C_MAJOR_KEY } from '@/core/mocks';
import type { Chord, ChordRecord, Key, Marker } from '@/core';
import { Button } from './Button';
import { ChordDisplay } from './ChordDisplay';
import { Select } from './Select';
import { Switch } from './Switch';
import { KeyBadge } from './KeyBadge';
import { Piano } from './Piano';
import { Timeline } from './Timeline';
import { TryNext } from './TryNext';
import { Toaster } from './Toast';
import { toast, useToastStore } from './toastStore';

afterEach(cleanup);

const C_MAJOR: Key = { tonic: 0, mode: 'major' };
const A_MINOR: Key = { tonic: 9, mode: 'minor' };

describe('ChordDisplay', () => {
  it('shows a dash when there is no chord', () => {
    render(<ChordDisplay chord={null} confidence={0} hint="Tap Start" />);
    expect(screen.getByTestId('chord-symbol')).toHaveTextContent('—');
    expect(screen.getByText('Tap Start')).toBeInTheDocument();
  });

  it('shows a dash when confidence is below MIN_DISPLAY_CONFIDENCE', () => {
    render(<ChordDisplay chord={{ root: 0, quality: 'maj7' }} confidence={0.2} />);
    expect(screen.getByTestId('chord-symbol')).toHaveTextContent('—');
    expect(screen.getByTestId('chord-symbol')).not.toHaveTextContent('Cmaj7');
  });

  it('shows the symbol, numeral, tones and bass for a confident chord', () => {
    render(
      <ChordDisplay
        chord={{ root: 0, quality: 'maj7', bass: 4 }}
        confidence={0.9}
        keyContext={C_MAJOR}
      />,
    );
    const sym = screen.getByTestId('chord-symbol');
    expect(sym).toHaveTextContent('Cmaj7/E');
    expect(sym).toHaveAttribute('aria-live', 'polite');
    expect(screen.getByTestId('chord-numeral')).toHaveTextContent('Imaj7');
    expect(screen.getByText('bass')).toHaveTextContent('bass E');
  });
});

const rec = (i: number, t: number, chord: Chord): ChordRecord => ({
  id: `r${i}`,
  sessionId: 's',
  t,
  chord,
  confidence: 0.9,
  source: 'mic',
  manual: false,
});

const G: Chord = { root: 7, quality: 'maj' };
const D: Chord = { root: 2, quality: 'maj' };
const EM: Chord = { root: 4, quality: 'min' };
const C: Chord = { root: 0, quality: 'maj' };
const AM: Chord = { root: 9, quality: 'min' };

describe('Timeline', () => {
  it('renders compressed repeats and key-change markers', () => {
    const cycle = [G, D, EM, C];
    const timeline: ChordRecord[] = [];
    for (let r = 0; r < 4; r++)
      cycle.forEach((c) => timeline.push(rec(timeline.length, timeline.length, c)));
    timeline.push(rec(100, 20, AM));
    const keyHistory = [
      { t: 0, key: { tonic: 7, mode: 'major' } as Key },
      { t: 19, key: A_MINOR },
    ];
    const onAudition = vi.fn();
    render(<Timeline timeline={timeline} keyHistory={keyHistory} onAudition={onAudition} />);

    const repeat = screen.getByTestId('timeline-repeat');
    expect(repeat).toHaveTextContent('×4');
    const chips = within(repeat).getAllByTestId('timeline-chord');
    expect(chips.map((c) => c.textContent)).toEqual(['GI', 'DV', 'Emvi', 'CIV']);

    const keys = screen.getAllByTestId('timeline-key');
    expect(keys[0]).toHaveTextContent('G major');
    expect(keys[1]).toHaveTextContent('→ A minor');

    const all = screen.getAllByTestId('timeline-chord');
    expect(all).toHaveLength(5);
    expect(all[4]).toHaveAttribute('aria-current', 'true');
    fireEvent.click(all[4]);
    expect(onAudition).toHaveBeenCalledWith(AM);
  });

  it('renders markers as pins and an empty state', () => {
    const markers: Marker[] = [{ id: 'm1', sessionId: 's', t: 1.5, kind: 'chorus' }];
    const { rerender } = render(<Timeline timeline={[]} />);
    expect(screen.getByText(/will appear here/)).toBeInTheDocument();
    rerender(<Timeline timeline={[rec(0, 0, C), rec(1, 2, G)]} markers={markers} />);
    expect(screen.getByTestId('timeline-marker')).toHaveTextContent('Chorus');
  });
});

describe('Piano', () => {
  it('lights exact MIDI notes brightly and pitch classes dimly in every octave', () => {
    const { container } = render(
      <Piano keys={88} activePitchClasses={[0, 4, 7]} activeMidiNotes={[60, 64]} />,
    );
    const keys = container.querySelectorAll('[data-note]');
    expect(keys).toHaveLength(88);
    const state = (n: number) =>
      container.querySelector(`[data-note="${n}"]`)?.getAttribute('data-state');
    expect(state(60)).toBe('exact');
    expect(state(64)).toBe('exact');
    expect(state(67)).toBe('pc');
    expect(state(48)).toBe('pc');
    expect(state(108)).toBe('pc'); // C8
    expect(state(62)).toBe('off');
    expect(container.querySelector('[data-note="60"]')).toHaveClass('fill-accent');
  });

  it('supports a 61-key range', () => {
    const { container } = render(<Piano keys={61} />);
    expect(container.querySelectorAll('[data-note]')).toHaveLength(61);
    expect(container.querySelector('[data-note="36"]')).toBeInTheDocument();
    expect(container.querySelector('[data-note="21"]')).toBeNull();
  });

  it('colours left- and right-hand notes over a custom range', () => {
    const { container } = render(
      <Piano
        range={[36, 71]}
        leftHandNotes={[36, 43]}
        rightHandNotes={[64, 67]}
        ariaLabel="Voicing"
      />,
    );
    expect(container.querySelectorAll('[data-note]')).toHaveLength(36);
    const state = (n: number) =>
      container.querySelector(`[data-note="${n}"]`)?.getAttribute('data-state');
    expect(state(36)).toBe('left');
    expect(state(43)).toBe('left');
    expect(state(64)).toBe('right');
    expect(state(60)).toBe('off');
    expect(container.querySelector('[data-note="36"]')).toHaveClass('fill-sky-400');
    expect(screen.getByRole('img', { name: 'Voicing' })).toBeInTheDocument();
  });
});

describe('KeyBadge', () => {
  it('bolds the winner and opens alternatives', () => {
    render(<KeyBadge keyEstimate={C_MAJOR_KEY} />);
    expect(screen.getByText('C major')).toHaveClass('font-semibold');
    expect(screen.getByText('A minor')).not.toHaveClass('font-semibold');
    fireEvent.click(screen.getByRole('button', { name: /Key C major, 82%/ }));
    const pop = screen.getByRole('dialog', { name: 'Key alternatives' });
    expect(within(pop).getByText('G major')).toBeInTheDocument();
  });
});

describe('TryNext', () => {
  it('renders chips with reasons and auditions on tap', () => {
    const onAudition = vi.fn();
    render(
      <TryNext
        keyContext={C_MAJOR}
        suggestions={[{ chord: { root: 7, quality: 'maj' }, reason: 'Dominant, pulls home' }]}
        onAudition={onAudition}
      />,
    );
    const btn = screen.getByRole('button', { description: 'Dominant, pulls home' });
    expect(btn).toHaveTextContent('GV');
    fireEvent.click(btn);
    expect(onAudition).toHaveBeenCalledWith({ root: 7, quality: 'maj' });
  });
});

describe('Toaster', () => {
  afterEach(() => useToastStore.setState({ toasts: [] }));

  it('dismisses a plain toast on tap', () => {
    render(<Toaster />);
    act(() => void toast('Saved', { durationMs: 0 }));
    fireEvent.click(screen.getByRole('button', { name: 'Saved' }));
    expect(screen.queryByText('Saved')).toBeNull();
  });

  it('runs the action and dismisses the toast', () => {
    const onClick = vi.fn();
    render(<Toaster />);
    act(() => void toast('Saved “Jam”', { durationMs: 0, action: { label: 'Open', onClick } }));
    fireEvent.click(screen.getByRole('button', { name: 'Open' }));
    expect(onClick).toHaveBeenCalledTimes(1);
    expect(screen.queryByText('Saved “Jam”')).toBeNull();
  });
});

describe('legacy primitives on the kit', () => {
  it('maps Button variants and sizes to the kit', () => {
    render(
      <>
        <Button variant="primary">Save</Button>
        <Button variant="danger">Delete</Button>
        <Button variant="ghost" size="icon" aria-label="Close" />
        <Button pressed>Loop</Button>
      </>,
    );
    expect(screen.getByRole('button', { name: 'Save' })).toHaveClass('bg-action');
    expect(screen.getByRole('button', { name: 'Delete' })).toHaveClass('text-live');
    expect(screen.getByRole('button', { name: 'Close' })).toHaveClass('size-11');
    expect(screen.getByRole('button', { name: 'Loop' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('labels Select and Switch rows', () => {
    const onSelect = vi.fn();
    const onSwitch = vi.fn();
    render(
      <>
        <Select
          label="Theme"
          hint="Dark first"
          value="dark"
          options={[
            { value: 'dark', label: 'Dark' },
            { value: 'light', label: 'Light' },
          ]}
          onChange={onSelect}
        />
        <Switch label="Slash chords" description="C/E" checked={false} onChange={onSwitch} />
      </>,
    );
    const select = screen.getByLabelText('Theme');
    expect(select).toHaveAccessibleDescription('Dark first');
    fireEvent.change(select, { target: { value: 'light' } });
    expect(onSelect).toHaveBeenCalledWith('light');
    fireEvent.click(screen.getByRole('switch', { name: 'Slash chords' }));
    expect(onSwitch).toHaveBeenCalledWith(true);
  });
});
