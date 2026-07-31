# Perspective aérienne (haze) + atmosphère orbitale — plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ajouter une perspective aérienne GPU par-fragment (haze) sur les tuiles 3D et les bâtiments, raccordée aux couleurs de `Sky.ts`, plus une sphère atmosphérique orbitale — sans `THREE.Fog`.

**Architecture:** Un `AtmosphereManager` (frère de `Sky`, possédé par `MapEngine`) détient un **objet d'uniforms partagé** référencé par tous les matériaux patchés et par le halo. Un `AtmosphereProvider` (interface) découple la source des couleurs ; `SkyAtmosphereProvider` les échantillonne depuis `config.sky` + le point subsolaire, **sur dirty seulement**. Le haze est injecté par `onBeforeCompile` + `customProgramCacheKey`, la distance/altitude/angle calculés par-fragment depuis `cameraPosition` (natif) et `vWorldPosition`.

**Tech Stack:** TypeScript strict, three 0.169.0, `3d-tiles-renderer` 0.5.0, Vitest (jsdom), pnpm. `Sky.ts`/`sun.ts` **inchangés**.

**Spec :** `docs/superpowers/specs/2026-07-31-atmosphere-aerial-haze-design.md`.

## Global Constraints

- **Style Prettier** : pas de `;`, guillemets simples, `printWidth: 120`, `trailingComma: all`.
- **`any` interdit** ; `type` **jamais** `interface` ; `noUncheckedIndexedAccess`, `noUnused*` actifs. Paramètre ignoré : préfixe `_`.
- **Commentaires en français**, courts, expliquant le *pourquoi*.
- **Aucune valeur ni couleur en dur** : tout via `config`/`theme`. Les couleurs du haze viennent de `Sky`, pas du thème.
- **Zéro-alloc en boucle de frame** ; séparation lecture (`update`) / écriture (`project`).
- **Point d'entrée public unique** : `src/index.ts` — toute API publique y est ré-exportée.
- **Docs bilingues** : toute évolution d'API met à jour `docs/fr/` **et** `docs/en/` dans le même mouvement (mêmes noms de fichiers, sélecteur de langue en 2ᵉ ligne, sections numérotées).
- **Exemple à jour** : toute feature publique est branchée dans `examples/react/`.
- Alias d'import `@/*` → `src/*`. Tests colocalisés `*.test.ts`, env jsdom.
- Lancer un seul test : `pnpm exec vitest run <chemin>`. Typecheck : `pnpm typecheck`.
- **`Sky.ts` et `sun.ts` ne sont pas modifiés.** Le fog du **mode piéton** n'est pas touché.

---

## Structure de fichiers

**Créés :**
- `src/core/atmosphere/atmosphereColors.ts` — modèle réduit pur : couleurs de référence depuis les paramètres atmosphériques. + `atmosphereColors.test.ts`.
- `src/core/atmosphere/AtmosphereProvider.ts` — types `AtmosphereColors`, `AtmosphereProvider`.
- `src/core/atmosphere/SkyAtmosphereProvider.ts` — implémentation lisant `config.sky` + subsolar. + `.test.ts`.
- `src/core/atmosphere/materialInjection.ts` — `applyAtmosphere(material, uniforms)`, uniforms partagés, injection GLSL. + `.test.ts`.
- `src/core/atmosphere/OrbitalHalo.ts` — sphère `BackSide` rim-lit + `haloOpacity(altitude, fade)` pure. + `orbitalHalo.test.ts`.
- `src/core/atmosphere/AtmosphereManager.ts` — orchestration. + `.test.ts`.
- `docs/fr/ATMOSPHERE.md`, `docs/en/ATMOSPHERE.md` — guide bilingue.

**Modifiés :**
- `src/config/types.ts` — `type AtmosphereConfig`, ajout dans `MapConfig`.
- `src/config/defaultConfig.ts` — bloc `atmosphere` par défaut.
- `src/theme/*` — `theme.globe.atmosphere` reste un booléen (déjà présent), il devient **consommé** (aucune modif de fichier thème, juste lu).
- `src/layers/BuildingsLayer.ts` — hook `onMaterial` au constructeur.
- `src/core/MapEngine.ts` — option `atmosphere?: boolean` (activation figée), instanciation du manager, listener `load-model`, hook buildings, `applyAtmosphere()`, appel dans `tick`, `dispose`.
- `src/react/Map.tsx` — mappe `theme.globe.atmosphere` → `opts.atmosphere` (~L205-216).
- `src/index.ts` — export de `AtmosphereConfig` (et types atmosphère publics).
- `examples/react/` — sliders `config.atmosphere` + toggle.
- `docs/fr/CONFIG.md`, `docs/en/CONFIG.md` — bloc `config.atmosphere` (référence régénérée).

---

## Task 1 : `config.atmosphere` — type, défaut, export

