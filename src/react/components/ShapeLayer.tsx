import { useEffect, useId, useMemo, useRef } from 'react'
import { centerOfBounds } from '../../core/bounds'
import { boundsOfShape, ringOfShape, ShapeLayer as CoreShapeLayer, type ShapeData } from '../../layers/ShapeLayer'
import { createTitleCache, type Hit, NO_MATCH, proximityRank, rankHits, scoreMatch } from '../../search/match'
import { emptyResult, SHAPE_GROUP } from '../../search/registry'
import type { Bounds } from '../../shared'
import { useLabels, useMapContext } from '../context'
import { useLayer, useLayerSync, useStatCounter } from '../hooks/useLayer'

export type ShapeLayerProps = {
  /** Zones à afficher (cercles, rectangles, polygones), drapées sur le relief. */
  shapes: ShapeData[]
}

/** Zones/formes plaquées au sol (cercle-rayon, polygone, rectangle-bounds). */
export function ShapeLayer({ shapes }: ShapeLayerProps) {
  const { engine, theme } = useMapContext()

  const ref = useLayer(
    () =>
      new CoreShapeLayer(engine.annotations, engine.projection, {
        color: theme.colors.zone.stroke,
        width: 6,
        fillOpacity: 0.22,
        renderOrder: 1,
      }),
  )

  useStatCounter(ref)
  useLayerSync(ref, theme, (layer, t) => layer.setDefaults({ color: t.colors.zone.stroke }))
  useLayerSync(ref, shapes, (layer, s) => layer.setShapes(s))

  const latest = useRef(shapes)
  latest.current = shapes
  const groupLabel = useLabels().search.groups.shape
  const searchSource = useId()
  const normalizedTitle = useMemo(() => createTitleCache<ShapeData>((s) => s.title), [])

  // Fournisseur de recherche. Une forme nommée est cherchable, une forme anonyme est
  // ignorée : « polygon-3 » n'est pas un résultat. Chaque entrée porte son emprise —
  // c'est ce qui fait CADRER la zone au choix au lieu de survoler son centre.
  useEffect(() => {
    return engine.search.register({
      query: (needle, opts) => {
        if (opts.group && opts.group !== SHAPE_GROUP) return emptyResult()
        const hits: Hit<{ shape: ShapeData; bounds: Bounds }>[] = []
        for (const s of latest.current) {
          if (!s.title) continue
          const score = scoreMatch(normalizedTitle(s), needle)
          if (score === NO_MATCH) continue
          const bounds = boundsOfShape(s)
          if (!bounds) continue
          const position = centerOfBounds(bounds)
          hits.push({
            item: { shape: s, bounds },
            score,
            distance: opts.origin ? proximityRank(position, opts.origin) : 0,
          })
        }
        return {
          entries: rankHits(hits, opts.limit).map(({ shape, bounds }) => ({
            group: SHAPE_GROUP,
            id: shape.id ?? shape.title!,
            title: shape.title!,
            position: centerOfBounds(bounds),
            bounds,
            color: shape.color ?? theme.colors.zone.stroke,
          })),
          totals: new Map([[SHAPE_GROUP, hits.length]]),
        }
      },
    })
  }, [engine, theme, normalizedTitle])

  // Rubrique déclarée : le registre ne prévient ses abonnés que si le compte change.
  useEffect(() => {
    let count = 0
    for (const s of shapes) if (s.title) count++
    engine.search.report(
      searchSource,
      count > 0 ? [{ id: SHAPE_GROUP, label: groupLabel, color: theme.colors.zone.stroke, count }] : [],
    )
  }, [engine, shapes, groupLabel, theme, searchSource])
  useEffect(() => () => engine.search.unreport(searchSource), [engine, searchSource])

  // Expose les formes hôte `erasable` à la gomme (via `engine.erasables`). `items()` lit la
  // liste courante par ref (`latest`) — provider monté une fois, la gomme interroge au besoin.
  useEffect(
    () =>
      engine.erasables.register({
        items: () =>
          latest.current
            .filter((s) => s.erasable && s.id != null)
            .map((s) => ({
              id: s.id!,
              ring: ringOfShape(s),
              closed: s.kind !== 'line' && s.kind !== 'arrow',
              kind: 'shape' as const,
            })),
        // `some` et non `items().length` : un test de présence ne construit ni anneaux
        // ni tableau (cf. `ErasableProvider.has`).
        has: (kind) => kind === 'shape' && latest.current.some((s) => s.erasable && s.id != null),
      }),
    [engine],
  )

  // Cf. `PathLayer` : la barre retire la gomme quand plus rien n'est effaçable, et le
  // provider lisant par ref ne notifie rien de lui-même. Sur le BOOLÉEN, pas sur `shapes`.
  const hasErasableShapes = shapes.some((s) => s.erasable && s.id != null)
  useEffect(() => engine.erasables.itemsChanged(), [engine, hasErasableShapes])

  return null
}
