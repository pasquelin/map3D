// Contrat du fournisseur de templates : le SEUL point par lequel le gestionnaire
// atteint un backend. Le core dépend de ce type, jamais d'une implémentation —
// substituer un vrai serveur au provider de démo ne demande aucune modification.
//
// Calqué sur `RoutingProvider` : construit par l'application AVANT que la carte
// n'existe, il reçoit `providers.templates` via `setConfig` (première frame puis à
// chaque changement).

import { defaultConfig } from '../../config/defaultConfig'
import type { TemplatesConfig } from '../../config/types'
import { fetchWithPolicy } from '../fetchPolicy'
import type { Template } from './types'

export type TemplateProvider = {
  /** Liste distante — fait autorité sur le cache local quand un provider est branché. */
  list(signal?: AbortSignal): Promise<Template[]>
  save(template: Template, signal?: AbortSignal): Promise<Template>
  update(id: string, patch: Partial<Template>, signal?: AbortSignal): Promise<Template>
  remove(id: string, signal?: AbortSignal): Promise<void>
  /** Reçoit `providers.templates` (endpoints, en-têtes, politique réseau). */
  setConfig?(config: TemplatesConfig): void
}

/**
 * Provider HTTP par défaut, sur une API REST : `GET baseUrl`, `POST baseUrl`,
 * `PATCH baseUrl/:id`, `DELETE baseUrl/:id`. Réutilise `fetchWithPolicy` (timeout +
 * réessais bornés) et les en-têtes de `providers.templates` — de quoi viser un proxy
 * serveur sans exposer de secret côté client.
 */
export function createHttpTemplateProvider(initial?: Partial<TemplatesConfig>): TemplateProvider {
  let cfg: Partial<TemplatesConfig> = initial ?? {}
  const base = () => {
    const url = (cfg.baseUrl ?? '').replace(/\/+$/, '')
    // `fetch('')` viserait la page courante et tenterait de la parser en JSON.
    if (!url) throw new Error('map3d: providers.templates.baseUrl est vide — aucun backend de templates')
    return url
  }

  const policy = () => cfg.fetch ?? defaultConfig.providers.templates.fetch
  const headers = (): Record<string, string> => ({ 'Content-Type': 'application/json', ...(cfg.headers ?? {}) })

  const json = async <T>(res: Response): Promise<T> => (await res.json()) as T

  return {
    async list(signal) {
      const res = await fetchWithPolicy(base(), { method: 'GET', headers: headers() }, policy(), signal, 'templates')
      return json<Template[]>(res)
    },
    async save(template, signal) {
      const res = await fetchWithPolicy(
        base(),
        { method: 'POST', headers: headers(), body: JSON.stringify(template) },
        policy(),
        signal,
        'templates',
      )
      return json<Template>(res)
    },
    async update(id, patch, signal) {
      const res = await fetchWithPolicy(
        `${base()}/${encodeURIComponent(id)}`,
        { method: 'PATCH', headers: headers(), body: JSON.stringify(patch) },
        policy(),
        signal,
        'templates',
      )
      return json<Template>(res)
    },
    async remove(id, signal) {
      await fetchWithPolicy(
        `${base()}/${encodeURIComponent(id)}`,
        { method: 'DELETE', headers: headers() },
        policy(),
        signal,
        'templates',
      )
    },
    setConfig(next) {
      cfg = next
    },
  }
}
