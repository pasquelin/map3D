import type { MarkerData } from '../data/types'
import type { ShapeData } from '../layers/ShapeLayer'
import { deserializeSnapshot, purgeSources, removeFromSelection, serializeSnapshot } from './selection'
import { readStoredJSON, removeStoredKey, writeStoredJSON } from '../core/storage'
import type { CatalogKey } from './types'

/**
 * Ce qu'un élément pose sur la carte : des formes, des points, ou les deux.
 *
 * Un seul objet plutôt que deux tables parallèles : les deux arrivent du même geste, se
 * retirent du même geste, et une paire désynchronisée laisserait les points d'une zone
 * qu'on vient de décocher.
 */
export type CatalogContent = {
  shapes: readonly ShapeData[]
  markers: readonly MarkerData[]
}

/**
 * Référence STABLE : rendue tant qu'aucun élément n'a de points, elle évite un re-render.
 *
 * Exportée pour que les appelants qui composent un `CatalogContent` sans point rendent la
 * MÊME référence — deux tableaux vides distincts feraient croire à un changement.
 */
export const NO_MARKERS: readonly MarkerData[] = []

/** Idem côté formes — cf. `NO_MARKERS`. */
const NO_SHAPES: readonly ShapeData[] = []

/**
 * Aplatit des lots en une liste, **dédoublonnée par `id`**.
 *
 * Deux entrées de catalogue peuvent légitimement porter le même objet : un groupe et cette
 * zone prise isolément, ou deux référentiels qui se recouvrent. Peint deux fois, il se
 * superpose à lui-même — remplissages cumulés, contours plus épais — et reste à l'écran
 * quand on décoche celle qu'on croyait seule.
 *
 * La PREMIÈRE occurrence gagne, et le retrait d'une entrée reconstruit tout : un objet
 * encore référencé ailleurs survit donc de lui-même. Un objet SANS `id` n'est pas
 * identifiable — on le garde tel quel plutôt que de deviner (le cas des formes anonymes ;
 * un marker, lui, a toujours un id).
 */
function dedupeById<T extends { id?: string | number }>(batches: Iterable<readonly T[]>): T[] {
  const out: T[] = []
  const seen = new Set<string | number>()
  for (const batch of batches) {
    for (const item of batch) {
      if (item.id === undefined) {
        out.push(item)
        continue
      }
      if (seen.has(item.id)) continue
      seen.add(item.id)
      out.push(item)
    }
  }
  return out
}

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
 * Les géométries ne sont pas persistées : clés et titres le sont, mais pas les formes —
 * une géométrie est la réponse d'une API à un instant donné, la resservir depuis un
 * stockage local ferait afficher un périmètre que le backend a peut-être déplacé depuis.
 * Le titre, lui, est retenu pour rendre une forme anonyme restaurée cherchable par nom.
 */
