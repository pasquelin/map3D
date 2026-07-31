import type { ShapeData } from '../layers/ShapeLayer'
import { deserializeSelection, purgeSources, removeFromSelection, serializeSelection } from './selection'
import { clearStorage, readStorage, writeStorage } from './storage'
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
   * Branche les clés de stockage et relit ce qui avait été retenu.
   *
   * Appelé par la couche React, qui seule connaît la config résolue — le moteur, lui,
   * peut tourner sans elle. Idempotent : deux montages successifs ne dupliquent rien.
   */
  configure(keys: CatalogStoreKeys): void {
    if (this.keys?.selection === keys.selection && this.keys.settings === keys.settings) return
    this.keys = keys
    this.settings = this.loadSettings(keys.settings)
    // Ne relire la sélection que si la persistance est active : sinon une charge
    // laissée par une session précédente ressusciterait un réglage qu'on a désactivé.
    this.selectionKeys = this.settings.persist ? deserializeSelection(readStorage(keys.selection)) : []
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
    return this.selectionKeys.includes(key)
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
    if (this.selectionKeys.includes(key)) return
    this.selectionKeys = [...this.selectionKeys, key]
    this.pending.add(key)
    this.errors.delete(key)
    this.persistSelection()
    this.bump()
  }

  setGeometry(key: CatalogKey, shapes: readonly ShapeData[]): void {
    this.geometries.set(key, shapes)
    this.pending.delete(key)
    this.errors.delete(key)
    this.rebuildShapes()
    this.bump()
  }

  /** Sortie de la sélection, avec ou sans échec — le retrait est le même geste. */
  remove(key: CatalogKey, failed = false): void {
    this.selectionKeys = removeFromSelection(this.selectionKeys, key)
    this.geometries.delete(key)
    this.pending.delete(key)
    if (failed) this.errors.add(key)
    else this.errors.delete(key)
    this.rebuildShapes()
    this.persistSelection()
    this.bump()
  }

  clear(): void {
    if (this.selectionKeys.length === 0 && this.geometries.size === 0) return
    this.selectionKeys = []
    this.geometries.clear()
    this.pending.clear()
    this.errors.clear()
    this.rebuildShapes()
    this.persistSelection()
    this.bump()
  }

  /** Retire ce qui appartient à une source disparue (plugin démonté). */
  purge(known: ReadonlySet<string>): void {
    const kept = purgeSources(this.selectionKeys, known)
    if (kept === this.selectionKeys) return
    const keep = new Set(kept)
    for (const key of [...this.geometries.keys()]) if (!keep.has(key)) this.geometries.delete(key)
    this.selectionKeys = kept
    this.rebuildShapes()
    this.persistSelection()
    this.bump()
  }

  setSettings(patch: Partial<CatalogSettings>): void {
    this.settings = { ...this.settings, ...patch }
    if (this.keys) writeStorage(this.keys.settings, JSON.stringify({ v: SETTINGS_VERSION, ...this.settings }))
    // Désactiver la persistance EFFACE la charge : la garder reviendrait à promettre
    // l'oubli tout en conservant la trace, et elle reviendrait au prochain réglage.
    if (!this.settings.persist && this.keys) clearStorage(this.keys.selection)
    else this.persistSelection()
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

  private persistSelection(): void {
    if (!this.keys || !this.settings.persist) return
    writeStorage(this.keys.selection, serializeSelection(this.selectionKeys))
  }

  private loadSettings(key: string): CatalogSettings {
    try {
      const raw = readStorage(key)
      if (!raw) return DEFAULT_SETTINGS
      const data: unknown = JSON.parse(raw)
      if (typeof data !== 'object' || data === null) return DEFAULT_SETTINGS
      const { v, persist, fitOnAdd } = data as { v?: unknown; persist?: unknown; fitOnAdd?: unknown }
      if (v !== SETTINGS_VERSION) return DEFAULT_SETTINGS
      return {
        persist: typeof persist === 'boolean' ? persist : DEFAULT_SETTINGS.persist,
        fitOnAdd: typeof fitOnAdd === 'boolean' ? fitOnAdd : DEFAULT_SETTINGS.fitOnAdd,
      }
    } catch {
      return DEFAULT_SETTINGS
    }
  }

  private bump(): void {
    this.token = {}
    for (const cb of this.listeners) cb()
  }
}
