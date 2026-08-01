import { type CSSProperties, type ReactNode, useCallback, useEffect, useId, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { type ClusterContributor, type ClusterPlacement, NO_PLACEMENT } from '../../core/ClusterRegistry'
import type { MarkerLayer as CoreMarkerLayer, OverlayItem } from '../../layers/MarkerLayer'
import type { LatLng } from '../../shared'
import { markerTags } from '../../data/types'
import type { DataSource, MarkerData } from '../../data/types'
import { useLiveData } from '../hooks/useLiveData'
import { useTagSelection } from '../hooks/useTags'
import { useEntriesSignature } from '../hooks/useEntriesSignature'
import { useOverlayLayer } from '../hooks/useOverlayLayer'
import { useVisibleMarkers } from '../hooks/useVisibleMarkers'
import { useTagRegistry } from '../hooks/useTagRegistry'
import { useMarkerRegistries } from '../hooks/useMarkerRegistries'
import { createTitleCache } from '../../search/match'
import { useConfig, useMapContext } from '../context'
import { ContextMenu, type MenuItem } from './ContextMenu'
import { DefaultMarker } from './DefaultMarker'
import { hasTipContent, MarkerTip } from './MarkerTip'
import { useDismiss } from './useDismiss'
import { markerColorOf } from '../../theme/colors'
import { MarkerContent } from './MarkerContent'

export type MarkerLayerProps<T> = {
  /** Markers à afficher. Exclusif avec `source`, qui les charge selon la vue. */
  points?: MarkerData<T>[]
  /** Source viewport-driven (rechargée au déplacement, gate `minZoom`). */
  source?: DataSource<MarkerData<T>>
  /** Clé stable d'un marker (défaut `p.id`) : elle décide de l'identité, donc du tween. */
  getId?: (p: MarkerData<T>) => string | number
  /**
   * Participation de CETTE couche au regroupement (défaut : elle participe).
   *
   * Un cluster est une propriété de la CARTE, pas d'une couche : l'index est unique
   * et vit dans `<ClusterSurface>`, alimenté par toutes les couches. Il n'y a donc
   * rien à régler ici — l'algorithme est dans `config.clustering` (rayon, seuils,
   * éventail) et l'apparence des pastilles sur `<Map cluster>`.
   *
   * `{ enabled: false }` retire la couche du regroupement : ses markers restent
   * posés un par un, quoi qu'il y ait autour (un point de suivi qu'on veut toujours
   * voir seul).
   */
  cluster?: { enabled: boolean }
  /** Icône **SVG** (markup) d'un marker, rendue en `<img>` DOM ancrée à la carte. */
  icon?: (p: MarkerData<T>) => string
  /**
   * Libellé lisible d'un type (`'agent'` → « Agents ») : **nom de rubrique dans la
   * recherche** et sous-titre des lignes de liste. Un type se nomme ici, une fois.
   *
   * Le nom d'un type DANS UNE PASTILLE de cluster est ailleurs : une pastille peut
   * agréger plusieurs couches, donc c'est la carte qui le fournit
   * (`<Map cluster={{ typeLabel }}>`).
   */
  typeLabel?: (type: string) => string
  /**
   * Infobulle au survol d'un marker : `title` et `content` acceptent tout
   * ReactNode (texte, HTML, composants — avatar, badges…). `null` = pas
   * d'infobulle pour ce marker. L'info vit AU SURVOL — le clic est réservé aux
   * actions (menu contextuel, sélection).
   *
   * **Surcharge** : sans cette prop, l'infobulle se construit d'elle-même à partir de
   * `MarkerData.title` / `titleColor` / `content`. Fournie, elle décide seule — y
   * compris pour rendre `null`. À réserver aux titres que du texte ne peut pas dire.
   */
  tooltip?: (p: MarkerData<T>) => { title?: ReactNode; content?: ReactNode } | null
  /** Menu contextuel d'un marker (clic droit, et bouton « … » des listes). */
  menu?: (p: MarkerData<T>) => MenuItem[]
  /** Marker sélectionné — **contrôlé** : la couche ne le change jamais d'elle-même. */
  selectedId?: string | number
  /** Marker suivi par la caméra ; elle reste centrée dessus tant qu'il est fourni. */
  followId?: string | number
  /**
   * Sélection changée. La règle est uniforme : **tout clic qui ne sélectionne pas un
   * marker rend `null`** — carte nue comme cluster. `selectedId` étant contrôlé, la
   * couche ne peut pas le vider elle-même : elle signale, l'application décide.
   *
   * Sans traiter le cas `null`, l'anneau ne partirait qu'en cliquant un autre marker,
   * et survivrait à l'ouverture d'un cluster — y compris quand le marker sélectionné
   * est justement celui qui vient d'y être absorbé.
   */
  onSelect?: (p: MarkerData<T> | null) => void
  /** Diamètre (px) du marker (défaut: `theme.markers.size`). */
  size?: number
  /**
   * Diamètre (px) de l'anneau de multi-sélection (défaut: `size + 4`). À régler
   * quand l'icône SVG occupe moins que sa boîte (ex. pastille à 58/80 du sprite)
   * pour que l'anneau reste collé au visuel.
   */
  selectionRing?: number
  /**
   * Rend les markers **saisissables au long-press** pour le drag-and-drop
   * (ex. dépôt dans `<PinnedDock>`). `true` active tous les markers ; une fonction
   * cible sélectivement. Le clic normal (sélection/menu) reste préservé ; le ghost
   * accroché au curseur réutilise l'icône du marker. Les clusters ne sont jamais
   * saisissables.
   */
  draggable?: boolean | ((p: MarkerData<T>) => boolean)
  /**
   * Markers **repositionnables** : appui + déplacement les fait suivre la surface,
   * le relâchement livre la nouvelle position à `onReposition`.
   *
   * Le cas normal est de laisser cette prop vide et de porter le drapeau sur la
   * DONNÉE (`MarkerData.repositionable`) : dans un même jeu, seuls certains markers
   * sont éditables. Cette prop sert à trancher globalement (`true`/`false`) ou selon
   * un critère externe au marker — elle **prime** alors sur le champ de la donnée.
   *
   * À ne pas confondre avec `draggable` (drag-and-drop à payload, vers un dock).
   * Les deux cohabitent tant que la tige est affichée : le repositionnement part
   * alors du **point au sol**, la saisie vers le dock part de l'**icône**. Sans tige
   * (`leaderLine={false}`) il n'y a plus qu'une surface de préhension, et le
   * repositionnement prend le pas sur `draggable`.
   */
  repositionable?: boolean | ((p: MarkerData<T>) => boolean)
  /** Nouvelle position au relâchement — à répercuter dans vos données. */
  onReposition?: (p: MarkerData<T>, latLng: LatLng) => void
  /** Position suivie en continu pendant le geste (aperçu live, champ de formulaire). */
  onRepositionMove?: (p: MarkerData<T>, latLng: LatLng) => void
  /**
   * Tige verticale + point au sol, le contenu étant soulevé au-dessus de la
   * position (défaut `true`) : un badge d'alerte reste lisible sans masquer le point
   * qu'il marque. À passer à `false` quand l'icône DOIT coïncider avec sa
   * coordonnée — c'est le cas des symboles tactiques, dont le point d'ancrage est
   * porté par le graphisme lui-même.
   */
  leaderLine?: boolean
  /**
   * Marge (px écran) au-delà du cadre au-delà de laquelle un marker est **masqué**
   * (`display:none`) : le navigateur cesse d'en calculer le style, la mise en page et
   * la composition. Défaut : 200 px. `0` désactive le cull.
   *
   * Un marker déjà affiché n'est pas démonté pour autant — son nœud et son portail
   * React restent. Un marker créé hors cadre, lui, n'entre jamais dans le document
   * (le `CSS2DRenderer` n'insère l'élément qu'au premier rendu visible) : sur la
   * démo, 9 ancres dans le DOM au lieu de 32. Le tri z du `CSS2DRenderer` continue en
   * revanche de porter sur tout ce qui est monté, et la vraie borne reste de ne pas
   * charger la donnée lointaine (`source` cadrée sur le viewport).
   *
   * Un marker masqué sort aussi de la sélection au marquee : hors cadre d'au moins
   * cette marge, aucun rectangle tracé à l'écran ne peut l'atteindre.
   */
  cullMargin?: number
  /**
   * Zoom en deçà duquel les markers `static` de CETTE couche disparaissent, à la
   * place de `config.markers.staticMinZoom` — une couche de décor et une couche
   * d'alertes n'ont pas le même horizon de lisibilité.
   *
   * Un marker qui déclare `static: { minZoom }` garde le dernier mot : le seuil est
   * une propriété de l'objet posé avant d'être un réglage de couche.
   */
  staticMinZoom?: number
}

/** SVG → data-URI, idempotent (une source déjà encodée passe telle quelle). */
export const svgToDataUri = (svg: string): string =>
  svg.startsWith('data:') ? svg : `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`

/** Le marker se décrit-il lui-même (cf. `MarkerData.title` / `content`) ? */
const hasOwnTip = <T,>(m: MarkerData<T>): boolean => m.title != null || m.content != null

/**
 * Infobulle déduite de la DONNÉE, quand la couche n'en fournit pas. `titleColor`
 * évite à l'appelant d'écrire du JSX pour la seule chose qu'un titre a besoin
 * d'exprimer au-delà de son texte : sa gravité.
 */
const tipFromData = <T,>(m: MarkerData<T>): { title?: ReactNode; content?: ReactNode } | null => {
  if (!hasOwnTip(m)) return null
  return {
    title:
      m.title == null ? undefined : <span style={m.titleColor ? { color: m.titleColor } : undefined}>{m.title}</span>,
    content: m.content,
  }
}

export function MarkerLayer<T>(props: MarkerLayerProps<T>) {
  const { engine, theme } = useMapContext()
  // Contexte et non `engine.config` : au render, le moteur porte encore les réglages
  // de la frame précédente (cf. `useConfig`).
  const config = useConfig()
  const getId = props.getId ?? ((p: MarkerData<T>) => p.id)

  const { data: sourceData } = useLiveData<MarkerData<T>>(props.source)
  const rawPoints = props.points ?? sourceData

  // Tags garantis (cf. `markerTags`). Identité ET allocation évitées dans le cas
  // courant « tout est taggé » (flux temps réel : un tick de données ne coûte rien ici).
  const allPoints = useMemo(() => {
    if (!rawPoints.some((p) => !p.tags)) return rawPoints
    return rawPoints.map((p) => (p.tags ? p : { ...p, tags: markerTags(p) }))
  }, [rawPoints])

  // Filtre « Couches » : appliqué avant TOUT le reste, gate de zoom et contribution au
  // regroupement compris — un calque décoché disparaît aussi des pastilles. Recalculé
  // uniquement au changement des points ou de la sélection de calques.
  const tagFilter = useTagSelection()
  // Pipeline de visibilité (filtre tags + gate de zoom des statiques + exemptions
  // sélection/suivi) — cf. `useVisibleMarkers`.
  const { points, rendered } = useVisibleMarkers(
    allPoints,
    tagFilter,
    props.selectedId,
    props.followId,
    props.staticMinZoom,
    config.markers.staticMinZoom,
    getId,
  )

  // Registre du panneau « Couches » : tags portés par TOUS les points (même masqués).
  const tagSource = useId()
  /** Clé de cette couche dans le registre de recherche (deux couches coexistent). */
  const searchSource = useId()
  /** Clé de cette couche dans le registre de regroupement — cf. `ClusterContributor.key`. */
  const clusterSource = useId()
  useTagRegistry(tagFilter, tagSource, allPoints)

  /** Ce que la surface de clusters a décidé pour cette couche — cf. `ClusterPlacement`. */
  const placementRef = useRef<ClusterPlacement>(NO_PLACEMENT)
  const entriesRef = useRef(new Map<string | number, MarkerData<T>>())
  /** Points visibles (filtre tags appliqué) par id — `info()` du registre + prune. */
  const pointsByIdRef = useRef(new Map<string | number, MarkerData<T>>())

  const [openMenu, setOpenMenu] = useState<string | number | null>(null)
  const closeMenu = useCallback(() => setOpenMenu(null), [])
  /** Marker survolé (infobulle) — id de nœud du portail. */
  const [hoverId, setHoverId] = useState<string | number | null>(null)
  /** Version des DONNÉES : deux jeux de clés identiques ne portent pas forcément les
   *  mêmes markers (position, `urgent`, avatar). Entre dans la signature. */
  const pointsRevRef = useRef(0)
  /** Version des entrées : `recompute` mute `entriesRef` hors cycle React — ce
   *  compteur re-rend les portails (flags new/urgent). */
  const [entriesRev, signature] = useEntriesSignature()
  /** Markers `new` déjà cliqués : leur sonar est éteint pour la session. */
  const [seenNew, setSeenNew] = useState<ReadonlySet<string | number>>(new Set())

  const markerSize = props.size ?? theme.markers.size

  const ringSize = props.selectionRing ?? markerSize + 4
  // Un avatar remplit tout le gabarit : son anneau part de la taille du marker, sans
  // le facteur de pastille que `selectionRing` porte pour les sprites.
  const avatarRing = markerSize + 12

  // Instantané du rendu courant, écrit UNE fois : les deux littéraux jumeaux d'avant
  // devaient être édités symétriquement à chaque champ ajouté, et un oubli laissait
  // un champ figé à sa valeur du premier rendu — sans que le typage n'en dise rien.
  const snapshot = {
    points,
    /** `points` moins les statiques masqués par le zoom — ce qui est POSÉ sur la carte. */
    rendered,
    getId,
    ringSize,
    avatarRing,
    onSelect: props.onSelect,
    menu: props.menu,
    typeLabel: props.typeLabel,
    // Via ref : le portail est mémoïsé, un handler redéfini à chaque rendu ne doit
    // pas le faire recalculer (il n'est pas dans ses dépendances).
    onReposition: props.onReposition,
    onRepositionMove: props.onRepositionMove,
    leaderLine: props.leaderLine,
    cullMargin: props.cullMargin,
    // Dans l'instantané comme le reste : les closures longue durée de ce fichier
    // (recompute, réglage de la couche à sa création) tournent longtemps après leur
    // render et doivent voir les réglages COURANTS, pas ceux qu'elles ont capturés.
    config,
    theme,
  }
  const latest = useRef(snapshot)
  latest.current = snapshot

  // Titres normalisés mémoïsés PAR OBJET marker : un tick temps réel reconstruit le
  // tableau mais préserve la plupart des références, donc ne renormalise que ce qui
  // a réellement changé.
  const normalizedTitle = useMemo(() => createTitleCache<MarkerData<T>>((m) => m.title), [])

  // Couche DOM de positionnement (pool, tween, ancrage CSS2DObject) — cf. `useOverlayLayer`.
  const { layerRef: coreRef, nodes } = useOverlayLayer(
    useCallback((core: CoreMarkerLayer) => {
      const { ringSize, avatarRing, leaderLine, cullMargin, config: cfg, theme: th } = latest.current
      core.moveTween = { durationMs: th.markers.moveTween.duration, easing: th.markers.moveTween.easing }
      // Deux diamètres : `ringSize` cale l'anneau sur la pastille d'un sprite (calibrage
      // de l'appelant), le second sur le gabarit plein d'un avatar — cf. `setSelectionRing`.
      core.setSelectionRing(ringSize, avatarRing)
      core.leaderLine = leaderLine ?? true
      core.cullMargin = cullMargin ?? cfg.performance.markerCullMarginPx
    }, []),
  )

  // Réglage VIVANT, contrairement à `leaderLine` : celui-ci décide de la structure DOM
  // d'un nœud à sa création, alors que le cull ne fait que masquer — le changer à chaud
  // n'a donc rien à reconstruire. Sans cet effet, la prop resterait figée à sa valeur
  // du premier rendu, et rien dans le typage ne le dirait.
  const cullMarginPx = config.performance.markerCullMarginPx
  useEffect(() => {
    if (coreRef.current) coreRef.current.cullMargin = props.cullMargin ?? cullMarginPx
  }, [coreRef, props.cullMargin, cullMarginPx])

  const recompute = useCallback(() => {
    const core = coreRef.current
    if (!core) return
    const { rendered: pts, getId: idOf } = latest.current
    const { absorbed, moved } = placementRef.current

    const items: OverlayItem[] = []
    const entries = new Map<string | number, MarkerData<T>>()
    for (const m of pts) {
      const id = idOf(m)
      // Agrégé dans une pastille : c'est la surface qui l'affiche, pas nous.
      if (absorbed.has(id)) continue
      // Décollé par l'éventail : posé ailleurs qu'à sa position, sans animation
      // d'entrée — sinon chaque repli/dépli de l'éventail ferait clignoter le marker.
      const at = moved.get(id)
      items.push({
        id,
        position: at ?? m.position,
        animateEnter: at ? false : undefined,
        zIndex: m.zIndex,
        selectedColor: m.selectedColor,
      })
      entries.set(id, m)
    }
    entriesRef.current = entries
    core.setItems(items)
    // Pendant un pan où rien ne change de place, les portails ne se re-rendent pas —
    // et la détection elle-même n'alloue rien (cf. `useEntriesSignature`).
    signature.begin(pointsRevRef.current)
    for (const id of entries.keys()) signature.add(id)
    signature.end()
  }, [coreRef, signature])

  // Contribution au regroupement COMMUN de la carte. La couche donne ses points et
  // pose ce que la surface lui rend : elle ne sait rien des pastilles, ni des autres
  // couches. `cluster: { enabled: false }` l'en sort — ses markers restent alors
  // toujours posés individuellement (un point de suivi qu'on veut voir en permanence).
  useEffect(() => {
    if (props.cluster?.enabled === false) {
      placementRef.current = NO_PLACEMENT
      recompute()
      return
    }
    const contributor: ClusterContributor = {
      // Clé de couche, stable d'un remontage à l'autre : elle préfixe les uid côté
      // registre, et un préfixe qui change re-keyerait toutes les pastilles.
      key: clusterSource,
      points: () => latest.current.rendered as readonly MarkerData[],
      idOf: (m) => latest.current.getId(m as MarkerData<T>),
      // Appelé UNIQUEMENT quand le placement de cette couche a changé — le registre
      // filtre les diffusions identiques (cf. `ClusterRegistry.place`).
      place: (placement) => {
        placementRef.current = placement
        recompute()
      },
    }
    return engine.clusters.register(contributor)
  }, [engine, clusterSource, props.cluster?.enabled, recompute])

  // Les DONNÉES ont changé. L'index par id porte les points COMPLETS : il répond à
  // `markerById` (loupe) et à `info()` du registre de sélection, que le gate de zoom
  // ne doit pas amputer.
  useEffect(() => {
    const map = new Map<string | number, MarkerData<T>>()
    for (const p of points) map.set(latest.current.getId(p), p)
    pointsByIdRef.current = map
    pointsRevRef.current++
    // Un marker supprimé ou masqué par le filtre tags sort de la sélection (prune).
    engine.selectables.itemsChanged()
    // L'inventaire de la loupe reflète les données courantes (post-filtre tags).
    engine.markers.itemsChanged()
  }, [points, engine])

  // Ce qui est POSÉ a changé — nouveaux points, ou gate de zoom des statiques qui
  // s'ouvre/se ferme. La surface de clusters, elle, se resynchronise sur le registre.
  // Effet distinct du précédent : un franchissement de seuil ne touche ni la sélection
  // ni l'inventaire de la loupe, qui lisent les points complets.
  useEffect(() => {
    engine.clusters.itemsChanged()
    recompute()
  }, [rendered, recompute, engine])

  // Câblage des registres (sélection marquee, inventaire loupe, recherche) —
  // cf. `useMarkerRegistries`. Le registre tags est à part (`useTagRegistry`, appelé
  // plus haut) pour garder sa position d'origine dans l'ordre des hooks.
  useMarkerRegistries(
    engine,
    coreRef,
    entriesRef,
    pointsByIdRef,
    latest,
    searchSource,
    points,
    props.typeLabel,
    theme,
    normalizedTitle,
  )

  // Sélection — réappliquée quand un nœud (ré)apparaît.
  useEffect(() => {
    const id = props.selectedId ?? null
    coreRef.current?.setSelected(id)
  }, [coreRef, props.selectedId, nodes])

  // Clic à côté de tout marker → sélection vidée, comme un menu se referme au clic
  // extérieur. L'event `click` du moteur ne porte QUE les clics carte : ceux qui
  // touchent un marker sont absorbés par son nœud DOM, et un outil de dessin actif
  // les consomme avant émission — donc aucune désélection parasite en cours de tracé.
  useEffect(() => engine.on('click', () => latest.current.onSelect?.(null)), [engine])

  // Taille de l'anneau de multi-sélection : le core la pose par nœud à la
  // création — ici seule la resynchronisation au changement de valeur. Les DEUX
  // diamètres en dépendent : `avatarRing` suit `markerSize` alors que `ringSize` se
  // fige dès que l'hôte passe `selectionRing`, et l'oublier gelait alors l'anneau
  // d'avatar sur sa taille de montage.
  useEffect(() => {
    coreRef.current?.setSelectionRing(ringSize, avatarRing)
  }, [coreRef, ringSize, avatarRing])

  // Relève le marker dont le menu est ouvert — ou survolé (infobulle) —
  // au-dessus des clusters/markers voisins (le CSS2DRenderer trie le z-index par
  // renderOrder), sinon la surface passe sous un voisin plus proche de la caméra.
  useEffect(() => {
    coreRef.current?.setRaised(openMenu ?? hoverId ?? null)
  }, [coreRef, openMenu, hoverId, nodes])

  // Suivi caméra d'un marker/agent live. Agrégé dans une pastille, il n'est plus posé :
  // `getItemPosition` rend `null` et la caméra garde sa dernière cible connue.
  useEffect(() => {
    if (props.followId == null) return
    const followId = props.followId
    return engine.camera.follow(() => coreRef.current?.getItemPosition(followId) ?? null)
  }, [coreRef, engine, props.followId])

  /**
   * Tout geste qui ne vise pas le marker ouvert le referme — au `pointerdown`, donc
   * AVANT que le geste ne devienne un déplacement.
   *
   * L'événement `click` du moteur ne pouvait pas tenir ce rôle : il n'est émis que
   * si l'appui a démarré sur le CANVAS et que le pointeur a bougé de moins de 6 px
   * (cf. `MapEngine.onPointerUp`). Un drag de marker part de l'overlay DOM et
   * dépasse ce seuil — le menu survivait donc au déplacement, comme au pan et à la
   * molette.
   *
   * Le `contains` porte sur le CONTENEUR DE PORTAIL, qui abrite le marker ET son
   * menu : le re-clic sur le marker reste donc un toggle, et l'ouvreur n'a aucun
   * `stopPropagation` à semer — `useDismiss` promet précisément que ses hôtes n'en
   * ont pas besoin. Le point au sol, lui, est un FRÈRE de ce conteneur : le
   * repositionnement referme, ce qui est l'effet attendu.
   */
  const openNode = useMemo(
    () => ({ current: openMenu === null ? null : (nodes.get(openMenu) ?? null) }),
    [openMenu, nodes],
  )
  useDismiss(openNode, openMenu !== null, closeMenu, { wheel: true, captureEscape: true })

  // Saisie du marker OUVERT vers la dock : son `pointerdown` tombe dans le conteneur,
  // et le long-press neutralise le clic — ni `useDismiss` ni le toggle ne referment.
  // Le registre, lui, sait quand la charge décolle vraiment.
  useEffect(() => {
    if (openMenu === null) return
    return engine.drag.onChange(() => {
      if (engine.drag.active) closeMenu()
    })
  }, [engine, openMenu, closeMenu])

  const handleClick = useCallback(
    // `ev` peut venir du clavier (`role="button"` : Entrée/Espace) : seuls les
    // modificateurs sont lus, et un événement clavier les porte aussi.
    (id: string | number, marker: MarkerData<T>, ev: React.MouseEvent | React.KeyboardEvent) => {
      // Premier clic sur un marker `new` : le sonar s'éteint (vu), quel que soit
      // le comportement déclenché ensuite (sélection, menu…).
      if (marker.new) {
        const markerId = latest.current.getId(marker)
        setSeenNew((prev) => (prev.has(markerId) ? prev : new Set(prev).add(markerId)))
      }
      // Outil sélection actif : le clic alimente la multi-sélection au lieu du
      // comportement hôte (onSelect/menu). Modificateurs transmis BRUTS —
      // leur sémantique (Maj = toggle) appartient à l'outil sélection.
      const consumer = engine.selectables.consumer
      if (consumer) {
        consumer.pick(latest.current.getId(marker), ev)
        return
      }
      // Le clic = ACTIONS uniquement (sélection hôte, menu contextuel) —
      // l'information vit dans l'infobulle au survol.
      props.onSelect?.(marker)
      const menuItems = props.menu?.(marker)
      if (menuItems && menuItems.length > 0) setOpenMenu((cur) => (cur === id ? null : id))
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [engine, props.onSelect, props.menu],
  )

  // Data-URI d'icône par marker (clé = identité de l'objet, invalidé quand la
  // fabrique change) : l'encodage SVG (~1 Ko/marker) n'est payé qu'une fois par
  // donnée, pas à chaque rebuild des portails.
  const svgCacheRef = useRef(new WeakMap<object, string>())
  useEffect(() => {
    svgCacheRef.current = new WeakMap()
  }, [props.icon])

  const portals = useMemo(() => {
    const markerIconSrc = (m: MarkerData<T>): string => {
      let src = svgCacheRef.current.get(m)
      if (!src) {
        src = svgToDataUri(props.icon!(m))
        svgCacheRef.current.set(m, src)
      }
      return src
    }
    const out: ReactNode[] = []
    for (const [id, el] of nodes) {
      const marker = entriesRef.current.get(id)
      if (!marker) continue
      const imgStyle: CSSProperties = {
        width: markerSize,
        height: markerSize,
        marginLeft: -markerSize / 2,
        marginTop: -markerSize / 2,
        display: 'block',
        cursor: 'pointer',
      }
      // Avatar (photo ronde cerclée de la couleur du type) PRIORITAIRE sur l'icône
      // SVG custom, sinon `DefaultMarker` (pastille + halo).
      const content: ReactNode = marker.avatar ? (
        <img
          className="m3d-marker-img m3d-marker-avatar"
          src={marker.avatar}
          style={{ ...imgStyle, borderColor: markerColorOf(theme, marker.type).base }}
          draggable={false}
          alt=""
          // Avatar introuvable (404, chemin cassé) → repli sur l'icône du type,
          // jamais une image cassée.
          onError={
            props.icon
              ? (e) => {
                  const img = e.currentTarget
                  img.classList.remove('m3d-marker-avatar')
                  img.style.borderColor = ''
                  img.src = markerIconSrc(marker)
                }
              : undefined
          }
        />
      ) : props.icon ? (
        <img className="m3d-marker-img" src={markerIconSrc(marker)} style={imgStyle} draggable={false} alt="" />
      ) : (
        <DefaultMarker marker={marker as MarkerData} theme={theme} />
      )
      // Menu : évalué SEULEMENT pour le nœud dont le menu est ouvert (l'appel
      // hôte alloue items + closures — pas pour N markers à chaque rebuild).
      const menuItems = openMenu === id ? props.menu?.(marker) : undefined
      // Décorations d'attention (pointer-events:none, centrées sur l'ancre) :
      // viseur rouge tant que `urgent` ; sonar tant que `new` n'a pas été cliqué.
      // Jamais les deux : l'urgence PRIME sur la nouveauté.
      const showTarget = marker.urgent === true
      const showSonar = !showTarget && marker.new === true && !seenNew.has(latest.current.getId(marker))
      // Infobulle au survol, masquée dès qu'un menu est ouvert — jamais deux
      // surfaces empilées au même endroit.
      const hovered = hoverId === id && openMenu !== id
      // La prop décide seule quand elle existe (son `null` doit rester un refus, pas
      // une invitation à retomber sur la donnée).
      const tip = !hovered ? null : props.tooltip ? props.tooltip(marker) : tipFromData(marker)
      const hoverable = !!props.tooltip || hasOwnTip(marker)
      const tipLift = markerSize / 2 + 10
      // La prop de couche, si fournie, prime sur le drapeau porté par la donnée —
      // sinon c'est le marker lui-même qui décide (cas courant : un seul point
      // éditable au milieu de markers en lecture seule).
      const isRepositionable =
        props.repositionable === undefined
          ? !!marker.repositionable
          : typeof props.repositionable === 'function'
            ? props.repositionable(marker)
            : props.repositionable
      // Les deux gestes cohabitent : le repositionnement part du POINT AU SOL, la
      // saisie vers la dock part de l'ICÔNE. Plus d'exclusion mutuelle à faire.
      const isDraggable = typeof props.draggable === 'function' ? props.draggable(marker) : !!props.draggable
      out.push(
        createPortal(
          <>
            <MarkerContent
              isMarker
              draggable={isDraggable}
              repositionable={isRepositionable}
              leaderLine={props.leaderLine ?? true}
              layer={coreRef.current}
              onRepositionStart={closeMenu}
              onReposition={isRepositionable ? (ll) => latest.current.onReposition?.(marker, ll) : undefined}
              onRepositionMove={isRepositionable ? (ll) => latest.current.onRepositionMove?.(marker, ll) : undefined}
              markerId={latest.current.getId(marker)}
              nodeKey={id}
              markerData={marker}
              ghost={content}
              // Le titre métier, seul texte que porte un marker. À défaut, son type :
              // « alerte » vaut mieux que rien annoncé du tout.
              label={marker.title ?? props.typeLabel?.(marker.type) ?? marker.type}
              onClick={(e) => handleClick(id, marker, e)}
              onHoverEnter={hoverable ? () => setHoverId(id) : undefined}
              onHoverLeave={hoverable ? () => setHoverId((cur) => (cur === id ? null : cur)) : undefined}
            >
              {showSonar && <span className="m3d-sonar" />}
              {showTarget && (
                <span className="m3d-target">
                  <i />
                  <i />
                  <i />
                  <i />
                </span>
              )}
              {content}
            </MarkerContent>
            {hasTipContent(tip) && (
              <MarkerTip
                title={tip?.title}
                content={tip?.content}
                // Urgence : style rouge dédié, immédiatement distinct des autres.
                className={showTarget ? 'm3d-markertip-urgent' : undefined}
                style={{ '--m3d-tiplift': `${tipLift}px` } as CSSProperties}
              />
            )}
            {menuItems && menuItems.length > 0 && (
              <div className="m3d-menu">
                <ContextMenu items={menuItems} onClose={closeMenu} />
              </div>
            )}
          </>,
          el,
          String(id),
        ),
      )
    }
    return out
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    nodes,
    entriesRev,
    theme,
    openMenu,
    hoverId,
    seenNew,
    props.icon,
    props.menu,
    props.tooltip,
    props.draggable,
    props.typeLabel,
    handleClick,
    markerSize,
  ])

  return <>{portals}</>
}
