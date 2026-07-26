import type { MarkerData } from '../data/types'
import type { Bounds, LatLng } from '../shared'
import { ProviderRegistry } from './ProviderRegistry'

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
  /**
   * Résout la donnée complète d'un marker par id (position, avatar, data…), ou null.
   *
   * CONTRAT : renvoie l'objet SOURCE, pas une copie — deux résolutions du même id
   * sur des données inchangées rendent la même référence. Les appelants s'appuient
   * dessus pour ré-associer un marker à l'id qui l'a produit (`SelectionBadges`),
   * l'id du registre pouvant être un `getId` custom et non `m.id`.
   */
  markerById(id: string | number): MarkerData | null
}

/**
 * Registre d'inventaire de markers partagé sur `MapEngine` : les couches marker
 * s'enregistrent comme fournisseurs, l'outil loupe le consomme. Contrairement à
 * `SelectableRegistry` (positions ÉCRAN des seuls markers visibles, clusters
 * exclus), ce registre part des **données sources** — un marker agrégé dans un
 * cluster reste inventorié. La mécanique register/notify vient de
 * `ProviderRegistry`, commune à tous les registres du moteur.
 */
export class MarkerRegistry extends ProviderRegistry<MarkerProvider> {
  /** Tous les markers d'un cadre géo (concat des fournisseurs). */
  markersInBounds(bounds: Bounds): MarkerData[] {
    const out: MarkerData[] = []
    for (const p of this.providers) out.push(...p.markersInBounds(bounds))
    return out
  }

  /** Donnée complète d'un marker par id (1er fournisseur qui le connaît), ou null. */
  markerById(id: string | number): MarkerData | null {
    for (const p of this.providers) {
      const m = p.markerById(id)
      if (m) return m
    }
    return null
  }
}
