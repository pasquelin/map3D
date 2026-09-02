import {
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react'
import { type MapEngine, zoomForAltitude } from '../../core/MapEngine'
import { markerTags, type MarkerData } from '../../data/types'
import { LinkLayer as CoreLinkLayer, type DashStyle } from '../../layers/LinkLayer'
import { makeLinkLabelFormatter } from '../../labels/measure'
import { RouteCache } from '../../relations/core/cache'
import { RelationEngine } from '../../relations/core/engine'
import { boundsAround } from '../../relations/core/geo'
import { familyTag } from '../../relations/core/selection'
import type { MapPoint, RelationRule, TravelMode } from '../../relations/core/types'
import type { RoutingProvider } from '../../relations/providers/RoutingProvider'
import { buildRelationMenu, type RelationMenuPresets } from '../../relations/relationMenu'
import {
  buildRelationVisuals,
  HUB_PREFIX,
  RelationGeometryCache,
  type RelationVisualStyle,
} from '../../relations/visuals'
import { markerColorOf, tagColorOf } from '../../theme/colors'
import { RelationContext, type RelationApi, useConfig, useLabels, useMapContext } from '../context'
import { useLayer, useLayerSync, useStatCounter } from '../hooks/useLayer'
import { useRelationInteraction } from '../hooks/useRelationInteraction'
import { renderOrderOf } from '../renderOrder'
import type { MenuItem } from './ContextMenu'

export type RelationLayerProps = {
  /** Règles de relation — c'est ici que l'application injecte son vocabulaire. */
  rules: readonly RelationRule[]
  /**
   * Fournisseur de routage (Google Routes, ou un proxy serveur, ou un factice).
   *
   * Doit être STABLE d'un rendu à l'autre (`useMemo`) : il détermine l'identité du
   * moteur, donc le passer construit en ligne (`provider={createX({…})}`) le
   * recréerait à chaque rendu et effacerait les relations ouvertes.
   *
   * En production, préférer un proxy serveur à un appel direct : les web services
   * Google (Routes v2) n'acceptent PAS les restrictions de clé par référent HTTP —
   * seulement par IP — donc une clé embarquée dans un bundle web est utilisable par
   * un tiers. Le contrat `RoutingProvider` est là pour ça : le core n'en dépend pas.
   */
  provider: RoutingProvider
  /** Épaisseur du trait des liens, en pixels écran. */
  width?: number
  /**
   * Dernier repli de couleur : sert aux relations dont NI la règle ni le marker source
   * ne donnent de couleur (source hors registre, type absent du thème). Jaune, lisible
   * sur satellite comme sur plan.
   *
   * L'ordre est `rule.color` → couleur du marker source → ce repli. Une règle qui
   * déclare sa couleur garde donc le dernier mot (elle exprime un choix explicite de
   * l'application) ; sinon le faisceau prend la couleur du marker d'où il part, ce qui
   * rattache les traits à leur propriétaire sans rien avoir à configurer.
   */
  defaultColor?: string
  /**
   * Pointillé défilant des traits de RECHERCHE — l'équivalent 3D du marching-ants de
   * la sélection. Longueurs et vitesse en pixels écran (`speed` = px/s vers la cible).
   * `false` pour un trait plein.
   *
   * `gapOpacity` : ce qui subsiste entre deux tirets, en fraction de l'opacité du
   * trait — même couleur, simplement effacée. Le trait garde un corps continu, dans
   * SA couleur, et n'a donc pas besoin du contour : un trait pointillé n'en reçoit
   * pas (cf. `casingWidth`).
   *
   * L'itinéraire tracé n'est jamais pointillé : le pointillé dit « candidat en cours
   * d'évaluation », le trait plein dit « voilà le trajet ».
   */
  linkDash?: DashStyle | false
  /**
   * Couleur de l'itinéraire réel : distincte des liens, c'est un autre objet.
   * Violet façon navigation plutôt qu'un bleu — sur imagerie satellite un tracé
   * bleu se confond avec les fleuves et les bassins qu'il longe.
   */
  routeColor?: string
  /**
   * Facteur d'assombrissement du trait survolé (< 1 = plus sombre). On assombrit la
   * couleur de la famille plutôt que d'en imposer une autre : la teinte porte le
   * sens (quelle famille de tags), le survol ne doit pas le brouiller.
   */
  hoverDarken?: number
  /**
   * Rayon du socle posé à plat sous le marker source, en pixels écran. C'est lui
   * qui matérialise la relation et porte la croix qui l'efface : trop petit, la
   * commande devient un jeu d'adresse.
   */
  hubRadius?: number
  /** Contour sombre sous le trait (lisibilité sur imagerie satellite). 0 pour l'ôter. */
  casingWidth?: number
  /** Couleur du contour (défaut : celle des tracés du thème). */
  casingColor?: string
  /** Opacité du lien le moins bien classé — plancher de lisibilité du dégradé de rang. */
  minOpacity?: number
  /**
   * Dérive d'une extrémité au-delà de laquelle temps et itinéraires sont refaits. En
   * dessous, le trait suit le marker mais les chiffres restent : un agent qui avance
   * de 20 m ne justifie pas un appel de routage. 0 pour ne jamais relancer.
   */
  staleMeters?: number
  /**
   * Intervalle minimal entre deux recalculs d'une même relation. Combiné à
   * `staleMeters`, il plafonne le débit d'appels : un véhicule rapide ne peut pas
   * déclencher plus d'un appel par intervalle, quelle que soit sa vitesse.
   */
  refreshIntervalMs?: number
  /**
   * Paliers proposés par le menu d'une famille (« les 3 plus rapides », « dans
   * 500 m »). Choix métier : la bonne échelle dépend de ce qu'on relie.
   */
  menuPresets?: RelationMenuPresets
  /**
   * Au-delà de ce nombre de liens, l'éventail se replie en un trait agrégé — au-delà
   * il devient illisible. Défaut 5.
   */
  fanMaxLegs?: number
  /**
   * 💰 Candidats interrogés par lien affiché en mode « les plus rapides » (défaut 3).
   *
   * Le plus proche à vol d'oiseau n'est pas le plus rapide — sens uniques, fleuve à
   * contourner. On en interroge donc plusieurs et la DURÉE tranche. Chaque unité
   * multiplie la taille de la matrice facturée : à 1, seul le voisinage direct est
   * interrogé, et le résultat cesse d'être « les plus rapides ».
   */
  fastestOversample?: number
  /**
   * Enfants montés dans le contexte de relations. La forme FONCTION reçoit l'API
   * directement : greffer l'entrée de menu sur une couche marker déclarée au même
   * niveau n'oblige alors pas à extraire un composant juste pour `useRelations()`.
   */
  children?: ReactNode | ((api: RelationApi) => ReactNode)
}

/** Un id de marker numérique doit être retenté en nombre auprès du registre. */
const NUMERIC_ID = /^-?\d+$/

/** Palier de zoom courant, tel que le regroupement visuel le lit (cf. `camRef`). */
const camAt = (engine: MapEngine): { zoom: number; step: number } => {
  const zoom = zoomForAltitude(engine.camera.getState().altitude)
  return { zoom, step: Math.round(zoom) }
}

const toMapPoint = (m: MarkerData): MapPoint => ({
  id: String(m.id),
  lat: m.position.lat,
  lng: m.position.lng,
  tags: markerTags(m),
})

/**
 * Moteur de relations : relie un marker à ses voisins par tags, avec distances et
 * durées routières réelles. Monte la couche de rendu, tient l'état, et expose
 * l'API consommée par le menu marker et la barre d'état.
 *
 * Plusieurs markers peuvent porter une relation simultanément ; relancer sur le même
 * marker remplace la sienne sans toucher aux autres.
 */
export function RelationLayer({
  rules,
  provider,
  width: widthProp,
  defaultColor: defaultColorProp,
  linkDash: linkDashProp,
  routeColor: routeColorProp,
  hoverDarken: hoverDarkenProp,
  hubRadius: hubRadiusProp,
  casingWidth: casingWidthProp,
  casingColor,
  minOpacity: minOpacityProp,
  staleMeters: staleMetersProp,
  refreshIntervalMs: refreshIntervalMsProp,
  menuPresets,
  fanMaxLegs,
  fastestOversample: fastestOversampleProp,
  children,
}: RelationLayerProps) {
  const { engine, overlay, theme } = useMapContext()
  const labels = useLabels()
  // Défauts d'apparence dans le THÈME, pas en littéral de prop : une charte doit pouvoir
  // les régler d'un coup. `theme.relations.dash` est une référence stable (le thème est
  // mémoïsé par `MapProvider`), donc `visualStyle` ne se refait pas à chaque rendu.
  const rel = theme.relations
  const width = widthProp ?? rel.width
  const defaultColor = defaultColorProp ?? rel.defaultColor
  const linkDash = linkDashProp ?? rel.dash
  const routeColor = routeColorProp ?? rel.routeColor
  const hoverDarken = hoverDarkenProp ?? rel.hoverDarken
  const hubRadius = hubRadiusProp ?? rel.hubRadius
  const casingWidth = casingWidthProp ?? rel.casingWidth
  const minOpacity = minOpacityProp ?? rel.minOpacity
  // `useConfig()` et NON `engine.config` : au render, le moteur porte encore la config
  // de la frame précédente. `<Map>` la lui pose dans un effet, et les effets d'un
  // enfant s'exécutent AVANT ceux du parent — lire le moteur ici renverrait donc
  // systématiquement la valeur périmée au render où `<Map config>` change, sans que
  // rien ne re-rende ensuite. Le contexte, lui, est la source de vérité React.
  const config = useConfig()

  // Les trois réglages qui pilotent le volume d'appels facturés prennent leur défaut
  // dans la config au lieu d'un littéral : ils étaient écrits ici ET dans le core
  // (`RelationEngine.syncPositions` avait `staleMeters = 0`, soit l'inverse de ce
  // défaut-ci), donc la même carte ne se rafraîchissait pas au même rythme selon le
  // chemin emprunté.
  const routing = config.providers.routing
  const staleMeters = staleMetersProp ?? routing.staleMeters
  const refreshIntervalMs = refreshIntervalMsProp ?? routing.refreshIntervalMs
  const fastestOversample = fastestOversampleProp ?? routing.fastestOversample

  // Le moteur survit aux re-rendus : c'est lui qui porte l'état, pas React.
  // Cache construit avec les réglages de la carte : laissé au défaut de `RouteCache`,
  // régler `providers.routing.cache` (TTL, quantification, plafond) n'aurait aucun
  // effet — or ces trois valeurs décident du nombre d'appels facturés.
  //
  // Dépendre de `routing.cache` et non de `engine` : ce dernier est stable pour toute
  // la vie de la carte, si bien que le cache serait resté figé sur les réglages du
  // montage. `fastestOversample` est volontairement ABSENT des dépendances — le
  // recréer jetterait tout l'état des relations (cf. le `clear()` ci-dessous), donc
  // ferait disparaître les liens affichés et refacturerait leur calcul pour un simple
  // entier changé. Il est poussé au moteur par l'effet qui suit.
  const relationEngine = useMemo(
    () => new RelationEngine(provider, new RouteCache(routing.cache)),
    [provider, routing.cache],
  )
  const version = useSyncExternalStore(relationEngine.subscribe, () => relationEngine.version)
  const snapshots = relationEngine.snapshots

  // Sur-échantillonnage poussé plutôt que passé au constructeur : réglage de volume
  // d'appels, il doit pouvoir changer sans détruire ce qui est déjà calculé.
  useEffect(() => {
    relationEngine.fastestOversample = fastestOversample
  }, [relationEngine, fastestOversample])

  // Requêtes en vol au démontage : sans cet arrêt, elles se poursuivent, sont
  // facturées par le fournisseur de routage, et retiennent le moteur en mémoire.
  useEffect(() => () => relationEngine.clear(), [relationEngine])

  // Réglages de routage poussés au fournisseur. Il est construit par l'application
  // AVANT que la carte n'existe (cf. la doc de la prop `provider`), donc il ne peut
  // pas les lire de lui-même : sans cette ligne, endpoints, FieldMasks,
  // `routingPreference` et politique réseau restaient figés sur `defaultConfig`,
  // quoi qu'on écrive dans `<Map config>`.
  useEffect(() => {
    provider.setConfig?.(routing)
  }, [provider, routing])

  // Init PARESSEUSE (`??=`) pour les deux : `useRef(new X())` construit son argument à
  // CHAQUE render et le jette — le ref ne garde que le premier. Ici c'était un cache de
  // géométries entier alloué puis abandonné à chaque révision de relation.
  /** Géométries mémoïsées, validées par leurs extrémités (cf. `RelationGeometryCache`). */
  const geometryRef = useRef<RelationGeometryCache | null>(null)
  geometryRef.current ??= new RelationGeometryCache()
  const geometry = geometryRef.current
  /** Dernier appel réseau par relation/itinéraire — plafonne le débit de rafraîchissement. */
  const lastRefreshRef = useRef<Map<string, number> | null>(null)
  lastRefreshRef.current ??= new Map<string, number>()
  const lastRefresh = lastRefreshRef.current

  // Palier de zoom courant. Le clustering est stable à zoom entier constant (cf.
  // `ClusterEngine`) : on ne recalcule donc le regroupement visuel qu'au changement
  // de palier, pas à chaque frame d'un mouvement caméra.
  // Initialisé sur la caméra RÉELLE au montage, pas sur un palier supposé : le premier
  // regroupement d'une carte montée en vue globe se calculait sinon au palier 14.
  const [initialCam] = useState(() => camAt(engine))
  const camRef = useRef(initialCam)
  const [clusterTick, bumpCluster] = useReducer((x: number) => x + 1, 0)
  const zoomBand = config.performance.relations.zoomBand
  /** Budgets de la couche relations — identité stable tant que `<Map config>` ne change pas. */
  const relationsPerf = config.performance.relations
  useEffect(() => {
    return engine.on('camera', (state) => {
      const zoom = zoomForAltitude(state.altitude)
      const step = Math.round(zoom)
      // La bande de 0,3 évite que des pattes dimensionnées en pixels ne dérivent
      // visiblement entre deux paliers entiers.
      if (step === camRef.current.step && Math.abs(zoom - camRef.current.zoom) < zoomBand) return
      camRef.current = { zoom, step }
      bumpCluster()
    })
  }, [engine, zoomBand])

  /**
   * Conteneurs DOM des socles, ancrés à la carte par la couche. La barre d'état de
   * chaque relation s'y monte en portail : elle suit alors son marker sans qu'aucune
   * position ne transite par React — c'est le même patron que les nœuds de marker.
   */
  const [hubHosts, setHubHosts] = useState<ReadonlyMap<string, HTMLElement>>(new Map())

  const layerRef = useLayer(
    () =>
      new CoreLinkLayer(
        engine.annotations,
        engine.projection,
        overlay,
        {
          renderOrder: renderOrderOf(config, 'relations', 2),
          casingWidth,
          casingColor: casingColor ?? theme.colors.path.casing,
          hoverDarken,
        },
        (id, el) => setHubHosts((prev) => new Map(prev).set(id.slice(HUB_PREFIX.length), el)),
        (id) =>
          setHubHosts((prev) => {
            const next = new Map(prev)
            next.delete(id.slice(HUB_PREFIX.length))
            return next
          }),
        // Les ancres vivent dans la surface des markers, pas dans l'overlay : c'est le
        // seul moyen de passer devant eux sans réordonner toutes les couches (cf.
        // `slotHost`). Un cluster ne peut plus recouvrir la barre qu'il jouxte.
        engine.labelRenderer.domElement,
      ),
  )
  // Sans ce resync, thème et libellés resteraient figés sur leur valeur au montage :
  // changer de thème ou de langue ne repeindrait pas les liens. La valeur RÉSOLUE est
  // la clé de synchro, jamais la source : `useLayerSync` ne réagit qu'à `value`, donc
  // synchroniser sur `theme` seul laissait un changement de `casingColor` sans effet.
  useStatCounter(layerRef)
  useLayerSync(layerRef, casingColor ?? theme.colors.path.casing, (layer, c) => layer.setDefaults({ casingColor: c }))
  useLayerSync(layerRef, hoverDarken, (layer, v) => layer.setDefaults({ hoverDarken: v }))
  useLayerSync(layerRef, casingWidth, (layer, v) => layer.setDefaults({ casingWidth: v }))

  const formatLink = useMemo(() => makeLinkLabelFormatter(labels), [labels])

  /**
   * Marker du registre par son id. Le core normalise les ids en `string` alors que le
   * registre les indexe tels quels : une clé numérique doit être retentée en nombre,
   * sinon un marker à `id: 3` devient introuvable.
   */
  const findMarker = useCallback(
    (id: string): MarkerData | null =>
      engine.markers.markerById(id) ?? (NUMERIC_ID.test(id) ? engine.markers.markerById(Number(id)) : null),
    [engine],
  )

  /**
   * Couleur effective des TRAITS d'une relation : celle de son marker source, telle
   * que le thème la donne à son type — donc EXACTEMENT celle de sa pastille, des parts
   * de cluster et des lignes de liste (`markerColorOf`, résolveur unique de la lib).
   *
   * Résolue À LA DEMANDE, jamais figée dans la règle remise au moteur : un marker qui
   * change de type (un agent qui passe « en route ») change de couleur, et son faisceau
   * doit suivre sans qu'on ait à rouvrir la relation.
   */
  const colorFor = useCallback(
    (rule: RelationRule, sourceId: string): string => {
      if (rule.color) return rule.color
      const marker = findMarker(sourceId)
      return marker ? markerColorOf(theme, marker.type).base : defaultColor
    },
    [findMarker, theme, defaultColor],
  )

  /**
   * Couleur d'une FAMILLE — celle de ses pastilles (menu du marker, bascule de la
   * barre d'état). Répond à « cette famille vise quoi ? », là où la couleur d'un trait
   * répond à « ce faisceau part de qui ? » (`colorFor`).
   *
   * À défaut de `rule.color`, elle vient du TAG visé par la règle, résolu exactement
   * comme dans le panneau « Couches » (`tagColorOf`). L'application n'a donc rien à
   * déclarer de plus : la table de couleurs
   * de tags qu'elle donne déjà au thème sert les deux surfaces, et une famille
   * « Alertes » porte la même pastille que le tag `alert` du panneau.
   *
   * Sans cela, toutes les familles d'un même marker tombaient sur `defaultColor` — un
   * même jaune répété, qui ne distinguait plus rien.
   */
  const familyColor = useCallback(
    (rule: RelationRule): string => {
      if (rule.color) return rule.color
      const tag = familyTag(rule.to)
      return tag === null ? defaultColor : tagColorOf(theme, tag)
    },
    [theme, defaultColor],
  )

  /** Portée maximale toutes règles confondues — ne dépend pas de la source. */
  const reach = useMemo(() => Math.max(...rules.map((r) => r.selection.maxMeters), 0), [rules])

  /** Voisinage interrogeable autour d'un point, clusters inclus (registre d'inventaire). */
  const candidatesAround = useCallback(
    (source: MapPoint): MapPoint[] => {
      // La source n'est pas exclue ici : `selectTargets` le fait déjà, et le refaire
      // coûterait un second passage sur tout le voisinage.
      return engine.markers.markersInBounds(boundsAround(source, reach)).map(toMapPoint)
    },
    [engine, reach],
  )

  const run = useCallback(
    (source: MapPoint, rule: RelationRule) => {
      void relationEngine.open(source, rule, candidatesAround(source))
    },
    [relationEngine, candidatesAround],
  )

  const menuFor = useCallback(
    (marker: MarkerData): MenuItem[] => {
      const source = toMapPoint(marker)
      return buildRelationMenu({
        source,
        candidates: candidatesAround(source),
        rules,
        labels,
        // La pastille du menu désigne une FAMILLE de cibles, pas le trait qui en
        // sortira : elle porte donc la couleur de la famille, jamais celle du marker
        // source — qui rendrait les familles d'un même marker toutes identiques.
        // Passée à part, jamais écrite dans la règle : celle remise au moteur doit
        // rester telle que l'application l'a déclarée, sinon la couleur du marker
        // source n'aurait plus la main sur les traits.
        colorOf: familyColor,
        onRun: (rule) => run(source, rule),
        presets: menuPresets ?? routing.presets,
        // Le compteur du menu doit sur-échantillonner comme le moteur, sinon
        // l'avertissement « sélection trop large » se déclenche au mauvais seuil.
        fastestOversample,
      })
    },
    [candidatesAround, rules, labels, run, familyColor, menuPresets, fastestOversample, routing.presets],
  )

  /**
   * Résout un point par son id. Le core normalise les ids en `string` alors que le
   * registre les indexe tels quels : une clé numérique doit être retentée en nombre,
   * sinon un marker à `id: 3` deviendrait introuvable et son lien disparaîtrait.
   */
  const resolvePoint = useCallback(
    (id: string): MapPoint | null => {
      const found = findMarker(id)
      return found ? toMapPoint(found) : null
    },
    [findMarker],
  )

  // Les markers vivent : un lien doit rester accroché à ses deux extrémités. Sans
  // cela, un marker qui se déplace laisse derrière lui un trait figé dont on ne sait
  // plus à qui il s'adresse.
  useEffect(() => {
    return engine.markers.onItemsChanged(() => {
      const { moved, staleSources, staleTraces } = relationEngine.syncPositions(resolvePoint, staleMeters)
      if (!moved) return

      // Rafraîchissement plafonné : la dérive déclenche, l'intervalle borne le débit.
      // Sans cette seconde condition, un véhicule sur voie rapide franchirait le seuil
      // toutes les quelques secondes et lancerait un appel à chaque fois.
      const now = Date.now()
      const due = (key: string): boolean => {
        if (now - (lastRefresh.get(key) ?? 0) < refreshIntervalMs) return false
        lastRefresh.set(key, now)
        return true
      }
      // Refaire la matrice d'une relation dont on regarde justement l'itinéraire est
      // du gaspillage : le tracé porte la donnée que l'utilisateur a sous les yeux, et
      // la matrice repartira au prochain franchissement de seuil.
      const tracedSources = new Set(staleTraces.map((id) => relationEngine.sourceOf(id)))
      for (const sourceId of staleSources) {
        if (tracedSources.has(sourceId)) continue
        const state = relationEngine.snapshotFor(sourceId)
        if (state && due(`matrix:${sourceId}`)) run(state.source, state.rule)
      }
      for (const id of staleTraces) {
        if (due(`route:${id}`)) void relationEngine.trace(id, true)
      }
      // Les relations disparues emportent leur compteur de débit : sans cette purge,
      // la table accumule une entrée par source et par lien vus depuis le montage.
      if (lastRefresh.size > 0) {
        const live = new Set<string>()
        for (const s of relationEngine.snapshots) {
          live.add(`matrix:${s.source.id}`)
          for (const l of s.links) live.add(`route:${l.id}`)
        }
        for (const key of lastRefresh.keys()) {
          if (!live.has(key)) lastRefresh.delete(key)
        }
      }
    })
    // `lastRefresh` est l'objet Map lui-même, d'identité définitive (init paresseuse) :
    // le lister ne rejoue rien, mais rend la dépendance explicite.
  }, [engine, relationEngine, resolvePoint, staleMeters, refreshIntervalMs, run, lastRefresh])

  const visualStyle = useMemo(
    (): RelationVisualStyle => ({ width, routeColor, hubRadius, minOpacity, dash: linkDash || null }),
    [width, routeColor, hubRadius, minOpacity, linkDash],
  )

  const visualNodeOf = useCallback((id: string) => engine.markers.visualNodeOf(id), [engine])

  // Gestes (survol, clic, Échap) : le composant orchestre le moteur et le rendu, le
  // hook traduit les entrées en intentions.
  const hoveredId = useRelationInteraction(engine, overlay, layerRef, relationEngine)

  // Traduction état → visuels. Le diff par id de `LinkLayer` absorbe ce qui n'a pas
  // bougé, et le cache de géométrie garantit l'identité des tableaux de points — sans
  // elle, ce diff conclurait « géométrie changée » à chaque passe.
  const visuals = useMemo(
    () =>
      buildRelationVisuals(
        snapshots,
        {
          style: visualStyle,
          labels,
          formatLink,
          hoveredId,
          zoom: camRef.current.zoom,
          visualNodeOf,
          colorOf: (snapshot) => colorFor(snapshot.rule, snapshot.source.id),
          fanMaxLegs: fanMaxLegs ?? relationsPerf.fanMaxLegs,
          perf: relationsPerf,
        },
        geometry,
      ),
    // `version` et `clusterTick` sont les dépendances réelles restantes : le moteur
    // mute ses instantanés en place, et le regroupement visuel dépend du palier de zoom.
    //
    // `colorFor` en fait désormais partie, et elle dépend du thème : recomposer le thème
    // à chaque rendu (objet littéral passé à `<MapProvider theme>`) referait TOUS les
    // visuels de TOUTES les relations à chaque rendu de l'hôte. `MapProvider` le mémoïse,
    // donc l'invariant tient — c'est lui qu'il faut préserver, pas ce tableau.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      version,
      clusterTick,
      hoveredId,
      snapshots,
      visualStyle,
      labels,
      formatLink,
      visualNodeOf,
      colorFor,
      fanMaxLegs,
      relationsPerf,
    ],
  )

  useLayerSync(layerRef, visuals, (layer, v) => layer.setLinks(v))

  // La règle (« un tracé survit au changement de mode ») vit dans le moteur : ici on
  // ne fait que lui fournir le voisinage, qu'il n'a aucun moyen de résoudre seul.
  const setMode = useCallback(
    (sourceId: string, mode: TravelMode) => {
      const state = relationEngine.snapshotFor(sourceId)
      if (state) relationEngine.setMode(sourceId, mode, candidatesAround(state.source))
    },
    [relationEngine, candidatesAround],
  )

  const api = useMemo(
    (): RelationApi => ({
      rules,
      menuFor,
      run,
      snapshots,
      setMode,
      hubHosts,
      routeColor,
      familyColor,
      untrace: (id) => relationEngine.untrace(id),
      clear: (sourceId) => relationEngine.clear(sourceId),
    }),
    // `version` : le moteur mute ses instantanés en place, l'API doit suivre.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [rules, menuFor, run, snapshots, setMode, hubHosts, routeColor, familyColor, relationEngine, version],
  )

  return (
    <RelationContext.Provider value={api}>
      {typeof children === 'function' ? children(api) : children}
    </RelationContext.Provider>
  )
}
