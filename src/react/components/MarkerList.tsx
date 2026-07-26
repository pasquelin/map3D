import { mdiClose, mdiCrosshairsGps, mdiDotsHorizontal } from '@mdi/js'
import Icon from '@mdi/react'
import { memo, type ReactNode, useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { altitudeForZoom } from '../../core/MapEngine'
import type { MarkerData } from '../../data/types'
import { formatLabel } from '../../labels/mergeLabels'
import type { MapTheme } from '../../theme/types'
import { useLabels, useMapContext } from '../context'
import { useNudgeInside } from './panelFit'

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
  /** Rendu du **titre** (1ʳᵉ ligne) — défaut : l'id. */
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
 * 1 ligne par marker, langage visuel commun. Chaque ligne — pastille/avatar +
 * titre/sous-titre, menu d'actions déroulant (« Cibler » + extensions), croix
 * (option). Clic sur la ligne = cibler (vol caméra par défaut). Le menu est rendu
 * en PORTAL dans `.m3d-root` pour ne pas être rogné par le scroll de la liste.
 */
function MarkerListInner<T = unknown>(props: MarkerListProps<T>) {
  const { markers, getId, onRemove } = props
  const { engine, theme, overlay } = useMapContext()
  const labels = useLabels()
  const root = overlay.parentElement
  const [menu, setMenu] = useState<{ id: string | number; left: number; top: number } | null>(null)
  const [, setMenuEl] = useNudgeInside()

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

  // Clic ailleurs / molette / Échap : ferme le menu ouvert. Échap est capté en
  // CAPTURE et stoppé net : sinon il traverse jusqu'aux raccourcis globaux (sortie
  // d'outil, retrait de la zone loupe) alors que l'utilisateur ne visait que le menu.
  useEffect(() => {
    if (!menu) return
    const close = () => setMenu(null)
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      e.stopPropagation()
      setMenu(null)
    }
    window.addEventListener('pointerdown', close)
    window.addEventListener('wheel', close, { passive: true })
    window.addEventListener('keydown', onKey, true)
    return () => {
      window.removeEventListener('pointerdown', close)
      window.removeEventListener('wheel', close)
      window.removeEventListener('keydown', onKey, true)
    }
  }, [menu])

  const actionsFor = (): MarkerListAction<T>[] => [
    { id: 'target', label: labels.markerList.target, icon: mdiCrosshairsGps, run: target },
    ...(props.actions ?? []),
  ]

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
            <Swatch m={m} theme={theme} />
            <div className="m3d-mltext">
              <span className="m3d-mltitle">{props.renderItem ? props.renderItem(m) : idStr}</span>
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
                  ref={setMenuEl}
                  className="m3d-menu-panel m3d-mlmenu"
                  role="menu"
                  style={{ left: menu.left, top: menu.top }}
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={(e) => e.stopPropagation()}
                  // Le portail est DOM-détaché mais reste enfant de la ligne dans
                  // l'arbre React : sans cette barrière, le clavier du menu remonte
                  // au `onKeyDown` de la ligne (qui cible le marker).
                  onKeyDown={(e) => e.stopPropagation()}
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
                        if (e.key !== 'Enter' && e.key !== ' ') return
                        // `preventDefault` : Espace ferait défiler la liste.
                        e.preventDefault()
                        e.stopPropagation()
                        a.run(m)
                        setMenu(null)
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
