import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { DragRegistry } from '../../core/DragRegistry'
import type { MapEngine } from '../../core/MapEngine'
import { defaultTheme } from '../../theme/defaultTheme'
import { MapContext } from '../context'
import { DragOverlay } from './DragOverlay'

describe('DragOverlay — ghost', () => {
  let root: Root
  let container: HTMLDivElement
  /** Racine de carte factice (`.m3d-root`) : parent de l'overlay, porte `m3d-dragging`. */
  let mapRoot: HTMLDivElement
  let overlay: HTMLDivElement
  let drag: DragRegistry
  const ghostEl = () => container.querySelector<HTMLElement>('.m3d-drag-ghost')

  beforeEach(() => {
    ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
    drag = new DragRegistry()
    // Conteneur React DISTINCT de la racine carte : `createRoot` vide son conteneur au
    // premier rendu, ce qui détacherait l'overlay de son parent.
    container = document.createElement('div')
    mapRoot = document.createElement('div')
    overlay = document.createElement('div')
    mapRoot.appendChild(overlay)
    document.body.append(mapRoot, container)
    root = createRoot(container)
    act(() => {
      root.render(
        createElement(
          MapContext.Provider,
          { value: { engine: { drag } as unknown as MapEngine, overlay, theme: defaultTheme } },
          createElement(DragOverlay),
        ),
      )
    })
  })
  afterEach(() => {
    act(() => root.unmount())
    container.remove()
    mapRoot.remove()
  })

  it('naît au début du drag, positionné, et suit le pointeur SANS être remonté', () => {
    expect(ghostEl()).toBeNull()
    act(() => drag.begin({ type: 't', id: 1 }, 'charge', 10, 20))
    const first = ghostEl()!
    expect(first).not.toBeNull()
    expect(first.textContent).toBe('charge')
    expect(first.style.left).toBe('10px')
    expect(first.style.top).toBe('20px')
    expect(mapRoot.classList.contains('m3d-dragging')).toBe(true)

    act(() => drag.move(110, 220, null))
    const moved = ghostEl()!
    // Même nœud : la position est écrite dessus, pas obtenue par un nouveau rendu.
    expect(moved).toBe(first)
    expect(moved.style.left).toBe('110px')
    expect(moved.style.top).toBe('220px')
  })

  it('disparaît à la fin du drag, et le conteneur perd sa classe', () => {
    act(() => drag.begin({ type: 't', id: 1 }, 'charge', 10, 20))
    expect(ghostEl()).not.toBeNull()
    act(() => drag.cancel())
    expect(ghostEl()).toBeNull()
    expect(mapRoot.classList.contains('m3d-dragging')).toBe(false)
  })
})
