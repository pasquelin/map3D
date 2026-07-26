import { mdiClose, mdiCrosshairsGps, mdiDotsHorizontal } from '@mdi/js'
import Icon from '@mdi/react'
import { type ReactNode, useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { altitudeForZoom } from '../../core/MapEngine'
import type { MarkerData } from '../../data/types'
import { formatLabel } from '../../labels/mergeLabels'
import type { MapTheme } from '../../theme/types'
import { useLabels, useMapContext } from '../context'

/** Action du menu déroulant d'une ligne (extensible). */
export type MarkerListAction<T = unknown> = {
  id: string
  label: string
  /** Chemin d'icône @mdi/js (optionnel). */
  icon?: string
  run: (marker: MarkerData<T>) => void
}

export type MarkerListProps<T = unknown> = {
  markers: MarkerData<T>[]
  getId: (m: MarkerData<T>) => string | number
  /**
   * Rendu du **libellé** d'une ligne (après la pastille/avatar, toujours affichée).
   * Défaut : l'id. Retourner un `<span className="m3d-mllabel">…</span>` pour occuper
   * la place et ellipser proprement.
   */
  renderItem?: (m: MarkerData<T>) => ReactNode
  /** Croix de retrait par ligne (masquée si absent) : désélectionne / retire. */
  onRemove?: (id: string | number) => void
  /** Clic sur la ligne / action « Cibler ». Défaut : vol caméra vers le marker. */
  onTarget?: (m: MarkerData<T>) => void
  /** Zoom du vol « cibler » (défaut 17). */
  targetZoom?: number
  /** Actions du menu déroulant, en plus de « Cibler ». */
  actions?: MarkerListAction<T>[]
}

/** Pastille de couleur du type (ou avatar cerclé) — toujours présente sur une ligne. */
function Swatch<T>({ m, theme }: { m: MarkerData<T>; theme: MapTheme }) {
  const color = theme.colors.marker[m.type] ?? theme.colors.marker.default!
  return m.avatar ? (
    <img className="m3d-mlavatar" src={m.avatar} alt="" draggable={false} style={{ borderColor: color.base }} />
  ) : (
    <span className="m3d-mldot" style={{ background: color.base }} />
  )
}

/**
 * Liste de markers **partagée** par le panneau de sélection et la loupe :
 * 1 ligne par marker, langage visuel commun. Chaque ligne — case à cocher (option),
 * pastille/avatar + libellé, menu d'actions déroulant (« Cibler » + extensions),
 * croix (option). Clic sur la ligne = cibler (vol caméra par défaut). Le menu est
 * rendu en PORTAL dans `.m3d-root` pour ne pas être rogné par le scroll de la liste.
 */
export function MarkerList<T = unknown>(props: MarkerListProps<T>) {
  const { markers, getId, onRemove } = props
  const { engine, theme, overlay } = useMapContext()
  const labels = useLabels()
  const root = overlay.parentElement
  const [menu, setMenu] = useState<{ id: string | number; left: number; top: number } | null>(null)

  const target = (m: MarkerData<T>) => {
    if (props.onTarget) {
      props.onTarget(m)
      return
    }
    engine.camera.flyTo(
      { lat: m.position.lat, lng: m.position.lng, altitude: altitudeForZoom(props.targetZoom ?? 17) },
      { duration: 0.8 },
    )
  }

  // Clic ailleurs / molette : ferme le menu ouvert.
  useEffect(() => {
    if (!menu) return
    const close = () => setMenu(null)
    window.addEventListener('pointerdown', close)
    window.addEventListener('wheel', close, { passive: true })
    return () => {
      window.removeEventListener('pointerdown', close)
      window.removeEventListener('wheel', close)
    }
  }, [menu])

  const openMenu = (id: string | number, btn: HTMLElement) => {
    const rr = root?.getBoundingClientRect()
    if (!rr) return
    const r = btn.getBoundingClientRect()
    const width = 180
    const left = Math.min(r.right - rr.left - width, rr.width - width - 8)
    setMenu({ id, left: Math.max(8, left), top: r.bottom - rr.top + 2 })
  }

  const actionsFor = (): MarkerListAction<T>[] => [
    { id: 'target', label: labels.markerList.target, icon: mdiCrosshairsGps, run: target },
    ...(props.actions ?? []),
  ]

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
            <Swatch m={m} theme={theme} />
            {props.renderItem ? props.renderItem(m) : <span className="m3d-mllabel">{idStr}</span>}
            <button
              type="button"
              className="m3d-mlact"
              aria-haspopup="menu"
              aria-label={formatLabel(labels.markerList.actions, { label: idStr })}
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => {
                e.stopPropagation()
                if (menu?.id === id) setMenu(null)
                else openMenu(id, e.currentTarget)
              }}
            >
              <Icon path={mdiDotsHorizontal} size={0.7} />
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
                <Icon path={mdiClose} size={0.6} />
              </button>
            )}
            {menu?.id === id &&
              root &&
              createPortal(
                <div
                  className="m3d-menu-panel m3d-mlmenu"
                  role="menu"
                  style={{ left: menu.left, top: menu.top }}
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={(e) => e.stopPropagation()}
                >
                  {actionsFor().map((a) => (
                    <div
                      key={a.id}
                      className="m3d-menu-item"
                      role="menuitem"
                      tabIndex={0}
                      onClick={() => {
                        a.run(m)
                        setMenu(null)
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          a.run(m)
                          setMenu(null)
                        }
                      }}
                    >
                      {a.icon && (
                        <span className="m3d-menu-icon">
                          <Icon path={a.icon} size={0.7} />
                        </span>
                      )}
                      <span className="m3d-menu-label">{a.label}</span>
                    </div>
                  ))}
                </div>,
                root,
              )}
          </div>
        )
      })}
    </div>
  )
}
