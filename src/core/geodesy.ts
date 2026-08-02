// Prédicats géométriques **géodésiques** (lat/lng, mètres).
//
// À ne pas confondre avec `layers/draw/hitTest.ts`, qui opère en coordonnées
// ÉCRAN : ses prédicats dépendent de la caméra, donc une forme jugée « dans les
// limites » changerait de verdict au pivot de vue. Les contraintes métier ont
// besoin d'un verdict stable, d'où ce module.

import type { LatLng } from '../shared'
import { DEG2RAD, EARTH_RADIUS_MEAN, M_PER_DEG, normalizeLng, TAU, unwrapLng } from './math'

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
  return Math.abs((total * EARTH_RADIUS_MEAN * EARTH_RADIUS_MEAN) / 2)
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
 * Le point est-il **strictement** à l'intérieur de l'anneau, bord EXCLU ? Anneau et
 * point sont supposés déjà déroulés sur un même axe de longitude (cf. `ringsOverlap`).
 * Miroir de `pointInRing` avec la garde inversée : un point sur une arête renvoie
 * `false`, pour qu'une zone posée bord à bord d'une autre reste adjacente et non
 * chevauchante.
 */
function pointStrictlyInside(p: LatLng, ring: readonly LatLng[]): boolean {
  const x = p.lng
  const y = p.lat
  let inside = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i]!
    const b = ring[j]!
    // Sur une arête (colinéaire ET dans sa bbox sur les deux axes) = contact, pas
    // recouvrement : on REJETTE là où `pointInRing` accepterait.
    const colinear = Math.abs((b.lng - a.lng) * (y - a.lat) - (x - a.lng) * (b.lat - a.lat)) < EDGE_EPS
    if (
      colinear &&
      x >= Math.min(a.lng, b.lng) - EDGE_EPS &&
      x <= Math.max(a.lng, b.lng) + EDGE_EPS &&
      y >= Math.min(a.lat, b.lat) - EDGE_EPS &&
      y <= Math.max(a.lat, b.lat) + EDGE_EPS
    ) {
      return false
    }
    if (a.lat > y !== b.lat > y) {
      const t = (y - a.lat) / (b.lat - a.lat)
      if (x < a.lng + t * (b.lng - a.lng)) inside = !inside
    }
  }
  return inside
}

/**
 * Les segments [a1,a2] et [b1,b2] se croisent-ils **franchement** (chaque segment a
 * les extrémités de l'autre de part et d'autre) ? Colinéaires et simples contacts
 * exclus. Pendant géodésique du test écran `segmentsIntersect` (`draw/hitTest.ts`) :
 * sur des points déjà déroulés le verdict est stable, indépendant de la caméra.
 */
function segCross(a1: LatLng, a2: LatLng, b1: LatLng, b2: LatLng): boolean {
  const o = (p: LatLng, q: LatLng, r: LatLng) => (q.lng - p.lng) * (r.lat - p.lat) - (q.lat - p.lat) * (r.lng - p.lng)
  const o1 = o(a1, a2, b1)
  const o2 = o(a1, a2, b2)
  const o3 = o(b1, b2, a1)
  const o4 = o(b1, b2, a2)
  return o1 * o2 < 0 && o3 * o4 < 0
}

/**
 * Deux anneaux **fermés** se chevauchent-ils en AIRE (et pas seulement au contact) ?
 *
 * Vrai si un sommet de l'un est **strictement** intérieur à l'autre, OU si une arête
 * de l'un croise franchement une arête de l'autre. Ce second cas capture la « croix »
 * (deux rectangles perpendiculaires dont aucun sommet ne tombe dans l'autre) — que
 * rate un test limité aux sommets.
 *
 * L'adjacence est **permise** : deux zones partageant une frontière ou un sommet ne
 * se chevauchent pas (contact au bord exclu, ici comme dans `segCross`). Les deux
 * anneaux sont déroulés autour d'une réf commune avant tout test planaire, pour ne
 * pas être faussés par le saut de longitude à ±180°.
 *
 * Limite connue : deux contours **exactement identiques** (ou partageant une arête
 * entière sans qu'aucun sommet ne tombe strictement dans l'autre) renvoient `false`.
 * Cas dégénéré, inatteignable par un geste manuel, laissé de côté pour ne pas
 * requalifier l'adjacence légitime en chevauchement.
 */
