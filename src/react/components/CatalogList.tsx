import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { flattenCatalog, type CatalogNode } from '../../catalog/flatten'
import { catalogKey } from '../../catalog/selection'
import type { CatalogId, CatalogItem, CatalogSource } from '../../catalog/types'
import { visibleWindow } from '../../catalog/window'
import { useConfig, useLabels, useMapContext } from '../context'
import { useCatalog } from '../hooks/useCatalog'
import { useCatalogQuery } from '../hooks/useCatalogQuery'
import { CatalogRow } from './CatalogRow'
import { inlineActions } from './catalogActions'

export type CatalogListProps = {
  source: CatalogSource
  query: string
  /** id du `<Tooltip>` de la barre hôte, transmis à chaque ligne. */
  tipId: string
  /** Côté de la barre — le cadrage réserve la largeur du panneau de CE côté. */
  side: 'left' | 'right'
}

/**
 * Liste virtualisée d'un type de catalogue, avec pagination au défilement.
 *
 * Les enfants dépliés ne sont pas une sous-liste : `flattenCatalog` les insère dans le
 * flux à hauteur de ligne constante. C'est ce qui permet de virtualiser sans mesurer, et
 * ce qui évite un scroll imbriqué dans un scroll.
 */
export function CatalogList({ source, query, tipId, side }: CatalogListProps) {
  const { theme } = useMapContext()
  const config = useConfig()
  const labels = useLabels()
  const catalog = useCatalog(side)
  const { items, loading, loadingMore, error, hasMore, loadMore, retry } = useCatalogQuery(source, query)

  const [expanded, setExpanded] = useState<ReadonlySet<CatalogId>>(new Set())
  const [children, setChildren] = useState<ReadonlyMap<CatalogId, readonly CatalogItem[]>>(new Map())

  const viewportRef = useRef<HTMLDivElement | null>(null)
  const sentinelRef = useRef<HTMLDivElement | null>(null)
  const [scrollTop, setScrollTop] = useState(0)
  const [viewportHeight, setViewportHeight] = useState(0)

  /**
   * Chargements d'enfants en vol, par source.
   *
   * Le contrôleur existait déjà mais n'était JAMAIS abandonné : fermer le panneau
   * pendant le chargement laissait la requête courir, et surtout une réponse de la
   * source A arrivant après bascule vers B insérait les enfants de A dans la table de B
   * — `CatalogId` n'étant unique que dans sa source, une collision d'id donnait à une
   * ligne de B l'état de case d'un groupe de A.
   */
  const childLoadsRef = useRef<AbortController[]>([])
  const abortChildLoads = useCallback(() => {
    for (const c of childLoadsRef.current) c.abort()
    childLoadsRef.current = []
  }, [])

  // Changer de type remet la liste à plat : les dépliages d'un autre type n'ont aucun
  // sens ici, et leurs identifiants pourraient même entrer en collision.
  useEffect(() => {
    setExpanded(new Set())
    setChildren(new Map())
    setScrollTop(0)
    if (viewportRef.current) viewportRef.current.scrollTop = 0
    return abortChildLoads
  }, [source.id, abortChildLoads])

  // Démontage (panneau refermé) : couper ce qui reste en vol.
  useEffect(() => abortChildLoads, [abortChildLoads])

  /**
   * Hauteur réelle du viewport — la fenêtre virtuelle en dépend.
   *
   * Callback ref et NON un effet à dépendances vides : le viewport n'existe pas au
   * premier rendu (la liste affiche « Chargement… »), si bien qu'un effet monté une
   * seule fois mesurait un nœud nul et laissait la hauteur à 0. `visibleWindow` ne
   * rendait alors que les lignes de sur-rendu, dans un conteneur dimensionné pour
   * toutes — d'où un grand vide sous la dernière. Ici, on mesure au moment exact où le
   * nœud apparaît, et on le suit ensuite (la carte se redimensionne, un bandeau
   * d'erreur s'ajoute au-dessus).
   */
  const attachViewport = useCallback((el: HTMLDivElement) => {
    viewportRef.current = el
    setViewportHeight(el.clientHeight)
    const ro = new ResizeObserver(() => setViewportHeight(el.clientHeight))
    ro.observe(el)
    // React 19 exploite la fonction rendue par une callback ref : un `useEffect` de
    // démontage en plus n'aurait fait que dupliquer ce nettoyage.
    return () => {
      ro.disconnect()
      viewportRef.current = null
    }
  }, [])

  /**
   * Défilement publié UNE fois par frame.
   *
   * Un trackpad émet des `scroll` à 60–120 Hz et chacun re-rendait la liste entière :
   * jusqu'à deux rendus complets par frame, pris sur le budget de la carte qui, elle,
   * doit continuer à peindre. Même remède que `useRelationInteraction` pour le survol
   * des relations — on accumule dans un ref, on ne planifie qu'une frame.
   */
  const frameRef = useRef(0)
  const pendingScrollRef = useRef(0)
  const onScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    pendingScrollRef.current = e.currentTarget.scrollTop
    if (frameRef.current !== 0) return
    frameRef.current = requestAnimationFrame(() => {
      frameRef.current = 0
      setScrollTop(pendingScrollRef.current)
    })
  }, [])
  useEffect(
    () => () => {
      if (frameRef.current !== 0) cancelAnimationFrame(frameRef.current)
    },
    [],
  )

  const loadMoreRef = useRef(loadMore)
  loadMoreRef.current = loadMore

  // Sentinelle de pagination. `prefetchMarginPx` la déclenche AVANT le bas réel : la
  // page suivante arrive pendant que l'utilisateur défile encore, au lieu d'un à-coup.
  const prefetchMarginPx = config.catalog.prefetchMarginPx
  useEffect(() => {
    const el = sentinelRef.current
    const root = viewportRef.current
    if (!el || !root || !hasMore) return
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) loadMoreRef.current()
      },
      { root, rootMargin: `${prefetchMarginPx}px` },
    )
    io.observe(el)
    return () => io.disconnect()
  }, [hasMore, prefetchMarginPx])

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
      childLoadsRef.current.push(ctrl)
      try {
        const page = await source.children(id, { query: '', limit: config.catalog.pageSize, signal: ctrl.signal })
        // Source changée entre-temps : ces enfants ne sont plus ceux de la liste
        // affichée, et les écrire les rattacherait à un parent qui n'est pas le leur.
        if (ctrl.signal.aborted) return []
        setChildren((prev) => new Map(prev).set(id, page.items))
        return page.items
      } finally {
        childLoadsRef.current = childLoadsRef.current.filter((c) => c !== ctrl)
      }
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
    (node: CatalogNode, key: string): 'on' | 'off' | 'mixed' => {
      const kids = node.item.hasChildren ? children.get(node.item.id) : undefined
      if (!kids || kids.length === 0) return catalog.isShown(key) ? 'on' : 'off'
      let shown = 0
      for (const k of kids) if (catalog.isShown(catalogKey(source.id, k.id))) shown++
      if (shown === 0) return 'off'
      return shown === kids.length ? 'on' : 'mixed'
    },
    [catalog, children, source.id],
  )

  /**
   * Identité STABLE entre deux renders : c'est elle qui rend `memo(CatalogRow)`
   * opérant. Une closure `(next) => onCheck(node, next)` créée par ligne le défaisait
   * intégralement — aucune ligne ne pouvait jamais être sautée au défilement.
   */
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
        .then((kids) => {
          if (kids.length > 0) catalog.setMany(source, kids, next)
        })
        .catch(() => {
          // Enfants indisponibles : rien à cocher, et la case reste où elle était.
        })
    },
    [catalog, ensureChildren, source],
  )

  const onActivate = useCallback((item: CatalogItem) => catalog.toggle(source, item, { fit: true }), [catalog, source])

  const nodes = useMemo(() => flattenCatalog(items, expanded, children), [items, expanded, children])

  // Propriété de la SOURCE, pas de la ligne : calculée 19 fois par frame de défilement
  // pour une valeur qui ne change jamais entre deux lignes.
  const actions = useMemo(
    () => inlineActions(source, config.catalog.maxInlineActions),
    [source, config.catalog.maxInlineActions],
  )

  const rowHeight = theme.sizing.catalogRowHeight
  const win = visibleWindow({
    scrollTop,
    viewportHeight,
    rowHeight,
    count: nodes.length,
    overscan: config.catalog.overscanRows,
  })

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
        <div className="m3d-catviewport" ref={attachViewport} onScroll={onScroll}>
          <div style={{ height: win.totalHeight, position: 'relative' }}>
            {/* `translateY` plutôt qu'un espaceur : pas de nœud supplémentaire à
                recycler, et le décalage est composité par le navigateur. */}
            <div style={{ transform: `translateY(${win.padTop}px)` }}>
              {nodes.slice(win.start, win.end).map((node) => {
                // La clé n'est construite QUE pour les lignes rendues : portée par
                // `CatalogNode`, elle l'était pour tous les éléments accumulés, à chaque
                // page — des dizaines de milliers de chaînes jetées sur le chemin même
                // que la virtualisation dégage.
                const key = catalogKey(source.id, node.item.id)
                return (
                  <CatalogRow
                    key={key}
                    node={node}
                    source={source}
                    actions={actions}
                    shown={catalog.isShown(key)}
                    pending={catalog.isPending(key)}
                    failed={catalog.hasError(key)}
                    expanded={expanded.has(node.item.id)}
                    onToggleExpand={toggleExpand}
                    checkState={checkStateOf(node, key)}
                    onCheck={onCheck}
                    onActivate={onActivate}
                    tipId={tipId}
                  />
                )
              })}
            </div>
            <div ref={sentinelRef} className="m3d-catmorespace" style={{ position: 'absolute', bottom: 0 }} />
          </div>
        </div>
      )}

      {loadingMore && <div className="m3d-catloading">{labels.catalog.loading}</div>}
    </>
  )
}
