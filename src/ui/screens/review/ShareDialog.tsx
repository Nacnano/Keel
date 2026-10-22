import { useEffect, useState } from 'react';
import { createShare, listShares, revokeShare, type ShareLink } from '@/sync/share';
import { Button } from '../../components/Button';
import { Dialog } from '../../components/Dialog';

export interface ShareDialogProps {
  open: boolean;
  onClose(): void;
  sessionId: string;
}

const errMsg = (err: unknown) => (err instanceof Error ? err.message : String(err));

async function copy(text: string): Promise<boolean> {
  try {
    if (!navigator.clipboard?.writeText) return false;
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

/**
 * Share-link dialog. Opening it reuses the newest existing link for this
 * session, or creates one; either way the URL is copied to the clipboard.
 */
export function ShareDialog({ open, onClose, sessionId }: ShareDialogProps) {
  // Mounted only while open, so every opening starts from a clean state.
  return open ? <ShareDialogBody onClose={onClose} sessionId={sessionId} /> : null;
}

function ShareDialogBody({ onClose, sessionId }: Omit<ShareDialogProps, 'open'>) {
  const [links, setLinks] = useState<ShareLink[] | null>(null);
  const [busy, setBusy] = useState(true);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const create = async () => {
    setBusy(true);
    setError(null);
    try {
      const link = await createShare(sessionId);
      setLinks((ls) => [link, ...(ls ?? [])]);
      setMessage((await copy(link.url)) ? 'Link copied to the clipboard' : 'Link created');
    } catch (err) {
      setError(errMsg(err));
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const existing = await listShares(sessionId);
        if (cancelled) return;
        if (existing.length) {
          setLinks(existing);
          setMessage((await copy(existing[0].url)) ? 'Link copied to the clipboard' : null);
        } else {
          const link = await createShare(sessionId);
          if (cancelled) return;
          setLinks([link]);
          setMessage((await copy(link.url)) ? 'Link copied to the clipboard' : 'Link created');
        }
      } catch (err) {
        if (!cancelled) {
          setLinks([]);
          setError(errMsg(err));
        }
      } finally {
        if (!cancelled) setBusy(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [sessionId]);

  const revoke = async (code: string) => {
    setBusy(true);
    setError(null);
    try {
      await revokeShare(code);
      setLinks((ls) => (ls ?? []).filter((l) => l.code !== code));
      setMessage('Link revoked. It no longer opens.');
    } catch (err) {
      setError(errMsg(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog
      open
      onClose={onClose}
      title="Share link"
      footer={
        <>
          <Button variant="ghost" disabled={busy} onClick={() => void create()}>
            {links?.length ? 'Create new link' : 'Create link'}
          </Button>
          <Button onClick={onClose}>Done</Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        <p className="text-zinc-400">
          Anyone with the link can view this chart without signing in. It is a snapshot: later edits
          need a new link. Audio and MIDI are not shared.
        </p>
        {links === null && (
          <p role="status" className="text-zinc-500">
            Preparing link…
          </p>
        )}
        {links?.map((l) => (
          <div key={l.code} className="flex items-center gap-2">
            <input
              readOnly
              aria-label="Share URL"
              value={l.url}
              onFocus={(e) => e.currentTarget.select()}
              className="min-h-11 min-w-0 flex-1 rounded-xl bg-zinc-950 px-3 text-sm text-zinc-100 ring-1 ring-zinc-800"
            />
            <Button
              size="md"
              onClick={async () =>
                setMessage((await copy(l.url)) ? 'Link copied to the clipboard' : 'Copy failed')
              }
            >
              Copy
            </Button>
            <Button variant="danger" disabled={busy} onClick={() => void revoke(l.code)}>
              Revoke
            </Button>
          </div>
        ))}
        {message && (
          <p role="status" className="text-emerald-300">
            {message}
          </p>
        )}
        {error && (
          <p role="alert" className="text-rose-300">
            {error}
          </p>
        )}
      </div>
    </Dialog>
  );
}
