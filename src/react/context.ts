import { createContext, useContext } from 'react'
import type { MapEngine } from '../core/MapEngine'
import type { MarkerData } from '../data/types'
import type { RelationSnapshot } from '../relations/core/engine'
import type { MapPoint, RelationRule, TravelMode } from '../relations/core/types'
import type { MenuItem } from './components/ContextMenu'
import { defaultConfig } from '../config/defaultConfig'
import { DEFAULT_DRAW_PRESETS, type DrawPresets } from './components/drawPresets'
import type { MapConfig } from '../config/types'
import { defaultLabels } from '../labels/defaultLabels'
import type { MapLabels } from '../labels/types'
import type {
  DrawStyle,
  DrawTool,
  DrawnShape,
  GeoJSONFeatureCollection,
  MutateOptions,
  NewShape,
  SelectMode,
  ShapePatch,
} from '../layers/DrawLayer'
import type { DrawSettings } from '../layers/draw/DrawSettings'
import type { RenderedSymbol, SymbolCatalog, SymbolRenderOptions } from '../symbols/types'
import type { LatLng } from '../shared'
import { defaultTheme } from '../theme/defaultTheme'
import type { MapTheme } from '../theme/types'

/** Fourni par `<MapProvider>` : thème résolu (clair/sombre + reduced-motion). */
export const ThemeContext = createContext<MapTheme>(defaultTheme)

/** Fourni par `<MapProvider>` : libellés résolus (défauts + overrides `labels`). */
export const LabelsContext = createContext<MapLabels>(defaultLabels)

/**
 * Fourni par `<MapProvider>` : réglages résolus (défauts + overrides `config`).
 *
 * Le défaut du contexte est `defaultConfig` — un composant lu hors de toute carte
 * obtient donc des réglages complets plutôt que `null` à tester partout.
 */
export const ConfigContext = createContext<MapConfig>(defaultConfig)

/**
 * Paliers des palettes de style du dessin, fournis par `<DrawLayer presets>`.
 * Contexte plutôt que props : les palettes sont profondément imbriquées (barre →
 * panneau → sous-panneau → picker) et les traverser n'apprendrait rien à personne.
 */
export const DrawPresetsContext = createContext<DrawPresets>(DEFAULT_DRAW_PRESETS)

/** Paliers de style effectifs — défauts de la lib hors `<DrawLayer>`. */
export function useDrawPresets(): DrawPresets {
  return useContext(DrawPresetsContext)
}

export type MapContextValue = {
  engine: MapEngine
  overlay: HTMLElement
  theme: MapTheme
}

/** Fourni par `<Map>` une fois le moteur créé. */
export const MapContext = createContext<MapContextValue | null>(null)

export function useTheme(): MapTheme {
  return useContext(ThemeContext)
}

/** Libellés résolus — chaque texte affiché par la lib passe par ici. */
export function useLabels(): MapLabels {
  return useContext(LabelsContext)
}

/**
 * Réglages résolus — seuils de geste, budgets, fournisseurs tiers.
 *
 * Toujours complet : hors `<Map>`, ce sont les défauts de la lib. Aucun appelant
 * n'a donc à gérer l'absence de config.
 *
 * **À préférer systématiquement à `engine.config` dans la couche React.** Le moteur
 * reçoit la config depuis un effet de `<Map>`, et les effets d'un enfant s'exécutent
 * AVANT ceux de son parent : au render où `<Map config>` change, `engine.config`
 * porte encore la valeur de la frame précédente, et aucun re-render ne viendra
 * corriger ce qui l'aurait lue. Ce hook, lui, est la source de vérité React.
 *
 * Pour une closure qui survit à son render (handler d'événement abonné une fois,
 * boucle d'animation), garder la valeur dans une ref rafraîchie à chaque render —
 * cf. `MarkerLayer` (`latest.current.config`) ou `useViewport`.
 */
export function useConfig(): MapConfig {
  return useContext(ConfigContext)
}

export function useMapContext(): MapContextValue {
  const labels = useContext(LabelsContext)
  const ctx = useContext(MapContext)
  if (!ctx) throw new Error(labels.errors.outsideMap)
  return ctx
}

/** Accès au moteur bas-niveau (scène, caméra, projection…). */
export function useMap(): MapEngine {
  return useMapContext().engine
}

