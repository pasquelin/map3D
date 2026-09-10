## What and why

<!-- What this changes, and the reason. Link the issue: Closes #123 -->

## Type of change

- [ ] Fix (no public API change)
- [ ] Feature / API change — in `0.x` a minor version may break the API, documented in `CHANGELOG.md`
- [ ] Documentation only
- [ ] Internal (build, CI, tooling)

## Checklist

- [ ] Branched off **`develop`** and targeting `develop` (`main` is the release branch)
- [ ] `pnpm validate` is green locally
- [ ] Tests added or updated next to the code (`*.test.ts`)
- [ ] Docs updated in **both languages** (`docs/fr/` **and** `docs/en/`)
- [ ] `llms.txt` / `llms-full.txt` regenerated if the English docs or the API moved (`pnpm llms`)
- [ ] New public API wired into `examples/react/`
- [ ] `CHANGELOG.md` entry under `## [Non publié]`
- [ ] No `any`, no hard-coded value or string (everything through `config` / `theme` / `labels` or a prop)

## Screenshots / recording

<!-- For anything visual. Before / after helps. -->
