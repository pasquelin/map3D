// Orchestration des relations : sélection → matrice → liens classés → tracé réel.
// Headless : ni Three, ni React, ni fetch. Le réseau passe exclusivement par
// `RoutingProvider`, ce qui rend le moteur exécutable avec un fournisseur factice.

import type { MatrixEntry, ProviderRoute, RoutingProvider } from '../providers/RoutingProvider'
import { RouteCache } from './cache'
import { haversineMeters } from './geo'
import { selectTargets } from './selection'
import type { Link, MapPoint, RelationRule, TravelMode } from './types'

export type RelationSnapshot = {
  source: MapPoint
  rule: RelationRule
  /**
   * TOUS les liens calculés, triés : par distance à vol d'oiseau tant que la matrice
   * n'a pas répondu, puis par durée réelle. On en calcule plus qu'on n'en montre —
   * le plus proche n'est pas le plus rapide — d'où la séparation avec `shown`.
   */
  links: Link[]
  /** Lien dont l'itinéraire réel est affiché — il masque alors les autres liens. */
  tracedLinkId: string | null
}

/**
 * Ce qu'un `syncPositions` a constaté. Le moteur ne décide PAS de relancer : il
 * signale ce qui est périmé et laisse l'appelant appliquer sa politique d'appels
 * (throttle, budget) — le core n'a ni horloge ni notion de coût réseau.
 */
export type SyncResult = {
  /** La géométrie a changé : la couche de rendu doit repartir des positions à jour. */
  moved: boolean
  /** Ids des sources dont les temps matriciels ne décrivent plus la réalité. */
  staleSources: string[]
  /** Ids des liens dont l'itinéraire tracé ne décrit plus la réalité. */
  staleTraces: string[]
}

const linkId = (from: MapPoint, to: MapPoint): string => `${from.id}→${to.id}`

/**
 * Nombre de liens à DESSINER : les `shownCount` premiers de `links`. Dérivé plutôt
 * que stocké — un champ aurait dû être recalculé partout où `links` change, y
 * compris dans `syncPositions`, et divergeait silencieusement sinon.
 */
export function shownCount(state: RelationSnapshot): number {
  return Math.min(state.rule.selection.count ?? state.links.length, state.rule.limit.render)
}

/**
 * Couleur de repli quand une règle n'en déclare pas. La couche de rendu résout
 * normalement la sienne avant d'arriver ici ; ce repli ne sert qu'à un consommateur
 * qui piloterait le moteur sans passer par elle.
 */
const FALLBACK_COLOR = '#ffd400'

/**
 * Relations actives et transitions associées. Les abonnés se resynchronisent via
 * `version` (patron `useSyncExternalStore`, comme `TagFilter`) : aucune structure
 * React ici, la couche de rendu s'y branche sans que le moteur la connaisse.
 *
 * Les relations sont indexées par **marker source** : plusieurs markers peuvent en
 * porter une simultanément, et relancer sur le même marker remplace la sienne sans
 * toucher aux autres. Chaque source a donc son propre `AbortController` — un seul
 * partagé ferait qu'ouvrir une relation annulerait la requête d'une autre.
 */
export class RelationEngine {
  private readonly states = new Map<string, RelationSnapshot>()
  /**
   * Requêtes matricielles en vol, une par source.
   *
   * SÉPARÉE de `pendingRoute` : un contrôleur unique par source ferait qu'ouvrir un
   * itinéraire avorte la matrice encore en vol. `open` émet volontairement ses liens
   * en `pending` AVANT l'appel réseau, donc cliquer un lien pendant l'attente est le
   * geste le plus naturel qui soit — et il laissait toute la relation figée sur `…`,
   * puisque `open` sort en silence dès qu'il se découvre annulé.
   */
  private readonly pendingMatrix = new Map<string, AbortController>()
  /** Tracés en vol, indexés par LIEN : deux relations peuvent en tracer un chacune. */
  private readonly pendingRoute = new Map<string, AbortController>()
  private readonly listeners = new Set<() => void>()
  /** Vue mémoïsée de `states`, invalidée à chaque émission. */
  private snapCache: RelationSnapshot[] | null = null
  /**
   * Index `id de lien → id de source`, reconstruit à l'émission. Le balayage naïf
   * (`for states { links.some(…) }`) est O(relations × liens) et se trouve sur le
   * chemin du survol et du clic, appelés à la cadence du pointeur.
   */
  private linkOwners = new Map<string, string>()
  private rev = 0

