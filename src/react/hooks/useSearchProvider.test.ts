import { act, createElement, StrictMode } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { MapEngine } from '../../core/MapEngine'
import { normalizeSearch } from '../../search/match'
import { SearchRegistry } from '../../search/registry'
import { defaultTheme } from '../../theme/defaultTheme'
import { MapContext } from '../context'
import { useSearchProvider } from './useSearchProvider'

type Item = { id: string; title?: string; lat: number; lng: number }

const ITEMS: Item[] = [
  { id: 'a', title: 'Alpha', lat: 48, lng: 2 },
  { id: 'b', lat: 49, lng: 3 },
  { id: 'c', title: 'Alphabet', lat: 50, lng: 4 },
]

/** Composant hôte minimal : un moteur factice ne portant que le registre de recherche. */
function Host({ items, count }: { items: Item[]; count: number }) {
  useSearchProvider<Item>({
    group: 'g',
    label: 'Groupe',
    color: '#123456',
    source: 'src',
    items: () => items,
    normalizedTitle: (i) => (i.title ? normalizeSearch(i.title) : null),
    boundsOf: (i) => ({ north: i.lat, south: i.lat, east: i.lng, west: i.lng }),
    entryOf: (i) => ({ id: i.id, title: i.title!, color: '#abcdef' }),
    count,
  })
  return null
}

describe('useSearchProvider', () => {
  let search: SearchRegistry
  let root: Root
  let container: HTMLDivElement
  const mount = (items: Item[], count: number) =>
    act(() => {
      root.render(
        createElement(
          StrictMode,
          null,
          createElement(
            MapContext.Provider,
            { value: { engine: { search } as unknown as MapEngine, overlay: container, theme: defaultTheme } },
            createElement(Host, { items, count }),
          ),
        ),
      )
    })

  beforeEach(() => {
    ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
    search = new SearchRegistry()
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
  })
  afterEach(() => {
    act(() => root.unmount())
    container.remove()
  })

  it('déclare sa rubrique et répond aux requêtes, ignorant les éléments sans nom', () => {
    mount(ITEMS, 2)
    expect(search.groups()).toEqual([{ id: 'g', label: 'Groupe', color: '#123456', count: 2 }])
    const res = search.query(normalizeSearch('alpha'), { limit: 10 })
    expect(res.entries.map((e) => e.id)).toEqual(['a', 'c'])
    expect(res.entries[0]).toMatchObject({
      group: 'g',
      title: 'Alpha',
      color: '#abcdef',
      position: { lat: 48, lng: 2 },
    })
    expect(res.totals.get('g')).toBe(2)
  })

  it('ne répond pas hors de sa rubrique', () => {
    mount(ITEMS, 2)
    expect(search.query(normalizeSearch('alpha'), { limit: 10, group: 'autre' }).entries).toEqual([])
  })

  it('un compte nul retire la rubrique, et le démontage la désinscrit — même en StrictMode', () => {
    mount(ITEMS, 2)
    mount(ITEMS, 0)
    expect(search.groups()).toEqual([])
    mount(ITEMS, 1)
    expect(search.groups()).toHaveLength(1)
    act(() => root.unmount())
    expect(search.groups()).toEqual([])
    expect(search.query(normalizeSearch('alpha'), { limit: 10 }).entries).toEqual([])
    // Remonté pour que l'`afterEach` ait quelque chose à démonter.
    root = createRoot(container)
  })

  it('lit les candidats À LA REQUÊTE : une liste changée sans réinscription est vue', () => {
    mount(ITEMS, 2)
    mount([{ id: 'z', title: 'Zêta', lat: 1, lng: 1 }], 1)
    const res = search.query(normalizeSearch('zeta'), { limit: 10 })
    expect(res.entries.map((e) => e.id)).toEqual(['z'])
  })
})
