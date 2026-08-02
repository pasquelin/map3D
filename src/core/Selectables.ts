import type { Bounds } from '../shared'
import { ProviderRegistry } from './ProviderRegistry'

/**
 * Type de haut niveau d'un sélectionnable, régi par la politique de
 * sélectionnabilité (`config.selection.selectable`). Distinct du **type métier**
 * (`SelectableInfo.type`, ex. le type d'un marker) : la politique raisonne par
 * kind (« autoriser les markers, pas les clusters »), les badges par type.
 */
export type SelectableKind = 'marker' | 'path' | 'cluster'

/** Kinds connus, dans l'ordre d'affichage — introspection UI/doc (panneau « ce qui est sélectionnable »). */
export const SELECTABLE_KINDS: readonly SelectableKind[] = ['marker', 'path', 'cluster']

/**
 * Politique de sélectionnabilité par kind : un kind **absent ou `true`** est
 * sélectionnable, `false` l'exclut de TOUS les outils (clic, rect, lasso, poly).
 */
export type SelectablePolicy = Partial<Record<SelectableKind, boolean>>

/** Polyligne écran (tracé, forme dessinée, contour de hit-test marquee). */
export type PolyGeometry = { pts: { x: number; y: number }[]; closed: boolean }

/**
 * Silhouette écran (px canvas) d'un sélectionnable, pour le pointillé « marching-ants »
 * de l'overlay. Deux formes :
 *  — `poly` : polyligne d'un tracé ou d'une forme dessinée (`pts` compatible `ScreenPt`) ;
 *  — `circle` : cercle exact d'un marker ou d'une pastille de cluster.
 *
 * L'overlay en fait l'**union** quand plusieurs se recouvrent (silhouette unique, sans
 * croisement) — d'où le cercle EXACT plutôt qu'un polygone approché : masquage net,
 * arcs de tirets propres.
 */
export type SelectableGeometry =
  ({ kind: 'poly' } & PolyGeometry) | { kind: 'circle'; cx: number; cy: number; r: number }

/**
 * Position écran (px canvas) d'un élément sélectionnable externe (marker,
 * pastille de cluster, tracé). Un item **point** (marker/cluster) n'a que son
 * ancre `x,y` (+ `radiusPx` optionnel) ; un item **géométrique** (tracé) porte
 * en plus `geometry` (contour projeté), testé au marquee comme une forme.
 */
export type SelectableScreenItem = {
  id: string | number
  kind: SelectableKind
  x: number
  y: number
  /** Tolérance de test au point (rayon d'une pastille de cluster) — défaut : tolérance config. */
  radiusPx?: number
  /** Contour projeté (tracé) : présent ⇒ testé par `shapeTouchesSelector` plutôt qu'au
   *  point. Toujours une polyligne (le marquee ne teste pas de cercle) — d'où `PolyGeometry`
   *  nu, partagé avec l'arm `poly` de `SelectableGeometry` (un seul type source). */
  geometry?: PolyGeometry
}

/** Agrégat pliable (cluster) : libellé + membres résolus, exposé à l'outil et aux badges.
 *  `counts` = répartition par type (comme `ClusterInfo.counts`) : permet aux badges de
 *  dessiner un mini-camembert aux couleurs des parts, au lieu d'une icône générique. */
export type SelectableGroup = { label: string; memberIds: (string | number)[]; counts?: Record<string, number> }

/**
 * Métadonnées d'un sélectionnable, pour la politique (`kind`), les badges
 * (`type`) et le regroupement pliable (`group`, présent pour un cluster).
 */
export type SelectableInfo = { kind: SelectableKind; type: string; group?: SelectableGroup; color?: string }

/**
 * Contrat rempli par une couche qui expose des éléments sélectionnables au
 * marquee (`MarkerLayer`, `PathLayer`, `ClusterSurface`). `screenItems` ne
 * renvoie que les éléments individuellement visibles (occlusion et clusters
 * exclus) — appelé uniquement au finalize du marquee/au clic, jamais par frame.
 */
