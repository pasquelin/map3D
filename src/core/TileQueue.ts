// Cache de tuiles à file bornée : présence, concurrence, backoff, éviction LRU et
// annulation. Partagé par le fond raster (`TiledGlobeLayer`) et le volume interne
// (`BuildingsLayer`), qui n'en gardent que ce qui les distingue vraiment — la géométrie.
//
// ⚠️ Les deux calques en portaient chacun leur copie : `pump` et `retryOrFail` étaient
// identiques mot pour mot, `evict` à une constante près. Deux copies, c'est deux fois le
// même défaut à corriger — et c'est exactement ce qui est arrivé (cf. `owns`).
//
// Sans three.js ni DOM : la file se teste seule, sans WebGL.

import { clamp } from './math'
import type { Bounds, LatLng } from '../shared'

export type TileState = 'queued' | 'loading' | 'ready' | 'error'

/** Ce que la file sait de toute tuile ; un calque y ajoute ce qu'il monte. */
export type Tile = {
  z: number
  x: number
  y: number
  key: string
  state: TileState
  /** Numéro de la dernière frame où la tuile a été demandée ou vue. */
  lastUsed: number
  /** Tentatives de téléchargement déjà consommées. */
  attempts: number
  /** Date (ms) avant laquelle la file n'a pas le droit de relancer cette tuile. */
  retryAt: number
  /**
   * Octets retenus par ce que le calque a monté (GPU et CPU confondus). Renseigné par
   * `commit`, remis à zéro par `release` — c'est la matière du budget mémoire.
   */
  bytes: number
  /** Annulation du chargement en cours, `null` hors chargement. */
  abort: AbortController | null
  // Emprise géographique, constante pour la durée de vie de la tuile — mémoïsée pour ne
  // pas recalculer exp/atan à chaque test de vue, par frame et par tuile.
  west: number
  east: number
  north: number
  south: number
}

/** Budgets de la file, relus à chaque frame (donc réglables à chaud). */
export type TileBudget = {
  /** Plafond du nombre de tuiles en cache. */
  maxTiles: number
  /**
   * Plafond de la mémoire retenue par les tuiles montées (octets).
   *
   * ⚠️ Le compte de tuiles ne borne rien à lui seul : entre une tuile de campagne et une
   * tuile de centre-ville, ce que pèse une tuile de volume varie d'un facteur cent. Le
   * même plafond laissait donc passer des centaines de mégaoctets là où il fallait
   * protéger, et bridait là où il n'y avait rien à protéger. `0` = pas de plafond.
   */
  maxBytes: number
  /** Chargements simultanés. */
  maxInflight: number
  /** Essais par tuile avant abandon définitif. */
  maxAttempts: number
  /** Backoff entre deux essais d'une même tuile ; le dernier délai est reconduit. */
  retryDelays: readonly number[]
  /**
   * Une frame sur `evictEvery` déclenche le tri d'éviction — il alloue et coûte
   * O(n log n). Rester une seconde au-dessus du plafond le rejouerait sinon à CHAQUE
   * frame, pour évincer une tuile ou deux.
   */
  evictEvery: number
  /**
   * Dépassement au-delà duquel l'éviction est forcée sans attendre son tour, pour borner
   * le pic de mémoire.
   */
  evictSlack: number
  /**
   * Tuiles montées par frame au plus.
   *
   * Le montage est la seule part du travail qui reste sur le thread principal, et elle
   * n'est pas négligeable pour un volume : développer les couleurs et construire l'arbre
   * de collision coûtent ensemble une vingtaine de millisecondes par tuile. Plusieurs
   * chargements qui aboutissent dans la même frame les additionnaient donc en un gel
   * franc ; étalés, chaque frame n'en paie qu'un.
   */
  mountPerFrame: number
}

