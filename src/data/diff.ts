/**
 * Diff par identité stable : compare un ensemble précédent (indexé par clé) à
 * une nouvelle liste et classe chaque élément en *entrant*, *présent* (candidat
 * à un déplacement animé) ou *sortant*. Utilisé par MarkerLayer pour recycler
 * les nœuds DOM et animer les changements de position sans les recréer.
 */
export type DiffResult<T> = {
  entered: T[]
  updated: T[]
  exitedKeys: Array<string | number>
}

export function diffById<T>(
  previous: Map<string | number, unknown>,
  next: readonly T[],
  getId: (item: T) => string | number,
): DiffResult<T> {
  const entered: T[] = []
  const updated: T[] = []
  const seen = new Set<string | number>()
  for (const item of next) {
    const id = getId(item)
    seen.add(id)
    if (previous.has(id)) updated.push(item)
    else entered.push(item)
  }
  const exitedKeys: Array<string | number> = []
  for (const key of previous.keys()) {
    if (!seen.has(key)) exitedKeys.push(key)
  }
  return { entered, updated, exitedKeys }
}
