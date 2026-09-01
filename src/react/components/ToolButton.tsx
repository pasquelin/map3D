import type { ButtonHTMLAttributes, ReactNode, Ref } from 'react'
import { useLabels } from '../context'
import { withShortcut } from './tooltip'
import { UiIcon } from './UiIcon'

/** Fabrique de tooltip d'une barre — la valeur de retour de `useTip(bar.tipId)`. */
export type BarTip = (label: string, shortcut?: string | false) => Record<string, string>

export type ToolButtonProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'aria-label' | 'children'> & {
  /**
   * Chemin d'icône @mdi/js. Absent, le bouton n'affiche que ses `children` — pour celui
   * dont l'aperçu EST la valeur qu'il règle (le bloc de couleurs de la barre à dessin),
   * qu'aucun glyphe ne peut dire.
   */
  icon?: string
  /** Libellé accessible — sert d'`aria-label` et de contenu du tooltip. */
  label: string
  /**
   * Tooltip de la barre hôte (`useTip(bar.tipId)`). Absent = pas d'infobulle, mais
   * l'`aria-label` reste posé (raccourci inclus) : un bouton sans tooltip n'est
   * jamais un bouton sans nom accessible.
   */
  tip?: BarTip
  /** Touche affichée à la suite du libellé. `false`/absent = aucune. */
  shortcut?: string | false
  /** État enfoncé (`m3d-on`). */
  active?: boolean
  /** Classes en PLUS de `m3d-btn` (ex. `m3d-btn-delete`, `m3d-tagbtn`). */
  className?: string
  /** Taille de l'icône (défaut : `theme.sizing.iconSize`, la convention des barres). */
  iconSize?: number
  /** Contenu additionnel DANS le bouton, après l'icône (ex. badge de compteur). */
  children?: ReactNode
  /**
   * Le `<button>` lui-même — une barre doit pouvoir publier son bouton actif comme
   * ANCRE : une surface s'ouvre à la hauteur de l'item auquel elle se rapporte, pas
   * en haut de la barre.
   */
  ref?: Ref<HTMLButtonElement>
}

/**
 * Bouton d'une barre d'outils : icône @mdi, état actif, tooltip + `aria-label`
 * porteurs du raccourci. Source unique du langage des barres (`MapControls`,
 * `Toolbar`, `LensToolButton`, `TagFilterControl`, `DrawSettingsButton`) — sans
 * lui, chaque site recopiait `className={\`m3d-btn${on ? ' m3d-on' : ''}\`}` +
 * `{...tip(...)}` + `<Icon size>` accordé au thème, et un oubli d'`aria-label` passait
 * inaperçu.
 *
 * Tout attribut de `<button>` non listé est transmis tel quel (`onClick`,
 * `disabled`, `aria-expanded`, `onPointerEnter`…).
 */
export function ToolButton({
  icon,
  label,
  tip,
  shortcut,
  active,
  className,
  iconSize,
  children,
  ...rest
}: ToolButtonProps) {
  const labels = useLabels()
  // Sans tooltip, l'`aria-label` est reconstruit avec le même gabarit : le nom
  // accessible ne dépend pas de la présence d'une infobulle.
  const naming = tip ? tip(label, shortcut) : { 'aria-label': withShortcut(label, shortcut, labels.format.shortcut) }
  return (
    <button
      type="button"
      className={`m3d-btn${active ? ' m3d-on' : ''}${className ? ` ${className}` : ''}`}
      {...naming}
      {...rest}
    >
      {icon !== undefined && <UiIcon path={icon} size={iconSize} />}
      {children}
    </button>
  )
}
