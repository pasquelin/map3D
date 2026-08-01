/**
 * Cache LRU générique adossé à un `Map`. Un `Map` garde l'ordre d'insertion — la
 * première clé itérée est la plus ancienne — donc la promotion d'une entrée
 * consultée ou réécrite se fait par **delete + set** : c'est le seul moyen de la
 * repousser en fin d'ordre d'itération, un `Map` ne se réordonnant jamais sur
 * simple lecture.
 *
 * Ne capture QUE la mécanique LRU pure (promotion + éviction de la plus ancienne
 * entrée au-delà de `max`). Une sémantique en plus côté appelant (TTL, dispose de
 * ressource…) reste dans l'appelant, qui compose par-dessus avec `entries()` /
 * `delete()` — voir `RouteCache` (`src/relations/core/cache.ts`) pour un exemple
 * d'éviction TTL-aware construite au-dessus d'un `LruMap` dont l'auto-éviction est
 * désactivée (`max <= 0`).
 */
export class LruMap<K, V> {
  private readonly store = new Map<K, V>()

  /** `max <= 0` désactive l'éviction automatique — table illimitée côté LruMap. */
  constructor(private readonly max: number) {}

  get size(): number {
    return this.store.size
  }

  /** Lit et promeut (déplace en fin d'ordre) si la clé existe. */
  get(key: K): V | undefined {
    if (!this.store.has(key)) return undefined
    const value = this.store.get(key) as V
    this.store.delete(key)
    this.store.set(key, value)
    return value
  }

  /** Insère (ou remplace, en promouvant) puis évince la plus ancienne entrée si `max` est dépassé. */
  set(key: K, value: V): void {
    this.store.delete(key)
    this.store.set(key, value)
    if (this.max > 0 && this.store.size > this.max) {
      const oldest = this.store.keys().next()
      if (!oldest.done) this.store.delete(oldest.value)
    }
  }

  delete(key: K): boolean {
    return this.store.delete(key)
  }

  clear(): void {
    this.store.clear()
  }

  /** Entrées en ordre LRU (plus ancienne d'abord) — pour une politique d'éviction custom côté appelant. */
  entries(): IterableIterator<[K, V]> {
    return this.store.entries()
  }
}
