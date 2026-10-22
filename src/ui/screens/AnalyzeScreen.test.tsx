import { resetDb } from '@/data/testing/setup';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useParams } from 'react-router';
import type { AnalysisEvent } from '@/core';
import { C_MAJOR_KEY, POP_PROGRESSION } from '@/core/mocks';
import { db } from '@/data';
import { settingsStore } from '@/state/settingsStore';
import { analyseSamplesToEvents, decodeFileToMono } from '@/audio/offline';
import { AnalyzeScreen } from './AnalyzeScreen';

vi.mock('@/audio/offline', () => ({
  decodeFileToMono: vi.fn(),
  analyseSamplesToEvents: vi.fn(),
}));

const decode = vi.mocked(decodeFileToMono);
const analyse = vi.mocked(analyseSamplesToEvents);

/** C G Am F twice, 2 s per chord, key C major. */
function events(): AnalysisEvent[] {
  const ev: AnalysisEvent[] = [{ type: 'key', t: 1.5, key: C_MAJOR_KEY }];
  for (let i = 0; i < 8; i++) {
    ev.push({
      type: 'chord',
      t: i * 2,
      chord: POP_PROGRESSION[i % 4],
      confidence: 0.9,
      source: 'mic',
    });
  }
  ev.push({ type: 'chord', t: 16, chord: null, confidence: 1, source: 'mic' });
  return ev.sort((a, b) => a.t - b.t);
}

const song = (name = 'Let It Be.mp3', type = 'audio/mpeg') => new File(['x'], name, { type });

function ReviewStub() {
  const { id } = useParams();
  return <p data-testid="review-stub">{id}</p>;
}

const renderScreen = () =>
  render(
    <MemoryRouter initialEntries={['/analyze']}>
      <Routes>
        <Route path="/analyze" element={<AnalyzeScreen />} />
        <Route path="/review/:id" element={<ReviewStub />} />
      </Routes>
    </MemoryRouter>,
  );

const drop = (file: File) =>
  fireEvent.change(screen.getByLabelText(/^Choose (an|another) audio file$/), {
    target: { files: [file] },
  });

