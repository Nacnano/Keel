import { useId, useState } from 'react';
import type { ReactNode } from 'react';
import { useShallow } from 'zustand/react/shallow';
import type { Instrument, Settings } from '@/core';
import { useInputStore } from '@/state/inputStore';
import { selectSettings, useSettings } from '@/state/settingsStore';
import { Button } from '../components/Button';
import { Dialog } from '../components/Dialog';
import { LevelSelector } from '../components/LevelSelector';
import { ModeToggle } from '../components/ModeToggle';
import { Segmented } from '../components/Segmented';
import { Select } from '../components/Select';
import { Switch } from '../components/Switch';
import { toast } from '../components/toastStore';

export const A4_MIN = 415;
export const A4_MAX = 466;

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-5 rounded-2xl bg-zinc-900/40 p-5 ring-1 ring-zinc-900">
      <h2 className="text-xs font-semibold tracking-widest text-zinc-500 uppercase">{title}</h2>
      {children}
    </section>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-6">
      <div className="flex flex-col">
        <span className="text-sm font-medium text-zinc-200">{label}</span>
        {hint && <span className="text-xs text-zinc-500">{hint}</span>}
      </div>
      {children}
    </div>
  );
}

function A4Input({ value, onCommit }: { value: number; onCommit(v: number): void }) {
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
    <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between sm:gap-6">
      <div className="flex flex-col">
        <label htmlFor={id} className="text-sm font-medium text-zinc-200">
          Reference pitch (A4)
        </label>
        <span className="text-xs text-zinc-500">440 Hz is standard; some pianos sit at 442.</span>
      </div>
      <div className="flex flex-col items-end gap-1">
        <div className="flex items-center gap-2">
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
            className="min-h-11 w-28 rounded-xl bg-zinc-900 px-3 text-right text-sm text-zinc-100 tabular-nums ring-1 ring-zinc-800 focus-visible:outline-2 focus-visible:outline-violet-300 aria-[invalid]:ring-rose-500"
          />
          <span className="text-sm text-zinc-500">Hz</span>
        </div>
        {error && (
          <p id={`${id}-err`} role="alert" className="text-xs text-rose-300">
            {error}
          </p>
        )}
      </div>
    </div>
  );
}

function StabilitySlider({ value, onChange }: { value: number; onChange(v: number): void }) {
  const id = useId();
  const word = value < 0.34 ? 'Snappy' : value > 0.66 ? 'Very stable' : 'Balanced';
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between">
        <label htmlFor={id} className="text-sm font-medium text-zinc-200">
          Chord stability
        </label>
        <span className="text-sm text-violet-300">{word}</span>
      </div>
      <input
        id={id}
        type="range"
        min={0}
        max={1}
        step={0.05}
        value={value}
        aria-valuetext={`${word} (${Math.round(value * 100)}%)`}
        onChange={(e) => onChange(Number(e.target.value))}
        className="h-11 w-full accent-violet-400"
      />
      <div className="flex justify-between text-xs text-zinc-500">
        <span>Snappy, follows every change</span>
        <span>Stable, ignores passing notes</span>
      </div>
    </div>
  );
}

const INSTRUMENTS = [
  { value: 'piano' as const, label: 'Piano' },
  { value: 'guitar' as const, label: 'Guitar' },
];