export type TileQueueOptions<T extends Tile, R> = {
  budget(): TileBudget
  /** Enrichit la tuile des champs propres au calque (mesh, image…). */
  make(base: Tile): T
  /**
   * Télécharge et prépare, SANS rien monter dans la scène : au retour, la tuile peut
   * avoir été évincée — voire remplacée par une autre de même clé. Lever une exception
   * signale un échec réessayable.
   */
  fetch(tile: T, signal: AbortSignal): Promise<R>
  /**
   * Monte le résultat. Appelé seulement si la tuile appartient TOUJOURS à la file et
   * qu'aucune autre n'a pris sa clé — c'est ici que se règle, structurellement, le défaut
   * décrit sur `owns`. Doit renseigner `tile.bytes`.
   */
  commit(tile: T, result: R): void
  /** Libère ce que `commit` a monté. La file remet `bytes` à zéro ensuite. */
  release(tile: T): void
  /** Tuiles jamais évincées (le niveau de base du fond, filet anti-trou). */
  pinned?(tile: T): boolean
}

export class TileQueue<T extends Tile, R> {
  private readonly tiles = new Map<string, T>()
  private readonly queue: T[] = []
  private inflight = 0
  private disposed = false
  /** Somme des `bytes` des tuiles montées — tenue à jour, jamais recalculée. */
  private bytes = 0
  /** Numéro de frame, avancé par `beginFrame` : c'est l'horloge du LRU. */
  frame = 0
  /** Résultats chargés en attente de montage — étalés sur les frames (cf. `mountPerFrame`). */
  private readonly toMount: { tile: T; result: R }[] = []

  constructor(private readonly opts: TileQueueOptions<T, R>) {}

  /**
   * Ouvre une frame : monte ce qui attend, dans la limite du budget, et rend le numéro
   * courant — celui que porteront les `lastUsed`.
   */
  beginFrame(): number {
    this.frame++
    this.drainMounts()
    return this.frame
  }

  /**
   * Monte au plus `mountPerFrame` tuiles. L'appartenance est revérifiée ICI et pas
   * seulement à l'arrivée du chargement : entre les deux, la tuile a pu être évincée.
   */
  private drainMounts(): void {
    if (this.toMount.length === 0) return
    const { mountPerFrame } = this.opts.budget()
    let mounted = 0
    while (this.toMount.length > 0 && mounted < mountPerFrame) {
      const { tile, result } = this.toMount.shift()!
      if (!this.owns(tile)) continue
      this.opts.commit(tile, result)
      this.bytes += tile.bytes
      tile.state = 'ready'
      mounted++
    }
  }

  /** Mémoire actuellement retenue par les tuiles montées (octets). */
  get usedBytes(): number {
    return this.bytes
  }

  /**
   * Déclare ce qu'une tuile retient, une fois monté ce que `commit` a différé.
   *
   * Le fond raster ne construit sa géométrie et sa texture qu'au moment de l'AFFICHER —
   * une tuile chargée hors de la vue n'a aucune raison de les payer. Ses octets ne sont
   * donc connus qu'à ce moment-là, pas au retour du chargement.
   */
  account(tile: T, bytes: number): void {
    if (!this.owns(tile)) return
    this.bytes += bytes - tile.bytes
    tile.bytes = bytes
  }

  get size(): number {
    return this.tiles.size
  }

  /**
   * Un chargement est en cours ou en attente — donc l'image va encore changer.
   *
   * Lu par le rendu à la demande (`performance.renderOnDemand`) : tant que la file
   * travaille, chaque frame apporte potentiellement une tuile de plus à peindre.
   */
  get busy(): boolean {
    return this.inflight > 0 || this.queue.length > 0 || this.toMount.length > 0
  }

  /** Tuile d'une clé, `undefined` si elle n'est pas (ou plus) en cache. */
  get(key: string): T | undefined {
    return this.tiles.get(key)
  }

  values(): IterableIterator<T> {
    return this.tiles.values()
  }

