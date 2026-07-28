// Point d'entrée public de @gosecure/map3d.

export const VERSION = '0.1.0'

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
  DragMode,
  InteractiveMode,
  PointerInterceptor,
  PointerPhase,
} from './core/MapEngine'
export { Camera } from './core/Camera'
export type { CameraState, FlyOptions, FitBoundsOptions, FitPadding } from './core/Camera'
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
export { SelectableRegistry } from './core/Selectables'
export type {
  SelectableProvider,
  SelectableConsumer,
  SelectableInfo,
  SelectableScreenItem,
  PickModifiers,
} from './core/Selectables'
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

// ── Data (viewport-driven / temps réel) ──
export type { Viewport, DataSource, MarkerData, StaticMarker } from './data/types'
export { ViewportController } from './data/ViewportController'
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
  SelectMode,
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
export { circleRing, pointInRing, polygonAreaM2, ringInsideRing } from './core/geodesy'
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
  TileMapType,
  TileProvider,
  TilesConfig,
  BuildingsConfig,
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
export { fetchWithPolicy, HttpError } from './core/fetchPolicy'
/** Constantes à source unique — cf. l'audit des valeurs dupliquées. */
export { CAMERA_FOV, TILE_SIZE } from './core/math'
export { DEFAULT_STROKE_OPACITY, MEASURE_STROKE_OPACITY } from './core/geometry'
export { PREDICATE_CIRCLE_SEGMENTS, predicateSegments } from './core/geodesy'
export { DEFAULT_DRAW_PRESETS, type DrawPresets, maxRadiusOf } from './react/components/drawPresets'
export type { RelationMenuPresets } from './relations/relationMenu'

// ── Libellés (traduction) ──
export type { MapLabels, PartialLabels } from './labels/types'
export { defaultLabels, imperialMeasure } from './labels/defaultLabels'
export { symbolText, mergeLabels, formatLabel, formatCount } from './labels/mergeLabels'
export { makeDistanceFormatter, makeDurationFormatter, makeLinkLabelFormatter } from './labels/measure'

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
  DockConfig,
  DrawConfig,
  RelationsConfig,
  LayerSpec,
  MarkersSpec,
} from './react/mapConfig'
// Fabriques de couches : `layers` est hétérogène, donc son type public voit les
// données d'un marker comme `unknown`. Ces fonctions rendent le type à l'écriture —
// `markersLayer<Agent>({…})` type `icon`, `menu` et `tooltip` sur vos données.
export { markersLayer, shapesLayer } from './react/mapConfig'
export { useMap, useTheme, useLabels, useConfig } from './react/context'
export type { DrawingApi, DrawAction, LensApi } from './react/context'
export { useCamera } from './react/hooks/useCamera'
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
export type { MarkerLayerProps } from './react/components/MarkerLayer'
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
export { TagFilterControl } from './react/components/TagFilterControl'
export type { TagFilterControlProps } from './react/components/TagFilterControl'
export { Toolbar, useToolbar } from './react/components/Toolbar'
export type { DrawToolbarProps, DrawToolbarSection, ToolbarApi } from './react/components/Toolbar'
/** Referme la surface d'un outil quand la barre qui le porte se replie (cf. `useToolbarRetracted`). */
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
/** SVG (markup) → data-URI, idempotent — utile dès qu'une icône sort de la carte. */
export { svgToDataUri } from './react/components/MarkerLayer'
/** Bouton « supprimer » partagé (socle de relation, dock, indice de drag). */
export { RemoveButton } from './react/components/RemoveButton'
export type { RemoveButtonProps } from './react/components/RemoveButton'
export { REMOVE_ICON_PATH } from './core/removeButton'
export { ContextMenu } from './react/components/ContextMenu'
export type { MenuItem } from './react/components/ContextMenu'

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
export type { LinkVisual, LinkLayerDefaults } from './layers/LinkLayer'
export { DefaultMarker } from './react/components/DefaultMarker'
export { DefaultCluster } from './react/components/DefaultCluster'
