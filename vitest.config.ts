import { resolve } from 'node:path'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    // `jsdom` uniquement pour ce dont les fonctions pures ont réellement besoin :
    // `navigator.language` (résolution de locale) et `Response` (politique réseau).
    environment: 'jsdom',
    // L'exemple est inclus : son banc d'essai déduit ses contrôleurs de `defaultConfig`,
    // et le seul garde-fou contre un libellé anglais qui apparaîtrait tout seul est un
    // test (cf. `examples/react/src/config/configLabels.test.ts`).
    include: ['src/**/*.test.ts', 'examples/**/*.test.ts'],
  },
  // L'exemple importe la lib par son nom public, comme le ferait une application.
  resolve: { alias: { '@pasquelin/map3d': resolve(__dirname, 'src/index.ts') } },
})
