import type { MarkerData } from '../data/types'
import type { Bounds, LatLng } from '../shared'

/**
 * Un point est-il DANS un cadre géo ? La latitude est un simple encadrement ;
 * la longitude gère le **franchissement de l'antiméridien** (convention Google :
 * `east < west` = le cadre traverse ±180°, cf. `Bounds`).
 */
export function boundsContains(b: Bounds, p: LatLng): boolean {
  if (p.lat < b.south || p.lat > b.north) return false
  return b.west <= b.east ? p.lng >= b.west && p.lng <= b.east : p.lng >= b.west || p.lng <= b.east
}

/**
 * Fournisseur d'inventaire de markers : répond « quels markers (données sources,
 * clusters inclus) sont dans ce cadre géo ». Rempli par la couche marker.
 */
export type MarkerProvider = {
  markersInBounds(bounds: Bounds): MarkerData[]
}

/**
 * Registre d'inventaire de markers partagé sur `MapEngine` (même motif que
 * `SelectableRegistry`/`engine.tags`) : les couches marker s'enregistrent comme
 * fournisseurs, l'outil loupe le consomme. Contrairement à `SelectableRegistry`
 * (positions ÉCRAN des seuls markers visibles, clusters exclus), ce registre part
 * des **données sources** — un marker agrégé dans un cluster reste inventorié.
 */
export class MarkerRegistry {
  private readonly providers = new Set<MarkerProvider>()
  private readonly changeListeners = new Set<() => void>()

  register(p: MarkerProvider): () => void {
    this.providers.add(p)
    this.itemsChanged()
    return () => {
      this.providers.delete(p)
      this.itemsChanged()
    }
  }

  /** Tous les markers d'un cadre géo (concat des fournisseurs). */
  markersInBounds(bounds: Bounds): MarkerData[] {
    const out: MarkerData[] = []
    for (const p of this.providers) out.push(...p.markersInBounds(bounds))
    return out
  }

  /** Le jeu de markers a changé (données, filtre tags…) → recalcul côté loupe. */
  onItemsChanged(cb: () => void): () => void {
    this.changeListeners.add(cb)
    return () => this.changeListeners.delete(cb)
  }

  itemsChanged(): void {
    for (const cb of this.changeListeners) cb()
  }
}
