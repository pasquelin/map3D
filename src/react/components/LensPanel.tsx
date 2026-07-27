import type { MarkerData } from '../../data/types'
import { formatLabel } from '../../labels/mergeLabels'
import { useLabels } from '../context'
import { useDraggablePanel } from '../hooks/useDraggablePanel'
import { FloatingPanel } from './FloatingPanel'
import type { MenuItem } from './ContextMenu'
import { MarkerList, type MarkerListAction } from './MarkerList'
import type { LensRenderItem } from './lensTypes'

export type LensPanelProps<T = unknown> = {
  markers: MarkerData<T>[]
  getId: (m: MarkerData<T>) => string | number
  /** Position par défaut (px conteneur) — le panneau suit la zone tant qu'il n'est pas déplacé. */
  anchor: { x: number; y: number }
  /** Croix d'une ligne : retire le marker de la liste affichée. */
  onRemove: (id: string | number) => void
  onClose: () => void
  renderItem?: LensRenderItem<T>
  /** Actions du menu déroulant d'une ligne (en plus de « Cibler »). */
  actions?: MarkerListAction<T>[]
  /** Menu d'une ligne, même forme que `<MarkerLayer menu>` — prime sur `actions`. */
  menu?: (m: MarkerData<T>) => MenuItem[]
  targetZoom?: number
  /** Libellé lisible d'un type de marker (récap par type). */
  markerTypeLabel?: (type: string) => string
}

/**
 * Panneau d'inventaire de la loupe, ancré à droite de la zone : en-tête fixe
 * (compteur + récap par type + fermer), corps = `MarkerList` **partagée** avec le
 * panneau de sélection (1 ligne par marker, pastille couleur, menu « Cibler »,
 * croix de retrait). Réutilise `useDraggablePanel`.
 */
export function LensPanel<T = unknown>(props: LensPanelProps<T>) {
  const { markers, getId } = props
  const labels = useLabels()
  const panel = useDraggablePanel(props.anchor)

  const count = markers.length
  const title = formatLabel(count === 1 ? labels.lens.titleSingular : labels.lens.title, { count })

  return (
    <FloatingPanel
      panel={panel}
      title={title}
      moveLabel={labels.lens.movePanel}
      snapBackLabel={labels.lens.snapBack}
      onClose={props.onClose}
      closeLabel={labels.lens.remove}
      hudClassName="m3d-lenshud"
      panelClassName="m3d-lenspanel"
    >
      {count === 0 ? (
        <div className="m3d-lensempty">{labels.lens.empty}</div>
      ) : (
        <MarkerList<T>
          markers={markers}
          getId={getId}
          renderItem={props.renderItem}
          markerTypeLabel={props.markerTypeLabel}
          onRemove={props.onRemove}
          actions={props.actions}
          menu={props.menu}
          targetZoom={props.targetZoom}
        />
      )}
    </FloatingPanel>
  )
}
