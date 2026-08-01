import { describe, expect, it } from 'vitest'
import type { DrawnShape } from '../DrawLayer'
import { sameMeta, sameShape } from './shapeEquality'

// Ces deux comparaisons gardent l'undo/redo : `History` restitue des snapshots via
// `structuredClone`, donc après une annulation AUCUNE référence n'est conservée. Une
// comparaison par référence signalerait toute forme comme « modifiée » et déclencherait,
// sur une app qui persiste `onShapeUpdate`, une écriture backend par forme à chaque undo.
// Ces tests figent la comparaison par VALEUR.

const shape = (over: Partial<DrawnShape> = {}): DrawnShape => ({
  id: 's1',
  kind: 'polygon',
  points: [
    { lat: 48.85, lng: 2.35 },
    { lat: 48.86, lng: 2.36 },
  ],
  closed: true,
  style: { color: '#f00', width: 2 },
  tags: ['draw', 'polygon'],
  ...over,
})

describe('sameMeta', () => {
  it('deux meta reconstruites (refs différentes) mais de même valeur sont égales', () => {
    const a = { uuid: 'x', group: { id: 7 } }
    // Clone profond : c'est exactement ce que produit un undo via structuredClone.
    const b = structuredClone(a)
    expect(a).not.toBe(b)
    expect(sameMeta(a, b)).toBe(true)
  })

  it('détecte un changement de valeur imbriquée', () => {
    expect(sameMeta({ g: { id: 1 } }, { g: { id: 2 } })).toBe(false)
  })

  it('un nombre de clés différent suffit à distinguer', () => {
    expect(sameMeta({ a: 1 }, { a: 1, b: 2 })).toBe(false)
  })

  it('un seul côté défini n’est jamais égal ; deux absents le sont', () => {
    expect(sameMeta({ a: 1 }, undefined)).toBe(false)
    expect(sameMeta(undefined, undefined)).toBe(true)
  })
})

describe('sameShape', () => {
  it('une forme clonée à l’identique est reconnue inchangée (pas de write parasite sur undo)', () => {
    const a = shape({ meta: { uuid: 'k', nested: { on: true } } })
    expect(sameShape(a, structuredClone(a))).toBe(true)
  })

  it('locked absent et locked:false sont équivalents (normalisation booléenne)', () => {
    expect(sameShape(shape({ locked: undefined }), shape({ locked: false }))).toBe(true)
    expect(sameShape(shape({ locked: true }), shape({ locked: false }))).toBe(false)
  })

  it('un déplacement de sommet est un changement', () => {
    const moved = shape()
    moved.points = [
      { lat: 48.85, lng: 2.35 },
      { lat: 48.99, lng: 2.36 },
    ]
    expect(sameShape(shape(), moved)).toBe(false)
  })

  it('un changement de style (couleur, largeur) est un changement', () => {
    expect(sameShape(shape(), shape({ style: { color: '#0f0', width: 2 } }))).toBe(false)
    expect(sameShape(shape(), shape({ style: { color: '#f00', width: 3 } }))).toBe(false)
  })

  it('un changement de tags (contenu ou ordre) est un changement', () => {
    expect(sameShape(shape(), shape({ tags: ['polygon', 'draw'] }))).toBe(false)
    expect(sameShape(shape(), shape({ tags: ['draw'] }))).toBe(false)
  })

  it('un même emplacement mais une clé ou variante de symbole différente est un changement', () => {
    const base = shape({ kind: 'symbol', symbol: { key: 'unit', variant: 'friend' } })
    const rekeyed = shape({ kind: 'symbol', symbol: { key: 'depot', variant: 'friend' } })
    const revariant = shape({ kind: 'symbol', symbol: { key: 'unit', variant: 'hostile' } })
    expect(sameShape(base, rekeyed)).toBe(false)
    expect(sameShape(base, revariant)).toBe(false)
  })
})
