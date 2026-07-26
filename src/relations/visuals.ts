// Traduction « état du moteur → visuels de la couche de rendu ». Module SANS React
// ni Three : il ne manipule que des coordonnées et des descripteurs (`LinkVisual`),
// ce qui le rend exécutable et vérifiable sans carte montée.
//
// Il porte aussi le cache de géométrie, et c'est le point important : les tableaux de
// points DOIVENT garder leur identité tant que leurs extrémités n'ont pas bougé, car
// c'est sur cette identité que `LinkLayer.setLinks` décide de reconstruire ou non une
// géométrie. Un tableau littéral reconstruit à chaque passe fait retriangulariser
// toute la couche au moindre survol.

import { metersPerPixelAtZoom } from '../core/math'
import type { VisualNode } from '../core/MarkerQuery'
import type { LinkVisual } from '../layers/LinkLayer'
import { formatLabel } from '../labels/mergeLabels'
import type { MapLabels } from '../labels/types'
import type { RelationSnapshot } from './core/engine'
import { shownCount } from './core/engine'
import { bearingDeg, destinationPoint, fanLegs, greatCirclePoints, haversineMeters } from './core/geo'
import type { Link } from './core/types'
import type { LatLng } from '../shared'

/** Pas d'échantillonnage des lignes droites : sous ~200 m le drapage ne gagne plus rien. */
const STRAIGHT_STEP_METERS = 200
/** Opacité du lien de rang 1 — SEULE variable liée au classement avec `minOpacity`. */
const OPACITY_TOP = 1
/** Au-delà, l'éventail devient illisible : le groupe passe en trait unique agrégé. */
const FAN_MAX_LEGS = 5
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
  defaultColor: string
  routeColor: string
  hubRadius: number
  minOpacity: number
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
}

/** Opacité d'un lien selon son rang. Un lien sans rang (temps indisponible) reste discret. */
export function opacityForRank(rank: number | null, total: number, min: number): number {
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
    return this.resolve(key, a, b, () => greatCirclePoints(a, b, STRAIGHT_STEP_METERS))
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
 * Visuels de toutes les relations affichées. Ouvre et referme une passe de cache :
 * les géométries des liens disparus en sortent d'elles-mêmes.
 */
export function buildRelationVisuals(
  snapshots: readonly RelationSnapshot[],
  ctx: RelationVisualContext,
  cache: RelationGeometryCache,
): LinkVisual[] {
  cache.begin()
  const out: LinkVisual[] = []
  for (const snapshot of snapshots) out.push(...visualsForRelation(snapshot, ctx, cache))
  cache.end()
  return out
}

function visualsForRelation(
  snapshot: RelationSnapshot,
  ctx: RelationVisualContext,
  cache: RelationGeometryCache,
): LinkVisual[] {
  const { source, tracedLinkId } = snapshot
  const { style, hoveredId } = ctx
  // Le moteur classe TOUT le pool calculé ; on ne dessine que la tête demandée.
  const links = snapshot.links.slice(0, shownCount(snapshot))
  const total = links.length

  // Socle de la relation, à plat sous le marker source : il rassemble les traits qui
  // en partent et sert d'ANCRE à sa barre d'état — c'est là que se pilote la relation,
  // là où le regard est déjà. La couche n'expose qu'un conteneur (`slot`) : ce qu'on y
  // monte (segments, menus, effacement) ne la regarde pas.
  const hubId = `${HUB_PREFIX}${source.id}`
  const hub: LinkVisual = {
    id: hubId,
    disc: { center: source, radiusPx: style.hubRadius },
    points: cache.single(hubId, source),
    color: snapshot.rule.color ?? style.defaultColor,
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
  // ne fait qu'interroger l'état de clustering déjà affiché.
  const groups = new Map<string, { node: VisualNode; links: Link[] }>()
  const solo: Link[] = []
  for (const link of links) {
    const node = ctx.visualNodeOf(link.to.id)
    if (!node || node.memberIds.length <= 1) {
      solo.push(link)
      continue
    }
    const group = groups.get(node.key)
    if (group) group.links.push(link)
    else groups.set(node.key, { node, links: [link] })
  }
  for (const group of groups.values()) {
    if (group.links.length === 1) solo.push(group.links[0]!)
    else result.push(...fanVisuals(snapshot, group.node, group.links, total, ctx, cache))
  }

  for (const link of solo) {
    result.push(linkVisual(link, cache.arc(link.id, link.from, link.to), total, ctx))
  }
  return result
}

/** Visuel d'un lien : la seule forme, partagée par le trait direct et la patte
 *  d'éventail — ils ne diffèrent que par leur géométrie. */
function linkVisual(link: Link, points: LatLng[], total: number, ctx: RelationVisualContext): LinkVisual {
  return {
    id: link.id,
    points,
    color: link.color,
    hovered: ctx.hoveredId === link.id,
    opacity: opacityForRank(link.rank, total, ctx.style.minOpacity),
    width: ctx.style.width,
    label: ctx.formatLink(link.distanceMeters, link.durationSeconds, link.status === 'unavailable'),
    rank: link.rank,
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
  const collapsed = ordered.length > FAN_MAX_LEGS || screenDistance < FAN_COLLAPSE_PX
  const opacity = opacityForRank(best.rank, total, style.minOpacity)

  if (collapsed) {
    return [
      {
        id: `agg:${source.id}:${node.key}`,
        points: trunk,
        color: best.color,
        opacity,
        width: style.width,
        label: formatLabel(labels.relations.clusterAggregate, { count: ordered.length }),
        rank: best.rank,
      },
    ]
  }

  const legs: LinkVisual[] = [
    {
      id: trunkKey,
      points: trunk,
      color: best.color,
      opacity,
      width: style.width,
      // Le tronc ne porte pas d'étiquette : les chiffres vivent sur les pattes, une
      // par cible, sinon deux durées se disputeraient le même endroit.
      label: null,
    },
  ]
  const azimuths = fanLegs(bearingDeg(source, node.position), ordered.length, FAN_SPREAD_DEG)
  ordered.forEach((link, i) => {
    const end = destinationPoint(node.position, azimuths[i] ?? 0, FAN_LEG_PX * mpp)
    legs.push(linkVisual(link, cache.segment(`leg:${link.id}`, node.position, end), total, ctx))
  })
  return legs
}
