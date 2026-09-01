// Point d'entrée public de map3d.

import { version } from '../package.json'

// Dérivée du manifeste : recopiée à la main, elle finit par mentir (restée à 0.1.0
// pendant deux versions publiées).
export const VERSION: string = version

// ── Primitives partagées ──
export type { LatLng, Bounds, SearchResult } from './shared'

// ── Core ──
export { MapEngine, altitudeForZoom, zoomForAltitude } from './core/MapEngine'
// À poser sur un overlay carte custom pour que la molette y zoome la carte
// (les barres et panneaux d'UI, eux, ne le portent pas).
export { WHEEL_SURFACE_ATTR } from './core/MapEngine'
export type {
  MapEngineOptions,
  MapMode,
  BasemapState,
  MapEvents,
  MapStats,
  DragMode,
  InteractiveMode,
  PointerInterceptor,
  PointerPhase,
} from './core/MapEngine'
export { Camera } from './core/Camera'
export type { CameraState, FlyOptions, FitBoundsOptions, FitPadding } from './core/Camera'
export type { CameraMode, ImmersionLevel, PedestrianPhase, PedestrianState } from './core/pedestrianState'
// Agrégation et cadrage de cadres géographiques (antiméridien traité) : de quoi
// nourrir `camera.fitBounds()` depuis des points, des formes ou des markers.
export {
  altitudeForBounds,
  boundsOfCircle,
  boundsOfLatLngs,
  centerOfBounds,
  lngSpanDeg,
  unionBounds,
} from './core/bounds'
export type { AltitudeForBoundsOptions } from './core/bounds'
export { boundsOfShape, boundsOfShapes } from './layers/ShapeLayer'
export { boundsOfMarkers } from './data/types'
export { Projection } from './core/Projection'
export type { ScreenPoint } from './core/Projection'
export { EnuFrame } from './core/enu'
// `tagColor`/`countTags` sont publics : un panneau custom (MapControls
// `components.layers`) doit pouvoir reproduire les couleurs de repli, et un
// intégrateur vanilla (core sans React) nourrir `engine.tags.report`.
export { tagColor, countTags } from './core/TagFilter'
// Résolveurs de couleur du thème — ce que la lib elle-même consulte pour peindre un
// marker ou un tag. Publics pour qu'un marker, une liste ou un panneau écrits par
// l'hôte s'accordent avec ceux de la lib au lieu de refaire la chaîne de repli.
export { markerColorOf, tagColorOf } from './theme/colors'
export type { TagFilter, TagEntry } from './core/TagFilter'
export type { Layer, FrameContext, MapView } from './core/Layer'
// Registre des sélectionnables externes (`engine.selectables`) : un intégrateur
// peut y brancher sa propre couche pour la rendre sélectionnable au marquee.
export { SelectableRegistry, SELECTABLE_KINDS, kindAllowed } from './core/Selectables'
export type {
  SelectableProvider,
  SelectableConsumer,
  SelectableInfo,
  SelectableScreenItem,
  SelectableGeometry,
  PolyGeometry,
  SelectableGroup,
  SelectableKind,
  SelectablePolicy,
  PickModifiers,
} from './core/Selectables'
// Registre des objets hôte effaçables par la gomme (`engine.erasables`) — miroir de
// `selectables` : une couche custom y branche son provider pour être effaçable au marquee.
export { ErasableRegistry } from './core/Erasables'
export type { ErasableProvider, ErasableItem } from './core/Erasables'
// Registre du drag-and-drop générique (`engine.drag`) : source de vérité de
// l'état, zones de dépôt, payload typé. Piloté par la couche React.
export { DragRegistry } from './core/DragRegistry'
export type { DragPayload, DropZone, DropPoint, DragState, DragEnd } from './core/DragRegistry'
// Registre d'inventaire des markers (`engine.markers`) consommé par l'outil loupe :
// une couche marker s'y branche pour rendre ses points interrogeables par cadre géo.
export { MarkerRegistry, boundsContains } from './core/MarkerQuery'
export type { MarkerProvider } from './core/MarkerQuery'
// Hauteurs d'ancre mémoïsées (raycast amorti, retentatives des tuiles absentes,
// invalidation 2D/3D) : à réutiliser par toute couche custom qui projette des
// éléments drapés au sol plutôt que d'en réécrire les précautions.
export { AnchorHeightCache } from './core/AnchorHeightCache'
export * as MapMath from './core/math'
// Les géométries dont les coordonnées ne sont pas finies sont écartées et signalées
// une fois par origine. À rediriger vers le journal de l'hôte, ou à couper (`null`) :
// une lib n'a pas à écrire d'autorité dans la console de l'application.
export { setGeometryWarner } from './core/geometry'
// Capture d'image de la carte (`engine.capture()` / `MapHandle.capture()` / `useCapture()`).
// Le rasteriseur d'overlay (markers/labels) est INJECTÉ par l'hôte — la lib n'embarque
// aucune dépendance de rasterisation (cf. `OverlayRasterizer`).
export type { CaptureOptions, CaptureFormat, CaptureBackground, OverlayRasterizer } from './core/capture'

