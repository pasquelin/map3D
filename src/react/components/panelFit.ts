import { useCallback, useLayoutEffect, useRef, useState } from 'react'
import { clamp } from '../../core/math'
// Même source que la feuille de styles : le CSS interpole ces valeurs, le calcul de
// place disponible les lit. Elles ne peuvent plus diverger.
import { EDGE, GAP } from '../../style/panelGeometry'

/**
 * Placement des surfaces flottantes (panneaux ancrés, flyouts, menus, listes de
 * résultats, barres d'outils) : toutes doivent rester DANS le conteneur de carte,
 * jamais coupées par un bord. Quatre hooks selon le mode d'ancrage, tous bâtis sur
 * le même socle (`usePlacement`) — la mesure, les bornes et la contrainte de
 * hauteur sont écrites une fois ici plutôt que par surface.
 *
 * Chacun rend une **callback ref** (et non un `RefObject`) : la plupart de ces
 * surfaces sont montées/démontées par un parent qui, lui, reste monté. Un objet
 * ref ne notifie pas ce montage — la callback, si, et le placement se rejoue à
 * chaque ouverture sans dépendance artificielle.
 */

/** Callback ref à poser sur la surface à placer (`ref={setEl}`). */
export type PanelRef = (el: HTMLElement | null) => void

/**
 * Compose deux callback refs sur un même élément (une surface qui cumule deux
 * comportements de placement). Arité fixe : un tableau de dépendances de longueur
 * variable est interdit par React.
 */
export function useMergedRefs(a: PanelRef, b: PanelRef): PanelRef {
  return useCallback(
    (el: HTMLElement | null) => {
      a(el)
      b(el)
    },
    [a, b],
  )
}

/**
 * Plancher de compactage d'une barre. Volontairement haut : les icônes ne sont pas
 * mises à l'échelle, un bouton beaucoup plus petit les rend illisibles. Le
 * compactage n'absorbe donc qu'un léger dépassement — au-delà, ce sont les
 * colonnes qui prennent le relais, jamais un rapetissement agressif.
 */
const BAR_MIN_SCALE = 0.85

/** Côté de la barre hôte = suffixe de classe (`m3d-right` → panneau ouvert à gauche). */
export type PanelSide = 'left' | 'right'

type Box = { top: number; bottom: number; left: number; right: number; width: number; height: number }

/** Conteneur de carte englobant, seul repère de placement (jamais le viewport). */
function rootOf(el: HTMLElement): HTMLElement | null {
  return el.closest('.m3d-root')
}

/**
 * Bornes de placement = le conteneur de carte, PAS le viewport : une carte
 * encadrée dans une page ne doit pas laisser ses panneaux déborder hors d'elle.
 * Hors carte (composants exportés seuls), le viewport sert de repli.
 */
function boundsOf(root: HTMLElement | null): Box {
  if (root) return root.getBoundingClientRect()
  return { top: 0, bottom: innerHeight, left: 0, right: innerWidth, width: innerWidth, height: innerHeight }
}

/**
 * Boîte de LAYOUT de `el` en coordonnées viewport : position et dimensions hors
 * transform propre. Les surfaces s'ouvrent sur une animation `scale()/translate()`
 * dont `getBoundingClientRect()` renverrait la géométrie transitoire — on mesure
 * donc via `offset*` (insensible au transform de l'élément), rebasé sur le rect de
 * l'offsetParent (qui, lui, doit inclure les transforms des ancêtres).
 */
function layoutBox(el: HTMLElement): Box {
  const p = el.offsetParent as HTMLElement | null
  const width = el.offsetWidth
  const height = el.offsetHeight
  if (!p) {
    const r = el.getBoundingClientRect()
    return { top: r.top, bottom: r.top + height, left: r.left, right: r.left + width, width, height }
  }
  const pr = p.getBoundingClientRect()
  // `offset*` part du padding-box de l'offsetParent : `client*` compense sa bordure.
  const left = pr.left + p.clientLeft - p.scrollLeft + el.offsetLeft
  const top = pr.top + p.clientTop - p.scrollTop + el.offsetTop
  return { top, bottom: top + height, left, right: left + width, width, height }
}

/**
 * Applique un `max-height` bornant la hauteur RENDUE à `avail`. Écrit deux fois si
 * nécessaire : `max-height` ne borne que la boîte de contenu en `box-sizing:content-box`
 * (le défaut ici), padding et bordure débordent encore — corriger sur `offsetHeight`
 * rend le calcul indépendant du box-sizing effectif.
 */
