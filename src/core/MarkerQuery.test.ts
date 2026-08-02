import { describe, expect, it } from 'vitest'
import type { MarkerData } from '../data/types'
import { boundsContains, MarkerRegistry, type MarkerProvider } from './MarkerQuery'

const at = (lat: number, lng: number): MarkerData => ({
  id: `${lat},${lng}`,
  type: 'x',
  position: { lat, lng },
  data: undefined,
})

describe('boundsContains', () => {
  it('encadre la latitude et la longitude', () => {
    const b = { north: 10, south: 0, east: 10, west: 0 }
    expect(boundsContains(b, { lat: 5, lng: 5 })).toBe(true)
    expect(boundsContains(b, { lat: -1, lng: 5 })).toBe(false)
    expect(boundsContains(b, { lat: 5, lng: 11 })).toBe(false)
  })

  it('gère le franchissement de l’antiméridien (east < west)', () => {
    const b = { north: 10, south: -10, east: -170, west: 170 }
    expect(boundsContains(b, { lat: 0, lng: 175 })).toBe(true)
    expect(boundsContains(b, { lat: 0, lng: -175 })).toBe(true)
    expect(boundsContains(b, { lat: 0, lng: 0 })).toBe(false)
  })
})

describe('MarkerRegistry.hiddenByZoom', () => {
  it('false quand aucun fournisseur ne connaît l’id (jamais masqué par défaut)', () => {
    const reg = new MarkerRegistry()
    reg.register({ hiddenByZoom: () => null })
    expect(reg.hiddenByZoom('inconnu')).toBe(false)
  })

  it('false quand le fournisseur le déclare rendu', () => {
    const reg = new MarkerRegistry()
    reg.register({ hiddenByZoom: (id) => (id === 'a' ? false : null) })
    expect(reg.hiddenByZoom('a')).toBe(false)
  })

  it('true dès qu’un fournisseur le déclare masqué', () => {
    const reg = new MarkerRegistry()
    reg.register({ hiddenByZoom: (id) => (id === 'a' ? true : null) })
    expect(reg.hiddenByZoom('a')).toBe(true)
  })

  it('OR entre fournisseurs : un seul « masqué » suffit', () => {
    const reg = new MarkerRegistry()
    reg.register({ hiddenByZoom: () => false })
    reg.register({ hiddenByZoom: (id) => (id === 'a' ? true : null) })
    expect(reg.hiddenByZoom('a')).toBe(true)
  })

  it('un fournisseur sans hiddenByZoom ne fait pas planter l’agrégat', () => {
    const reg = new MarkerRegistry()
    const bare: MarkerProvider = { markersInBounds: () => [at(0, 0)] }
    reg.register(bare)
    reg.register({ hiddenByZoom: (id) => (id === 'a' ? true : null) })
    expect(reg.hiddenByZoom('a')).toBe(true)
    expect(reg.hiddenByZoom('b')).toBe(false)
  })
})
