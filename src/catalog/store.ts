import type { ShapeData } from '../layers/ShapeLayer'
import { deserializeSelection, purgeSources, removeFromSelection, serializeSelection } from './selection'
import { readStoredJSON, removeStoredKey, writeStoredJSON } from '../core/storage'
import type { CatalogKey } from './types'

/** Réglages du catalogue, pilotés depuis le panneau engrenage. */
export type CatalogSettings = {
  /** Réafficher au prochain démarrage ce qui est sur la carte. */
  persist: boolean
  /** Cadrer la caméra sur ce qu'on vient d'afficher. */
  fitOnAdd: boolean
}

const SETTINGS_VERSION = 1

const DEFAULT_SETTINGS: CatalogSettings = { persist: true, fitOnAdd: true }

export type CatalogStoreKeys = {
  /** Clé de la SÉLECTION (`config.data.storageKeys.catalog`). */
  selection: string
  /** Clé des RÉGLAGES (`config.data.storageKeys.catalogSettings`). */
  settings: string
  /**
   * Anti-rebond d'écriture de la sélection (`config.catalog.persistDebounceMs`).
   *
   * `0` écrit immédiatement. Quelle que soit la valeur, `flushPersist()` garantit qu'une
   * charge en attente part avant que la page ne disparaisse.
   */
  persistDebounceMs: number
}

/**
 * État partagé du catalogue : ce qui est affiché, ce qui charge, ce qui a échoué, et
 * les réglages.
 *
 * Porté par `MapEngine` et non par un hook parce qu'il a DEUX consommateurs — le
 * panneau du catalogue et le sous-panneau de réglages, montés dans des barres
 * différentes. Deux `useState` auraient divergé : vider la sélection depuis les
 * réglages n'aurait pas vidé la carte. Même raison que `TagFilter`.
 *
 * Les géométries ne sont pas persistées, seules les CLÉS le sont : une géométrie est
 * la réponse d'une API à un instant donné, la resservir depuis un stockage local ferait
 * afficher un périmètre que le backend a peut-être déplacé depuis.
 */
export class CatalogStore {
  private selectionKeys: readonly CatalogKey[] = []
  /**
   * Index d'appartenance doublant `selectionKeys`, qui garde l'ordre et la sérialisation.
   *
   * `isShown` est appelé par ligne visible à chaque rendu, et une fois par enfant pour
   * l'état d'un agrégat : en `includes`, cocher k éléments coûtait O(k²) et un défilement
   * avec une grosse sélection restaurée, des milliers de comparaisons de chaînes par
   * événement.
   */
  private shown = new Set<CatalogKey>()
  private readonly geometries = new Map<CatalogKey, readonly ShapeData[]>()
  private readonly pending = new Set<CatalogKey>()
  private readonly errors = new Set<CatalogKey>()
  private settings: CatalogSettings = DEFAULT_SETTINGS
  private token: object = {}
  private shapesCache: readonly ShapeData[] = []
  private readonly listeners = new Set<() => void>()
  private keys: CatalogStoreKeys | null = null
  /**
   * Chargements en vol, par clé.
   *
   * Ici et non dans un hook : retirer un élément pendant sa requête doit couper le
   * réseau, et le panneau qui a lancé la requête peut très bien avoir été démonté
   * entre-temps (il ne l'est qu'à la fermeture). Un `useRef` par consommateur aurait
   * abandonné les chargements d'un autre.
   */
  private readonly loads = new Map<CatalogKey, AbortController>()
  /**
   * Clés venues du STOCKAGE et pas encore rechargées.
   *
   * Distinguer une clé restaurée d'une clé qu'on vient de cocher n'est pas un détail :
   * les deux se ressemblent (sélectionnée, sans géométrie), et sans cette liste la
   * restauration relançait un chargement pour l'élément qu'on venait de cocher —
   * annulant celui du clic, donc son cadrage. La zone apparaissait, la caméra non.
   */
  private toRestore = new Set<CatalogKey>()
  /**
   * Écriture de la sélection en attente.
   *
   * `localStorage.setItem` est SYNCHRONE : écrire à chaque clé d'une rafale (cocher un
   * agrégat, restaurer une session) bloquait le thread principal autant de fois que la
   * rafale comptait d'éléments, sur une charge qui grossissait à chaque tour. Même
   * décision que la position caméra (`config.data.positionSaveDebounceMs`).
   */
  private persistTimer: ReturnType<typeof setTimeout> | null = null
  private persistDirty = false

