import type { ReactNode } from 'react'
import type { MarkerData } from '../../data/types'

/** Rectangle de la zone loupe, en **pixels conteneur** (`.m3d-root`). */
export type LensRect = { x: number; y: number; w: number; h: number }

/** Contexte passé à une action de la loupe (`run`). */
export type LensActionContext<T = unknown> = {
  /** Marker de la ligne — présent pour les actions `scope: 'row'`. */
  marker?: MarkerData<T>
  /** Inventaire courant complet — utile aux actions `scope: 'global'`. */
  markers: MarkerData<T>[]
  /** Ids actuellement sélectionnés dans la liste. */
  selected: ReadonlySet<string | number>
  /** Retire la zone loupe. */
  close: () => void
}

/**
 * Action **déclarative** de la loupe : ajouter une capacité future = pousser un
 * objet `LensAction` en prop, sans toucher au composant. `scope: 'row'` rend un
 * bouton par ligne ; `scope: 'global'` une entrée dans la barre d'actions du
 * panneau.
 */
export type LensAction<T = unknown> = {
  id: string
  label: string
  /** Chemin d'icône @mdi/js (optionnel). */
  icon?: string
  scope: 'row' | 'global'
  run: (ctx: LensActionContext<T>) => void
}

/** Rendu d'une ligne de l'inventaire (défaut : pastille de type + avatar + id). */
export type LensRenderItem<T = unknown> = (marker: MarkerData<T>) => ReactNode
