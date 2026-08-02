import type { ReactNode } from 'react'
import { SelectionGroup } from './SelectionGroup'
import { SelectionList, type SelectionRowModel } from './SelectionRow'

export type SelectionSectionProps<K extends string | number = string | number> = {
  /** Ids de la section, dans l'ordre de sélection. Vide → rien n'est rendu. */
  ids: readonly K[]
  /** Construit le modèle de ligne d'un id (position dans la section fournie pour le rang). */
  rowOf: (id: K, index: number) => SelectionRowModel
  /** Repère visuel du groupe quand il est plié (icône d'outil, polyligne…). */
  groupIcon: ReactNode
  /** Libellé du groupe (sert aussi aux aria-labels de `SelectionGroup`). */
  groupLabel: string
  /** Groupe déplié — ignoré tant qu'il n'y a qu'un seul élément (ligne à plat). */
  open: boolean
  onToggle: () => void
  /** Croix ✕ du groupe : désélectionne toute la section. */
  onDeselectGroup: () => void
}

/**
 * Section de badges décidant SEULE « 1 → ligne à plat / N → groupe pliable » : un seul
 * élément rend une `SelectionList` nue (pas de chevron inutile), plusieurs rendent un
 * `SelectionGroup` enveloppant la même liste. Brique UNIQUE partagée par les formes et
 * les tracés — la règle 1-vs-N (et sa dérive potentielle) ne vit qu'ICI.
 */
export function SelectionSection<K extends string | number>({
  ids,
  rowOf,
  groupIcon,
  groupLabel,
  open,
  onToggle,
  onDeselectGroup,
}: SelectionSectionProps<K>) {
  if (ids.length === 0) return null
  if (ids.length === 1) return <SelectionList rows={[rowOf(ids[0]!, 0)]} />
  return (
    <SelectionGroup
      icon={groupIcon}
      label={groupLabel}
      count={ids.length}
      open={open}
      onToggle={onToggle}
      onDeselect={onDeselectGroup}
    >
      <SelectionList rows={ids.map((id, i) => rowOf(id, i))} />
    </SelectionGroup>
  )
}
