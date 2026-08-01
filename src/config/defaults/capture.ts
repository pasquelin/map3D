import type { CaptureConfig } from '../types'

/** Défauts de capture : PNG net (sans perte), suréchantillonnage neutre, fond opaque. */
export const captureDefaults: CaptureConfig = {
  format: 'png',
  quality: 0.92,
  scale: 1,
  background: 'opaque',
}
