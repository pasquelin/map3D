import { describe, expect, it, vi } from 'vitest'
import type { VisualNode } from '../core/MarkerQuery'
import { defaultLabels } from '../labels/defaultLabels'
import type { RelationSnapshot } from './core/engine'
import type { Link, MapPoint, RelationRule } from './core/types'
import { buildRelationVisuals, RelationGeometryCache, type RelationVisualContext } from './visuals'

// `buildRelationVisuals` calculait `partitionLinks`/`shownCount` DEUX fois par relation
// non tracée (une fois dans `sharedPairs`, une fois dans `visualsForRelation`) : ce
// fichier fige à la fois le RÉSULTAT (direct/éventail, fusion des paires partagées) et le
// NOMBRE D'APPELS à `visualNodeOf` (un seul partitionnement par snapshot et par passe).

const rule = (over: Partial<RelationRule> = {}): RelationRule => ({
  id: 'r',
  label: 'R',
  from: { any: ['src'] },
  to: { any: ['target'] },
  mode: 'DRIVE',
  selection: { mode: 'fastest', count: 10, maxMeters: 1e7 },
  limit: { compute: 10, render: 10 },
  ...over,
})

const mkLink = (from: MapPoint, to: MapPoint, over: Partial<Link> = {}): Link => ({
  id: `${from.id}→${to.id}`,
  from,
  to,
  status: 'ready',
  distanceMeters: 100,
  durationSeconds: 60,
  rank: 1,
  color: '#fff',
  route: null,
  ...over,
})

const s1: MapPoint = { id: 's1', lat: 0, lng: 0, tags: ['src'] }
const s2: MapPoint = { id: 's2', lat: 0, lng: 0, tags: ['src'] }
const t1: MapPoint = { id: 't1', lat: 0, lng: 0.01, tags: ['target'] }
const tc1: MapPoint = { id: 'tc1', lat: 0, lng: 0.02, tags: ['target'] }
const tc2: MapPoint = { id: 'tc2', lat: 0, lng: 0.021, tags: ['target'] }

const clusterNode: VisualNode = { key: 'cluster', position: { lat: 0, lng: 0.02 }, memberIds: ['tc1', 'tc2'] }

function makeCtx(visualNodeOf: (id: string) => VisualNode | null): RelationVisualContext {
  return {
    style: { width: 2, routeColor: '#0f0', hubRadius: 4, minOpacity: 0.2, dash: null },
    labels: defaultLabels,
    formatLink: (_distanceMeters, durationSeconds, failed) => (failed ? 'x' : String(durationSeconds ?? '')),
    hoveredId: null,
    zoom: 15,
    visualNodeOf: visualNodeOf as (id: string | number) => VisualNode | null,
    colorOf: (snapshot) => (snapshot.source.id === 's1' ? '#111111' : '#222222'),
  }
}

describe('buildRelationVisuals — partitionLinks/shownCount calculés une seule fois par snapshot', () => {
  it("n'appelle `visualNodeOf` qu'une fois par lien affiché (pas deux)", () => {
    const calls: string[] = []
    const visualNodeOf = vi.fn((id: string) => {
      calls.push(id)
      return id === 'tc1' || id === 'tc2' ? clusterNode : null
    })
    const snapshot1: RelationSnapshot = {
      source: s1,
      rule: rule(),
      // t1 (direct) + tc1/tc2 (même cluster → un groupe d'éventail de 2 pattes).
      links: [mkLink(s1, t1), mkLink(s1, tc1), mkLink(s1, tc2)],
      tracedLinkId: null,
    }
    // Relation OPPOSÉE entre les deux mêmes marqueurs (t1 → s1) : même paire non
    // ordonnée que `s1 → t1` de snapshot1, donc un couple PARTAGÉ.
    const snapshot2: RelationSnapshot = {
      source: t1,
      rule: rule(),
      links: [mkLink(t1, s1)],
      tracedLinkId: null,
    }
    const ctx = makeCtx(visualNodeOf)
    const cache = new RelationGeometryCache()

    const out = buildRelationVisuals([snapshot1, snapshot2], ctx, cache)

    // 3 liens (snapshot1) + 1 lien (snapshot2) = 4 lectures de `visualNodeOf`. Avant la
    // dé-duplication, `sharedPairs` ET `visualsForRelation` partitionnaient chacun,
    // doublant ce compte à 8.
    expect(calls.length).toBe(4)
    expect(new Set(calls)).toEqual(new Set(['t1', 'tc1', 'tc2', 's1']))

    // Un socle par relation.
    const hubs = out.filter((v) => v.slot)
    expect(hubs.map((h) => h.id).sort()).toEqual(['hub:s1', 'hub:t1'])

    // Le trait direct s1↔t1 est PARTAGÉ : un seul trait dessiné, porté par la DERNIÈRE
    // relation ouverte (snapshot2, t1→s1), avec les deux couleurs.
    const directTraits = out.filter((v) => v.id === 't1→s1' || v.id === 's1→t1')
    expect(directTraits.length).toBe(1)
    expect(directTraits[0]!.id).toBe('t1→s1')
    expect(directTraits[0]!.colors).toEqual(['#111111', '#222222'])

    // L'éventail de snapshot1 : un tronc vers le cluster + deux pattes (tc1, tc2).
    // `linkVisual` reprend l'id du LIEN pour la patte — `leg:` ne préfixe que la clé du
    // cache de géométrie (`cache.segment`), pas l'id du visuel.
    const trunk = out.find((v) => v.id === 'trunk:s1:cluster')
    expect(trunk).toBeDefined()
    const legs = out.filter((v) => v.id === 's1→tc1' || v.id === 's1→tc2')
    expect(legs.length).toBe(2)
  })

  it('relation tracée : ne double pas non plus le partitionnement de ses AUTRES snapshots', () => {
    const calls: string[] = []
    const visualNodeOf = vi.fn((id: string) => {
      calls.push(id)
      return null
    })
    const traced: RelationSnapshot = {
      source: s2,
      rule: rule(),
      links: [mkLink(s2, t1, { id: 's2→t1', route: { distanceMeters: 500, durationSeconds: 60, path: [s2, t1] } })],
      tracedLinkId: 's2→t1',
    }
    const plain: RelationSnapshot = {
      source: s1,
      rule: rule(),
      links: [mkLink(s1, t1)],
      tracedLinkId: null,
    }
    const ctx = makeCtx(visualNodeOf)
    const cache = new RelationGeometryCache()

    const out = buildRelationVisuals([traced, plain], ctx, cache)

    // La relation tracée ne dessine que socle + itinéraire (pas de trait direct classique).
    const tracedIds = out.filter((v) => v.id === 's2→t1' || v.id === 'hub:s2').map((v) => v.id)
    expect(tracedIds.sort()).toEqual(['hub:s2', 's2→t1'])
    const tracedVisual = out.find((v) => v.id === 's2→t1')
    expect(tracedVisual?.traced).toBe(true)

    // `plain` n'a qu'un lien : un seul appel à `visualNodeOf` pour lui (la relation
    // tracée ne partitionne jamais ses propres liens dans `sharedPairs`).
    expect(calls).toEqual(['t1'])
  })
})