// ── Data (viewport-driven / temps réel) ──
export type { Viewport, DataSource, MarkerData, StaticMarker } from './data/types'
export { ViewportController } from './data/ViewportController'
export type { ViewportControllerOptions } from './data/ViewportController'

export { diffById } from './data/diff'
export type { DiffResult } from './data/diff'

// ── Layers (moteurs bas-niveau) ──
export { ClusterEngine } from './layers/ClusterLayer'
export type { ClusterInfo, ClusterEntry } from './layers/ClusterLayer'
export type { ShapeData } from './layers/ShapeLayer'
export type { PathData } from './layers/PathLayer'
export type {
  DrawTool,
  GeoJSONFeatureCollection,
  MeasureTool,
  SelectMode,
  EraseMode,
  EraseResult,
  EraseTarget,
  DrawStyle,
  StrokeStyle,
  Drawing,
  DrawDefaults,
} from './layers/DrawLayer'
// Formes vues par l'app hôte : identité stable + métadonnées métier opaques,
// monnaie d'échange des events par forme et du CRUD par identité.
export type { DrawnShape, NewShape, ShapePatch, ShapeMeta, ShapeSymbol, MutateOptions } from './layers/DrawLayer'
// Contraintes métier du dessin utilisateur (périmètres autorisés, aire max).
export type { DrawConstraints, DrawRejectReason } from './layers/DrawLayer'
// Prédicats GÉODÉSIQUES (lat/lng, m²) — verdict stable, indépendant de la caméra.
export { circleRing, pointInRing, polygonAreaM2, ringInsideRing, ringsOverlap } from './core/geodesy'
export { ringOfShape } from './layers/ShapeLayer'
// ── Symboles (catalogue d'icônes posées au glisser-déposer) ──
// Le graphisme est INJECTÉ (`SymbolRenderer`), comme les providers de recherche et
// de routage : la couche ne connaît que des clés de catalogue.
// Symbologie MIL-STD-2525D prête à l'emploi : catalogue (80 icônes + 11 graphiques
// tactiques, libellés FR) et renderer adossé au SDK officiel, chargé en import
// dynamique (chunk séparé, ~9 Mo, jamais téléchargé sans symboles à l'écran).
export {
  MILSYM_CATALOG,
  MILSYM_ENTRIES,
  MILSYM_AFFILIATION_COLORS,
  applyAffiliation,
  createMilSymRenderer,
  milSymSidc,
} from './symbols/providers/milSym'
export type { MilSymAffiliation, MilSymEntry, MilSymRendererOptions } from './symbols/providers/milSym'
export type { SymbolCatalog, SymbolEntry, SymbolRenderer, SymbolRenderOptions, RenderedSymbol } from './symbols/types'
export { DrawSettings } from './layers/draw/DrawSettings'
export type { ToolSettings } from './layers/draw/DrawSettings'

// ── Thème ──
export type { MapTheme, MarkerColor, PartialTheme, ThemeInput, DeepPartial } from './theme/types'
export { defaultTheme } from './theme/defaultTheme'
export { mergeTheme } from './theme/mergeTheme'
export { themeToVars, tilesFilterCss } from './style/themeToVars'
export { configToVars } from './style/configToVars'
export { injectStyles } from './style/injectStyles'

