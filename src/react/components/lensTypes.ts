import type { ReactNode } from 'react'
import type { MarkerData } from '../../data/types'

/** Rectangle de la zone loupe, en **pixels conteneur** (`.m3d-root`). */
export type LensRect = { x: number; y: number; w: number; h: number }

/** Rendu d'une ligne de l'inventaire (défaut : pastille de type + avatar + id). */
export type LensRenderItem<T = unknown> = (marker: MarkerData<T>) => ReactNode
