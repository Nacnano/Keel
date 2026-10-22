/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Supabase project URL, e.g. `https://abcd1234.supabase.co`. Optional: unset disables sync. */
  readonly VITE_SUPABASE_URL?: string;
  /** Supabase anon (public) key. Optional: unset disables sync. */
  readonly VITE_SUPABASE_ANON_KEY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
