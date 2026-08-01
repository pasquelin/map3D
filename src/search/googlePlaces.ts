// Provider de recherche de lieux : Google Places API (New), endpoint Text Search.
// Un SEUL appel renvoie nom, adresse, position ET viewport (→ zoom adapté au lieu),
// contrairement au couple Autocomplete + Place Details qui en coûte deux.

import { defaultConfig } from '../config/defaultConfig'
import type { PlacesConfig } from '../config/types'
import type { SearchResult } from '../shared'
import { clamp } from '../core/math'
import { googleFetch, googleLocaleFields } from './googleFetch'

export type GooglePlacesOptions = {
  apiKey: string
  /** Code langue BCP-47 des résultats. Prioritaire sur `config.languageCode`. */
  language?: string
  /** Biais régional (code CLDR, ex. 'fr'). Prioritaire sur `config.regionCode`. */
  region?: string
  /** Nombre max de résultats. Prioritaire sur `config.pageSize`. */
  limit?: number
  /** Endpoint, FieldMask (facturation) et politique réseau ; `defaultConfig` à défaut. */
  config?: PlacesConfig
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
  const cfg = opts.config ?? defaultConfig.providers.places
  const [minSize, maxSize] = cfg.pageSizeRange
  const pageSize = clamp(Math.round(opts.limit ?? cfg.pageSize), minSize, maxSize)
  const locale = googleLocaleFields(opts, cfg)
  return async (query, signal) => {
    const res = await googleFetch({
      url: cfg.url,
      apiKey: opts.apiKey,
      fields: cfg.fields,
      body: { textQuery: query, pageSize, ...locale },
      policy: cfg,
      signal,
      extraHeaders: cfg.headers,
      label: 'Google Places searchText',
    })
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
