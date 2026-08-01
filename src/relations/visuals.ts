// Traduction « état du moteur → visuels de la couche de rendu ». Module SANS React
// ni Three : il ne manipule que des coordonnées et des descripteurs (`LinkVisual`),
// ce qui le rend exécutable et vérifiable sans carte montée.
//
// Il porte aussi le cache de géométrie, et c'est le point important : les tableaux de
// points DOIVENT garder leur identité tant que leurs extrémités n'ont pas bougé, car
// c'est sur cette identité que `LinkLayer.setLinks` décide de reconstruire ou non une
// géométrie. Un tableau littéral reconstruit à chaque passe fait retriangulariser
// toute la couche au moindre survol.

import { defaultConfig } from '../config/defaultConfig'
import type { PerformanceConfig } from '../config/types'
import { metersPerPixelAtZoom } from '../core/math'
import type { VisualNode } from '../core/MarkerQuery'
import type { DashStyle, LinkVisual } from '../layers/LinkLayer'
import { formatLabel } from '../labels/mergeLabels'
import type { MapLabels } from '../labels/types'
import type { RelationSnapshot } from './core/engine'
import { shownCount } from './core/engine'
import { bearingDeg, destinationPoint, fanLegs, greatCirclePoints, haversineMeters } from './core/geo'
import type { Link } from './core/types'
import type { LatLng } from '../shared'

/** Opacité du lien de rang 1 — SEULE variable liée au classement avec `minOpacity`. */
const OPACITY_TOP = 1
/** Ouverture de l'éventail, en degrés. */
const FAN_SPREAD_DEG = 70
/** Longueur d'une patte, en pixels écran (convertie en mètres au zoom courant). */
const FAN_LEG_PX = 30
/** Sous cette distance écran source↔cluster, l'éventail se replie : pas la place. */
const FAN_COLLAPSE_PX = 70
/** Le socle reste translucide : c'est un repère au sol, pas un masque sur la carte. */
const HUB_OPACITY = 0.55
/** Sous le pointeur il se densifie — seule l'opacité change, donc aucune géométrie
 *  n'est reconstruite : le survol ne coûte qu'une mutation de matériau. */
const HUB_OPACITY_HOVER = 0.85
/** Préfixe d'identité du socle — il n'est pas un lien, son id ne doit pas s'y confondre. */
export const HUB_PREFIX = 'hub:'

/** Réglages visuels de la couche, résolus une fois par l'appelant. */
export type RelationVisualStyle = {
  width: number
  routeColor: string
  hubRadius: number
  minOpacity: number
  /**
   * Pointillé défilant des traits de RECHERCHE, en pixels écran (`gapOpacity` en
   * fraction). `null` = trait plein. L'itinéraire tracé n'en porte jamais : il est la
   * réponse, pas un candidat en cours d'évaluation — c'est cette différence de forme
   * qui distingue les deux états.
   */
  dash: DashStyle | null
}

export type RelationVisualContext = {
  style: RelationVisualStyle
  labels: MapLabels
  /** Formateur d'étiquette de lien, déjà lié aux libellés courants. */
  formatLink: (distanceMeters: number | null, durationSeconds: number | null, failed: boolean) => string
  /** Id du lien ou du socle sous le pointeur. */
  hoveredId: string | null
  /** Zoom courant — dimensionne les pattes d'éventail, exprimées en pixels écran. */
  zoom: number
  /** Nœud visuel agrégeant une cible, ou `null` si elle est isolée. */
  visualNodeOf: (id: string) => VisualNode | null
  /**
   * Couleur des traits d'une relation. Résolue par l'HÔTE, et à chaque passe : elle
   * dépend du marker source (donc du thème et du type courant de ce marker), que ce
   * module n'a aucun moyen d'atteindre. La calculer ici depuis `rule.color` la figerait
   * à l'ouverture de la relation — un agent qui change de statut garderait la couleur
   * qu'il avait au clic.
   */
  colorOf: (snapshot: RelationSnapshot) => string
  /** Au-delà, l'éventail se replie en trait agrégé — cf. `performance.relations.fanMaxLegs`. */
  fanMaxLegs?: number
  /** Budgets d'échantillonnage des arcs — cf. `performance.relations`. */
  perf?: ArcPerf
}

