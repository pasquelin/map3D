import { type ReactNode, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { altitudeForZoom } from '../../core/MapEngine'
import type { DragPayload } from '../../core/DragRegistry'
import type { LatLng } from '../../shared'
import type { MapTheme } from '../../theme/types'
import { useLabels, useMapContext } from '../context'
import { useDraggable } from '../hooks/useDraggable'
import { useDropZone } from '../hooks/useDropZone'

/**
 * Élément épinglé à afficher dans la dock. **Résolu par le consommateur** depuis
 * ses ids stockés (localStorage) et ses données courantes : la lib ne persiste
 * rien (composant contrôlé). `position` alimente le `flyTo` par défaut au clic.
 * `avatar`/`icon` pilotent le rendu par défaut de la pastille (avatar prioritaire,
 * il remplit le carré) ; `data` est repassé tel quel à `renderPin`/`onPinClick`.
 */
export type PinnedItem<T = unknown> = {
  id: string | number
  position?: LatLng
  /** Type/catégorie → couleur du carré par défaut (`theme.colors.marker[type]`). */
  type?: string
  /** Libellé accessible + initiale de la pastille par défaut. */
  label?: string
  /** Photo/avatar : remplit le carré (object-fit cover) dans le rendu par défaut. */
  avatar?: string
  /** Icône (URL / data-URI) centrée sur le carré coloré quand il n'y a pas d'avatar. */
  icon?: string
  data?: T
}

export type PinnedDockProps<T = unknown> = {
  /** Éléments épinglés (dérivés des ids stockés côté consommateur). */
  items: PinnedItem<T>[]
  /** Un marker a été **déposé** dans la dock : le consommateur ajoute l'id à son stockage. */
  onPin: (payload: DragPayload<T>) => void
  /** Un épinglé a été **retiré** (croix, ou glissé hors de la dock). */
  onUnpin: (id: string | number) => void
  /** Clic sur une pastille — émis **en plus** de l'action par défaut (flyTo). */
  onPinClick?: (item: PinnedItem<T>) => void
  /** `flyTo` vers l'élément au clic (défaut `true`). `false` = seul `onPinClick` est émis. */
  flyOnClick?: boolean
  /** Zoom cible du `flyTo` au clic (défaut 16). Ignoré si `flyAltitude` est fourni. */
  flyZoom?: number
  /** Altitude cible du `flyTo` (m au-dessus de l'ellipsoïde) — prioritaire sur `flyZoom`. */
  flyAltitude?: number
  /** Charges recevables. Défaut : `payload.type === 'marker'`. */
  accept?: (payload: DragPayload) => boolean
  /** Rendu custom d'une pastille (défaut : carré avatar/icône coloré par le type). */
  renderPin?: (item: PinnedItem<T>) => ReactNode
  /**
   * Infobulle au survol d'une pastille (title/content ReactNode), affichée
   * au-dessus — même langage que l'infobulle des markers. `null` = pas d'infobulle.
   */
  tooltip?: (item: PinnedItem<T>) => { title?: ReactNode; content?: ReactNode } | null
  /** Id de la zone de dépôt (distinct si plusieurs docks cohabitent). Défaut `m3d-pinned`. */
  zoneId?: string
  /** Côté (px) des carrés. Défaut 64. */
  size?: number
}

/**
 * Dock des **favoris épinglés**, ancrée en bas à gauche façon dock macOS : une
 * languette « + Ajouter » toujours visible sert de cible de dépôt, et les
 * pastilles déposées s'y accumulent (la barre s'élargit). Composant **contrôlé** —
 * la lib émet `onPin`/`onUnpin`/`onPinClick` et reçoit `items` en props ; le
 * stockage (localStorage) reste au consommateur. Premier consommateur du
 * drag-and-drop générique (`engine.drag`).
 *
 * Chaque pastille est un carré (l'avatar le remplit), cliquable (`flyTo` +
 * `onPinClick`), retirable par la croix en haut-droite **ou** en la glissant hors
 * de la dock — un tooltip « Supprimer » apparaît alors au-dessus du curseur.
 */
export function PinnedDock<T = unknown>(props: PinnedDockProps<T>) {
  const { engine } = useMapContext()
  const labels = useLabels()
  const zoneId = props.zoneId ?? 'm3d-pinned'
  const size = props.size ?? 64
  // Textes traduisibles : uniquement via le système de labels (i18n), comme le
  // reste de la lib — surchargeables par `<MapProvider labels>`.
  const addLabel = labels.pinned.add
  const removeLabel = labels.pinned.remove

  const { dropProps, isOver } = useDropZone({
    id: zoneId,
    accept: (p) => (props.accept ? props.accept(p) : p.type === 'marker'),
    onDrop: (p) => props.onPin(p as DragPayload<T>),
  })

  // Dock vide : masquée au repos, révélée UNIQUEMENT pendant un drag (cible pour
  // le tout premier marker). Dès qu'un favori existe, elle reste visible.
  const [dragActive, setDragActive] = useState(false)
  useEffect(() => engine.drag.onChange(() => setDragActive(engine.drag.active !== null)), [engine])

  // Glisser-hors = retrait : un épinglé relâché ailleurs que sur la dock est
  // retiré. Un drop SUR la dock (`droppedZone === zoneId`) est un re-épinglage
  // no-op. Valeurs lues au vol (refs) → abonnement stable.
  const latest = useRef(props)
  latest.current = props
  useEffect(() => {
    return engine.drag.onEnd((end) => {
      if (end.droppedZone === zoneId) return
      const id = end.payload.id
      if (latest.current.items.some((it) => it.id === id)) latest.current.onUnpin(id)
    })
  }, [engine, zoneId])

  // Rien à montrer : ni favori, ni drag en cours.
  if (props.items.length === 0 && !dragActive) return null

  return (
    <div className={`m3d-pindock${isOver ? ' m3d-pindock-over' : ''}`} {...dropProps}>
      <div className="m3d-pindock-add" style={{ width: size, height: size }} aria-hidden={props.items.length > 0}>
        <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden>
          <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" fill="none" />
        </svg>
        <span className="m3d-pindock-addlabel">{addLabel}</span>
      </div>
      {props.items.length > 0 && (
        <div className="m3d-pindock-items">
          {props.items.map((item) => (
            <PinnedPin
              key={item.id}
              item={item}
              size={size}
              render={props.renderPin}
              tooltip={props.tooltip}
              removeLabel={removeLabel}
              onUnpin={props.onUnpin}
              onActivate={() => {
                if (props.flyOnClick !== false && item.position) {
                  const alt = props.flyAltitude ?? altitudeForZoom(props.flyZoom ?? 16)
                  engine.camera.flyTo({ lat: item.position.lat, lng: item.position.lng, altitude: alt }, { duration: 0.8 })
                }
                props.onPinClick?.(item)
              }}
            />
          ))}
        </div>
      )}
    </div>
  )
}

type PinnedPinProps<T> = {
  item: PinnedItem<T>
  size: number
  render?: (item: PinnedItem<T>) => ReactNode
  tooltip?: (item: PinnedItem<T>) => { title?: ReactNode; content?: ReactNode } | null
  removeLabel: string
  onUnpin: (id: string | number) => void
  onActivate: () => void
}

/** Carré épinglé : cliquable (retrouver) + saisissable (glisser-hors = retrait) + croix + infobulle au survol. */
function PinnedPin<T>({ item, size, render, tooltip, removeLabel, onUnpin, onActivate }: PinnedPinProps<T>) {
  const { engine, overlay, theme } = useMapContext()
  const pinRef = useRef<HTMLDivElement>(null)
  const [tipPos, setTipPos] = useState<{ left: number; top: number } | null>(null)
  const content = render ? render(item) : <DefaultPin item={item} theme={theme} />
  const tip = tipPos ? tooltip?.(item) : null
  const root = overlay.parentElement
  // Légende en bas de la vignette : l'info « c'est quoi » lisible sans survoler.
  // Une seule ligne ; le texte trop long défile au survol (marquee CSS, cf. styles).
  const caption =
    item.label != null ? (
      <span className="m3d-pin-caption">
        <span className="m3d-pin-caption-clip">
          <span className="m3d-pin-caption-text">{item.label}</span>
        </span>
      </span>
    ) : null

  // Position de l'infobulle = au-dessus du centre haut de la pastille, en px
  // conteneur. Rendue en PORTAL dans .m3d-root (hors de la liste scrollable, qui
  // la rognerait). Ignorée pendant un drag : on survole des voisins pour déposer.
  const showTip = () => {
    if (engine.drag.active || !tooltip) return
    const el = pinRef.current
    const rr = root?.getBoundingClientRect()
    if (!el || !rr) return
    const r = el.getBoundingClientRect()
    setTipPos({ left: r.left - rr.left + r.width / 2, top: r.top - rr.top })
  }
  // Payload `marker` : un drop sur la dock reste un no-op ; un drop hors dock retire.
  // Le ghost embarque le carré + un tooltip « Supprimer » que le CSS ne montre que
  // hors d'une cible acceptée (`:not(.m3d-drag-over)`), façon dock macOS.
  const drag = useDraggable({
    payload: { type: 'marker', id: item.id, data: item.data },
    // Le ghost du pin s'affiche plus petit que celui d'un ajout depuis la carte :
    // la classe est déclarée ICI (pas reniflée depuis la couche générique).
    ghostClassName: 'm3d-drag-ghost-pin',
    ghost: (
      <>
        <div className="m3d-pin" style={{ width: size, height: size }}>
          {content}
          {caption}
        </div>
        <span className="m3d-pin-remove-hint">{removeLabel}</span>
      </>
    ),
  })

  return (
    <div
      ref={pinRef}
      className={`m3d-pin ${drag.className}`}
      style={{ width: size, height: size }}
      onPointerDown={drag.onPointerDown}
      onClick={onActivate}
      onPointerEnter={showTip}
      onPointerLeave={() => setTipPos(null)}
      role="button"
      tabIndex={0}
      aria-label={item.label ? String(item.label) : String(item.id)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onActivate()
        }
      }}
    >
      {content}
      {caption}
      {tipPos && tip && (tip.title != null || tip.content != null) && root
        ? createPortal(
            <div className="m3d-pin-tip" style={{ left: tipPos.left, top: tipPos.top }}>
              {tip.title != null && <div className="m3d-markertip-title">{tip.title}</div>}
              {tip.content != null && <div className="m3d-markertip-content">{tip.content}</div>}
            </div>,
            root,
          )
        : null}
      <button
        type="button"
        className="m3d-pin-x"
        aria-label={removeLabel}
        onPointerDown={(e) => e.stopPropagation()}
        onClick={(e) => {
          e.stopPropagation()
          onUnpin(item.id)
        }}
      >
        <svg viewBox="0 0 24 24" width="12" height="12" aria-hidden>
          <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" fill="none" />
        </svg>
      </button>
    </div>
  )
}

/** Rendu par défaut d'un carré : avatar (rempli) > icône sur fond du type > initiale. */
function DefaultPin<T>({ item, theme }: { item: PinnedItem<T>; theme: MapTheme }) {
  if (item.avatar) return <img className="m3d-pin-media" src={item.avatar} alt="" draggable={false} />
  const color = theme.colors.marker[item.type ?? 'default'] ?? theme.colors.marker.default!
  const bg = `linear-gradient(180deg, ${color.accent}, ${color.base})`
  if (item.icon) {
    return (
      <span className="m3d-pin-media m3d-pin-badge" style={{ background: bg }}>
        <img src={item.icon} alt="" draggable={false} />
      </span>
    )
  }
  return (
    <span className="m3d-pin-media m3d-pin-badge" style={{ background: bg, color: color.contrast }}>
      {item.label ? String(item.label)[0]!.toUpperCase() : ''}
    </span>
  )
}
