import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

/**
 * Dépôt voisin des plugins officiels (`plugingsMap3D`), OPTIONNEL : l'exemple le découvre par
 * `import.meta.glob` (cf. `src/plugins.ts`) et tourne sans lui. Sa présence ne change ici
 * qu'une chose : ses sources doivent être SERVABLES en dev — elles sont hors de la racine du
 * workspace, que Vite refuse de servir par défaut (`server.fs.allow`).
 */
const PLUGINS_REPO = resolve(__dirname, '../../../plugingsMap3D')
const pluginsRepoFound = existsSync(PLUGINS_REPO)

// App d'exemple : carte 3D plein écran.
// La librairie est aliasée vers les sources pour un dev en direct (HMR).
export default defineConfig({
  root: resolve(__dirname),
  plugins: [react()],
  resolve: {
    alias: {
      '@pasquelin/map3d': resolve(__dirname, '../../src/index.ts'),
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
  server: {
    port: 5173,
    // Uniquement si le dépôt est là : un chemin absent dans `allow` n'est pas une erreur,
    // mais il documenterait une intention que rien ne vérifie.
    ...(pluginsRepoFound && { fs: { allow: [resolve(__dirname, '../..'), PLUGINS_REPO] } }),
  },
  build: { outDir: resolve(__dirname, 'dist') },
})
