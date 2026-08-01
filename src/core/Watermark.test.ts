import { describe, expect, it } from 'vitest'
import type { Camera, Object3D, OrthographicCamera, Scene, WebGLRenderer } from 'three'
import { Watermark } from './Watermark'

/** Renderer minimal : on n'observe que ce que `Watermark.render` touche. */
function mockRenderer() {
  const calls: { autoClearAtRender: boolean; scene: Object3D; camera: Camera }[] = []
  const renderer = {
    autoClear: true,
    render(scene: Object3D, camera: Camera) {
      // `this.autoClear` capturé AU MOMENT du rendu : c'est le point du contrat.
      calls.push({ autoClearAtRender: renderer.autoClear, scene, camera })
    },
  }
  return { renderer: renderer as unknown as WebGLRenderer, calls, raw: renderer }
}

function last<T>(a: readonly T[]): T {
  const v = a[a.length - 1]
  if (v === undefined) throw new Error('aucun appel enregistré')
  return v
}

describe('Watermark', () => {
  it('coupe autoClear pendant le rendu (sinon la carte déjà peinte serait effacée)', () => {
    const { renderer, calls } = mockRenderer()
    const wm = new Watermark()
    wm.render(renderer)
    expect(calls).toHaveLength(1)
    expect(last(calls).autoClearAtRender).toBe(false)
  })

  it('restaure la valeur précédente de autoClear après le rendu', () => {
    const { renderer, calls, raw } = mockRenderer()
    const wm = new Watermark()

    wm.render(renderer)
    expect(raw.autoClear).toBe(true)

    raw.autoClear = false
    wm.render(renderer)
    expect(raw.autoClear).toBe(false)
    // Toujours coupé PENDANT le rendu, quelle que soit la valeur restaurée.
    expect(last(calls).autoClearAtRender).toBe(false)
  })

  it('rend une scène à quad unique', () => {
    const { renderer, calls } = mockRenderer()
    const wm = new Watermark()
    wm.render(renderer)
    expect((last(calls).scene as Scene).children).toHaveLength(1)
  })

  it('setSize recadre la caméra ortho sur la taille du viewport', () => {
    const { renderer, calls } = mockRenderer()
    const wm = new Watermark()
    wm.setSize(800, 600)
    wm.render(renderer)
    const cam = last(calls).camera as OrthographicCamera
    expect(cam.right).toBe(800)
    expect(cam.top).toBe(600)
  })

  it('dispose ne lève pas', () => {
    const wm = new Watermark()
    expect(() => wm.dispose()).not.toThrow()
  })
})