/** API de dessin exposée par `<DrawLayer>`. */
export type DrawingApi = {
  tool: DrawTool | null
  setTool: (tool: DrawTool | null) => void
  /** Mode de l'outil sélection : marquee rectangle, polygone ou lasso libre. */
  selectMode: SelectMode
  setSelectMode: (mode: SelectMode) => void
  /** Ids des formes sélectionnées (ordre de la collection). */
  selection: readonly string[]
  /** Ids des markers sélectionnés (multi-sélection de l'outil sélection). */
  markerSelection: ReadonlyArray<string | number>
  /** Détail des formes sélectionnées (kind par id) — pour les badges de sélection. */
  selectionDetails: ReadonlyArray<{ id: string; kind: DrawTool }>
  /** Sélectionne par ids (les formes verrouillées/masquées sont filtrées). */
  select: (ids: readonly string[]) => void
  /** Retire des markers de la sélection (croix d'un groupe de badges). */
  deselectMarkers: (ids: ReadonlyArray<string | number>) => void
  /** Vide TOUTE la sélection (formes + markers). */
  clearSelection: () => void
  /** Sélectionne toutes les formes visibles non verrouillées (active l'outil sélection). */
  selectAll: () => void
  /** Supprime les formes sélectionnées (annulable). */
  deleteSelection: () => void
  /** Duplique les formes sélectionnées (clones décalés, nouvelle sélection). */
  duplicateSelection: () => void
  /** Applique un style : à la sélection si non vide, sinon aux défauts des prochaines formes. */
  setStyle: (patch: DrawStyle) => void
  /** Style courant : commun de la sélection (champ hétérogène = absent), sinon défauts. */
  currentStyle: DrawStyle
  /** true si la sélection contient au moins un rectangle (affichage du rayon d'angle). */
  selectionHasRect: boolean
  /**
   * Emprise écran de la sélection, comme élément d'ancrage. Le panneau de style s'ouvre
   * dessus quand c'est une FORME qui l'ouvre : un panneau qui règle une forme se trouve
   * près d'elle, pas au niveau d'un bouton de la barre.
   */
  selectionBoxEl: SVGRectElement | null
  /** Réglages par outil (persistés) — s'abonner via `useDrawSettings()`. */
  settings: DrawSettings
  /** Verrouillage — réservé au code hôte : une forme verrouillée est intouchable dans l'UI. */
  lock: (ids: readonly string[]) => void
  unlock: (ids: readonly string[]) => void
  undo: () => void
  redo: () => void
  canUndo: boolean
  canRedo: boolean
  clear: () => void
  toGeoJSON: () => GeoJSONFeatureCollection
  fromGeoJSON: (fc: GeoJSONFeatureCollection) => void
  /**
   * CRUD par identité — pour une app qui tient chaque forme en base et la
   * synchronise par `id`. `silent` supprime toute émission d'event : c'est ce qui
   * permet de réinjecter une réponse du backend sans relancer sa propre mutation.
   */
  getShapes: () => DrawnShape[]
  getShape: (id: string) => DrawnShape | null
  /** Dernière forme de la collection — celle qui vient d'être dessinée. */
  getLastShape: () => DrawnShape | null
  addShape: (shape: NewShape, opts?: MutateOptions) => string | undefined
  updateShape: (id: string, patch: ShapePatch, opts?: MutateOptions) => boolean
  removeShape: (id: string, opts?: MutateOptions) => boolean
  replaceShapes: (shapes: readonly NewShape[], opts?: MutateOptions) => void
  /** Raccourcis effectifs (outils + actions, `false` = désactivé) — affichés par `Toolbar` dans ses tooltips. */
  shortcuts: Record<DrawTool | DrawAction, string | false>
  /**
   * Outils réellement activés (`<DrawLayer tools>`), dans l'ordre de la barre.
   *
   * Publié parce que le panneau « Réglages » listait sa PROPRE table figée : retirer
   * un outil de la barre le laissait réglable dans les réglages, et en ajouter un
   * l'y rendait invisible.
   */
  tools: readonly DrawTool[]
  /**
   * Symboles : catalogue disponible, rendu des vignettes et affiliation courante.
   * Fournis par `<DrawLayer>` (catalogue MIL-STD par défaut) pour que la palette de
   * la barre n'ait aucune configuration à recevoir.
   */
  symbols: {
    /** `false` si l'outil est désactivé (`<DrawLayer symbols={{ enabled: false }}>`). */
    enabled: boolean
    catalog: SymbolCatalog
    /** Vignette d'une entrée — `null` tant que le graphisme n'est pas chargé. */
    render: (key: string, opts?: SymbolRenderOptions) => RenderedSymbol | null
    /** `false` tant que le renderer n'est pas prêt (SDK en cours de chargement). */
    ready: boolean
    /** Affiliation appliquée aux symboles posés. */
    affiliation: string
    setAffiliation: (variant: string) => void
    /**
     * La palette est ouverte. **Publié** par le bouton, jamais relu par lui : il
     * reste maître de son propre affichage, sinon l'aller-retour par le contexte
     * ajouterait un rendu et sa fermeture au clic extérieur avalerait le clic
     * d'ouverture.
     *
     * Sert à deux choses. D'abord l'exclusivité visuelle de la barre : la main
     * s'éteint quand la palette s'ouvre, comme elle le fait pour la loupe. Ensuite
     * le chargement de la symbologie (~9 Mo), déclenché par cette ouverture ou par
     * la présence d'un symbole posé — jamais au simple montage de `<DrawLayer>`.
     */
    paletteOpen: boolean
    setPaletteOpen: (open: boolean) => void
    /** Pose un symbole du catalogue (utilisé par le dépôt de la palette). */
    place: (key: string, at: LatLng, variant?: string) => string | null
    /**
     * Nombre de symboles POSÉS sur la carte — le badge du bouton de barre, et rien d'autre
     * (même rôle que `useCatalogSelectionCount`). Suit la signature des symboles, pas le
     * `rev` du tracé : il ne rebondit donc pas à chaque frame d'un dessin en cours.
     */
    count: number
  }
}

