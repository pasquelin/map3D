import { mdiClose, mdiHistory, mdiMagnify, mdiMapMarkerOutline, mdiTrashCanOutline } from '@mdi/js'
import Icon from '@mdi/react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { altitudeForBounds } from '../../core/bounds'
import { readStoredJSON, removeStoredKey, writeStoredJSON } from '../../core/storage'
import { createGooglePlacesSearch } from '../../search/googlePlaces'
import type { SearchResult } from '../../shared'
import { useLabels, useMapContext } from '../context'
import { useCamera } from '../hooks/useCamera'
import { useFitHeight } from './panelFit'
import { useDismiss } from './useDismiss'

export type { SearchResult } from '../../shared'

export type SearchBoxProps = {
  /** Notifié au choix d'un résultat (la caméra vole déjà d'elle-même vers le lieu). */
  onSelect?: (place: SearchResult) => void
  /**
   * Fonction de recherche (async, annulable via `signal`). Défaut : Google Places
   * avec la clé de `<Map googleMapsApiKey>` ; sans clé ni prop, la boîte est inerte.
   */
  search?: (query: string, signal?: AbortSignal) => Promise<SearchResult[]>
  /** Défaut : `labels.search.placeholder`. */
  placeholder?: string
  /** Altitude caméra (m) de repli quand le résultat n'a pas de viewport. */
  flyAltitude?: number
  /** Clé localStorage de l'historique — `null` pour le désactiver. */
  historyStorageKey?: string | null
  /** Nombre max d'entrées d'historique. */
  historySize?: number
}

/** Longueur mini de requête avant d'interroger le provider. */
const MIN_QUERY = 2
const DEBOUNCE_MS = 250
/** Hauteur maximale de la liste de résultats quand la place le permet (px). */
const RESULTS_MAX_HEIGHT = 300

const sameResult = (a: SearchResult, b: SearchResult) => a.name === b.name && a.lat === b.lat && a.lng === b.lng

function loadHistory(key: string): SearchResult[] {
  const raw = readStoredJSON(key)
  if (!Array.isArray(raw)) return []
  return raw.filter(
    (r): r is SearchResult =>
      !!r && typeof r === 'object' && typeof (r as SearchResult).name === 'string' &&
      typeof (r as SearchResult).lat === 'number' && typeof (r as SearchResult).lng === 'number',
  )
}

/**
 * Recherche de lieu : débouncée, annulable (la réponse d'une frappe précédente ne
 * peut jamais écraser la courante), vol caméra au zoom adapté au viewport du lieu,
 * historique des sélections en localStorage (affiché champ vide), navigation
 * clavier (↑ ↓ Entrée Échap). Sans prop `search`, utilise Google Places via la
 * clé de `<Map googleMapsApiKey>`.
 */
