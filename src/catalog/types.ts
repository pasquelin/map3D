import type { DataSource, MarkerData } from '../data/types'
import type { ShapeData } from '../layers/ShapeLayer'
import type { MarkerLayerDecl } from '../react/components/MarkerLayer'
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
 * des identifiants.
 *
 * **Deux régimes, et le choix ne relève pas du goût** : un référentiel qu'on PARCOURT
 * élément par élément (`browse`), et un jeu qu'on ALLUME d'un bloc (`toggle`). Un
 * référentiel de 36 000 défibrillateurs ne se parcourt pas — personne ne cochera trente
 * mille cases —, il se charge au cadre visible ; à l'inverse, cinq zones qu'on compare
 * une à une n'ont rien à faire dans un interrupteur unique.
 *
 * Union DISCRIMINÉE et non un jeu de champs optionnels : c'est ce qui rend impossible
 * une source qui déclarerait `list` sans `geometry`, ou un `markerLayer` sur un
 * référentiel qui ne pose que des formes. Le compilateur porte la règle, pas une garde
 * à l'exécution.
 */
export type CatalogSource = CatalogBrowseSource | CatalogToggleSource

/** Ce que les deux régimes ont en commun : de quoi peupler une ligne de menu. */
export type CatalogSourceBase = {
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
   *
   * C'est le volume du JEU DE RÉFÉRENCE, une donnée stable et vérifiable — jamais une
   * mesure de ce qui est à l'écran (cf. `CatalogToggleSource`).
   */
  total?: number
}

/**
 * Le régime de PARCOURS : une liste paginée, une case par élément.
 *
 * `kind` est optionnel et vaut `'browse'` : une source écrite avant l'arrivée des
 * bascules reste valide telle quelle, sans un caractère à changer.
 */
export type CatalogBrowseSource = CatalogSourceBase & {
  kind?: 'browse'

  /** Une page de résultats. Voir `CatalogRequest` pour la sémantique du curseur. */
  list(req: CatalogRequest): Promise<CatalogPage>

  /**
   * La géométrie d'un élément — UNE zone, ou les trois d'un groupe.
   *
   * Le tableau est ce qui fait qu'un agrégat est un élément ordinaire : la lib n'a
   * aucune notion de « groupe », elle affiche et retire ce qu'on lui rend, en bloc.
   *
   * ⚠️ Doit répondre pour les éléments rendus par `list` **ET** pour ceux rendus par
   * `children` : un enfant déplié appartient à la même source que son parent, et c'est
   * cette méthode-là qu'on appellera pour lui. Une source qui n'indexerait que ses
   * racines rendrait un tableau vide sur chaque enfant — donc un bouton qui n'affiche
   * rien, sans la moindre erreur.
   */
  geometry(id: CatalogId, signal: AbortSignal): Promise<ShapeData[]>

  /**
   * Les POINTS d'un élément, s'il en a — une caserne, les bornes d'un secteur.
   *
   * Appelée avec `geometry` et sur le même geste : un élément peut n'avoir que des
   * formes, que des points, ou les deux. Ils entrent dans le regroupement, le filtre
   * « Couches » et la recherche comme n'importe quel marker, et repartent ensemble
   * quand la case se décoche.
   *
   * Les points ne sont pas persistés (les formes non plus) : ils sont redemandés à la
   * source à la restauration.
   */
  markers?(id: CatalogId, signal: AbortSignal): Promise<MarkerData[]>

  /**
   * Enfants d'un élément. Fourni ⇒ les éléments marqués `hasChildren` deviennent
   * dépliables. Un seul niveau de descente est exploité (cf. `flattenCatalog`).
   */
  children?(id: CatalogId, req: CatalogRequest): Promise<CatalogPage>

  /**
   * Boutons d'icônes en ligne. Plafonnés par `config.catalog.maxInlineActions`.
   *
   * Ici et non sur la base commune : une action reçoit le `CatalogItem` sur lequel elle
   * porte, et une source à bascule n'a pas d'éléments. Déclarée là-bas, elle aurait
   * compilé sans jamais être rendue nulle part.
   */
  actions?: readonly CatalogAction[]
}

