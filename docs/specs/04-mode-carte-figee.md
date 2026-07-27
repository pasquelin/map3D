# BLOQUANT 3 — Mode carte figée (`interactive`)

> Statut : implémenté. `pnpm typecheck` vert (lib + exemple).

## Le besoin, redimensionné par l'audit

Le prompt annonçait `ViewDangerOverview`, `ViewForm` et « tous les affichages de type
`Map3D` » comme lecture seule. Vérification faite dans l'Operator, c'est inexact :

- **`staticMap` n'a qu'un seul consommateur** : `views/dashboard/ViewDashboardResumeMap.tsx`.
- `ViewDangerOverview` passe `addZones focusPosition focusRadius traces` — carte normale.
- `ViewForm` passe `addZones onMapLoad scrollwheel` — carte normale.
- `Map3D.tsx` **n'utilise pas `Map.tsx`** : c'est un composant autonome montant un
  `Map3DElement` Google, pleinement navigable. Hors sujet ici.

`disabled` (1 consommateur, `companyZones/ViewDetail`) ne fait que couper le raccourci
clavier Delete/Backspace (`Map.tsx:716`) — **aucune API lib nécessaire**, l'hôte gère son
propre handler.

Ce que fait réellement `staticMap` dans l'ancienne carte : `gestureHandling: 'none'`
(`:799`), `clickable: !staticMap` sur les formes (`:376`), édition coupée (`:530`),
`onViewportChange` coupé (`:636-640`), `useMapDrawing` neutralisé.

## Ce qui a été livré

```ts
type InteractiveMode = boolean | 'view'
```

| Mode | Caméra | Outils (dessin, loupe) | Clic carte | Markers |
|---|---|---|---|---|
| `true` (défaut) | libre | actifs | émis | cliquables |
| `'view'` | **figée** | neutralisés | émis | cliquables |
| `false` | **figée** | neutralisés | **supprimé** | **inertes** |

`'view'` existe parce que « figé » recouvre deux besoins distincts : un aperçu qu'on
consulte (les markers restent vivants, on peut sélectionner) et une image inerte.

API : prop `<Map interactive>` et `engine.setInteractive(mode)` / `engine.interactive`.

### Comment le gel est obtenu

**`controls.enabled = false`.** Vérifié dans la source de `3d-tiles-renderer` : le setter
`EnvironmentControls.enabled` appelle `resetState()` + `pointerTracker.reset()`, et chaque
handler démarre par `if (!this.enabled) return`. Pan, rotation **et zoom molette** sont
donc coupés d'un coup. C'est exactement pourquoi `setDrawing()` gardait `enabled = true` et
figeait autrement (il voulait garder la molette).

**`setDrawing()` ne force plus `controls.enabled = true` aveuglément** — il applique
`this.interactiveMode === true`. Sans ce correctif, monter un `<DrawLayer>` sur une carte
figée lui aurait rendu la navigation dans le dos de l'hôte.

**Pas via `inputInterceptor`.** Ce slot est unique et déjà disputé entre le dessin et la
loupe (cf. le commentaire défensif de `DrawLayer.tsx:250-255`). Le mode figé le laisse en
place mais **ne l'appelle pas** : `onPointerDown/Move/Up` sont gardés par `toolsActive`.
Un outil resté sélectionné ne dessine donc plus, et retrouve son état intact au dégel.

**Markers inertes en `false`** — les markers sont du DOM qui réactive `pointer-events`
élément par élément ; le `pointer-events: none` du conteneur CSS2D ne les recouvre pas,
c'est justement ce qui les rend cliquables. Il faut une règle **descendante**, exactement
comme celle qui existait déjà pour l'intro :

```css
.m3d-root.m3d-inert .m3d-css2d *,
.m3d-root.m3d-inert .m3d-overlay > * { pointer-events: none !important }
.m3d-root.m3d-inert canvas { cursor: default }
```

**Appliqué avant `start()`** au montage : une carte montée figée ne doit pas être navigable
ne serait-ce qu'une frame, or l'effet de synchronisation ne tourne qu'après le rendu.
La bascule à chaud (une vue qui passe en lecture seule sans se démonter) est gérée par un
effet séparé.

## Ce qui reste actif, volontairement

**Les contrôles de la lib** (`MapControls`, `Toolbar`, `SearchBox`) restent cliquables :
ils sont rendus dans `.m3d-root` et non dans `.m3d-overlay`. `interactive` fige la
**carte**, pas l'UI de l'hôte. Un bouton de zoom laissé visible sur une carte figée
fonctionnerait donc encore — c'est à l'hôte de le masquer :

```tsx
<Map interactive={false}>
  <MapControls buttons={{ zoomIn: false, zoomOut: false, tilt: false, globe: false }} />
</Map>
```

Ce choix évite d'inventer une règle implicite (« quels boutons se masquent tout seuls ? »)
que l'hôte ne pourrait pas contourner.

**`onViewportChange` continue d'être émis.** L'ancienne carte le coupait sous `staticMap`,
mais c'était un contournement : sans interaction, le viewport ne bouge de toute façon plus
après stabilisation. Le couper priverait l'hôte du premier event, celui qui lui sert
justement à charger ses données.

**Overlays, markers, formes et tracés restent rendus.** C'est une carte figée, pas une
capture d'écran — critère explicite du prompt.

## Correspondance

| Ancienne carte | map3d |
|---|---|
| `staticMap` | `<Map interactive={false}>` ou `'view'` selon que les markers doivent rester cliquables |
| `gestureHandling: 'none'` | inclus dans `interactive` |
| `clickable: !staticMap` sur les formes | inclus (`false`) |
| `disabled` | aucune API — l'hôte garde son handler clavier |
| `scrollwheel` (1 site, `ViewForm`) | `interactive` coupe la molette avec le reste ; pas de réglage isolé |

## Critères d'acceptation

- [x] En `interactive={false}` : carte immobile, zones/markers/traces toujours rendus,
      aucun handler de navigation actif.
- [x] Distinction documentée entre `'view'` et `false`.
- [x] `pnpm typecheck` vert.
- [x] Exemple : bouton cyclant `true → 'view' → false`.

## Non vérifié

Le comportement n'a pas été contrôlé dans un navigateur (`pnpm dev:example` non lancé).
En particulier la règle CSS `m3d-inert` sur les markers, et le fait qu'aucun geste tactile
ne subsiste sur mobile.

Point non couvert : `scrollwheel` seul (molette coupée mais pan conservé) n'a pas
d'équivalent. Un seul site le passe (`ViewForm`), et l'audit n'a pas établi si ce réglage
est intentionnel ou hérité — à trancher au moment de migrer cette vue.
