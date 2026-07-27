import { mdiChevronUp } from '@mdi/js'
import { Fragment, type ReactNode, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { altitudeForZoom } from '../../core/MapEngine'
import type { DragPayload } from '../../core/DragRegistry'
import type { LatLng } from '../../shared'
import type { MapTheme } from '../../theme/types'
import { useLabels, useMapContext } from '../context'
import { useDraggable } from '../hooks/useDraggable'
import { hasTipContent, MarkerTip } from './MarkerTip'
import { RemoveButton } from './RemoveButton'
import { useDropZone } from '../hooks/useDropZone'
import { markerColorOf } from '../../theme/colors'

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
  /**
   * Couleur explicite du carré, prioritaire sur celle déduite du `type`. Pour un
   * élément dont la couleur ne vient pas du thème de la carte — la catégorie d'un
   * symbole de catalogue, par exemple.
   */
  color?: string
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
  /**
   * Nouvel ordre après qu'un épinglé a été glissé À L'INTÉRIEUR de la dock. Reçoit
   * la liste complète des ids dans l'ordre voulu — à répercuter dans votre stockage,
   * la dock restant contrôlée. Absent : les pastilles ne se réordonnent pas.
   */
  onReorder?: (ids: Array<string | number>) => void
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
  /** Dock repliée au montage (l'utilisateur la redéploie d'un clic). Défaut `false`. */
  defaultCollapsed?: boolean
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

  // Props lues au vol par les callbacks (zone de dépôt, fin de drag) : leurs
  // abonnements restent stables alors qu'ils voient toujours l'état courant.
  const latest = useRef(props)
  latest.current = props

  const listRef = useRef<HTMLDivElement>(null)
  const { dropProps, isOver } = useDropZone({
    id: zoneId,
    accept: (p) => (props.accept ? props.accept(p) : p.type === 'marker'),
    onDrop: (p, point) => {
      const items = latest.current.items
      const deja = items.findIndex((it) => String(it.id) === String(p.id))
      // Charge venue d'ailleurs (un marker de la carte) : c'est un ajout.
      if (deja < 0) {
        latest.current.onPin(p as DragPayload<T>)
        return
      }
      // Déjà épinglé et relâché dans la dock : c'est un déplacement dans l'ordre.
      const reorder = latest.current.onReorder
      if (!reorder) return
      const raw = insertionIndex(pinCenters(listRef.current), point.x)
      if (raw === null) return
      const cible = finalIndex(raw, deja)
      if (cible === deja) return
      const ids = items.map((it) => it.id)
      const [bouge] = ids.splice(deja, 1)
      ids.splice(cible, 0, bouge!)
      reorder(ids)
    },
  })

  /**
   * Réordonnancement en cours : index visuel où la pastille sera insérée, et id de
   * celle qu'on déplace. Sert à ouvrir un ESPACE à la destination — sans ce retour,
   * on relâche à l'aveugle.
   */
  const [reorder, setReorder] = useState<{ index: number; id: string | number } | null>(null)
  const centersRef = useRef<number[]>([])
  useEffect(() => {
    return engine.drag.onChange(() => {
      const st = engine.drag.active
      const items = latest.current.items
      if (!st || st.overZone !== zoneId || !latest.current.onReorder) {
        setReorder(null)
        centersRef.current = []
        return
      }
      const from = items.findIndex((it) => String(it.id) === String(st.payload.id))
      if (from < 0) {
        setReorder(null)
        return
      }
      if (centersRef.current.length === 0) centersRef.current = pinCenters(listRef.current)
      const raw = insertionIndex(centersRef.current, st.x)
      // Mise à jour SEULEMENT si l'index change : un objet neuf à chaque
      // `pointermove` re-rendrait la dock en continu, React ne pouvant pas
      // court-circuiter sur une nouvelle référence.
      setReorder((prev) => {
        if (raw === null) return prev === null ? prev : null
        const id = st.payload.id
        return prev && prev.index === raw && prev.id === id ? prev : { index: raw, id }
      })
    })
  }, [engine, zoneId])

  // Dock vide : masquée au repos, révélée UNIQUEMENT pendant un drag (cible pour
  // le tout premier marker). Dès qu'un favori existe, elle reste visible.
  const [dragActive, setDragActive] = useState(false)
  useEffect(() => engine.drag.onChange(() => setDragActive(engine.drag.active !== null)), [engine])

  // Repli/déploiement de la dock (état purement UI). Repliée, elle se réduit à une
  // pastille — mais reste une cible de dépôt (dropProps), pour épingler sans déployer.
  const [collapsed, setCollapsed] = useState(props.defaultCollapsed ?? false)

  // Glisser-hors = retrait : un épinglé relâché ailleurs que sur la dock est
  // retiré. Un drop SUR la dock (`droppedZone === zoneId`) est un re-épinglage
  // no-op. Valeurs lues au vol (refs) → abonnement stable.
  useEffect(() => {
    return engine.drag.onEnd((end) => {
      if (end.droppedZone === zoneId) return
      const id = end.payload.id
      if (latest.current.items.some((it) => it.id === id)) latest.current.onUnpin(id)
    })
  }, [engine, zoneId])

  // Rien à montrer : ni favori, ni drag en cours.
  if (props.items.length === 0 && !dragActive) return null

  // Les DEUX états vivent dans le même arbre : la barre ne se démonte pas, elle
  // coulisse sous le bord de la carte, et la poignée ronde la suit. Monter deux
  // éléments distincts (comme avant) interdisait toute continuité — l'un
  // disparaissait, l'autre apparaissait.
  //
  // La poignée porte `dropProps` en plus de la barre : les deux résolvent la même
  // zone (le hit-test remonte au plus proche `data-m3d-drop`), donc on épingle par
  // dépôt même repliée, sans avoir à déployer.
  return (
    <div className={`m3d-pindock-wrap${collapsed ? ' m3d-collapsed' : ''}${isOver ? ' m3d-pindock-over' : ''}`}>
      <button
        type="button"
        className="m3d-pindock-toggle"
        {...dropProps}
        onClick={() => setCollapsed((c) => !c)}
        aria-label={collapsed ? labels.pinned.expand : labels.pinned.collapse}
        aria-expanded={!collapsed}
      >
        {/* Un seul chevron, qui pivote : vers le bas il referme, vers le haut il
            rouvre. Deux icônes échangées sauteraient au lieu de tourner. */}
        <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden className="m3d-pindock-chev">
          <path d={mdiChevronUp} fill="currentColor" />
        </svg>
        {/* Compteur et nom sont TOUJOURS montés, et c'est le CSS qui les déplie avec
            la poignée : montés à la bascule, ils feraient sauter sa largeur au lieu
            de l'accompagner. Repliée, la poignée est le seul élément visible — sans
            eux, on ignore et ce qu'elle rouvre, et combien elle contient. */}
        {props.items.length > 0 && <span className="m3d-pindock-count">{props.items.length}</span>}
        <span className="m3d-pindock-name">{labels.pinned.title}</span>
      </button>
      <div className="m3d-pindock" {...dropProps} aria-hidden={collapsed}>
        <div className="m3d-pindock-add" style={{ width: size, height: size }} aria-hidden={props.items.length > 0}>
          <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden>
            <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" fill="none" />
          </svg>
          <span className="m3d-pindock-addlabel">{addLabel}</span>
        </div>
        {props.items.length > 0 && (
          <div className="m3d-pindock-items" ref={listRef}>
            {props.items.map((item, i) => (
              <Fragment key={item.id}>
                {reorder?.index === i && <span className="m3d-pin-slot" style={{ width: size, height: size }} aria-hidden />}
                <PinnedPin
                  item={item}
                  dimmed={reorder != null && String(reorder.id) === String(item.id)}
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
              </Fragment>
            ))}
            {reorder != null && reorder.index >= props.items.length && (
              <span className="m3d-pin-slot" style={{ width: size, height: size }} aria-hidden />
            )}
          </div>
        )}
      </div>
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
  /** Pastille en cours de déplacement dans la dock : atténuée, sa place étant montrée ailleurs. */
  dimmed?: boolean
}

/**
 * Abscisses des MILIEUX des pastilles. Relevées une seule fois par geste : les lire
 * à chaque `pointermove` forcerait un recalcul de layout par pastille et par
 * mouvement, alors que les positions ne bougent pas pendant le déplacement.
 */
function pinCenters(list: HTMLElement | null): number[] {
  if (!list) return []
  return [...list.querySelectorAll<HTMLElement>('.m3d-pin')].map((el) => {
    const r = el.getBoundingClientRect()
    return r.left + r.width / 2
  })
}

/**
 * Index d'insertion d'une pastille relâchée à l'abscisse `x`, d'après la position
 * réelle des pastilles à l'écran : on compte celles dont le MILIEU est à gauche du
 * point de dépôt. L'index de départ est retiré du compte par l'appelant, sinon
 * glisser une pastille d'un cran vers la droite la laisserait sur place.
 */
function insertionIndex(centers: readonly number[], x: number): number | null {
  if (centers.length === 0) return null
  let index = 0
  for (let i = 0; i < centers.length; i++) if (x > centers[i]!) index = i + 1
  return index
}

/**
 * Index FINAL dans la collection, une fois l'élément déplacé retiré de sa place.
 * Sans cette correction, glisser une pastille d'un seul cran vers la droite la
 * laisserait exactement où elle était.
 */
const finalIndex = (raw: number, from: number): number => (raw > from ? raw - 1 : raw)

/** Carré épinglé : cliquable (retrouver) + saisissable (glisser-hors = retrait) + croix + infobulle au survol. */
function PinnedPin<T>({ item, size, render, tooltip, removeLabel, onUnpin, onActivate, dimmed }: PinnedPinProps<T>) {
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
        {/* Même bouton que partout ailleurs : glisser hors de la dock supprime, et
            l'indice doit le dire avec le vocabulaire visuel de la suppression. */}
        <span className="m3d-pin-remove-hint">
          <RemoveButton label={removeLabel} withText onRemove={() => undefined} />
        </span>
      </>
    ),
  })

  return (
    <div
      ref={pinRef}
      className={`m3d-pin ${drag.className}${dimmed ? ' m3d-pin-moving' : ''}`}
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
      {tipPos && hasTipContent(tip) && root
        ? createPortal(
            <MarkerTip
              title={tip?.title}
              content={tip?.content}
              className="m3d-pin-tip"
              style={{ left: tipPos.left, top: tipPos.top }}
            />,
            root,
          )
        : null}
      <RemoveButton label={removeLabel} className="m3d-pin-x" onRemove={() => onUnpin(item.id)} />
    </div>
  )
}

/** Rendu par défaut d'un carré : avatar (rempli) > icône sur fond du type > initiale. */
function DefaultPin<T>({ item, theme }: { item: PinnedItem<T>; theme: MapTheme }) {
  if (item.avatar) return <img className="m3d-pin-media" src={item.avatar} alt="" draggable={false} />
  const color = markerColorOf(theme, item.type ?? 'default')
  // Couleur explicite : dégradé ASSOMBRI à partir d'elle. Le contenu posé dessus
  // porte souvent la même teinte (un symbole MIL-STD est coloré par son affiliation) ;
  // un fond clair de cette teinte le rendrait invisible.
  const bg = item.color
    ? `linear-gradient(180deg, ${item.color}, color-mix(in srgb, ${item.color} 45%, #000))`
    : `linear-gradient(180deg, ${color.accent}, ${color.base})`
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
