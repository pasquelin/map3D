// Politique réseau commune aux fournisseurs tiers : timeout par tentative et
// réessais bornés.
//
// Pourquoi ici plutôt que dans chaque provider : les deux chemins réseau de la lib
// (routage, recherche de lieu) n'avaient NI timeout NI retry. Une requête sans
// réponse restait pendante indéfiniment — une relation restait « en cours de calcul »
// pour toujours, une recherche ne rendait jamais la main. Les deux ont besoin de la
// même chose, et la dupliquer garantissait qu'elles divergent.

import type { FetchPolicy } from '../config/types'

/**
 * Statuts qu'il est inutile de réessayer : la requête a été REFUSÉE, pas perdue.
 * Réessayer ne ferait que consommer le quota plus vite.
 */
const FATAL_STATUS = new Set([400, 401, 403, 404, 429])

/** Erreur d'un statut HTTP non-ok, porteuse du code pour la décision de réessai. */
export class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message)
    this.name = 'HttpError'
  }
}

/**
 * Attente annulable.
 *
 * Sans écoute du signal, un abandon pendant la pause d'un réessai ne serait constaté
 * qu'à son terme : une frappe abandonnée continuerait de tenir la boucle ouverte
 * jusqu'à la fin d'un backoff qui ne sert plus à rien.
 */
function delay(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort)
      resolve()
    }, ms)
    const onAbort = () => {
      clearTimeout(timer)
      reject(signal?.reason)
    }
    signal?.addEventListener('abort', onAbort, { once: true })
  })
}

/**
 * Attente avant le réessai `attempt` (0 = le premier) : doublement à chaque tour, plus
 * une part aléatoire jusqu'à 50 %.
 *
 * Le hasard n'est pas cosmétique : sans lui, tous les clients qui ont essuyé le même
 * incident réessaient à la même milliseconde et le refrappent en choeur, exactement
 * quand il est le plus fragile.
 */
const backoffFor = (base: number, attempt: number): number =>
  base <= 0 ? 0 : Math.round(base * 2 ** attempt * (1 + Math.random() * 0.5))

/**
 * `fetch` avec timeout par tentative et réessais espacés d'un backoff exponentiel.
 *
 * Le `signal` de l'appelant reste maître : il annule la tentative en cours, **et**
 * l'attente entre deux tentatives, **et** interrompt la boucle — une frappe qui
 * continue ne doit pas laisser trois tentatives périmées se dérouler en fond. Le
 * timeout est propre à chaque tentative, d'où un `AbortController` neuf à chaque
 * tour : réutiliser le même ferait avorter instantanément tous les réessais suivant
 * le premier timeout.
 *
 * @param label Nom court du service, pour le message d'erreur.
 */
export async function fetchWithPolicy(
  url: string,
  init: RequestInit,
  policy: FetchPolicy,
  signal?: AbortSignal,
  label = 'fetch',
): Promise<Response> {
  const attempts = Math.max(0, Math.round(policy.retries)) + 1
  let lastError: unknown
  for (let i = 0; i < attempts; i++) {
    signal?.throwIfAborted()
    const ctrl = new AbortController()
    const onAbort = () => ctrl.abort(signal?.reason)
    signal?.addEventListener('abort', onAbort, { once: true })
    const timer =
      policy.timeoutMs > 0
        ? setTimeout(() => ctrl.abort(new Error(`${label}: délai dépassé (${policy.timeoutMs} ms)`)), policy.timeoutMs)
        : undefined
    try {
      const res = await fetch(url, { ...init, signal: ctrl.signal })
      if (res.ok) return res
      const err = new HttpError(res.status, `${label} ${res.status}`)
      if (FATAL_STATUS.has(res.status)) throw err
      // Corps abandonné : sans cette annulation, le flux d'une réponse d'erreur reste
      // ouvert jusqu'au ramasse-miettes, et chaque réessai en laisse un de plus.
      void res.body?.cancel().catch(() => {})
      lastError = err
    } catch (e) {
      // Abandon voulu par l'appelant : on propage tel quel, ce n'est pas un échec.
      if (signal?.aborted) throw e
      if (e instanceof HttpError && FATAL_STATUS.has(e.status)) throw e
      lastError = e
    } finally {
      clearTimeout(timer)
      signal?.removeEventListener('abort', onAbort)
    }
    // Après la dernière tentative, attendre ne servirait qu'à retarder l'échec.
    const pause = i < attempts - 1 ? backoffFor(policy.backoffMs, i) : 0
    if (pause > 0) await delay(pause, signal)
  }
  throw lastError instanceof Error ? lastError : new Error(`${label}: échec après ${attempts} tentative(s)`)
}
