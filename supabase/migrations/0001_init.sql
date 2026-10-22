-- JamKey cloud sync, schema v1.
--
-- One user per account. Every row carries `user_id` and row-level security
-- limits reads and writes to the owner. Timestamps are epoch milliseconds set
-- by the client (`updated_at` mirrors the local Dexie `updatedAt`).
--
-- Audio recordings are never uploaded, so there is no recordings table.
-- Run this once in the Supabase SQL editor (see supabase/README.md). It is
-- idempotent: running it again is harmless.

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table if not exists public.sessions (
  id uuid primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null,
  created_at bigint not null,
  ended_at bigint,
  duration_sec double precision not null default 0,
  mode text not null,
  instrument text not null,
  vocab_level text not null,
  tags text[] not null default '{}',
  has_audio boolean not null default false,
  has_midi boolean not null default false,
  summary jsonb,
  updated_at bigint not null,
  deleted boolean not null default false
);

-- Child rows are stamped with their session's `updated_at` when pushed. A pull
-- reads only children whose `updated_at` is at least the session's, so rows a
-- device removed locally simply stop being read (nothing is hard-deleted).
create table if not exists public.chords (
  id uuid primary key,
  session_id uuid not null,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  t double precision not null,
  chord jsonb,
  confidence double precision not null default 0,
  source text not null,
  manual boolean not null default false,
  updated_at bigint not null
);

create table if not exists public.keys (
  id uuid primary key,
  session_id uuid not null,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  t double precision not null,
  key jsonb not null,
  updated_at bigint not null
);

create table if not exists public.markers (
  id uuid primary key,
  session_id uuid not null,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  t double precision not null,
  kind text not null,
  label text,
  updated_at bigint not null
);

create table if not exists public.midi_tracks (
  session_id uuid primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  events jsonb not null default '[]',
  updated_at bigint not null
);

-- Public read-only snapshots of one chart. `payload` is self-contained (chart
-- JSON without MIDI events, plus the plain-text chart), so it does not depend
-- on the session still existing.
create table if not exists public.shares (
  code text primary key check (char_length(code) between 8 and 32),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  session_id uuid not null,
  payload jsonb not null,
  created_at bigint not null default (extract(epoch from now()) * 1000)::bigint
);

-- ---------------------------------------------------------------------------
-- Indexes
-- ---------------------------------------------------------------------------

create index if not exists sessions_user_updated on public.sessions (user_id, updated_at);
create index if not exists chords_user_updated on public.chords (user_id, updated_at);
create index if not exists keys_user_updated on public.keys (user_id, updated_at);
create index if not exists markers_user_updated on public.markers (user_id, updated_at);
create index if not exists midi_tracks_user_updated on public.midi_tracks (user_id, updated_at);
create index if not exists chords_session on public.chords (session_id, updated_at);
create index if not exists keys_session on public.keys (session_id, updated_at);
create index if not exists markers_session on public.markers (session_id, updated_at);
create index if not exists shares_user_session on public.shares (user_id, session_id);

-- ---------------------------------------------------------------------------
-- Last write wins, enforced on the server too: an upsert carrying an older
-- `updated_at` than the stored row is silently skipped.
-- ---------------------------------------------------------------------------

create or replace function public.jamkey_keep_newer()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.updated_at < old.updated_at then
    return null; -- skip this row's update
  end if;
  return new;
end;
$$;

do $$
declare
  t text;
begin
  foreach t in array array['sessions', 'chords', 'keys', 'markers', 'midi_tracks'] loop
    execute format('drop trigger if exists keep_newer on public.%I', t);
    execute format(
      'create trigger keep_newer before update on public.%I '
      'for each row execute function public.jamkey_keep_newer()',
      t
    );
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- Row-level security
-- ---------------------------------------------------------------------------

alter table public.sessions enable row level security;
alter table public.chords enable row level security;
alter table public.keys enable row level security;
alter table public.markers enable row level security;
alter table public.midi_tracks enable row level security;
alter table public.shares enable row level security;

-- Owner read/write on every synced table.
do $$
declare
  t text;
begin
  foreach t in array array['sessions', 'chords', 'keys', 'markers', 'midi_tracks'] loop
    execute format('drop policy if exists owner_all on public.%I', t);
    execute format(
      'create policy owner_all on public.%I for all to authenticated '
      'using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id)',
      t
    );
  end loop;
end;
$$;

-- Shares: anyone (including logged-out visitors) can read a share by its code;
-- only the owner can create or revoke one. Note that `using (true)` also lets
-- anyone list every share; codes are random, payloads are meant to be public,
-- and logged-out visitors can only see the code, payload and creation time
-- (see the column grants below). See supabase/README.md, "Security notes".
drop policy if exists shares_public_read on public.shares;
create policy shares_public_read on public.shares for select to anon, authenticated using (true);

drop policy if exists shares_owner_insert on public.shares;
create policy shares_owner_insert on public.shares for insert to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists shares_owner_delete on public.shares;
create policy shares_owner_delete on public.shares for delete to authenticated
  using ((select auth.uid()) = user_id);

-- Logged-out visitors never see who shared a chart or the session id.
revoke select on public.shares from anon;
grant select (code, payload, created_at) on public.shares to anon;

-- Explicit grants (Supabase usually grants these by default; listing them keeps
-- the migration correct on projects with tighter defaults).
grant usage on schema public to anon, authenticated;
grant select, insert, update, delete on
  public.sessions, public.chords, public.keys, public.markers, public.midi_tracks
  to authenticated;
grant select, insert, delete on public.shares to authenticated;
revoke all on
  public.sessions, public.chords, public.keys, public.markers, public.midi_tracks
  from anon;
