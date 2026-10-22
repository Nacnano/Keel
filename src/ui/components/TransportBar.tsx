import { useEffect, useId, useRef, useState } from 'react';
import type { MarkerKind } from '@/core';
import type { JamStatus } from '@/state/jamStore';
import { cx } from '../lib/cx';
import { Button } from './Button';
import {
  BookmarkIcon,
  ChevronIcon,
  FlagIcon,
  KeysIcon,
  PlayIcon,
  RecordIcon,
  ResetIcon,
  StopIcon,
} from './icons';
import { MARKER_LABEL, SECTION_KINDS } from '../lib/markers';

const SECTIONS = SECTION_KINDS;

export interface TransportBarProps {
  status: JamStatus;
  onStart(): void;
  onStop(): void;
  onReset(): void;
  recordAudio: boolean;
  onToggleRecordAudio(): void;
  onBookmark(): void;
  onMarker(kind: MarkerKind): void;
  pianoVisible?: boolean;
  onTogglePiano?(): void;
  className?: string;
}

function SectionMenu({ disabled, onPick }: { disabled: boolean; onPick(kind: MarkerKind): void }) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const menuId = useId();
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('pointerdown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);
  return (
    <div ref={root} className="relative">
      <Button
        variant="ghost"
        disabled={disabled}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        onClick={() => setOpen((o) => !o)}
      >
        <FlagIcon size={18} />
        <span className="hidden sm:inline">Section</span>
        <ChevronIcon size={14} />
      </Button>
      {open && (
        <div
          id={menuId}
          role="menu"
          aria-label="Add a section marker"
          className="absolute bottom-full left-0 z-40 mb-2 grid w-48 grid-cols-1 gap-0.5 rounded-2xl bg-zinc-900 p-1.5 shadow-2xl ring-1 ring-zinc-800"
        >
          {SECTIONS.map((k) => (
            <button
              key={k}
              type="button"
              role="menuitem"
              onClick={() => {
                onPick(k);
                setOpen(false);
              }}
              className="min-h-11 rounded-lg px-3 text-left text-sm text-zinc-200 hover:bg-zinc-800 focus-visible:outline-2 focus-visible:outline-violet-300"
            >
              {MARKER_LABEL[k]}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/** Bottom bar: start/stop, reset, bookmark, section markers, record-audio and keyboard toggles. */
export function TransportBar({
  status,
  onStart,
  onStop,
  onReset,
  recordAudio,
  onToggleRecordAudio,
  onBookmark,
  onMarker,
  pianoVisible,
  onTogglePiano,
  className,
}: TransportBarProps) {
  const listening = status === 'listening';
  const starting = status === 'starting';
  return (
    <div className={cx('flex flex-wrap items-center gap-2', className)}>
      {listening ? (
        <Button variant="primary" size="lg" className="min-w-36" onClick={onStop}>
          <StopIcon size={18} />
          Stop
          <kbd className="ml-1 hidden text-xs font-normal opacity-60 lg:inline">Space</kbd>
        </Button>
      ) : (
        <Button
          variant="primary"
          size="lg"
          className="min-w-36"
          onClick={onStart}
          disabled={starting}
        >
          <PlayIcon size={18} />
          {starting ? 'Starting…' : 'Start'}
          {!starting && (
            <kbd className="ml-1 hidden text-xs font-normal opacity-60 lg:inline">Space</kbd>
          )}
        </Button>
      )}
      <Button variant="ghost" onClick={onReset} disabled={starting} title="Reset timeline (R)">
        <ResetIcon size={18} />
        <span className="hidden sm:inline">Reset</span>
      </Button>
      <span className="mx-1 hidden h-6 w-px bg-zinc-800 sm:block" aria-hidden />
      <Button variant="ghost" onClick={onBookmark} disabled={!listening} title="Bookmark (B)">
        <BookmarkIcon size={18} />
        <span className="hidden sm:inline">Bookmark</span>
      </Button>
      <SectionMenu disabled={!listening} onPick={onMarker} />
      <div className="ml-auto flex items-center gap-2">
        <Button
          variant="ghost"
          pressed={recordAudio}
          onClick={onToggleRecordAudio}
          disabled={listening || starting}
          title={listening ? 'Recording choice is fixed for this session' : 'Record session audio'}
        >
          <RecordIcon size={14} className={recordAudio ? 'text-rose-400' : 'text-zinc-500'} />
          <span className="hidden sm:inline">Record audio</span>
        </Button>
        {onTogglePiano && (
          <Button
            variant="ghost"
            pressed={pianoVisible}
            onClick={onTogglePiano}
            title="Show keyboard (K)"
          >
            <KeysIcon size={18} />
            <span className="hidden sm:inline">Keys</span>
          </Button>
        )}
      </div>
    </div>
  );
}
