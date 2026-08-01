import type { PedestrianConfig } from '../types'

export const pedestrianDefaults: PedestrianConfig = {
  eyeHeightMeters: 1.7,
  // 5 m/s (18 km/h) : la marche réelle (1,4) donne l'impression de faire du surplace dans
  // un décor à l'échelle, et 3 restait trop lent pour traverser un quartier. Le décor
  // défile à un rythme lisible à hauteur d'homme. À ramener à 1,4 pour une vitesse fidèle.
  walkSpeed: 5,
  // 2 et non 3 : le facteur multiplie une base désormais plus vive. À 3, la touche `boost`
  // donnait 15 m/s (54 km/h) — on ne lit plus rien de ce qu'on traverse.
  sprintFactor: 2,
  lookSpeed: 0.15,
  // Convention du glisser de carte : tirer la souris vers le BAS relève la vue, comme le
  // pan de `GlobeControls`. Passer à `false` donne la convention FPS.
  invertY: true,
  invertX: false,
  pitchMaxDeg: 89,
  // 1000 m : au-delà, la vue rasante fait demander des milliers de tuiles pour un
  // horizon que le brouillard cache de toute façon.
  viewDistanceMeters: 1000,
  fogStartMeters: 700,
  nearMeters: 0.1,
  groundProbeMeters: 5,
  // 120 m : le détail se cale sur ce qu'on regarde en marchant (le bout de la rue), et
  // non sur la distance à ses propres pieds — qui réclamerait le zoom maximal partout.
  tileDetailDistanceMeters: 120,
  // ~4 Hz : la couverture suit largement une marche à quelques mètres par seconde, et la
  // cascade cesse d'être reconstruite soixante fois par seconde.
  tileRefreshMs: 250,
  groundSmoothing: 0.25,
  collision: {
    radiusMeters: 0.3,
    feelers: 6,
    feelerMarginMeters: 0.2,
    maxStepHeightMeters: 0.4,
  },
  placement: {
    maxRoofDeltaMeters: 2,
    // 20 m, et non 4 : la couronne doit SORTIR de l'emprise du bâtiment visé pour
    // trouver la rue en contrebas. À 4 m elle restait sur le toit, qui devenait donc
    // son propre « niveau de rue » — un toit se validait alors comme une chaussée.
    // Même ordre de grandeur que `performance.groundSample.radiusMeters` (18 m), écrit
    // pour exactement ce problème.
    ringRadiusMeters: 20,
    // ~30 Hz : le curseur reste vif à l'œil, et la dizaine de raycasts par validation
    // cesse de suivre la cadence d'un `pointermove`.
    refreshMs: 33,
    refreshSlopPx: 3,
  },
  headBob: { enabled: false, amplitudeMeters: 0.05, frequency: 1.8 },
  transitions: { enterMs: 800, exitMs: 600 },
}