/**
 * Budgets d'échantillonnage des arcs — cf. `performance.relations`. Indexé sur la
 * config plutôt que réécrit : ajouter un budget se propage aux trois usages seul.
 */
type ArcPerf = Pick<PerformanceConfig['relations'], 'stepMeters' | 'maxSteps'>

/** Opacité d'un lien selon son rang. Un lien sans rang (temps indisponible) reste discret. */
function opacityForRank(rank: number | null, total: number, min: number): number {
  if (rank === null) return min
  if (total <= 1) return OPACITY_TOP
  const t = (rank - 1) / (total - 1)
  return OPACITY_TOP + (min - OPACITY_TOP) * Math.min(1, Math.max(0, t))
}

const samePoint = (a: LatLng, b: LatLng): boolean => a.lat === b.lat && a.lng === b.lng

type Entry = { a: LatLng; b: LatLng; points: LatLng[] }

/**
 * Géométries mémoïsées, validées par leurs EXTRÉMITÉS plutôt que purgées en bloc.
 *
 * La purge globale (« un marker a bougé → on vide tout ») recalculait l'intégralité
 * des liens de toutes les relations à chaque tick d'un flux temps réel, alors qu'un
 * seul marker avait bougé. Ici, une entrée est réutilisée tant que ses deux extrémités
 * sont aux mêmes coordonnées : ce qui n'a pas bougé n'est ni recalculé, ni — surtout —
 * réalloué, donc `LinkLayer` ne reconstruit pas sa géométrie.
 *
 * Mode passe (`begin`/`end`) : le cache est reconstruit à partir des seules clés
 * réellement demandées, donc borné au jeu de liens courant sans purge explicite.
 */
export class RelationGeometryCache {
  private entries = new Map<string, Entry>()
  private pass: Map<string, Entry> | null = null
  /**
   * Budgets d'échantillonnage courants. Champ et non paramètre d'appel : la validité
   * d'une entrée ne tient qu'à ses EXTRÉMITÉS, donc un pas passé en argument aurait
   * laissé tous les arcs déjà en cache à l'ancienne subdivision — le réglage n'aurait
   * semblé agir que sur les liens créés ensuite. Ici, en changer vide le cache.
   */
  private perf: ArcPerf = defaultConfig.performance.relations

  setPerf(perf: ArcPerf): void {
    if (perf.stepMeters === this.perf.stepMeters && perf.maxSteps === this.perf.maxSteps) return
    this.perf = perf
    this.entries.clear()
    this.pass?.clear()
  }

  begin(): void {
    this.pass = new Map()
  }

  end(): void {
    if (!this.pass) return
    this.entries = this.pass
    this.pass = null
  }

  /** Arc de grand cercle échantillonné, mémoïsé tant que ses extrémités tiennent. */
  arc(key: string, a: LatLng, b: LatLng): LatLng[] {
    return this.resolve(key, a, b, () => greatCirclePoints(a, b, this.perf.stepMeters, this.perf.maxSteps))
  }

  /** Segment brut à deux points (patte d'éventail) — même contrat d'identité. */
  segment(key: string, a: LatLng, b: LatLng): LatLng[] {
    return this.resolve(key, a, b, () => [a, b])
  }

  /** Point unique (socle) : `LinkVisual.points` ne doit pas changer d'identité pour rien. */
  single(key: string, a: LatLng): LatLng[] {
    return this.resolve(key, a, a, () => [a])
  }

  private resolve(key: string, a: LatLng, b: LatLng, build: () => LatLng[]): LatLng[] {
    const prev = this.pass?.get(key) ?? this.entries.get(key)
    const entry = prev && samePoint(prev.a, a) && samePoint(prev.b, b) ? prev : { a, b, points: build() }
    ;(this.pass ?? this.entries).set(key, entry)
    return entry.points
  }
}

/**
 * Couple de markers, indépendamment du sens : deux relations opposées (l'agent vers
 * l'alerte, l'alerte vers l'agent) décrivent le MÊME arc, seulement parcouru à
 * l'envers. C'est cette clé qui les réunit.
 */
