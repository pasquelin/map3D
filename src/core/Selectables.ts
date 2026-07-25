/** Position écran (px canvas) d'un élément sélectionnable externe (ex. marker). */
export type SelectableScreenItem = { id: string | number; x: number; y: number }

/** Métadonnées d'un sélectionnable, pour grouper/afficher (badges de sélection). */
export type SelectableInfo = { type: string }

/**
 * Contrat rempli par une couche qui expose des éléments sélectionnables au
 * marquee (ex. `MarkerLayer`). `screenItems` ne renvoie que les éléments
 * individuellement visibles (occlusion et clusters exclus) — appelé uniquement
 * au finalize du marquee, jamais par frame.
 */
export type SelectableProvider = {
  screenItems(): SelectableScreenItem[]
  /** Applique la multi-sélection courante (retire les ids absents du set). */
  setSelected(ids: ReadonlySet<string | number>): void
  /** Métadonnées d'un id, ou null s'il n'existe plus (sert aussi au prune). */
  info(id: string | number): SelectableInfo | null
}

/** État des modificateurs d'un clic (satisfait par MouseEvent/PointerEvent). */
export type PickModifiers = { shiftKey: boolean; altKey: boolean; metaKey: boolean }

/**
 * Récepteur des clics sur un sélectionnable quand l'outil sélection est actif.
 * Les providers transmettent les modificateurs BRUTS : la sémantique (Maj =
 * additif…) appartient à l'outil de sélection, pas à chaque provider.
 */
export type SelectableConsumer = { pick(id: string | number, modifiers: PickModifiers): void }

/**
 * Registre des éléments sélectionnables externes, partagé sur `MapEngine`
 * (même motif que `engine.tags`) : les couches marker s'enregistrent comme
 * providers, l'outil sélection du DrawLayer le consomme. Les couches ne se
 * connaissent jamais entre elles.
 */
export class SelectableRegistry {
  /**
   * Posé par la couche de sélection quand son outil est actif : les providers
   * lui routent alors les clics au lieu de leur comportement propre (popup…).
   */
  consumer: SelectableConsumer | null = null

  private readonly providers = new Set<SelectableProvider>()
  private readonly changeListeners = new Set<() => void>()

  register(p: SelectableProvider): () => void {
    this.providers.add(p)
    this.itemsChanged()
    return () => {
      this.providers.delete(p)
      this.itemsChanged()
    }
  }

  /** Positions écran de tous les sélectionnables visibles (concat des providers). */
  items(): SelectableScreenItem[] {
    const out: SelectableScreenItem[] = []
    for (const p of this.providers) out.push(...p.screenItems())
    return out
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

  /** Le jeu d'éléments a changé (données, filtre tags…) → prune côté sélection. */
  onItemsChanged(cb: () => void): () => void {
    this.changeListeners.add(cb)
    return () => this.changeListeners.delete(cb)
  }

  itemsChanged(): void {
    for (const cb of this.changeListeners) cb()
  }
}
