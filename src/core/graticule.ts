// Grille de coordonnées géographiques : décision de maille, engendrement des lignes et
// formatage des coordonnées.
//
// Module PUR — aucun import three, aucun DOM. C'est lui que les tests couvrent, et c'est ce
// qui permet de vérifier l'anti-oscillation de palier sans monter une carte.

import { formatLabel } from '../labels/mergeLabels'
import { clamp, DEG2RAD, M_PER_DEG, metersPerPixelAtZoom, normalizeLng, zoomForAltitude } from './math'

const MIN = 1 / 60
const SEC = 1 / 3600

/**
 * Écart (degrés) sous lequel une ligne remarquable est réputée tomber SUR une ligne de
 * maille — ~0,4 mm au sol. Elle la marque alors au lieu de s'y superposer.
 */
const COINCIDENCE_EPS = 1e-9

/**
 * Échelle des mailles, en degrés décimaux mais **toutes sexagésimales** : 30° 15° 10° 5° 2°
 * 1°, puis les mêmes valeurs en minutes, puis en secondes.
 *
 * C'est cette base 60 qui donne les « 13°42′25″N » d'un atlas. Une échelle décimale
 * (0,5° / 0,1°) produirait des coordonnées qu'aucune carte papier n'affiche, et des
 * étiquettes impossibles à reporter sur un relevé.
 */
export const GRATICULE_LEVELS: readonly number[] = [
  30,
  15,
  10,
  5,
  2,
  1,
  30 * MIN,
  15 * MIN,
  10 * MIN,
  5 * MIN,
  2 * MIN,
  1 * MIN,
  30 * SEC,
  15 * SEC,
  10 * SEC,
  5 * SEC,
  2 * SEC,
  1 * SEC,
]

/**
 * Hauteur visible à l'écran, en degrés de latitude.
 *
 * Dérivée de l'ALTITUDE et non de `MapView.bounds` : les bounds passent par
 * `viewportBounds()`, une grille de 25 raycasts d'ellipsoïde que le moteur réserve
 * explicitement aux consommateurs hors boucle de frame (cf. `MapEngine.tick`). Ici, deux
 * appels de fonctions pures suffisent.
 *
 * Échelle Web-Mercator (`metersPerPixelAtZoom`) et non résolution perspective
 * (`Projection.metersPerPixel`) : la maille doit suivre le ZOOM PERÇU, celui qui nomme la
 * coordonnée, et rester stable quand on incline la vue. La résolution perspective, elle, varie
 * avec la distance au point visé — la maille changerait de palier sur un simple basculement de
 * caméra, sans qu'aucune coordonnée ait bougé.
 */
export function visibleSpanDeg(altitude: number, latDeg: number, viewportHeightPx: number): number {
  const mpp = metersPerPixelAtZoom(zoomForAltitude(altitude), latDeg)
  return (mpp * Math.max(1, viewportHeightPx)) / M_PER_DEG
}

/**
 * Maille à afficher : la plus GROSSE qui laisse au moins `targetLines` lignes à l'écran.
 *
 * `previous` (maille courante) et `hysteresis` forment une **bande morte** : sans elle, un
 * zoom arrêté pile sur une frontière de palier rebascule d'une frame à l'autre, et chaque
 * bascule reconstruit toute la géométrie. Ce n'est pas un confort visuel mais la seule chose
 * qui empêche un rebuild en boucle.
 *
 * `range` borne l'échelle (`[min, max]` en degrés) : un hôte peut ainsi FIGER une maille.
 */
export function pickLevel(
  spanDeg: number,
  targetLines: number,
  previous: number | null,
  hysteresis: number,
  range: readonly [number, number] | null,
): number {
  // Bornes d'INDICE et non tableau filtré : l'échelle est triée décroissante, donc `range` y
  // découpe une tranche contiguë. Filtrer allouait un tableau à chaque frame dès qu'un hôte
  // figeait la maille — une allocation en boucle de frame sur un chemin public.
  let lo = 0
  let hi = GRATICULE_LEVELS.length - 1
  if (range) {
    while (lo <= hi && GRATICULE_LEVELS[lo]! > range[1]) lo++
    while (hi >= lo && GRATICULE_LEVELS[hi]! < range[0]) hi--
  }
  // `range` plus étroit que tout palier : on retombe sur sa borne basse plutôt que sur rien —
  // une grille figée hors échelle vaut mieux qu'une grille absente.
  if (lo > hi) return range ? range[0] : GRATICULE_LEVELS[GRATICULE_LEVELS.length - 1]!
  let best = GRATICULE_LEVELS[hi]!
  for (let i = lo; i <= hi; i++) {
    if (spanDeg / GRATICULE_LEVELS[i]! >= targetLines) {
      best = GRATICULE_LEVELS[i]!
      break
    }
  }
  const dansLaPlage = previous !== null && previous >= GRATICULE_LEVELS[hi]! && previous <= GRATICULE_LEVELS[lo]!
  if (previous === null || !dansLaPlage || previous === best) return best
  // Bande morte : on ne quitte la maille courante que si l'écart de densité la dépasse.
  const ratio = spanDeg / previous / targetLines
  const dehors = ratio > 1 + hysteresis || ratio < 1 / (1 + hysteresis)
  return dehors ? best : previous
}

