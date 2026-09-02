import { type ReactNode, type Ref, useRef, useState } from 'react'
import { useToolbar } from '../context'
import { DropdownSurface, useYieldsToDropdown } from './Dropdown'
import { type BarTip, ToolButton } from './ToolButton'
import { useTip } from './tooltip'
import { UiIcon } from './UiIcon'
import { useCloseWhenHidden } from './useDismiss'

/**
 * Châssis d'un SOUS-MENU DE SURVOL de la barre (sélecteur, mesures, gomme).
 *
 * Réunit les trois règles non évidentes que chaque sous-menu doit tenir, et qui étaient
 * réécrites à l'identique dans chacun :
 * — il ne s'ouvre que s'il a plus d'une rangée (une seule = le bouton agit directement) ;
 * — il s'efface devant une vraie surface déroulante, qu'il ne doit pas recouvrir au survol ;
 * — il se referme quand la barre se replie, sinon il rouvrirait tel quel au retour.
 */
export function useHoverFlyout(rowCount: number): {
  wrapProps: { className: string; onPointerEnter?: () => void; onPointerLeave?: () => void }
  hasFlyout: boolean
  showing: boolean
  close: () => void
} {
  const [open, setOpen] = useState(false)
  useCloseWhenHidden(useToolbar().retracted, setOpen)
  // Hook appelé INCONDITIONNELLEMENT : `rowCount > 1 && !useYieldsToDropdown()` le
  // court-circuiterait dès qu'il n'y a qu'une rangée — même piège que `ToolButton` et
  // `Toolbar` avec `useConfig`.
  const dropdownOuvert = useYieldsToDropdown()
  const hasFlyout = rowCount > 1 && !dropdownOuvert
  return {
    wrapProps: {
      className: 'm3d-selectwrap',
      onPointerEnter: hasFlyout ? () => setOpen(true) : undefined,
      onPointerLeave: hasFlyout ? () => setOpen(false) : undefined,
    },
    hasFlyout,
    showing: open && hasFlyout,
    close: () => setOpen(false),
  }
}

/** Une rangée du sous-menu : icône + libellé, infobulle portant le raccourci. */
export type FlyoutRow = {
  key: string
  icon: string
  label: string
  /** Texte de l'infobulle de la rangée (le raccourci s'y ajoute). */
  description: string
  shortcut?: string | false
  /** Rangée allumée (`m3d-on`). */
  on: boolean
  /** Le sous-menu se referme de lui-même après. */
  onSelect: () => void
}

export type FlyoutToolButtonProps = {
  position: 'left' | 'right'
  icon: string
  label: string
  shortcut?: string | false
  active: boolean
  /**
   * Infobulle du bouton, posée SEULEMENT sans sous-menu. Quand le survol ouvre une
   * surface, l'infobulle venait se poser par-dessus celle qu'on est en train de lire ;
   * les rangées portent alors la leur, avec leur raccourci. (`ToolButton` garde son
   * `aria-label` dans les deux cas — un bouton sans infobulle n'est jamais un bouton
   * sans nom accessible.)
   */
  tip?: BarTip
  /** Le `<button>` publié comme ancre de l'outil actif (cf. `ToolbarApi.publishActiveTool`). */
  buttonRef?: Ref<HTMLButtonElement>
  onClick: () => void
  rows: FlyoutRow[]
  /**
   * Rangée ajoutée APRÈS `rows` (« Tout effacer »), comptée dans le seuil d'ouverture :
   * sans elle dans le décompte, un seul mode autorisé fermerait le sous-menu alors
   * qu'il a bien deux lignes à montrer. Elle ne referme rien : le survol qui sort suffit.
   */
  trailing?: ReactNode
}

/**
 * Bouton de barre + sous-menu de survol ouvert du côté opposé à la barre.
 *
 * Sous-menu de SURVOL, pas une surface déroulante : le bouton active l'outil au lieu de
 * déplier, d'où l'absence assumée d'`aria-expanded` et de fermeture au clic extérieur
 * (le pointeur qui sort suffit). Il partage seulement le châssis du panneau, porté à
 * la racine de la carte comme les autres sous-menus : rendu DANS la barre, son flou ne
 * pouvait pas jouer (la barre porte `backdrop-filter`) et il paraissait d'un autre
 * composant.
 *
 * Trois boutons (sélecteur, mesures, gomme) recopiaient ce châssis à ~75 % : la
 * sémantique des rangées reste chez chacun, seule la mécanique est ici.
 */
export function FlyoutToolButton({
  position,
  icon,
  label,
  shortcut,
  active,
  tip,
  buttonRef,
  onClick,
  rows,
  trailing,
}: FlyoutToolButtonProps) {
  const rowTip = useTip(useToolbar().tipId)
  const wrapRef = useRef<HTMLDivElement>(null)
  const flyout = useHoverFlyout(rows.length + (trailing ? 1 : 0))

  return (
    <div ref={wrapRef} {...flyout.wrapProps}>
      <ToolButton
        ref={buttonRef}
        icon={icon}
        label={label}
        tip={flyout.hasFlyout ? undefined : tip}
        shortcut={shortcut}
        active={active}
        className={flyout.hasFlyout ? 'm3d-btn-flyout' : undefined}
        onClick={onClick}
      />
      {flyout.showing && (
        <DropdownSurface anchor={wrapRef.current} position={position} clampHeight={false} panelClassName="m3d-flyout">
          {rows.map((row) => (
            <button
              key={row.key}
              {...rowTip(row.description, row.shortcut)}
              className={`m3d-flyout-item${row.on ? ' m3d-on' : ''}`}
              onClick={() => {
                row.onSelect()
                flyout.close()
              }}
            >
              <UiIcon path={row.icon} />
              <span className="m3d-flyout-label">{row.label}</span>
            </button>
          ))}
          {trailing}
        </DropdownSurface>
      )}
    </div>
  )
}
