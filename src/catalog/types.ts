import type { ShapeData } from '../layers/ShapeLayer'
import type { Bounds } from '../shared'

/** Identité d'un élément DANS sa source. Jamais unique à elle seule — cf. `CatalogKey`. */
export type CatalogId = string | number

/**
 * Clé d'un élément dans la sélection : `` `${sourceId}:${itemId}` ``.
 *
 * Deux sources peuvent numéroter leurs éléments à partir de 1 ; c'est le préfixe qui
 * rend la clé globale, et c'est lui qui permet de purger la sélection quand une source
 * disparaît sans toucher aux autres.
 */
export type CatalogKey = string

/**
 * Une source de catalogue — le SEUL point de contact entre map3D et une API distante.
 *
 * Écrite par l'hôte (ou par un plugin), inscrite sur `engine.catalog`. La lib ne sait
 * rien de ce qu'il y a derrière : ni le transport, ni l'authentification, ni la forme
 * des identifiants. Elle sait lister, paginer, demander une géométrie.
 */
export type CatalogSource = {
  /** Identité stable — préfixe de clé, valeur persistée, clé du registre. */
  id: string
  /** Libellé du sous-menu. Fourni par l'hôte : la lib ne traduit aucun nom de type. */
  label: string
  /** Chemin @mdi/js de l'icône du sous-menu. */
  icon: string
  /** Regroupe les entrées du sous-menu (« Mes zones », « Territoires »). */
  family?: string
  /**
   * Total annoncé dans le sous-menu, SANS déclencher de requête.
   *
   * C'est ce qui permet d'afficher « 36 699 » à côté d'un type qu'on n'a jamais ouvert.
   * Absent, le sous-menu n'affiche pas de compte — il ne va pas le chercher.
   */
  total?: number

  /** Une page de résultats. Voir `CatalogRequest` pour la sémantique du curseur. */
  list(req: CatalogRequest): Promise<CatalogPage>

  /**
   * La géométrie d'un élément — UNE zone, ou les trois d'un groupe.
   *
   * Le tableau est ce qui fait qu'un agrégat est un élément ordinaire : la lib n'a
   * aucune notion de « groupe », elle affiche et retire ce qu'on lui rend, en bloc.
   */
  geometry(id: CatalogId, signal: AbortSignal): Promise<ShapeData[]>

  /**
   * Enfants d'un élément. Fourni ⇒ les éléments marqués `hasChildren` deviennent
   * dépliables. Un seul niveau de descente est exploité (cf. `flattenCatalog`).
   */
  children?(id: CatalogId, req: CatalogRequest): Promise<CatalogPage>

  /** Boutons d'icônes en ligne. Plafonnés par `config.catalog.maxInlineActions`. */
  actions?: readonly CatalogAction[]
}

export type CatalogRequest = {
  /**
   * Recherche, déjà normalisée par `normalizeSearch` — « reseau » doit trouver
   * « Réseau », comme partout ailleurs dans la carte. Chaîne vide = pas de filtre.
   */
  query: string
  /** Curseur rendu par la page précédente. Absent = première page. */
  cursor?: string
  /** Éléments demandés (`config.catalog.pageSize`). */
  limit: number
  /** Abandonné dès que la requête devient obsolète — frappe suivante, panneau fermé. */
  signal: AbortSignal
}

export type CatalogPage = {
  items: readonly CatalogItem[]
  /**
   * Total de la requête, toutes pages confondues. Absent ⇒ le compteur retombe sur le
   * nombre d'éléments chargés, ce qui vaut mieux qu'un total faux.
   */
  total?: number
  /** Absent ⇒ dernière page. C'est lui, et non un compte, qui pilote le scroll infini. */
  nextCursor?: string
}

export type CatalogItem = {
  id: CatalogId
  /** Nom affiché. C'est aussi celui que reçoit la géométrie si elle n'en porte pas. */
  title: string
  subtitle?: string
  /** Chemin @mdi/js, rendu dans la pastille de la ligne. */
  icon?: string
  /** Teinte de la pastille. */
  color?: string
  /** Pastilles d'information : « Actif », compteur d'enfants… */
  badges?: readonly CatalogBadge[]
  /**
   * Emprise. Présente, le clic sur le nom cadre SANS charger la géométrie — c'est la
   * différence entre un cadrage immédiat et un aller-retour réseau par clic.
   */
  bounds?: Bounds
  /** `false` ⇒ bouton bascule grisé (un groupe vide n'a rien à afficher). */
  addable?: boolean
  /** Déclare qu'il y a des enfants à aller chercher via `CatalogSource.children`. */
  hasChildren?: boolean
}

/**
 * Une pastille de ligne : une icône OU un texte, teintés.
 *
 * Un seul type pour ce qui, côté métier, sont deux colonnes distinctes (un état
 * « actif », un nombre d'enfants). Inscrire « actif » dans la lib y inscrirait du
 * métier ; avec une pastille générique, un troisième indicateur ne coûte rien.
 */
export type CatalogBadge = {
  icon?: string
  text?: string
  color?: string
  /** Infobulle ET nom accessible. Requis : une pastille muette n'informe personne. */
  label: string
}

export type CatalogAction = {
  id: string
  /** Chemin @mdi/js. */
  icon: string
  /** Infobulle et `aria-label`. */
  label: string
  run(item: CatalogItem, source: CatalogSource): void
  /** Masque l'action pour CET élément (elle ne prend alors pas de place). */
  hidden?(item: CatalogItem): boolean
  /** Rend l'action inerte pour CET élément, mais visible. */
  disabled?(item: CatalogItem): boolean
}