// ── Réglages (fournisseurs tiers, gestes, budgets) ──
export type {
  AutoLocale,
  CameraConfig,
  CameraMoveEpsilon,
  ClusteringConfig,
  ControlShortcuts,
  DrawToolShortcuts,
  EditShortcut,
  EditShortcuts,
  ShortcutsConfig,
  NavigateShortcuts,
  ZIndexConfig,

  DataConfig,
  FetchPolicy,
  GroundSampleConfig,
  InteractionConfig,
  MapConfig,
  MarkersConfig,
  PartialConfig,
  PerformanceConfig,
  PlacesConfig,
  ProvidersConfig,
  RoutingCacheConfig,
  RoutingConfig,
  RoutingPresets,
  Tiles3dConfig,
  DataSearchConfig,
  StartupConfig,
  SkyConfig,
  StorageKeysConfig,
  SymbolsProviderConfig,
  TemplatesConfig,
  TileMapType,
  TileProvider,
  TilesConfig,
  BuildingsConfig,
  CaptureConfig,
  GraticuleConfig,
  PedestrianConfig,
  PedestrianCollisionConfig,
  PedestrianPlacementConfig,
  PedestrianHeadBobConfig,
  PedestrianTransitionsConfig,
  PedestrianShortcuts,
  WatermarkConfig,
  EraseConfig,
  SelectionConfig,
  HostLayerKind,
  DrawToolbarConfig,
  DrawToolbarAutoHide,
} from './config/types'
/**
 * Sources de tuiles 2D. Exposées pour qu'un hôte puisse brancher son propre
 * fournisseur : tout ce que `TiledGlobeLayer` demande est le contrat `TileSource`.
 */
export { createTileSource, type TileSource } from './core/tileSource'
export { InternalTileSource } from './core/internalTiles'
export { GoogleTileSource } from './core/googleTiles'
/**
 * Capacités du fond de carte. `canEnterMode` est la table de vérité que la barre livrée
 * applique déjà : un hôte qui compose la sienne s'en sert plutôt que de redériver la
 * règle — c'est de l'avoir redérivée qui laissait un bouton « 3D » sans volume derrière.
 */
export { type BasemapSupport, canEnterMode, deriveBasemapCapabilities } from './core/basemap'
export { defaultConfig } from './config/defaultConfig'
export { mergeConfig, resolveLocale, resolveRegion } from './config/mergeConfig'
// Préférences utilisateur : presets de qualité 3D + rebind déplacement/vue, appliqués
// et persistés par `<MapProvider>`. Le panneau est monté par le ⚙ de la barre ; ces
// exports servent à un hôte qui veut sonder, forcer un niveau, ou lire les préférences.
export type { QualityLevel, DeviceCaps } from './config/qualityPresets'
export { detectDeviceCaps, detectQuality, qualityPreset } from './config/qualityPresets'
export type { Preferences, QualityChoice, KeyboardLayout, MoveSpeed, BindableAction } from './config/preferences'
export { defaultPreferences, preferencesToPartialConfig } from './config/preferences'
export type { PreferencesStore } from './react/preferences/preferencesStore'
export { usePreferences } from './react/preferences/context'
export { fetchWithPolicy, HttpError } from './core/fetchPolicy'
/** Constantes à source unique — cf. l'audit des valeurs dupliquées. */
export { CAMERA_FOV, TILE_SIZE } from './core/math'
export { DEFAULT_STROKE_OPACITY, MEASURE_STROKE_OPACITY } from './core/geometryMaterials'
export { PREDICATE_CIRCLE_SEGMENTS, predicateSegments } from './core/geodesy'
export { DEFAULT_DRAW_PRESETS, type DrawPresets, maxRadiusOf } from './react/components/drawPresets'
export type { RelationMenuPresets } from './relations/relationMenu'

