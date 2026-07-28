import {
  type ReactNode,
  type RefObject,
  useCallback,
  useContext,
  useEffect,
  useId,
  useMemo,
  useReducer,
  useRef,
  useState,
} from 'react'
import { boundsOfLatLngs, centerOfBounds } from '../../core/bounds'
import type { MapEngine } from '../../core/MapEngine'
import { type Hit, NO_MATCH, normalizeSearch, proximityRank, rankHits, scoreMatch } from '../../search/match'
import { DRAW_GROUP, emptyResult } from '../../search/registry'
import {
  DrawLayer as CoreDrawLayer,
  type DrawConstraints,
  type DrawnShape,
  type DrawRejectReason,
  type DrawTool,
  type GeoJSONFeatureCollection,
  type SelectMode,
} from '../../layers/DrawLayer'
import { DrawSettings, type ToolSettings } from '../../layers/draw/DrawSettings'
import { makeDistanceFormatter } from '../../labels/measure'
import { DEFAULT_DRAW_TOOLS, SELECT_MODE_META } from './drawControls'
import {
  type DrawAction,
  DrawingContext,
  type DrawingApi,
  DrawPresetsContext,
  LensContext,
  useConfig,
  useLabels,
  useMapContext,
} from '../context'
import { inTextInput, matchesEdit, plainKey } from './shortcuts'
import { MILSYM_CATALOG, createMilSymRenderer } from '../../symbols/providers/milSym'
import type { Bounds, LatLng } from '../../shared'
import { useMapDropZone } from '../hooks/useMapDropZone'
import { SYMBOL_DRAG_TYPE } from './SymbolPaletteButton'
import { SymbolMarkers, type SymbolMarkersProps } from './SymbolMarkers'
import type { SymbolCatalog, SymbolRenderer } from '../../symbols/types'
import { DEFAULT_DRAW_PRESETS, type DrawPresets } from './drawPresets'
import { useMergedByContent } from '../hooks/useMergedByContent'

export type DrawLayerProps = {
  /** Outils autorisés (défaut : tous). Filtre aussi ce que `setTool` accepte. */
  tools?: DrawTool[]
  /** Raccourci par outil/action — `false` pour en désactiver un, autre touche pour remapper. */
  shortcuts?: Partial<Record<DrawTool | DrawAction, string | false>>
  /** Style d'une forme nouvellement tracée, avant tout réglage utilisateur. */
  defaults?: { color?: string; width?: number; fillOpacity?: number }
  /**
   * Paliers proposés par les palettes de style (épaisseurs, opacités, rayons
   * d'angle). Fusionnés sur les défauts : ne fournir que ce qu'on change.
   */
  presets?: Partial<DrawPresets>
  /** Persistance des réglages par outil : localStorage (défaut) ou aucune. */
  settingsStorage?: 'local' | 'none'
  /**
   * Clé localStorage des réglages par outil. Défaut `m3d:draw-settings`.
   *
   * À distinguer dès que DEUX cartes cohabitent sur le même origin : sans clé
   * propre, elles écrivent au même endroit et la dernière à changer un réglage
   * l'impose à l'autre. Même précaution que `positionStorageKey` / `tagStorageKey`.
   */
  settingsStorageKey?: string
  /** Collection **contrôlée** (GeoJSON) : fournie, elle fait autorité sur le dessin. */
  value?: GeoJSONFeatureCollection
  /** Collection entière après chaque mutation, coalescée à 1×/frame. */
  onChange?: (geojson: GeoJSONFeatureCollection) => void
  /** Notifiée à chaque changement de sélection (ids des formes, ids des markers). */
  onSelectionChange?: (ids: string[], markerIds: ReadonlyArray<string | number>) => void
  /**
   * Events **par forme** — pour une app qui fait du CRUD par identité (une mutation
   * par zone). Émis au moment du changement, sans la coalescence de `onChange` qui
   * sérialise toute la collection 1×/frame. Les deux peuvent cohabiter.
   */
  onShapeAdd?: (shape: DrawnShape) => void
  /** Forme modifiée (déplacement, redimensionnement, style). */
  onShapeUpdate?: (shape: DrawnShape) => void
  /** Forme supprimée. */
  onShapeDelete?: (shape: DrawnShape) => void
  /** Double-clic sur une forme : intention d'ouvrir une fiche — rien n'a changé. */
  onShapeEdit?: (shape: DrawnShape) => void
  /**
   * Règles métier du dessin **utilisateur** : périmètres autorisés, aire maximale.
   * Les mutations programmatiques n'y sont pas soumises.
   */
  constraints?: DrawConstraints
  /** Forme refusée — à brancher sur votre toast (la lib n'affiche rien d'elle-même). */
  onReject?: (reason: DrawRejectReason, shape: DrawnShape) => void
  /**
   * Outil **Symboles** de la barre : actif par défaut avec le catalogue
   * MIL-STD-2525D et son renderer (SDK chargé en import dynamique à la première
   * ouverture de la palette). `enabled: false` retire l'outil ; `catalog`/`renderer`
   * remplacent la symbologie fournie par la vôtre.
   *
   * Les textes (bouton, catégories, affiliations) ne passent PAS par ici : ils sont
   * dans `labels.symbols` et se traduisent via `<MapProvider labels>`.
   */
  symbols?: {
    enabled?: boolean
    catalog?: SymbolCatalog
    renderer?: SymbolRenderer
    /** Regroupement des symboles entre eux — cf. `SymbolMarkersProps.cluster`. */
    cluster?: SymbolMarkersProps['cluster']
    /** Zoom en deçà duquel les symboles posés disparaissent — cf. `SymbolMarkersProps.minZoom`. */
    minZoom?: number
  }
  /** Monté dans le contexte de dessin — y placer barre et panneaux. */
  children?: ReactNode
}

