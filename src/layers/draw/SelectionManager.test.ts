import { describe, expect, it } from 'vitest'
import { defaultConfig } from '../../config/defaultConfig'
import type { SelectableInfo, SelectablePolicy, SelectableScreenItem } from '../../core/Selectables'
import type { Drawing } from '../DrawLayer'
import { type SelectHost, SelectionManager } from './SelectionManager'
import type { ScreenPt } from './hitTest'

type FakeEvt = { clientX: number; clientY: number; shiftKey?: boolean; altKey?: boolean; metaKey?: boolean }
const evt = (e: FakeEvt): PointerEvent => e as unknown as PointerEvent

/** Host factice : aucune forme, des externes paramétrables, une politique. */
function makeHost(opts: {
  items?: SelectableScreenItem[]
  infos?: Record<string, SelectableInfo>
  hit?: string | number | null
  policy?: SelectablePolicy
}) {
  let changes = 0
  const host: SelectHost = {
    list: () => [] as readonly Drawing[],
    hitTest: () => null,
    screenContour: () => null,
    isSelectable: () => true,
    onLockedHit: () => {},
    selectionChanged: () => {
      changes++
    },
    eventToScreen: (e) => ({ x: (e as unknown as FakeEvt).clientX, y: (e as unknown as FakeEvt).clientY }),
    externalItems: () => opts.items ?? [],
    externalHitTest: () => opts.hit ?? null,
    externalInfo: (id) => opts.infos?.[String(id)] ?? null,
    selectionPolicy: () => opts.policy ?? {},
    interaction: () => defaultConfig.interaction,
  }
  return { host, changes: () => changes }
}

const marker = (id: string, x: number, y: number): SelectableScreenItem => ({ id, kind: 'marker', x, y })
const pathItem = (id: string, pts: ScreenPt[]): SelectableScreenItem => ({
  id,
  kind: 'path',
  x: pts[0]!.x,
  y: pts[0]!.y,
  geometry: { pts, closed: false },
})
const clusterItem = (id: string, x: number, y: number): SelectableScreenItem => ({ id, kind: 'cluster', x, y })

/** Joue un marquee rectangle du coin (0,0) au coin (x,y). */
function dragRect(sm: SelectionManager, x: number, y: number) {
  sm.handle('down', { lat: 0, lng: 0 }, evt({ clientX: 0, clientY: 0 }))
  sm.handle('move', { lat: 0, lng: 0 }, evt({ clientX: x, clientY: y }))
  sm.handle('up', { lat: 0, lng: 0 }, evt({ clientX: x, clientY: y }))
}

describe('SelectionManager — marquee géométrique', () => {
  it('prend un marker dont le point est dans le rectangle', () => {
    const { host } = makeHost({ items: [marker('m1', 50, 50), marker('m2', 500, 500)] })
    const sm = new SelectionManager(host)
    dragRect(sm, 100, 100)
    expect(sm.markerIds).toEqual(['m1'])
  })

  it('prend un tracé dont le contour croise le rectangle (item géométrique)', () => {
    const line = pathItem('path:a', [
      { x: -20, y: 50 },
      { x: 300, y: 50 },
    ])
    const { host } = makeHost({ items: [line], infos: { 'path:a': { kind: 'path', type: 'path' } } })
    const sm = new SelectionManager(host)
    dragRect(sm, 100, 100)
    expect(sm.markerIds).toEqual(['path:a'])
  })

  it('classe une pastille de cluster en GROUPE (pas en marker plat)', () => {
    const infos: Record<string, SelectableInfo> = {
      c1: { kind: 'cluster', type: 'cluster', group: { label: '3 marqueurs', memberIds: ['a', 'b', 'c'] } },
    }
    const { host } = makeHost({ items: [clusterItem('c1', 50, 50)], infos })
    const sm = new SelectionManager(host)
    dragRect(sm, 100, 100)
    expect(sm.markerIds).toEqual([]) // pas de marker plat
    expect(sm.groups).toEqual([{ id: 'c1', label: '3 marqueurs', memberIds: ['a', 'b', 'c'] }])
    expect(sm.effectiveMarkerIds().sort()).toEqual(['a', 'b', 'c'])
  })
})

describe('SelectionManager — clic externe & groupes', () => {
  it('pickExternal d’un marker plat le sélectionne', () => {
    const { host } = makeHost({ infos: { m1: { kind: 'marker', type: 'agent' } } })
    const sm = new SelectionManager(host)
    sm.pickExternal('m1', false)
    expect(sm.markerIds).toEqual(['m1'])
  })

  it('pickExternal d’un cluster capture ses membres (aplatis dans effectiveMarkerIds)', () => {
    const infos: Record<string, SelectableInfo> = {
      c1: { kind: 'cluster', type: 'cluster', group: { label: 'grp', memberIds: ['a', 'b'] } },
    }
    const { host } = makeHost({ infos })
    const sm = new SelectionManager(host)
    sm.pickExternal('c1', false)
    expect(sm.groups.map((g) => g.id)).toEqual(['c1'])
    expect(sm.effectiveMarkerIds().sort()).toEqual(['a', 'b'])
    // appliedIds : membres + clé de pastille (pour surligner la pastille).
    expect([...sm.appliedIds()].sort()).toEqual(['a', 'b', 'c1'])
  })

  it('la politique bloque un kind désactivé (clic ignoré)', () => {
    const infos: Record<string, SelectableInfo> = {
      c1: { kind: 'cluster', type: 'cluster', group: { label: 'g', memberIds: ['a'] } },
    }
    const { host } = makeHost({ infos, policy: { cluster: false } })
    const sm = new SelectionManager(host)
    sm.pickExternal('c1', false)
    expect(sm.groups).toEqual([])
    expect(sm.effectiveMarkerIds()).toEqual([])
  })
})

describe('SelectionManager — prune des groupes par membres', () => {
  it('garde le groupe tant qu’un membre vit, le retire quand tous morts', () => {
    const infos: Record<string, SelectableInfo> = {
      c1: { kind: 'cluster', type: 'cluster', group: { label: 'g', memberIds: ['a', 'b'] } },
    }
    const { host } = makeHost({ infos })
    const sm = new SelectionManager(host)
    sm.pickExternal('c1', false)

    // 'a' disparaît : le groupe survit, réduit à ['b'].
    sm.pruneExternal((id) => id !== 'a')
    expect(sm.groups).toEqual([{ id: 'c1', label: 'g', memberIds: ['b'] }])

    // tous morts : le groupe disparaît.
    sm.pruneExternal(() => false)
    expect(sm.groups).toEqual([])
  })
})
