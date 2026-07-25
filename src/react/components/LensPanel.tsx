import { mdiCheckboxBlankCircleOutline, mdiCheckCircle, mdiClose, mdiDrag, mdiSelectionOff } from '@mdi/js'
import Icon from '@mdi/react'
import type { KeyboardEvent, ReactNode } from 'react'
import type { MarkerData } from '../../data/types'
import { formatLabel } from '../../labels/mergeLabels'
import { useLabels, useMapContext } from '../context'
import { useDraggablePanel } from '../hooks/useDraggablePanel'
import type { LensAction, LensRenderItem } from './lensTypes'

export type LensPanelProps<T = unknown> = {
  markers: MarkerData<T>[]
  getId: (m: MarkerData<T>) => string | number
  /** Position par défaut (px conteneur) — le panneau suit la zone tant qu'il n'est pas déplacé. */
  anchor: { x: number; y: number }
  selected: ReadonlySet<string | number>
  onToggle: (id: string | number) => void
  onSelectAll: () => void
  onClearSelection: () => void
  onClose: () => void
  renderItem?: LensRenderItem<T>
  actions?: LensAction<T>[]
  /** Libellé lisible d'un type de marker (défaut : le type brut). */
  markerTypeLabel?: (type: string) => string
}

/**
 * Panneau d'inventaire de la loupe, ancré à droite de la zone : en-tête fixe
 * (compteur + récap par type + fermer), corps **scrollable** listant 1 ligne par
 * marker. Réutilise `useDraggablePanel` (mécanique partagée avec `SelectionBadges`)
 * et le langage visuel `m3d-*`. La sélection dans la liste et les actions sont
 * pilotées par `<LensLayer>` — le panneau reste présentational.
 */
export function LensPanel<T = unknown>(props: LensPanelProps<T>) {
  const { markers, getId, selected, actions } = props
  const { theme } = useMapContext()
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

  const rowActions = (actions ?? []).filter((a) => a.scope === 'row')
  const globalActions = (actions ?? []).filter((a) => a.scope === 'global')
  const ctx = (marker?: MarkerData<T>) => ({ marker, markers, selected, close: props.onClose })

  const defaultItem = (m: MarkerData<T>): ReactNode => {
    const color = theme.colors.marker[m.type] ?? theme.colors.marker.default!
    return (
      <>
        {m.avatar ? (
          <img className="m3d-lensavatar" src={m.avatar} alt="" draggable={false} style={{ borderColor: color.base }} />
        ) : (
          <span className="m3d-lensdot" style={{ background: color.base }} />
        )}
        <span className="m3d-lenslabel">{String(getId(m))}</span>
      </>
    )
  }

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
            <div className="m3d-lenslist">
              {markers.map((m) => {
                const id = getId(m)
                const isSel = selected.has(id)
                const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault()
                    props.onToggle(id)
                  }
                }
                return (
                  <div
                    key={id}
                    className={`m3d-lensrow${isSel ? ' m3d-lensrow-sel' : ''}`}
                    role="button"
                    tabIndex={0}
                    aria-pressed={isSel}
                    aria-label={formatLabel(labels.lens.selectItem, { label: String(id) })}
                    onClick={() => props.onToggle(id)}
                    onKeyDown={onKey}
                  >
                    <Icon
                      className="m3d-lenscheck"
                      path={isSel ? mdiCheckCircle : mdiCheckboxBlankCircleOutline}
                      size={0.7}
                    />
                    {props.renderItem ? props.renderItem(m) : defaultItem(m)}
                    {rowActions.length > 0 && (
                      <span className="m3d-lensrow-actions">
                        {rowActions.map((a) => (
                          <button
                            key={a.id}
                            type="button"
                            className="m3d-lensact"
                            title={a.label}
                            aria-label={a.label}
                            onClick={(e) => {
                              e.stopPropagation()
                              a.run(ctx(m))
                            }}
                          >
                            {a.icon ? <Icon path={a.icon} size={0.65} /> : a.label}
                          </button>
                        ))}
                      </span>
                    )}
                  </div>
                )
              })}
            </div>

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
              {globalActions.map((a) => (
                <button key={a.id} type="button" className="m3d-lensbtn" onClick={() => a.run(ctx())}>
                  {a.icon && <Icon path={a.icon} size={0.55} />}
                  {a.label}
                </button>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
