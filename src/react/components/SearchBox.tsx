import { useEffect, useRef, useState } from 'react'
import type { LatLng } from '../../shared'
import { useLabels } from '../context'
import { useCamera } from '../hooks/useCamera'

export type SearchResult = LatLng & { name: string; description?: string }

export type SearchBoxProps = {
  onSelect: (place: SearchResult) => void
  /** Fonction de recherche (async). Sans elle, la boîte reste inerte. */
  search?: (query: string) => Promise<SearchResult[]>
  /** Défaut : `labels.search.placeholder`. */
  placeholder?: string
  /** Altitude caméra (mètres) au choix d'un résultat. */
  flyAltitude?: number
}

/** Boîte de recherche de lieu (débouncée). Utilisable seule ou remplaçable. */
export function SearchBox({ onSelect, search, placeholder, flyAltitude = 2500 }: SearchBoxProps) {
  const { flyTo } = useCamera()
  const labels = useLabels()
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SearchResult[]>([])
  const [open, setOpen] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (!search || query.trim().length === 0) {
      setResults([])
      setOpen(false)
      return
    }
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(async () => {
      const r = await search(query)
      setResults(r)
      setOpen(r.length > 0)
    }, 250)
    return () => {
      if (timer.current) clearTimeout(timer.current)
    }
  }, [query, search])

  const choose = (r: SearchResult) => {
    onSelect(r)
    flyTo({ lat: r.lat, lng: r.lng, altitude: flyAltitude })
    setQuery(r.name)
    setOpen(false)
  }

  return (
    <div className="m3d-search">
      <div className="m3d-search-box">
        <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="var(--m3d-muted)" strokeWidth={2} strokeLinecap="round">
          <circle cx="11" cy="11" r="7" />
          <path d="M20 20l-4.3-4.3" />
        </svg>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => setOpen(results.length > 0)}
          placeholder={placeholder ?? labels.search.placeholder}
          aria-label={labels.search.inputLabel}
        />
      </div>
      {open && (
        <div className="m3d-search-results m3d-panel">
          {results.map((r, i) => (
            <div key={`${r.name}-${i}`} className="m3d-search-item" onClick={() => choose(r)}>
              <span aria-hidden>📍</span>
              <div>
                <b style={{ display: 'block' }}>{r.name}</b>
                {r.description && <small style={{ color: 'var(--m3d-muted)' }}>{r.description}</small>}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
