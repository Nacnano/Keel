import { resetDb } from '@/data/testing/setup';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import {
  C_MAJOR_KEY,
  mockChordRecords,
  mockKeyRecords,
  mockMarkers,
  mockSession,
} from '@/core/mocks';
import type { MidiEvent } from '@/core';
import { db } from '@/data';
import { settingsStore } from '@/state/settingsStore';
import { useToastStore } from '../components/toastStore';
import { ReviewScreen } from './ReviewScreen';

const ID = 'review-test-1';

async function seed(opts: { midi?: boolean } = {}) {
  await db.sessions.put(mockSession({ id: ID, durationSec: 72, hasMidi: !!opts.midi }));
  await db.chords.bulkPut(mockChordRecords(ID));
  await db.keys.bulkPut(mockKeyRecords(ID));
  await db.markers.bulkPut(mockMarkers(ID));
  if (opts.midi) {
    const events: MidiEvent[] = [
      { t: 0, type: 'on', note: 60, velocity: 90, channel: 0 },
      { t: 1, type: 'off', note: 60, velocity: 0, channel: 0 },
    ];
    await db.midiTracks.put({ sessionId: ID, events });
  }
}

const markerLane = () => within(screen.getByRole('group', { name: /^Markers/ }));
/** The lanes sit behind the Timeline disclosure, closed on a compact screen (and in jsdom). */
const openTimeline = async () => {
  const toggle = await screen.findByRole('button', { name: /^Timeline/ });
  expect(toggle).toHaveAttribute('aria-expanded', 'false');
  fireEvent.click(toggle);
  expect(toggle).toHaveAttribute('aria-expanded', 'true');
};

const renderAt = (path: string) =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/review/:id" element={<ReviewScreen />} />
        <Route path="/library" element={<p>Library</p>} />
      </Routes>
    </MemoryRouter>,
  );