  constructor(
    private readonly provider: RoutingProvider,
    private readonly cache: RouteCache = new RouteCache(),
  ) {}

  get version(): number {
    return this.rev
  }

  /**
   * Relations affichées, dans leur ordre d'ouverture. Le tableau est MÉMOÏSÉ et n'est reconstruit qu'à l'émission :
   * un getter qui alloue serait lu à chaque rendu React, invaliderait tous les memos
   * qui en dépendent, et ferait reconstruire la géométrie de tous les liens — y
   * compris au simple survol.
   */
  get snapshots(): RelationSnapshot[] {
    return (this.snapCache ??= [...this.states.values()])
  }

  /** Relation portée par un marker source, ou `null`. */
  snapshotFor(sourceId: string): RelationSnapshot | null {
    return this.states.get(sourceId) ?? null
  }

  /** Relation contenant ce lien — résolue par index, en temps constant. */
  private ownerOf(id: string): RelationSnapshot | null {
    const sourceId = this.linkOwners.get(id)
    return sourceId === undefined ? null : (this.states.get(sourceId) ?? null)
  }

  /** Marker source auquel appartient ce lien — pour cibler une relation depuis son rendu. */
  sourceOf(linkId: string): string | null {
    return this.linkOwners.get(linkId) ?? null
  }

  subscribe = (cb: () => void): (() => void) => {
    this.listeners.add(cb)
    return () => this.listeners.delete(cb)
  }

