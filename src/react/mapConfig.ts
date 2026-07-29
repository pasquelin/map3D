// Configuration déclarative de l'interface et des couches, passée en props à
// `<Map>`.
//
// Pourquoi ce module : toutes ces surfaces ont besoin du contexte carte (moteur,
// overlay DOM), donc elles doivent vivre SOUS le provider. Rien n'oblige en
// revanche l'application à les écrire elle-même — et les écrire à la main revenait
// à connaître l'ordre d'imbrication exact (la barre sous la couche de dessin, tout
// sous la loupe), un savoir qui appartient à la lib. `<Map>` les monte donc dans le
// bon ordre à partir de ces objets.
//
// La règle est uniforme : `false` retire la surface, un objet la règle, l'absence
// prend les défauts de la lib. Une surface retirée l'est ENTIÈREMENT — bouton,
// raccourci clavier et couche associée.

import type { ReactNode } from 'react'
import type { Camera } from '../core/Camera'
import type { BuildingInfo, MapEngine } from '../core/MapEngine'
import type { MarkerData } from '../data/types'
import type { PedestrianApi } from './hooks/usePedestrian'
import type { DrawingApi, LensApi, RelationApi } from './context'
import type { MenuItem } from './components/ContextMenu'
import type { DrawLayerProps } from './components/DrawLayer'
import type { LensOptions } from './components/LensLayer'
import type { MapControlsProps } from './components/MapControls'
import type { ClusterSurfaceProps } from './components/ClusterSurface'
import type { MarkerLayerProps } from './components/MarkerLayer'
import type { PinnedDockProps } from './components/PinnedDock'
import type { RelationLayerProps } from './components/RelationLayer'
import type { RelationStatusBarProps } from './components/RelationStatusBar'
import type { SearchBoxProps } from './components/SearchBox'
import type { SelectionBadgesProps } from './components/SelectionBadges'
import type { ShapeLayerProps } from './components/ShapeLayer'
import type { DrawToolbarProps } from './components/Toolbar'

/**
 * Barre d'outils : outils de tracé, symboles **et loupe**.
 *
 * La loupe se règle ici et non à la racine parce que c'est ici qu'elle se
 * manifeste : son bouton est un item de cette barre, au même titre que le
 * rectangle ou les symboles. `<Map>` s'occupe seul de monter la couche
 * correspondante autour de l'arbre — ce détail d'imbrication ne regarde pas
 * l'application.
 */
export type ToolbarConfig<T = unknown> = DrawToolbarProps & {
  /** Outil loupe (inventaire des markers d'une zone). `false` = ni bouton, ni raccourci. */
  lens?: false | LensOptions<T>
}

/** Contrôles de navigation (déplacement, boussole, zoom, fonds, couches, plein écran). */
export type ControlsConfig = MapControlsProps

/**
 * Recherche unifiée : éléments de la carte (markers, zones, dessins, symboles) et
 * géocodage de lieux, en une liste rubriquée. Sans `search` sur `<Map>`, la boîte
 * n'existe pas.
 *
 * Les rubriques carte ne se déclarent PAS ici : elles viennent des couches, qui
 * s'inscrivent d'elles-mêmes au registre `engine.search`. Il suffit qu'un marker
 * porte un `title` pour être trouvable, et un `typeLabel` sur sa couche pour que sa
 * rubrique ait un nom lisible. Cet objet ne règle que la boîte elle-même :
 * géocodeur, portée, plafonds, historique.
 */
export type SearchConfig = SearchBoxProps

/**
 * Dock des favoris épinglés. **Contrôlée** : `items` vient de l'application, qui
 * persiste ce qu'elle veut — la lib ne stocke rien.
 *
 * Son absence a une conséquence voulue au-delà de l'affichage : plus aucune zone
 * n'accepte un marker, donc les markers cessent d'être saisissables (cf.
 * `useDraggable`). Un geste sans destination n'est pas proposé.
 */
export type DockConfig<T = unknown> = PinnedDockProps<T>

/**
 * Couche de dessin. `false` retire aussi la barre d'outils, qui la pilote.
 *
 * `selectionBadges` règle les vignettes de sélection (formes groupées, markers
 * listés) — montées d'office, comme le reste du dessin : elles font partie de
 * l'expérience de sélection, pas d'un assemblage à refaire. `false` les retire, un
 * objet ne fournit que des libellés.
 */
export type DrawConfig = Omit<DrawLayerProps, 'children'> & {
  selectionBadges?: false | SelectionBadgesProps
}

