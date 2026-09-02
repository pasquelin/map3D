import {
  type CameraState,
  type LatLng,
  type MapHandle,
  type MarkerData,
  type Viewport,
  boundsOfLatLngs,
  boundsOfMarkers,
  useCameraCommands,
  useCapture,
  useConfig,
  useLens,
  useMapEvents,
  useRelations,
  useTags,
  useViewport,
  useZoomGate,
  zoomForAltitude,
} from '@pasquelin/map3d'
import { type RefObject, useEffect, useRef } from 'react'

import type { AnyData } from '../data/types'
import type { HooksFeed } from '../hooks/hooksFeed'

/**
 * Cadence d'affichage de la position caméra. L'événement `camera` part à CHAQUE frame de
 * mouvement : rafraîchir l'onglet à ce rythme donnerait des chiffres illisibles. ~4 Hz suffit.
 */
const CAMERA_REFRESH_MS = 250

const coord = (p: LatLng) => `${p.lat.toFixed(5)}, ${p.lng.toFixed(5)}`

/** Télécharge un `Blob` sous `filename` — même précaution que la lib : l'URL n'est révoquée qu'au tick suivant. */
function download(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url))
}

type HooksBridgeProps = {
  feed: HooksFeed
  /** Poignée de la carte, passée par REF : lue au clic, jamais capturée. */
  handle: RefObject<MapHandle | null>
  /** Markers de la scène, lus à l'appel — en dépendre re-rendrait le pont à chaque tick du flux. */
  getMarkers: () => readonly MarkerData<AnyData>[]
  /** La loupe n'est montée qu'avec la barre : `useLens()` jetterait sans elle. */
  lens: boolean
  /** Idem pour le moteur de relations (`useRelations()` exige la prop `relations`). */
  relations: boolean
}

/**
 * Composant SANS rendu, enfant de `<Map>` : c'est la seule position d'où les hooks de
 * contexte (`useViewport`, `useMapEvents`, `useTags`, `useCapture`, `useZoomGate`,
 * `useCameraCommands`) atteignent le moteur. Il écrit ce qu'ils donnent dans `feed`, que
 * l'onglet « Hooks » du banc d'essai (Tweakpane, hors de la carte) affiche et actionne.
 * La poignée `MapHandle` vient de l'extérieur par ref : le chemin d'un bouton de dashboard.
 */
