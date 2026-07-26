import { mdiClose, mdiDrag, mdiSelectionOff } from '@mdi/js'
import Icon from '@mdi/react'
import type { ReactNode } from 'react'
import type { MarkerData } from '../../data/types'
import type { DrawTool } from '../../layers/DrawLayer'
import { formatLabel } from '../../labels/mergeLabels'
import { useLabels, useMapContext } from '../context'
import { useDrawing } from '../hooks/useDrawing'
import { useDraggablePanel } from '../hooks/useDraggablePanel'
import { TOOL_ICONS } from './drawControls'
import { MarkerList, type MarkerListAction } from './MarkerList'

export type SelectionBadgesProps = {
  /** Libellé lisible d'un type de marker (défaut : le type brut). */
  markerTypeLabel?: (type: string) => string
  /** Libellé lisible d'un kind de forme (défaut : `labels.tools[kind]`). */
  shapeKindLabel?: (kind: DrawTool) => string
  /** Rendu d'une ligne de marker (défaut : pastille de type + avatar + id). */
  renderMarker?: (m: MarkerData) => ReactNode
  /** Actions du menu déroulant d'une ligne, en plus de « Cibler ». */
  markerActions?: MarkerListAction[]
}

/**
 * Panneau de sélection (haut-droite par défaut, monté dans `<DrawLayer>`). Les
 * **markers** sont listés **1 ligne par marker** via `MarkerList` — le composant
 * de liste **partagé avec la loupe** (case à cocher, menu « Cibler », croix). Les
 * **formes** dessinées restent regroupées par kind (compteur + croix). Déplaçable
 * par sa poignée. Une ligne de marker cochée = sélectionnée ; la décocher ou sa
 * croix la désélectionne.
 */
export function SelectionBadges(props: SelectionBadgesProps) {
  const { engine } = useMapContext()
  const labels = useLabels()
  const { tool, selection, markerSelection, selectionDetails, select, deselectMarkers, clearSelection } = useDrawing()

  // Panneau flottant déplaçable — mécanique partagée (drag clampé, re-clamp resize).
  const { panelRef, style, gripProps } = useDraggablePanel()

  // La sélection n'existe que pendant l'outil sélection (vidée à la sortie).
  const total = selection.length + markerSelection.length
  if (tool !== 'select' || total === 0) return null

  // Groupes de formes par kind, dans l'ordre de la sélection.
  const shapeGroups = new Map<DrawTool, string[]>()
  for (const d of selectionDetails) {
    const ids = shapeGroups.get(d.kind)
    if (ids) ids.push(d.id)
    else shapeGroups.set(d.kind, [d.id])
  }
  // Markers sélectionnés → donnée complète (position, avatar…) pour la liste partagée.
  const markers = markerSelection
    .map((id) => engine.markers.markerById(id))
    .filter((m): m is MarkerData => m != null)

  const rowLabel = (group: string, type: string): string => formatLabel(labels.selection.group, { group, type })

  return (
    <div ref={panelRef} className="m3d-selhud" style={style}>
      <div className="m3d-panel m3d-selpanel">
        <div className="m3d-selhead">
          {/* Pas de tooltip sur la poignée : il resterait affiché pendant le drag. */}
          <button type="button" className="m3d-selgrip" {...gripProps} aria-label={labels.selection.movePanel}>
            <Icon path={mdiDrag} size={0.6} />
          </button>
          <span>{labels.selection.title} {total}</span>
        </div>

        {shapeGroups.size > 0 && (
          <div className="m3d-taglist">
            {[...shapeGroups].map(([kind, ids]) => {
              const text = rowLabel(labels.selection.shapesGroup, props.shapeKindLabel?.(kind) ?? labels.tools[kind])
              const aria = formatLabel(labels.selection.deselectGroup, { label: text })
              // Calculé AU CLIC seulement (pas à chaque render, O(S×groupe) sinon).
              const deselectGroup = () => {
                const drop = new Set(ids)
                select(selection.filter((id) => !drop.has(id)))
              }
              return (
                <div key={`shape:${kind}`} className="m3d-tagrow">
                  <Icon path={TOOL_ICONS[kind]} size={0.55} />
                  <span className="m3d-taglabel">{text}</span>
                  <span className="m3d-tagcount">{ids.length}</span>
                  <button type="button" className="m3d-selrow-x" onClick={deselectGroup} aria-label={aria}>
                    <Icon path={mdiClose} size={0.55} />
                  </button>
                </div>
              )
            })}
          </div>
        )}

        {markers.length > 0 && (
          <MarkerList
            markers={markers}
            getId={(m) => m.id}
            renderItem={props.renderMarker}
            markerTypeLabel={props.markerTypeLabel}
            onRemove={(id) => deselectMarkers([id])}
            actions={props.markerActions}
          />
        )}

        <button type="button" className="m3d-tagclear" onClick={clearSelection}>
          <Icon path={mdiSelectionOff} size={0.55} />
          {labels.selection.clearAll}
        </button>
        <div className="m3d-selfoot">
          <div className="m3d-shortcut-row">
            <span>{labels.actions.addToSelection}</span>
            <kbd className="m3d-kbd">{labels.keys.shiftClick}</kbd>
          </div>
          <div className="m3d-shortcut-row">
            <span>{labels.actions.markersOnly}</span>
            <kbd className="m3d-kbd">{labels.keys.altOrCmd}</kbd>
          </div>
        </div>
      </div>
    </div>
  )
}
