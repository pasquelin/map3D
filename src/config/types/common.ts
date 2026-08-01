// Types partagés entre plusieurs domaines de `MapConfig` — actuellement `FetchPolicy`,
// utilisé par `providers.routing`, `providers.places` et `providers.templates.fetch`.
// Isolé pour que ces domaines l'importent sans dépendance circulaire entre modules.

/** Réglages communs à un appel réseau sortant. */
export type FetchPolicy = {
  /** Abandon d'une requête sans réponse. `0` = pas de limite (comportement d'origine). */
  timeoutMs: number
  /** Réessais après échec réseau ou 5xx. `0` = aucun. */
  retries: number
  /**
   * Attente avant le premier réessai, DOUBLÉE à chaque tour (100 → 200 → 400…), avec
   * une part aléatoire pour désynchroniser les clients. `0` = réessai immédiat.
   *
   * Réessayer sans attendre est ce qu'il ne faut pas faire face à un serveur en
   * difficulté : les trois tentatives partent dans la même poignée de millisecondes,
   * frappent l'incident qui n'a pas eu le temps de passer, et n'ont donc pratiquement
   * aucune chance de réussir là où la première a échoué — pour trois fois le coût.
   * C'est le pendant de `TilesConfig.backoffTransientMs`, qui tenait ce rôle pour les
   * seules tuiles.
   */
  backoffMs: number
}
