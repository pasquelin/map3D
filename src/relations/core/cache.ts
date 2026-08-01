// Cache des réponses de routage. La clé combine le couple, le mode ET la position
// quantifiée de la cible : un TTL seul laisserait un marker mobile traîner un temps
// de trajet calculé là où il n'est plus.

import { LruMap } from '../../core/LruMap'
import { defaultConfig } from '../../config/defaultConfig'
import type { RoutingCacheConfig } from '../../config/types'
import { quantizeKey } from './geo'
import type { MapPoint, TravelMode } from './types'

type Entry = { value: unknown; expiresAt: number }

export class RouteCache {
  /**
   * `max <= 0` : l'auto-éviction du `LruMap` est désactivée — cette classe évince
   * elle-même (TTL d'abord, puis LRU), une politique que le LruMap générique ne
   * connaît pas. Il ne fournit ici que l'ordre d'insertion et la promotion.
   */
  private readonly entries = new LruMap<string, Entry>(0)

  /**
   * TTL, côté de cellule et plafond d'entrées viennent de
   * `config.providers.routing.cache` — pris en bloc plutôt qu'en trois paramètres
   * positionnels : le type existe déjà et porte exactement ces champs.
   *
   * Le côté de cellule : sous ~150 m, un recalcul n'apporte rien de visible.
   *
   * Le plafond est INDISPENSABLE et non redondant avec le TTL : la clé embarque la
   * position quantifiée de la cible, donc un marker mobile crée une clé neuve à
   * chaque cellule franchie. Les anciennes ne seront jamais relues, donc jamais
   * purgées par la voie paresseuse de `get` — le TTL seul laisse la table croître
   * indéfiniment sur une session de supervision longue.
   */
  constructor(
    private readonly cfg: RoutingCacheConfig = defaultConfig.providers.routing.cache,
    /** Injectable — le core reste déterministe et testable sans horloge réelle. */
    private readonly now: () => number = () => Date.now(),
  ) {}

  key(fromId: string, to: MapPoint, mode: TravelMode): string {
    return `${fromId}|${to.id}|${mode}|${quantizeKey(to, this.cfg.cellMeters)}`
  }

  get<T>(key: string): T | null {
    // `LruMap.get` promeut déjà en fin d'ordre sur un hit — y compris une entrée
    // expirée, mais sans effet observable puisqu'elle est supprimée juste après.
    const hit = this.entries.get(key)
    if (!hit) return null
    if (hit.expiresAt <= this.now()) {
      this.entries.delete(key)
      return null
    }
    return hit.value as T
  }

  set<T>(key: string, value: T): void {
    this.entries.set(key, { value, expiresAt: this.now() + this.cfg.ttlMs })
    if (this.entries.size > this.cfg.maxEntries) this.evict()
  }

  /**
   * Ramène la table sous son plafond. Les expirées partent d'abord — elles ne coûtent
   * rien à personne ; on ne sacrifie des entrées vivantes que si cela n'a pas suffi.
   */
  private evict(): void {
    const t = this.now()
    for (const [k, e] of this.entries.entries()) {
      if (e.expiresAt <= t) this.entries.delete(k)
    }
    for (const [k] of this.entries.entries()) {
      if (this.entries.size <= this.cfg.maxEntries) break
      this.entries.delete(k)
    }
  }

  clear(): void {
    this.entries.clear()
  }
}
