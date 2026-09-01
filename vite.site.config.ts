/*
 * Bundle du décor de la vitrine (`site/bg/globe.ts`) → `site/assets/bg.js`.
 *
 * Séparé de `vite.config.ts` : celui-là construit la LIBRAIRIE et externalise three,
 * alors qu'ici three doit être embarqué — la page n'a ni bundler ni import map. Les
 * imports nommés laissent le tree-shaking écarter tout ce que le décor n'utilise pas
 * (loaders, matériaux, lumières, contrôles), soit l'essentiel de three.
 */
import { defineConfig } from 'vite'

export default defineConfig({
  build: {
    outDir: 'site/assets',
    emptyOutDir: false,
    target: 'es2020',
    sourcemap: false,
    lib: {
      entry: 'site/bg/globe.ts',
      formats: ['es'],
      fileName: () => 'bg.js',
    },
  },
})
