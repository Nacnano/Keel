import { beforeEach, describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS } from '@/core';
import { SETTINGS_STORAGE_KEY, selectSettings, settingsStore } from './settingsStore';

beforeEach(() => {
  localStorage.clear();
  settingsStore.getState().resetSettings();
});

describe('settingsStore', () => {
  it('starts from DEFAULT_SETTINGS', () => {
    expect(selectSettings(settingsStore.getState())).toEqual(DEFAULT_SETTINGS);
  });

  it('writes updates to localStorage under jamkey.settings', () => {
    settingsStore.getState().update({ a4: 442, vocabLevel: 3, mode: 'room' });
    const raw = localStorage.getItem(SETTINGS_STORAGE_KEY);
    expect(raw).toBeTruthy();
    const parsed = JSON.parse(raw!);
    expect(parsed.state).toEqual({ ...DEFAULT_SETTINGS, a4: 442, vocabLevel: 3, mode: 'room' });
    expect(parsed.state.update).toBeUndefined();
  });

  it('round-trips through rehydrate and fills missing fields with defaults', async () => {
    localStorage.setItem(
      SETTINGS_STORAGE_KEY,
      JSON.stringify({ state: { a4: 432, showSlashChords: false }, version: 1 }),
    );
    await settingsStore.persist.rehydrate();
    expect(selectSettings(settingsStore.getState())).toEqual({
      ...DEFAULT_SETTINGS,
      a4: 432,
      showSlashChords: false,
    });
  });
});
