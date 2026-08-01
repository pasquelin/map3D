import { describe, expect, it } from 'vitest'
import { mapKeysAt } from './resettle'

// `mapKeysAt` remplace `[...map.keys()][i]` (matérialisation du trousseau ENTIER) par un
// seul passage sur le `Map` — cf. `DrawLayer`, qui n'en indexe que `batch` (4 par défaut)
// par frame de la fenêtre resettle. Le contrat à figer : mêmes clés, dans L'ORDRE de
// `ids` (pas celui d'itération du `Map`) — `DrawLayer.stableRuns` en dépend d'un id à
// l'autre au sein du même lot.

describe('mapKeysAt', () => {
  it('renvoie les clés aux indices demandés, dans l’ordre de `ids`', () => {
    const m = new Map([
      ['a', 1],
      ['b', 2],
      ['c', 3],
      ['d', 4],
    ])
    expect(mapKeysAt(m, [1, 3])).toEqual(['b', 'd'])
  })

  it('préserve l’ORDRE de `ids`, même quand il diverge de celui du `Map` (round-robin avec retour à zéro)', () => {
    const m = new Map([
      ['a', 1],
      ['b', 2],
      ['c', 3],
      ['d', 4],
      ['e', 5],
    ])
    // round-robin : cursor=3, batch=4, count=5 → indices [3, 4, 0, 1] (wrap).
    expect(mapKeysAt(m, [3, 4, 0, 1])).toEqual(['d', 'e', 'a', 'b'])
  })

  it('équivaut à `[...map.keys()][i]` pour chaque id, quel que soit l’ordre de `ids`', () => {
    const m = new Map(Array.from({ length: 37 }, (_, i) => [`k${i}`, i] as const))
    const allKeys = [...m.keys()]
    const ids = [30, 2, 17, 36, 0, 9]
    expect(mapKeysAt(m, ids)).toEqual(ids.map((i) => allKeys[i]))
  })

  it('`ids` vide → tableau vide', () => {
    const m = new Map([['a', 1]])
    expect(mapKeysAt(m, [])).toEqual([])
  })

  it('réutilise les buffers fournis (`out`/`posScratch`) sans fuite entre deux appels', () => {
    const m = new Map([
      ['a', 1],
      ['b', 2],
      ['c', 3],
    ])
    const out: string[] = []
    const pos = new Map<number, number>()
    const first = mapKeysAt(m, [0, 2], out, pos)
    expect(first).toBe(out)
    expect(first).toEqual(['a', 'c'])
    // Second appel avec MOINS d'ids : le buffer, plus long, ne doit garder aucun résidu.
    const second = mapKeysAt(m, [1], out, pos)
    expect(second).toEqual(['b'])
  })
})
