import { describe, expect, it } from 'vitest'
import { DEG2RAD, M_PER_DEG } from './math'
import {
  circleRing,
  OFFSET_COS_EPS,
  offsetLatLng,
  PREDICATE_CIRCLE_SEGMENTS,
  pointInRing,
  polygonAreaM2,
  predicateSegments,
  ringInsideRing,
} from './geodesy'

// Prédicats géodésiques : ils tranchent des contraintes MÉTIER (une zone est-elle dans son
// périmètre ?). Un faux négatif exclut un point visiblement dedans — le pire sens. Ces tests
// figent en particulier le bug corrigé des arêtes verticales de rectangle et l'invariant de
// densité de prédicat qui garde `pointInRing`/`ringInsideRing` du côté sûr.

// Carré unité en lat/lng, deux arêtes EXACTEMENT verticales (lng=0 et lng=1).
const SQUARE = [
  { lat: 0, lng: 0 },
  { lat: 1, lng: 0 },
  { lat: 1, lng: 1 },
  { lat: 0, lng: 1 },
]

describe('polygonAreaM2', () => {
  it('vaut 0 en deçà de 3 sommets', () => {
    expect(
      polygonAreaM2([
        { lat: 0, lng: 0 },
        { lat: 1, lng: 1 },
      ]),
    ).toBe(0)
  })

  it("mesure l'aire d'un petit carré équatorial à ~côté² près", () => {
    // 0,01° ≈ 1112 m à l'équateur → aire attendue ~1,24e6 m² (comparable à computeArea).
    const a = polygonAreaM2([
      { lat: 0, lng: 0 },
      { lat: 0, lng: 0.01 },
      { lat: 0.01, lng: 0.01 },
      { lat: 0.01, lng: 0 },
    ])
    expect(a).toBeGreaterThan(1.2e6)
    expect(a).toBeLessThan(1.27e6)
  })

  it('est indépendante du sens de parcours (valeur absolue)', () => {
    const forward = polygonAreaM2(SQUARE)
    const reversed = polygonAreaM2([...SQUARE].reverse())
    // Tolérance RELATIVE : seule l'égalité des deux aires compte, pas leur magnitude
    // (~1,2e10 m²) — un `toBeCloseTo` absolu exigerait une égalité quasi bit-à-bit et
    // casserait sur une simple reformulation de la somme (Kahan…).
    expect(reversed / forward).toBeCloseTo(1, 6)
  })
})

describe('pointInRing', () => {
  it('distingue dedans et dehors', () => {
    expect(pointInRing({ lat: 0.5, lng: 0.5 }, SQUARE)).toBe(true)
    expect(pointInRing({ lat: 0.5, lng: 2 }, SQUARE)).toBe(false)
  })

  it("REJETTE un point aligné sur le prolongement d'une arête verticale (régression rect)", () => {
    // lng=0 tombe pile sur l'arête ouest, mais lat=5 est loin au nord : hors du carré.
    // Le bug historique le déclarait « sur le bord » (colinéarité en longitude seule).
    expect(pointInRing({ lat: 5, lng: 0 }, SQUARE)).toBe(false)
  })

  it('ACCEPTE un point exactement sur un bord ou un sommet (aimantation à la limite)', () => {
    expect(pointInRing({ lat: 0.5, lng: 0 }, SQUARE)).toBe(true) // milieu de l'arête ouest
    expect(pointInRing({ lat: 0, lng: 0 }, SQUARE)).toBe(true) // sommet
  })

  it('rend false sous 3 sommets', () => {
    expect(pointInRing({ lat: 0, lng: 0 }, [{ lat: 0, lng: 0 }])).toBe(false)
  })
})

describe('ringInsideRing', () => {
  it('vrai quand tous les sommets de inner sont dans outer', () => {
    const inner = [
      { lat: 0.2, lng: 0.2 },
      { lat: 0.2, lng: 0.8 },
      { lat: 0.8, lng: 0.8 },
      { lat: 0.8, lng: 0.2 },
    ]
    expect(ringInsideRing(inner, SQUARE)).toBe(true)
  })

  it('faux dès qu’un sommet de inner sort de outer', () => {
    const poking = [
      { lat: 0.2, lng: 0.2 },
      { lat: 0.2, lng: 1.5 }, // dépasse à l'est
      { lat: 0.8, lng: 0.8 },
    ]
    expect(ringInsideRing(poking, SQUARE)).toBe(false)
    expect(ringInsideRing([], SQUARE)).toBe(false)
  })
})

