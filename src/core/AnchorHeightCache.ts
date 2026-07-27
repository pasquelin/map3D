import type { Projection } from './Projection'
import { defaultConfig } from '../config/defaultConfig'
import type { LatLng } from '../shared'

/** Entrée mémoïsée : hauteur + position qui l'a produite (détection de mouvement). */
type Entry = {
  lat: number
  lng: number
  /** Hauteur utilisable (jamais null) : la résolue, ou le repli de surface. */
  h: number
  /** false = `h` est le repli (tuile absente au moment du calcul) — à retenter. */
  resolved: boolean
}

/**
 * Hauteurs d'ancre mémoïsées par élément, avec les trois précautions que tout
 * consommateur redécouvrait sinon à ses frais :
 *
 * 1. **Un raycast par élément et par frame est impensable** — `resolveAnchorHeight`
 *    échantillonne la surface photogrammétrique. D'où la mémoïsation.
 * 2. **Une hauteur non résolue n'est jamais définitive** : tuile absente = repli
 *    utilisé, entrée marquée `resolved: false` et retentée à basse cadence
 *    (`performance.resettle.retryFrames`) — sinon un élément en zone non chargée relance un
 *    raycast à CHAQUE passe, soit 1×/frame pendant un pan.
 * 3. **Le régime de hauteur change** (bascule 2D/3D) : `Projection.heightEpoch`
 *    invalide alors tout le cache en bloc, sans quoi les hauteurs mémoïsées
 *    décalent les éléments sous la surface visible (parallaxe au pan).
 *
 * Un élément qui a BOUGÉ est re-résolu seul (comparaison à la position qui a
 * produit l'entrée) : un flux temps réel ne réinvalide pas tout le cache.
 *
 * **Mode passe** (optionnel, `beginPass`/`endPass`) : le cache est reconstruit à
 * partir des seuls éléments réellement vus, donc borné au jeu courant sans purge
 * explicite — utile quand l'ensemble scanné varie d'une passe à l'autre (inventaire
 * d'une zone, viewport). Hors mode passe, le cache est persistant et se purge à la
 * main (`forget`/`clear`).
 */
export class AnchorHeightCache {
  private entries = new Map<string | number, Entry>()
  /** Cache en construction pendant une passe — `null` hors mode passe. */
  private pass: Map<string | number, Entry> | null = null
  private epoch = -1
  private tick = 0
  private retryNow = false

  constructor(
    private readonly projection: Projection,
    /** Cadence (passes) de retentative des ancres non résolues. */
    private readonly retryFrames = defaultConfig.performance.resettle.retryFrames,
  ) {}

  /**
   * Ouvre une passe : purge le cache si le régime de hauteur a changé, et décide si
   * cette passe retente les ancres non résolues. Les `height()` qui suivent
   * alimentent un cache neuf, adopté par `endPass()`.
   *
   * Appelable sans `endPass` (mode persistant) : seules l'épuration d'epoch et la
   * cadence de retentative s'appliquent alors.
   */
  beginPass(): void {
    if (this.epoch !== this.projection.heightEpoch) {
      this.epoch = this.projection.heightEpoch
      this.entries.clear()
    }
    this.retryNow = ++this.tick % this.retryFrames === 0
    this.pass = new Map()
  }

  /** Adopte le cache de la passe : les éléments non revus en sortent d'eux-mêmes. */
  endPass(): void {
    if (!this.pass) return
    this.entries = this.pass
    this.pass = null
  }

  /**
   * Hauteur d'ancre (m) de `id` à `position` — résolue à la demande, mémoïsée, et
   * re-résolue si la position a changé depuis l'entrée. Renvoie toujours une hauteur
   * utilisable : le repli de surface tant que la tuile manque.
   */
  height(id: string | number, position: LatLng): number {
    // Lecture de la passe d'abord : un id demandé deux fois dans la même passe ne
    // doit pas repartir de l'entrée périmée de la passe précédente.
    const prev = this.pass?.get(id) ?? this.entries.get(id)
    let e = prev
    if (!e || e.lat !== position.lat || e.lng !== position.lng) {
      const h = this.projection.resolveAnchorHeight(position)
      e = {
        lat: position.lat,
        lng: position.lng,
        h: h ?? this.projection.surfaceFallbackHeight,
        resolved: h !== null,
      }
    } else if (!e.resolved && this.retryNow) {
      const h = this.projection.resolveAnchorHeight(position)
      if (h !== null) e = { ...e, h, resolved: true }
    }
    ;(this.pass ?? this.entries).set(id, e)
    return e.h
  }

  /** `true` si la hauteur de `id` est un repli (tuile absente) — retentée plus tard. */
  isFallback(id: string | number): boolean {
    const e = this.pass?.get(id) ?? this.entries.get(id)
    return e ? !e.resolved : true
  }

  /** Oublie un élément (supprimé, id réattribué). */
  forget(id: string | number): void {
    this.entries.delete(id)
    this.pass?.delete(id)
  }

  clear(): void {
    this.entries.clear()
    this.pass?.clear()
  }

  get size(): number {
    return (this.pass ?? this.entries).size
  }
}
