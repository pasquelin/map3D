// Agrégation et cadrage de cadres géographiques. Extrait de `SearchBox` (où
// `altitudeForBounds` vivait en privé) pour être partagé par le cadrage caméra,
// les formes et les markers.

import type { Bounds, LatLng } from '../shared'
import { DEG2RAD, M_PER_DEG, clamp, normalizeLng, unwrapLng } from './math'

/**
 * Amplitude en longitude d'un cadre (degrés), antiméridien compris.
 *
 * `east < west` signale un cadre qui franchit ±180° (Fidji : west 176.8 →
 * east -178.0) : un simple `east - west` y donnerait -354.8 au lieu de 5.2. On ne
 * peut pas non plus prendre le plus court arc — un cadre large de plus de 180°
 * qui NE franchit PAS l'antiméridien (west -170 → east 170, soit 340°) serait
 * ramené à 20°. Seul le signe de `east - west` distingue les deux cas.
 */
export function lngSpanDeg(b: Bounds): number {
  return b.east >= b.west ? b.east - b.west : b.east + 360 - b.west
}

/** Centre d'un cadre — correct aussi quand le cadre franchit l'antiméridien. */
export function centerOfBounds(b: Bounds): LatLng {
  return { lat: (b.north + b.south) / 2, lng: normalizeLng(b.west + lngSpanDeg(b) / 2) }
}

/** Bornes d'altitude d'un cadrage — défauts hérités de la recherche de lieu. */
export type AltitudeForBoundsOptions = {
  /** Marge de respiration autour du cadre (1 = pile aux bords). Défaut 1.35. */
  margin?: number
  /** Défaut 350 m. À abaisser pour cadrer un objet de quelques dizaines de mètres. */
  minAltitude?: number
  /** Défaut 6000 km — un pays entier reste sous le dézoom max. */
  maxAltitude?: number
}

/**
 * Altitude (m) cadrant un ensemble géographique : ~1.35× son grand côté par
 * défaut, bornée [350 m, 6000 km].
 *
 * Ces bornes viennent de la recherche de lieu, où descendre sous 350 m n'a pas de
 * sens. Elles sont paramétrables **parce que d'autres cadrages en ont besoin** :
 * une trace GPS de 200 m resterait sinon cadrée trop haut, ce qui serait une
 * régression face au `fitBounds` de Google.
 */
export function altitudeForBounds(b: Bounds, opts: AltitudeForBoundsOptions = {}): number {
  const latSpan = Math.abs(b.north - b.south) * M_PER_DEG
  const lngSpan = lngSpanDeg(b) * M_PER_DEG * Math.cos(((b.north + b.south) / 2) * DEG2RAD)
  const span = Math.max(latSpan, lngSpan) * (opts.margin ?? 1.35)
  return clamp(span, opts.minAltitude ?? 350, opts.maxAltitude ?? 6_000_000)
}

/**
 * Cadre englobant une liste de points. `null` si la liste est vide ou ne contient
 * aucune coordonnée finie (une seule coordonnée `NaN` empoisonnerait sinon tout le
 * cadre, et la caméra viserait le néant).
 *
 * L'antiméridien est traité : les points sont projetés sur un axe de longitude
 * continu depuis le premier, puis le cadre est renormalisé. Sans ça, deux points
 * de part et d'autre de ±180° produiraient un cadre faisant le tour du globe.
 */
export function boundsOfLatLngs(points: Iterable<LatLng>): Bounds | null {
  let north = -Infinity
  let south = Infinity
  let minLng = Infinity
  let maxLng = -Infinity
  let ref: number | null = null
  for (const p of points) {
    if (!Number.isFinite(p.lat) || !Number.isFinite(p.lng)) continue
    north = Math.max(north, p.lat)
    south = Math.min(south, p.lat)
    ref ??= p.lng
    // Déroulé continu depuis la référence — renormalisé à la fin.
    const lng = unwrapLng(p.lng, ref)
    minLng = Math.min(minLng, lng)
    maxLng = Math.max(maxLng, lng)
  }
  if (ref === null) return null
  return { north, south, west: normalizeLng(minLng), east: normalizeLng(maxLng) }
}

