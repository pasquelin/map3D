import {
  type DockConfig,
  type DrawConfig,
  type LatLng,
  Map,
  type MapEngine,
  type MapHandle,
  type MapSurfaces,
  type MarkerData,
  type PartialConfig,
  type RelationsConfig,
  type SearchEntry,
  altitudeForZoom,
  boundsOfMarkers,
  boundsOfShapes,
  createGoogleRoutesProvider,
  markerGroupId,
  markersLayer,
  shapesLayer,
  useBuildingEnrichment,
} from 'map3d'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { ConfigPane } from './components/ConfigPane'
import { DrawDebug } from './components/DrawDebug'
import { MapErrorBoundary } from './components/MapErrorBoundary'
import { StatsOverlay } from './components/StatsOverlay'
import { clusterTip, markerTip } from './components/tooltips'
import { CESIUM_ION_TOKEN, GOOGLE_MAPS_KEY, TILE_ORIGIN } from './config/env'
import { clusterTypeLabel, markerLabel } from './config/labels'
import { createBuildingMenu } from './config/buildingMenu'
import { createMarkerMenu } from './config/markerMenus'
import { RELATION_RULES } from './config/relations'
import { loadStoredPartial } from './config/configSchema'
import { type MapPropsSettings, defaultMapProps, toInteractiveMode } from './config/mapProps'
import { SELECTION_RING, theme } from './config/theme'
import {
  CONTROL_BUTTONS,
  CONTROL_GROUPS,
  DRAW_TOOLS,
  SELECT_MODES,
  TOOLBAR_SECTIONS,
  type UiSettings,
  defaultUiSettings,
  enabledKeys,
  hiddenOnly,
} from './config/uiSettings'
import { CITY_LIST, PARIS, TEST_POINT } from './data/cities'
import { DEMO_SHAPES, MAX_DRAW_AREA_M2 } from './data/shapes'
import type { AnyData } from './data/types'
import { type DataSettings, defaultDataSettings, useDemoScene } from './hooks/useDemoScene'
import { useEditablePin } from './hooks/useEditablePin'
import { useFavorites } from './hooks/useFavorites'
import { clusterTypeIcon } from './icons/clusterIcons'
import { iconFor } from './icons/markerIcons'
import { demoPlugin } from './plugins/demoPlugin'

/**
 * Preuve vivante de la plateforme plugins (voie A + config + enrichBuilding) : lit
 * `useBuildingEnrichment()`, alimenté par `demoPlugin` au clic sur un bâtiment 3D interne.
 * Monté en enfant de `<Map>` pour hériter du contexte carte qu'exige le hook.
 */
function DemoBuildingInfo() {
  const enrichment = useBuildingEnrichment()
  if (enrichment.loading) return <div className="demo-enrich">Chargement…</div>
  if (enrichment.error) return <div className="demo-enrich">Erreur : {enrichment.error.message}</div>
  if (!enrichment.data) return null
  return (
    <div className="demo-enrich">
      {Object.entries(enrichment.data).map(([k, v]) => (
        <div key={k}>
          <b>{k}</b> : {String(v)}
        </div>
      ))}
    </div>
  )
}

/**
 * Réglages de départ : le dernier état stocké, complété par l'origine du serveur de
 * tuiles auto-hébergé lue dans `.env`.
 *
 * Injectée dans l'état INITIAL, et non en aval de `<Map config>` : c'est ce même état que
 * le panneau affiche et modifie, donc l'origine y est visible, surchargeable, et
 * persistée comme n'importe quel autre réglage. Un choix déjà stocké n'est jamais écrasé.
 */
function initialConfig(): PartialConfig {
  const stored = loadStoredPartial()
  if (!TILE_ORIGIN || stored.providers?.internal?.origin) return stored
  const { providers } = stored
  return { ...stored, providers: { ...providers, internal: { ...providers?.internal, origin: TILE_ORIGIN } } }
}

/**
 * Démo de la lib : une carte, ses données, son interface — tout se déclare en props
 * de `<Map>`.
 *
 * Ce fichier n'est plus QUE cet assemblage : les points vivent dans `data/`, les
 * réglages dans `config/`, l'état applicatif dans `hooks/`, les surfaces propres à
 * la démo dans `components/`.
 */
