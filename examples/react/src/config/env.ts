/**
 * Clés d'API de la démo, lues dans `.env` (cf. `.env.example`). Leur typage vit dans
 * `src/vite-env.d.ts`, l'endroit prévu par Vite — le reste de l'exemple importe deux
 * constantes et ne connaît plus `import.meta`.
 */
export const CESIUM_ION_TOKEN = import.meta.env.VITE_CESIUM_ION_TOKEN
export const GOOGLE_MAPS_KEY = import.meta.env.VITE_GOOGLE_MAPS_KEY