// ── Libellés (traduction) ──
export type { MapLabels, PartialLabels } from './labels/types'
export { defaultLabels, imperialMeasure } from './labels/defaultLabels'
export { symbolText, mergeLabels, formatLabel, formatCount } from './labels/mergeLabels'
export { makeDistanceFormatter, makeDurationFormatter, makeLinkLabelFormatter } from './labels/measure'
// Formatage du bloc de lecture de la vue — pur, donc utilisable pour afficher altitude,
// coordonnées ou zoom AILLEURS que dans le bloc (bandeau de l'application, export).
export { makeReadoutFormatter } from './labels/readout'
export type { ReadoutFormatter } from './labels/readout'

// ── React ──
export { MapProvider } from './react/MapProvider'
export type { MapProviderProps } from './react/MapProvider'
export { Map } from './react/Map'
export type { MapProps } from './react/Map'
// Poignée impérative (`ref` sur `<Map>`) : cadrer, dessiner ou interroger la carte
// depuis l'extérieur, sans écrire de composant enfant pour atteindre un hook.
// Configuration déclarative de l'interface : barre (loupe comprise), contrôles,
// recherche, dock, dessin et couches se règlent en PROPS de `<Map>`, qui les monte
// dans le bon ordre d'imbrication. Les composants restent exportés plus bas pour
// un placement manuel, mais l'assemblage n'est plus à la charge de l'application.
export type {
  MapHandle,
  MapSurfaces,
  ToolbarConfig,
  ControlsConfig,
  SearchConfig,
  ReadoutConfig,
  DockConfig,
  DrawConfig,
  RelationsConfig,
  LayerSpec,
  MarkersSpec,
} from './react/mapConfig'
// Fabriques de couches : `layers` est hétérogène, donc son type public voit les
// données d'un marker comme `unknown`. Ces fonctions rendent le type à l'écriture —
// `markersLayer<Agent>({…})` type `icon`, `menu` et `tooltip` sur vos données.
export { markersLayer, pathsLayer, shapesLayer } from './react/mapConfig'
export { useMap, useTheme, useLabels, useConfig } from './react/context'
export type { DrawingApi, DrawAction, LensApi } from './react/context'
export { useCamera, useCameraCommands } from './react/hooks/useCamera'
export type { CameraCommands, UseCameraResult } from './react/hooks/useCamera'
// Capture d'image côté React : le hook `useCapture()` (rasteriseur + trace injectés par
// `<Map capture>`) et le type de cette injection. Cf. `engine.capture` / `MapHandle.capture`.
export { useCapture } from './react/hooks/useCapture'
export type { CaptureProps } from './react/capture'
export { usePedestrian } from './react/hooks/usePedestrian'
export type { PedestrianApi } from './react/hooks/usePedestrian'
export { useViewport } from './react/hooks/useViewport'
/** Gate de zoom booléen — ce qui masque les markers `static` sous un seuil. */
export { useZoomGate } from './react/hooks/useZoomGate'
/** Surface de regroupement commune — montée par `<Map cluster>`. */
export { ClusterSurface } from './react/components/ClusterSurface'
export type { ClusterChrome, ClusterSurfaceProps } from './react/components/ClusterSurface'
export type { ClusterContributor, ClusterPlacement, ClusterPoint } from './core/ClusterRegistry'
export { useLiveData } from './react/hooks/useLiveData'
export { useDrawing } from './react/hooks/useDrawing'
export { useLens } from './react/hooks/useLens'
// Grille de coordonnées : la couche se monte comme les autres, sa BASCULE vit au moteur
// (trois commandes la pilotent) — d'où un hook plutôt qu'une prop.
export { GraticuleLayer } from './react/components/GraticuleLayer'
export { MeasureToolButton } from './react/components/MeasureToolButton'
export { useGraticule } from './react/hooks/useGraticule'
export type { GraticuleApi } from './react/hooks/useGraticule'
export type { CoordFormat } from './core/graticule'
export { useDraggablePanel } from './react/hooks/useDraggablePanel'
export type { DraggablePanel, GripProps } from './react/hooks/useDraggablePanel'
export { useDrawSettings } from './react/hooks/useDrawSettings'
export { useMapEvents } from './react/hooks/useMapEvents'
export { useTags, useTagSelection } from './react/hooks/useTags'
// Hooks du drag-and-drop générique : rendre un élément saisissable / une zone
// réceptrice, quel que soit l'usage (dock favoris et au-delà).
export { useDraggable } from './react/hooks/useDraggable'
export type { UseDraggableOptions } from './react/hooks/useDraggable'
export { useDropZone } from './react/hooks/useDropZone'
export type { UseDropZoneOptions } from './react/hooks/useDropZone'
// Repositionnement libre d'un élément ancré à la carte (≠ drag-and-drop à payload) :
// exposé pour une couche custom qui pose ses propres poignées déplaçables.
export { useRepositionable } from './react/hooks/useRepositionable'
export type { UseRepositionableOptions } from './react/hooks/useRepositionable'
// Dépôt sur la SURFACE CARTE : le consommateur reçoit la lat/lng visée (raycast
// ellipsoïde) — de quoi lâcher une icône de palette à un endroit précis du globe.
export { useMapDropZone } from './react/hooks/useMapDropZone'
export type { UseMapDropZoneOptions } from './react/hooks/useMapDropZone'

