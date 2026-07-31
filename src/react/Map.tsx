import { type CSSProperties, type Ref, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react'
import type { CameraState } from '../core/Camera'
import type { ImmersionLevel } from '../core/pedestrianState'
import { type InteractiveMode, MapEngine, type MapMode, WHEEL_SURFACE_ATTR } from '../core/MapEngine'
import { readStoredJSON, removeStoredKey, writeStoredJSON } from '../core/storage'
import type { Viewport } from '../data/types'
import type { LatLng } from '../shared'
import { injectStyles } from '../style/injectStyles'
import { themeToVars } from '../style/themeToVars'
import { configToVars } from '../style/configToVars'
import type { PartialConfig } from '../config/types'
import type { PartialLabels } from '../labels/types'
import type { MapTheme, ThemeInput } from '../theme/types'
import { MapProvider } from './MapProvider'
import { DragOverlay } from './components/DragOverlay'
import { DropdownProvider } from './components/Dropdown'
import { MapContext, useConfig, useTheme } from './context'
import type { MapHandle, MapSurfaces } from './mapConfig'
import {
  type BridgedApis,
  LensHost,
  type MarkerMenuOf,
  MapSurfaces as MapSurfacesHost,
  RelationsHost,
  lensOf,
} from './MapSurfaces'

export type MapProps<T = unknown, TPin = unknown> = {
  /** Position initiale. Une position mémorisée (`positionStorageKey`) la remplace. */
  center: LatLng
  /** Zoom initial (échelle Web Mercator : 0 = monde, ~21 = niveau rue). */
  zoom: number
  /** Clé Google Maps Platform → Photorealistic 3D Tiles en direct (prioritaire sur Ion). */
  googleMapsApiKey?: string
  /** Token Cesium Ion → Google Photorealistic 3D Tiles via Cesium. */
  cesiumIonToken?: string
  /** Asset Cesium Ion (défaut 2275207 = Google Photorealistic 3D Tiles). */
  cesiumIonAssetId?: string
  /**
   * Type de carte au démarrage. Défaut : `'plan'` (fond 2D Google) dès que
   * `googleMapsApiKey` est fourni, sinon `'3d'`. `'3d'` explicite pour démarrer sur
   * les tuiles photoréalistes.
   */
  mapMode?: MapMode
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
  /** Clé localStorage de l'état des plugins (`null` = pas de persistance). Défaut : `config.data.storageKeys.plugins`. */
  pluginStorageKey?: string | null
  /**
   * Interactivité (défaut `true`). `'view'` fige la caméra en gardant markers et
   * sélection vivants ; `false` rend la carte inerte. Dans les deux cas figés les
   * outils (dessin, loupe) sont neutralisés. Overlays, markers, formes et tracés
   * restent RENDUS — c'est bien une carte, pas une capture d'écran.
   */
  interactive?: InteractiveMode
  /**
   * La carte est **exploitable** : la projection résout des hauteurs, un `fitBounds`
   * vise le sol réel. Appelé une seule fois, et immédiatement si la carte l'était
   * déjà. Pour simplement récupérer le moteur, `useMap()` suffit — il est
   * disponible dès le montage, sans attendre les tuiles.
   */
  onReady?: (engine: MapEngine) => void
  /** Cadre visible après stabilisation de la caméra — à brancher sur un refetch. */
  onViewportChange?: (viewport: Viewport) => void
  /** Position caméra à chaque mouvement (haute fréquence : ne pas y faire de réseau). */
  onCameraChange?: (camera: CameraState) => void
  /** Classe du conteneur racine, en plus de `m3d-root`. */
  className?: string
  /** Styles du conteneur racine. La carte remplit 100 % de son parent. */
  style?: CSSProperties
  /**
   * Poignée impérative de la carte (cf. `MapHandle`) : de quoi cadrer, dessiner ou
   * interroger **depuis l'extérieur**, sans écrire de composant enfant pour
   * atteindre un hook.
   */
  ref?: Ref<MapHandle>
  /**
   * Thème : un thème unique, un couple `{ light, dark }`, ou rien (thème neutre).
   * Déclaré ici, la carte monte sa propre racine de thème — pas de `<MapProvider>`
   * à poser autour.
   */
  theme?: ThemeInput
  /** `'auto'` (défaut) suit `prefers-color-scheme` et se met à jour en direct. */
  colorScheme?: 'dark' | 'light' | 'auto'
  /** Traductions (merge profond sur `defaultLabels`) — cf. LABELS.md. */
  labels?: PartialLabels
  /**
   * Réglages : fournisseurs tiers (endpoints, langue, quotas), seuils de geste,
   * budgets de calcul, cadence de chargement. Merge profond sur `defaultConfig` —
   * ne fournir que ce qui change. Cf. `MapConfig`.
   *
   * ```tsx
   * <Map config={{ providers: { tiles: { language: 'en-GB', region: 'GB' } },
   *                interaction: { dragSlopPx: 16, longPressMs: 400 } }} />
   * ```
   */
  config?: PartialConfig
} & MapSurfaces<T, TPin>

type StoredPosition = { lat: number; lng: number; altitude: number }

const readStoredPosition = (key: string): StoredPosition | null => {
  const p = readStoredJSON(key) as Partial<StoredPosition> | null
  return p && Number.isFinite(p.lat) && Number.isFinite(p.lng) && Number.isFinite(p.altitude)
    ? { lat: p.lat!, lng: p.lng!, altitude: p.altitude! }
    : null
}

/**
 * Carte 3D complète : canvas, moteur, interface et couches — tout se règle en props.
 *
 * Monte sa propre racine de thème dès qu'on lui passe `theme`, `colorScheme` ou
 * `labels`, ce qui dispense d'un `<MapProvider>` autour. Ce dernier reste exporté
 * pour le cas où PLUSIEURS cartes doivent partager un thème, ou pour des composants
 * hors carte qui lisent le thème : monté au-dessus, il continue de s'appliquer.
 */
/**
 * Rythme des déplacements caméra, posé depuis `theme.animations`. Appliqué à la
 * création du moteur ET à chaque thème remplacé à chaud (bascule clair/sombre,
 * charte chargée après coup) : un seul point pour que les deux ne divergent pas.
 */
const applyAnimations = (eng: MapEngine, a: MapTheme['animations']): void => {
  eng.camera.flyDuration = a.flyDuration
  eng.camera.flyEasing = a.flyEasing
  eng.camera.panDuration = a.pan
  eng.camera.zoomDuration = a.zoom
  eng.topDownDuration = a.topDown
  eng.globeDuration = a.globe
}

export function Map<T = unknown, TPin = unknown>(props: MapProps<T, TPin>) {
  const { theme, colorScheme, labels, config } = props
  // Structure conditionnelle assumée : passer de « avec thème » à « sans thème » sur
  // une carte montée remonterait l'arbre. Personne ne fait ça — un thème est un choix
  // de départ, et la bascule clair/sombre passe par `colorScheme`, pas par sa présence.
  if (theme !== undefined || colorScheme !== undefined || labels !== undefined || config !== undefined) {
    return (
      <MapProvider theme={theme} colorScheme={colorScheme} labels={labels} config={config}>
        <MapBody {...props} />
      </MapProvider>
    )
  }
  return <MapBody {...props} />
}

/** Corps de la carte — sous la racine de thème, qu'elle vienne de nous ou de l'hôte. */
function MapBody<T = unknown, TPin = unknown>(props: MapProps<T, TPin>) {
  const theme = useTheme()
  const config = useConfig()
  const containerRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const overlayRef = useRef<HTMLDivElement>(null)
  const [engine, setEngine] = useState<MapEngine | null>(null)

  // Écrit UNE fois (cf. `MarkerLayer`) : deux littéraux jumeaux se désynchronisent
  // en silence dès qu'on ajoute un callback à l'un sans penser à l'autre.
  const cbs = {
    onViewportChange: props.onViewportChange,
    onCameraChange: props.onCameraChange,
    onReady: props.onReady,
  }
  const cbRef = useRef(cbs)
  cbRef.current = cbs
  const interactive = props.interactive ?? true
  const interactiveRef = useRef(interactive)
  interactiveRef.current = interactive
  // La config sert à la CRÉATION du moteur (effet ci-dessous, volontairement non
  // dépendant d'elle : la recréer sur un changement de seuil rechargerait toutes les
  // tuiles). Les mises à jour à chaud passent par `setConfig`, plus bas.
  const configRef = useRef(config)
  configRef.current = config

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
      oceanColor: theme.globe.oceanColor,
      hazeColor: theme.globe.hazeColor,
      // ⚠️ Ces quatre-là n'étaient PAS transmises : le moteur retombait donc toujours sur
      // `defaultTheme`, et un hôte qui changeait la couleur de ses bâtiments ne voyait
      // rien. Comme `oceanColor`, elles sont lues au montage — la géométrie extrudée les
      // porte, elle ne se repeint pas.
      buildingColor: theme.globe.buildingColor,
      buildingRoofColor: theme.globe.buildingRoofColor,
      buildingRoofLighten: theme.globe.buildingRoofLighten,
      buildingSunAzimuth: theme.globe.buildingSunAzimuth,
      buildingShadeMin: theme.globe.buildingShadeMin,
      buildingHoverColor: theme.globe.buildingHoverColor,
      buildingSelectColor: theme.globe.buildingSelectColor,
      googleMapsApiKey: props.googleMapsApiKey,
      cesiumIonToken: props.cesiumIonToken,
      cesiumIonAssetId: props.cesiumIonAssetId,
      mapMode: props.mapMode,
      fallbackGlobe: props.fallbackGlobe ?? true,
      errorTarget: props.errorTarget,
      intro: stored ? false : props.intro,
      tagStorageKey: props.tagStorageKey,
      pluginStorageKey: props.pluginStorageKey,
      config: configRef.current,
      fov: config.camera.fov,
    })
    applyAnimations(eng, theme.animations)
    // Appliqué AVANT `start()` : une carte montée figée ne doit pas être navigable,
    // même une frame (l'effet de synchro plus bas ne tourne qu'après le rendu).
    if (interactiveRef.current !== true) eng.setInteractive(interactiveRef.current)
    if (stored) eng.camera.jumpTo(stored, stored.altitude)

    const rect = container.getBoundingClientRect()
    // Repli quand le conteneur n'est pas encore mesuré : il fixe le premier aspect
    // de la caméra, donc la première projection (cf. `startup.fallbackSize`).
    const [fw, fh] = configRef.current.startup.fallbackSize
    eng.setSize(rect.width || fw, rect.height || fh)
    eng.start()

    const offReady = eng.on('ready', (e) => cbRef.current.onReady?.(e))
    const offCam = eng.on('camera', (s) => cbRef.current.onCameraChange?.(s))
    const offVp = eng.on('viewport', (v) =>
      cbRef.current.onViewportChange?.({
        bounds: v.bounds,
        center: v.center,
        zoom: v.zoom,
      }),
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
            writeStoredJSON(posKey, {
              lat: s.lat,
              lng: s.lng,
              altitude: s.altitude,
            })
          }, configRef.current.data.positionSaveDebounceMs)
        })
      : null
    const ro = new ResizeObserver(() => {
      const r = container.getBoundingClientRect()
      // Conteneur masqué (display:none, onglet inactif, panneau replié, transition) :
      // on IGNORE la mesure au lieu de propager 0. La dernière taille valide reste en
      // vigueur, donc la caméra ne traverse pas d'état dégénéré et rien n'est
      // reprojeté pour rien ; au retour à l'écran, le vrai resize suit.
      // (`setSize` planche de son côté — ceci évite en plus le rendu 1×1 transitoire.)
      if (r.width < 1 || r.height < 1) return
      eng.setSize(r.width, r.height)
    })
    ro.observe(container)

    setEngine(eng)
    return () => {
      offReady()
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

  // Bascule à chaud (une vue qui passe en lecture seule sans se démonter).
  useEffect(() => {
    engine?.setInteractive(interactive)
  }, [engine, interactive])

  // `mapMode` piloté depuis l'extérieur. Il n'était lu qu'à la CONSTRUCTION : une appli
  // qui le changeait ensuite n'obtenait rien, sans rien pour le lui dire. L'effet ne se
  // rejoue que si la prop change, donc il ne contredit jamais le bouton de la barre.
  useEffect(() => {
    if (props.mapMode) engine?.setMapMode(props.mapMode)
  }, [engine, props.mapMode])

  // Réglages à chaud : un passage souris → tactile, un quota revu, un budget de
  // tuiles ajusté n'ont aucune raison de reconstruire la scène.
  useEffect(() => {
    engine?.setConfig(config)
  }, [engine, config])

  // Rythme des déplacements caméra. Posé aussi à la création (l'effet du moteur ne
  // dépend pas du thème), mais un thème remplacé à chaud — bascule clair/sombre,
  // charte chargée après coup — doit se propager sans remonter la carte.
  useEffect(() => {
    if (engine) applyAnimations(engine, theme.animations)
  }, [engine, theme.animations])

  // Thème ET config : l'échelle d'empilement vient de la seconde (contrainte
  // d'intégration, pas d'apparence — cf. `configToVars`).
  const vars = useMemo(() => ({ ...themeToVars(theme), ...configToVars(config) }), [theme, config])
  const style: CSSProperties = { ...(vars as CSSProperties), ...props.style }
  // Options de loupe extraites de la barre (`toolbar.lens`) : c'est la carte qui la
  // monte, parce qu'elle seule enveloppe tout l'arbre.
  const lens = lensOf(props.toolbar)

  // Valeur de contexte mémoïsée — 60 sites la consomment. Un littéral en JSX en
  // recréait l'identité à chaque render de l'hôte : sans barrière `memo` sous la carte
  // ça ne coûtait rien encore, mais ça neutralisait d'avance la première qu'on poserait.
  // `overlayRef.current` est écrit au montage sur un div rendu inconditionnellement,
  // donc l'objet ne change plus qu'avec le moteur ou le thème.
  const overlay = overlayRef.current
  const mapCtx = useMemo(() => (engine && overlay ? { engine, overlay, theme } : null), [engine, overlay, theme])

  // APIs qui vivent dans les contextes internes, recopiées par `ApiBridge`.
  const apis = useRef<BridgedApis>({
    drawing: null,
    lens: null,
    relations: null,
  })
  // Accesseurs plutôt que valeurs figées : la poignée est créée avec le moteur, mais
  // le dessin et la loupe se montent après elle — les capturer maintenant les
  // gèlerait à `null` pour toute la vie de la carte.
  useImperativeHandle(
    props.ref,
    // `null` tant que le moteur n'existe pas (premier rendu) : la poignée n'a rien à
    // offrir avant, et mentir avec un objet vide masquerait un appel trop précoce.
    () =>
      (engine
        ? {
            engine,
            camera: engine.camera,
            // Composé à la lecture, comme `drawing`/`lens` : `state` doit rendre l'état de
            // l'INSTANT de l'appel, pas celui de la création de la poignée.
            get pedestrian() {
              return {
                state: engine.getPedestrian(),
                enterPlacement: () => engine.enterPedestrianPlacement(),
                enter: (p: LatLng) => engine.enterPedestrian(p),
                exit: () => engine.exitPedestrian(),
                setImmersion: (level: ImmersionLevel) => engine.setPedestrianImmersion(level),
              }
            },
            get drawing() {
              return apis.current.drawing
            },
            get lens() {
              return apis.current.lens
            },
            get relations() {
              return apis.current.relations
            },
          }
        : null) as MapHandle,
    [engine],
  )

  return (
    <div
      ref={containerRef}
      className={`m3d-root${props.className ? ` ${props.className}` : ''}`}
      data-theme={theme.colorScheme}
      style={style}
    >
      <canvas ref={canvasRef} />
      {/* Surface carte : la molette au-dessus des formes/du marquee zoome la carte. */}
      <div ref={overlayRef} className="m3d-overlay" {...{ [WHEEL_SURFACE_ATTR]: '' }} />
      {mapCtx && (
        <MapContext.Provider value={mapCtx}>
          {/* La loupe enveloppe l'arbre : elle FOURNIT son contexte (bouton de barre,
              `useLens()`) et les couches montées dessous — dessin compris — le
              consomment. C'est ce sens de lecture qui permet à `<DrawLayer>` de
              porter seul l'exclusivité des outils. Ses options viennent de
              `toolbar.lens` : la loupe se règle là où son bouton apparaît, mais son
              montage reste ici, seul endroit qui enveloppe tout l'arbre. */}
          {/* Les relations enveloppent TOUT, loupe comprise : c'est ce qui permet à
              l'inventaire de la loupe et au panneau de sélection d'offrir le même
              menu qu'un marker, entrées de relations comprises. `LensHost` monte
              la loupe dessous et lui lie ce menu (un hook, donc pas ici). */}
          {/* Exclusivité des surfaces déroulantes. Monté ICI et pas dans une barre :
              elles sont réparties entre `<Toolbar>` (style, réglages, symboles) et
              `<MapControls>` (couches, templates), et deux barres ne peuvent pas
              s'accorder sans un registre qui les enveloppe toutes les deux. */}
          <DropdownProvider>
            <RelationsHost relations={props.relations}>
              <LensHost<T> lens={lens} markerMenu={props.markerMenu as MarkerMenuOf}>
                <MapSurfacesHost {...props} apis={apis} />
              </LensHost>
            </RelationsHost>
          </DropdownProvider>
          <DragOverlay />
        </MapContext.Provider>
      )}
    </div>
  )
}
