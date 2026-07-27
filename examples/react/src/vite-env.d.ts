/// <reference types="vite/client" />

/** Variables de `.env` (cf. `.env.example`) — déclarées là où Vite les attend. */
interface ImportMetaEnv {
  readonly VITE_CESIUM_ION_TOKEN?: string
  readonly VITE_GOOGLE_MAPS_KEY?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