  /**
   * Branche les clés de stockage et relit ce qui avait été retenu.
   *
   * Appelé par la couche React, qui seule connaît la config résolue — le moteur, lui,
   * peut tourner sans elle. Idempotent : deux montages successifs ne dupliquent rien.
   */
  configure(keys: CatalogStoreKeys): void {
    if (
      this.keys?.selection === keys.selection &&
      this.keys.settings === keys.settings &&
      this.keys.persistDebounceMs === keys.persistDebounceMs
    ) {
      return
    }
    // Changer de clé alors qu'une écriture est en attente l'écrirait sous la NOUVELLE
    // clé : on vide d'abord, tant que l'ancienne est encore la courante.
    this.flushPersist()
    this.keys = keys
    this.settings = this.loadSettings(keys.settings)
    // Ne relire la sélection que si la persistance est active : sinon une charge
    // laissée par une session précédente ressusciterait un réglage qu'on a désactivé.
    this.selectionKeys = this.settings.persist ? deserializeSelection(readStoredJSON(keys.selection)) : []
    this.shown = new Set(this.selectionKeys)
    this.toRestore = new Set(this.selectionKeys)
    this.bump()
  }

  // ── Abonnement ──

  onChanged = (cb: () => void): (() => void) => {
    this.listeners.add(cb)
    return () => {
      this.listeners.delete(cb)
    }
  }

  /** Jeton d'identité de l'état — dépendance d'un `useSyncExternalStore`. */
  snapshot(): object {
    return this.token
  }

  // ── Lecture ──

  selection(): readonly CatalogKey[] {
    return this.selectionKeys
  }

  /** Toutes les formes affichées, à plat. Recalculées à la mutation, pas au render. */
  shapes(): readonly ShapeData[] {
    return this.shapesCache
  }

  isShown(key: CatalogKey): boolean {
    return this.shown.has(key)
  }

  /** Sa géométrie est-elle déjà en mémoire ? Faux pour une clé restaurée non rechargée. */
  hasGeometry(key: CatalogKey): boolean {
    return this.geometries.has(key)
  }

  /** Ses formes, pour cadrer dessus avant de le retirer. */
  getGeometry(key: CatalogKey): readonly ShapeData[] | undefined {
    return this.geometries.get(key)
  }

  isPending(key: CatalogKey): boolean {
    return this.pending.has(key)
  }

  hasError(key: CatalogKey): boolean {
    return this.errors.has(key)
  }

  getSettings(): CatalogSettings {
    return this.settings
  }

  // ── Écriture ──

  /**
   * Reste-t-il quelque chose à restaurer ?
   *
   * Sortie anticipée de l'effet de restauration, qui est rejoué à CHAQUE mutation du
   * store (il dépend du jeton) : sans elle, chaque géométrie qui arrive payait une
   * copie de `toRestore` et un balayage des sources pour ne rien faire.
   */
  hasPendingRestores(): boolean {
    return this.toRestore.size > 0
  }

  /** Clés du stockage restant à recharger — cf. `toRestore`. */
  pendingRestores(): readonly CatalogKey[] {
    return [...this.toRestore]
  }

  /** Cette clé est prise en charge : la restauration ne doit plus s'en occuper. */
  claimRestore(key: CatalogKey): void {
    this.toRestore.delete(key)
  }

  /** Entre dans la sélection AVANT que la géométrie arrive : la ligne réagit au clic. */
  markSelected(key: CatalogKey): void {
    // Un geste explicite l'emporte sur la restauration : sans cela, l'effet de
    // restauration lancerait un SECOND chargement pour la même clé et annulerait le
    // premier — celui qui portait le cadrage demandé par le clic.
    this.toRestore.delete(key)
    if (this.shown.has(key)) return
    this.shown.add(key)
    this.selectionKeys = [...this.selectionKeys, key]
    this.pending.add(key)
    this.errors.delete(key)
    this.persistSelection()
    this.bump()
  }

  /**
   * Entre un LOT dans la sélection — cocher un agrégat, restaurer une session.
   *
   * Rend les clés RÉELLEMENT ajoutées : l'appelant ne lance un chargement que pour
   * celles-là, les autres ayant déjà leur géométrie ou leur requête en vol.
   *
   * Symétrique de `removeMany`, et pour la même raison : en boucle sur `markSelected`,
   * chaque clé recopiait la sélection entière (O(k²)), la réécrivait dans le stockage
   * et notifiait — k écritures synchrones et k cascades de rendu pour un seul geste.
   */
  markSelectedMany(keys: readonly CatalogKey[]): readonly CatalogKey[] {
    const added: CatalogKey[] = []
    for (const key of keys) {
      // Un geste explicite l'emporte sur la restauration — cf. `markSelected`.
      this.toRestore.delete(key)
      if (this.shown.has(key)) continue
      this.shown.add(key)
      this.pending.add(key)
      this.errors.delete(key)
      added.push(key)
    }
    if (added.length === 0) return added
    this.selectionKeys = [...this.selectionKeys, ...added]
    this.persistSelection()
    this.bump()
    return added
  }

