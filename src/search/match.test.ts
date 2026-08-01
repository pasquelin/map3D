import { describe, expect, it, vi } from 'vitest'
import { createTitleCache, normalizeSearch, proximityRank, rankHits, scoreMatch, type Hit } from './match'

// Ce module décide, à un seul endroit, ce que « ça correspond » veut dire pour TOUS les
// fournisseurs de recherche. Une régression ici désaligne le classement d'une même liste :
// un accent qui ne se replie plus, un préfixe qui ne prime plus, la proximité qui ne
// départage plus deux homonymes.

describe('normalizeSearch', () => {
  it('replie accents et casse pour que « Saint-Étienne » et « saint etienne » se rejoignent', () => {
    expect(normalizeSearch('Saint-Étienne')).toBe('saint-etienne')
    expect(normalizeSearch('ÉCOLE')).toBe('ecole')
    expect(normalizeSearch('naïve façade')).toBe('naive facade')
  })

  it('compacte les espaces internes et rogne les bords', () => {
    expect(normalizeSearch('  École   Élémentaire  ')).toBe('ecole elementaire')
  })
})

describe('scoreMatch', () => {
  // Les paliers 3/2/1/0 EST le classement : préfixe du titre > début de mot > ailleurs > rejet.
  it('donne 3 quand le titre commence par la saisie', () => {
    expect(scoreMatch('samir kaddour', 'sam')).toBe(3)
  })

  it("donne 2 quand un mot du titre commence par la saisie (précédé d'un espace)", () => {
    expect(scoreMatch('julie samson', 'sam')).toBe(2)
  })

  it('donne 1 pour une sous-chaîne en plein mot', () => {
    // 'serv' au cœur d'« observateurs », précédé de 'b' → ni préfixe ni début de mot.
    expect(scoreMatch('les observateurs', 'serv')).toBe(1)
  })

  it('donne 0 quand rien ne correspond', () => {
    expect(scoreMatch('julie samson', 'zzz')).toBe(0)
  })
})

describe('rankHits', () => {
  it('trie par pertinence décroissante, la proximité départageant à score égal', () => {
    const hits: Hit<string>[] = [
      { item: 'loin-fort', score: 3, distance: 100 },
      { item: 'proche-faible', score: 1, distance: 1 },
      { item: 'proche-fort', score: 3, distance: 1 },
    ]
    // Score d'abord (3 avant 1), puis distance croissante entre les deux 3.
    expect(rankHits(hits, 10)).toEqual(['proche-fort', 'loin-fort', 'proche-faible'])
  })

  it('tronque aux `limit` premiers sans que ce soit lisible comme une absence', () => {
    const hits: Hit<number>[] = [1, 2, 3, 4].map((n) => ({ item: n, score: 5 - n, distance: 0 }))
    // Les scores décroissent avec n → l'ordre est 1,2,3,4 ; on ne garde que 2.
    expect(rankHits(hits, 2)).toEqual([1, 2])
  })
})

describe('proximityRank', () => {
  it('vaut 0 pour un point sur lui-même', () => {
    expect(proximityRank({ lat: 48, lng: 2 }, { lat: 48, lng: 2 })).toBe(0)
  })

  it('pondère la longitude par le cosinus de la latitude (un degré à Oslo < à l’équateur)', () => {
    const equateur = proximityRank({ lat: 0, lng: 0 }, { lat: 0, lng: 1 })
    const oslo = proximityRank({ lat: 60, lng: 0 }, { lat: 60, lng: 1 })
    // À 60° de latitude, cos = 0,5 → l'écart en longitude compte ~4× moins qu'à l'équateur.
    expect(oslo).toBeLessThan(equateur)
    expect(oslo).toBeCloseTo(equateur * 0.25, 5)
  })
})

describe('createTitleCache', () => {
  it('ne renormalise jamais un même objet source (clé WeakMap sur la référence)', () => {
    const titleOf = vi.fn((x: { t?: string }) => x.t)
    const cached = createTitleCache(titleOf)
    const item = { t: 'Saint-Étienne' }
    expect(cached(item)).toBe('saint-etienne')
    expect(cached(item)).toBe('saint-etienne')
    // Deux lectures, une seule normalisation : décisif sur un flux temps réel.
    expect(titleOf).toHaveBeenCalledTimes(1)
  })

  it('normalise une chaîne vide pour un titre absent', () => {
    const cached = createTitleCache((x: { t?: string }) => x.t)
    expect(cached({})).toBe('')
  })
})
