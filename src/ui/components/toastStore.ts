import { create } from 'zustand';

export type ToastTone = 'info' | 'success' | 'error';

export interface ToastAction {
  label: string;
  onClick: () => void;
}

export interface ToastItem {
  id: number;
  message: string;
  tone: ToastTone;
  action?: ToastAction;
}

export interface ToastOptions {
  tone?: ToastTone;
  durationMs?: number;
  /** Optional button next to the message; clicking it also dismisses the toast. */
  action?: ToastAction;
}

interface ToastState {
  toasts: ToastItem[];
  push(message: string, opts?: ToastOptions): number;
  dismiss(id: number): void;
}

let nextId = 1;

export const useToastStore = create<ToastState>()((set, get) => ({
  toasts: [],
  push(message, opts = {}) {
    const id = nextId++;
    const { tone = 'info', durationMs = 2500, action } = opts;
    const item: ToastItem = action ? { id, message, tone, action } : { id, message, tone };
    // Keep at most three on screen; the jam screen must stay uncluttered.
    set({ toasts: [...get().toasts.slice(-2), item] });
    if (durationMs > 0) setTimeout(() => get().dismiss(id), durationMs);
    return id;
  },
  dismiss(id) {
    set({ toasts: get().toasts.filter((t) => t.id !== id) });
  },
}));

export const toast = (message: string, opts?: ToastOptions) =>
  useToastStore.getState().push(message, opts);
