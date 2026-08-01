/** Arbre de réglages complet — chaque feuille a une valeur (cf. `defaultConfig`). */
/**
 * Catalogue d'entités géographiques distantes — cf. `CatalogSource`.
 *
 * 💰 Chaque frappe non amortie est une requête vers l'API de l'hôte, exactement comme
 * pour la boîte de recherche : `debounceMs` est le levier direct sur ce volume.
 */
export type CatalogConfig = {
  /** Éléments demandés par page à `CatalogSource.list`. */
  pageSize: number
  /** Anti-rebond de la frappe avant d'interroger la source. */
  debounceMs: number
  /**
   * Actions de source rendues en ligne sur une ligne de liste.
   *
   * Au-delà, c'est le NOM qui disparaît — déjà tronqué par construction. Les actions
   * excédentaires sont ignorées, avec un avertissement en développement.
   */
  maxInlineActions: number
  /**
   * Lignes rendues hors écran de chaque côté de la fenêtre virtuelle.
   *
   * C'est le curseur entre « pas de vide au défilement rapide » et « travail React par
   * frame de scroll » : chaque unité ajoute DEUX lignes rendues à chaque frame.
   */
  overscanRows: number
  /**
   * 💰 Distance au bas de liste qui déclenche la page suivante (px).
   *
   * Elle décide du VOLUME d'appels à `CatalogSource.list` : une marge large précharge
   * pendant qu'on défile encore (pas d'à-coup) mais demande des pages qu'on ne
   * regardera peut-être jamais. Même levier que `debounceMs` sur la frappe.
   */
  prefetchMarginPx: number
  /**
   * Anti-rebond avant d'écrire la sélection dans le stockage.
   *
   * `localStorage.setItem` est SYNCHRONE : sans amortissement, une rafale de gestes
   * (cocher un agrégat, restaurer une session) écrit autant de fois qu'elle compte
   * d'éléments, sur une charge qui grossit à chaque tour. `0` écrit immédiatement.
   * La charge en attente est toujours vidée avant que la page ne disparaisse.
   */
  persistDebounceMs: number
}
