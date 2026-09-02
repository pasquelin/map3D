import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { flattenCatalog, type CatalogItemNode } from '../../catalog/flatten'
import { aggregateChildren, NO_GROUP_CHECK, type GroupCheck } from '../../catalog/groups'
import { catalogKey } from '../../catalog/selection'
import type { CatalogBrowseSource, CatalogId, CatalogItem } from '../../catalog/types'
import { visibleWindow } from '../../catalog/window'
import { useConfig, useLabels, useMapContext } from '../context'
import { useCatalog } from '../hooks/useCatalog'
import { useCatalogQuery } from '../hooks/useCatalogQuery'
import { CatalogGroupRow, CatalogRow } from './CatalogRow'
import { inlineActions } from './catalogActions'

/**
 * L'état d'une ligne ORDINAIRE cochée — sans compte, elle n'a pas d'enfants.
 *
 * Constante de module, comme `NO_GROUP_CHECK` : ces deux références couvrent toutes les
 * lignes non-agrégat, qui sont l'immense majorité d'un référentiel.
 */
const ROW_ON: GroupCheck = { state: 'on', shown: 0, total: 0 }

export type CatalogListProps = {
  /** Toujours une source de PARCOURS : une bascule n'a pas de liste à ouvrir. */
  source: CatalogBrowseSource
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
  /**
   * ⚠️ Les MÉTHODES, jamais l'objet `catalog` : celui-ci est mémoïsé sur le jeton du store,
   * donc neuf à chaque mutation — chaque géométrie qui arrive referait les closures qui en
   * dépendent et défairait le `memo` de `CatalogRow`, ligne par ligne, à chaque frame de
   * défilement. Les méthodes, elles, ne dépendent que du store et de l'engine. Déstructurées
   * ici plutôt qu'au fil du fichier : `exhaustive-deps` ne sait pas voir la stabilité d'un
   * membre et réclamerait l'objet entier, c'est-à-dire exactement ce qu'on évite.
   */
  const { toggle, setMany, rememberGroup, groupState } = catalog
  const { items, loading, loadingMore, error, hasMore, loadMore, retry } = useCatalogQuery(source, query)

  const [expanded, setExpanded] = useState<ReadonlySet<CatalogId>>(new Set())
  const [children, setChildren] = useState<ReadonlyMap<CatalogId, readonly CatalogItem[]>>(new Map())

  const viewportRef = useRef<HTMLDivElement | null>(null)
  const [sentinel, setSentinel] = useState<HTMLDivElement | null>(null)
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
  //
  // Nœud en STATE, pas en ref : le viewport (et la sentinelle avec lui) n'existe pas
  // pendant « Chargement… », et `hasMore` est déjà vrai à ce moment-là. Un effet à
  // dépendances `[hasMore, …]` lisait donc une ref nulle au premier passage et ne
  // rejouait jamais — l'observateur n'était posé sur rien, et la pagination au
  // défilement était morte. Le nœud qui apparaît doit lui-même relancer l'effet.
  const prefetchMarginPx = config.catalog.prefetchMarginPx
  useEffect(() => {
    const root = viewportRef.current
    if (!sentinel || !root || !hasMore) return
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) loadMoreRef.current()
      },
      { root, rootMargin: `${prefetchMarginPx}px` },
    )
    io.observe(sentinel)
    return () => io.disconnect()
  }, [sentinel, hasMore, prefetchMarginPx])

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
        // L'appartenance est confiée au STORE, pas seulement à cet état local : refermer le
        // panneau démonte ce composant, et avec lui la seule trace de ce qu'un agrégat
        // contient — sa case se rouvrait alors décochée malgré ses zones sur la carte.
        rememberGroup(source, id, page.items)
        return page.items
      } finally {
        childLoadsRef.current = childLoadsRef.current.filter((c) => c !== ctrl)
      }
    },
    [source, config.catalog.pageSize, rememberGroup],
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

  // Propriété de la SOURCE : dérivée une fois, pas à chaque ligne rendue.
  const checkable = source.checkable !== false

  /** Cet élément est-il un agrégat ? Une seule définition pour toute la lib (cf. `groups.ts`). */
  const isGroup = useCallback((item: CatalogItem) => aggregateChildren(source, item) !== undefined, [source])

  /**
   * État de la case d'une ligne, et — pour un agrégat — le compte qu'elle affiche.
   *
   * Un agrégat ne porte PAS d'état propre : il reflète ses enfants — tous affichés, aucun,
   * ou une partie. L'appartenance est lue dans le STORE et non dans l'état local : c'est ce
   * qui la fait survivre à la fermeture du panneau, donc ce qui permet à une ligne repliée
   * d'être juste sans avoir été dépliée dans cette session.
   *
   * Une seule lecture par ligne rendue : l'état et le compte sortent ensemble, là où deux
   * accesseurs auraient rebalayé les enfants pour la même réponse, par ligne et par frame
   * de défilement. Les lignes ordinaires rendent une référence CONSTANTE — pas d'objet
   * alloué pour les dix-neuf lignes visibles à chaque frame.
   */
  const checkOf = useCallback(
    (node: CatalogItemNode, key: string): GroupCheck => {
      // Ni état à dériver, ni enfants à parcourir pour le dériver.
      if (!checkable) return NO_GROUP_CHECK
      if (!isGroup(node.item)) return catalog.isShown(key) ? ROW_ON : NO_GROUP_CHECK
      return groupState(key)
    },
    [catalog, checkable, groupState, isGroup],
  )

  /**
   * Le geste d'un AGRÉGAT depuis la liste — la case comme le nom.
   *
   * `catalog.toggle` sait le faire aussi (c'est là que vit la règle, pour l'hôte comme pour
   * nous), mais il redemande les enfants à la source : ici on passe par `ensureChildren`,
   * qui les rend depuis le cache dès que le groupe a été ouvert une fois. Même geste, une
   * requête en moins sur le chemin le plus fréquenté.
   *
   * Le cadrage est celui du geste : forcé par le nom, laissé au réglage « cadrer à
   * l'ajout » par la case.
   */
  const setGroup = useCallback(
    (item: CatalogItem, next: boolean, fit: boolean) => {
      void ensureChildren(item.id)
        .then((kids) => {
          if (kids.length > 0) setMany(source, kids, next, { fit })
        })
        .catch(() => {
          // Enfants indisponibles : rien à cocher, et la case reste où elle était.
        })
    },
    [ensureChildren, setMany, source],
  )

  /**
   * Identité STABLE entre deux renders : c'est elle qui rend `memo(CatalogRow)` opérant.
   * Une closure `(next) => onCheck(node, next)` créée par ligne le défaisait intégralement
   * — aucune ligne ne pouvait jamais être sautée au défilement.
   */
  const onCheck = useCallback(
    (node: CatalogItemNode, next: boolean) => {
      if (isGroup(node.item)) setGroup(node.item, next, false)
      else toggle(source, node.item)
    },
    [isGroup, setGroup, toggle, source],
  )

  // Le nom bascule ET emmène la caméra du même mouvement — ou cadre seulement, sur une
  // source qui ne pose pas : c'est `toggle` qui le sait (cf. `CatalogBrowseSource.checkable`).
  const onActivate = useCallback(
    (item: CatalogItem) => {
      // `checkable` EN PREMIER, avant même la question de l'agrégat : sur une source dont
      // l'hôte peint déjà les éléments, il n'y a rien à cocher — ni un élément, ni les
      // enfants d'un groupe — et le nom ne fait que cadrer. C'est `toggle` qui porte cette
      // règle (cf. `CatalogBrowseSource.checkable`), y passer la garde une seule fois.
      if (!checkable || !isGroup(item)) {
        toggle(source, item, { fit: true })
        return
      }
      // Depuis « partiellement affiché », le geste attendu est de TOUT afficher — la même
      // convention que la case, dont le nom ne doit pas diverger.
      setGroup(item, groupState(catalogKey(source.id, item.id)).state !== 'on', true)
    },
    [checkable, groupState, isGroup, setGroup, toggle, source],
  )

  const groupHeaders = config.catalog.groupHeaders
  const nodes = useMemo(
    () => flattenCatalog(items, expanded, children, groupHeaders),
    [items, expanded, children, groupHeaders],
  )

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
                // La clé d'un en-tête est son RANG, émis par `flattenCatalog` : deux
                // sections homonymes (source servie en désordre) restent distinctes, et
                // déplier un agrégat plus haut ne remonte pas celles d'en dessous.
                if (node.kind === 'group') return <CatalogGroupRow key={`g${node.rank}`} title={node.title} />
                // La clé n'est construite QUE pour les lignes rendues : portée par
                // `CatalogNode`, elle l'était pour tous les éléments accumulés, à chaque
                // page — des dizaines de milliers de chaînes jetées sur le chemin même
                // que la virtualisation dégage.
                const key = catalogKey(source.id, node.item.id)
                const check = checkOf(node, key)
                return (
                  <CatalogRow
                    key={key}
                    node={node}
                    source={source}
                    actions={actions}
                    // Rien n'entre jamais dans le store pour une source qui ne pose pas :
                    // ces trois lectures y sont constantes, et se refaisaient par ligne
                    // visible à chaque frame de défilement.
                    shown={checkable && catalog.isShown(key)}
                    pending={checkable && catalog.isPending(key)}
                    failed={checkable && catalog.hasError(key)}
                    expanded={expanded.has(node.item.id)}
                    onToggleExpand={toggleExpand}
                    checkState={check.state}
                    // Deux primitives et non l'objet : `memo(CatalogRow)` compare ses props
                    // par identité, et un `GroupCheck` neuf à chaque render l'aurait défait.
                    groupShown={check.shown}
                    groupTotal={check.total}
                    onCheck={onCheck}
                    onActivate={onActivate}
                    tipId={tipId}
                  />
                )
              })}
            </div>
            <div ref={setSentinel} className="m3d-catmorespace" style={{ position: 'absolute', bottom: 0 }} />
          </div>
        </div>
      )}

      {loadingMore && <div className="m3d-catloading">{labels.catalog.loading}</div>}
    </>
  )
}
