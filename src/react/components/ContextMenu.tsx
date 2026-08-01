import {
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react'
import { useConfig, useLabels } from '../context'
import { type PanelRef, useFitColumns, useMergedRefs, useNudgeInside } from './panelFit'

export type MenuItem =
  | { separator: true }
  | {
      icon?: ReactNode
      label: string
      /** Texte secondaire aligné à droite (compteur, valeur atteinte…). */
      hint?: ReactNode
      /** Pastille de couleur, occupe le slot d'icône quand `icon` est absent. */
      swatch?: string
      /** Item inerte : ni sélection, ni sous-menu, ni focus clavier. */
      disabled?: boolean
      /** Action destructive (suppression) : rendue en rouge, icône comprise. */
      danger?: boolean
      onSelect?: () => void
      /**
       * Sous-menu. La forme FONCTION est **synchrone** et n'est évaluée qu'à
       * l'ouverture du niveau : un menu à 12 entrées ne paie le calcul d'aucune
       * d'elles tant qu'on ne les ouvre pas, et rien ne peut partir en réseau
       * pendant un simple survol.
       */
      children?: MenuItem[] | (() => MenuItem[])
      separator?: false
    }

export type ContextMenuProps = {
  items: MenuItem[]
  header?: ReactNode
  onClose: () => void
  /** Classes en plus de `m3d-menu-panel` (variante d'ancrage : menu de ligne, etc.). */
  className?: string
  /**
   * Position du panneau. Le défaut CSS l'ancre au curseur ; un menu ouvert sous un
   * bouton précis (liste de markers) fournit ici ses `left`/`top` en px conteneur.
   */
  style?: CSSProperties
  /**
   * Accès au nœud du panneau. Nécessaire à un hôte qui gère lui-même la fermeture
   * au clic extérieur (`useDismiss` teste un `contains`) : sans ce ref, le clic sur
   * un item serait vu comme « dehors » et refermerait le menu avant l'action.
   */
  panelRef?: PanelRef
}

/**
 * Sous-menu ouvert : les enfants sont résolus UNE fois, à l'ouverture. `byKey` en fait
 * partie plutôt que d'être un état parallèle — les deux décrivent la même ouverture et
 * n'étaient jamais écrits séparément. Deux `useState` distincts laissaient au prochain
 * site qui referme un niveau la charge de penser aux deux setters, sans que le typage
 * ne le rappelle : l'affichage et le focus clavier auraient divergé en silence.
 */
type OpenState = { index: number; items: MenuItem[]; byKey: boolean }

type LevelProps = {
  items: MenuItem[]
  onClose: () => void
  /** Remonte d'un niveau (←) — absent au niveau racine. */
  onExit?: () => void
  /** Niveau ouvert au clavier : il prend le focus. Au survol, le focus ne bouge pas. */
  autoFocus?: boolean
}

const isActionable = (it: MenuItem): boolean => !it.separator && !it.disabled

const hasChildren = (it: MenuItem): boolean =>
  !it.separator && (typeof it.children === 'function' || !!it.children?.length)

const childrenOf = (it: MenuItem): MenuItem[] | null => {
  if (it.separator) return null
  const kids = typeof it.children === 'function' ? it.children() : it.children
  return kids && kids.length > 0 ? kids : null
}

/** Liste d'items d'un niveau (sans panneau) — récursif pour les sous-menus. */
function MenuLevel({ items, onClose, onExit, autoFocus }: LevelProps) {
  const hoverIntentMs = useConfig().interaction.menu.hoverIntentMs
  const labels = useLabels()
  const [open, setOpen] = useState<OpenState | null>(null)
  /** Item porteur du tabIndex (roving) — le focus ne bouge qu'au clavier. */
  const [active, setActive] = useState(() => items.findIndex(isActionable))
  const refs = useRef<(HTMLDivElement | null)[]>([])
  const hoverTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const cancelHover = useCallback(() => {
    if (hoverTimer.current === null) return
    clearTimeout(hoverTimer.current)
    hoverTimer.current = null
  }, [])

  // Un timer encore armé après démontage ouvrirait un sous-menu sur un niveau mort.
  useEffect(() => cancelHover, [cancelHover])

  const focusAt = useCallback((i: number) => {
    setActive(i)
    refs.current[i]?.focus({ preventScroll: true })
  }, [])

  useEffect(() => {
    if (!autoFocus) return
    const first = items.findIndex(isActionable)
    if (first >= 0) refs.current[first]?.focus({ preventScroll: true })
  }, [autoFocus, items])

  /** Déplace le focus au prochain item actionnable, en bouclant et en sautant séparateurs et items inertes. */
  const move = useCallback(
    (from: number, dir: 1 | -1) => {
      const n = items.length
      for (let k = 1; k <= n; k++) {
        const i = (((from + dir * k) % n) + n) % n
        if (isActionable(items[i]!)) {
          focusAt(i)
          return
        }
      }
    },
    [items, focusAt],
  )

  const openChildren = useCallback(
    (i: number, it: MenuItem, byKeyboard: boolean) => {
      cancelHover()
      const kids = childrenOf(it)
      // `byKey` : seul un niveau ouvert au clavier réclame le focus.
      setOpen(kids ? { index: i, items: kids, byKey: byKeyboard } : null)
    },
    [cancelHover],
  )

  const onKeyDown = (e: ReactKeyboardEvent<HTMLDivElement>, i: number, it: MenuItem) => {
    if (it.separator || it.disabled) return
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault()
        move(i, 1)
        break
      case 'ArrowUp':
        e.preventDefault()
        move(i, -1)
        break
      case 'ArrowRight':
        if (hasChildren(it)) {
          e.preventDefault()
          openChildren(i, it, true)
        }
        break
      case 'ArrowLeft':
        // Échap n'est PAS traité ici : il ferme le menu entier, comme aujourd'hui
        // (la couche hôte l'écoute au niveau window). ← est la remontée d'un cran.
        if (onExit) {
          e.preventDefault()
          onExit()
        }
        break
      case 'Enter':
      case ' ':
        e.preventDefault()
        if (hasChildren(it)) {
          openChildren(i, it, true)
          break
        }
        it.onSelect?.()
        onClose()
        break
    }
  }

  return (
    <>
      {items.map((it, i) => {
        if (it.separator) return <div className="m3d-menu-sep" key={`sep-${i}`} />
        const branch = hasChildren(it)
        const expanded = open?.index === i
        return (
          <div
            key={it.label + i}
            ref={(el) => {
              refs.current[i] = el
            }}
            className={it.danger ? 'm3d-menu-item m3d-danger' : 'm3d-menu-item'}
            role="menuitem"
            tabIndex={it.disabled || i !== active ? -1 : 0}
            aria-disabled={it.disabled || undefined}
            aria-haspopup={branch ? 'menu' : undefined}
            aria-expanded={branch ? expanded : undefined}
            // Ouvre le sous-menu au survol (après le délai d'intention) et ferme
            // les frères de même niveau.
            onPointerEnter={() => {
              cancelHover()
              if (it.disabled) return
              if (!branch) {
                setOpen(null)
                return
              }
              hoverTimer.current = setTimeout(() => openChildren(i, it, false), hoverIntentMs)
            }}
            onClick={(e) => {
              e.stopPropagation()
              if (it.disabled) return
              if (branch) {
                openChildren(i, it, false)
                return
              }
              it.onSelect?.()
              onClose()
            }}
            onKeyDown={(e) => onKeyDown(e, i, it)}
          >
            {it.icon ? (
              <span className="m3d-menu-icon">{it.icon}</span>
            ) : it.swatch ? (
              <span className="m3d-menu-icon">
                <span className="m3d-menu-swatch" style={{ background: it.swatch }} />
              </span>
            ) : null}
            <span className="m3d-menu-label">{it.label}</span>
            {it.hint != null && <span className="m3d-menu-hint">{it.hint}</span>}
            {branch && <span className="m3d-menu-arrow">{labels.glyphs.submenu}</span>}
            {expanded && (
              <SubMenu
                items={open.items}
                onClose={onClose}
                autoFocus={open.byKey}
                onExit={() => {
                  setOpen(null)
                  focusAt(i)
                }}
              />
            )}
          </div>
        )
      })}
    </>
  )
}

