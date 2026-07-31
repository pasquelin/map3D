import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { flattenCatalog, type CatalogNode } from '../../catalog/flatten'
import { catalogKey } from '../../catalog/selection'
import type { CatalogId, CatalogItem, CatalogSource } from '../../catalog/types'
import { visibleWindow } from '../../catalog/window'
import { useConfig, useLabels, useMapContext } from '../context'
import { useCatalog } from '../hooks/useCatalog'
import { useCatalogQuery } from '../hooks/useCatalogQuery'
import { CatalogRow } from './CatalogRow'

/** Lignes rendues hors écran de chaque côté — assez pour qu'un coup de molette ne montre pas de vide. */
const OVERSCAN = 4

export type CatalogListProps = {
  source: CatalogSource
  query: string
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
export function CatalogList({ source, query, tipId }: CatalogListProps) {
  const { theme } = useMapContext()
  const config = useConfig()
  const labels = useLabels()
  const catalog = useCatalog()
  const { items, loading, loadingMore, error, hasMore, loadMore, retry } = useCatalogQuery(source, query)

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

  const childrenRef = useRef(children)
  childrenRef.current = children

  /**
   * Enfants d'un agrégat, chargés une seule fois.
   *
   * Sert au dépliage COMME à la case à cocher : cocher un groupe replié doit pouvoir
   * afficher ses zones sans qu'on ait eu à l'ouvrir d'abord.
   */
  const ensureChildren = useCallback(
    async (id: CatalogId): Promise<readonly CatalogItem[]> => {
      const known = childrenRef.current.get(id)
      if (known) return known
      if (!source.children) return []
      const ctrl = new AbortController()
      const page = await source.children(id, { query: '', limit: config.catalog.pageSize, signal: ctrl.signal })
      setChildren((prev) => new Map(prev).set(id, page.items))
      return page.items
    },
    [source, config.catalog.pageSize],
  )

  const toggleExpand = useCallback(
    (id: CatalogId) => {
      setExpanded((prev) => {
        const next = new Set(prev)
        if (next.has(id)) next.delete(id)
        else next.add(id)
        return next
      })
      void ensureChildren(id).catch(() => {
        // Enfants indisponibles : on replie plutôt que de laisser un chevron ouvert sur
        // du vide, qui se lirait comme « ce groupe n'a rien ».
        setExpanded((prev) => {
          const next = new Set(prev)
          next.delete(id)
          return next
        })
      })
    },
    [ensureChildren],
  )

  /**
   * État de la case d'une ligne.
   *
   * Un agrégat ne porte PAS d'état propre : il reflète ses enfants — tous affichés,
   * aucun, ou une partie. Sans cela, cocher un groupe laissait ses enfants décochés à
   * l'écran alors que leurs zones étaient bien sur la carte : deux vérités pour une.
   * Enfants inconnus (jamais dépliés) : on retombe sur l'état de l'agrégat lui-même,
   * qui est alors la seule information disponible.
   */
  const checkStateOf = useCallback(
    (node: CatalogNode): 'on' | 'off' | 'mixed' => {
      const kids = node.item.hasChildren ? children.get(node.item.id) : undefined
      if (!kids || kids.length === 0) return catalog.isShown(node.key) ? 'on' : 'off'
      const shown = kids.filter((k) => catalog.isShown(catalogKey(source.id, k.id))).length
      if (shown === 0) return 'off'
      return shown === kids.length ? 'on' : 'mixed'
    },
    [catalog, children, source.id],
  )

  const onCheck = useCallback(
    (node: CatalogNode, next: boolean) => {
      if (!node.item.hasChildren || !source.children) {
        catalog.toggle(source, node.item)
        return
      }
      // Cocher un agrégat porte sur ses ENFANTS, qu'il faut donc connaître — même
      // replié. Ce sont eux qui entrent dans la sélection, jamais l'agrégat : sinon la
      // même zone serait comptée deux fois et un décochage d'enfant ne dirait rien.
      void ensureChildren(node.item.id)
        .then((kids) => catalog.setMany(source, kids, next))
        .catch(() => {
          // Enfants indisponibles : rien à cocher, et la case reste où elle était.
        })
    },
    [catalog, ensureChildren, source],
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
                  checkState={checkStateOf(node)}
                  onCheck={(next) => onCheck(node, next)}
                  tipId={tipId}
                />
              ))}
            </div>
            <div ref={sentinelRef} className="m3d-catmorespace" style={{ position: 'absolute', bottom: 0 }} />
          </div>
        </div>
      )}

      {loadingMore && <div className="m3d-catloading">{labels.catalog.loading}</div>}
    </>
  )
}
