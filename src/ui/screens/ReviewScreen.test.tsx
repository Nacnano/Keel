import { resetDb } from '@/data/testing/setup';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { mockChordRecords, mockKeyRecords, mockMarkers, mockSession } from '@/core/mocks';
import type { MidiEvent } from '@/core';
import { db } from '@/data';
import { settingsStore } from '@/state/settingsStore';
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
  it('renders a seeded session: header, lanes, summary and transport', async () => {
    await seed({ midi: true });
    renderAt(`/review/${ID}`);
    expect(screen.getByRole('status')).toHaveTextContent('Loading session');
    expect(await screen.findByDisplayValue('Evening idea in C')).toBeInTheDocument();
    expect(screen.getByTestId('review-keys')).toHaveTextContent('C major');
    expect(screen.getAllByTestId('lane-chord').length).toBeGreaterThan(3);
    expect(screen.getAllByTestId('lane-chord')[0]).toHaveAccessibleName('C, I at 0:00');
    expect(screen.getAllByTestId('key-segment')[0]).toHaveTextContent('C major');
    expect(screen.getByTestId('playhead-chord')).toHaveTextContent('C');
    expect(screen.getByRole('img', { name: /Piano roll, 1 notes/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Play' })).toBeInTheDocument();
    expect(screen.getByRole('slider', { name: 'Seek' })).toBeInTheDocument();
    expect(screen.getByRole('radiogroup', { name: 'Playback speed' })).toBeInTheDocument();
    expect(screen.getByRole('switch', { name: 'Piano sound' })).toBeChecked();
    expect(screen.getByTestId('clock-source')).toHaveTextContent('Piano playback');
    expect(screen.getAllByTestId('summary-progression')[0]).toHaveTextContent('vi');
  });

  it('clicking a chord seeks the playhead', async () => {
    await seed();
    renderAt(`/review/${ID}`);
    const chips = await screen.findAllByTestId('lane-chord');
    fireEvent.click(chips[2]); // Am at 3.0 s
    expect(screen.getByTestId('playhead-chord')).toHaveTextContent('Am');
    expect(screen.getByRole('slider', { name: 'Seek' })).toHaveValue('3');
  });

  it('fixing a chord with the picker persists it with manual = true', async () => {
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
    await screen.findAllByTestId('lane-chord');
    fireEvent.change(screen.getByLabelText('Add section marker at playhead'), {
      target: { value: 'chorus' },
    });
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
    expect(screen.getByRole('button', { name: 'Top 1 ×12' })).toHaveAttribute(
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
