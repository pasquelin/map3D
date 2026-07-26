import { mdiClose, mdiDrag, mdiSelectionOff } from '@mdi/js'
import Icon from '@mdi/react'
import type { MarkerData } from '../../data/types'
import { formatLabel } from '../../labels/mergeLabels'
import { useLabels } from '../context'
import { useDraggablePanel } from '../hooks/useDraggablePanel'
import { MarkerList, type MarkerListAction } from './MarkerList'
import type { LensRenderItem } from './lensTypes'

export type LensPanelProps<T = unknown> = {
  markers: MarkerData<T>[]
  getId: (m: MarkerData<T>) => string | number
  /** Position par défaut (px conteneur) — le panneau suit la zone tant qu'il n'est pas déplacé. */
  anchor: { x: number; y: number }
  selected: ReadonlySet<string | number>
  onToggle: (id: string | number) => void
  onSelectAll: () => void
  onClearSelection: () => void
  /** Croix d'une ligne : retire le marker de la liste affichée. */
  onRemove: (id: string | number) => void
  onClose: () => void
  renderItem?: LensRenderItem<T>
  /** Actions du menu déroulant d'une ligne (en plus de « Cibler »). */
  actions?: MarkerListAction<T>[]
  targetZoom?: number
  /** Libellé lisible d'un type de marker (récap par type). */
  markerTypeLabel?: (type: string) => string
}

/**
 * Panneau d'inventaire de la loupe, ancré à droite de la zone : en-tête fixe
 * (compteur + récap par type + fermer), corps = `MarkerList` **partagée** avec le
 * panneau de sélection (1 ligne par marker, case à cocher, menu « Cibler », croix),
 * pied « tout sélectionner / désélectionner ». Réutilise `useDraggablePanel`.
 */
export function LensPanel<T = unknown>(props: LensPanelProps<T>) {
  const { markers, getId, selected } = props
  const labels = useLabels()
  const { panelRef, style, gripProps } = useDraggablePanel(props.anchor)

  const count = markers.length
  const title = formatLabel(count === 1 ? labels.lens.titleSingular : labels.lens.title, { count })

  // Récap par type (dominant en premier) — ex. « 12 Agents · 5 Alertes ».
  const counts = new Map<string, number>()
  for (const m of markers) counts.set(m.type, (counts.get(m.type) ?? 0) + 1)
  const summary = [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([type, n]) => `${n} ${props.markerTypeLabel?.(type) ?? type}`)
    .join(' · ')

  return (
    <div ref={panelRef} className="m3d-lenshud" style={style}>
      <div className="m3d-panel m3d-lenspanel">
        <div className="m3d-lenshead">
          <button type="button" className="m3d-selgrip" {...gripProps} aria-label={labels.lens.movePanel}>
            <Icon path={mdiDrag} size={0.6} />
          </button>
          <span className="m3d-lenstitle">{title}</span>
          <button type="button" className="m3d-selrow-x" onClick={props.onClose} aria-label={labels.lens.remove}>
            <Icon path={mdiClose} size={0.6} />
          </button>
        </div>

        {count === 0 ? (
          <div className="m3d-lensempty">{labels.lens.empty}</div>
        ) : (
          <>
            {summary && <div className="m3d-lenssummary">{summary}</div>}
            <MarkerList<T>
              markers={markers}
              getId={getId}
              renderItem={props.renderItem}
              selectable
              selected={selected}
              onToggle={props.onToggle}
              onRemove={props.onRemove}
              actions={props.actions}
              targetZoom={props.targetZoom}
            />
            <div className="m3d-lensfoot">
              <button type="button" className="m3d-lensbtn" onClick={props.onSelectAll}>
                {labels.lens.selectAll}
              </button>
              <button
                type="button"
                className="m3d-lensbtn"
                onClick={props.onClearSelection}
                disabled={selected.size === 0}
              >
                <Icon path={mdiSelectionOff} size={0.55} />
                {labels.lens.clearSelection}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
