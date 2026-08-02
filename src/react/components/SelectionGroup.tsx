import { mdiChevronRight, mdiClose } from '@mdi/js'
import type { ReactNode } from 'react'
import { formatLabel } from '../../labels/mergeLabels'
import { useLabels } from '../context'
import { UiIcon } from './UiIcon'

export type SelectionGroupProps = {
  /** Repère visuel du groupe : icône d'outil, polyligne, ou mini-camembert d'un cluster. */
  icon: ReactNode
  /** Libellé du groupe (ex. « Formes », « Tracés », le nom du cluster). Sert aussi aux aria-labels. */
  label: string
  /** Nombre d'éléments du groupe (compteur affiché à droite du libellé). */
  count: number
  /** Groupe déplié : son corps est listé. */
  open: boolean
  onToggle: () => void
  /** Croix ✕ : DÉSÉLECTIONNE le groupe entier (ne supprime pas). */
  onDeselect: () => void
  /**
   * Corps du groupe, rendu (indenté) quand il est déplié. Toujours une `SelectionList`
   * ou une `MarkerList` — ce qui garantit que les lignes enfant sont la MÊME brique
   * (`SelectionRow`) partout, quel que soit le type du groupe.
   */
  children: ReactNode
}

/**
 * Groupe pliable du panneau de sélection — en-tête (chevron + icône + libellé +
 * compteur + croix) puis, déplié, son corps indenté. Composant UNIQUE réutilisé pour
 * les formes, les tracés ET les clusters : même en-tête partout, seul le contenu
 * (icône, libellé, corps) change. Les aria-labels (dépliage, désélection) sont dérivés
 * du `label` ICI — les appelants ne les recalculent pas.
 */
export function SelectionGroup(props: SelectionGroupProps) {
  const { icon, label, count, open, onToggle, onDeselect, children } = props
  const labels = useLabels()
  return (
    <div>
      <div className="m3d-tagrow">
        {/* Chevron : déplie le groupe pour lister ses éléments, comme le catalogue. */}
        <button
          type="button"
          className={open ? 'm3d-selrow-chevron m3d-on' : 'm3d-selrow-chevron'}
          aria-expanded={open}
          aria-label={formatLabel(labels.selection.expandGroup, { label })}
          onClick={onToggle}
        >
          <UiIcon path={mdiChevronRight} />
        </button>
        {icon}
        <span className="m3d-taglabel">{label}</span>
        <span className="m3d-tagcount">{count}</span>
        <button
          type="button"
          className="m3d-selrow-x"
          onClick={onDeselect}
          aria-label={formatLabel(labels.selection.deselectGroup, { label })}
        >
          <UiIcon path={mdiClose} />
        </button>
      </div>
      {open && <div className="m3d-selchildren">{children}</div>}
    </div>
  )
}
