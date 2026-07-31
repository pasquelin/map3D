import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ShapeData } from '../layers/ShapeLayer'
import { CatalogStore } from './store'

const KEYS = { selection: 'test:catalog', settings: 'test:catalog-settings' }

const shape = (id: string): ShapeData => ({ kind: 'circle', id, center: { lat: 48, lng: 2 }, radiusMeters: 100 })

const fresh = (): CatalogStore => {
  const s = new CatalogStore()
  s.configure(KEYS)
  return s
}

beforeEach(() => {
  localStorage.clear()
})

describe('cycle d’un élément', () => {
  it('marque sélectionné et en attente avant que la géométrie arrive', () => {
    const s = fresh()
    s.markSelected('zones:1')
    expect(s.isShown('zones:1')).toBe(true)
    expect(s.isPending('zones:1')).toBe(true)
    expect(s.shapes()).toEqual([])
  })

  it('la géométrie reçue lève l’attente et alimente les formes', () => {
    const s = fresh()
    s.markSelected('zones:1')
    s.setGeometry('zones:1', [shape('a'), shape('b')])
    expect(s.isPending('zones:1')).toBe(false)
    expect(s.shapes()).toHaveLength(2)
  })

  it('un échec sort l’élément de la sélection et laisse une erreur — jamais de zone fantôme', () => {
    const s = fresh()
    s.markSelected('zones:1')
    s.remove('zones:1', true)
    expect(s.isShown('zones:1')).toBe(false)
    expect(s.hasError('zones:1')).toBe(true)
    expect(s.shapes()).toEqual([])
  })

  it('un retrait volontaire ne laisse pas d’erreur', () => {
    const s = fresh()
    s.markSelected('zones:1')
    s.setGeometry('zones:1', [shape('a')])
    s.remove('zones:1')
    expect(s.hasError('zones:1')).toBe(false)
    expect(s.shapes()).toEqual([])
  })

  it('re-sélectionner après un échec efface l’erreur', () => {
    const s = fresh()
    s.markSelected('zones:1')
    s.remove('zones:1', true)
    s.markSelected('zones:1')
    expect(s.hasError('zones:1')).toBe(false)
  })

  it('un agrégat apporte plusieurs formes et les retire ensemble', () => {
    const s = fresh()
    s.markSelected('groups:g1')
    s.setGeometry('groups:g1', [shape('a'), shape('b'), shape('c')])
    expect(s.shapes()).toHaveLength(3)
    s.remove('groups:g1')
    expect(s.shapes()).toEqual([])
  })
})

describe('notification', () => {
  it('prévient les abonnés et change de jeton à chaque mutation', () => {
    const s = fresh()
    const cb = vi.fn()
    s.onChanged(cb)
    const before = s.snapshot()
    s.markSelected('zones:1')
    expect(cb).toHaveBeenCalledTimes(1)
    expect(s.snapshot()).not.toBe(before)
  })

  it('ne notifie pas pour un clear sans objet', () => {
    const s = fresh()
    const cb = vi.fn()
    s.onChanged(cb)
    s.clear()
    expect(cb).not.toHaveBeenCalled()
  })
})

describe('purge d’une source disparue', () => {
  it('retire ses clés ET ses formes, sans toucher aux autres', () => {
    const s = fresh()
    s.markSelected('zones:1')
    s.setGeometry('zones:1', [shape('a')])
    s.markSelected('cities:9')
    s.setGeometry('cities:9', [shape('b')])
    s.purge(new Set(['zones']))
    expect(s.selection()).toEqual(['zones:1'])
    expect(s.shapes()).toHaveLength(1)
  })

  it('ne notifie pas quand toutes les sources sont connues', () => {
    const s = fresh()
    s.markSelected('zones:1')
    const cb = vi.fn()
    s.onChanged(cb)
    s.purge(new Set(['zones']))
    expect(cb).not.toHaveBeenCalled()
  })
})

describe('persistance', () => {
  it('relit la sélection au démarrage suivant', () => {
    const a = fresh()
    a.markSelected('zones:1')
    expect(fresh().selection()).toEqual(['zones:1'])
  })

  it('ne persiste rien quand la persistance est coupée, et efface ce qui l’était', () => {
    const a = fresh()
    a.markSelected('zones:1')
    a.setSettings({ persist: false })
    expect(localStorage.getItem(KEYS.selection)).toBeNull()

    const b = new CatalogStore()
    b.configure(KEYS)
    expect(b.selection()).toEqual([])
    // Le RÉGLAGE, lui, survit — c'est bien la sélection seule qui a été effacée.
    expect(b.getSettings().persist).toBe(false)
  })

  it('repart des défauts sur une charge corrompue', () => {
    localStorage.setItem(KEYS.selection, 'pas du json')
    localStorage.setItem(KEYS.settings, '{{{')
    const s = fresh()
    expect(s.selection()).toEqual([])
    expect(s.getSettings()).toEqual({ persist: true, fitOnAdd: true })
  })

  it('les géométries ne sont JAMAIS persistées — seules les clés le sont', () => {
    const s = fresh()
    s.markSelected('zones:1')
    s.setGeometry('zones:1', [shape('a')])
    expect(localStorage.getItem(KEYS.selection)).not.toContain('radiusMeters')
  })
})
