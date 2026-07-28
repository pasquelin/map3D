/**
 * Réglages d'environnement de la démo, lus dans `.env` (cf. `.env.example`). Leur typage
 * vit dans `src/vite-env.d.ts`, l'endroit prévu par Vite — le reste de l'exemple importe
 * ces constantes et ne connaît plus `import.meta`.
 */
export const CESIUM_ION_TOKEN = import.meta.env.VITE_CESIUM_ION_TOKEN
export const GOOGLE_MAPS_KEY = import.meta.env.VITE_GOOGLE_MAPS_KEY
/**
 * Origine du serveur de tuiles auto-hébergé. Ici plutôt qu'en dur : la même démo tourne
 * sur un poste de dev (`http://localhost:8090`) et sur un domaine de production.
 */
export const TILE_ORIGIN = import.meta.env.VITE_TILE_ORIGIN
