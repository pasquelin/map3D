import { type ReactNode, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import type { PointerInterceptor } from '../../core/MapEngine'
import type { MarkerData } from '../../data/types'
import type { Bounds } from '../../shared'
import { GAP } from '../../style/panelGeometry'
import { DrawingContext, LensContext, type LensApi, useLabels, useMapContext } from '../context'
import { LensPanel } from './LensPanel'
import { LensZone } from './LensZone'
import type { LensAction, LensRect, LensRenderItem } from './lensTypes'

/** Cadre géo « monde » — repli quand les coins ne pickent pas (vue vers le ciel). */
const WORLD_BOUNDS: Bounds = { north: 85, south: -85, east: 180, west: -180 }
/** Drag minimal (px) pour valider une zone — en deçà, c'est un clic (efface). */
const MIN_DRAW = 6

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
  /** Actions déclaratives supplémentaires (par ligne et globales). */
  actions?: LensAction<T>[]
  /** Libellé lisible d'un type de marker (récap par type). */
  markerTypeLabel?: (type: string) => string
  /** Notifié quand la sélection dans la liste change. */
  onSelectionChange?: (markers: MarkerData<T>[]) => void
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
  const [inventory, setInventory] = useState<MarkerData<T>[]>([])
  const [selected, setSelected] = useState<Set<string | number>>(() => new Set())

  const activeRef = useRef(active)
  activeRef.current = active
  const rectRef = useRef(rect)
  rectRef.current = rect
  const invSigRef = useRef('')
  const scratch = useRef(new THREE.Vector3()).current
  const rafRef = useRef(0)
  const draftRef = useRef<{ x0: number; y0: number } | null>(null)
  const containerRectRef = useRef<DOMRect | null>(null)
  const latest = useRef({ getId, onSelectionChange: props.onSelectionChange })
  latest.current = { getId, onSelectionChange: props.onSelectionChange }

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
    // La sélection de liste ne garde que les markers encore présents.
    setSelected((prev) => {
      if (prev.size === 0) return prev
      const alive = new Set<string | number>()
      for (const m of found) {
        const id = latest.current.getId(m)
        if (prev.has(id)) alive.add(id)
      }
      return alive.size === prev.size ? prev : alive
    })
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

  // ── Tracé : intercepteur pointeur, ACTIF seulement tant qu'aucune zone n'existe.
  // Une fois la zone posée, la carte redevient navigable (overlay écran fixe).
  const drawing = active && rect === null
  const drawingRef = useRef(drawing)
  drawingRef.current = drawing

  const interceptor = useRef<PointerInterceptor>((phase, _ll, e) => {
    if (!container || !drawingRef.current) return false
    const rct = (containerRectRef.current ??= container.getBoundingClientRect())
    const px = { x: e.clientX - rct.left, y: e.clientY - rct.top }
    if (phase === 'down') {
      containerRectRef.current = container.getBoundingClientRect()
      draftRef.current = { x0: px.x, y0: px.y }
      setRect({ x: px.x, y: px.y, w: 0, h: 0 })
      return true
    }
    if (phase === 'move') {
      const d = draftRef.current
      if (d) setRect(norm(d.x0, d.y0, px.x, px.y))
      return true
    }
    const d = draftRef.current
    draftRef.current = null
    if (d) {
      const r = norm(d.x0, d.y0, px.x, px.y)
      setRect(r.w < MIN_DRAW && r.h < MIN_DRAW ? null : r)
    }
    return true
  }).current

  useEffect(() => {
    if (!drawing || !container) return
    engine.inputInterceptor = interceptor
    engine.setDrawing(true)
    container.classList.add('m3d-lensing')
    return () => {
      if (engine.inputInterceptor === interceptor) engine.inputInterceptor = null
      engine.setDrawing(false)
      container.classList.remove('m3d-lensing')
    }
  }, [drawing, engine, container, interceptor])

  // ── Activation / exclusivité avec le dessin ──
  const clearZone = useCallback(() => {
    setRect(null)
    setSelected(new Set())
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

  // ── Sélection de liste ──
  const onToggle = useCallback((id: string | number) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])
  const onSelectAll = useCallback(() => {
    setSelected(new Set(inventory.map((m) => latest.current.getId(m))))
  }, [inventory])
  const onClearSelection = useCallback(() => setSelected(new Set()), [])

  useEffect(() => {
    const sel = inventory.filter((m) => selected.has(latest.current.getId(m)))
    latest.current.onSelectionChange?.(sel)
  }, [selected, inventory])

  const api = useMemo<LensApi>(
    () => ({ active, hasZone: rect !== null, activate, deactivate, toggle }),
    [active, rect, activate, deactivate, toggle],
  )

  return (
    <LensContext.Provider value={api}>
      {props.children}
      {active && rect && (
        <>
          <LensZone rect={rect} onChange={setRect} onClose={clearZone} closeLabel={labels.lens.remove} />
          <LensPanel<T>
            markers={inventory}
            getId={getId}
            anchor={{ x: rect.x + rect.w + GAP, y: rect.y }}
            selected={selected}
            onToggle={onToggle}
            onSelectAll={onSelectAll}
            onClearSelection={onClearSelection}
            onClose={clearZone}
            renderItem={props.renderItem}
            actions={props.actions}
            markerTypeLabel={props.markerTypeLabel}
          />
        </>
      )}
    </LensContext.Provider>
  )
}
