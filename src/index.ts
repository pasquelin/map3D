// Point d'entrée public de @gosecure/map3d.

export const VERSION = '0.1.0'

// ── Primitives partagées ──
export type { LatLng, Bounds } from './shared'

// ── Core ──
export { MapEngine, altitudeForZoom, zoomForAltitude } from './core/MapEngine'
export type { MapEngineOptions, MapMode, MapEvents, PointerInterceptor, PointerPhase } from './core/MapEngine'
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
export * as MapMath from './core/math'

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
export type { DrawTool, GeoJSONFeatureCollection } from './layers/DrawLayer'

// ── Thème ──
export type { MapTheme, MarkerColor, PartialTheme, ThemeInput, DeepPartial } from './theme/types'
export { defaultTheme } from './theme/defaultTheme'
export { mergeTheme } from './theme/mergeTheme'
export { themeToVars } from './style/themeToVars'
export { injectStyles } from './style/injectStyles'

// ── React ──
export { MapProvider } from './react/MapProvider'
export type { MapProviderProps } from './react/MapProvider'
export { Map } from './react/Map'
export type { MapProps } from './react/Map'
export { useMap, useTheme } from './react/context'
export { useCamera } from './react/hooks/useCamera'
export { useViewport } from './react/hooks/useViewport'
export { useLiveData } from './react/hooks/useLiveData'
export { useDrawing } from './react/hooks/useDrawing'
export { useMapEvents } from './react/hooks/useMapEvents'
export { useTags, useTagSelection } from './react/hooks/useTags'

export { MarkerLayer } from './react/components/MarkerLayer'
export type { MarkerLayerProps } from './react/components/MarkerLayer'
export { PathLayer } from './react/components/PathLayer'
export type { PathLayerProps } from './react/components/PathLayer'
export { ShapeLayer } from './react/components/ShapeLayer'
export type { ShapeLayerProps } from './react/components/ShapeLayer'
export { DrawLayer } from './react/components/DrawLayer'
export type { DrawLayerProps } from './react/components/DrawLayer'
export { MapControls } from './react/components/MapControls'
export type { MapControlsProps, MapControlAction } from './react/components/MapControls'
export { TagFilterControl } from './react/components/TagFilterControl'
export type { TagFilterControlProps } from './react/components/TagFilterControl'
export { DrawToolbar } from './react/components/DrawToolbar'
export type { DrawToolbarProps } from './react/components/DrawToolbar'
export { SearchBox } from './react/components/SearchBox'
export type { SearchBoxProps, SearchResult } from './react/components/SearchBox'
export { ContextMenu } from './react/components/ContextMenu'
export type { MenuItem } from './react/components/ContextMenu'
export { Popup } from './react/components/Popup'
export { DefaultMarker } from './react/components/DefaultMarker'
export { DefaultCluster } from './react/components/DefaultCluster'
