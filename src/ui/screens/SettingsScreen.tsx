import { useEffect, useId, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import type { Instrument, JamMode, Settings, VocabLevel } from '@/core';
import { liveInput } from '@/app/live/liveInput';
import { storageEstimate, type StorageInfo } from '@/data';
import { useInputStore } from '@/state/inputStore';
import { selectSettings, useSettings } from '@/state/settingsStore';
import { useSync } from '@/sync/store';
import { toast } from '../components/toastStore';
import { useMediaQuery } from '../lib/useMediaQuery';
import { Button, Group, Page, Row, Segmented, Select, Sheet, Slider, Switch } from '../kit';
import { APP_VERSION, JAM_SHORTCUTS } from './settings/about';
import { AccountSync } from './settings/AccountSync';
import {
  LEVEL_OPTIONS,
  MODE_OPTIONS,
  SENSITIVITY_MAX_LABEL,
  SENSITIVITY_MIN_LABEL,
} from './settings/labels';

import { INSTRUMENT_OPTIONS } from './jam/labels';

export const A4_MIN = 415;
export const A4_MAX = 466;

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  const units = ['KB', 'MB', 'GB', 'TB'];
  let v = n / 1024;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v < 10 ? v.toFixed(1) : Math.round(v)} ${units[i]}`;
}

/** "402 KB used of 10 GB on this device". */
function storageLine(info: StorageInfo): string {
  if (!info.exact) return `About ${formatBytes(info.usage)} of audio on this device`;
  return info.quota
    ? `${formatBytes(info.usage)} used of ${formatBytes(info.quota)} on this device`
    : `${formatBytes(info.usage)} used on this device`;
}

function useStorageInfo(): StorageInfo | null {
  const [info, setInfo] = useState<StorageInfo | null>(null);
  useEffect(() => {
    let alive = true;
    storageEstimate().then(
      (i) => alive && setInfo(i),
      () => alive && setInfo(null),
    );
    return () => {
      alive = false;
    };
  }, []);
  return info;
}

const THEMES = [
  { value: 'system' as const, label: 'System' },
  { value: 'light' as const, label: 'Light' },
  { value: 'dark' as const, label: 'Dark' },
];

/** Tuning group: A4 as an inline number field; the hint or validation error is the footer. */
function TuningGroup({ value, onCommit }: { value: number; onCommit(v: number): void }) {
  const id = useId();
  const [draft, setDraft] = useState(String(value));
  const [error, setError] = useState<string | null>(null);

  const commit = () => {
    const n = Number(draft);
    if (!Number.isFinite(n) || n < A4_MIN || n > A4_MAX) {
      setError(`Enter a value between ${A4_MIN} and ${A4_MAX} Hz.`);
      return;
    }
    setError(null);
    onCommit(Math.round(n * 10) / 10);
  };

  return (
    <Group
      title="Tuning"
      footer={
        error ? (
          <span id={`${id}-err`} role="alert" className="text-live">
            {error}
          </span>
        ) : (
          '440 Hz is standard; some pianos sit at 442.'
        )
      }
    >
      <Row
        label={<label htmlFor={id}>Reference pitch (A4)</label>}
        accessory={
          <>
            <input
              id={id}
              type="number"
              inputMode="decimal"
              min={A4_MIN}
              max={A4_MAX}
              step={0.5}
              value={draft}
              aria-invalid={error ? true : undefined}
              aria-describedby={error ? `${id}-err` : undefined}
              onChange={(e) => setDraft(e.target.value)}
              onBlur={commit}
              onKeyDown={(e) => e.key === 'Enter' && commit()}
              className="h-8 w-20 rounded-[8px] bg-fill-3 px-2 text-right text-body text-label tabular aria-[invalid]:text-live"
            />
            <span>Hz</span>
          </>
        }
      />
    </Group>
  );
}

function Kbd({ children }: { children: string }) {
  return (
    <kbd className="inline-flex h-6 min-w-6 items-center justify-center rounded-[6px] bg-fill-3 px-1.5 font-sans text-footnote font-semibold text-label">
      {children}
    </kbd>
  );
}

function ShortcutsSheet({ open, onClose }: { open: boolean; onClose(): void }) {
  return (
    <Sheet open={open} onClose={onClose} title="Keyboard shortcuts">
      <p className="pb-2 text-footnote text-label-2">
        On the jam screen, whenever you are not typing in a field.
      </p>
      <ul aria-label="Jam shortcuts" className="[&>*+*]:hairline-t">
        {JAM_SHORTCUTS.map((s) => (
          <li key={s.keys.join()} className="flex min-h-11 items-center gap-3 py-2">
            <span className="min-w-0 flex-1 text-body text-label">{s.action}</span>
            <span className="flex shrink-0 gap-1">
              {s.keys.map((k) => (
                <Kbd key={k}>{k}</Kbd>
              ))}
            </span>
          </li>
        ))}
      </ul>
    </Sheet>
  );
}

export function SettingsScreen() {
  const settings = useSettings(useShallow(selectSettings));
  const update = useSettings((s) => s.update);
  const resetSettings = useSettings((s) => s.resetSettings);
  const inputs = useInputStore(
    useShallow((s) => ({
      audioDevices: s.audioDevices,
      midiDevices: s.midiDevices,
      midiSupported: s.midiSupported,
      selectAudioDevice: s.selectAudioDevice,
      selectMidiDevice: s.selectMidiDevice,
    })),
  );
  const [confirmReset, setConfirmReset] = useState(false);
  const [shortcuts, setShortcuts] = useState(false);
  const [findingDevices, setFindingDevices] = useState(false);
  const [deviceMessage, setDeviceMessage] = useState<string | null>(null);
  const syncConfigured = useSync((s) => s.configured);
  const touch = useMediaQuery('(pointer: coarse)');
  const storage = useStorageInfo();

  const findDevices = async () => {
    setFindingDevices(true);
    setDeviceMessage(null);
    try {
      await liveInput().refreshDevices();
      const found = useInputStore.getState();
      const current = useSettings.getState();
      // A disconnected saved selection must not leave a select with an invisible value.
      if (
        current.audioDeviceId &&
        !found.audioDevices.some((d) => d.id === current.audioDeviceId)
      ) {
        current.update({ audioDeviceId: null });
        found.selectAudioDevice(null);
      }
      if (current.midiDeviceId && !found.midiDevices.some((d) => d.id === current.midiDeviceId)) {
        current.update({ midiDeviceId: null });
        found.selectMidiDevice(null);
      }
      const microphones = found.audioDevices.length;
      const keyboards = found.midiDevices.length;
      setDeviceMessage(
        microphones + keyboards === 0
          ? 'No input devices found. Check your connections and browser permissions.'
          : `Found ${microphones} microphone${microphones === 1 ? '' : 's'}${found.midiSupported ? ` and ${keyboards} MIDI device${keyboards === 1 ? '' : 's'}` : '. MIDI is unavailable in this browser'}.`,
      );
    } catch {
      setDeviceMessage('Couldn’t check input devices. Check browser permissions and try again.');
    } finally {
      setFindingDevices(false);
    }
  };

  const set = <K extends keyof Settings>(k: K, v: Settings[K]) => update({ [k]: v });

  const audioOptions = [
    { value: '', label: 'System default' },
    ...(settings.audioDeviceId && !inputs.audioDevices.some((d) => d.id === settings.audioDeviceId)
      ? [{ value: settings.audioDeviceId, label: 'Previous microphone · check connection' }]
      : []),
    ...inputs.audioDevices.map((d) => ({ value: d.id, label: d.label || 'Unnamed input' })),
  ];
  const midiOptions = [
    { value: '', label: inputs.midiDevices.length ? 'None' : 'No devices' },
    ...(settings.midiDeviceId && !inputs.midiDevices.some((d) => d.id === settings.midiDeviceId)
      ? [{ value: settings.midiDeviceId, label: 'Previous MIDI device · check connection' }]
      : []),
    ...inputs.midiDevices.map((d) => ({ value: d.id, label: d.name || d.manufacturer || d.id })),
  ];
  const midiHint =
    deviceMessage === null
      ? 'Choose Find input devices to connect a digital piano over USB.'
      : !inputs.midiSupported
        ? 'Web MIDI needs Chrome or Edge on a laptop. Safari uses the microphone.'
        : inputs.midiDevices.length === 0
          ? 'Connect a digital piano over USB for exact input.'
          : 'Exact and instant; the microphone stays as a fallback.';
  const sensitivityWord =
    settings.sensitivity < 0.34 ? 'Low' : settings.sensitivity > 0.66 ? 'High' : 'Medium';

  return (
    <Page title="Settings">
      <div className="flex flex-col gap-6 px-4 pt-2">
        <Group
          title="Input"
          footer="Settings save automatically. Device changes apply to your next jam."
        >
          <Row
            label="Microphone"
            detail={
              inputs.audioDevices.length === 0
                ? 'Names appear after you allow the microphone once.'
                : undefined
            }
            accessory={
              <Select
                inline
                aria-label="Microphone"
                options={audioOptions}
                value={settings.audioDeviceId ?? ''}
                onChange={(v) => {
                  set('audioDeviceId', v || null);
                  inputs.selectAudioDevice(v || null);
                }}
              />
            }
          />
          <Row
            label="MIDI device"
            detail={midiHint}
            accessory={
              <Select
                inline
                aria-label="MIDI device"
                options={midiOptions}
                value={settings.midiDeviceId ?? ''}
                disabled={!inputs.midiSupported || inputs.midiDevices.length === 0}
                onChange={(v) => {
                  set('midiDeviceId', v || null);
                  inputs.selectMidiDevice(v || null);
                }}
              />
            }
          />
          <div className="px-4 py-3">
            <Button variant="tinted" loading={findingDevices} onClick={() => void findDevices()}>
              {findingDevices ? 'Finding devices…' : 'Find input devices'}
            </Button>
            <p role="status" className="mt-2 text-footnote leading-relaxed text-label-2">
              {findingDevices
                ? 'Allow MIDI access if your browser asks.'
                : (deviceMessage ?? 'Check for connected microphones and USB MIDI keyboards.')}
            </p>
          </div>
          <Row
            stacked
            label={
              <span className="flex items-baseline justify-between gap-3">
                <span>Sensitivity</span>
                <span className="text-subhead text-label-2">{sensitivityWord}</span>
              </span>
            }
            accessory={
              <Slider
                aria-label="Microphone sensitivity"
                aria-valuetext={`${sensitivityWord} (${Math.round(settings.sensitivity * 100)}%)`}
                min={0}
                max={1}
                step={0.05}
                value={settings.sensitivity}
                onChange={(v) => set('sensitivity', v)}
                minLabel={SENSITIVITY_MIN_LABEL}
                maxLabel={SENSITIVITY_MAX_LABEL}
              />
            }
          />
        </Group>

        <Group
          title="Listening"
          footer="Overall harmony follows the music around you. My instrument favors your selected instrument."
        >
          <Row
            label="Instrument"
            stacked
            accessory={
              <Segmented<Instrument>
                aria-label="Instrument"
                options={INSTRUMENT_OPTIONS}
                value={settings.instrument}
                onChange={(v) => set('instrument', v)}
              />
            }
          />
          <Row
            label="Listening mode"
            stacked
            accessory={
              <Segmented<JamMode>
                aria-label="Listening mode"
                options={MODE_OPTIONS}
                value={settings.mode}
                onChange={(v) => set('mode', v)}
              />
            }
          />
          <Row
            label="Record audio by default"
            detail="Stored only on this device. You can change it per session."
            accessory={
              <Switch
                aria-label="Record audio by default"
                checked={settings.recordAudioByDefault}
                onChange={(v) => set('recordAudioByDefault', v)}
              />
            }
          />
        </Group>

        <Group title="Chords">
          <Row
            label="Detail"
            accessory={
              <Segmented<VocabLevel>
                aria-label="Chord detail"
                options={LEVEL_OPTIONS}
                value={settings.vocabLevel}
                onChange={(v) => set('vocabLevel', v)}
              />
            }
          />
          <Row
            label="Spell notes for the key"
            detail="B♭ in F major, A♯ in B major. Off: always sharps."
            accessory={
              <Switch
                aria-label="Spell notes for the key"
                checked={settings.spellingFollowsKey}
                onChange={(v) => set('spellingFollowsKey', v)}
              />
            }
          />
        </Group>

        {/* keyed so an external change (reset) refreshes the draft */}
        <TuningGroup key={settings.a4} value={settings.a4} onCommit={(v) => set('a4', v)} />

        <Group title="Appearance">
          <Row
            label="Theme"
            accessory={
              <Segmented<Settings['theme']>
                aria-label="Theme"
                options={THEMES}
                value={settings.theme}
                onChange={(v) => set('theme', v)}
              />
            }
          />
        </Group>

        {syncConfigured && <AccountSync />}

        <Group title="About">
          <Row label="Version" accessory={<span className="tabular">{APP_VERSION}</span>} />
          {!touch && <Row label="Keyboard shortcuts" chevron onClick={() => setShortcuts(true)} />}
        </Group>

        <Group footer="Saved sessions are not affected.">
          <Row
            label={<span className="text-live">Reset all settings</span>}
            onClick={() => setConfirmReset(true)}
          />
        </Group>

        <p data-testid="storage-line" className="px-4 text-center text-footnote text-label-3">
          {storage ? storageLine(storage) : '\u00a0'}
        </p>
      </div>

      <ShortcutsSheet open={shortcuts} onClose={() => setShortcuts(false)} />

      <Sheet
        open={confirmReset}
        onClose={() => setConfirmReset(false)}
        placement="center"
        title="Reset all settings?"
      >
        <p className="text-subhead text-label-2">
          Input devices, listening, chords and tuning go back to their defaults. Saved sessions are
          not affected.
        </p>
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="gray" onClick={() => setConfirmReset(false)}>
            Cancel
          </Button>
          <Button
            variant="filled"
            destructive
            onClick={() => {
              resetSettings();
              setConfirmReset(false);
              toast('Settings reset to defaults');
            }}
          >
            Reset
          </Button>
        </div>
      </Sheet>
    </Page>
  );
}
