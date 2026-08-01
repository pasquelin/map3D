import { describe, expect, it } from 'vitest'
import { kindAllowed, type SelectableProvider, SelectableRegistry } from './Selectables'

const markerProvider: SelectableProvider = {
  screenItems: () => [{ id: 'm1', kind: 'marker', x: 10, y: 10 }],
  setSelected: () => {},
  info: (id) => (id === 'm1' ? { kind: 'marker', type: 'agent' } : null),
}

const pathProvider: SelectableProvider = {
  screenItems: () => [{ id: 'path:a', kind: 'path', x: 0, y: 0, geometry: { pts: [{ x: 0, y: 0 }], closed: false } }],
  setSelected: () => {},
  info: (id) => (id === 'path:a' ? { kind: 'path', type: 'path' } : null),
  hitTest: (x) => (x < 5 ? 'path:a' : null),
}

describe('kindAllowed', () => {
  it('absent ou true = autorisé, false = interdit', () => {
    expect(kindAllowed('marker', undefined)).toBe(true)
    expect(kindAllowed('marker', {})).toBe(true)
    expect(kindAllowed('cluster', { cluster: true })).toBe(true)
    expect(kindAllowed('cluster', { cluster: false })).toBe(false)
  })
})

describe('SelectableRegistry', () => {
  it('items() concatène tous les providers, filtrés par la politique', () => {
    const reg = new SelectableRegistry()
    reg.register(markerProvider)
    reg.register(pathProvider)
    expect(
      reg
        .items()
        .map((i) => i.id)
        .sort(),
    ).toEqual(['m1', 'path:a'])
    expect(reg.items({ path: false }).map((i) => i.id)).toEqual(['m1'])
    expect(reg.items({ marker: false, path: false })).toEqual([])
  })

  it('hitTest() renvoie le premier provider qui touche, kind autorisé', () => {
    const reg = new SelectableRegistry()
    reg.register(markerProvider)
    reg.register(pathProvider)
    expect(reg.hitTest(1, 1, 5)).toBe('path:a')
    expect(reg.hitTest(1, 1, 5, { path: false })).toBe(null) // kind interdit
    expect(reg.hitTest(99, 99, 5)).toBe(null) // rien sous le curseur
  })

  it('info()/has() décodent via le bon provider', () => {
    const reg = new SelectableRegistry()
    reg.register(markerProvider)
    reg.register(pathProvider)
    expect(reg.info('m1')?.kind).toBe('marker')
    expect(reg.info('path:a')?.kind).toBe('path')
    expect(reg.has('m1')).toBe(true)
    expect(reg.has('absent')).toBe(false)
  })
})
