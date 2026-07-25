import { mdiClose } from '@mdi/js'
import Icon from '@mdi/react'
import { type CSSProperties, type PointerEvent, useRef } from 'react'
import type { LensRect } from './lensTypes'

/** Poignée de manipulation : déplacement du corps ou redimensionnement par bord/coin. */
type HandleId = 'move' | 'n' | 's' | 'e' | 'w' | 'nw' | 'ne' | 'se' | 'sw'

/** Côté minimal de la zone (px) — en deçà, le redimensionnement est bloqué. */
const MIN = 28

const HANDLES: { id: HandleId; left: number; top: number; cursor: string }[] = [
  { id: 'nw', left: 0, top: 0, cursor: 'nwse-resize' },
  { id: 'n', left: 50, top: 0, cursor: 'ns-resize' },
  { id: 'ne', left: 100, top: 0, cursor: 'nesw-resize' },
  { id: 'e', left: 100, top: 50, cursor: 'ew-resize' },
  { id: 'se', left: 100, top: 100, cursor: 'nwse-resize' },
  { id: 's', left: 50, top: 100, cursor: 'ns-resize' },
  { id: 'sw', left: 0, top: 100, cursor: 'nesw-resize' },
  { id: 'w', left: 0, top: 50, cursor: 'ew-resize' },
]

/** Applique un geste (delta px depuis la prise) au rectangle — bord opposé figé,
 *  côté minimal garanti (pas de retournement). */
function applyHandle(id: HandleId, s: LensRect, dx: number, dy: number): LensRect {
  if (id === 'move') return { x: s.x + dx, y: s.y + dy, w: s.w, h: s.h }
  let { x, y, w, h } = s
  if (id.includes('e')) w = Math.max(MIN, s.w + dx)
  if (id.includes('w')) {
    w = Math.max(MIN, s.w - dx)
    x = s.x + (s.w - w)
  }
  if (id.includes('s')) h = Math.max(MIN, s.h + dy)
  if (id.includes('n')) {
    h = Math.max(MIN, s.h - dy)
    y = s.y + (s.h - h)
  }
  return { x, y, w, h }
}

export type LensZoneProps = {
  rect: LensRect
  onChange: (rect: LensRect) => void
  onClose: () => void
  closeLabel: string
}

/**
 * Rectangle de la loupe : déplaçable (drag du corps), redimensionnable (8
 * poignées), retirable (croix). Rendu en overlay DOM 2D dans `.m3d-root` — pas de
 * drapage 3D : la zone est une fenêtre d'inspection écran, l'inventaire se
 * recalcule quand la carte défile dessous.
 */
export function LensZone({ rect, onChange, onClose, closeLabel }: LensZoneProps) {
  const zoneRef = useRef<HTMLDivElement>(null)
  const dragRef = useRef<{ id: HandleId; sx: number; sy: number; start: LensRect } | null>(null)

  const begin = (id: HandleId) => (e: PointerEvent<HTMLElement>) => {
    e.stopPropagation()
    dragRef.current = { id, sx: e.clientX, sy: e.clientY, start: rect }
    // Capture sur la zone : tous les move/up suivants y retombent (poignée ou corps).
    zoneRef.current?.setPointerCapture(e.pointerId)
  }
  const move = (e: PointerEvent<HTMLElement>) => {
    const d = dragRef.current
    if (!d) return
    onChange(applyHandle(d.id, d.start, e.clientX - d.sx, e.clientY - d.sy))
  }
  const end = (e: PointerEvent<HTMLElement>) => {
    if (!dragRef.current) return
    dragRef.current = null
    try {
      zoneRef.current?.releasePointerCapture(e.pointerId)
    } catch {
      /* pointer déjà relâché */
    }
  }

  return (
    <div
      ref={zoneRef}
      className="m3d-lenszone"
      style={{ left: rect.x, top: rect.y, width: rect.w, height: rect.h }}
      onPointerDown={begin('move')}
      onPointerMove={move}
      onPointerUp={end}
      onPointerCancel={end}
    >
      <button
        type="button"
        className="m3d-lenszone-x"
        onPointerDown={(e) => e.stopPropagation()}
        onClick={onClose}
        aria-label={closeLabel}
      >
        <Icon path={mdiClose} size={0.6} />
      </button>
      {HANDLES.map((hd) => {
        const style: CSSProperties = { left: `${hd.left}%`, top: `${hd.top}%`, cursor: hd.cursor }
        return <span key={hd.id} className="m3d-lenszone-h" style={style} onPointerDown={begin(hd.id)} />
      })}
    </div>
  )
}
