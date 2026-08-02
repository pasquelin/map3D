import { mdiSelectionOff, mdiTrashCanOutline, mdiVectorPolyline } from '@mdi/js'
import { type ReactNode, useCallback, useMemo, useRef, useSyncExternalStore } from 'react'
import { boundsOfLatLngs } from '../../core/bounds'
import type { MarkerSnapshot } from '../../core/MarkerQuery'
import type { MarkerData } from '../../data/types'
import type { DrawnShape, DrawTool } from '../../layers/DrawLayer'
import { formatLabel, symbolText } from '../../labels/mergeLabels'
import { useLabels, useMapContext } from '../context'
import { ClusterPie } from './ClusterPie'
import { useDrawing } from '../hooks/useDrawing'
import { useDraggablePanel } from '../hooks/useDraggablePanel'
import { useToggleSet } from '../hooks/useToggleSet'
import type { MenuItem } from './ContextMenu'
import { TOOL_ICONS } from './drawControls'
import { FloatingPanel } from './FloatingPanel'
import { MarkerList, type MarkerListAction } from './MarkerList'
import { SelectionGroup } from './SelectionGroup'
import { type SelectionRowModel, targetMenuItem } from './SelectionRow'
import { SelectionScroll } from './SelectionScroll'
import { SelectionSection } from './SelectionSection'
import { UiIcon } from './UiIcon'

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
 * Résout les données complètes de markers depuis le snapshot, en MÉMORISANT l'id d'origine
 * (celui du `getId` de `MarkerLayer`) : le re-dériver casserait la désélection dès qu'une app
 * fournit un `getId` custom. Les disparus de l'inventaire sont ignorés.
 */
function resolveMembers(
  ids: Iterable<string | number>,
  snapshot: MarkerSnapshot,
): { items: MarkerData[]; idOf: Map<MarkerData, string | number> } {
  const items: MarkerData[] = []
  const idOf = new Map<MarkerData, string | number>()
  for (const id of ids) {
    const m = snapshot.markerById(id)
    if (!m) continue
    items.push(m)
    idOf.set(m, id)
  }
  return { items, idOf }
}

/**
 * Panneau de sélection (haut-droite par défaut, monté dans `<DrawLayer>`). TOUT le
 * contenu — formes, tracés, clusters, markers — est rendu par DEUX briques partagées :
 * `SelectionGroup` (en-tête pliable) et `SelectionRow` (via `SelectionList` / `MarkerList`).
 * Une ligne a partout la MÊME structure `[icône] titre/sous-titre · « … » · ✕` ; seul le
 * contenu (icône, menu) varie par type. Déplaçable par sa poignée.
 */