export function ringsOverlap(a: readonly LatLng[], b: readonly LatLng[]): boolean {
  if (a.length < 3 || b.length < 3) return false
  const ref = a[0]!.lng
  const au = unwrap(a, ref)
  const bu = unwrap(b, ref)
  for (const p of au) if (pointStrictlyInside(p, bu)) return true
  for (const p of bu) if (pointStrictlyInside(p, au)) return true
  for (let i = 0; i < au.length; i++) {
    const a1 = au[i]!
    const a2 = au[(i + 1) % au.length]!
    for (let j = 0; j < bu.length; j++) {
      if (segCross(a1, a2, bu[j]!, bu[(j + 1) % bu.length]!)) return true
    }
  }
  return false
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
 * Plancher du cosinus de latitude employé par `offsetLatLng` et les sites qui en
 * partagent la garde (`circleRing`) : au voisinage d'un pôle `1 / cos` diverge, ce
 * plancher échange une imprécision locale contre un résultat fini. Nommée pour
 * n'exister qu'une fois — les sites qui la dupliquaient en littéral divergeaient.
 */
export const OFFSET_COS_EPS = 1e-6

/**
 * Décale `center` de `northMeters` (nord signé) et `eastMeters` (est signé),
 * conversion équirectangulaire (`M_PER_DEG`, cf. son propre commentaire — valide
 * sous ~1 km, l'usage de tous les appelants).
 *
 * Ni la latitude renvoyée n'est bornée à ±90° ni la longitude ramenée dans
 * [-180, 180] : chaque appelant sait déjà s'il en a besoin (`circleRing` borne et
 * normalise lui-même) — le faire ici aurait dédoublé cette étape pour certains
 * appelants et l'aurait imposée à d'autres qui n'en veulent pas.
 *
 * N'A PAS pu remplacer `circleRing`/`Projection.sampleGroundHeight` : ces deux
 * précalculent leur delta degrés UNE fois hors boucle puis le multiplient par
 * angle (`dLat * cos(a)`), alors qu'un appel par angle recomposerait
 * `(radiusMeters * cos(a)) / M_PER_DEG` — même valeur réelle, ORDRE d'opérations
 * flottantes différent : vérifié, ~6 % des couples rayon/angle divergent du
 * dernier bit. Seul `ClusterLayer.spiderfyLayout`, qui multiplie déjà avant de
 * diviser, produit le MÊME ordre que cette fonction — c'est le seul site migré.
 */
export function offsetLatLng(center: LatLng, northMeters: number, eastMeters: number): LatLng {
  const cos = Math.max(Math.abs(Math.cos(center.lat * DEG2RAD)), OFFSET_COS_EPS)
  return {
    lat: center.lat + northMeters / M_PER_DEG,
    lng: center.lng + eastMeters / (M_PER_DEG * cos),
  }
}

/**
 * Approche un disque géodésique par un anneau de `segments` sommets. Sert à
 * ramener cercles et rayons au même modèle que les polygones, pour que les
 * prédicats n'aient qu'un seul type d'entrée à traiter.
 *
 * N'appelle PAS `offsetLatLng` : `dLat` est précalculé une fois puis multiplié par
 * angle, un ordre d'opérations flottantes que `offsetLatLng` ne reproduit pas
 * bit à bit (cf. son commentaire). Seule la garde cos est partagée (`OFFSET_COS_EPS`).
 */
export function circleRing(center: LatLng, radiusMeters: number, segments = PREDICATE_CIRCLE_SEGMENTS): LatLng[] {
  // `M_PER_DEG` et non `EARTH_RADIUS_MEAN` : c'est la conversion qu'emploie
  // `boundsOfCircle` pour le MÊME cercle. Deux rayons de référence différents
  // feraient sortir l'anneau de son propre cadre englobant (~0.1 % d'écart).
  const dLat = radiusMeters / M_PER_DEG
  // Près des pôles le cosinus s'effondre : borné pour ne pas produire un anneau
  // dégénéré large de plusieurs tours.
  const cos = Math.max(Math.cos(center.lat * DEG2RAD), OFFSET_COS_EPS)
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
