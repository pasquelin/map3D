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
      entry: {
        index: resolve(__dirname, 'src/index.ts'),
        // Entrée à part (`@pasquelin/map3d/cesium-ion`) : la seule à importer le greffon
        // Cesium ion. Elle ne partage aucun code d'exécution avec `index`, qui ne l'importe pas.
        'cesium-ion': resolve(__dirname, 'src/cesium-ion.ts'),
      },
      formats: ['es', 'cjs'],
      fileName: (format, entryName) => `${entryName}.${format === 'es' ? 'js' : 'cjs'}`,
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
        // Le SDK MIL-STD (~9,7 Mo) reste une dépendance installée avec le paquet et chargée
        // par `import()` : l'embarquer le dupliquait dans dist/ (ESM + CJS = 19 Mo).
        /^@armyc2\.c5isr\.renderer\//,
      ],

      output: {
        globals: { react: 'React', 'react-dom': 'ReactDOM', three: 'THREE' },
        // Directive « client » sur les POINTS D'ENTRÉE : la carte est intrinsèquement
        // cliente (WebGL, hooks, DOM). Sans elle, un simple `import` depuis un React
        // Server Component (Next App Router) casse le build serveur. Le banner Rollup
        // est posé AVANT les imports, seul endroit où Next/RSC la reconnaît.
        //
        // Les entrées seules — `cesium-ion` comprise, dont la source ne se construit que côté
        // client (elle porte une fonction, qu'un Server Component ne peut pas passer) : les
        // chunks chargés dynamiquement (worker de volume, construction de tuile) le sont déjà
        // par `index`, et marquer tous les chunks empêcherait d'exposer un jour un sous-chemin
        // server-safe sans revoir la règle.

        banner: (chunk) => (chunk.isEntry ? "'use client';" : ''),
      },
    },
    // Pas de source maps dans le paquet publié : elles pesaient ~40 Mo (plus que tout le
    // reste), pour un gain nul en dev — l'exemple consomme les SOURCES via l'alias vite, pas
    // `dist/`. Un consommateur qui veut déboguer dans la lib construit depuis la source.
    sourcemap: false,
    target: 'es2020',
    minify: false,
  },
})