function fitHeight(el: HTMLElement, avail: number, cap = Number.POSITIVE_INFINITY): number {
  const write = (v: number) => {
    const px = `${Math.round(Math.max(0, v))}px`
    if (el.style.maxHeight !== px) el.style.maxHeight = px
  }
  const target = Math.min(cap, avail)
  write(target)
  let height = el.offsetHeight
  const over = height - avail
  if (over > 0) {
    write(target - over)
    height = el.offsetHeight
  }
  // Rendue à l'appelant : il en a besoin juste après, et la relire lui coûterait un
  // reflux de plus (le style vient d'être écrit).
  return height
}

/** Ce qu'un hook de placement installe une fois l'élément monté. */
type Placement = {
  /** Le placement lui-même, rejoué à chaque redimensionnement observé. */
  run: () => void
  /** Cibles supplémentaires à observer, en plus de l'élément et du conteneur. */
  targets?: Array<Element | null | undefined>
  /** Libère ce que le setup a alloué (boucle d'animation…). */
  cleanup?: () => void
}

/**
 * Socle des hooks de placement : garde l'élément monté, rejoue le placement quand
 * une cible observée change de taille, nettoie tout au démontage.
 *
 * Le conteneur est observé plutôt que la fenêtre : un `resize` de page le
 * redimensionne déjà (double notification inutile), et une carte à taille fixe n'a
 * pas de bornes qui bougent. Le listener `resize` ne sert qu'au repli hors carte,
 * où il n'y a pas de conteneur à observer.
 *
 * @param setup construit le placement pour un élément donné
 * @param deps  valeurs qui, en changeant, doivent le reconstruire
 * @param onRun reçoit le `run` installé, pour le rejouer hors redimensionnement
 */
