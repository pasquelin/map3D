// Provider de recherche de lieux : Google Places API (New), endpoint Text Search.
// Un SEUL appel renvoie nom, adresse, position ET viewport (→ zoom adapté au lieu),
// contrairement au couple Autocomplete + Place Details qui en coûte deux.

import type { SearchResult } from '../shared'
import { clamp } from '../core/math'

export type GooglePlacesOptions = {
  apiKey: string
  /** Code langue BCP-47 des résultats (défaut : langue du navigateur). */
  language?: string
  /** Biais régional (code CLDR, ex. 'fr'). */
  region?: string
  /** Nombre max de résultats (1–20, défaut 6). */
  limit?: number
}

type GooglePlace = {
  displayName?: { text?: string }
  formattedAddress?: string
  location?: { latitude: number; longitude: number }
  viewport?: {
    low?: { latitude: number; longitude: number }
    high?: { latitude: number; longitude: number }
  }
}

/**
 * Fabrique la fonction de recherche consommée par `<SearchBox search>` :
 * `(query, signal) => Promise<SearchResult[]>`. `signal` annule la requête
 * en vol quand la frappe continue (aucune réponse périmée n'écrase la bonne).
 */
export function createGooglePlacesSearch(
  opts: GooglePlacesOptions,
): (query: string, signal?: AbortSignal) => Promise<SearchResult[]> {
  const pageSize = clamp(Math.round(opts.limit ?? 6), 1, 20)
  return async (query, signal) => {
    const res = await fetch('https://places.googleapis.com/v1/places:searchText', {
      method: 'POST',
      signal,
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': opts.apiKey,
        'X-Goog-FieldMask': 'places.displayName,places.formattedAddress,places.location,places.viewport',
      },
      body: JSON.stringify({
        textQuery: query,
        pageSize,
        languageCode: opts.language ?? (typeof navigator !== 'undefined' ? navigator.language : undefined),
        ...(opts.region ? { regionCode: opts.region } : {}),
      }),
    })
    if (!res.ok) throw new Error(`Google Places searchText ${res.status}`)
    const body = (await res.json()) as { places?: GooglePlace[] }
    const results: SearchResult[] = []
    for (const p of body.places ?? []) {
      if (!p.location || !p.displayName?.text) continue
      const { low, high } = p.viewport ?? {}
      results.push({
        name: p.displayName.text,
        description: p.formattedAddress,
        lat: p.location.latitude,
        lng: p.location.longitude,
        ...(low && high
          ? { bounds: { north: high.latitude, south: low.latitude, east: high.longitude, west: low.longitude } }
          : {}),
      })
    }
    return results
  }
}
