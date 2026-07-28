/** Qui pilote la caméra : l'orbite façon Google Earth, ou le piéton. */
export type CameraMode = 'orbit' | 'pedestrian'

/** `placing` = le curseur cherche un point de rue ; `active` = on marche. */
export type PedestrianPhase = 'placing' | 'active'

/** `explore` = souris visible, menus actifs ; `full` = Pointer Lock, interface masquée. */
export type ImmersionLevel = 'explore' | 'full'

/**
 * État diffusé par l'événement `pedestrian` — patron exact de `BasemapState` : l'objet est
 * STABLE tant que rien ne change, si bien qu'un consommateur React peut le mettre en état
 * sans se re-rendre à chaque émission.
 *
 * Il porte le cap et le tangage RÉELS : `Camera.getState()` rend `heading`/`tilt` à 0 en
 * dur, ce qui ne dit rien en première personne.
 */
export type PedestrianState = {
  mode: CameraMode
  phase: PedestrianPhase
  immersion: ImmersionLevel
  /** Le mode est-il proposable ? (3D photoréaliste externe requise) */
  available: boolean
  /** Cap réel (rad), 0 = nord. */
  heading: number
  /** Regard vertical réel (rad), 0 = horizon. */
  pitch: number
}

/**
 * Seuil (rad) sous lequel une rotation ne vaut pas une réémission. ≈0,06° : invisible à
 * l'écran, alors que la caméra bouge à CHAQUE frame en mode piéton. Sans lui, l'événement
 * se comporterait comme `camera` (continu) là où l'UI attend un `basemap` (par changement).
 */
const ANGLE_EPSILON = 1e-3

/** Deux états sont-ils équivalents pour l'UI ? — cf. `syncBasemap`, même rôle. */
export function samePedestrianState(a: PedestrianState, b: PedestrianState): boolean {
  return (
    a.mode === b.mode &&
    a.phase === b.phase &&
    a.immersion === b.immersion &&
    a.available === b.available &&
    Math.abs(a.heading - b.heading) < ANGLE_EPSILON &&
    Math.abs(a.pitch - b.pitch) < ANGLE_EPSILON
  )
}