function usePlacement(
  setup: (el: HTMLElement, root: HTMLElement | null) => Placement,
  deps: unknown[] = [],
  onRun?: (run: (() => void) | null) => void,
): PanelRef {
  const [el, setEl] = useState<HTMLElement | null>(null)

  useLayoutEffect(() => {
    if (!el) return
    const root = rootOf(el)
    const { run, targets = [], cleanup } = setup(el, root)
    onRun?.(run)
    run()
    const ro = new ResizeObserver(run)
    for (const t of [el, root, ...targets]) if (t) ro.observe(t)
    if (!root) addEventListener('resize', run)
    return () => {
      ro.disconnect()
      if (!root) removeEventListener('resize', run)
      cleanup?.()
      onRun?.(null)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [el, ...deps])

  return setEl
}

export type AnchoredOptions = {
  /** Décalage vertical souhaité par rapport au haut de l'ancre (px) — 0 = aligné. */
  desiredTop?: number
  /**
   * Bord de l'ancre sur lequel le CSS cale le panneau. `'bottom'` (ex. le panneau
   * Réglages, en `bottom:0`) le fait grandir vers le haut : le hook écrit alors
   * `bottom` et non `top`, pour ne pas se battre avec la feuille de style.
   */
  edge?: 'top' | 'bottom'
  /** Plafond de hauteur souhaité quand la place le permet (px). */
  maxHeight?: number
  /**
   * `false` : placer sans borner la hauteur. Pour une surface sans `overflow` (le
   * flyout de sélection n'en a pas), un `max-height` ne masquerait rien — le
   * contenu déborderait quand même — mais fausserait la hauteur mesurée, donc le
   * placement vertical. Ces surfaces sont courtes par construction.
   */
  clampHeight?: boolean
}

/**
 * Garde un panneau latéral ancré à un bouton (ou à une ligne) entièrement visible :
 *
 * - **hauteur** bornée à la place disponible — c'est la zone scrollable interne qui
 *   se réduit, aucune ligne n'est coupée ;
 * - **vertical** : position souhaitée d'abord, puis remontée/descente pour ne
 *   dépasser ni le haut ni le bas du conteneur ;
 * - **horizontal** : bascule du côté opposé si le côté demandé manque de place
 *   (conteneur étroit, barre proche d'un bord).
 *
 * Les styles sont mutés directement — pas de re-render, et l'écriture conditionnelle
 * évite les boucles de `ResizeObserver`.
 *
 * @param side côté de la barre hôte, préférence de départ
 * @returns `[côté effectif à appliquer en classe, callback ref du panneau]`
 */
export function useAnchoredPanel(
  side: PanelSide,
  { desiredTop = 0, edge = 'top', maxHeight, clampHeight = true }: AnchoredOptions = {},
): [PanelSide, PanelRef] {
  const [effective, setEffective] = useState<PanelSide>(side)
  // Le décalage change à chaque ligne survolée : le garder hors des dépendances
  // évite de reconstruire l'observation (et ses 3 `observe`) à chaque survol.
  const top = useRef(desiredTop)
  top.current = desiredTop
  const replace = useRef<(() => void) | null>(null)

  const ref = usePlacement(
    (el, root) => {
      const anchor = (el.offsetParent as HTMLElement | null) ?? el.parentElement
      const place = () => {
        if (!anchor) return
        const b = boundsOf(root)
        const a = anchor.getBoundingClientRect()

        // 1. Hauteur : le panneau ne peut pas être plus haut que le conteneur — sur
        //    une carte très courte il rétrécit plutôt que de déborder.
        const h = clampHeight ? fitHeight(el, Math.max(0, b.height - 2 * EDGE), maxHeight) : el.offsetHeight
        // Largeur lue AVANT l'écriture de l'étape 2 : après, elle coûterait un
        // reflux, et un décalage vertical ne peut pas la changer.
        const w = el.offsetWidth

        // 2. Vertical.
        const wanted = edge === 'bottom' ? a.bottom - h : a.top + top.current
        const y = clamp(wanted, b.top + EDGE, Math.max(b.top + EDGE, b.bottom - EDGE - h))
        const offset = edge === 'bottom' ? `${Math.round(a.bottom - y - h)}px` : `${Math.round(y - a.top)}px`
        if (el.style[edge] !== offset) el.style[edge] = offset

        // 3. Horizontal : `m3d-right` ouvre à gauche du bouton, `m3d-left` à droite.
        const room = (s: PanelSide) => (s === 'right' ? a.left - GAP - b.left : b.right - (a.right + GAP))
        const other: PanelSide = side === 'right' ? 'left' : 'right'
        // Comparé à `side` (la préférence), jamais au côté courant : pas d'oscillation.
        setEffective(room(side) >= w || room(side) >= room(other) ? side : other)
      }
      // L'ancre suffit : elle est enfant de la barre, donc toute recomposition de
      // celle-ci (compactage, bouton ajouté) la redimensionne ou la déplace aussi.
      return { run: place, targets: [anchor] }
    },
    [side, edge, maxHeight, clampHeight],
    (run) => {
      replace.current = run
    },
  )

  // Replacement seul quand la ligne d'ancrage change, sans reconstruire
  // l'observation : `desiredTop` varie à chaque ligne survolée du panneau Réglages.
  useLayoutEffect(() => {
    replace.current?.()
  }, [desiredTop])

  return [effective, ref]
}

/**
 * Borne la hauteur d'une surface qui ne peut pas bouger (elle est dans le flux ou
 * centrée par le CSS) : seule sa zone scrollable interne se réduit.
 *
 * @param mode `'dropdown'` = place restante SOUS la surface (liste déroulante sous
 *   un champ) ; `'centered'` = hauteur du conteneur (surface centrée verticalement).
 * @param cap  plafond souhaité quand la place le permet (px)
 * @returns la callback ref à poser sur la surface
 */
export function useFitHeight(mode: 'dropdown' | 'centered', cap?: number): PanelRef {
  return usePlacement(
    (el, root) => ({
      run: () => {
        const b = boundsOf(root)
        // 'dropdown' part de la position courante ; 'centered' ne le peut pas —
        // réduire une surface centrée la recentre, sa position n'est pas un point fixe.
        const avail = mode === 'dropdown' ? b.bottom - EDGE - layoutBox(el).top : b.height - 2 * EDGE
        fitHeight(el, Math.max(0, avail), cap)
      },
    }),
    [mode, cap],
  )
}

export type ColumnsOptions = {
  /**
   * `true` pour une surface que le CSS centre verticalement (`top:50%`) : le hook
   * réécrit son `top` pour la centrer sur l'espace réellement libre. À laisser
   * faux pour une surface ancrée à un point (menu au curseur), qu'un `top` écrit
   * décrocherait de son ancre.
   */
  recenter?: boolean
  /**
   * Surface ancrée à un bord que la barre ne doit pas recouvrir (la boîte de
   * recherche) : quand elle croise la barre, celle-ci démarre en dessous. Cherchée
   * DANS le conteneur — deux cartes sur une page ne doivent pas s'éviter l'une
   * l'autre — et re-résolue à chaque passe, l'obstacle pouvant être monté après.
   */
  avoid?: string
  /**
   * Variable CSS où publier la largeur mesurée, sur le conteneur. Le passage en
   * colonnes élargit la barre : les surfaces positionnées à côté d'elle (panneau
   * de style) doivent suivre plutôt que se faire recouvrir.
   */
  widthVar?: string
}

/**
 * Fait tenir dans le conteneur une surface en colonne qui ne peut PAS recevoir
 * d'`overflow` — barres d'outils (flyouts et panneaux en sortent) et menus
 * (sous-menus en sortent) : un scroll les clipperait. Deux temps :
 *
 * 1. **compactage** — `--m3d-bar-scale` réduit boutons, gaps et paddings des
 *    surfaces dont le CSS l'utilise (sans effet sur les autres) ;
 * 2. **colonnes** — si ça dépasse encore, `flex-wrap` étale la surface sur autant
 *    de colonnes que nécessaire, à parts égales.
 *
 * Rien n'est jamais coupé, au prix de la largeur.
 *
 * @returns la callback ref à poser sur la surface
 */
export function useFitColumns({ recenter = false, avoid, widthVar }: ColumnsOptions = {}): PanelRef {
  return usePlacement((el, root) => {
    const scope = root ?? document
    const fit = () => {
      const b = boundsOf(root)
      let top = b.top + EDGE
      const bottom = b.bottom - EDGE

      // Re-résolu à chaque passe : l'obstacle peut être monté après la barre, et un
      // `querySelector` est négligeable devant les mesures qui suivent.
      const obstacle = avoid !== undefined ? scope.querySelector(avoid) : null
      if (obstacle) {
        const o = obstacle.getBoundingClientRect()
        // `layoutBox` et non le rect : masquée, la drawbar est translatée hors
        // écran (`m3d-hidden`) et paraîtrait ne croiser personne.
        const box = layoutBox(el)
        // Obstacle pris en compte seulement s'il croise la barre horizontalement :
        // celle du bord opposé n'est jamais gênée.
        if (o.right > box.left && o.left < box.right && o.bottom > top) top = o.bottom + EDGE
      }

      const avail = Math.max(0, bottom - top)
      // Retour à l'état de référence (une colonne, échelle 1) avant de mesurer :
      // la hauteur naturelle n'est pas déductible d'une surface déjà contrainte.
      el.style.removeProperty('--m3d-bar-scale')
      el.style.removeProperty('flex-wrap')
      el.style.removeProperty('max-height')
      const natural = el.offsetHeight

      if (natural > avail) {
        el.style.setProperty('--m3d-bar-scale', String(Math.round(clamp(avail / natural, BAR_MIN_SCALE, 1) * 1000) / 1000))
        // Bordures et marges fixes ne se compactent pas : la hauteur réelle peut
        // rester au-dessus de la cible même à l'échelle calculée.
        if (el.offsetHeight > avail) {
          // Colonnes ÉQUILIBRÉES : `flex-wrap` remplit gloutonnement, ce qui donnerait
          // une colonne pleine et une avec un seul item. Viser `hauteur / nb colonnes`
          // répartit les items à parts égales.
          el.style.flexWrap = 'wrap'
          const height = el.offsetHeight
          const columns = Math.max(2, Math.ceil(height / avail))
          // `fitHeight` et non un `max-height` brut : sans la correction box-sizing,
          // le padding et la bordure débordent encore de la zone.
          fitHeight(el, Math.min(avail, Math.ceil(height / columns)))
        }
      }

      // Recentrage APRÈS le compactage : la hauteur à placer est celle qu'on vient
      // d'obtenir, pas la naturelle.
      //
      // La cible est le milieu du CONTENEUR, pas celui de la zone libre : amputer la
      // zone d'un obstacle en haut (la boîte de recherche) sans obstacle en bas
      // descendait la barre de la moitié de cet obstacle — visiblement désalignée de
      // la colonne opposée, qui n'est jamais gênée et reste, elle, au centre. On ne
      // s'écarte du centre que si la barre ne tient pas : le `clamp` ne mord alors
      // que de ce qu'il faut pour dégager l'obstacle.
      if (recenter) {
        const half = el.offsetHeight / 2
        const center = clamp((b.top + b.bottom) / 2, top + half, Math.max(top + half, bottom - half))
        const wanted = `${Math.round(center - b.top)}px`
        // Le CSS pose `translateY(-50%)` : cette valeur est un CENTRE, pas un bord.
        if (el.style.top !== wanted) el.style.top = wanted
      }
      // Largeur publiée après placement : les colonnes l'ont peut-être doublée.
      if (widthVar) root?.style.setProperty(widthVar, `${Math.round(el.offsetWidth)}px`)
    }
    // L'obstacle présent au montage est observé : la liste de résultats qui s'ouvre
    // agrandit la boîte de recherche, la barre doit se recaler.
    return { run: fit, targets: [avoid !== undefined ? scope.querySelector(avoid) : null] }
  }, [recenter, avoid, widthVar])
}

/**
 * Rabat une surface ancrée à un point libre (menu contextuel ouvert au curseur,
 * sous-menu) dans le conteneur, par marges correctives — pas de `transform`, qui
 * appartient à l'animation d'ouverture, ni de `max-height`, qui exigerait un
 * `overflow` clippant les sous-menus.
 *
 * @param flipX bascule la surface de l'autre côté de son parent (classe renvoyée)
 *   au lieu de la faire glisser par-dessus lui — comportement des sous-menus.
 * @returns `[surface à ouvrir du côté opposé (classe `m3d-flip`), callback ref]`
 */
export function useNudgeInside(flipX = false): [boolean, PanelRef] {
  const [flipped, setFlipped] = useState(false)

  const ref = usePlacement(
    (el, root) => {
      // Marges déjà posées, mémorisées plutôt que remises à zéro avant chaque
      // mesure : ce reset invaliderait le layout et coûterait un reflux de plus.
      const applied = { x: 0, y: 0 }
      const nudge = () => {
        // TOUTES les lectures d'abord, écritures ensuite : intercaler l'une force un
        // reflux, et cette fonction tourne à chaque frame de mouvement de la carte.
        const b = boundsOf(root)
        const box = layoutBox(el)
        const p = el.offsetParent as HTMLElement | null
        const pr = flipX ? p?.getBoundingClientRect() : undefined
        const refTop = box.top - applied.y
        const refBottom = box.bottom - applied.y

        // Débordement bas d'abord, puis haut : d'une surface plus haute que le
        // conteneur, mieux vaut montrer le début que la fin.
        let dy = Math.min(0, b.bottom - EDGE - refBottom)
        dy += Math.max(0, b.top + EDGE - (refTop + dy))
        dy = Math.round(dy)
        if (dy !== applied.y) {
          applied.y = dy
          el.style.marginTop = `${dy}px`
        }

        if (flipX) {
          // Verdict mesuré sur la place autour de l'ANCRE, jamais sur la position
          // courante de la surface : basculée, elle rentrerait — et rebasculerait au
          // calcul suivant, indéfiniment.
          if (!pr || !p) return
          const anchorLeft = pr.left + p.clientLeft
          const roomRight = b.right - EDGE - (anchorLeft + p.clientWidth)
          const roomLeft = anchorLeft - (b.left + EDGE)
          setFlipped(roomRight < box.width && roomLeft >= box.width)
          return
        }
        const refLeft = box.left - applied.x
        let dx = Math.min(0, b.right - EDGE - (refLeft + box.width))
        dx += Math.max(0, b.left + EDGE - (refLeft + dx))
        dx = Math.round(dx)
        if (dx !== applied.x) {
          applied.x = dx
          el.style.marginLeft = `${dx}px`
        }
      }

      // Ces surfaces sont ancrées à un objet 3D que le moteur repositionne à chaque
      // frame. Le déplacement passe par le `transform` inline des nœuds ancêtres :
      // le comparer est une simple lecture de propriété, sans reflux — contrairement
      // à une mesure de rect, qui en coûterait un par frame même carte immobile.
      const movers: HTMLElement[] = []
      for (let n = el.parentElement; n && n !== root; n = n.parentElement) movers.push(n)
      let frame = 0
      let last = ''
      const follow = () => {
        const key = movers.map((m) => m.style.transform).join('|')
        if (key !== last) {
          last = key
          nudge()
        }
        frame = requestAnimationFrame(follow)
      }
      frame = requestAnimationFrame(follow)
      return { run: nudge, cleanup: () => cancelAnimationFrame(frame) }
    },
    [flipX],
  )

  return [flipped, ref]
}
