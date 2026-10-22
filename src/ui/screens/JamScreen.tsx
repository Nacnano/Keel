import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { Bookmark, ChevronDown, Flag, Lightbulb, Mic, Play, Square, Usb } from 'lucide-react';
import type { Chord, MarkerKind, VocabLevel } from '@/core';
import { jamStore, useJamStore } from '@/state/jamStore';
import type { JamStatus } from '@/state/jamStore';
import { useSettings } from '@/state/settingsStore';
import { auditionChord } from '@/app/live/audition';
import { ChordDisplay } from '../components/ChordDisplay';
import { KeyBadge } from '../components/KeyBadge';
import { Piano } from '../components/Piano';
import { Timeline } from '../components/Timeline';
import { toast } from '../components/toastStore';
import { Badge, Button, Meter, Popover, Toolbar } from '../kit';
import { cx } from '../lib/cx';
import { MARKER_LABEL, SECTION_KINDS } from '../lib/markers';
import { playNotes } from '../lib/playNotes';
import { suggestNext } from '../lib/suggest';
import { useMediaQuery } from '../lib/useMediaQuery';
import { JamInspector } from './jam/JamInspector';
import { JamOptions } from './jam/JamOptions';
import { useInspectorPref } from './jam/useInspectorPref';
import { useJamInput } from './jam/useJamInput';
import { useJamShortcuts } from './jam/useJamShortcuts';
import { useStoredToggle } from './jam/useStoredToggle';

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

/** Quiet-input watchdog: true after the input has been near-silent for a few seconds. */
function useQuietInput(listening: boolean, level: number, seconds = 4): boolean {
  const [quiet, setQuiet] = useState(false);
  const since = useRef<number | null>(null);
  useEffect(() => {
    if (!listening) {
      since.current = null;
      setQuiet(false);
      return;
    }
    if (level > 0.06) {
      since.current = null;
      setQuiet(false);
      return;
    }
    since.current ??= Date.now();
    const id = setTimeout(() => {
      if (since.current && Date.now() - since.current >= seconds * 1000) setQuiet(true);
    }, seconds * 1000);
    return () => clearTimeout(id);
  }, [listening, level, seconds]);
  return quiet;
}

function StatusPill({
  status,
  source,
  level,
  mock,
}: {
  status: JamStatus;
  source: 'mic' | 'midi' | null;
  level: number;
  mock: boolean;
}) {
  const listening = status === 'listening';
  return (
    <div className="flex min-h-10 items-center gap-2.5">
      <span
        aria-hidden
        className={cx(
          'size-2.5 rounded-full',
          listening && 'anim-pulse-soft bg-live',
          status === 'starting' && 'bg-warn',
          status === 'error' && 'bg-live',
          status === 'idle' && 'bg-label-4',
        )}
      />
      <span
        role="status"
        className={cx('text-subhead font-semibold', listening ? 'text-label' : 'text-label-2')}
      >
        {STATUS_LABEL[status]}
      </span>
      {listening && (
        <span
          className="hidden items-center gap-1.5 text-label-2 sm:flex"
          title={source === 'midi' ? 'MIDI' : 'Microphone'}
        >
          {source === 'midi' ? (
            <Usb className="size-4" aria-hidden />
          ) : (
            <Mic className="size-4" aria-hidden />
          )}
          <Meter level={level} active bars={7} />
        </span>
      )}
      {mock && <Badge className="hidden sm:inline-flex">Demo</Badge>}
    </div>
  );
}

function SectionMenu({ disabled, onPick }: { disabled: boolean; onPick(kind: MarkerKind): void }) {
  return (
    <Popover
      align="end"
      width={200}
      aria-label="Mark a section"
      trigger={(t) => (
        <Button
          variant="gray"
          disabled={disabled}
          leading={<Flag className="size-4" aria-hidden />}
          trailing={<ChevronDown className="size-3.5 opacity-60" aria-hidden />}
          {...t}
        >
          Section
        </Button>
      )}
    >
      <ul className="flex flex-col">
        {SECTION_KINDS.map((k) => (
          <li key={k}>
            <button
              type="button"
              onClick={() => onPick(k)}
              className="flex h-10 w-full items-center rounded-[8px] px-3 text-left text-subhead text-label hover:bg-fill-4"
            >
              {MARKER_LABEL[k]}
            </button>
          </li>
        ))}
      </ul>
    </Popover>
  );
}