/**
 * Le régime de BASCULE : un interrupteur, et le jeu se charge AU CADRE VISIBLE.
 *
 * Pour ce qui n'a pas vocation à être parcouru élément par élément. La source n'est
 * qu'une `DataSource<MarkerData>` — le contrat viewport de la lib, inchangé : c'est
 * `ViewportController` qui l'exécute, avec son anti-rebond, son gate `minZoom`, son
 * `AbortSignal` et son rejet des réponses hors-ordre.
 *
 * ⚠️ **Le volume chargé n'est pas le volume affiché.** L'emprise demandée est
 * délibérément ÉLARGIE (`config.performance.boundsMargin`, +15 % de part et d'autre sur
 * les deux axes) pour qu'aucun marker réellement visible ne manque et que rien ne
 * surgisse au moindre déplacement. Une bascule charge donc structurellement plus que ce
 * qu'on voit — raison pour laquelle **aucune surface n'affiche le nombre d'éléments
 * chargés** : posé à côté d'une carte qui en montre trois, un « 142 » se lit « 142
 * affichés » et envoie chercher les 139 manquants. `total` (le jeu de référence) et
 * l'état de chargement sont, eux, vrais et vérifiables.
 */
export type CatalogToggleSource = CatalogSourceBase & {
  kind: 'toggle'

  /**
   * Le jeu, rechargé selon la vue. `minZoom` y agit comme gate : en dessous, aucune
   * requête n'est émise (cf. `DataSource`).
   */
  source: DataSource<MarkerData>

  /**
   * Rendu des points — LE MÊME type que la voie déclarative des plugins, pour qu'une
   * capacité ne se règle pas de deux façons selon d'où elle vient.
   */
  markerLayer?: MarkerLayerDecl
}

/**
 * Point de vérité UNIQUE de la discrimination : `kind` absent vaut `'browse'`.
 *
 * Lire `s.kind === 'browse'` quelque part suffirait à faire disparaître du menu toutes
 * les sources écrites avant l'arrivée des bascules — c'est la NÉGATION qui est correcte.
 */
export const isToggleSource = (s: CatalogSource): s is CatalogToggleSource => s.kind === 'toggle'

export const isBrowseSource = (s: CatalogSource): s is CatalogBrowseSource => s.kind !== 'toggle'

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
  /**
   * Nom affiché — c'est aussi celui que reçoit la géométrie si elle n'en porte pas.
   *
   * Pas de sous-titre : la hauteur de ligne est CONSTANTE (la virtualisation en dépend),
   * donc une seconde ligne de texte est structurellement impossible. Ce qui doit
   * distinguer deux éléments homonymes appartient au titre.
   */
  title: string
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
  /**
   * Ligne INERTE : ni cadrage, ni affichage, ni action. Pour ce qu'on montre sans
   * pouvoir le consommer — un agrégat vide, une zone désactivée côté métier.
   *
   * La ligne reste VISIBLE et grisée plutôt que masquée : sa disparition ferait croire
   * que l'élément n'existe pas, alors qu'il est seulement indisponible.
   */
  disabled?: boolean
  /** Déclare qu'il y a des enfants à aller chercher via `CatalogSource.children`. */
  hasChildren?: boolean
  /**
   * Section à laquelle appartient cet élément — un en-tête portant ce nom s'insère dans la
   * liste au changement de valeur.
   *
   * ⚠️ **La lib ne trie pas** : elle ouvre une section quand `group` change d'un élément au
   * suivant. C'est ce qui rend le regroupement compatible avec la pagination — une page
   * arrive après coup et prolonge la section en cours. À vous de servir vos éléments
   * groupés ; sinon le même intitulé réapparaîtra plus bas, ce qui est l'affichage fidèle
   * de ce que la source a rendu.
   *
   * À ne pas confondre avec `hasChildren` : un **agrégat** est un élément qu'on coche et
   * qui emporte ses enfants ; une **section** n'est qu'un intertitre, sans case ni action.
   * Absent (ou vide), l'élément n'ouvre aucune section.
   */
  group?: string
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
