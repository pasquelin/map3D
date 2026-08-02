import { memo, type ReactNode, useMemo } from 'react'
import { altitudeForZoom } from '../../core/MapEngine'
import type { MarkerData } from '../../data/types'
import { formatLabel } from '../../labels/mergeLabels'
import { markerColorOf } from '../../theme/colors'
import { useConfig, useLabels, useMapContext } from '../context'
import { type MenuItem, prependMenuAction } from './ContextMenu'
import { SelectionList, type SelectionRowModel, targetMenuItem } from './SelectionRow'
import { Swatch } from './Swatch'
import { UiIcon } from './UiIcon'

/** Action du menu déroulant d'une ligne (extensible). */
export type MarkerListAction<T = unknown> = {
  id: string
  label: string
  /** Chemin d'icône @mdi/js (optionnel). */
  icon?: string
  run: (marker: MarkerData<T>) => void
}

export type MarkerListProps<T = unknown> = {
  /** Markers listés, dans l'ordre fourni. */
  markers: MarkerData<T>[]
  /** Clé stable d'une ligne. Requise ici — la liste ne suppose rien de la forme des données. */
  getId: (m: MarkerData<T>) => string | number
  /** Rendu du **titre** (1ʳᵉ ligne) — défaut : `MarkerData.title`, sinon l'id. */
  renderItem?: (m: MarkerData<T>) => ReactNode
  /** Rendu du **sous-titre** (2ᵉ ligne, plus petit) — défaut : le type via `markerTypeLabel`. */
  renderSubtitle?: (m: MarkerData<T>) => ReactNode
  /** Libellé lisible d'un type (sous-titre par défaut). */
  markerTypeLabel?: (type: string) => string
  /** Croix de retrait par ligne (masquée si absent) : désélectionne / retire. */
  onRemove?: (id: string | number) => void
  /** Clic sur la ligne / action « Cibler ». Défaut : vol caméra vers le marker. */
  onTarget?: (m: MarkerData<T>) => void
  /** Zoom du vol « cibler » (défaut 17). */
  targetZoom?: number
  /** Actions du menu déroulant, en plus de « Cibler ». */
  actions?: MarkerListAction<T>[]
  /**
   * Menu d'une ligne, dans la MÊME forme que `<MarkerLayer menu>` : c'est ce qui
   * permet au bouton « … » d'une ligne d'offrir exactement le menu du marker sur la
   * carte, sous-menus et séparateurs compris. Fourni, il l'emporte sur `actions`.
   *
   * « Cibler » reste ajouté en tête par la liste — ne le remettez pas ici.
   */
  menu?: (m: MarkerData<T>) => MenuItem[]
  /**
   * Ids des markers listés mais RETIRÉS de la carte par le gate de zoom (`static`
   * passé sous son seuil). Leur ligne porte un œil barré (`hiddenLabel`) — l'inventaire
   * ne change pas, il s'explique. Fourni par la loupe seule ; la sélection élague ses masqués.
   */
  hidden?: ReadonlySet<string | number>
}

/**
 * Liste de markers **partagée** par le panneau de sélection et la loupe. Ce n'est
 * qu'un ADAPTATEUR : elle mappe chaque `MarkerData` sur le modèle de ligne commun
 * (`SelectionRowModel`) et délègue tout le rendu à `SelectionList` — l'unique
 * brique de ligne. Aucun markup de ligne ne vit plus ici : pastille/titre/sous-titre,
 * menu « Cibler » (+ extensions), croix de retrait sont ceux de `SelectionList`.
 */
function MarkerListInner<T = unknown>(props: MarkerListProps<T>) {
  const { markers, getId, onRemove } = props
  const { engine, theme } = useMapContext()
  const config = useConfig()
  const labels = useLabels()

  const target = (m: MarkerData<T>) => {
    if (props.onTarget) {
      props.onTarget(m)
      return
    }
    engine.camera.flyTo(
      {
        lat: m.position.lat,
        lng: m.position.lng,
        altitude: altitudeForZoom(props.targetZoom ?? config.interaction.targetZoom),
      },
      { duration: theme.animations.target },
    )
  }

  /**
   * « Cibler » est TOUJOURS en tête : c'est l'action propre à la liste. Le reste vient
   * de `menu` (forme riche du menu marker : sous-menus, séparateurs) ou d'`actions`
   * (menu plat, chemin @mdi). Les deux sources coexistent volontairement.
   */
  const menuItemsFor = (m: MarkerData<T>): MenuItem[] => {
    const targetItem = targetMenuItem(labels.markerList.target, () => target(m))
    const provided = props.menu?.(m)
    if (provided) return prependMenuAction(targetItem, provided)
    return [
      targetItem,
      ...(props.actions ?? []).map((a) => ({
        label: a.label,
        icon: a.icon ? <UiIcon path={a.icon} /> : undefined,
        onSelect: () => a.run(m),
      })),
    ]
  }

  // Mémoïsé : `SelectionList` re-rend N lignes × icônes ; ne reconstruire les rows que
  // quand l'inventaire ou une render-prop change (identités stables attendues des appelants).
  const rows = useMemo<SelectionRowModel[]>(
    () =>
      markers.map((m) => {
        const id = getId(m)
        const idStr = String(id)
        const sub = props.renderSubtitle ? props.renderSubtitle(m) : (props.markerTypeLabel?.(m.type) ?? m.type)
        return {
          key: id,
          icon: <Swatch avatar={m.avatar} icon={m.icon} color={markerColorOf(theme, m.type).base} />,
          // `renderItem` décide de TOUT le titre, teinte comprise (même précédence que
          // `tooltip` face à `title`/`titleColor` sur la donnée) — la render-prop l'emporte.
          title: props.renderItem ? props.renderItem(m) : (m.title ?? idStr),
          titleColor: !props.renderItem ? m.titleColor : undefined,
          subtitle: sub,
          onActivate: () => target(m),
          menu: menuItemsFor(m),
          menuLabel: formatLabel(labels.markerList.actions, { label: idStr }),
          onDeselect: onRemove ? () => onRemove(id) : undefined,
          deselectLabel: formatLabel(labels.markerList.remove, { label: idStr }),
          // Repère « masqué au zoom » : porté par la ligne, jamais par la donnée — c'est
          // un état de VUE (le zoom courant), pas une propriété du marker.
          hidden: props.hidden?.has(id) ?? false,
          hiddenLabel: labels.lens.hidden,
        }
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      markers,
      getId,
      onRemove,
      props.renderItem,
      props.renderSubtitle,
      props.markerTypeLabel,
      props.actions,
      props.menu,
      props.hidden,
      labels.lens.hidden,
      theme,
    ],
  )

  return <SelectionList rows={rows} />
}

/**
 * Mémoïsée : la loupe re-rend son panneau à chaque frame alors que la liste ne change
 * que quand l'inventaire change. Le `as typeof MarkerListInner` préserve le paramètre
 * de type, que `memo()` effacerait.
 *
 * Corollaire pour les appelants : passer des props d'identité STABLE
 * (`markers` mémoïsé, `getId`/`onRemove`/`actions` hissés ou en `useCallback`).
 */
export const MarkerList = memo(MarkerListInner) as typeof MarkerListInner
