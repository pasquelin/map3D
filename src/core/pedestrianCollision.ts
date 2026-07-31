/**
 * Impact d'un palpeur, exprimé dans le **plan tangent local** : la direction du rayon
 * (est/nord, normalisée) et la distance à l'obstacle.
 *
 * La normale du mur est approximée par l'OPPOSÉ de cette direction. Les tuiles
 * photoréalistes sont un maillage fusionné issu de photogrammétrie : `face.normal` y est
 * bruitée et vit en espace objet — la transformer coûterait plus cher que le gain, pour un
 * résultat moins stable. Avec 6 à 8 palpeurs, l'approximation suffit à longer un mur.
 */
import { approach } from './math'

export type FeelerHit = {
  dirEast: number
  dirNorth: number
  distance: number
}

/** Déplacement dans le plan tangent local (mètres). */
export type LocalMove = {
  east: number
  north: number
}

/**
 * Déplacement corrigé par les palpeurs : la composante qui ENTRE dans un mur est retirée,
 * la tangente est conservée — on longe la façade au lieu de s'y coller.
 *
 * Annuler tout le déplacement (le réflexe naïf) rend la marche en ville insupportable : le
 * moindre frôlement d'angle stoppe net.
 */
export function slideMove(move: LocalMove, hits: readonly FeelerHit[], radiusMeters: number): LocalMove {
  let east = move.east
  let north = move.north
  for (const h of hits) {
    if (h.distance >= radiusMeters) continue
    const nEast = -h.dirEast
    const nNorth = -h.dirNorth
    const into = east * nEast + north * nNorth
    // `into >= 0` : le déplacement s'éloigne déjà du mur — le corriger collerait au décor.
    if (into >= 0) continue
    east -= nEast * into
    north -= nNorth * into
  }
  return { east, north }
}

/**
 * Hauteur de sol retenue après un pas, ou `null` quand la montée dépasse la marche
 * franchissable — c'est alors un mur, et les palpeurs ont la main.
 *
 * La DESCENTE n'est pas bornée : une pente, un escalier ou un trottoir qu'on quitte se
 * suivent vers le bas sans limite (la gravité de la spec, sans balistique).
 */
export function stepGround(currentGround: number, nextGround: number, maxStepHeightMeters: number): number | null {
  return nextGround - currentGround > maxStepHeightMeters ? null : nextGround
}

/**
 * Lissage vertical de l'œil : `approach` sous son nom de domaine. Sans lui, le raffinement
 * des tuiles change la hauteur du sol sous les pieds et l'œil sautille.
 */
export function smoothHeight(current: number, target: number, smoothingSeconds: number, dt: number): number {
  return approach(current, target, smoothingSeconds, dt)
}