export class CatalogStore {
  private selectionKeys: readonly CatalogKey[] = []
  /**
   * Titre à prêter à chaque forme anonyme, par clé — persisté avec la sélection.
   *
   * Une forme sans nom propre n'entre pas dans la recherche (cf. ZONES.md § 5) : à la pose
   * on lui prête celui de son élément (`fetchGeometry`). Ce nom-là n'était pas retenu, si
   * bien qu'une zone restaurée redevenait introuvable. On le persiste donc à côté des clés.
   */
  private titles = new Map<CatalogKey, string>()
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
  /**
   * Points d'un élément — table SÉPARÉE des formes, et alimentée seulement quand il y en
   * a : la quasi-totalité des sources n'en pose aucun, et une entrée vide par clé ferait
   * balayer la table entière à chaque mutation pour n'y rien trouver.
   */
  private readonly markersByKey = new Map<CatalogKey, readonly MarkerData[]>()
  /**
   * `markersByKey` a bougé depuis la dernière reconstruction.
   *
   * Un drapeau porté par les deux accesseurs plutôt qu'une variable locale par méthode :
   * `rebuildMarkers` change l'identité de `markersCache`, donc reconstruit la couche
   * marker — le déclencher sur une source qui n'a jamais posé de point (le cas de presque
   * toutes) était du travail pur. Oublier de le lever dans une nouvelle méthode ne casse
   * rien de visible tout de suite, d'où l'invariant tenu ici et nulle part ailleurs.
   */
  private markersDirty = false
  private readonly pending = new Set<CatalogKey>()
  private readonly errors = new Set<CatalogKey>()
  /**
   * Sources à BASCULE allumées, par id.
   *
   * Volontairement à côté de `selectionKeys` et non dedans : une bascule n'a pas
   * d'élément, donc pas de `CatalogKey`. Y glisser une sentinelle (`'defibs:*'`) la
   * ferait entrer en collision avec l'identifiant d'un élément réel, et la purge comme la
   * restauration ne sauraient plus laquelle des deux elles traitent.
   */
  private enabled = new Set<string>()
  /**
   * Bascules dont un chargement est EN VOL — jamais persisté : c'est un état de la
   * seconde qui passe, pas une préférence.
   */
  private readonly loadingSources = new Set<string>()
  private settings: CatalogSettings = DEFAULT_SETTINGS
  private token: object = {}
  private shapesCache: readonly ShapeData[] = []
  private markersCache: readonly MarkerData[] = NO_MARKERS
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
    // Une seule lecture, un seul parse : les trois champs viennent de la même charge.
    const snap = this.settings.persist ? deserializeSnapshot(readStoredJSON(keys.selection)) : null
    this.selectionKeys = snap?.keys ?? []
    this.titles = new Map(snap?.titles)
    // Les bascules sont dans leur propre champ : elles ne passent NI par `shown` (aucune
    // clé d'élément) NI par `toRestore` (rien à redemander — c'est la couche qui
    // rechargera au premier cadre).
    this.enabled = new Set(snap?.sources)
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

  /** Tous les points posés par les éléments affichés. Ceux des BASCULES n'y sont pas :
   * ils vivent dans leur couche, rechargés au cadre, et ne transitent jamais par ici. */
  markers(): readonly MarkerData[] {
    return this.markersCache
  }

  /**
   * Combien d'entrées le catalogue peint-il ? Éléments cochés **plus** bascules
   * allumées — c'est le badge du bouton.
   *
   * Les deux comptent : allumer un jeu de 36 000 points sans que le bouton s'allume
   * laisserait croire que le catalogue ne fait rien.
   */
  activeCount(): number {
    return this.selectionKeys.length + this.enabled.size
  }

  isShown(key: CatalogKey): boolean {
    return this.shown.has(key)
  }

  /** Sa géométrie est-elle déjà en mémoire ? Faux pour une clé restaurée non rechargée. */
  hasGeometry(key: CatalogKey): boolean {
    return this.geometries.has(key)
  }

