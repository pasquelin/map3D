// Capture d'image de la carte — types partagés par le moteur (`MapEngine.capture`), la
// config (`CaptureConfig`) et la couche React (handle, hook, contexte d'injection).
//
// Le rasteriseur d'overlay et les callbacks sont INJECTÉS par l'hôte : la lib n'embarque
// aucune dépendance de rasterisation DOM (même principe que `SymbolRenderer` et les
// providers de recherche/routage — cf. `docs/ARCHITECTURE.md`).

/** Format d'encodage d'une capture. */
export type CaptureFormat = 'png' | 'jpeg' | 'webp'

/**
 * Fond d'une capture. `'transparent'` est accepté mais retombe aujourd'hui sur le fond
 * opaque du thème : le `WebGLRenderer` de la carte est créé sans canal alpha, la vraie
 * transparence est un chantier séparé. `'opaque'` remplit avec la couleur d'effacement.
 */
export type CaptureBackground = 'opaque' | 'transparent'

/**
 * Rasteriseur de la couche d'overlays DOM (`.m3d-css2d` : markers, labels), INJECTÉ par
 * l'hôte. Doit rendre `el` dans un canvas aux dimensions `width×height` multipliées par
 * `pixelRatio` (pour se superposer pixel-perfect au rendu WebGL suréchantillonné). Sans
 * lui, la capture retombe sur la seule 3D. Compatible avec `toCanvas` de `html-to-image`.
 */
export type OverlayRasterizer = (
  el: HTMLElement,
  opts: { width: number; height: number; pixelRatio: number; backgroundColor: string },
) => Promise<HTMLCanvasElement>

/** Options d'un appel de capture — chaque champ absent retombe sur `config.capture`. */
export type CaptureOptions = {
  /** Format d'encodage. Défaut : `config.capture.format`. */
  format?: CaptureFormat
  /** Qualité 0..1 (jpeg/webp seulement). Défaut : `config.capture.quality`. */
  quality?: number
  /** Suréchantillonnage. Défaut : `config.capture.scale`. */
  scale?: 1 | 2
  /** Fond. Défaut : `config.capture.background`. */
  background?: CaptureBackground
  /**
   * Composer les overlays DOM (markers/labels) par-dessus la 3D. Défaut : `true` si un
   * rasteriseur est disponible. `false` force une capture 3D seule même avec rasteriseur.
   */
  overlay?: boolean
  /** Rasteriseur d'overlay injecté (cf. `OverlayRasterizer`). Absent → 3D seule. */
  rasterizeOverlay?: OverlayRasterizer
}
