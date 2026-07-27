import { useEffect, useRef, useState } from 'react'
import type { DragPayload, DropPoint } from '../../core/DragRegistry'
import type { MapEngine } from '../../core/MapEngine'
import type { LatLng } from '../../shared'
import { useMapContext } from '../context'

export type UseMapDropZoneOptions<T = unknown> = {
  /** Id de la zone (défaut `m3d-map`). Une seule zone carte par id et par carte. */
  id?: string
  /** Charges recevables (absent = tout accepter). */
  accept?: (payload: DragPayload<T>) => boolean
  /**
   * Dépôt validé sur la carte, avec la **coordonnée géographique sous le curseur**
   * (raycast ellipsoïde — juste en vue inclinée comme en 2D). Non appelé si le
   * relâchement tombe à côté du globe (dans l'espace) : il n'y a alors pas de
   * position à donner.
   */
  onDrop: (payload: DragPayload<T>, latLng: LatLng, point: DropPoint) => void
}

type Subscriber = {
  accept: (payload: DragPayload) => boolean
  onDrop: (payload: DragPayload, latLng: LatLng, point: DropPoint) => void
}

/**
 * Abonnés d'une zone carte, par carte puis par id. La surface carte est UNE zone
 * (un seul `data-m3d-drop` par élément), mais plusieurs consommateurs ont
 * légitimement besoin d'y recevoir des dépôts — la couche symboles pour poser une
 * icône, l'application pour ses propres charges. Ce multiplexeur les fait
 * cohabiter : sans lui, le dernier composant monté écraserait silencieusement
 * l'attribut et la zone du premier.
 */
const registries = new WeakMap<MapEngine, Map<string, { subs: Set<Subscriber>; dispose: () => void }>>()

function join(engine: MapEngine, overlay: HTMLElement, zoneId: string, sub: Subscriber): () => void {
  let byZone = registries.get(engine)
  if (!byZone) {
    byZone = new Map()
    registries.set(engine, byZone)
  }
  let entry = byZone.get(zoneId)
  if (!entry) {
    const subs = new Set<Subscriber>()
    // Canvas + overlay HTML seulement. PAS le calque des markers (`.m3d-css2d`) :
    // un marker peut flotter au-dessus d'une autre surface (la dock des favoris),
    // et il détournerait alors son dépôt vers la carte — la charge y serait refusée,
    // donc traitée comme un relâchement dans le vide.
    const surfaces = [engine.renderer.domElement, overlay]
    for (const el of surfaces) el.setAttribute('data-m3d-drop', zoneId)
    const unregister = engine.drag.registerZone(zoneId, {
      // La zone accepte dès qu'un abonné accepte ; le survol (`isOver`) reflète
      // donc « quelqu'un prendra ce dépôt », ce que l'utilisateur voit.
      accept: (p) => {
        for (const s of subs) if (s.accept(p)) return true
        return false
      },
      onDrop: (p, point) => {
        // Repli ellipsoïde (le `true`) : le raycast terrain rend `null` non seulement
        // dans le ciel, mais aussi sur une zone dont les tuiles ne sont pas encore
        // arrivées. Sans lui, lâcher une icône sur une région fraîchement dézoomée
        // ne poserait rien — sans le moindre retour à l'utilisateur.
        const latLng = engine.pickLatLngAtClient(point.x, point.y, true)
        // Relâché hors du globe : aucune coordonnée à proposer, le dépôt est ignoré.
        if (!latLng) return
        // Le PREMIER abonné qui accepte consomme le dépôt (ordre de montage) : une
        // charge n'est jamais posée deux fois par deux consommateurs différents.
        for (const s of subs) {
          if (s.accept(p)) {
            s.onDrop(p, latLng, point)
            return
          }
        }
      },
    })
    entry = {
      subs,
      dispose: () => {
        unregister()
        for (const el of surfaces) {
          if (el.getAttribute('data-m3d-drop') === zoneId) el.removeAttribute('data-m3d-drop')
        }
        byZone!.delete(zoneId)
      },
    }
    byZone.set(zoneId, entry)
  }
  entry.subs.add(sub)
  return () => {
    entry!.subs.delete(sub)
    // Dernier abonné parti : la zone et l'attribut de hit-test disparaissent avec lui.
    if (entry!.subs.size === 0) entry!.dispose()
  }
}

/**
 * Fait de la **surface carte** une zone de dépôt du drag-and-drop : un élément
 * saisi ailleurs (palette d'icônes, liste) se lâche sur le globe et le
 * consommateur reçoit directement la `LatLng` visée.
 *
 * L'attribut de hit-test (`data-m3d-drop`, lu par `DragOverlay`) est posé sur le
 * canvas et l'overlay HTML, et sur aucune autre surface : les barres d'outils et les
 * panneaux sont des frères de l'overlay, jamais ses descendants, donc un dépôt sur la
 * toolbar n'est pas pris pour un dépôt sur le terrain.
 *
 * Plusieurs consommateurs peuvent s'abonner à la même zone (cf. le multiplexeur
 * ci-dessus) ; leurs `accept` doivent viser des `payload.type` distincts, sinon
 * c'est le premier monté qui consomme.
 *
 * `isOver` reflète le survol par une charge acceptée (retour visuel, ex. curseur
 * de dépôt ou halo sur la carte).
 */
export function useMapDropZone<T = unknown>(opts: UseMapDropZoneOptions<T>): { isOver: boolean } {
  const { engine, overlay } = useMapContext()
  const [isOver, setOver] = useState(false)
  const zoneId = opts.id ?? 'm3d-map'
  const latest = useRef(opts)
  latest.current = opts

  // Abonnement stable : les callbacks lisent `latest` → pas de ré-abonnement à
  // chaque render (même motif que `useDropZone`).
  useEffect(() => {
    return join(engine, overlay, zoneId, {
      accept: (p) => (latest.current.accept ? latest.current.accept(p as DragPayload<T>) : true),
      onDrop: (p, latLng, point) => latest.current.onDrop(p as DragPayload<T>, latLng, point),
    })
  }, [engine, overlay, zoneId])

  useEffect(() => engine.drag.onChange(() => setOver(engine.drag.active?.overZone === zoneId)), [engine, zoneId])

  return { isOver }
}
