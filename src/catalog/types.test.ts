import { describe, expect, it } from 'vitest'
import type { MarkerData } from '../data/types'
import { isBrowseSource, isToggleSource, type CatalogBrowseSource, type CatalogSource } from './types'

const browse = (kind?: 'browse'): CatalogSource => ({
  id: 'zones',
  label: 'Zones',
  icon: 'M0 0',
  kind,
  list: async () => ({ items: [] }),
  geometry: async () => [],
})

const toggle = (): CatalogSource => ({
  id: 'defibs',
  label: 'Défibrillateurs',
  icon: 'M0 0',
  kind: 'toggle',
  source: { load: async (): Promise<MarkerData[]> => [] },
})

describe('discrimination des sources', () => {
  // La rétrocompatibilité TIENT à ce test : toutes les sources écrites avant les bascules
  // omettent `kind`, et une lecture `=== 'browse'` les aurait toutes fait disparaître du menu.
  it('une source sans `kind` est une source de PARCOURS', () => {
    const s = browse()
    expect(isBrowseSource(s)).toBe(true)
    expect(isToggleSource(s)).toBe(false)
  })

  it('`kind: "browse"` explicite se comporte à l’identique', () => {
    expect(isBrowseSource(browse('browse'))).toBe(true)
    expect(isToggleSource(browse('browse'))).toBe(false)
  })

  it('`kind: "toggle"` bascule, et seulement lui', () => {
    const s = toggle()
    expect(isToggleSource(s)).toBe(true)
    expect(isBrowseSource(s)).toBe(false)
  })

  it('les deux gardes sont exactement complémentaires', () => {
    for (const s of [browse(), browse('browse'), toggle()]) {
      expect(isBrowseSource(s)).toBe(!isToggleSource(s))
    }
  })

  // Le régime « index » (`checkable: false`) reste une source de PARCOURS : il n'a ni garde
  // ni `kind` à lui — c'est la même liste, privée de sa seule capacité à poser.
  it('`checkable: false` ne change pas le régime de la source', () => {
    const s: CatalogBrowseSource = { ...(browse() as CatalogBrowseSource), checkable: false }
    expect(isBrowseSource(s)).toBe(true)
    expect(isToggleSource(s)).toBe(false)
  })

  // ⚠️ Le défaut est ce qui rend l'ajout rétrocompatible : toute source écrite avant lui
  // omet la clé, et une lecture `=== true` les aurait toutes privées de leur case.
  it('une source qui ne déclare rien reste cochable', () => {
    const s = browse() as CatalogBrowseSource
    expect(s.checkable).toBeUndefined()
    expect(s.checkable !== false).toBe(true)
  })

  it('narrowing : la garde donne accès aux membres du régime, et à eux seuls', () => {
    const sources = [browse(), toggle()]
    // Ce test vaut surtout à la COMPILATION : `s.list` n'existe pas sur une bascule et
    // `s.source` n'existe pas sur un parcours. Sans l'union, les deux compileraient.
    const listables = sources.filter(isBrowseSource).map((s) => typeof s.list)
    const loadables = sources.filter(isToggleSource).map((s) => typeof s.source.load)
    expect(listables).toEqual(['function'])
    expect(loadables).toEqual(['function'])
  })
})