/**
 * Une surface concurrente (loupe, palette de symboles) prend la main : l'outil de
 * tracé l'abandonne. Deux boutons allumés dans la barre ne diraient plus lequel des
 * deux reçoit le prochain geste.
 *
 * La garde `toolRef.current !== null` est CAPITALE — sans outil actif, `setTool(null)`
 * reprendrait quand même le slot `engine.inputInterceptor` (et `setDrawing(false)`)
 * que la surface vient de prendre : elle resterait affichée active mais morte. Même
 * piège que la cascade Échap. Elle est ici écrite UNE fois, au lieu d'être recopiée
 * par surface concurrente — la troisième aurait recopié le piège avec.
 */
function useYieldsTool(taken: boolean, toolRef: RefObject<DrawTool | null>, setTool: (t: DrawTool | null) => void) {
  useEffect(() => {
    if (taken && toolRef.current !== null) setTool(null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [taken, setTool])
}

/** Outils de dessin : câble l'intercepteur d'entrée et expose `useDrawing()`. */
export function DrawLayer(props: DrawLayerProps) {
  const { engine, overlay, theme } = useMapContext()
  const labels = useLabels()
  const config = useConfig()
  /**
   * Touches des outils, prises dans la config. `satisfies` verrouille l'alignement
   * avec `DrawTool | DrawAction` : ajouter un outil sans lui donner de raccourci
   * casse la compilation, exactement comme le faisait la table de module qu'il
   * remplace — mais la valeur est maintenant réglable par l'application.
   */
  const drawKeys = config.interaction.shortcuts.draw satisfies Record<DrawTool | DrawAction, string | false>
  const editKeys = config.interaction.shortcuts.edit
  const coreRef = useRef<CoreDrawLayer | null>(null)
  const [tool, setToolState] = useState<DrawTool | null>(null)
  // Re-render à chaque mutation du core (canUndo/canRedo, sélection…) ; `rev`
  // sert aussi de clé de mémoïsation à l'objet de contexte.
  const [rev, bump] = useReducer((x: number) => x + 1, 0)
  /** Passe à `true` une fois la couche core créée (le renderer y est alors posé). */
  const [coreReady, setCoreReady] = useState(false)
  // Dernière collection émise par le core : en usage contrôlé (value/onChange),
  // ré-importer notre propre écho créerait une boucle infinie.
  const lastEmittedRef = useRef<GeoJSONFeatureCollection | null>(null)
  const valueRef = useRef(props.value)
  valueRef.current = props.value
  /** Relâche la suspension barre-espace (posée par l'effet dédié plus bas). */
  const releaseSpaceRef = useRef<() => void>(() => {})

  const allowed = props.tools ?? DEFAULT_DRAW_TOOLS
  // Fusion sur les défauts : `presets={{ widths: [...] }}` ne doit pas vider les trois
  // autres tables. Mémoïsé sur le CONTENU et non l'identité — le pattern documenté
  // est le littéral inline, qui recrée l'objet à chaque rendu : une mémoïsation par
  // identité invaliderait le contexte, donc les quatre palettes, à chaque tick.
  const presets = useMergedByContent<Partial<DrawPresets>, DrawPresets>(props.presets, (p) => ({
    ...DEFAULT_DRAW_PRESETS,
    ...p,
  }))
  const onChangeRef = useRef(props.onChange)
  onChangeRef.current = props.onChange
  const onSelectionChangeRef = useRef(props.onSelectionChange)
  onSelectionChangeRef.current = props.onSelectionChange
  // Via ref comme les autres callbacks : le core n'est créé qu'une fois, un handler
  // redéfini à chaque rendu ne doit pas le recréer. Écrit UNE fois (cf. `MarkerLayer`) :
  // deux littéraux jumeaux se désynchronisent en silence dès qu'on ajoute un callback
  // à l'un sans penser à l'autre.
  const shapeCbs = {
    add: props.onShapeAdd,
    update: props.onShapeUpdate,
    remove: props.onShapeDelete,
    edit: props.onShapeEdit,
    reject: props.onReject,
  }
  const shapeCbRef = useRef(shapeCbs)
  shapeCbRef.current = shapeCbs
  const constraintsRef = useRef(props.constraints)
  constraintsRef.current = props.constraints
  const [selection, setSelection] = useState<readonly string[]>([])
  const [markerSelection, setMarkerSelection] = useState<ReadonlyArray<string | number>>([])
  const [selectMode, setSelectModeState] = useState<SelectMode>('rect')
  const toolRef = useRef(tool)
  toolRef.current = tool
  const selectionRef = useRef(selection)
  selectionRef.current = selection

  /**
   * Les flèches déplacent la SÉLECTION tant qu'il y en a une : le moteur doit alors
   * cesser d'en faire un déplacement de caméra, sinon la carte défile sous la forme qu'on
   * est en train de bouger. Le moteur ne peut pas le deviner — la sélection est un état
   * de cette couche.
   *
   * La coupure est nominative (`useId`) : cette couche ne rend les flèches qu'à SA propre
   * demande, sans lever celle d'un autre consommateur ni celle de l'hôte.
   */
  const keyNavOwner = useId()
  useEffect(() => {
    engine.setKeyNavEnabled(selection.length === 0, keyNavOwner)
    return () => engine.setKeyNavEnabled(true, keyNavOwner)
  }, [engine, selection.length, keyNavOwner])
  const tagSource = useId()
  // Outil loupe, s'il est monté (`<Map lens>`) : via ref pour que `setTool` — mémoïsé
  // sur le moteur — n'ait pas à se reconstruire à chaque bascule de la loupe.
  const lens = useContext(LensContext)
  const lensRef = useRef(lens)
  lensRef.current = lens

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
      new DrawSettings(
        base,
        props.settingsStorage === 'none' || typeof localStorage === 'undefined' ? null : localStorage,
        props.settingsStorageKey,
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [props.settingsStorage, props.settingsStorageKey],
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
    const core = new CoreDrawLayer(engine.annotations, engine.projection, overlay, base, 4, (fc) => {
      lastEmittedRef.current = fc
      onChangeRef.current?.(fc)
      // Registre du panneau « Couches » : à chaque ajout/suppression de dessin.
      engine.tags.report(tagSource, core.tagCounts())
      bump()
    })
    core.onSelectionChange = (ids, markerIds) => {
      setSelection(ids)
      setMarkerSelection(markerIds)
      onSelectionChangeRef.current?.(ids, markerIds)
    }
    core.onShapeAdd = (s) => shapeCbRef.current.add?.(s)
    core.onShapeUpdate = (s) => shapeCbRef.current.update?.(s)
    core.onShapeDelete = (s) => shapeCbRef.current.remove?.(s)
    core.onShapeEdit = (s) => shapeCbRef.current.edit?.(s)
    core.onReject = (reason, s) => shapeCbRef.current.reject?.(reason, s)
    core.constraints = constraintsRef.current ?? null
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
    setCoreReady(true)
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
      setCoreReady(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [engine, overlay])

  // Contraintes appliquées à chaud : les périmètres arrivent le plus souvent APRÈS
  // le montage (chargement API), et la carte doit s'y conformer sans être remontée.
  useEffect(() => {
    if (coreRef.current) coreRef.current.constraints = props.constraints ?? null
  }, [props.constraints])

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
      // Exclusivité avec les outils NON-dessin (loupe) : ils partagent le slot
      // unique `engine.inputInterceptor`. C'est CETTE couche qui porte la règle,
      // parce qu'elle est montée SOUS `<LensLayer>` et voit donc son contexte —
      // l'inverse n'est pas vrai. Un `next` nul ne désactive rien : quitter le
      // dessin n'a pas à fermer la loupe.
      if (next) lensRef.current?.deactivate()
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

  // Réciproque de l'exclusivité : la loupe activée abandonne l'outil de dessin.
  const lensActive = lens?.active ?? false
  useYieldsTool(lensActive, toolRef, setTool)

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
    const table = { ...drawKeys, ...props.shortcuts }
    const onKey = (e: KeyboardEvent) => {
      if (inTextInput(e)) return
      if (e.code === 'Space') return // géré par l'effet barre espace
      if (editKeys.closePolygon !== false && e.key === editKeys.closePolygon) coreRef.current?.closeCurrent()
      else if (e.key === 'Escape') {
        // Cascade : marquee en cours → sélection → sortie de l'outil. La garde
        // `toolRef.current !== null` est CAPITALE : sans outil de dessin actif,
        // `setTool(null)` reprendrait quand même le slot partagé
        // `engine.inputInterceptor` (+ `setDrawing(false)`) alors qu'il appartient
        // à un outil externe (loupe) — celui-ci resterait affiché actif mais mort.
        if (!coreRef.current?.escape() && toolRef.current !== null) setTool(null)
      } else if (editKeys.delete.includes(e.key)) {
        coreRef.current?.deleteSelected()
      } else if (e.key.startsWith('Arrow') && selectionRef.current.length > 0) {
        // Nudge, en pixels écran ; Maj prend le pas rapide.
        e.preventDefault()
        const step = e.shiftKey ? editKeys.nudgeFastPx : editKeys.nudgePx
        const dx = e.key === 'ArrowLeft' ? -step : e.key === 'ArrowRight' ? step : 0
        const dy = e.key === 'ArrowUp' ? -step : e.key === 'ArrowDown' ? step : 0
        coreRef.current?.nudgeSelection(dx, dy)
        // `redo` AVANT `undo` : au défaut les deux portent la même touche et ne se
        // distinguent que par Maj, donc le plus spécifique doit être testé d'abord.
      } else if (matchesEdit(e, editKeys.redo) || matchesEdit(e, editKeys.redoAlt)) {
        e.preventDefault()
        coreRef.current?.redo()
      } else if (matchesEdit(e, editKeys.undo)) {
        e.preventDefault()
        coreRef.current?.undo()
      } else if (matchesEdit(e, editKeys.selectAll) && toolRef.current !== null) {
        // Tout sélectionner — seulement quand un outil de la carte est actif
        // (sinon on laisse le ⌘A natif de la page).
        e.preventDefault()
        coreRef.current?.selectAll()
        if (toolRef.current !== 'select') setTool('select')
      } else if (matchesEdit(e, editKeys.duplicate) && selectionRef.current.length > 0) {
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

  // ── Recherche ──
  // Seules les formes NOMMÉES entrent dans l'index : un tracé libre s'appelle
  // « polygon-7 » et n'est un résultat pour personne. Un nom arrive par import
  // GeoJSON ou par `updateShape(id, { title })` — c'est ce qui rend cherchables les
  // périmètres qu'une application réinjecte depuis son backend.
  //
  // Les symboles sont exclus : ils sont déjà indexés comme markers par
  // `<SymbolMarkers>`, avec leur pictogramme et leur libellé de catalogue.
  const drawGroupLabel = useLabels().search.groups.draw
  const searchSource = useId()
  // Pas de cache de normalisation ici, contrairement aux markers et aux formes
  // déclaratives : `getShapes()` reconstruit un `DrawnShape` neuf à chaque appel, donc
  // une `WeakMap` clé sur l'objet n'aurait jamais un seul succès — elle ne ferait que
  // grossir. Les formes dessinées NOMMÉES se comptent en dizaines, pas en milliers.
  const namedShapes = useCallback(
    (): DrawnShape[] => (coreRef.current?.getShapes() ?? []).filter((s) => s.title && s.kind !== 'symbol'),
    [],
  )

  useEffect(() => {
    return engine.search.register({
      query: (needle, opts) => {
        if (opts.group && opts.group !== DRAW_GROUP) return emptyResult()
        const hits: Hit<{ shape: DrawnShape; bounds: Bounds }>[] = []
        for (const s of namedShapes()) {
          const score = scoreMatch(normalizeSearch(s.title!), needle)
          if (score === NO_MATCH) continue
          const bounds = boundsOfLatLngs(s.points)
          if (!bounds) continue
          hits.push({
            item: { shape: s, bounds },
            score,
            distance: opts.origin ? proximityRank(centerOfBounds(bounds), opts.origin) : 0,
          })
        }
        return {
          entries: rankHits(hits, opts.limit).map(({ shape, bounds }) => ({
            group: DRAW_GROUP,
            id: shape.id,
            title: shape.title!,
            position: centerOfBounds(bounds),
            bounds,
            color: shape.style.color,
            select: () => coreRef.current?.select([shape.id]),
          })),
          totals: new Map([[DRAW_GROUP, hits.length]]),
        }
      },
    })
  }, [engine, namedShapes])

  // `rev` bumpe à chaque mutation du core : c'est le seul signal qui dise qu'une forme
  // a été ajoutée, renommée ou supprimée. Il bumpe aussi à chaque frame d'un tracé en
  // cours — d'où la déclaration comparée côté registre plutôt qu'une notification nue.
  useEffect(() => {
    const count = namedShapes().length
    engine.search.report(
      searchSource,
      count > 0 ? [{ id: DRAW_GROUP, label: drawGroupLabel, color: theme.colors.draw.default, count }] : [],
    )
  }, [engine, rev, namedShapes, drawGroupLabel, theme, searchSource])
  useEffect(() => () => engine.search.unreport(searchSource), [engine, searchSource])

  // ── Symboles ──
  const symbolsEnabled = props.symbols?.enabled ?? true
  const symbolCatalog = props.symbols?.catalog ?? MILSYM_CATALOG
  const providedRenderer = props.symbols?.renderer
  const lazyRenderer = useRef<SymbolRenderer | null>(null)
  const [symbolsReady, setSymbolsReady] = useState(false)
  const [affiliation, setAffiliation] = useState('friendly')
  // Palette ouverte, publiée par le bouton (cf. `paletteOpen`) : la barre en a
  // besoin pour son exclusivité visuelle, et c'est l'un des deux déclencheurs du
  // chargement de la symbologie.
  const [paletteOpen, setPaletteOpen] = useState(false)

  // Même exclusivité que la loupe : ouvrir la palette abandonne l'outil de tracé.
  // On ne dessine pas un rectangle en posant un symbole, et deux boutons allumés
  // dans la barre ne diraient plus lequel des deux reçoit le prochain geste.
  useYieldsTool(paletteOpen, toolRef, setTool)
  // Le SDK, une fois chargé, le reste : refermer la palette ne doit pas démonter la
  // couche de symboles ni relancer un téléchargement à la réouverture.
  const graphicsWanted = useRef(false)
  if (paletteOpen) graphicsWanted.current = true

  // Symboles posés. La dépendance est la SIGNATURE des symboles, pas `rev` : ce
  // dernier bumpe à chaque frame d'un tracé en cours, ce qui reconstruisait la liste
  // (et re-diffait toute la couche marker) 60 fois par seconde sans qu'aucun symbole
  // ne bouge.
  const symbolsVersion = coreRef.current?.symbolsVersion() ?? ''
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const symbolShapes = useMemo(() => coreRef.current?.symbolShapes() ?? [], [symbolsVersion])

  // Callback STABLE : `<SymbolMarkers>` le transmet à `onReposition`, qui est dans les
  // deps du `useMemo` des portails. En flèche inline, chaque frame d'un tracé en cours
  // reconstruisait les portails de tous les symboles affichés.
  const moveSymbol = useCallback((id: string, at: LatLng) => coreRef.current?.moveSymbol(id, at), [])

  /**
   * Y a-t-il quelque chose à dessiner en symboles ? Le renderer n'est instancié
   * qu'à cette condition, et c'est tout l'enjeu : `createMilSymRenderer()` lance
   * l'`import()` du SDK MIL-STD (~9 Mo) dans son constructeur. L'appeler depuis le
   * corps du composant — ou depuis un effet sans condition — le téléchargerait au
   * montage de <DrawLayer>, pour toute carte, y compris celles qui n'afficheront
   * jamais un symbole.
   *
   * Les deux déclencheurs légitimes : l'utilisateur ouvre la palette, ou la
   * collection contient déjà des symboles (import GeoJSON, restauration d'état).
   */
  const needsRenderer = symbolsEnabled && (graphicsWanted.current || symbolShapes.length > 0)
  // Le plafond du cache de vignettes vient de la config : sans l'argument, le
  // renderer retombait sur `defaultConfig`, donc `providers.symbols.cacheMaxEntries`
  // n'avait aucun effet sur le chemin par défaut — le seul emprunté en pratique.
  const renderer = needsRenderer
    ? (providedRenderer ??
      (lazyRenderer.current ??= createMilSymRenderer({
        cacheMaxEntries: config.providers.symbols.cacheMaxEntries,
      })))
    : null

  // Disponibilité du graphisme. L'abonnement porte sur le renderer EFFECTIF, celui
  // fourni compris : `SymbolRenderer.ready` est un contrat public, et un catalogue
  // custom asynchrone doit obtenir le rendu qui suit sa résolution comme le
  // catalogue par défaut. Sans lui, ses vignettes resteraient vides indéfiniment.
  useEffect(() => {
    if (!renderer) return
    if (!renderer.ready) {
      setSymbolsReady(true)
      return
    }
    let alive = true
    void renderer.ready.then(() => {
      if (alive) setSymbolsReady(true)
    })
    return () => {
      alive = false
    }
  }, [renderer])

  // Le core en a besoin dès qu'une forme `symbol` existe (import GeoJSON compris).
  useEffect(() => {
    if (coreRef.current) coreRef.current.symbolRenderer = renderer
    // `coreReady` couvre la première création du core, postérieure au premier rendu.
  }, [renderer, coreReady])

  // Dépôt d'une vignette de palette sur la carte → forme `kind: 'symbol'` posée à
  // la coordonnée visée. Le hook lit ses callbacks par ref : la zone n'est pas
  // ré-enregistrée à chaque rendu.
  const placeRef = useRef<(key: string, at: LatLng) => void>(() => {})
  placeRef.current = (key, at) => {
    if (symbolsEnabled) coreRef.current?.placeSymbol(key, at, affiliation)
  }
  useMapDropZone({
    accept: (p) => symbolsEnabled && p.type === SYMBOL_DRAG_TYPE,
    onDrop: (p, latLng) => {
      const key =
        typeof (p.data as { key?: unknown } | undefined)?.key === 'string'
          ? (p.data as { key: string }).key
          : typeof p.id === 'string'
            ? p.id
            : null
      if (key) placeRef.current(key, latLng)
    },
  })

  // Objet de contexte mémoïsé : les consommateurs ne re-rendent que quand l'état
  // réactif change réellement (`rev` bumpe à chaque mutation du core/réglages).
  const api: DrawingApi = useMemo(
    () => ({
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
      getShapes: () => coreRef.current?.getShapes() ?? [],
      getShape: (id) => coreRef.current?.getShape(id) ?? null,
      getLastShape: () => coreRef.current?.getLastShape() ?? null,
      addShape: (shape, opts) => coreRef.current?.addShape(shape, opts),
      updateShape: (id, patch, opts) => coreRef.current?.updateShape(id, patch, opts) ?? false,
      removeShape: (id, opts) => coreRef.current?.removeShape(id, opts) ?? false,
      replaceShapes: (shapes, opts) => coreRef.current?.replaceShapes(shapes, opts),
      // Raccourcis effectifs (défauts + overrides) : dispatch clavier ET tooltips.
      shortcuts: { ...drawKeys, ...props.shortcuts },
      tools: allowed,
      symbols: {
        enabled: symbolsEnabled,
        catalog: symbolCatalog,
        // `null` tant que le renderer n'est pas acquis ou pas prêt : c'est le contrat
        // de `SymbolRenderer.render`, et l'appelant affiche déjà un placeholder.
        render: (key, opts) => renderer?.render(key, { variant: affiliation, ...opts }) ?? null,
        // Reflète le renderer EFFECTIF. Le forcer à `true` sur la simple présence d'un
        // renderer fourni mentirait : le sien peut encore être en cours de chargement.
        ready: symbolsReady,
        affiliation,
        setAffiliation,
        paletteOpen,
        setPaletteOpen,
        place: (key, at, variant) =>
          symbolsEnabled ? (coreRef.current?.placeSymbol(key, at, variant ?? affiliation) ?? null) : null,
      },
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      tool,
      selectMode,
      selection,
      selectionDetails,
      markerSelection,
      rev,
      settings,
      setTool,
      props.shortcuts,
      affiliation,
      symbolsReady,
      symbolsEnabled,
      symbolCatalog,
      renderer,
      paletteOpen,
    ],
  )

  return (
    <DrawingContext.Provider value={api}>
      <DrawPresetsContext.Provider value={presets}>
        {/* Rendu des symboles posés : montée par la couche elle-même, donc rien à
          câbler côté application. Leur état reste dans la collection de dessin.
          Monté seulement quand il y a des symboles ET un renderer — c'est ce qui
          garde la symbologie hors du chargement initial d'une carte qui n'en
          affiche pas. */}
        {renderer && symbolShapes.length > 0 && (
          <SymbolMarkers
            shapes={symbolShapes}
            catalog={symbolCatalog}
            renderer={renderer}
            ready={symbolsReady}
            cluster={props.symbols?.cluster}
            minZoom={props.symbols?.minZoom}
            onMove={moveSymbol}
          />
        )}
        {props.children}
      </DrawPresetsContext.Provider>
    </DrawingContext.Provider>
  )
}
