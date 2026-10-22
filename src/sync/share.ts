/**
 * Public read-only share links. A share is a snapshot: the chart JSON (no MIDI
 * events, no audio) plus the plain-text chart, stored under a short random
 * code. Editing the session later does not change an existing link.
 */
import { getSessionFull } from '@/data/repo';
import { toJSON, toText, type JamKeyExportV1 } from '@/data/export';
import { getSupabase, SyncError } from './client';

export const SHARE_PAYLOAD_VERSION = 1;
export const SHARE_CODE_LENGTH = 10;
const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';

export interface SharePayloadV1 {
  version: 1;
  /** `toJSON` export without MIDI events; import it with `fromJSON`. */
  chart: JamKeyExportV1;
  /** `toText` chord chart. */
  text: string;
  sharedAt: number;
}

export interface SharedChart {
  code: string;
  payload: SharePayloadV1;
  createdAt: number;
}

export interface ShareLink {
  code: string;
  url: string;
  createdAt: number;
}

/** Random base62 code (about 59 bits for 10 characters). */
export function randomShareCode(length = SHARE_CODE_LENGTH): string {
  let out = '';
  const buf = new Uint8Array(length * 2);
  while (out.length < length) {
    crypto.getRandomValues(buf);
    for (const b of buf) {
      // 248 = 4 * 62: reject the tail so every character is equally likely.
      if (b < 248 && out.length < length) out += ALPHABET[b % 62];
    }
  }
  return out;
}

export function shareUrl(code: string, origin = window.location.origin): string {
  return `${origin}/s/${code}`;
}

/** Build the public payload for a session (pure apart from `Date.now`). */
export function buildSharePayload(
  full: Parameters<typeof toJSON>[0],
  now = Date.now(),
): SharePayloadV1 {
  const chart = toJSON({ ...full, midiTrack: undefined, recording: undefined });
  chart.session = { ...chart.session, hasAudio: false, hasMidi: false };
  return { version: SHARE_PAYLOAD_VERSION, chart, text: toText(full), sharedAt: now };
}

const isObject = (x: unknown): x is Record<string, unknown> =>
  typeof x === 'object' && x !== null && !Array.isArray(x);

export function isSharePayload(x: unknown): x is SharePayloadV1 {
  return (
    isObject(x) &&
    x.version === SHARE_PAYLOAD_VERSION &&
    typeof x.text === 'string' &&
    isObject(x.chart) &&
    isObject(x.chart.session) &&
    Array.isArray(x.chart.chords) &&
    Array.isArray(x.chart.keys) &&
    Array.isArray(x.chart.markers)
  );
}

async function requireClient() {
  const client = await getSupabase();
  if (!client) throw new SyncError('Sharing needs cloud sync, which is not configured');
  return client;
}

async function requireUserId(client: Awaited<ReturnType<typeof requireClient>>) {
  const { data } = await client.auth.getSession();
  const id = data.session?.user.id;
  if (!id) throw new SyncError('Sign in to share');
  return id;
}

/** Upload a snapshot of the session and return its public link. */
export async function createShare(sessionId: string): Promise<ShareLink> {
  const client = await requireClient();
  const userId = await requireUserId(client);
  const full = await getSessionFull(sessionId);
  if (!full) throw new SyncError('Session not found');
  const payload = buildSharePayload(full);
  for (let attempt = 0; ; attempt++) {
    const code = randomShareCode();
    const createdAt = Date.now();
    const { error } = await client.from('shares').insert({
      code,
      user_id: userId,
      session_id: sessionId,
      payload,
      created_at: createdAt,
    });
    if (!error) return { code, url: shareUrl(code), createdAt };
    // 23505 = unique_violation: a code collision; try a fresh one.
    if ((error as { code?: string }).code !== '23505' || attempt >= 2) {
      throw new SyncError(`Could not create the share link: ${error.message}`);
    }
  }
}

/** Public read by code. Works logged out. Resolves null when not found or malformed. */
export async function fetchShare(code: string): Promise<SharedChart | null> {
  const client = await requireClient();
  const { data, error } = await client
    .from('shares')
    .select('code, payload, created_at')
    .eq('code', code)
    .maybeSingle();
  if (error) throw new SyncError(`Could not load the share: ${error.message}`);
  if (!data || !isSharePayload(data.payload)) return null;
  return { code: data.code, payload: data.payload, createdAt: Number(data.created_at) };
}

/** Delete a share (owner only, enforced by row-level security). */
export async function revokeShare(code: string): Promise<void> {
  const client = await requireClient();
  const { error } = await client.from('shares').delete().eq('code', code);
  if (error) throw new SyncError(`Could not revoke the share: ${error.message}`);
}

/** The signed-in user's share links for one session, newest first. */
export async function listShares(sessionId: string): Promise<ShareLink[]> {
  const client = await requireClient();
  const userId = await requireUserId(client);
  const { data, error } = await client
    .from('shares')
    .select('code, created_at')
    .eq('user_id', userId)
    .eq('session_id', sessionId)
    .order('created_at', { ascending: false });
  if (error) throw new SyncError(`Could not list share links: ${error.message}`);
  return (data ?? []).map((r: { code: string; created_at: number }) => ({
    code: r.code,
    url: shareUrl(r.code),
    createdAt: Number(r.created_at),
  }));
}