/** Coordonnée découpée. `min`/`sec` valent 0 aux précisions plus grossières. */
export type DmsParts = { deg: number; min: number; sec: number }

/** Format d'étiquette. `'auto'` suit la maille courante (cf. `formatFor`). */
export type CoordFormat = 'auto' | 'dms' | 'dm' | 'deg'

/**
 * Découpe une coordonnée ABSOLUE (le signe est porté par l'hémisphère) en degrés, minutes,
 * secondes, arrondie à la précision demandée.
 *
 * ⚠️ Le report d'arrondi remonte de proche en proche : 13°42′59,7″ vaut 13°43′00″ et non
 * « 13°42′60″ », qui ne se lit sur aucune carte. Le cas se produit sur presque toutes les
 * étiquettes d'une grille fine, où l'on affiche une valeur théorique déjà bruitée par le
 * flottant.
 */
export function toDms(absDeg: number, precision: 'deg' | 'dm' | 'dms'): DmsParts {
  if (precision === 'deg') return { deg: Math.round(absDeg), min: 0, sec: 0 }
  let deg = Math.floor(absDeg)
  if (precision === 'dm') {
    let min = Math.round((absDeg - deg) * 60)
    if (min >= 60) {
      min = 0
      deg++
    }
    return { deg, min, sec: 0 }
  }
  let min = Math.floor((absDeg - deg) * 60)
  let sec = Math.round((absDeg - deg - min / 60) * 3600)
  if (sec >= 60) {
    sec = 0
    min++
  }
  if (min >= 60) {
    min = 0
    deg++
  }
  return { deg, min, sec }
}

/** Précision réelle d'une étiquette : `'auto'` la déduit de la maille. */
export function formatFor(level: number, format: CoordFormat): 'deg' | 'dm' | 'dms' {
  if (format !== 'auto') return format
  if (level >= 1) return 'deg'
  return level >= MIN ? 'dm' : 'dms'
}

/** Textes nécessaires au rendu d'une étiquette — le sous-arbre `labels.graticule`. */
export type GraticuleTexts = {
  remarkable: Record<string, string>
  format: { deg: string; dm: string; dms: string }
  hemisphere: { north: string; south: string; east: string; west: string }
}

/**
 * Étiquette d'une ligne : nom de la remarquable si elle en a un, coordonnée formatée sinon.
 *
 * Le gabarit vient des `labels` (variables `{d}` `{m}` `{s}` `{hemi}`) : le format DMS est de
 * l'i18n et non du code — « Équateur » devient « Equator », et un hôte francophone peut
 * vouloir « O » plutôt que « W ».
 */
export function labelFor(
  line: GraticuleLine,
  level: number,
  format: CoordFormat,
  texts: GraticuleTexts,
  showRemarkableNames: boolean,
): string {
  if (line.remarkable && showRemarkableNames) {
    const nom = texts.remarkable[line.remarkable]
    if (nom) return nom
  }
  const precision = formatFor(level, format)
  const { deg, min, sec } = toDms(Math.abs(line.value), precision)
  const hemi =
    line.kind === 'parallel'
      ? line.value < 0
        ? texts.hemisphere.south
        : texts.hemisphere.north
      : line.value < 0
        ? texts.hemisphere.west
        : texts.hemisphere.east
  // `formatLabel` et non une chaîne de `.replace()` : celle-ci ne remplace que la PREMIÈRE
  // occurrence (un gabarit traduit qui répète `{hemi}` sortait faux) et laisse une clé absente
  // telle quelle sans le dire. C'est l'unique interpolateur `{nom}` du dépôt.
  return formatLabel(texts.format[precision], { d: deg, m: pad2(min), s: pad2(sec), hemi })
}

/** Deux chiffres — les minutes et secondes d'une coordonnée s'écrivent toujours ainsi. */
const pad2 = (n: number): string => String(n).padStart(2, '0')

/** Emprise construite. `east` peut dépasser 180 : la bande est DÉROULÉE (cf. `linesFor`). */
export type GraticuleBand = { south: number; north: number; west: number; east: number }

/** Une ligne à tracer. `remarkable` porte la clé de libellé, `null` pour une ligne ordinaire. */
export type GraticuleLine = { kind: 'parallel' | 'meridian'; value: number; remarkable: string | null }

/** Lignes toujours tracées quelle que soit la maille, avec leur clé de libellé. */
export type RemarkableSpec = {
  parallels: readonly { lat: number; labelKey: string }[]
  meridians: readonly { lng: number; labelKey: string }[]
}

export type LinesOptions = {
  maxLines: number
  latLimitDeg: number
  remarkable: RemarkableSpec | null
}

