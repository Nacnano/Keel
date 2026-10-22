import { create } from 'zustand';
import type { MidiDeviceInfo } from '@/core';

export interface AudioDeviceOption {
  id: string;
  label: string;
}

export interface InputState {
  audioDevices: AudioDeviceOption[];
  selectedAudioId: string | null;
  midiDevices: MidiDeviceInfo[];
  selectedMidiId: string | null;
  midiSupported: boolean;
  /** 0..1 input level for meters. */
  micLevel: number;
  setAudioDevices(devices: AudioDeviceOption[]): void;
  selectAudioDevice(id: string | null): void;
  setMidiDevices(devices: MidiDeviceInfo[]): void;
  selectMidiDevice(id: string | null): void;
  setMidiSupported(supported: boolean): void;
  setMicLevel(level: number): void;
}

/** Device lists and selection. Pure state; the integrator fills it from @/audio and @/midi. */
export const useInputStore = create<InputState>()((set) => ({
  audioDevices: [],
  selectedAudioId: null,
  midiDevices: [],
  selectedMidiId: null,
  midiSupported: false,
  micLevel: 0,
  setAudioDevices: (audioDevices) => set({ audioDevices }),
  selectAudioDevice: (selectedAudioId) => set({ selectedAudioId }),
  setMidiDevices: (midiDevices) => set({ midiDevices }),
  selectMidiDevice: (selectedMidiId) => set({ selectedMidiId }),
  setMidiSupported: (midiSupported) => set({ midiSupported }),
  setMicLevel: (micLevel) => set({ micLevel: Math.max(0, Math.min(1, micLevel)) }),
}));

export const inputStore = useInputStore;