  /**
   * Tout ce qu'un élément a posé, ou `null` s'il n'a rien (pas encore chargé, retiré).
   *
   * Le store écrit des `CatalogContent` (`setContentMany`) : il doit aussi savoir en
   * rendre. Sans ça, chaque appelant recomposait la paire à la main — et l'une des trois
   * recompositions avait déjà dérivé sur le traitement de la géométrie absente.
   */
  getContent(key: CatalogKey): CatalogContent | null {
    const shapes = this.geometries.get(key)
    return shapes ? { shapes, markers: this.markersByKey.get(key) ?? NO_MARKERS } : null
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

  // ── Sources à bascule ──

  isSourceOn(id: string): boolean {
    return this.enabled.has(id)
  }

  /**
   * Allume ou éteint un jeu. Le geste est complet à lui seul : rien à charger ici, la
   * couche montée par la surface s'en occupe au premier cadre.
   */
  setSourceOn(id: string, on: boolean): void {
    if (this.enabled.has(id) === on) return
    if (on) this.enabled.add(id)
    else {
      this.enabled.delete(id)
      // Éteinte, sa couche est démontée : plus personne ne rendra jamais ce drapeau à
      // `false`, et la ligne resterait en chargement pour toujours.
      this.loadingSources.delete(id)
    }
    this.persistSelection()
    this.bump()
  }

  /**
   * Un chargement est-il en vol pour ce jeu ? Jamais un COMPTE — cf. `CatalogToggleSource`.
   *
   * Éteint ⇒ jamais en chargement, quoi qu'il reste dans la table : la garde est ICI et pas
   * dans les quatre endroits qui éteignent, sinon l'invariant tiendrait à ce qu'aucun d'eux
   * n'oublie de nettoyer — et une ligne resterait en chargement pour toujours.
   */
  isSourceLoading(id: string): boolean {
    return this.enabled.has(id) && this.loadingSources.has(id)
  }

  setSourceLoading(id: string, loading: boolean): void {
    if (this.loadingSources.has(id) === loading) return
    if (loading) this.loadingSources.add(id)
    else this.loadingSources.delete(id)
    this.bump()
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

  /** Nom prêté à une forme anonyme sous cette clé — `undefined` si aucun. */
  titleOf(key: CatalogKey): string | undefined {
    return this.titles.get(key)
  }

  /** Entre dans la sélection AVANT que la géométrie arrive : la ligne réagit au clic. */
  markSelected(key: CatalogKey, title?: string): void {
    // Avant la sortie anticipée « déjà affiché » : le titre sert à la RESTAURATION et doit
    // entrer dans la table même quand la clé y est déjà, au cas où il n'était pas connu au
    // premier ajout. La prochaine écriture (ajout, retrait) l'emportera.
    if (title !== undefined) this.titles.set(key, title)
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
  markSelectedMany(keys: readonly CatalogKey[], titles?: ReadonlyMap<CatalogKey, string>): readonly CatalogKey[] {
    const added: CatalogKey[] = []
    for (const key of keys) {
      // Titre retenu pour toutes les clés du lot, même déjà affichées — cf. `markSelected`.
      const title = titles?.get(key)
      if (title !== undefined) this.titles.set(key, title)
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

  /**
   * Pose le contenu d'un LOT en une passe.
   *
   * `rebuildShapes` est en O(formes totales) et chaque `bump` redescend jusqu'à
   * `ShapeLayer`, qui reconstruit TOUTES ses formes. Élément par élément, afficher k
   * zones coûtait O(k × total) itérations et k reconstructions complètes de la couche
   * 3D — là où une seule suffit.
   */
  setContentMany(entries: readonly (readonly [CatalogKey, CatalogContent])[]): void {
    if (entries.length === 0) return
    for (const [key, content] of entries) {
      this.geometries.set(key, content.shapes)
      this.putMarkers(key, content.markers)
      this.pending.delete(key)
      this.errors.delete(key)
    }
    this.rebuildShapes()
    this.flushMarkers()
    this.bump()
  }

  /** Sortie de la sélection, avec ou sans échec — le retrait est le même geste. */
  remove(key: CatalogKey, failed = false): void {
    this.shown.delete(key)
    this.selectionKeys = removeFromSelection(this.selectionKeys, key)
    this.titles.delete(key)
    this.geometries.delete(key)
    this.dropMarkers(key)
    this.pending.delete(key)
    if (failed) this.errors.add(key)
    else this.errors.delete(key)
    this.rebuildShapes()
    this.flushMarkers()
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
      this.titles.delete(key)
      this.geometries.delete(key)
      this.dropMarkers(key)
      this.pending.delete(key)
      // Même règle que `remove` : un lot qui échoue laisse ses pastilles d'erreur.
      if (failed) this.errors.add(key)
      else this.errors.delete(key)
      touched = true
    }
    if (!touched) return
    this.selectionKeys = this.selectionKeys.filter((k) => this.shown.has(k))
    this.rebuildShapes()
    this.flushMarkers()
    this.persistSelection()
    this.bump()
  }

  /**
   * « Tout retirer » : la carte cesse de peindre ce qui vient du catalogue.
   *
   * Les bascules partent AVEC les éléments cochés. Les épargner laisserait des milliers
   * de points sur une carte qu'on vient de demander à vider — le bouton dit « tout ».
   */
  clear(): void {
    if (this.selectionKeys.length === 0 && this.geometries.size === 0 && this.enabled.size === 0) return
    this.selectionKeys = []
    this.titles.clear()
    this.shown.clear()
    this.geometries.clear()
    this.clearMarkers()
    this.pending.clear()
    this.errors.clear()
    this.enabled.clear()
    this.loadingSources.clear()
    this.rebuildShapes()
    this.flushMarkers()
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
    // Les bascules d'abord, et SÉPARÉMENT : leur source peut disparaître alors qu'aucune
    // clé d'élément ne bouge (une source à bascule n'en a pas). Fusionner les deux tests
    // laissait un jeu de points allumé, sans plus aucune ligne pour l'éteindre.
    let touchedSources = false
    for (const id of [...this.enabled]) {
      if (known.has(id)) continue
      this.enabled.delete(id)
      this.loadingSources.delete(id)
      touchedSources = true
    }
    const kept = purgeSources(this.selectionKeys, known)
    // Rien de part ni d'autre : on ressort SANS notifier, pour ne pas rendre une frame à
    // chaque inscription de source qui n'a rien retiré.
    if (kept === this.selectionKeys && !touchedSources) return false
    if (kept !== this.selectionKeys) {
      const keep = new Set(kept)
      for (const key of [...this.geometries.keys()]) if (!keep.has(key)) this.geometries.delete(key)
      for (const key of [...this.markersByKey.keys()]) if (!keep.has(key)) this.dropMarkers(key)
      // `pending` et `errors` AUSSI : sans cela, un plugin démonté puis remonté retrouvait
      // ses lignes en erreur ou en chargement alors que plus rien n'était en vol — une
      // case désactivée et une pastille rouge que rien ne venait jamais effacer.
      for (const key of [...this.pending]) if (!keep.has(key)) this.pending.delete(key)
      for (const key of [...this.errors]) if (!keep.has(key)) this.errors.delete(key)
      for (const key of [...this.toRestore]) if (!keep.has(key)) this.toRestore.delete(key)
      for (const key of [...this.titles.keys()]) if (!keep.has(key)) this.titles.delete(key)
      this.shown = keep
      this.selectionKeys = kept
      this.rebuildShapes()
      this.flushMarkers()
    }
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

  /** Formes affichées, à plat et dédoublonnées — cf. `dedupeById`. */
  private rebuildShapes(): void {
    // Référence CONSTANTE quand rien n'est affiché, comme `rebuildMarkers` : un `[]` neuf
    // par mutation ferait croire à un changement à qui compare `shapes()` par identité.
    this.shapesCache = this.geometries.size === 0 ? NO_SHAPES : dedupeById(this.geometries.values())
  }

  /** Retient les points d'une clé — rien du tout si elle n'en a pas (cf. `markersByKey`). */
  private putMarkers(key: CatalogKey, markers: readonly MarkerData[]): void {
    if (markers.length === 0) {
      this.dropMarkers(key)
      return
    }
    this.markersByKey.set(key, markers)
    this.markersDirty = true
  }

  private dropMarkers(key: CatalogKey): void {
    if (this.markersByKey.delete(key)) this.markersDirty = true
  }

  private clearMarkers(): void {
    if (this.markersByKey.size === 0) return
    this.markersByKey.clear()
    this.markersDirty = true
  }

  /** Reconstruit le cache des points SEULEMENT si la table a bougé. */
  private flushMarkers(): void {
    if (!this.markersDirty) return
    this.markersDirty = false
    this.rebuildMarkers()
  }

  /** Points affichés, à plat et dédoublonnés — cf. `dedupeById`. */
  private rebuildMarkers(): void {
    // Référence CONSTANTE quand rien n'a de point — cf. `NO_MARKERS`.
    this.markersCache = this.markersByKey.size === 0 ? NO_MARKERS : dedupeById(this.markersByKey.values())
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
    writeStoredJSON(
      this.keys.selection,
      serializeSnapshot({ keys: this.selectionKeys, titles: this.titles, sources: this.enabled }),
    )
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
