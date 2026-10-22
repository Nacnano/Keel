import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { DEFAULT_SETTINGS } from '@/core';
import { initialJamData, jamStore } from '@/state/jamStore';
import { settingsStore } from '@/state/settingsStore';
import { JamScreen } from './JamScreen';
import { SettingsScreen } from './SettingsScreen';

beforeEach(() => {
  localStorage.clear();
  jamStore.setState(initialJamData());
  settingsStore.getState().resetSettings();
});

afterEach(() => {
  cleanup();
  window.history.replaceState({}, '', '/');
});

const renderJam = () =>
  render(
    <MemoryRouter>
      <JamScreen />
    </MemoryRouter>,
  );

describe('JamScreen', () => {
  it('renders the idle layout', () => {
    renderJam();
    expect(screen.queryByRole('region', { name: 'Modulation hints' })).toBeNull();
    expect(screen.getByTestId('chord-symbol')).toHaveTextContent('—');
    expect(screen.getByText('Tap Start and allow the microphone.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Start/ })).toBeEnabled();
    expect(screen.getByRole('radiogroup', { name: 'Chord vocabulary level' })).toBeInTheDocument();
    expect(screen.getByRole('img', { name: /Piano/ })).toBeInTheDocument();
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
    // the mock stream's key brings up modulation hints under Try next
    expect(screen.getAllByTestId('modulation-hint').length).toBeGreaterThan(0);
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
    renderJam();
    act(() => {
      fireEvent.keyDown(window, { key: '3' });
      fireEvent.keyDown(window, { key: 'm' });
      fireEvent.keyDown(window, { key: 'k' });
    });
    expect(settingsStore.getState().vocabLevel).toBe(3);
    expect(settingsStore.getState().mode).toBe('room');
    expect(screen.queryByRole('img', { name: /Piano/ })).toBeNull();
  });

  it('S toggles the scale helper and remembers the choice', () => {
    renderJam();
    const helper = screen.getByRole('region', { name: 'Scale helper' });
    expect(helper).toHaveTextContent('Play a chord to see scales that fit.');
    act(() => {
      jamStore.setState({ currentChord: { root: 2, quality: 'min7' }, confidence: 0.9 });
    });
    expect(screen.getByRole('radio', { name: 'D dorian' })).toBeInTheDocument();
    act(() => {
      fireEvent.keyDown(window, { key: 's' });
    });
    expect(screen.queryByRole('radio', { name: 'D dorian' })).toBeNull();
    expect(localStorage.getItem('jamkey.ui.scales')).toBe('0');
    cleanup();
    renderJam();
    expect(screen.getByRole('button', { name: 'Show' })).toBeInTheDocument();
  });
});

describe('SettingsScreen', () => {
  it('edits settings and validates A4', () => {
    render(<SettingsScreen />);
    fireEvent.click(screen.getByRole('switch', { name: 'Show inversions as slash chords' }));
    expect(settingsStore.getState().showSlashChords).toBe(false);

    const a4 = screen.getByLabelText('Reference pitch (A4)');
    fireEvent.change(a4, { target: { value: '500' } });
    fireEvent.blur(a4);
    expect(screen.getByRole('alert')).toHaveTextContent('415');
    expect(settingsStore.getState().a4).toBe(DEFAULT_SETTINGS.a4);
    fireEvent.change(a4, { target: { value: '442' } });
    fireEvent.blur(a4);
    expect(settingsStore.getState().a4).toBe(442);

    fireEvent.click(screen.getByRole('radio', { name: /Room/ }));
    expect(settingsStore.getState().mode).toBe('room');
    expect(screen.getByLabelText('MIDI device')).toBeDisabled();
  });
});

describe('JamScreen voicings panel', () => {
  it('is collapsed by default; V toggles it and the choice persists', () => {
    renderJam();
    const panel = screen.getByRole('region', { name: 'Voicings' });
    expect(screen.queryByRole('radiogroup', { name: 'Voicing style' })).toBeNull();
    act(() => {
      fireEvent.keyDown(window, { key: 'v' });
    });
    expect(screen.getByRole('radiogroup', { name: 'Voicing style' })).toBeInTheDocument();
    expect(panel).toHaveTextContent(/appear once a chord is detected/);
    expect(localStorage.getItem('jamkey.ui.voicings')).toBe('1');
    // the main keyboard is still the only "Piano" image
    expect(screen.getByRole('img', { name: /Piano/ })).toBeInTheDocument();
  });

  it('voices the current chord', () => {
    localStorage.setItem('jamkey.ui.voicings', '1');
    jamStore.setState({ currentChord: { root: 0, quality: 'maj7' }, confidence: 1 });
    renderJam();
    expect(screen.getAllByTestId('voicing-card').length).toBeGreaterThanOrEqual(1);
  });
});
