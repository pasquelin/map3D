import { mdiClose, mdiDrag, mdiSelectionOff } from '@mdi/js'
import Icon from '@mdi/react'
import type { DrawTool } from '../../layers/DrawLayer'
import { formatLabel } from '../../labels/mergeLabels'
import { useLabels, useMapContext } from '../context'
import { useDrawing } from '../hooks/useDrawing'
import { useDraggablePanel } from '../hooks/useDraggablePanel'
import { TOOL_ICONS } from './drawControls'

export type SelectionBadgesProps = {
  /** Libellé lisible d'un type de marker (défaut : le type brut). */
  markerTypeLabel?: (type: string) => string
  /** Libellé lisible d'un kind de forme (défaut : `labels.tools[kind]`). */
  shapeKindLabel?: (kind: DrawTool) => string
}

/**
 * Panneau de sélection (haut-droite par défaut, monté dans `<DrawLayer>`) —
 * même langage que le panneau « Couches » : une rangée par groupe (formes par
 * kind avec icône d'outil, markers par type avec pastille couleur), compteur,
 * croix de désélection, « Tout désélectionner », et rappel des modificateurs en
 * pied. Déplaçable par sa poignée (drag & drop clampé au conteneur) s'il gêne.
 * Ne re-rend que sur les changements discrets de sélection/outil — pendant le
 * drag, le style est muté directement (zéro re-render).
 */
export function SelectionBadges(props: SelectionBadgesProps) {
  const { engine, theme } = useMapContext()
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
  // Groupes de markers par type (métadonnées du registre des sélectionnables).
  const markerGroups = new Map<string, (string | number)[]>()
  for (const id of markerSelection) {
    const type = engine.selectables.info(id)?.type ?? '?'
    const ids = markerGroups.get(type)
    if (ids) ids.push(id)
    else markerGroups.set(type, [id])
  }

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
          {[...markerGroups].map(([type, ids]) => {
            const text = rowLabel(labels.selection.markersGroup, props.markerTypeLabel?.(type) ?? type)
            const aria = formatLabel(labels.selection.deselectGroup, { label: text })
            return (
              <div key={`marker:${type}`} className="m3d-tagrow">
                <span
                  className="m3d-tagdot"
                  // Même résolution type → couleur que le rendu carte (DefaultMarker/DefaultCluster).
                  style={{ background: (theme.colors.marker[type] ?? theme.colors.marker.default!).base }}
                />
                <span className="m3d-taglabel">{text}</span>
                <span className="m3d-tagcount">{ids.length}</span>
                <button type="button" className="m3d-selrow-x" onClick={() => deselectMarkers(ids)} aria-label={aria}>
                  <Icon path={mdiClose} size={0.55} />
                </button>
              </div>
            )
          })}
        </div>
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
