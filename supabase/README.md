# Supabase setup (cloud sync + share links)

JamKey works fully offline without any of this. Cloud sync, Google sign-in and
public share links switch on when the app is built with two env vars:
`VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`. Chord data syncs; audio
recordings never leave the device.

Time needed: about 15 minutes. Replace `<project-ref>` with your project's id
(the subdomain of its URL) and `<your-domain>` with the production domain
(for example `jamkey.vercel.app`).

## 1. Create the project

1. Sign in at <https://supabase.com/dashboard> and click **New project**.
2. Pick a name (e.g. `jamkey`), a strong database password (store it; the app
   does not need it) and the region closest to you. Free tier is enough.
3. Wait until the project finishes provisioning.

## 2. Run the migration

1. Open **SQL Editor** → **New query**.
2. Paste the whole of [`migrations/0001_init.sql`](migrations/0001_init.sql)
   and click **Run**. It creates the tables, indexes, the last-write-wins
   trigger and the row-level security policies. It is safe to run again.
3. Check **Table Editor**: `sessions`, `chords`, `keys`, `markers`,
   `midi_tracks` and `shares` exist, each marked "RLS enabled".

(With the Supabase CLI instead: `supabase link --project-ref <project-ref>`
then `supabase db push`.)

## 3. Enable Google sign-in

### 3a. Google Cloud OAuth client

1. Go to <https://console.cloud.google.com/apis/credentials> (create a Google
   Cloud project if you have none).
2. **OAuth consent screen**: user type _External_, app name `JamKey`, your
   email as support and developer contact. Scopes: the defaults (`email`,
   `profile`, `openid`) are all JamKey needs. While the app is in _Testing_,
   add your own Google account under **Test users**.
3. **Credentials** → **Create credentials** → **OAuth client ID** →
   application type **Web application**.
   - **Authorized JavaScript origins**: `http://localhost:5173` and
     `https://<your-domain>`.
   - **Authorized redirect URIs**: exactly
     `https://<project-ref>.supabase.co/auth/v1/callback`
     (Supabase shows this URL on the Google provider page as "Callback URL").
4. Copy the **Client ID** and **Client secret**.

### 3b. Supabase provider

1. Supabase dashboard → **Authentication** → **Sign In / Providers** →
   **Google** → enable it, paste the Client ID and Client secret, **Save**.
2. **Authentication** → **URL Configuration**:
   - **Site URL**: `https://<your-domain>`
   - **Redirect URLs** (JamKey returns you to the page you signed in from,
     usually `/settings`, so use wildcards):
     - `http://localhost:5173/**`
     - `https://<your-domain>/**`
     - Vercel previews (optional): `https://*-<vercel-team-slug>.vercel.app/**`

## 4. Local env

1. Supabase dashboard → **Project Settings** → **API** (or the **Connect**
   button). Copy the **Project URL** and the **anon / public** key (newer
   projects call it the _publishable_ key, `sb_publishable_…`; either works).
   Never use the `service_role` / secret key in the app.
2. In the repo root: `cp .env.example .env.local` and fill in:

   ```sh
   VITE_SUPABASE_URL=https://<project-ref>.supabase.co
   VITE_SUPABASE_ANON_KEY=<anon key>
   ```

   `.env.local` is git-ignored.

3. `pnpm dev`, open <http://localhost:5173/settings>, **Sign in with Google**.
   After the redirect, "Account & sync" shows your email and the first sync
   runs. Record a short session and check the `sessions` table.

## 5. Vercel

1. Vercel → your project → **Settings** → **Environment Variables**. Add
   `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` with the same values, for
   **Production** and **Preview** (and Development if you use `vercel dev`).
2. Redeploy (**Deployments** → latest → **Redeploy**). Vite inlines `VITE_*`
   vars at build time, so existing builds do not pick them up.
3. `vercel.json` already rewrites every route (including `/s/<code>` share
   links) to `index.html`.

## Security notes

- Every synced table has row-level security: a signed-in user can only read
  and write rows whose `user_id` is their own. The anon key alone cannot read
  any session.
- `shares` is readable by anyone (that is what makes links public). Logged-out
  visitors can read only `code`, `payload` and `created_at`; the select policy
  is `true`, so someone with the anon key could also list all shares rather
  than guess codes. Payloads are charts the owner chose to publish, but if
  that matters, replace the public select policy with a `security definer`
  function `get_share(code)` and switch `fetchShare` to `rpc('get_share')`.
- Revoking a link deletes the row. Anyone who already opened it may still
  have a copy.
