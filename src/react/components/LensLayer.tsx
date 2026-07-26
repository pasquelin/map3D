import { type ReactNode, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import type { DragMode, PointerInterceptor } from '../../core/MapEngine'
import type { MarkerData } from '../../data/types'
import type { Bounds } from '../../shared'
import { GAP } from '../../style/panelGeometry'
import { DrawingContext, LensContext, type LensApi, useLabels, useMapContext } from '../context'
import { LensPanel } from './LensPanel'
import { LensZone } from './LensZone'
import type { MarkerListAction } from './MarkerList'
import type { LensRect, LensRenderItem } from './lensTypes'

/** Cadre géo « monde » — repli quand les coins ne pickent pas (vue vers le ciel). */
const WORLD_BOUNDS: Bounds = { north: 85, south: -85, east: 180, west: -180 }
/** Glissé minimal (px) pour qu'un rectangle existe — en deçà, c'est un clic (rien). */
const MIN_DRAG = 4

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
 * Modèle d'interaction : tant qu'aucune zone n'existe, un glissé sur la carte la
 * trace (pan gelé). Une fois tracée, la carte redevient navigable — la loupe est
 * un overlay écran fixe et la liste se recalcule quand la carte défile dessous.
 * Déplacer/redimensionner la zone (poignées) recalcule aussi. La croix la retire.
 *
 * Mutuellement exclusif avec les outils de dessin (activer l'un désactive l'autre).
 */
export function LensLayer<T = unknown>(props: LensLayerProps<T>) {
  const { engine, overlay } = useMapContext()
  const labels = useLabels()
  const draw = useContext(DrawingContext)
  const getId = props.getId ?? ((m: MarkerData<T>) => m.id)
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
    if (got < 2) {
      bounds = WORLD_BOUNDS
    } else {
      // La perspective peut placer un marker « dans » le rect écran mais hors du
      // cadre des coins : on élargit, puis on raffine par test écran exact.
      const padLat = (north - south) * 0.25 + 1e-4
      const padLng = (east - west) * 0.25 + 1e-4
      bounds = { north: north + padLat, south: south - padLat, east: east + padLng, west: west - padLng }
    }
    const mid = proj.pickLatLng(r.x + r.w / 2, r.y + r.h / 2, cam) ?? proj.pickEllipsoidLatLng(r.x + r.w / 2, r.y + r.h / 2, cam)
    const height = mid ? proj.resolveAnchorHeight(mid) ?? proj.surfaceFallbackHeight : proj.surfaceFallbackHeight

    const found: MarkerData<T>[] = []
    for (const m of engine.markers.markersInBounds(bounds) as MarkerData<T>[]) {
      const world = proj.latLngToWorld(m.position, scratch, height)
      const s = proj.worldToScreen(world, cam)
      if (s.z <= 1 && s.sx >= r.x && s.sx <= r.x + r.w && s.sy >= r.y && s.sy <= r.y + r.h) found.push(m)
    }
    const sig = found.map((m) => latest.current.getId(m)).join('|')
    if (sig === invSigRef.current) return
    invSigRef.current = sig
    setInventory(found)
  }, [engine, scratch])

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

  // ── Tracé du sélecteur : intercepteur actif tant que l'outil loupe est actif.
  // Un simple CLIC ne crée RIEN : le marquee pointillé n'apparaît qu'au glissé
  // (au-delà d'un seuil), et le panneau seulement au relâché. Un nouveau glissé
  // remplace la zone existante.
  const interceptor = useRef<PointerInterceptor>((phase, _ll, e) => {
    if (!container || !activeRef.current) return false
    // Barre espace : on laisse la molette/le drag à GlobeControls (pan / rotation).
    if (suspendedRef.current) return false
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
      if (engine.inputInterceptor === interceptor) engine.inputInterceptor = null
      engine.setDrawing(false)
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
      if (e.key.toLowerCase() !== key || e.metaKey || e.ctrlKey || e.altKey) return
      const t = e.target as HTMLElement | null
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return
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
    const inTextInput = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null
      return !!t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)
    }
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

  // Liste affichée = inventaire moins les lignes masquées par leur croix.
  const displayed = dismissed.size ? inventory.filter((m) => !dismissed.has(getId(m))) : inventory

  const api = useMemo<LensApi>(
    () => ({ active, hasZone: rect !== null, activate, deactivate, toggle, shortcut }),
    [active, rect, activate, deactivate, toggle, shortcut],
  )

  // Panneau à droite de la zone, basculé à gauche si le bord droit est trop proche
  // (le clamp de useDraggablePanel garantit ensuite le maintien à l'écran).
  const PANEL_W = 264
  const cw = container?.clientWidth ?? 0
  const anchor =
    rect == null
      ? { x: 0, y: 0 }
      : rect.x + rect.w + GAP + PANEL_W <= cw || rect.x - GAP - PANEL_W < 0
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
