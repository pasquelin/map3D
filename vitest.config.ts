import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    // `jsdom` uniquement pour ce dont les fonctions pures ont réellement besoin :
    // `navigator.language` (résolution de locale) et `Response` (politique réseau).
    environment: 'jsdom',
    include: ['src/**/*.test.ts'],
  },
})
