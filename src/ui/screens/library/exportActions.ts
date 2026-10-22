import type { Session } from '@/core';
import { toJSON, toText, type SessionFull } from '@/data';
import { toast } from '../../components/toastStore';

/** `evening-idea-in-c-2026-10-22` */
export function fileBase(session: Session): string {
  const d = new Date(session.createdAt);
  const p = (n: number) => String(n).padStart(2, '0');
  const date = `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
  const slug = session.name
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^\w\s-]/g, '')
    .trim()
    .replace(/[\s_]+/g, '-')
    .slice(0, 60);
  return `${slug || 'jamkey-session'}-${date}`;
}

export function downloadBlob(filename: string, blob: Blob): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function downloadChart(full: SessionFull): void {
  downloadBlob(`${fileBase(full.session)}.txt`, new Blob([toText(full)], { type: 'text/plain' }));
}

export function downloadJSON(full: SessionFull): void {
  const json = JSON.stringify(toJSON(full), null, 2);
  downloadBlob(`${fileBase(full.session)}.json`, new Blob([json], { type: 'application/json' }));
}

/** Copy the text chart; falls back to a .txt download when the clipboard is unavailable. */
export async function copyChart(full: SessionFull): Promise<'copied' | 'downloaded'> {
  const text = toText(full);
  try {
    if (!navigator.clipboard?.writeText) throw new Error('no clipboard');
    await navigator.clipboard.writeText(text);
    return 'copied';
  } catch {
    downloadChart(full);
    return 'downloaded';
  }
}

/** Runs an export action against the full session, toasting failures. */
export function runExport(
  getFull: () => Promise<SessionFull | undefined>,
  fn: (full: SessionFull) => void | Promise<void>,
): () => Promise<void> {
  return async () => {
    try {
      const full = await getFull();
      if (!full) throw new Error('Session not found');
      await fn(full);
    } catch (err) {
      toast(`Export failed: ${err instanceof Error ? err.message : String(err)}`, {
        tone: 'error',
      });
    }
  };
}
