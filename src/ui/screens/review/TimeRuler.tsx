import { useRef } from 'react';
import {
  clockLabel,
  tickStep,
  timeToX,
  visibleSeconds,
  xToTime,
  type TimeViewport,
} from './timeline';
import { useTimeGestures } from './useTimeGestures';

export interface TimeRulerProps {
  viewport: TimeViewport;
  onViewportChange(v: TimeViewport): void;
  width: number;
  duration: number;
  onSeek(t: number): void;
}

/** Time ruler above the lanes: tap to seek, drag to scroll, wheel or pinch to zoom. */
export function TimeRuler({ viewport, onViewportChange, width, duration, onSeek }: TimeRulerProps) {
  const ref = useRef<HTMLDivElement>(null);
  useTimeGestures(ref, {
    viewport,
    onViewportChange,
    onTap: (x) => onSeek(Math.min(duration, Math.max(0, xToTime(viewport, x)))),
  });
  const step = tickStep(viewport.pxPerSec);
  const t1 = Math.min(duration, viewport.start + visibleSeconds(viewport, width));
  const ticks: number[] = [];
  for (let t = Math.ceil(viewport.start / step) * step; t <= t1 + 1e-6; t += step) ticks.push(t);
  const showTenths = step < 1;

  return (
    <div
      ref={ref}
      aria-hidden
      className="relative h-7 cursor-pointer touch-none overflow-hidden border-b border-zinc-800 select-none"
    >
      {ticks.map((t) => (
        <div
          key={t}
          className="absolute bottom-0 flex h-full items-end border-l border-zinc-700 pb-1 pl-1 text-[11px] text-zinc-500 tabular-nums"
          style={{ left: timeToX(viewport, t) }}
        >
          {clockLabel(t, showTenths)}
        </div>
      ))}
    </div>
  );
}