export function SearchBox({
  onSelect,
  search,
  placeholder,
  flyAltitude = 2500,
  historyStorageKey = 'm3d:search-history',
  historySize = 8,
}: SearchBoxProps) {
  const { engine } = useMapContext()
  const { flyTo } = useCamera()
  const labels = useLabels()
  const doSearch = useMemo(
    () =>
      search ?? (engine.googleMapsApiKey ? createGooglePlacesSearch({ apiKey: engine.googleMapsApiKey }) : undefined),
    [search, engine],
  )

  const [query, setQuery] = useState('')
  /** null = pas de réponse aboutie pour la requête courante (panneau muet, pas « aucun résultat »). */
  const [results, setResults] = useState<SearchResult[] | null>(null)
  const [open, setOpen] = useState(false)
  const [highlight, setHighlight] = useState(0)
  const [history, setHistory] = useState<SearchResult[]>(() =>
    historyStorageKey ? loadHistory(historyStorageKey) : [],
  )
  const rootRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  useDismiss(rootRef, open, () => setOpen(false))
  // Liste sous le champ : le plafond de 300px ne tient pas sur une carte courte,
  // où la place restante sous le champ est la vraie borne.
  const setResultsPanel = useFitHeight('dropdown', RESULTS_MAX_HEIGHT)

  const q = query.trim()

  // Recherche débouncée + annulable. Les résultats précédents restent affichés
  // pendant la frappe (pas de clignotement) ; l'abort garantit qu'une réponse
  // lente d'une vieille frappe ne remplace jamais celle de la requête courante.
  useEffect(() => {
    if (!doSearch || q.length < MIN_QUERY) {
      setResults(null)
      return
    }
    const ctl = new AbortController()
    const timer = setTimeout(async () => {
      try {
        const r = await doSearch(q, ctl.signal)
        if (ctl.signal.aborted) return
        setResults(r)
        setHighlight(0)
      } catch {
        // Réseau/quota : silencieux côté UI (le panneau montre « aucun résultat »).
        if (!ctl.signal.aborted) setResults([])
      }
    }, DEBOUNCE_MS)
    return () => {
      ctl.abort()
      clearTimeout(timer)
    }
  }, [q, doSearch])

  const showingHistory = q.length < MIN_QUERY
  const items = showingHistory ? history : (results ?? [])
  const showPanel = open && (showingHistory ? history.length > 0 : results !== null)

  const choose = (r: SearchResult) => {
    onSelect?.(r)
    flyTo({ lat: r.lat, lng: r.lng, altitude: r.bounds ? altitudeForBounds(r.bounds) : flyAltitude })
    // Champ vidé après sélection : prêt pour une nouvelle recherche (l'historique
    // garde le lieu choisi).
    setQuery('')
    setResults(null)
    setOpen(false)
    if (historyStorageKey) {
      const next = [r, ...history.filter((h) => !sameResult(h, r))].slice(0, historySize)
      setHistory(next)
      writeStoredJSON(historyStorageKey, next)
    }
  }

  const clearHistory = () => {
    setHistory([])
    setOpen(false)
    if (historyStorageKey) {
      removeStoredKey(historyStorageKey)
    }
  }

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      if (!showPanel || items.length === 0) return
      e.preventDefault()
      setHighlight((h) => (h + (e.key === 'ArrowDown' ? 1 : items.length - 1)) % items.length)
    } else if (e.key === 'Enter') {
      const r = items[highlight] ?? items[0]
      if (showPanel && r) {
        e.preventDefault()
        choose(r)
      }
    } else if (e.key === 'Escape') {
      setOpen(false)
      inputRef.current?.blur()
    }
  }

  return (
    <div className="m3d-search" ref={rootRef}>
      <div className="m3d-search-box">
        <Icon path={mdiMagnify} size={0.75} className="m3d-search-icon" />
        <input
          ref={inputRef}
          type="search"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value)
            setHighlight(0)
            setOpen(true)
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
          placeholder={placeholder ?? labels.search.placeholder}
          aria-label={labels.search.inputLabel}
          aria-expanded={showPanel}
        />
        {query.length > 0 && (
          <button
            type="button"
            className="m3d-search-clear"
            aria-label={labels.search.clearInput}
            onClick={() => {
              setQuery('')
              setResults(null)
              inputRef.current?.focus()
            }}
          >
            <Icon path={mdiClose} size={0.6} />
          </button>
        )}
      </div>
      {showPanel && (
        <div ref={setResultsPanel} className="m3d-search-results m3d-panel" role="listbox">
          {showingHistory && (
            <div className="m3d-settings-subtitle m3d-search-subtitle">{labels.search.historyTitle}</div>
          )}
          {items.map((r, i) => (
            <div
              key={`${r.name}-${r.lat}-${r.lng}`}
              role="option"
              aria-selected={i === highlight}
              className={`m3d-search-item${i === highlight ? ' m3d-active' : ''}`}
              onPointerEnter={() => setHighlight(i)}
              onClick={() => choose(r)}
            >
              <Icon path={showingHistory ? mdiHistory : mdiMapMarkerOutline} size={0.7} className="m3d-search-icon" />
              <div className="m3d-search-text">
                <b>{r.name}</b>
                {r.description && <small>{r.description}</small>}
              </div>
            </div>
          ))}
          {!showingHistory && items.length === 0 && <div className="m3d-search-empty">{labels.search.noResults}</div>}
          {showingHistory && (
            <button type="button" className="m3d-tagclear" onClick={clearHistory}>
              <Icon path={mdiTrashCanOutline} size={0.6} />
              {labels.search.clearHistory}
            </button>
          )}
        </div>
      )}
    </div>
  )
}