  /**
   * Ouvre (ou remplace) la relation portée par `source`. Les liens sont émis en
   * `pending` AVANT tout appel réseau : la carte répond au clic immédiatement, les
   * chiffres arrivent ensuite. Aucune distance à vol d'oiseau n'est affichée pendant
   * l'attente.
   */
  async open(source: MapPoint, rule: RelationRule, candidates: readonly MapPoint[]): Promise<void> {
    this.pendingMatrix.get(source.id)?.abort()
    const controller = new AbortController()
    this.pendingMatrix.set(source.id, controller)
    const live = (): boolean => !controller.signal.aborted && this.pendingMatrix.get(source.id) === controller
    /** Le contrôleur ne survit pas à son appel : le garder retiendrait une entrée par
     *  source jusqu'au `clear`, et masquerait qu'aucune requête n'est plus en vol. */
    const release = (): void => {
      if (this.pendingMatrix.get(source.id) === controller) this.pendingMatrix.delete(source.id)
    }

    // LE plafond d'appels au fournisseur de routage, appliqué avant `provider.matrix`.
    const targets = selectTargets(source, rule, candidates).slice(0, rule.limit.compute)
    // Valeurs déjà connues des liens en place : une relance (marker déplacé,
    // changement de mode) ne doit pas faire clignoter en `…` ce qui reste affichable
    // jusqu'à l'arrivée des nouveaux temps.
    const previous = this.states.get(source.id)
    const previousLinks = new Map(previous?.links.map((l) => [l.id, l]) ?? [])
    this.states.set(source.id, {
      source,
      rule,
      links: targets.map((to) => {
        const id = linkId(source, to)
        const before = previousLinks.get(id)
        return {
          id,
          from: source,
          to,
          status: before?.status ?? 'pending',
          distanceMeters: before?.distanceMeters ?? null,
          durationSeconds: before?.durationSeconds ?? null,
          rank: before?.rank ?? null,
          color: rule.color ?? FALLBACK_COLOR,
          // L'itinéraire survit à la relance, au même titre que les temps ci-dessus.
          // Le jeter ramenait la carte aux traits directs à chaque changement de mode
          // de transport : l'utilisateur perdait le tracé qu'il regardait pour le voir
          // revenir une seconde plus tard. Il reste celui de l'ancien mode jusqu'à ce
          // qu'un `trace(force)` le remplace — un tracé périmé d'une seconde vaut mieux
          // qu'un aller-retour visuel.
          route: before?.route ?? null,
        }
      }),
      // Un tracé visible reste visible si son lien survit à la relance.
      tracedLinkId:
        previous?.tracedLinkId && targets.some((t) => linkId(source, t) === previous.tracedLinkId)
          ? previous.tracedLinkId
          : null,
    })
    this.emit()
    if (targets.length === 0) {
      release()
      return
    }

    // Le trajet mesuré va de la CIBLE vers la source (la cible rejoint le point) :
    // origines = cibles, destination = source. Inverser donnerait une autre durée.
    const entries = new Map<string, MatrixEntry>()
    const toQuery: MapPoint[] = []
    for (const to of targets) {
      const hit = this.cache.get<MatrixEntry>(this.cache.key(source.id, to, rule.mode))
      if (hit) entries.set(to.id, hit)
      else toQuery.push(to)
    }

    let fetched: MatrixEntry[] = []
    try {
      if (toQuery.length > 0) fetched = await this.provider.matrix(toQuery, source, rule.mode, controller.signal)
    } catch {
      // Échec global : aucun repli sur le vol d'oiseau — le moteur dit qu'il ne sait pas.
      if (!live()) return
      release()
      // Les couples déjà connus du cache gardent leurs temps RÉELS : ils n'ont pas
      // échoué, ils n'ont même pas été demandés. Tout marquer `unavailable` effacerait
      // de la donnée valide et affichable à cause de l'échec des AUTRES couples.
      for (const to of targets) {
        if (!entries.has(to.id)) entries.set(to.id, { toId: to.id, error: true })
      }
      this.applyMatrix(source.id, entries)
      this.emit()
      return
    }
    if (!live()) return
    release()

    const byId = new Map(targets.map((t) => [t.id, t]))
    for (const entry of fetched) {
      const to = byId.get(entry.toId)
      if (to) this.cache.set(this.cache.key(source.id, to, rule.mode), entry)
      entries.set(entry.toId, entry)
    }
    this.applyMatrix(source.id, entries)
    this.emit()
  }

  /**
   * Reporte les temps réels sur les liens, écarte ceux au-delà du `cutoff`, trie par
   * durée croissante et attribue les rangs. Un échec partiel n'affecte que son lien.
   */
  private applyMatrix(sourceId: string, entries: ReadonlyMap<string, MatrixEntry>): void {
    const state = this.states.get(sourceId)
    if (!state) return
    const rule = state.rule
    const kept: Link[] = []
    for (const link of state.links) {
      const entry = entries.get(link.to.id)
      if (!entry || entry.error) {
        link.status = 'unavailable'
        link.rank = null
        kept.push(link)
        continue
      }
      if (rule.cutoffSeconds !== undefined && entry.durationSeconds > rule.cutoffSeconds) continue
      link.status = 'ready'
      link.distanceMeters = entry.distanceMeters
      link.durationSeconds = entry.durationSeconds
      kept.push(link)
    }
    // Les liens sans temps réel n'ont pas de rang : ils se rangent après les autres
    // sans en décaler la numérotation.
    kept.sort((a, b) => (a.durationSeconds ?? Infinity) - (b.durationSeconds ?? Infinity))
    let rank = 0
    for (const link of kept) link.rank = link.status === 'ready' ? ++rank : null
    state.links = kept
    if (state.tracedLinkId && !kept.some((l) => l.id === state.tracedLinkId)) state.tracedLinkId = null
  }

