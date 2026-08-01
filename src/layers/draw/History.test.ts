import { describe, expect, it } from 'vitest'
import type { Drawing } from '../DrawLayer'
import { History } from './History'

// Cœur de l'undo/redo du dessin. Les invariants gardés ici — snapshot par CLONE (isolation),
// push idempotent, purge du redo à la moindre mutation, plafond de pile — sont exactement
// ce dont dépend l'utilisateur pour ne jamais perdre de travail ni voir un redo fantôme.

const drawing = (id: string, over: Partial<Drawing> = {}): Drawing => ({
  id,
  kind: 'polygon',
  points: [{ lat: 48.85, lng: 2.35 }],
  color: '#f00',
  width: 2,
  fillOpacity: 0.3,
  closed: true,
  tags: ['draw', 'polygon'],
  ...over,
})

describe('History', () => {
  it('undo restaure l’état poussé AVANT la mutation et arme le redo', () => {
    const h = new History(10)
    const before = [drawing('a')]
    h.push(before)
    const after = [drawing('a'), drawing('b')]
    const restored = h.undo(after)
    expect(restored?.map((d) => d.id)).toEqual(['a'])
    expect(h.canRedo).toBe(true)
    // redo restitue l'état courant re-empilé.
    expect(h.redo(before)?.map((d) => d.id)).toEqual(['a', 'b'])
  })

  it('undo/redo sur une pile vide renvoient null', () => {
    const h = new History(10)
    expect(h.undo([])).toBeNull()
    expect(h.redo([])).toBeNull()
  })

  it('un push identique au sommet est ignoré (pas d’entrée fantôme au montage)', () => {
    const h = new History(10)
    h.push([drawing('a')])
    h.push([drawing('a')]) // même contenu → ignoré
    h.undo([drawing('a')])
    expect(h.canUndo).toBe(false)
  })

  it('un nouveau push purge la pile redo (une branche annulée ne revient pas)', () => {
    const h = new History(10)
    h.push([drawing('a')])
    h.undo([drawing('a'), drawing('b')])
    expect(h.canRedo).toBe(true)
    h.push([drawing('c')])
    expect(h.canRedo).toBe(false)
  })

  it("clone l'état à la capture : muter la source après push ne corrompt pas l'historique", () => {
    const h = new History(10)
    const live = drawing('a', { points: [{ lat: 1, lng: 1 }] })
    h.push([live])
    live.points[0]!.lat = 99 // mutation postérieure de l'objet vivant
    const restored = h.undo([drawing('a')])
    // Le snapshot doit refléter l'état AU MOMENT du push, pas la mutation d'après.
    expect(restored?.[0]?.points[0]?.lat).toBe(1)
  })

  it('plafonne la profondeur : les entrées les plus anciennes tombent', () => {
    const h = new History(2)
    h.push([drawing('s0')])
    h.push([drawing('s1')])
    h.push([drawing('s2')]) // s0 doit sortir
    expect(h.undo([drawing('cur')])?.[0]?.id).toBe('s2')
    expect(h.undo([drawing('cur')])?.[0]?.id).toBe('s1')
    expect(h.undo([drawing('cur')])).toBeNull() // s0 est parti
  })

  it('setDepth tronque une pile déjà trop profonde', () => {
    const h = new History(10)
    h.push([drawing('s0')])
    h.push([drawing('s1')])
    h.push([drawing('s2')])
    h.setDepth(1)
    expect(h.undo([drawing('cur')])?.[0]?.id).toBe('s2')
    expect(h.canUndo).toBe(false)
  })

  it('reset oublie tout (import GeoJSON non annulable)', () => {
    const h = new History(10)
    h.push([drawing('a')])
    h.undo([drawing('b')])
    h.reset()
    expect(h.canUndo).toBe(false)
    expect(h.canRedo).toBe(false)
  })

  it('lève une erreur explicite si une meta n’est pas sérialisable', () => {
    const h = new History(10)
    const bad = drawing('a', { meta: { onClick: () => undefined } })
    expect(() => h.push([bad])).toThrow(/sérialisables/)
  })
})
