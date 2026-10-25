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

  it('labels a preview and keeps provisional theory out of the readout', () => {
    render(
      <ChordDisplay
        chord={{ root: 2, quality: 'maj' }}
        confidence={0.8}
        tentative
        keyContext={C_MAJOR}
      />,
    );
    expect(screen.getByText('Tentative chord')).toBeInTheDocument();
    expect(screen.getByTestId('chord-symbol')).toHaveAttribute('aria-live', 'off');
    expect(screen.queryByTestId('chord-numeral')).toBeNull();
    expect(screen.queryByText('bass')).toBeNull();
  });

  it('updates focused symbols immediately and retains cancellable detailed animation', () => {
    const descriptor = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'animate');
    const cancel = vi.fn();
    const animate = vi.fn(() => ({ cancel }));
    Object.defineProperty(HTMLElement.prototype, 'animate', { configurable: true, value: animate });
    try {
      const { rerender } = render(
        <ChordDisplay details={false} chord={{ root: 0, quality: 'maj' }} confidence={0.9} />,
      );
      rerender(
        <ChordDisplay details={false} chord={{ root: 7, quality: 'maj' }} confidence={0.9} />,
      );
      expect(screen.getByTestId('chord-symbol')).toHaveTextContent('G');
      expect(animate).not.toHaveBeenCalled();
      rerender(<ChordDisplay chord={{ root: 2, quality: 'min' }} confidence={0.9} />);
      expect(animate).toHaveBeenCalledWith(
        expect.any(Array),
        expect.objectContaining({ duration: 180 }),
      );
      rerender(
        <ChordDisplay details={false} chord={{ root: 5, quality: 'maj' }} confidence={0.9} />,
      );
      expect(cancel).toHaveBeenCalledOnce();
      expect(animate).toHaveBeenCalledOnce();
      expect(screen.getByTestId('chord-symbol')).toHaveTextContent('F');
    } finally {
      if (descriptor) Object.defineProperty(HTMLElement.prototype, 'animate', descriptor);
      else Reflect.deleteProperty(HTMLElement.prototype, 'animate');
    }
  });

  it('reserves the same focused context slot for tentative, numeral and unknown key states', () => {
    const { rerender } = render(
      <ChordDisplay details={false} chord={{ root: 0, quality: 'maj' }} confidence={0.9} />,
    );
    const slot = screen.getByTestId('chord-context-slot');
    expect(slot).toHaveClass('h-7');
    expect(slot).toHaveAttribute('aria-hidden', 'true');
    rerender(
      <ChordDisplay
        details={false}
        chord={{ root: 0, quality: 'maj' }}
        confidence={0.9}
        tentative
        keyContext={C_MAJOR}
      />,
    );
    expect(screen.getByTestId('chord-context-slot')).toBe(slot);
    expect(within(slot).getByText('Tentative chord')).toBeInTheDocument();
    expect(screen.queryByTestId('chord-numeral')).toBeNull();
    rerender(
      <ChordDisplay
        details={false}
        chord={{ root: 0, quality: 'maj' }}
        confidence={0.9}
        keyContext={C_MAJOR}
      />,
    );
    expect(screen.getByTestId('chord-context-slot')).toBe(slot);
    expect(within(slot).getByTestId('chord-numeral')).toHaveTextContent('I');
    expect(screen.queryByText('Tentative chord')).toBeNull();
    expect(slot).toHaveClass('h-7');
    rerender(<ChordDisplay details={false} chord={null} confidence={0} />);
    expect(screen.getByTestId('chord-context-slot')).toBe(slot);
    expect(slot).toHaveAttribute('aria-hidden', 'true');
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

  it('draws key chips and section flags as the same pill', () => {
    const markers: Marker[] = [{ id: 'm1', sessionId: 's', t: 1.5, kind: 'verse' }];
    render(
      <Timeline
        timeline={[rec(0, 0, C), rec(1, 2, G)]}
        keyHistory={[{ t: 0, key: C_MAJOR }]}
        markers={markers}
      />,
    );
    const key = screen.getByTestId('timeline-key');
    const flag = screen.getByTestId('timeline-marker');
    for (const cls of ['h-7', 'rounded-full', 'text-footnote']) {
      expect(key).toHaveClass(cls);
      expect(flag).toHaveClass(cls);
    }
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
    expect(container.querySelector('[data-note="60"]')).toHaveClass('fill-[#f4f4f5]');
    expect(container.querySelector('[data-note-accent="60"]')).toHaveClass('fill-accent');
    expect(container.querySelector('[data-note-accent="60"]')).toHaveAttribute('fill-opacity', '1');
  });

  it('outlines tentative observed notes in their exact octaves and clears them on release', () => {
    const { container, rerender } = render(
      <Piano activeMidiNotes={[60]} tentativeMidiNotes={[60, 61, 64]} />,
    );
    const state = (n: number) =>
      container.querySelector(`[data-note="${n}"]`)?.getAttribute('data-state');
    expect(state(60)).toBe('exact');
    expect(state(61)).toBe('tentative');
    expect(state(64)).toBe('tentative');
    expect(state(49)).toBe('off');
    expect(state(76)).toBe('off');
    expect(container.querySelector('[data-note="61"]')).toHaveClass('fill-[#111113]');
    expect(container.querySelector('[data-note-accent="61"]')).toHaveClass('stroke-accent');
    expect(container.querySelector('[data-note-accent="61"]')).toHaveAttribute(
      'stroke-dasharray',
      '4 3',
    );
    expect(container.querySelector('[data-note-accent="61"]')).toHaveAttribute(
      'fill-opacity',
      '0.35',
    );
    expect(screen.getByRole('img')).toHaveAccessibleName('Piano, confirmed C4; tentative C#4, E4');
    rerender(<Piano />);
    expect(state(61)).toBe('off');
    expect(screen.getByRole('img')).toHaveAccessibleName('Piano, no notes');
  });

  it('layers confidence tint over opaque white and black keys and updates unchanged note sets', () => {
    const { container, rerender } = render(
      <Piano activeMidiNotes={[60, 61]} noteConfidences={{ 60: 0.25, 61: 0.75 }} />,
    );
    const tint = (note: number) => container.querySelector(`[data-note-accent="${note}"]`);
    for (const note of [60, 61]) {
      const base = container.querySelector(`[data-note="${note}"]`)!;
      expect(base).not.toHaveAttribute('opacity');
      expect(base).not.toHaveAttribute('fill-opacity');
      expect(base.nextElementSibling).toBe(tint(note));
    }
    expect(container.querySelector('[data-note="60"]')).toHaveClass('fill-[#f4f4f5]');
    expect(container.querySelector('[data-note="61"]')).toHaveClass('fill-[#111113]');
    expect(tint(60)).toHaveAttribute('fill-opacity', '0.25');
    expect(tint(61)).toHaveAttribute('fill-opacity', '0.75');
    rerender(<Piano activeMidiNotes={[60, 61]} noteConfidences={{ 60: 0.9, 61: 0.4 }} />);
    expect(tint(60)).toHaveAttribute('fill-opacity', '0.9');
    expect(tint(61)).toHaveAttribute('fill-opacity', '0.4');
  });

  it('keeps MIDI and legacy exact notes fully filled without evidence scores', () => {
    const { container } = render(
      <Piano activeMidiNotes={[60, 61]} tentativeMidiNotes={[60, 61]} />,
    );
    for (const note of [60, 61]) {
      expect(container.querySelector(`[data-note="${note}"]`)).toHaveAttribute(
        'data-state',
        'exact',
      );
      expect(container.querySelectorAll(`[data-note-accent="${note}"]`)).toHaveLength(1);
      expect(container.querySelector(`[data-note-accent="${note}"]`)).toHaveAttribute(
        'fill-opacity',
        '1',
      );
      expect(container.querySelector(`[data-note-accent="${note}"]`)).not.toHaveAttribute(
        'stroke-dasharray',
      );
    }
    expect(screen.getByRole('img')).toHaveAccessibleName('Piano, confirmed C4, C#4');
  });

  it('clamps finite scores and safely defaults nonfinite evidence', () => {
    const { container } = render(
      <Piano
        activeMidiNotes={[60, 61, 62]}
        tentativeMidiNotes={[63, 64, 65]}
        noteConfidences={{ 60: -2, 61: 2, 62: NaN, 63: Infinity, 64: -Infinity, 65: 0 }}
      />,
    );
    for (const [note, opacity] of [
      [60, 0],
      [61, 1],
      [62, 1],
      [63, 0.35],
      [64, 0.35],
      [65, 0],
    ]) {
      expect(container.querySelector(`[data-note-accent="${note}"]`)).toHaveAttribute(
        'fill-opacity',
        String(opacity),
      );
    }
  });

  it('keeps scale and voicing fills independent of observed-note confidence', () => {
    const { container } = render(
      <Piano
        range={[60, 71]}
        highlightPitchClasses={[0, 1]}
        leftHandNotes={[64]}
        rightHandNotes={[67]}
        noteConfidences={{ 60: 0, 61: 0, 64: 0, 67: 0 }}
      />,
    );
    expect(container.querySelector('[data-note="60"]')).toHaveClass('fill-accent/22');
    expect(container.querySelector('[data-note="61"]')).toHaveClass('fill-accent/45');
    expect(container.querySelector('[data-note="64"]')).toHaveClass('fill-sky-400');
    expect(container.querySelector('[data-note="67"]')).toHaveClass('fill-accent');
    expect(container.querySelectorAll('[data-note-accent]')).toHaveLength(0);
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
    fireEvent.click(screen.getByRole('button', { name: /Key C major. Strong evidence/ }));
    const pop = screen.getByRole('dialog', { name: 'Key alternatives' });
    expect(within(pop).getByText('G major')).toBeInTheDocument();
    expect(within(pop).getByText('Strong evidence')).toBeInTheDocument();
    expect(pop).not.toHaveTextContent('%');
  });

  it('shows the key as a large tappable line in the jam view', () => {
    render(<KeyBadge primaryOnly keyEstimate={C_MAJOR_KEY} />);
    const key = screen.getByRole('button', { name: /Key C major/ });
    expect(key).toHaveTextContent(/^Key\s*C major$/);
    expect(key).toHaveClass('text-title-2', 'sm:text-title-1');
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

  it('shows a plain toast as status text that taps pass through, then hides it', () => {
    vi.useFakeTimers();
    render(<Toaster />);
    act(() => void toast('Chorus at 0:24', { durationMs: 1600 }));
    const text = screen.getByText('Chorus at 0:24');
    expect(text.tagName).toBe('P');
    expect(text).toHaveClass('pointer-events-none');
    expect(screen.queryByRole('button')).toBeNull();
    act(() => void vi.advanceTimersByTime(1700));
    expect(screen.queryByText('Chorus at 0:24')).toBeNull();
    vi.useRealTimers();
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