export { MarkerLayer } from './react/components/MarkerLayer'
// `MarkerLayerDecl` : réglages de rendu d'une couche marker montée PAR LA LIB — voie
// déclarative d'un plugin (`Plugin.markerLayer`) et jeu de catalogue à bascule
// (`CatalogToggleSource.markerLayer`).
export type { MarkerLayerProps, MarkerLayerDecl } from './react/components/MarkerLayer'
export { PinnedDock } from './react/components/PinnedDock'
export type { PinnedDockProps, PinnedItem } from './react/components/PinnedDock'
export { PathLayer } from './react/components/PathLayer'
export type { PathLayerProps } from './react/components/PathLayer'
export { ShapeLayer } from './react/components/ShapeLayer'
export type { ShapeLayerProps } from './react/components/ShapeLayer'
export { DrawLayer } from './react/components/DrawLayer'
export type { DrawLayerProps } from './react/components/DrawLayer'
// Palette de symboles : rendue par `<Toolbar>` comme n'importe quel outil. Exportée
// pour un placement manuel (barre custom) — aucune configuration à lui passer.
export { SymbolPaletteButton, SYMBOL_DRAG_TYPE } from './react/components/SymbolPaletteButton'
// Rendu des symboles posés en markers DOM — monté par `<DrawLayer>`, exporté pour un
// rendu custom (l'état reste dans la collection de dessin).
export { SymbolMarkers } from './react/components/SymbolMarkers'
export type { SymbolMarkersProps, PlacedSymbolShape } from './react/components/SymbolMarkers'
export { MapControls } from './react/components/MapControls'
export type {
  MapControlsProps,
  MapControlAction,
  MapControlButton,
  MapControlTarget,
  ControlGroup,
} from './react/components/MapControls'
// Bloc de lecture de la vue. Monté par `<Map readout>` ; exporté pour un placement
// manuel (bandeau maison hors carte, panneau d'exploitation) — il n'a besoin que du
// contexte carte, donc il vit partout sous `<Map>`.
export { CameraReadout } from './react/components/CameraReadout'
export type { CameraReadoutProps, ReadoutField, ReadoutCorner } from './react/components/CameraReadout'
/**
 * Panneau de diagnostic. Déjà monté par la barre de dessin, en ligne du menu « Réglages »
 * — à côté de « Plugins » et « Catalogue ». Exporté pour l'hôte qui préfère le poser dans
 * SA propre surface (tiroir de réglages, fenêtre d'exploitation).
 */
