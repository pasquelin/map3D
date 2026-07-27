import { mdiClose } from '@mdi/js'
import { UiIcon } from './UiIcon'
import { type CSSProperties, type PointerEvent, useRef } from 'react'
import { WHEEL_SURFACE_ATTR } from '../../core/MapEngine'
import { useConfig } from '../context'
import type { LensRect } from './lensTypes'

/** Poignée de manipulation : déplacement du corps ou redimensionnement par bord/coin. */
type HandleId = 'move' | 'n' | 's' | 'e' | 'w' | 'nw' | 'ne' | 'se' | 'sw'

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
 *  côté minimal garanti (`min`, cf. `interaction.lens.minSizePx`) : pas de retournement. */
function applyHandle(id: HandleId, s: LensRect, dx: number, dy: number, min: number): LensRect {
  if (id === 'move') return { x: s.x + dx, y: s.y + dy, w: s.w, h: s.h }
  let { x, y, w, h } = s
  if (id.includes('e')) w = Math.max(min, s.w + dx)
  if (id.includes('w')) {
    w = Math.max(min, s.w - dx)
    x = s.x + (s.w - w)
  }
  if (id.includes('s')) h = Math.max(min, s.h + dy)
  if (id.includes('n')) {
    h = Math.max(min, s.h - dy)
    y = s.y + (s.h - h)
  }
  return { x, y, w, h }
}

export type LensZoneProps = {
  rect: LensRect
  onChange?: (rect: LensRect) => void
  onClose?: () => void
  closeLabel?: string
  /** Aperçu (pendant le glissé) : cadre seul, sans poignées ni croix, non interactif. */
  preview?: boolean
}

/** Cadre marching-ants : fond + trait continu sous un pointillé animé. Rendu avec
 *  les classes `.m3d-marquee-under` / `.m3d-marquee` du sélecteur — MÊMES règles
 *  CSS, donc même trait, même cadence et même thème (`--m3d-marquee-*`) sans
 *  duplication : seule la géométrie diffère (`<rect>` ici, `<path>` là-bas). */
function AntsFrame({ rect }: { rect: LensRect }) {
  const x = 1
  const y = 1
  const w = Math.max(0, rect.w - 2)
  const h = Math.max(0, rect.h - 2)
  return (
    <svg className="m3d-lenszone-svg" aria-hidden>
      <rect className="m3d-marquee-under" x={x} y={y} width={w} height={h} rx={4} />
      <rect className="m3d-marquee" x={x} y={y} width={w} height={h} rx={4} />
    </svg>
  )
}

/**
 * Rectangle de la loupe : déplaçable (drag du corps), redimensionnable (8
 * poignées), retirable (croix). Cadre marching-ants façon marquee de sélection.
 * Rendu en overlay DOM 2D dans `.m3d-root` — pas de drapage 3D : la zone est une
 * fenêtre d'inspection **écran**, l'inventaire se recalcule quand la carte défile
 * dessous. `preview` (glissé en cours) n'affiche que le cadre (non interactif).
 *
 * NB : le resize/déplacement est recodé ici (écran 2D) plutôt que délégué à
 * `EditController`/`SelectionOverlay` — ceux-ci sont géo-ancrés (ENU) et rotables,
 * ce qui contredirait la « fenêtre écran » (choix délibéré). Seul le visuel est
 * mutualisé, via les variables `--m3d-marquee-*`.
 */
export function LensZone({ rect, onChange, onClose, closeLabel, preview }: LensZoneProps) {
  const zoneRef = useRef<HTMLDivElement>(null)
  const dragRef = useRef<{ id: HandleId; sx: number; sy: number; start: LensRect } | null>(null)
  const minSize = useConfig().interaction.lens.minSizePx

  const begin = (id: HandleId) => (e: PointerEvent<HTMLElement>) => {
    e.stopPropagation()
    dragRef.current = { id, sx: e.clientX, sy: e.clientY, start: rect }
    // Capture sur la zone : tous les move/up suivants y retombent (poignée ou corps).
    zoneRef.current?.setPointerCapture(e.pointerId)
  }
  const move = (e: PointerEvent<HTMLElement>) => {
    const d = dragRef.current
    if (!d) return
    onChange?.(applyHandle(d.id, d.start, e.clientX - d.sx, e.clientY - d.sy, minSize))
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

  // Aperçu (glissé) : cadre seul, non interactif (les handlers ne tirent pas —
  // `.m3d-lenszone-preview` est en pointer-events:none).
  return (
    <div
      ref={zoneRef}
      className={`m3d-lenszone${preview ? ' m3d-lenszone-preview' : ''}`}
      // Surface carte : la molette au-dessus de la zone zoome la carte dessous.
      {...{ [WHEEL_SURFACE_ATTR]: '' }}
      style={{ left: rect.x, top: rect.y, width: rect.w, height: rect.h }}
      onPointerDown={begin('move')}
      onPointerMove={move}
      onPointerUp={end}
      onPointerCancel={end}
    >
      <AntsFrame rect={rect} />
      {!preview && (
        <>
          <button
            type="button"
            className="m3d-lenszone-x"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={onClose}
            aria-label={closeLabel}
          >
            <UiIcon path={mdiClose} />
          </button>
          {HANDLES.map((hd) => {
            const style: CSSProperties = { left: `${hd.left}%`, top: `${hd.top}%`, cursor: hd.cursor }
            return <span key={hd.id} className="m3d-lenszone-h" style={style} onPointerDown={begin(hd.id)} />
          })}
        </>
      )}
    </div>
  )
}
