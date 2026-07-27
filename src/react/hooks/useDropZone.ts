import { useEffect, useRef, useState } from 'react'
import type { DragPayload, DropPoint } from '../../core/DragRegistry'
import { useMapContext } from '../context'

export type UseDropZoneOptions = {
  /** Id unique de la zone (stable). Sert au hit-test (`data-m3d-drop`) et au routage. */
  id: string
  /** Charges recevables (absent = tout accepter). */
  accept?: (payload: DragPayload) => boolean
  /** Dépôt validé sur la zone, avec le point écran du relâchement (px client). */
  onDrop: (payload: DragPayload, point: DropPoint) => void
}

/**
 * Fait d'un élément une **zone de dépôt** du drag-and-drop. Étaler `dropProps`
 * sur l'élément cible : le marqueur `data-m3d-drop` permet à `DragOverlay` de
 * détecter la zone survolée par simple hit-test DOM (`elementFromPoint`), sans
 * jamais maintenir de rectangle écran — robuste au layout, resize et scroll.
 * `isOver` reflète le survol par une charge **acceptée** (retour visuel).
 */
export function useDropZone(opts: UseDropZoneOptions): {
  dropProps: { 'data-m3d-drop': string }
  isOver: boolean
} {
  const { engine } = useMapContext()
  const [isOver, setOver] = useState(false)
  const latest = useRef(opts)
  latest.current = opts

  // Enregistrement stable : les callbacks lisent `latest` → l'effet ne dépend que
  // de l'id, la zone n'est pas ré-enregistrée à chaque render.
  useEffect(() => {
    const id = latest.current.id
    return engine.drag.registerZone(id, {
      accept: (p) => (latest.current.accept ? latest.current.accept(p) : true),
      onDrop: (p, point) => latest.current.onDrop(p, point),
    })
  }, [engine, opts.id])

  // `isOver` dérivé de l'état courant : setOver ne re-render que sur transition
  // (React court-circuite une valeur identique), même si `onChange` est fréquent.
  useEffect(() => engine.drag.onChange(() => setOver(engine.drag.active?.overZone === latest.current.id)), [engine])

  return { dropProps: { 'data-m3d-drop': opts.id }, isOver }
}
