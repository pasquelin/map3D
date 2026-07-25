import { type ReactNode, useEffect, useId, useMemo, useReducer, useRef, useState } from 'react'
import type { MapEngine } from '../../core/MapEngine'
import {
  DrawLayer as CoreDrawLayer,
  type DrawTool,
  type GeoJSONFeatureCollection,
  type SelectMode,
} from '../../layers/DrawLayer'
import { DrawSettings, type ToolSettings } from '../../layers/draw/DrawSettings'
import { makeDistanceFormatter } from '../../layers/DrawLayer'
import { SELECT_MODE_META } from './drawControls'
import { type DrawAction, DrawingContext, type DrawingApi, useLabels, useMapContext } from '../context'
import { inTextInput, plainKey } from './shortcuts'

export type DrawLayerProps = {
  tools?: DrawTool[]
  /** Raccourci par outil/action — `false` pour en désactiver un, autre touche pour remapper. */
  shortcuts?: Partial<Record<DrawTool | DrawAction, string | false>>
  defaults?: { color?: string; width?: number; fillOpacity?: number }
  /** Persistance des réglages par outil : localStorage (défaut) ou aucune. */
  settingsStorage?: 'local' | 'none'
  value?: GeoJSONFeatureCollection
  onChange?: (geojson: GeoJSONFeatureCollection) => void
  /** Notifiée à chaque changement de sélection (ids des formes, ids des markers). */
  onSelectionChange?: (ids: string[], markerIds: ReadonlyArray<string | number>) => void
  children?: ReactNode
}