/**
 * Sous-menu d'un item : ouvert à droite du parent, il bascule à gauche (`m3d-flip`)
 * quand le bord du conteneur est trop proche — glisser par-dessus le parent
 * masquerait la ligne qu'on vient de survoler.
 */
function SubMenu({ items, onClose, onExit, autoFocus }: LevelProps) {
  const [flipped, setSub] = useNudgeInside(true)
  const ref = useMergedRefs(useFitColumns(), setSub)
  return (
    <div ref={ref} className={`m3d-menu-sub m3d-menu-panel${flipped ? ' m3d-flip' : ''}`} role="menu">
      <MenuLevel items={items} onClose={onClose} onExit={onExit} autoFocus={autoFocus} />
    </div>
  )
}

/** Menu contextuel arborescent (profondeur illimitée, ouverture au survol). */
export function ContextMenu({ items, header, onClose, className, style, panelRef }: ContextMenuProps) {
  // Ancré au curseur : il peut s'ouvrir n'importe où, y compris contre un bord.
  // Trop haut pour la carte, il s'étale en colonnes — un scroll clipperait les
  // sous-menus, qui sortent volontairement du panneau.
  const [, setNudge] = useNudgeInside()
  const fit = useMergedRefs(useFitColumns(), setNudge)
  const ref = useMergedRefs(fit, panelRef ?? noRef)
  return (
    <div
      ref={ref}
      className={`m3d-menu-panel${className ? ` ${className}` : ''}`}
      style={style}
      role="menu"
      // Un menu rendu en PORTAIL reste enfant de son ouvreur dans l'arbre React :
      // sans ces barrières, son clavier et ses clics remontent au gestionnaire de la
      // ligne qui l'a ouvert (qui cible le marker).
      onClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => e.stopPropagation()}
    >
      {header && <div className="m3d-menu-header">{header}</div>}
      <MenuLevel items={items} onClose={onClose} />
    </div>
  )
}

/** Ref inerte — évite un `useMergedRefs` conditionnel (règles des hooks). */
const noRef: PanelRef = () => {}

/**
 * Préfixe une action propre à la lib (« Cibler », « Supprimer »…) à un menu fourni par
 * l'hôte. Le **séparateur n'apparaît que si l'hôte fournit des entrées** : sans lui, la
 * seule action lib se retrouverait isolée sous un trait. Partagé par `MarkerList` (Cibler)
 * et le menu des symboles (`DrawLayer`, Supprimer) — même geste, une seule définition.
 */
export function prependMenuAction(lead: MenuItem, host: readonly MenuItem[]): MenuItem[] {
  return host.length > 0 ? [lead, { separator: true }, ...host] : [lead]
}
