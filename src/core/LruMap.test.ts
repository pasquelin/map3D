import { describe, expect, it } from 'vitest'
import { LruMap } from './LruMap'

describe('LruMap', () => {
  it('rend ce qu’on lui a confié', () => {
    const m = new LruMap<string, number>(3)
    m.set('a', 1)
    expect(m.get('a')).toBe(1)
  })

  it('renvoie undefined pour une clé absente', () => {
    const m = new LruMap<string, number>(3)
    expect(m.get('nope')).toBeUndefined()
  })

  it('évince la plus ancienne entrée au-delà de max', () => {
    const m = new LruMap<string, number>(2)
    m.set('a', 1)
    m.set('b', 2)
    m.set('c', 3)
    expect(m.get('a')).toBeUndefined()
    expect(m.get('b')).toBe(2)
    expect(m.get('c')).toBe(3)
    expect(m.size).toBe(2)
  })

  it('un get promeut : l’entrée relue ne s’évince pas', () => {
    const m = new LruMap<string, number>(2)
    m.set('a', 1)
    m.set('b', 2)
    // 'a' relu passe en fin d'ordre : c'est 'b' qui devient la plus ancienne.
    expect(m.get('a')).toBe(1)
    m.set('c', 3)
    expect(m.get('b')).toBeUndefined()
    expect(m.get('a')).toBe(1)
    expect(m.get('c')).toBe(3)
  })

  it('un set sur une clé existante promeut aussi (remplacement = réinsertion)', () => {
    const m = new LruMap<string, number>(2)
    m.set('a', 1)
    m.set('b', 2)
    m.set('a', 10)
    m.set('c', 3)
    expect(m.get('b')).toBeUndefined()
    expect(m.get('a')).toBe(10)
    expect(m.get('c')).toBe(3)
  })

  it('respecte l’ordre d’éviction sur plusieurs insertions', () => {
    const m = new LruMap<string, number>(3)
    for (let i = 0; i < 10; i++) m.set(`k${i}`, i)
    expect(m.size).toBe(3)
    expect(m.get('k6')).toBeUndefined()
    expect(m.get('k7')).toBe(7)
    expect(m.get('k8')).toBe(8)
    expect(m.get('k9')).toBe(9)
  })

  it('max <= 0 désactive l’éviction automatique (table illimitée)', () => {
    const m = new LruMap<string, number>(0)
    for (let i = 0; i < 500; i++) m.set(`k${i}`, i)
    expect(m.size).toBe(500)
    expect(m.get('k0')).toBe(0)
  })

  it('delete retire une entrée et rapporte si elle existait', () => {
    const m = new LruMap<string, number>(3)
    m.set('a', 1)
    expect(m.delete('a')).toBe(true)
    expect(m.delete('a')).toBe(false)
    expect(m.get('a')).toBeUndefined()
  })

  it('clear vide la table', () => {
    const m = new LruMap<string, number>(3)
    m.set('a', 1)
    m.set('b', 2)
    m.clear()
    expect(m.size).toBe(0)
    expect(m.get('a')).toBeUndefined()
  })

  it('entries() itère en ordre LRU, plus ancienne d’abord', () => {
    const m = new LruMap<string, number>(0)
    m.set('a', 1)
    m.set('b', 2)
    m.set('c', 3)
    m.get('a') // promeut 'a' en fin d'ordre
    expect([...m.entries()]).toEqual([
      ['b', 2],
      ['c', 3],
      ['a', 1],
    ])
  })
})
