import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { RefObject } from 'react';
import { Link } from 'react-router';
import { useShallow } from 'zustand/react/shallow';
import {
  AudioLines,
  Check,
  ChevronRight,
  Lightbulb,
  LockKeyhole,
  Mic,
  Play,
  Square,
  Usb,
} from 'lucide-react';
import { clock, MIN_DISPLAY_CONFIDENCE } from '@/core';
import type { Chord, JamMode, VocabLevel } from '@/core';
import { jamStore, snapToChordStart, useJamStore } from '@/state/jamStore';
import { useInputStore } from '@/state/inputStore';
import { useSettings } from '@/state/settingsStore';
import { auditionChord } from '@/app/live/audition';
import { ChordDisplay } from '../components/ChordDisplay';
import { KeyBadge } from '../components/KeyBadge';
import { Piano } from '../components/Piano';
import { Timeline } from '../components/Timeline';
import { Badge, Button, Meter, Segmented } from '../kit';
import { cx } from '../lib/cx';
import { chordSymbol, keyLabel, pretty, sameChord, sameKey } from '../lib/chordLabel';
import { MARK_ITEMS, type MarkItem } from '../lib/markers';
import { playNotes } from '../lib/playNotes';
import { useMediaQuery } from '../lib/useMediaQuery';
import { ChartCard } from './review/ChartCard';
import { JamInspector } from './jam/JamInspector';
import { JamOptions } from './jam/JamOptions';
import { MODE_OPTIONS } from './jam/labels';
import { MarkMenu } from './jam/MarkMenu';
import { useInspectorPref } from './jam/useInspectorPref';
import { useJamInput } from './jam/useJamInput';
import { useJamShortcuts } from './jam/useJamShortcuts';
import { useStoredToggle } from './jam/useStoredToggle';