const THEMES = [
  { value: 'dark', label: 'Dark' },
  { value: 'light', label: 'Light' },
  { value: 'system', label: 'Match system' },
];

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

  const set = <K extends keyof Settings>(k: K, v: Settings[K]) => update({ [k]: v });

  const audioOptions = [
    { value: '', label: 'System default' },
    ...inputs.audioDevices.map((d) => ({ value: d.id, label: d.label || 'Unnamed input' })),
  ];
  const midiOptions = [
    { value: '', label: inputs.midiDevices.length ? 'None (use the microphone)' : 'No devices' },
    ...inputs.midiDevices.map((d) => ({ value: d.id, label: d.name || d.manufacturer || d.id })),
  ];
  const midiHint = !inputs.midiSupported
    ? 'Web MIDI needs Chrome or Edge on a laptop. Safari uses the microphone.'
    : inputs.midiDevices.length === 0
      ? 'Connect a digital piano over USB to use exact MIDI input.'
      : 'MIDI is exact and instant; the microphone stays available as a fallback.';

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto flex max-w-2xl flex-col gap-6 px-4 py-6 pb-[max(env(safe-area-inset-bottom),24px)]">
        <header className="flex items-end justify-between">
          <h1 className="text-2xl font-semibold tracking-tight text-white">Settings</h1>
          <span className="text-xs text-zinc-500">Saved automatically on this device</span>
        </header>

        <Section title="Input">
          <Select
            label="Microphone"
            options={audioOptions}
            value={settings.audioDeviceId ?? ''}
            onChange={(v) => {
              set('audioDeviceId', v || null);
              inputs.selectAudioDevice(v || null);
            }}
            hint={
              inputs.audioDevices.length === 0
                ? 'Device names appear after you allow the microphone once.'
                : undefined
            }
          />
          <Select
            label="MIDI device"
            options={midiOptions}
            value={settings.midiDeviceId ?? ''}
            disabled={!inputs.midiSupported || inputs.midiDevices.length === 0}
            onChange={(v) => {
              set('midiDeviceId', v || null);
              inputs.selectMidiDevice(v || null);
            }}
            hint={midiHint}
          />
          <Switch
            label="Record audio by default"
            description="Stored only on this device. You can still change it per session."
            checked={settings.recordAudioByDefault}
            onChange={(v) => set('recordAudioByDefault', v)}
          />
        </Section>

        <Section title="Detection">
          <Field label="Instrument" hint="Tunes smoothing and bass detection.">
            <Segmented<Instrument>
              aria-label="Instrument"
              options={INSTRUMENTS}
              value={settings.instrument}
              onChange={(v) => set('instrument', v)}
            />
          </Field>
          <Field label="Listening mode" hint="Room follows a band or a song playing nearby.">
            <ModeToggle value={settings.mode} onChange={(v) => set('mode', v)} />
          </Field>
          <Field label="Chord vocabulary" hint="Triads, sevenths, or full jazz extensions.">
            <LevelSelector value={settings.vocabLevel} onChange={(v) => set('vocabLevel', v)} />
          </Field>
          <StabilitySlider value={settings.stability} onChange={(v) => set('stability', v)} />
          {/* keyed so an external change (reset) refreshes the draft */}
          <A4Input key={settings.a4} value={settings.a4} onCommit={(v) => set('a4', v)} />
        </Section>

        <Section title="Notation">
          <Switch
            label="Show inversions as slash chords"
            description="C/E instead of C when E is in the bass."
            checked={settings.showSlashChords}
            onChange={(v) => set('showSlashChords', v)}
          />
          <Switch
            label="Spelling follows the key"
            description="B♭ in F major, A♯ in B major. Off: always sharps."
            checked={settings.spellingFollowsKey}
            onChange={(v) => set('spellingFollowsKey', v)}
          />
        </Section>

        <Section title="Appearance">
          <Select
            label="Theme"
            options={THEMES}
            value={settings.theme}
            onChange={(v) => set('theme', v as Settings['theme'])}
            hint="The jam screen is designed dark-first; light theme is coming later."
          />
        </Section>

        <div className="flex justify-end">
          <Button variant="ghost" onClick={() => setConfirmReset(true)}>
            Reset to defaults
          </Button>
        </div>
      </div>

      <Dialog
        open={confirmReset}
        onClose={() => setConfirmReset(false)}
        title="Reset all settings?"
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirmReset(false)}>
              Cancel
            </Button>
            <Button
              variant="danger"
              onClick={() => {
                resetSettings();
                setConfirmReset(false);
                toast('Settings reset to defaults');
              }}
            >
              Reset
            </Button>
          </>
        }
      >
        Input devices, detection and notation go back to their defaults. Saved sessions are not
        affected.
      </Dialog>
    </div>
  );
}
