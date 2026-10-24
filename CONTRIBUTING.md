# Contributing

## Workflow

1. Branch from `main`: `chore/<topic>`, `feat/<workstream>`, `fix/<topic>`, `core/<change>`.
2. Small [Conventional Commits](https://www.conventionalcommits.org/): `feat(audio): hpcp chroma extraction`. One logical change per commit.
3. `pnpm lint && pnpm typecheck && pnpm test && pnpm build` must pass.
4. Open a PR with `gh pr create --base main` and fill `.github/PULL_REQUEST_TEMPLATE.md`.
5. Append a row to `docs/PR_LOG.md`.
6. Merge with a **merge commit**: `gh pr merge <n> --merge`. Never squash, never rebase-merge. History is kept as-is.

## Ownership

| Folder                  | Owner workstream                                |
| ----------------------- | ----------------------------------------------- |
| `src/core/`             | frozen contracts; changes only via a `core/` PR |
| `src/theory/`           | WS-A                                            |
| `src/audio/`            | WS-B                                            |
| `src/analysis/`         | WS-C                                            |
| `src/midi/`             | WS-D                                            |
| `src/ui/`, `src/state/` | WS-E (jam), WS-H (review/library)               |
| `src/data/`             | WS-F                                            |
| `src/app/`              | integrator                                      |

Do not edit another workstream's folder in your PR. If you need a contract
change, describe it in the PR body; the integrator lands it.

## CI/CD

The **Keel CI** workflow in `.github/workflows/ci.yml` runs on every pull request, on pushes to `main`, and in merge queues:

- **Jobs run in parallel:** `Lint and format`, `Typecheck`, `Unit tests` (with a coverage
  report attached as `keel-coverage` and summarised on the run page), `Production build`
  (checks that the worker, worklet and service worker are emitted, summarises bundle sizes,
  uploads the `keel-dist` artifact).
- **`CI` is the single required check** for branch protection; it fails if any job failed,
  was cancelled or skipped.
- Workflow permissions are read-only, every job has a timeout, a newer push cancels the
  in-progress run for the same PR, and all third-party actions are pinned to commit SHAs
  (Dependabot keeps them and npm dependencies updated weekly, minor/patch grouped, majors
  left for manual review).
- Node comes from `.nvmrc`, pnpm from `packageManager`; `.github/actions/setup` is the
  shared install step.
- **Deploys** are handled by the Vercel GitHub integration: every PR gets a preview URL,
  every merge to `main` goes to production at https://keel.nacnano.dev.
- Repo settings: merge commits only (squash and rebase merge are disabled), merged branches
  are deleted automatically, secret scanning with push protection and CodeQL are on.

## Code style

Prettier (single quotes, width 100), oxlint, TypeScript strict. Use the `@/`
alias for `src/`. Tests live next to code as `*.test.ts(x)`.
