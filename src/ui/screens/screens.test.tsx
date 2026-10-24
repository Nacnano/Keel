import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { clock, DEFAULT_SETTINGS } from '@/core';
import { C_MAJOR_KEY } from '@/core/mocks';
import { initialJamData, jamStore } from '@/state/jamStore';
import { inputStore } from '@/state/inputStore';
import { settingsStore } from '@/state/settingsStore';
import { liveInput } from '@/app/live/liveInput';
import { JamScreen } from './JamScreen';
import { useToastStore } from '../components/toastStore';
import { stopDemo } from './jam/useMockInput';
import pkg from '../../../package.json';
import { SettingsScreen } from './SettingsScreen';
import { APP_VERSION } from './settings/about';

beforeEach(() => {
  localStorage.clear();
  jamStore.setState(initialJamData());
  settingsStore.getState().resetSettings();
  inputStore.setState({
    audioDevices: [],
    midiDevices: [],
    midiSupported: false,
    selectedAudioId: null,
    selectedMidiId: null,
  });
});

afterEach(() => {
  cleanup();
  stopDemo(); // the demo outlives the screen, like a live session
  window.history.replaceState({}, '', '/');
});

const renderJam = () =>
  render(
    <MemoryRouter initialEntries={[window.location.pathname + window.location.search]}>
      <JamScreen />
    </MemoryRouter>,
  );

