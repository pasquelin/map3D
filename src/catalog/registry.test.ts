import { describe, expect, it, vi } from 'vitest'
import { CatalogRegistry } from './registry'
import type { CatalogSource } from './types'

const source = (id: string): CatalogSource => ({
  id,
  label: id,
  icon: 'M0 0',
  list: async () => ({ items: [] }),
  geometry: async () => [],
})

describe('CatalogRegistry', () => {
  it('expose les sources inscrites dans leur ordre d’inscription', () => {
    const r = new CatalogRegistry()
    r.register(source('zones'))
    r.register(source('cities'))
    expect(r.sources().map((s) => s.id)).toEqual(['zones', 'cities'])
  })

  it('retire une source via la fonction rendue', () => {
    const r = new CatalogRegistry()
    const off = r.register(source('zones'))
    off()
    expect(r.sources()).toEqual([])
  })

  it('résout une source par son id', () => {
    const r = new CatalogRegistry()
    r.register(source('zones'))
    expect(r.byId('zones')?.label).toBe('zones')
    expect(r.byId('absente')).toBeUndefined()
  })

  it('notifie à l’inscription ET à la désinscription', () => {
    const r = new CatalogRegistry()
    const cb = vi.fn()
    r.onItemsChanged(cb)
    const off = r.register(source('zones'))
    expect(cb).toHaveBeenCalledTimes(1)
    off()
    expect(cb).toHaveBeenCalledTimes(2)
  })

  it('change de jeton d’instantané à chaque mutation, jamais entre deux', () => {
    const r = new CatalogRegistry()
    const a = r.snapshot()
    expect(r.snapshot()).toBe(a)
    r.register(source('zones'))
    expect(r.snapshot()).not.toBe(a)
  })

  it('refuse deux sources de même id — la seconde remplace, sans doublon', () => {
    const r = new CatalogRegistry()
    r.register(source('zones'))
    r.register({ ...source('zones'), label: 'Zones v2' })
    expect(r.sources()).toHaveLength(1)
    expect(r.byId('zones')?.label).toBe('Zones v2')
  })

  it('le démontage d’une source remplacée n’efface pas celle qui l’a remplacée', () => {
    const r = new CatalogRegistry()
    const off = r.register(source('zones'))
    r.register({ ...source('zones'), label: 'Zones v2' })
    off()
    expect(r.byId('zones')?.label).toBe('Zones v2')
  })
})