const pairKey = (link: Link): string =>
  link.from.id < link.to.id ? `${link.from.id}|${link.to.id}` : `${link.to.id}|${link.from.id}`

/**
 * Couple relié par PLUSIEURS relations : les couleurs à parcourir, et le lien qui
 * dessine le trait pour tout le monde.
 */
type SharedPair = { colors: string[]; owner: string }

/**
 * Répartit les liens affichés d'une relation : arcs DIRECTS d'un côté, groupes
 * d'éventail de l'autre (cibles agrégées dans un même cluster). Extrait parce que le
 * repérage des couples partagés doit trancher exactement comme le rendu — un lien
 * réputé direct ici mais dessiné en patte d'éventail là ferait disparaître la patte.
 */
function partitionLinks(
  links: readonly Link[],
  ctx: RelationVisualContext,
): { direct: Link[]; fans: { node: VisualNode; links: Link[] }[] } {
  const groups = new Map<string, { node: VisualNode; links: Link[] }>()
  const direct: Link[] = []
  for (const link of links) {
    const node = ctx.visualNodeOf(link.to.id)
    if (!node || node.memberIds.length <= 1) {
      direct.push(link)
      continue
    }
    const group = groups.get(node.key)
    if (group) group.links.push(link)
    else groups.set(node.key, { node, links: [link] })
  }
  const fans: { node: VisualNode; links: Link[] }[] = []
  // Un groupe d'UN seul lien n'a pas d'éventail à ouvrir : c'est un arc direct.
  for (const group of groups.values()) {
    if (group.links.length === 1) direct.push(group.links[0]!)
    else fans.push(group)
  }
  return { direct, fans }
}

/**
 * `shownLinks` + `partitionLinks` d'un snapshot, calculés UNE FOIS par snapshot et par
 * passe (`buildRelationVisuals`). `sharedPairs` et `visualsForRelation` en dépendaient
 * chacun séparément — même liste de liens, même partitionnement — doublant le tri
 * direct/éventail de chaque relation à chaque frame de survol.
 */
type SnapshotVisualData = {
  snapshot: RelationSnapshot
  /** Liens réellement dessinés par la relation — le moteur en calcule davantage. */
  links: Link[]
  /**
   * `null` pour une relation qui TRACE un itinéraire valide : `visualsForRelation` n'a
   * alors pas besoin du partitionnement direct/éventail (le tracé remplace l'affichage
   * habituel), et le calculer quand même serait du travail jeté — exactement ce que
   * l'ancien code, qui ne l'appelait jamais dans ce cas, ne payait pas non plus.
   */
  partition: { direct: Link[]; fans: { node: VisualNode; links: Link[] }[] } | null
}

function snapshotVisualData(snapshot: RelationSnapshot, ctx: RelationVisualContext): SnapshotVisualData {
  const links = snapshot.links.slice(0, shownCount(snapshot))
  return { snapshot, links, partition: snapshot.tracedLinkId ? null : partitionLinks(links, ctx) }
}

/**
 * Couples de markers reliés par plusieurs relations à la fois.
 *
 * Deux relations opposées produisent deux traits EXACTEMENT superposés : le second
 * masquait le premier, et rien ne disait qu'ils étaient deux. On n'en dessine plus
 * qu'un, dont les tirets alternent les couleurs de toutes les relations concernées —
 * un maillage de moins, et l'information gagnée.
 *
 * Le trait revient à la DERNIÈRE relation ouverte (les instantanés sont dans leur
 * ordre d'ouverture) : c'est elle qui porte l'étiquette, le survol et le clic, donc
 * la plus récemment demandée — celle que l'utilisateur regarde.
 */
function sharedPairs(data: readonly SnapshotVisualData[], ctx: RelationVisualContext): Map<string, SharedPair> {
  const seen = new Map<string, SharedPair>()
  for (const { snapshot, partition } of data) {
    // Une relation dont l'itinéraire est tracé ne dessine plus ses traits directs
    // (`partition` vaut alors `null`, cf. `snapshotVisualData`).
    if (!partition) continue
    const color = ctx.colorOf(snapshot)
    for (const link of partition.direct) {
      const key = pairKey(link)
      const entry = seen.get(key)
      if (entry) {
        entry.colors.push(color)
        entry.owner = link.id
      } else seen.set(key, { colors: [color], owner: link.id })
    }
  }
  for (const [key, entry] of seen) {
    if (entry.colors.length < 2) seen.delete(key)
  }
  return seen
}

