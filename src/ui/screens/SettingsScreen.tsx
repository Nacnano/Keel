import { useId, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import type { Instrument, JamMode, Settings, VocabLevel } from '@/core';
import { useInputStore } from '@/state/inputStore';
import { selectSettings, useSettings } from '@/state/settingsStore';
import { toast } from '../components/toastStore';
import { Button, Group, PageHeader, Row, Segmented, Select, Sheet, Slider, Switch } from '../kit';
import { APP_VERSION, JAM_SHORTCUTS } from './settings/about';
import { AccountSync } from './settings/AccountSync';

export const A4_MIN = 415;
export const A4_MAX = 466;

const INSTRUMENTS = [
  { value: 'piano' as const, label: 'Piano' },
  { value: 'guitar' as const, label: 'Guitar' },
];

const MODES = [
  { value: 'solo' as const, label: 'Just me' },
  { value: 'room' as const, label: 'Room' },
];

const LEVELS = [
  { value: 1 as const, label: 'Triads' },
  { value: 2 as const, label: '7ths' },
  { value: 3 as const, label: 'Jazz' },
];

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

  const set = <K extends keyof Settings>(k: K, v: Settings[K]) => update({ [k]: v });

  const audioOptions = [
    { value: '', label: 'System default' },
    ...inputs.audioDevices.map((d) => ({ value: d.id, label: d.label || 'Unnamed input' })),
  ];
  const midiOptions = [
    { value: '', label: inputs.midiDevices.length ? 'None' : 'No devices' },
    ...inputs.midiDevices.map((d) => ({ value: d.id, label: d.name || d.manufacturer || d.id })),
  ];
  const midiHint = !inputs.midiSupported
    ? 'Web MIDI needs Chrome or Edge on a laptop. Safari uses the microphone.'
    : inputs.midiDevices.length === 0
      ? 'Connect a digital piano over USB for exact input.'
      : 'Exact and instant; the microphone stays as a fallback.';
  const sensitivityWord =
    settings.sensitivity < 0.34 ? 'Low' : settings.sensitivity > 0.66 ? 'High' : 'Medium';
  const stabilityWord =
    settings.stability < 0.34 ? 'Snappy' : settings.stability > 0.66 ? 'Very stable' : 'Balanced';

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-2xl pb-[max(env(safe-area-inset-bottom),32px)]">
        <PageHeader title="Settings" />

        <div className="flex flex-col gap-6 px-4 pt-2">
          <Group title="Input" footer="Settings are saved automatically on this device.">
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
                  minLabel="Ignores room noise"
                  maxLabel="Hears soft playing"
                />
              }
            />
          </Group>

          <Group title="Listening" footer="Room follows a band or a song playing nearby.">
            <Row
              label="Instrument"
              accessory={
                <Segmented<Instrument>
                  size="sm"
                  aria-label="Instrument"
                  options={INSTRUMENTS}
                  value={settings.instrument}
                  onChange={(v) => set('instrument', v)}
                />
              }
            />
            <Row
              label="Mode"
              accessory={
                <Segmented<JamMode>
                  size="sm"
                  aria-label="Listening mode"
                  options={MODES}
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
                  size="sm"
                  aria-label="Chord detail"
                  options={LEVELS}
                  value={settings.vocabLevel}
                  onChange={(v) => set('vocabLevel', v)}
                />
              }
            />
            <Row
              label="Show slash chords"
              detail="C/E instead of C when E is in the bass."
              accessory={
                <Switch
                  aria-label="Show slash chords"
                  checked={settings.showSlashChords}
                  onChange={(v) => set('showSlashChords', v)}
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
            <Row
              stacked
              label={
                <span className="flex items-baseline justify-between gap-3">
                  <span>Stability</span>
                  <span className="text-subhead text-label-2">{stabilityWord}</span>
                </span>
              }
              accessory={
                <Slider
                  aria-label="Chord stability"
                  aria-valuetext={`${stabilityWord} (${Math.round(settings.stability * 100)}%)`}
                  min={0}
                  max={1}
                  step={0.05}
                  value={settings.stability}
                  onChange={(v) => set('stability', v)}
                  minLabel="Follows every change"
                  maxLabel="Ignores passing notes"
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
                  size="sm"
                  aria-label="Theme"
                  options={THEMES}
                  value={settings.theme}
                  onChange={(v) => set('theme', v)}
                />
              }
            />
          </Group>

          <AccountSync />

          <Group title="About">
            <Row label="Version" accessory={<span className="tabular">{APP_VERSION}</span>} />
            <Row label="Keyboard shortcuts" chevron onClick={() => setShortcuts(true)} />
          </Group>

          <Group footer="Saved sessions are not affected.">
            <Row
              label={<span className="text-live">Reset all settings</span>}
              onClick={() => setConfirmReset(true)}
            />
          </Group>
        </div>
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
    </div>
  );
}
