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
    expect(screen.getByTestId('chord-symbol')).toHaveTextContent('—');
    expect(screen.getByText('Tap Start and allow the microphone.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Start/ })).toBeEnabled();
    expect(screen.getByRole('radiogroup', { name: 'Chord vocabulary level' })).toBeInTheDocument();
    expect(screen.getByRole('img', { name: /Piano/ })).toBeInTheDocument();
  });

  it('explains how to reach the demo when live input is not wired', () => {
    renderJam();
    fireEvent.click(screen.getByRole('button', { name: /Start/ }));
    expect(screen.getByRole('alert')).toHaveTextContent('?mock=1');
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
