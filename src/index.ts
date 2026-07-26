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
  PointerInterceptor,
  PointerPhase,
} from './core/MapEngine'
export { Camera } from './core/Camera'
export type { CameraState, FlyOptions } from './core/Camera'
export { Projection } from './core/Projection'
export type { ScreenPoint } from './core/Projection'
export { EnuFrame } from './core/enu'
// `tagColor`/`countTags` sont publics : un panneau custom (MapControls
// `components.layers`) doit pouvoir reproduire les couleurs de repli, et un
// intégrateur vanilla (core sans React) nourrir `engine.tags.report`.
export { tagColor, countTags } from './core/TagFilter'
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
export type { DragPayload, DropZone, DragState, DragEnd } from './core/DragRegistry'
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
export type { Viewport, DataSource, MarkerData } from './data/types'
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
export { DrawSettings } from './layers/draw/DrawSettings'
export type { ToolSettings } from './layers/draw/DrawSettings'

// ── Thème ──
export type { MapTheme, MarkerColor, PartialTheme, ThemeInput, DeepPartial } from './theme/types'
export { defaultTheme } from './theme/defaultTheme'
export { mergeTheme } from './theme/mergeTheme'
export { themeToVars } from './style/themeToVars'
export { injectStyles } from './style/injectStyles'

// ── Libellés (traduction) ──
export type { MapLabels, PartialLabels } from './labels/types'
export { defaultLabels } from './labels/defaultLabels'
export { mergeLabels, formatLabel, formatCount } from './labels/mergeLabels'
export { makeDistanceFormatter, makeDurationFormatter, makeLinkLabelFormatter } from './labels/measure'

// ── React ──
export { MapProvider } from './react/MapProvider'
export type { MapProviderProps } from './react/MapProvider'
export { Map } from './react/Map'
export type { MapProps } from './react/Map'
export { useMap, useTheme, useLabels } from './react/context'
export type { DrawingApi, DrawAction, LensApi } from './react/context'
export { useCamera } from './react/hooks/useCamera'
export { useViewport } from './react/hooks/useViewport'
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
export { MapControls } from './react/components/MapControls'
export type { MapControlsProps, MapControlAction, MapControlButton } from './react/components/MapControls'
export { TagFilterControl } from './react/components/TagFilterControl'
export type { TagFilterControlProps } from './react/components/TagFilterControl'
export { Toolbar } from './react/components/Toolbar'
export type { DrawToolbarProps, DrawToolbarSection } from './react/components/Toolbar'
/** Bouton de barre (icône + état + tooltip) — pour peupler `extraTools` / `components`
 *  avec le même langage visuel que les boutons natifs. */
export { ToolButton } from './react/components/ToolButton'
export type { ToolButtonProps, BarTip } from './react/components/ToolButton'
export { DrawStylePanel } from './react/components/DrawStylePanel'
export type { DrawStylePanelProps } from './react/components/DrawStylePanel'
export { SelectionBadges } from './react/components/SelectionBadges'
export type { SelectionBadgesProps } from './react/components/SelectionBadges'
// Outil loupe : couche + bouton de barre + panneau + système d'actions.
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
export { selectTargets, matchesSelector } from './relations/core/selection'
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
