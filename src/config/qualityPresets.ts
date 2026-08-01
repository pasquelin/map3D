// Presets de qualité 3D — des bundles de leviers PERFORMANCE, façon menu graphique de
// jeu vidéo : trois niveaux nommés, aucun curseur.
//
// Chaque preset ne pilote que des réglages APPLICABLES À CHAUD (cf. `MapEngine.setConfig`) :
// résolution de rendu, budgets du volume 3D, ciel, anisotropie. `antialias` et
// `powerPreference` en sont VOLONTAIREMENT absents — ils sont lus à la création du
// contexte WebGL, donc les changer exigerait un remontage (flash) : ce sont des choix
// matériel de l'application hôte, pas un réglage que l'utilisateur bascule en direct.
//
// Les valeurs reprennent celles calibrées dans `defaultConfig` — le niveau « Élevé » en
// est proche (à un cran près sur `adaptiveResolution.minRatio` : 0.75 ici, 0.5 en défaut
// lib) — et descendent selon les repères que ses commentaires donnent
// explicitement — au premier chef le budget des bâtiments, « ELLE qu'il faut baisser sur
// une machine modeste (perte de contexte WebGL sinon) ».

import type { PartialConfig } from './types'

export type QualityLevel = 'high' | 'medium' | 'low'

/**
 * Capacités matérielles sondées — SSR-safe : chaque valeur retombe sur un neutre quand
 * l'API manque, jamais sur une exception.
 */
export type DeviceCaps = {
  /** Cœurs logiques (`navigator.hardwareConcurrency`), 4 par défaut. */
  cores: number
  /** Go de RAM estimés (`navigator.deviceMemory`) — `0` si inconnu (Safari/Firefox). */
  memory: number
  /** `devicePixelRatio` courant. */
  dpr: number
}

export function detectDeviceCaps(): DeviceCaps {
  const nav = typeof navigator !== 'undefined' ? navigator : undefined
  const cores = nav?.hardwareConcurrency ?? 4
  // `deviceMemory` n'existe que sur Chromium ; absent ailleurs. `0` = inconnu.
  const memory = (nav as { deviceMemory?: number } | undefined)?.deviceMemory ?? 0
  const dpr = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1
  return { cores, memory, dpr }
}

/**
 * Niveau déduit de la machine. Heuristique volontairement simple et PRUDENTE : comme
 * `deviceMemory` est absent hors Chromium, un `0` (inconnu) ne rétrograde jamais à lui
 * seul — seul un compte de cœurs bas fait descendre.
 */
export function detectQuality(caps: DeviceCaps = detectDeviceCaps()): QualityLevel {
  const { cores, memory } = caps
  if (cores >= 8 && (memory === 0 || memory >= 8)) return 'high'
  if (cores >= 4) return 'medium'
  return 'low'
}

/**
 * Le `PartialConfig` d'un niveau — exactement ce qu'une application écrirait à la main
 * dans `config={{ … }}`, prêt à merger par-dessus la config hôte.
 *
 * `caps` ne sert qu'au `pixelRatio` : le monter au-dessus de 1 n'a de sens que sur un
 * écran haute densité, et jamais au-delà de 2 (au-delà, les pixels à remplir explosent
 * sans gain visible). Sur un écran 1×, « Élevé » reste donc à 1.
 */
export function qualityPreset(level: QualityLevel, caps: DeviceCaps = detectDeviceCaps()): PartialConfig {
  const retina = Math.min(caps.dpr, 2)
  switch (level) {
    case 'high':
      return {
        performance: {
          pixelRatio: retina,
          adaptiveResolution: { minRatio: 0.75, targetFrameMs: 22 },
          textureAnisotropy: 0,
        },
        providers: {
          tiles: { retina: retina > 1 },
          buildings: { maxViewDistance: 5000, maxTiles: 80, maxBytes: 448 * 1024 * 1024, maxRequest: 49 },
        },
        sky: { enabled: true, clouds: { coverage: 0.35 } },
      }
    case 'medium':
      return {
        performance: {
          pixelRatio: 1,
          adaptiveResolution: { minRatio: 0.5, targetFrameMs: 22 },
          textureAnisotropy: 4,
        },
        providers: {
          tiles: { retina: false },
          buildings: { maxViewDistance: 3500, maxTiles: 48, maxBytes: 256 * 1024 * 1024, maxRequest: 32 },
        },
        sky: { enabled: true, clouds: { coverage: 0.2 } },
      }
    case 'low':
      return {
        performance: {
          pixelRatio: 1,
          adaptiveResolution: { minRatio: 0.4, targetFrameMs: 28 },
          textureAnisotropy: 1,
        },
        providers: {
          tiles: { retina: false },
          buildings: { maxViewDistance: 2000, maxTiles: 24, maxBytes: 128 * 1024 * 1024, maxRequest: 16 },
        },
        // Le ciel atmosphérique est un shader plein écran au ras du sol : le couper est
        // le plus gros gain unitaire sur un GPU intégré.
        sky: { enabled: false },
      }
  }
}