  setGeometry(key: CatalogKey, shapes: readonly ShapeData[]): void {
    this.geometries.set(key, shapes)
    this.pending.delete(key)
    this.errors.delete(key)
    this.rebuildShapes()
    this.bump()
  }

  /**
   * Pose les géométries d'un LOT en une passe.
   *
   * `rebuildShapes` est en O(formes totales) et chaque `bump` redescend jusqu'à
   * `ShapeLayer`, qui reconstruit TOUTES ses formes. Élément par élément, afficher k
   * zones coûtait O(k × total) itérations et k reconstructions complètes de la couche
   * 3D — là où une seule suffit.
   */
  setGeometryMany(entries: readonly (readonly [CatalogKey, readonly ShapeData[]])[]): void {
    if (entries.length === 0) return
    for (const [key, shapes] of entries) {
      this.geometries.set(key, shapes)
      this.pending.delete(key)
      this.errors.delete(key)
    }
    this.rebuildShapes()
    this.bump()
  }

  /** Sortie de la sélection, avec ou sans échec — le retrait est le même geste. */
  remove(key: CatalogKey, failed = false): void {
    this.shown.delete(key)
    this.selectionKeys = removeFromSelection(this.selectionKeys, key)
    this.geometries.delete(key)
    this.pending.delete(key)
    if (failed) this.errors.add(key)
    else this.errors.delete(key)
    this.rebuildShapes()
    this.persistSelection()
    this.bump()
  }

  /**
   * Retire un LOT — décocher un agrégat.
   *
   * En boucle sur `remove`, chaque enfant reconstruisait TOUTES les formes, réécrivait
   * la sélection et notifiait : k × (formes totales) itérations, k écritures, k cascades
   * de rendu pour un seul geste.
   */
  removeMany(keys: readonly CatalogKey[], failed = false): void {
    let touched = false
    for (const key of keys) {
      if (!this.shown.has(key)) continue
      this.shown.delete(key)
      this.geometries.delete(key)
      this.pending.delete(key)
      // Même règle que `remove` : un lot qui échoue laisse ses pastilles d'erreur.
      if (failed) this.errors.add(key)
      else this.errors.delete(key)
      touched = true
    }
    if (!touched) return
    this.selectionKeys = this.selectionKeys.filter((k) => this.shown.has(k))
    this.rebuildShapes()
    this.persistSelection()
    this.bump()
  }

  clear(): void {
    if (this.selectionKeys.length === 0 && this.geometries.size === 0) return
    this.selectionKeys = []
    this.shown.clear()
    this.geometries.clear()
    this.pending.clear()
    this.errors.clear()
    this.rebuildShapes()
    this.persistSelection()
    this.bump()
  }

  /**
   * Retire ce qui appartient à une source disparue (plugin démonté).
   *
   * Rend `true` si quelque chose a bougé — l'appelant n'a pas à repeindre la carte pour
   * une inscription de source qui n'a rien retiré, ce qui, sous `renderOnDemand`, était
   * une frame rendue pour rien à chaque plugin qui arrive.
   */
  purge(known: ReadonlySet<string>): boolean {
    const kept = purgeSources(this.selectionKeys, known)
    if (kept === this.selectionKeys) return false
    const keep = new Set(kept)
    for (const key of [...this.geometries.keys()]) if (!keep.has(key)) this.geometries.delete(key)
    // `pending` et `errors` AUSSI : sans cela, un plugin démonté puis remonté retrouvait
    // ses lignes en erreur ou en chargement alors que plus rien n'était en vol — une
    // case désactivée et une pastille rouge que rien ne venait jamais effacer.
    for (const key of [...this.pending]) if (!keep.has(key)) this.pending.delete(key)
    for (const key of [...this.errors]) if (!keep.has(key)) this.errors.delete(key)
    for (const key of [...this.toRestore]) if (!keep.has(key)) this.toRestore.delete(key)
    this.shown = keep
    this.selectionKeys = kept
    this.rebuildShapes()
    this.persistSelection()
    this.bump()
    return true
  }

  setSettings(patch: Partial<CatalogSettings>): void {
    this.settings = { ...this.settings, ...patch }
    if (this.keys) writeStoredJSON(this.keys.settings, { v: SETTINGS_VERSION, ...this.settings })
    // Désactiver la persistance EFFACE la charge : la garder reviendrait à promettre
    // l'oubli tout en conservant la trace, et elle reviendrait au prochain réglage.
    // L'écriture en attente est abandonnée AVANT l'effacement — sinon son timer
    // réécrivait la sélection juste après qu'on l'a effacée.
    if (!this.settings.persist && this.keys) {
      this.cancelPersist()
      removeStoredKey(this.keys.selection)
    } else this.persistSelection()
    this.bump()
  }

