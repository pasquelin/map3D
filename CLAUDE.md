# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Nature du projet

`map3d` — bibliothèque **React de cartographie 3D** publiée en npm (ESM + CJS + types).
Le code source (commentaires, JSDoc, docs) est **en français** : s'y conformer.

Gestionnaire de paquets : **pnpm** (`pnpm-workspace.yaml`, `pnpm-lock.yaml`). Peer deps : `react`/`react-dom` 19, `three` ≥ 0.160.

## Commandes

```bash
pnpm build            # tsc --noEmit && vite build (library mode : dist/ ESM+CJS+.d.ts)
pnpm typecheck        # tsc --noEmit
pnpm test             # vitest run (env jsdom, fichiers src/**/*.test.ts colocalisés)
pnpm test:watch       # vitest
pnpm lint             # eslint src
pnpm format           # prettier --write "src/**/*.{ts,tsx}"
pnpm dev:example      # lance l'exemple React (examples/react/vite.config.ts)
```

Un seul test : `pnpm exec vitest run src/core/fetchPolicy.test.ts` ou `pnpm exec vitest run -t "nom du test"`.

L'exemple (`pnpm dev:example`) attend `VITE_CESIUM_ION_TOKEN` dans `examples/react/.env` (token Cesium Ion → Google Photorealistic 3D Tiles). Sans token, il retombe sur le globe ellipsoïde de repli.

## Documentation — multilingue

`docs/` est **bilingue**, une langue par dossier nommé en **ISO 639-1**, avec les **mêmes noms de fichiers** de part et d'autre (`docs/fr/MARKERS.md` ↔ `docs/en/MARKERS.md`).

```
README.md          landing bilingue court (npm) — pitch, install, quick start, liens
docs/README.md     sélecteur de langue + structure + procédure d'ajout d'une langue
docs/fr/README.md  guide long FR + index          docs/en/README.md  idem EN
docs/fr/*.md       11 guides + 4 références       docs/en/*.md       idem
```

Règles à tenir :

- **Toute évolution d'API met à jour les DEUX langues** dans le même mouvement. Une doc FR sans son pendant EN n'est pas finie.
- Chaque fichier porte en 2ᵉ ligne son sélecteur de langue (`**Français** · [English](../en/X.md) · [↑ Index](README.md)`), et les **titres de section sont numérotés** : les liens croisés pointent sur ces ancres, les renommer casse les deux langues.
- **Références** (`CONFIG.md`, `THEME.md`, `LABELS.md`, `PROPS.md`) : **générées depuis les sources** côté FR (types + JSDoc, qui sont en français), à ne pas éditer à la main. Leur version EN est traduite à la main et porte un encadré le disant — à revoir quand les types changent.
- **Guides** (les 11 autres) : manuels, dans les deux langues.
- Ne se traduisent **pas** : code des exemples, noms d'API, clés de `labels`, identifiants (`marker:agent`, `m3d:tag-filter`). Les défauts de `LABELS.md` restent les chaînes françaises réelles de la lib — ce sont des données.
- **Fichiers `llms.txt` / `llms-full.txt`** (racine, **anglais uniquement**, destinés aux IA, publiés dans le paquet npm via `files`) : `llms.txt` est l'index (résumé, quick start, liens vers `docs/en/`, carte de l'API) ; `llms-full.txt` est autoportant (les 24 docs EN concaténées). **Toute évolution d'API ou de doc EN les périme** : les régénérer depuis `docs/en/` dans le même mouvement (en-tête + concat de `README, MARKERS, ZONES, CATALOG, DRAWING, SYMBOLS, TEMPLATES, RELATIONS, LENS, SEARCH, CAMERA, PEDESTRIAN, TILES, BUILDINGS, GRATICULE, DATA, HOOKS, ENGINE, PLUGINS, PREFERENCES, CONFIG, THEME, LABELS, PROPS`, ligne de sélecteur de langue retirée). Vérifier aussi que les exports cités dans la « carte de l'API » suivent `src/index.ts`.

NB : le script `pnpm doc` évoqué dans les docs n'est pas défini dans `package.json`, pas plus qu'un `pnpm llms` : la régénération des `llms*.txt` est manuelle.

## Architecture — la grande image

La lib est un **moteur impératif que React pilote**, pas un arbre de composants qui détient l'état.

### 1. Cœur agnostique (`src/core/`, `src/layers/`, `src/data/`…) — sans React

`MapEngine` (`src/core/MapEngine.ts`) est la source de vérité : three.js, caméra, tuiles 3D, et une **liste de couches**. Utilisable seul, hors React (retombe sur `defaultConfig`).

