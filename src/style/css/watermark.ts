import { BAR_INSET } from '../panelGeometry'

/**
 * Zone de clic de la signature « map3D » (le mark VISIBLE, lui, est peint dans le canvas
 * WebGL par `Watermark` — voir `src/core/Watermark.ts`). Même retrait que la lecture de
 * la vue (`--m3d-bar-inset`), pour se poser exactement sur la marque peinte, à MARGIN des
 * deux bords bas-droite.
 *
 * Texte TRANSPARENT : la zone épouse la marque sans la redoubler à l'écran (les pixels
 * viennent du canvas). La police reprend le corps/graisse du rendu WebGL pour que la
 * boîte de clic coïncide avec les glyphes peints. `color-scheme` mis à part, ce meuble
 * ne dépend d'aucun token de thème : l'attribution ne doit pas pouvoir être neutralisée
 * par un thème hôte.
 */
export const CSS_WATERMARK = `
.m3d-watermark{position:absolute;z-index:var(--m3d-z-ui,999);
  right:var(--m3d-bar-inset, ${BAR_INSET}px);bottom:var(--m3d-bar-inset, ${BAR_INSET}px);
  pointer-events:auto;cursor:pointer;color:transparent;
  font:600 13px system-ui,-apple-system,'Segoe UI',Roboto,sans-serif;
  line-height:1.4;text-decoration:none;user-select:none;-webkit-tap-highlight-color:transparent}
`
