import js from '@eslint/js'
import reactHooks from 'eslint-plugin-react-hooks'
import tseslint from 'typescript-eslint'

// Raison d'être de ce fichier : une vingtaine de
// `// eslint-disable-next-line react-hooks/exhaustive-deps` vivaient dans le code sans
// qu'aucun ESLint ne tourne. Ils documentaient une intention que rien ne vérifiait —
// et c'est exactement dans un tableau de dépendances qu'une config périmée est passée
// inaperçue.
export default tseslint.config(
  { ignores: ['dist', 'node_modules', 'examples/*/dist', 'eslint.config.js'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.{ts,tsx}'],
    plugins: { 'react-hooks': reactHooks },
    rules: {
      ...reactHooks.configs.recommended.rules,

      // LA règle pour laquelle cette configuration existe.
      'react-hooks/exhaustive-deps': 'warn',

      // `any` est déjà absent du code : la règle est là pour qu'il le reste.
      '@typescript-eslint/no-explicit-any': 'error',
      // Le préfixe `_` reste la façon d'assumer un paramètre ignoré (signatures de
      // callbacks imposées, `JSON.stringify` et son `_k`).
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],

      // ── Règles du React Compiler, désactivées SCIEMMENT ─────────────────────────
      // Elles supposent un code que le compilateur va mémoïser, où l'état vit dans
      // React. Ici l'état vit dans `MapEngine` : une carte est un moteur impératif
      // (three.js, tuiles, couches) que React pilote, et le « latest ref pattern »
      // (`ref.current = props` au render, lu par un handler qui survit à ses renders)
      // est le moyen assumé de donner à ces closures la valeur courante — il est
      // documenté à chacun de ses ~97 emplois. Les activer produirait un mur de bruit
      // sur du code délibéré, et c'est ainsi qu'on apprend à ignorer un linter.
      // À reconsidérer si la lib passe un jour au React Compiler.
      'react-hooks/refs': 'off',
      'react-hooks/immutability': 'off',
      'react-hooks/set-state-in-effect': 'off',
      'react-hooks/use-memo': 'off',
    },
  },
  {
    // Outils de l'exemple écrits en JS pur : la sonde de perf n'est ni buildée ni
    // bundlée, elle se charge à la main dans la console du navigateur (cf. son mode
    // d'emploi). Elle échappe donc au `tsc` qui couvre tout le reste — et c'est
    // précisément pourquoi `no-undef` la frappe, alors qu'il est neutralisé sur les
    // fichiers TS, où c'est TypeScript qui répond.
    //
    // Les globals sont déclarés UN PAR UN plutôt que par un `no-undef: off` : la règle
    // garde ainsi son seul intérêt ici, attraper une coquille sur un nom de variable.
    files: ['examples/*/tools/**/*.js'],
    languageOptions: {
      globals: {
        PerformanceObserver: 'readonly',
        console: 'readonly',
        document: 'readonly',
        navigator: 'readonly',
        performance: 'readonly',
        requestAnimationFrame: 'readonly',
        setTimeout: 'readonly',
      },
    },
  },
)
