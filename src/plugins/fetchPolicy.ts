import type { FetchPolicy } from '../config/types'

/**
 * Politique réseau par défaut d'un plugin : point de réglage unique, surchargée par
 * `plugin.data.fetchPolicy`. Modérée (les API tierces ont des quotas).
 */
export const defaultPluginFetchPolicy: FetchPolicy = {
  timeoutMs: 10_000,
  retries: 1,
  backoffMs: 300,
}
