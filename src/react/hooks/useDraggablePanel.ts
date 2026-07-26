import {
  type CSSProperties,
  type PointerEvent,
  type RefObject,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react'
import { clamp } from '../../core/math'
import { EDGE } from '../../style/panelGeometry'

/** Poignée de déplacement d'un panneau flottant (à épandre sur le bouton grip). */
export type GripProps = {
  onPointerDown: (e: PointerEvent<HTMLElement>) => void
  onPointerMove: (e: PointerEvent<HTMLElement>) => void
  onPointerUp: () => void
  onPointerCancel: () => void
}

export type DraggablePanel<E extends HTMLElement = HTMLDivElement> = {
  /** À poser sur le panneau déplacé (mesure + repositionnement). */
  panelRef: RefObject<E | null>
  /** Style de position : `pinned` prioritaire, sinon `defaultPos`, sinon défaut CSS. */
  style: CSSProperties | undefined
  /** À épandre sur la poignée (`<button {...gripProps}>`). */
  gripProps: GripProps
  /** true dès que l'utilisateur a épinglé le panneau (a cessé de suivre `defaultPos`). */
  pinned: boolean
  /** Ré-aimante le panneau à sa position par défaut (annule l'épinglage). */
  reset: () => void
}

/**
 * Mécanique d'un panneau flottant **déplaçable** : drag clampé au conteneur par
 * une poignée, position épinglée persistée, re-clamp au resize du conteneur
 * (`ResizeObserver`) — invariant des surfaces : un panneau épinglé reste DANS le
 * conteneur même quand celui-ci rétrécit. Partagé par `SelectionBadges` (panneau
 * de sélection) et `LensPanel` (inventaire de la loupe) — unique source de vérité
 * du geste, plus aucune duplication.
 *
 * `defaultPos` (px conteneur) positionne le panneau TANT QU'il n'est pas épinglé —
 * utile pour l'ancrer à un élément mobile (ex. le bord d'une zone). `undefined`
 * laisse la position par défaut au CSS jusqu'au premier drag.
 */
export function useDraggablePanel<E extends HTMLElement = HTMLDivElement>(
  defaultPos?: { x: number; y: number } | null,
): DraggablePanel<E> {
  const panelRef = useRef<E | null>(null)
  /** Géométrie capturée à la prise : plus AUCUNE lecture de layout par pointermove. */
  const dragRef = useRef<{ dx: number; dy: number; maxX: number; maxY: number; parentRect: DOMRect } | null>(null)
  /** Position épinglée par l'utilisateur (px conteneur) — null = suit `defaultPos`/CSS. */
  const [pinned, setPinned] = useState<{ x: number; y: number } | null>(null)

  const onPointerDown = (e: PointerEvent<HTMLElement>) => {
    const panel = panelRef.current
    const parent = panel?.offsetParent as HTMLElement | null
    if (!panel || !parent) return
    const rect = panel.getBoundingClientRect()
    const parentRect = parent.getBoundingClientRect()
    dragRef.current = {
      dx: e.clientX - rect.left,
      dy: e.clientY - rect.top,
      maxX: parentRect.width - rect.width - EDGE,
      maxY: parentRect.height - rect.height - EDGE,
      parentRect,
    }
    // Bascule vers left/top absolus dès la prise (repère stable, même position visuelle).
    panel.style.left = `${rect.left - parentRect.left}px`
    panel.style.top = `${rect.top - parentRect.top}px`
    panel.style.right = 'auto'
    try {
      e.currentTarget.setPointerCapture(e.pointerId)
    } catch {
      /* pointeur déjà relâché / non capturable */
    }
  }
  const onPointerMove = (e: PointerEvent<HTMLElement>) => {
    const drag = dragRef.current
    const panel = panelRef.current
    if (!drag || !panel) return
    panel.style.left = `${clamp(e.clientX - drag.parentRect.left - drag.dx, EDGE, drag.maxX)}px`
    panel.style.top = `${clamp(e.clientY - drag.parentRect.top - drag.dy, EDGE, drag.maxY)}px`
  }
  const onPointerUp = () => {
    const panel = panelRef.current
    if (!dragRef.current || !panel) return
    dragRef.current = null
    setPinned({ x: parseFloat(panel.style.left), y: parseFloat(panel.style.top) })
  }

  // Un panneau épinglé reste DANS le conteneur quand celui-ci rétrécit (re-clamp).
  useEffect(() => {
    if (!pinned) return
    const panel = panelRef.current
    const parent = panel?.offsetParent as HTMLElement | null
    if (!panel || !parent) return
    const ro = new ResizeObserver(() => {
      const rect = panel.getBoundingClientRect()
      const parentRect = parent.getBoundingClientRect()
      const x = clamp(pinned.x, EDGE, Math.max(EDGE, parentRect.width - rect.width - EDGE))
      const y = clamp(pinned.y, EDGE, Math.max(EDGE, parentRect.height - rect.height - EDGE))
      if (x !== pinned.x || y !== pinned.y) setPinned({ x, y })
    })
    ro.observe(parent)
    return () => ro.disconnect()
  }, [pinned])

  // Collision avec les bords : la position par défaut (non épinglée, ex. ancrée à
  // une zone) est ramenée DANS le conteneur, re-mesurée si le panneau grandit
  // (plus de lignes) ou si le conteneur est redimensionné.
  const [clamped, setClamped] = useState<{ x: number; y: number } | null>(null)
  useLayoutEffect(() => {
    if (pinned || !defaultPos) {
      setClamped(null)
      return
    }
    const panel = panelRef.current
    const parent = panel?.offsetParent as HTMLElement | null
    if (!panel || !parent) return
    const apply = () => {
      const pr = panel.getBoundingClientRect()
      const rr = parent.getBoundingClientRect()
      const x = clamp(defaultPos.x, EDGE, Math.max(EDGE, rr.width - pr.width - EDGE))
      const y = clamp(defaultPos.y, EDGE, Math.max(EDGE, rr.height - pr.height - EDGE))
      setClamped((prev) => (prev && prev.x === x && prev.y === y ? prev : { x, y }))
    }
    apply()
    const ro = new ResizeObserver(apply)
    ro.observe(panel)
    ro.observe(parent)
    return () => ro.disconnect()
  }, [defaultPos?.x, defaultPos?.y, pinned])

  const pos = pinned ?? clamped ?? defaultPos ?? null
  // right:auto obligatoire : sans lui, un `right` du CSS s'ajoute au left épinglé
  // sur un nœud recréé → conteneur étiré et panneau ramené à droite.
  const style = pos ? { left: pos.x, top: pos.y, right: 'auto' as const } : undefined

  return {
    panelRef,
    style,
    gripProps: { onPointerDown, onPointerMove, onPointerUp, onPointerCancel: onPointerUp },
    pinned: pinned !== null,
    reset: () => setPinned(null),
  }
}
