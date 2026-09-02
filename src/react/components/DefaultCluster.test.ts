import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { defaultConfig } from '../../config/defaultConfig'
import { defaultTheme } from '../../theme/defaultTheme'
import { DefaultCluster } from './DefaultCluster'

const cluster = { total: 5, counts: { a: 3, b: 2 }, types: ['a', 'b'], position: { lat: 0, lng: 0 } }
const tipCfg = defaultConfig.interaction.tooltip

const pointer = (type: string, x: number, y: number) =>
  new PointerEvent(type, { bubbles: true, clientX: x, clientY: y, pointerType: 'mouse' })

/** La vignette est portée à `document.body`, hors du conteneur de rendu. */
const tipEl = (container: HTMLElement): HTMLElement | null => {
  for (const el of Array.from(document.body.children)) {
    if (el !== container && el instanceof HTMLElement && el.style.position === 'fixed') return el
  }
  return null
}

describe('DefaultCluster — vignette de part', () => {
  let root: Root
  let container: HTMLDivElement
  beforeEach(() => {
    ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
    act(() => {
      root.render(createElement(DefaultCluster, { cluster, theme: defaultTheme, typeLabel: (t) => `Type ${t}` }))
    })
  })
  afterEach(() => {
    act(() => root.unmount())
    container.remove()
  })

  it("apparaît à l'entrée dans une part, avec le libellé et le compte du type", () => {
    const part = container.querySelector('.m3d-cluster-sat')!
    expect(tipEl(container)).toBeNull()
    act(() => {
      part.dispatchEvent(pointer('pointerover', 300, 400))
    })
    const tip = tipEl(container)!
    expect(tip).not.toBeNull()
    expect(tip.textContent).toContain('Type a')
    expect(tip.textContent).toContain('3')
    expect(tip.style.left).toBe('300px')
    expect(tip.style.top).toBe(`${400 - tipCfg.offsetAbovePx}px`)
  })

  it('suit le pointeur sans être remontée, et se retourne sous lui près du haut', () => {
    const part = container.querySelector('.m3d-cluster-sat')!
    act(() => {
      part.dispatchEvent(pointer('pointerover', 300, 400))
    })
    const before = tipEl(container)!
    act(() => {
      part.dispatchEvent(pointer('pointermove', 350, 20))
    })
    const after = tipEl(container)!
    // Même nœud : la position est écrite dessus, pas obtenue par un nouveau rendu.
    expect(after).toBe(before)
    expect(after.style.left).toBe('350px')
    expect(after.style.top).toBe(`${20 + tipCfg.offsetBelowPx}px`)
    expect(after.style.transform).toBe('translate(-50%, 0)')
  })

  it('est clampée aux bords de la fenêtre', () => {
    const part = container.querySelector('.m3d-cluster-sat')!
    act(() => {
      part.dispatchEvent(pointer('pointerover', 2, 400))
    })
    expect(tipEl(container)!.style.left).toBe(`${tipCfg.clampMarginPx}px`)
  })

  it('disparaît à la sortie de la part', () => {
    const part = container.querySelector('.m3d-cluster-sat')!
    act(() => {
      part.dispatchEvent(pointer('pointerover', 300, 400))
    })
    expect(tipEl(container)).not.toBeNull()
    act(() => {
      part.dispatchEvent(pointer('pointerout', 300, 400))
    })
    expect(tipEl(container)).toBeNull()
  })
})
