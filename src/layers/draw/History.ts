import type { Drawing } from '../DrawLayer'

const CAP = 50

/**
 * Historique undo/redo du dessin par **snapshots** de la collection complète :
 * les états sont petits (points lat/lng), la fiabilité prime — pas de commandes
 * inverses à maintenir. Le caller pousse l'état **d'avant** chaque mutation
 * (création, suppression, transformation, style) ; un push identique au sommet
 * est ignoré (évite les entrées fantômes au montage).
 */
type Entry = { snap: Drawing[]; json: string }

const toEntry = (state: readonly Drawing[]): Entry => {
  try {
    return { snap: structuredClone(state) as Drawing[], json: JSON.stringify(state) }
  } catch (cause) {
    // Seul `meta` (opaque, fourni par l'app hôte) peut contenir une valeur non
    // clonable. Le `DataCloneError` brut ne désignerait pas le coupable, et il
    // surviendrait au premier geste de dessin — loin de la ligne fautive.
    throw new Error(
      'map3d: une forme porte des `meta` non sérialisables (fonction, Symbol, nœud DOM). ' +
        'Voir `ShapeMeta` : stockez un identifiant plutôt qu’une valeur vivante. ' +
        `Cause : ${String(cause)}`,
    )
  }
}

export class History {
  private past: Entry[] = []
  private future: Entry[] = []

  /** Snapshot de l'état AVANT une mutation — vide la pile redo. */
  push(state: readonly Drawing[]): void {
    const entry = toEntry(state)
    // La forme sérialisée est conservée avec chaque snapshot : l'idempotence
    // coûte une comparaison de chaîne, pas une re-sérialisation du sommet.
    if (this.past[this.past.length - 1]?.json === entry.json) return
    this.past.push(entry)
    if (this.past.length > CAP) this.past.shift()
    this.future = []
  }

  /** État à restaurer, ou null. `current` part sur la pile redo. */
  undo(current: readonly Drawing[]): Drawing[] | null {
    const prev = this.past.pop()
    if (!prev) return null
    this.future.push(toEntry(current))
    return prev.snap
  }

  /** État à restaurer, ou null. `current` repart sur la pile undo. */
  redo(current: readonly Drawing[]): Drawing[] | null {
    const next = this.future.pop()
    if (!next) return null
    this.past.push(toEntry(current))
    return next.snap
  }

  /** Oublie tout — l'import GeoJSON (remplacement par l'app hôte) n'est pas annulable. */
  reset(): void {
    this.past = []
    this.future = []
  }

  get canUndo(): boolean {
    return this.past.length > 0
  }

  get canRedo(): boolean {
    return this.future.length > 0
  }
}
