// Prédicats géométriques **géodésiques** (lat/lng, mètres).
//
// À ne pas confondre avec `layers/draw/hitTest.ts`, qui opère en coordonnées
// ÉCRAN : ses prédicats dépendent de la caméra, donc une forme jugée « dans les
// limites » changerait de verdict au pivot de vue. Les contraintes métier ont
// besoin d'un verdict stable, d'où ce module.

import type { LatLng } from '../shared'
import { DEG2RAD, M_PER_DEG, normalizeLng, TAU, unwrapLng } from './math'

/** Rayon moyen terrestre (m) — sphère de référence des calculs d'aire. */
const EARTH_RADIUS = 6_371_008.8

/**
 * Tolérance des tests de bord, en degrés (~1e-9° ≈ 0.1 mm) : une forme aimantée
 * sur une limite ne doit pas être rejetée pour un arrondi flottant.
 */
const EDGE_EPS = 1e-9

/**
 * Déroule les longitudes d'un anneau sur un axe continu ancré sur `refLng`, pour
 * que les tests planaires (ray casting) ne soient pas faussés par le saut à ±180°.
 */
function unwrap(ring: readonly LatLng[], refLng: number): LatLng[] {
  return ring.map((p) => ({ lat: p.lat, lng: unwrapLng(p.lng, refLng) }))
}

/**
 * Aire d'un polygone géodésique (m²), par excès sphérique
 * (Chamberlain & Duquette) — la même méthode que `google.maps.geometry.spherical
 * .computeArea`, donc des valeurs comparables à celles de l'ancienne carte.
 *
 * L'anneau est supposé fermé implicitement (dernier point relié au premier) et
 * simple : une aire n'a pas de sens sur un contour qui se recoupe.
 */
export function polygonAreaM2(ring: readonly LatLng[]): number {
  if (ring.length < 3) return 0
  const pts = unwrap(ring, ring[0]!.lng)
  let total = 0
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i]!
    const b = pts[(i + 1) % pts.length]!
    total += (b.lng - a.lng) * DEG2RAD * (2 + Math.sin(a.lat * DEG2RAD) + Math.sin(b.lat * DEG2RAD))
  }
  return Math.abs((total * EARTH_RADIUS * EARTH_RADIUS) / 2)
}

/**
 * Le point est-il dans l'anneau ? Ray casting sur (lng, lat), longitudes déroulées
 * autour du point testé. Les points exactement sur un bord sont **acceptés** : une
 * forme dessinée en s'aimantant à la limite ne doit pas être rejetée pour un
 * arrondi flottant.
 */
export function pointInRing(p: LatLng, ring: readonly LatLng[]): boolean {
  if (ring.length < 3) return false
  const pts = unwrap(ring, p.lng)
  const x = p.lng
  const y = p.lat
  let inside = false
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const a = pts[i]!
    const b = pts[j]!
    // Sur le bord = colinéaire à l'arête ET dans sa boîte englobante, sur les DEUX
    // axes. Se contenter de la longitude déclarerait « dedans » tout point aligné
    // avec le PROLONGEMENT d'une arête verticale : le produit vectoriel s'y annule
    // quelle que soit la latitude. Or un périmètre rectangulaire (`ringOfShape`
    // d'un `rect`) a justement deux arêtes exactement verticales — un point très
    // au nord de la limite passait donc la contrainte.
    const colinear = Math.abs((b.lng - a.lng) * (y - a.lat) - (x - a.lng) * (b.lat - a.lat)) < EDGE_EPS
    if (
      colinear &&
      x >= Math.min(a.lng, b.lng) - EDGE_EPS &&
      x <= Math.max(a.lng, b.lng) + EDGE_EPS &&
      y >= Math.min(a.lat, b.lat) - EDGE_EPS &&
      y <= Math.max(a.lat, b.lat) + EDGE_EPS
    ) {
      return true
    }
    if (a.lat > y !== b.lat > y) {
      const t = (y - a.lat) / (b.lat - a.lat)
      if (x < a.lng + t * (b.lng - a.lng)) inside = !inside
    }
  }
  return inside
}

