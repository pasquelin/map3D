import { describe, expect, it } from 'vitest'
import type { MarkerData } from '../data/types'
import { ClusterRegistry, type ClusterContributor, type ClusterPlacement } from './ClusterRegistry'

const marker = (id: string): MarkerData => ({ id, type: 'alert', position: { lat: 48.86, lng: 2.34 }, data: null })

/** Couche de test : garde la trace de ce qu'on lui a demandé de poser. */
const contributor = (key: string, points: MarkerData[]) => {
  const received: ClusterPlacement[] = []
  const c: ClusterContributor = {
    key,
    points: () => points,
    idOf: (m) => m.id,
    place: (p) => received.push(p),
  }
  return { c, received }
}

const placement = (
  absorbed: string[] = [],
  moved: [string, { lat: number; lng: number }][] = [],
): ClusterPlacement => ({
  absorbed: new Set(absorbed),
  moved: new Map(moved),
})

describe('ClusterRegistry.allPoints', () => {
  it('préfixe par la clé de couche — deux couches peuvent porter le même id métier', () => {
    const registry = new ClusterRegistry()
    const a = contributor('alerts', [marker('1')])
    const b = contributor('symbols', [marker('1')])
    registry.register(a.c)
    registry.register(b.c)
    expect(registry.allPoints().map((p) => p.uid)).toEqual(['alerts/1', 'symbols/1'])
  })

  it('rend la couche d’origine avec chaque point', () => {
    const registry = new ClusterRegistry()
    const a = contributor('alerts', [marker('1')])
    registry.register(a.c)
    expect(registry.allPoints()[0]!.owner).toBe(a.c)
  })
})

describe('ClusterRegistry.place', () => {
  it('ne notifie pas une couche dont le placement n’a pas changé', () => {
    const registry = new ClusterRegistry()
    const a = contributor('alerts', [marker('1')])
    registry.register(a.c)

    registry.place(new Map([[a.c, placement(['1'])]]))
    expect(a.received).toHaveLength(1)

    // Même contenu, objets neufs : c'est le régime d'un pan où rien ne bouge, à ~11 Hz.
    registry.place(new Map([[a.c, placement(['1'])]]))
    expect(a.received).toHaveLength(1)
  })

  it('notifie au changement réel du contenu', () => {
    const registry = new ClusterRegistry()
    const a = contributor('alerts', [marker('1'), marker('2')])
    registry.register(a.c)

    registry.place(new Map([[a.c, placement(['1'])]]))
    registry.place(new Map([[a.c, placement(['2'])]]))
    expect(a.received).toHaveLength(2)
    expect([...a.received[1]!.absorbed]).toEqual(['2'])
  })

  it('distingue deux positions d’éventail au même id', () => {
    const registry = new ClusterRegistry()
    const a = contributor('alerts', [marker('1')])
    registry.register(a.c)

    registry.place(new Map([[a.c, placement([], [['1', { lat: 1, lng: 2 }]])]]))
    registry.place(new Map([[a.c, placement([], [['1', { lat: 1, lng: 3 }]])]]))
    expect(a.received).toHaveLength(2)
  })

  it('libère une couche absente de la table — sinon ses markers resteraient masqués', () => {
    const registry = new ClusterRegistry()
    const a = contributor('alerts', [marker('1')])
    registry.register(a.c)

    registry.place(new Map([[a.c, placement(['1'])]]))
    registry.place(new Map())
    expect(a.received).toHaveLength(2)
    expect(a.received[1]!.absorbed.size).toBe(0)
  })
})
