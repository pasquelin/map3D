import { createContext, useContext } from 'react'
import type { MapEngine } from '../core/MapEngine'
import { defaultLabels } from '../labels/defaultLabels'
import type { MapLabels } from '../labels/types'
import type { DrawStyle, DrawTool, GeoJSONFeatureCollection, SelectMode } from '../layers/DrawLayer'
import type { DrawSettings } from '../layers/draw/DrawSettings'
import { defaultTheme } from '../theme/defaultTheme'
import type { MapTheme } from '../theme/types'

/** Fourni par `<MapProvider>` : thème résolu (clair/sombre + reduced-motion). */
export const ThemeContext = createContext<MapTheme>(defaultTheme)

/** Fourni par `<MapProvider>` : libellés résolus (défauts + overrides `labels`). */
export const LabelsContext = createContext<MapLabels>(defaultLabels)

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
  /** Raccourcis effectifs (outils + actions, `false` = désactivé) — affichés par `DrawToolbar` dans ses tooltips. */
  shortcuts: Record<DrawTool | DrawAction, string | false>
}

/** Actions clavier du dessin (raccourcis configurables, en plus des outils). */
export type DrawAction = 'selectRect' | 'selectPoly' | 'selectLasso'

export const DrawingContext = createContext<DrawingApi | null>(null)
