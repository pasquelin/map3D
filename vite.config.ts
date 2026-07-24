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
        'supercluster',
        /^3d-tiles-renderer/,
      ],
      output: {
        globals: { react: 'React', 'react-dom': 'ReactDOM', three: 'THREE' },
      },
    },
    sourcemap: true,
    target: 'es2020',
    minify: false,
  },
})
