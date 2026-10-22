import { useId, useRef, useState } from 'react';
import type { DragEvent } from 'react';
import { cx } from '../../lib/cx';
import { AUDIO_ACCEPT } from './files';

export interface DropZoneProps {
  onFile(file: File): void;
  /** Compact strip (results are showing) instead of the big empty-state target. */
  compact?: boolean;
  disabled?: boolean;
}

/** Drag-and-drop target plus a file picker (the whole zone is the picker's label). */
export function DropZone({ onFile, compact, disabled }: DropZoneProps) {
  const id = useId();
  const [over, setOver] = useState(false);
  const depth = useRef(0);

  const take = (files: FileList | null | undefined) => {
    const file = files?.[0];
    if (file && !disabled) onFile(file);
  };
  const onDragEnter = (e: DragEvent) => {
    e.preventDefault();
    depth.current++;
    setOver(true);
  };
  const onDragLeave = () => {
    depth.current = Math.max(0, depth.current - 1);
    if (!depth.current) setOver(false);
  };
  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    depth.current = 0;
    setOver(false);
    take(e.dataTransfer?.files);
  };

  return (
    <div
      data-testid="drop-zone"
      onDragEnter={onDragEnter}
      onDragOver={(e) => e.preventDefault()}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      className={cx(
        'relative flex items-center rounded-2xl border border-dashed transition-colors duration-150',
        compact ? 'gap-4 px-4 py-3' : 'flex-col justify-center gap-3 px-6 py-14 text-center',
        over ? 'border-violet-300 bg-violet-400/10' : 'border-zinc-700 bg-zinc-900/40',
        'has-[input:focus-visible]:ring-2 has-[input:focus-visible]:ring-violet-300',
        disabled && 'opacity-50',
      )}
    >
      <input
        id={id}
        type="file"
        accept={AUDIO_ACCEPT}
        disabled={disabled}
        className="sr-only"
        onChange={(e) => {
          take(e.currentTarget.files);
          e.currentTarget.value = ''; // picking the same file again re-runs
        }}
      />
      {compact ? (
        <>
          <p className="flex-1 text-sm text-zinc-400">Drop another song here, or</p>
          <label
            htmlFor={id}
            className="inline-flex min-h-11 cursor-pointer items-center rounded-xl bg-zinc-800/80 px-4 text-sm text-zinc-100 hover:bg-zinc-700/80"
          >
            Choose a file
          </label>
        </>
      ) : (
        <>
          <svg
            aria-hidden
            viewBox="0 0 24 24"
            className="h-10 w-10 text-violet-300"
            fill="none"
            stroke="currentColor"
            strokeWidth={1.5}
          >
            <path d="M9 18V5l12-2v13" strokeLinecap="round" strokeLinejoin="round" />
            <circle cx="6" cy="18" r="3" />
            <circle cx="18" cy="16" r="3" />
          </svg>
          <p className="text-lg font-medium text-zinc-100">Drop an audio file here</p>
          <p className="max-w-md text-sm text-zinc-500">
            mp3, m4a, wav or ogg. It is analysed on this device and never uploaded.
          </p>
          <label
            htmlFor={id}
            className="mt-2 inline-flex min-h-11 cursor-pointer items-center rounded-xl bg-violet-400 px-5 text-sm font-semibold text-zinc-950 hover:bg-violet-300"
          >
            Choose an audio file
          </label>
        </>
      )}
    </div>
  );
}
