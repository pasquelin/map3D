import { mdiChevronRight, mdiClose, mdiSelectionOff, mdiTrashCanOutline } from '@mdi/js'
import { UiIcon } from './UiIcon'
import { type ReactNode, useCallback, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import type { MarkerData } from '../../data/types'
import type { DrawTool } from '../../layers/DrawLayer'
import { formatLabel, symbolText } from '../../labels/mergeLabels'
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
  const {
    tool,
    selection,
    markerSelection,
    selectionDetails,
    select,
    deselectMarkers,
    clearSelection,
    removeShape,
    getShape,
    symbols,
  } = useDrawing()

  // Panneau flottant déplaçable — mécanique partagée (drag clampé, re-clamp resize).
  // Le hook vit ICI, pas dans `FloatingPanel` : ce composant reste monté quand la
  // sélection se vide (il rend `null`), donc la position choisie par l'utilisateur
  // survit à une désélection au lieu de repartir du coin par défaut.
  const panel = useDraggablePanel()

  // Instantané de l'inventaire markers : la liste doit refléter un flux temps réel
  // (position, avatar) même à sélection CONSTANTE. Un compteur de révision aurait suffi
  // à déclencher le recalcul, mais il n'aurait été nommé nulle part dans le corps du
  // memo — donc invisible pour qui relit, et retirable par mégarde sans que rien ne
  // proteste. L'instantané EST l'objet interrogé : la dépendance se voit.
  const snapshot = useSyncExternalStore(engine.markers.onItemsChanged, () => engine.markers.snapshot)

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
      const m = snapshot.markerById(id)
      if (!m) continue
      markers.push(m)
      idOf.set(m, id)
    }
    return { markers, idOf }
  }, [markerSelection, snapshot])
  const getId = useCallback((m: MarkerData) => idOf.get(m) ?? m.id, [idOf])
  // `deselectMarkers` est recréé à chaque révision de l'API de dessin : passer par
  // un ref donne au callback une identité DÉFINITIVE, seule façon de ne pas
  // invalider le memo à chaque mutation du core.
  const deselectRef = useRef(deselectMarkers)
  deselectRef.current = deselectMarkers
  const onRemoveMarker = useCallback((id: string | number) => deselectRef.current([id]), [])

  // Groupes de formes DÉPLIÉS (par kind), comme le catalogue : un groupe ouvert liste ses
  // formes individuelles, chacune supprimable. État local — l'ouverture est une préférence
  // d'affichage, pas de la sélection.
  const [expanded, setExpanded] = useState<ReadonlySet<DrawTool>>(() => new Set())
  const toggleExpand = useCallback((kind: DrawTool) => {
    setExpanded((cur) => {
      const next = new Set(cur)
      if (next.has(kind)) next.delete(kind)
      else next.add(kind)
      return next
    })
  }, [])
  // Index clé→entrée du catalogue : le libellé d'un symbole déplié le résout sinon par un
  // scan O(catalogue) par forme (le catalogue MIL-STD compte des milliers d'entrées). Même
  // mémoïsation que `SymbolMarkers.byKey`.
  const symbolByKey = useMemo(() => new Map(symbols.catalog.entries.map((e) => [e.key, e])), [symbols.catalog])

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

  // Libellé d'une forme individuelle : le vrai libellé du catalogue pour un symbole, son
  // nom propre s'il en a un, sinon « {Type} {rang} » (numéroté dans le groupe). Résolu
  // seulement pour les groupes DÉPLIÉS (appelé dans le rendu conditionnel).
  const childLabel = (id: string, kind: DrawTool, index: number): string => {
    const shape = getShape(id)
    if (shape?.symbol) {
      const entry = symbolByKey.get(shape.symbol.key)
      if (entry) return symbolText(labels, entry).label
    }
    if (shape?.title) return shape.title
    return formatLabel(labels.selection.shapeItem, {
      type: props.shapeKindLabel?.(kind) ?? labels.tools[kind],
      n: String(index + 1),
    })
  }

  // Nom d'une forme + sa corbeille rouge — commun à la ligne d'une forme SEULE et à une
  // ligne enfant d'un groupe déplié (mêmes deux éléments, seul l'entourage diffère).
  const deletableLabel = (id: string, clabel: string) => (
    <>
      <span className="m3d-taglabel">{clabel}</span>
      <button
        type="button"
        className="m3d-selrow-x m3d-danger"
        onClick={() => removeShape(id)}
        aria-label={formatLabel(labels.selection.deleteShape, { label: clabel })}
      >
        <UiIcon path={mdiTrashCanOutline} />
      </button>
    </>
  )

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
              const isOpen = expanded.has(kind)
              // Calculé AU CLIC seulement (pas à chaque render, O(S×groupe) sinon).
              const deselectGroup = () => {
                const drop = new Set(ids)
                select(selection.filter((id) => !drop.has(id)))
              }

              // Une SEULE forme : inutile de la nicher dans un groupe dépliable — on la montre
              // DIRECTEMENT (son nom réel + corbeille), avec une gouttière pour rester alignée.
              if (ids.length === 1) {
                const id = ids[0]!
                const clabel = childLabel(id, kind, 0)
                return (
                  <div key={`shape:${kind}`} className="m3d-tagrow">
                    <span className="m3d-selrow-chevron-spacer" />
                    <UiIcon path={TOOL_ICONS[kind]} />
                    {deletableLabel(id, clabel)}
                    <button
                      type="button"
                      className="m3d-selrow-x"
                      onClick={deselectGroup}
                      aria-label={formatLabel(labels.selection.deselectGroup, { label: clabel })}
                    >
                      <UiIcon path={mdiClose} />
                    </button>
                  </div>
                )
              }

              const aria = formatLabel(labels.selection.deselectGroup, { label: text })
              return (
                <div key={`shape:${kind}`}>
                  <div className="m3d-tagrow">
                    {/* Chevron : déplie le groupe pour lister ses formes, comme le catalogue. */}
                    <button
                      type="button"
                      className={isOpen ? 'm3d-selrow-chevron m3d-on' : 'm3d-selrow-chevron'}
                      aria-expanded={isOpen}
                      aria-label={formatLabel(labels.selection.expandGroup, { label: text })}
                      onClick={() => toggleExpand(kind)}
                    >
                      <UiIcon path={mdiChevronRight} />
                    </button>
                    <UiIcon path={TOOL_ICONS[kind]} />
                    <span className="m3d-taglabel">{text}</span>
                    <span className="m3d-tagcount">{ids.length}</span>
                    {/* La croix du groupe DÉSÉLECTIONNE (ne supprime pas) — la suppression est
                        par forme, sous le chevron. */}
                    <button type="button" className="m3d-selrow-x" onClick={deselectGroup} aria-label={aria}>
                      <UiIcon path={mdiClose} />
                    </button>
                  </div>
                  {isOpen && (
                    <div className="m3d-selchildren">
                      {ids.map((id, i) => (
                        <div key={id} className="m3d-selchild">
                          {deletableLabel(id, childLabel(id, kind, i))}
                        </div>
                      ))}
                    </div>
                  )}
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
          <UiIcon path={mdiSelectionOff} />
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
