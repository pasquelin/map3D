import { beforeEach, describe, expect, it } from 'vitest'
import type { AnyPlugin } from '../plugins/types'
import { PluginRegistry } from './PluginRegistry'

const demo = (over: Partial<AnyPlugin['meta']> = {}): AnyPlugin => ({
  meta: { id: 'demo', name: 'Démo', icon: 'M', version: '1.0.0', ...over },
  config: [
    { key: 'max', label: 'Max', type: 'number', default: 50 },
    { key: 'live', label: 'Live', type: 'boolean', default: true },
  ],
  data: { fetch: () => [] },
})

beforeEach(() => globalThis.localStorage?.clear())

describe('PluginRegistry', () => {
  it('register sème les défauts du schéma et enabledByDefault', () => {
    const r = new PluginRegistry(null)
    r.register({ ...demo(), enabledByDefault: true })
    expect(r.isEnabled('demo')).toBe(true)
    expect(r.getConfig('demo')).toEqual({ max: 50, live: true })
  })

  it('setConfig merge et ignore les clés inconnues ; setEnabled bascule', () => {
    const r = new PluginRegistry(null)
    r.register(demo())
    r.setConfig('demo', { max: 10, ghost: 1 })
    expect(r.getConfig('demo')).toEqual({ max: 10, live: true })
    r.setEnabled('demo', true)
    expect(r.isEnabled('demo')).toBe(true)
  })

  it('resetConfig revient aux défauts', () => {
    const r = new PluginRegistry(null)
    r.register(demo())
    r.setConfig('demo', { max: 10 })
    r.resetConfig('demo')
    expect(r.getConfig('demo')).toEqual({ max: 50, live: true })
  })

  it("émet l'event sur register / setEnabled / setConfig", () => {
    const r = new PluginRegistry(null)
    let n = 0
    r.on(() => n++)
    r.register(demo())
    r.setEnabled('demo', true)
    r.setConfig('demo', { max: 1 })
    expect(n).toBe(3)
  })

  it('persiste le partiel et le recharge (clé fournie)', () => {
    const r1 = new PluginRegistry('m3d:plugins', 0)
    r1.register(demo())
    r1.setEnabled('demo', true)
    r1.setConfig('demo', { max: 7 })
    // écriture débouncée à 0 ms → flush synchrone via un microtask ; on force le flush :
    r1.dispose()
    const raw = JSON.parse(globalThis.localStorage.getItem('m3d:plugins') ?? '{}')
    expect(raw).toEqual({ demo: { enabled: true, config: { max: 7 } } })

    const r2 = new PluginRegistry('m3d:plugins', 0)
    r2.register(demo())
    expect(r2.isEnabled('demo')).toBe(true)
    expect(r2.getConfig('demo')).toEqual({ max: 7, live: true })
  })

  it('storageKey null → pas de persistance', () => {
    const r = new PluginRegistry(null, 0)
    r.register(demo())
    r.setEnabled('demo', true)
    r.dispose()
    expect(globalThis.localStorage.getItem('m3d:plugins')).toBeNull()
  })

  it('requestRefresh incrémente le tick et émet', () => {
    const r = new PluginRegistry(null)
    r.register(demo())
    let n = 0
    r.on(() => n++)
    r.requestRefresh('demo')
    expect(r.refreshTick('demo')).toBe(1)
    expect(n).toBe(1)
  })
})
