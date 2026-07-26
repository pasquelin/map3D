// Cache des réponses de routage. La clé combine le couple, le mode ET la position
// quantifiée de la cible : un TTL seul laisserait un marker mobile traîner un temps
// de trajet calculé là où il n'est plus.

import { quantizeKey } from './geo'
import type { MapPoint, TravelMode } from './types'

type Entry = { value: unknown; expiresAt: number }

const DEFAULT_TTL_MS = 60_000
/** Côté de la cellule de position : sous ~150 m, un recalcul n'apporte rien de visible. */
const DEFAULT_CELL_METERS = 150
/**
 * Plafond d'entrées. Une borne est INDISPENSABLE et non redondante avec le TTL :
 * la clé embarque la position quantifiée de la cible, donc un marker mobile crée une
 * clé neuve à chaque cellule franchie. Les anciennes ne seront jamais relues, donc
 * jamais purgées par la voie paresseuse de `get` — le TTL seul laisse la table
 * croître indéfiniment sur une session de supervision longue.
 */
const DEFAULT_MAX_ENTRIES = 500

export class RouteCache {
  /** `Map` = ordre d'insertion garanti : la première clé itérée est la plus ancienne. */
  private readonly entries = new Map<string, Entry>()

  constructor(
    private readonly ttlMs: number = DEFAULT_TTL_MS,
    private readonly cellMeters: number = DEFAULT_CELL_METERS,
    /** Injectable — le core reste déterministe et testable sans horloge réelle. */
    private readonly now: () => number = () => Date.now(),
    private readonly maxEntries: number = DEFAULT_MAX_ENTRIES,
  ) {}

  key(fromId: string, to: MapPoint, mode: TravelMode): string {
    return `${fromId}|${to.id}|${mode}|${quantizeKey(to, this.cellMeters)}`
  }

  get<T>(key: string): T | null {
    const hit = this.entries.get(key)
    if (!hit) return null
    if (hit.expiresAt <= this.now()) {
      this.entries.delete(key)
      return null
    }
    // Réinsertion = promotion en fin d'ordre : l'éviction devient un vrai LRU et non
    // un FIFO, qui jetterait l'entrée la plus ANCIENNE même si elle est la plus lue.
    this.entries.delete(key)
    this.entries.set(key, hit)
    return hit.value as T
  }

  set<T>(key: string, value: T): void {
    this.entries.delete(key)
    this.entries.set(key, { value, expiresAt: this.now() + this.ttlMs })
    if (this.entries.size > this.maxEntries) this.evict()
  }

  /**
   * Ramène la table sous son plafond. Les expirées partent d'abord — elles ne coûtent
   * rien à personne ; on ne sacrifie des entrées vivantes que si cela n'a pas suffi.
   */
  private evict(): void {
    const t = this.now()
    for (const [k, e] of this.entries) {
      if (e.expiresAt <= t) this.entries.delete(k)
    }
    for (const k of this.entries.keys()) {
      if (this.entries.size <= this.maxEntries) break
      this.entries.delete(k)
    }
  }

  clear(): void {
    this.entries.clear()
  }
}
