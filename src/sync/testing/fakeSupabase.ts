/**
 * In-memory stand-in for the slice of `@supabase/supabase-js` JamKey uses.
 * Mirrors the server rules that matter for sync: upserts keyed by a conflict
 * column, the last-write-wins trigger (older `updated_at` never overwrites),
 * and PostgREST-style filters, ordering and ranges.
 *
 *   const fake = createFakeSupabase();
 *   vi.mock('@supabase/supabase-js', () => ({ createClient: () => fake.client }));
 *
 * Use with `vi.hoisted` so the instance exists when the mock factory runs.
 */
type Row = Record<string, unknown>;
type Filter = (r: Row) => boolean;

const KEY: Record<string, string> = {
  sessions: 'id',
  chords: 'id',
  keys: 'id',
  markers: 'id',
  midi_tracks: 'session_id',
  shares: 'code',
};
const LWW_TABLES = new Set(['sessions', 'chords', 'keys', 'markers', 'midi_tracks']);

export interface FakeUser {
  id: string;
  email: string;
}

export interface FakeCall {
  table: string;
  op: 'select' | 'upsert' | 'insert' | 'delete';
  rows?: Row[];
}

const clone = <T>(x: T): T => structuredClone(x);

export function createFakeSupabase() {
  const tables = new Map<string, Row[]>();
  const calls: FakeCall[] = [];
  let user: FakeUser | null = null;
  const authListeners = new Set<(event: string, session: unknown) => void>();
  /** Set to make the next request(s) on a table fail. */
  const failures = new Map<string, string>();

  const table = (name: string) => {
    let t = tables.get(name);
    if (!t) tables.set(name, (t = []));
    return t;
  };
  const sessionObj = () => (user ? { user: { ...user }, access_token: 'fake' } : null);

  function query(name: string) {
    const filters: Filter[] = [];
    const orders: Array<{ col: string; asc: boolean }> = [];
    let op: FakeCall['op'] = 'select';
    let cols: string[] | null = null;
    let payload: Row[] = [];
    let onConflict = KEY[name] ?? 'id';
    let range: [number, number] | null = null;
    let single = false;

    const exec = () => {
      const failure = failures.get(name);
      if (failure) return { data: null, error: { message: failure } };
      calls.push({ table: name, op, rows: op === 'select' ? undefined : clone(payload) });
      const rows = table(name);
      if (op === 'upsert' || op === 'insert') {
        for (const incoming of payload) {
          const i = rows.findIndex((r) => r[onConflict] === incoming[onConflict]);
          if (i < 0) rows.push(clone(incoming));
          else if (op === 'insert')
            return { data: null, error: { message: 'duplicate key', code: '23505' } };
          else if (
            LWW_TABLES.has(name) &&
            Number(incoming.updated_at) < Number(rows[i].updated_at)
          ) {
            continue; // keep_newer trigger
          } else rows[i] = { ...rows[i], ...clone(incoming) };
        }
        return { data: null, error: null };
      }
      if (op === 'delete') {
        const keep = rows.filter((r) => !filters.every((f) => f(r)));
        tables.set(name, keep);
        return { data: null, error: null };
      }
      let out = rows.filter((r) => filters.every((f) => f(r)));
      out.sort((a, b) => {
        for (const o of orders) {
          const x = a[o.col] as number | string;
          const y = b[o.col] as number | string;
          if (x < y) return o.asc ? -1 : 1;
          if (x > y) return o.asc ? 1 : -1;
        }
        return 0;
      });
      if (range) out = out.slice(range[0], range[1] + 1);
      const projected = out.map((r) =>
        cols ? Object.fromEntries(cols.map((c) => [c, clone(r[c])])) : clone(r),
      );
      if (single) return { data: projected[0] ?? null, error: null };
      return { data: projected, error: null };
    };

    const builder = {
      select(c = '*') {
        cols = c === '*' ? null : c.split(',').map((s) => s.trim());
        return builder;
      },
      upsert(rows: Row | Row[], opts?: { onConflict?: string }) {
        op = 'upsert';
        payload = Array.isArray(rows) ? rows : [rows];
        if (opts?.onConflict) onConflict = opts.onConflict;
        return builder;
      },
      insert(rows: Row | Row[]) {
        op = 'insert';
        payload = Array.isArray(rows) ? rows : [rows];
        return builder;
      },
      delete() {
        op = 'delete';
        return builder;
      },
      eq(col: string, v: unknown) {
        filters.push((r) => r[col] === v);
        return builder;
      },
      gt(col: string, v: number) {
        filters.push((r) => Number(r[col]) > v);
        return builder;
      },
      gte(col: string, v: number) {
        filters.push((r) => Number(r[col]) >= v);
        return builder;
      },
      in(col: string, vs: unknown[]) {
        filters.push((r) => vs.includes(r[col]));
        return builder;
      },
      order(col: string, opts?: { ascending?: boolean }) {
        orders.push({ col, asc: opts?.ascending !== false });
        return builder;
      },
      range(from: number, to: number) {
        range = [from, to];
        return builder;
      },
      maybeSingle() {
        single = true;
        return builder;
      },
      then<A, B>(
        resolve: (v: ReturnType<typeof exec>) => A,
        reject?: (e: unknown) => B,
      ): Promise<A | B> {
        return Promise.resolve().then(exec).then(resolve, reject);
      },
    };
    return builder;
  }

  const client = {
    from: (name: string) => query(name),
    auth: {
      getSession: async () => ({ data: { session: sessionObj() }, error: null }),
      getUser: async () => ({ data: { user: user ? { ...user } : null }, error: null }),
      onAuthStateChange(cb: (event: string, session: unknown) => void) {
        authListeners.add(cb);
        queueMicrotask(() => cb('INITIAL_SESSION', sessionObj()));
        return { data: { subscription: { unsubscribe: () => authListeners.delete(cb) } } };
      },
      signInWithOAuth: async (opts: unknown) => {
        calls.push({ table: 'auth', op: 'insert', rows: [opts as Row] });
        return { data: {}, error: null };
      },
      signOut: async () => {
        user = null;
        authListeners.forEach((l) => l('SIGNED_OUT', null));
        return { error: null };
      },
    },
  };

  return {
    client,
    calls,
    tables,
    rows: (name: string) => table(name),
    failures,
    signIn(u: FakeUser) {
      user = u;
      authListeners.forEach((l) => l('SIGNED_IN', sessionObj()));
    },
    signOutNow() {
      user = null;
    },
    reset() {
      tables.clear();
      calls.length = 0;
      failures.clear();
      user = null;
      authListeners.clear();
    },
  };
}

export type FakeSupabase = ReturnType<typeof createFakeSupabase>;
