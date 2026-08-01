// ④ data — cadence de chargement.

/**
 * Clés `localStorage` de la carte.
 *
 * ⚠️ À distinguer dès que **deux cartes cohabitent sur le même origin** : sans clés
 * propres, elles écrivent au même endroit et la dernière à changer un réglage
 * l'impose à l'autre. Les trois étaient dispersées dans le code (`core/TagFilter`,
 * `layers/draw/DrawSettings`, `SearchBox`), chacune surchargeable par une prop
 * différente — donc trois endroits à penser au lieu d'un.
 */
export type StorageKeysConfig = {
  /** Sélection du filtre « Couches ». */
  tagFilter: string
  /** Réglages de style par outil de dessin. */
  drawSettings: string
  /** Historique de la boîte de recherche. */
  searchHistory: string
  /** État des plugins (activation + config), format `{ [id]: PluginState }`. */
  plugins: string
  /** Templates de dessin locaux (tableau `Template[]`). */
  templates: string
  /** Éléments de catalogue affichés sur la carte (tableau de `CatalogKey`). */
  catalog: string
  /**
   * Réglages du catalogue (persistance, cadrage à l'ajout).
   *
   * Distincte de `catalog` : décocher « conserver » efface la SÉLECTION, et une clé
   * partagée effacerait du même geste le réglage qu'on vient de changer.
   */
  catalogSettings: string
  /**
   * Préférences de l'utilisateur final (qualité 3D, disposition clavier, vitesse,
   * inertie) — cf. `Preferences`. Absente du localStorage tant que l'utilisateur n'a
   * rien réglé : la carte suit alors la config de l'application, intacte.
   */
  preferences: string
}

/** Boîte de recherche — 💰 chaque frappe non amortie est un appel Places facturé. */
export type DataSearchConfig = {
  /** Longueur minimale de saisie avant d'interroger les fournisseurs. */
  minQuery: number
  /** Anti-rebond de la frappe. 💰 Le levier le plus direct sur le nombre d'appels. */
  debounceMs: number
  /** Résultats affichés par rubrique. */
  limitPerGroup: number
  /** Entrées conservées dans l'historique. */
  historySize: number
  /** Altitude (m) du vol vers un résultat sans emprise connue. */
  flyAltitude: number
  /** Respiration (px) du cadrage d'un résultat qui a une emprise. */
  fitPadding: number
  /** Plafond de re-résolution d'une entrée d'historique avant le vol. */
  resolveLimit: number
}

export type DataConfig = {
  /** Anti-rebond entre l'arrêt de la caméra et la demande de données. */
  viewportDebounceMs: number
  /** Anti-rebond de la sauvegarde de la position caméra (`positionStorageKey`). */
  positionSaveDebounceMs: number
  storageKeys: StorageKeysConfig
  search: DataSearchConfig
}
