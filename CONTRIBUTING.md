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

## Code style

Prettier (single quotes, width 100), oxlint, TypeScript strict. Use the `@/`
alias for `src/`. Tests live next to code as `*.test.ts(x)`.
