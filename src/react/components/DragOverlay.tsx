import { type ReactNode, useEffect, useState } from 'react'
import { useMapContext } from '../context'

type Ghost = { left: number; top: number; node: ReactNode; className?: string; over: boolean }

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

  // Reflet de l'état du registre → position/état du ghost (origine = conteneur carte).
  // L'origine du conteneur est invariante pendant un drag : on la mesure UNE fois
  // (au passage repos→actif) et on la réutilise à chaque `pointermove`, au lieu d'un
  // `getBoundingClientRect` (layout read) par mouvement.
  useEffect(() => {
    const root = overlay.parentElement
    let origin = { left: 0, top: 0 }
    const sync = () => {
      const s = engine.drag.active
      if (!s) {
        setGhost(null)
        root?.classList.remove('m3d-dragging')
        return
      }
      if (!root?.classList.contains('m3d-dragging')) {
        const rect = overlay.getBoundingClientRect()
        origin = { left: rect.left, top: rect.top }
        root?.classList.add('m3d-dragging')
      }
      setGhost({
        left: s.x - origin.left,
        top: s.y - origin.top,
        node: s.ghost as ReactNode,
        className: s.ghostClassName,
        over: s.overZone !== null,
      })
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
      className={`m3d-drag-ghost${ghost.over ? ' m3d-drag-over' : ''}${ghost.className ? ` ${ghost.className}` : ''}`}
      style={{ left: ghost.left, top: ghost.top }}
      aria-hidden
    >
      {ghost.node}
    </div>
  )
}
