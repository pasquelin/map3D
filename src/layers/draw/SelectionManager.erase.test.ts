import { describe, expect, it, vi } from 'vitest'
import { defaultConfig } from '../../config/defaultConfig'
import type { LatLng } from '../../shared'
import type { Drawing } from '../DrawLayer'
import type { ScreenPt } from './hitTest'
import { type SelectHost, SelectionManager } from './SelectionManager'

// La machine de sélection est pure (un `SelectHost` de fonctions) : on peut donc vérifier
// le mode gomme SANS projection ni WebGL. Le geste rect/poly/lasso est réutilisé tel quel ;
// seule la FINALISATION diverge (efface au lieu de sélectionner).

const at = (x: number, y: number) =>
  ({ clientX: x, clientY: y, shiftKey: false, altKey: false, metaKey: false }) as unknown as PointerEvent

/** Un `SelectHost` minimal : `eventToScreen` lit clientX/clientY, une forme sélectionnable. */
function makeHost(over: Partial<SelectHost> = {}): { host: SelectHost; eraseMarquee: ReturnType<typeof vi.fn> } {
  const shape: Drawing = { id: 's1', kind: 'polygon', points: [], closed: true } as unknown as Drawing
  const eraseMarquee = vi.fn()
  const host: SelectHost = {
    list: () => [shape],
    hitTest: () => shape,
    screenContour: () => ({ pts: [{ x: 0, y: 0 }], closed: true }),
    isSelectable: () => true,
    onLockedHit: () => {},
    selectionChanged: () => {},
    eventToScreen: (e) => ({
      x: (e as unknown as { clientX: number }).clientX,
      y: (e as unknown as { clientY: number }).clientY,
    }),
    interaction: () => defaultConfig.interaction,
    eraseMarquee,
    ...over,
  }
  return { host, eraseMarquee }
}

const NOWHERE: LatLng = { lat: 0, lng: 0 }

/** Trace un marquee rectangle (down → move → up) et renvoie le sélecteur attendu. */
function dragRect(sm: SelectionManager): void {
  sm.handle('down', NOWHERE, at(0, 0))
  sm.handle('move', NOWHERE, at(100, 100))
  sm.handle('up', NOWHERE, at(100, 100))
}

describe('SelectionManager — mode gomme', () => {
  it('un marquee finalisé route vers host.eraseMarquee et NE sélectionne rien', () => {
    const { host, eraseMarquee } = makeHost({ eraseActive: () => true })
    const sm = new SelectionManager(host)
    sm.mode = 'rect'

    dragRect(sm)

    expect(eraseMarquee).toHaveBeenCalledTimes(1)
    const selector = eraseMarquee.mock.calls[0]![0] as ScreenPt[]
    expect(selector.length).toBeGreaterThanOrEqual(3)
    // Aucune forme ne reste sélectionnée : la gomme n'établit pas de sélection.
    expect(sm.ids).toEqual([])
    expect(sm.markerIds).toEqual([])
  })

  it('un clic sur une forme n’établit PAS de sélection en mode gomme', () => {
    const { host, eraseMarquee } = makeHost({ eraseActive: () => true })
    const sm = new SelectionManager(host)

    // down + up au même point (pas de drag) : ni sélection, ni marquee valide (< 3 pts).
    sm.handle('down', NOWHERE, at(50, 50))
    sm.handle('up', NOWHERE, at(50, 50))

    expect(sm.ids).toEqual([])
    expect(eraseMarquee).not.toHaveBeenCalled()
  })

  it('hors mode gomme, un marquee sélectionne (non-régression du mode normal)', () => {
    const { host, eraseMarquee } = makeHost() // pas d'eraseActive → mode sélection normal
    const sm = new SelectionManager(host)
    sm.mode = 'rect'

    dragRect(sm)

    expect(eraseMarquee).not.toHaveBeenCalled()
    expect(sm.ids).toEqual(['s1'])
  })
})