export function SelectionBadges(props: SelectionBadgesProps) {
  const { engine } = useMapContext()
  const labels = useLabels()
  const {
    tool,
    selection,
    markerSelection,
    pathSelection,
    clusterGroups,
    selectionDetails,
    select,
    deselectMarkers,
    deselectPaths,
    deselectClusterGroup,
    deselectClusterMember,
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
  // (position, avatar) même à sélection CONSTANTE. L'instantané EST l'objet interrogé :
  // la dépendance des memos se voit.
  const snapshot = useSyncExternalStore(engine.markers.onItemsChanged, () => engine.markers.snapshot)

  // Markers sélectionnés → donnée complète pour la liste partagée (cf. `resolveMembers`).
  const { items: markers, idOf } = useMemo(() => resolveMembers(markerSelection, snapshot), [markerSelection, snapshot])
  const getId = useCallback((m: MarkerData) => idOf.get(m) ?? m.id, [idOf])
  // `deselectMarkers` est recréé à chaque révision de l'API de dessin : passer par un ref
  // donne au callback une identité DÉFINITIVE, seule façon de ne pas invalider le memo.
  const deselectRef = useRef(deselectMarkers)
  deselectRef.current = deselectMarkers
  const onRemoveMarker = useCallback((id: string | number) => deselectRef.current([id]), [])

  // Groupes DÉPLIÉS (par kind / tracés / cluster) — état local : l'ouverture est une
  // préférence d'affichage, pas de la sélection. Le sélecteur démarre groupes FERMÉS
  // (panneau compact), un clic sur le chevron déplie.
  const [expanded, toggleExpand] = useToggleSet<string>()
  // Index clé→entrée du catalogue : le libellé d'un symbole déplié le résout sinon par un
  // scan O(catalogue) par forme. Même mémoïsation que `SymbolMarkers.byKey`.
  const symbolByKey = useMemo(() => new Map(symbols.catalog.entries.map((e) => [e.key, e])), [symbols.catalog])

  // La sélection n'existe que pendant l'outil sélection (vidée à la sortie).
  const total = selection.length + markerSelection.length + pathSelection.length + clusterGroups.length
  if (tool !== 'select' || total === 0) return null

  const pathsOpen = expanded.has('m3d:paths')

  // Groupes de formes par kind, dans l'ordre de la sélection.
  const shapeGroups = new Map<DrawTool, string[]>()
  for (const d of selectionDetails) {
    const ids = shapeGroups.get(d.kind)
    if (ids) ids.push(d.id)
    else shapeGroups.set(d.kind, [d.id])
  }

  const shapeKindLabel = (kind: DrawTool) => props.shapeKindLabel?.(kind) ?? labels.tools[kind]
  const rowLabel = (group: string, type: string): string => formatLabel(labels.selection.group, { group, type })

  // Cadre la forme/le tracé (mêmes gestes de caméra que « Cibler » d'un marker).
  const focusShape = (id: string) => {
    const shape = getShape(id)
    const b = shape ? boundsOfLatLngs(shape.points) : null
    if (b) engine.camera.fitBounds(b)
  }
  const focusPath = (id: string | number) => {
    const b = engine.selectables.boundsOf(id)
    if (b) engine.camera.fitBounds(b)
  }

  // Libellé d'une forme individuelle : vrai libellé du catalogue (symbole), nom propre,
  // sinon « {Type} {rang} ». Prend la forme déjà résolue (une seule lecture par ligne).
  const shapeLabel = (shape: DrawnShape | null, kind: DrawTool, index: number): string => {
    if (shape?.symbol) {
      const entry = symbolByKey.get(shape.symbol.key)
      if (entry) return symbolText(labels, entry).label
    }
    if (shape?.title) return shape.title
    return formatLabel(labels.selection.shapeItem, { type: shapeKindLabel(kind), n: String(index + 1) })
  }

  // Ligne à partir d'un libellé : titre ET aria-labels (menu « … », croix ✕) dérivés du MÊME
  // `clabel`. Seuls l'icône, le menu et les handlers varient d'un type à l'autre.
  const rowFrom = (
    key: string | number,
    icon: ReactNode,
    clabel: string,
    parts: { onActivate: () => void; menu: MenuItem[]; onDeselect: () => void },
  ): SelectionRowModel => ({
    key,
    icon,
    title: clabel,
    onActivate: parts.onActivate,
    menu: parts.menu,
    menuLabel: formatLabel(labels.markerList.actions, { label: clabel }),
    onDeselect: parts.onDeselect,
    deselectLabel: formatLabel(labels.selection.deselectGroup, { label: clabel }),
  })

  // Ligne d'une FORME : glyphe d'outil TEINTÉ de la couleur de la forme (comme le tracé porte
  // sa couleur), « Cibler » + « Supprimer » (destructif) dans le menu, ✕ = retire de la sélection.
  const shapeRow = (id: string, kind: DrawTool, index: number): SelectionRowModel => {
    const shape = getShape(id)
    return rowFrom(id, <UiIcon path={TOOL_ICONS[kind]} color={shape?.style.color} />, shapeLabel(shape, kind, index), {
      onActivate: () => focusShape(id),
      menu: [
        targetMenuItem(labels.markerList.target, () => focusShape(id)),
        {
          label: labels.selection.delete,
          icon: <UiIcon path={mdiTrashCanOutline} />,
          danger: true,
          onSelect: () => removeShape(id),
        },
      ],
      onDeselect: () => select(selection.filter((x) => x !== id)),
    })
  }

  // Ligne d'un TRACÉ : glyphe polyligne (plus parlant qu'un trait) TEINTÉ de la couleur du
  // tracé, « Cibler » dans le menu, ✕ = désélectionne.
  const pathRow = (id: string | number, index: number): SelectionRowModel =>
    rowFrom(
      id,
      <UiIcon path={mdiVectorPolyline} color={engine.selectables.info(id)?.color} />,
      formatLabel(labels.selection.pathItem, { n: String(index + 1) }),
      {
        onActivate: () => focusPath(id),
        menu: [targetMenuItem(labels.markerList.target, () => focusPath(id))],
        onDeselect: () => deselectPaths([id]),
      },
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
        {/* Conteneur de scroll UNIQUE, PARTAGÉ avec la loupe (`SelectionScroll`) : une seule
            zone scrollable, pas de scroll par bloc ni horizontal. Le bouton « Tout désélectionner »
            et le pied restent FIXES sous ce conteneur (toujours atteignables). */}
        <SelectionScroll>
          {shapeGroups.size > 0 && (
            <div className="m3d-taglist">
              {[...shapeGroups].map(([kind, ids]) => (
                <SelectionSection
                  key={`shape:${kind}`}
                  ids={ids}
                  rowOf={(id, i) => shapeRow(id, kind, i)}
                  groupIcon={<UiIcon path={TOOL_ICONS[kind]} />}
                  groupLabel={rowLabel(labels.selection.shapesGroup, shapeKindLabel(kind))}
                  open={expanded.has(kind)}
                  onToggle={() => toggleExpand(kind)}
                  // Calculé AU CLIC seulement (pas à chaque render, O(S×groupe) sinon).
                  onDeselectGroup={() => {
                    const drop = new Set(ids)
                    select(selection.filter((id) => !drop.has(id)))
                  }}
                />
              ))}
            </div>
          )}

          {pathSelection.length > 0 && (
            <div className="m3d-taglist">
              <SelectionSection
                ids={pathSelection}
                rowOf={(id, i) => pathRow(id, i)}
                groupIcon={<UiIcon path={mdiVectorPolyline} />}
                groupLabel={labels.selection.pathsGroup}
                open={pathsOpen}
                onToggle={() => toggleExpand('m3d:paths')}
                onDeselectGroup={() => deselectPaths(pathSelection)}
              />
            </div>
          )}

          {clusterGroups.length > 0 && (
            <div className="m3d-taglist">
              {clusterGroups.map((g) => {
                // Membres résolus depuis l'inventaire temps réel — id d'origine mémorisé pour `getId`.
                const { items: members, idOf: memberIdOf } = resolveMembers(g.memberIds, snapshot)
                return (
                  <SelectionGroup
                    key={g.id}
                    icon={<ClusterPie counts={g.counts ?? {}} />}
                    label={g.label}
                    count={g.memberIds.length}
                    open={expanded.has(`m3d:cluster:${g.id}`)}
                    onToggle={() => toggleExpand(`m3d:cluster:${g.id}`)}
                    onDeselect={() => deselectClusterGroup(g.id)}
                  >
                    {/* Enfants de cluster = markers : même liste partagée, ✕ retire UN membre. */}
                    <MarkerList
                      markers={members}
                      getId={(m) => memberIdOf.get(m) ?? m.id}
                      renderItem={props.renderMarker}
                      markerTypeLabel={props.markerTypeLabel}
                      onRemove={(id) => deselectClusterMember(g.id, id)}
                      actions={props.markerActions}
                      menu={props.markerMenu}
                    />
                  </SelectionGroup>
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
        </SelectionScroll>

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
