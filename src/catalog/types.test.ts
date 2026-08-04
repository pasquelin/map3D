import { describe, expect, it } from 'vitest'
import type { MarkerData } from '../data/types'
import { isBrowseSource, isToggleSource, type CatalogSource } from './types'

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
