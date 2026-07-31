import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { flattenCatalog } from '../../catalog/flatten'
import type { CatalogId, CatalogItem, CatalogSource } from '../../catalog/types'
import { visibleWindow } from '../../catalog/window'
import { formatCount } from '../../labels/mergeLabels'
import { useConfig, useLabels, useMapContext } from '../context'
import { useCatalog } from '../hooks/useCatalog'
import { useCatalogQuery } from '../hooks/useCatalogQuery'
import { CatalogRow } from './CatalogRow'

/** Lignes rendues hors écran de chaque côté — assez pour qu'un coup de molette ne montre pas de vide. */
const OVERSCAN = 4

export type CatalogListProps = {
  source: CatalogSource
  query: string
  /** Remonte le total au panneau, qui l'affiche à côté du titre. */
  onTotal?: (total: number) => void
  /** id du `<Tooltip>` de la barre hôte, transmis à chaque ligne. */
  tipId: string
}

/**
 * Liste virtualisée d'un type de catalogue, avec pagination au défilement.
 *
 * Les enfants dépliés ne sont pas une sous-liste : `flattenCatalog` les insère dans le
 * flux à hauteur de ligne constante. C'est ce qui permet de virtualiser sans mesurer, et
 * ce qui évite un scroll imbriqué dans un scroll.
 */
export function CatalogList({ source, query, onTotal, tipId }: CatalogListProps) {
  const { theme } = useMapContext()
  const config = useConfig()
  const labels = useLabels()
  const catalog = useCatalog()
  const { items, total, loading, loadingMore, error, hasMore, loadMore, retry } = useCatalogQuery(source, query)

  const [expanded, setExpanded] = useState<ReadonlySet<CatalogId>>(new Set())
  const [children, setChildren] = useState<ReadonlyMap<CatalogId, readonly CatalogItem[]>>(new Map())

  const viewportRef = useRef<HTMLDivElement | null>(null)
  const sentinelRef = useRef<HTMLDivElement | null>(null)
  const [scrollTop, setScrollTop] = useState(0)
  const [viewportHeight, setViewportHeight] = useState(0)

  // Changer de type remet la liste à plat : les dépliages d'un autre type n'ont aucun
  // sens ici, et leurs identifiants pourraient même entrer en collision.
  useEffect(() => {
    setExpanded(new Set())
    setChildren(new Map())
    setScrollTop(0)
    if (viewportRef.current) viewportRef.current.scrollTop = 0
  }, [source.id])

  useEffect(() => {
    if (total !== null) onTotal?.(total)
  }, [total, onTotal])

  // Hauteur réelle du viewport : la fenêtre virtuelle en dépend, et elle change avec la
  // taille de la carte comme avec le contenu au-dessus (bandeau d'erreur).
  useEffect(() => {
    const el = viewportRef.current
    if (!el) return
    setViewportHeight(el.clientHeight)
    const ro = new ResizeObserver(() => setViewportHeight(el.clientHeight))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const loadMoreRef = useRef(loadMore)
  loadMoreRef.current = loadMore

  // Sentinelle de pagination. `rootMargin` la déclenche AVANT le bas réel : la page
  // suivante arrive pendant que l'utilisateur défile encore, au lieu d'un à-coup.
  useEffect(() => {
    const el = sentinelRef.current
    const root = viewportRef.current
    if (!el || !root || !hasMore) return
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) loadMoreRef.current()
      },
      { root, rootMargin: '200px' },
    )
    io.observe(el)
    return () => io.disconnect()
  }, [hasMore])

  const toggleExpand = useCallback(
    (id: CatalogId) => {
      setExpanded((prev) => {
        const next = new Set(prev)
        if (next.has(id)) {
          next.delete(id)
          return next
        }
        next.add(id)
        return next
      })
      // Chargé une seule fois : replier puis redéplier ne redemande rien.
      if (children.has(id) || !source.children) return
      const ctrl = new AbortController()
      void source
        .children(id, { query: '', limit: config.catalog.pageSize, signal: ctrl.signal })
        .then((page) => setChildren((prev) => new Map(prev).set(id, page.items)))
        .catch(() => {
          // Enfants indisponibles : on replie plutôt que de laisser un chevron ouvert
          // sur du vide, qui se lirait comme « ce groupe n'a rien ».
          setExpanded((prev) => {
            const next = new Set(prev)
            next.delete(id)
            return next
          })
        })
    },
    [children, source, config.catalog.pageSize],
  )

  const nodes = useMemo(
    () => flattenCatalog(source.id, items, expanded, children),
    [source.id, items, expanded, children],
  )

  const rowHeight = theme.sizing.catalogRowHeight
  const win = visibleWindow({ scrollTop, viewportHeight, rowHeight, count: nodes.length, overscan: OVERSCAN })

  if (loading) return <div className="m3d-catloading">{labels.catalog.loading}</div>

  return (
    <>
      {error && (
        <div className="m3d-caterror" role="alert">
          <span>{labels.catalog.error}</span>
          <button type="button" onClick={retry}>
            {labels.catalog.retry}
          </button>
        </div>
      )}

      {nodes.length === 0 && !error && (
        <div className="m3d-catempty">{query ? labels.catalog.noMatch : labels.catalog.empty}</div>
      )}

      {nodes.length > 0 && (
        <div className="m3d-catviewport" ref={viewportRef} onScroll={(e) => setScrollTop(e.currentTarget.scrollTop)}>
          <div style={{ height: win.totalHeight, position: 'relative' }}>
            {/* `translateY` plutôt qu'un espaceur : pas de nœud supplémentaire à
                recycler, et le décalage est composité par le navigateur. */}
            <div style={{ transform: `translateY(${win.padTop}px)` }}>
              {nodes.slice(win.start, win.end).map((node) => (
                <CatalogRow
                  key={node.key}
                  node={node}
                  source={source}
                  catalog={catalog}
                  expanded={expanded.has(node.item.id)}
                  onToggleExpand={toggleExpand}
                  tipId={tipId}
                />
              ))}
            </div>
            <div ref={sentinelRef} className="m3d-catmorespace" style={{ position: 'absolute', bottom: 0 }} />
          </div>
        </div>
      )}

      {loadingMore && <div className="m3d-catloading">{labels.catalog.loading}</div>}
      {total !== null && nodes.length > 0 && (
        <div className="m3d-cathead-count">
          {formatCount(labels.catalog.countSingular, labels.catalog.count, total, labels.plural)}
        </div>
      )}
    </>
  )
}
