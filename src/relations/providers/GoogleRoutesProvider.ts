// Fournisseur de routage Google Routes API v2 — même patron que `search/googlePlaces`
// (fabrique, `fetch`, `X-Goog-FieldMask`, `AbortSignal`).
//
// Routes API et NON Directions/Distance Matrix (héritées) : `computeRouteMatrix`
// répond en un seul appel pour N origines, et le FieldMask conditionne la facturation
// — ne demander que ce qui est réellement affiché.

import { decodePolyline } from '../core/polyline'
import type { MapPoint, TravelMode } from '../core/types'
import type { MatrixEntry, ProviderRoute, RoutingProvider } from './RoutingProvider'

const MATRIX_URL = 'https://routes.googleapis.com/distanceMatrix/v2:computeRouteMatrix'
const ROUTES_URL = 'https://routes.googleapis.com/directions/v2:computeRoutes'

/** Le champ `condition` distingue « pas d'itinéraire » d'une durée nulle légitime. */
const MATRIX_FIELDS = 'originIndex,destinationIndex,duration,distanceMeters,condition'
const ROUTE_FIELDS = 'routes.duration,routes.distanceMeters,routes.polyline.encodedPolyline'

/** Le trafic n'est modélisé que pour les modes motorisés ; l'envoyer ailleurs fait échouer la requête. */
const TRAFFIC_AWARE_MODES: readonly TravelMode[] = ['DRIVE', 'TWO_WHEELER']

type LatLngLiteral = { latitude: number; longitude: number }
type MatrixElement = {
  originIndex?: number
  destinationIndex?: number
  distanceMeters?: number
  duration?: string
  condition?: string
}
type RouteElement = { distanceMeters?: number; duration?: string; polyline?: { encodedPolyline?: string } }

const waypoint = (p: MapPoint): { waypoint: { location: { latLng: LatLngLiteral } } } => ({
  waypoint: { location: { latLng: { latitude: p.lat, longitude: p.lng } } },
})

/** `google.protobuf.Duration` sérialisée en secondes suffixées (« 1234s », « 12.5s »). */
function parseDuration(raw: string | undefined): number | null {
  if (!raw) return null
  const seconds = Number.parseFloat(raw.endsWith('s') ? raw.slice(0, -1) : raw)
  return Number.isFinite(seconds) ? seconds : null
}

/**
 * Préférence de routage, seulement là où l'API l'accepte.
 *
 * `departureTime` est volontairement absent : l'API exige un horodatage
 * STRICTEMENT futur, or « maintenant » est déjà passé le temps que la requête
 * parte et arrive (`Timestamp must be set to a future time`). Omis, le trafic
 * courant est utilisé — exactement ce qu'on veut. Il ne faudrait le renseigner
 * que pour un départ planifié, avec une marge.
 */
function trafficOptions(mode: TravelMode): Record<string, string> {
  if (!TRAFFIC_AWARE_MODES.includes(mode)) return {}
  return { routingPreference: 'TRAFFIC_AWARE_OPTIMAL' }
}

async function post(url: string, apiKey: string, fields: string, body: unknown, signal?: AbortSignal): Promise<unknown> {
  const res = await fetch(url, {
    method: 'POST',
    signal,
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': apiKey,
      'X-Goog-FieldMask': fields,
    },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error(`Google Routes ${url.split(':').pop()} ${res.status}`)
  return res.json()
}

export type GoogleRoutesOptions = {
  apiKey: string
  /** Code langue BCP-47 des textes renvoyés (défaut : langue du navigateur). */
  language?: string
  /** Biais régional (code CLDR, ex. 'fr'). */
  region?: string
}

export function createGoogleRoutesProvider(opts: GoogleRoutesOptions): RoutingProvider {
  const languageCode = opts.language ?? (typeof navigator !== 'undefined' ? navigator.language : undefined)
  const locale = { ...(languageCode ? { languageCode } : {}), ...(opts.region ? { regionCode: opts.region } : {}) }

  return {
    async matrix(origins, destination, mode, signal) {
      if (origins.length === 0) return []
      const body = {
        origins: origins.map(waypoint),
        destinations: [waypoint(destination)],
        travelMode: mode,
        ...trafficOptions(mode),
        ...locale,
      }
      const raw = await post(MATRIX_URL, opts.apiKey, MATRIX_FIELDS, body, signal)
      // La réponse est un TABLEAU d'éléments, dans un ordre non garanti : c'est
      // `originIndex` qui rattache une case à sa cible, jamais la position.
      const elements: MatrixElement[] = Array.isArray(raw) ? raw : []
      const byId = new Map<string, MatrixEntry>()
      for (const el of elements) {
        const origin = el.originIndex === undefined ? undefined : origins[el.originIndex]
        if (!origin) continue
        const duration = parseDuration(el.duration)
        if (el.condition !== 'ROUTE_EXISTS' || duration === null || el.distanceMeters === undefined) {
          byId.set(origin.id, { toId: origin.id, error: true })
          continue
        }
        byId.set(origin.id, { toId: origin.id, distanceMeters: el.distanceMeters, durationSeconds: duration })
      }
      // Une origine absente de la réponse est un échec pour ELLE seule : les autres
      // liens gardent leurs temps réels.
      return origins.map((o) => byId.get(o.id) ?? { toId: o.id, error: true })
    },

    async route(from, to, mode, signal) {
      const body = {
        origin: { location: { latLng: { latitude: from.lat, longitude: from.lng } } },
        destination: { location: { latLng: { latitude: to.lat, longitude: to.lng } } },
        travelMode: mode,
        // Un seul itinéraire : le plus rapide. Les variantes encombrent la carte et
        // sont facturées ; `RelationEngine` sait les exploiter si on les réactive.
        computeAlternativeRoutes: false,
        polylineEncoding: 'ENCODED_POLYLINE',
        ...trafficOptions(mode),
        ...locale,
      }
      const raw = await post(ROUTES_URL, opts.apiKey, ROUTE_FIELDS, body, signal)
      const routes = (raw as { routes?: RouteElement[] }).routes ?? []
      const out: ProviderRoute[] = []
      for (const r of routes) {
        const duration = parseDuration(r.duration)
        const encoded = r.polyline?.encodedPolyline
        if (duration === null || r.distanceMeters === undefined || !encoded) continue
        out.push({ distanceMeters: r.distanceMeters, durationSeconds: duration, path: decodePolyline(encoded) })
      }
      return out
    },
  }
}
