// Grille de coordonnées géographiques : décision de maille, engendrement des lignes et
// formatage des coordonnées.
//
// Module PUR — aucun import three, aucun DOM. C'est lui que les tests couvrent, et c'est ce
// qui permet de vérifier l'anti-oscillation de palier sans monter une carte.

import { M_PER_DEG, metersPerPixelAtZoom, zoomForAltitude } from './math'

const MIN = 1 / 60
const SEC = 1 / 3600

/**
 * Échelle des mailles, en degrés décimaux mais **toutes sexagésimales** : 30° 15° 10° 5° 2°
 * 1°, puis les mêmes valeurs en minutes, puis en secondes.
 *
 * C'est cette base 60 qui donne les « 13°42′25″N » d'un atlas. Une échelle décimale
 * (0,5° / 0,1°) produirait des coordonnées qu'aucune carte papier n'affiche, et des
 * étiquettes impossibles à reporter sur un relevé.
 */
export const GRATICULE_LEVELS: readonly number[] = [
  30,
  15,
  10,
  5,
  2,
  1,
  30 * MIN,
  15 * MIN,
  10 * MIN,
  5 * MIN,
  2 * MIN,
  1 * MIN,
  30 * SEC,
  15 * SEC,
  10 * SEC,
  5 * SEC,
  2 * SEC,
  1 * SEC,
]

/**
 * Hauteur visible à l'écran, en degrés de latitude.
 *
 * Dérivée de l'ALTITUDE et non de `MapView.bounds` : les bounds passent par
 * `viewportBounds()`, une grille de 25 raycasts d'ellipsoïde que le moteur réserve
 * explicitement aux consommateurs hors boucle de frame (cf. `MapEngine.tick`). Ici, deux
 * appels de fonctions pures suffisent.
 */
export function visibleSpanDeg(altitude: number, latDeg: number, viewportHeightPx: number): number {
  const mpp = metersPerPixelAtZoom(zoomForAltitude(altitude), latDeg)
  return (mpp * Math.max(1, viewportHeightPx)) / M_PER_DEG
}

/**
 * Maille à afficher : la plus GROSSE qui laisse au moins `targetLines` lignes à l'écran.
 *
 * `previous` (maille courante) et `hysteresis` forment une **bande morte** : sans elle, un
 * zoom arrêté pile sur une frontière de palier rebascule d'une frame à l'autre, et chaque
 * bascule reconstruit toute la géométrie. Ce n'est pas un confort visuel mais la seule chose
 * qui empêche un rebuild en boucle.
 *
 * `range` borne l'échelle (`[min, max]` en degrés) : un hôte peut ainsi FIGER une maille.
 */
export function pickLevel(
  spanDeg: number,
  targetLines: number,
  previous: number | null,
  hysteresis: number,
  range: readonly [number, number] | null,
): number {
  const levels = range ? GRATICULE_LEVELS.filter((l) => l >= range[0] && l <= range[1]) : GRATICULE_LEVELS
  // `range` plus étroit que tout palier : on retombe sur sa borne basse plutôt que sur rien —
  // une grille figée hors échelle vaut mieux qu'une grille absente.
  if (levels.length === 0) return range ? range[0] : GRATICULE_LEVELS[GRATICULE_LEVELS.length - 1]!
  const best = levels.find((l) => spanDeg / l >= targetLines) ?? levels[levels.length - 1]!
  if (previous === null || !levels.includes(previous) || previous === best) return best
  // Bande morte : on ne quitte la maille courante que si l'écart de densité la dépasse.
  const ratio = spanDeg / previous / targetLines
  const dehors = ratio > 1 + hysteresis || ratio < 1 / (1 + hysteresis)
  return dehors ? best : previous
}