**Files:**
- Modify: `src/config/types.ts` (ajouter `AtmosphereConfig`, l'insérer dans `MapConfig`)
- Modify: `src/config/defaultConfig.ts` (bloc `atmosphere`)
- Modify: `src/index.ts` (export du type)
- Test: `src/config/mergeConfig.test.ts` (ajout d'un cas)

**Interfaces:**
- Produces: `type AtmosphereConfig` (voir ci-dessous) ; `defaultConfig.atmosphere: AtmosphereConfig` ; `MapConfig.atmosphere`.

- [ ] **Step 1: Test — un override partiel de `atmosphere` est deep-mergé**

Ajouter dans `src/config/mergeConfig.test.ts` :

```ts
test('mergeConfig conserve les défauts atmosphère non surchargés', () => {
  const merged = mergeConfig(defaultConfig, { atmosphere: { hazeDensity: 2 } })
  expect(merged.atmosphere.hazeDensity).toBe(2)
  // Un champ non touché garde le défaut (deep merge, pas remplacement du bloc).
  expect(merged.atmosphere.atmosphereHeight).toBe(defaultConfig.atmosphere.atmosphereHeight)
})
```

- [ ] **Step 2: Lancer le test — échec attendu**

Run: `pnpm exec vitest run src/config/mergeConfig.test.ts`
Expected: FAIL (`atmosphere` n'existe pas sur `MapConfig`, erreur de type + assertion).

- [ ] **Step 3: Ajouter le type `AtmosphereConfig`**

Dans `src/config/types.ts`, avant `type MapConfig` :

```ts
/**
 * Perspective aérienne (haze) + atmosphère orbitale. Aucune COULEUR ici : elles sont
 * échantillonnées depuis `Sky` (cf. `AtmosphereProvider`). On ne règle que la physique et
 * la force de l'effet. L'interrupteur maître est `theme.globe.atmosphere`.
 */
export type AtmosphereConfig = {
  /** Densité globale du voile. `0` = aucun haze ; monter épaissit l'atmosphère. */
  hazeDensity: number
  /** Hauteur d'échelle (m) du décroissement en altitude — caméra ET fragment. */
  atmosphereHeight: number
  /** Distance de référence (m) : à ~cette distance le haze devient nettement visible. */
  referenceDistanceMeters: number
  /** Exposant de la courbe de distance : `1` linéaire-exp, `>1` haze plus tardif puis franc. */
  distanceExponent: number
  /** Force du terme d'inclinaison : `0` = aucune dépendance à l'angle, `1` = plein effet horizon. */
  horizonStrength: number
  /** Influence de l'altitude caméra (multiplie le décroissement) : plus haut = moins de haze. */
  cameraAltitudeInfluence: number
  /** Influence de l'altitude fragment : toits/tours/montagnes moins voilés. */
  fragmentAltitudeInfluence: number
  /** Plafond du mélange (0..1) : borne le fondu pour préserver la silhouette (jamais 1). */
  hazeMax: number
  /** Réduction de contraste appliquée à pleine dose de haze (0..1). */
  contrastReduction: number
  /** Réduction de saturation à pleine dose (0..1). */
  saturationReduction: number
  /** Gain de luminosité à pleine dose (ajouté, 0..~0.2). */
  brightnessBoost: number
  /** Intensité du halo orbital (rim/limbe). */
  orbitalHaloStrength: number
  /** Décroissance du Fresnel du halo : plus grand = liseré plus fin au limbe. */
  orbitalHaloFalloff: number
  /**
   * Fondu du halo par altitude (m) — INVERSE du Sky : plein au-dessus de `start`, nul
   * sous `end`, pour ne jamais doubler l'effet du ciel vu du sol. `start` > `end`.
   */
  orbitalFade: { start: number; end: number }
}
```

Puis dans `type MapConfig`, après `sky: SkyConfig` :

```ts
  /** Perspective aérienne + atmosphère orbitale — cf. `AtmosphereConfig`. */
  atmosphere: AtmosphereConfig
```

- [ ] **Step 4: Ajouter le défaut**

Dans `src/config/defaultConfig.ts`, après le bloc `sky: { … }` :

```ts
  atmosphere: {
    hazeDensity: 1,
    // ~120 km : au-delà l'atmosphère est négligeable, l'orbite ne voile plus rien.
    atmosphereHeight: 120_000,
    // 40 km : le haze devient franc à l'échelle d'un horizon urbain vu de quelques km.
    referenceDistanceMeters: 40_000,
    distanceExponent: 1.4,
    horizonStrength: 1,
    cameraAltitudeInfluence: 1,
    fragmentAltitudeInfluence: 1,
    // 0.9 : au plus fort, on laisse 10 % de la couleur d'origine — la silhouette tient.
    hazeMax: 0.9,
    contrastReduction: 0.6,
    saturationReduction: 0.7,
    brightnessBoost: 0.06,
    orbitalHaloStrength: 1,
    orbitalHaloFalloff: 3,
    // Halo plein au-dessus de 120 km, éteint sous 60 km — bande haute, sous celle du Sky.
    orbitalFade: { start: 120_000, end: 60_000 },
  },
```

- [ ] **Step 5: Exporter le type**

Dans `src/index.ts`, à côté de `SkyConfig,` dans le bloc `from './config/types'` :

```ts
  AtmosphereConfig,
```

- [ ] **Step 6: Lancer test + typecheck — succès attendu**

Run: `pnpm exec vitest run src/config/mergeConfig.test.ts && pnpm typecheck`
Expected: PASS (le test passe, aucun nouveau type d'erreur lié à `atmosphere`).

- [ ] **Step 7: Commit**

```bash
git add src/config/types.ts src/config/defaultConfig.ts src/index.ts src/config/mergeConfig.test.ts
git commit -m "feat(atmosphere): config.atmosphere (type + défauts + export)"
```

---

## Task 2 : `atmosphereColors` — modèle réduit pur

Fonction pure : à partir de la direction du soleil (en repère local, projetée sur la verticale) et des paramètres atmosphériques, produit 4 couleurs de référence. Modèle **réduit** (pas Preetham complet) — l'exigence est une continuité visuelle, calibrée dans l'exemple.

**Files:**
- Create: `src/core/atmosphere/atmosphereColors.ts`
- Test: `src/core/atmosphere/atmosphereColors.test.ts`

**Interfaces:**
- Consumes: `THREE.Color` (import type).
- Produces:
  - `type AtmosphereColors = { zenith: Color; horizonSun: Color; horizonOpposite: Color; haze: Color }`
  - `type AtmosphereParams = { sunElevation: number; turbidity: number; rayleigh: number; mie: number }` (`sunElevation` = `dot(sunDir, up)` ∈ [-1,1])
  - `function computeAtmosphereColors(p: AtmosphereParams, out: AtmosphereColors): AtmosphereColors` (écrit dans `out`, zéro-alloc, et le renvoie)

- [ ] **Step 1: Écrire les tests**

```ts
import { Color } from 'three'
import { computeAtmosphereColors, type AtmosphereColors } from './atmosphereColors'

const fresh = (): AtmosphereColors => ({
  zenith: new Color(),
  horizonSun: new Color(),
  horizonOpposite: new Color(),
  haze: new Color(),
})

test('de jour, le zénith est plus bleu que rouge', () => {
  const c = computeAtmosphereColors({ sunElevation: 0.8, turbidity: 2, rayleigh: 1.2, mie: 0.005 }, fresh())
  expect(c.zenith.b).toBeGreaterThan(c.zenith.r)
})

test('soleil bas : horizon côté soleil plus chaud (r/b) que côté opposé', () => {
  const c = computeAtmosphereColors({ sunElevation: 0.05, turbidity: 2, rayleigh: 1.2, mie: 0.005 }, fresh())
  const warmSun = c.horizonSun.r / Math.max(c.horizonSun.b, 1e-4)
  const warmOpp = c.horizonOpposite.r / Math.max(c.horizonOpposite.b, 1e-4)
  expect(warmSun).toBeGreaterThan(warmOpp)
})

test('la nuit (soleil sous l\'horizon), les couleurs sont sombres', () => {
  const c = computeAtmosphereColors({ sunElevation: -0.3, turbidity: 2, rayleigh: 1.2, mie: 0.005 }, fresh())
  expect(c.zenith.getHSL({ h: 0, s: 0, l: 0 }).l).toBeLessThan(0.15)
})

test('la turbidité blanchit l\'horizon (saturation plus basse)', () => {
  const clair = computeAtmosphereColors({ sunElevation: 0.6, turbidity: 2, rayleigh: 1.2, mie: 0.005 }, fresh())
  const laiteux = computeAtmosphereColors({ sunElevation: 0.6, turbidity: 8, rayleigh: 1.2, mie: 0.005 }, fresh())
  const s1 = clair.horizonOpposite.getHSL({ h: 0, s: 0, l: 0 }).s
  const s2 = laiteux.horizonOpposite.getHSL({ h: 0, s: 0, l: 0 }).s
  expect(s2).toBeLessThan(s1)
})

test('zéro-alloc : renvoie l\'objet out passé', () => {
  const out = fresh()
  expect(computeAtmosphereColors({ sunElevation: 0.5, turbidity: 2, rayleigh: 1, mie: 0.005 }, out)).toBe(out)
})
```

- [ ] **Step 2: Lancer — échec attendu**

Run: `pnpm exec vitest run src/core/atmosphere/atmosphereColors.test.ts`
Expected: FAIL (module introuvable).

- [ ] **Step 3: Implémenter le modèle réduit**

```ts
import { Color } from 'three'

/** 4 teintes de référence de l'atmosphère, réutilisées par le haze et le halo. */
export type AtmosphereColors = {
  zenith: Color
  horizonSun: Color
  horizonOpposite: Color
  haze: Color
}

/** Entrées du modèle réduit. `sunElevation` = `dot(sunDir, up)` local, dans [-1, 1]. */
export type AtmosphereParams = {
  sunElevation: number
  turbidity: number
  rayleigh: number
  mie: number
}

// Teintes de base : bleu ciel Rayleigh au zénith, bleu plus pâle à l'horizon, chaud rasant.
const ZENITH_DAY = new Color(0.18, 0.34, 0.62)
const HORIZON_DAY = new Color(0.55, 0.68, 0.86)
const SUNSET_WARM = new Color(0.95, 0.55, 0.28)
const NIGHT = new Color(0.02, 0.03, 0.06)
const WHITE = new Color(1, 1, 1)

const clamp01 = (x: number): number => (x < 0 ? 0 : x > 1 ? 1 : x)
const smoothstep = (e0: number, e1: number, x: number): number => {
  const t = clamp01((x - e0) / (e1 - e0))
  return t * t * (3 - 2 * t)
}

/**
 * Modèle analytique RÉDUIT (pas Preetham complet) : suffisant pour une continuité visuelle
 * imperceptible avec le Sky, à coût CPU dérisoire. Piloté par les mêmes paramètres que
 * `config.sky` (turbidity/rayleigh/mie + élévation solaire). Écrit dans `out`, zéro-alloc.
 */
export function computeAtmosphereColors(p: AtmosphereParams, out: AtmosphereColors): AtmosphereColors {
  // Facteur jour : plein soleil haut, nul sous l'horizon (crépuscule adouci).
  const day = smoothstep(-0.1, 0.25, p.sunElevation)
  // Facteur rasant : maximal quand le soleil frôle l'horizon (teintes chaudes).
  const grazing = day * (1 - smoothstep(0.0, 0.35, p.sunElevation))
  // La turbidité blanchit (voile laiteux) ; on la ramène en fraction vers le blanc.
  const milky = clamp01((p.turbidity - 1) / 12)
  const ray = clamp01(p.rayleigh / 2)

  // Zénith : bleu Rayleigh, éteint la nuit, dé-saturé par la turbidité.
  out.zenith.copy(NIGHT).lerp(ZENITH_DAY, day)
  out.zenith.lerp(WHITE, milky * 0.3)
  out.zenith.lerp(out.zenith.clone().multiplyScalar(1 - 0.2 * (1 - ray)), 1)

  // Horizon opposé : bleu pâle de jour, sombre la nuit, blanchi par la turbidité.
  out.horizonOpposite.copy(NIGHT).lerp(HORIZON_DAY, day)
  out.horizonOpposite.lerp(WHITE, milky * 0.45)

  // Horizon côté soleil : part de l'opposé et glisse vers le chaud quand le soleil est bas.
  out.horizonSun.copy(out.horizonOpposite).lerp(SUNSET_WARM, grazing * 0.85)

  // Haze proche-sol : moyenne pâle des deux horizons, encore blanchie — c'est la teinte
  // dans laquelle le terrain lointain se dissout.
  out.haze.copy(out.horizonOpposite).lerp(out.horizonSun, 0.5).lerp(WHITE, 0.15 + milky * 0.2)

  return out
}
```

- [ ] **Step 4: Lancer — succès attendu**

Run: `pnpm exec vitest run src/core/atmosphere/atmosphereColors.test.ts`
Expected: PASS (les 5 tests). Ajuster les constantes si une assertion de monotonie échoue — les tests décrivent les invariants, pas des valeurs exactes.

- [ ] **Step 5: Commit**

```bash
git add src/core/atmosphere/atmosphereColors.ts src/core/atmosphere/atmosphereColors.test.ts
git commit -m "feat(atmosphere): modèle réduit des couleurs de référence (pur, testé)"
```

---

## Task 3 : `AtmosphereProvider` + `SkyAtmosphereProvider`

Interface qui découple la source des couleurs, et son implémentation lisant `config.sky` + subsolar. `revision()` change **seulement** quand un paramètre pertinent bouge.

**Files:**
- Create: `src/core/atmosphere/AtmosphereProvider.ts`
- Create: `src/core/atmosphere/SkyAtmosphereProvider.ts`
- Test: `src/core/atmosphere/SkyAtmosphereProvider.test.ts`

**Interfaces:**
- Consumes: `AtmosphereColors`, `computeAtmosphereColors` (Task 2) ; `SkyConfig` (`@/config/types`) ; `subsolarPoint`, `SubsolarPoint` (`@/core/sun`) ; `Vector3` (three).
- Produces:
  - `AtmosphereProvider.ts` :
    - `type AtmosphereProvider = { revision(): number; sunDirection(out: Vector3): Vector3; sample(out: AtmosphereColors): void }`
    - ré-export de `AtmosphereColors`.
  - `SkyAtmosphereProvider.ts` :
    - `class SkyAtmosphereProvider implements AtmosphereProvider`
    - `constructor()` (état vide au départ)
    - `setState(sky: SkyConfig, sunDirWorld: Vector3, sunElevation: number): void` — poussé par le moteur depuis `applySky`/`updateSky` ; bumpe la révision si un champ pertinent a changé.

- [ ] **Step 1: Écrire le test de révision + échantillonnage**

```ts
import { Vector3, Color } from 'three'
import { SkyAtmosphereProvider } from './SkyAtmosphereProvider'
import { defaultConfig } from '@/config/defaultConfig'

const colors = () => ({ zenith: new Color(), horizonSun: new Color(), horizonOpposite: new Color(), haze: new Color() })

test('revision stable tant que rien ne change', () => {
  const p = new SkyAtmosphereProvider()
  p.setState(defaultConfig.sky, new Vector3(0, 0, 1), 0.5)
  const r = p.revision()
  p.setState(defaultConfig.sky, new Vector3(0, 0, 1), 0.5)
  expect(p.revision()).toBe(r)
})

test('revision change quand la turbidité change', () => {
  const p = new SkyAtmosphereProvider()
  p.setState(defaultConfig.sky, new Vector3(0, 0, 1), 0.5)
  const r = p.revision()
  p.setState({ ...defaultConfig.sky, turbidity: 9 }, new Vector3(0, 0, 1), 0.5)
  expect(p.revision()).not.toBe(r)
})

test('revision change quand l\'élévation solaire bouge sensiblement', () => {
  const p = new SkyAtmosphereProvider()
  p.setState(defaultConfig.sky, new Vector3(0, 0, 1), 0.5)
  const r = p.revision()
  p.setState(defaultConfig.sky, new Vector3(0, 1, 0), -0.2)
  expect(p.revision()).not.toBe(r)
})

test('sunDirection recopie le dernier vecteur poussé', () => {
  const p = new SkyAtmosphereProvider()
  p.setState(defaultConfig.sky, new Vector3(1, 0, 0), 0.0)
  const out = new Vector3()
  p.sunDirection(out)
  expect(out.x).toBeCloseTo(1)
})

test('sample remplit les 4 couleurs sans lever', () => {
  const p = new SkyAtmosphereProvider()
  p.setState(defaultConfig.sky, new Vector3(0, 0, 1), 0.6)
  const c = colors()
  p.sample(c)
  expect(c.zenith.b).toBeGreaterThan(0)
})
```

- [ ] **Step 2: Lancer — échec attendu**

Run: `pnpm exec vitest run src/core/atmosphere/SkyAtmosphereProvider.test.ts`
Expected: FAIL (modules introuvables).

- [ ] **Step 3: Écrire l'interface**

`src/core/atmosphere/AtmosphereProvider.ts` :

```ts
import type { Vector3 } from 'three'
import type { AtmosphereColors } from './atmosphereColors'

export type { AtmosphereColors }

/**
 * Source des couleurs atmosphériques du haze, découplée de son implémentation. `Sky` en est
 * la source aujourd'hui (cf. `SkyAtmosphereProvider`) ; une LUT ou un backend météo pourra la
 * remplacer sans toucher aux shaders. `sample()` n'est appelé que quand `revision()` a changé.
 */
export type AtmosphereProvider = {
  /** Tick monotone : change dès qu'une couleur de référence doit être recalculée. */
  revision(): number
  /** Direction du soleil en repère monde (ECEF), écrite dans `out`. */
  sunDirection(out: Vector3): Vector3
  /** (Re)calcule les couleurs de référence dans `out`. */
  sample(out: AtmosphereColors): void
}
```

- [ ] **Step 4: Écrire l'implémentation**

`src/core/atmosphere/SkyAtmosphereProvider.ts` :

```ts
import { Vector3 } from 'three'
import type { SkyConfig } from '@/config/types'
import { computeAtmosphereColors, type AtmosphereColors } from './atmosphereColors'
import type { AtmosphereProvider } from './AtmosphereProvider'

/**
 * Fournit les couleurs atmosphériques depuis `config.sky` + la direction du soleil poussées
 * par le moteur. La révision ne bumpe que si un paramètre PERTINENT change (turbidity,
 * rayleigh, mie, ou une variation sensible de l'élévation solaire) — sinon le moteur réutilise
 * les uniforms tels quels, sans coût CPU.
 */
export class SkyAtmosphereProvider implements AtmosphereProvider {
  private rev = 0
  private turbidity = NaN
  private rayleigh = NaN
  private mie = NaN
  private sunElevation = NaN
  private readonly sunDir = new Vector3()

  /** Poussé par le moteur (montage + par frame). `sunElevation` = `dot(sunDir, up)` local. */
  setState(sky: SkyConfig, sunDirWorld: Vector3, sunElevation: number): void {
    this.sunDir.copy(sunDirWorld)
    // Quantifie l'élévation : une dérive infime (jitter caméra) ne doit pas invalider les
    // couleurs à chaque frame. ~200 crans couvrent [-1, 1] — imperceptible visuellement.
    const elQ = Math.round(sunElevation * 100) / 100
    if (sky.turbidity !== this.turbidity || sky.rayleigh !== this.rayleigh || sky.mieCoefficient !== this.mie || elQ !== this.sunElevation) {
      this.turbidity = sky.turbidity
      this.rayleigh = sky.rayleigh
      this.mie = sky.mieCoefficient
      this.sunElevation = elQ
      this.rev++
    }
  }

  revision(): number {
    return this.rev
  }

  sunDirection(out: Vector3): Vector3 {
    return out.copy(this.sunDir)
  }

  sample(out: AtmosphereColors): void {
    computeAtmosphereColors(
      { sunElevation: this.sunElevation, turbidity: this.turbidity, rayleigh: this.rayleigh, mie: this.mie },
      out,
    )
  }
}
```

- [ ] **Step 5: Lancer — succès attendu**

Run: `pnpm exec vitest run src/core/atmosphere/SkyAtmosphereProvider.test.ts && pnpm typecheck`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/core/atmosphere/AtmosphereProvider.ts src/core/atmosphere/SkyAtmosphereProvider.ts src/core/atmosphere/SkyAtmosphereProvider.test.ts
git commit -m "feat(atmosphere): AtmosphereProvider + SkyAtmosphereProvider (révision dirty)"
```

---

## Task 4 : `materialInjection` — uniforms partagés + `applyAtmosphere`

Le cœur GPU. Crée l'objet d'uniforms partagé et patche n'importe quel matériau via `onBeforeCompile` + `customProgramCacheKey`, idempotent.

**Files:**
- Create: `src/core/atmosphere/materialInjection.ts`
- Test: `src/core/atmosphere/materialInjection.test.ts`

**Interfaces:**
- Consumes: `THREE` (Material, Color, Vector3, Object3D, Mesh) ; `AtmosphereConfig` (`@/config/types`).
- Produces:
  - `type AtmosphereUniforms = { … }` (voir Step 3) — l'objet partagé.
  - `function createAtmosphereUniforms(): AtmosphereUniforms`
  - `function writeAtmosphereConfig(u: AtmosphereUniforms, cfg: AtmosphereConfig): void` — pousse les scalaires (sur changement de config).
  - `function applyAtmosphere(material: THREE.Material, u: AtmosphereUniforms): void` — idempotent (garde `userData.m3dAtmosphere`).
  - `const ATMO_CACHE_KEY = 'm3d-atmo'`

- [ ] **Step 1: Écrire les tests (via un faux shader)**

```ts
import { MeshBasicMaterial } from 'three'
import { createAtmosphereUniforms, writeAtmosphereConfig, applyAtmosphere, ATMO_CACHE_KEY } from './materialInjection'
import { defaultConfig } from '@/config/defaultConfig'

test('writeAtmosphereConfig pousse les scalaires', () => {
  const u = createAtmosphereUniforms()
  writeAtmosphereConfig(u, { ...defaultConfig.atmosphere, hazeDensity: 3 })
  expect(u.uHazeDensity.value).toBe(3)
})

test('applyAtmosphere pose onBeforeCompile et une clé de cache stable', () => {
  const u = createAtmosphereUniforms()
  const m = new MeshBasicMaterial()
  applyAtmosphere(m, u)
  expect(typeof m.onBeforeCompile).toBe('function')
  expect(m.customProgramCacheKey?.()).toBe(ATMO_CACHE_KEY)
})

test('applyAtmosphere est idempotent (ne re-patche pas)', () => {
  const u = createAtmosphereUniforms()
  const m = new MeshBasicMaterial()
  applyAtmosphere(m, u)
  const first = m.onBeforeCompile
  applyAtmosphere(m, u)
  expect(m.onBeforeCompile).toBe(first)
})

test('onBeforeCompile partage les uniforms et injecte l\'ancre tonemapping', () => {
  const u = createAtmosphereUniforms()
  const m = new MeshBasicMaterial()
  applyAtmosphere(m, u)
  const shader = { uniforms: {} as Record<string, unknown>, vertexShader: '#include <begin_vertex>', fragmentShader: '#include <tonemapping_fragment>' }
  m.onBeforeCompile(shader as never, undefined as never)
  expect(shader.uniforms.uHazeDensity).toBe(u.uHazeDensity)      // partage par référence
  expect(shader.vertexShader).toContain('vWorldPosition')
  expect(shader.fragmentShader).toContain('m3dHaze')              // bloc injecté présent
})
```

- [ ] **Step 2: Lancer — échec attendu**

Run: `pnpm exec vitest run src/core/atmosphere/materialInjection.test.ts`
Expected: FAIL (module introuvable).

- [ ] **Step 3: Implémenter**

`src/core/atmosphere/materialInjection.ts` :

```ts
import { Color, Vector3, type Material } from 'three'
import type { AtmosphereConfig } from '@/config/types'

/**
 * Uniforms PARTAGÉS par tous les matériaux atmosphériques et par le halo. Un seul objet,
 * mélangé par référence dans chaque `onBeforeCompile` : le moteur écrit une fois par frame
 * (sur dirty), tous les programmes voient la nouvelle valeur. Le `.value` de chaque entrée est
 * mutable en place — zéro-alloc.
 */
export type AtmosphereUniforms = {
  uAtmoZenith: { value: Color }
  uAtmoHorizonSun: { value: Color }
  uAtmoHorizonOpp: { value: Color }
  uAtmoHaze: { value: Color }
  uSunDirWorld: { value: Vector3 }
  uPlanetRadius: { value: number }
  uHazeDensity: { value: number }
  uAtmosphereHeight: { value: number }
  uRefDist: { value: number }
  uDistanceExponent: { value: number }
  uHorizonStrength: { value: number }
  uCameraAltInfluence: { value: number }
  uFragAltInfluence: { value: number }
  uHazeMax: { value: number }
  uContrastReduction: { value: number }
  uSaturationReduction: { value: number }
  uBrightnessBoost: { value: number }
}

/** Une seule variante de programme pour TOUTES les tuiles/bâtiments patchés. */
export const ATMO_CACHE_KEY = 'm3d-atmo'

export function createAtmosphereUniforms(): AtmosphereUniforms {
  return {
    uAtmoZenith: { value: new Color() },
    uAtmoHorizonSun: { value: new Color() },
    uAtmoHorizonOpp: { value: new Color() },
    uAtmoHaze: { value: new Color() },
    uSunDirWorld: { value: new Vector3(0, 0, 1) },
    uPlanetRadius: { value: 6_378_137 },
    uHazeDensity: { value: 1 },
    uAtmosphereHeight: { value: 120_000 },
    uRefDist: { value: 40_000 },
    uDistanceExponent: { value: 1.4 },
    uHorizonStrength: { value: 1 },
    uCameraAltInfluence: { value: 1 },
    uFragAltInfluence: { value: 1 },
    uHazeMax: { value: 0.9 },
    uContrastReduction: { value: 0.6 },
    uSaturationReduction: { value: 0.7 },
    uBrightnessBoost: { value: 0.06 },
  }
}

/** Pousse les scalaires de config dans les uniforms partagés (appelé sur changement de config). */
export function writeAtmosphereConfig(u: AtmosphereUniforms, cfg: AtmosphereConfig): void {
  u.uHazeDensity.value = cfg.hazeDensity
  u.uAtmosphereHeight.value = cfg.atmosphereHeight
  u.uRefDist.value = cfg.referenceDistanceMeters
  u.uDistanceExponent.value = cfg.distanceExponent
  u.uHorizonStrength.value = cfg.horizonStrength
  u.uCameraAltInfluence.value = cfg.cameraAltitudeInfluence
  u.uFragAltInfluence.value = cfg.fragmentAltitudeInfluence
  u.uHazeMax.value = cfg.hazeMax
  u.uContrastReduction.value = cfg.contrastReduction
  u.uSaturationReduction.value = cfg.saturationReduction
  u.uBrightnessBoost.value = cfg.brightnessBoost
}

// Varying ajouté au vertex : position monde du fragment (pour distance/altitude/angle).
const VERT_DECL = 'varying vec3 vWorldPosition;\n'
const VERT_ASSIGN = '#include <begin_vertex>\n  vWorldPosition = (modelMatrix * vec4(position, 1.0)).xyz;'

// Déclarations fragment : uniforms partagés + varying.
const FRAG_DECL = `varying vec3 vWorldPosition;
uniform vec3 uAtmoZenith; uniform vec3 uAtmoHorizonSun; uniform vec3 uAtmoHorizonOpp; uniform vec3 uAtmoHaze;
uniform vec3 uSunDirWorld; uniform float uPlanetRadius;
uniform float uHazeDensity; uniform float uAtmosphereHeight; uniform float uRefDist; uniform float uDistanceExponent;
uniform float uHorizonStrength; uniform float uCameraAltInfluence; uniform float uFragAltInfluence; uniform float uHazeMax;
uniform float uContrastReduction; uniform float uSaturationReduction; uniform float uBrightnessBoost;
const vec3 M3D_LUMA = vec3(0.2126, 0.7152, 0.0722);
`

// Bloc greffé AVANT le tonemapping : opère sur `gl_FragColor.rgb` (couleur finale texturée).
const FRAG_BODY = `
{
  vec3 viewDir = normalize(vWorldPosition - cameraPosition);
  vec3 upLocal = normalize(vWorldPosition);
  float dist = distance(vWorldPosition, cameraPosition);
  float camAlt = length(cameraPosition) - uPlanetRadius;
  float fragAlt = length(vWorldPosition) - uPlanetRadius;

  float distanceFactor = 1.0 - exp(-pow(dist / uRefDist, uDistanceExponent) * uHazeDensity);
  float viewAngleFactor = smoothstep(0.0, 1.0, 1.0 - abs(dot(viewDir, upLocal)));
  viewAngleFactor = mix(1.0, viewAngleFactor, uHorizonStrength);
  float camAltFactor = exp(-max(camAlt, 0.0) / uAtmosphereHeight * uCameraAltInfluence);
  float fragAltFactor = exp(-max(fragAlt, 0.0) / uAtmosphereHeight * uFragAltInfluence);
  float m3dHaze = clamp(distanceFactor * viewAngleFactor * camAltFactor * fragAltFactor, 0.0, uHazeMax);

  // Teinte : horizon (opposé↔soleil selon l'azimut) mélangé vers le zénith selon l'angle,
  // puis vers la teinte haze proche-sol.
  vec3 horiz = normalize(viewDir - upLocal * dot(viewDir, upLocal));
  float sunAlign = dot(horiz, uSunDirWorld) * 0.5 + 0.5;
  vec3 horizonCol = mix(uAtmoHorizonOpp, uAtmoHorizonSun, sunAlign);
  vec3 hazeColor = mix(uAtmoZenith, horizonCol, viewAngleFactor);
  float groundWeight = 1.0 - smoothstep(0.0, uAtmosphereHeight, fragAlt);
  hazeColor = mix(hazeColor, uAtmoHaze, groundWeight);

  vec3 c = gl_FragColor.rgb;
  float luma = dot(c, M3D_LUMA);
  c = mix(vec3(luma), c, 1.0 - uContrastReduction * m3dHaze);   // contraste ↓ (vers le gris moyen)
  c = mix(vec3(luma), c, 1.0 - uSaturationReduction * m3dHaze); // saturation ↓ (vers la luma)
  c += uBrightnessBoost * m3dHaze;                              // luminosité ↑
  c = mix(c, hazeColor, m3dHaze);                               // mélange atmosphère (jamais 1)
  gl_FragColor.rgb = c;
}
`

/**
 * Patche un matériau pour le haze. Idempotent (`userData.m3dAtmosphere`). Mélange les uniforms
 * PARTAGÉS par référence, injecte le varying au vertex et le bloc de couleur avant le
 * tonemapping. Clé de cache constante → un seul programme pour toute la carte.
 */
export function applyAtmosphere(material: Material, u: AtmosphereUniforms): void {
  if (material.userData.m3dAtmosphere) return
  material.userData.m3dAtmosphere = true
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, u)
    shader.vertexShader = VERT_DECL + shader.vertexShader.replace('#include <begin_vertex>', VERT_ASSIGN)
    shader.fragmentShader = FRAG_DECL + shader.fragmentShader.replace(
      '#include <tonemapping_fragment>',
      FRAG_BODY + '\n#include <tonemapping_fragment>',
    )
  }
  // Sans clé distincte, three réutilise un programme au cache-key identique (matériau de même
  // signature) et le haze n'apparaît pas. Constante = un programme partagé par tous.
  material.customProgramCacheKey = () => ATMO_CACHE_KEY
  material.needsUpdate = true
}
```

- [ ] **Step 4: Lancer — succès attendu**

Run: `pnpm exec vitest run src/core/atmosphere/materialInjection.test.ts && pnpm typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/core/atmosphere/materialInjection.ts src/core/atmosphere/materialInjection.test.ts
git commit -m "feat(atmosphere): injection GLSL du haze + uniforms partagés"
```

---

## Task 5 : `OrbitalHalo` — sphère rim-lit + fondu inverse

**Files:**
- Create: `src/core/atmosphere/OrbitalHalo.ts`
- Test: `src/core/atmosphere/orbitalHalo.test.ts`

**Interfaces:**
- Consumes: `THREE` (Mesh, SphereGeometry, ShaderMaterial, Color, Vector3, BackSide, AdditiveBlending) ; `AtmosphereUniforms` (Task 4) pour les couleurs.
- Produces:
  - `function haloOpacity(altitude: number, fade: { start: number; end: number }): number` (pure)
  - `class OrbitalHalo extends Mesh` : `constructor(radius: number)` ; `setColors(zenith: Color, horizon: Color): void` ; `setStrength(strength: number, falloff: number): void` ; `setOpacity(o: number): void` ; `dispose(): void`.

- [ ] **Step 1: Écrire les tests**

```ts
import { haloOpacity } from './OrbitalHalo'

const fade = { start: 120_000, end: 60_000 }

test('halo plein en orbite haute', () => {
  expect(haloOpacity(200_000, fade)).toBe(1)
})

test('halo éteint près du sol', () => {
  expect(haloOpacity(10_000, fade)).toBe(0)
})

test('halo intermédiaire dans la bande, croissant avec l\'altitude', () => {
  const low = haloOpacity(80_000, fade)
  const high = haloOpacity(100_000, fade)
  expect(low).toBeGreaterThan(0)
  expect(high).toBeLessThan(1)
  expect(high).toBeGreaterThan(low)
})
```

- [ ] **Step 2: Lancer — échec attendu**

Run: `pnpm exec vitest run src/core/atmosphere/orbitalHalo.test.ts`
Expected: FAIL (module introuvable).

- [ ] **Step 3: Implémenter**

`src/core/atmosphere/OrbitalHalo.ts` :

```ts
import { AdditiveBlending, BackSide, Color, Mesh, ShaderMaterial, SphereGeometry, Vector3 } from 'three'

const clamp01 = (x: number): number => (x < 0 ? 0 : x > 1 ? 1 : x)

/**
 * Opacité du halo par altitude — INVERSE du fondu du Sky : plein au-dessus de `start`, nul
 * sous `end`. Garantit qu'on ne double jamais l'effet du ciel vu du sol.
 */
export function haloOpacity(altitude: number, fade: { start: number; end: number }): number {
  return clamp01((altitude - fade.end) / Math.max(1, fade.start - fade.end))
}

const VERT = /* glsl */ `
  varying vec3 vNormalW;
  varying vec3 vWorldPos;
  void main() {
    vNormalW = normalize(mat3(modelMatrix) * normal);
    vWorldPos = (modelMatrix * vec4(position, 1.0)).xyz;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`

const FRAG = /* glsl */ `
  uniform vec3 uZenith; uniform vec3 uHorizon;
  uniform float uStrength; uniform float uFalloff; uniform float uOpacity;
  varying vec3 vNormalW;
  varying vec3 vWorldPos;
  void main() {
    vec3 viewDir = normalize(vWorldPos - cameraPosition);
    // Fresnel au limbe : liseré vif au bord du globe, fondu vers l'intérieur.
    float rim = pow(clamp(1.0 - abs(dot(viewDir, vNormalW)), 0.0, 1.0), uFalloff);
    vec3 col = mix(uHorizon, uZenith, rim);
    gl_FragColor = vec4(col * uStrength, rim * uOpacity);
  }
`

/** Coquille atmosphérique additive, `BackSide`, vue de l'espace. Pilotée par le manager. */
export class OrbitalHalo extends Mesh {
  declare material: ShaderMaterial

  constructor(radius: number) {
    super(
      new SphereGeometry(radius, 48, 32),
      new ShaderMaterial({
        uniforms: {
          uZenith: { value: new Color(0.2, 0.4, 0.8) },
          uHorizon: { value: new Color(0.6, 0.75, 0.95) },
          uStrength: { value: 1 },
          uFalloff: { value: 3 },
          uOpacity: { value: 0 },
        },
        vertexShader: VERT,
        fragmentShader: FRAG,
        side: BackSide,
        transparent: true,
        depthWrite: false,
        blending: AdditiveBlending,
      }),
    )
    this.frustumCulled = false
    // Derrière la carte mais devant les étoiles/ciel : additif, il ne cache rien.
    this.renderOrder = -0.9
  }

  setColors(zenith: Color, horizon: Color): void {
    ;(this.material.uniforms.uZenith.value as Color).copy(zenith)
    ;(this.material.uniforms.uHorizon.value as Color).copy(horizon)
  }

  setStrength(strength: number, falloff: number): void {
    this.material.uniforms.uStrength.value = strength
    this.material.uniforms.uFalloff.value = falloff
  }

  setOpacity(o: number): void {
    this.material.uniforms.uOpacity.value = o
    this.visible = o > 0
  }

  dispose(): void {
    this.geometry.dispose()
    this.material.dispose()
  }
}
```

Note : le `renderOrder` (-0.9) est à confirmer contre l'empilement existant (étoiles -1, ciel -0.95, océan -0.9, tuiles -0.8) au câblage — il ne doit pas masquer l'océan ; étant additif et transparent, il se peint sans écrire le depth. Ajuster en Task 6 si un artefact apparaît dans l'exemple.

- [ ] **Step 4: Lancer — succès attendu**

Run: `pnpm exec vitest run src/core/atmosphere/orbitalHalo.test.ts && pnpm typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/core/atmosphere/OrbitalHalo.ts src/core/atmosphere/orbitalHalo.test.ts
git commit -m "feat(atmosphere): OrbitalHalo (rim-light + fondu inverse du ciel)"
```

---

## Task 6 : `AtmosphereManager` — orchestration

Assemble tout : détient les uniforms partagés, le provider, les couleurs, le halo. Expose `patch(scene)` pour les tuiles, `patchMaterial(mat)` pour les bâtiments, `applyConfig(cfg)` et `update(...)`.

**Files:**
- Create: `src/core/atmosphere/AtmosphereManager.ts`
- Test: `src/core/atmosphere/AtmosphereManager.test.ts`

**Interfaces:**
- Consumes: `AtmosphereUniforms`, `createAtmosphereUniforms`, `writeAtmosphereConfig`, `applyAtmosphere` (Task 4) ; `AtmosphereProvider`, `AtmosphereColors` (Task 3) ; `OrbitalHalo`, `haloOpacity` (Task 5) ; `AtmosphereConfig` (`@/config/types`) ; `THREE` (Object3D, Mesh, Color, Vector3, Scene).
- Produces:
  - `class AtmosphereManager` :
    - `constructor(provider: AtmosphereProvider, planetRadius: number)`
    - `readonly halo: OrbitalHalo`
    - `readonly uniforms: AtmosphereUniforms`
    - `applyConfig(cfg: AtmosphereConfig, enabled: boolean): void` — pousse les scalaires ; (dés)active.
    - `patch(root: THREE.Object3D): void` — traverse et patche chaque matériau maillé.
    - `patchMaterial(material: THREE.Material): void` — un matériau isolé (bâtiments).
    - `update(altitude: number): void` — sample sur dirty, met à jour le halo. Rien si désactivé.
    - `dispose(): void`

- [ ] **Step 1: Écrire les tests (faux provider)**

```ts
import { Object3D, Mesh, MeshBasicMaterial, Vector3, BufferGeometry } from 'three'
import { AtmosphereManager } from './AtmosphereManager'
import type { AtmosphereProvider, AtmosphereColors } from './AtmosphereProvider'
import { defaultConfig } from '@/config/defaultConfig'

class FakeProvider implements AtmosphereProvider {
  rev = 1
  sampleCount = 0
  revision() { return this.rev }
  sunDirection(out: Vector3) { return out.set(0, 0, 1) }
  sample(out: AtmosphereColors) { this.sampleCount++; out.zenith.setRGB(0.2, 0.4, 0.8) }
}

test('sample n\'est appelé que quand la révision change', () => {
  const p = new FakeProvider()
  const m = new AtmosphereManager(p, 6_378_137)
  m.applyConfig(defaultConfig.atmosphere, true)
  m.update(200_000)
  m.update(200_000)                 // même révision → pas de re-sample
  expect(p.sampleCount).toBe(1)
  p.rev = 2
  m.update(200_000)                 // révision changée → re-sample
  expect(p.sampleCount).toBe(2)
})

test('patch applique le haze à un mesh du sous-arbre', () => {
  const p = new FakeProvider()
  const m = new AtmosphereManager(p, 6_378_137)
  m.applyConfig(defaultConfig.atmosphere, true)
  const root = new Object3D()
  const mat = new MeshBasicMaterial()
  root.add(new Mesh(new BufferGeometry(), mat))
  m.patch(root)
  expect(mat.userData.m3dAtmosphere).toBe(true)
})

test('désactivé : update ne sample pas et le halo est éteint', () => {
  const p = new FakeProvider()
  const m = new AtmosphereManager(p, 6_378_137)
  m.applyConfig(defaultConfig.atmosphere, false)
  m.update(200_000)
  expect(p.sampleCount).toBe(0)
  expect(m.halo.visible).toBe(false)
})
```

- [ ] **Step 2: Lancer — échec attendu**

Run: `pnpm exec vitest run src/core/atmosphere/AtmosphereManager.test.ts`
Expected: FAIL (module introuvable).

- [ ] **Step 3: Implémenter**

`src/core/atmosphere/AtmosphereManager.ts` :

```ts
import { Color, type Material, type Mesh, type Object3D } from 'three'
import type { AtmosphereConfig } from '@/config/types'
import type { AtmosphereProvider, AtmosphereColors } from './AtmosphereProvider'
import { applyAtmosphere, createAtmosphereUniforms, writeAtmosphereConfig, type AtmosphereUniforms } from './materialInjection'
import { OrbitalHalo, haloOpacity } from './OrbitalHalo'

/**
 * Chef d'orchestre de l'atmosphère. Détient les uniforms PARTAGÉS (poussés dans tout matériau
 * patché), le halo orbital, et interroge le `AtmosphereProvider` pour les couleurs — mais
 * seulement quand sa révision change (dirty). `Sky`/`sun` restent extérieurs et intacts.
 */
export class AtmosphereManager {
  readonly uniforms: AtmosphereUniforms = createAtmosphereUniforms()
  readonly halo: OrbitalHalo
  private readonly colors: AtmosphereColors = {
    zenith: new Color(),
    horizonSun: new Color(),
    horizonOpposite: new Color(),
    haze: new Color(),
  }
  private lastRev = -1
  private enabled = false
  private fade = { start: 120_000, end: 60_000 }

  constructor(
    private readonly provider: AtmosphereProvider,
    planetRadius: number,
  ) {
    this.uniforms.uPlanetRadius.value = planetRadius
    // Halo un poil plus grand que la planète — la coquille englobe le limbe.
    this.halo = new OrbitalHalo(planetRadius * 1.015)
  }

  /** Pousse les scalaires de config et (dés)active. Appelé au montage + à chaque setConfig. */
  applyConfig(cfg: AtmosphereConfig, enabled: boolean): void {
    writeAtmosphereConfig(this.uniforms, cfg)
    this.halo.setStrength(cfg.orbitalHaloStrength, cfg.orbitalHaloFalloff)
    this.fade = cfg.orbitalFade
    this.enabled = enabled
    if (!enabled) this.halo.setOpacity(0)
    // Force un re-sample au prochain update (les couleurs peuvent dépendre d'une config neuve).
    this.lastRev = -1
  }

  /** Traverse un sous-arbre (tuile chargée) et patche chaque matériau maillé. */
  patch(root: Object3D): void {
    if (!this.enabled) return
    root.traverse((o) => {
      const material = (o as Mesh).material
      if (!material) return
      if (Array.isArray(material)) for (const m of material) applyAtmosphere(m, this.uniforms)
      else applyAtmosphere(material, this.uniforms)
    })
  }

  /** Patche un matériau isolé (le matériau unique des bâtiments). */
  patchMaterial(material: Material): void {
    if (this.enabled) applyAtmosphere(material, this.uniforms)
  }

  /** Par frame : re-sample sur dirty, oriente le soleil, pilote le halo par l'altitude. */
  update(altitude: number): void {
    if (!this.enabled) return
    const rev = this.provider.revision()
    if (rev !== this.lastRev) {
      this.lastRev = rev
      this.provider.sample(this.colors)
      this.provider.sunDirection(this.uniforms.uSunDirWorld.value)
      this.uniforms.uAtmoZenith.value.copy(this.colors.zenith)
      this.uniforms.uAtmoHorizonSun.value.copy(this.colors.horizonSun)
      this.uniforms.uAtmoHorizonOpp.value.copy(this.colors.horizonOpposite)
      this.uniforms.uAtmoHaze.value.copy(this.colors.haze)
      this.halo.setColors(this.colors.zenith, this.colors.horizonOpposite)
    }
    this.halo.setOpacity(haloOpacity(altitude, this.fade))
  }

  dispose(): void {
    this.halo.dispose()
  }
}
```

- [ ] **Step 4: Lancer — succès attendu**

Run: `pnpm exec vitest run src/core/atmosphere/AtmosphereManager.test.ts && pnpm typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/core/atmosphere/AtmosphereManager.ts src/core/atmosphere/AtmosphereManager.test.ts
git commit -m "feat(atmosphere): AtmosphereManager (orchestration dirty + halo)"
```

---

## Task 7 : Hook `onMaterial` dans `BuildingsLayer`

Permettre au moteur de patcher le matériau unique des bâtiments sans casser l'encapsulation.

**Files:**
- Modify: `src/layers/BuildingsLayer.ts` (constructeur + appel du hook)

**Interfaces:**
- Consumes: rien de nouveau.
- Produces: paramètre optionnel de constructeur `onMaterial?: (material: THREE.Material) => void`, appelé une fois sur `this.material`.

- [ ] **Step 1: Ajouter le paramètre et l'appel**

Dans `src/layers/BuildingsLayer.ts`, ajouter en dernier paramètre du `constructor` (après `colors`) :

```ts
    /**
     * Hook du moteur pour patcher le matériau UNIQUE des bâtiments (perspective aérienne).
     * Appelé une fois : tous les bâtiments partageant ce matériau, un seul patch les couvre.
     */
    onMaterial?: (material: THREE.Material) => void,
```

Puis, à la fin du corps du constructeur :

```ts
    onMaterial?.(this.material)
```

- [ ] **Step 2: Typecheck — succès attendu**

Run: `pnpm typecheck`
Expected: PASS (paramètre optionnel, aucun appelant existant cassé).

- [ ] **Step 3: Lancer la suite bâtiments — succès attendu**

Run: `pnpm exec vitest run src/layers/buildingPick.test.ts src/layers/buildingRaycast.test.ts`
Expected: PASS (aucune régression).

- [ ] **Step 4: Commit**

```bash
git add src/layers/BuildingsLayer.ts
git commit -m "feat(atmosphere): hook onMaterial dans BuildingsLayer"
```

---

## Task 8 : Câblage `MapEngine`

Instancier le manager, le brancher au flux de tuiles (`load-model`), aux bâtiments (hook), à la boucle (`tick`), à la config (`applySky`-like) et au `dispose`.

**Files:**
- Modify: `src/core/MapEngine.ts`

**Interfaces:**
- Consumes: `AtmosphereManager` (Task 6), `SkyAtmosphereProvider` (Task 3). Le moteur possède déjà `this.tiles` (TilesRenderer), `this.buildings` (BuildingsLayer, construit L652), `this.config`, `this.theme`, `this.subsolar`, `this.scene`, et un `tick` qui appelle `updateSky`.
- Produces: comportement runtime (pas d'API publique nouvelle ici).

- [ ] **Step 1: Imports, option d'activation, champs**

En tête de `MapEngine.ts`, à côté de `import { Sky } from './Sky'` :

```ts
import { AtmosphereManager } from './atmosphere/AtmosphereManager'
import { SkyAtmosphereProvider } from './atmosphere/SkyAtmosphereProvider'
```

`theme.globe.atmosphere` est **figé au montage** comme les autres valeurs de thème (elles arrivent aplaties dans les options du moteur — pas de `this.theme`, pas de `setTheme`). Ajouter donc au **type des options du moteur** (celui qui contient `background`, `oceanColor`, `buildingColor?` — vers la L82), à côté de `buildingColor?: string` :

```ts
  /** Interrupteur maître de l'atmosphère (haze + halo). Vient de `theme.globe.atmosphere`, figé au montage. */
  atmosphere?: boolean
```

Champs privés. Le PROVIDER n'a pas de dépendance → initialiseur de champ possible. Le MANAGER a besoin du rayon d'ellipsoïde, or `this.tiles` n'est assigné que dans le CORPS du constructeur (L588) — un initialiseur de champ s'exécuterait AVANT et lirait `this.tiles` undefined. Il est donc déclaré ici, instancié dans le corps (Step 2) :

```ts
  private readonly atmoProvider = new SkyAtmosphereProvider()
  private atmosphere!: AtmosphereManager
  private readonly atmosphereEnabled: boolean
```

Note : le rayon équatorial est `this.tiles.ellipsoid.radius.x` (un `Vector3` — cf. usage existant `MapEngine.ts:504`).

- [ ] **Step 2: Instancier le manager, l'ajouter à la scène, brancher tuiles et bâtiments**

Dans le CORPS du constructeur, APRÈS `this.tiles = new TilesRenderer()` et `this.scene.add(this.tiles.group)` (~L603), instancier le manager et lire l'activation figée :

```ts
    this.atmosphereEnabled = opts.atmosphere ?? defaultTheme.globe.atmosphere
    this.atmosphere = new AtmosphereManager(this.atmoProvider, this.tiles.ellipsoid.radius.x)
    this.scene.add(this.atmosphere.halo)
    // Chaque tuile chargée est patchée à la volée (flux continu). `dispose-model` : rien à
    // faire, le renderer dispose le matériau ; nos uniforms partagés survivent.
    this.tiles.addEventListener('load-model', (e) => this.atmosphere.patch((e as unknown as { scene: THREE.Object3D }).scene))
```

`defaultTheme` est déjà importé (utilisé pour les couleurs de bâtiments). `this.atmosphereEnabled` doit être assigné avant tout usage — le placer ici, avant la construction de `this.buildings`, puis appeler `this.applyAtmosphere()` au bon endroit (Step 3). `atmosphereEnabled` étant `readonly`, cette affectation dans le corps est correcte (une seule).

Passer le hook au `BuildingsLayer` (modifier l'appel `new BuildingsLayer(` L652) en ajoutant un dernier argument, après l'objet des couleurs :

```ts
      (material) => this.atmosphere.patchMaterial(material),
```

Enfin, câbler le thème → option côté React. Dans `src/react/Map.tsx`, dans le bloc qui mappe `theme.globe.*` vers les options du moteur (~L205-216, à côté de `buildingColor: theme.globe.buildingColor,`) :

```ts
      atmosphere: theme.globe.atmosphere,
```

- [ ] **Step 3: Pousser la config (jumeau de `applySky`)**

Ajouter une méthode jumelle de `applySky` qui pousse les scalaires LIVE de `config.atmosphere` et l'activation FIGÉE `this.atmosphereEnabled` :

```ts
  /** (Re)configure l'atmosphère : scalaires de `config.atmosphere` (live) + activation figée au montage. */
  private applyAtmosphere(): void {
    this.atmosphere.applyConfig(this.config.atmosphere, this.atmosphereEnabled)
  }
```

L'appeler partout où `this.applySky()` est appelé (montage ~L762, `setConfig` ~L1071). L'activation vient de `opts.atmosphere` (Step 1/2), l'équivalent figé de `theme.globe.atmosphere` — même canal que les couleurs de bâtiments (frozen at mount). Les scalaires, eux, sont relus à chaque `setConfig` (donc tunables live dans l'exemple).

- [ ] **Step 4: Pousser le soleil au provider + update par frame**

Ajouter deux scratch vecteurs de classe (près des autres, ex. `clampScratch` L468) — jamais d'alloc par frame :

```ts
  private readonly atmoSunScratch = new THREE.Vector3()
  private readonly atmoUpScratch = new THREE.Vector3()
```

Dans `tick`, à côté de `this.updateSky(state)` (~L2518), APRÈS lui (l'ordre importe : `updateSky` a déjà écrit `up`/`sunPosition` dans les uniforms du ciel quand il existe) :

```ts
    // Soleil et verticale locale en repère monde. Si le ciel existe, ses uniforms les portent
    // déjà (réutilisés tels quels) ; sinon on les dérive du subsolaire et de la position (le
    // haze peut vivre sans ciel). Scratch de classe → zéro-alloc.
    const sunDir = this.sky ? this.sky.uniforms.sunPosition.value : this.projection.worldNormal(this.subsolar, this.atmoSunScratch)
    const upLocal = this.sky ? this.sky.uniforms.up.value : this.projection.worldNormal(state, this.atmoUpScratch)
    this.atmoProvider.setState(this.config.sky, sunDir, upLocal.dot(sunDir))
    this.atmosphere.update(state.altitude)
```

(`projection.worldNormal(point, out)` écrit la normale monde dans `out` et le renvoie — même usage que dans `updateSky`, `MapEngine.ts:917-918`.)

- [ ] **Step 5: `dispose`**

Dans `dispose()`, à côté de `if (this.sky) this.sky.dispose()` (~L2972) :

```ts
    this.atmosphere.dispose()
```

- [ ] **Step 6: Typecheck + suite complète**

Run: `pnpm typecheck && pnpm test`
Expected: PASS (aucune régression ; les erreurs préexistantes hors périmètre — templates, plugins de l'exemple — ne comptent pas, mais NE PAS en introduire de nouvelles).

- [ ] **Step 7: Vérifier à l'œil dans l'exemple**

Run: `pnpm dev:example`
Attendu : en descendant vers une ville, le terrain lointain se fond progressivement dans une teinte atmosphérique cohérente avec le ciel, sans bande horizontale ; en remontant en orbite, un halo apparaît au limbe puis le haze s'efface. Calibrer les défauts de `config.atmosphere` si besoin (commit séparé).

- [ ] **Step 8: Commit**

```bash
git add src/core/MapEngine.ts
git commit -m "feat(atmosphere): câblage moteur (tuiles, bâtiments, tick, config, dispose)"
```

---

## Task 9 : Exemple React — contrôles

Brancher `config.atmosphere` et le toggle dans `examples/react/` pour exercer la feature.

**Files:**
- Modify: fichiers de contrôles de `examples/react/` (grep le panneau qui règle déjà `config.sky` — même emplacement).

**Interfaces:**
- Consumes: `AtmosphereConfig` (export public Task 1), `MapProvider`/props de config existants.

- [ ] **Step 1: Repérer le panneau de réglages existant**

Run: `grep -rniE "config\.sky|sky:|turbidity|rayleigh" examples/react/src | head`
Identifier le composant qui expose déjà les réglages du ciel.

- [ ] **Step 2: Ajouter les contrôles atmosphère**

Dans ce composant, ajouter des sliders liés à `config.atmosphere` (`hazeDensity`, `referenceDistanceMeters`, `horizonStrength`, `contrastReduction`, `saturationReduction`, `brightnessBoost`, `orbitalHaloStrength`), poussés dans le même arbre de config que le ciel (via `setConfig`, donc **tunables live**). Respecter le style du panneau existant (pas de nouveau design).

Note sur l'interrupteur maître : `theme.globe.atmosphere` est **figé au montage** (comme toutes les valeurs de thème du moteur). Un toggle de thème ne prendra donc effet qu'à un remount du `<Map>`. Pour une démonstration on/off vivante dans l'exemple, mettre `hazeDensity` **et** `orbitalHaloStrength` à `0` éteint visuellement l'effet sans remount — c'est la voie live. Ne pas présenter un toggle de thème qui semblerait agir à chaud alors qu'il ne le fait pas.

- [ ] **Step 3: Vérifier à l'œil**

Run: `pnpm dev:example`
Attendu : bouger `hazeDensity` épaissit visiblement le voile ; couper le toggle supprime haze + halo.

- [ ] **Step 4: Commit**

```bash
git add examples/react
git commit -m "example: contrôles de l'atmosphère (haze + halo)"
```

---

## Task 10 : Documentation bilingue

**Files:**
- Create: `docs/fr/ATMOSPHERE.md`, `docs/en/ATMOSPHERE.md`
- Modify: `docs/fr/CONFIG.md`, `docs/en/CONFIG.md` (bloc `config.atmosphere`)
- Modify: `docs/fr/README.md`, `docs/en/README.md` (index — ajouter le lien du guide)

**Interfaces:** aucune (docs).

- [ ] **Step 1: Écrire le guide FR**

`docs/fr/ATMOSPHERE.md` : 2ᵉ ligne = sélecteur `**Français** · [English](../en/ATMOSPHERE.md) · [↑ Index](README.md)`. Sections numérotées : `## 1. Principe` (perspective aérienne vs THREE.Fog, continuité avec le ciel), `## 2. Facteurs` (distance, angle, altitude caméra, altitude fragment, densité), `## 3. Atmosphère orbitale`, `## 4. Paramètres` (tableau de `config.atmosphere` + `theme.globe.atmosphere`), `## 5. Performance` (uniforms partagés, dirty, une variante de programme), `## 6. Étendre` (remplacer `AtmosphereProvider` par une LUT/météo).

- [ ] **Step 2: Traduire à l'identique en EN**

`docs/en/ATMOSPHERE.md` : mêmes sections numérotées, sélecteur `[Français](../fr/ATMOSPHERE.md) · **English** · [↑ Index](README.md)`. Ne PAS traduire les noms d'API/clés de config.

- [ ] **Step 3: Ajouter le bloc `config.atmosphere` dans les deux `CONFIG.md`**

Reprendre les JSDoc du `type AtmosphereConfig` (Task 1) comme descriptions. Encadré « traduit à la main » côté EN (convention du repo pour les références).

- [ ] **Step 4: Lien dans les deux index**

Ajouter `ATMOSPHERE.md` à la liste des guides dans `docs/fr/README.md` et `docs/en/README.md`.

- [ ] **Step 5: Commit**

```bash
git add docs/fr/ATMOSPHERE.md docs/en/ATMOSPHERE.md docs/fr/CONFIG.md docs/en/CONFIG.md docs/fr/README.md docs/en/README.md
git commit -m "docs(atmosphere): guide bilingue + référence config.atmosphere"
```

---

## Task 11 : Finition

**Files:** transverses.

- [ ] **Step 1: `/simplify` sur le diff de la feature**

Passer `/simplify` sur les fichiers créés/modifiés (qualité, réutilisation, altitude). Appliquer, committer si changements.

- [ ] **Step 2: React doctor**

Diagnostic React sur la couche exemple/hooks touchés. Corriger, committer si besoin.

- [ ] **Step 3: Lint + typecheck + test complet**

Run: `pnpm lint && pnpm typecheck && pnpm test`
Expected: PASS (hors erreurs préexistantes hors périmètre).

- [ ] **Step 4: Demander avant Playwright**

Ne PAS lancer de test Playwright sans accord explicite de l'utilisateur (règle CLAUDE.md).

---

## Self-review — couverture de la spec

- **Haze par-fragment (distance/angle/alt caméra/alt fragment/densité), sans THREE.Fog** → Task 4 (GLSL) + Task 8 (câblage). ✓
- **Continuité couleur avec Sky (pas de couleur fixe)** → Task 2 (couleurs réf) + Task 3 (provider) + Task 4 (blend). ✓
- **Sphère orbitale, fondu inverse du Sky, pas de double effet** → Task 5 + Task 6.update. ✓
- **Bâtiments : contraste↓/saturation↓/luminosité↑/mélange, silhouette préservée** → Task 4 (`hazeMax` < 1). ✓
- **GPU only, uniforms mutualisés, onBeforeCompile + customProgramCacheKey** → Task 4. ✓
- **Dirty : re-sample seulement sur changement** → Task 3 (revision) + Task 6 (lastRev). ✓
- **AtmosphereProvider swappable sans toucher aux shaders** → Task 3. ✓
- **Params exposés (les 10 + extras)** → Task 1 (`AtmosphereConfig`) ; `theme.globe.atmosphere` = maître on/off. ✓
- **Tuiles 3D + bâtiments** → Task 8 (load-model + hook). ✓
- **Docs FR+EN + exemple + exports** → Tasks 9, 10, 1 (export). ✓
- **Perf/compat LOD/culling/streaming** → patch au load-model (Task 8), une variante de programme (Task 4). ✓

Faits runtime déjà vérifiés et intégrés au plan : rayon d'ellipsoïde = `this.tiles.ellipsoid.radius.x` ; pas de `this.theme`/`setTheme` → activation via `opts.atmosphere` figée au montage, câblée depuis `Map.tsx` ; `CameraState.altitude` existe ; `load-model` fournit `{ scene }` ; `defaultTheme` déjà importé dans le moteur. Restent à ajuster À L'ŒIL dans l'exemple (Task 8 Step 7, non bloquants) : `renderOrder` du halo dans l'empilement, et le cas `sky === null` (repli soleil via `projection.worldNormal` + scratch de classe, jamais d'alloc par frame).