  // ── Chargements en vol ──

  /** Ouvre un chargement pour `key`, en abandonnant celui qu'elle avait déjà. */
  beginLoad(key: CatalogKey): AbortController {
    this.loads.get(key)?.abort()
    const ctrl = new AbortController()
    this.loads.set(key, ctrl)
    return ctrl
  }

  /** Referme un chargement — sans toucher à celui qui l'aurait déjà remplacé. */
  endLoad(key: CatalogKey, ctrl: AbortController): void {
    if (this.loads.get(key) === ctrl) this.loads.delete(key)
  }

  abortLoad(key: CatalogKey): void {
    this.loads.get(key)?.abort()
    this.loads.delete(key)
  }

  abortAll(): void {
    for (const c of this.loads.values()) c.abort()
    this.loads.clear()
  }

  // ── Interne ──

  /**
   * Aplatit les géométries affichées, **dédoublonnées par `ShapeData.id`**.
   *
   * Deux entrées de catalogue peuvent légitimement porter la même zone : un groupe et
   * cette zone prise isolément, ou deux référentiels qui se recouvrent. Peintes deux
   * fois, elles se superposent — remplissages cumulés, contours plus épais, et une zone
   * qui reste à l'écran quand on décoche celle qu'on croyait seule.
   *
   * La PREMIÈRE occurrence gagne, et le retrait d'une entrée reconstruit tout : une
   * forme encore référencée ailleurs survit donc d'elle-même. Une forme sans `id` n'est
   * pas identifiable — on la garde telle quelle plutôt que de deviner.
   */
  private rebuildShapes(): void {
    const out: ShapeData[] = []
    const seen = new Set<string | number>()
    for (const shapes of this.geometries.values()) {
      for (const shape of shapes) {
        if (shape.id === undefined) {
          out.push(shape)
          continue
        }
        if (seen.has(shape.id)) continue
        seen.add(shape.id)
        out.push(shape)
      }
    }
    this.shapesCache = out
  }

  /**
   * Écrit la sélection — amortie, parce que `localStorage.setItem` est SYNCHRONE.
   *
   * Marque simplement « à écrire » et arme un timer : une rafale de gestes ne produit
   * qu'une écriture, sur la charge finale, au lieu d'une par élément sur une charge qui
   * grossit. `persistDebounceMs: 0` retombe sur l'écriture immédiate.
   */
  private persistSelection(): void {
    if (!this.keys || !this.settings.persist) return
    this.persistDirty = true
    if (this.keys.persistDebounceMs <= 0) {
      this.flushPersist()
      return
    }
    if (this.persistTimer !== null) clearTimeout(this.persistTimer)
    this.persistTimer = setTimeout(() => this.flushPersist(), this.keys.persistDebounceMs)
  }

  /**
   * Écrit tout de suite ce qui attend. À appeler avant que la page ne disparaisse
   * (`pagehide`) et au démontage de la carte : une sélection amortie ne doit pas se
   * perdre parce que l'onglet s'est fermé pendant le délai.
   */
  flushPersist(): void {
    if (this.persistTimer !== null) {
      clearTimeout(this.persistTimer)
      this.persistTimer = null
    }
    if (!this.persistDirty) return
    this.persistDirty = false
    if (!this.keys || !this.settings.persist) return
    writeStoredJSON(this.keys.selection, serializeSelection(this.selectionKeys))
  }

  /** Abandonne l'écriture en attente — la charge qu'elle porterait n'a plus lieu d'être. */
  private cancelPersist(): void {
    if (this.persistTimer !== null) {
      clearTimeout(this.persistTimer)
      this.persistTimer = null
    }
    this.persistDirty = false
  }

  private loadSettings(key: string): CatalogSettings {
    const data = readStoredJSON(key)
    if (typeof data !== 'object' || data === null) return DEFAULT_SETTINGS
    const { v, persist, fitOnAdd } = data as { v?: unknown; persist?: unknown; fitOnAdd?: unknown }
    if (v !== SETTINGS_VERSION) return DEFAULT_SETTINGS
    return {
      persist: typeof persist === 'boolean' ? persist : DEFAULT_SETTINGS.persist,
      fitOnAdd: typeof fitOnAdd === 'boolean' ? fitOnAdd : DEFAULT_SETTINGS.fitOnAdd,
    }
  }

  private bump(): void {
    this.token = {}
    for (const cb of this.listeners) cb()
  }
}