  /**
   * Cette tuile est-elle TOUJOURS celle que la file connaît sous sa clé ?
   *
   * ⚠️ C'est la garde qui manquait aux deux calques, qui testaient la seule présence de
   * la CLÉ. Une tuile évincée pendant son chargement, puis redemandée, réapparaissait
   * sous un objet neuf ; le chargement de l'ancienne trouvait alors sa clé occupée, se
   * croyait vivant, et montait son mesh sur un objet que plus rien ne référençait — hors
   * du cache, donc jamais masqué, jamais évincé, jamais libéré. Un bâtiment fantôme et sa
   * mémoire, à chaque occurrence.
   */
  owns(tile: T): boolean {
    return !this.disposed && this.tiles.get(tile.key) === tile
  }

  /** Garantit la présence de la tuile dans le cache, et la marque vue cette frame. */
  ensure(z: number, x: number, y: number, west: number, east: number, north: number, south: number): T {
    const key = `${z}/${x}/${y}`
    let t = this.tiles.get(key)
    if (!t) {
      t = this.opts.make({
        z,
        x,
        y,
        key,
        state: 'queued',
        lastUsed: this.frame,
        attempts: 0,
        retryAt: 0,
        bytes: 0,
        abort: null,
        west,
        east,
        north,
        south,
      })
      this.tiles.set(key, t)
      this.queue.push(t)
    }
    t.lastUsed = this.frame
    return t
  }

  /** Lance des chargements tant qu'il reste des créneaux de concurrence. */
  pump(): void {
    if (this.disposed) return
    const { maxInflight } = this.opts.budget()
    const now = Date.now()
    // `skipped` fait avancer la boucle quand la tête de file attend un réessai : la tuile
    // repart en queue, la longueur ne bouge pas — sans ce compteur, une file entièrement
    // en backoff tournerait à l'infini.
    let skipped = 0
    while (this.inflight < maxInflight && this.queue.length > skipped) {
      const t = this.queue.shift()!
      if (t.state !== 'queued' || !this.owns(t)) continue
      if (t.retryAt > now) {
        this.queue.push(t)
        skipped++
        continue
      }
      void this.load(t)
    }
  }

  private async load(t: T): Promise<void> {
    t.state = 'loading'
    t.attempts++
    t.abort = new AbortController()
    this.inflight++
    try {
      const result = await this.opts.fetch(t, t.abort.signal)
      // La tuile a pu être évincée — ou remplacée sous sa clé — pendant l'attente.
      if (!this.owns(t)) return
      // Le montage attend la prochaine frame, qui en prendra sa part : c'est la seule
      // façon d'empêcher deux chargements simultanés d'additionner leur coût dans la même
      // frame. La tuile reste donc en `loading` jusque-là, ce qui la garde hors du rendu.
      this.toMount.push({ tile: t, result })
    } catch {
      if (this.owns(t)) this.retryOrFail(t)
    } finally {
      t.abort = null
      this.inflight--
      this.pump()
    }
  }

  /** Replanifie une tuile en échec, ou l'abandonne au bout de `maxAttempts`. */
  private retryOrFail(t: T): void {
    const { maxAttempts, retryDelays } = this.opts.budget()
    if (t.attempts >= maxAttempts) {
      t.state = 'error'
      return
    }
    t.state = 'queued'
    // Dernier délai reconduit au-delà de la liste ; liste vide = réessai immédiat.
    t.retryAt = Date.now() + (retryDelays[t.attempts - 1] ?? retryDelays.at(-1) ?? 0)
    this.queue.push(t)
  }

