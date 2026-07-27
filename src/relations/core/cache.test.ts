import { describe, expect, it } from 'vitest'
import type { RoutingCacheConfig } from '../../config/types'
import { RouteCache } from './cache'
import type { MapPoint } from './types'

const cfg = (over: Partial<RoutingCacheConfig> = {}): RoutingCacheConfig => ({
  ttlMs: 1000,
  cellMeters: 150,
  maxEntries: 3,
  ...over,
})

const point = (id: string, lat = 48.85, lng = 2.35): MapPoint => ({ id, lat, lng, tags: [] })

describe('RouteCache', () => {
  it('rend ce qu’on lui a confié', () => {
    const c = new RouteCache(cfg())
    const k = c.key('a', point('b'), 'DRIVE')
    c.set(k, { duration: 42 })
    expect(c.get(k)).toEqual({ duration: 42 })
  })

  it('oublie une entrée expirée', () => {
    let now = 0
    const c = new RouteCache(cfg({ ttlMs: 100 }), () => now)
    const k = c.key('a', point('b'), 'DRIVE')
    c.set(k, 1)
    now = 101
    expect(c.get(k)).toBeNull()
  })

  it('donne la même clé à deux positions de la même cellule', () => {
    // C'est la raison d'être de la quantification : un marker qui frémit de quelques
    // mètres ne doit pas déclencher un appel de routage facturé.
    const c = new RouteCache(cfg())
    expect(c.key('a', point('b', 48.85, 2.35), 'DRIVE')).toBe(c.key('a', point('b', 48.8501, 2.3501), 'DRIVE'))
  })

  it('donne des clés différentes à deux cellules distinctes', () => {
    const c = new RouteCache(cfg())
    expect(c.key('a', point('b', 48.85, 2.35), 'DRIVE')).not.toBe(c.key('a', point('b', 48.9, 2.35), 'DRIVE'))
  })

  it('distingue le mode de transport', () => {
    const c = new RouteCache(cfg())
    expect(c.key('a', point('b'), 'DRIVE')).not.toBe(c.key('a', point('b'), 'WALK'))
  })

  it('reste borné : un marker mobile ne fait pas croître la table indéfiniment', () => {
    // La clé embarque la position, donc un marker qui se déplace crée une clé neuve à
    // chaque cellule franchie. Ces clés ne seront jamais relues, donc jamais purgées
    // par la voie paresseuse de `get` — sans plafond, la table grossit sans fin sur une
    // session de supervision longue.
    const c = new RouteCache(cfg({ maxEntries: 3 }))
    for (let i = 0; i < 50; i++) c.set(`k${i}`, i)
    // La plus ancienne est partie, la plus récente est là.
    expect(c.get('k0')).toBeNull()
    expect(c.get('k49')).toBe(49)
  })
})
