import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { RaceGuard } from '../../catalog/race'
import type { CatalogItem, CatalogSource } from '../../catalog/types'
import { normalizeSearch } from '../../search/match'
import { useConfig } from '../context'

export type CatalogQueryState = {
  items: readonly CatalogItem[]
  /** Total annoncé par la source, ou `null` si elle n'en donne pas. */
  total: number | null
  /** Première page en vol : la liste est vide, on montre « Chargement… ». */
  loading: boolean
  /** Page suivante en vol : la liste reste affichée, on montre un pied de chargement. */
  loadingMore: boolean
  error: boolean
  hasMore: boolean
  loadMore: () => void
  retry: () => void
}

type InternalState = {
  items: readonly CatalogItem[]
  total: number | null
  /** Curseur de la page SUIVANTE. `undefined` ⇒ on a tout. */
  cursor: string | undefined
  loading: boolean
  loadingMore: boolean
  error: boolean
}

const EMPTY: InternalState = {
  items: [],
  total: null,
  cursor: undefined,
  loading: false,
  loadingMore: false,
  error: false,
}

/**
 * Une liste paginée pour une source et une recherche.
 *
 * Trois protections qui n'en font qu'une seule à l'usage — que l'utilisateur ne voie
 * jamais un résultat qui ne correspond plus à ce qu'il a tapé :
 *
 * 1. **anti-rebond** sur la frappe (💰 une requête par lettre coûte à l'hôte) ;
 * 2. **`AbortController`**, pour que la requête abandonnée ne consomme plus le réseau ;
 * 3. **`RaceGuard`**, parce que 2. ne suffit pas — une promesse déjà résolue au moment
 *    de l'abandon exécutera quand même son `.then()`.
 *
 * Le changement de SOURCE, lui, n'est pas amorti : c'est un clic, pas une frappe, et
 * attendre 250 ms après un clic se voit.
 */
export function useCatalogQuery(source: CatalogSource | undefined, query: string): CatalogQueryState {
  const config = useConfig()
  const needle = normalizeSearch(query)
  const sourceId = source?.id ?? null

  const [state, setState] = useState<InternalState>(EMPTY)

  const abortRef = useRef<AbortController | null>(null)
  const guardRef = useRef(new RaceGuard())
  const lastSourceRef = useRef<string | null>(null)

  // « Latest ref » assumé (cf. CLAUDE.md § 3) : `run` doit survivre à ses renders sans
  // se reconstruire, sinon l'effet qui en dépend relancerait une requête à chaque
  // render de l'hôte. Ces trois valeurs sont LUES au moment de l'appel, pas capturées.
  const sourceRef = useRef(source)
  sourceRef.current = source
  const needleRef = useRef(needle)
  needleRef.current = needle
  const pageSizeRef = useRef(config.catalog.pageSize)
  pageSizeRef.current = config.catalog.pageSize
  const stateRef = useRef(state)
  stateRef.current = state

  const run = useCallback((cursor: string | undefined, mode: 'first' | 'more') => {
    const src = sourceRef.current
    if (!src) return

    abortRef.current?.abort()
    const ctrl = new AbortController()
    abortRef.current = ctrl
    const token = guardRef.current.next()

    setState((s) =>
      mode === 'first'
        ? { ...s, loading: true, loadingMore: false, error: false }
        : { ...s, loadingMore: true, error: false },
    )

    src
      .list({ query: needleRef.current, cursor, limit: pageSizeRef.current, signal: ctrl.signal })
      .then((page) => {
        if (!guardRef.current.isCurrent(token)) return
        setState((s) => ({
          items: mode === 'first' ? [...page.items] : [...s.items, ...page.items],
          total: page.total ?? null,
          cursor: page.nextCursor,
          loading: false,
          loadingMore: false,
          error: false,
        }))
      })
      .catch(() => {
        // Une requête abandonnée rejette aussi : le jeton distingue « abandonnée » (à
        // ignorer) de « vraiment en échec » (à montrer).
        if (!guardRef.current.isCurrent(token)) return
        setState((s) => ({ ...s, loading: false, loadingMore: false, error: true }))
      })
  }, [])

  useEffect(() => {
    if (sourceId === null) {
      guardRef.current.cancel()
      lastSourceRef.current = null
      setState(EMPTY)
      return
    }
    // Changement de source = un clic : immédiat. Changement de recherche = une frappe :
    // amorti. Sans cette distinction, ouvrir un type ferait attendre pour rien.
    const sourceChanged = sourceId !== lastSourceRef.current
    lastSourceRef.current = sourceId
    if (sourceChanged) {
      setState(EMPTY)
      run(undefined, 'first')
      return
    }
    const t = setTimeout(() => run(undefined, 'first'), config.catalog.debounceMs)
    return () => clearTimeout(t)
  }, [sourceId, needle, config.catalog.debounceMs, run])

  // Démontage / fermeture du panneau : couper le réseau ET périmer ce qui reviendrait.
  useEffect(
    () => () => {
      abortRef.current?.abort()
      guardRef.current.cancel()
    },
    [],
  )

  const loadMore = useCallback(() => {
    const s = stateRef.current
    // Jamais deux pages en vol, et pas de relance automatique après un échec — sinon la
    // sentinelle, toujours visible en bas d'une liste courte, bombarderait la source.
    if (s.loading || s.loadingMore || s.error || s.cursor === undefined) return
    run(s.cursor, 'more')
  }, [run])

  const retry = useCallback(() => {
    const s = stateRef.current
    // Reprendre au curseur quand des pages sont déjà là : redemander la première page
    // ferait perdre à l'utilisateur tout ce qu'il avait fait défiler.
    if (s.items.length > 0 && s.cursor !== undefined) run(s.cursor, 'more')
    else run(undefined, 'first')
  }, [run])

  return useMemo(
    () => ({
      items: state.items,
      total: state.total,
      loading: state.loading,
      loadingMore: state.loadingMore,
      error: state.error,
      hasMore: state.cursor !== undefined,
      loadMore,
      retry,
    }),
    [state, loadMore, retry],
  )
}
