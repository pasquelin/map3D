// POST partagé aux deux fournisseurs Google (Places, Routes) : mêmes en-têtes
// (`X-Goog-Api-Key` + `X-Goog-FieldMask`), mêmes `extraHeaders` de la config
// après les nôtres, même passage par `fetchWithPolicy` (timeout/réessais). Les
// deux réimplémentaient le même patron — centralisé pour qu'ils ne divergent
// plus en silence.

import { resolveLocale, resolveRegion } from '../config/mergeConfig'
import type { AutoLocale, FetchPolicy } from '../config/types'
import { fetchWithPolicy } from '../core/fetchPolicy'

export type GoogleFetchOptions = {
  url: string
  apiKey: string
  /** FieldMask propre à l'appelant : conditionne la facturation, ne demander que ce qui est affiché. */
  fields: string
  body: unknown
  policy: FetchPolicy
  signal?: AbortSignal
  /** En-têtes de la config de l'appelant (ex. `providers.routing.headers`) — prioritaires (cas du proxy serveur). */
  extraHeaders?: Readonly<Record<string, string>>
  /** Nom court du service, pour le message d'erreur de `fetchWithPolicy`. */
  label: string
}

/** POST JSON + FieldMask vers une API Google (Places ou Routes), sous la politique réseau commune (timeout, réessais). */
export async function googleFetch(opts: GoogleFetchOptions): Promise<Response> {
  return fetchWithPolicy(
    opts.url,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': opts.apiKey,
        'X-Goog-FieldMask': opts.fields,
        // Après les nôtres : un proxy qui attend un `Authorization` doit pouvoir
        // remplacer l'en-tête de clé Google, pas seulement s'y ajouter.
        ...opts.extraHeaders,
      },
      body: JSON.stringify(opts.body),
    },
    opts.policy,
    opts.signal,
    opts.label,
  )
}

/**
 * Champs `languageCode`/`regionCode` communs aux corps Places et Routes :
 * override explicite de l'appelant prioritaire sur la config, `'auto'` déduit
 * (navigateur pour la langue, absent pour la région). Un champ absent laisse
 * l'API déduire elle-même, plutôt que d'envoyer une valeur vide.
 */
export function googleLocaleFields(
  override: { language?: string; region?: string },
  cfg: { languageCode: AutoLocale; regionCode: AutoLocale },
): { languageCode?: string; regionCode?: string } {
  const languageCode = override.language ?? resolveLocale(cfg.languageCode)
  const regionCode = override.region ?? resolveRegion(cfg.regionCode)
  return {
    ...(languageCode ? { languageCode } : {}),
    ...(regionCode ? { regionCode } : {}),
  }
}
