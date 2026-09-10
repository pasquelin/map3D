# Contributing to map3d

Thanks for taking the time. This page is the short version of what the project expects;
the long version lives in [`CLAUDE.md`](../CLAUDE.md) and [`docs/ARCHITECTURE.md`](../docs/ARCHITECTURE.md).

> 🇫🇷 Le code source, les commentaires et la JSDoc de ce dépôt sont **en français**.
> La documentation utilisateur est bilingue (`docs/fr/` et `docs/en/`). Les issues et les PR
> sont acceptées dans les deux langues.

## 1. Before you open a pull request

- **Open an issue first** for anything that changes the public API or adds a feature. The library
  is a real-time rendering engine with a deliberate architecture — a well-meant patch that fights it
  costs more to review than to write.
- **Read the license.** map3d is published under [PolyForm Noncommercial 1.0.0](../LICENSE).
  By contributing you agree that your contribution is licensed under those same terms and that the
  copyright holder of the project remains Alban Pasquelin. Commercial use requires a separate license.

## 2. Setting up

The package manager is **pnpm** (see `pnpm-workspace.yaml`). Node **≥ 22.13**.

```bash
pnpm install
pnpm dev:example      # runs examples/react — the live playground
```

The example reads `VITE_CESIUM_ION_TOKEN` from `examples/react/.env` to load Google
Photorealistic 3D Tiles. Without a token it falls back to the built-in ellipsoid globe, which is
enough for most work.

## 3. Branching — `develop` is the integration branch

`main` is the protected release branch; **features branch off `develop` and are merged back into
`develop` by pull request**. Releases are cut from `main` by pushing a `vX.Y.Z` tag.

One feature = one branch = **one git worktree**. The working tree *and the git index* are shared
between sessions of the same clone, so two people (or two agents) working in the same folder will
step on each other's staged files:

```bash
git worktree add ../map3D-feat-x -b feat/x develop
cd ../map3D-feat-x
# … commits on feat/x …
git push -u origin feat/x        # → open a PR against develop
git worktree remove ../map3D-feat-x
```

Stage by explicit path (`git add <path>`), never `git add -A`.

## 4. The gate — `pnpm validate`

One command has to be green before you push. CI replays exactly this on every PR:

```bash
pnpm validate
```

It runs, in order: `site:check` · `labels:doc:check` · `llms:check` · `licences:check` ·
`typecheck` · `typecheck:example` · `lint` · `format:check` · `test`.

Useful pieces on their own:

| Command | What it does |
| --- | --- |
| `pnpm typecheck` | `tsc --noEmit` |
| `pnpm test` | Vitest, jsdom, tests colocated as `src/**/*.test.ts` |
| `pnpm exec vitest run src/core/fetchPolicy.test.ts` | a single test file |
| `pnpm lint` / `pnpm format` | ESLint / Prettier |
| `pnpm llms` | regenerates `llms-full.txt` from `docs/en/` |
| `pnpm labels:doc` | regenerates the generated label tables in `LABELS.md` |

## 5. House rules

These are not stylistic preferences — a PR that breaks them will be sent back.

- **Never guess.** Separate what you verified in the repo from what you assumed. If a source is not
  there, ask rather than invent it.
- **Everything is config.** No hard-coded value, no hard-coded string. Behaviour, colour, label and
  threshold go through `config` / `theme` / `labels` or a prop.
- **Full React on the host side.** The public API is components, props and hooks — never a forced
  imperative access.
- **`any` is a build error.** `strict`, `noUncheckedIndexedAccess`, `noUnused*` are on. Ignored
  parameters are prefixed with `_`.
- **`type`, never `interface`.**
- **Prettier**: no semicolons, single quotes, `printWidth: 120`, `trailingComma: all`.
- **Comments explain the *why*** — the trap, the constraint, the decision — never paraphrase code.
- **Zero allocation in the frame loop.** Read (`update`) and write (`project`) passes stay separate;
  don't break marker pooling.
- **The "latest ref" pattern is deliberate** (~97 uses). Several React Compiler rules are disabled on
  purpose in `eslint.config.js`. Do not "fix" those into React state.
- **Public entry point is `src/index.ts`.** Anything the host must use is re-exported there.
- **Every surface is mounted internally by `<Map>`** (`MapSurfaces.tsx`), never by the host app.
  `children` of `<Map>` are reserved for host-specific overlays.

## 6. A feature is not finished without

1. **Docs in both languages** — `docs/fr/` *and* `docs/en/`, same file names, in the same commit.
2. **`llms.txt` / `llms-full.txt` regenerated** (`pnpm llms`) whenever the English docs or the API move.
3. **The example updated** — every new public API is wired into `examples/react/`.
4. **`CHANGELOG.md`** — add your entry under `## [Non publié]`.
5. **Tests** next to the code, `*.test.ts`.

## 7. Commits and pull requests

- One logical change per commit; write the message in French or English, in the imperative.
- The PR description says **what** changes and **why**, and links the issue.
- CI must be green. PRs are squash- or rebase-merged into `develop`; delete the branch afterwards.

## Reporting a security issue

Do **not** open a public issue — see [SECURITY.md](SECURITY.md).