  /**
   * Éviction LRU au-delà des plafonds (jamais les tuiles vues cette frame, jamais les
   * épinglées). Deux plafonds, dont le plus contraignant gagne : le nombre de tuiles, et
   * la mémoire réellement retenue.
   */
  evict(): void {
    const { maxTiles, maxBytes, evictEvery, evictSlack } = this.opts.budget()
    const overCount = this.tiles.size - maxTiles
    const overBytes = maxBytes > 0 && this.bytes > maxBytes
    if (overCount <= 0 && !overBytes) return
    // Le tri coûte : il ne tourne qu'une frame sur `evictEvery`, sauf débordement franc.
    const urgent = this.tiles.size >= maxTiles + evictSlack || (maxBytes > 0 && this.bytes > maxBytes * 2)
    if (this.frame % evictEvery !== 0 && !urgent) return

    const candidates: T[] = []
    for (const t of this.tiles.values()) {
      if (t.lastUsed === this.frame) continue
      if (this.opts.pinned?.(t)) continue
      candidates.push(t)
    }
    candidates.sort((a, b) => a.lastUsed - b.lastUsed)
    let over = overCount
    for (const t of candidates) {
      if (over <= 0 && !(maxBytes > 0 && this.bytes > maxBytes)) break
      this.drop(t)
      over--
    }
  }

  /** Retire une tuile du cache : chargement annulé, ressources libérées, compte à jour. */
  private drop(t: T): void {
    // Le chargement en vol devient du travail mort : ni le réseau ni le worker n'ont plus
    // de raison de le finir. Le `catch` de `load` absorbe l'abandon, et `owns` y écarte de
    // toute façon la tuile.
    t.abort?.abort()
    this.opts.release(t)
    this.bytes -= t.bytes
    t.bytes = 0
    this.tiles.delete(t.key)
  }

  /** Vide le cache (changement de source, de gabarit, d'altitude). */
  clear(): void {
    for (const t of [...this.tiles.values()]) this.drop(t)
    this.tiles.clear()
    this.queue.length = 0
    this.bytes = 0
  }

  dispose(): void {
    this.clear()
    this.disposed = true
  }
}

/** L'emprise de la tuile recoupe-t-elle celle de la vue ? */
export function intersectsView(t: Tile, b: Bounds): boolean {
  return !(t.east < b.west || t.west > b.east || t.south > b.north || t.north < b.south)
}

/** Plage de tuiles couvrant `bounds` au zoom `z` (marge incluse), bornée au globe. */
export type TileRange = { x0: number; x1: number; y0: number; y1: number }

export function tileRange(
  b: Bounds,
  z: number,
  margin: number,
  lngToX: (lng: number, z: number) => number,
  latToY: (lat: number, z: number) => number,
): TileRange {
  const n = 2 ** z
  return {
    x0: clamp(Math.floor(lngToX(b.west, z)) - margin, 0, n - 1),
    x1: clamp(Math.floor(lngToX(b.east, z)) + margin, 0, n - 1),
    y0: clamp(Math.floor(latToY(b.north, z)) - margin, 0, n - 1),
    y1: clamp(Math.floor(latToY(b.south, z)) + margin, 0, n - 1),
  }
}

/**
 * Anneau de `side` × `side` tuiles centré sur le point visé, borné au globe.
 *
 * Le point VISÉ, et non celui sous la caméra : en vue inclinée les deux sont très
 * éloignés, et centrer sur la caméra dépense le budget derrière l'observateur.
 */
export function tileRing(
  aim: LatLng,
  z: number,
  side: number,
  lngToX: (lng: number, z: number) => number,
  latToY: (lat: number, z: number) => number,
): TileRange {
  const n = 2 ** z
  const r = Math.max(0, Math.floor((side - 1) / 2))
  const cx = clamp(Math.floor(lngToX(aim.lng, z)), 0, n - 1)
  const cy = clamp(Math.floor(latToY(aim.lat, z)), 0, n - 1)
  return {
    x0: clamp(cx - r, 0, n - 1),
    x1: clamp(cx + r, 0, n - 1),
    y0: clamp(cy - r, 0, n - 1),
    y1: clamp(cy + r, 0, n - 1),
  }
}