/**
 * Union de plusieurs cadres — `null` ignorés, `null` si tout est vide.
 *
 * Un cadre est déroulé par son bord OUEST puis étendu de son amplitude réelle
 * (`lngSpanDeg`). Le réduire à ses deux coins ne suffirait pas : l'information
 * « ce cadre couvre tout l'intervalle entre west et east » se perdrait, et un
 * cadre large de 340° serait relu comme son complément de 20° — l'union d'un
 * cadre unique ne redonnerait alors même pas ce cadre.
 */
export function unionBounds(list: Iterable<Bounds | null | undefined>): Bounds | null {
  let north = -Infinity
  let south = Infinity
  let minLng = Infinity
  let maxLng = -Infinity
  let ref: number | null = null
  for (const b of list) {
    if (!b) continue
    if (![b.north, b.south, b.west, b.east].every(Number.isFinite)) continue
    north = Math.max(north, b.north)
    south = Math.min(south, b.south)
    ref ??= b.west
    const west = unwrapLng(b.west, ref)
    minLng = Math.min(minLng, west)
    maxLng = Math.max(maxLng, west + lngSpanDeg(b))
  }
  if (ref === null) return null
  // Union bouclant sur plus d'un tour : il n'y a plus d'emprise à distinguer.
  if (maxLng - minLng >= 360) return { north, south, west: -180, east: 180 }
  return { north, south, west: normalizeLng(minLng), east: normalizeLng(maxLng) }
}

/**
 * Cadre d'un disque géodésique (centre + rayon en mètres).
 *
 * SOURCE UNIQUE : `relations/core/geo.ts` exportait `boundsAround`, qui en est
 * désormais un alias. Les deux versions avaient déjà divergé (plancher de cosinus,
 * repli polaire) — deux fonctions publiques répondaient différemment pour le même
 * disque, celle des relations sélectionnant tout là où l'autre ne sélectionnait rien.
 */
export function boundsOfCircle(center: LatLng, radiusMeters: number): Bounds {
  const dLat = radiusMeters / M_PER_DEG
  // Près des pôles le cosinus s'effondre : borné pour ne pas produire un cadre infini.
  const cos = Math.max(Math.cos(center.lat * DEG2RAD), 1e-6)
  const dLng = radiusMeters / (M_PER_DEG * cos)
  const north = Math.min(90, center.lat + dLat)
  const south = Math.max(-90, center.lat - dLat)
  // Une amplitude qui fait le tour ne peut plus être décrite par un couple est/ouest :
  // le repli en cadre global évite un intervalle vide (est < ouest sans franchissement
  // réel), qui ne sélectionnerait plus RIEN au lieu de tout.
  if (dLng >= 180) return { north, south, west: -180, east: 180 }
  return {
    north,
    south,
    west: normalizeLng(center.lng - dLng),
    east: normalizeLng(center.lng + dLng),
  }
}

/**
 * Cadre du MONDE entier. `85` n'est pas décoratif : c'est la troncature de la
 * projection Web Mercator, au-delà de laquelle la latitude diverge.
 *
 * À passer à un regroupement ou à un inventaire qui ne doit RIEN filtrer par la vue :
 * en vue oblique, les bounds du viewport n'atteignent pas l'horizon, et un marker
 * lointain tomberait hors boîte alors qu'il est à l'écran.
 */
export const WORLD_BOUNDS: Bounds = { north: 85, south: -85, east: 180, west: -180 }

/**
 * Deux emprises se recoupent-elles ?
 *
 * ⚠️ Ne gère PAS le franchissement de l'antiméridien, contrairement à `boundsContains` :
 * les consommateurs sont des compteurs de diagnostic, pour qui un faux positif au bord du
 * ±180° est sans conséquence — là où l'inventaire de la loupe, lui, doit être exact.
 */
export function boundsIntersect(a: Bounds, b: Bounds): boolean {
  return !(a.east < b.west || a.west > b.east || a.south > b.north || a.north < b.south)
}
