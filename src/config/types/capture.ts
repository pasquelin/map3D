import type { CaptureBackground, CaptureFormat } from '../../core/capture'

/**
 * Réglages par défaut de la capture d'image (bouton « Prendre une photo » et API
 * `engine.capture()`).
 *
 * ⚠️ Ne contient que des valeurs SÉRIALISABLES : le rasteriseur d'overlay et les
 * callbacks (mail/partage) sont des fonctions, passées en prop `<Map capture>` — jamais
 * dans la config, que le merge profond ne saurait fusionner.
 */
export type CaptureConfig = {
  /** Format par défaut de l'image produite. */
  format: CaptureFormat
  /** Qualité 0..1 pour les formats compressés (jpeg/webp) ; ignorée en png. */
  quality: number
  /** Suréchantillonnage par défaut : ×2 rend plus net que l'affichage, au prix d'une frame lourde. */
  scale: 1 | 2
  /** Fond par défaut (cf. `CaptureBackground` : `'transparent'` retombe sur opaque). */
  background: CaptureBackground
}