export function HooksBridge({ feed, handle, getMarkers, lens, relations }: HooksBridgeProps) {
  const { model } = feed

  // ── useViewport : la vue STABILISÉE (anti-rebond de `config.data.viewportDebounceMs`).
  useViewport((v: Viewport) => {
    const b = v.bounds
    model.viewport = `N ${b.north.toFixed(4)} · S ${b.south.toFixed(4)} · E ${b.east.toFixed(4)} · O ${b.west.toFixed(4)}`
    feed.notify()
  })

  // ── useMapEvents : caméra à chaque frame (ralentie à ~4 Hz) et clic sur la carte. Le
  // handler survit à ses renders : la dernière valeur attend dans une ref, le timer ne
  // publie que la plus récente.
  const pendingCamera = useRef<CameraState | null>(null)
  const cameraTimer = useRef(0)
  useMapEvents({
    onCameraChange: (s) => {
      pendingCamera.current = s
      if (cameraTimer.current) return
      cameraTimer.current = window.setTimeout(() => {
        cameraTimer.current = 0
        const c = pendingCamera.current
        if (!c) return
        model.camera = coord(c)
        model.altitude = `${Math.round(c.altitude)} m · zoom ${zoomForAltitude(c.altitude).toFixed(2)}`
        feed.notify()
      }, CAMERA_REFRESH_MS)
    },
    onClick: (e) => {
      model.click = coord(e.latLng)
      feed.notify()
    },
  })
  useEffect(() => () => window.clearTimeout(cameraTimer.current), [])

  // ── useZoomGate : le seuil sous lequel le décor `static` disparaît. Le prédicat ne
  // change d'identité qu'au FRANCHISSEMENT — pas un rendu par cran de molette.
  const staticMinZoom = useConfig().markers.staticMinZoom
  const gate = useZoomGate([staticMinZoom])
  model.gate = `seuil ${staticMinZoom} → ${gate(staticMinZoom) ? 'visible' : 'masqué'}`

  // ── useTags : le filtre « Couches », réactif au registre ET à la sélection.
  const tags = useTags()
  feed.tags = tags.all()
  feed.selectedTags = tags.selected

  // ── useCameraCommands : les commandes SANS l'état (identité stable, aucun re-render).
  const cam = useCameraCommands()
  // ── useCapture : rasteriseur et trace injectés par `<Map capture>` — le même chemin que
  // « Prendre une photo » du menu ⚙, mais depuis un bouton de l'hôte.
  const capture = useCapture()

  feed.actions = {
    fitMarkers: () => {
      const b = boundsOfMarkers(getMarkers())
      if (b) cam.fitBounds(b, { padding: 60, minAltitude: 120 })
    },
    zoomIn: () => cam.setZoom(cam.getZoom() + 1),
    zoomOut: () => cam.setZoom(cam.getZoom() - 1),
    capture: () => {
      model.probe = 'capture…'
      feed.notify()
      capture().then(
        (blob) => {
          download(blob, `map3d-${Date.now()}.${blob.type.split('/')[1] ?? 'png'}`)
          model.probe = 'capture téléchargée'
          feed.notify()
        },
        (err: unknown) => {
          console.warn('[demo] capture impossible', err)
          model.probe = 'capture impossible (console)'
          feed.notify()
        },
      )
    },
    // ── MapHandle, au-delà de `camera.*` : dessin et interrogation par la poignée, lue au clic.
    probe: () => {
      const h = handle.current
      if (!h) {
        model.probe = 'poignée absente (moteur non monté)'
      } else {
        const shapes = h.drawing?.getShapes() ?? []
        const view = h.engine.getView()
        console.log('[demo] poignée →', { view, shapes, lens: h.lens, relations: h.relations })
        model.probe = `${shapes.length} dessin(s) · zoom ${view.zoom.toFixed(2)} · loupe ${h.lens ? 'montée' : '—'} · relations ${h.relations ? 'montées' : '—'}`
      }
      feed.notify()
    },
    fitDrawings: () => {
      const h = handle.current
      const points = h?.drawing?.getShapes().flatMap((s) => s.points) ?? []
      const b = boundsOfLatLngs(points)
      if (h && b) h.camera.fitBounds(b, { padding: 60 })
      else {
        model.probe = 'aucun dessin à cadrer'
        feed.notify()
      }
    },
    toggleTag: (tag) => tags.toggle(tag),
    clearTags: () => tags.clear(),
    toggleLens: null,
    clearRelations: null,
  }

  // Les hooks viennent d'écrire dans le modèle : l'onglet se rafraîchit après ce render.
  useEffect(() => feed.notify())

  return (
    <>
      {lens && <LensBridge feed={feed} />}
      {relations && <RelationsBridge feed={feed} />}
    </>
  )
}

/** `useLens()` — dans son propre composant : le hook lève si la loupe n'est pas montée. */
function LensBridge({ feed }: { feed: HooksFeed }) {
  const lens = useLens()
  feed.model.lens = `${lens.active ? 'active' : 'inactive'}${lens.shortcut ? ` (touche ${lens.shortcut})` : ''}`
  feed.actions.toggleLens = lens.toggle
  return null
}

/** `useRelations()` — idem : exige `<Map relations>`. */
function RelationsBridge({ feed }: { feed: HooksFeed }) {
  const rel = useRelations()
  feed.model.relations = `${rel.rules.length} règle(s) · ${rel.snapshots.length} relation(s)`
  feed.actions.clearRelations = rel.snapshots.length > 0 ? () => rel.clear() : null
  return null
}
