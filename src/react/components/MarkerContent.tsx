import { type PointerEvent as ReactPointerEvent, type ReactNode, useEffect, useRef } from 'react'
import type { MarkerLayer as CoreMarkerLayer } from '../../layers/MarkerLayer'
import type { LatLng } from '../../shared'
import type { MarkerData } from '../../data/types'
import { useConfig } from '../context'
import { useDraggable } from '../hooks/useDraggable'
import { useRepositionable } from '../hooks/useRepositionable'

/**
 * Zone de contenu d'un marker/cluster : porte le clic (sélection/menu), le survol
 * (infobulle) et, pour les markers, la **saisie au long-press** (`useDraggable`).
 * Composant à part — et non `<div>` inline — parce que `useDraggable` est un hook :
 * chaque nœud a ainsi son propre état de geste (timer, nettoyage). Le hook est
 * toujours appelé (`disabled` selon `draggable`) pour respecter l'ordre des hooks.
 */
export function MarkerContent<T>({
  isMarker,
  draggable,
  repositionable,
  leaderLine,
  layer,
  onRepositionStart,
  onReposition,
  onRepositionMove,
  markerId,
  nodeKey,
  markerData,
  ghost,
  label,
  onClick,
  onHoverEnter,
  onHoverLeave,
  children,
}: {
  isMarker: boolean
  draggable: boolean
  repositionable: boolean
  /** La couche dessine-t-elle la tige + le point au sol ? Sans tige, le repositionnement retombe sur le contenu. */
  leaderLine: boolean
  layer: CoreMarkerLayer | null
  /** Le geste est devenu un déplacement (seuil franchi) — cf. `useRepositionable`. */
  onRepositionStart?: () => void
  onReposition?: (latLng: LatLng) => void
  onRepositionMove?: (latLng: LatLng) => void
  markerId: string | number
  /**
   * Clé du nœud dans la couche DOM. Distincte de `markerId` (l'id HÔTE, qui voyage
   * dans la charge du drag) : c'est elle que la couche connaît, donc la seule qui
   * permette de déplacer le bon nœud — une pastille de cluster n'a d'ailleurs pas
   * d'id hôte du tout.
   */
  nodeKey: string | number
  markerData: MarkerData<T> | null
  /** Vignette suivie par le curseur pendant une saisie. `null` si le nœud ne se saisit pas. */
  ghost: ReactNode
  /**
   * Ce qu'un lecteur d'écran annonce. Un marker est un pictogramme : sans lui, il
   * n'existe que pour la souris.
   */
  label?: string
  onClick: (e: React.MouseEvent | React.KeyboardEvent) => void
  onHoverEnter?: () => void
  onHoverLeave?: () => void
  children: ReactNode
}) {
  const drag = useDraggable({
    payload: { type: 'marker', id: markerId, data: markerData ?? undefined },
    ghost,
    disabled: !draggable,
  })
  // Comme `useDraggable` : toujours appelé, désactivé par `disabled`, pour ne pas
  // rompre l'ordre des hooks quand un marker devient (non) repositionnable.
  const move = useRepositionable({
    // La CLÉ DU NŒUD, pas l'id hôte : `moveItemNow` sur un id que la couche ne connaît
    // pas sort sans rien faire — le marker ne suivrait alors le curseur qu'au
    // relâchement, une fois les données de l'hôte mises à jour.
    id: nodeKey,
    layer,
    disabled: !repositionable,
    onStart: onRepositionStart,
    onMove: onRepositionMove,
    onDrop: onReposition,
  })
  /**
   * Le repositionnement est porté par le POINT AU SOL, pas par l'icône : déplacer un
   * marker consiste à déplacer son point d'ancrage (précis), tandis que l'icône garde
   * le geste commun à tous les markers — la saisie au long-press vers la dock.
   *
   * Le point est créé par la couche core (hors React) : le handler du hook lui est
   * donc attaché à la main. Il ne lit que `currentTarget`, `clientX/Y`, `pointerType`
   * et `button`, tous présents sur un `PointerEvent` natif.
   */
  const rootRef = useRef<HTMLDivElement>(null)
  /**
   * Sans tige (`leaderLine={false}`), il n'y a pas de point au sol : le geste
   * retombe alors sur le CONTENU, sinon le marker ne serait plus déplaçable du tout.
   *
   * DÉDUIT de la prop, pas sondé : la couche ne crée le point que si `leaderLine`
   * (cf. `layers/MarkerLayer.createNode`). Un `useState` posé depuis l'effet coûtait
   * un second rendu par marker repositionnable au montage — systématique pour les
   * symboles, qui le sont tous — et pouvait mentir si la sonde tombait avant que le
   * core n'ait bâti le nœud.
   */
  // Seuil tap/déplacement, commun avec le repositionnement — un tap sur le point sous ce
  // seuil vaut clic ; au-delà, c'est un drag (repositionnement) et le tap ne déclenche rien.
  const slop = useConfig().interaction.repositionSlopPx
  // Le point au sol est une cible de CLIC équivalente à l'icône (parité markers) : dès
  // qu'il y a une tige, taper la base sélectionne / ouvre le menu — et efface sous la
  // gomme, où l'icône n'est plus le seul point d'entrée. Le DRAG de repositionnement, lui,
  // reste conditionné à `repositionable` (sinon la base ne ferait que déplacer).
  useEffect(() => {
    if (!leaderLine) return
    // Le point est un FRÈRE du conteneur de portail, dans `.m3d-marker-anchor`.
    const dot = rootRef.current?.closest('.m3d-marker-anchor')?.querySelector<HTMLElement>('.m3d-marker-dot')
    if (!dot) return
    // TAP lu directement au pointeur (pointerup sans franchir le seuil), et NON via le
    // `click` natif : après un vrai drag, l'ordre des écouteurs capture/bulle d'un même
    // nœud n'est pas garanti, donc `suppressNextClick` ne pourrait pas fiablement l'avaler.
    // Ici un déplacement au-delà du seuil marque `moved` et le tap ne déclenche rien.
    const onTapDown = (e: PointerEvent) => {
      if (e.pointerType === 'mouse' && e.button !== 0) return
      const sx = e.clientX
      const sy = e.clientY
      let moved = false
      const onMove = (ev: PointerEvent) => {
        if (Math.abs(ev.clientX - sx) + Math.abs(ev.clientY - sy) > slop) moved = true
      }
      const cleanup = () => {
        window.removeEventListener('pointermove', onMove)
        window.removeEventListener('pointerup', onUp)
        window.removeEventListener('pointercancel', onCancel)
      }
      // Tap = relâché sans avoir franchi le seuil. `pointercancel` (geste volé) ne clique jamais.
      const onUp = (ev: PointerEvent) => {
        cleanup()
        if (!moved) onClickRef.current(ev as unknown as React.MouseEvent)
      }
      const onCancel = () => cleanup()
      window.addEventListener('pointermove', onMove)
      window.addEventListener('pointerup', onUp, { once: true })
      window.addEventListener('pointercancel', onCancel, { once: true })
    }
    // Repositionnement (drag) : co-attaché au point quand le marker est repositionnable.
    // Sur un drag, `onTapDown` voit `moved` et n'ouvre rien ; sur un tap, c'est l'inverse.
    const onReposDown = repositionable ? (e: PointerEvent) => moveRef.current(e as unknown as ReactPointerEvent) : null
    dot.classList.add(repositionable ? 'm3d-repositionable' : 'm3d-dot-hit')
    dot.addEventListener('pointerdown', onTapDown)
    if (onReposDown) dot.addEventListener('pointerdown', onReposDown)
    return () => {
      dot.classList.remove(repositionable ? 'm3d-repositionable' : 'm3d-dot-hit')
      dot.removeEventListener('pointerdown', onTapDown)
      if (onReposDown) dot.removeEventListener('pointerdown', onReposDown)
    }
  }, [leaderLine, repositionable, slop])

  const moveRef = useRef(move.onPointerDown)
  moveRef.current = move.onPointerDown
  // Lu par le détecteur de tap du point au sol (écouteurs attachés à la main) : via ref
  // pour ne pas ré-attacher à chaque changement d'identité de `onClick`.
  const onClickRef = useRef(onClick)
  onClickRef.current = onClick

  const className = [
    isMarker ? 'm3d-marker-content' : '',
    draggable ? drag.className : '',
    repositionable && !leaderLine ? move.className : '',
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <div
      ref={rootRef}
      className={className || undefined}
      // Un marker EST un bouton : il porte une action (sélectionner, ouvrir un menu,
      // zoomer sur un groupe). Sans rôle ni tabulation, il n'existe que pour la souris.
      role="button"
      tabIndex={0}
      aria-label={label}
      onPointerDown={repositionable && !leaderLine ? move.onPointerDown : draggable ? drag.onPointerDown : undefined}
      onClick={onClick}
      onKeyDown={(e) => {
        // Espace scrolle la page par défaut ; Entrée n'a pas d'effet natif sur un div,
        // mais les deux sont attendus sur `role="button"`.
        if (e.key !== 'Enter' && e.key !== ' ') return
        e.preventDefault()
        onClick(e)
      }}
      onPointerEnter={onHoverEnter}
      onPointerLeave={onHoverLeave}
      // L'infobulle est la seule information du marker : au clavier, elle doit suivre
      // le focus comme elle suit le survol, sinon elle reste inatteignable.
      onFocus={onHoverEnter}
      onBlur={onHoverLeave}
    >
      {children}
    </div>
  )
}
