import { resolve } from 'node:path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// App d'exemple : carte 3D plein écran.
// La librairie est aliasée vers les sources pour un dev en direct (HMR).
export default defineConfig({
  root: resolve(__dirname),
  plugins: [react()],
  resolve: {
    alias: {
      map3d: resolve(__dirname, '../../src/index.ts'),
      '@map3d/plugin-geopf': resolve(__dirname, '../../../plugingsMap3D/packages/geopf/src/index.ts'),
      '@map3d/plugin-windy': resolve(__dirname, '../../../plugingsMap3D/packages/windy/src/index.ts'),
      '@map3d/plugin-plan-3d': resolve(__dirname, '../../../plugingsMap3D/packages/plan-3d/src/index.ts'),
      'three/addons': resolve(__dirname, '../../node_modules/three/examples/jsm'),
    },
    /*
     * Les plugins vivent dans un AUTRE projet pnpm (`../../../plugingsMap3D`), avec son
     * propre store : `import 'three'` y résolvait vers une seconde copie physique — même
     * version, autre module. three le signale lui-même (« Multiple instances of Three.js
     * being imported ») et il a raison : deux copies, ce sont deux registres de classes,
     * donc des `instanceof` faux, un `three-mesh-bvh` qui greffe son raycast sur la
     * mauvaise `BufferGeometry`, et un `WebGLRenderer` qui ne reconnaît pas les
     * matériaux de l'autre.
     *
     * `dedupe` et NON un alias vers le dossier : l'alias court-circuite le champ
     * `exports` du paquet et change la façon dont trois sous-chemins sont résolus.
     * `dedupe` ne fait qu'imposer une seule copie, sans toucher à l'algorithme.
     */
    dedupe: ['three'],
  },
  server: { port: 5173 },
  build: { outDir: resolve(__dirname, 'dist') },
})