/**
 * Actions clavier du dessin (raccourcis configurables, en plus des outils).
 *
 * `selectBuilding` y figure parce qu'il partage le sélecteur et sa table de raccourcis —
 * mais il n'arme aucun outil de dessin : c'est le pick de bâtiment du moteur, et il quitte
 * le dessin au lieu de s'y ajouter.
 */
export type DrawAction = 'selectRect' | 'selectPoly' | 'selectLasso' | 'selectBuilding'

export const DrawingContext = createContext<DrawingApi | null>(null)

/** API de l'outil loupe exposée par `<LensLayer>` (pilote le bouton de barre). */
export type LensApi = {
  /** Outil loupe actif : on peut tracer une zone (ou une zone existe déjà). */
  active: boolean
  activate: () => void
  deactivate: () => void
  toggle: () => void
  /** Raccourci clavier d'activation (lettre) ou `null` — affiché dans le tooltip. */
  shortcut: string | null
}

export const LensContext = createContext<LensApi | null>(null)

/** API du moteur de relations exposée par `<RelationLayer>`. */
export type RelationApi = {
  /** Règles déclarées par l'application — le seul endroit où vit le métier. */
  rules: readonly RelationRule[]
  /**
   * Entrée de menu à concaténer au menu contextuel d'un marker. Renvoie un
   * tableau vide si aucune règle ne s'applique : l'appelant concatène sans test.
   */
  menuFor: (marker: MarkerData) => MenuItem[]
  /** Lance une relation (règle déjà dérivée du preset choisi). */
  run: (source: MapPoint, rule: RelationRule) => void
  /** Relations affichées — une par marker source, plusieurs peuvent coexister. */
  snapshots: RelationSnapshot[]
  /**
   * Conteneurs DOM des socles, indexés par id de marker source. Ancrés à la carte par
   * la couche de rendu : y monter un portail suffit à suivre le marker, sans qu'aucune
   * position ne transite par React. C'est ce qui permet à `<RelationStatusBar>` de se
   * poser sur le socle plutôt que de flotter dans un coin de l'écran.
   */
  hubHosts: ReadonlyMap<string, HTMLElement>
  /**
   * Bascule le mode de transport d'une relation. Si un itinéraire est affiché, il est
   * RETRACÉ dans le nouveau mode plutôt que refermé : on demande le même trajet
   * autrement, on ne revient pas au choix de la cible.
   */
  setMode: (sourceId: string, mode: TravelMode) => void
  /**
   * Couleur des itinéraires tracés. Exposée parce qu'une surface qui décrit le tracé
   * doit pouvoir s'accorder à lui : la pastille de la barre d'état porte la couleur de
   * ce qu'elle désigne, sinon elle continue d'annoncer la famille de tags alors que
   * c'est un itinéraire qui est à l'écran.
   */
  routeColor: string
  /**
   * Couleur d'une FAMILLE : `rule.color`, sinon celle du tag qu'elle vise (résolue
   * comme dans le panneau « Couches » : `theme.colors.tags`, puis palette hashée),
   * sinon `RelationLayer.defaultColor`.
   *
   * C'est ce que portent les pastilles de famille — elles nomment une famille de
   * cibles, pas le trait qui en sortira : celui-ci prend la couleur du marker source
   * dès que la règle laisse la question ouverte.
   */
  familyColor: (rule: RelationRule) => string
  /** Referme l'itinéraire d'une relation (id de lien ou de source) ; tous si omis. */
  untrace: (linkOrSourceId?: string) => void
  /** Efface la relation d'un marker source, ou toutes si l'id est omis. */
  clear: (sourceId?: string) => void
}

export const RelationContext = createContext<RelationApi | null>(null)
