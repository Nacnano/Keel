import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { DEFAULT_SETTINGS } from '@/core';
import { initialJamData, jamStore } from '@/state/jamStore';
import { settingsStore } from '@/state/settingsStore';
import { JamScreen } from './JamScreen';
import pkg from '../../../package.json';
import { SettingsScreen } from './SettingsScreen';
import { APP_VERSION } from './settings/about';

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
    expect(screen.queryByRole('complementary', { name: 'Ideas' })).toBeNull();
    expect(screen.getByTestId('chord-symbol')).toBeInTheDocument();
    expect(screen.getByText(/Tap Start, then play/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Start/ })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Options' })).toBeInTheDocument();
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
    renderJam();
    act(() => {
      fireEvent.keyDown(window, { key: '3' });
      fireEvent.keyDown(window, { key: 'm' });
      fireEvent.keyDown(window, { key: 'p' });
    });
    expect(settingsStore.getState().vocabLevel).toBe(3);
    expect(settingsStore.getState().mode).toBe('room');
    expect(screen.queryByRole('img', { name: /Piano/ })).toBeNull();
  });

  it('S opens the ideas inspector on Scales and remembers the choice', () => {
    renderJam();
    expect(screen.queryByRole('complementary', { name: 'Ideas' })).toBeNull();
    act(() => {
      jamStore.setState({ currentChord: { root: 2, quality: 'min7' }, confidence: 0.9 });
      fireEvent.keyDown(window, { key: 's' });
    });
    expect(screen.getByRole('complementary', { name: 'Ideas' })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'D dorian' })).toBeInTheDocument();
    expect(localStorage.getItem('jamkey.ui.inspector')).toBe('1:scales');
    act(() => {
      fireEvent.keyDown(window, { key: 's' });
    });
    expect(screen.queryByRole('complementary', { name: 'Ideas' })).toBeNull();
    cleanup();
    localStorage.setItem('jamkey.ui.inspector', '1:next');
    renderJam();
    expect(screen.getByRole('complementary', { name: 'Ideas' })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'Next', checked: true })).toBeInTheDocument();
  });
});

describe('SettingsScreen', () => {
  it('edits settings and validates A4', () => {
    render(<SettingsScreen />);
    fireEvent.click(screen.getByRole('switch', { name: 'Show slash chords' }));
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
    expect(within(sheet).getAllByRole('listitem')).toHaveLength(11);
    expect(sheet).toHaveTextContent('Space');
  });

  it('keeps APP_VERSION in step with package.json', () => {
    expect(APP_VERSION).toBe(pkg.version);
  });
});

describe('JamScreen voicings', () => {
  it('V opens the inspector on Voicings and the choice persists', () => {
    renderJam();
    expect(screen.queryByRole('radiogroup', { name: 'Voicing style' })).toBeNull();
    act(() => {
      fireEvent.keyDown(window, { key: 'v' });
    });
    expect(screen.getByRole('radiogroup', { name: 'Voicing style' })).toBeInTheDocument();
    expect(localStorage.getItem('jamkey.ui.inspector')).toBe('1:voicings');
    expect(screen.getByRole('img', { name: /Piano/ })).toBeInTheDocument();
  });

  it('voices the current chord', () => {
    localStorage.setItem('jamkey.ui.inspector', '1:voicings');
    jamStore.setState({ currentChord: { root: 0, quality: 'maj7' }, confidence: 1 });
    renderJam();
    expect(screen.getAllByTestId('voicing-card').length).toBeGreaterThanOrEqual(1);
  });
});
