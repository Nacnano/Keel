import { create } from 'zustand';

export type ToastTone = 'info' | 'success' | 'error';

export interface ToastItem {
  id: number;
  message: string;
  tone: ToastTone;
}

interface ToastState {
  toasts: ToastItem[];
  push(message: string, opts?: { tone?: ToastTone; durationMs?: number }): number;
  dismiss(id: number): void;
}

let nextId = 1;

export const useToastStore = create<ToastState>()((set, get) => ({
  toasts: [],
  push(message, opts = {}) {
    const id = nextId++;
    const { tone = 'info', durationMs = 2500 } = opts;
    // Keep at most three on screen; the jam screen must stay uncluttered.
    set({ toasts: [...get().toasts.slice(-2), { id, message, tone }] });
    if (durationMs > 0) setTimeout(() => get().dismiss(id), durationMs);
    return id;
  },
  dismiss(id) {
    set({ toasts: get().toasts.filter((t) => t.id !== id) });
  },
}));

export const toast = (message: string, opts?: { tone?: ToastTone; durationMs?: number }) =>
  useToastStore.getState().push(message, opts);
