/** Plans de profondeur et brouillard de la vue piéton — cf. `MapEngine.applyPedestrianView`. */
export type PedestrianView = {
  near: number
  far: number
  fogNear: number
  fogFar: number
}

/** Plancher du near : à 0 la matrice de projection dégénère. */
const MIN_NEAR = 0.01
/** Ratio far/near minimal pour que le buffer de profondeur reste exploitable. */
const MIN_DEPTH_RATIO = 100
/** Part de la distance de vue où replier un début de brouillard incohérent. */
const FOG_FALLBACK = 0.7

/**
 * Vue rasante au sol : `far` borné à la distance de vue, ce qui fait **couper les tuiles
 * lointaines par le frustum culling** — le `TilesRenderer` ne les demande alors jamais
 * (perf, coût, rendu). Le brouillard masque la coupure et finit toujours AU far : le
 * laisser plus court laisserait une frange nette de tuiles tranchées à l'horizon.
 */
export function pedestrianView(viewDistanceMeters: number, nearMeters: number, fogStartMeters: number): PedestrianView {
  const near = Math.max(MIN_NEAR, nearMeters)
  const far = Math.max(viewDistanceMeters, near * MIN_DEPTH_RATIO)
  // Un début de brouillard au-delà de la coupure ne brouillerait rien : on le replie.
  const start = fogStartMeters >= far ? far * FOG_FALLBACK : fogStartMeters
  return { near, far, fogNear: Math.max(near, start), fogFar: far }
}
