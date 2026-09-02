import { mdiClose, mdiCrosshairsGps, mdiDotsHorizontal, mdiEyeOffOutline } from '@mdi/js'
import { type ReactNode, useCallback, useId, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useMapContext } from '../context'
import { ContextMenu, type MenuItem } from './ContextMenu'
import { MapTooltip } from './MapTooltip'
import { useMergedRefs, useNudgeInside } from './panelFit'
import { UiIcon } from './UiIcon'
import { useDismiss } from './useDismiss'

/**
 * Item de menu « Cibler » — l'action de tête, IDENTIQUE sur toutes les lignes (marker,
 * tracé, forme). Défini une seule fois ici pour que `MarkerList` et `SelectionBadges` ne
 * le redéfinissent pas chacun (label + icône + comportement partagés).
 */
export function targetMenuItem(label: string, onSelect: () => void): MenuItem {
  return { label, icon: <UiIcon path={mdiCrosshairsGps} />, onSelect }
}

/**
 * Modèle d'UNE ligne sélectionnable — la brique commune à TOUT le panneau de
 * sélection et à la loupe. Marker, tracé, forme, enfant de cluster : même forme,
 * seul le CONTENU (icône, libellés, items du menu) varie, jamais la structure.
 *
 * Structure invariante : `[icône] titre / sous-titre · « … » · ✕`. Le « … »
 * n'apparaît que si `menu` porte des items, la ✕ que si `onDeselect` est fourni —
 * décidés ICI, une seule fois, pour que toutes les surfaces suivent la même règle.
 */
export type SelectionRowModel = {
  /** Clé stable de la ligne (clé React + ancrage du menu ouvert). */
  key: string | number
  /** Repère visuel : pastille de type, avatar, icône d'outil, pastille de couleur… */
  icon: ReactNode
  /** Titre (1ʳᵉ ligne). */
  title: ReactNode
  /** Teinte du titre (donnée hôte) — appliquée seulement si fournie. */
  titleColor?: string
  /** Sous-titre (2ᵉ ligne, plus petit) — masqué si absent/vide. */
  subtitle?: ReactNode
  /** Geste principal (clic sur la ligne) : cibler l'élément. Absent ⇒ ligne inerte. */
  onActivate?: () => void
  /** Items du menu « … » (déjà complets, « Cibler » compris). Vide/absent ⇒ pas de « … ». */
  menu?: MenuItem[]
  /** Libellé accessible du bouton « … ». */
  menuLabel?: string
  /** Désélection (croix ✕). Absent ⇒ pas de croix. */
  onDeselect?: () => void
  /** Libellé accessible de la croix ✕. */
  deselectLabel?: string
  /**
   * Le marker est listé mais RETIRÉ de la carte par le gate de zoom (`static` passé
   * sous son seuil). La ligne porte alors un œil barré — l'inventaire ne change pas,
   * il s'EXPLIQUE. Réservé à la loupe : la sélection élague ses masqués.
   */
  hidden?: boolean
  /** Tooltip/aria de l'œil barré (« Masqué au zoom actuel »). */
  hiddenLabel?: string
}

/**
 * Liste de lignes sélectionnables **partagée** (panneau de sélection + loupe).
 * Porte la mécanique commune du menu « … » : UN seul menu ouvert à la fois, rendu
 * en PORTAL dans `.m3d-root` (jamais rogné par le scroll de la liste), rabattu dans
 * le conteneur (`useNudgeInside`) et fermé au clic extérieur / molette / Échap.
 *
 * N'ajoute AUCUNE sémantique métier : les appelants (`MarkerList`, `SelectionBadges`)
 * construisent les `rows` et leurs menus. C'est le point de vérité UNIQUE du rendu
 * d'une ligne — d'où l'absence de tout markup de ligne ailleurs.
 */
