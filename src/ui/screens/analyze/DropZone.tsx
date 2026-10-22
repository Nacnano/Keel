import { useId, useRef, useState } from 'react';
import type { DragEvent } from 'react';
import { FileAudio } from 'lucide-react';
import { cx } from '../../lib/cx';
import { AUDIO_ACCEPT } from './files';

export interface DropZoneProps {
  onFile(file: File): void;
  /** Compact strip (results are showing) instead of the big empty-state target. */
  compact?: boolean;
  disabled?: boolean;
}

/** Drag-and-drop target plus a file picker (the button is the picker's label). */
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
        'relative flex items-center rounded-card border-[1.5px] border-dashed transition-colors duration-150',
        compact ? 'gap-4 px-4 py-2.5' : 'flex-col justify-center gap-4 px-6 py-16 text-center',
        over ? 'border-accent bg-accent/10' : 'border-label-4 bg-surface/60',
        disabled && 'pointer-events-none opacity-50',
      )}
    >
      <input
        id={id}
        type="file"
        accept={AUDIO_ACCEPT}
        disabled={disabled}
        aria-label={compact ? 'Choose another audio file' : 'Choose an audio file'}
        className="peer sr-only"
        onChange={(e) => {
          take(e.currentTarget.files);
          e.currentTarget.value = ''; // picking the same file again re-runs
        }}
      />
      {compact ? (
        <>
          <FileAudio aria-hidden className="size-5 shrink-0 text-label-3" />
          <p className="flex-1 text-subhead text-label-2">Drop another song here, or</p>
          <label
            htmlFor={id}
            className="inline-flex h-8 cursor-pointer items-center rounded-[8px] bg-fill-3 px-3 text-footnote font-medium text-label transition-colors hover:bg-fill-2 peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-accent"
          >
            Choose another file
          </label>
        </>
      ) : (
        <>
          <span className="flex size-16 items-center justify-center rounded-full bg-accent/15 text-accent">
            <FileAudio aria-hidden className="size-8" />
          </span>
          <p className="max-w-sm text-body text-label">
            Drop an audio file here to find its key and chords without it leaving this device.
          </p>
          <label
            htmlFor={id}
            className="inline-flex h-11 cursor-pointer items-center rounded-control bg-accent px-5 text-subhead font-semibold text-accent-fg transition-[filter] hover:brightness-110 peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-accent"
          >
            Choose file
          </label>
        </>
      )}
    </div>
  );
}
