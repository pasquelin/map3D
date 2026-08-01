import { describe, expect, it } from 'vitest'
import { EARTH_CIRCUMFERENCE } from '../../core/math'
import { bearingDeg, destinationPoint, fanLegs, greatCirclePoints, haversineMeters, quantizeKey } from './geo'

// Seule implémentation de haversine / grand cercle du dépôt : le rendu des liens drapés en
// dépend (un lien tracé en un seul segment traverserait le relief). Toute dérive ici est
// invisible tant qu'on ne mesure pas — d'où ces ancres numériques vérifiables.

describe('haversineMeters', () => {
  it('un degré de latitude vaut la circonférence / 360', () => {
    // À l'équateur comme ailleurs, 1° de latitude = 1/360 de la circonférence méridienne.
    const d = haversineMeters({ lat: 0, lng: 0 }, { lat: 1, lng: 0 })
    expect(Math.abs(d - EARTH_CIRCUMFERENCE / 360)).toBeLessThan(1)
  })

  it('vaut 0 sur un point confondu et reste symétrique', () => {
    const a = { lat: 48.85, lng: 2.35 }
    const b = { lat: 51.5, lng: -0.13 }
    expect(haversineMeters(a, a)).toBe(0)
    expect(haversineMeters(a, b)).toBeCloseTo(haversineMeters(b, a), 6)
  })
})

describe('bearingDeg', () => {
  it('plein nord = 0°, plein est = 90°, plein sud = 180° (plage [0, 360))', () => {
    expect(bearingDeg({ lat: 0, lng: 0 }, { lat: 1, lng: 0 })).toBeCloseTo(0, 6)
    expect(bearingDeg({ lat: 0, lng: 0 }, { lat: 0, lng: 1 })).toBeCloseTo(90, 6)
    expect(bearingDeg({ lat: 1, lng: 0 }, { lat: -1, lng: 0 })).toBeCloseTo(180, 6)
  })
})

describe('greatCirclePoints', () => {
  it('commence et finit exactement sur a et b', () => {
    const a = { lat: 40, lng: -3 }
    const b = { lat: 52, lng: 13 }
    const pts = greatCirclePoints(a, b, 50_000)
    expect(pts[0]!.lat).toBeCloseTo(a.lat, 6)
    expect(pts[0]!.lng).toBeCloseTo(a.lng, 6)
    expect(pts.at(-1)!.lat).toBeCloseTo(b.lat, 6)
    expect(pts.at(-1)!.lng).toBeCloseTo(b.lng, 6)
  })

  it("échantillonne l'équateur à plat (le grand cercle de deux points équatoriaux)", () => {
    const pts = greatCirclePoints({ lat: 0, lng: 0 }, { lat: 0, lng: 10 }, 200_000)
    expect(pts.length).toBeGreaterThan(2)
    for (const p of pts) expect(Math.abs(p.lat)).toBeLessThan(1e-6)
  })

  it('des points confondus dégénèrent en [a, b] sans division par zéro', () => {
    const a = { lat: 12, lng: 34 }
    expect(greatCirclePoints(a, { ...a }, 1000)).toEqual([a, { ...a }])
  })

  it('plafonne le nombre de pas à maxSteps', () => {
    // Distance énorme + pas minuscule : sans plafond, des millions de segments.
    const pts = greatCirclePoints({ lat: -80, lng: 0 }, { lat: 80, lng: 179 }, 1, 8)
    expect(pts.length).toBeLessThanOrEqual(9)
  })
})

describe('fanLegs', () => {
  it("s'ouvre à l'opposé du tronc et reste symétrique", () => {
    // Tronc 0° → centre de l'éventail à 180° ; 3 pattes sur 60° → 150/180/210.
    expect(fanLegs(0, 3, 60)).toEqual([150, 180, 210])
  })

  it('une patte unique part droit dans l’axe opposé au tronc', () => {
    expect(fanLegs(10, 1, 90)).toEqual([190])
    expect(fanLegs(0, 0, 90)).toEqual([])
  })

  it('ramène toujours les azimuts dans [0, 360)', () => {
    // Tronc 180 → centre 0 → pattes à -30/+30 repliées en 330/30.
    expect(fanLegs(180, 2, 60)).toEqual([330, 30])
  })
})

describe('destinationPoint', () => {
  it('est l’inverse de haversine + bearing (aller-retour cohérent)', () => {
    const from = { lat: 48.85, lng: 2.35 }
    const to = destinationPoint(from, 45, 5000)
    expect(haversineMeters(from, to)).toBeCloseTo(5000, 2)
    expect(bearingDeg(from, to)).toBeCloseTo(45, 3)
  })
})

describe('quantizeKey', () => {
  it('donne la même clé à deux points de la même cellule, une autre au-delà', () => {
    const p = { lat: 48.0, lng: 2.0 }
    const key = quantizeKey(p, 1000)
    // ~1 m de décalage : même cellule → cache réutilisé.
    expect(quantizeKey({ lat: 48.000005, lng: 2.000005 }, 1000)).toBe(key)
    // ~2 km de décalage en latitude : cellule franchie → cache invalidé.
    expect(quantizeKey({ lat: 48.02, lng: 2.0 }, 1000)).not.toBe(key)
  })

  it('resserre le pas de longitude avec la latitude (cosinus)', () => {
    const key = quantizeKey({ lat: 80, lng: 0 }, 1000)
    // À 80°, un degré de longitude ≈ 19 km : 0,008° (~155 m réels) reste dans la même
    // cellule. Sans le facteur cos(lat), ce Δ serait lu comme ~890 m et franchirait la
    // cellule — l'assertion échouerait donc si le cosinus disparaissait de `quantizeKey`.
    expect(quantizeKey({ lat: 80, lng: 0.008 }, 1000)).toBe(key)
  })
})
