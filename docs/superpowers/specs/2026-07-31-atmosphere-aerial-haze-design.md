# Perspective aérienne (haze) + atmosphère orbitale — conception

**Date** : 2026-07-31 · **État** : conception validée en brainstorming, en attente de relecture

## 1. Contexte et périmètre

Le moteur affiche un globe recouvert de tuiles 3D photoréalistes (Ion / Google) et de
bâtiments extrudés internes. On veut un rendu proche de Google Earth : horizon doux, terrain
lointain qui se fond dans l'atmosphère, **sans jamais** de bande horizontale — donc **sans
`THREE.Fog`** en vue orbitale.

### Ce qui existe déjà (vérifié dans le repo — à NE PAS reconstruire)

- **`src/core/Sky.ts`** : skydome procédural (Preetham + nuages fbm), repère ECEF
  (`up`/`sunPosition`), fondu par altitude caméra via `config.sky.fade` (500 km → 90 km). Il
  reste la **source de vérité** du ciel et des paramètres atmosphériques.
- **`src/core/sun.ts`** : point subsolaire (cycle jour/nuit). Aucune duplication (« TimeOfDay »).
- **`THREE.Fog` n'est utilisé QUE en mode piéton** (`scene.fog` + fog natif de
  `MeshBasicMaterial`, `MapEngine.ts:~1583`). La vue orbitale n'a **aucun** haze de distance.
- Toute la scène est en **`MeshBasicMaterial` sans lumière** (tuiles = textures cuites ;
  bâtiments = couleurs de sommets, un **seul** matériau partagé — `BuildingsLayer.ts:123`).
- `theme.tiles.filter` (brightness/saturation/contrast) est un **filtre CSS global** sur le
  canvas — incapable de varier selon la distance.
- Pattern **`onBeforeCompile` + `customProgramCacheKey`** déjà employé (`geometry.ts:457`).
- Point de traversée central des matériaux de tuiles : `refreshFogMaterials` (`MapEngine.ts:1632`).
- `3d-tiles-renderer` **0.5.0** émet `load-model` `{ scene, tile, url }` et `dispose-model`
  `{ scene, tile }` — hook de patch par tuile au chargement (vérifié dans `node_modules`).
- **`theme.globe.atmosphere`** : booléen **sans aucun consommateur** aujourd'hui.

### Le manque comblé par cette feature

La **perspective aérienne par-fragment** injectée dans les matériaux des **tuiles 3D et des
bâtiments**, fonction de distance × angle de vue × altitude caméra × altitude fragment ×
densité — raccordée aux couleurs de `Sky.ts` pour une continuité sol→ciel imperceptible — plus
une **sphère atmosphérique orbitale** (halo/limbe) visible seulement de loin.

## 2. Objectifs / non-objectifs

**Objectifs**
- Haze GPU par-fragment sur tuiles 3D + bâtiments, sans `THREE.Fog`, toutes transitions en
  `smoothstep`/exponentielles.
- Continuité de teinte avec `Sky.ts` via des couleurs de référence échantillonnées (pas de
  couleur fixe).
- Sphère atmosphérique orbitale (halo/rim/limbe) fondue **à l'inverse** du Sky (plein en orbite,
  nul au sol) → jamais de double effet.
- Bâtiments : contraste ↓, saturation ↓, luminosité ↑ légère, mélange à la couleur
  atmosphérique, **silhouette préservée**.
- Tout réglable par `config`/`theme` (aucune valeur ni couleur en dur).

**Non-objectifs (hors périmètre)**
- Modifier `Sky.ts`/`sun.ts` (inchangés).
- Toucher au fog du **mode piéton** (reste tel quel).
- Haze sur les overlays fonctionnels (markers, formes, chemins, liens) — ils doivent rester
  lisibles au loin.
- Météo dynamique / scattering avancé (l'architecture le permettra plus tard sans toucher aux
  shaders des bâtiments — cf. `AtmosphereProvider`).

## 3. Architecture

Trois pièces nouvelles, `Sky.ts`/`sun.ts` intacts.

