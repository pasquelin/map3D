import { describe, it, expect } from 'vitest'
import { injectStyles } from './injectStyles'

// Garde-fou léger : l'assemblage des fragments (src/style/css/*.ts) doit toujours produire
// une feuille non vide couvrant les grands domaines de la charte. Pas de hash ici (fragile
// au moindre octet) — juste la présence de quelques sélecteurs clés par fragment.
describe('injectStyles', () => {
  it('injects a non-empty <style> covering the assembled fragments', () => {
    const doc = document.implementation.createHTMLDocument()
    injectStyles(doc)
    const style = doc.getElementById('m3d-styles')
    expect(style).not.toBeNull()
    const css = style?.textContent ?? ''
    expect(css.length).toBeGreaterThan(1000)
    // un sélecteur représentatif par grand domaine assemblé
    expect(css).toContain('.m3d-root{')
    expect(css).toContain('.m3d-marker,.m3d-cluster{')
    expect(css).toContain('.m3d-relbar{')
    expect(css).toContain('.m3d-panel,')
    expect(css).toContain('.m3d-catalog{')
    expect(css).toContain('.m3d-search{')
    expect(css).toContain('.m3d-pindock-wrap{')
    expect(css).toContain('.m3d-lenszone{')
    expect(css).toContain('@media(prefers-reduced-motion:reduce)')
  })

  it('re-syncs an already-injected stylesheet in place (HMR path)', () => {
    const doc = document.implementation.createHTMLDocument()
    injectStyles(doc)
    const first = doc.getElementById('m3d-styles')
    injectStyles(doc)
    expect(doc.getElementById('m3d-styles')).toBe(first)
    expect(doc.querySelectorAll('#m3d-styles').length).toBe(1)
  })
})
