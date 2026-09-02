import { afterEach, describe, expect, it } from 'vitest'
import type { MapEngine } from '../core/MapEngine'
import { isActiveMap, registerActiveMap } from './activeMap'

// Moteurs factices : seule l'IDENTITÉ compte pour la carte active.
const fakeEngine = (): MapEngine => ({}) as MapEngine

const mount = () => {
  const root = document.createElement('div')
  document.body.appendChild(root)
  const engine = fakeEngine()
  const off = registerActiveMap(engine, root)
  return { root, engine, off }
}

describe('activeMap', () => {
  const cleanups: Array<() => void> = []
  afterEach(() => {
    cleanups.splice(0).forEach((f) => f())
    document.body.innerHTML = ''
  })

  it('un moteur jamais enregistré est actif (aucune carte montée)', () => {
    expect(isActiveMap(fakeEngine())).toBe(true)
  })

  it('une seule carte montée est toujours active, sans clic préalable', () => {
    const a = mount()
    cleanups.push(a.off)
    expect(isActiveMap(a.engine)).toBe(true)
  })

  it('avec deux cartes, la première montée est active par défaut', () => {
    const a = mount()
    const b = mount()
    cleanups.push(a.off, b.off)
    expect(isActiveMap(a.engine)).toBe(true)
    expect(isActiveMap(b.engine)).toBe(false)
  })

  it('un pointerdown dans la racine désigne la carte active', () => {
    const a = mount()
    const b = mount()
    cleanups.push(a.off, b.off)
    const inner = document.createElement('button')
    b.root.appendChild(inner)
    inner.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }))
    expect(isActiveMap(b.engine)).toBe(true)
    expect(isActiveMap(a.engine)).toBe(false)
  })

  it('un focusin dans la racine désigne la carte active, même si la propagation est stoppée', () => {
    const a = mount()
    const b = mount()
    cleanups.push(a.off, b.off)
    const inner = document.createElement('input')
    b.root.appendChild(inner)
    // Un composant peut stopper la propagation : la détection écoute en capture.
    inner.addEventListener('focusin', (e) => e.stopPropagation())
    inner.dispatchEvent(new FocusEvent('focusin', { bubbles: true }))
    expect(isActiveMap(b.engine)).toBe(true)
    expect(isActiveMap(a.engine)).toBe(false)
  })

  it('au démontage de la carte active, la première restante prend le relais', () => {
    const a = mount()
    const b = mount()
    const c = mount()
    cleanups.push(a.off, c.off)
    b.root.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }))
    expect(isActiveMap(b.engine)).toBe(true)
    b.off()
    expect(isActiveMap(a.engine)).toBe(true)
    expect(isActiveMap(c.engine)).toBe(false)
  })

  it("le démontage retire l'écouteur : un clic ultérieur sur le nœud ne fait rien", () => {
    const a = mount()
    const b = mount()
    cleanups.push(a.off)
    b.off()
    b.root.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }))
    expect(isActiveMap(a.engine)).toBe(true)
  })
})
