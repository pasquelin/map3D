// Fournisseur de routage Google Routes API v2 — même patron que `search/googlePlaces`
// (fabrique, `fetch`, `X-Goog-FieldMask`, `AbortSignal`).
//
// Routes API et NON Directions/Distance Matrix (héritées) : `computeRouteMatrix`
// répond en un seul appel pour N origines, et le FieldMask conditionne la facturation
// — ne demander que ce qui est réellement affiché.

import { defaultConfig } from '../../config/defaultConfig'
import type { RoutingConfig } from '../../config/types'
import { googleFetch, googleLocaleFields } from '../../search/googleFetch'
import { decodePolyline } from '../core/polyline'
import type { MapPoint, TravelMode } from '../core/types'
import type { MatrixEntry, ProviderRoute, RoutingProvider } from './RoutingProvider'

// Endpoints, FieldMasks (qui conditionnent la facturation), préférence de routage,
// locale et politique réseau viennent de `config.providers.routing` : c'est ce qui
// permet de viser un proxy serveur, un mock de test, ou de réduire la facture, sans
// patcher la lib. Le champ `condition` du FieldMask matrice distingue « pas
// d'itinéraire » d'une durée nulle légitime — le retirer casse cette distinction.

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
function trafficOptions(mode: TravelMode, preference: string): Record<string, string> {
  if (!TRAFFIC_AWARE_MODES.includes(mode)) return {}
  return { routingPreference: preference }
}

/** POST JSON + FieldMask, sous la politique réseau commune (timeout, réessais). */
async function post(
  url: string,
  apiKey: string,
  fields: string,
  body: unknown,
  policy: RoutingConfig,
  signal?: AbortSignal,
  /** En-têtes de `providers.routing.headers` — prioritaires (cas du proxy serveur). */
  extraHeaders?: Readonly<Record<string, string>>,
): Promise<unknown> {
  const res = await googleFetch({
    url,
    apiKey,
    fields,
    body,
    policy,
    signal,
    extraHeaders,
    label: `Google Routes ${url.split(':').pop()}`,
  })
  return res.json()
}

export type GoogleRoutesOptions = {
  apiKey: string
  /**
   * Code langue BCP-47 des textes renvoyés. Prioritaire sur `config.language`, qui
   * suit le navigateur par défaut.
   */
  language?: string
  /** Biais régional (code CLDR, ex. 'fr'). Prioritaire sur `config.regionCode`. */
  region?: string
  /** Réglages réseau et endpoints ; `defaultConfig` à défaut. */
  config?: RoutingConfig
}

export function createGoogleRoutesProvider(opts: GoogleRoutesOptions): RoutingProvider {
  // `opts.config` fourni = l'application a pris la main : `setConfig` ne l'écrase
  // pas. Sinon le provider suit `providers.routing` de la carte, poussé par
  // `<RelationLayer>` dès la première frame.
  const pinned = opts.config !== undefined
  let cfg = opts.config ?? defaultConfig.providers.routing

  // `opts.language`/`opts.region` restent prioritaires sur la config quelle qu'en
  // soit la source ; la locale est donc recalculée à chaque changement de `cfg`.
  const localeOf = (c: RoutingConfig) => ({
    ...googleLocaleFields(opts, c),
    // Absent = l'API déduit le système d'unités de la langue. C'est le
    // comportement historique, mais il ne suit PAS `labels.measure` : une
    // application qui affiche des miles obtenait des textes de manœuvre en
    // kilomètres. Le déclarer aligne les deux.
    ...(c.units ? { units: c.units } : {}),
  })
  let locale = localeOf(cfg)

  return {
    setConfig(next) {
      if (pinned || next === cfg) return
      cfg = next
      locale = localeOf(cfg)
    },

    async matrix(origins, destination, mode, signal) {
      if (origins.length === 0) return []
      const body = {
        origins: origins.map(waypoint),
        destinations: [waypoint(destination)],
        travelMode: mode,
        ...trafficOptions(mode, cfg.routingPreference),
        ...locale,
      }
      const raw = await post(cfg.matrixUrl, opts.apiKey, cfg.matrixFields, body, cfg, signal, cfg.headers)
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
        // Par défaut un seul itinéraire, le plus rapide : les variantes encombrent la
        // carte et sont facturées. `RelationEngine` sait les exploiter si on les
        // réactive (`providers.routing.alternatives`).
        computeAlternativeRoutes: cfg.alternatives,
        polylineEncoding: 'ENCODED_POLYLINE',
        ...trafficOptions(mode, cfg.routingPreference),
        ...locale,
      }
      const raw = await post(cfg.routesUrl, opts.apiKey, cfg.routeFields, body, cfg, signal, cfg.headers)
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
