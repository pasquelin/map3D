import { defaultConfig } from '../config/defaultConfig'
import { readStoredJSON, writeStoredJSON } from './storage'
/** Tag présent sur la carte + nombre d'éléments qui le portent. */
export type TagEntry = { tag: string; count: number }

/**
 * Palette de repli des pastilles du panneau « Couches ». L'attribution est un
 * hash déterministe du nom → un tag garde sa couleur entre sessions et entre
 * couches sans rien stocker. L'app impose ses propres couleurs via
 * `theme.colors.tags` (prioritaire).
 */
const TAG_PALETTE = [
  '#ef4444',
  '#f97316',
  '#f59e0b',
  '#84cc16',
  '#22c55e',
  '#10b981',
  '#06b6d4',
  '#3b82f6',
  '#6366f1',
  '#8b5cf6',
  '#d946ef',
  '#ec4899',
]

/** Couleur de repli d'un tag (hash djb2 → palette, stable entre sessions). */
export function tagColor(tag: string): string {
  let h = 5381
  for (let i = 0; i < tag.length; i++) h = ((h << 5) + h + tag.charCodeAt(i)) | 0
  return TAG_PALETTE[Math.abs(h) % TAG_PALETTE.length]!
}

/**
 * Compte les occurrences de chaque tag d'une collection d'éléments (fold partagé
 * par les couches pour alimenter `report`). Le sélecteur évite d'allouer un
 * tableau intermédiaire de listes de tags à chaque tick de flux temps réel.
 */
export function countTags<T>(
  items: Iterable<T>,
  getTags: (item: T) => readonly string[] | undefined,
): Map<string, number> {
  const counts = new Map<string, number>()
  for (const item of items) {
    const tags = getTags(item)
    if (tags) for (const t of tags) counts.set(t, (counts.get(t) ?? 0) + 1)
  }
  return counts
}

/**
 * Filtre de visibilité par tags, partagé par toutes les couches (`engine.tags`).
 *
 * - **Sélection** : ensemble de tags cochés. Vide = aucun filtre (tout visible).
 *   Non vide = seuls les éléments portant AU MOINS un tag sélectionné sont
 *   visibles (sémantique OU : « les users ET tous les rectangles »).
 * - **Registre** : chaque couche déclare les tags qu'elle porte (avec compteurs)
 *   via `report` — le panneau UI liste ainsi les tags réellement présents.
 * - **Persistance** : la sélection survit au rechargement (localStorage),
 *   `storageKey: null` pour désactiver, une clé distincte par carte si
 *   plusieurs `<Map>` cohabitent sur le même origin.
 *
 * Les versions (`selectionVersion`/`registryVersion`) sont des snapshots pour
 * `useSyncExternalStore` : les abonnés ne recalculent qu'au changement réel.
 */
export class TagFilter {
  private readonly selection = new Set<string>()
  private readonly sources = new Map<string, ReadonlyMap<string, number>>()
  private readonly selectionListeners = new Set<() => void>()
  private readonly registryListeners = new Set<() => void>()
  selectionVersion = 0
  registryVersion = 0

  constructor(private readonly storageKey: string | null = defaultConfig.data.storageKeys.tagFilter) {
    if (!this.storageKey) return
    const stored = readStoredJSON(this.storageKey)
    if (Array.isArray(stored)) for (const t of stored) if (typeof t === 'string') this.selection.add(t)
  }

  get selected(): ReadonlySet<string> {
    return this.selection
  }

  /** true si un filtre est actif (au moins un tag sélectionné). */
  get isActive(): boolean {
    return this.selection.size > 0
  }

  /**
   * Un élément portant `tags` est-il visible ? Sans filtre actif → toujours.
   * Avec filtre → au moins un tag en commun (un élément sans tag est masqué).
   */
  isVisible(tags?: readonly string[]): boolean {
    if (this.selection.size === 0) return true
    if (!tags || tags.length === 0) return false
    for (const t of tags) if (this.selection.has(t)) return true
    return false
  }

  toggle(tag: string): void {
    if (!this.selection.delete(tag)) this.selection.add(tag)
    this.emitSelection()
  }