```
AtmosphereManager (possédé par MapEngine, frère de Sky)
├── AtmosphereProvider (interface)              ← découple le haze de Sky
│   └── SkyAtmosphereProvider (implémentation)   ← lit config.sky + subsolar, échantillonne
├── AtmosphereUniforms (objet PARTAGÉ unique)     ← référencé par TOUS les matériaux + le halo
├── applyAtmosphere(material, uniforms)           ← onBeforeCompile + customProgramCacheKey
└── OrbitalHalo (Mesh sphère BackSide)            ← rim/limbe, opacité inverse du Sky
```

Fichiers pressentis (à confirmer au plan) : `src/core/atmosphere/AtmosphereManager.ts`,
`AtmosphereProvider.ts` (types), `SkyAtmosphereProvider.ts`, `atmosphereColors.ts` (portage
Preetham pur + test colocalisé), `materialInjection.ts`, `OrbitalHalo.ts`.

### 3.1 `AtmosphereProvider` — la couleur, découplée

```ts
type AtmosphereColors = {
  zenith: Color          // ciel au zénith
  horizonSun: Color      // horizon en direction du soleil
  horizonOpposite: Color // horizon à l'opposé du soleil
  haze: Color            // teinte proche-sol intermédiaire
}

type AtmosphereProvider = {
  /** Tick qui change dès que l'atmosphère change (soleil, heure, turbidity, rayleigh, mie, météo). */
  revision(): number
  /** Direction du soleil en repère monde (ECEF). */
  sunDirection(out: Vector3): Vector3
  /** Recalcule les couleurs de référence — appelé UNIQUEMENT quand `revision()` a changé. */
  sample(out: AtmosphereColors): void
}
```

`SkyAtmosphereProvider` : `sample()` évalue un **portage TS réduit du modèle de Sky**
(fonction pure `atmosphereColors.ts`, testée) aux 3 directions repères + la couleur `haze`
intermédiaire. `revision()` s'incrémente quand `config.sky` (turbidity/rayleigh/mie/clouds) ou
l'epoch subsolaire change. Remplaçable par une LUT/météo plus tard **sans toucher un shader**.

### 3.2 `AtmosphereUniforms` — partagé, poussé paresseusement

Un **unique** objet d'uniforms, référencé par le matériau des bâtiments **et** chaque tuile
(mélange par référence dans `onBeforeCompile`). Boucle de frame :

```
if (provider.revision() !== lastRev) { provider.sample(colors); writeColorUniforms(); lastRev = revision }
```

