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
 *
 * Les trois méthodes sont FACULTATIVES : un fournisseur ne déclare que ce qu'il sait.
 * La surface de regroupement, par exemple, ne connaît aucune donnée source mais est
 * seule à savoir quelle pastille agrège quoi (`visualNodeOf`) — l'obliger à déclarer
 * un inventaire vide n'apprenait rien à personne et faisait traverser un fournisseur
 * creux à chaque requête de la loupe.
 */
export type MarkerProvider = {
  markersInBounds?(bounds: Bounds): MarkerData[]
  /**
   * Résout la donnée complète d'un marker par id (position, avatar, data…), ou null.
   *
   * CONTRAT : renvoie l'objet SOURCE, pas une copie — deux résolutions du même id
   * sur des données inchangées rendent la même référence. Les appelants s'appuient
   * dessus pour ré-associer un marker à l'id qui l'a produit (`SelectionBadges`),
   * l'id du registre pouvant être un `getId` custom et non `m.id`.
   */
  markerById?(id: string | number): MarkerData | null
  /**
   * Nœud VISUEL portant ce marker : lui-même s'il est isolé, ou le cluster qui
   * l'agrège. Optionnel — une couche sans clustering n'a rien à déclarer, et ses
   * consommateurs retombent sur la position du marker.
   *
   * Permet d'agréger un rendu sur ce que l'utilisateur voit RÉELLEMENT, sans
   * jamais éclater le cluster ni toucher au zoom.
   */
  visualNodeOf?(id: string | number): VisualNode | null
  /**
   * Ce marker EXISTE dans les données de cette couche mais est actuellement RETIRÉ
   * de l'affichage par le gate de zoom des `static` (passé sous son seuil) —
   * autrement dit : présent dans l'inventaire (loupe, recherche), absent de la carte.
   *
   * `true` = connu mais masqué ; `false` = connu et rendu ; `null` = inconnu de cette
   * couche. Optionnel : une couche sans décor `static` n'a jamais rien à masquer.
   *
   * Sert à EXPLIQUER un marker listé mais invisible, sans changer le comportement :
   * l'inventaire reste complet, seule la ligne porte un repère.
   */
  hiddenByZoom?(id: string | number): boolean | null
}

/** Nœud visuel (marker isolé ou cluster) tel qu'il est affiché à l'instant t. */
export type VisualNode = {
  /** Clé du nœud, stable tant que le clustering ne change pas. */
  key: string
  /** Position affichée du nœud (centre du cluster, ou du marker isolé). */
  position: LatLng
  /** Tous les markers agrégés dans ce nœud, l'id demandé compris. */
  memberIds: (string | number)[]
}

/**
 * Registre d'inventaire de markers partagé sur `MapEngine` : les couches marker
 * s'enregistrent comme fournisseurs, l'outil loupe le consomme. Contrairement à
 * `SelectableRegistry` (positions ÉCRAN des seuls markers visibles, clusters
 * exclus), ce registre part des **données sources** — un marker agrégé dans un
 * cluster reste inventorié. La mécanique register/notify vient de
 * `ProviderRegistry`, commune à tous les registres du moteur.
 */
/** Vue figée de l'inventaire — cf. `MarkerRegistry.snapshot`. */
export type MarkerSnapshot = {
  markerById(id: string | number): MarkerData | null
}

export class MarkerRegistry extends ProviderRegistry<MarkerProvider> {
  /** Tous les markers d'un cadre géo (concat des fournisseurs). */
  markersInBounds(bounds: Bounds): MarkerData[] {
    const out: MarkerData[] = []
    for (const p of this.providers) {
      const found = p.markersInBounds?.(bounds)
      // Jamais `push(...found)` : le spread passe chaque élément en argument, et la pile
      // déborde dès ~120 k markers (la loupe interroge sur le monde entier).
      if (found) for (const m of found) out.push(m)

    }
    return out
  }

  private cachedSnapshot: { token: object; view: MarkerSnapshot } | null = null

  /**
   * Instantané interrogeable de l'inventaire : **même référence** tant que rien ne
   * bouge, **nouvelle référence** à chaque `itemsChanged()`.
   *
   * C'est ce qui permet à un composant React de dépendre de l'inventaire pour de vrai.
   * Avec `markerById()` seul, un consommateur devait mémoïser sur un compteur de
   * révision qu'aucune ligne de son calcul ne nommait : ni le linter ni un relecteur ne
   * pouvaient voir le lien, et retirer le compteur figeait l'affichage en silence.
   * Ici la dépendance EST l'objet qu'on interroge.
   */
  get snapshot(): MarkerSnapshot {
    if (this.cachedSnapshot?.token !== this.snapshotToken) {
      this.cachedSnapshot = { token: this.snapshotToken, view: { markerById: (id) => this.markerById(id) } }
    }
    return this.cachedSnapshot.view
  }

  /** Donnée complète d'un marker par id (1er fournisseur qui le connaît), ou null. */
  markerById(id: string | number): MarkerData | null {
    for (const p of this.providers) {
      const m = p.markerById?.(id)
      if (m) return m
    }
    return null
  }

  /** Nœud visuel portant ce marker, ou `null` si aucun fournisseur ne l'agrège. */
  visualNodeOf(id: string | number): VisualNode | null {
    for (const p of this.providers) {
      const node = p.visualNodeOf?.(id)
      if (node) return node
    }
    return null
  }

  /**
   * Le marker est-il connu d'une couche mais masqué par le gate de zoom ? `true` dès
   * qu'un fournisseur le déclare masqué ; sinon `false` (rendu, ou inconnu partout —
   * on ne signale que ce qu'on sait vraiment masqué, jamais par défaut).
   */
  hiddenByZoom(id: string | number): boolean {
    for (const p of this.providers) {
      if (p.hiddenByZoom?.(id) === true) return true
    }
    return false
  }
}
