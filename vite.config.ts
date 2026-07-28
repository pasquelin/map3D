import { resolve } from 'node:path'
import { defineConfig } from 'vite'
import dts from 'vite-plugin-dts'

// Build de la librairie (library mode) — ESM + CJS + types.
// L'exemple utilise sa propre config : examples/react/vite.config.ts
export default defineConfig({
  plugins: [
    dts({
      include: ['src'],
      rollupTypes: true,
      tsconfigPath: resolve(__dirname, 'tsconfig.json'),
    }),
  ],
  build: {
    lib: {
      entry: resolve(__dirname, 'src/index.ts'),
      formats: ['es', 'cjs'],
      fileName: (format) => (format === 'es' ? 'index.js' : 'index.cjs'),
    },
    rollupOptions: {
      // Rien de ce qui est externe ne doit être embarqué dans le bundle.
      external: [
        'react',
        'react-dom',
        'react/jsx-runtime',
        'three',
        'three-mesh-bvh',
        'supercluster',
        /^3d-tiles-renderer/,
      ],
      output: {
        globals: { react: 'React', 'react-dom': 'ReactDOM', three: 'THREE' },
        // Directive « client » sur le POINT D'ENTRÉE : la carte est intrinsèquement
        // cliente (WebGL, hooks, DOM). Sans elle, un simple `import` depuis un React
        // Server Component (Next App Router) casse le build serveur. Le banner Rollup
        // est posé AVANT les imports, seul endroit où Next/RSC la reconnaît.
        //
        // L'entrée seule : un chunk chargé dynamiquement (le catalogue de symboles,
        // ~9 Mo) l'est déjà par elle, et marquer tous les chunks empêcherait d'exposer
        // un jour un sous-chemin server-safe sans revoir la règle.
        banner: (chunk) => (chunk.isEntry ? "'use client';" : ''),
      },
    },
    sourcemap: true,
    target: 'es2020',
    minify: false,
  },
})
