import {
  type CameraState,
  type LatLng,
  type MapHandle,
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
import { type CSSProperties, type ReactNode, type RefObject, useCallback, useEffect, useRef, useState } from 'react'

import type { AnyData } from '../data/types'
import type { MarkerData } from '@pasquelin/map3d'

/**
 * Cadence d'affichage de la position caméra. L'événement `camera` part à CHAQUE frame
 * de mouvement : le mettre en état tel quel re-rendrait le panneau soixante fois par
 * seconde pendant un pan, pour des chiffres illisibles. ~4 Hz suffit (cf. `StatsOverlay`).
 */
const CAMERA_REFRESH_MS = 250

const MONO = '11px/1.4 ui-monospace, SFMono-Regular, Menlo, monospace'

/** Décalé de la colonne des contrôles de navigation (droite, centrée verticalement) : 48 px + marges. */
const CONTROLS_CLEARANCE = 64

const PANEL: CSSProperties = {
  position: 'absolute',
  right: CONTROLS_CLEARANCE,
  bottom: 8,
  zIndex: 10,
  width: 260,
  maxHeight: 'calc(100% - 16px)',
  overflow: 'auto',
  boxSizing: 'border-box',
  padding: 8,
  font: MONO,
  color: '#0ff',
  background: 'rgba(0,0,0,.8)',
}

const BUTTON: CSSProperties = {
  font: MONO,
  color: '#0ff',
  background: 'transparent',
  border: '1px solid rgba(0,255,255,.5)',
  borderRadius: 3,
  padding: '1px 6px',
  cursor: 'pointer',
}

const ROW: CSSProperties = { display: 'flex', flexWrap: 'wrap', gap: 4, alignItems: 'center', marginTop: 4 }

const TITLE: CSSProperties = { marginTop: 8, marginBottom: 2, opacity: 0.7, textTransform: 'uppercase' }

/** Un titre de section, puis son contenu. */
function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <>
      <div style={TITLE}>{title}</div>
      {children}
    </>
  )
}

function Button({ onClick, children }: { onClick: () => void; children: ReactNode }) {
  return (
    <button type="button" style={BUTTON} onClick={onClick}>
      {children}
    </button>
  )
}

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

type DemoPanelProps = {
  /** Poignée de la carte, passée par REF : lue au clic, jamais capturée. */
  handle: RefObject<MapHandle | null>
  /** Markers de la scène, lus à l'appel — en dépendre re-rendrait le panneau à chaque tick du flux. */
  getMarkers: () => readonly MarkerData<AnyData>[]
  /** La loupe n'est montée qu'avec la barre : `useLens()` jetterait sans elle. */
  lens: boolean
  /** Idem pour le moteur de relations (`useRelations()` exige la prop `relations`). */
  relations: boolean
}

/**
 * Panneau des hooks et de la poignée — ce que l'exemple n'exerçait pas encore.
 *
 * Monté en enfant de `<Map>` (overlay HÔTE) : c'est la seule position d'où les hooks de
 * contexte (`useViewport`, `useMapEvents`, `useTags`, `useCapture`, `useZoomGate`,
 * `useCameraCommands`) atteignent le moteur. La poignée `MapHandle`, elle, vient de
 * l'extérieur par ref : c'est le chemin d'un bouton de dashboard qui n'est PAS sous la carte.
 *
 * Chaque section nomme le hook qu'elle consomme — le panneau se lit comme un index.
 */
