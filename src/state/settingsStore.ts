import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { DEFAULT_SETTINGS } from '@/core';
import type { Settings } from '@/core';

export const SETTINGS_STORAGE_KEY = 'jamkey.settings';

export interface SettingsActions {
  update(patch: Partial<Settings>): void;
  resetSettings(): void;
}

export type SettingsState = Settings & SettingsActions;

/** Pick only the persisted `Settings` fields out of the store state. */
export function selectSettings(s: SettingsState): Settings {
  return {
    a4: s.a4,
    vocabLevel: s.vocabLevel,
    instrument: s.instrument,
    mode: s.mode,
    stability: s.stability,
    sensitivity: s.sensitivity,
    showSlashChords: s.showSlashChords,
    spellingFollowsKey: s.spellingFollowsKey,
    audioDeviceId: s.audioDeviceId,
    midiDeviceId: s.midiDeviceId,
    recordAudioByDefault: s.recordAudioByDefault,
    theme: s.theme,
  };
}

/**
 * User settings, persisted to localStorage under `jamkey.settings`.
 * WS-F may later back this with the Dexie `settings` table; keep `useSettings()` stable.
 */
export const useSettings = create<SettingsState>()(
  persist(
    (set) => ({
      ...DEFAULT_SETTINGS,
      update: (patch) => set(patch),
      resetSettings: () => set({ ...DEFAULT_SETTINGS }),
    }),
    {
      name: SETTINGS_STORAGE_KEY,
      version: 1,
      storage: createJSONStorage(() => localStorage),
      partialize: selectSettings,
      merge: (persisted, current) => ({
        ...current,
        ...DEFAULT_SETTINGS,
        ...(persisted as Partial<Settings> | undefined),
      }),
    },
  ),
);

/** Non-hook handle (getState / setState / subscribe / persist). */
export const settingsStore = useSettings;