export { StatsPanel } from './react/components/StatsPanel'
export type { StatsPanelProps, StatsSection } from './react/components/StatsPanel'
// Panneau « Préférences » (qualité 3D + contrôles), monté par le ⚙ de la barre. Exporté
// comme `StatsPanel` : l'accès par le ⚙ exige `<DrawLayer>`, donc un hôte sans dessin le
// pose dans SA propre surface. N'exige qu'un `<MapProvider>` (le store) au-dessus.
export { PreferencesPanel } from './react/components/PreferencesPanel'
// Formatage des grandeurs, comme `makeReadoutFormatter` l'est pour le bloc de lecture :
// sans lui, un hôte qui pose ces valeurs dans SA surface a le verdict mais pas les nombres.
export { makeStatFormatter, statLabel, isCameraField } from './labels/stats'
export type { StatFormatter } from './labels/stats'
export type { StatField, StatLevel, StatThreshold, StatContribution, ViewStats } from './core/viewStats'
// Registre des compteurs de diagnostic (`engine.counters`) : une couche custom s'y branche
// pour que le panneau compte SES éléments. Exporté comme les autres registres — sans le
// type, un hôte ne peut pas nommer le contributeur qu'il doit fournir.
export { CounterRegistry } from './core/CounterRegistry'
export type { StatCounter } from './core/CounterRegistry'
export { statLevel } from './core/viewStats'
export { TagFilterControl } from './react/components/TagFilterControl'
export type { TagFilterControlProps } from './react/components/TagFilterControl'
export { Toolbar, useToolbar } from './react/components/Toolbar'
export type { DrawToolbarProps, DrawToolbarSection, ToolbarApi } from './react/components/Toolbar'
/** Referme la surface d'un outil quand la barre qui le porte se replie (`useToolbar().retracted`).
 *  Inutile dans un `<Dropdown>` : il s'y raccroche déjà. */
export { useCloseWhenHidden } from './react/components/useDismiss'
/** Bouton de barre (icône + état + tooltip) — pour peupler `extraTools` / `components`
 *  avec le même langage visuel que les boutons natifs. */
export { ToolButton } from './react/components/ToolButton'
export type { ToolButtonProps, BarTip } from './react/components/ToolButton'
export { DrawStylePanel } from './react/components/DrawStylePanel'
export type { DrawStylePanelProps } from './react/components/DrawStylePanel'
export { SelectionBadges } from './react/components/SelectionBadges'
export type { SelectionBadgesProps } from './react/components/SelectionBadges'
// Outil loupe. Réglé par `<Map toolbar={{ lens: … }}>`, qui monte la couche et dont `<Toolbar>`
// affiche le bouton : les exports ci-dessous ne servent qu'à un montage manuel
// (barre maison, panneau réutilisé ailleurs) — `toolbar={{ lens: false }}` évite alors la
// double loupe.
export type { LensOptions } from './react/components/LensLayer'
export { LensLayer } from './react/components/LensLayer'
export type { LensLayerProps } from './react/components/LensLayer'
export { LensToolButton } from './react/components/LensToolButton'
export { LensPanel } from './react/components/LensPanel'
export type { LensPanelProps } from './react/components/LensPanel'
export type { LensRenderItem, LensRect } from './react/components/lensTypes'
// Liste de markers partagée (sélection + loupe) : 1 ligne/marker, menu d'actions.
export { MarkerList } from './react/components/MarkerList'
export type { MarkerListProps, MarkerListAction } from './react/components/MarkerList'
export { DrawSettingsButton } from './react/components/DrawSettingsPanel'
export { SearchBox } from './react/components/SearchBox'
export type { SearchBoxProps } from './react/components/SearchBox'
export { createGooglePlacesSearch } from './search/googlePlaces'
export type { GooglePlacesOptions } from './search/googlePlaces'
/** Repère visuel d'une ligne de liste (photo > icône > pastille), partagé loupe/sélection/recherche. */
export { Swatch } from './react/components/Swatch'
export type { SwatchProps } from './react/components/Swatch'

// ── Recherche : registre alimenté par les couches, consommé par `<SearchBox>` ──
// À n'utiliser QUE pour brancher une source qui n'est pas une couche de la carte
// (un annuaire métier, un référentiel distant) : markers, formes, dessins et
// symboles s'y inscrivent déjà tout seuls.
export { SearchRegistry, markerGroupId, SHAPE_GROUP, DRAW_GROUP, PLACE_GROUP } from './search/registry'
export type { SearchEntry, SearchGroup, SearchProvider, SearchQueryOptions, SearchQueryResult } from './search/types'
export { normalizeSearch, scoreMatch, proximityRank, rankHits, NO_MATCH } from './search/match'
export type { Hit } from './search/match'
/**
 * Titres normalisés mémoïsés par élément (`WeakMap`). Utile dès qu'un hôte filtre une
 * liste à la frappe — une source de catalogue, typiquement : `normalizeSearch` sur
 * chaque titre à chaque page est le coût qui se voit en défilement.
 */