export function DemoPanel({ handle, getMarkers, lens, relations }: DemoPanelProps) {
  const [open, setOpen] = useState(true)

  // ── useViewport : la vue STABILISÉE (anti-rebond de `config.data.viewportDebounceMs`).
  const [viewport, setViewport] = useState<Viewport | null>(null)
  useViewport(setViewport)

  // ── useMapEvents : caméra à chaque frame (ralentie à ~4 Hz, cf. `CAMERA_REFRESH_MS`) et
  // clic sur la carte. Le handler survit à ses renders : la dernière valeur attend dans
  // une ref, le timer ne publie que la plus récente.
  const [camera, setCamera] = useState<CameraState | null>(null)
  const [lastClick, setLastClick] = useState<LatLng | null>(null)
  const pendingCamera = useRef<CameraState | null>(null)
  const cameraTimer = useRef(0)
  useMapEvents({
    onCameraChange: (s) => {
      pendingCamera.current = s
      if (cameraTimer.current) return
      cameraTimer.current = window.setTimeout(() => {
        cameraTimer.current = 0
        setCamera(pendingCamera.current)
      }, CAMERA_REFRESH_MS)
    },
    onClick: (e) => setLastClick(e.latLng),
  })
  useEffect(() => () => window.clearTimeout(cameraTimer.current), [])

  // ── useZoomGate : le seuil sous lequel le décor `static` disparaît. Le prédicat ne
  // change d'identité qu'au FRANCHISSEMENT — pas un rendu par cran de molette.
  const staticMinZoom = useConfig().markers.staticMinZoom
  const gate = useZoomGate([staticMinZoom])

  // ── useTags : le filtre « Couches », réactif au registre ET à la sélection.
  const tags = useTags()

  // ── useCameraCommands : les commandes SANS l'état (identité stable, aucun re-render).
  const cam = useCameraCommands()
  const fitMarkers = useCallback(() => {
    const b = boundsOfMarkers(getMarkers())
    if (b) cam.fitBounds(b, { padding: 60, minAltitude: 120 })
  }, [cam, getMarkers])

  // ── useCapture : rasteriseur et trace injectés par `<Map capture>` — le même chemin que
  // « Prendre une photo » du menu ⚙, mais depuis un bouton de l'hôte.
  const capture = useCapture()
  const [capturing, setCapturing] = useState(false)
  const takePicture = useCallback(async () => {
    setCapturing(true)
    try {
      const blob = await capture()
      download(blob, `map3d-${Date.now()}.${blob.type.split('/')[1] ?? 'png'}`)
    } catch (err) {
      console.warn('[demo] capture impossible', err)
    } finally {
      setCapturing(false)
    }
  }, [capture])

  // ── MapHandle, au-delà de `camera.*` : dessin et interrogation par la poignée. Lue au
  // clic (`handle.current`), donc pas de `useCallback` : le Compiler ne reconnaît pas
  // une ref passée en prop, et mémoïser sur `.current` figerait la poignée du montage.
  const [probe, setProbe] = useState<string | null>(null)
  const askHandle = () => {
    const h = handle.current
    if (!h) return setProbe('poignée absente (moteur non monté)')
    const shapes = h.drawing?.getShapes() ?? []
    const view = h.engine.getView()
    console.log('[demo] poignée →', { view, shapes, lens: h.lens, relations: h.relations })
    setProbe(
      `${shapes.length} dessin(s) · zoom ${view.zoom.toFixed(2)} · loupe ${h.lens ? 'montée' : '—'} · relations ${h.relations ? 'montées' : '—'}`,
    )
  }
  const fitDrawings = () => {
    const h = handle.current
    const points = h?.drawing?.getShapes().flatMap((s) => s.points) ?? []
    const b = boundsOfLatLngs(points)
    if (h && b) h.camera.fitBounds(b, { padding: 60 })
    else setProbe('aucun dessin à cadrer')
  }

  if (!open) {
    return (
      <div style={{ ...PANEL, width: 'auto', padding: 4 }}>
        <Button onClick={() => setOpen(true)}>hooks ▴</Button>
      </div>
    )
  }

  return (
    <div style={PANEL}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <b>hooks &amp; poignée</b>
        <Button onClick={() => setOpen(false)}>▾</Button>
      </div>

      <Section title="useMapEvents · caméra">
        {camera ? (
          <div>
            {coord(camera)}
            <br />
            alt {Math.round(camera.altitude)} m · zoom {zoomForAltitude(camera.altitude).toFixed(2)}
          </div>
        ) : (
          <div>— en attente d’un mouvement —</div>
        )}
        <div>clic : {lastClick ? coord(lastClick) : '—'}</div>
      </Section>

      <Section title="useViewport · vue stabilisée">
        {viewport ? (
          <div>
            N {viewport.bounds.north.toFixed(4)} · S {viewport.bounds.south.toFixed(4)}
            <br />E {viewport.bounds.east.toFixed(4)} · O {viewport.bounds.west.toFixed(4)}
          </div>
        ) : (
          <div>— en attente —</div>
        )}
      </Section>

      <Section title="useZoomGate · décor static">
        <div>
          seuil {staticMinZoom} → {gate(staticMinZoom) ? 'visible' : 'masqué'}
        </div>
      </Section>

      <Section title="useTags · filtre couches">
        <div style={ROW}>
          {tags.all().map(({ tag, count }) => (
            <Button key={tag} onClick={() => tags.toggle(tag)}>
              {tags.selected.has(tag) ? '●' : '○'} {tag} ({count})
            </Button>
          ))}
          {tags.isActive && <Button onClick={() => tags.clear()}>tout</Button>}
        </div>
      </Section>

      <Section title="useCameraCommands · useCapture">
        <div style={ROW}>
          <Button onClick={fitMarkers}>cadrer markers</Button>
          <Button onClick={() => cam.setZoom(cam.getZoom() - 1)}>zoom −</Button>
          <Button onClick={() => cam.setZoom(cam.getZoom() + 1)}>zoom +</Button>
          <Button onClick={takePicture}>{capturing ? 'capture…' : 'capture'}</Button>
        </div>
      </Section>

      <Section title="MapHandle (ref) · dessin, interrogation">
        <div style={ROW}>
          <Button onClick={askHandle}>interroger</Button>
          <Button onClick={fitDrawings}>cadrer dessins</Button>
        </div>
        {probe && <div>{probe}</div>}
      </Section>

      {lens && <LensRow />}
      {relations && <RelationsRow />}
    </div>
  )
}

/** `useLens()` — dans son propre composant : le hook lève si la loupe n'est pas montée. */
function LensRow() {
  const lens = useLens()
  return (
    <Section title="useLens">
      <div style={ROW}>
        {lens.active ? 'active' : 'inactive'}
        {lens.shortcut && ` (touche ${lens.shortcut})`}
        <Button onClick={lens.toggle}>{lens.active ? 'quitter' : 'activer'}</Button>
      </div>
    </Section>
  )
}

/** `useRelations()` — idem : exige `<Map relations>`. */
function RelationsRow() {
  const rel = useRelations()
  return (
    <Section title="useRelations">
      <div style={ROW}>
        {rel.rules.length} règle(s) · {rel.snapshots.length} relation(s)
        {rel.snapshots.length > 0 && <Button onClick={() => rel.clear()}>effacer</Button>}
      </div>
    </Section>
  )
}