export function SelectionList({ rows }: { rows: readonly SelectionRowModel[] }) {
  const { overlay, theme } = useMapContext()
  const root = overlay.parentElement
  // Une instance d'infobulle PAR liste (id unique), montée seulement s'il y a une ligne
  // masquée à expliquer. `react-tooltip` apparie ses ancres par cet id — cf. `MapTooltip`.
  const hiddenTipId = useId()
  const anyHidden = rows.some((r) => r.hidden)
  const [menu, setMenu] = useState<{ key: string | number; left: number; top: number } | null>(null)
  const closeMenu = useCallback(() => setMenu(null), [])
  // Le nœud du menu sert à DEUX choses : le rabattre dans le conteneur (nudge) et
  // décider si un clic tombe dedans (dismiss). D'où les deux refs fusionnées.
  const menuRef = useRef<HTMLDivElement | null>(null)
  const [, setNudge] = useNudgeInside()
  const setMenuEl = useMergedRefs(setNudge, (el) => {
    menuRef.current = el as HTMLDivElement | null
  })
  useDismiss(menuRef, menu !== null, closeMenu, { wheel: true, captureEscape: true })

  // Ouvert sous le bouton ; `useNudgeInside` le rabat DANS le conteneur après rendu,
  // sur sa hauteur RÉELLE mesurée — pas sur une estimation calée sur le CSS des items.
  const openMenu = (key: string | number, btn: HTMLElement) => {
    const rr = root?.getBoundingClientRect()
    if (!rr) return
    const r = btn.getBoundingClientRect()
    const width = theme.sizing.rowMenuW
    const edge = theme.spacing.edge
    const left = Math.min(r.right - rr.left - width, rr.width - width - edge)
    setMenu({ key, left: Math.max(edge, left), top: r.bottom - rr.top + theme.spacing.rowMenuGap })
  }

  return (
    <div className="m3d-mllist">
      {anyHidden && <MapTooltip id={hiddenTipId} place="left" />}
      {rows.map((row) => {
        const openItems = row.menu && row.menu.length > 0 ? row.menu : null
        return (
          // La ligne n'est pas elle-même un bouton : elle en CONTIENT (geste principal,
          // actions, désélection). Un contrôle focusable dans un contrôle focusable est
          // une imbrication invalide que les lecteurs d'écran aplatissent.
          <div key={row.key} className={row.hidden ? 'm3d-mlrow m3d-mlrow-hidden' : 'm3d-mlrow'}>
            <button type="button" className="m3d-mlmain" onClick={row.onActivate} disabled={!row.onActivate}>
              {row.icon}
              <div className="m3d-mltext">
                <span className="m3d-mltitle" style={row.titleColor ? { color: row.titleColor } : undefined}>
                  {row.title}
                </span>
                {row.subtitle != null && row.subtitle !== '' && <span className="m3d-mlsub">{row.subtitle}</span>}
              </div>
            </button>
            {row.hidden && (
              // Non focusable (role="img") : c'est un repère, pas une action. L'infobulle
              // passe par `<MapTooltip>` (data-tooltip-*, comme les barres), l'`aria-label`
              // la double pour les lecteurs d'écran.
              <span
                className="m3d-mlhidden"
                role="img"
                aria-label={row.hiddenLabel}
                data-tooltip-id={hiddenTipId}
                data-tooltip-content={row.hiddenLabel}
              >
                <UiIcon path={mdiEyeOffOutline} />
              </span>
            )}
            {openItems && (
              <button
                type="button"
                className="m3d-mlact"
                aria-haspopup="menu"
                aria-label={row.menuLabel}
                onPointerDown={(e) => e.stopPropagation()}
                onClick={(e) => {
                  e.stopPropagation()
                  if (menu?.key === row.key) closeMenu()
                  else openMenu(row.key, e.currentTarget)
                }}
              >
                <UiIcon path={mdiDotsHorizontal} />
              </button>
            )}
            {row.onDeselect && (
              <button
                type="button"
                className="m3d-mlremove"
                aria-label={row.deselectLabel}
                onPointerDown={(e) => e.stopPropagation()}
                onClick={(e) => {
                  e.stopPropagation()
                  row.onDeselect?.()
                }}
              >
                <UiIcon path={mdiClose} />
              </button>
            )}
            {openItems &&
              menu?.key === row.key &&
              root &&
              createPortal(
                <ContextMenu
                  items={openItems}
                  onClose={closeMenu}
                  className="m3d-mlmenu"
                  style={{ left: menu.left, top: menu.top }}
                  panelRef={setMenuEl}
                />,
                root,
              )}
          </div>
        )
      })}
    </div>
  )
}
