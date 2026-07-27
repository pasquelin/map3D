import { mdiClose, mdiSelectionOff } from '@mdi/js'
import Icon from '@mdi/react'
import { type ReactNode, useCallback, useEffect, useMemo, useReducer, useRef } from 'react'
import type { MarkerData } from '../../data/types'
import type { DrawTool } from '../../layers/DrawLayer'
import { formatLabel } from '../../labels/mergeLabels'
import { useLabels, useMapContext } from '../context'
import { useDrawing } from '../hooks/useDrawing'
import { useDraggablePanel } from '../hooks/useDraggablePanel'
import { TOOL_ICONS } from './drawControls'
import { FloatingPanel } from './FloatingPanel'
import type { MenuItem } from './ContextMenu'
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
  /** Menu d'une ligne, même forme que `<MarkerLayer menu>` — prime sur `markerActions`. */
  markerMenu?: (m: MarkerData) => MenuItem[]
}

/**
 * Panneau de sélection (haut-droite par défaut, monté dans `<DrawLayer>`). Les
 * **markers** sont listés **1 ligne par marker** via `MarkerList` — le composant
 * de liste **partagé avec la loupe** (pastille + titre/sous-titre, menu « Cibler »,
 * croix). Les **formes** dessinées restent regroupées par kind (compteur + croix).
 * Déplaçable par sa poignée. La croix d'une ligne de marker la désélectionne.
 */
export function SelectionBadges(props: SelectionBadgesProps) {
  const { engine } = useMapContext()
  const labels = useLabels()
  const { tool, selection, markerSelection, selectionDetails, select, deselectMarkers, clearSelection } = useDrawing()

  // Panneau flottant déplaçable — mécanique partagée (drag clampé, re-clamp resize).
  // Le hook vit ICI, pas dans `FloatingPanel` : ce composant reste monté quand la
  // sélection se vide (il rend `null`), donc la position choisie par l'utilisateur
  // survit à une désélection au lieu de repartir du coin par défaut.
  const panel = useDraggablePanel()

  // Version des données markers : la liste doit refléter un flux temps réel
  // (position, avatar) même à sélection CONSTANTE — sans ce signal, la mémoïsation
  // ci-dessous figerait des lignes périmées.
  const [dataRev, bumpData] = useReducer((x: number) => x + 1, 0)
  useEffect(() => engine.markers.onItemsChanged(bumpData), [engine])

  // Markers sélectionnés → donnée complète (position, avatar…) pour la liste
  // partagée. On MÉMORISE l'id d'origine : c'est celui du `getId` de `MarkerLayer`
  // (la sélection et le registre sont clés dessus), pas forcément `m.id`. Le
  // re-dériver en `m.id` casserait la désélection dès qu'une app fournit un `getId`
  // custom — et collisionnerait les clés React sur des `m.id` non uniques.
  //
  // Mémoïsé : `MarkerList` est `memo()` et ne retient RIEN si `markers`/`getId`/
  // `onRemove` changent d'identité à chaque render (cf. son corollaire d'appel) —
  // toute la liste (N lignes × icônes) se re-rendait alors à chaque mutation.
  const { markers, idOf } = useMemo(() => {
    const markers: MarkerData[] = []
    const idOf = new Map<MarkerData, string | number>()
    for (const id of markerSelection) {
      const m = engine.markers.markerById(id)
      if (!m) continue
      markers.push(m)
      idOf.set(m, id)
    }
    return { markers, idOf }
  }, [markerSelection, engine, dataRev])
  const getId = useCallback((m: MarkerData) => idOf.get(m) ?? m.id, [idOf])
  // `deselectMarkers` est recréé à chaque révision de l'API de dessin : passer par
  // un ref donne au callback une identité DÉFINITIVE, seule façon de ne pas
  // invalider le memo à chaque mutation du core.
  const deselectRef = useRef(deselectMarkers)
  deselectRef.current = deselectMarkers
  const onRemoveMarker = useCallback((id: string | number) => deselectRef.current([id]), [])

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

  const rowLabel = (group: string, type: string): string => formatLabel(labels.selection.group, { group, type })

  return (
    <FloatingPanel
      panel={panel}
      title={`${labels.selection.title} ${total}`}
      moveLabel={labels.selection.movePanel}
      hudClassName="m3d-selhud"
      panelClassName="m3d-selpanel"
    >
      <>
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
            getId={getId}
            renderItem={props.renderMarker}
            markerTypeLabel={props.markerTypeLabel}
            onRemove={onRemoveMarker}
            actions={props.markerActions}
            menu={props.markerMenu}
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
      </>
    </FloatingPanel>
  )
}
