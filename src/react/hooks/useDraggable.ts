import { type PointerEvent as ReactPointerEvent, type ReactNode, useCallback, useEffect, useRef } from 'react'
import type { DragPayload } from '../../core/DragRegistry'
import { useMapContext } from '../context'

export type UseDraggableOptions<T = unknown> = {
  /** Charge produite au démarrage du drag (type/id/data). */
  payload: DragPayload<T>
  /** Visuel accroché au curseur pendant le drag (défaut : rien). */
  ghost?: ReactNode
  /** Classe(s) CSS posées sur le ghost (échelle/style propres au consommateur). */
  ghostClassName?: string
  /** Désactive la prise (l'élément reste cliquable normalement). */
  disabled?: boolean
  /** Durée d'appui maintenu avant d'armer le drag (ms). Défaut 250. */
  longPressMs?: number
  /** Déplacement max toléré (px) pendant l'attente avant d'annuler l'armement. Défaut 8. */
  slop?: number
}

/**
 * Rend un élément **saisissable au long-press** (souris et tactile unifiés) sans
 * casser son clic normal : un appui bref reste un clic, un appui maintenu ~250 ms
 * détache l'élément et démarre le drag géré par `DragOverlay`. Un léger mouvement
 * avant le délai annule l'armement (l'utilisateur voulait paner). Le clic
 * synthétique qui suivrait un drag est neutralisé.
 *
 * Le hook ne fait aucun suivi de pointeur après l'armement : `DragOverlay`
 * (listeners `window` permanents) pilote la suite jusqu'au dépôt. Étaler la
 * valeur de retour sur l'élément (`{...drag}`) ; la classe CSS `m3d-draggable`
 * pose `touch-action:none` pour que le geste tactile ne soit pas avalé par le scroll.
 */
export function useDraggable<T = unknown>(opts: UseDraggableOptions<T>): {
  onPointerDown: (e: ReactPointerEvent) => void
  className: string
} {
  const { engine } = useMapContext()
  const latest = useRef(opts)
  latest.current = opts

  // Timer d'armement + nettoyage des listeners temporaires (avant l'armement).
  const timer = useRef(0)
  const cleanup = useRef<(() => void) | null>(null)

  useEffect(
    () => () => {
      window.clearTimeout(timer.current)
      cleanup.current?.()
    },
    [],
  )

  const onPointerDown = useCallback(
    (e: ReactPointerEvent) => {
      const o = latest.current
      // Souris : bouton gauche uniquement. Tactile/stylet : tout appui.
      if (o.disabled || (e.pointerType === 'mouse' && e.button !== 0)) return

      const el = e.currentTarget as HTMLElement
      const startX = e.clientX
      const startY = e.clientY
      let x = startX
      let y = startY
      const slop = o.slop ?? 8

      const disarm = () => {
        window.clearTimeout(timer.current)
        cleanup.current?.()
        cleanup.current = null
      }

      const onMove = (ev: PointerEvent) => {
        x = ev.clientX
        y = ev.clientY
        // Mouvement franc avant le délai → l'utilisateur pane, pas de drag.
        if (Math.abs(x - startX) + Math.abs(y - startY) > slop) disarm()
      }
      const onUp = () => disarm() // relâché avant le délai → clic normal préservé.

      window.addEventListener('pointermove', onMove)
      window.addEventListener('pointerup', onUp, { once: true })
      window.addEventListener('pointercancel', onUp, { once: true })
      cleanup.current = () => {
        window.removeEventListener('pointermove', onMove)
        window.removeEventListener('pointerup', onUp)
        window.removeEventListener('pointercancel', onUp)
      }

      timer.current = window.setTimeout(() => {
        cleanup.current?.() // DragOverlay (listeners permanents) prend le relais.
        cleanup.current = null
        suppressNextClick(el)
        engine.drag.begin(o.payload, o.ghost, x, y, o.ghostClassName)
      }, o.longPressMs ?? 250)
    },
    [engine],
  )

  return { onPointerDown, className: 'm3d-draggable' }
}

/**
 * Neutralise le prochain `click` synthétisé après le `pointerup` d'un long-press
 * pour qu'il n'ouvre pas le popup du marker. Scopé à **l'élément source** (et non
 * `window`) : ce clic parasite n'existe que si down/up tombent sur cet élément —
 * un drag qui se relâche ailleurs ne synthétise aucun clic ici, donc aucun clic
 * sans rapport n'est jamais avalé. Auto-retiré au premier clic, filet temporel sinon.
 */
function suppressNextClick(el: HTMLElement): void {
  const suppress = (e: MouseEvent) => {
    e.stopPropagation()
    e.preventDefault()
    el.removeEventListener('click', suppress, true)
  }
  el.addEventListener('click', suppress, true)
  window.setTimeout(() => el.removeEventListener('click', suppress, true), 400)
}
