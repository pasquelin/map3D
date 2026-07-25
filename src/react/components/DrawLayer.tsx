import { type ReactNode, useEffect, useMemo, useRef, useState } from 'react'
import {
  DrawLayer as CoreDrawLayer,
  type DrawTool,
  type GeoJSONFeatureCollection,
} from '../../layers/DrawLayer'
import { DrawingContext, type DrawingApi, useMapContext } from '../context'

export type DrawLayerProps = {
  tools?: DrawTool[]
  shortcuts?: Partial<Record<DrawTool, string>>
  defaults?: { color?: string; width?: number; fillOpacity?: number }
  value?: GeoJSONFeatureCollection
  onChange?: (geojson: GeoJSONFeatureCollection) => void
  children?: ReactNode
}

const DEFAULT_SHORTCUTS: Record<DrawTool, string> = {
  line: 'l',
  polygon: 'p',
  rect: 'r',
  circle: 'c',
  freehand: 'd',
  arrow: 'a',
  measure: 'm',
  erase: 'e',
}

/** Outils de dessin : câble l'intercepteur d'entrée et expose `useDrawing()`. */
export function DrawLayer(props: DrawLayerProps) {
  const { engine, overlay, theme } = useMapContext()
  const coreRef = useRef<CoreDrawLayer | null>(null)
  const [tool, setToolState] = useState<DrawTool | null>(null)

  const allowed = props.tools ?? ['line', 'polygon', 'rect', 'circle', 'freehand', 'arrow', 'measure', 'erase']
  const onChangeRef = useRef(props.onChange)
  onChangeRef.current = props.onChange

  useEffect(() => {
    const core = new CoreDrawLayer(
      engine.annotations,
      engine.projection,
      overlay,
      {
        color: props.defaults?.color ?? theme.colors.draw.default,
        width: props.defaults?.width ?? 8,
        fillOpacity: props.defaults?.fillOpacity ?? 0.3,
      },
      4,
      (fc) => onChangeRef.current?.(fc),
    )
    engine.addLayer(core)
    coreRef.current = core
    return () => {
      engine.inputInterceptor = null
      engine.setDrawing(false)
      engine.removeLayer(core)
      coreRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [engine, overlay])

  // Applique les defaults quand ils changent.
  useEffect(() => {
    coreRef.current?.setDefaults({
      color: props.defaults?.color ?? theme.colors.draw.default,
      width: props.defaults?.width ?? 8,
      fillOpacity: props.defaults?.fillOpacity ?? 0.3,
    })
  }, [props.defaults?.color, props.defaults?.width, props.defaults?.fillOpacity, theme.colors.draw.default])

  // Import GeoJSON.
  useEffect(() => {
    if (props.value) coreRef.current?.fromGeoJSON(props.value)
  }, [props.value])

  const setTool = useMemo(
    () => (t: DrawTool | null) => {
      const core = coreRef.current
      if (!core) return
      const next = t && allowed.includes(t) ? t : null
      core.setTool(next)
      engine.inputInterceptor = next ? core.interceptor : null
      // Mode dessin : coupe la rotation au drag mais GARDE le zoom molette actif.
      engine.setDrawing(!!next)
      overlay.parentElement?.classList.toggle('m3d-drawing', !!next)
      setToolState(next)
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [engine, overlay, allowed.join(',')],
  )

  // Raccourcis clavier (configurables) + Entrée/Échap/Ctrl+Z.
  useEffect(() => {
    const shortcuts = { ...DEFAULT_SHORTCUTS, ...props.shortcuts }
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) return
      if (e.key === 'Enter') coreRef.current?.closeCurrent()
      else if (e.key === 'Escape') setTool(null)
      else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault()
        coreRef.current?.undo()
      } else if (!e.ctrlKey && !e.metaKey) {
        const found = (Object.entries(shortcuts) as Array<[DrawTool, string]>).find(
          ([, key]) => key === e.key.toLowerCase(),
        )
        if (found) setTool(found[0])
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [props.shortcuts, setTool])

  const api: DrawingApi = {
    tool,
    setTool,
    undo: () => coreRef.current?.undo(),
    clear: () => coreRef.current?.clear(),
    toGeoJSON: () => coreRef.current?.toGeoJSON() ?? { type: 'FeatureCollection', features: [] },
    fromGeoJSON: (fc) => coreRef.current?.fromGeoJSON(fc),
  }

  return <DrawingContext.Provider value={api}>{props.children}</DrawingContext.Provider>
}