- **`Layer`** (`src/core/Layer.ts`) : interface `update(ctx)` (avance la 3D — passe de LECTURE) / `project(ctx)` (écrit les overlays DOM — passe d'ÉCRITURE pure, après toutes les lectures) / `dispose()` / `setConfig?()`. Les couches concrètes vivent dans `src/layers/` : `TiledGlobeLayer`, `MarkerLayer`, `ClusterLayer`, `ShapeLayer`, `PathLayer`, `DrawLayer`, `LinkLayer`, `DrapedLayer`.
- **Séparation lecture/écriture par frame** : toutes les projections écran (`translate3d`) se font en une passe `project()` après les `update()`, pour éviter les reflows entrelacés.
- **Registres portés par le moteur** (branchables par une couche custom) : `engine.selectables` (marquee), `engine.drag` (drag-and-drop typé), `engine.markers` (inventaire pour la loupe), `engine.tags` (filtre « Couches »), `SearchRegistry` (recherche unifiée). Les exposer plutôt que les recâbler.
- **Drapage au sol** : hauteur d'ancre raycastée et mémoïsée (`AnchorHeightCache`), traits en **px écran** constants au zoom, resettle LOD. Voir mémoire projet « Drapage des formes ».

### 2. Couche React (`src/react/`) — pilote le moteur

- `MapProvider` fournit les **trois arbres de réglages**, mergés profondément sur une base complète : **`theme`** (charte graphique), **`labels`** (langue + unités, aucun texte en dur), **`config`** (`MapConfig` : clés d'API, quotas, gestes, budgets, support). Les props d'un composant surchargent ces arbres pour une instance.
- `<Map>` monte l'UI déclarativement (props `toolbar` / `controls` / `search` / `dock` / `draw` / `layers`) dans le bon ordre d'imbrication ; `MapHandle` (ref impérative) cadre/dessine/interroge depuis l'extérieur.
- Hooks dans `src/react/hooks/` (`useCamera`, `useViewport`, `useLiveData`, `useDrawing`, `useLens`, `useTags`, drag-and-drop…).

### 3. « Latest ref pattern » assumé — NE PAS le combattre

L'état vit dans `MapEngine`, pas dans React. Le motif `ref.current = props` au render, lu par un handler qui survit à ses renders, est **délibéré** (~97 emplois, documentés). Les règles du **React Compiler sont désactivées sciemment** dans `eslint.config.js` (`react-hooks/refs`, `immutability`, `set-state-in-effect`, `use-memo`) et `exhaustive-deps` est en `warn`. Ne pas « corriger » ces motifs vers du state React.

### Domaines fonctionnels

`src/layers/draw/` éditeur de dessin (Selection/Edit/Overlay/History/Settings). `src/relations/` liens par tags + routage réel (Google Routes). `src/symbols/` catalogue MIL-STD-2525D chargé en **import dynamique** (`@armyc2…`, ~9 Mo, jamais bundlé sans symboles à l'écran). `src/search/`, `src/theme/`, `src/labels/`, `src/config/` (merge + defaults).

## Principes de travail (non négociables)

- **Ne jamais deviner.** Avant tout codage non trivial, demander ce qu'il faut pour réussir l'objectif sans supposer, et distinguer explicitement ce qui est **vérifié** (lu dans le repo) de ce qui est supposé. Vérifier qu'une source (fichier, API, type, valeur, convention) existe réellement — par lecture ou `grep` — avant de la référencer ; sinon, **demander**. Jamais « essayer pour voir » sans savoir.
- **Tout est config et params.** Aucune valeur en dur, aucun texte en dur : un comportement, une couleur, un libellé, un seuil se règle via `config` / `theme` / `labels` ou une prop. Toute nouveauté s'expose de la même façon.
- **Full React.** Côté hôte, l'API se consomme en composants, props et hooks — pas d'accès impératif imposé (le moteur reste piloté depuis React).
- **Docs toujours à jour.** Toute évolution d'API publique met à jour `docs/` dans le même mouvement (guides manuels + références générées). Une feature sans doc n'est pas finie.
- **Exemple toujours à jour.** Toute nouvelle feature ou API publique est **branchée dans `examples/react/`** dans le même mouvement : c'est la preuve vivante qu'elle marche hors dev et le terrain où un utilisateur la teste réellement (`pnpm dev:example`). Une feature qu'on ne peut pas exercer dans l'exemple n'est pas finie.
- **Code propre, performant, optimisé.** C'est une lib de rendu temps réel : viser le zéro-alloc en boucle de frame, respecter la séparation lecture/écriture, ne pas casser le recyclage des markers.
- **Bonnes pratiques React** : s'appuyer sur les skills React disponibles (`react`, `react-expert`, `vercel-react-best-practices`…) avant d'écrire ou refactorer du React.
- **Fin de feature** : lancer `/simplify`, puis un *react doctor* (diagnostic React), et **demander** à l'utilisateur avant de lancer des tests Playwright.

## Conventions

- **Point d'entrée public unique** : `src/index.ts`. Tout ce qui doit être utilisable par l'hôte y est ré-exporté ; l'ajout d'une API publique passe par là.
- **Style** (Prettier) : pas de `;`, guillemets simples, `printWidth: 120`, `trailingComma: all`.
- **`any` interdit** (`@typescript-eslint/no-explicit-any: error`) ; `tsconfig` en `strict` + `noUncheckedIndexedAccess` + `noUnused*`. Paramètre ignoré : préfixe `_`.
- **`type`, jamais `interface`.** Toute forme se déclare en `type X = { … }` (unions, intersections, génériques homogènes). Ne pas introduire de nouvelle `interface`.
- **Commentaires courts et utiles.** Une ligne dense qui explique le *pourquoi* (le piège, la contrainte, la décision), jamais de paraphrase du code ni de remplissage. Si le code se lit seul, pas de commentaire.
- Alias d'import `@/*` → `src/*`.
- Tests colocalisés `*.test.ts` (fonctions pures surtout : `mergeConfig`, `mergeTheme`, `diff`, `fetchPolicy`, `measure`…), env jsdom.
- Le bundle **externalise** react/react-dom/three/supercluster/3d-tiles-renderer (cf. `vite.config.ts`) — ne rien embarquer de ces deps.