  /**
   * Ré-accroche toutes les relations aux positions COURANTES de leurs extrémités.
   *
   * Un lien est défini par deux identités, pas par deux coordonnées : si une cible
   * se déplace et que le trait reste où il a été créé, il n'appartient plus
   * visiblement à personne. Un point disparu (marker supprimé, masqué par un filtre)
   * emporte son lien plutôt que de laisser un trait pendant dans le vide.
   *
   * @param staleMeters dérive au-delà de laquelle temps et itinéraires sont réputés
   *                    périmés (0 = ne jamais le signaler).
   */
  syncPositions(resolve: (id: string) => MapPoint | null, staleMeters = 0): SyncResult {
    const result: SyncResult = { moved: false, staleSources: [], staleTraces: [] }
    const drifted = (shift: number): boolean => staleMeters > 0 && shift >= staleMeters

    for (const [sourceId, state] of [...this.states]) {
      const freshSource = resolve(sourceId)
      if (!freshSource) {
        // La source elle-même a disparu : la relation n'a plus d'objet.
        this.abortFor(sourceId, state)
        this.states.delete(sourceId)
        result.moved = true
        continue
      }
      const sourceShift = haversineMeters(state.source, freshSource)
      if (sourceShift > 0) {
        result.moved = true
        state.source = freshSource
        // La source a bougé : TOUS les temps et itinéraires de la relation en dépendent.
        if (drifted(sourceShift)) result.staleSources.push(sourceId)
      }

      const kept: Link[] = []
      for (const link of state.links) {
        const to = resolve(link.to.id)
        if (!to) {
          // Le lien disparaît : son tracé éventuellement en vol n'a plus de destinataire.
          this.pendingRoute.get(link.id)?.abort()
          this.pendingRoute.delete(link.id)
          result.moved = true
          continue
        }
        const shift = haversineMeters(link.to, to)
        if (shift > 0) {
          result.moved = true
          link.to = to
        }
        link.from = state.source
        // Un itinéraire tracé décrit un trajet entre deux positions précises : dès
        // que l'une d'elles dérive, il ne le décrit plus.
        if (drifted(shift) || drifted(sourceShift)) {
          if (drifted(shift) && !result.staleSources.includes(sourceId)) result.staleSources.push(sourceId)
          if (state.tracedLinkId === link.id) result.staleTraces.push(link.id)
        }
        kept.push(link)
      }
      state.links = kept
      if (state.tracedLinkId !== null && !kept.some((l) => l.id === state.tracedLinkId)) {
        state.tracedLinkId = null
      }
    }
    if (result.moved) this.emit()
    return result
  }

  /**
   * Change le mode de transport d'une relation.
   *
   * Un itinéraire affiché reste affiché : changer de mode, c'est demander le MÊME
   * trajet autrement, pas revenir au choix de la cible. Comme `open` conserve
   * délibérément l'ancienne `route` jusqu'à ce qu'un `trace(force)` la remplace,
   * l'oubli de ce second appel rendrait la carte à ses traits directs — c'est une
   * règle du domaine, pas une préoccupation d'affichage, et elle vit donc ici : tout
   * consommateur du moteur (test, hôte non-React) l'obtient sans la redécouvrir.
   *
   * Les deux requêtes partent EN PARALLÈLE : `open` a publié son état (nouveau mode
   * compris) avant son premier `await`, et la matrice comme l'itinéraire visent des
   * points d'entrée distincts du fournisseur. Les enchaîner ferait attendre la somme
   * des deux latences là où le maximum suffit.
   */
  setMode(sourceId: string, mode: TravelMode, candidates: readonly MapPoint[]): void {
    const state = this.states.get(sourceId)
    if (!state || state.rule.mode === mode) return
    const traced = state.tracedLinkId
    void this.open(state.source, { ...state.rule, mode }, candidates)
    if (traced !== null) void this.trace(traced, true)
  }

