// @vitest-environment node
import { describe, expect, it, vi } from 'vitest'

// Garde-fou SSR : importer le point d'entrée public depuis un environnement SANS DOM
// (Next/Remix côté serveur, Node 18/20, edge runtimes) ne doit toucher ni `window`, ni
// `document`, ni `navigator` au niveau module. Node ≥ 21 expose un `navigator` global :
// on le retire pour reproduire les runtimes qui ne l'ont pas.
describe('SSR', () => {
  // L'import transforme et charge TOUTE la lib (three, tuiles, couches) : ~1 s à vide,
  // mais au-delà des 5 s par défaut quand la machine fait tourner d'autres suites.
  it('importe `src/index.ts` sans window, document ni navigator', { timeout: 30_000 }, async () => {
    vi.stubGlobal('navigator', undefined)
    vi.stubGlobal('window', undefined)
    vi.stubGlobal('document', undefined)
    try {
      const mod = await import('../index')
      expect(mod.Map).toBeDefined()
      expect(mod.MapProvider).toBeDefined()
    } finally {
      vi.unstubAllGlobals()
    }
  })
})
