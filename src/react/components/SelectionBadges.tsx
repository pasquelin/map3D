import { mdiChevronRight, mdiClose, mdiGroup, mdiSelectionOff, mdiTrashCanOutline, mdiVectorPolyline } from '@mdi/js'
import { UiIcon } from './UiIcon'
import { type CSSProperties, type ReactNode, useCallback, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import type { MarkerData } from '../../data/types'
import type { DrawTool } from '../../layers/DrawLayer'
import { formatLabel, symbolText } from '../../labels/mergeLabels'
import { markerColorOf } from '../../theme/colors'
import { useLabels, useMapContext, useTheme } from '../context'
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
/**
 * Mini-camembert d'un groupe de cluster : mêmes couleurs de parts que la pastille sur la
 * carte (parts ÉGALES par type, comme `<DefaultCluster>`), en `conic-gradient`. Remplace
 * l'icône générique du groupe pour que la ligne « ressemble » au cluster qu'elle représente.
 */
function ClusterPie({ counts }: { counts: Record<string, number> }) {
  const theme = useTheme()
  const types = Object.keys(counts)
  if (types.length === 0) return <UiIcon path={mdiGroup} />
  const stops =
    types.length === 1
      ? markerColorOf(theme, types[0]!).base
      : types
          .map(
            (t, i) =>
              `${markerColorOf(theme, t).base} ${(i / types.length) * 360}deg ${((i + 1) / types.length) * 360}deg`,
          )
          .join(', ')
  return (
    <span
      aria-hidden
      className="m3d-clusterpie"
      style={{ background: types.length === 1 ? stops : `conic-gradient(${stops})` } as CSSProperties}
    />
  )
}

/**
 * En-tête d'un groupe pliable des badges (chevron + icône + libellé + compteur +
 * croix de désélection) — factorisé pour les formes, les tracés et les clusters.
 */
function CollapsibleGroupHeader(props: {
  /** Icône du groupe — chemin mdi (formes/tracés) OU nœud custom (mini-camembert d'un cluster). */
  iconPath?: string
  icon?: ReactNode
  label: string
  count: number
  open: boolean
  onToggle: () => void
  onDeselect: () => void
}) {
  const labels = useLabels()
  const { iconPath, icon, label, count, open, onToggle, onDeselect } = props
  return (
    <div className="m3d-tagrow">
      {/* Chevron : déplie le groupe pour lister ses éléments, comme le catalogue. */}
      <button
        type="button"
        className={open ? 'm3d-selrow-chevron m3d-on' : 'm3d-selrow-chevron'}
        aria-expanded={open}
        aria-label={formatLabel(labels.selection.expandGroup, { label })}
        onClick={onToggle}
      >
        <UiIcon path={mdiChevronRight} />
      </button>
      {icon ?? (iconPath ? <UiIcon path={iconPath} /> : null)}
      <span className="m3d-taglabel">{label}</span>
      <span className="m3d-tagcount">{count}</span>
      {/* La croix DÉSÉLECTIONNE le groupe (ne supprime pas). */}
      <button
        type="button"
        className="m3d-selrow-x"
        onClick={onDeselect}
        aria-label={formatLabel(labels.selection.deselectGroup, { label })}
      >
        <UiIcon path={mdiClose} />
      </button>
    </div>
  )
}

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
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(() => new Set())
  const toggleExpand = useCallback((key: string) => {
    setExpanded((cur) => {
      const next = new Set(cur)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }, [])
  // Index clé→entrée du catalogue : le libellé d'un symbole déplié le résout sinon par un
  // scan O(catalogue) par forme (le catalogue MIL-STD compte des milliers d'entrées). Même
  // mémoïsation que `SymbolMarkers.byKey`.
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
              // DIRECTEMENT (son nom réel + corbeille). Sans chevron : pas de gouttière réservée
              // (elle laissait un gros vide à gauche pour une ligne qui n'a rien à déplier).
              if (ids.length === 1) {
                const id = ids[0]!
                const clabel = childLabel(id, kind, 0)
                return (
                  <div key={`shape:${kind}`} className="m3d-tagrow">
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

              return (
                <div key={`shape:${kind}`}>
                  {/* La suppression reste PAR forme (corbeille sous le chevron) ; la croix du header désélectionne. */}
                  <CollapsibleGroupHeader
                    iconPath={TOOL_ICONS[kind]}
                    label={text}
                    count={ids.length}
                    open={isOpen}
                    onToggle={() => toggleExpand(kind)}
                    onDeselect={deselectGroup}
                  />
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

        {pathSelection.length > 0 && (
          <div className="m3d-taglist">
            <div>
              {/* Groupe pliable « Tracés », même pattern que les formes/catalogue. */}
              <CollapsibleGroupHeader
                iconPath={mdiVectorPolyline}
                label={labels.selection.pathsGroup}
                count={pathSelection.length}
                open={pathsOpen}
                onToggle={() => toggleExpand('m3d:paths')}
                onDeselect={() => deselectPaths(pathSelection)}
              />
              {pathsOpen && (
                <div className="m3d-selchildren">
                  {pathSelection.map((id, i) => {
                    const clabel = formatLabel(labels.selection.pathItem, { n: String(i + 1) })
                    return (
                      <div key={id} className="m3d-selchild">
                        <span className="m3d-taglabel">{clabel}</span>
                        <button
                          type="button"
                          className="m3d-selrow-x"
                          onClick={() => deselectPaths([id])}
                          aria-label={formatLabel(labels.selection.deselectGroup, { label: clabel })}
                        >
                          <UiIcon path={mdiClose} />
                        </button>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </div>
        )}

        {clusterGroups.length > 0 && (
          <div className="m3d-taglist">
            {clusterGroups.map((g) => {
              const open = expanded.has(`m3d:cluster:${g.id}`)
              // Membres résolus depuis l'inventaire temps réel — l'id d'origine mémorisé
              // pour `getId` (cf. la liste markers principale).
              const members: MarkerData[] = []
              const memberIdOf = new Map<MarkerData, string | number>()
              for (const mid of g.memberIds) {
                const m = snapshot.markerById(mid)
                if (!m) continue
                members.push(m)
                memberIdOf.set(m, mid)
              }
              return (
                <div key={g.id}>
                  {/* La croix désélectionne le cluster ENTIER (tous ses enfants). */}
                  <CollapsibleGroupHeader
                    icon={<ClusterPie counts={g.counts ?? {}} />}
                    label={g.label}
                    count={g.memberIds.length}
                    open={open}
                    onToggle={() => toggleExpand(`m3d:cluster:${g.id}`)}
                    onDeselect={() => deselectClusterGroup(g.id)}
                  />
                  {open && members.length > 0 && (
                    <div className="m3d-selchildren">
                      <MarkerList
                        markers={members}
                        getId={(m) => memberIdOf.get(m) ?? m.id}
                        renderItem={props.renderMarker}
                        markerTypeLabel={props.markerTypeLabel}
                        actions={props.markerActions}
                        menu={props.markerMenu}
                      />
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
