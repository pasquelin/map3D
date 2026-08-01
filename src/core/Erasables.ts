import { ProviderRegistry } from './ProviderRegistry'
import type { HostLayerKind } from '../config/types'
import type { LatLng } from '../shared'

/**
 * Un objet de couche hôte (route `PathLayer`, forme `ShapeLayer`) que la **gomme**
 * est autorisée à effacer. La lib ne possède pas ces objets (props React) : elle
 * n'expose donc qu'un **anneau géodésique** interrogeable, projeté par le `DrawLayer`
 * avec sa propre hauteur d'ancre. La suppression effective est déléguée à l'app via
 * le callback `onErase` (la lib ne mute jamais des props).
 */
export type ErasableItem = {
  id: string | number
  /** Contour lat/lng — polyligne pour un tracé, anneau fermé pour une forme. */
  ring: readonly LatLng[]
  closed: boolean
  /** Catégorie régie par `config.erase.targets` (cf. `HostLayerKind`). */
  kind: HostLayerKind
}

/** Contrat d'une couche hôte qui expose des objets effaçables à la gomme. */
export type ErasableProvider = {
  /** Uniquement les objets marqués `erasable` — appelé au finalize marquee / clic, jamais par frame. */
  items(): ErasableItem[]
}

/**
 * Registre des objets hôte effaçables, partagé sur `MapEngine` (`engine.erasables`) —
 * même motif que `engine.selectables`, mais SÉPARÉ : un objet effaçable par la gomme
 * n'est pas pour autant sélectionnable par l'outil sélection, et réciproquement. Les
 * couches s'enregistrent comme providers ; le `DrawLayer` les interroge.
 */
export class ErasableRegistry extends ProviderRegistry<ErasableProvider> {
  /** Concatène les objets effaçables de tous les providers. Boucle plutôt que spread
   *  `push(...items)` : un hôte portant des dizaines de milliers d'objets ferait sinon
   *  déborder la pile d'appels. Appelé au finalize marquee / au clic, jamais par frame. */
  all(): ErasableItem[] {
    const out: ErasableItem[] = []
    for (const p of this.providers) for (const it of p.items()) out.push(it)
    return out
  }
}
