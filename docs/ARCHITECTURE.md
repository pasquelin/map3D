# Architecture & conventions — map3d

Spec interne destinée aux **contributeurs**. Décrit le modèle mental de la lib et les
conventions non négociables. (Doc de dépôt, non publiée dans le paquet npm.)

`map3d` est un **moteur impératif que React pilote**, pas un arbre de composants qui détient
l'état. `MapEngine` est la source de vérité ; React le monte déclarativement et **reste hors de
la boucle de frame**.

## 1. Cœur agnostique (`src/core/`, `src/layers/`, `src/data/`…) — sans React

`MapEngine` (`src/core/MapEngine.ts`) tient three.js, la caméra, les tuiles 3D et une **liste de
couches**. Utilisable seul, hors React (retombe sur `defaultConfig`).

- **`Layer`** (`src/core/Layer.ts`) : `update(ctx)` (avance la 3D — passe de **LECTURE**) /
  `project(ctx)` (écrit les overlays DOM — passe d'**ÉCRITURE** pure, après toutes les lectures) /
  `dispose()` / `setConfig?()`. Couches concrètes dans `src/layers/`.
- **Séparation lecture/écriture par frame** : toutes les projections écran (`translate3d`) se
  font en une passe `project()` **après** les `update()`, pour éviter les reflows entrelacés.
  Viser le **zéro-alloc** en boucle de frame (scratch pré-alloués, pas de `new` par frame).
- **Registres portés par le moteur** (branchables par une couche custom) : `engine.selectables`
  (marquee), `engine.drag` (drag-and-drop typé), `engine.markers` (inventaire loupe),
  `engine.tags` (filtre « Couches »), `SearchRegistry` (recherche unifiée). Les **réutiliser**
  plutôt que les recâbler.
- **Drapage au sol** : hauteur d'ancre raycastée et mémoïsée (`AnchorHeightCache`), traits en
  **px écran** constants au zoom, resettle LOD.

## 2. Couche React (`src/react/`) — pilote le moteur

- `MapProvider` fournit les **trois arbres de réglages**, mergés profondément sur une base
  complète : **`theme`** (charte), **`labels`** (langue + unités, aucun texte en dur),
  **`config`** (`MapConfig` : clés d'API, quotas, gestes, budgets). Les props d'un composant
  surchargent ces arbres pour une instance.
- `<Map>` monte l'UI déclarativement (props `toolbar` / `controls` / `search` / `dock` / `draw` /
  `layers`) ; `MapHandle` (ref impérative) cadre/dessine/interroge de l'extérieur.
- **Toutes les surfaces et couches de la lib sont montées EN INTERNE par `<Map>`** (dans
  `MapSurfaces.tsx` ou les hôtes de `Map.tsx`), pilotées par `config`/`theme`/`labels`/props —
  jamais par l'hôte. Une couche qui « peint » (grille, HUD piéton, cluster, catalogue…) se monte
  inconditionnellement ou selon une prop, **jamais** en exigeant que l'app la place en enfant de
  `<Map>`. Les **`children` de `<Map>` sont réservés aux overlays PROPRES à l'hôte** : une app
  doit pouvoir tout obtenir sans presque rien y mettre. Avant d'exporter une nouvelle surface, la
  monter dans `MapSurfaces`.

## 3. « Latest ref pattern » assumé — NE PAS le combattre

L'état vit dans `MapEngine`, pas dans React. Le motif **`ref.current = props` au render**, lu par
un handler/closure qui **survit à ses renders**, est **délibéré** (~97 emplois) : il évite qu'un
handler redéfini à chaque render ne reconstruise le moteur ou ne relance une requête. Les valeurs
sont **lues au moment de l'appel**, pas capturées.

En conséquence, les règles du **React Compiler sont désactivées sciemment** dans
`eslint.config.js` (`react-hooks/refs`, `immutability`, `set-state-in-effect`, `use-memo`) et
`exhaustive-deps` est en `warn`. **Ne pas « corriger » ces motifs vers du state React** ni
compléter une deps-array marquée `// eslint-disable`.

## 4. Domaines fonctionnels

`src/layers/draw/` éditeur de dessin (Selection/Edit/Overlay/History/Settings). `src/relations/`
liens par tags + routage réel (Google Routes). `src/symbols/` catalogue MIL-STD-2525D chargé en
**import dynamique** (`@armyc2…`, ~9 Mo, jamais bundlé sans symboles à l'écran). `src/search/`,
`src/theme/`, `src/labels/`, `src/config/` (merge + defaults).

## 5. Conventions de code (non négociables)

- **Point d'entrée public unique** : `src/index.ts`. Toute API publique y est ré-exportée.
- **Tout est config et params.** Aucune valeur ni texte en dur : comportement, couleur, libellé,
  seuil passent par `config` / `theme` / `labels` ou une prop.
- **`type`, jamais `interface`.** **`any` interdit** (`no-explicit-any: error`). `tsconfig` en
  `strict` + `noUncheckedIndexedAccess` + `noUnused*`. Paramètre ignoré : préfixe `_`.
- **Style** (Prettier) : pas de `;`, guillemets simples, `printWidth: 120`, `trailingComma: all`.
- **Commentaires** courts, en **français**, expliquant le *pourquoi* (le piège, la contrainte),
  jamais la paraphrase du code.
- Alias d'import `@/*` → `src/*`. Tests colocalisés `*.test.ts` (env jsdom).
- Le bundle **externalise** react/react-dom/three/supercluster/3d-tiles-renderer — ne rien
  embarquer de ces deps.