const DEFAULT_SHORTCUTS: Record<DrawTool | DrawAction, string> = {
  select: 'v',
  selectRect: '1',
  selectPoly: '2',
  selectLasso: '3',
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
  const labels = useLabels()
  const coreRef = useRef<CoreDrawLayer | null>(null)
  const [tool, setToolState] = useState<DrawTool | null>(null)
  // Re-render à chaque mutation du core (canUndo/canRedo, sélection…) ; `rev`
  // sert aussi de clé de mémoïsation à l'objet de contexte.
  const [rev, bump] = useReducer((x: number) => x + 1, 0)
  // Dernière collection émise par le core : en usage contrôlé (value/onChange),
  // ré-importer notre propre écho créerait une boucle infinie.
  const lastEmittedRef = useRef<GeoJSONFeatureCollection | null>(null)
  const valueRef = useRef(props.value)
  valueRef.current = props.value
  /** Relâche la suspension barre-espace (posée par l'effet dédié plus bas). */
  const releaseSpaceRef = useRef<() => void>(() => {})

  const allowed =
    props.tools ?? ['select', 'line', 'polygon', 'rect', 'circle', 'freehand', 'arrow', 'measure', 'erase']
  const onChangeRef = useRef(props.onChange)
  onChangeRef.current = props.onChange
  const onSelectionChangeRef = useRef(props.onSelectionChange)
  onSelectionChangeRef.current = props.onSelectionChange
  const [selection, setSelection] = useState<readonly string[]>([])
  const [markerSelection, setMarkerSelection] = useState<ReadonlyArray<string | number>>([])
  const [selectMode, setSelectModeState] = useState<SelectMode>('rect')
  const toolRef = useRef(tool)
  toolRef.current = tool
  const selectionRef = useRef(selection)
  selectionRef.current = selection
  const tagSource = useId()

  const setSelectMode = (m: SelectMode) => {
    coreRef.current?.setSelectMode(m)
    setSelectModeState(m)
  }

  // Défauts de base (thème/props) — construit UNE fois par rendu, consommé par le
  // store de réglages, le core et sa resynchronisation.
  const base: ToolSettings = {
    color: props.defaults?.color ?? theme.colors.draw.default,
    width: props.defaults?.width ?? 8,
    fillOpacity: props.defaults?.fillOpacity ?? 0.3,
    stroke: 'solid',
  }
  // Réglages par outil, persistés (localStorage) : base < overrides utilisateur.
  const settings = useMemo(
    () =>
      new DrawSettings(base, props.settingsStorage === 'none' || typeof localStorage === 'undefined' ? null : localStorage),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [props.settingsStorage],
  )
  useEffect(() => {
    settings.setBase(base)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings, base.color, base.width, base.fillOpacity])
  const settingsRef = useRef(settings)
  settingsRef.current = settings
  const labelsRef = useRef(labels)
  labelsRef.current = labels
  // Re-render (panneaux, aperçus) à chaque changement de réglage.
  useEffect(() => settings.onChange(bump), [settings])

  useEffect(() => {
    const core = new CoreDrawLayer(
      engine.annotations,
      engine.projection,
      overlay,
      base,
      4,
      (fc) => {
        lastEmittedRef.current = fc
        onChangeRef.current?.(fc)
        // Registre du panneau « Couches » : à chaque ajout/suppression de dessin.
        engine.tags.report(tagSource, core.tagCounts())
        bump()
      },
    )
    core.onSelectionChange = (ids, markerIds) => {
      setSelection(ids)
      setMarkerSelection(markerIds)
      onSelectionChangeRef.current?.(ids, markerIds)
    }
    // Registre des sélectionnables externes (markers) : le core gère tout le
    // cycle de vie (prune, routage des clics) — débranché par son dispose().
    core.setExternalSelectables(engine.selectables)
    // Via ref : si `settings` est recréé (changement de settingsStorage), le core
    // lit toujours l'instance courante — pas une closure périmée.
    core.defaultsFor = (t) => settingsRef.current.get(t)
    // Labels de mesure traduits via le provider (ref : labels changés sans recréer le core).
    core.formatDistance = (m) => makeDistanceFormatter(labelsRef.current.measure)(m)
    engine.addLayer(core)
    coreRef.current = core
    // Un core recréé (engine/overlay changés) repart vide : on rejoue l'import
    // contrôlé — sinon les dessins de l'hôte disparaissent de la carte.
    if (valueRef.current) core.fromGeoJSON(valueRef.current)
    // Filtre « Couches » : simple bascule de visibilité des meshes, aucun rebuild.
    // Câblé dans CE même effet : un core recréé (ex. overlay changé) repart
    // toujours avec le filtre courant appliqué.
    const applyFilter = () => core.setTagVisibility((t) => engine.tags.isVisible(t))
    applyFilter()
    const offSelection = engine.tags.onSelection(applyFilter)
    return () => {
      offSelection()
      engine.inputInterceptor = null
      engine.setDrawing(false)
      engine.removeLayer(core)
      engine.tags.unreport(tagSource)
      // Pas de curseur fantôme (crosshair/flèche/main) après démontage outil actif.
      overlay.parentElement?.classList.remove('m3d-drawing', 'm3d-selecting', 'm3d-space-pan')
      coreRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [engine, overlay])

  // Applique les defaults quand ils changent.
  useEffect(() => {
    coreRef.current?.setDefaults(base)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [base.color, base.width, base.fillOpacity])

  // Import GeoJSON contrôlé — l'écho de notre propre émission est ignoré
  // (identité), sinon value → import → onChange → setValue bouclerait sans fin.
  useEffect(() => {
    if (props.value && props.value !== lastEmittedRef.current) coreRef.current?.fromGeoJSON(props.value)
  }, [props.value])

  const setTool = useMemo(
    () => (t: DrawTool | null) => {
      const core = coreRef.current
      if (!core) return
      // Changer d'outil pendant le pan-espace relâche d'abord la suspension —
      // sinon moteur (dé-suspendu par setDrawing) et core divergent : tout gèle.
      releaseSpaceRef.current()
      const next = t && allowed.includes(t) ? t : null
      // setTool() gère aussi le routage des clics markers (consumer du registre).
      core.setTool(next)
      engine.inputInterceptor = next ? core.interceptor : null
      // Mode dessin : coupe la rotation au drag mais GARDE le zoom molette actif.
      engine.setDrawing(!!next)
      overlay.parentElement?.classList.toggle('m3d-drawing', !!next && next !== 'select')
      overlay.parentElement?.classList.toggle('m3d-selecting', next === 'select')
      setToolState(next)
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [engine, overlay, allowed.join(',')],
  )

  // Barre espace = pan caméra temporaire (le dessin/geste en cours est gelé, pas
  // perdu) ; Espace+Maj = rotation caméra. Relâcher = reprise exacte de l'outil.
  const spaceRef = useRef<{ prevMode: ReturnType<MapEngine['getDragMode']> } | null>(null)
  useEffect(() => {
    const releaseSpace = () => {
      coreRef.current?.setRotateHint(false)
      const held = spaceRef.current
      if (!held) return
      spaceRef.current = null
      engine.setDrawingSuspended(false)
      coreRef.current?.setSuspended(false)
      engine.setDragMode(held.prevMode)
      overlay.parentElement?.classList.remove('m3d-space-pan')
    }
    releaseSpaceRef.current = releaseSpace
    const onDown = (e: KeyboardEvent) => {
      if (inTextInput(e)) return
      if (e.code === 'Space' && !e.repeat && toolRef.current !== null) {
        e.preventDefault()
        if (spaceRef.current) return
        spaceRef.current = { prevMode: engine.getDragMode() }
        engine.setDrawingSuspended(true)
        coreRef.current?.setSuspended(true)
        overlay.parentElement?.classList.add('m3d-space-pan')
        if (e.shiftKey) engine.setDragMode('rotate')
      } else if (e.key === 'Shift') {
        if (spaceRef.current) engine.setDragMode('rotate')
        coreRef.current?.setRotateHint(true)
      }
    }
    const onUp = (e: KeyboardEvent) => {
      if (e.code === 'Space') releaseSpace()
      else if (e.key === 'Shift') {
        if (spaceRef.current) engine.setDragMode(spaceRef.current.prevMode)
        coreRef.current?.setRotateHint(false)
      }
    }
    // Fenêtre défocalisée pendant le maintien : on relâche proprement.
    window.addEventListener('keydown', onDown)
    window.addEventListener('keyup', onUp)
    window.addEventListener('blur', releaseSpace)
    return () => {
      window.removeEventListener('keydown', onDown)
      window.removeEventListener('keyup', onUp)
      window.removeEventListener('blur', releaseSpace)
      releaseSpace()
    }
  }, [engine, overlay])

  // Raccourcis clavier (configurables) + Entrée/Échap/Ctrl+Z.
  useEffect(() => {
    const table = { ...DEFAULT_SHORTCUTS, ...props.shortcuts }
    const onKey = (e: KeyboardEvent) => {
      if (inTextInput(e)) return
      if (e.code === 'Space') return // géré par l'effet barre espace
      if (e.key === 'Enter') coreRef.current?.closeCurrent()
      else if (e.key === 'Escape') {
        // Cascade : marquee en cours → sélection → sortie de l'outil.
        if (!coreRef.current?.escape()) setTool(null)
      } else if (e.key === 'Delete' || e.key === 'Backspace') {
        coreRef.current?.deleteSelected()
      } else if (e.key.startsWith('Arrow') && selectionRef.current.length > 0) {
        // Nudge : 1 px écran, Maj = 10 px.
        e.preventDefault()
        const step = e.shiftKey ? 10 : 1
        const dx = e.key === 'ArrowLeft' ? -step : e.key === 'ArrowRight' ? step : 0
        const dy = e.key === 'ArrowUp' ? -step : e.key === 'ArrowDown' ? step : 0
        coreRef.current?.nudgeSelection(dx, dy)
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault()
        if (e.shiftKey) coreRef.current?.redo()
        else coreRef.current?.undo()
      } else if (e.ctrlKey && e.key.toLowerCase() === 'y') {
        e.preventDefault()
        coreRef.current?.redo()
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'a' && toolRef.current !== null) {
        // Tout sélectionner — seulement quand un outil de la carte est actif
        // (sinon on laisse le ⌘A natif de la page).
        e.preventDefault()
        coreRef.current?.selectAll()
        if (toolRef.current !== 'select') setTool('select')
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'd' && selectionRef.current.length > 0) {
        e.preventDefault()
        coreRef.current?.duplicateSelected()
      } else {
        const k = plainKey(e)
        if (!k) return
        const found = (Object.entries(table) as Array<[DrawTool | DrawAction, string | false]>).find(
          ([, key]) => key === k,
        )
        if (!found) return
        const modeMeta = SELECT_MODE_META.find((m) => m.action === found[0])
        if (modeMeta) {
          // Raccourci d'un mode de sélection : choisit le mode ET active l'outil.
          setSelectMode(modeMeta.mode)
          if (toolRef.current !== 'select') setTool('select')
        } else {
          setTool(found[0] as DrawTool)
        }
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [props.shortcuts, setTool])

  // Hors du memo `api` (qui recompute à chaque `rev`, jusqu'à 1×/frame pendant
  // un restyle) : kind par id ne change qu'avec la sélection elle-même.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const selectionDetails = useMemo(() => coreRef.current?.selectionDetails() ?? [], [selection])

  // Objet de contexte mémoïsé : les consommateurs ne re-rendent que quand l'état
  // réactif change réellement (`rev` bumpe à chaque mutation du core/réglages).
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const api: DrawingApi = useMemo(() => ({
    tool,
    setTool,
    selectMode,
    setSelectMode,
    selection,
    markerSelection,
    selectionDetails,
    select: (ids) => coreRef.current?.select(ids),
    deselectMarkers: (ids) => coreRef.current?.deselectExternal(ids),
    clearSelection: () => coreRef.current?.clearSelection(),
    deleteSelection: () => coreRef.current?.deleteSelected(),
    selectAll: () => {
      coreRef.current?.selectAll()
      setTool('select')
    },
    duplicateSelection: () => coreRef.current?.duplicateSelected(),
    setStyle: (patch) => {
      const core = coreRef.current
      if (!core) return
      if (core.getSelection().length > 0) {
        core.setStyleForSelection(patch)
      } else if (tool && tool !== 'select' && tool !== 'erase') {
        // Pas de sélection : le style devient le réglage persisté de l'outil actif.
        settings.set(tool, patch)
      }
    },
    currentStyle: (() => {
      const sel = coreRef.current?.styleOfSelection()
      if (sel) return sel
      const t = tool && tool !== 'select' && tool !== 'erase' ? tool : 'line'
      const d = settings.get(t)
      return {
        color: d.color,
        fillColor: d.fillColor,
        width: d.width,
        fillOpacity: d.fillOpacity,
        strokeOpacity: d.strokeOpacity ?? 0.95,
        stroke: d.stroke,
        radius: d.radius ?? 0,
      }
    })(),
    selectionHasRect: coreRef.current?.selectionHas('rect') ?? false,
    settings,
    lock: (ids) => coreRef.current?.setLocked(ids, true),
    unlock: (ids) => coreRef.current?.setLocked(ids, false),
    undo: () => coreRef.current?.undo(),
    redo: () => coreRef.current?.redo(),
    canUndo: coreRef.current?.canUndo ?? false,
    canRedo: coreRef.current?.canRedo ?? false,
    clear: () => coreRef.current?.clear(),
    toGeoJSON: () => coreRef.current?.toGeoJSON() ?? { type: 'FeatureCollection', features: [] },
    fromGeoJSON: (fc) => coreRef.current?.fromGeoJSON(fc),
    // Raccourcis effectifs (défauts + overrides) : dispatch clavier ET tooltips.
    shortcuts: { ...DEFAULT_SHORTCUTS, ...props.shortcuts },
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [tool, selectMode, selection, selectionDetails, markerSelection, rev, settings, setTool, props.shortcuts])

  return <DrawingContext.Provider value={api}>{props.children}</DrawingContext.Provider>
}