/**
 * Emprise à construire autour du centre de vue, large de `screens` écrans.
 *
 * On ne construit JAMAIS le globe entier : au pas de 1″, il faudrait des millions de
 * sommets. La bande déborde de l'écran pour qu'un pan ordinaire ne déclenche pas de
 * reconstruction — c'est elle qui transforme « rebuild par frame » en « rebuild par écran
 * parcouru ».
 *
 * La demi-largeur en longitude est divisée par le cosinus de la latitude : un degré de
 * longitude rétrécit vers les pôles, donc l'écran en couvre d'autant plus.
 */
export function bandFor(
  centerLat: number,
  centerLng: number,
  spanDeg: number,
  screens: number,
  latLimit: number,
): GraticuleBand {
  const halfLat = (spanDeg * screens) / 2
  // Cosinus planchéré : au pôle il s'effondre et la bande ferait plusieurs tours.
  const cos = Math.max(Math.cos(centerLat * DEG2RAD), 1e-3)
  const halfLng = Math.min(halfLat / cos, 180)
  return {
    south: clamp(centerLat - halfLat, -latLimit, latLimit),
    north: clamp(centerLat + halfLat, -latLimit, latLimit),
    west: centerLng - halfLng,
    east: centerLng + halfLng,
  }
}

/** Multiples de `level` dans `[from, to]`, plafonnés à `maxLines`. */
function multiplesIn(from: number, to: number, level: number, maxLines: number): number[] {
  const out: number[] = []
  const first = Math.ceil(from / level)
  const last = Math.floor(to / level)
  const count = last - first + 1
  if (count <= 0) return out
  // Plafond dur : garde-fou mémoire indépendant du calcul de maille. Une maille figée par
  // `levelRangeDeg` sur une emprise large demanderait sinon des millions de lignes.
  const step = count > maxLines ? Math.ceil(count / maxLines) : 1
  // Reconstruit depuis l'indice ENTIER : `from + k*level` accumulerait l'erreur flottante et
  // les étiquettes afficheraient 4°59′60″ au lieu de 5°.
  for (let i = first; i <= last; i += step) out.push(i * level)
  return out
}

/**
 * Lignes à tracer dans la bande, à la maille `level`, plus les remarquables.
 *
 * Les remarquables sont ajoutées **quelle que soit la maille** : sans ça, l'Équateur
 * disparaîtrait dès la maille 15°, alors que c'est justement la ligne qu'on cherche du
 * regard. Quand une remarquable tombe sur un multiple de la maille, elle ne double pas la
 * ligne ordinaire — elle la MARQUE.
 */
export function linesFor(band: GraticuleBand, level: number, opts: LinesOptions): GraticuleLine[] {
  const { maxLines, latLimitDeg, remarkable } = opts
  const south = Math.max(band.south, -latLimitDeg)
  const north = Math.min(band.north, latLimitDeg)
  const out: GraticuleLine[] = []

  // Tolérance ABSOLUE et serrée : une remarquable ne marque une ligne de maille que si elle
  // tombe DESSUS. Une tolérance proportionnelle à la maille (level/2) faisait passer le
  // parallèle 30° pour le tropique du Cancer dès la maille 15°.
  // L'écart se lit sur l'axe déroulé, pour que 180° et −180° soient le même méridien.
  //
  // `posees` retient ce que la première passe a marqué : c'est ce qui évite à la seconde de
  // rebalayer `out` pour se demander si elle doublerait une ligne. Une seule mémoire de la
  // question, au lieu d'une comparaison de valeurs PUIS d'une recherche de clé.
  const posees = new Set<string>()
  const marque = (values: readonly { lat?: number; lng?: number; labelKey: string }[], v: number): string | null => {
    const hit = values.find((r) => Math.abs(normalizeLng((r.lat ?? r.lng!) - v)) < COINCIDENCE_EPS)
    if (hit) posees.add(hit.labelKey)
    return hit?.labelKey ?? null
  }

  for (const lat of multiplesIn(south, north, level, maxLines)) {
    out.push({ kind: 'parallel', value: lat, remarkable: marque(remarkable?.parallels ?? [], lat) })
  }
  // Longitudes engendrées sur l'axe DÉROULÉ puis ramenées dans [-180, 180] : une bande à
  // cheval sur l'antiméridien (170 → 190) doit produire 170, 175, 180, −175, −170 sans trou.
  for (const lng of multiplesIn(band.west, band.east, level, maxLines)) {
    const v = normalizeLng(lng)
    out.push({ kind: 'meridian', value: v, remarkable: marque(remarkable?.meridians ?? [], v) })
  }

  if (!remarkable) return out
  for (const r of remarkable.parallels) {
    if (r.lat < south || r.lat > north || posees.has(r.labelKey)) continue
    out.push({ kind: 'parallel', value: r.lat, remarkable: r.labelKey })
  }
  for (const r of remarkable.meridians) {
    // Test sur l'axe déroulé : la bande peut couvrir 170→190 et contenir −175.
    const dedans = [r.lng, r.lng + 360, r.lng - 360].some((v) => v >= band.west && v <= band.east)
    if (!dedans || posees.has(r.labelKey)) continue
    out.push({ kind: 'meridian', value: r.lng, remarkable: r.labelKey })
  }
  return out
}
