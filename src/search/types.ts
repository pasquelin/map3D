import type { MenuItem } from '../react/components/ContextMenu'
import type { Bounds, LatLng } from '../shared'

/**
 * Une ligne de résultat, quelle que soit sa provenance. C'est la monnaie d'échange
 * entre les couches (qui savent ce qu'elles portent) et la boîte de recherche (qui
 * ne connaît aucune couche).
 *
 * Volontairement plate et sans générique : la boîte affiche des lignes, elle n'a
 * jamais à ouvrir la donnée métier — c'est le fournisseur qui referme dessus dans
 * `select` et `menu`.
 */
export type SearchEntry = {
  /**
   * Rubrique d'appartenance, `'<famille>:<sous-type>'` : `'marker:agent'`,
   * `'shape'`, `'draw'`, `'place'`. Sert de clé de regroupement ET de valeur du
   * sélecteur de portée. Pour une couche de markers, à construire avec
   * `markerGroupId` plutôt qu'en concaténant à la main.
   */
  group: string
  /** Identité dans sa rubrique — clé de rendu et de résolution de l'historique. */
  id: string | number
  /** Nom affiché, tel qu'indexé (cf. `MarkerData.title`). */
  title: string
  /** Ligne secondaire : référence, adresse. Jamais le type — l'en-tête le dit déjà. */
  subtitle?: string
  /** Teinte du titre (cf. `MarkerData.titleColor`). */
  titleColor?: string
  position: LatLng
  /**
   * Emprise de l'élément. Présente, le choix **cadre** au lieu de voler à une
   * altitude fixe : une zone ou une ville se regardent en entier.
   */
  bounds?: Bounds
  /** Repère visuel de la ligne — même langage que `MarkerList` (photo > icône > pastille). */
  avatar?: string
  icon?: string
  color?: string
  /**
   * Ce que « choisir » veut dire pour CET élément, au-delà du déplacement caméra que
   * la boîte assure elle-même : sélectionner le marker via sa couche, sélectionner
   * une forme dans le dessin. Absent pour un lieu, qui n'existe pas sur la carte.
   */
  select?: () => void
  /**
   * Menu du bouton « … », dans la même forme que `<MarkerLayer menu>` — c'est ce qui
   * permet d'agir depuis la liste sans rejoindre l'élément sur la carte. Évalué à
   * l'ouverture, jamais au rendu de la ligne.
   */
  menu?: () => MenuItem[]
}

/**
 * Rubrique présente sur la carte : en-tête de section ET entrée du sélecteur de
 * portée. Déclarée par la couche, seule à savoir nommer et colorer ce qu'elle
 * porte — `typeLabel` pour une couche de markers, les libellés de la lib pour les
 * formes et les symboles. La boîte de recherche ne traduit rien.
 */
export type SearchGroup = {
  id: string
  label: string
  count: number
  /**
   * Couleur de la rubrique — la MÊME que celle de ses éléments sur la carte
   * (`theme.colors.marker[type]`, contour de zone…). Elle fait le lien visuel entre
   * une entrée du sélecteur et ce qu'on voit à l'écran.
   */
  color?: string
}

/**
 * Source de résultats déclarée par une couche. Le contrat est **synchrone** : tout
 * ce qui vit sur la carte est déjà en mémoire, et un aller-retour asynchrone par
 * frappe ne servirait qu'à faire clignoter la liste. Le géocodage distant, lui,
 * n'est pas un fournisseur — il est traité à part par la boîte, précisément parce
 * qu'il est lent et faillible.
 *
 * Les rubriques ne sont PAS demandées ici : la couche les DÉCLARE via
 * `SearchRegistry.report`, qui n'avertit les abonnés qu'en cas de changement réel.
 * Sans quoi un flux temps réel ferait rescanner tout le monde à chaque tick.
 */
export type SearchProvider = {
  /**
   * Entrées correspondant à `needle` (déjà normalisée par `normalizeSearch`),
   * triées du plus pertinent au moins pertinent. `group` restreint à une seule
   * rubrique (sélecteur de portée).
   */
  query(needle: string, opts: SearchQueryOptions): SearchQueryResult
}

export type SearchQueryOptions = {
  /** Rubrique unique demandée, ou absent pour toutes. */
  group?: string
  /** Nombre maximal d'entrées par rubrique. */
  limit: number
  /** Centre de la vue : départage les scores égaux par proximité. */
  origin?: LatLng
}

/**
 * Résultat d'une interrogation. `entries` est **tronqué** à `limit` par rubrique
 * alors que `totals` compte TOUTES les correspondances : c'est ce qui permet à
 * l'en-tête d'annoncer « Alertes 12 » en n'affichant que les 6 premières, au lieu
 * d'une troncature silencieuse qui laisse croire à une carte plus vide qu'elle ne l'est.
 */
export type SearchQueryResult = {
  entries: SearchEntry[]
  totals: Map<string, number>
}
