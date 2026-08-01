import { describe, expect, it } from 'vitest'
import type { Bounds } from '../shared'
import { boundsIntersect, boundsOfCircle, boundsOfLatLngs, centerOfBounds, lngSpanDeg, unionBounds } from './bounds'

// Toute la logique d'antiméridien de la lib passe ici. Une régression est SILENCIEUSE :
// un cadre qui « fait le tour du globe » au lieu de 5° ne se voit qu'au bord du ±180°, et
// c'est là que la caméra vise le néant ou que l'inventaire sélectionne tout / rien.

describe('lngSpanDeg', () => {
  it('amplitude directe quand est >= ouest', () => {
    expect(lngSpanDeg({ north: 1, south: 0, west: -170, east: 170 })).toBe(340)
  })

  it("distingue un cadre qui FRANCHIT l'antiméridien (Fidji : 176.8 → -178)", () => {
    // east < west → +360 : 5.2°, pas -354.8° comme le ferait un east - west naïf.
    expect(lngSpanDeg({ north: 1, south: 0, west: 176.8, east: -178 })).toBeCloseTo(5.2, 6)
  })
})

describe('centerOfBounds', () => {
  it("place le centre du bon côté de l'antiméridien", () => {
    const c = centerOfBounds({ north: 2, south: -2, west: 176.8, east: -178 })
    expect(c.lat).toBe(0)
    // Milieu de Fidji : 176.8 + 2.6 = 179.4, et non 0 (le milieu naïf de west/east).
    expect(c.lng).toBeCloseTo(179.4, 6)
  })
})

describe('boundsOfLatLngs', () => {
  it('renvoie null pour une liste vide ou sans coordonnée finie', () => {
    expect(boundsOfLatLngs([])).toBeNull()
    expect(boundsOfLatLngs([{ lat: NaN, lng: 10 }])).toBeNull()
  })

  it('ignore les points non finis sans empoisonner le cadre', () => {
    const b = boundsOfLatLngs([
      { lat: 10, lng: 20 },
      { lat: NaN, lng: 999 },
      { lat: 12, lng: 22 },
    ])!
    expect(b.north).toBe(12)
    expect(b.south).toBe(10)
  })

  it('déroule les longitudes autour du ±180° au lieu de faire le tour du globe', () => {
    // Deux points de part et d'autre de l'antiméridien → cadre étroit, pas 358°.
    const b = boundsOfLatLngs([
      { lat: 0, lng: 179 },
      { lat: 0, lng: -179 },
    ])!
    expect(lngSpanDeg(b)).toBeCloseTo(2, 6)
  })
})

describe('unionBounds', () => {
  it('ignore les entrées null et rend null si tout est vide', () => {
    expect(unionBounds([null, undefined])).toBeNull()
  })

  it("redonne un cadre unique à l'identique (l'amplitude n'est pas perdue)", () => {
    const b: Bounds = { north: 10, south: -10, west: -170, east: 170 }
    const u = unionBounds([b])!
    // Un cadre large de 340° ne doit pas être relu comme son complément de 20°.
    expect(lngSpanDeg(u)).toBeCloseTo(340, 6)
  })

  it('replie sur le cadre global une union qui boucle sur plus de 360°', () => {
    const u = unionBounds([
      { north: 1, south: 0, west: -180, east: -60 },
      { north: 1, south: 0, west: -60, east: 60 },
      { north: 1, south: 0, west: 60, east: 180 },
    ])!
    expect(u.west).toBe(-180)
    expect(u.east).toBe(180)
  })
})

describe('boundsOfCircle', () => {
  it('un petit disque produit un cadre encadrant, centré', () => {
    const b = boundsOfCircle({ lat: 0, lng: 0 }, 1000)
    expect(b.north).toBeGreaterThan(0)
    expect(b.south).toBeLessThan(0)
    expect(b.east).toBeGreaterThan(0)
    expect(b.west).toBeLessThan(0)
  })

  it('replie sur le cadre global quand le rayon fait plus d’un demi-tour en longitude', () => {
    // Rayon énorme près du pôle : dLng >= 180 → global plutôt qu'un intervalle vide.
    const b = boundsOfCircle({ lat: 89, lng: 0 }, 5_000_000)
    expect(b.west).toBe(-180)
    expect(b.east).toBe(180)
  })

  it('borne les latitudes aux pôles', () => {
    const b = boundsOfCircle({ lat: 89.9, lng: 0 }, 100_000)
    expect(b.north).toBeLessThanOrEqual(90)
  })
})

describe('boundsIntersect', () => {
  it('détecte recoupement et disjonction (sans gérer l’antiméridien, par contrat)', () => {
    const a: Bounds = { north: 10, south: 0, west: 0, east: 10 }
    expect(boundsIntersect(a, { north: 5, south: 2, west: 5, east: 15 })).toBe(true)
    expect(boundsIntersect(a, { north: 10, south: 0, west: 20, east: 30 })).toBe(false)
    expect(boundsIntersect(a, { north: 30, south: 20, west: 0, east: 10 })).toBe(false)
  })
})
