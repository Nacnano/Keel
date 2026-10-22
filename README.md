# JamKey

Personal web app for jamming and solo piano: it listens to the microphone or a
USB MIDI piano, shows the current **key** and **chord** in real time, keeps a
timeline of the progression, and captures ideas so they are not lost.

- Product design and decisions: [`DESIGN.md`](DESIGN.md)
- Engineering plan and contracts: [`docs/IMPLEMENTATION_PLAN.md`](docs/IMPLEMENTATION_PLAN.md)
- Architecture summary: [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md)
- PR history: [`docs/PR_LOG.md`](docs/PR_LOG.md)

## Develop

```sh
pnpm install
pnpm dev          # http://localhost:5173  (add ?mock=1 for a scripted chord stream)
pnpm test         # vitest
pnpm lint         # oxlint + prettier --check
pnpm typecheck    # tsc -b
pnpm build        # production build with PWA service worker
```

Node 22, pnpm 11. Everything runs in the browser. Cloud sync (Google sign-in)
and public share links are optional: they switch on when `VITE_SUPABASE_URL`
and `VITE_SUPABASE_ANON_KEY` are set (copy `.env.example` to `.env.local`).
Setup steps: [`supabase/README.md`](supabase/README.md). Without them the app
is fully local.

## Browser support

| Feature                 | Chrome / Edge (laptop) | Safari (iPad)            |
| ----------------------- | ---------------------- | ------------------------ |
| Mic chord/key detection | yes                    | yes                      |
| Web MIDI                | yes                    | no                       |
| Install as PWA          | yes                    | yes (Add to Home Screen) |