export { createTitleCache } from './search/match'

// ── Catalogue : référentiels distants parcourables ──
//
// La recherche (ci-dessus) et le catalogue ne se recouvrent pas : la première est
// SYNCHRONE et ne voit que ce qui est déjà sur la carte, le second pagine à la demande
// un référentiel qui n'y tiendrait pas. Une entrée de catalogue AFFICHÉE devient
// cherchable d'elle-même, puisqu'elle devient une forme comme une autre.
export type {
  CatalogAction,
  CatalogBadge,
  CatalogBrowseSource,
  CatalogId,
  CatalogItem,
  CatalogKey,
  CatalogPage,
  CatalogRequest,
  CatalogSource,
  CatalogSourceBase,
  CatalogToggleSource,
} from './catalog/types'
// Discrimination de l'union, pour un hôte qui manipule une liste de sources hétérogènes.
export { isBrowseSource, isToggleSource } from './catalog/types'
export { CatalogRegistry } from './catalog/registry'
export type { CatalogSettings } from './catalog/store'
/** Composition/décomposition d'une clé — utile pour relier une sélection à vos données. */
export { catalogKey, parseCatalogKey } from './catalog/selection'
export { CatalogControl } from './react/components/CatalogControl'
export type { CatalogControlProps } from './react/components/CatalogControl'
// `useCatalogToggle` et non `useCatalog()` pour LIRE l'état d'un jeu à bascule : il
// s'abonne aux deux booléens de ce jeu, là où l'API entière re-rend l'appelant à chaque
// mutation du catalogue. C'est le patron que la lib s'applique à ses propres lignes.
// Même patron pour `useCatalogSourceCount` : ce qu'UNE source a d'affiché, en un scalaire.
export {
  useCatalog,
  useCatalogSettings,
  useCatalogToggle,
  useCatalogClear,
  useCatalogSourceCount,
} from './react/hooks/useCatalog'
export type { CatalogApi, CatalogSettingsApi } from './react/hooks/useCatalog'
export type { CatalogContent } from './catalog/store'

/** État d'un AGRÉGAT, dérivé de ses enfants — cf. `CatalogApi.groupState`. */
export type { GroupCheck } from './catalog/groups'
export { useCatalogSources, useCatalogSource } from './react/hooks/useCatalogSources'
/** SVG (markup) → data-URI, idempotent — utile dès qu'une icône sort de la carte. */
export { svgToDataUri } from './react/components/MarkerLayer'
/** Bouton « supprimer » partagé (socle de relation, dock, indice de drag). */
export { RemoveButton } from './react/components/RemoveButton'
export type { RemoveButtonProps } from './react/components/RemoveButton'
export { REMOVE_ICON_PATH } from './core/removeButton'
export { ContextMenu } from './react/components/ContextMenu'
export type { MenuItem } from './react/components/ContextMenu'
export type { BuildingHit, BuildingHighlight, BuildingInfo, BuildingRef } from './core/MapEngine'

// ── Moteur de relations (liens par tags + routage réel) ──
// Le core est publié tel quel : il est utilisable sans carte (calcul de sélection
// côté serveur, fournisseur de routage maison) — d'où l'export du moteur ET de son
// contrat, pas seulement du composant.
export { RelationLayer } from './react/components/RelationLayer'
export type { RelationLayerProps } from './react/components/RelationLayer'
export { RelationStatusBar } from './react/components/RelationStatusBar'
export type { RelationStatusBarProps } from './react/components/RelationStatusBar'
export { useRelations } from './react/hooks/useRelations'
export type { RelationApi } from './react/context'
export { RelationEngine } from './relations/core/engine'
export type { RelationSnapshot } from './relations/core/engine'
export { selectTargets, matchesSelector, familyTag } from './relations/core/selection'
export { buildRelationMenu } from './relations/relationMenu'
export type { RelationMenuContext } from './relations/relationMenu'
export { haversineMeters, bearingDeg, greatCirclePoints, fanLegs, boundsAround } from './relations/core/geo'
export { decodePolyline } from './relations/core/polyline'
export { RouteCache } from './relations/core/cache'
export type {
  MapPoint,
  TagSelector,
  TravelMode,
  SelectionMode,
  RelationRule,
  LinkStatus,
  Link,
} from './relations/core/types'
export { createGoogleRoutesProvider } from './relations/providers/GoogleRoutesProvider'
export type { GoogleRoutesOptions } from './relations/providers/GoogleRoutesProvider'
export type { RoutingProvider, MatrixEntry, ProviderRoute } from './relations/providers/RoutingProvider'
export { LinkLayer } from './layers/LinkLayer'
export type { LinkVisual, LinkLayerDefaults, DashStyle } from './layers/LinkLayer'

