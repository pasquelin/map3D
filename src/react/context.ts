import { createContext, useContext } from 'react'
import type { MapEngine } from '../core/MapEngine'
import type { DrawTool, GeoJSONFeatureCollection } from '../layers/DrawLayer'
import { defaultTheme } from '../theme/defaultTheme'
import type { MapTheme } from '../theme/types'

/** Fourni par `<MapProvider>` : thème résolu (clair/sombre + reduced-motion). */
export const ThemeContext = createContext<MapTheme>(defaultTheme)

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

export function useMapContext(): MapContextValue {
  const ctx = useContext(MapContext)
  if (!ctx) throw new Error('Ce composant doit être utilisé à l’intérieur de <Map>')
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
  undo: () => void
  clear: () => void
  toGeoJSON: () => GeoJSONFeatureCollection
  fromGeoJSON: (fc: GeoJSONFeatureCollection) => void
}

export const DrawingContext = createContext<DrawingApi | null>(null)
