// Résolution « sommet → bâtiment » d'une tuile extrudée, et les trois écritures de la
// mise en évidence.
//
// Sans three ni DOM, et sans état : c'est la partie du picking qui se teste seule, là où
// le raycast qui la précède demande une scène WebGL. L'invariant qui compte — la sortie
// de survol rend EXACTEMENT les couleurs d'entrée — se vérifie ainsi sur un `Uint8Array`.

import type { TileBuildings } from '../data/mvt'

/**
 * Index du bâtiment auquel appartient `vertex`, `-1` hors de toute plage.
 *
 * `vStart` est croissant par construction (`extrudeTile` écrit les emprises l'une après
 * l'autre) et porte une sentinelle finale : une recherche binaire y répond en ~11
 * comparaisons sur une tuile de 2 300 bâtiments, contre 2 300 pour un parcours — et le
 * survol l'appelle à chaque mouvement du pointeur.
 */
export function buildingAtVertex(vStart: Uint32Array, vertex: number): number {
  const n = vStart.length - 1
  if (n <= 0 || vertex < 0 || vertex >= vStart[n]!) return -1
  let lo = 0
  let hi = n - 1
  while (lo < hi) {
    // Milieu par EXCÈS : on cherche la plus grande plage dont le début est ≤ vertex, et
    // un milieu par défaut ne ferait pas progresser `lo` quand les deux bornes se touchent.
    const mid = (lo + hi + 1) >> 1
    if (vStart[mid]! <= vertex) lo = mid
    else hi = mid - 1
  }
  return lo
}

/** Ce qu'une tuile sait d'un de ses bâtiments — la matière de `BuildingInfo`. */
export type BuildingAttrs = {
  /** `feature.id` MVT, `null` quand la donnée n'en portait pas. */
  featureId: number | null
  height: number
  minHeight: number
  /** Attributs de `providers.buildings.pickFields` ; vide quand la liste l'est. */
  props: Record<string, unknown>
}

/** Attributs du bâtiment `index`. L'appelant garantit l'index (issu de `buildingAtVertex`). */
export function buildingAttrs(b: TileBuildings, index: number): BuildingAttrs {
  const id = b.featureIds[index]!
  return {
    // `NaN` est le marqueur d'absence côté transport : un `Float64Array` ne porte pas
    // `undefined`. Il s'arrête ici, l'hôte voit `null`.
    featureId: Number.isNaN(id) ? null : id,
    height: b.heights[index * 2]!,
    minHeight: b.heights[index * 2 + 1]!,
    props: b.props?.[index] ?? {},
  }
}

/** Copie les couleurs des sommets `[from, to[` dans `out`, qui peut être plus grand. */
export function saveRange(colors: Uint8Array, from: number, to: number, out: Uint8Array): void {
  out.set(colors.subarray(from * 3, to * 3))
}

/**
 * Peint les sommets `[from, to[` d'une teinte, **modulée par l'ombrage de chaque sommet**.
 *
 * `shade` est le facteur que le worker a cuit dans les couleurs d'origine (255 = face la
 * mieux exposée). Sans lui, une teinte unie effacerait le relief : le bâtiment survolé
 * devenait un aplat, ses quatre façades confondues, et il perdait le volume que tout le
 * quartier garde. On repeint donc la teinte, pas la lumière.
 */
export function paintRange(
  colors: Uint8Array,
  from: number,
  to: number,
  r: number,
  g: number,
  b: number,
  shade: Uint8Array,
): void {
  for (let v = from; v < to; v++) {
    const lit = shade[v]!
    colors[v * 3] = (r * lit) / 255
    colors[v * 3 + 1] = (g * lit) / 255
    colors[v * 3 + 2] = (b * lit) / 255
  }
}

/**
 * Rend `length` octets sauvegardés à partir du sommet `from`.
 *
 * La longueur est un PARAMÈTRE et non celle de `saved` : le tampon de sauvegarde est
 * recyclé d'un survol à l'autre, donc souvent plus grand que la plage courante — s'y fier
 * déborderait sur le bâtiment voisin.
 */
export function restoreRange(colors: Uint8Array, from: number, saved: Uint8Array, length: number): void {
  colors.set(saved.subarray(0, length), from * 3)
}
