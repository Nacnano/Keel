import { useCallback, useEffect, useMemo, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import type { Chord, MarkerKind, VocabLevel } from '@/core';
import { jamStore, useJamStore } from '@/state/jamStore';
import type { JamStatus } from '@/state/jamStore';
import { useSettings } from '@/state/settingsStore';
import { ChordDisplay } from '../components/ChordDisplay';
import { KeyBadge } from '../components/KeyBadge';
import { LevelSelector } from '../components/LevelSelector';
import { ModeToggle } from '../components/ModeToggle';
import { ModulationHints } from '../components/ModulationHints';
import { Piano } from '../components/Piano';
import { ScaleHelper } from '../components/ScaleHelper';
import { SourceIndicator } from '../components/SourceIndicator';
import { Timeline } from '../components/Timeline';
import { toast } from '../components/toastStore';
import { TransportBar } from '../components/TransportBar';
import { TryNext } from '../components/TryNext';
import { auditionChord } from '@/app/live/audition';
import { cx } from '../lib/cx';
import { MARKER_LABEL } from '../lib/markers';
import { suggestNext } from '../lib/suggest';
import { useMediaQuery } from '../lib/useMediaQuery';
import { useJamInput } from './jam/useJamInput';
import { useJamShortcuts } from './jam/useJamShortcuts';
import { useScalesPref } from './jam/useScalesPref';

const PIANO_PREF_KEY = 'jamkey.ui.piano';

function readPianoPref(): boolean {
  try {
    return localStorage.getItem(PIANO_PREF_KEY) !== '0';
  } catch {
    return true;
  }
}

function formatTime(sec: number): string {
  const s = Math.floor(sec);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

const STATUS_LABEL: Record<JamStatus, string> = {
  idle: 'Ready',
  starting: 'Starting',
  listening: 'Listening',
  error: 'Needs attention',
};

function StatusPill({ status, mock }: { status: JamStatus; mock: boolean }) {
  return (
    <div className="flex min-h-11 items-center gap-2.5">
      <span
        aria-hidden
        className={cx(
          'size-2.5 rounded-full',
          status === 'listening' && 'animate-pulse bg-violet-400',
          status === 'starting' && 'bg-amber-300',
          status === 'error' && 'bg-rose-400',
          status === 'idle' && 'bg-zinc-600',
        )}
      />
      <span
        role="status"
        className={cx(
          'text-xs font-semibold tracking-[0.2em] uppercase',
          status === 'listening' ? 'text-violet-200' : 'text-zinc-400',
        )}
      >
        {STATUS_LABEL[status]}
      </span>
      {mock && (
        <span className="rounded-md bg-zinc-800 px-1.5 py-0.5 text-[11px] font-medium text-zinc-400">
          Demo
        </span>
      )}
    </div>
  );
}

/** The one screen in use during a jam (DESIGN.md §3.1). */
export function JamScreen() {
  const jam = useJamStore(
    useShallow((s) => ({
      status: s.status,
      error: s.error,
      source: s.source,
      currentChord: s.currentChord,
      confidence: s.confidence,
      keyEstimate: s.key,
      keyHistory: s.keyHistory,
      timeline: s.timeline,
      markers: s.markers,
      activePitchClasses: s.activePitchClasses,
      activeMidiNotes: s.activeMidiNotes,
      level: s.level,
      recordAudio: s.recordAudio,
    })),
  );
  const settings = useSettings(
    useShallow((s) => ({
      vocabLevel: s.vocabLevel,
      mode: s.mode,
      showSlashChords: s.showSlashChords,
      spellingFollowsKey: s.spellingFollowsKey,
      recordAudioByDefault: s.recordAudioByDefault,
      update: s.update,
    })),
  );
  const input = useJamInput();
  const wide = useMediaQuery('(min-width: 1024px)', true);
  const [pianoVisible, setPianoVisible] = useState(readPianoPref);
  const [scalesOpen, toggleScales] = useScalesPref(wide);

  // Per-session recording choice starts from the settings default.
  useEffect(() => {
    if (jamStore.getState().status !== 'listening') {
      jamStore.getState().setRecordAudio(settings.recordAudioByDefault);
    }
  }, [settings.recordAudioByDefault]);

  useEffect(() => {
    try {
      localStorage.setItem(PIANO_PREF_KEY, pianoVisible ? '1' : '0');
    } catch {
      /* private mode: ignore */
    }
  }, [pianoVisible]);

  const listening = jam.status === 'listening';
  const { start, stop } = input;
  const { update } = settings;

  const toggleListening = useCallback(() => {
    const st = jamStore.getState().status;
    if (st === 'listening') void stop();
    else if (st !== 'starting') void start();
  }, [start, stop]);

  const reset = useCallback(() => jamStore.getState().reset(), []);

  const addMarker = useCallback((kind: MarkerKind) => {
    const m = jamStore.getState().addMarker(kind);
    if (m) {
      toast(`${MARKER_LABEL[kind]} at ${formatTime(m.t)}`, { durationMs: 1600 });
    }
  }, []);

  const audition = useCallback((chord: Chord) => auditionChord(chord), []);

  useJamShortcuts({
    toggleListening,
    reset,
    bookmark: () => jamStore.getState().status === 'listening' && addMarker('bookmark'),
    setLevel: (vocabLevel: VocabLevel) => update({ vocabLevel }),
    togglePiano: () => setPianoVisible((v) => !v),
    toggleMode: () => update({ mode: settings.mode === 'solo' ? 'room' : 'solo' }),
    toggleScales,
  });

  const recent = useMemo(
    () => jam.timeline.slice(-4).flatMap((r) => (r.chord ? [r.chord] : [])),
    [jam.timeline],
  );
  const suggestions = useMemo(
    () => suggestNext(jam.keyEstimate, recent, settings.vocabLevel),
    [jam.keyEstimate, recent, settings.vocabLevel],
  );

  const hint =
    jam.status === 'starting'
      ? 'Starting… allow microphone access if your browser asks.'
      : jam.status === 'listening'
        ? 'Listening… play a chord.'
        : jam.status === 'error'
          ? 'Something went wrong. See the message above.'
          : jam.timeline.length > 0
            ? 'Stopped. Start again to continue, or reset the timeline.'
            : input.mock
              ? 'Tap Start to play the demo progression.'
              : 'Tap Start and allow the microphone.';

  return (
    <div className="flex h-full flex-col gap-3 px-4 pt-3 pb-[max(env(safe-area-inset-bottom),12px)] lg:px-8">
      <header className="flex flex-wrap items-center gap-x-5 gap-y-2">
        <StatusPill status={jam.status} mock={input.mock} />
        <KeyBadge keyEstimate={jam.keyEstimate} spellingFollowsKey={settings.spellingFollowsKey} />
        <SourceIndicator source={jam.source} level={jam.level} active={listening} />
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <LevelSelector
            value={settings.vocabLevel}
            onChange={(vocabLevel) => update({ vocabLevel })}
          />
          <ModeToggle value={settings.mode} onChange={(mode) => update({ mode })} />
        </div>
      </header>

      {jam.status === 'error' && jam.error && (
        <div
          role="alert"
          className="rounded-xl bg-rose-500/10 px-4 py-3 text-sm text-rose-200 ring-1 ring-rose-500/30"
        >
          {jam.error}
        </div>
      )}

      <main className="grid min-h-0 flex-1 grid-cols-1 content-start gap-6 overflow-y-auto lg:grid-cols-2 lg:content-stretch lg:gap-10 lg:overflow-visible">
        <section aria-label="Current chord" className="flex flex-col justify-center gap-8 py-2">
          <ChordDisplay
            chord={jam.currentChord}
            confidence={jam.confidence}
            keyContext={jam.keyEstimate}
            showSlash={settings.showSlashChords}
            spellingFollowsKey={settings.spellingFollowsKey}
            hint={hint}
          />
          <TryNext
            className="items-center lg:items-start"
            suggestions={suggestions}
            keyContext={jam.keyEstimate}
            onAudition={audition}
            spellingFollowsKey={settings.spellingFollowsKey}
          />
          <ModulationHints
            className="-mt-4 items-center lg:items-start"
            keyContext={jam.keyEstimate}
            level={settings.vocabLevel}
            onAudition={audition}
            spellingFollowsKey={settings.spellingFollowsKey}
          />
          <ScaleHelper
            chord={jam.currentChord}
            confidence={jam.confidence}
            keyContext={jam.keyEstimate}
            spellingFollowsKey={settings.spellingFollowsKey}
            open={scalesOpen}
            onToggle={toggleScales}
          />
        </section>

        <section
          aria-label="History and keyboard"
          className="flex min-w-0 flex-col justify-center gap-4"
        >
          <div className="rounded-2xl bg-zinc-900/40 p-3 ring-1 ring-zinc-900">
            <h2 className="mb-1 px-1 text-xs font-medium tracking-widest text-zinc-500 uppercase">
              Timeline
            </h2>
            <Timeline
              timeline={jam.timeline}
              keyHistory={jam.keyHistory}
              markers={jam.markers}
              onAudition={audition}
              showSlash={settings.showSlashChords}
              spellingFollowsKey={settings.spellingFollowsKey}
            />
          </div>
          {pianoVisible && (
            <div className="rounded-2xl bg-zinc-900/40 p-3 ring-1 ring-zinc-900">
              <Piano
                keys={wide ? 88 : 61}
                activePitchClasses={jam.activePitchClasses}
                activeMidiNotes={jam.activeMidiNotes}
                className="max-h-40"
              />
            </div>
          )}
        </section>
      </main>

      <footer className="flex flex-col gap-2 border-t border-zinc-900 pt-3">
        <TransportBar
          status={jam.status}
          onStart={() => void start()}
          onStop={() => void stop()}
          onReset={reset}
          recordAudio={jam.recordAudio}
          onToggleRecordAudio={() => jamStore.getState().toggleRecordAudio()}
          onBookmark={() => addMarker('bookmark')}
          onMarker={addMarker}
          pianoVisible={pianoVisible}
          onTogglePiano={() => setPianoVisible((v) => !v)}
        />
        <p className="hidden text-xs text-zinc-600 lg:block">
          Space start/stop · R reset · B bookmark · 1 2 3 chord level · K keyboard · M Solo/Room · S
          scales
        </p>
      </footer>
    </div>
  );
}