beforeEach(async () => {
  await resetDb();
  localStorage.clear();
  settingsStore.getState().resetSettings();
  vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {});
  decode.mockReset().mockResolvedValue({
    samples: new Float32Array(16),
    sampleRate: 44100,
    durationSec: 17,
  });
  analyse.mockReset().mockImplementation(async (_s, _sr, opts) => {
    opts?.onProgress?.(0.5, 'analysing');
    return { events: events(), durationSec: 17, sampleRate: 44100 };
  });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('AnalyzeScreen', () => {
  it('shows the drop zone and options before a file is chosen', () => {
    renderScreen();
    expect(screen.getByRole('heading', { level: 1, name: 'Analyze a file' })).toBeInTheDocument();
    expect(screen.getByTestId('drop-zone')).toHaveTextContent('Drop an audio file here');
    expect(screen.getByLabelText('Choose an audio file')).toHaveAttribute(
      'accept',
      expect.stringContaining('audio/*'),
    );
    expect(screen.getByRole('radiogroup', { name: 'Chord detail' })).toBeInTheDocument();
    expect(screen.getByRole('radiogroup', { name: 'Listening mode' })).toBeInTheDocument();
    expect(screen.queryByTestId('analyze-result')).not.toBeInTheDocument();
  });

  it('analyses a dropped file and shows key, compressed chart with numerals and a player', async () => {
    renderScreen();
    drop(song());
    const result = await screen.findByTestId('analyze-result');
    expect(decode).toHaveBeenCalledTimes(1);
    expect(analyse).toHaveBeenCalledWith(
      expect.any(Float32Array),
      44100,
      expect.objectContaining({ vocabLevel: 2, mode: 'room', instrument: 'piano' }),
    );

    const cells = within(result).getAllByTestId('chart-chord');
    expect(cells.map((c) => c.textContent)).toEqual(['CI', 'GV', 'Amvi', 'FIV']);
    expect(cells[0]).toHaveAccessibleName('C, I at 0:00');
    expect(cells[0]).toHaveAttribute('aria-current', 'true'); // playhead at 0
    expect(within(result).getByTestId('chart-segment')).toHaveTextContent('×2');
    expect(within(result).getByText('Key C major')).toBeInTheDocument();
    expect(within(result).getAllByTestId('key-span')[0]).toHaveTextContent('C major0:00–0:17');
    expect(screen.getByRole('button', { name: /Key C major/ })).toBeInTheDocument();
    expect(screen.getByTestId('analyze-now')).toHaveTextContent('C');
    expect(screen.getByLabelText('Play Let It Be.mp3')).toBeInTheDocument();
    expect(screen.getByLabelText('Name')).toHaveValue('Let It Be');

    // Clicking a chord seeks the player; the chart follows.
    fireEvent.click(cells[2]);
    expect(screen.getByTestId('analyze-now')).toHaveTextContent('Am');
    expect(within(result).getAllByTestId('chart-chord')[2]).toHaveAttribute('aria-current', 'true');

    // The seek slider in the transport row moves the playhead too.
    fireEvent.change(screen.getByRole('slider', { name: 'Seek' }), { target: { value: '3' } });
    expect(screen.getByTestId('analyze-now')).toHaveTextContent('G');
  });

  it('re-analyses (without decoding again) when the vocabulary level changes', async () => {
    renderScreen();
    drop(song());
    await screen.findByTestId('analyze-result');
    fireEvent.click(screen.getByRole('radio', { name: 'Jazz' }));
    await waitFor(() =>
      expect(analyse).toHaveBeenLastCalledWith(
        expect.any(Float32Array),
        44100,
        expect.objectContaining({ vocabLevel: 3 }),
      ),
    );
    await screen.findByTestId('analyze-result');
    expect(decode).toHaveBeenCalledTimes(1);
  });

  it('shows progress with the stage while working', async () => {
    let finish: () => void = () => {};
    analyse.mockImplementation(
      (_s, _sr, opts) =>
        new Promise((resolve) => {
          opts?.onProgress?.(0.4, 'analysing');
          finish = () => resolve({ events: events(), durationSec: 17, sampleRate: 44100 });
        }),
    );
    renderScreen();
    drop(song());
    expect(await screen.findByRole('progressbar', { name: 'Analysing progress' })).toHaveAttribute(
      'aria-valuenow',
      '40',
    );
    expect(screen.getByRole('status')).toHaveTextContent('Analysing Let It Be.mp3 · 40%');
    await act(async () => finish());
    expect(await screen.findByTestId('analyze-result')).toBeInTheDocument();
  });

  it('rejects files that are not audio', async () => {
    renderScreen();
    drop(song('notes.txt', 'text/plain'));
    expect(await screen.findByRole('alert')).toHaveTextContent('That is not an audio file');
    expect(decode).not.toHaveBeenCalled();
  });

  it('reports a decode failure', async () => {
    decode.mockRejectedValueOnce(new Error('EncodingError: Unable to decode audio data.'));
    renderScreen();
    drop(song('broken.ogg', 'audio/ogg'));
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Could not decode broken.ogg');
    expect(alert).toHaveTextContent('Unable to decode audio data');
  });

  it('warns before decoding a file over 50 MB', async () => {
    renderScreen();
    const big = song('Live set.wav', 'audio/wav');
    Object.defineProperty(big, 'size', { value: 80 * 1024 * 1024 });
    drop(big);
    expect(await screen.findByRole('alert')).toHaveTextContent('Live set.wav is 80 MB');
    expect(decode).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Analyze anyway' }));
    expect(await screen.findByTestId('analyze-result')).toBeInTheDocument();
    expect(decode).toHaveBeenCalledTimes(1);
  });

  it('saves to the library and opens the review screen', async () => {
    renderScreen();
    drop(song());
    await screen.findByTestId('analyze-result');
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Let It Be (album)' } });
    fireEvent.click(screen.getByRole('switch', { name: 'Keep the audio in the library' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save to library' }));
    const id = (await screen.findByTestId('review-stub')).textContent!;
    const session = await db.sessions.get(id);
    expect(session).toMatchObject({
      name: 'Let It Be (album)',
      tags: ['analyzed'],
      durationSec: 17,
      hasAudio: false,
      mode: 'room',
      vocabLevel: 2,
    });
    expect(await db.chords.count()).toBe(9);
  });
});
