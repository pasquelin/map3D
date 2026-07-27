import { type PointerEvent as ReactPointerEvent, useCallback, useEffect, useRef } from 'react'
import type { MarkerLayer as CoreMarkerLayer } from '../../layers/MarkerLayer'
import type { LatLng } from '../../shared'
import { useConfig, useMapContext } from '../context'
import { suppressNextClick } from './suppressNextClick'

export type UseRepositionableOptions = {
  /** Marker piloté — doit exister dans la couche au moment du geste. */
  id: string | number
  /** Couche qui porte le marker : c'est elle qui le déplace, pas React. */
  layer: CoreMarkerLayer | null
  /** Désactive le geste (l'élément reste cliquable normalement). */
  disabled?: boolean
  /**
   * Déplacement (px) au-delà duquel le geste devient un repositionnement.
   * Défaut `interaction.repositionSlopPx`.
   */
  slop?: number
  /**
   * Franchissement du seuil : le geste est devenu un déplacement. Notifié une fois
   * par geste, jamais sur un simple clic — l'hôte peut y refermer les surfaces
   * ancrées au marker, qu'aucun clic extérieur ne viendra plus congédier.
   */
  onStart?: () => void
  /** Position suivie en continu pendant le geste (aperçu live côté hôte). */
  onMove?: (latLng: LatLng) => void
  /** Position finale au relâchement. */
  onDrop?: (latLng: LatLng) => void
}

/**
 * Rend un marker **repositionnable** : appui + déplacement le fait suivre la
 * surface, le relâchement livre la nouvelle `LatLng`.
 *
 * Le déclenchement est au **mouvement** (pas au long-press comme `useDraggable`) :
 * c'est le geste attendu d'une poignée qu'on déplace, et il n'entre pas en conflit
 * avec le clic — tant que le pointeur n'a pas franchi le seuil, le clic passe.
 *
 * Le suivi utilise `projection.pickLatLng`, donc le marker colle au **relief réel**
 * et reste sous le curseur même en vue inclinée. Hors globe (curseur dans le ciel),
 * repli sur l'intersection ellipsoïde plutôt que de figer le geste.
 *
 * Pendant le geste la couche est la seule à écrire la position (`moveItemNow` +
 * `setPinned`) : passer par un état React ferait sauter le marker à chaque rendu,
 * l'hôte n'ayant pas encore la nouvelle position.
 */
export function useRepositionable(opts: UseRepositionableOptions): {
  onPointerDown: (e: ReactPointerEvent) => void
  className: string
} {
  const { engine, overlay } = useMapContext()
  const latest = useRef(opts)
  latest.current = opts
  const interaction = useConfig().interaction
  const cleanup = useRef<(() => void) | null>(null)

  useEffect(() => () => cleanup.current?.(), [])

  const onPointerDown = useCallback(
    (e: ReactPointerEvent) => {
      const o = latest.current
      if (o.disabled || !o.layer || (e.pointerType === 'mouse' && e.button !== 0)) return

      // Un geste déjà en cours est clos avant d'en armer un autre. Sans ça, un
      // second appui (deuxième doigt, stylet + souris) écraserait `cleanup` : les
      // écouteurs du premier resteraient sur `window` à jamais, son marker resterait
      // épinglé — donc sourd aux données de l'hôte — et le `stop` du premier
      // démonterait le second.
      cleanup.current?.()
      cleanup.current = null

      const el = e.currentTarget as HTMLElement
      const startX = e.clientX
      const startY = e.clientY
      const slop = o.slop ?? interaction.repositionSlopPx
      // Id figé pour la durée du geste : c'est ce marker-là qu'il faudra dépingler,
      // même si la prop a changé entre-temps (une liste qui se réordonne).
      const id = o.id
      const layer = o.layer
      let active = false
      let last: LatLng | null = null
      // Dernier point brut en attente de traitement, et la frame qui le consommera.
      let pending: { x: number; y: number } | null = null
      let raf = 0
      const root = overlay.parentElement

      const pick = (x: number, y: number): LatLng | null => engine.pickLatLngAtClient(x, y, true)

      const removeListeners = () => {
        if (raf) cancelAnimationFrame(raf)
        raf = 0
        pending = null
        window.removeEventListener('pointermove', onMove)
        window.removeEventListener('pointerup', onUp)
        window.removeEventListener('pointercancel', stop)
      }

      const stop = () => {
        if (cleanup.current === stop) cleanup.current = null
        removeListeners()
        if (!active) return
        active = false
        layer.setPinned(id, false)
        root?.classList.remove('m3d-repositioning')
      }

      /**
       * Traitement d'un déplacement, au rythme de l'affichage. Chaque point coûte
       * deux raycasts (celui du pointeur, celui du sol sous le marker) : les traiter
       * tous serait payer plusieurs fois pour une seule image rendue, un pointeur
       * fin émettant bien au-delà de 60 événements par seconde.
       */
      const flush = () => {
        raf = 0
        const p = pending
        pending = null
        if (!p) return
        const ll = pick(p.x, p.y)
        if (!ll) return
        last = ll
        layer.moveItemNow(id, ll)
        latest.current.onMove?.(ll)
      }

      const onMove = (ev: PointerEvent) => {
        if (!active) {
          if (Math.abs(ev.clientX - startX) + Math.abs(ev.clientY - startY) <= slop) return
          active = true
          layer.setPinned(id, true)
          root?.classList.add('m3d-repositioning')
          // Un clic ne doit pas suivre un déplacement (il ouvrirait la fiche du
          // marker qu'on vient juste de bouger).
          suppressNextClick(el, interaction.clickSuppressMs)
          latest.current.onStart?.()
        }
        pending = { x: ev.clientX, y: ev.clientY }
        if (!raf) raf = requestAnimationFrame(flush)
      }

      const onUp = (ev: PointerEvent) => {
        // Seuil jamais franchi : c'était un clic, pas un déplacement. Rien à
        // résoudre — épargne un raycast à chaque clic sur un marker déplaçable.
        if (!active) {
          stop()
          return
        }
        // Le relâchement est traité tout de suite : la position finale ne peut pas
        // attendre une frame qui ne viendra pas (les écouteurs partent avec `stop`).
        const p = pick(ev.clientX, ev.clientY) ?? last
        if (p) layer.moveItemNow(id, p)
        stop()
        if (p) latest.current.onDrop?.(p)
      }

      // `pointercancel` (geste volé par le navigateur) relâche l'épinglage sans
      // livrer de position : le marker retombe sur la donnée de l'hôte, inchangée.
      window.addEventListener('pointermove', onMove)
      window.addEventListener('pointerup', onUp, { once: true })
      window.addEventListener('pointercancel', stop, { once: true })
      cleanup.current = stop
    },
    [engine, overlay, interaction.clickSuppressMs, interaction.repositionSlopPx],
  )

  return { onPointerDown, className: 'm3d-repositionable' }
}
