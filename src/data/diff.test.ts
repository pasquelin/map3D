import { describe, expect, it } from 'vitest'
import { diffById } from './diff'

// `diffById` est le contrat de RECYCLAGE de MarkerLayer : un élément déjà présent doit
// tomber dans `updated` (nœud DOM réutilisé, position animée), un nouveau dans `entered`
// (nœud créé), un disparu dans `exitedKeys` (nœud retiré). Se tromper de catégorie, c'est
// recréer un marker qui aurait dû glisser — flicker visible et allocation par frame.

const byId = (x: { id: string | number }) => x.id

describe('diffById', () => {
  it('classe présent → updated, nouveau → entered, disparu → exitedKeys', () => {
    const previous = new Map<string | number, unknown>([
      ['a', {}],
      ['b', {}],
    ])
    const next = [{ id: 'a' }, { id: 'c' }]
    const r = diffById(previous, next, byId)
    // 'a' était là → recyclé, pas recréé. 'c' est neuf. 'b' a disparu.
    expect(r.updated.map(byId)).toEqual(['a'])
    expect(r.entered.map(byId)).toEqual(['c'])
    expect(r.exitedKeys).toEqual(['b'])
  })

  it("préserve l'ordre de `next` dans entered et updated (stabilité d'animation)", () => {
    const previous = new Map<string | number, unknown>([
      ['x', {}],
      ['y', {}],
    ])
    // Ordre entrelacé pour vérifier qu'on suit `next`, pas l'ordre de `previous`.
    const next = [{ id: 'n1' }, { id: 'y' }, { id: 'n2' }, { id: 'x' }]
    const r = diffById(previous, next, byId)
    expect(r.entered.map(byId)).toEqual(['n1', 'n2'])
    expect(r.updated.map(byId)).toEqual(['y', 'x'])
  })

  it('ne lit jamais `previous` autrement que par clé (ne mute pas la source)', () => {
    const previous = new Map<string | number, unknown>([['a', { keep: true }]])
    const next = [{ id: 'a' }]
    diffById(previous, next, byId)
    expect(previous.get('a')).toEqual({ keep: true })
    expect(previous.size).toBe(1)
  })

  it('supporte des clés numériques et une projection getId personnalisée', () => {
    const previous = new Map<string | number, unknown>([[1, {}]])
    const next = [{ key: 1 }, { key: 2 }]
    const r = diffById(previous, next, (x: { key: number }) => x.key)
    expect(r.updated).toEqual([{ key: 1 }])
    expect(r.entered).toEqual([{ key: 2 }])
  })

  it('entrée et sortie complètes quand rien ne se recoupe', () => {
    const previous = new Map<string | number, unknown>([
      ['old1', {}],
      ['old2', {}],
    ])
    const r = diffById(previous, [{ id: 'new1' }], byId)
    expect(r.updated).toEqual([])
    expect(r.entered.map(byId)).toEqual(['new1'])
    // Seul l'ENSEMBLE des clés sorties importe (MarkerLayer retire des nœuds) — pas leur
    // ordre : asserter la séquence coupleait le test à l'itération de `previous`.
    expect([...r.exitedKeys].sort()).toEqual(['old1', 'old2'])
  })

  it('liste vide en entrée fait sortir toutes les clés précédentes', () => {
    const previous = new Map<string | number, unknown>([
      ['a', {}],
      ['b', {}],
    ])
    const r = diffById(previous, [], byId)
    expect(r.entered).toEqual([])
    expect(r.updated).toEqual([])
    expect([...r.exitedKeys].sort()).toEqual(['a', 'b'])
  })
})