describe('JamScreen', () => {
  it('waits for Start before requesting input devices or permissions', () => {
    const refresh = vi.spyOn(liveInput(), 'refreshDevices');
    renderJam();
    expect(refresh).not.toHaveBeenCalled();
    refresh.mockRestore();
  });

  it('labels demo playback and prevents changes to unavailable audio recording', () => {
    window.history.replaceState({}, '', '/?mock=1');
    renderJam();
    expect(screen.getByText('Demo')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Start demo' }));
    expect(screen.getByTestId('listen-status')).toHaveTextContent(/Demo.*Example progression/);
    fireEvent.click(screen.getByRole('button', { name: 'Listening options' }));
    expect(screen.getByRole('switch', { name: 'Record audio' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Stop demo' }));
    expect(screen.getByText('That’s the idea.')).toBeInTheDocument();
    expect(screen.queryByText('Your jam is saved.')).toBeNull();
  });

  it('starts a demo directly without requesting live input', () => {
    const start = vi.spyOn(liveInput(), 'start');
    renderJam();
    fireEvent.click(screen.getByRole('button', { name: 'Try a demo' }));
    expect(jamStore.getState().status).toBe('listening');
    expect(screen.getByTestId('chord-symbol')).toHaveTextContent('C');
    expect(start).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Stop demo' })).toBeEnabled();
    start.mockRestore();
  });

  it('puts sensitivity in Listening options without requesting permissions', () => {
    const refresh = vi.spyOn(liveInput(), 'refreshDevices');
    renderJam();
    fireEvent.click(screen.getByRole('button', { name: 'Listening options' }));
    const dialog = screen.getByRole('dialog', { name: 'Listening options' });
    fireEvent.change(within(dialog).getByRole('slider', { name: 'Microphone sensitivity' }), {
      target: { value: '0.85' },
    });
    expect(settingsStore.getState().sensitivity).toBe(0.85);
    expect(refresh).not.toHaveBeenCalled();
    refresh.mockRestore();
  });

  it('lets a player cancel connecting and returns to the start screen without a save claim', async () => {
    jamStore.getState().setStatus('starting');
    const stop = vi.spyOn(liveInput(), 'stop').mockImplementation(async () => {
      jamStore.getState().stopSession();
    });
    renderJam();
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeEnabled();
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Cancel' })));
    expect(stop).toHaveBeenCalledOnce();
    expect(screen.getByRole('button', { name: 'Start listening' })).toBeEnabled();
    expect(screen.queryByText('Your jam is saved.')).toBeNull();
    stop.mockRestore();
  });

  it('shows the saved session directly after Finish & save', async () => {
    const start = vi.spyOn(liveInput(), 'start').mockImplementation(async () => {
      jamStore.getState().startSession();
      jamStore.getState().setSource('mic');
    });
    const stop = vi.spyOn(liveInput(), 'stop').mockImplementation(async (options) => {
      jamStore.getState().stopSession();
      options?.onSaved?.({ id: 'new-session', name: 'Evening idea' });
    });
    renderJam();
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Start listening' })));
    expect(screen.getByRole('button', { name: 'Finish & save' })).toBeEnabled();
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Finish & save' })));
    expect(screen.getByText('Your jam is saved.')).toBeInTheDocument();
    expect(screen.getByText('“Evening idea” is in your Library.')).toBeInTheDocument();
    expect(stop).toHaveBeenCalledWith(
      expect.not.objectContaining({ openReview: expect.anything() }),
    );
    expect(screen.getByRole('link', { name: 'Open session' })).toHaveAttribute(
      'href',
      '/review/new-session',
    );
    expect(screen.getByRole('button', { name: 'Start a new jam' })).toBeEnabled();
    start.mockRestore();
    stop.mockRestore();
  });

  it('does not claim a session was saved after a storage error', async () => {
    const start = vi.spyOn(liveInput(), 'start').mockImplementation(async () => {
      jamStore.getState().startSession();
    });
    const stop = vi.spyOn(liveInput(), 'stop').mockImplementation(async (options) => {
      jamStore.getState().stopSession();
      options?.onSaveError?.('Storage is full.');
    });
    renderJam();
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Start listening' })));
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Finish & save' })));
    expect(screen.getByRole('alert')).toHaveTextContent('Storage is full.');
    expect(screen.queryByText('Your jam is saved.')).toBeNull();
    expect(screen.queryByRole('link', { name: 'Open session' })).toBeNull();
    start.mockRestore();
    stop.mockRestore();
  });

  it('shows the keyboard by default and remembers an explicit hide choice', () => {
    jamStore.setState({ status: 'listening', source: 'mic', sessionStart: clock.now() });
    renderJam();
    expect(screen.getByRole('img', { name: 'Piano, no notes' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Listening options' }));
    const showKeyboard = screen.getByRole('switch', { name: 'Show keyboard' });
    expect(showKeyboard).toBeChecked();
    fireEvent.click(showKeyboard);
    expect(localStorage.getItem('keel.ui.piano')).toBe('0');
    cleanup();
    renderJam();
    expect(screen.queryByRole('img', { name: /Piano/ })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Listening options' }));
    expect(screen.getByRole('switch', { name: 'Show keyboard' })).not.toBeChecked();
  });

  it('puts listening mode and instrument before sensitivity in Listening options', () => {
    renderJam();
    fireEvent.click(screen.getByRole('button', { name: 'Listening options' }));
    const options = within(screen.getByRole('dialog', { name: 'Listening options' }));
    const mode = options.getByRole('radiogroup', { name: 'Listen to' });
    const instrument = options.getByRole('radiogroup', { name: 'Instrument' });
    const sensitivity = options.getByRole('slider', { name: 'Microphone sensitivity' });
    expect(
      mode.compareDocumentPosition(instrument) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(
      instrument.compareDocumentPosition(sensitivity) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it('shows transient previews and exact heard notes without treating previews as theory', () => {
    localStorage.setItem('keel.ui.piano', '1');
    jamStore.setState({
      status: 'listening',
      source: 'mic',
      sessionStart: clock.now(),
      currentChord: { root: 0, quality: 'maj' },
      confidence: 0.9,
      key: C_MAJOR_KEY,
      activeMidiNotes: [60],
      tentativeMidiNotes: [66],
      activePitchClasses: [0, 4, 7],
      previewChord: { root: 2, quality: 'maj' },
      previewConfidence: 0.7,
      previewKey: { ...C_MAJOR_KEY, tonic: 7 },
    });
    const { container } = renderJam();
    expect(screen.queryByText('Tentative chord')).toBeNull();
    expect(screen.getByTestId('chord-symbol')).toHaveTextContent('C');
    expect(screen.getByTestId('chord-numeral')).toHaveTextContent('I');
    const candidate = screen.getByTestId('live-candidate');
    expect(candidate).toHaveTextContent('Tentative: D');
    expect(candidate).toHaveClass('h-6');
    expect(candidate).toHaveAttribute('aria-live', 'off');
    expect(screen.getByRole('button', { name: /^Key C major/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Tentative key G major/ })).toBeNull();
    const state = (n: number) =>
      container.querySelector(`[data-note="${n}"]`)?.getAttribute('data-state');
    expect(state(60)).toBe('exact');
    expect(state(66)).toBe('tentative');
    expect(state(48)).toBe('off');
    expect(state(64)).toBe('off');
    act(() =>
      jamStore.setState({
        activeMidiNotes: [],
        tentativeMidiNotes: [],
        previewChord: null,
        previewKey: null,
      }),
    );
    expect(state(60)).toBe('off');
    expect(state(66)).toBe('off');
    expect(screen.queryByText('Tentative chord')).toBeNull();
    expect(screen.getByTestId('chord-symbol')).toHaveTextContent('C');
    expect(screen.getByTestId('chord-numeral')).toHaveTextContent('I');
    expect(screen.getByTestId('live-candidate')).toBe(candidate);
    expect(candidate.textContent).toBe('');
    expect(candidate).toHaveAttribute('aria-hidden', 'true');
    expect(jamStore.getState().key).toEqual(C_MAJOR_KEY);
    expect(jamStore.getState().timeline).toHaveLength(0);
    act(() => jamStore.setState({ status: 'error', error: 'Microphone interrupted.' }));
    expect(screen.queryByTestId('chord-symbol')).toBeNull();
    expect(screen.queryByRole('img', { name: /Piano/ })).toBeNull();
    expect(screen.getByRole('alert')).toHaveTextContent('Microphone interrupted.');
  });

  it('keeps uncertainty distinct before confirmation and uses one candidate row afterward', () => {
    jamStore.setState({
      status: 'listening',
      source: 'mic',
      sessionStart: clock.now(),
      previewChord: { root: 2, quality: 'maj' },
      previewConfidence: 0.8,
      previewKey: { ...C_MAJOR_KEY, tonic: 7 },
    });
    renderJam();
    expect(screen.getByTestId('chord-symbol')).toHaveTextContent('D');
    expect(screen.getByTestId('chord-symbol')).toHaveAttribute('data-tentative', 'true');
    expect(screen.getByText('Tentative chord')).toBeInTheDocument();
    expect(screen.queryByTestId('chord-numeral')).toBeNull();
    expect(screen.getByRole('button', { name: /Tentative key G major/ })).toBeInTheDocument();
    const slot = screen.getByTestId('live-candidate');
    expect(slot).toHaveAttribute('aria-hidden', 'true');
    act(() =>
      jamStore.setState({
        currentChord: { root: 0, quality: 'maj' },
        confidence: 0.9,
        key: C_MAJOR_KEY,
      }),
    );
    expect(screen.getByTestId('chord-symbol')).toHaveTextContent('C');
    expect(screen.getByTestId('chord-symbol')).not.toHaveAttribute('data-tentative');
    expect(slot).toHaveTextContent('Tentative: D');
    expect(screen.getByRole('button', { name: /^Key C major/ })).toBeInTheDocument();
    act(() => jamStore.setState({ previewChord: null }));
    expect(slot).toHaveTextContent('Tentative key: G major');
    expect(screen.getByTestId('live-candidate')).toBe(slot);
    act(() => jamStore.setState({ quiet: true }));
    expect(screen.queryByTestId('chord-symbol')).toBeNull();
    expect(screen.queryByRole('button', { name: /^Key C major/ })).toBeNull();
    expect(slot.textContent).toBe('');
    expect(slot).toHaveAttribute('aria-hidden', 'true');
    act(() =>
      jamStore.setState({
        quiet: false,
        currentChord: null,
        confidence: 0,
        key: null,
        previewKey: null,
      }),
    );
    expect(screen.queryByTestId('chord-symbol')).toBeNull();
    expect(screen.getByText('Play a chord.')).toBeInTheDocument();
    expect(slot.textContent).toBe('');
  });

  it('shows a persistent input failure without stale notes or quiet-room advice, then recovers', () => {
    const issue = 'Microphone stopped. Finish & save, then start again.';
    jamStore.setState({
      status: 'listening',
      source: 'mic',
      sessionStart: clock.now(),
      currentChord: { root: 0, quality: 'maj' },
      confidence: 0.9,
      key: C_MAJOR_KEY,
      activeMidiNotes: [60],
      tentativeMidiNotes: [64],
      level: 0.6,
      recordAudio: true,
      previewChord: { root: 2, quality: 'min' },
      previewConfidence: 0.8,
      previewKey: { ...C_MAJOR_KEY, tonic: 7 },
      quiet: true,
      inputIssue: issue,
    });
    renderJam();
    expect(screen.getByTestId('listen-status')).toHaveTextContent('Input stopped');
    expect(screen.getByTestId('listen-status')).not.toHaveTextContent('Recording');
    expect(screen.getByRole('heading', { name: 'Input stopped' })).toBeInTheDocument();
    expect(screen.getByRole('meter', { name: 'Input level' })).toHaveAttribute(
      'aria-valuenow',
      '0',
    );
    expect(screen.getAllByText(issue)).toHaveLength(1);
    expect(screen.getByRole('status')).toHaveTextContent(issue);
    expect(screen.queryByText('Can’t hear much.')).toBeNull();
    expect(screen.queryByText(/raise sensitivity/)).toBeNull();
    expect(screen.queryByTestId('chord-symbol')).toBeNull();
    expect(screen.queryByRole('button', { name: /Key C major/ })).toBeNull();
    expect(screen.queryByRole('img', { name: /Piano/ })).toBeNull();
    expect(screen.getByTestId('live-candidate').textContent).toBe('');
    expect(screen.getByRole('button', { name: 'Finish & save' })).toBeEnabled();
    act(() => jamStore.setState({ inputIssue: null, quiet: false }));
    expect(screen.queryByText(issue)).toBeNull();
    expect(screen.getByTestId('listen-status')).toHaveTextContent('Recording');
    expect(screen.getByTestId('chord-symbol')).toHaveTextContent('C');
    expect(screen.getByRole('img', { name: /Piano/ })).toBeInTheDocument();
  });

  it('keeps MIDI live while showing one nonblocking microphone issue notice', () => {
    const issue = 'Audio processing stopped. Finish & save, then start again.';
    jamStore.setState({
      status: 'listening',
      source: 'midi',
      sessionStart: clock.now(),
      currentChord: { root: 0, quality: 'maj' },
      confidence: 1,
      key: C_MAJOR_KEY,
      activeMidiNotes: [60],
      quiet: true,
      inputIssue: issue,
    });
    renderJam();
    expect(screen.getByTestId('listen-status')).toHaveTextContent('Listening');
    expect(screen.getByTestId('listen-status')).not.toHaveTextContent('Input stopped');
    expect(screen.getByTestId('chord-symbol')).toHaveTextContent('C');
    expect(screen.getByRole('button', { name: /Key C major/ })).toBeInTheDocument();
    expect(screen.getByRole('img', { name: /confirmed C4/ })).toBeInTheDocument();
    expect(screen.getByRole('meter', { name: 'Input level' })).toHaveAttribute(
      'aria-valuenow',
      '0',
    );
    expect(screen.getAllByText(issue)).toHaveLength(1);
    expect(screen.getByRole('status')).toHaveTextContent(issue);
    expect(screen.getByRole('button', { name: 'Finish & save' })).toBeEnabled();
    act(() => jamStore.setState({ inputIssue: null, quiet: false }));
    expect(screen.queryByText(issue)).toBeNull();
    expect(screen.getByTestId('chord-symbol')).toHaveTextContent('C');
  });

  it('renders the idle layout', () => {
    renderJam();
    expect(screen.queryByRole('complementary', { name: 'Ideas' })).toBeNull();
    expect(screen.queryByTestId('chord-symbol')).toBeNull();
    expect(screen.getByText('See what you’re playing.')).toBeInTheDocument();
    expect(screen.queryByRole('list', { name: 'Chord timeline' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Start listening' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Try a demo' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Listening options' })).toBeInTheDocument();
    expect(screen.queryByRole('img', { name: /Piano/ })).toBeNull();
    // the whole idle screen stays under 25 words
    const words = screen.getByRole('main').textContent!.trim().split(/\s+/);
    expect(words.length).toBeLessThan(25);
  });

  it('chooses the listening mode right on the idle screen', () => {
    renderJam();
    const mode = screen.getByRole('radiogroup', { name: 'Listen to' });
    expect(
      within(mode).getByRole('radio', { name: 'My instrument', checked: true }),
    ).toBeInTheDocument();
    fireEvent.click(within(mode).getByRole('radio', { name: 'Overall harmony' }));
    expect(settingsStore.getState().mode).toBe('room');
  });

  it('keeps Listening options to listening and display choices', () => {
    window.history.replaceState({}, '', '/?mock=1');
    renderJam();
    act(() => fireEvent.click(screen.getByRole('button', { name: 'Start demo' })));
    fireEvent.click(screen.getByRole('button', { name: 'Listening options' }));
    const dialog = screen.getByRole('dialog', { name: 'Listening options' });
    expect(within(dialog).getByText('Quieter room')).toBeInTheDocument();
    expect(within(dialog).getByText('Soft playing')).toBeInTheDocument();
    expect(
      within(dialog).getByRole('radio', { name: 'Piano/keyboard', checked: true }),
    ).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole('radio', { name: 'Guitar' }));
    expect(settingsStore.getState().instrument).toBe('guitar');
    expect(within(dialog).getByRole('radio', { name: 'Overall harmony' })).toBeInTheDocument();
    expect(within(dialog).getByText(/Favors your selected instrument/)).toBeInTheDocument();
    expect(within(dialog).getByRole('radio', { name: 'Simple' })).toBeInTheDocument();
    expect(within(dialog).getByRole('radio', { name: 'With 7ths' })).toBeInTheDocument();
    expect(within(dialog).getByRole('radio', { name: 'Everything' })).toBeInTheDocument();
    expect(within(dialog).getByRole('switch', { name: 'Show keyboard' })).toBeInTheDocument();
    expect(within(dialog).queryByText('Clear timeline')).toBeNull();
    expect(within(dialog).queryByText('Chorus')).toBeNull();
  });

  it('marks a bookmark or a section from one Mark button', () => {
    window.history.replaceState({}, '', '/?mock=1');
    renderJam();
    act(() => fireEvent.click(screen.getByRole('button', { name: 'Start demo' })));
    expect(screen.queryByRole('button', { name: 'Bookmark' })).toBeNull();
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
    expect(screen.queryByRole('menu')).toBeNull();
    expect(jamStore.getState().markers.map((m) => m.kind)).toEqual(['chorus']);
    expect(screen.getByTestId('timeline-marker')).toHaveTextContent('Chorus');
    // the flag is the confirmation: no "Chorus at 0:00" toast
    expect(useToastStore.getState().toasts).toHaveLength(0);
    fireEvent.click(screen.getByRole('button', { name: 'Mark' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'New song' }));
    expect(jamStore.getState().markers.at(-1)).toMatchObject({ kind: 'custom', label: 'New song' });
  });

  it('hides the chord and key while the input is too quiet', () => {
    renderJam();
    act(() => {
      jamStore.getState().startSession(0);
      jamStore.setState({
        source: 'mic',
        currentChord: { root: 0, quality: 'maj' },
        confidence: 0.9,
      });
    });
    expect(screen.getByTestId('chord-symbol')).toBeInTheDocument();
    // the live input decides "too quiet" (and keeps those chords out of the timeline)
    act(() => jamStore.getState().setQuiet(true));
    expect(screen.queryByTestId('chord-symbol')).toBeNull();
    expect(screen.getByRole('status')).toHaveTextContent('Can’t hear much.');
    act(() => jamStore.getState().setQuiet(false));
    expect(screen.getByTestId('chord-symbol')).toBeInTheDocument();
  });

  it('shows "Finding the key…" and no numeral until a key arrives', () => {
    renderJam();
    act(() => {
      jamStore.getState().startSession(0);
      jamStore.getState().applyEvent({
        type: 'chord',
        t: 0.5,
        chord: { root: 0, quality: 'maj' },
        confidence: 0.9,
        source: 'mic',
      });
    });
    expect(screen.getByText('Finding the key…')).toBeInTheDocument();
    expect(screen.queryByTestId('chord-numeral')).toBeNull();
    act(() => jamStore.getState().applyEvent({ type: 'key', t: 3, key: C_MAJOR_KEY }));
    expect(screen.queryByText('Finding the key…')).toBeNull();
    expect(screen.getByTestId('chord-numeral')).toHaveTextContent('I');
    // the chord heard before the key is labelled in it too
    expect(screen.getByTestId('timeline-chord')).toHaveAccessibleName(/C, I\./);
  });

  it('snaps a mark to the start of the chord that is sounding', () => {
    renderJam();
    const now = clock.now();
    act(() => {
      jamStore.getState().startSession(now - 10);
      jamStore.getState().applyEvent({
        type: 'chord',
        t: now - 1.5,
        chord: { root: 7, quality: 'maj' },
        confidence: 0.9,
        source: 'mic',
      });
    });
    fireEvent.click(screen.getByRole('button', { name: 'Mark' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Chorus' }));
    expect(jamStore.getState().markers[0].t).toBeCloseTo(8.5, 1);
  });

  it('says Recording only while audio is kept', () => {
    renderJam();
    act(() => {
      jamStore.getState().startSession(0);
      jamStore.setState({ source: 'mic', recordAudio: false });
    });
    expect(screen.getByText('Listening')).toBeInTheDocument();
    expect(screen.queryByText('Recording')).toBeNull();
    act(() => jamStore.setState({ recordAudio: true }));
    expect(screen.getByText('Recording')).toBeInTheDocument();
  });

  it('shows the chord, a large key line and no match-strength text', () => {
    window.history.replaceState({}, '', '/?mock=1');
    renderJam();
    act(() => fireEvent.click(screen.getByRole('button', { name: 'Start demo' })));
    expect(screen.queryByText(/chord match/)).toBeNull();
    expect(screen.getByRole('button', { name: /^Key C major/ })).toHaveClass('text-title-2');
    act(() => jamStore.setState({ currentChord: { root: 7, quality: 'maj' }, confidence: 0.4 }));
    expect(screen.getByTestId('chord-symbol')).toHaveAttribute('data-tentative', 'true');
    act(() => jamStore.setState({ confidence: 0.9 }));
    expect(screen.getByTestId('chord-symbol')).not.toHaveAttribute('data-tentative');
  });

  it('R no longer clears the timeline', () => {
    window.history.replaceState({}, '', '/?mock=1');
    renderJam();
    act(() => fireEvent.click(screen.getByRole('button', { name: 'Start demo' })));
    expect(jamStore.getState().timeline).toHaveLength(1);
    act(() => void fireEvent.keyDown(window, { key: 'r' }));
    expect(jamStore.getState().timeline).toHaveLength(1);
  });

  it('keeps a running demo going when the screen unmounts, and resumes its controls', () => {
    renderJam();
    act(() => fireEvent.click(screen.getByRole('button', { name: 'Try a demo' })));
    cleanup();
    window.history.replaceState({}, '', '/');
    expect(jamStore.getState().status).toBe('listening');
    expect(jamStore.getState().demo).toBe(true);
    renderJam();
    expect(screen.getByRole('button', { name: 'Stop demo' })).toBeEnabled();
  });

  it('reports a clear error when no live input is available (jsdom has no mic)', async () => {
    renderJam();
    fireEvent.click(screen.getByRole('button', { name: /Start/ }));
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toMatch(/microphone|browser|input/i);
    expect(jamStore.getState().status).toBe('error');
  });

  it('runs the mock stream with ?mock=1 and stops with Space', () => {
    window.history.replaceState({}, '', '/?mock=1');
    renderJam();
    act(() => {
      fireEvent.click(screen.getByRole('button', { name: /Start/ }));
    });
    expect(jamStore.getState().status).toBe('listening');
    expect(screen.getByTestId('chord-symbol')).toHaveTextContent('C');
    expect(screen.getAllByTestId('timeline-chord')).toHaveLength(1);
    // the mock stream's key brings up modulation hints in the inspector
    act(() => {
      fireEvent.keyDown(window, { key: 'k' });
    });
    expect(screen.getAllByTestId('modulation-hint').length).toBeGreaterThan(0);
    act(() => {
      fireEvent.keyDown(window, { key: 'k' });
    });
    expect(screen.getByRole('button', { name: /Stop/ })).toBeInTheDocument();

    act(() => {
      fireEvent.keyDown(window, { key: 'b' });
    });
    expect(jamStore.getState().markers).toHaveLength(1);

    act(() => {
      fireEvent.keyDown(window, { key: ' ' });
    });
    expect(jamStore.getState().status).toBe('idle');
  });

  it('keyboard shortcuts change level, mode and piano visibility', () => {
    jamStore.setState({ status: 'listening', source: 'mic', sessionStart: clock.now() });
    renderJam();
    expect(screen.getByRole('img', { name: /Piano/ })).toBeInTheDocument();
    act(() => {
      fireEvent.keyDown(window, { key: '3' });
      fireEvent.keyDown(window, { key: 'm' });
      fireEvent.keyDown(window, { key: 'p' });
    });
    expect(settingsStore.getState().vocabLevel).toBe(3);
    expect(settingsStore.getState().mode).toBe('room');
    expect(screen.queryByRole('img', { name: /Piano/ })).toBeNull();
    act(() => fireEvent.keyDown(window, { key: 'p' }));
    expect(screen.getByRole('img', { name: /Piano/ })).toBeInTheDocument();
  });

  it('S opens the ideas inspector on Scales and remembers the choice', () => {
    vi.useFakeTimers();
    renderJam();
    expect(screen.queryByRole('complementary', { name: 'Ideas' })).toBeNull();
    act(() => {
      jamStore.setState({ currentChord: { root: 2, quality: 'min7' }, confidence: 0.9 });
      fireEvent.keyDown(window, { key: 's' });
    });
    vi.useRealTimers();
    expect(screen.getByRole('complementary', { name: 'Ideas' })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'D dorian' })).toBeInTheDocument();
    expect(localStorage.getItem('keel.ui.inspector')).toBe('1:scales');
    act(() => {
      fireEvent.keyDown(window, { key: 's' });
    });
    expect(screen.queryByRole('complementary', { name: 'Ideas' })).toBeNull();
    cleanup();
    // a stored "open" flag is ignored: Ideas never reopens by itself; the tab is remembered
    localStorage.setItem('keel.ui.inspector', '1:scales');
    renderJam();
    expect(screen.queryByRole('complementary', { name: 'Ideas' })).toBeNull();
    act(() => {
      fireEvent.keyDown(window, { key: 'i' });
    });
    expect(screen.getByRole('radio', { name: 'Scales', checked: true })).toBeInTheDocument();
  });
});

describe('SettingsScreen', () => {
  it('finds devices only on request and clears disconnected selections', async () => {
    settingsStore.getState().update({ audioDeviceId: 'gone-mic', midiDeviceId: 'gone-midi' });
    const refresh = vi.spyOn(liveInput(), 'refreshDevices').mockImplementation(async () => {
      inputStore.getState().setAudioDevices([{ id: 'built-in', label: 'Built-in microphone' }]);
      inputStore.getState().setMidiSupported(true);
      inputStore.getState().setMidiDevices([{ id: 'piano', name: 'USB piano', manufacturer: '' }]);
    });
    render(<SettingsScreen />);
    expect(refresh).not.toHaveBeenCalled();
    expect(screen.getByLabelText('Microphone')).toHaveValue('gone-mic');
    await act(async () =>
      fireEvent.click(screen.getByRole('button', { name: 'Find input devices' })),
    );
    expect(refresh).toHaveBeenCalledOnce();
    expect(screen.getByText('Found 1 microphone and 1 MIDI device.')).toBeInTheDocument();
    expect(settingsStore.getState().audioDeviceId).toBeNull();
    expect(settingsStore.getState().midiDeviceId).toBeNull();
    expect(screen.getByLabelText('Microphone')).toHaveValue('');
    expect(screen.getByLabelText('MIDI device')).toBeEnabled();
    fireEvent.change(screen.getByLabelText('MIDI device'), { target: { value: 'piano' } });
    expect(settingsStore.getState().midiDeviceId).toBe('piano');
    refresh.mockRestore();
  });

  it('keeps microphone selection available when MIDI is unsupported', async () => {
    const refresh = vi.spyOn(liveInput(), 'refreshDevices').mockResolvedValue(undefined);
    render(<SettingsScreen />);
    await act(async () =>
      fireEvent.click(screen.getByRole('button', { name: 'Find input devices' })),
    );
    expect(screen.getByText(/No input devices found/)).toBeInTheDocument();
    expect(screen.getByLabelText('Microphone')).toBeEnabled();
    expect(screen.getByLabelText('MIDI device')).toBeDisabled();
    refresh.mockRestore();
  });

  it('edits settings and validates A4', () => {
    render(<SettingsScreen />);
    // Slash chords and stability follow the listening mode; Settings does not expose them.
    expect(screen.queryByRole('switch', { name: 'Show slash chords' })).toBeNull();
    expect(screen.queryByRole('slider', { name: 'Chord stability' })).toBeNull();
    fireEvent.click(screen.getByRole('radio', { name: 'With 7ths' }));
    expect(settingsStore.getState().vocabLevel).toBe(2);

    const a4 = screen.getByLabelText('Reference pitch (A4)');
    fireEvent.change(a4, { target: { value: '500' } });
    fireEvent.blur(a4);
    expect(screen.getByRole('alert')).toHaveTextContent('415');
    expect(settingsStore.getState().a4).toBe(DEFAULT_SETTINGS.a4);
    fireEvent.change(a4, { target: { value: '442' } });
    fireEvent.blur(a4);
    expect(settingsStore.getState().a4).toBe(442);

    fireEvent.click(screen.getByRole('radio', { name: 'Overall harmony' }));
    expect(settingsStore.getState().mode).toBe('room');
    expect(screen.getByLabelText('MIDI device')).toBeDisabled();

    fireEvent.click(screen.getByRole('radio', { name: 'Light' }));
    expect(settingsStore.getState().theme).toBe('light');

    fireEvent.change(screen.getByRole('slider', { name: 'Microphone sensitivity' }), {
      target: { value: '0.8' },
    });
    expect(settingsStore.getState().sensitivity).toBe(0.8);
    expect(screen.getByText('High')).toBeInTheDocument();
  });

  it('shows the version and lists the jam shortcuts in a sheet', () => {
    render(<SettingsScreen />);
    expect(screen.getByText(APP_VERSION)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Keyboard shortcuts' }));
    const sheet = screen.getByRole('dialog', { name: 'Keyboard shortcuts' });
    expect(within(sheet).getAllByRole('listitem')).toHaveLength(10);
    expect(sheet).toHaveTextContent('Space');
  });

  it('keeps APP_VERSION in step with package.json', () => {
    expect(APP_VERSION).toBe(pkg.version);
  });
});

describe('JamScreen voicings', () => {
  it('V opens the inspector on Voicings and the choice persists', () => {
    renderJam();
    expect(screen.queryByRole('region', { name: 'Voicings' })).toBeNull();
    act(() => {
      fireEvent.keyDown(window, { key: 'v' });
    });
    expect(screen.getByRole('region', { name: 'Voicings' })).toBeInTheDocument();
    expect(screen.queryByRole('radiogroup', { name: 'Voicing style' })).toBeNull();
    expect(localStorage.getItem('keel.ui.inspector')).toBe('1:voicings');
    expect(screen.queryByRole('img', { name: /Piano/ })).toBeNull();
  });

  it('voices the chord on screen, in three rows, and follows it at once', () => {
    jamStore.setState({ currentChord: { root: 0, quality: 'maj7' }, confidence: 1 });
    renderJam();
    act(() => {
      fireEvent.keyDown(window, { key: 'v' });
    });
    expect(screen.getAllByTestId('voicing-card')).toHaveLength(3);
    expect(screen.getByRole('region', { name: 'Voicings' })).toHaveTextContent('Cmaj7');
    // the next chord on screen moves the panel straight away (no hold)
    act(() => jamStore.setState({ currentChord: { root: 7, quality: '7' } }));
    expect(screen.getByRole('region', { name: 'Voicings' })).toHaveTextContent('G7');
    // a gap keeps the last chord
    act(() => jamStore.setState({ currentChord: null }));
    expect(screen.getByRole('region', { name: 'Voicings' })).toHaveTextContent('G7');
  });
});