En date figée (défaut), les couleurs sont calculées **une seule fois**. Distance/altitude/angle
sont **par-fragment GPU**, à partir de `cameraPosition` (**uniform natif de three, zéro push**)
et de `vWorldPosition`. Altitude géocentrique cohérente : `length(pos) - uPlanetRadius` pour le
fragment **et** la caméra. `up` local = `normalize(vWorldPosition)` (pas d'uniform).

Uniforms partagés :
- Couleurs (sur dirty) : `uAtmoZenith`, `uAtmoHorizonSun`, `uAtmoHorizonOpp`, `uAtmoHaze`,
  `uSunDirWorld`.
- Constantes (sur changement de config) : `uPlanetRadius`, `uHazeDensity`, `uAtmosphereHeight`,
  `uRefDist`, `uDistanceExponent`, `uHorizonStrength`, `uCameraAltInfluence`,
  `uFragAltInfluence`, `uHazeMax`, `uContrastReduction`, `uSaturationReduction`,
  `uBrightnessBoost`.

### 3.3 Shader de haze (injecté)

Facteurs, tous continus (`smoothstep`/exp — jamais de départ brutal) :

```glsl
float dist   = distance(vWorldPosition, cameraPosition);
vec3  viewDir = normalize(vWorldPosition - cameraPosition);
vec3  upLocal = normalize(vWorldPosition);
float camAlt  = length(cameraPosition) - uPlanetRadius;
float fragAlt = length(vWorldPosition) - uPlanetRadius;

float distanceFactor  = 1.0 - exp(-pow(dist / uRefDist, uDistanceExponent) * uHazeDensity);
float viewAngleFactor = smoothstep(0.0, 1.0, 1.0 - abs(dot(viewDir, upLocal)));   // horizon → +haze, nadir → 0
      viewAngleFactor = mix(1.0, viewAngleFactor, uHorizonStrength);
float camAltFactor    = exp(-max(camAlt, 0.0)  / uAtmosphereHeight * uCameraAltInfluence);
float fragAltFactor   = exp(-max(fragAlt, 0.0) / uAtmosphereHeight * uFragAltInfluence);

float haze = clamp(distanceFactor * viewAngleFactor * camAltFactor * fragAltFactor, 0.0, uHazeMax);
```

Couleur du haze — mélange des références par facteur horizon × azimut soleil :

```glsl
float sunAlign   = dot(normalize(viewDir - upLocal * dot(viewDir, upLocal)), uSunDirWorld) * 0.5 + 0.5;
vec3  horizonCol = mix(uAtmoHorizonOpp, uAtmoHorizonSun, sunAlign);
vec3  hazeColor  = mix(uAtmoZenith, horizonCol, viewAngleFactor);
// Proche du sol, la teinte glisse vers `uAtmoHaze` ; en altitude le poids retombe à 0.
float groundWeight = 1.0 - smoothstep(0.0, uAtmosphereHeight, fragAlt);
      hazeColor  = mix(hazeColor, uAtmoHaze, groundWeight);
```

Application sur la couleur du bâtiment/tuile (silhouette préservée : jamais `mix` à 1) :

```glsl
c = mix(vec3(dot(c, LUMA)), c, 1.0 - uContrastReduction   * haze);   // contraste ↓
c = mix(vec3(dot(c, LUMA)), c, 1.0 - uSaturationReduction  * haze);   // saturation ↓ (vers luma)
c += uBrightnessBoost * haze;                                         // luminosité ↑ légère
c  = mix(c, hazeColor, haze);                                         // mélange atmosphère
```

(Détail des deux opérations contraste/saturation à figer au plan ; `LUMA = vec3(0.2126,0.7152,0.0722)`.)

**Injection** : `onBeforeCompile` ajoute le varying `vWorldPosition` au vertex (calculé depuis
`modelMatrix * vec4(position,1.0)`) et insère le bloc de couleur **juste avant**
`#include <tonemapping_fragment>` (ancre stable pour `MeshBasicMaterial`). `customProgramCacheKey
= () => 'm3d-atmo:' + (enabled ? 1 : 0)` → **une seule** variante de programme pour toutes les
tuiles. Garde `material.userData.m3dAtmosphere` pour ne patcher qu'une fois.

### 3.4 `OrbitalHalo` — le limbe vu de l'espace

Sphère `BackSide` légèrement plus grande que la Terre, rim-lit (Fresnel) :
`glow = pow(1.0 - dot(viewDir, normal), uOrbitalHaloFalloff) * uOrbitalHaloStrength`, teintée
par les couleurs de référence. Opacité pilotée par une **bande d'altitude inverse** de celle du
Sky (`config.atmosphere.orbitalFade`) : plein en orbite, fondu à 0 en descendant. **Non
dessinée** à opacité 0. Aucune écriture de depth, rendue derrière le reste (renderOrder à figer,
cohérent avec l'empilement étoiles/ciel/tuiles).

## 4. Câblage `MapEngine`

- Instancier `AtmosphereManager` après `Sky`/`tiles`.
- `tiles.addEventListener('load-model', e => atmosphere.patch(e.scene))` (traverse les meshes,
  applique `applyAtmosphere` à chaque matériau non déjà patché).
- Matériau **unique** des bâtiments patché une fois — exposé via le contexte de couche, comme
  `engine.markers`/`engine.tags` (à confirmer : `ctx` fournit un accès au manager, ou
  `BuildingsLayer` reçoit `applyAtmosphere`).
- `atmosphere.update(state)` appelé dans `tick`, à côté de `updateSky` : pousse les couleurs sur
  dirty, met à jour l'opacité du halo selon l'altitude.
- `dispose()` du manager : retire le halo, dispose sa géométrie/matériau. Les matériaux de tuiles
  sont disposés par le renderer ; l'objet d'uniforms partagé est stable, aucune fuite.

## 5. Paramètres — emplacement (décidé)

Précédent : les params **physiques** du ciel vivent dans **`config.sky`** (pas le thème).

- **`theme.globe.atmosphere`** (booléen aujourd'hui mort) devient le **maître on/off** réel du
  look atmosphérique (haze + halo). Un seul flag, pas de split-brain.
- **Nouveau `config.atmosphere`** : tuning numérique seul. Aucune couleur (elles viennent de Sky).

```ts
type AtmosphereConfig = {
  hazeDensity: number
  atmosphereHeight: number          // hauteur d'échelle (m) du décroissement altitude
  referenceDistanceMeters: number   // demi-distance du haze
  distanceExponent: number
  horizonStrength: number
  cameraAltitudeInfluence: number
  fragmentAltitudeInfluence: number
  hazeMax: number                   // plafond du mélange (silhouette préservée)
  contrastReduction: number
  saturationReduction: number
  brightnessBoost: number
  orbitalHaloStrength: number
  orbitalHaloFalloff: number
  orbitalFade: { start: number; end: number }   // altitude (m) — inverse du Sky
}
```

Nombre de couleurs de référence : **3 + haze** (zénith, horizon→soleil, horizon opposé, haze
proche-sol). Périmètre d'injection : **tuiles 3D + bâtiments internes** (les deux fonds sur
lesquels le mode s'ouvre, comme `refreshFogMaterials`).

## 6. Performance — garanties

- **Un** objet d'uniforms partagé (aucune passe CPU par objet).
- Couleurs recalculées **sur dirty seulement** (date figée → une fois).
- `cameraPosition` natif de three (zéro push).
- `customProgramCacheKey` → une variante de programme, pas d'explosion.
- Halo = 1 draw, sauté à opacité 0.
- Compatible LOD / frustum culling / occlusion / streaming (patch au `load-model`).

## 7. Tests (colocalisés, jsdom, fonctions pures)

- `atmosphereColors.test.ts` : le portage Preetham (monotonie/plages des couleurs de référence
  selon l'altitude solaire ; horizon→soleil ≠ opposé quand le soleil est bas).
- Logique de **révision** : `revision()` change ssi un paramètre pertinent change ; stable sinon.
- Mapping `AtmosphereConfig` → uniforms (valeurs poussées correctes).
- Bande d'opacité du halo (fonction pure altitude → opacité, inverse du Sky).

## 8. Livrables CLAUDE.md (feature non finie sans eux)

- **Docs bilingues** : `docs/fr/ATMOSPHERE.md` + `docs/en/ATMOSPHERE.md` (guides manuels,
  sélecteur en 2ᵉ ligne, sections numérotées) ; **référence** `CONFIG.md` régénérée (bloc
  `config.atmosphere`) FR + EN.
- **Exemple** : `examples/react/` — sliders des paramètres `config.atmosphere` + toggle
  `theme.globe.atmosphere`, pour exercer la feature hors dev (`pnpm dev:example`).
- **Exports publics** via `src/index.ts` : type `AtmosphereConfig`, et le manager/types si un
  accès impératif est souhaité (à trancher au plan — priorité au consommable React).
- Fin de feature : `/simplify`, puis react doctor, puis **demander** avant tout test Playwright.

## 9. Risques et points à trancher au plan

- **Ancre d'injection** exacte dans le shader `MeshBasicMaterial` (`tonemapping_fragment` vs
  `output_fragment`/`dithering_fragment`) — à valider selon la version de three installée.
- **Accès du `BuildingsLayer`** au patch (contexte de couche vs injection directe du matériau).
- **`renderOrder`/depth** du halo dans l'empilement existant (étoiles -1, ciel -0.95, océan
  -0.9, tuiles -0.8).
- **Interaction avec le fog piéton** : en mode piéton, désactiver le haze orbital (ou le laisser,
  `camAltFactor` le neutralisant déjà près du sol) — à confirmer.
- **Valeurs par défaut** de `config.atmosphere` : calibrées visuellement dans l'exemple.