  /**
   * Remplace toute la sélection d'un coup — restituer un filtre mémorisé (vue de template,
   * réglage venu de l'hôte). En `toggle` par tag, chaque appel refiltrait toutes les couches
   * et réécrivait le localStorage : une sélection de dix tags coûtait dix passes pour un
   * seul état visible. Sélection identique = aucune émission.
   *
   * Ce sont des NOMS de tags, jamais de la donnée : un tag absent de la carte au moment du
   * rechargement (couches différentes, données pas encore arrivées) filtre sans être porté
   * par quoi que ce soit, mais `all()` le liste quand même à compte 0 — donc il reste
   * décochable, et une sélection restituée ne peut pas enfermer l'utilisateur.
   */
  setSelection(tags: Iterable<string>): void {
    const next = new Set(tags)
    // Chemin froid (un chargement de vue, un clic « tout décocher ») : la comparaison
    // matérialise le tableau plutôt que de dérouler la boucle à la main.
    if (next.size === this.selection.size && [...next].every((t) => this.selection.has(t))) return
    this.selection.clear()
    for (const t of next) this.selection.add(t)
    this.emitSelection()
  }

  /**
   * Ajoute des tags à la sélection courante (union), sans en retirer. Pour RÉVÉLER des
   * éléments qu'un filtre actif masquerait — les formes d'un template qu'on vient de poser.
   * N'émet qu'en cas de changement réel ; ré-ajouter des tags déjà cochés est un no-op.
   *
   * Ne crée pas de filtre : l'appelant garde la main pour ne le faire que filtre déjà actif
   * (`isActive`) — ajouter des tags à une sélection vide masquerait au contraire tout le reste.
   */
  add(tags: Iterable<string>): void {
    let changed = false
    for (const t of tags)
      if (!this.selection.has(t)) {
        this.selection.add(t)
        changed = true
      }
    if (changed) this.emitSelection()
  }

  /** Tout décocher — cas particulier de `setSelection`, pour que les deux ne divergent pas. */
  clear(): void {
    this.setSelection([])
  }

  /**
   * Tags à lister dans le panneau : fusion de toutes les sources, tri alphabétique.
   * Les tags SÉLECTIONNÉS mais absents de la carte (sélection persistée d'une
   * session dont les données ont changé) sont inclus à compte 0 — sinon ils
   * filtrent sans qu'aucune case ne permette de les décocher.
   */
  all(): TagEntry[] {
    const counts = new Map<string, number>()
    for (const src of this.sources.values()) for (const [tag, n] of src) counts.set(tag, (counts.get(tag) ?? 0) + n)
    for (const tag of this.selection) if (!counts.has(tag)) counts.set(tag, 0)
    return [...counts].map(([tag, count]) => ({ tag, count })).sort((a, b) => a.tag.localeCompare(b.tag))
  }

  /**
   * Déclare (ou met à jour) les compteurs de tags d'une couche source. N'émet que
   * si le contenu change réellement — les flux temps réel (positions d'agents)
   * re-déclarent souvent des compteurs identiques.
   */
  report(source: string, counts: ReadonlyMap<string, number>): void {
    const prev = this.sources.get(source)
    if (prev && prev.size === counts.size) {
      let same = true
      for (const [tag, n] of counts) {
        if (prev.get(tag) !== n) {
          same = false
          break
        }
      }
      if (same) return
    }
    this.sources.set(source, counts)
    this.emitRegistry()
  }

  /** Retire une source (couche démontée) du registre. */
  unreport(source: string): void {
    if (this.sources.delete(source)) this.emitRegistry()
  }

  onSelection = (cb: () => void): (() => void) => {
    this.selectionListeners.add(cb)
    return () => this.selectionListeners.delete(cb)
  }

  onRegistry = (cb: () => void): (() => void) => {
    this.registryListeners.add(cb)
    return () => this.registryListeners.delete(cb)
  }

  private emitSelection(): void {
    this.selectionVersion++
    // Les listeners d'abord (refiltrage markers/dessins), la persistance ensuite :
    // l'I/O localStorage ne doit pas précéder le travail visible à l'écran.
    for (const cb of this.selectionListeners) cb()
    if (!this.storageKey) return
    writeStoredJSON(this.storageKey, [...this.selection])
  }

  private emitRegistry(): void {
    this.registryVersion++
    for (const cb of this.registryListeners) cb()
  }
}
