import { describe, expect, it } from 'vitest'
import { type MarkerData, markerTags, staticMinZoomOf } from './types'

const marker = (over: Partial<MarkerData> = {}): MarkerData => ({
  id: 'm',
  type: 'defib',
  position: { lat: 48.86, lng: 2.34 },
  data: null,
  ...over,
})

describe('staticMinZoomOf', () => {
  it('rend null pour un marker ordinaire', () => {
    expect(staticMinZoomOf(marker(), 13)).toBeNull()
    // `false` explicite compte comme « pas du décor », pas comme un seuil de 0.
    expect(staticMinZoomOf(marker({ static: false }), 13)).toBeNull()
  })

  it('retombe sur le seuil de la config avec `true`', () => {
    expect(staticMinZoomOf(marker({ static: true }), 13)).toBe(13)
  })

  it('laisse le marker imposer le sien', () => {
    // Tout le décor ne se lit pas à la même distance : une gare avant une borne.
    expect(staticMinZoomOf(marker({ static: { minZoom: 11 } }), 13)).toBe(11)
    expect(staticMinZoomOf(marker({ static: { minZoom: 16 } }), 13)).toBe(16)
  })

  it('accepte 0 comme « jamais masqué », même si la config masque', () => {
    expect(staticMinZoomOf(marker({ static: { minZoom: 0 } }), 13)).toBe(0)
  })
})

describe('markerTags', () => {
  it('retombe sur `marker` + type quand rien n’est déclaré', () => {
    // Sans ce défaut, un marker sans tags disparaîtrait dès qu'un filtre est actif.
    expect(markerTags(marker())).toEqual(['marker', 'defib'])
  })
})