beforeEach(async () => {
  await resetDb();
  localStorage.clear();
  settingsStore.getState().resetSettings();
  // jsdom has no canvas; the roll must cope with a null context.
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('ReviewScreen', () => {
  it('renders a seeded session: chart and transport up front, lanes behind Timeline', async () => {
    await seed({ midi: true });
    renderAt(`/review/${ID}`);
    expect(screen.getByRole('status')).toHaveTextContent('Loading session');
    expect(await screen.findByDisplayValue('Evening idea in C')).toBeInTheDocument();
    expect(screen.getByTestId('review-keys')).toHaveTextContent('C major');
    expect(screen.getByTestId('review-chart')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Play' })).toBeInTheDocument();
    expect(screen.getByRole('slider', { name: 'Seek' })).toBeInTheDocument();
    expect(screen.getByRole('radiogroup', { name: 'Playback speed' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Mark' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Share' })).toBeInTheDocument();
    // The studio tools wait behind the disclosure.
    expect(screen.queryByRole('switch', { name: 'Piano sound' })).toBeNull();
    expect(screen.queryByRole('group', { name: /^Chord lane/ })).toBeNull();

    await openTimeline();
    expect(screen.getAllByTestId('lane-chord').length).toBeGreaterThan(3);
    expect(screen.getAllByTestId('lane-chord')[0]).toHaveAccessibleName('C, I at 0:00');
    expect(screen.getAllByTestId('key-segment')[0]).toHaveTextContent('C major');
    expect(screen.getByRole('img', { name: /Piano roll, 1 notes/ })).toBeInTheDocument();
    expect(screen.getByRole('switch', { name: 'Piano sound' })).toBeChecked();
    // One label for the piano, no clock caption, no "Now" readout, no key percentages.
    expect(screen.queryByText('Piano playback')).toBeNull();
    expect(screen.queryByText('Now')).toBeNull();
    expect(screen.queryByText(/%/)).toBeNull();
    expect(screen.queryByText('Top progressions')).toBeNull();
  });

  it('draws the lane from the chart keys: no key wobble under ten seconds', async () => {
    await seed();
    // A B major guess for the first 5 s, then C major: the chart and the lane say C throughout.
    await db.keys.bulkPut([
      { id: `${ID}-k-0`, sessionId: ID, t: 0, key: { ...C_MAJOR_KEY, tonic: 11 } },
      { id: `${ID}-k-1`, sessionId: ID, t: 5, key: C_MAJOR_KEY },
    ]);
    renderAt(`/review/${ID}`);
    await openTimeline();
    expect(screen.getByTestId('review-keys')).toHaveTextContent(/^C major$/);
    expect(screen.getAllByTestId('key-segment').map((k) => k.textContent)).toEqual(['C major']);
    expect(screen.getAllByTestId('lane-chord')[0]).toHaveAccessibleName('C, I at 0:00');
  });

  it('leads with the chord chart and shares it as text (copy without a share sheet)', async () => {
    await seed();
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    renderAt(`/review/${ID}`);
    const chart = await screen.findByTestId('review-chart');
    expect(within(chart).getAllByTestId('chart-section')[0]).toHaveTextContent('Intro');
    expect(within(chart).getAllByTestId('chart-numeral')[0]).toHaveTextContent('I');
    fireEvent.click(screen.getByRole('button', { name: 'Share' }));
    await waitFor(() => expect(writeText).toHaveBeenCalledOnce());
    expect(writeText.mock.calls[0][0]).toMatch(
      /^Evening idea in C — .*\nKey: C major\n\n\[Intro\]\n/,
    );
    // The button says so itself; no toast lands on the title.
    expect(await screen.findByRole('button', { name: 'Copied' })).toBeInTheDocument();
    expect(useToastStore.getState().toasts).toEqual([]);

    // No cloud sync: More holds the downloads but no share link.
    fireEvent.click(screen.getByRole('button', { name: 'More' }));
    const items = screen.getAllByRole('menuitem').map((m) => m.textContent);
    expect(items).toContain('Download .txt');
    expect(items).toContain('Download JSON');
    expect(items).not.toContain('Share link…');
  });

  it('clicking a chord seeks the playhead', async () => {
    await seed();
    renderAt(`/review/${ID}`);
    await openTimeline();
    const chips = await screen.findAllByTestId('lane-chord');
    fireEvent.click(chips[2]); // Am at 3.0 s
    expect(screen.getAllByTestId('lane-chord')[2]).toHaveAttribute('aria-current', 'true');
    expect(screen.getByRole('slider', { name: 'Seek' })).toHaveValue('3');
  });

  it('fixing a chord with the picker persists it with manual = true', async () => {
    settingsStore.getState().update({ showSlashChords: true });
    await seed();
    renderAt(`/review/${ID}`);
    const chips = await screen.findAllByTestId('lane-chord');
    const id = chips[1].getAttribute('data-chord-id')!;
    fireEvent.contextMenu(chips[1]); // G at 1.5 s

    const dialog = await screen.findByRole('dialog', { name: 'Edit chord at 0:01.5' });
    const d = within(dialog);
    expect(d.getByTestId('picker-preview')).toHaveTextContent('G');
    fireEvent.click(d.getByRole('radio', { name: 'D' }));
    fireEvent.click(d.getByRole('radio', { name: 'min7' }));
    fireEvent.change(d.getByLabelText('Bass'), { target: { value: '5' } });
    expect(d.getByTestId('picker-preview')).toHaveTextContent('Dm7/F');
    expect(dialog).toHaveTextContent('ii7');
    fireEvent.click(d.getByRole('button', { name: 'Save chord' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    const saved = await db.chords.get(id);
    expect(saved).toMatchObject({ manual: true, chord: { root: 2, quality: 'min7', bass: 5 } });
    expect(screen.getAllByTestId('lane-chord')[1]).toHaveAccessibleName(
      'Dm7/F, ii7 at 0:01, edited',
    );
  });

  it('fixing a chord changes every chord of that root and quality by default', async () => {
    await seed();
    renderAt(`/review/${ID}`);
    const chips = await screen.findAllByTestId('lane-chord');
    const ams = (await db.chords.toArray()).filter((c) => c.chord?.root === 9).length;
    expect(ams).toBeGreaterThan(1);
    fireEvent.contextMenu(chips[2]); // Am at 3.0 s
    const dialog = await screen.findByRole('dialog', { name: /Edit chord at/ });
    const d = within(dialog);
    const all = d.getByRole('switch', { name: 'Change every Am in this session' });
    expect(all).toBeChecked();
    fireEvent.click(d.getByRole('radio', { name: 'maj' }));
    fireEvent.click(d.getByRole('button', { name: 'Save chord' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    const rows = await db.chords.toArray();
    expect(rows.filter((c) => c.chord?.root === 9 && c.chord.quality === 'maj')).toHaveLength(ams);
    expect(rows.filter((c) => c.chord?.root === 9 && c.chord.quality === 'min')).toHaveLength(0);
  });

  it('the picker can set "no chord" and filters qualities by level', async () => {
    await seed();
    renderAt(`/review/${ID}`);
    const chips = await screen.findAllByTestId('lane-chord');
    fireEvent.keyDown(chips[0], { key: 'e' });
    const d = within(await screen.findByRole('dialog'));
    // Session vocab level 2: sevenths yes, extensions no (until the level is raised).
    expect(d.queryByRole('radio', { name: 'maj7' })).not.toBeNull();
    expect(d.queryByRole('radio', { name: '13' })).toBeNull();
    fireEvent.click(d.getByRole('radio', { name: 'Everything: extensions and alterations' }));
    expect(d.getByRole('radio', { name: '13' })).toBeInTheDocument();
    fireEvent.click(d.getByRole('button', { name: 'No chord' }));
    fireEvent.click(d.getByRole('button', { name: 'Save chord' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    const saved = await db.chords.get(chips[0].getAttribute('data-chord-id')!);
    expect(saved).toMatchObject({ manual: true, chord: null });
  });

  it('B adds a bookmark at the playhead; the marker editor deletes it', async () => {
    await seed();
    renderAt(`/review/${ID}`);
    await openTimeline();
    await screen.findAllByTestId('lane-chord');
    expect(await db.markers.count()).toBe(3);

    act(() => {
      fireEvent.keyDown(window, { key: 'b' });
    });
    await waitFor(async () => expect(await db.markers.count()).toBe(4));
    const editor = await screen.findByTestId('marker-editor');
    expect(within(editor).getByLabelText('Marker type')).toHaveValue('bookmark');
    expect(markerLane().getAllByRole('button', { name: 'Bookmark at 0:00' })).toHaveLength(1);
    await waitFor(async () => expect((await db.sessions.get(ID))?.summary?.bookmarks).toBe(2));

    fireEvent.click(within(editor).getByRole('button', { name: 'Delete marker' }));
    await waitFor(async () => expect(await db.markers.count()).toBe(3));
    expect(screen.queryByTestId('marker-editor')).toBeNull();
    expect(markerLane().queryByRole('button', { name: 'Bookmark at 0:00' })).toBeNull();
  });

  it('adds a section marker from the toolbar and deletes a focused pin with Delete', async () => {
    await seed();
    renderAt(`/review/${ID}`);
    await openTimeline();
    await screen.findAllByTestId('lane-chord');
    fireEvent.click(screen.getByRole('button', { name: 'Mark' }));
    const menu = screen.getByRole('menu', { name: 'Mark' });
    expect(
      within(menu)
        .getAllByRole('menuitem')
        .map((m) => m.textContent),
    ).toEqual([
      'Bookmark',
      'Intro',
      'Verse',
      'Pre-chorus',
      'Chorus',
      'Bridge',
      'Outro',
      'New song',
    ]);
    fireEvent.click(within(menu).getByRole('menuitem', { name: 'Chorus' }));
    const pin = await markerLane().findByRole('button', { name: 'Chorus at 0:00' });
    await waitFor(async () => expect(await db.markers.count()).toBe(4));
    fireEvent.keyDown(pin, { key: 'Delete' });
    await waitFor(async () => expect(await db.markers.count()).toBe(3));
    expect(markerLane().queryByRole('button', { name: 'Chorus at 0:00' })).toBeNull();
  });

  it('renames and tags the session', async () => {
    await seed();
    renderAt(`/review/${ID}`);
    const name = await screen.findByDisplayValue('Evening idea in C');
    fireEvent.focus(name);
    fireEvent.change(name, { target: { value: 'Night groove' } });
    fireEvent.keyDown(name, { key: 'Enter' });
    fireEvent.blur(name);
    await waitFor(async () => expect((await db.sessions.get(ID))?.name).toBe('Night groove'));

    fireEvent.click(screen.getByRole('button', { name: /^Add (a )?tag$/ }));
    const tag = screen.getByLabelText('Add tag');
    fireEvent.change(tag, { target: { value: 'ballad' } });
    fireEvent.keyDown(tag, { key: 'Enter' });
    await waitFor(async () =>
      expect((await db.sessions.get(ID))?.tags).toEqual(['idea', 'ballad']),
    );
    fireEvent.click(await screen.findByRole('button', { name: 'Remove tag idea' }));
    await waitFor(async () => expect((await db.sessions.get(ID))?.tags).toEqual(['ballad']));
  });

  it('reharmonizes the top progression and the chords at the playhead', async () => {
    await seed();
    renderAt(`/review/${ID}`);
    await screen.findByDisplayValue('Evening idea in C');
    fireEvent.click(screen.getByRole('button', { name: /Reharmonize/ }));
    expect(screen.getByRole('button', { name: 'Loop 1 ×4' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(screen.getAllByTestId('reharm-alternative').length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole('button', { name: 'Use chords at playhead' }));
    expect(screen.getByRole('button', { name: 'From playhead' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(screen.getAllByTestId('reharm-alternative').length).toBeGreaterThan(0);
  });

  it('shows a not-found state for unknown ids', async () => {
    renderAt('/review/nope');
    expect(await screen.findByText('Session not found')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Back to library' })).toHaveAttribute(
      'href',
      '/library',
    );
  });
});
