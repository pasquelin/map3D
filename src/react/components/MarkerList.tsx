import { mdiClose, mdiCrosshairsGps, mdiDotsHorizontal } from '@mdi/js'
import { UiIcon } from './UiIcon'
import { memo, type ReactNode, useCallback, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { altitudeForZoom } from '../../core/MapEngine'
import type { MarkerData } from '../../data/types'
import { formatLabel } from '../../labels/mergeLabels'
import { useConfig, useLabels, useMapContext } from '../context'
import { ContextMenu, type MenuItem } from './ContextMenu'
import { useMergedRefs, useNudgeInside } from './panelFit'
import { Swatch } from './Swatch'
import { useDismiss } from './useDismiss'
import { markerColorOf } from '../../theme/colors'

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
}

/**
 * Liste de markers **partagée** par le panneau de sélection et la loupe :
 * 1 ligne par marker, langage visuel commun. Chaque ligne — pastille/avatar +
 * titre/sous-titre, menu d'actions déroulant (« Cibler » + extensions), croix
 * (option). Clic sur la ligne = cibler (vol caméra par défaut). Le menu est rendu
 * en PORTAL dans `.m3d-root` pour ne pas être rogné par le scroll de la liste.
 */
function MarkerListInner<T = unknown>(props: MarkerListProps<T>) {
  const { markers, getId, onRemove } = props
  const { engine, theme, overlay } = useMapContext()
  const config = useConfig()
  const labels = useLabels()
  const root = overlay.parentElement
  const [menu, setMenu] = useState<{ id: string | number; left: number; top: number } | null>(null)
  const closeMenu = useCallback(() => setMenu(null), [])
  // Le nœud du menu sert à DEUX choses : le rabattre dans le conteneur (nudge) et
  // décider si un clic tombe dedans (dismiss). D'où les deux refs fusionnées.
  const menuRef = useRef<HTMLDivElement | null>(null)
  const [, setNudge] = useNudgeInside()
  const setMenuEl = useMergedRefs(setNudge, (el) => {
    menuRef.current = el as HTMLDivElement | null
  })

  const target = (m: MarkerData<T>) => {
    if (props.onTarget) {
      props.onTarget(m)
      return
    }
    engine.camera.flyTo(
      { lat: m.position.lat, lng: m.position.lng, altitude: altitudeForZoom(props.targetZoom ?? config.interaction.targetZoom) },
      { duration: theme.animations.target },
    )
  }

  // Clic ailleurs / molette / Échap : ferme le menu ouvert — mécanique partagée avec
  // les flyouts de barres. `wheel` parce que le menu est ancré à une ligne au-dessus
  // de la carte, `captureEscape` pour que la touche ne file pas aux raccourcis
  // globaux alors que l'utilisateur ne visait que ce menu.
  useDismiss(menuRef, menu !== null, closeMenu, { wheel: true, captureEscape: true })

  /**
   * Items du menu d'une ligne, pour `<ContextMenu>` — qui porte déjà le clavier
   * complet (roving tabindex, flèches, Entrée/Espace), l'ARIA et les sous-menus.
   *
   * « Cibler » est TOUJOURS en tête : c'est l'action propre à la liste (sur la carte,
   * le marker est déjà sous les yeux — pas besoin d'y voler). Le reste vient soit de
   * `menu`, soit d'`actions`.
   *
   * Les deux sources coexistent volontairement. `menu` rend exactement ce que rend le
   * menu du marker (sous-menus, séparateurs, `hint`, `swatch`) : c'est ce qu'il faut
   * pour que les deux surfaces proposent la MÊME chose. `MarkerListAction` reste pour
   * un menu plat, où un chemin @mdi est plus simple à fournir qu'un nœud ; il ne peut
   * pas, lui, exprimer « Assigner un agent › ».
   */
  const menuItemsFor = (m: MarkerData<T>): MenuItem[] => {
    const targetItem: MenuItem = {
      label: labels.markerList.target,
      icon: <UiIcon path={mdiCrosshairsGps} />,
      onSelect: () => target(m),
    }
    const provided = props.menu?.(m)
    if (provided) return provided.length > 0 ? [targetItem, { separator: true }, ...provided] : [targetItem]
    return [
      targetItem,
      ...(props.actions ?? []).map((a) => ({
        label: a.label,
        icon: a.icon ? <UiIcon path={a.icon} /> : undefined,
        onSelect: () => a.run(m),
      })),
    ]
  }

  // Ouvert sous le bouton ; `useNudgeInside` le rabat DANS le conteneur après
  // rendu, sur sa hauteur RÉELLE mesurée — pas sur une estimation calée sur le CSS
  // des items, qui dériverait au moindre changement de padding ou de police.
  const openMenu = (id: string | number, btn: HTMLElement) => {
    const rr = root?.getBoundingClientRect()
    if (!rr) return
    const r = btn.getBoundingClientRect()
    const width = 180
    const left = Math.min(r.right - rr.left - width, rr.width - width - 8)
    setMenu({ id, left: Math.max(8, left), top: r.bottom - rr.top + 2 })
  }

  return (
    <div className="m3d-mllist">
      {markers.map((m) => {
        const id = getId(m)
        const idStr = String(id)
        return (
          <div
            key={id}
            className="m3d-mlrow"
            role="button"
            tabIndex={0}
            onClick={() => target(m)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault()
                target(m)
              }
            }}
          >
            <Swatch avatar={m.avatar} icon={m.icon} color={markerColorOf(theme, m.type).base} />
            <div className="m3d-mltext">
              {/* `renderItem` décide de TOUT le titre, teinte comprise : la même règle
                  de précédence que `tooltip` face à `title`/`titleColor` sur la donnée
                  — la render-prop l'emporte, elle ne se fait pas colorer par surprise. */}
              <span
                className="m3d-mltitle"
                style={!props.renderItem && m.titleColor ? { color: m.titleColor } : undefined}
              >
                {props.renderItem ? props.renderItem(m) : (m.title ?? idStr)}
              </span>
              {(() => {
                const sub = props.renderSubtitle
                  ? props.renderSubtitle(m)
                  : (props.markerTypeLabel?.(m.type) ?? m.type)
                return sub != null && sub !== '' ? <span className="m3d-mlsub">{sub}</span> : null
              })()}
            </div>
            <button
              type="button"
              className="m3d-mlact"
              aria-haspopup="menu"
              aria-label={formatLabel(labels.markerList.actions, { label: idStr })}
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => {
                e.stopPropagation()
                if (menu?.id === id) closeMenu()
                else openMenu(id, e.currentTarget)
              }}
            >
              <UiIcon path={mdiDotsHorizontal} />
            </button>
            {onRemove && (
              <button
                type="button"
                className="m3d-mlremove"
                aria-label={formatLabel(labels.markerList.remove, { label: idStr })}
                onPointerDown={(e) => e.stopPropagation()}
                onClick={(e) => {
                  e.stopPropagation()
                  onRemove(id)
                }}
              >
                <UiIcon path={mdiClose} />
              </button>
            )}
            {menu?.id === id &&
              root &&
              createPortal(
                <ContextMenu
                  items={menuItemsFor(m)}
                  onClose={closeMenu}
                  className="m3d-mlmenu"
                  style={{ left: menu.left, top: menu.top }}
                  panelRef={setMenuEl}
                />,
                root,
              )}
          </div>
        )
      })}
    </div>
  )
}

/**
 * Mémoïsée : la zone de la loupe se déplace/redimensionne à la cadence du pointeur
 * et re-rend son panneau à chaque frame, alors que la liste (N lignes × icônes) ne
 * change que quand l'inventaire change. Le `as typeof MarkerListInner` préserve le
 * paramètre de type, que `memo()` effacerait.
 *
 * Corollaire pour les appelants : passer des props d'identité STABLE
 * (`markers` mémoïsé, `getId`/`onRemove`/`actions` hissés ou en `useCallback`),
 * sinon le memo ne retient rien.
 */
export const MarkerList = memo(MarkerListInner) as typeof MarkerListInner
