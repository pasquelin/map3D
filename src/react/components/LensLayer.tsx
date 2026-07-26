import { type ReactNode, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { AnchorHeightCache } from '../../core/AnchorHeightCache'
import type { DragMode, PointerInterceptor } from '../../core/MapEngine'
import type { ScreenPoint } from '../../core/Projection'
import type { MarkerData } from '../../data/types'
import type { Bounds } from '../../shared'
import { GAP, LENS_PANEL_W } from '../../style/panelGeometry'
import { DrawingContext, LensContext, type LensApi, useLabels, useMapContext } from '../context'
import { LensPanel } from './LensPanel'
import { LensZone } from './LensZone'
import type { MarkerListAction } from './MarkerList'
import { inTextInput, plainKey } from './shortcuts'
import type { LensRect, LensRenderItem } from './lensTypes'

/** Cadre géo « monde » — repli quand les coins ne pickent pas (vue vers le ciel). */
const WORLD_BOUNDS: Bounds = { north: 85, south: -85, east: 180, west: -180 }
/** Glissé minimal (px) pour qu'un rectangle existe — en deçà, c'est un clic (rien). */
const MIN_DRAG = 4

/** Clé par défaut d'un marker. Hissée : identité stable → `MarkerList` reste mémoïsée. */
const defaultGetId = <T,>(m: MarkerData<T>): string | number => m.id

const norm = (x0: number, y0: number, x1: number, y1: number): LensRect => ({
  x: Math.min(x0, x1),
  y: Math.min(y0, y1),
  w: Math.abs(x1 - x0),
  h: Math.abs(y1 - y0),
})

export type LensLayerProps<T = unknown> = {
  /** Clé stable d'un marker (défaut : `m.id`). */
  getId?: (m: MarkerData<T>) => string | number
  /** Rendu d'une ligne (défaut : pastille de type + avatar + id). */
  renderItem?: LensRenderItem<T>
  /** Actions du menu déroulant d'une ligne, en plus de « Cibler » (extensible). */
  actions?: MarkerListAction<T>[]
  /** Libellé lisible d'un type de marker (récap par type). */
  markerTypeLabel?: (type: string) => string
  /** Raccourci clavier d'activation (lettre unique, insensible à la casse). Défaut `x`. `null` = aucun. */
  shortcut?: string | null
  /** Zoom du vol « Cibler » d'une ligne (défaut 17). */
  targetZoom?: number
  children?: ReactNode
}

/**
 * Outil **loupe** : trace une zone rectangulaire (fenêtre d'inspection écran) et
 * inventorie TOUS les markers qu'elle couvre — y compris ceux agrégés dans des
 * clusters (via `engine.markers`, données sources). Read-only : ne touche ni à la
 * carte ni aux formes. Le panneau de droite liste 1 ligne par marker, avec une
 * sélection de liste et des actions extensibles.
 *
 * Modèle d'interaction : tant que l'outil est actif, le glissé sur la carte est
 * capté par la loupe (pan gelé) — il trace la zone, et retracer remplace la zone
 * existante ; un clic simple la retire. La carte se navigue à la molette (zoom) et
 * à la barre espace (pan / rotation), comme pour les outils de dessin. La loupe est
 * un overlay écran fixe : la liste se recalcule quand la carte défile dessous.
 * Déplacer/redimensionner la zone (poignées) recalcule aussi. La croix la retire.
 *
 * Mutuellement exclusif avec les outils de dessin (activer l'un désactive l'autre).
 */
export function LensLayer<T = unknown>(props: LensLayerProps<T>) {
  const { engine, overlay } = useMapContext()
  const labels = useLabels()
  const draw = useContext(DrawingContext)
  const getId = props.getId ?? defaultGetId
  const container = overlay.parentElement as HTMLElement | null

  const [active, setActive] = useState(false)
  const [rect, setRect] = useState<LensRect | null>(null)
  /** Glissé en cours : on n'affiche que le marquee pointillé (pas encore le panneau). */
  const [drafting, setDrafting] = useState(false)
  const [inventory, setInventory] = useState<MarkerData<T>[]>([])
  /** Markers retirés de la liste par leur croix (réinitialisé à chaque nouvelle zone). */
  const [dismissed, setDismissed] = useState<Set<string | number>>(() => new Set())

  const activeRef = useRef(active)
  activeRef.current = active
  const rectRef = useRef(rect)
  rectRef.current = rect
  const invSigRef = useRef('')
  const scratch = useRef(new THREE.Vector3()).current
  const screenScratch = useRef<ScreenPoint>({ sx: 0, sy: 0, z: 0 }).current
  /**
   * Hauteurs d'ancre des markers — un marker se projette à la hauteur du sol SOUS
   * LUI, pas à celle du centre de la zone (sinon décalage écran sur relief, donc
   * faux positifs/négatifs près des bords). Mémoïsation, retentatives et
   * invalidation 2D/3D sont portées par le cache partagé ; ici on l'exploite en
   * **mode passe** : le jeu de markers scannés change à chaque recalcul (la zone
   * bouge), donc le cache se borne tout seul au jeu courant.
   */
  const heights = useRef<AnchorHeightCache | null>(null)
  heights.current ??= new AnchorHeightCache(engine.projection)
  const rafRef = useRef(0)
  const draftRef = useRef<{ x0: number; y0: number } | null>(null)
  const containerRectRef = useRef<DOMRect | null>(null)
  /** Barre espace maintenue : l'intercepteur ne consomme plus → la caméra bouge (pan/rotation). */
  const suspendedRef = useRef(false)
  const latest = useRef({ getId })
  latest.current = { getId }

  // ── Inventaire : rect écran → cadre géo grossier → markers sources → test écran ──
  const recompute = useCallback(() => {
    const r = rectRef.current
    if (!activeRef.current || !r || r.w < 1 || r.h < 1) {
      if (invSigRef.current !== '') {
        invSigRef.current = ''
        setInventory([])
      }
      return
    }
    const proj = engine.projection
    const cam = engine.threeCamera
    if (!proj.isReady()) return
    const corners: Array<[number, number]> = [
      [r.x, r.y],
      [r.x + r.w, r.y],
      [r.x + r.w, r.y + r.h],
      [r.x, r.y + r.h],
    ]
    let north = -Infinity
    let south = Infinity
    let east = -Infinity
    let west = Infinity
    let got = 0
    for (const [cx, cy] of corners) {
      const ll = proj.pickLatLng(cx, cy, cam) ?? proj.pickEllipsoidLatLng(cx, cy, cam)
      if (!ll) continue
      got++
      if (ll.lat > north) north = ll.lat
      if (ll.lat < south) south = ll.lat
      if (ll.lng > east) east = ll.lng
      if (ll.lng < west) west = ll.lng
    }
    let bounds: Bounds
    // Le cadre des coins n'est un MAJORANT de la zone au sol que si les QUATRE
    // pickent. Dès qu'un seul manque, le rectangle mord le ciel (vue inclinée) : la
    // portion visible court alors jusqu'à l'horizon, infiniment au-delà des coins
    // résolus — un cadre bâti sur eux exclurait presque tout. On retombe sur le
    // monde entier, le test écran exact plus bas fait seul le tri.
    if (got < corners.length) {
      bounds = WORLD_BOUNDS
    } else {
      // La perspective peut placer un marker « dans » le rect écran mais hors du
      // cadre des coins : on élargit, puis on raffine par test écran exact.
      const padLat = (north - south) * 0.25 + 1e-4
      const padLng = (east - west) * 0.25 + 1e-4
      bounds = { north: north + padLat, south: south - padLat, east: east + padLng, west: west - padLng }
    }
    // Ouvre la passe : purge d'epoch (bascule 2D/3D) et cadence des retentatives.
    const cache = heights.current!
    cache.beginPass()

    const found: MarkerData<T>[] = []
    for (const m of engine.markers.markersInBounds(bounds) as MarkerData<T>[]) {
      const id = latest.current.getId(m)
      const world = proj.latLngToWorld(m.position, scratch, cache.height(id, m.position))
      const s = proj.worldToScreen(world, cam, screenScratch)
      if (s.z > 1 || s.sx < r.x || s.sx > r.x + r.w || s.sy < r.y || s.sy > r.y + r.h) continue
      // Un marker de la face OPPOSÉE du globe se projette dans le rectangle en
      // traversant la Terre : même test d'horizon que la couche marker, sinon la
      // loupe inventorie des markers situés à l'autre bout du monde (vue dézoomée).
      if (!proj.isAboveHorizon(world, cam.position)) continue
      found.push(m)
    }
    // Adopte le cache de la passe : les markers sortis de la zone en tombent.
    cache.endPass()
    const sig = found.map((m) => latest.current.getId(m)).join('|')
    if (sig === invSigRef.current) return
    invSigRef.current = sig
    setInventory(found)
  }, [engine, scratch, screenScratch])

  const schedule = useCallback(() => {
    if (rafRef.current) return
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = 0
      recompute()
    })
  }, [recompute])

  // Recalcul quand la carte défile/zoome ou que les données changent.
  useEffect(() => {
    const offCam = engine.on('camera', schedule)
    const offItems = engine.markers.onItemsChanged(schedule)
    return () => {
      offCam()
      offItems()
      // rafRef DOIT être remis à 0 : un id périmé (non nettoyé) bloquerait tout
      // `schedule()` ultérieur (garde `if (rafRef.current) return`) — le recalcul
      // ne repartirait jamais après un re-montage d'effet (StrictMode inclus).
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current)
        rafRef.current = 0
      }
    }
  }, [engine, schedule])

  // Recalcul quand la zone est tracée / déplacée / redimensionnée / retirée.
  useEffect(() => {
    schedule()
  }, [rect, schedule])

  /**
   * Clôt un tracé en cours sans coordonnées de relâché (barre espace maintenue au
   * moment du `up`) : ce qui a déjà été étiré devient la zone, sauf si c'est sous le
   * seuil — auquel cas on abandonne, comme pour un clic simple. Idempotent.
   */
  const abortDraft = useCallback(() => {
    if (!draftRef.current) return
    draftRef.current = null
    setDrafting(false)
    const r = rectRef.current
    if (r && r.w < MIN_DRAG && r.h < MIN_DRAG) setRect(null)
  }, [])

  // ── Tracé du sélecteur : intercepteur actif tant que l'outil loupe est actif.
  // Un simple CLIC ne crée RIEN : le marquee pointillé n'apparaît qu'au glissé
  // (au-delà d'un seuil), et le panneau seulement au relâché. Un nouveau glissé
  // remplace la zone existante.
  const interceptor = useRef<PointerInterceptor>((phase, _ll, e) => {
    if (!container || !activeRef.current) return false
    // Barre espace : on laisse la molette/le drag à GlobeControls (pan / rotation).
    if (suspendedRef.current) {
      // Le `up` doit tout de même CLORE un tracé en cours : sinon `draftRef` reste
      // armé et, la barre espace relâchée, le moindre `move` SANS bouton continue
      // d'étirer le rectangle (bloqué en aperçu, ni poignées ni panneau).
      if (phase === 'up') abortDraft()
      return false
    }
    if (phase === 'down') {
      containerRectRef.current = container.getBoundingClientRect()
      const r0 = containerRectRef.current
      draftRef.current = { x0: e.clientX - r0.left, y0: e.clientY - r0.top }
      setDrafting(true)
      setDismissed(new Set()) // nouvelle zone → aucune ligne masquée
      return true // rien affiché tant qu'on n'a pas glissé
    }
    const rct = containerRectRef.current ?? container.getBoundingClientRect()
    const x = e.clientX - rct.left
    const y = e.clientY - rct.top
    if (phase === 'move') {
      const d = draftRef.current
      // Seuil : le marquee n'apparaît qu'à partir d'un vrai glissé (pas un micro-tremblement).
      if (d && (rectRef.current || Math.abs(x - d.x0) >= MIN_DRAG || Math.abs(y - d.y0) >= MIN_DRAG)) {
        setRect(norm(d.x0, d.y0, x, y))
      }
      return true
    }
    // up : valide la zone si un vrai rectangle a été tracé, sinon rien (clic simple).
    const d = draftRef.current
    draftRef.current = null
    setDrafting(false)
    if (d) {
      const r = norm(d.x0, d.y0, x, y)
      setRect(r.w < MIN_DRAG && r.h < MIN_DRAG ? null : r)
    }
    return true
  }).current

  useEffect(() => {
    if (!active || !container) return
    engine.inputInterceptor = interceptor
    engine.setDrawing(true)
    container.classList.add('m3d-lensing')
    return () => {
      // Le slot d'intercepteur est PARTAGÉ avec `DrawLayer`. Quand on passe de la
      // loupe à un outil de dessin, `setTool()` a déjà pris le slot et rétabli
      // `setDrawing(true)` AVANT que ce cleanup ne s'exécute (il est déclenché par
      // le re-render qui suit) : ne relâcher le mode dessin que si on possède
      // ENCORE le slot, sinon on dégèle le pan sous l'outil de dessin qui démarre.
      if (engine.inputInterceptor === interceptor) {
        engine.inputInterceptor = null
        engine.setDrawing(false)
      }
      container.classList.remove('m3d-lensing')
    }
  }, [active, engine, container, interceptor])

  // ── Activation / exclusivité avec le dessin ──
  const clearZone = useCallback(() => {
    setRect(null)
    setDismissed(new Set())
  }, [])
  const onRemoveRow = useCallback((id: string | number) => {
    setDismissed((prev) => new Set(prev).add(id))
  }, [])
  const deactivate = useCallback(() => {
    setActive(false)
    clearZone()
  }, [clearZone])
  const activate = useCallback(() => {
    draw?.setTool(null) // un outil de dessin actif est abandonné (exclusivité)
    setActive(true)
  }, [draw])
  const toggle = useCallback(() => {
    if (activeRef.current) deactivate()
    else activate()
  }, [activate, deactivate])

  // Activer un outil de dessin désactive la loupe (l'intercepteur est un slot unique).
  const drawTool = draw?.tool ?? null
  useEffect(() => {
    if (drawTool !== null && activeRef.current) deactivate()
  }, [drawTool, deactivate])

  // Échap : retire la zone si elle existe (prêt à retracer), sinon quitte l'outil.
  useEffect(() => {
    if (!active) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      if (rectRef.current) clearZone()
      else deactivate()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [active, clearZone, deactivate])

  // Raccourci clavier d'activation (défaut « x » — « f » est pris par le plein écran).
  // Ignoré dans un champ de saisie.
  const shortcut = props.shortcut === undefined ? 'x' : props.shortcut
  useEffect(() => {
    if (!shortcut) return
    const key = shortcut.toLowerCase()
    const onKey = (e: KeyboardEvent) => {
      if (plainKey(e) !== key) return // modificateurs / champ de saisie exclus
      e.preventDefault()
      toggle()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [shortcut, toggle])

  // Barre espace = pan caméra temporaire (l'intercepteur se suspend) ; Espace+Maj =
  // rotation. Même geste que les outils de dessin. Relâcher reprend la loupe.
  useEffect(() => {
    if (!active) return
    let held: { prevMode: DragMode } | null = null
    const release = () => {
      if (!held) return
      engine.setDrawingSuspended(false)
      engine.setDragMode(held.prevMode)
      suspendedRef.current = false
      container?.classList.remove('m3d-space-pan')
      held = null
    }
    const onDown = (e: KeyboardEvent) => {
      if (inTextInput(e)) return
      if (e.code === 'Space' && !e.repeat) {
        e.preventDefault()
        if (held) return
        held = { prevMode: engine.getDragMode() }
        engine.setDrawingSuspended(true)
        suspendedRef.current = true
        container?.classList.add('m3d-space-pan')
        if (e.shiftKey) engine.setDragMode('rotate')
      } else if (e.key === 'Shift' && held) {
        engine.setDragMode('rotate')
      }
    }
    const onUp = (e: KeyboardEvent) => {
      if (e.code === 'Space') release()
      else if (e.key === 'Shift' && held) engine.setDragMode(held.prevMode)
    }
    window.addEventListener('keydown', onDown)
    window.addEventListener('keyup', onUp)
    window.addEventListener('blur', release)
    return () => {
      release()
      window.removeEventListener('keydown', onDown)
      window.removeEventListener('keyup', onUp)
      window.removeEventListener('blur', release)
    }
  }, [active, engine, container])

  // Liste affichée = inventaire moins les lignes masquées par leur croix. Mémoïsée :
  // déplacer/redimensionner la zone re-rend ce composant à la cadence du pointeur,
  // et une nouvelle identité de tableau ferait re-rendre toute la `MarkerList`
  // (N lignes × icônes) alors que son contenu n'a pas bougé.
  const displayed = useMemo(
    () => (dismissed.size ? inventory.filter((m) => !dismissed.has(getId(m))) : inventory),
    [inventory, dismissed, getId],
  )

  const api = useMemo<LensApi>(
    () => ({ active, activate, deactivate, toggle, shortcut }),
    [active, activate, deactivate, toggle, shortcut],
  )

  // Panneau à droite de la zone par défaut, basculé à gauche seulement si la droite
  // ne tient pas ET que la gauche tient (le clamp de useDraggablePanel garantit
  // ensuite le maintien à l'écran). Largeur partagée avec la feuille de styles.
  const PANEL_W = LENS_PANEL_W + GAP
  const cw = container?.clientWidth ?? 0
  const fitsRight = rect != null && rect.x + rect.w + GAP + PANEL_W <= cw
  const fitsLeft = rect != null && rect.x - GAP - PANEL_W >= 0
  const anchor =
    rect == null
      ? { x: 0, y: 0 }
      : fitsRight || !fitsLeft
        ? { x: rect.x + rect.w + GAP, y: rect.y }
        : { x: rect.x - GAP - PANEL_W, y: rect.y }

  return (
    <LensContext.Provider value={api}>
      {props.children}
      {/* Pendant le glissé : seulement le cadre (aucune action encore). */}
      {active && rect && drafting && <LensZone rect={rect} preview />}
      {/* Zone validée (relâché) : poignées, croix et panneau d'inventaire. */}
      {active && rect && !drafting && (
        <>
          <LensZone rect={rect} onChange={setRect} onClose={clearZone} closeLabel={labels.lens.remove} />
          <LensPanel<T>
            markers={displayed}
            getId={getId}
            anchor={anchor}
            onRemove={onRemoveRow}
            onClose={clearZone}
            renderItem={props.renderItem}
            actions={props.actions}
            targetZoom={props.targetZoom}
            markerTypeLabel={props.markerTypeLabel}
          />
        </>
      )}
    </LensContext.Provider>
  )
}