/**
 * Moteur de relations par tags (liens, itinéraires réels).
 *
 * Sa présence l'active — il n'a pas de défaut utile, `rules` et `provider` étant le
 * vocabulaire métier de l'application. `<Map>` le monte AUTOUR des couches de
 * markers, ce qui fait arriver ses entrées dans leur menu contextuel (second
 * argument de `menu`, cf. `MarkersSpec`).
 */
export type RelationsConfig = Omit<RelationLayerProps, 'children'> & {
  /**
   * Barre d'état des relations ouvertes, posée sur le socle du marker source.
   * Montée d'office avec le moteur : une relation en cours doit pouvoir être lue et
   * fermée, ce n'est pas une option. `false` la retire, un objet fournit de quoi
   * nommer un point (l'application seule le sait).
   */
  statusBar?: false | RelationStatusBarProps
}

/**
 * Poignée impérative de la carte, obtenue via `ref` sur `<Map>`.
 *
 * C'est le chemin pour piloter la carte **depuis l'extérieur** : un bouton de votre
 * dashboard, un effet, un gestionnaire d'événement — sans avoir à écrire un
 * composant enfant juste pour appeler un hook. `useCamera()` et `useDrawing()`
 * gardent leur rôle propre : ils re-rendent leur consommateur quand l'état change,
 * ce qu'une poignée ne fait pas.
 *
 * ```tsx
 * const map = useRef<MapHandle>(null)
 * <Map ref={map} … />
 * map.current?.camera.fitBounds(bounds, { padding: 60 })
 * map.current?.drawing?.addShape({ kind: 'circle', … })
 * ```
 *
 * Les sous-API sont lues à l'appel (accesseurs) et non figées à la création : la
 * poignée reste valable alors que le dessin ou la loupe se montent après elle.
 */
export type MapHandle = {
  /** Moteur bas-niveau — échappatoire vers tout ce que la poignée n'expose pas. */
  readonly engine: MapEngine
  /** Caméra : `fitBounds`, `panTo`, `setZoom`, `flyTo`, `follow`, `getState`… */
  readonly camera: Camera
  /** Mode piéton : armer le placement, entrer, quitter, régler l'immersion. */
  readonly pedestrian: PedestrianApi
  /** Dessin : outils, sélection, CRUD par identité. `null` si `draw={false}`. */
  readonly drawing: DrawingApi | null
  /** Outil loupe. `null` s'il est retiré (`toolbar={false}` ou `lens: false`). */
  readonly lens: LensApi | null
  /** Moteur de relations. `null` si aucune prop `relations`. */
  readonly relations: RelationApi | null
}

/** Identité de couche, stable d'un rendu à l'autre (clé React). */
type WithId = {
  /**
   * Clé de la couche. À fournir dès que la liste peut être réordonnée ou filtrée :
   * sans elle c'est l'indice qui sert, et une couche insérée en tête recyclerait
   * l'état de sa voisine.
   */
  id?: string
}

/**
 * Couche de markers. `menu` reçoit un second argument absent de `<MarkerLayer>` :
 * l'API du moteur de relations, ou `null` s'il n'y en a pas. C'est ce qui remplace
 * la render-prop de `<RelationLayer>` — sans enfants, il faut bien que les entrées
 * « Distance autour › » parviennent au menu d'un marker.
 */
export type MarkersSpec<T = unknown> = WithId & { kind: 'markers' } & Omit<MarkerLayerProps<T>, 'menu'> & {
    menu?: (p: MarkerData<T>, relations: RelationApi | null) => MenuItem[]
  }

/**
 * Couche de **données** de la carte : ce qui rend des points ou des géométries.
 * Union discriminée par `kind` — un tableau plutôt que des enfants, pour que
 * l'assemblage entier de la carte tienne dans ses props.
 *
 * Le moteur de relations n'en fait pas partie : il ne rend rien, il fournit un
 * contexte aux couches qui rendent. Il se déclare en `relations` (cf.
 * `RelationsConfig`) et `<Map>` le monte autour d'elles.
 *
 * À écrire via les fabriques ci-dessous plutôt qu'en objet littéral : `layers` est
 * hétérogène, donc ce type public voit les données d'un marker comme `unknown`, et
 * un callback annoté sur VOS données ne s'y assignerait pas.
 */
export type LayerSpec = MarkersSpec | (WithId & { kind: 'shapes' } & ShapeLayerProps)

/**
 * Couche de markers **typée sur vos données**.
 *
 * `layers` est hétérogène : un seul paramètre de type ne peut pas décrire à la fois
 * une couche d'agents et une couche d'alertes. Cette fabrique déplace le générique
 * sur l'appel, si bien que `icon`, `menu` ou `tooltip` reçoivent `MarkerData<Agent>`
 * au lieu d'un `unknown` à convertir.
 *
 * ```ts
 * layers={[
 *   markersLayer<Agent>({ points: agents, icon: (m) => avatarDe(m.data) }),
 *   shapesLayer({ shapes: zones }),
 * ]}
 * ```
 */