function formatTime(sec: number): string {
  const s = Math.max(0, Math.floor(sec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

function useElapsed(listening: boolean, started: number | null) {
  const [now, setNow] = useState(clock.now);
  useEffect(() => {
    if (!listening || started === null) return;
    const timer = setInterval(() => setNow(clock.now()), 1000);
    return () => clearInterval(timer);
  }, [listening, started]);
  return started === null ? 0 : Math.max(0, now - started);
}

/** CSS variable the half-height Ideas sheet reads its height from. */
const IDEAS_HEIGHT_VAR = '--keel-ideas-h';
/** The sheet never gets shorter than this, even on a short landscape phone. */
const IDEAS_MIN_HEIGHT = 240;

/**
 * Sizes the half-height Ideas sheet to the room under `above` (the Finish row), so the chord,
 * the key, the timeline and Finish all stay visible above it.
 */
function useIdeasSheetHeight(active: boolean, above: RefObject<HTMLElement | null>) {
  useLayoutEffect(() => {
    const el = above.current;
    if (!active || !el) return;
    const root = document.documentElement;
    const measure = () => {
      const room = window.innerHeight - el.getBoundingClientRect().bottom - 12;
      root.style.setProperty(IDEAS_HEIGHT_VAR, `${Math.round(Math.max(IDEAS_MIN_HEIGHT, room))}px`);
    };
    measure();
    const ro = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure);
    ro?.observe(el);
    window.addEventListener('resize', measure);
    return () => {
      ro?.disconnect();
      window.removeEventListener('resize', measure);
      root.style.removeProperty(IDEAS_HEIGHT_VAR);
    };
  }, [active, above]);
}

/** Listen first. Input choices and musical helpers stay one deliberate step away. */
export function JamScreen() {
  const jam = useJamStore(
    useShallow((s) => ({
      status: s.status,
      error: s.error,
      source: s.source,
      currentChord: s.currentChord,
      confidence: s.confidence,
      previewChord: s.previewChord,
      previewConfidence: s.previewConfidence,
      previewKey: s.previewKey,
      tentativeMidiNotes: s.tentativeMidiNotes,
      keyEstimate: s.key,
      keyHistory: s.keyHistory,
      timeline: s.timeline,
      markers: s.markers,
      activePitchClasses: s.activePitchClasses,
      activeMidiNotes: s.activeMidiNotes,
      exactKeys: s.exactKeys,
      level: s.level,
      recordAudio: s.recordAudio,
      sessionStart: s.sessionStart,
      quiet: s.quiet,
      inputIssue: s.inputIssue,
    })),
  );
  const settings = useSettings(
    useShallow((s) => ({
      vocabLevel: s.vocabLevel,
      mode: s.mode,
      instrument: s.instrument,
      sensitivity: s.sensitivity,
      audioDeviceId: s.audioDeviceId,
      showSlashChords: s.showSlashChords,
      spellingFollowsKey: s.spellingFollowsKey,
      recordAudioByDefault: s.recordAudioByDefault,
      update: s.update,
    })),
  );
  const devices = useInputStore((s) => s.audioDevices);
  const input = useJamInput();
  const wide = useMediaQuery('(min-width: 1024px)', true);
  const phone = !useMediaQuery('(min-width: 640px)', true);
  // Where a side panel fits beside the centred controls, Ideas floats over the right edge and
  // nothing moves; narrower, it is a sheet under the Finish row.
  const sideIdeas = useMediaQuery('(min-width: 1180px)', true);
  const [pianoVisible, togglePiano] = useStoredToggle('keel.ui.piano', true);
  const inspector = useInspectorPref();
  const listening = jam.status === 'listening';
  const starting = jam.status === 'starting';
  const elapsed = useElapsed(listening, jam.sessionStart);
  // "Can't hear much" is decided by the live input, which also keeps those chords out.
  const inputStopped = listening && !!jam.inputIssue && jam.source !== 'midi';
  const quiet = listening && !input.mock && !jam.inputIssue && jam.quiet;
  const readoutBlocked = quiet || inputStopped;
  const stopped = input.finished && !listening && !starting;
  // While the input is too quiet a chord (and the key built from it) would be a guess.
  const previewChord =
    !readoutBlocked && jam.previewChord && jam.previewConfidence >= MIN_DISPLAY_CONFIDENCE
      ? jam.previewChord
      : null;
  const committedChord =
    !readoutBlocked && jam.confidence >= MIN_DISPLAY_CONFIDENCE ? jam.currentChord : null;
  const tentativeHero = !committedChord && !!previewChord;
  const shownChord = committedChord ?? previewChord;
  const shownConfidence = committedChord ? jam.confidence : jam.previewConfidence;
  const hasChord = !!shownChord;
  const primaryKey = jam.keyEstimate ?? jam.previewKey;
  // Candidates get one quiet, reserved line; they never displace an established result.
  const candidateChord =
    committedChord && previewChord && !sameChord(committedChord, previewChord)
      ? previewChord
      : null;
  const candidateKey =
    jam.keyEstimate && jam.previewKey && !sameKey(jam.keyEstimate, jam.previewKey)
      ? jam.previewKey
      : null;
  const candidateLabel =
    !readoutBlocked && !starting
      ? candidateChord
        ? `Tentative: ${pretty(
            chordSymbol(candidateChord, jam.keyEstimate, {
              showSlash: settings.showSlashChords,
              spellingFollowsKey: settings.spellingFollowsKey,
            }),
          )}`
        : candidateKey
          ? `Tentative key: ${pretty(keyLabel(candidateKey, { spellingFollowsKey: settings.spellingFollowsKey }))}`
          : ''
      : '';
  // Compact widths: Ideas is a sheet under the Finish row; chord, key and timeline stay above.
  const halfIdeas = inspector.open && !sideIdeas;
  const sideOpen = inspector.open && sideIdeas;
  const live = listening || starting;
  const finishRow = useRef<HTMLDivElement>(null);
  useIdeasSheetHeight(halfIdeas && live, finishRow);
  // Red dot and "Recording" only while audio is really being kept.
  const recording =
    listening && !jam.inputIssue && !input.mock && jam.recordAudio && jam.source === 'mic';
  const inputLabel =
    jam.source === 'midi' && listening
      ? 'USB MIDI'
      : (devices.find((d) => d.id === settings.audioDeviceId)?.label ?? 'Device microphone');

  useEffect(() => {
    if (jamStore.getState().status !== 'listening')
      jamStore.getState().setRecordAudio(settings.recordAudioByDefault);
  }, [settings.recordAudioByDefault]);

  const { start, stop, newSong } = input;
  const toggleListening = useCallback(() => {
    if (input.saving) return;
    const status = jamStore.getState().status;
    if (status === 'listening') void stop();
    else if (status !== 'starting') void start();
  }, [start, stop, input.saving]);
  // The flag in the timeline is the confirmation; no toast. A mark tapped just after a chord
  // change belongs to that chord, so it snaps back to where the chord began.
  const addMarker = useCallback(
    (item: MarkItem) => {
      const s = jamStore.getState();
      const now = s.sessionStart !== null ? Math.max(0, clock.now() - s.sessionStart) : s.lastT;
      const t = snapToChordStart(s.timeline, now);
      const marker = s.addMarker(item.kind, item.markerLabel, t);
      if (marker && item.newSong) newSong(t);
    },
    [newSong],
  );
  const audition = useCallback((chord: Chord) => auditionChord(chord), []);
  const setMode = (mode: JamMode) => settings.update({ mode });
  useJamShortcuts({
    toggleListening,
    bookmark: () => jamStore.getState().status === 'listening' && addMarker(MARK_ITEMS[0]),
    setLevel: (vocabLevel: VocabLevel) => settings.update({ vocabLevel }),
    togglePiano,
    toggleMode: () => setMode(settings.mode === 'solo' ? 'room' : 'solo'),
    toggleInspector: () => inspector.setOpen(!inspector.open),
    showNext: () => inspector.toggleTab('next'),
    showScales: () => inspector.toggleTab('scales'),
    showVoicings: () => inspector.toggleTab('voicings'),
    // "Change key" is the end of the Next tab now.
    showModulate: () => inspector.toggleTab('next'),
  });
  // The Finished screen draws the take as the same folded chart Review shows.
  const finishedChart = useMemo(
    () => ({
      chords: jam.timeline,
      keys: jam.keyHistory.map((k, i) => ({
        id: String(i),
        sessionId: jam.timeline[0]?.sessionId ?? '',
        t: k.t,
        key: k.key,
      })),
      markers: jam.markers,
    }),
    [jam.timeline, jam.keyHistory, jam.markers],
  );
  const options = (compact: boolean) => (
    <JamOptions
      compact={compact}
      vocabLevel={settings.vocabLevel}
      onVocabLevel={(vocabLevel) => settings.update({ vocabLevel })}
      mode={settings.mode}
      onMode={setMode}
      instrument={settings.instrument}
      onInstrument={(instrument) => settings.update({ instrument })}
      sensitivity={settings.sensitivity}
      onSensitivity={(sensitivity) => settings.update({ sensitivity })}
      recordAudio={jam.recordAudio}
      recordingLocked={listening || starting || input.mock}
      onRecordAudio={(on) => jamStore.getState().setRecordAudio(on)}
      pianoVisible={pianoVisible}
      onPianoVisible={togglePiano}
      canShowPiano={!phone}
    />
  );
  const timeline = (
    <Timeline
      align="start"
      timeline={jam.timeline}
      keyHistory={jam.keyHistory}
      markers={jam.markers}
      onAudition={audition}
      showSlash={settings.showSlashChords}
      spellingFollowsKey={settings.spellingFollowsKey}
    />
  );

  return (
    <div className="flex h-full flex-col overflow-y-auto">
      <header className="material hairline-b sticky top-0 z-10 flex min-h-16 shrink-0 items-center justify-between px-4 sm:px-6">
        <h1 className="text-title-3 font-semibold tracking-tight">Listen</h1>
        {options(true)}
      </header>
      <main
        className={cx(
          'mx-auto flex w-full max-w-3xl flex-1 flex-col px-4',
          halfIdeas ? 'pb-3' : 'pb-8 sm:pb-10',
        )}
      >
        {(live || input.mock) && (
          <div
            data-testid="listen-status"
            className="flex h-13 shrink-0 items-center justify-between gap-3 text-subhead text-label-2"
          >
            <div className="flex shrink-0 items-center gap-2">
              {input.mock ? (
                <Badge>Demo</Badge>
              ) : (
                live && (
                  <>
                    {/* The dot means one thing: audio is being kept. */}
                    {recording && <span className="size-2 rounded-full bg-live" aria-hidden />}
                    <span>
                      {inputStopped
                        ? 'Input stopped'
                        : starting
                          ? 'Connecting…'
                          : recording
                            ? 'Recording'
                            : 'Listening'}
                    </span>
                  </>
                )
              )}
              {listening && (
                <time className="tabular" aria-label="Session duration">
                  {formatTime(elapsed)}
                </time>
              )}
            </div>
            {live && (
              <div className="flex min-w-0 items-center gap-2">
                {input.mock ? (
                  <span className="truncate">Example progression</span>
                ) : (
                  <>
                    {jam.source === 'midi' ? (
                      <Usb className="size-4 shrink-0" aria-hidden />
                    ) : (
                      <Mic className="size-4 shrink-0" aria-hidden />
                    )}
                    <span className="min-w-0 truncate">{inputLabel}</span>
                    <Meter
                      level={jam.inputIssue ? 0 : jam.level}
                      active={listening && !jam.inputIssue}
                      bars={7}
                    />
                  </>
                )}
              </div>
            )}
          </div>
        )}
        {listening && jam.inputIssue && jam.source === 'midi' && (
          <p role="status" className="py-3 text-center text-subhead text-label-2">
            {jam.inputIssue}
          </p>
        )}
        {!listening && !starting && !stopped && !input.saving ? (
          <>
            <div className="flex flex-1 flex-col items-center justify-center py-10 text-center sm:py-14">
              <AudioLines className="mb-6 size-16 text-label-3" strokeWidth={1.25} aria-hidden />
              <h2 className="max-w-sm text-title-1 leading-tight font-semibold tracking-tight text-balance">
                See what you’re playing.
              </h2>
              <p className="mt-2 text-subhead text-label-2">
                {input.mock
                  ? 'A scripted progression. Nothing is saved.'
                  : 'Chords and key, as you play.'}
              </p>
              {jam.status === 'error' && jam.error && (
                <p role="alert" className="mt-6 max-w-md text-subhead leading-relaxed text-live">
                  {jam.error}
                </p>
              )}
              <div className="mt-8 flex w-full max-w-80 flex-col gap-3">
                <Segmented
                  fill
                  aria-label="Listen to"
                  value={settings.mode}
                  onChange={setMode}
                  options={MODE_OPTIONS}
                  className="[&>button]:h-11"
                />
                <Button
                  variant="filled"
                  size="lg"
                  leading={
                    input.mock ? (
                      <Play className="size-4 fill-current" aria-hidden />
                    ) : (
                      <Mic className="size-[18px]" aria-hidden />
                    )
                  }
                  onClick={() => void start()}
                >
                  {input.mock
                    ? 'Start demo'
                    : jam.status === 'error'
                      ? 'Try again'
                      : 'Start listening'}
                </Button>
                {input.mock ? (
                  <Button variant="plain" onClick={() => void input.startLive()}>
                    Use my microphone
                  </Button>
                ) : (
                  <Button variant="plain" onClick={input.startDemo}>
                    Try a demo
                  </Button>
                )}
              </div>
            </div>
            {!input.mock && (
              <p className="flex items-center justify-center gap-1.5 pt-4 text-footnote text-label-2">
                <LockKeyhole className="size-3" aria-hidden />
                Audio stays on this device.
              </p>
            )}
          </>
        ) : stopped || input.saving ? (
          <div className="flex flex-1 flex-col items-center justify-center py-12 text-center sm:py-16">
            {input.saved && (
              <span className="mb-5 flex size-12 items-center justify-center rounded-full bg-ok/12 text-ok">
                <Check className="size-6" aria-hidden />
              </span>
            )}
            <h2 className="text-title-1 leading-tight font-semibold tracking-tight">
              {input.saving
                ? 'Saving your jam…'
                : input.mock
                  ? 'That’s the idea.'
                  : input.saveError
                    ? 'Your jam couldn’t be saved.'
                    : input.saved
                      ? 'Your jam is saved.'
                      : 'Nothing was heard.'}
            </h2>
            {!input.saving && (
              <p
                role={input.saveError ? 'alert' : 'status'}
                className="mt-4 max-w-md text-body leading-relaxed text-label-2"
              >
                {input.mock
                  ? 'Now try your own instrument.'
                  : (input.saveError ??
                    (input.saved
                      ? `“${input.saved.name}” is in your Library.`
                      : 'No chords were heard, so nothing was saved. Move closer to your instrument and try again.'))}
              </p>
            )}
            {!input.saving && (
              <div className="mt-8 flex flex-wrap justify-center gap-3">
                {input.saved && (
                  <Link
                    to={`/review/${input.saved.id}`}
                    className="inline-flex min-h-12 items-center gap-1 rounded-control bg-action pr-5 pl-6 text-body font-semibold text-accent-fg transition-[filter] hover:brightness-110"
                  >
                    Open session <ChevronRight className="size-5" aria-hidden />
                  </Link>
                )}
                <Button
                  variant={input.saved ? 'gray' : 'filled'}
                  size="lg"
                  onClick={() => void input.startLive()}
                >
                  {input.mock ? 'Start listening' : 'Start a new jam'}
                </Button>
                {input.mock && (
                  <Button variant="plain" size="lg" onClick={input.startDemo}>
                    Play demo again
                  </Button>
                )}
              </div>
            )}
            {jam.timeline.length > 0 && !input.saveError && (
              <div className="mt-9 w-full max-w-2xl text-left">
                <ChartCard
                  full={finishedChart}
                  spellingFollowsKey={settings.spellingFollowsKey}
                  showSlash={settings.showSlashChords}
                />
              </div>
            )}
          </div>
        ) : (
          <>
            <div
              className={cx(
                'flex flex-col items-center justify-center',
                // With the Ideas sheet up the screen packs to the top, so the sheet gets the rest.
                halfIdeas ? 'py-2' : 'min-h-[260px] flex-1 py-8 sm:min-h-[340px] sm:py-10',
              )}
            >
              {hasChord ? (
                <>
                  <ChordDisplay
                    details={false}
                    compact={halfIdeas}
                    chord={shownChord}
                    confidence={shownConfidence}
                    tentative={tentativeHero}
                    keyContext={jam.keyEstimate}
                    showSlash={settings.showSlashChords}
                    spellingFollowsKey={settings.spellingFollowsKey}
                  />
                </>
              ) : (
                <div className="max-w-md text-center" role={readoutBlocked ? 'status' : undefined}>
                  <h2 className="text-title-1 font-semibold tracking-tight">
                    {inputStopped
                      ? 'Input stopped'
                      : starting
                        ? 'Connecting your instrument…'
                        : quiet
                          ? 'Can’t hear much.'
                          : 'Play a chord.'}
                  </h2>
                  <p className="mt-3 text-body leading-relaxed text-label-2">
                    {inputStopped
                      ? jam.inputIssue
                      : starting
                        ? 'Allow microphone access if your browser asks.'
                        : quiet
                          ? 'Move closer to your instrument, or raise sensitivity in Listening options.'
                          : 'Hold it briefly. Your chord and key will appear here.'}
                  </p>
                </div>
              )}
              {!readoutBlocked && !starting && (hasChord || jam.previewKey || jam.keyEstimate) && (
                <KeyBadge
                  primaryOnly
                  keyEstimate={primaryKey}
                  tentative={!jam.keyEstimate && !!jam.previewKey}
                  spellingFollowsKey={settings.spellingFollowsKey}
                  className="mt-3"
                />
              )}
              <div
                data-testid="live-candidate"
                aria-live="off"
                aria-hidden={!candidateLabel ? true : undefined}
                className="mt-2 flex h-6 max-w-full shrink-0 items-center justify-center px-4 text-callout text-label-2"
              >
                <span className="truncate">{candidateLabel}</span>
              </div>
              {pianoVisible && listening && !inputStopped && !phone && !halfIdeas && (
                <div className="mt-8 w-full">
                  <Piano
                    keys={wide ? 88 : 61}
                    activeMidiNotes={quiet ? [] : jam.activeMidiNotes}
                    tentativeMidiNotes={quiet ? [] : jam.tentativeMidiNotes}
                  />
                  <div
                    className="mt-2 flex justify-center gap-4 text-caption text-label-2"
                    aria-label="Keyboard note legend"
                  >
                    <span className="flex items-center gap-1.5">
                      <span aria-hidden className="size-2.5 rounded-sm border-2 border-accent" />
                      Tentative
                    </span>
                    <span className="flex items-center gap-1.5">
                      <span aria-hidden className="size-2.5 rounded-sm bg-accent" />
                      Confirmed
                    </span>
                  </div>
                </div>
              )}
            </div>
            {jam.timeline.length > 0 && (
              <section
                aria-label="Your progression"
                className={cx(
                  'hairline-t',
                  halfIdeas ? 'py-2' : 'py-4',
                  // The floating Ideas panel covers the column's right edge, where the newest
                  // chord is: the strip ends at the panel (the chord above does not move).
                  sideOpen && 'pr-[max(0px,calc(316px-(100vw-976px)/2))]',
                )}
              >
                {timeline}
              </section>
            )}
            <div className={cx('flex flex-col items-center gap-4', halfIdeas ? 'pt-2' : 'pt-5')}>
              <div
                ref={finishRow}
                className="flex w-full flex-wrap items-center justify-center gap-3"
              >
                <Button
                  variant="filled"
                  size="lg"
                  className="min-w-48"
                  leading={
                    starting ? undefined : <Square className="size-4 fill-current" aria-hidden />
                  }
                  onClick={() => void stop()}
                >
                  {starting ? 'Cancel' : input.mock ? 'Stop demo' : 'Finish & save'}
                </Button>
                {listening && <MarkMenu onMark={addMarker} />}
              </div>
              {!halfIdeas && (
                <div className="flex flex-wrap items-center justify-center gap-x-3">
                  {listening && (
                    <Button
                      variant="plain"
                      leading={<Lightbulb className="size-4" aria-hidden />}
                      onClick={() => inspector.setOpen(!inspector.open)}
                      pressed={inspector.open}
                    >
                      Ideas
                    </Button>
                  )}
                </div>
              )}
              {input.mock && !halfIdeas && (
                <p className="text-footnote text-label-2">Demo sessions aren’t saved.</p>
              )}
            </div>
          </>
        )}
      </main>
      <JamInspector
        open={inspector.open}
        onClose={() => inspector.setOpen(false)}
        tab={inspector.tab}
        onTab={inspector.setTab}
        chord={committedChord}
        confidence={jam.confidence}
        keyContext={jam.keyEstimate}
        // With a band always shows simple chords, so Ideas stays at that level too.
        level={settings.mode === 'room' ? 1 : settings.vocabLevel}
        spellingFollowsKey={settings.spellingFollowsKey}
        onAudition={audition}
        onPlayNotes={playNotes}
        layout={sideIdeas ? 'side' : 'half'}
      />
    </div>
  );
}