/**
 * `inner` est-il entièrement contenu dans `outer` ?
 *
 * Le test porte sur les **sommets** de `inner` : c'est une approximation, exacte
 * pour des contours convexes et suffisante en pratique pour une zone dessinée à
 * l'intérieur d'un périmètre (le cas métier). Elle laisserait passer un contour
 * concave dont une arête sort entre deux sommets — accepter ce cas coûterait un
 * test d'intersection arête à arête, pour un gain nul sur des limites réelles.
 * Densifiez `inner` (cf. `circleRing`) si la précision doit être meilleure.
 */
export function ringInsideRing(inner: readonly LatLng[], outer: readonly LatLng[]): boolean {
  if (inner.length === 0 || outer.length < 3) return false
  return inner.every((p) => pointInRing(p, outer))
}

/**
 * Densité d'approximation d'un disque pour les **prédicats géométriques** (aire,
 * inclusion, intersection).
 *
 * Distincte de `performance.circleSegments`, qui règle le RENDU : la rendre
 * configurable exposerait un réglage capable de changer une réponse booléenne, là où
 * côté rendu il ne change qu'un lissé.
 *
 * INVARIANT : elle ne doit JAMAIS être plus grossière que la densité de rendu. Un
 * polygone régulier inscrit rétrécit quand on lui retire des sommets ; tester avec
 * moins de segments qu'on n'en dessine rend donc « hors zone » un point visiblement
 * à l'intérieur — un faux négatif, le pire sens pour une contrainte de périmètre.
 * D'où 64 et non 48 : la valeur suit le défaut de rendu, elle ne le précède pas.
 */
export const PREDICATE_CIRCLE_SEGMENTS = 64

/**
 * Densité de prédicat à employer face à une densité de RENDU donnée.
 *
 * Fait tenir l'invariant ci-dessus au lieu de seulement l'énoncer : il était
 * documenté mais non gardé, si bien qu'un hôte réglant `performance.circleSegments`
 * au-dessus de 64 obtenait des faux négatifs d'inclusion — silencieusement, et
 * précisément dans le sens qui exclut un point visiblement dans la zone.
 */
export function predicateSegments(renderSegments: number): number {
  return Math.max(PREDICATE_CIRCLE_SEGMENTS, Math.ceil(renderSegments))
}

/**
 * Approche un disque géodésique par un anneau de `segments` sommets. Sert à
 * ramener cercles et rayons au même modèle que les polygones, pour que les
 * prédicats n'aient qu'un seul type d'entrée à traiter.
 */
export function circleRing(center: LatLng, radiusMeters: number, segments = PREDICATE_CIRCLE_SEGMENTS): LatLng[] {
  // `M_PER_DEG` et non `EARTH_RADIUS` : c'est la conversion qu'emploie
  // `boundsOfCircle` pour le MÊME cercle. Deux rayons de référence différents
  // feraient sortir l'anneau de son propre cadre englobant (~0.1 % d'écart).
  const dLat = radiusMeters / M_PER_DEG
  // Près des pôles le cosinus s'effondre : borné pour ne pas produire un anneau
  // dégénéré large de plusieurs tours.
  const cos = Math.max(Math.cos(center.lat * DEG2RAD), 1e-6)
  const out: LatLng[] = []
  for (let i = 0; i < segments; i++) {
    const a = (i / segments) * TAU
    out.push({
      // Latitude bornée : un grand rayon près d'un pôle produirait sinon des
      // sommets au-delà de ±90°, que les prédicats planaires traiteraient comme
      // des points bien réels au lieu d'un débordement.
      lat: Math.max(-90, Math.min(90, center.lat + dLat * Math.cos(a))),
      lng: normalizeLng(center.lng + (dLat / cos) * Math.sin(a)),
    })
  }
  return out
}
