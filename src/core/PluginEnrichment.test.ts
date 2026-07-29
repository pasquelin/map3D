import { describe, expect, it, vi } from 'vitest'
import type { BuildingHit } from './MapEngine'
import { PluginEnrichment } from './PluginEnrichment'
import { PluginRegistry } from './PluginRegistry'
import type { AnyPlugin } from '../plugins/types'
import { defaultPluginFetchPolicy } from '../plugins/fetchPolicy'

// Faux moteur : bus d'events 'buildingclick' + tags stub (report/isActive/isVisible/onSelection).
function fakeEngine() {
  const cbs = new Set<(p: { hit: BuildingHit }) => void>()
  const tags = {
    report: vi.fn(),
    isActive: false,
    isVisible: () => true,
    onSelection: () => () => {},
  }
  const engine = {
    tags,
    on: (_e: 'buildingclick', cb: (p: { hit: BuildingHit }) => void) => {
      cbs.add(cb)
      return () => cbs.delete(cb)
    },
    fire: (hit: BuildingHit) => cbs.forEach((cb) => cb({ hit })),
  }
  return engine
}

const hit = {
  ref: { tileKey: 't', index: 0 },
  info: { featureId: 1, lat: 0, lng: 0, height: 0, minHeight: 0, props: {}, bounds: {} },
} as unknown as BuildingHit

const enricher = (id: string, impl: AnyPlugin['enrichBuilding']): AnyPlugin => ({
  meta: { id, name: id, icon: 'M', version: '1.0.0' },
  enrichBuilding: impl,
})

describe('PluginEnrichment', () => {
  it('buildingclick → loading puis data (plugin activé)', async () => {
    const engine = fakeEngine()
    const reg = new PluginRegistry(null)
    reg.register(enricher('a', async () => ({ attrs: { hauteur: 12 } })))
    reg.setEnabled('a', true)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const enr = new PluginEnrichment(engine as any, reg, defaultPluginFetchPolicy)
    engine.fire(hit)
    expect(enr.get('a').loading).toBe(true)
    await Promise.resolve()
    await Promise.resolve()
    expect(enr.get('a').loading).toBe(false)
    expect(enr.get('a').data).toEqual({ hauteur: 12 })
    expect(enr.get('a').tags).toEqual(['a'])
  })

  it('plugin désactivé → ignoré', async () => {
    const engine = fakeEngine()
    const reg = new PluginRegistry(null)
    reg.register(enricher('a', async () => ({ attrs: { x: 1 } })))
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const enr = new PluginEnrichment(engine as any, reg, defaultPluginFetchPolicy)
    engine.fire(hit)
    await Promise.resolve()
    expect(enr.get('a').loading).toBe(false)
    expect(enr.get('a').data).toBeNull()
  })

  it('reclic → abort du pick précédent (le résultat obsolète est jeté)', async () => {
    const engine = fakeEngine()
    const reg = new PluginRegistry(null)
    let resolveFirst: (v: { attrs: Record<string, unknown> }) => void = () => {}
    let call = 0
    reg.register(
      enricher('a', (_hit, _ctx) => {
        call++
        if (call === 1) return new Promise((res) => (resolveFirst = res))
        return Promise.resolve({ attrs: { v: 2 } })
      }),
    )
    reg.setEnabled('a', true)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const enr = new PluginEnrichment(engine as any, reg, defaultPluginFetchPolicy)
    engine.fire(hit) // pick 1 en vol
    engine.fire(hit) // pick 2
    await Promise.resolve()
    resolveFirst({ attrs: { v: 1 } }) // le pick 1 résout APRÈS, doit être ignoré
    await Promise.resolve()
    await Promise.resolve()
    expect(enr.get('a').data).toEqual({ v: 2 })
  })

  it('error remontée', async () => {
    const engine = fakeEngine()
    const reg = new PluginRegistry(null)
    reg.register(
      enricher('a', async () => {
        throw new Error('boom')
      }),
    )
    reg.setEnabled('a', true)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const enr = new PluginEnrichment(engine as any, reg, defaultPluginFetchPolicy)
    engine.fire(hit)
    await Promise.resolve()
    await Promise.resolve()
    expect(enr.get('a').error?.message).toBe('boom')
    expect(enr.get('a').data).toBeNull()
  })

  it('merged fusionne les attrs + union des tags des enrichisseurs actifs', async () => {
    const engine = fakeEngine()
    const reg = new PluginRegistry(null)
    reg.register(enricher('a', async () => ({ attrs: { x: 1 }, tags: ['a'] })))
    reg.register(enricher('b', async () => ({ attrs: { y: 2 }, tags: ['b'] })))
    reg.setEnabled('a', true)
    reg.setEnabled('b', true)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const enr = new PluginEnrichment(engine as any, reg, defaultPluginFetchPolicy)
    engine.fire(hit)
    await Promise.resolve()
    await Promise.resolve()
    const m = enr.merged()
    expect(m.data).toEqual({ x: 1, y: 2 })
    expect([...m.tags].sort()).toEqual(['a', 'b'])
  })
})
