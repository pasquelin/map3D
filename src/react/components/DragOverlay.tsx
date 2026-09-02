import { type ReactNode, useEffect, useRef, useState } from 'react'
import { useMapContext } from '../context'

type Ghost = { node: ReactNode; className?: string; over: boolean }

/**
 * Contrôleur global du drag-and-drop, monté une fois par `<Map>` : il pilote le
 * `DragRegistry` de bout en bout à partir des événements pointeur `window` et
 * rend le **ghost** accroché au curseur. La zone de dépôt survolée est trouvée
 * par **hit-test DOM** (`elementFromPoint` → `data-m3d-drop`), le ghost étant
 * transparent aux événements (`pointer-events:none`) — aucun rectangle écran à
 * maintenir, robuste au layout.
 *
 * Les listeners sont **permanents** (early-return hors drag) : aucun `pointermove`
 * n'est perdu dans la fenêtre entre l'armement (`useDraggable`) et le premier
 * effet, ce qu'un attachement conditionnel ne garantirait pas.
 */
export function DragOverlay() {
  const { engine, overlay } = useMapContext()
  const [ghost, setGhost] = useState<Ghost | null>(null)
  /**
   * Position écrite DIRECTEMENT sur le nœud du ghost à chaque mouvement ; le state ne
   * porte que ce qui change rarement (charge, classe, zone survolée). Un `setState`
   * par `pointermove` re-rendait le ghost — et sa charge, souvent un marker complet —
   * à la cadence du pointeur, pour déplacer une boîte.
   */
  const ghostElRef = useRef<HTMLDivElement | null>(null)
  const ghostPosRef = useRef({ left: 0, top: 0 })
  const placeGhost = (el: HTMLDivElement) => {
    el.style.left = `${ghostPosRef.current.left}px`
    el.style.top = `${ghostPosRef.current.top}px`
  }
  // Callback ref : le ghost naît au premier `sync` (le state le monte), donc il doit se
  // placer d'elle-même à son apparition.
  const attachGhost = (el: HTMLDivElement | null) => {
    ghostElRef.current = el
    if (el) placeGhost(el)
  }

  // Reflet de l'état du registre → position/état du ghost (origine = conteneur carte).
  // L'origine du conteneur est invariante pendant un drag : on la mesure UNE fois
  // (au passage repos→actif) et on la réutilise à chaque `pointermove`, au lieu d'un
  // `getBoundingClientRect` (layout read) par mouvement.
  useEffect(() => {
    const root = overlay.parentElement
    let origin = { left: 0, top: 0 }
    let last: Ghost | null = null
    const sync = () => {
      const s = engine.drag.active
      if (!s) {
        last = null
        setGhost(null)
        root?.classList.remove('m3d-dragging')
        return
      }
      if (!root?.classList.contains('m3d-dragging')) {
        const rect = overlay.getBoundingClientRect()
        origin = { left: rect.left, top: rect.top }
        root?.classList.add('m3d-dragging')
      }
      ghostPosRef.current = { left: s.x - origin.left, top: s.y - origin.top }
      if (ghostElRef.current) placeGhost(ghostElRef.current)
      const node = s.ghost as ReactNode
      const over = s.overZone !== null
      // Rendu React seulement quand la charge, sa classe ou la zone survolée changent.
      if (last && last.node === node && last.className === s.ghostClassName && last.over === over) return
      last = { node, className: s.ghostClassName, over }
      setGhost(last)
    }
    return engine.drag.onChange(sync)
  }, [engine, overlay])

  // Suivi pointeur + hit-test + dépôt. Permanent : ne fait rien hors drag.
  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      if (!engine.drag.active) return
      const el = document.elementFromPoint(e.clientX, e.clientY)
      const zone = (el?.closest('[data-m3d-drop]') as HTMLElement | null)?.getAttribute('data-m3d-drop') ?? null
      engine.drag.move(e.clientX, e.clientY, zone)
    }
    const onUp = () => {
      if (engine.drag.active) engine.drag.end()
    }
    // Pas de garde « carte active » (cf. `activeMap.ts`) : un drag appartient à UN
    // registre, `engine.drag.active` suffit à ne toucher que la carte concernée.
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && engine.drag.active) engine.drag.cancel()
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('keydown', onKey)
    }
  }, [engine])

  if (!ghost) return null
  return (
    <div
      ref={attachGhost}
      className={`m3d-drag-ghost${ghost.over ? ' m3d-drag-over' : ''}${ghost.className ? ` ${ghost.className}` : ''}`}
      aria-hidden
    >
      {ghost.node}
    </div>
  )
}
