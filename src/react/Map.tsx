import { type CSSProperties, type ReactNode, useEffect, useMemo, useRef, useState } from 'react'
import type { CameraState } from '../core/Camera'
import { MapEngine } from '../core/MapEngine'
import { readStoredJSON, removeStoredKey, writeStoredJSON } from '../core/storage'
import type { Viewport } from '../data/types'
import type { LatLng } from '../shared'
import { injectStyles } from '../style/injectStyles'
import { themeToVars } from '../style/themeToVars'
import { MapContext, useTheme } from './context'

export type MapProps = {
  center: LatLng
  zoom: number
  /** Clé Google Maps Platform → Photorealistic 3D Tiles en direct (prioritaire sur Ion). */
  googleMapsApiKey?: string
  /** Token Cesium Ion → Google Photorealistic 3D Tiles via Cesium. */
  cesiumIonToken?: string
  /** Asset Cesium Ion (défaut 2275207 = Google Photorealistic 3D Tiles). */
  cesiumIonAssetId?: string
  /** Globe ellipsoïde uni de repli quand aucune tuile n'est disponible (défaut: true). */
  fallbackGlobe?: boolean
  /** Erreur d'écran cible (qualité/perf). */
  errorTarget?: number
  /** Intro façon Google Earth : vue globe puis descente animée vers center/zoom (défaut: true). */
  intro?: boolean
  /**
   * Clé localStorage de la dernière position caméra (absent = pas de persistance).
   * Une position mémorisée remplace `center`/`zoom` au montage et coupe l'intro.
   */
  positionStorageKey?: string
  /** Efface la position mémorisée au montage → intro et `center`/`zoom` normaux (défaut: false). */
  resetStoredPosition?: boolean
  /**
   * Clé localStorage du filtre « Couches » (`null` = pas de persistance ; une clé
   * distincte par carte si plusieurs `<Map>` cohabitent). Défaut : `m3d:tag-filter`.
   */
  tagStorageKey?: string | null
  onViewportChange?: (viewport: Viewport) => void
  onCameraChange?: (camera: CameraState) => void
  className?: string
  style?: CSSProperties
  children?: ReactNode
}

type StoredPosition = { lat: number; lng: number; altitude: number }

const readStoredPosition = (key: string): StoredPosition | null => {
  const p = readStoredJSON(key) as Partial<StoredPosition> | null
  return p && Number.isFinite(p.lat) && Number.isFinite(p.lng) && Number.isFinite(p.altitude)
    ? { lat: p.lat!, lng: p.lng!, altitude: p.altitude! }
    : null
}

/** Monte le canvas + overlay, crée le MapEngine (3D Tiles + GlobeControls). */
export function Map(props: MapProps) {
  const theme = useTheme()
  const containerRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const overlayRef = useRef<HTMLDivElement>(null)
  const [engine, setEngine] = useState<MapEngine | null>(null)

  const cbRef = useRef({ onViewportChange: props.onViewportChange, onCameraChange: props.onCameraChange })
  cbRef.current = { onViewportChange: props.onViewportChange, onCameraChange: props.onCameraChange }

  // Recrée le moteur si la source de tuiles change.
  useEffect(() => {
    injectStyles()
    const container = containerRef.current
    const canvas = canvasRef.current
    if (!container || !canvas) return

    const posKey = props.positionStorageKey
    if (posKey && props.resetStoredPosition) removeStoredKey(posKey)
    const stored = posKey && !props.resetStoredPosition ? readStoredPosition(posKey) : null

    const eng = new MapEngine({
      canvas,
      center: props.center,
      zoom: props.zoom,
      background: theme.colors.background,
      googleMapsApiKey: props.googleMapsApiKey,
      cesiumIonToken: props.cesiumIonToken,
      cesiumIonAssetId: props.cesiumIonAssetId,
      fallbackGlobe: props.fallbackGlobe ?? true,
      errorTarget: props.errorTarget,
      intro: stored ? false : props.intro,
      tagStorageKey: props.tagStorageKey,
    })
    eng.camera.flyDuration = theme.animations.flyDuration
    eng.camera.flyEasing = theme.animations.flyEasing
    if (stored) eng.camera.jumpTo(stored, stored.altitude)

    const rect = container.getBoundingClientRect()
    eng.setSize(rect.width || 800, rect.height || 600)
    eng.start()

    const offCam = eng.on('camera', (s) => cbRef.current.onCameraChange?.(s))
    const offVp = eng.on('viewport', (v) =>
      cbRef.current.onViewportChange?.({ bounds: v.bounds, center: v.center, zoom: v.zoom }),
    )
    // Mémorise la position stabilisée (debounce). La garde s'évalue à l'ÉCRITURE :
    // pendant l'intro rien n'est mémorisé, et la frame d'atterrissage (émise alors
    // que l'intro est encore active) est bien sauvée 400 ms plus tard.
    let saveTimer = 0
    const offSave = posKey
      ? eng.on('camera', () => {
          window.clearTimeout(saveTimer)
          saveTimer = window.setTimeout(() => {
            if (eng.introActive) return
            const s = eng.camera.getState()
            writeStoredJSON(posKey, { lat: s.lat, lng: s.lng, altitude: s.altitude })
          }, 400)
        })
      : null
    const ro = new ResizeObserver(() => {
      const r = container.getBoundingClientRect()
      eng.setSize(r.width, r.height)
    })
    ro.observe(container)

    setEngine(eng)
    return () => {
      offCam()
      offVp()
      offSave?.()
      window.clearTimeout(saveTimer)
      ro.disconnect()
      eng.dispose()
      setEngine(null)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.googleMapsApiKey, props.cesiumIonToken, props.cesiumIonAssetId])

  const vars = useMemo(() => themeToVars(theme), [theme])
  const style: CSSProperties = { ...(vars as CSSProperties), ...props.style }

  return (
    <div
      ref={containerRef}
      className={`m3d-root${props.className ? ` ${props.className}` : ''}`}
      data-theme={theme.colorScheme}
      style={style}
    >
      <canvas ref={canvasRef} />
      <div ref={overlayRef} className="m3d-overlay" />
      {engine && overlayRef.current && (
        <MapContext.Provider value={{ engine, overlay: overlayRef.current, theme }}>
          {props.children}
        </MapContext.Provider>
      )}
    </div>
  )
}
