import {
  createContext,
  type ReactNode,
  type RefObject,
  useCallback,
  useContext,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from 'react'
import { createPortal } from 'react-dom'
import { useMapContext } from '../context'
import { useAnchoredPortal } from './panelFit'
import { plainKey } from './shortcuts'
import { ToolButton, type BarTip } from './ToolButton'
import { useDismiss } from './useDismiss'

/**
 * Pose un raccourci à lettre seule qui bascule un `Dropdown` via son `toggleRef`.
 *
 * Le même effet vivait, identique, dans « Couches » et « Templates ». `preventDefault`
 * est indispensable : sans lui, la lettre irait dans le champ de recherche que
 * l'ouverture focalise (autoFocus synchrone).
 */
export function useToggleShortcut(shortcut: string | false | undefined, toggleRef: RefObject<() => void>) {
  useEffect(() => {
    if (!shortcut) return
    const onKey = (e: KeyboardEvent) => {
      if (plainKey(e) !== shortcut) return
      e.preventDefault()
      toggleRef.current()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [shortcut, toggleRef])
}

/**
 * Registre d'exclusivité des surfaces déroulantes d'une carte.
 *
 * Il existe parce que rien ne le faisait : chacun des cinq panneaux de barre tenait son
 * propre `open` sans connaître les autres, si bien que le panneau de style et celui des
 * réglages s'ouvraient ensemble et se chevauchaient. Le symptôme visible était un « fond
 * différent » — deux surfaces à 92 % d'opacité empilées, chacune floutant l'autre.
 *
 * Un seul `id` ouvert à la fois. Les surfaces qui ne sont pas des menus mais occupent la
 * même région (les sous-menus de survol de la barre, l'infobulle d'un bouton) s'effacent
 * via `useYieldsToDropdown`.
 */
type DropdownRegistry = {
  openId: string | null
  /** Ouvre (et referme tout le reste), ou referme si `null`. */
  setOpenId: (id: string | null) => void
}

/**
 * Referme la surface ouverte, quelle qu'elle soit.
 *
 * Un seul point de fermeture globale : la barre qui se replie relâche déjà l'outil actif
 * et la loupe, elle relâche aussi ce qu'elle a d'ouvert. Le faire ici plutôt que dans
 * chaque surface évite qu'une nouvelle surface oublie de s'y raccrocher — et évite
 * surtout que `Dropdown` importe `useToolbar`, ce qui boucle (la barre le consomme).
 */
export function useCloseAnyDropdown(): () => void {
  const registry = useContext(DropdownContext)
  return useCallback(() => registry?.setOpenId(null), [registry])
}

const DropdownContext = createContext<DropdownRegistry | null>(null)

/**
 * Point d'inscription des surfaces FILLES d'un panneau (le sous-panneau qu'ouvre une de
 * ses lignes).
 *
 * Sans lui, `useDismiss` ne connaît que le déclencheur et le panneau : une surface
 * portée ailleurs dans le DOM passait pour « dehors », et le premier clic dedans
 * refermait tout — on pouvait la voir, jamais s'en servir. Chaque `DropdownSurface`
 * montée sous un `Dropdown` s'y inscrit d'elle-même ; l'appelant n'a rien à câbler.
 */
type SubSurfaceRegistry = { add: (ref: RefObject<HTMLElement | null>) => () => void }
const SubSurfaceContext = createContext<SubSurfaceRegistry | null>(null)

/** Monté par `<Map>` : le registre couvre TOUTES les barres, pas une seule. */
export function DropdownProvider({ children }: { children: ReactNode }) {
  const [openId, setOpenId] = useState<string | null>(null)
  const value = useMemo(() => ({ openId, setOpenId }), [openId])
  const { overlay } = useMapContext()
  // Marque la racine tant qu'une surface est ouverte : le CSS s'en sert pour éteindre
  // le survol des boutons de barre. Sinon survoler un outil pendant qu'un panneau est
  // ouvert allume un TROISIÈME bouton, à côté de l'outil actif et du bouton du panneau
  // — trois états visibles pour une seule intention.
  useEffect(() => {
    const root = overlay.parentElement
    if (!root) return
    root.classList.toggle('m3d-dropdown-open', openId !== null)
    return () => root.classList.remove('m3d-dropdown-open')
  }, [overlay, openId])
  return <DropdownContext.Provider value={value}>{children}</DropdownContext.Provider>
}

/**
 * Vrai dès qu'une surface déroulante est ouverte — pour que ce qui s'ouvre TOUT SEUL (un
 * sous-menu au survol, l'infobulle d'un bouton) libère la place au lieu de venir se poser
 * sur un panneau qu'on est en train de lire.
 */
export function useYieldsToDropdown(): boolean {
  return useContext(DropdownContext)?.openId != null
}

export type DropdownProps = {
  /** Chemin d'icône @mdi/js du déclencheur. Absent, seul `badge` habille le bouton. */
  icon?: string
  /** Libellé accessible du déclencheur — `aria-label` et contenu du tooltip. */
  label: string
  /** id du `<Tooltip>` partagé de la barre hôte. Absent = pas d'infobulle. */
  tip?: BarTip
  /** Touche affichée à la suite du libellé. */
  shortcut?: string | false
  /** Côté de la barre hôte : le panneau s'ouvre du côté opposé. */
  position?: 'left' | 'right'
  /** Hauteur maximale du panneau (clamp dans le conteneur). */
  maxHeight?: number
  /**
   * Bord du bouton sur lequel le panneau se cale. `'bottom'` pour un panneau qui
   * grandit vers le HAUT (bouton bas dans la barre). Défaut : `'top'`.
   */
  edge?: 'top' | 'bottom'
  /** Classes du bouton, en plus de `m3d-btn`. */
  buttonClassName?: string
  /** Classe de variante du panneau (largeur, padding) — le chrome vient de `m3d-panel`. */
  panelClassName?: string
  /** Contenu DANS le bouton après l'icône (badge de compteur) — ou tout son contenu
   *  quand `icon` est absent (l'aperçu des couleurs de la barre à dessin). */
  badge?: ReactNode
  /**
   * Rendu SANS sa propre carte `.m3d-controls-group` — pour cohabiter avec un autre
   * contrôle dans un groupe partagé de la barre.
   */
  grouped?: boolean
  /** Classe de l'enveloppe (racine), en plus de la carte éventuelle. */
  className?: string
  /** Notifié à chaque bascule — pour les surfaces qui doivent PUBLIER leur ouverture. */
  onOpenChange?: (open: boolean) => void
  /**
   * Raison SUPPLÉMENTAIRE d'enfoncer le bouton, combinée à l'ouverture (`active || open`) :
   * un panneau ouvert allume toujours son bouton, comme tous les menus. À fournir quand le
   * bouton doit rester allumé panneau FERMÉ — le filtre de tags s'allume parce qu'un filtre
   * est ACTIF, et reste cohérent avec les autres menus quand on l'ouvre sans filtre.
   */
  active?: boolean
  /**
   * Reçoit la bascule du panneau, pour les hôtes qui l'exposent au clavier. Un ref
   * plutôt qu'un retour : le raccourci est posé par un effet de l'hôte, qui ne doit pas
   * se réabonner à chaque rendu.
   */
  toggleRef?: RefObject<() => void>
  /** Contenu du panneau, monté seulement ouvert. Reçoit de quoi se refermer. */
  children: (close: () => void) => ReactNode
}

/**
 * Bouton de barre + son panneau déroulant : **le** composant de surface déroulante.
 *
 * Il remplace cinq copies du même montage (`useState` d'ouverture, `useDismiss`,
 * `useAnchoredPanel`, `aria-expanded`, `m3d-panel m3d-X m3d-{side}`) qui avaient déjà
 * divergé — le flyout de la barre d'outils avait perdu au passage sa fermeture au clic
 * extérieur ET son `aria-expanded`. Ce qui reste propre à chaque surface est sa
 * largeur, son padding et son contenu : le reste vit ici.
 */
export function Dropdown({
  icon,
  label,
  tip,
  shortcut,
  position = 'left',
  maxHeight,
  edge,
  buttonClassName,
  panelClassName,
  badge,
  grouped,
  className,
  onOpenChange,
  active,
  toggleRef,
  children,
}: DropdownProps) {
  const registry = useContext(DropdownContext)
  const id = useId()
  // Repli sur un état local hors provider : le composant reste utilisable seul (test,
  // usage hors `<Map>`), simplement sans exclusivité.
  const [localOpen, setLocalOpen] = useState(false)
  const open = registry ? registry.openId === id : localOpen

  const setOpen = useCallback(
    (next: boolean) => {
      if (registry) registry.setOpenId(next ? id : null)
      else setLocalOpen(next)
    },
    [registry, id],
  )
  const close = useCallback(() => setOpen(false), [setOpen])
  const rootRef = useRef<HTMLDivElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  // Les DEUX zones : le panneau est porté à la racine de la carte, donc il n'est plus
  // dans `rootRef`. Ne surveiller que le déclencheur refermerait le panneau au premier
  // clic dedans. Tableau stable (refs constantes) : `useDismiss` liste `zones` dans ses
  // deps, un littéral neuf par render réabonnerait ses listeners globaux à chaque render.
  const zones = useMemo(() => [rootRef, panelRef], [])
  // Surfaces filles montées à l'exécution : un `Set` de refs, résolu au moment du clic.
  // Initialisé PARESSEUSEMENT — `useRef(new Set())` alloue un `Set` à chaque render de
  // chaque `Dropdown` monté (la barre en compte cinq à six) pour aussitôt le jeter.
  const subsRef = useRef<Set<RefObject<HTMLElement | null>> | null>(null)
  subsRef.current ??= new Set<RefObject<HTMLElement | null>>()
  // Identité stable dès le premier render : les closures ci-dessous peuvent la capturer.
  const subs = subsRef.current
  const subRegistry = useMemo<SubSurfaceRegistry>(
    () => ({
      add: (ref) => {
        subs.add(ref)
        return () => {
          subs.delete(ref)
        }
      },
    }),
    [subs],
  )
  const also = useCallback(() => [...subs].map((r) => r.current), [subs])
  useDismiss(zones, open, close, { also })
  if (toggleRef) toggleRef.current = () => setOpen(!open)

  // Publié depuis un EFFET, pas pendant le clic : l'hôte (palette de symboles) réagit à
  // l'ouverture en chargeant son catalogue, ce qui ne doit pas se produire au milieu du
  // rendu qui l'ouvre.
  const notify = useRef(onOpenChange)
  notify.current = onOpenChange
  useEffect(() => {
    notify.current?.(open)
  }, [open])

  const wrap = [grouped ? null : 'm3d-controls-group', className].filter(Boolean).join(' ')
  return (
    <div className={wrap || undefined} ref={rootRef}>
      <ToolButton
        icon={icon}
        label={label}
        tip={tip}
        shortcut={shortcut}
        active={active || open}
        className={buttonClassName}
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        {badge}
      </ToolButton>
      {open && (
        <DropdownSurface
          anchor={rootRef.current}
          position={position}
          maxHeight={maxHeight}
          edge={edge}
          panelClassName={panelClassName}
          panelRef={panelRef}
        >
          <SubSurfaceContext.Provider value={subRegistry}>{children(close)}</SubSurfaceContext.Provider>
        </DropdownSurface>
      )}
    </div>
  )
}

/**
 * Le panneau — monté seulement ouvert, et **porté à la racine de la carte**.
 *
 * Le portail n'est pas une préférence d'implémentation : les barres portent
 * `backdrop-filter`, ce qui en fait des racines de fond. Rendu DANS sa barre, un
 * panneau ne peut flouter que la barre, jamais la carte — deux panneaux au CSS
 * identique n'avaient donc pas le même fond selon d'où ils sortaient. Sorti de la
 * barre, il floute la carte comme toutes les autres surfaces.
 */
export function DropdownSurface({
  anchor,
  position,
  maxHeight,
  edge,
  clampHeight,
  observeAnchor,
  panelClassName,
  panelRef,
  onPointerEnter,
  onPointerLeave,
  children,
}: {
  anchor: Element | null
  position: 'left' | 'right'
  maxHeight?: number
  edge?: 'top' | 'bottom'
  /**
   * `false` : ne pas borner la hauteur. Pour une surface sans zone scrollable (le
   * sous-menu de sélection), un `max-height` ne masquerait rien mais fausserait la
   * hauteur mesurée, donc le placement vertical.
   */
  clampHeight?: boolean
  /**
   * `false` : ancre mutée par frame (emprise d'une sélection) — placer une fois plutôt
   * que l'observer, pour ne pas déclencher un reflow par frame. L'hôte remonte la
   * surface (`key`) pour re-placer quand la cible change. Cf. `AnchoredOptions`.
   */
  observeAnchor?: boolean
  panelClassName?: string
  panelRef?: RefObject<HTMLDivElement | null>
  /** Survol de la surface elle-même — un sous-menu ouvert au survol doit rester ouvert
   *  tant que le pointeur est dessus. */
  onPointerEnter?: () => void
  onPointerLeave?: () => void
  children: ReactNode
}) {
  const { overlay } = useMapContext()
  const [side, setPanel] = useAnchoredPortal(anchor, position, { maxHeight, edge, clampHeight, observeAnchor })
  // Inscription auprès du panneau PARENT, s'il existe : c'est ce qui fait qu'un clic
  // ici ne compte pas comme un clic « dehors ». Sans registre au-dessus (surface montée
  // seule), l'effet ne fait rien.
  const parent = useContext(SubSurfaceContext)
  const selfRef = useRef<HTMLDivElement | null>(null)
  useEffect(() => parent?.add(selfRef), [parent])
  const host = overlay.parentElement
  if (!host) return null
  return createPortal(
    <div
      ref={(el) => {
        if (panelRef) panelRef.current = el
        selfRef.current = el
        setPanel(el)
      }}
      className={`m3d-panel m3d-dropdown${panelClassName ? ` ${panelClassName}` : ''} m3d-${side}`}
      onPointerEnter={onPointerEnter}
      onPointerLeave={onPointerLeave}
    >
      {children}
    </div>,
    host,
  )
}