export const markersLayer = <T>(props: Omit<MarkersSpec<T>, 'kind'>): LayerSpec =>
  ({ kind: 'markers', ...props }) as unknown as LayerSpec

/** Couche de formes drapées (zones, périmètres, volumes). */
export const shapesLayer = (props: WithId & ShapeLayerProps): LayerSpec => ({ kind: 'shapes', ...props })

/**
 * Surfaces d'interface configurables depuis `<Map>`.
 *
 * Deux paramètres de type, tous deux inférés à l'usage : `T` décrit les données
 * d'un marker (la loupe les lit), `TPin` celles d'un favori épinglé. Ils sont
 * distincts parce qu'un favori porte souvent plus que le marker dont il vient — de
 * quoi s'afficher hors de la carte, alors que le marker peut avoir disparu du
 * viewport. Les confondre forcerait l'un des deux à mentir.
 */
export type MapSurfaces<T = unknown, TPin = unknown> = {
  /** Barre d'outils de dessin (loupe comprise). `false` = pas de barre. */
  toolbar?: false | ToolbarConfig<T>
  /** Contrôles de navigation. `false` = aucun contrôle. */
  controls?: false | ControlsConfig
  /** Recherche de lieu : `true` pour les défauts, un objet pour la régler. */
  search?: boolean | SearchConfig
  /** Dock des favoris — sa présence l'active (et rend les markers saisissables). */
  dock?: DockConfig<TPin>
  /** Couche de dessin. `false` retire le dessin ET la barre qui le pilote. */
  draw?: false | DrawConfig
  /** Moteur de relations par tags — sa présence l'active (cf. `RelationsConfig`). */
  /**
   * Regroupement COMMUN de la carte : ce qui se superpose à l'écran devient une
   * pastille, quelle que soit la couche d'origine. `false` le coupe entièrement ;
   * une couche s'en retire avec `cluster: { enabled: false }`.
   *
   * Réglé ici et non par couche : un même nœud agrège les points de plusieurs
   * couches, il ne peut donc pas prendre deux apparences contradictoires.
   */
  cluster?: false | ClusterSurfaceProps
  relations?: RelationsConfig
  /** Couches de données, dans l'ordre de rendu. */
  layers?: LayerSpec[]
  /** Plugins à rendre disponibles. Registre alimenté au montage ; l'utilisateur active/config via le hub. */
  plugins?: readonly import('../plugins/types').AnyPlugin[]
  /**
   * Menu d'un marker, **partagé par les trois surfaces qui en proposent un** : le
   * marker sur la carte, l'inventaire de la loupe et le panneau de sélection. Un
   * marker offre ainsi les mêmes actions où qu'on le rencontre, déclarées une seule
   * fois — au lieu d'une fois par surface, avec la dérive que cela garantit.
   *
   * Le second argument porte les entrées du moteur de relations (« Distance autour ›
   * Agents »), `null` sans `relations`.
   *
   * Surchargeable par surface quand elles doivent différer : `layers[].menu`,
   * `toolbar.lens.menu`, `draw.selectionBadges.markerMenu`. Les deux listings
   * ajoutent « Cibler » en tête d'eux-mêmes — inutile de le prévoir ici.
   */
  markerMenu?: (p: MarkerData<T>, relations: RelationApi | null) => MenuItem[]
  /**
   * Menu d'un **bâtiment** du volume interne, ouvert au clic quand l'outil « Sélectionner
   * un bâtiment » est actif. Même contrat que `markerMenu` : l'hôte compose tout — lignes
   * d'information comme actions — et la lib n'écrit aucun texte.
   *
   * Sans cette prop, l'outil reste disponible et surligne au survol, mais le clic n'ouvre
   * rien : la lib n'a rien à dire d'un bâtiment.
   *
   * Les attributs MVT n'arrivent dans `info.props` que s'ils sont demandés par
   * `config.providers.buildings.pickFields` ; `height`, `minHeight`, `featureId` et la
   * coordonnée cliquée sont toujours là.
   */
  buildingMenu?: (info: BuildingInfo) => MenuItem[]
  /**
   * Composants **de l'application** montés dans la carte : panneaux maison, écoutes
   * d'événements, tout ce qui consomme `useMap()`, `useDrawing()` ou `useLens()`.
   *
   * Ce n'est plus le point d'assemblage de la lib — barre, contrôles, recherche,
   * dock et couches passent par les props ci-dessus. Reste ici ce qui vous
   * appartient.
   */
  children?: ReactNode
}
