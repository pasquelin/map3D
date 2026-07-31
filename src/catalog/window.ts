export type VirtualWindow = {
  /** Premier index rendu (inclus). */
  start: number
  /** Dernier index rendu (EXCLU) — se passe tel quel à `slice`. */
  end: number
  /** Hauteur de l'espaceur placé avant la première ligne rendue. */
  padTop: number
  /** Hauteur totale du contenu, qui donne au conteneur sa barre de défilement. */
  totalHeight: number
}

export type VisibleWindowOptions = {
  scrollTop: number
  viewportHeight: number
  /** CONSTANTE : c'est l'hypothèse qui rend ce calcul possible sans mesurer les lignes. */
  rowHeight: number
  count: number
  /** Lignes rendues hors écran de chaque côté, pour que le scroll ne montre pas de vide. */
  overscan?: number
}

const EMPTY: VirtualWindow = { start: 0, end: 0, padTop: 0, totalHeight: 0 }

/**
 * Fenêtre à rendre pour un scroll donné, à hauteur de ligne constante.
 *
 * `rowHeight` non strictement positif rend une fenêtre vide au lieu de diviser par
 * zéro : la hauteur vient du thème, et un thème mal mergé doit dégrader l'affichage,
 * pas figer la page sur un `Infinity` d'index à rendre. Le test `!(rowHeight > 0)`
 * plutôt que `rowHeight <= 0` attrape aussi `NaN`.
 */
export function visibleWindow({
  scrollTop,
  viewportHeight,
  rowHeight,
  count,
  overscan = 0,
}: VisibleWindowOptions): VirtualWindow {
  if (!(rowHeight > 0) || count <= 0) return EMPTY
  // Le rebond élastique d'iOS rend un `scrollTop` négatif : sans ce plancher, `first`
  // partirait en index négatif et `padTop` remonterait les lignes hors du conteneur.
  const top = Math.max(0, scrollTop)
  const first = Math.max(0, Math.floor(top / rowHeight) - overscan)
  const visibles = Math.ceil(viewportHeight / rowHeight)
  const last = Math.min(count, first + visibles + overscan * 2)
  return { start: first, end: last, padTop: first * rowHeight, totalHeight: count * rowHeight }
}