  /**
   * Itinéraire réel d'un lien : le plus rapide. `force` ignore le cache mémoire du
   * lien — c'est le chemin du rafraîchissement d'un tracé devenu périmé.
   */
  async trace(id: string, force = false): Promise<void> {
    const state = this.ownerOf(id)
    const link = state?.links.find((l) => l.id === id)
    if (!state || !link) return

    if (link.route && !force) {
      state.tracedLinkId = id
      this.emit()
      return
    }
    const key = `route:${this.cache.key(state.source.id, link.to, state.rule.mode)}`
    const hit = force ? null : this.cache.get<ProviderRoute>(key)
    if (hit) {
      link.route = hit
      state.tracedLinkId = id
      this.emit()
      return
    }

    // Indexé par LIEN, et non par source : tracer n'annule donc que le tracé du même
    // lien, jamais la matrice de sa relation ni le tracé d'une relation voisine.
    this.pendingRoute.get(id)?.abort()
    const controller = new AbortController()
    this.pendingRoute.set(id, controller)
    const live = (): boolean => !controller.signal.aborted && this.pendingRoute.get(id) === controller
    const release = (): void => {
      if (this.pendingRoute.get(id) === controller) this.pendingRoute.delete(id)
    }
    try {
      const routes = await this.provider.route(link.to, state.source, state.rule.mode, controller.signal)
      if (!live()) return
      release()
      if (routes.length === 0) {
        link.status = 'unavailable'
        this.emit()
        return
      }
      const route = routes[0]!
      this.cache.set(key, route)
      link.route = route
      state.tracedLinkId = id
      this.emit()
    } catch {
      if (!live()) return
      release()
      link.status = 'unavailable'
      this.emit()
    }
  }

  /** Referme l'itinéraire affiché — les liens de la relation réapparaissent. */
  untrace(linkIdOrSourceId?: string): void {
    let changed = false
    for (const state of this.states.values()) {
      if (state.tracedLinkId === null) continue
      const targeted =
        linkIdOrSourceId === undefined ||
        state.tracedLinkId === linkIdOrSourceId ||
        state.source.id === linkIdOrSourceId
      if (!targeted) continue
      state.tracedLinkId = null
      changed = true
    }
    if (changed) this.emit()
  }

  /**
   * Efface la relation d'un marker source, ou toutes si l'id est omis. À appeler au
   * démontage du consommateur : sans lui, les requêtes en vol se poursuivent — elles
   * sont facturées par le fournisseur de routage et retiennent le moteur en mémoire.
   */
  clear(sourceId?: string): void {
    if (sourceId === undefined) {
      if (this.states.size === 0) return
      for (const [id, state] of this.states) this.abortFor(id, state)
      this.states.clear()
      this.emit()
      return
    }
    const state = this.states.get(sourceId)
    if (state) this.abortFor(sourceId, state)
    if (this.states.delete(sourceId)) this.emit()
  }

  /** Avorte tout ce qui est en vol pour une relation : sa matrice et ses tracés. */
  private abortFor(sourceId: string, state: RelationSnapshot): void {
    this.pendingMatrix.get(sourceId)?.abort()
    this.pendingMatrix.delete(sourceId)
    for (const link of state.links) {
      this.pendingRoute.get(link.id)?.abort()
      this.pendingRoute.delete(link.id)
    }
  }

  private emit(): void {
    this.snapCache = null
    // Index reconstruit ICI, et nulle part ailleurs : `links` est réaffecté dans
    // `open`, `applyMatrix` et `syncPositions`, et un index mis à jour à la main sur
    // trois sites finit par mentir. Le coût est celui du nombre de liens AFFICHÉS,
    // et l'émission n'a pas lieu par frame.
    this.linkOwners = new Map()
    for (const [sourceId, state] of this.states) {
      for (const link of state.links) this.linkOwners.set(link.id, sourceId)
    }
    this.rev++
    for (const cb of this.listeners) cb()
  }
}
