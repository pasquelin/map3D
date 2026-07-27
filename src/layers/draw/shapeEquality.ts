import type { DrawnShape, DrawStyle, ShapeMeta } from '../DrawLayer'

/**
 * `meta` opaques équivalentes ? Comparaison par VALEUR (superficielle sur les
 * valeurs, `JSON` sur les objets imbriqués).
 *
 * La comparaison par référence serait sans effet ici : `History` restitue ses
 * snapshots via `structuredClone`, donc après un undo aucune `meta` n'est plus la
 * même référence — toute forme qui en porte serait signalée comme modifiée, et une
 * app qui mute son backend sur `onShapeUpdate` déclencherait une écriture par forme
 * à chaque annulation.
 */
export function sameMeta(a: ShapeMeta | undefined, b: ShapeMeta | undefined): boolean {
  if (a === b) return true
  if (!a || !b) return false
  const ka = Object.keys(a)
  if (ka.length !== Object.keys(b).length) return false
  return ka.every((k) => {
    const va = a[k]
    const vb = b[k]
    if (va === vb) return true
    // Valeurs imbriquées : `JSON` suffit et reste prévisible sur des métadonnées,
    // qui sont sérialisables par contrat (cf. `ShapeMeta`).
    if (va === null || vb === null || typeof va !== 'object' || typeof vb !== 'object') return false
    return JSON.stringify(va) === JSON.stringify(vb)
  })
}

/**
 * Deux vues d'une même forme sont-elles identiques ? Sert au diff d'undo/redo, où
 * l'historique restitue des objets reconstruits — la comparaison porte donc sur les
 * valeurs, `meta` et `symbol` compris.
 */
export function sameShape(a: DrawnShape, b: DrawnShape): boolean {
  if (a.kind !== b.kind || a.closed !== b.closed || !!a.locked !== !!b.locked) return false
  if (!sameMeta(a.meta, b.meta)) return false
  // Un symbole n'a pas d'autre géométrie que son point : sans cette comparaison, un
  // changement de clé de catalogue ou d'affiliation au même emplacement passerait
  // pour un non-changement.
  if (a.symbol?.key !== b.symbol?.key || a.symbol?.variant !== b.symbol?.variant) return false
  if (a.points.length !== b.points.length) return false
  for (let i = 0; i < a.points.length; i++) {
    if (a.points[i]!.lat !== b.points[i]!.lat || a.points[i]!.lng !== b.points[i]!.lng) return false
  }
  if (a.tags.length !== b.tags.length || a.tags.some((t, i) => t !== b.tags[i])) return false
  const keys: Array<keyof DrawStyle> = [
    'color',
    'fillColor',
    'width',
    'fillOpacity',
    'strokeOpacity',
    'stroke',
    'radius',
  ]
  return keys.every((k) => a.style[k] === b.style[k])
}
