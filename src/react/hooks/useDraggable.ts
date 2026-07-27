import {
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useReducer,
  useRef,
} from 'react'
import type { DragPayload } from '../../core/DragRegistry'
import { useConfig, useMapContext } from '../context'
import { suppressNextClick } from './suppressNextClick'

export type UseDraggableOptions<T = unknown> = {
  /** Charge produite au démarrage du drag (type/id/data). */
  payload: DragPayload<T>
  /** Visuel accroché au curseur pendant le drag (défaut : rien). */
  ghost?: ReactNode
  /** Classe(s) CSS posées sur le ghost (échelle/style propres au consommateur). */
  ghostClassName?: string
  /** Désactive la prise (l'élément reste cliquable normalement). */
  disabled?: boolean
  /** Durée d'appui maintenu avant d'armer le drag (ms). Défaut `interaction.longPressMs`. */
  longPressMs?: number
  /**
   * Déplacement max toléré (px) pendant l'attente avant d'annuler l'armement.
   * Défaut `interaction.dragSlopPx` — réglable pour toute la carte à la fois, ce qui
   * évite d'avoir à le repasser sur chaque appel en contexte tactile.
   */
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
 *
 * **Sans destination, la prise ne s'arme pas.** Tant qu'aucune zone enregistrée
 * n'accepte la charge — typiquement une carte sans dock montée — le hook rend un
 * `onPointerDown` inerte et aucune classe : l'élément garde son clic et son
 * `touch-action` normaux. Sinon l'utilisateur obtiendrait un fantôme sous le
 * curseur et un relâchement sans effet, c'est-à-dire un geste qui a l'air cassé.
 */
export function useDraggable<T = unknown>(
  opts: UseDraggableOptions<T>,
): {
  onPointerDown: (e: ReactPointerEvent) => void
  className: string
} {
  const { engine } = useMapContext()
  const latest = useRef(opts)
  latest.current = opts
  const interaction = useConfig().interaction

  // Les zones se montent et se démontent indépendamment de cette source : il faut
  // réévaluer à chaque changement du registre, sinon la prise resterait éteinte
  // après l'arrivée d'une dock (ou allumée après son départ).
  const [, bumpZones] = useReducer((x: number) => x + 1, 0)
  useEffect(() => {
    // Bump d'entrée : une zone enregistrée AVANT cet abonnement (ordre de montage
    // des frères) n'émettra rien — sans ce rattrapage la prise resterait morte.
    bumpZones()
    return engine.drag.onZonesChange(bumpZones)
  }, [engine])
  const armed = !opts.disabled && engine.drag.acceptsAny(opts.payload)

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
      // Relu ici et pas seulement au rendu : une zone peut disparaître entre les deux.
      if (!engine.drag.acceptsAny(o.payload)) return

      const el = e.currentTarget as HTMLElement
      const startX = e.clientX
      const startY = e.clientY
      let x = startX
      let y = startY
      const slop = o.slop ?? interaction.dragSlopPx

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
        suppressNextClick(el, interaction.clickSuppressMs)
        engine.drag.begin(o.payload, o.ghost, x, y, o.ghostClassName)
      }, o.longPressMs ?? interaction.longPressMs)
    },
    [engine, interaction.clickSuppressMs, interaction.dragSlopPx, interaction.longPressMs],
  )

  // Pas de classe quand rien n'accepte : `touch-action:none` empêcherait le scroll
  // tactile au profit d'un geste qui ne peut de toute façon pas aboutir.
  return { onPointerDown, className: armed ? 'm3d-draggable' : '' }
}