/**
 * Visuels de toutes les relations affichées. Ouvre et referme une passe de cache :
 * les géométries des liens disparus en sortent d'elles-mêmes.
 */
export function buildRelationVisuals(
  snapshots: readonly RelationSnapshot[],
  ctx: RelationVisualContext,
  cache: RelationGeometryCache,
): LinkVisual[] {
  if (ctx.perf) cache.setPerf(ctx.perf)
  cache.begin()
  const data = snapshots.map((snapshot) => snapshotVisualData(snapshot, ctx))
  const shared = sharedPairs(data, ctx)
  const out: LinkVisual[] = []
  for (const d of data) out.push(...visualsForRelation(d, ctx, cache, shared))
  cache.end()
  return out
}

function visualsForRelation(
  data: SnapshotVisualData,
  ctx: RelationVisualContext,
  cache: RelationGeometryCache,
  shared: ReadonlyMap<string, SharedPair>,
): LinkVisual[] {
  const { snapshot, links, partition } = data
  const { source, tracedLinkId } = snapshot
  const { style, hoveredId } = ctx
  // Le moteur classe TOUT le pool calculé ; on ne dessine que la tête demandée.
  const total = links.length
  // UNE couleur pour toute la relation — celle de son marker source. Le socle, les
  // traits et le tronc d'un éventail la partagent : c'est ce qui fait lire le faisceau
  // comme appartenant à un marker plutôt que comme des traits sans propriétaire.
  const color = ctx.colorOf(snapshot)

  // Socle de la relation, à plat sous le marker source : il rassemble les traits qui
  // en partent et sert d'ANCRE à sa barre d'état — c'est là que se pilote la relation,
  // là où le regard est déjà. La couche n'expose qu'un conteneur (`slot`) : ce qu'on y
  // monte (segments, menus, effacement) ne la regarde pas.
  const hubId = `${HUB_PREFIX}${source.id}`
  const hub: LinkVisual = {
    id: hubId,
    disc: { center: source, radiusPx: style.hubRadius },
    points: cache.single(hubId, source),
    color,
    opacity: hoveredId === hubId ? HUB_OPACITY_HOVER : HUB_OPACITY,
    width: 0,
    label: null,
    slot: true,
    hovered: hoveredId === hubId,
  }

  // Un itinéraire affiché REMPLACE les liens de sa relation : le parcours réel est la
  // réponse, les prétendants n'ont plus à encombrer la carte.
  if (tracedLinkId) {
    const link = snapshot.links.find((l) => l.id === tracedLinkId)
    const route = link?.route
    // UN seul chemin par marker : le plus rapide, celui que le fournisseur place en
    // tête. Pas de variantes concurrentes à départager du regard.
    if (link && route) {
      return [
        hub,
        {
          id: link.id,
          points: route.path,
          color: style.routeColor,
          hovered: hoveredId === link.id,
          opacity: OPACITY_TOP,
          width: style.width,
          // NI étiquette, NI croix : la barre d'état du socle porte déjà la distance,
          // la durée et la commande de fermeture de ce trajet. Les répéter au milieu du
          // tracé posait les mêmes chiffres deux fois à l'écran, et une seconde croix
          // rouge dont rien ne disait qu'elle faisait autre chose que la première.
          label: null,
          traced: true,
        },
      ]
    }
  }

  const result: LinkVisual[] = [hub]
  // Regroupement par nœud VISUEL : plusieurs cibles agrégées dans un même cluster
  // partagent un tronc et s'ouvrent en éventail. Le cluster n'est jamais éclaté — on
  // ne fait qu'interroger l'état de clustering déjà affiché. Déjà calculé une fois par
  // `snapshotVisualData` (partagé avec `sharedPairs`) — sauf repli : `tracedLinkId`
  // pointait un lien disparu/sans itinéraire (`partition` alors `null`), auquel cas on le
  // calcule ici, comme le faisait déjà l'ancien code à chaque appel dans ce même cas.
  const { direct, fans } = partition ?? partitionLinks(links, ctx)
  for (const group of fans) result.push(...fanVisuals(snapshot, group.node, group.links, total, color, ctx, cache))

  for (const link of direct) {
    const pair = shared.get(pairKey(link))
    // Couple déjà porté par une autre relation : son trait dessine les deux, celui-ci
    // n'a rien à ajouter. Sans ce retrait, les deux se superposeraient au pixel près.
    if (pair && pair.owner !== link.id) continue
    result.push(linkVisual(link, cache.arc(link.id, link.from, link.to), total, color, ctx, pair?.colors))
  }
  return result
}