/** The one screen in use during a jam: chord, key, timeline. Ideas live in the inspector. */
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
  const [pianoVisible, togglePiano] = useStoredToggle('jamkey.ui.piano', true);
  const inspector = useInspectorPref();

  // Per-session recording choice starts from the settings default.
  useEffect(() => {
    if (jamStore.getState().status !== 'listening') {
      jamStore.getState().setRecordAudio(settings.recordAudioByDefault);
    }
  }, [settings.recordAudioByDefault]);

  const listening = jam.status === 'listening';
  const quiet = useQuietInput(listening && jam.source !== 'midi', jam.level);
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
    if (m) toast(`${MARKER_LABEL[kind]} at ${formatTime(m.t)}`, { durationMs: 1600 });
  }, []);

  const audition = useCallback((chord: Chord) => auditionChord(chord), []);

  useJamShortcuts({
    toggleListening,
    reset,
    bookmark: () => jamStore.getState().status === 'listening' && addMarker('bookmark'),
    setLevel: (vocabLevel: VocabLevel) => update({ vocabLevel }),
    togglePiano,
    toggleMode: () => update({ mode: settings.mode === 'solo' ? 'room' : 'solo' }),
    toggleInspector: () => inspector.setOpen(!inspector.open),
    showNext: () => inspector.toggleTab('next'),
    showScales: () => inspector.toggleTab('scales'),
    showVoicings: () => inspector.toggleTab('voicings'),
    showModulate: () => inspector.toggleTab('keys'),
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
      ? 'Starting… allow the microphone if your browser asks.'
      : jam.status === 'error'
        ? 'Something went wrong. See the message above.'
        : listening
          ? quiet
            ? 'Can’t hear much. Move closer to the piano, or raise the input level in Settings.'
            : jam.timeline.length === 0
              ? 'Play a chord and hold it.'
              : 'Listening'
          : jam.timeline.length > 0
            ? 'Stopped. Start again to continue, or clear the timeline from Options.'
            : input.mock
              ? 'Tap Start to play the demo progression.'
              : 'Tap Start, then play. The chord and key appear here.';

  return (
    <div className="flex h-full flex-col">
      <Toolbar
        sticky={false}
        className="hairline-b"
        leading={
          <StatusPill status={jam.status} source={jam.source} level={jam.level} mock={input.mock} />
        }
        title={
          <KeyBadge
            keyEstimate={jam.keyEstimate}
            spellingFollowsKey={settings.spellingFollowsKey}
          />
        }
        trailing={
          <>
            <Button
              variant={inspector.open ? 'tinted' : 'plain'}
              pressed={inspector.open}
              leading={<Lightbulb className="size-[18px]" aria-hidden />}
              onClick={() => inspector.setOpen(!inspector.open)}
              aria-label="Ideas"
            >
              <span className="hidden sm:inline">Ideas</span>
            </Button>
            <JamOptions
              vocabLevel={settings.vocabLevel}
              onVocabLevel={(vocabLevel) => update({ vocabLevel })}
              mode={settings.mode}
              onMode={(mode) => update({ mode })}
              recordAudio={jam.recordAudio}
              onRecordAudio={(on) => jamStore.getState().setRecordAudio(on)}
              pianoVisible={pianoVisible}
              onPianoVisible={togglePiano}
              onReset={reset}
              canReset={jam.timeline.length > 0}
            />
          </>
        }
      />

      {jam.status === 'error' && jam.error && (
        <div
          role="alert"
          className="mx-4 mt-3 rounded-cell bg-live/12 px-4 py-3 text-subhead text-live"
        >
          {jam.error}
        </div>
      )}

      <main
        className={cx(
          'flex min-h-0 flex-1 flex-col items-center justify-center gap-6 px-4 py-4 transition-[padding] duration-300',
          inspector.open && wide && 'lg:pr-[400px]',
        )}
      >
        <ChordDisplay
          chord={jam.currentChord}
          confidence={jam.confidence}
          keyContext={jam.keyEstimate}
          showSlash={settings.showSlashChords}
          spellingFollowsKey={settings.spellingFollowsKey}
          hint={hint}
          idle={jam.status === 'idle' && jam.timeline.length === 0}
        />
        {pianoVisible && (
          <Piano
            keys={wide ? 88 : 61}
            activePitchClasses={jam.activePitchClasses}
            activeMidiNotes={jam.activeMidiNotes}
            className="w-full max-w-4xl"
          />
        )}
      </main>

      <section
        aria-label="Timeline"
        className={cx(
          'mx-4 mb-3 rounded-card bg-surface px-3 py-1 transition-[margin] duration-300',
          inspector.open && wide && 'lg:mr-[400px]',
        )}
      >
        <Timeline
          timeline={jam.timeline}
          keyHistory={jam.keyHistory}
          markers={jam.markers}
          onAudition={audition}
          showSlash={settings.showSlashChords}
          spellingFollowsKey={settings.spellingFollowsKey}
        />
      </section>

      <footer className="material hairline-t flex items-center justify-center gap-2 px-4 py-3 lg:pb-3">
        {listening ? (
          <Button
            size="lg"
            variant="filled"
            destructive
            round
            className="min-w-36"
            leading={<Square className="size-4 fill-current" aria-hidden />}
            onClick={() => void stop()}
          >
            Stop
          </Button>
        ) : (
          <Button
            size="lg"
            variant="filled"
            round
            className="min-w-36"
            loading={jam.status === 'starting'}
            leading={<Play className="size-4 fill-current" aria-hidden />}
            onClick={() => void start()}
          >
            Start
          </Button>
        )}
        <Button
          variant="gray"
          disabled={!listening}
          leading={<Bookmark className="size-4" aria-hidden />}
          onClick={() => addMarker('bookmark')}
        >
          <span className="hidden sm:inline">Bookmark</span>
        </Button>
        <SectionMenu disabled={!listening} onPick={addMarker} />
        {jam.recordAudio && listening && (
          <Badge tone="live" className="ml-1">
            REC
          </Badge>
        )}
      </footer>

      <JamInspector
        open={inspector.open}
        onClose={() => inspector.setOpen(false)}
        tab={inspector.tab}
        onTab={inspector.setTab}
        chord={jam.currentChord}
        confidence={jam.confidence}
        keyContext={jam.keyEstimate}
        level={settings.vocabLevel}
        suggestions={suggestions}
        spellingFollowsKey={settings.spellingFollowsKey}
        onAudition={audition}
        onPlayNotes={playNotes}
      />
    </div>
  );
}
