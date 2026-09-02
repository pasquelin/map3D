/// <reference types="vite/client" />

/** Variables de `.env` (cf. `.env.example`) — déclarées là où Vite les attend. */
interface ImportMetaEnv {
  readonly VITE_CESIUM_ION_TOKEN?: string
  readonly VITE_GOOGLE_MAPS_KEY?: string
  /** Origine du serveur de tuiles auto-hébergé (fournisseur `internal`). */
  readonly VITE_TILE_ORIGIN?: string
  /** Clé Windy Webcams — défaut du champ `apiKey` du plugin optionnel `windy`. */
  readonly VITE_WINDY_API_KEY?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