/** Visuel d'un lien : la seule forme, partagée par le trait direct et la patte
 *  d'éventail — ils ne diffèrent que par leur géométrie. */
function linkVisual(
  link: Link,
  points: LatLng[],
  total: number,
  color: string,
  ctx: RelationVisualContext,
  /** Couleurs de toutes les relations qui se partagent ce trait, s'il est partagé. */
  colors?: readonly string[],
): LinkVisual {
  return {
    id: link.id,
    points,
    color,
    colors,
    hovered: ctx.hoveredId === link.id,
    opacity: opacityForRank(link.rank, total, ctx.style.minOpacity),
    width: ctx.style.width,
    label: ctx.formatLink(link.distanceMeters, link.durationSeconds, link.status === 'unavailable'),
    rank: link.rank,
    dash: ctx.style.dash ?? undefined,
  }
}

/**
 * Rendu agrégé d'un groupe de cibles réunies dans un même cluster : tronc commun
 * jusqu'au cluster, puis éventail de pattes courtes ouvert à l'opposé du tronc.
 * Trop de membres, ou pas la place à l'écran → trait unique et étiquette agrégée.
 *
 * Les ids sont préfixés par la SOURCE, comme celui du socle. Sans ce préfixe, deux
 * relations ouvertes qui atteignent le même cluster produisent le même id de tronc :
 * le diff par id de `LinkLayer` n'en garde qu'un, et l'une des deux relations perd
 * visiblement sa branche.
 */
function fanVisuals(
  snapshot: RelationSnapshot,
  node: VisualNode,
  groupLinks: Link[],
  total: number,
  color: string,
  ctx: RelationVisualContext,
  cache: RelationGeometryCache,
): LinkVisual[] {
  const { source } = snapshot
  const { style, labels } = ctx
  const mpp = metersPerPixelAtZoom(ctx.zoom, node.position.lat)
  const trunkKey = `trunk:${source.id}:${node.key}`
  const trunk = cache.arc(trunkKey, source, node.position)
  const ordered = [...groupLinks].sort((a, b) => (a.durationSeconds ?? Infinity) - (b.durationSeconds ?? Infinity))
  const best = ordered[0]!
  const screenDistance = haversineMeters(source, node.position) / mpp
  const collapsed =
    ordered.length > (ctx.fanMaxLegs ?? defaultConfig.performance.relations.fanMaxLegs) ||
    screenDistance < FAN_COLLAPSE_PX
  const opacity = opacityForRank(best.rank, total, style.minOpacity)

  if (collapsed) {
    return [
      {
        id: `agg:${source.id}:${node.key}`,
        points: trunk,
        color,
        opacity,
        width: style.width,
        label: formatLabel(labels.relations.clusterAggregate, { count: ordered.length }),
        rank: best.rank,
        dash: style.dash ?? undefined,
      },
    ]
  }

  const legs: LinkVisual[] = [
    {
      id: trunkKey,
      points: trunk,
      color,
      opacity,
      width: style.width,
      // Le tronc ne porte pas d'étiquette : les chiffres vivent sur les pattes, une
      // par cible, sinon deux durées se disputeraient le même endroit.
      label: null,
      dash: style.dash ?? undefined,
    },
  ]
  const azimuths = fanLegs(bearingDeg(source, node.position), ordered.length, FAN_SPREAD_DEG)
  ordered.forEach((link, i) => {
    const end = destinationPoint(node.position, azimuths[i] ?? 0, FAN_LEG_PX * mpp)
    legs.push(linkVisual(link, cache.segment(`leg:${link.id}`, node.position, end), total, color, ctx))
  })
  return legs
}