describe('predicateSegments', () => {
  it("n'est JAMAIS plus grossier que la densité plancher (garde l'invariant)", () => {
    // Un hôte réglant le rendu sous 64 ne doit pas dégrader la précision des prédicats.
    expect(predicateSegments(48)).toBe(PREDICATE_CIRCLE_SEGMENTS)
    expect(predicateSegments(PREDICATE_CIRCLE_SEGMENTS)).toBe(PREDICATE_CIRCLE_SEGMENTS)
  })

  it('suit la densité de rendu quand elle dépasse le plancher', () => {
    // Dérivé du plancher, pas un littéral : reste valide si `PREDICATE_CIRCLE_SEGMENTS` monte.
    const above = PREDICATE_CIRCLE_SEGMENTS * 2
    expect(predicateSegments(above)).toBe(above)
  })
})

describe('circleRing', () => {
  it('produit `segments` sommets tenant dans l’enveloppe latitudinale du disque', () => {
    const ring = circleRing({ lat: 0, lng: 0 }, 10_000, 32)
    expect(ring).toHaveLength(32)
    const dLat = 10_000 / M_PER_DEG
    for (const p of ring) expect(Math.abs(p.lat)).toBeLessThanOrEqual(dLat + 1e-9)
  })

  it('borne les latitudes aux pôles pour un grand rayon', () => {
    for (const p of circleRing({ lat: 89.9, lng: 0 }, 100_000)) {
      expect(p.lat).toBeLessThanOrEqual(90)
      expect(p.lat).toBeGreaterThanOrEqual(-90)
    }
  })
})

// `offsetLatLng` centralise l'idiome « décaler une lat/lng de N mètres », réimplémenté
// jusqu'ici site par site avec une garde cos anti-pôle incohérente (présente ici,
// absente ailleurs). Zéro régression exigée aux latitudes non polaires : la garde ne
// doit JAMAIS s'activer hors du voisinage immédiat d'un pôle.
describe('offsetLatLng', () => {
  it.each([0, 45, 60, -60])('identique à la formule non gardée à lat=%i° (cos non clampé)', (lat) => {
    const center = { lat, lng: 4.5 }
    const north = 250
    const east = -80
    const cos = Math.cos(lat * DEG2RAD)
    // Garde-fou du test lui-même : à ces latitudes, la garde ne doit pas s'activer.
    expect(Math.abs(cos)).toBeGreaterThan(OFFSET_COS_EPS)
    const expected = {
      lat: center.lat + north / M_PER_DEG,
      lng: center.lng + east / (M_PER_DEG * cos),
    }
    const got = offsetLatLng(center, north, east)
    expect(got.lat).toBe(expected.lat)
    expect(got.lng).toBe(expected.lng)
  })

  it('nord/est nuls laissent le centre inchangé, bit à bit', () => {
    const center = { lat: 37.5, lng: -12.25 }
    expect(offsetLatLng(center, 0, 0)).toEqual(center)
  })

  /**
   * Au pôle, `1 / cos` diverge : sans garde, `lng` part à ±Infinity/NaN. C'est le SEUL
   * changement de comportement toléré par cette centralisation — corrige les sites qui
   * ne clampaient pas (`Projection.sampleGroundHeight`, `ClusterLayer.spiderfyLayout`).
   */
  it('reste fini au voisinage immédiat du pôle, grâce à la garde', () => {
    const p = offsetLatLng({ lat: 90, lng: 0 }, 100, 100)
    expect(Number.isFinite(p.lat)).toBe(true)
    expect(Number.isFinite(p.lng)).toBe(true)
  })

  it('la garde borne exactement à `OFFSET_COS_EPS`, pas à une autre valeur', () => {
    // cos(90°) = 0 exactement (à l'epsilon flottant de Math.cos près) : la longitude
    // décalée doit correspondre au plancher `OFFSET_COS_EPS`, ni plus large ni plus étroite.
    const east = 111.32 // 1e-3° * M_PER_DEG, pour un delta lisible
    const p = offsetLatLng({ lat: 90, lng: 0 }, 0, east)
    expect(p.lng).toBeCloseTo(east / (M_PER_DEG * OFFSET_COS_EPS), 6)
  })
})
