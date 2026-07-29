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
      '@map3d/plugin-demo': resolve(__dirname, '../../../plugingsMap3D/packages/demo/src/index.ts'),
      'three/addons': resolve(__dirname, '../../node_modules/three/examples/jsm'),
    },
  },
  server: { port: 5173 },
  build: { outDir: resolve(__dirname, 'dist') },
})