export { DefaultMarker } from './react/components/DefaultMarker'
export { DefaultCluster } from './react/components/DefaultCluster'

// ── Plugins (LA PLATEFORME — aucun plugin concret) ──
// La lib expose le contrat + le registre + le hub + les hooks. Les plugins officiels
// (Windy, geopf) vivent hors de la lib, dans le repo pluginsMap3D (@map3d/plugin-*).
export { definePlugin } from './plugins/definePlugin'
export { defaultPluginFetchPolicy } from './plugins/fetchPolicy'
export type {
  Plugin,
  AnyPlugin,
  PluginField,
  PluginContext,
  PluginDataContext,
  PluginLayerContext,
  BuildingEnrichmentResult,
} from './plugins/types'
// Socle commun des registres versionnés-persistés (`engine.plugins`, `engine.templates`) :
// store `useSyncExternalStore` + persistance localStorage débouncée. Exposé pour qu'une
// couche custom bâtisse son propre registre sans réécrire ces précautions.
export { PersistedVersionedStore } from './core/PersistedVersionedStore'
export { PluginRegistry } from './core/PluginRegistry'
export type { PluginState, PluginEntry } from './core/PluginRegistry'
export { PluginEnrichment } from './core/PluginEnrichment'
export type { EnrichmentState } from './core/PluginEnrichment'
export { usePlugins } from './react/hooks/usePlugins'
export type { PluginView } from './react/hooks/usePlugins'
export { useBuildingEnrichment } from './react/hooks/useBuildingEnrichment'
export type { BuildingEnrichment } from './react/hooks/useBuildingEnrichment'
// `BuildingHit` / `BuildingInfo` sont déjà exportés (section Core).

// ── Templates (sauvegardes de dessin : formes + crayon + symboles) ──
export { TemplateRegistry } from './core/templates/TemplateRegistry'
export type { TemplateMutateOptions, TemplateDrawPort } from './core/templates/TemplateRegistry'
export type {
  ApplyMode,
  ApplyDefault,
  Template,
  TemplateContent,
  TemplateStats,
  TemplateCategory,
  TemplateView,
  TemplatePedestrianView,
} from './core/templates/types'
export { createHttpTemplateProvider } from './core/templates/TemplateProvider'
export type { TemplateProvider } from './core/templates/TemplateProvider'
export { categoryOf, filterByCategories, statsOf, mergeCollections } from './core/templates/collect'
// Capture/restitution de la vue d'un template — exposées pour l'hôte qui gère ses
// propres vues mémorisées (bouton « revenir ici » maison, vue par défaut au montage)
// sans passer par le panneau.
export { captureView, applyView } from './core/templates/view'
export type { ApplyViewOptions } from './core/templates/view'
export { TemplatesPanel } from './react/components/TemplatesPanel'
export type { TemplatesPanelProps } from './react/components/TemplatesPanel'
export { Confirm } from './react/components/Confirm'
export type { ConfirmProps } from './react/components/Confirm'
export { TemplateThumb } from './react/components/TemplateThumb'
export type { TemplateThumbProps } from './react/components/TemplateThumb'
export { useTemplates } from './react/hooks/useTemplates'
export type { UseTemplatesOptions, TemplatesView, SaveTemplateOptions } from './react/hooks/useTemplates'
