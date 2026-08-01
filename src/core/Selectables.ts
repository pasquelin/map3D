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

/** Contour écran (px canvas) d'un sélectionnable étendu (tracé) — `pts` compatible `ScreenPt`. */
export type SelectableGeometry = { pts: { x: number; y: number }[]; closed: boolean }

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
  /** Contour projeté (tracé) : présent ⇒ testé par `shapeTouchesSelector` plutôt qu'au point. */
  geometry?: SelectableGeometry
}

/** Agrégat pliable (cluster) : libellé + membres résolus, exposé à l'outil et aux badges. */
export type SelectableGroup = { label: string; memberIds: (string | number)[] }

/**
 * Métadonnées d'un sélectionnable, pour la politique (`kind`), les badges
 * (`type`) et le regroupement pliable (`group`, présent pour un cluster).
 */
export type SelectableInfo = { kind: SelectableKind; type: string; group?: SelectableGroup }

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

  has(id: string | number): boolean {
    return this.info(id) !== null
  }
}
