import { describe, expect, it } from 'vitest'
import { visibleWindow } from './window'

const base = { rowHeight: 40, viewportHeight: 400, count: 1000, overscan: 0 }

describe('visibleWindow', () => {
  it('en haut de liste, rend exactement la fenêtre visible', () => {
    expect(visibleWindow({ ...base, scrollTop: 0 })).toEqual({ start: 0, end: 10, padTop: 0, totalHeight: 40000 })
  })

  it('à mi-liste, décale start et padTop du même nombre de lignes', () => {
    const w = visibleWindow({ ...base, scrollTop: 4000 })
    expect(w.start).toBe(100)
    expect(w.end).toBe(110)
    expect(w.padTop).toBe(4000)
  })

  it('ajoute le sur-rendu des DEUX côtés', () => {
    const w = visibleWindow({ ...base, scrollTop: 4000, overscan: 3 })
    expect(w.start).toBe(97)
    expect(w.end).toBe(113)
    expect(w.padTop).toBe(97 * 40)
  })

  it('borne start à 0 — le sur-rendu ne rend pas d’index négatif', () => {
    expect(visibleWindow({ ...base, scrollTop: 0, overscan: 5 }).start).toBe(0)
  })

  it('borne end au nombre d’éléments en fin de liste', () => {
    const w = visibleWindow({ ...base, scrollTop: 40000, overscan: 5 })
    expect(w.end).toBe(1000)
    expect(w.start).toBeLessThan(1000)
  })

  it('liste vide : fenêtre vide, hauteur nulle', () => {
    expect(visibleWindow({ ...base, scrollTop: 0, count: 0 })).toEqual({
      start: 0,
      end: 0,
      padTop: 0,
      totalHeight: 0,
    })
  })

  it('liste plus courte que la fenêtre : tout est rendu', () => {
    const w = visibleWindow({ ...base, scrollTop: 0, count: 3 })
    expect(w).toEqual({ start: 0, end: 3, padTop: 0, totalHeight: 120 })
  })

  it('scroll négatif (rebond iOS) ne casse pas les bornes', () => {
    const w = visibleWindow({ ...base, scrollTop: -120 })
    expect(w.start).toBe(0)
    expect(w.padTop).toBe(0)
  })

  it('hauteur de ligne non finie : repli sur une fenêtre vide plutôt qu’une boucle infinie', () => {
    expect(visibleWindow({ ...base, scrollTop: 0, rowHeight: 0 })).toEqual({
      start: 0,
      end: 0,
      padTop: 0,
      totalHeight: 0,
    })
    expect(visibleWindow({ ...base, scrollTop: 0, rowHeight: Number.NaN }).end).toBe(0)
  })

  it('padTop reste toujours aligné sur start — l’espaceur ne décale jamais les lignes', () => {
    for (const scrollTop of [0, 37, 1234, 39999]) {
      const w = visibleWindow({ ...base, scrollTop, overscan: 4 })
      expect(w.padTop).toBe(w.start * base.rowHeight)
    }
  })
})