export function App() {
  // Poignée de la carte : les callbacks `onShape*` sont déclarés AU-DESSUS de la
  // carte et ont pourtant besoin du CRUD par identité. Une `ref` suffit — plus de
  // composant enfant à écrire pour aller chercher un hook.
  const map = useRef<MapHandle>(null)
  // `MapConfig` en entier, piloté par le panneau Tweakpane (cf. `ConfigPane`). Le
  // panneau n'émet que l'ÉCART aux défauts, donc cet état est exactement ce qu'une
  // application écrirait à la main dans `config={{ … }}`. Il repart du dernier
  // réglage stocké : régler puis recharger la page ne perd rien.
  const [config, setConfig] = useState<PartialConfig>(initialConfig)
  // Ce que `MapConfig` ne couvre pas : les props de `<Map>` (thème clair/sombre,
  // fond, interactivité) — même panneau, onglet « Carte ».
  const [mapProps, setMapProps] = useState<MapPropsSettings>(defaultMapProps)
  // Moteur, capté à `ready` : le panneau doit SUIVRE la carte, pas seulement la piloter.
  const [engine, setEngine] = useState<MapEngine | null>(null)
  /* Le mode de carte a DEUX pilotes : le champ « fond » du panneau et les boutons 2D/3D
     de la barre. Sans cet abonnement, cliquer un bouton laissait le panneau afficher le
     mode précédent — et le réafficher au prochain rendu aurait ramené la carte en arrière.
     On ne réécrit l'état que sur changement réel : sinon chaque frame re-rendrait. */
  useEffect(() => {
    if (!engine) return
    return engine.on('basemap', (b) =>
      setMapProps((prev) => (prev.mapMode === b.mode ? prev : { ...prev, mapMode: b.mode })),
    )
  }, [engine])
  // Les réglages ❄ (fov, antialias, taille de repli, clés de stockage, asset Ion, et
  // les props marquées ci-dessus) sont lus à la CONSTRUCTION du moteur : seule une
  // remontée les fait prendre.
  const [mapKey, setMapKey] = useState(0)
  const [selected, setSelected] = useState<string>()

  const { pinMarker, onReposition } = useEditablePin()
  // Le point éditable traverse le même pipeline que les jeux de `data/` : il se
  // retouche et se supprime depuis le panneau comme n'importe quel autre marker.
  const pinned = useMemo(() => [pinMarker], [pinMarker])
  // Composition de la scène : effectifs, bascules, cadence du flux, puis ajouts,
  // retraits et retouches faits à la main (cf. `useDemoScene`).
  const [data, setData] = useState<DataSettings>(defaultDataSettings)
  const scene = useDemoScene(data, pinned)
  // Surfaces d'interface montées par `<Map>` : présence, position, et le découpage au
  // bouton près (cf. `uiSettings`). Piloté par l'onglet « Interface ».
  const [ui, setUi] = useState<UiSettings>(defaultUiSettings)

  // Alertes + agents + point éditable dans un SEUL layer → clusterisés ensemble
  // (comme la référence). Les défibrillateurs y entrent aussi : ils sont `static`,
  // donc la lib les masque sous `markers.staticMinZoom` — au-dessus, ils clusterisent
  // et prennent leur part de camembert comme n'importe quel type.
  const allMarkers: MarkerData<AnyData>[] = scene.markers
  const selectedMarker = useMemo(
    () => (selected === undefined ? undefined : allMarkers.find((m) => String(m.id) === selected)),
    [allMarkers, selected],
  )
  // Cible de « poser une alerte » : lue à l'appel, pas capturée — la vue a bougé
  // entre la construction du panneau et le clic.
  const centerOfView = useCallback((): LatLng | null => {
    const state = map.current?.camera.getState()
    return state ? { lat: state.lat, lng: state.lng } : null
  }, [])
  // Cadrages de démo. Ils vivaient dans un menu posé DANS la barre d'outils — donc
  // inatteignables dès qu'on retirait la barre, ce que le panneau permet maintenant.
  //
  // La scène est lue par une ref, comme `centerOfView` juste au-dessus : en dépendre
  // recréerait ces cinq closures à chaque tick du flux, alors qu'elles ne servent
  // qu'au clic — et le `camera` du panneau changerait d'identité 3 fois par seconde.
  const sceneRef = useRef(scene)
  sceneRef.current = scene
  const demoCamera = useMemo(
    () => ({
      flyToCity: (index: number) => {
        const city = CITY_LIST[index]
        if (city) map.current?.camera.flyTo(city.center, { altitude: altitudeForZoom(city.zoom) })
      },
      // `minAltitude` sous le défaut « recherche de lieu » (350 m) : un groupe de
      // markers resserré resterait sinon cadré trop haut.
      fitAlerts: () => {
        const b = boundsOfMarkers(sceneRef.current.markers)
        if (b) map.current?.camera.fitBounds(b, { padding: 60, minAltitude: 120 })
      },
      // Padding asymétrique : le contenu se centre dans la zone RESTÉE visible.
      fitZones: () => {
        const b = boundsOfShapes(DEMO_SHAPES)
        if (b) map.current?.camera.fitBounds(b, { padding: { left: 320, top: 40, right: 40, bottom: 40 } })
      },
      recenter: () => map.current?.camera.panTo(TEST_POINT),
      setZoom: (zoom: number) => map.current?.camera.setZoom(zoom),
    }),
    [],
  )
  const cityLabels = useMemo(() => CITY_LIST.map((c) => c.label), [])

  /* Le clair/sombre ne s'arrête pas au canvas : la page et la colonne du panneau
     l'encadrent. Sans cela, basculer sur « clair » donnait une carte claire sertie dans
     un chrome sombre — la moitié visible de la bascule. Le schéma est posé sur la racine
     et le CSS (cf. `index.html`) en dérive le fond ET les variables de Tweakpane.

     `auto` est résolu ici comme `MapProvider` le résout de son côté : c'est la même
     question posée au même média. */
  useEffect(() => {
    const root = document.documentElement
    if (mapProps.colorScheme !== 'auto') {
      root.dataset['scheme'] = mapProps.colorScheme
      return
    }
    const media = window.matchMedia('(prefers-color-scheme: light)')
    const apply = () => (root.dataset['scheme'] = media.matches ? 'light' : 'dark')
    apply()
    media.addEventListener('change', apply)
    return () => media.removeEventListener('change', apply)
  }, [mapProps.colorScheme])

  /* Props d'INTERFACE mémoïsées sur la tranche de réglages qui les commande.
     Écrites en littéral, elles étaient reconstruites à chaque tick du flux temps réel
     — six `filter`/`Object.fromEntries` sur ~55 clés trois fois par seconde, et un
     `groupOrder` neuf qui invalidait un mémo de la boîte de recherche. Rien de tout
     cela ne change entre deux positions d'agents. */
  const toolbarProp = useMemo(
    () =>
      ui.toolbar.enabled && {
        position: ui.toolbar.position,
        minZoom: ui.toolbar.minZoom,
        tools: enabledKeys(DRAW_TOOLS, ui.toolbar.tools),
        selectModes: enabledKeys(SELECT_MODES, ui.toolbar.selectModes),
        components: hiddenOnly(TOOLBAR_SECTIONS, ui.toolbar.sections),
        // La loupe se règle DANS la barre, là où son bouton apparaît. `lens: false` la
        // retirerait. La liste (MarkerList) est partagée avec le panneau de sélection,
        // et « Cibler » est natif : `actions` ne ferait qu'y ajouter.
        lens: ui.toolbar.lens && {
          getId: (m: MarkerData<AnyData>) => m.id,
          markerTypeLabel: clusterTypeLabel,
          renderItem: markerLabel,
        },
      },
    [ui.toolbar],
  )

  const controlsProp = useMemo(
    () =>
      ui.controls.enabled && {
        position: ui.controls.position,
        buttons: hiddenOnly(CONTROL_BUTTONS, ui.controls.buttons),
        components: hiddenOnly(CONTROL_GROUPS, ui.controls.groups),
        // `target` fournie = bouton « revenir à la cible » ; omise = pas de bouton.
        // `onlyWhenOutOfView` : il n'apparaît qu'une fois la cible sortie de l'écran.
        target: ui.controls.target
          ? { position: TEST_POINT, label: 'Revenir au point de contrôle', onlyWhenOutOfView: true }
          : undefined,
      },
    [ui.controls],
  )

  const searchProp = useMemo(
    () =>
      ui.search && {
        groupOrder: ['agent-available', 'agent-enroute', 'agent-onsite'].map(markerGroupId),
        onSelect: (entry: SearchEntry) => console.log('[search] choisi', entry.group, entry.id, entry.title),
      },
    [ui.search],
  )

  const clusterProp = useMemo(
    () => ui.cluster && { typeIcon: clusterTypeIcon, typeLabel: clusterTypeLabel, tooltip: clusterTip },
    [ui.cluster],
  )
  // Les favoris se déclarent avant les menus : l'entrée « Épingler » lit leur état
  // et les bascule, elle ne tient aucun état à elle.
  const favorites = useFavorites(allMarkers)
  // L'effectif est lu à l'OUVERTURE du menu (`() => sceneRef.current.agents`), pas
  // capturé : en dépendre refabriquerait le menu — donc la prop `markerMenu` de
  // `<Map>` — trois fois par seconde, pour une liste de noms qui ne bouge pas.
  const menuFor = useMemo(
    () =>
      createMarkerMenu({
        agents: () => sceneRef.current.agents,
        isPinned: favorites.isPinned,
        togglePin: favorites.togglePin,
      }),
    [favorites.isPinned, favorites.togglePin],
  )

  /* Menu commun aux trois surfaces qui en proposent un (le marker sur la carte,
     l'inventaire de la loupe, le panneau de sélection). Les deux listings y ajoutent
     « Cibler » d'eux-mêmes ; le second argument porte les entrées du moteur de
     relations. */
  /* Menu d'un bâtiment du volume 3D interne. La poignée est passée par REF : le menu se
     fabrique une fois, et lit la caméra au moment du clic. */
  const buildingMenu = useMemo(() => createBuildingMenu(map), [])
  // Plateforme plugins : liste mémoïsée une fois — `demoPlugin` est la seule preuve
  // vivante embarquée par l'exemple (jamais publiée, cf. `plugins/demoPlugin.tsx`).
  const plugins = useMemo(() => [demoPlugin()], [])

  const markerMenu = useCallback<NonNullable<MapSurfaces<AnyData>['markerMenu']>>(
    (m, relations) => {
      const rel = relations?.menuFor(m) ?? []
      const own = menuFor(m)
      return rel.length === 0 ? own : [...own, { separator: true }, ...rel]
    },
    [menuFor],
  )

  // Fournisseur de routage : la clé reste côté client (cette lib n'a pas de backend).
  // Sans clé, les appels échouent et les étiquettes affichent « Temps indisponible » —
  // jamais une distance à vol d'oiseau déguisée en temps de trajet.
  const routesProvider = useMemo(() => createGoogleRoutesProvider({ apiKey: GOOGLE_MAPS_KEY ?? '', region: 'fr' }), [])

  /* Les trois dernières props d'interface, mémoïsées comme les quatre précédentes.
     Écrites en littéral, elles étaient reconstruites à chaque tick du flux — et
     `draw.constraints` fait re-jouer un effet de `DrawLayer` à chaque fois qu'elle
     change d'identité, soit trois fois par seconde pour des contraintes constantes. */
  const dockProp = useMemo<DockConfig<MarkerData<AnyData>> | undefined>(
    () =>
      ui.dock
        ? {
            items: favorites.items,
            size: 88,
            onPin: favorites.onPin,
            onUnpin: favorites.onUnpin,
            onReorder: favorites.onReorder,
            onPinClick: (item) => setSelected(String(item.id)),
            tooltip: (item) => (item.data ? markerTip(item.data) : null),
          }
        : undefined,
    [ui.dock, favorites.items, favorites.onPin, favorites.onUnpin, favorites.onReorder],
  )

  const relationsProp = useMemo<RelationsConfig | undefined>(
    () =>
      ui.relations
        ? {
            rules: RELATION_RULES,
            provider: routesProvider,
            // La barre d'état est montée avec le moteur ; on ne fournit que de quoi
            // nommer un point, ce que la lib ne peut pas deviner. La scène est lue par
            // la ref : nommer un point est un geste, pas un rendu — en dépendre
            // referait cette prop trois fois par seconde.
            statusBar: {
              nameOf: (p) => {
                const m = sceneRef.current.markers.find((x) => String(x.id) === p.id)
                return m ? markerLabel(m) : p.id
              },
            },
          }
        : undefined,
    [ui.relations, routesProvider],
  )

  const drawProp = useMemo<false | DrawConfig>(
    () =>
      ui.draw && {
        // `value` accepterait un jeu de formes initial (verrouillables) ; la démo
        // part d'une page blanche pour qu'aucun tracé ne se confonde avec les zones.
        onChange: (g) => console.log('[draw] change — GeoJSON complet (ce que reçoit l’API) :', g),
        onSelectionChange: (ids, markerIds) => console.log('[draw] selection', ids, markerIds),
        // Démo du CRUD par identité : à la création, un « backend » simulé renvoie
        // un uuid qu'on rattache à la forme via `meta`, en `silent` pour ne pas
        // relancer un cycle d'events.
        onShapeAdd: (s) => {
          console.log('[draw] + forme', s.id, s.kind, s.points.length, 'pts')
          const uuid = `zone-${s.id}`
          // `title` est un champ de la forme (pas de `meta`) : c'est lui qui la
          // rend cherchable sous la rubrique « Dessins », dès qu'elle est tracée.
          map.current?.drawing?.updateShape(s.id, { title: `Zone ${s.kind} ${s.id}`, meta: { uuid } }, { silent: true })
          console.log('[draw]   uuid rattaché :', map.current?.drawing?.getShape(s.id)?.meta)
        },
        onShapeUpdate: (s) => console.log('[draw] ~ forme', s.id, s.meta),
        onShapeDelete: (s) => console.log('[draw] − forme', s.id, s.meta),
        onShapeEdit: (s) => console.log('[draw] ✎ double-clic → ouvrir la fiche de', s.meta ?? s.id),
        // Contraintes métier : toute forme doit tenir dans la zone d'une ville et ne
        // pas dépasser le plafond d'aire. Le périmètre lui-même est affiché par la
        // couche de formes — `limits` ne sert qu'à contraindre, pas à dessiner.
        constraints: { limits: DEMO_SHAPES, maxAreaM2: MAX_DRAW_AREA_M2 },
        onReject: (reason, s) =>
          console.warn(
            reason === 'outOfLimits'
              ? `[draw] refusé : le ${s.kind} sort de la zone autorisée`
              : `[draw] refusé : le ${s.kind} dépasse ${MAX_DRAW_AREA_M2 / 1e6} km²`,
          ),
        // Vignettes de sélection : montées d'office par la lib, on ne fournit que
        // les libellés métier (titre d'un marker, nom d'un type).
        selectionBadges: {
          markerTypeLabel: clusterTypeLabel,
          renderMarker: markerLabel,
          // Comme la loupe : le menu commun suffit.
        },
      },
    [ui.draw],
  )

  return (
    // Carte et banc de réglages côte à côte : la carte prend ce qui reste, le panneau
    // sa colonne. Le panneau ne recouvre donc rien — et la carte se REDIMENSIONNE
    // quand il s'ouvre, ce qu'un flottant ne fait pas (`ResizeObserver` côté lib).
    <div style={{ display: 'flex', flexDirection: 'row', gap: 0, width: '100%', height: '100%' }}>
      {/* Le panneau persiste ses réglages et la carte les relit au montage : un réglage
          qui la fait échouer se rejouerait donc à chaque rechargement, et le bouton
          « Tout réinitialiser » vit DANS le panneau — c'est-à-dire derrière la panne.
          `key` sur la frontière AUSSI : « Recharger la carte » rejoue alors une carte
          neuve plutôt que de laisser l'écran d'erreur en place. */}
      <MapErrorBoundary key={mapKey}>
        <Map
          ref={map}
          // `width:'auto'` écrase le `width:100%` de `.m3d-root` : en flex item, il
          // ferait déborder la carte au lieu de la laisser partager la ligne.
          style={{ flex: '1 1 0%', width: 'auto', minWidth: 0 }}
          theme={theme}
          googleMapsApiKey={GOOGLE_MAPS_KEY || undefined}
          cesiumIonToken={CESIUM_ION_TOKEN || undefined}
          center={PARIS}
          zoom={14}
          // Le cas d'usage type : gater un cadrage sur la disponibilité de la carte.
          // Avant `ready`, `fitBounds` viserait l'ellipsoïde nu — pas le sol réel.
          onReady={(e) => {
            setEngine(e)
            // Moteur exposé sur `window` : c'est un BANC D'ESSAI, et pouvoir interroger la
            // scène depuis la console (tuiles en vol, near/far, état piéton) vaut mieux que
            // de recompiler une sonde à chaque question. N'existe que dans l'exemple.
            ;(window as unknown as { __m3d?: MapEngine }).__m3d = e
            console.log('[map] ready — altitude sol connue, cadrage fiable', e.getView().zoom)
          }}
          // Props hors `MapConfig` (thème clair/sombre, fond, interactivité) : réglées
          // dans l'onglet « Carte » du panneau. Celles marquées ❄ n'y prennent effet
          // qu'après le bouton « Recharger la carte » — elles sont lues à la
          // construction du moteur.
          colorScheme={mapProps.colorScheme}
          interactive={toInteractiveMode(mapProps.interactive)}
          mapMode={mapProps.mapMode}
          fallbackGlobe={mapProps.fallbackGlobe}
          intro={mapProps.intro}
          errorTarget={mapProps.errorTarget}
          // Réglages : entièrement délégués au panneau. Ce qui s'y trouve n'est plus
          // écrit ici mais SE RÈGLE, y compris le seuil de lisibilité du décor
          // (`markers.staticMinZoom`) et le plafond de regroupement
          // (`clustering.maxZoom`) qui figuraient en dur à cette place.
          config={config}
          // ── Regroupement COMMUN : une seule pastille pour ce qui se superpose à
          // l'écran, markers de l'app ET symboles posés confondus. Son apparence se
          // déclare donc ici, une fois, et non dans une couche qui n'en commande qu'une
          // partie. `false` le couperait ; une couche s'en retire avec `cluster: { enabled: false }`.
          cluster={clusterProp}
          // ── Interface : tout se déclare ici. `<Map>` monte les surfaces dans le bon
          // ordre d'imbrication (loupe > dessin > barre > relations > couches), un
          // savoir qui appartient à la lib et non à l'application.
          // Barre d'outils et contrôles : découpés par l'onglet « Interface » du panneau,
          // jusqu'à l'outil et au bouton près (cf. `toolbarProp` / `controlsProp`). Les
          // commandes de démo ne sont PLUS dans la barre — un menu qui la règle depuis un
          // de ses propres boutons disparaissait avec elle.
          toolbar={toolbarProp}
          controls={controlsProp}
          // Recherche UNIFIÉE. Les rubriques carte (alertes, agents, zones, dessins,
          // symboles) ne se déclarent pas : les couches s'inscrivent d'elles-mêmes dès
          // qu'un élément porte un `title`. Ne restent ici que les réglages de la boîte
          // — le géocodeur (Google Places par défaut, via `googleMapsApiKey`) et
          // l'ordre des rubriques carte. « Lieux » ouvre toujours la liste.
          search={searchProp}
          // Favoris : long-press sur un marker → glisser dans la barre du bas. Clic sur
          // une pastille = vol caméra + sélection. × ou glisser-hors = retrait.
          // SANS cette prop, plus aucune zone n'accepte un marker : les markers cessent
          // d'être saisissables, au lieu d'offrir un geste qui n'aboutirait nulle part.
          // La dock reste CONTRÔLÉE : `useFavorites` tient les ids et leur ordre.
          dock={dockProp}
          // Moteur de relations : la lib le monte AUTOUR des couches de markers, ce qui
          // fait arriver « Distance autour › » dans leur menu (2ᵉ argument de `menu`).
          // Ce n'est pas une couche — il ne rend rien de lui-même.
          relations={relationsProp}
          draw={drawProp}
          // ── Menu d'un marker, déclaré UNE fois pour les trois surfaces qui en
          // proposent un : le marker sur la carte, l'inventaire de la loupe et le
          // panneau de sélection. Les deux listings y ajoutent « Cibler » d'eux-mêmes.
          // Le second argument porte les entrées du moteur de relations.
          markerMenu={markerMenu}
          // Menu d'un bâtiment du volume interne. L'entrée qui arme l'outil n'apparaît
          // qu'en 3D interne, ce que `basemap.canPickBuildings` décide seul — inutile de
          // conditionner cette prop.
          buildingMenu={buildingMenu}
          // Plateforme plugins : hub (bouton puzzle) + dev panel + markers procéduraux
          // + enrichissement au pick, entièrement portés par `demoPlugin`.
          plugins={plugins}
          // ── Couches de données, dans l'ordre de rendu. Les fabriques `shapesLayer` /
          // `markersLayer<T>` rendent le typage sur VOS données, que le tableau
          // hétérogène ne peut pas porter seul.
          layers={[
            // `limits` (contraintes du dessin) ne prend que DEMO_SHAPES : les bâtiments
            // et les volumes sont là pour l'œil, ils n'autorisent aucune zone.
            shapesLayer({ shapes: scene.shapes }),
            markersLayer<AnyData>({
              points: allMarkers,
              getId: (m) => m.id,
              selectedId: selected,
              // TOUT marker est sélectionnable : le dock sélectionne déjà n'importe quel
              // type au clic (`onPinClick`), restreindre ici aux agents donnait deux
              // comportements pour un même marker selon qu'on le clique sur la carte ou
              // dans les favoris. Une AFFECTATION, jamais un `return` prématuré : sortir
              // sans rien écrire laisserait l'anneau sur le marker précédent.
              onSelect: (m) => setSelected(m ? String(m.id) : undefined),
              // `size` n'est PAS passé : la couche prend `theme.markers.size`, seule
              // source de la taille. L'anneau en dérive (cf. `SELECTION_RING`).
              selectionRing: SELECTION_RING,
              icon: iconFor,
              // Tous les markers sont saisissables au long-press (dépôt dans le dock).
              // `pin-editable` porte en plus `repositionable` sur SA donnée : les deux
              // gestes y cohabitent, la saisie partant de l'ICÔNE et le
              // repositionnement du POINT AU SOL.
              draggable: true,
              onReposition: (m, latLng) => {
                console.log('[marker] reposition', m.id, latLng)
                onReposition(latLng)
              },
              // Nomme un type UNE fois : rubriques de la recherche et vignettes de
              // sélection. Le camembert, lui, se nomme sur `<Map cluster>` — il agrège
              // les points de TOUTES les couches, donc aucune d'elles ne le commande.
              typeLabel: clusterTypeLabel,
              // `tooltip` reste ici parce que ces infobulles sont RICHES (avatar,
              // badges, statut). Un marker qui se contente d'un titre n'a besoin de
              // rien : `MarkerData.title` suffit à le rendre survolable ET cherchable.
              tooltip: markerTip,
            }),
          ]}
        >
          {/* La sonde consomme `useDrawing()`, qui EXIGE la couche de dessin : la monter
            sans elle jette. La case du panneau ne suffit donc pas, la couche doit être
            là — c'est aussi pourquoi le panneau la grise quand le dessin est coupé. */}
          {ui.draw && ui.drawDebug && <DrawDebug />}
          {/* Moniteur perf : monté DANS la carte pour s'ancrer en haut à droite de
              `.m3d-root`. Il lit le renderer public (capté à `ready`), donc `engine`
              peut être encore null au premier rendu — le composant l'attend. */}
          {ui.stats && <StatsOverlay engine={engine} />}
          {/* Preuve vivante de l'enrichissement au pick : lit `useBuildingEnrichment()`,
              qui EXIGE le contexte carte — doit rester enfant de `<Map>`. */}
          <DemoBuildingInfo />
        </Map>
      </MapErrorBoundary>
      {/* Banc d'essai : `MapConfig` en entier, les props hors config, et la scène.
          Hors de `<Map>` — il la pilote par ses props, il n'a besoin d'aucun contexte
          carte. */}
      <ConfigPane
        engine={engine}
        initial={config}
        onChange={setConfig}
        onRemount={() => setMapKey((k) => k + 1)}
        mapProps={mapProps}
        onMapPropsChange={setMapProps}
        ui={ui}
        onUiChange={setUi}
        camera={demoCamera}
        cityLabels={cityLabels}
        data={data}
        onDataChange={setData}
        scene={scene}
        selected={selectedMarker}
        onSelect={setSelected}
        centerOfView={centerOfView}
      />
    </div>
  )
}
