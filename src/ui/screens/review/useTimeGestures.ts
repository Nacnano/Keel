import { useEffect, useLayoutEffect, useRef } from 'react';
import type { RefObject } from 'react';
import { zoomAt, type TimeViewport } from './timeline';

export interface TimeGestureOptions {
  viewport: TimeViewport;
  onViewportChange(v: TimeViewport): void;
  /** Called for a click/tap that did not turn into a drag. `x` is px from the left edge. */
  onTap?(x: number): void;
  /** Wheel zoom (vertical) and pan (horizontal / shift). Default true. */
  wheel?: boolean;
  /** One-finger / mouse drag pans, two-finger pinch zooms. Default true. */
  drag?: boolean;
}

const DRAG_THRESHOLD_PX = 5;

/**
 * Zoom and scroll a time viewport with the mouse wheel, trackpad pinch (ctrl+wheel), mouse or
 * touch drag, and two-finger pinch. Inner elements that already handled a wheel event (called
 * `preventDefault`) are skipped, so nested gesture areas do not double-zoom.
 */
export function useTimeGestures(
  ref: RefObject<HTMLElement | null>,
  opts: TimeGestureOptions,
): void {
  const latest = useRef(opts);
  useLayoutEffect(() => {
    latest.current = opts;
  });

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const { wheel = true, drag = true } = latest.current;
    const localX = (clientX: number) => clientX - el.getBoundingClientRect().left;

    const onWheel = (e: WheelEvent) => {
      if (e.defaultPrevented) return;
      const { viewport, onViewportChange } = latest.current;
      const dx = e.shiftKey && !e.deltaX ? e.deltaY : e.deltaX;
      const dy = e.shiftKey ? 0 : e.deltaY;
      e.preventDefault();
      if (Math.abs(dx) > Math.abs(dy)) {
        onViewportChange({ ...viewport, start: viewport.start + dx / viewport.pxPerSec });
      } else if (dy) {
        // Trackpad pinch arrives as ctrl+wheel with small deltas; scale it up a bit.
        const k = e.ctrlKey ? 0.01 : 0.0015;
        onViewportChange(zoomAt(viewport, Math.exp(-dy * k), localX(e.clientX)));
      }
    };

    const pointers = new Map<number, number>(); // pointerId -> clientX
    let dragStart: { x: number; start: number; moved: boolean } | null = null;
    let pinch: { dist: number; mid: number; v: TimeViewport } | null = null;

    const beginPinch = () => {
      const [a, b] = [...pointers.values()];
      pinch = {
        dist: Math.max(1, Math.abs(a - b)),
        mid: localX((a + b) / 2),
        v: latest.current.viewport,
      };
      dragStart = null;
    };

    const onDown = (e: PointerEvent) => {
      if (e.button !== 0 && e.pointerType === 'mouse') return;
      pointers.set(e.pointerId, e.clientX);
      el.setPointerCapture?.(e.pointerId);
      if (pointers.size === 2) beginPinch();
      else if (pointers.size === 1) {
        dragStart = { x: e.clientX, start: latest.current.viewport.start, moved: false };
      }
    };

    const onMove = (e: PointerEvent) => {
      if (!pointers.has(e.pointerId)) return;
      pointers.set(e.pointerId, e.clientX);
      const { viewport, onViewportChange } = latest.current;
      if (pinch && pointers.size >= 2) {
        const [a, b] = [...pointers.values()];
        const ratio = Math.max(1, Math.abs(a - b)) / pinch.dist;
        const zoomed = zoomAt(pinch.v, ratio, pinch.mid);
        const mid = localX((a + b) / 2);
        onViewportChange({ ...zoomed, start: zoomed.start - (mid - pinch.mid) / zoomed.pxPerSec });
        return;
      }
      if (!dragStart) return;
      const dx = e.clientX - dragStart.x;
      if (!dragStart.moved && Math.abs(dx) < DRAG_THRESHOLD_PX) return;
      dragStart.moved = true;
      onViewportChange({ ...viewport, start: dragStart.start - dx / viewport.pxPerSec });
    };

    const onUp = (e: PointerEvent) => {
      if (!pointers.has(e.pointerId)) return;
      pointers.delete(e.pointerId);
      if (pinch) {
        if (pointers.size < 2) pinch = null;
        dragStart = null;
        return;
      }
      if (dragStart && !dragStart.moved && e.type === 'pointerup') {
        latest.current.onTap?.(localX(e.clientX));
      }
      dragStart = null;
    };

    if (wheel) el.addEventListener('wheel', onWheel, { passive: false });
    if (drag) {
      el.addEventListener('pointerdown', onDown);
      el.addEventListener('pointermove', onMove);
      el.addEventListener('pointerup', onUp);
      el.addEventListener('pointercancel', onUp);
    }
    return () => {
      el.removeEventListener('wheel', onWheel);
      el.removeEventListener('pointerdown', onDown);
      el.removeEventListener('pointermove', onMove);
      el.removeEventListener('pointerup', onUp);
      el.removeEventListener('pointercancel', onUp);
    };
  }, [ref]);
}
