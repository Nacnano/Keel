import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router';
import { useShallow } from 'zustand/react/shallow';
import { ArrowUpRight, Bookmark, Check, Lightbulb, Mic, Play, Square, Usb } from 'lucide-react';
import { clock, MIN_DISPLAY_CONFIDENCE } from '@/core';
import type { Chord, MarkerKind, VocabLevel } from '@/core';
import { jamStore, useJamStore } from '@/state/jamStore';
import { useInputStore } from '@/state/inputStore';
import { useSettings } from '@/state/settingsStore';
import { auditionChord } from '@/app/live/audition';
import { ChordDisplay } from '../components/ChordDisplay';
import { KeyBadge } from '../components/KeyBadge';
import { Piano } from '../components/Piano';
import { Timeline } from '../components/Timeline';
import { toast } from '../components/toastStore';
import { Badge, Button, Meter } from '../kit';
import { cx } from '../lib/cx';
import { MARKER_LABEL } from '../lib/markers';
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

/** A quiet-input nudge waits long enough for the player to reach the keys. */
function useQuietInput(listening: boolean, level: number): boolean {
  const [quiet, setQuiet] = useState(false);
  const since = useRef<number | null>(null);
  useEffect(() => {
    if (!listening || level > 0.06) {
      since.current = null;
      setQuiet(false);
      return;
    }
    since.current ??= Date.now();
    const timer = setTimeout(
      () => {
        if (since.current !== null && Date.now() - since.current >= 4000) setQuiet(true);
      },
      Math.max(0, 4000 - (Date.now() - since.current)),
    );
    return () => clearTimeout(timer);
  }, [listening, level]);
  return quiet;
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
      keyEstimate: s.key,
      keyHistory: s.keyHistory,
      timeline: s.timeline,
      markers: s.markers,
      activePitchClasses: s.activePitchClasses,
      activeMidiNotes: s.activeMidiNotes,
      level: s.level,
      recordAudio: s.recordAudio,
      sessionStart: s.sessionStart,
    })),
  );
  const settings = useSettings(
    useShallow((s) => ({
      vocabLevel: s.vocabLevel,
      mode: s.mode,
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
  const [pianoVisible, togglePiano] = useStoredToggle('jamkey.ui.piano', false);
  const inspector = useInspectorPref();
  const listening = jam.status === 'listening';
  const starting = jam.status === 'starting';
  const elapsed = useElapsed(listening, jam.sessionStart);
  const quiet = useQuietInput(listening && !input.mock && jam.source !== 'midi', jam.level);
  const stopped = input.finished && !listening && !starting;
  const hasChord = jam.currentChord && jam.confidence >= MIN_DISPLAY_CONFIDENCE;
  const inputLabel =
    jam.source === 'midi' && listening
      ? 'USB MIDI'
      : (devices.find((d) => d.id === settings.audioDeviceId)?.label ?? 'Device microphone');

  useEffect(() => {
    if (jamStore.getState().status !== 'listening')
      jamStore.getState().setRecordAudio(settings.recordAudioByDefault);
  }, [settings.recordAudioByDefault]);

  const { start, stop } = input;
  const toggleListening = useCallback(() => {
    if (input.saving) return;
    const status = jamStore.getState().status;
    if (status === 'listening') void stop();
    else if (status !== 'starting') void start();
  }, [start, stop, input.saving]);
  const reset = useCallback(() => jamStore.getState().reset(), []);
  const addMarker = useCallback((kind: MarkerKind) => {
    const marker = jamStore.getState().addMarker(kind);
    if (marker) toast(`${MARKER_LABEL[kind]} at ${formatTime(marker.t)}`, { durationMs: 1600 });
  }, []);
  const audition = useCallback((chord: Chord) => auditionChord(chord), []);
  useJamShortcuts({
    toggleListening,
    reset,
    bookmark: () => jamStore.getState().status === 'listening' && addMarker('bookmark'),
    setLevel: (vocabLevel: VocabLevel) => settings.update({ vocabLevel }),
    togglePiano,
    toggleMode: () => settings.update({ mode: settings.mode === 'solo' ? 'room' : 'solo' }),
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
  const options = (
    <JamOptions
      vocabLevel={settings.vocabLevel}
      onVocabLevel={(vocabLevel) => settings.update({ vocabLevel })}
      mode={settings.mode}
      onMode={(mode) => settings.update({ mode })}
      sensitivity={settings.sensitivity}
      onSensitivity={(sensitivity) => settings.update({ sensitivity })}
      recordAudio={jam.recordAudio}
      recordingLocked={listening || starting || input.mock}
      onRecordAudio={(on) => jamStore.getState().setRecordAudio(on)}
      pianoVisible={pianoVisible}
      onPianoVisible={togglePiano}
      onReset={reset}
      canReset={listening && jam.timeline.length > 0}
      listening={listening}
      onSection={addMarker}
      inputLabel={inputLabel}
    />
  );

  return (
    <div className="flex h-full flex-col overflow-y-auto">
      <header className="mx-auto flex w-full max-w-[900px] items-center justify-between gap-3 px-6 py-5 sm:px-10 sm:py-7">
        <h1 className="text-title-2 font-semibold tracking-tight">Listen</h1>
        {listening || starting ? (
          <div className="flex items-center gap-2 text-subhead text-label-2">
            {input.mock ? (
              <Badge>Demo</Badge>
            ) : (
              <>
                <span className="size-2 rounded-full bg-live" aria-hidden />
                <span>{starting ? 'Connecting…' : 'Listening'}</span>
              </>
            )}
            {listening && (
              <time className="ml-1 tabular" aria-label="Session duration">
                {formatTime(elapsed)}
              </time>
            )}
          </div>
        ) : (
          input.mock && <Badge>Demo</Badge>
        )}
      </header>

      <main
        className={cx(
          'mx-auto flex w-full max-w-[900px] flex-1 flex-col px-6 pb-8 sm:px-10 sm:pb-10',
          inspector.open && wide && 'lg:pr-[400px]',
        )}
      >
        {!listening && !starting && !stopped && !input.saving ? (
          <div className="flex flex-1 flex-col items-start justify-center py-12 sm:py-20">
            <h2 className="max-w-lg text-[clamp(2.25rem,5vw,3.5rem)] leading-[1.08] font-semibold tracking-[-0.035em] text-balance">
              See what you’re playing.
            </h2>
            <p className="mt-5 max-w-md text-body leading-relaxed text-label-2 sm:text-title-3">
              Play your piano or guitar. JamKey follows the chords and finds the key as you go.
            </p>
            {jam.status === 'error' && jam.error && (
              <p role="alert" className="mt-6 max-w-md text-subhead leading-relaxed text-live">
                {jam.error}
              </p>
            )}
            <Button
              className="mt-9 min-w-52"
              variant="filled"
              size="lg"
              round
              leading={
                input.mock ? (
                  <Play className="size-5 fill-current" aria-hidden />
                ) : (
                  <Mic className="size-5" aria-hidden />
                )
              }
              onClick={() => void start()}
            >
              {input.mock ? 'Start demo' : jam.status === 'error' ? 'Try again' : 'Start listening'}
            </Button>
            <div className="mt-3 flex flex-wrap items-center gap-x-3">
              {input.mock ? (
                <Button variant="plain" onClick={() => void input.startLive()}>
                  Use my microphone
                </Button>
              ) : (
                <Button
                  variant="plain"
                  onClick={input.startDemo}
                  leading={<Play className="size-3.5" aria-hidden />}
                >
                  Try a demo
                </Button>
              )}
              {options}
            </div>
            <p className="mt-8 max-w-md text-footnote leading-relaxed text-label-2">
              {input.mock
                ? 'An example progression. No microphone access or saving.'
                : 'Your microphone stays on this device. Chord charts save to your Library when you finish.'}
            </p>
          </div>
        ) : stopped || input.saving ? (
          <div className="flex flex-1 flex-col items-start justify-center py-12 sm:py-16">
            {input.saved && (
              <span className="mb-5 flex size-12 items-center justify-center rounded-full bg-ok/12 text-ok">
                <Check className="size-6" aria-hidden />
              </span>
            )}
            <h2 className="text-[clamp(2rem,4vw,3rem)] leading-tight font-semibold tracking-[-0.03em]">
              {input.saving
                ? 'Saving your jam…'
                : input.mock
                  ? 'That’s the idea.'
                  : input.saveError
                    ? 'Your jam couldn’t be saved.'
                    : input.saved
                      ? 'Your jam is saved.'
                      : 'Session finished.'}
            </h2>
            <p
              role={input.saveError ? 'alert' : 'status'}
              className="mt-4 max-w-md text-body leading-relaxed text-label-2"
            >
              {input.saving
                ? 'Keeping your chord chart in Library.'
                : input.mock
                  ? 'Now try your own instrument. The microphone will follow what you play.'
                  : (input.saveError ??
                    (input.saved
                      ? `“${input.saved.name}” is ready in your Library.`
                      : 'Start a new jam whenever you’re ready.'))}
            </p>
            {!input.saving && (
              <div className="mt-8 flex flex-wrap gap-3">
                {input.saved && (
                  <Link
                    to={`/review/${input.saved.id}`}
                    className="inline-flex min-h-13 items-center gap-2 rounded-full bg-action px-6 text-body font-semibold text-accent-fg"
                  >
                    Open session <ArrowUpRight className="size-4" aria-hidden />
                  </Link>
                )}
                <Button
                  variant={input.saved ? 'gray' : 'filled'}
                  round
                  size="lg"
                  onClick={() => void input.startLive()}
                >
                  {input.mock ? 'Start listening' : 'Start a new jam'}
                </Button>
                {input.mock && (
                  <Button variant="plain" onClick={input.startDemo}>
                    Play demo again
                  </Button>
                )}
              </div>
            )}
            {jam.timeline.length > 0 && !input.saveError && (
              <div className="mt-9 w-full hairline-t pt-5">
                <Timeline
                  timeline={jam.timeline}
                  keyHistory={jam.keyHistory}
                  onAudition={audition}
                  showSlash={settings.showSlashChords}
                  spellingFollowsKey={settings.spellingFollowsKey}
                />
              </div>
            )}
          </div>
        ) : (
          <>
            <div className="flex min-h-10 items-center justify-center gap-2 text-subhead text-label-2">
              {input.mock ? (
                <span>Example progression · microphone off</span>
              ) : (
                <>
                  {jam.source === 'midi' ? (
                    <Usb className="size-4" aria-hidden />
                  ) : (
                    <Mic className="size-4" aria-hidden />
                  )}
                  <span className="max-w-48 truncate">{inputLabel}</span>
                  <Meter level={jam.level} active={listening} bars={7} />
                </>
              )}
            </div>
            <div className="flex min-h-[260px] flex-1 flex-col items-center justify-center py-8 sm:min-h-[340px] sm:py-10">
              {hasChord ? (
                <>
                  <ChordDisplay
                    details={false}
                    chord={jam.currentChord}
                    confidence={jam.confidence}
                    keyContext={jam.keyEstimate}
                    showSlash={settings.showSlashChords}
                    spellingFollowsKey={settings.spellingFollowsKey}
                  />
                  <p className="mt-2 text-footnote text-label-2" aria-label="Chord match strength">
                    {jam.confidence >= 0.8 ? 'Strong chord match' : 'Tentative chord match'}
                  </p>
                  <KeyBadge
                    primaryOnly
                    keyEstimate={jam.keyEstimate}
                    spellingFollowsKey={settings.spellingFollowsKey}
                    className="mt-4"
                  />
                </>
              ) : (
                <div className="max-w-md text-center">
                  <h2 className="text-title-1 font-semibold tracking-tight">
                    {starting
                      ? 'Connecting your instrument…'
                      : quiet
                        ? 'A little closer.'
                        : 'Play a chord.'}
                  </h2>
                  <p className="mt-3 text-body leading-relaxed text-label-2">
                    {starting
                      ? 'Allow microphone access if your browser asks.'
                      : quiet
                        ? 'Move your device near the instrument, or raise sensitivity in Listening options.'
                        : 'Hold it briefly. Your chord and key will appear here.'}
                  </p>
                </div>
              )}
              {quiet && hasChord && (
                <p role="status" className="mt-5 max-w-sm text-center text-subhead text-label-2">
                  Can’t hear much. Move closer, or raise sensitivity in Listening options.
                </p>
              )}
              {pianoVisible && listening && (
                <Piano
                  keys={wide ? 88 : 61}
                  activePitchClasses={jam.activePitchClasses}
                  activeMidiNotes={jam.activeMidiNotes}
                  className="mt-8 w-full"
                />
              )}
            </div>
            {jam.timeline.length > 0 && (
              <section aria-label="Your progression" className="hairline-t py-4">
                <Timeline
                  timeline={jam.timeline}
                  keyHistory={jam.keyHistory}
                  markers={jam.markers}
                  onAudition={audition}
                  showSlash={settings.showSlashChords}
                  spellingFollowsKey={settings.spellingFollowsKey}
                />
              </section>
            )}
            <div className="flex flex-col items-center gap-4 pt-5">
              <div className="flex w-full flex-wrap items-center justify-center gap-3">
                <Button
                  variant="filled"
                  size="lg"
                  round
                  className="min-w-48"
                  loading={starting}
                  leading={<Square className="size-4 fill-current" aria-hidden />}
                  onClick={() => void stop()}
                >
                  {starting ? 'Connecting…' : input.mock ? 'Stop demo' : 'Finish & save'}
                </Button>
                {listening && (
                  <Button
                    variant="gray"
                    round
                    aria-label="Bookmark"
                    leading={<Bookmark className="size-4" aria-hidden />}
                    onClick={() => addMarker('bookmark')}
                  >
                    <span className="hidden sm:inline">Bookmark</span>
                  </Button>
                )}
              </div>
              <div className="flex flex-wrap items-center justify-center gap-x-3">
                {options}
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
              {input.mock && (
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