export type SelectableProvider = {
  screenItems(): SelectableScreenItem[]
  /** Applique la multi-sélection courante (retire les ids absents du set). */
  setSelected(ids: ReadonlySet<string | number>): void
  /** Métadonnées d'un id, ou null s'il n'existe plus (sert aussi au prune). */
  info(id: string | number): SelectableInfo | null
  /** Clic générique sur un objet drapé (tracé) : id touché sous le curseur, ou null. */
  hitTest?(x: number, y: number, tolPx: number): string | number | null
  /** Emprise géographique d'un id (tracé…) — de quoi le CADRER (« Cibler » d'un badge). */
  boundsOf?(id: string | number): Bounds | null
  /**
   * Contours écran des éléments SÉLECTIONNÉS de ce provider (tracés) — pour le pointillé
   * de l'overlay de sélection. Reprojette seulement les sélectionnés ; peut être appelé
   * par frame (contrairement à `screenItems`, réservé au finalize/clic).
   */
  selectedContours?(): SelectableGeometry[]
  /** Ce provider a-t-il des éléments sélectionnés à contourer ? — garde bon marché (sans reprojeter). */
  hasSelectedContours?(): boolean
}

/** État des modificateurs d'un clic (satisfait par MouseEvent/PointerEvent). */
export type PickModifiers = { shiftKey: boolean; altKey: boolean; metaKey: boolean }

/**
 * Récepteur des clics sur un sélectionnable quand l'outil sélection est actif.
 * Les providers transmettent les modificateurs BRUTS : la sémantique (Maj =
 * additif…) appartient à l'outil de sélection, pas à chaque provider.
 */
export type SelectableConsumer = { pick(id: string | number, modifiers: PickModifiers): void }

/** true si le kind est autorisé par la politique (absent ou true = autorisé). */
export function kindAllowed(kind: SelectableKind, policy?: SelectablePolicy): boolean {
  return policy?.[kind] !== false
}

/**
 * Registre des éléments sélectionnables externes, partagé sur `MapEngine`
 * (même motif que `engine.tags`) : les couches (marker, tracé, cluster)
 * s'enregistrent comme providers, l'outil sélection du DrawLayer le consomme.
 * Les couches ne se connaissent jamais entre elles. La **politique** filtre par
 * kind au point d'entrée unique — donc tous les outils l'héritent gratuitement.
 */
export class SelectableRegistry extends ProviderRegistry<SelectableProvider> {
  /**
   * Posé par la couche de sélection quand son outil est actif : les providers
   * lui routent alors les clics au lieu de leur comportement propre (popup…).
   */
  consumer: SelectableConsumer | null = null

  /** Positions écran de tous les sélectionnables visibles, filtrées par la politique. */
  items(policy?: SelectablePolicy): SelectableScreenItem[] {
    const out: SelectableScreenItem[] = []
    for (const p of this.providers) {
      for (const it of p.screenItems()) if (kindAllowed(it.kind, policy)) out.push(it)
    }
    return out
  }

  /** Clic générique sur un objet drapé : premier provider qui touche, kind autorisé. */
  hitTest(x: number, y: number, tolPx: number, policy?: SelectablePolicy): string | number | null {
    for (const p of this.providers) {
      const id = p.hitTest?.(x, y, tolPx)
      if (id === null || id === undefined) continue
      const info = p.info(id)
      if (info && kindAllowed(info.kind, policy)) return id
    }
    return null
  }

  /** Diffuse la sélection courante à chaque provider (application visuelle). */
  apply(ids: ReadonlySet<string | number>): void {
    for (const p of this.providers) p.setSelected(ids)
  }

  info(id: string | number): SelectableInfo | null {
    for (const p of this.providers) {
      const info = p.info(id)
      if (info) return info
    }
    return null
  }

  /** Emprise géographique d'un id — premier provider qui la connaît, sinon null. */
  boundsOf(id: string | number): Bounds | null {
    for (const p of this.providers) {
      const b = p.boundsOf?.(id)
      if (b) return b
    }
    return null
  }

  /** Contours écran des sélectionnables étendus SÉLECTIONNÉS (tracés) — pointillé de l'overlay. */
  selectedContours(): SelectableGeometry[] {
    const out: SelectableGeometry[] = []
    for (const p of this.providers) {
      const cs = p.selectedContours?.()
      if (cs) for (const c of cs) out.push(c)
    }
    return out
  }

  /** Un provider quelconque a-t-il des contours de sélection à dessiner ? — garde bon marché. */
  hasSelectedContours(): boolean {
    for (const p of this.providers) if (p.hasSelectedContours?.()) return true
    return false
  }

  has(id: string | number): boolean {
    return this.info(id) !== null
  }
}
