import { useMemo, useSyncExternalStore } from 'react'
import type { MarkerData } from '../../data/types'
import { formatCount } from '../../labels/mergeLabels'
import { useLabels, useMapContext } from '../context'
import { useDraggablePanel } from '../hooks/useDraggablePanel'
import { useToggleSet } from '../hooks/useToggleSet'
import { ClusterPie } from './ClusterPie'
import { FloatingPanel } from './FloatingPanel'
import type { MenuItem } from './ContextMenu'
import { MarkerList, type MarkerListAction } from './MarkerList'
import { SelectionGroup } from './SelectionGroup'
import { SelectionScroll } from './SelectionScroll'
import type { LensRenderItem } from './lensTypes'

export type LensPanelProps<T = unknown> = {
  markers: MarkerData<T>[]
  /** Ids masqués par le gate de zoom : leur ligne porte un œil barré (cf. `MarkerList.hidden`). */
  hidden?: ReadonlySet<string | number>
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
  const { engine } = useMapContext()
  const panel = useDraggablePanel(props.anchor)

  // Re-render au changement d'inventaire OU de clustering (une pastille qui se forme/défait
  // au zoom regroupe/dégroupe les lignes) — même dépendance que les badges de sélection.
  const snapshot = useSyncExternalStore(engine.markers.onItemsChanged, () => engine.markers.snapshot)

  // Groupes REPLIÉS — la loupe démarre groupes OUVERTS par défaut (inventaire : tout visible
  // d'emblée). Un clic sur le chevron replie. État local (préférence d'affichage).
  const [collapsed, toggle] = useToggleSet<string>()

  // Regroupe l'inventaire par CLUSTER visuel courant (`visualNodeOf`) — MÊME notion de
  // groupe que le sélecteur. Un marker isolé (hors cluster) tombe dans la liste plate.
  // `counts`/`label` sont calculés ICI (pas dans le JSX) : la loupe se re-rend à chaque
  // frame tant qu'elle suit le pointeur, ce scan des membres ne doit pas suivre.
  const { clusters, flat } = useMemo(() => {
    const byKey = new Map<string, MarkerData<T>[]>()
    const flat: MarkerData<T>[] = []
    for (const m of markers) {
      const node = engine.markers.visualNodeOf(getId(m))
      if (node && node.memberIds.length > 1) {
        const arr = byKey.get(node.key)
        if (arr) arr.push(m)
        else byKey.set(node.key, [m])
      } else flat.push(m)
    }
    const clusters = [...byKey].map(([key, ms]) => {
      const counts: Record<string, number> = {}
      for (const m of ms) counts[m.type] = (counts[m.type] ?? 0) + 1
      const label = formatCount(labels.clusters.labelSingular, labels.clusters.label, ms.length, labels.plural)
      return { key, ms, counts, label }
    })
    return { clusters, flat }
    // `snapshot` : le clustering a pu changer sans que `markers` bouge (même jeu, autre zoom).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [markers, getId, engine, snapshot, labels])

  const count = markers.length
  // Via `labels.plural` comme les autres dénombrables : `count === 1` traitait 0 au
  // pluriel (correct en français) mais figeait la règle pour toutes les langues.
  const title = formatCount(labels.lens.titleSingular, labels.lens.title, count, labels.plural)

  // Liste partagée `MarkerList` — identique à celle du sélecteur, câblée sur les props de la loupe.
  const list = (ms: MarkerData<T>[]) => (
    <MarkerList<T>
      markers={ms}
      hidden={props.hidden}
      getId={getId}
      renderItem={props.renderItem}
      markerTypeLabel={props.markerTypeLabel}
      onRemove={props.onRemove}
      actions={props.actions}
      menu={props.menu}
      targetZoom={props.targetZoom}
    />
  )

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
        // MÊMES briques que le sélecteur : conteneur `SelectionScroll`, en-têtes `SelectionGroup`
        // (clusters, OUVERTS par défaut), lignes `MarkerList`. Seul l'ancrage (magnétique) diffère.
        <SelectionScroll>
          {clusters.map(({ key, ms, counts, label }) => (
            <SelectionGroup
              key={key}
              icon={<ClusterPie counts={counts} />}
              label={label}
              count={ms.length}
              open={!collapsed.has(key)}
              onToggle={() => toggle(key)}
              // La croix du groupe retire tous ses markers de l'inventaire de la loupe.
              onDeselect={() => ms.forEach((m) => props.onRemove(getId(m)))}
            >
              {list(ms)}
            </SelectionGroup>
          ))}
          {flat.length > 0 && list(flat)}
        </SelectionScroll>
      )}
    </FloatingPanel>
  )
}
