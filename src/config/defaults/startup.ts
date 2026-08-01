import type { StartupConfig } from '../types'

export const startupDefaults: StartupConfig = {
  introDuration: 3.0,
  introMaxWaitMs: 8_000,
  readyMaxWaitMs: 8_000,
  // ⚠️ Nouveaux : le fondu vivait dans le CSS, l'altitude et la taille de repli
  // dans le code. Valeurs reprises à l'identique.
  introFadeMs: 500,
  introAltitudeFactor: 1,
  fallbackSize: [800, 600],
}
